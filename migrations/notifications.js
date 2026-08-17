// Adds reminder preferences to existing users, plus two new tables: one
// storing each device's Web Push subscription, one deduping reminder sends
// so the same check-in nudge or medication alarm doesn't fire twice for the
// same local day if the scheduler tick overlaps itself.
const statements = [
  { label: 'users timezone column', sql: "ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'Australia/Sydney'" },
  { label: 'users checkin reminder time column', sql: "ALTER TABLE users ADD COLUMN checkin_reminder_time TEXT DEFAULT '09:00'" },
  { label: 'users checkin reminder enabled column', sql: 'ALTER TABLE users ADD COLUMN checkin_reminder_enabled INTEGER DEFAULT 1' },
  { label: 'users medication reminders enabled column', sql: 'ALTER TABLE users ADD COLUMN medication_reminders_enabled INTEGER DEFAULT 1' },
  { label: 'users appointment reminders enabled column', sql: 'ALTER TABLE users ADD COLUMN appointment_reminders_enabled INTEGER DEFAULT 1' },
  // Defaults to 0 (opt-in), unlike the reminder toggles above -- this shares the resident's
  // own check-in behaviour with a third party (their family), so it follows this app's
  // consent-first pattern elsewhere (care-access grants are opt-in per family member too)
  // rather than silently defaulting everyone into being watched.
  { label: 'users missed checkin family alert column', sql: 'ALTER TABLE users ADD COLUMN missed_checkin_alerts_enabled INTEGER DEFAULT 0' },
  // Same opt-in-by-default reasoning as missed_checkin_alerts_enabled above --
  // this only gates whether family gets told about an out-of-range vital
  // reading; the resident always sees it themselves regardless (see
  // services/vitalAlerts.js).
  { label: 'users vital alerts enabled column', sql: 'ALTER TABLE users ADD COLUMN vital_alerts_enabled INTEGER DEFAULT 0' },
  // appointments.is_active was already part of the Postgres schema (routes/appointments.js
  // has always filtered/updated on it) but was missing from schema.sql -- every appointments
  // call in SQLite mode (local dev/tests) was throwing "no such column: is_active" before this.
  // Postgres-backed production was never affected, but the reminder scheduler below needs this
  // column to exist on both drivers to filter to active appointments.
  { label: 'appointments active column', sql: 'ALTER TABLE appointments ADD COLUMN is_active INTEGER DEFAULT 1' },
  // notification_log (family email/SMS delivery log) was, like appointments.is_active above,
  // only ever defined in database/postgresSchema.js -- services/notification.js has queried
  // and written to it unconditionally since before this session, so every family notification
  // on check-in (routes/checkin.js -> notifyFamily) has always failed in SQLite mode with
  // "no such table: notification_log" (silently, since that call is fire-and-forget). This
  // closes that gap, and is a hard prerequisite for the missed-check-in family alert below,
  // which reuses the same queueNotification/processNotification pipeline.
  {
    label: 'notification log table',
    sql: `CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      checkin_id INTEGER,
      type TEXT NOT NULL CHECK(type IN ('email', 'sms')),
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contact_id) REFERENCES family_contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (checkin_id) REFERENCES checkins(id) ON DELETE SET NULL
    )`,
  },
  { label: 'notification log status index', sql: 'CREATE INDEX IF NOT EXISTS idx_notification_log_status ON notification_log(status, created_at)' },
  {
    label: 'push subscriptions table',
    sql: `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  },
  { label: 'push subscriptions user index', sql: 'CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)' },
  {
    // reference_id defaults to 0 (rather than allowing NULL) because SQLite
    // and Postgres both treat NULL as distinct from every other NULL in a
    // UNIQUE constraint -- a nullable reference_id would let the check-in
    // reminder (which has no medication to reference) re-insert endlessly
    // without ever tripping the uniqueness check meant to dedupe it.
    label: 'reminder log table',
    sql: `CREATE TABLE IF NOT EXISTS reminder_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      reminder_type TEXT NOT NULL,
      reference_id INTEGER NOT NULL DEFAULT 0,
      reminder_date TEXT NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, reminder_type, reference_id, reminder_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  },
  { label: 'reminder log lookup index', sql: 'CREATE INDEX IF NOT EXISTS idx_reminder_log_lookup ON reminder_log(user_id, reminder_type, reminder_date)' },
];

module.exports = { statements };
