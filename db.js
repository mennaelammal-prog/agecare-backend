const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.AGECARE_DB_PATH || path.join(__dirname, 'agecare.db');
let db = null;

function initDb() {
  if (db) return db;

  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('[DB] Failed to connect:', err.message);
    } else {
      console.log('[DB] Connected to', DB_PATH);
    }
  });

  db.run('PRAGMA foreign_keys = ON');
  runSchema();
  return db;
}

function runSchema() {
  const schemaPath = path.join(__dirname, 'database', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.log('[DB] schema.sql not found');
    return;
  }
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema, (err) => {
    if (err) {
      console.error('[DB] Schema error:', err.message);
    } else {
      console.log('[DB] All tables ready');
    }
  });
}

function getDb() {
  if (!db) return initDb();
  return db;
}

function closeDb() {
  if (db) {
    db.close((err) => {
      if (err) console.error('[DB] Close error:', err.message);
      else console.log('[DB] Connection closed');
    });
    db = null;
  }
}

module.exports = { initDb, getDb, closeDb };
