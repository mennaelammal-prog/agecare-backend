const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { statements } = require('../migrations/careAccess');

function exec(db, sql) {
  return new Promise((resolve, reject) => db.exec(sql, (error) => error ? reject(error) : resolve()));
}

function all(db, sql) {
  return new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));
}

test('care-access migration creates grant and audit tables with required indexes', async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    for (const migration of statements) await exec(db, migration.sql);
    const objects = await all(db, `SELECT name FROM sqlite_master WHERE type IN ('table', 'index')`);
    const names = new Set(objects.map((object) => object.name));
    for (const required of ['care_access_grants', 'care_access_audit', 'idx_care_access_patient', 'idx_care_access_caregiver', 'idx_care_access_audit_patient']) {
      assert.equal(names.has(required), true, `${required} should exist`);
    }
    const columns = await all(db, 'PRAGMA table_info(care_access_grants)');
    const columnNames = new Set(columns.map((column) => column.name));
    for (const required of ['patient_user_id', 'caregiver_user_id', 'status', 'granted_scopes', 'expires_at', 'revoked_at']) {
      assert.equal(columnNames.has(required), true, `${required} should exist`);
    }
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});
