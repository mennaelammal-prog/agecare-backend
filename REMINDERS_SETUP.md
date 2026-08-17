# Setting up push reminders (check-in, medication, appointments, renewals)

This turns on real, ringing browser push notifications for every registered
member: a daily check-in reminder at a time they choose, a ping at each
medication's scheduled time, a heads-up 2 hours before each appointment, and
a warning as a prescription's `end_date` approaches. The code for all of this
ships already — `services/pushNotifications.js`
and `services/reminderScheduler.js` on the backend, `ReminderSettings.tsx` and
`AlarmOverlay.tsx` on the `agecare-frontend-redesign` frontend — but it stays
dormant until two keys are configured. This doc also covers a related but
separate feature at the bottom: notifying family when someone misses a
check-in, which doesn't use push/VAPID at all. Nothing in the app breaks if you skip
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
| `APPOINTMENT_REMINDER_HOURS_BEFORE` | how many hours before an appointment's date/time the reminder fires | `2` |

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
  open tab, which shows a full-screen alert and plays a synthesized, gentle
  two-note chime (generated with the Web Audio API — no audio file to host)
  on a loop until dismissed, or automatically after 45 seconds either way.
  This is the fuller "alarm" experience the check-in and medication
  reminders are meant to have; the appointment heads-up and the
  prescription-renewal warning both ring quietly (system notification only)
  since they're informational, not urgent.

## Notifying family when someone misses a check-in

This is a related but separate feature from everything above: it sends
**email/SMS to family contacts**, not a browser push notification, so it
doesn't need VAPID keys at all — only whatever SMTP (`EMAIL_HOST`,
`EMAIL_USER`, `EMAIL_PASS`) or Twilio (`TWILIO_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_PHONE`) configuration this backend already uses for its existing
"a check-in was recorded" family notifications (`services/notification.js`).
If neither is configured, this still runs safely — it just logs each
attempt as `skipped` in `notification_log` rather than actually sending.

- **Off by default.** Unlike the reminders above, this shares a resident's
  own check-in behaviour with a third party, so it follows this app's
  consent-first pattern elsewhere (care-access grants are opt-in per family
  member too) rather than defaulting everyone into being watched. A resident
  turns it on themselves in the Reminders panel ("Notify my family if I miss
  a check-in").
- **Who gets told** is whichever family contacts already have
  `notify_email`/`notify_sms` turned on for them (the same address-book
  entries and the same consent signal used for the existing check-in
  notification) — not everyone with view access to their history.
- **When it fires**: `APPOINTMENT_REMINDER_HOURS_BEFORE`'s sibling here is
  `MISSED_CHECKIN_GRACE_HOURS` (default `4`) — hours after the resident's own
  check-in reminder time before family gets told, if there's still no
  check-in.
- **Never silent**: the resident also gets a quiet push (if they have push
  turned on) letting them know their family was notified, at the same
  moment it happens — this is never done invisibly.

## Verifying without a live deploy

The scheduler and dedupe logic are covered by `tests/reminderScheduler.test.js`,
`tests/notificationsMigration.test.js`, `tests/notificationsPostgresSchema.test.js`,
and `tests/notificationContent.test.js` (`npm test` from the repo root) —
these run entirely offline against SQLite and `pg-mem`, so they don't need
real VAPID keys, SMTP/Twilio credentials, or a real push service.
