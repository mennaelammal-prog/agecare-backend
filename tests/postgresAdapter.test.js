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
  for (const table of ['users', 'family_contacts', 'care_access_grants', 'care_access_audit', 'checkins', 'notification_log', 'push_subscriptions', 'reminder_log']) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(schema, /role TEXT NOT NULL DEFAULT 'patient'/);
  assert.match(schema, /UNIQUE \(patient_user_id, caregiver_user_id\)/);
  assert.match(schema, /UNIQUE \(user_id, reminder_type, reference_id, reminder_date\)/);
});

test('PostgreSQL schema repairs reminder preference columns unconditionally, like the earlier chat_history repair', () => {
  const schema = statements.join('\n');
  for (const column of [
    "ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Australia\\/Sydney'",
    "ADD COLUMN IF NOT EXISTS checkin_reminder_time TEXT NOT NULL DEFAULT '09:00'",
    'ADD COLUMN IF NOT EXISTS checkin_reminder_enabled SMALLINT NOT NULL DEFAULT 1',
    'ADD COLUMN IF NOT EXISTS medication_reminders_enabled SMALLINT NOT NULL DEFAULT 1',
    'ADD COLUMN IF NOT EXISTS appointment_reminders_enabled SMALLINT NOT NULL DEFAULT 1',
    'ADD COLUMN IF NOT EXISTS missed_checkin_alerts_enabled SMALLINT NOT NULL DEFAULT 0',
  ]) {
    assert.match(schema, new RegExp(column));
  }
});
