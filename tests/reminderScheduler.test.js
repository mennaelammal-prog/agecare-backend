const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { statements: notificationStatements } = require('../migrations/notifications');
const scheduler = require('../services/reminderScheduler');

function exec(db, sql) {
  return new Promise((resolve, reject) => db.exec(sql, (error) => error ? reject(error) : resolve()));
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function onRun(error) {
    if (error) return reject(error);
    resolve({ id: this.lastID, changes: this.changes });
  }));
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
}

test('localDateAndTime reports the correct local clock across timezones for the same instant', () => {
  // 2026-08-17T00:30:00Z is still "yesterday evening" in US/Pacific but already
  // mid-morning in Sydney -- if the scheduler read UTC only, everyone's daily
  // reminder would fire at the same instant regardless of where they live.
  const instant = new Date('2026-08-17T00:30:00Z');
  assert.deepEqual(scheduler.localDateAndTime('Australia/Sydney', instant), { date: '2026-08-17', time: '10:30' });
  assert.deepEqual(scheduler.localDateAndTime('America/Los_Angeles', instant), { date: '2026-08-16', time: '17:30' });
});

test('localDateAndTime falls back to Australia/Sydney for an invalid timezone instead of throwing', () => {
  const instant = new Date('2026-08-17T00:30:00Z');
  assert.deepEqual(scheduler.localDateAndTime('Not/AZone', instant), { date: '2026-08-17', time: '10:30' });
});

test('daysUntil counts whole calendar days regardless of time-of-day drift', () => {
  assert.equal(scheduler.daysUntil('2026-08-20', '2026-08-17'), 3);
  assert.equal(scheduler.daysUntil('2026-08-17', '2026-08-17'), 0);
  assert.equal(scheduler.daysUntil('2026-08-10', '2026-08-17'), -7);
});

test('parseDbTimestamp reads a bare SQLite CURRENT_TIMESTAMP string as UTC, not process-local time', () => {
  const parsed = scheduler.parseDbTimestamp('2026-08-17 00:30:00');
  assert.equal(parsed.toISOString(), '2026-08-17T00:30:00.000Z');
});

test('toDateString normalizes both a Postgres Date object and a plain SQLite date string', () => {
  assert.equal(scheduler.toDateString('2026-08-20'), '2026-08-20');
  assert.equal(scheduler.toDateString(new Date('2026-08-20T00:00:00Z')), '2026-08-20');
  assert.equal(scheduler.toDateString(null), null);
});

function runMigrationTolerant(db, sql) {
  // Mirrors server.js's runMigration: SQLite has no "ADD COLUMN IF NOT
  // EXISTS", so a column the base CREATE TABLE didn't already declare is
  // added via ALTER TABLE and a "duplicate column" re-run is expected, not
  // an error.
  return new Promise((resolve, reject) => {
    db.run(sql, (error) => {
      if (error && !error.message.includes('duplicate column') && !error.message.includes('already exists')) {
        return reject(error);
      }
      resolve();
    });
  });
}

async function seededDb() {
  const db = new sqlite3.Database(':memory:');
  await exec(db, `CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL)`);
  await exec(db, `CREATE TABLE checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await exec(db, `CREATE TABLE medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, dosage TEXT,
    time_of_day TEXT, end_date TEXT, is_active INTEGER DEFAULT 1
  )`);
  for (const migration of notificationStatements) await runMigrationTolerant(db, migration.sql);
  return db;
}

test('runCheckinReminders claims a reminder for a user due now with no check-in today, and skips a second tick', async () => {
  const db = await seededDb();
  try {
    await run(db, `INSERT INTO users (id, email, timezone, checkin_reminder_time) VALUES (1, 'a@example.test', 'Australia/Sydney', '10:30')`);
    const now = new Date('2026-08-17T00:30:00Z'); // 10:30 Sydney time

    await scheduler.runCheckinReminders(db, now);
    let claims = await all(db, `SELECT * FROM reminder_log WHERE user_id = 1 AND reminder_type = 'checkin'`);
    assert.equal(claims.length, 1);
    assert.equal(claims[0].reminder_date, '2026-08-17');

    // A second tick at the same minute must not double-claim.
    await scheduler.runCheckinReminders(db, now);
    claims = await all(db, `SELECT * FROM reminder_log WHERE user_id = 1 AND reminder_type = 'checkin'`);
    assert.equal(claims.length, 1);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});

test('runCheckinReminders skips a user who already checked in today', async () => {
  const db = await seededDb();
  try {
    await run(db, `INSERT INTO users (id, email, timezone, checkin_reminder_time) VALUES (1, 'a@example.test', 'Australia/Sydney', '10:30')`);
    await run(db, `INSERT INTO checkins (user_id, created_at) VALUES (1, '2026-08-17 00:00:00')`); // 10:00 Sydney, same local day
    const now = new Date('2026-08-17T00:30:00Z');

    await scheduler.runCheckinReminders(db, now);
    const claims = await all(db, `SELECT * FROM reminder_log WHERE user_id = 1 AND reminder_type = 'checkin'`);
    assert.equal(claims.length, 0);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});

test('runCheckinReminders ignores a user whose reminder time has not arrived yet, and respects the disabled flag', async () => {
  const db = await seededDb();
  try {
    await run(db, `INSERT INTO users (id, email, timezone, checkin_reminder_time) VALUES (1, 'a@example.test', 'Australia/Sydney', '18:00')`);
    await run(db, `INSERT INTO users (id, email, timezone, checkin_reminder_time, checkin_reminder_enabled) VALUES (2, 'b@example.test', 'Australia/Sydney', '10:30', 0)`);
    const now = new Date('2026-08-17T00:30:00Z'); // 10:30 Sydney

    await scheduler.runCheckinReminders(db, now);
    const claims = await all(db, `SELECT * FROM reminder_log`);
    assert.equal(claims.length, 0);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});

test('runMedicationReminders fires once per medication at its scheduled local time', async () => {
  const db = await seededDb();
  try {
    await run(db, `INSERT INTO users (id, email, timezone) VALUES (1, 'a@example.test', 'Australia/Sydney')`);
    await run(db, `INSERT INTO medications (id, user_id, name, dosage, time_of_day) VALUES (1, 1, 'Metformin', '500mg', '10:30')`);
    await run(db, `INSERT INTO medications (id, user_id, name, dosage, time_of_day) VALUES (2, 1, 'Aspirin', '100mg', '20:00')`);
    const now = new Date('2026-08-17T00:30:00Z'); // 10:30 Sydney

    await scheduler.runMedicationReminders(db, now);
    const claims = await all(db, `SELECT * FROM reminder_log WHERE reminder_type = 'medication'`);
    assert.equal(claims.length, 1);
    assert.equal(claims[0].reference_id, 1); // Only the 10:30 medication, not the 20:00 one.
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});

test('runMedicationRenewalWarnings fires once a day within the warning window and stops once expired', async () => {
  const db = await seededDb();
  try {
    await run(db, `INSERT INTO users (id, email, timezone) VALUES (1, 'a@example.test', 'Australia/Sydney')`);
    await run(db, `INSERT INTO medications (id, user_id, name, end_date) VALUES (1, 1, 'Metformin', '2026-08-19')`); // 2 days out
    await run(db, `INSERT INTO medications (id, user_id, name, end_date) VALUES (2, 1, 'Aspirin', '2026-09-01')`); // far out, no warning
    await run(db, `INSERT INTO medications (id, user_id, name, end_date) VALUES (3, 1, 'Ibuprofen', '2026-08-01')`); // already expired
    const now = new Date('2026-08-17T00:30:00Z'); // 10:30 Sydney, today = 2026-08-17

    await scheduler.runMedicationRenewalWarnings(db, now);
    const claims = await all(db, `SELECT * FROM reminder_log WHERE reminder_type = 'medication_renewal' ORDER BY reference_id`);
    assert.deepEqual(claims.map((c) => c.reference_id), [1]);

    // The next day, still within the window, should warn again (a renewed medication only stops
    // warning once its end_date is updated or it's deactivated).
    const tomorrow = new Date('2026-08-18T00:30:00Z');
    await scheduler.runMedicationRenewalWarnings(db, tomorrow);
    const claimsAfter = await all(db, `SELECT * FROM reminder_log WHERE reminder_type = 'medication_renewal' ORDER BY id`);
    assert.equal(claimsAfter.length, 2);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});

test('tick runs all three reminder passes without throwing when push is not configured', async () => {
  const db = await seededDb();
  try {
    await run(db, `INSERT INTO users (id, email, timezone, checkin_reminder_time) VALUES (1, 'a@example.test', 'Australia/Sydney', '10:30')`);
    await run(db, `INSERT INTO medications (id, user_id, name, time_of_day) VALUES (1, 1, 'Metformin', '10:30')`);
    const now = new Date('2026-08-17T00:30:00Z');
    await scheduler.tick(db, now);
    const claims = await all(db, `SELECT reminder_type FROM reminder_log ORDER BY reminder_type`);
    assert.deepEqual(claims.map((c) => c.reminder_type), ['checkin', 'medication']);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});
