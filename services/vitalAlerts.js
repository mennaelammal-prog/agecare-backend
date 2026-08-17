const { evaluateVitals } = require('./vitalThresholds');
const { notifyFamilyVitalAlert } = require('./notification');
const { sendPushToUser } = require('./pushNotifications');
const { getRow } = require('./careAccess');
const { getEligibleFamilyContacts, claimReminder, localDateAndTime } = require('./reminderScheduler');

const DEFAULT_TIMEZONE = 'Australia/Sydney';

/**
 * Evaluates a just-recorded vital-signs reading against the general
 * reference ranges in vitalThresholds.js. For anything outside range:
 * - The resident always gets a push about their own reading (if they have
 *   push turned on) -- this is ordinary feedback on data they just entered
 *   themselves, not sharing with a third party, so it isn't gated on an
 *   opt-in the way family notification is.
 * - Family only hears about it if the resident has separately opted in
 *   (users.vital_alerts_enabled, off by default) -- same consent-first
 *   pattern as missed-check-in alerts.
 *
 * Dedupes per metric+severity per local day via the same reminder_log table
 * the scheduler uses (reminder_type = 'vital_alert:<metric>:<severity>'),
 * so logging a second still-high blood-pressure reading the same day
 * doesn't re-alert family every time -- though a *new* severity for a
 * metric (e.g. warning -> critical) is new information and does alert
 * again, since it's a different reminder_type key.
 *
 * Called fire-and-forget from routes/vitals.js's POST handler, the same
 * pattern routes/checkin.js already uses for notifyFamily.
 */
async function checkVitalAlerts(db, userId, vitals, now = new Date()) {
  const breaches = evaluateVitals(vitals);
  if (!breaches.length) return { breaches: [], newBreaches: [] };

  const user = await getRow(db,
    'SELECT id, name, full_name, timezone, vital_alerts_enabled FROM users WHERE id = ?', [userId]);
  if (!user) return { breaches, newBreaches: [] };

  const tz = user.timezone || DEFAULT_TIMEZONE;
  const { date } = localDateAndTime(tz, now);

  const newBreaches = [];
  for (const breach of breaches) {
    const claimed = await claimReminder(db, {
      userId,
      type: `vital_alert:${breach.metric}:${breach.severity}`,
      referenceId: 0,
      date,
    });
    if (claimed) newBreaches.push(breach);
  }
  if (!newBreaches.length) return { breaches, newBreaches };

  const isUrgent = newBreaches.some((breach) => breach.severity === 'critical');
  const summary = newBreaches.map((breach) => `${breach.label} (${breach.value}${breach.unit})`).join(', ');

  await sendPushToUser(db, userId, {
    title: isUrgent ? 'A reading outside the usual range' : 'Worth keeping an eye on',
    body: `${summary} was outside the general reference range. This isn't a diagnosis -- consider mentioning it to your doctor.`,
    tag: 'agecare-vital-alert',
    url: '/#/vitals',
    alarm: isUrgent,
  });

  if (Number(user.vital_alerts_enabled)) {
    const contacts = await getEligibleFamilyContacts(db, userId);
    if (contacts.length) {
      const patientName = user.name || user.full_name || 'Your family member';
      try {
        await notifyFamilyVitalAlert(userId, patientName, newBreaches, db);
      } catch (error) {
        console.error(`[VitalAlerts] Family notification failed for user ${userId}:`, error.message);
      }
    }
  }

  return { breaches, newBreaches };
}

module.exports = { checkVitalAlerts };
