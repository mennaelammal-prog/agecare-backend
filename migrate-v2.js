const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'agecare.db');
const db = new sqlite3.Database(DB_PATH);

console.log('Connected to SQLite database at:', DB_PATH);

const migrations = [
  {
    name: 'create_medications_table',
    sql: `
      CREATE TABLE IF NOT EXISTS medications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        dosage TEXT NOT NULL,
        frequency TEXT NOT NULL,
        time_of_day TEXT,
        start_date DATE,
        end_date DATE,
        notes TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_meds_user ON medications(user_id);
      CREATE INDEX IF NOT EXISTS idx_meds_active ON medications(is_active);
    `
  },
  {
    name: 'create_appointments_table',
    sql: `
      CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        doctor_name TEXT NOT NULL,
        specialty TEXT,
        location TEXT,
        appointment_date DATETIME NOT NULL,
        notes TEXT,
        reminder_sent INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_appt_user ON appointments(user_id);
      CREATE INDEX IF NOT EXISTS idx_appt_date ON appointments(appointment_date);
    `
  },
  {
    name: 'create_vital_signs_table',
    sql: `
      CREATE TABLE IF NOT EXISTS vital_signs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        blood_pressure_sys INTEGER,
        blood_pressure_dia INTEGER,
        heart_rate INTEGER,
        temperature REAL,
        weight REAL,
        blood_sugar REAL,
        spo2 INTEGER,
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_vitals_user ON vital_signs(user_id);
      CREATE INDEX IF NOT EXISTS idx_vitals_date ON vital_signs(recorded_at);
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
        console.log(`\nMigration v2 complete. ${appliedCount} new table(s) added.`);
        console.log('New tables: medications, appointments, vital_signs');
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