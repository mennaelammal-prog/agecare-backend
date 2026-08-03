const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'agecare.db');
let db = null;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('[DB] Failed to connect:', err.message);
      } else {
        console.log('[DB] Connected to', DB_PATH);
        initTables();
      }
    });
  }
  return db;
}

function initTables() {
  db.run(
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      role TEXT DEFAULT 'user',
      reset_token TEXT,
      reset_expires INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  , (err) => {
    if (err) console.error('[DB] users table error:', err.message);
    else console.log('[DB] All tables ready');
  });

  db.run(
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      mood TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  );
}

function closeDb() {
  if (db) {
    db.close((err) => {
      if (err) console.error('[DB] Close error:', err.message);
      else console.log('[DB] Connection closed');
    });
  }
}

module.exports = { getDb, closeDb };
