-- ============================================================
-- Age Care App - Complete Database Schema
-- SQLite (agecare.db)
-- ============================================================

-- 1. USERS TABLE (for multi-user login/register)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'patient',
  phone TEXT,
  date_of_birth TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. CHECK-INS TABLE
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

-- 3. MEDICATIONS TABLE
CREATE TABLE IF NOT EXISTS medications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT,
  time_of_day TEXT,
  start_date TEXT,
  end_date TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. APPOINTMENTS TABLE
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  doctor_name TEXT NOT NULL,
  specialty TEXT,
  location TEXT,
  appointment_date DATETIME NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. VITAL SIGNS TABLE
-- Named vital_signs, not vitals, to match what routes/vitals.js actually
-- queries (INSERT/SELECT/UPDATE/DELETE ... vital_signs) and what
-- database/postgresSchema.js already names it. This table was previously
-- called "vitals" here, which routes/vitals.js was never written for --
-- every vitals call failed outright with "no such table: vital_signs" in
-- SQLite mode (a 500 response, not a silent background failure like the
-- other SQLite/Postgres schema-name mismatches found this session).
-- Postgres-backed production was never affected.
CREATE TABLE IF NOT EXISTS vital_signs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  blood_pressure_sys INTEGER,
  blood_pressure_dia INTEGER,
  heart_rate INTEGER,
  temperature REAL,
  weight REAL,
  blood_sugar INTEGER,
  spo2 INTEGER,
  notes TEXT,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. FAMILY CONTACTS TABLE
CREATE TABLE IF NOT EXISTS family_contacts (
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
);

-- INDEXES for speed
CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_medications_user ON medications(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_vitals_user ON vital_signs(user_id);
CREATE INDEX IF NOT EXISTS idx_family_active ON family_contacts(is_active);
CREATE INDEX IF NOT EXISTS idx_family_linked ON family_contacts(linked_user_id);
