const webpush = require('web-push');
const { getAll, run } = require('./careAccess');

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:support@agecare.app';
const pushConfigured = Boolean(vapidPublicKey && vapidPrivateKey);

if (pushConfigured) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  console.log('[Push] Web push configured');
} else {
  console.log('[Push] Web push is not configured (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY to enable reminders)');
}

function isConfigured() {
  return pushConfigured;
}

function getPublicKey() {
  return vapidPublicKey || null;
}

/**
 * Sends one push message to every device a user has registered for
 * reminders. A subscription that the browser has since revoked (404/410
 * from the push service) is treated as expected housekeeping, not an
 * error -- it's removed so future ticks stop trying it.
 */
async function sendPushToUser(db, userId, payload) {
  if (!pushConfigured) return { sent: 0, total: 0, skipped: true, reason: 'not_configured' };

  const subscriptions = await getAll(db, 'SELECT * FROM push_subscriptions WHERE user_id = ?', [userId]);
  if (!subscriptions.length) return { sent: 0, total: 0, skipped: true, reason: 'no_subscriptions' };

  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        body,
      );
      sent += 1;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await run(db, 'DELETE FROM push_subscriptions WHERE id = ?', [subscription.id]);
      } else {
        console.error(`[Push] Send failed for subscription ${subscription.id}:`, error.message);
      }
    }
  }));

  return { sent, total: subscriptions.length };
}

module.exports = { isConfigured, getPublicKey, sendPushToUser };
