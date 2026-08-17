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
  await exec(db, `CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, name TEXT, full_name TEXT)`);
  await exec(db, `CREATE TABLE checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await exec(db, `CREATE TABLE medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, dosage TEXT,
    time_of_day TEXT, end_date TEXT, is_active INTEGER DEFAULT 1
  )`);
  await exec(db, `CREATE TABLE appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, doctor_name TEXT NOT NULL,
    specialty TEXT, location TEXT, appointment_date DATETIME NOT NULL
  )`);
  await exec(db, `CREATE TABLE family_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL,
    email TEXT, phone TEXT, notify_email INTEGER DEFAULT 1, notify_sms INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1
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

test('runAppointmentReminders fires once an appointment enters the reminder window, and not before or after', async () => {
  const db = await seededDb();
  try {
    await run(db, `INSERT INTO users (id, email, timezone) VALUES (1, 'a@example.test', 'Australia/Sydney')`);
    // now = 2026-08-17T00:30:00Z. Appointment #1 is 90 minutes out (inside the
    // default 2h window); #2 is 3 hours out (outside it); #3 already passed.
    await run(db, `INSERT INTO appointments (id, user_id, doctor_name, appointment_date) VALUES (1, 1, 'Dr Lee', '2026-08-17T02:00:00Z')`);
    await run(db, `INSERT INTO appointments (id, user_id, doctor_name, appointment_date) VALUES (2, 1, 'Dr Patel', '2026-08-17T03:30:00Z')`);
    await run(db, `INSERT INTO appointments (id, user_id, doctor_name, appointment_date) VALUES (3, 1, 'Dr Kim', '2026-08-17T00:00:00Z')`);
    const now = new Date('2026-08-17T00:30:00Z');

    await scheduler.runAppointmentReminders(db, now);
    const claims = await all(db, `SELECT reference_id FROM reminder_log WHERE reminder_type = 'appointment' ORDER BY reference_id`);
    assert.deepEqual(claims.map((c) => c.reference_id), [1]);

    // A second tick a minute later, still inside the window, must not double-claim.
    await scheduler.runAppointmentReminders(db, new Date('2026-08-17T00:31:00Z'));
    const claimsAfter = await all(db, `SELECT reference_id FROM reminder_log WHERE reminder_type = 'appointment'`);
    assert.equal(claimsAfter.length, 1);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});

test('runAppointmentReminders respects the per-user toggle and skips inactive appointments', async () => {
  const db = await seededDb();
  try {
    await run(db, `INSERT INTO users (id, email, timezone, appointment_reminders_enabled) VALUES (1, 'a@example.test', 'Australia/Sydney', 0)`);
    await run(db, `INSERT INTO users (id, email, timezone) VALUES (2, 'b@example.test', 'Australia/Sydney')`);
    await run(db, `INSERT INTO appointments (id, user_id, doctor_name, appointment_date) VALUES (1, 1, 'Dr Lee', '2026-08-17T02:00:00Z')`);
    await run(db, `INSERT INTO appointments (id, user_id, doctor_name, appointment_date, is_active) VALUES (2, 2, 'Dr Patel', '2026-08-17T02:00:00Z', 0)`);
    const now = new Date('2026-08-17T00:30:00Z');

    await scheduler.runAppointmentReminders(db, now);
    const claims = await all(db, `SELECT * FROM reminder_log WHERE reminder_type = 'appointment'`);
    assert.equal(claims.length, 0);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});

test('runMissedCheckinAlerts fires only after the grace period, once, and only when opted in with an eligible contact', async () => {
  const db = await seededDb();
  try {
    // user 1: opted in, reminder at 09:00, no check-in, has an eligible contact -- should fire
    // once grace has elapsed (default 4h -> due at 13:00 local).
    await run(db, `INSERT INTO users (id, email, name, timezone, checkin_reminder_time, missed_checkin_alerts_enabled) VALUES (1, 'a@example.test', 'Pat', 'Australia/Sydney', '09:00', 1)`);
    await run(db, `INSERT INTO family_contacts (user_id, name, email, notify_email) VALUES (1, 'Alex', 'alex@example.test', 1)`);

    const beforeGrace = new Date('2026-08-17T01:30:00Z'); // 11:30 Sydney -- only 2.5h after 09:00, not yet 4h
    await scheduler.runMissedCheckinAlerts(db, beforeGrace);
    assert.equal((await all(db, `SELECT * FROM reminder_log WHERE reminder_type = 'missed_checkin_family_alert'`)).length, 0);

    const atGrace = new Date('2026-08-17T03:00:00Z'); // 13:00 Sydney -- exactly 4h after 09:00
    await scheduler.runMissedCheckinAlerts(db, atGrace);
    const claims = await all(db, `SELECT * FROM reminder_log WHERE reminder_type = 'missed_checkin_family_alert'`);
    assert.equal(claims.length, 1);
    assert.equal(claims[0].user_id, 1);

    // A later tick the same day must not re-notify.
    await scheduler.runMissedCheckinAlerts(db, new Date('2026-08-17T05:00:00Z'));
    assert.equal((await all(db, `SELECT * FROM reminder_log WHERE reminder_type = 'missed_checkin_family_alert'`)).length, 1);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});

test('runMissedCheckinAlerts respects the opt-in default, already-checked-in state, and requires an eligible contact', async () => {
  const db = await seededDb();
  const atGrace = new Date('2026-08-17T03:00:00Z'); // 13:00 Sydney
  try {
    // user 2: has NOT opted in (missed_checkin_alerts_enabled defaults to 0) -- must not fire
    // even with an eligible contact and no check-in.
    await run(db, `INSERT INTO users (id, email, name, timezone, checkin_reminder_time) VALUES (2, 'b@example.test', 'Sam', 'Australia/Sydney', '09:00')`);
    await run(db, `INSERT INTO family_contacts (user_id, name, email, notify_email) VALUES (2, 'Jo', 'jo@example.test', 1)`);

    // user 3: opted in and has an eligible contact, but already checked in today -- must not fire.
    await run(db, `INSERT INTO users (id, email, name, timezone, checkin_reminder_time, missed_checkin_alerts_enabled) VALUES (3, 'c@example.test', 'Ren', 'Australia/Sydney', '09:00', 1)`);
    await run(db, `INSERT INTO family_contacts (user_id, name, email, notify_email) VALUES (3, 'Kai', 'kai@example.test', 1)`);
    await run(db, `INSERT INTO checkins (user_id, created_at) VALUES (3, '2026-08-17 01:00:00')`); // 11:00 Sydney, today

    // user 4: opted in, no check-in, but no eligible contact (notify_email off) -- must not fire.
    await run(db, `INSERT INTO users (id, email, name, timezone, checkin_reminder_time, missed_checkin_alerts_enabled) VALUES (4, 'd@example.test', 'Lee', 'Australia/Sydney', '09:00', 1)`);
    await run(db, `INSERT INTO family_contacts (user_id, name, email, notify_email) VALUES (4, 'Noa', 'noa@example.test', 0)`);

    await scheduler.runMissedCheckinAlerts(db, atGrace);
    const claims = await all(db, `SELECT * FROM reminder_log WHERE reminder_type = 'missed_checkin_family_alert'`);
    assert.equal(claims.length, 0);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});

test('tick runs all five reminder passes without throwing when push is not configured', async () => {
  const db = await seededDb();
  try {
    await run(db, `INSERT INTO users (id, email, timezone, checkin_reminder_time) VALUES (1, 'a@example.test', 'Australia/Sydney', '10:30')`);
    await run(db, `INSERT INTO medications (id, user_id, name, time_of_day) VALUES (1, 1, 'Metformin', '10:30')`);
    await run(db, `INSERT INTO appointments (id, user_id, doctor_name, appointment_date) VALUES (1, 1, 'Dr Lee', '2026-08-17T02:00:00Z')`);
    const now = new Date('2026-08-17T00:30:00Z');
    await scheduler.tick(db, now);
    // Only 3 actually claim here -- this user hasn't opted into missed-check-in alerts (the
    // default), so that pass runs but has nothing to do; that's the point being verified, not
    // a limitation of this test.
    const claims = await all(db, `SELECT reminder_type FROM reminder_log ORDER BY reminder_type`);
    assert.deepEqual(claims.map((c) => c.reminder_type), ['appointment', 'checkin', 'medication']);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});
