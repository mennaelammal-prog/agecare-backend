const cron = require('node-cron');
const { getAll, getRow, run } = require('./careAccess');
const { sendPushToUser, isConfigured } = require('./pushNotifications');

const MEDICATION_RENEWAL_WARNING_DAYS = Number(process.env.MEDICATION_RENEWAL_WARNING_DAYS) || 3;
const DEFAULT_TIMEZONE = 'Australia/Sydney';
// The check-in reminder has no medication to key off of, so it claims this
// sentinel reference_id -- reminder_log.reference_id is NOT NULL precisely
// so this dedupes the same way a medication reminder would.
const CHECKIN_REFERENCE_ID = 0;

/**
 * SQLite's CURRENT_TIMESTAMP produces "YYYY-MM-DD HH:MM:SS" with no
 * timezone marker, which JS Date parses as *local* time rather than the
 * UTC it actually is. Postgres timestamps already arrive as real Date
 * objects. This normalizes either case to a correct Date.
 */
function parseDbTimestamp(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const hasZone = /[zZ]|[+-]\d\d:\d\d$/.test(value);
    return new Date(hasZone ? value : `${value.replace(' ', 'T')}Z`);
  }
  return new Date(value);
}

/** Postgres DATE columns arrive as Date objects; SQLite stores plain text. */
function toDateString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Returns { date: 'YYYY-MM-DD', time: 'HH:MM' } for `now` in `timezone`, dependency-free. */
function localDateAndTime(timezone, now = new Date()) {
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || DEFAULT_TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch {
    // An invalid/unsupported IANA zone string shouldn't take reminders down for everyone else.
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: DEFAULT_TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }
  const parts = {};
  for (const part of formatter.formatToParts(now)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
}

/** Whole calendar days from `todayStr` to `targetStr` (both 'YYYY-MM-DD'); negative if `targetStr` is in the past. */
function daysUntil(targetStr, todayStr) {
  const [ty, tm, td] = targetStr.split('-').map(Number);
  const [ny, nm, nd] = todayStr.split('-').map(Number);
  const target = Date.UTC(ty, tm - 1, td);
  const today = Date.UTC(ny, nm - 1, nd);
  return Math.round((target - today) / 86400000);
}

/**
 * Claims the right to send today's reminder of this type. Returns false
 * (without throwing) if another tick already claimed it -- the UNIQUE
 * constraint on reminder_log is what actually prevents double-sends; this
 * just turns that constraint into a plain boolean for callers.
 */
async function claimReminder(db, { userId, type, referenceId, date }) {
  try {
    await run(db,
      'INSERT INTO reminder_log (user_id, reminder_type, reference_id, reminder_date) VALUES (?, ?, ?, ?)',
      [userId, type, referenceId, date]);
    return true;
  } catch (error) {
    if (/unique/i.test(error.message) || error.code === '23505') return false;
    throw error;
  }
}

async function runCheckinReminders(db, now = new Date()) {
  const users = await getAll(db,
    `SELECT id, timezone, checkin_reminder_time
     FROM users WHERE checkin_reminder_enabled = 1 AND checkin_reminder_time IS NOT NULL`);

  for (const user of users) {
    const tz = user.timezone || DEFAULT_TIMEZONE;
    const { date, time } = localDateAndTime(tz, now);
    if (time !== (user.checkin_reminder_time || '09:00').slice(0, 5)) continue;

    const lastCheckin = await getRow(db,
      'SELECT created_at FROM checkins WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [user.id]);
    if (lastCheckin) {
      const lastLocalDate = localDateAndTime(tz, parseDbTimestamp(lastCheckin.created_at)).date;
      if (lastLocalDate === date) continue; // Already checked in today -- nothing to nudge about.
    }

    if (!(await claimReminder(db, { userId: user.id, type: 'checkin', referenceId: CHECKIN_REFERENCE_ID, date }))) continue;

    await sendPushToUser(db, user.id, {
      title: 'Time for your daily check-in',
      body: 'A gentle reminder to check in with yourself today. It only takes a minute.',
      tag: 'agecare-checkin-reminder',
      url: '/#/checkin',
      alarm: true,
    });
  }
}

async function runMedicationReminders(db, now = new Date()) {
  const medications = await getAll(db,
    `SELECT m.id, m.user_id, m.name, m.dosage, m.time_of_day, u.timezone
     FROM medications m
     JOIN users u ON u.id = m.user_id
     WHERE m.is_active = 1 AND m.time_of_day IS NOT NULL AND u.medication_reminders_enabled = 1`);

  for (const medication of medications) {
    const tz = medication.timezone || DEFAULT_TIMEZONE;
    const { date, time } = localDateAndTime(tz, now);
    if (time !== medication.time_of_day.slice(0, 5)) continue;

    if (!(await claimReminder(db, { userId: medication.user_id, type: 'medication', referenceId: medication.id, date }))) continue;

    await sendPushToUser(db, medication.user_id, {
      title: `Time for ${medication.name}`,
      body: medication.dosage ? `${medication.dosage} -- as scheduled.` : 'It is time to take this medication.',
      tag: `agecare-medication-${medication.id}`,
      url: '/#/medications',
      alarm: true,
    });
  }
}

async function runMedicationRenewalWarnings(db, now = new Date()) {
  const medications = await getAll(db,
    `SELECT m.id, m.user_id, m.name, m.end_date, u.timezone
     FROM medications m
     JOIN users u ON u.id = m.user_id
     WHERE m.is_active = 1 AND m.end_date IS NOT NULL AND u.medication_reminders_enabled = 1`);

  for (const medication of medications) {
    const tz = medication.timezone || DEFAULT_TIMEZONE;
    const { date } = localDateAndTime(tz, now);
    const endDate = toDateString(medication.end_date);
    if (!endDate) continue;

    const remaining = daysUntil(endDate, date);
    if (remaining < 0 || remaining > MEDICATION_RENEWAL_WARNING_DAYS) continue;

    if (!(await claimReminder(db, { userId: medication.user_id, type: 'medication_renewal', referenceId: medication.id, date }))) continue;

    const message = remaining === 0
      ? `Your ${medication.name} prescription runs out today -- arrange a refill as soon as you can.`
      : `Your ${medication.name} prescription runs out in ${remaining} day${remaining === 1 ? '' : 's'} -- time to arrange a refill.`;

    await sendPushToUser(db, medication.user_id, {
      title: 'Prescription renewal needed',
      body: message,
      tag: `agecare-medication-renewal-${medication.id}`,
      url: '/#/medications',
      alarm: false, // Informational -- doesn't need the same urgency as a due-now alarm.
    });
  }
}

async function tick(db, now = new Date()) {
  for (const [label, task] of [
    ['check-in', runCheckinReminders],
    ['medication', runMedicationReminders],
    ['medication renewal', runMedicationRenewalWarnings],
  ]) {
    try {
      await task(db, now);
    } catch (error) {
      console.error(`[Reminders] ${label} tick failed:`, error.message);
    }
  }
}

let scheduledTask = null;

function start(db) {
  if (scheduledTask) return scheduledTask;
  if (!isConfigured()) {
    console.log('[Reminders] Scheduler not started -- push notifications are not configured (missing VAPID keys).');
    return null;
  }
  scheduledTask = cron.schedule('* * * * *', () => tick(db));
  console.log('[Reminders] Reminder scheduler started (checking every minute)');
  return scheduledTask;
}

function stop() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = {
  start,
  stop,
  tick,
  runCheckinReminders,
  runMedicationReminders,
  runMedicationRenewalWarnings,
  localDateAndTime,
  daysUntil,
  toDateString,
  parseDbTimestamp,
};
