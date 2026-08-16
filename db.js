const path = require('path');
const fs = require('fs');
const { PostgresCompatDatabase } = require('./database/postgresAdapter');

const configuredDbPath = process.env.AGECARE_DB_PATH || process.env.DB_PATH;
const configuredDatabaseUrl = process.env.DATABASE_URL;
const usePostgres = Boolean(configuredDatabaseUrl && !configuredDbPath);
const DB_PATH = configuredDbPath || path.join(__dirname, 'agecare.db');
let db = null;

function initDb() {
  if (db) return db;

  if (usePostgres) {
    db = new PostgresCompatDatabase(configuredDatabaseUrl);
    console.log('[DB] PostgreSQL adapter configured');
    return db;
  }

  // Required lazily, only on this SQLite path: this native module must never
  // be touched in Postgres-mode production. A broken/incompatible prebuilt
  // binary (e.g. a GLIBC version mismatch against the host) crashes the
  // whole process at require() time -- before usePostgres is even checked --
  // which is exactly what happened in production after a routine dependency
  // bump, on a service that doesn't use SQLite at all.
  const sqlite3 = require('sqlite3').verbose();
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

function getDatabaseStatus() {
  if (usePostgres) {
    return { driver: 'postgres', persistentStorageConfigured: true, configuredPath: false };
  }
  return {
    driver: 'sqlite',
    persistentStorageConfigured: Boolean(configuredDbPath),
    configuredPath: Boolean(configuredDbPath),
  };
}

async function getDatabaseHealth() {
  const status = getDatabaseStatus();
  if (!usePostgres) return { ...status, connection: 'ready' };
  return getPostgresHealth(getDb().pool);
}

async function getPostgresHealth(pool) {
  try {
    await pool.query('SELECT 1');
    return { driver: 'postgres', persistentStorageConfigured: true, configuredPath: false, connection: 'ready' };
  } catch (error) {
    console.error('[DB] PostgreSQL health check failed:', error.message);
    return { driver: 'postgres', persistentStorageConfigured: true, configuredPath: false, connection: 'unavailable' };
  }
}

function isPostgres() {
  return usePostgres;
}

module.exports = { initDb, getDb, closeDb, getDatabaseStatus, getDatabaseHealth, getPostgresHealth, isPostgres };
