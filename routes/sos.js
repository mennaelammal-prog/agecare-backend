const express = require('express');
const { getRow, run } = require('../services/careAccess');
const { notifyFamilySOS } = require('../services/notification');
const { sendPushToUser } = require('../services/pushNotifications');

const router = express.Router();

// One-tap emergency alert: unlike every other notification in this app,
// this is not gated behind an opt-in preference -- pressing "I need help"
// is itself the explicit, deliberate request, so it always tries to reach
// every family contact who has an email or phone on file (see
// notifyFamilySOS for why it bypasses the usual notify_email/notify_sms
// toggles too).
router.post('/', async (req, res) => {
  const userId = req.userId;
  try {
    const db = req.app.locals.db;
    const user = await getRow(db, 'SELECT id, name, full_name FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const patientName = user.name || user.full_name || 'A family member';
    const { contactsNotified } = await notifyFamilySOS(userId, patientName, db);

    await run(db, 'INSERT INTO sos_events (user_id, contacts_notified) VALUES (?, ?)', [userId, contactsNotified]);

    // A separate confirmation back to the resident's own device(s) -- not
    // the alert itself, just letting them know what happened.
    await sendPushToUser(db, userId, {
      title: contactsNotified > 0 ? 'Your alert was sent' : 'No family contacts to notify',
      body: contactsNotified > 0
        ? `${contactsNotified} family member${contactsNotified === 1 ? '' : 's'} ${contactsNotified === 1 ? 'was' : 'were'} notified that you need help.`
        : 'Add a family contact with an email or phone number in Care Connections so this can reach someone next time.',
      tag: 'agecare-sos-confirmation',
      alarm: false,
    });

    res.status(201).json({ success: true, contactsNotified });
  } catch (error) {
    console.error('[SOS] Trigger error:', error.message);
    res.status(500).json({ error: 'Unable to send the alert. Please try again, or contact your family directly.' });
  }
});

module.exports = router;
