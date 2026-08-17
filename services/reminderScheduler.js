const cron = require('node-cron');
const { getAll, getRow, run } = require('./careAccess');
const { sendPushToUser, isConfigured } = require('./pushNotifications');
const { notifyFamilyMissedCheckin } = require('./notification');

const MEDICATION_RENEWAL_WARNING_DAYS = Number(process.env.MEDICATION_RENEWAL_WARNING_DAYS) || 3;
const APPOINTMENT_REMINDER_HOURS_BEFORE = Number(process.env.APPOINTMENT_REMINDER_HOURS_BEFORE) || 2;
const MISSED_CHECKIN_GRACE_HOURS = Number(process.env.MISSED_CHECKIN_GRACE_HOURS) || 4;
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
    // 23514 = Postgres check_violation. This exact class of bug has happened
    // before: reminder_log.reminder_type briefly had a CHECK constraint
    // listing only the reminder types that existed when it was written,
    // silently rejecting every claim for any type added afterward on every
    // tick (see database/postgresSchema.js for the fix and full story). If
    // this fires again, name the likely cause instead of a bare DB error.
    if (error.code === '23514') {
      console.error(`[Reminders] reminder_log rejected reminder_type "${type}" via a CHECK constraint -- see database/postgresSchema.js's reminder_log repair.`);
    }
    throw error;
  }
}

/** Whether `userId` already has a check-in on `date` (their local calendar day, per `tz`). */
async function hasCheckedInToday(db, userId, tz, date) {
  const lastCheckin = await getRow(db,
    'SELECT created_at FROM checkins WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [userId]);
  if (!lastCheckin) return false;
  return localDateAndTime(tz, parseDbTimestamp(lastCheckin.created_at)).date === date;
}

/**
 * Family contacts actually reachable and consented to be notified --
 * `notify_email`/`notify_sms` is the same per-contact opt-in already used
 * for the existing "a check-in was recorded" notification, reused here
 * rather than inventing a second consent signal. Shared by
 * runMissedCheckinAlerts below and services/vitalAlerts.js.
 */
async function getEligibleFamilyContacts(db, userId) {
  return getAll(db,
    `SELECT id FROM family_contacts
     WHERE user_id = ? AND is_active = 1 AND ((notify_email = 1 AND email IS NOT NULL) OR (notify_sms = 1 AND phone IS NOT NULL))`,
    [userId]);
}

async function runCheckinReminders(db, now = new Date()) {
  const users = await getAll(db,
    `SELECT id, timezone, checkin_reminder_time
     FROM users WHERE checkin_reminder_enabled = 1 AND checkin_reminder_time IS NOT NULL`);

  for (const user of users) {
    const tz = user.timezone || DEFAULT_TIMEZONE;
    const { date, time } = localDateAndTime(tz, now);
    if (time !== (user.checkin_reminder_time || '09:00').slice(0, 5)) continue;

    if (await hasCheckedInToday(db, user.id, tz, date)) continue; // Nothing to nudge about.

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

/**
 * appointment_date is a plain <input type="datetime-local"> value with no
 * timezone marker -- both frontends already just do `new Date(value)` to
 * display it (see LegacyCareModules.tsx / Appointments.jsx), so this reads
 * it the same way rather than inventing a different interpretation just
 * for reminders. Postgres returns a real Date object for the TIMESTAMPTZ
 * column already, which `new Date(...)` passes through unchanged.
 */
async function runAppointmentReminders(db, now = new Date()) {
  const appointments = await getAll(db,
    `SELECT a.id, a.user_id, a.doctor_name, a.specialty, a.location, a.appointment_date, u.timezone
     FROM appointments a
     JOIN users u ON u.id = a.user_id
     WHERE a.is_active = 1 AND u.appointment_reminders_enabled = 1`);

  const windowMs = APPOINTMENT_REMINDER_HOURS_BEFORE * 60 * 60 * 1000;

  for (const appointment of appointments) {
    const appointmentTime = new Date(appointment.appointment_date);
    if (Number.isNaN(appointmentTime.getTime())) continue;

    const msUntil = appointmentTime.getTime() - now.getTime();
    // A >= check against the whole window, not an exact-minute match, so a
    // missed tick (a brief restart, a slow deploy) still catches it on the
    // very next tick, right up until the appointment itself passes.
    if (msUntil <= 0 || msUntil > windowMs) continue;

    // Keyed on the appointment's own date (not "today"), so a reminder
    // window that straddles midnight in the user's timezone can't send
    // twice across the date rollover, and editing an appointment to a new
    // date/time makes it eligible for a fresh reminder.
    const reminderKey = toDateString(appointment.appointment_date) || String(appointment.id);
    if (!(await claimReminder(db, { userId: appointment.user_id, type: 'appointment', referenceId: appointment.id, date: reminderKey }))) continue;

    const tz = appointment.timezone || DEFAULT_TIMEZONE;
    const when = appointmentTime.toLocaleString('en-AU', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' });
    const withWhom = [appointment.doctor_name, appointment.specialty].filter(Boolean).join(' -- ');
    const where = appointment.location ? ` at ${appointment.location}` : '';

    await sendPushToUser(db, appointment.user_id, {
      title: `Appointment in ${APPOINTMENT_REMINDER_HOURS_BEFORE} hours`,
      body: `${withWhom}${where}, ${when}.`,
      tag: `agecare-appointment-${appointment.id}`,
      url: '/#/appointments',
      alarm: false, // Advance notice, not an urgent right-now alarm like a due-now medication.
    });
  }
}

/**
 * If a resident has opted in (missed_checkin_alerts_enabled -- off by
 * default, see migrations/notifications.js for why), and still hasn't
 * checked in by MISSED_CHECKIN_GRACE_HOURS after their own reminder time,
 * this lets their family contacts know via the same email/SMS channel
 * notifyFamily already uses for "a check-in was recorded". The resident
 * also gets a quiet (non-alarm) push telling them their family was
 * notified -- this never happens silently behind their back, matching the
 * consent-first design used elsewhere in this app (e.g. care-access grants).
 */
async function runMissedCheckinAlerts(db, now = new Date()) {
  const users = await getAll(db,
    `SELECT id, name, full_name, timezone, checkin_reminder_time
     FROM users WHERE missed_checkin_alerts_enabled = 1 AND checkin_reminder_time IS NOT NULL`);

  const graceMinutes = MISSED_CHECKIN_GRACE_HOURS * 60;

  for (const user of users) {
    const tz = user.timezone || DEFAULT_TIMEZONE;
    const { date, time } = localDateAndTime(tz, now);
    const [reminderHour, reminderMinute] = (user.checkin_reminder_time || '09:00').slice(0, 5).split(':').map(Number);
    const [nowHour, nowMinute] = time.split(':').map(Number);

    // A >= check against (reminder time + grace period), not an exact-minute
    // match -- same robustness principle as the appointment reminder above.
    if (nowHour * 60 + nowMinute < reminderHour * 60 + reminderMinute + graceMinutes) continue;

    if (await hasCheckedInToday(db, user.id, tz, date)) continue;

    const contacts = await getEligibleFamilyContacts(db, user.id);
    if (!contacts.length) continue; // Nobody to tell -- don't burn today's claim on a no-op.

    if (!(await claimReminder(db, { userId: user.id, type: 'missed_checkin_family_alert', referenceId: CHECKIN_REFERENCE_ID, date }))) continue;

    const patientName = user.name || user.full_name || 'Your family member';
    try {
      await notifyFamilyMissedCheckin(user.id, patientName, db);
    } catch (error) {
      console.error(`[Reminders] Missed check-in family alert failed for user ${user.id}:`, error.message);
    }

    await sendPushToUser(db, user.id, {
      title: 'We let your family know',
      body: "You haven't checked in today yet, so we sent your family a gentle heads-up. Check in anytime to update them.",
      tag: 'agecare-missed-checkin-transparency',
      url: '/#/checkin',
      alarm: false,
    });
  }
}

async function tick(db, now = new Date()) {
  for (const [label, task] of [
    ['check-in', runCheckinReminders],
    ['medication', runMedicationReminders],
    ['medication renewal', runMedicationRenewalWarnings],
    ['appointment', runAppointmentReminders],
    ['missed check-in family alert', runMissedCheckinAlerts],
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
  // Unlike earlier versions of this function, this no longer requires VAPID
  // keys to start: the missed-check-in family alert sends email/SMS, not
  // push, so it works with no push configuration at all. Each push-based
  // pass already no-ops safely on its own via sendPushToUser when push isn't
  // configured (see services/pushNotifications.js).
  scheduledTask = cron.schedule('* * * * *', () => tick(db));
  console.log('[Reminders] Reminder scheduler started (checking every minute)');
  if (!isConfigured()) {
    console.log('[Reminders] Note: push notifications are not configured (missing VAPID keys) -- push-based reminders are skipped until they are; email/SMS family alerts are unaffected.');
  }
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
  runAppointmentReminders,
  runMissedCheckinAlerts,
  hasCheckedInToday,
  getEligibleFamilyContacts,
  claimReminder,
  localDateAndTime,
  daysUntil,
  toDateString,
  parseDbTimestamp,
};
