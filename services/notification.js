const nodemailer = require('nodemailer');
const twilio = require('twilio');
const { getDb } = require('../db');

const MAX_RETRIES = parseInt(process.env.NOTIFY_MAX_RETRIES) || 3;
const RETRY_DELAY = parseInt(process.env.NOTIFY_RETRY_DELAY_MS) || 5000;
const smtpConfigured = Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
const careAccessEmailEnabled = process.env.CARE_ACCESS_EMAIL_NOTIFICATIONS === 'true';

// Email transporter
let emailTransporter;
try {
  if (smtpConfigured) {
    emailTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    console.log('[Notify] Email transporter configured');
  } else {
    console.log('[Notify] Email delivery is not configured');
  }
} catch (err) {
  console.warn('[Notify] Email not configured:', err.message);
}

// Twilio client
let twilioClient;
try {
  if (process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('[Notify] Twilio client configured');
  }
} catch (err) {
  console.warn('[Notify] Twilio not configured:', err.message);
}

/**
 * Queue a notification for sending with retry logic
 */
async function queueNotification({ contactId, checkinId = null, type, to, subject, body, db = getDb() }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO notification_log (contact_id, checkin_id, type, status)
       VALUES (?, ?, ?, 'pending')`,
      [contactId, checkinId, type],
      function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

/**
 * Send email notification
 */
async function sendEmail({ to, subject, body, logId }) {
  if (!emailTransporter) {
    console.warn('[Notify] Email delivery skipped because SMTP is not configured');
    return { success: false, notConfigured: true };
  }

  try {
    await emailTransporter.sendMail({
      from: process.env.EMAIL_FROM || `"Age Care App" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text: body,
      html: `<div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #2563eb;">Age Care Daily Check-in</h2>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px;">
          <p style="white-space: pre-wrap;">${body.replace(/\n/g, '<br>')}</p>
        </div>
        <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
          This is an automated notification from Age Care App.
        </p>
      </div>`,
    });

    console.log('[Notify] Email sent');
    return { success: true };
  } catch (err) {
    console.error('[Notify] Email failed:', err.message);
    return { success: false, error: err.message };
  }
}

function careAccessRequestEmail() {
  return {
    subject: 'AgeCare care-access request',
    body: [
      'A family member has asked for access to your check-in history.',
      '',
      'Sign in to AgeCare and open Family Circle to review, approve, or decline the request.',
      '',
      'This email does not include any care-record details.',
    ].join('\n'),
  };
}

async function sendCareAccessRequestEmail({ to }) {
  if (!careAccessEmailEnabled) {
    return { success: false, disabled: true };
  }
  const { subject, body } = careAccessRequestEmail();
  return sendEmail({ to, subject, body });
}

/**
 * Send SMS notification
 */
async function sendSMS({ to, body, logId }) {
  if (!twilioClient) {
    console.log(`[Notify] SMS to ${to}: ${body.slice(0, 50)}...`);
    return { success: true, fallback: true };
  }

  try {
    await twilioClient.messages.create({
      body: body.slice(0, 1600), // Twilio limit
      from: process.env.TWILIO_PHONE,
      to,
    });

    console.log(`[Notify] SMS sent to ${to}`);
    return { success: true };
  } catch (err) {
    console.error(`[Notify] SMS failed to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Process a single notification with retries. `subject`/`body` are
 * optional overrides -- omitted, this falls back to the original
 * "new check-in recorded" wording so the existing notifyFamily caller is
 * unaffected; notifyFamilyMissedCheckin below always supplies its own.
 */
async function processNotification(logId, { db = getDb(), subject, body } = {}) {
  const row = await new Promise((resolve, reject) => {
    db.get(
      `SELECT nl.*, fc.email, fc.phone, fc.name, fc.notify_email, fc.notify_sms
       FROM notification_log nl
       JOIN family_contacts fc ON nl.contact_id = fc.id
       WHERE nl.id = ?`,
      [logId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });

  if (!row) {
    console.error(`[Notify] Notification ${logId} not found`);
    return;
  }

  let result;
  const finalSubject = subject || `Daily Check-in Update for ${row.name}`;
  const finalBody = body || `Hello ${row.name},\n\nA new daily check-in has been recorded.\n\nPlease check the Age Care App for details.\n\n- Age Care Team`;

  if (row.type === 'email' && row.notify_email && row.email) {
    result = await sendEmail({ to: row.email, subject: finalSubject, body: finalBody, logId });
  } else if (row.type === 'sms' && row.notify_sms && row.phone) {
    result = await sendSMS({ to: row.phone, body: finalBody, logId });
  } else {
    console.log(`[Notify] Skipping ${row.type} for ${row.name} - not enabled or no contact info`);
    return;
  }

  // Update log. `notConfigured` (SMTP/Twilio never set up) is deliberately not
  // retried -- unlike a transient send failure, nothing changes between now and
  // RETRY_DELAY ms from now, so retrying would just schedule pointless timers
  // (this was a real, if harmless-looking, pre-existing bug: every notification
  // sent with no SMTP/Twilio configured used to retry up to MAX_RETRIES times
  // anyway).
  const status = result.success
    ? 'sent'
    : result.notConfigured
      ? 'skipped'
      : (row.retry_count < MAX_RETRIES ? 'retrying' : 'failed');
  const errorMsg = result.error || null;

  await new Promise((resolve, reject) => {
    db.run(
      `UPDATE notification_log
       SET status = ?, retry_count = retry_count + 1, error_message = ?, sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE sent_at END
       WHERE id = ?`,
      [status, errorMsg, status, logId],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });

  // Retry if needed
  if (status === 'retrying') {
    console.log(`[Notify] Retrying ${logId} in ${RETRY_DELAY}ms (attempt ${row.retry_count + 1}/${MAX_RETRIES})`);
    setTimeout(() => processNotification(logId, { db, subject, body }), RETRY_DELAY);
  }
}

/**
 * Send notifications to all family contacts for a check-in
 */
async function notifyFamily(checkinId, userId, db = getDb()) {
  const contacts = await new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM family_contacts
       WHERE user_id = ? AND is_active = 1`,
      [userId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });

  console.log(`[Notify] Sending notifications to ${contacts.length} family contacts for check-in ${checkinId}`);

  for (const contact of contacts) {
    if (contact.notify_email && contact.email) {
      const logId = await queueNotification({
        contactId: contact.id,
        checkinId,
        type: 'email',
        to: contact.email,
        db,
      });
      await processNotification(logId, { db });
    }

    if (contact.notify_sms && contact.phone) {
      const logId = await queueNotification({
        contactId: contact.id,
        checkinId,
        type: 'sms',
        to: contact.phone,
        db,
      });
      await processNotification(logId, { db });
    }
  }
}

/**
 * A gentle, non-alarming heads-up to a patient's family contacts when
 * they haven't checked in today. reminderScheduler.js's
 * runMissedCheckinAlerts decides *when* to call this (grace period,
 * dedupe, the resident's own opt-in); this only handles who to tell and
 * what to say. Reuses the same queue/send/log pipeline as notifyFamily --
 * "notify_email"/"notify_sms" on each family_contacts row is the same
 * consent signal already used for check-in notifications, not a new one.
 */
async function notifyFamilyMissedCheckin(userId, patientName, db = getDb()) {
  const contacts = await new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM family_contacts WHERE user_id = ? AND is_active = 1`,
      [userId],
      (err, rows) => (err ? reject(err) : resolve(rows)),
    );
  });

  const subject = `A gentle heads-up about ${patientName}`;
  const body = [
    'Hello,',
    '',
    `${patientName} hasn't done their daily check-in yet today. This might be nothing --`,
    'they may simply be busy or have stepped out -- but you may want to check in with them',
    'when you get a chance.',
    '',
    '- AgeCare',
  ].join('\n');

  let notified = 0;
  for (const contact of contacts) {
    if (contact.notify_email && contact.email) {
      const logId = await queueNotification({ contactId: contact.id, type: 'email', to: contact.email, db });
      await processNotification(logId, { db, subject, body });
      notified += 1;
    }
    if (contact.notify_sms && contact.phone) {
      const logId = await queueNotification({ contactId: contact.id, type: 'sms', to: contact.phone, db });
      await processNotification(logId, { db, subject, body });
      notified += 1;
    }
  }
  return { contactsNotified: notified };
}

module.exports = { notifyFamily, notifyFamilyMissedCheckin, sendEmail, sendSMS, processNotification, careAccessRequestEmail, sendCareAccessRequestEmail };
