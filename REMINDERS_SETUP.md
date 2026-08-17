# Setting up push reminders (daily check-in, medication, renewal warnings)

This turns on real, ringing browser push notifications for every registered
member: a daily check-in reminder at a time they choose, a ping at each
medication's scheduled time, and a warning as a prescription's `end_date`
approaches. The code for all of this ships already — `services/pushNotifications.js`
and `services/reminderScheduler.js` on the backend, `ReminderSettings.tsx` and
`AlarmOverlay.tsx` on the `agecare-frontend-redesign` frontend — but it stays
dormant until two keys are configured. Nothing in the app breaks if you skip
this: the "Reminders" panel (the bell icon, top right) just shows "Reminders
aren't set up on this server yet." instead of a toggle.

## Why this needs a one-time setup step

Browser push (the mechanism that lets a reminder arrive even when the app
isn't open) requires the server sending the notification to prove its
identity to the browser's push service, using a keypair called VAPID keys.
There is no way around generating one — every app that does real push
notifications does this once, the same way this app's Claude API key or SMTP
credentials had to be set once.

## Step 1 — Generate a VAPID keypair

From the `agecare-backend` repo root (the `web-push` package is already a
dependency):

```bash
npx web-push generate-vapid-keys
```

This prints a public key and a private key, e.g.:

```
=======================================

Public Key:
BCfGxGqOxvZbS8NG7KLlMA5_clWfmrLPzcxjJ8I1Ap_FQtwt7Sc0ywtBN-7x4bE6z5p1VKyl2bGjELCbpmNMJRo

Private Key:
x80k1_dNKCrkET6qOgpgUN2vw0LxIKfxEry_fmPzUJ0

=======================================
```

Keep the private key secret the same way you would an API key — anyone who
has it can send push notifications as this app to any subscribed device.

## Step 2 — Add the keys to the backend service on Render

These go on the **backend** service (`agecare-backend-2` — the one running
`server.js` from the repo root), not the frontend service. Push sending
happens server-side.

In the Render Dashboard → `agecare-backend-2` → **Environment**, add:

| Variable | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | the Public Key printed above |
| `VAPID_PRIVATE_KEY` | the Private Key printed above |
| `VAPID_SUBJECT` | `mailto:` followed by an email you control, e.g. `mailto:support@yourdomain.com` (the push services want a contact address in case they need to reach the sender) |

Optional:

| Variable | Value | Default if unset |
|---|---|---|
| `MEDICATION_RENEWAL_WARNING_DAYS` | how many days before a medication's `end_date` the renewal warning starts firing | `3` |

Save, and let the service redeploy (or trigger a manual deploy). On boot
you should see this in the Logs tab:

```
[Push] Web push configured
[Reminders] Reminder scheduler started (checking every minute)
```

If those two keys are missing, you'll instead see:

```
[Push] Web push is not configured (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY to enable reminders)
[Reminders] Scheduler not started -- push notifications are not configured (missing VAPID keys).
```

## Step 3 — Turn reminders on as a user

1. Sign in to `agecare-frontend-redesign`.
2. Click the bell icon (top right). The popover now shows a **Reminders**
   panel instead of "Reminders aren't set up on this server yet."
3. Click **Turn on for this device** — the browser will ask for
   notification permission. Accept it.
4. Set a daily check-in time and toggle medication reminders as wanted.
5. Click **Send a test reminder now** to confirm it actually rings —this is
   the fastest way to verify the whole pipeline (VAPID keys → backend →
   push service → this device) end to end without waiting for a scheduled
   time to arrive.

Each family member does this individually, on each device they want
reminders on — push subscriptions are per-browser, per-device, the same way
a phone's own notification settings are.

## What "ringing" actually means here

- **App closed / tab not open**: the browser/OS shows its own system
  notification with its own default sound. Web Push has no API to attach a
  custom sound file to that — this is a real platform limitation, not
  something this app chose.
- **App open in a tab**: the service worker relays the same message to the
  open tab, which shows a full-screen alert and plays a synthesized
  alarm-clock tone (two alternating tones on a loop, generated with the Web
  Audio API — no audio file to host) until dismissed. This is the fuller
  "alarm" experience the check-in and medication reminders are meant to
  have; the prescription-renewal warning intentionally rings quietly
  (system notification only) since it's informational, not urgent.

## Verifying without a live deploy

The scheduler and dedupe logic are covered by `tests/reminderScheduler.test.js`,
`tests/notificationsMigration.test.js`, and `tests/notificationsPostgresSchema.test.js`
(`npm test` from the repo root) — these run entirely offline against SQLite
and `pg-mem`, so they don't need real VAPID keys or a real push service.
