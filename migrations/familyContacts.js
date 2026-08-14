const statements = [
  {
    label: 'family contacts table',
    sql: `CREATE TABLE IF NOT EXISTS family_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      relationship TEXT,
      phone TEXT,
      email TEXT,
      notify_email INTEGER DEFAULT 1,
      notify_sms INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      linked_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  },
  { label: 'family contacts email column', sql: 'ALTER TABLE family_contacts ADD COLUMN email TEXT' },
  { label: 'family contacts notification email column', sql: 'ALTER TABLE family_contacts ADD COLUMN notify_email INTEGER DEFAULT 1' },
  { label: 'family contacts notification sms column', sql: 'ALTER TABLE family_contacts ADD COLUMN notify_sms INTEGER DEFAULT 0' },
  { label: 'family contacts active column', sql: 'ALTER TABLE family_contacts ADD COLUMN is_active INTEGER DEFAULT 1' },
  { label: 'family contacts linked patient column', sql: 'ALTER TABLE family_contacts ADD COLUMN linked_user_id INTEGER' },
  { label: 'family contacts active index', sql: 'CREATE INDEX IF NOT EXISTS idx_family_active ON family_contacts(is_active)' },
  { label: 'family contacts linked patient index', sql: 'CREATE INDEX IF NOT EXISTS idx_family_linked ON family_contacts(linked_user_id)' },
];

module.exports = { statements };
