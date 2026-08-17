const test = require('node:test');
const assert = require('node:assert/strict');
const { newDb } = require('pg-mem');
const { runPostgresSchema } = require('../database/postgresSchema');

test('PostgreSQL schema creates reminder tables and preference columns', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();

  await runPostgresSchema(pool);

  const columns = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`);
  const columnNames = new Set(columns.rows.map((row) => row.column_name));
  for (const required of ['timezone', 'checkin_reminder_time', 'checkin_reminder_enabled', 'medication_reminders_enabled', 'appointment_reminders_enabled', 'missed_checkin_alerts_enabled', 'vital_alerts_enabled']) {
    assert.equal(columnNames.has(required), true, `users.${required} should exist`);
  }

  const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('a@example.test', 'x') RETURNING timezone, checkin_reminder_time, missed_checkin_alerts_enabled`);
  assert.equal(user.rows[0].missed_checkin_alerts_enabled, 0);
  assert.equal(user.rows[0].timezone, 'Australia/Sydney');
  assert.equal(user.rows[0].checkin_reminder_time, '09:00');
});

// runPostgresSchema's full statement list (including the plain `CREATE TABLE
// IF NOT EXISTS` calls) already runs on every server boot in production, so
// its overall idempotency isn't new; pg-mem itself just can't re-validate a
// second CREATE TABLE IF NOT EXISTS call the way real Postgres can, so this
// checks the part this change actually adds: the unconditional ADD COLUMN
// IF NOT EXISTS repairs really are safe to run twice, per the tokens_used
// precedent this same file documents above.
test('the reminder preference ADD COLUMN repairs are safe to run twice against an existing table', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  await pool.query('CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT NOT NULL)');

  const repairs = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Australia/Sydney'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS checkin_reminder_time TEXT NOT NULL DEFAULT '09:00'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS checkin_reminder_enabled SMALLINT NOT NULL DEFAULT 1`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS medication_reminders_enabled SMALLINT NOT NULL DEFAULT 1`,
  ];
  for (const repair of repairs) await pool.query(repair);
  for (const repair of repairs) await pool.query(repair); // Simulates a redeploy against an already-repaired table.

  const columns = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`);
  const columnNames = new Set(columns.rows.map((row) => row.column_name));
  for (const required of ['timezone', 'checkin_reminder_time', 'checkin_reminder_enabled', 'medication_reminders_enabled']) {
    assert.equal(columnNames.has(required), true, `users.${required} should exist`);
  }
});

test('PostgreSQL reminder_log dedupes a reminder type/reference/day, but allows a fresh medication or day', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  await runPostgresSchema(pool);

  const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('patient@example.test', 'x') RETURNING id`);
  const userId = user.rows[0].id;

  await pool.query(
    `INSERT INTO reminder_log (user_id, reminder_type, reference_id, reminder_date) VALUES ($1, 'checkin', 0, '2026-08-17')`,
    [userId]);

  await assert.rejects(
    pool.query(
      `INSERT INTO reminder_log (user_id, reminder_type, reference_id, reminder_date) VALUES ($1, 'checkin', 0, '2026-08-17')`,
      [userId]),
  );

  // A different day for the same user/type is a distinct reminder.
  await pool.query(
    `INSERT INTO reminder_log (user_id, reminder_type, reference_id, reminder_date) VALUES ($1, 'checkin', 0, '2026-08-18')`,
    [userId]);

  // A different medication (reference_id) on the same day is also distinct.
  await pool.query(
    `INSERT INTO reminder_log (user_id, reminder_type, reference_id, reminder_date) VALUES ($1, 'medication', 7, '2026-08-17')`,
    [userId]);

  const rows = await pool.query('SELECT reminder_type, reference_id, reminder_date FROM reminder_log ORDER BY id');
  assert.equal(rows.rows.length, 3);
});

// Regression test for a real bug: reminder_log.reminder_type briefly had a
// CHECK constraint listing only the reminder types that existed when it was
// written ('checkin', 'medication', 'medication_renewal'). Every reminder
// type added after that ('appointment', 'missed_checkin_family_alert', and
// this same list will keep growing) silently failed its claimReminder
// INSERT with a CHECK violation on every single scheduler tick, in
// production, from the moment those features shipped -- SQLite's copy of
// this table never had the constraint, so SQLite-based tests and local
// smoke testing never caught it. This enumerates every reminder_type value
// actually used anywhere in services/reminderScheduler.js so a similar
// mistake (re-adding a restrictive CHECK, or some other rejection) fails a
// test immediately instead of shipping silently broken again.
test('reminder_log accepts every reminder_type value the scheduler actually uses', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  await runPostgresSchema(pool);

  const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('a@example.test', 'x') RETURNING id`);
  const userId = user.rows[0].id;

  const usedTypes = [
    'checkin',
    'medication',
    'medication_renewal',
    'appointment',
    'missed_checkin_family_alert',
    // Vital-sign alerts encode metric+severity into the type itself
    // (services/vitalAlerts.js) rather than a fixed enum -- exactly the
    // kind of value a CHECK constraint here would silently reject again.
    'vital_alert:heart_rate:critical',
    'vital_alert:blood_pressure_sys:warning',
  ];
  for (const type of usedTypes) {
    await pool.query(
      `INSERT INTO reminder_log (user_id, reminder_type, reference_id, reminder_date) VALUES ($1, $2, 0, '2026-08-17')`,
      [userId, type]);
  }

  const rows = await pool.query('SELECT reminder_type FROM reminder_log ORDER BY reminder_type');
  assert.deepEqual(rows.rows.map((r) => r.reminder_type).sort(), [...usedTypes].sort());
});

test('sos_events records a triggered alert and its notified-contact count', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  await runPostgresSchema(pool);

  const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('a@example.test', 'x') RETURNING id`);
  const userId = user.rows[0].id;

  await pool.query(`INSERT INTO sos_events (user_id, contacts_notified) VALUES ($1, 2)`, [userId]);
  const rows = await pool.query('SELECT user_id, contacts_notified FROM sos_events');
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0].contacts_notified, 2);
});
