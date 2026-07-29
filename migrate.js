const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'agecare.db');
const db = new sqlite3.Database(DB_PATH);

console.log('Connected to SQLite database at:', DB_PATH);

const migrations = [
  {
    name: 'create_users_table',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `
  },
  {
    name: 'create_checkins_table',
    sql: `
      CREATE TABLE IF NOT EXISTS checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        mood INTEGER CHECK(mood BETWEEN 1 AND 5),
        energy INTEGER CHECK(energy BETWEEN 1 AND 5),
        pain INTEGER CHECK(pain BETWEEN 0 AND 10),
        sleep_hours REAL,
        notes TEXT,
        ai_response TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_checkins_user_id ON checkins(user_id);
      CREATE INDEX IF NOT EXISTS idx_checkins_created_at ON checkins(created_at);
    `
  },
  {
    name: 'create_family_contacts_table',
    sql: `
      CREATE TABLE IF NOT EXISTS family_contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        relationship TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        notify_email INTEGER DEFAULT 1,
        notify_sms INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_family_user_id ON family_contacts(user_id);
      CREATE INDEX IF NOT EXISTS idx_family_active ON family_contacts(is_active);
    `
  },
  {
    name: 'create_notification_log_table',
    sql: `
      CREATE TABLE IF NOT EXISTS notification_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL,
        checkin_id INTEGER,
        type TEXT NOT NULL CHECK(type IN ('email', 'sms')),
        status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'failed', 'retrying')),
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        sent_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contact_id) REFERENCES family_contacts(id) ON DELETE CASCADE,
        FOREIGN KEY (checkin_id) REFERENCES checkins(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notif_contact ON notification_log(contact_id);
      CREATE INDEX IF NOT EXISTS idx_notif_status ON notification_log(status);
      CREATE INDEX IF NOT EXISTS idx_notif_created ON notification_log(created_at);
    `
  },
  {
    name: 'create_chat_history_table',
    sql: `
      CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        model TEXT,
        tokens_used INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_history(created_at);
    `
  }
];

db.run(`
  CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`, (err) => {
  if (err) {
    console.error('Failed to create migrations table:', err.message);
    process.exit(1);
  }

  db.all('SELECT name FROM migrations', [], (err, rows) => {
    if (err) {
      console.error('Failed to read migrations:', err.message);
      process.exit(1);
    }

    const applied = new Set(rows.map(r => r.name));
    let appliedCount = 0;
    let pending = migrations.filter(m => !applied.has(m.name));

    function runNext() {
      if (pending.length === 0) {
        console.log(`\nDatabase migrated successfully. ${appliedCount} new migration(s) applied.`);
        console.log('Tables created: users, checkins, family_contacts, notification_log, chat_history');
        db.close();
        return;
      }

      const migration = pending.shift();
      console.log(`  [RUN]  ${migration.name}`);

      db.exec(migration.sql, (err) => {
        if (err) {
          console.error(`  [FAIL] ${migration.name}: ${err.message}`);
          db.close();
          process.exit(1);
        }

        db.run('INSERT INTO migrations (name) VALUES (?)', [migration.name], (err) => {
          if (err) {
            console.error(`  [FAIL] ${migration.name}: ${err.message}`);
            db.close();
            process.exit(1);
          }
          appliedCount++;
          console.log(`  [OK]   ${migration.name}`);
          runNext();
        });
      });
    }

    runNext();
  });
});