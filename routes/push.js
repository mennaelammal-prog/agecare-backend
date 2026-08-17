const express = require('express');
const { getAll, getRow, run } = require('../services/careAccess');
const { getPublicKey, isConfigured, sendPushToUser } = require('../services/pushNotifications');

const router = express.Router();
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

router.get('/vapid-public-key', async (req, res) => {
  const key = getPublicKey();
  if (!key) return res.status(503).json({ error: 'Push notifications are not configured on this server yet.' });
  res.json({ success: true, publicKey: key });
});

router.post('/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    return res.status(400).json({ error: 'A valid push subscription is required.' });
  }
  try {
    const db = req.app.locals.db;
    const existing = await getRow(db, 'SELECT id FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
    if (existing) {
      await run(db, 'UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ? WHERE id = ?',
        [req.userId, keys.p256dh, keys.auth, existing.id]);
    } else {
      await run(db, 'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)',
        [req.userId, endpoint, keys.p256dh, keys.auth]);
    }
    res.status(201).json({ success: true, message: 'Reminders are turned on for this device.' });
  } catch (error) {
    console.error('[Push] Subscribe error:', error.message);
    res.status(500).json({ error: 'Unable to save this device for reminders.' });
  }
});

router.post('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'An endpoint is required.' });
  try {
    await run(req.app.locals.db, 'DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [endpoint, req.userId]);
    res.json({ success: true, message: 'Reminders are turned off for this device.' });
  } catch (error) {
    console.error('[Push] Unsubscribe error:', error.message);
    res.status(500).json({ error: 'Unable to turn off reminders for this device.' });
  }
});

router.get('/preferences', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const row = await getRow(db,
      `SELECT timezone, checkin_reminder_time, checkin_reminder_enabled, medication_reminders_enabled,
              appointment_reminders_enabled, missed_checkin_alerts_enabled
       FROM users WHERE id = ?`, [req.userId]);
    if (!row) return res.status(404).json({ error: 'User not found.' });
    const devices = await getAll(db, 'SELECT id FROM push_subscriptions WHERE user_id = ?', [req.userId]);
    const eligibleContacts = await getAll(db,
      `SELECT id FROM family_contacts
       WHERE user_id = ? AND is_active = 1 AND ((notify_email = 1 AND email IS NOT NULL) OR (notify_sms = 1 AND phone IS NOT NULL))`,
      [req.userId]);
    res.json({
      success: true,
      data: {
        timezone: row.timezone || 'Australia/Sydney',
        checkin_reminder_time: (row.checkin_reminder_time || '09:00').slice(0, 5),
        checkin_reminder_enabled: Boolean(Number(row.checkin_reminder_enabled ?? 1)),
        medication_reminders_enabled: Boolean(Number(row.medication_reminders_enabled ?? 1)),
        appointment_reminders_enabled: Boolean(Number(row.appointment_reminders_enabled ?? 1)),
        missed_checkin_alerts_enabled: Boolean(Number(row.missed_checkin_alerts_enabled ?? 0)),
        notifiable_family_contact_count: eligibleContacts.length,
        push_configured: isConfigured(),
        device_count: devices.length,
      },
    });
  } catch (error) {
    console.error('[Push] Preferences fetch error:', error.message);
    res.status(500).json({ error: 'Unable to load reminder settings.' });
  }
});

router.put('/preferences', async (req, res) => {
  const {
    checkin_reminder_time, checkin_reminder_enabled, medication_reminders_enabled,
    appointment_reminders_enabled, missed_checkin_alerts_enabled, timezone,
  } = req.body || {};
  if (checkin_reminder_time !== undefined && !TIME_RE.test(checkin_reminder_time)) {
    return res.status(400).json({ error: 'Reminder time must be in HH:MM format.' });
  }
  try {
    await run(req.app.locals.db,
      `UPDATE users SET
         checkin_reminder_time = COALESCE(?, checkin_reminder_time),
         checkin_reminder_enabled = COALESCE(?, checkin_reminder_enabled),
         medication_reminders_enabled = COALESCE(?, medication_reminders_enabled),
         appointment_reminders_enabled = COALESCE(?, appointment_reminders_enabled),
         missed_checkin_alerts_enabled = COALESCE(?, missed_checkin_alerts_enabled),
         timezone = COALESCE(?, timezone)
       WHERE id = ?`,
      [
        checkin_reminder_time ?? null,
        checkin_reminder_enabled === undefined ? null : (checkin_reminder_enabled ? 1 : 0),
        medication_reminders_enabled === undefined ? null : (medication_reminders_enabled ? 1 : 0),
        appointment_reminders_enabled === undefined ? null : (appointment_reminders_enabled ? 1 : 0),
        missed_checkin_alerts_enabled === undefined ? null : (missed_checkin_alerts_enabled ? 1 : 0),
        timezone || null,
        req.userId,
      ]);
    res.json({ success: true, message: 'Reminder settings updated.' });
  } catch (error) {
    console.error('[Push] Preferences update error:', error.message);
    res.status(500).json({ error: 'Unable to update reminder settings.' });
  }
});

router.post('/test', async (req, res) => {
  if (!isConfigured()) return res.status(503).json({ error: 'Push notifications are not configured on this server yet.' });
  try {
    const result = await sendPushToUser(req.app.locals.db, req.userId, {
      title: 'AgeCare reminder test',
      body: 'If you can see and hear this, your reminders are working.',
      tag: 'agecare-test-reminder',
      alarm: true,
    });
    if (!result.total) return res.status(404).json({ error: 'No devices are registered for reminders yet. Turn on reminders first.' });
    res.json({ success: true, sent: result.sent, total: result.total });
  } catch (error) {
    console.error('[Push] Test send error:', error.message);
    res.status(500).json({ error: 'Unable to send a test reminder.' });
  }
});

module.exports = router;
