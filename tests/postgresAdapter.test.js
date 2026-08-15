const test = require('node:test');
const assert = require('node:assert/strict');
const { convertPlaceholders } = require('../database/postgresAdapter');
const { statements } = require('../database/postgresSchema');

test('PostgreSQL adapter converts SQLite placeholders and timestamps safely', () => {
  assert.equal(
    convertPlaceholders("INSERT INTO users (email, created_at) VALUES (?, datetime('now'))"),
    'INSERT INTO users (email, created_at) VALUES ($1, CURRENT_TIMESTAMP)',
  );
  assert.equal(convertPlaceholders('SELECT * FROM users WHERE id = ? AND email = ?'), 'SELECT * FROM users WHERE id = $1 AND email = $2');
});

test('PostgreSQL schema includes durable account, Family Circle, and consent tables', () => {
  const schema = statements.join('\n');
  for (const table of ['users', 'family_contacts', 'care_access_grants', 'care_access_audit', 'checkins', 'notification_log']) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(schema, /role TEXT NOT NULL DEFAULT 'patient'/);
  assert.match(schema, /UNIQUE \(patient_user_id, caregiver_user_id\)/);
});
