// Adds reminder preferences to existing users, plus two new tables: one
// storing each device's Web Push subscription, one deduping reminder sends
// so the same check-in nudge or medication alarm doesn't fire twice for the
// same local day if the scheduler tick overlaps itself.
const statements = [
  { label: 'users timezone column', sql: "ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'Australia/Sydney'" },
  { label: 'users checkin reminder time column', sql: "ALTER TABLE users ADD COLUMN checkin_reminder_time TEXT DEFAULT '09:00'" },
  { label: 'users checkin reminder enabled column', sql: 'ALTER TABLE users ADD COLUMN checkin_reminder_enabled INTEGER DEFAULT 1' },
  { label: 'users medication reminders enabled column', sql: 'ALTER TABLE users ADD COLUMN medication_reminders_enabled INTEGER DEFAULT 1' },
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
