const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { statements: notificationStatements } = require('../migrations/notifications');
const { checkVitalAlerts } = require('../services/vitalAlerts');

function exec(db, sql) {
  return new Promise((resolve, reject) => db.exec(sql, (error) => (error ? reject(error) : resolve())));
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function onRun(error) {
    if (error) return reject(error);
    resolve({ id: this.lastID, changes: this.changes });
  }));
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows))));
}

function runMigrationTolerant(db, sql) {
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
  await exec(db, `CREATE TABLE family_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL,
    email TEXT, phone TEXT, notify_email INTEGER DEFAULT 1, notify_sms INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1
  )`);
  await exec(db, `CREATE TABLE appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, doctor_name TEXT NOT NULL, appointment_date DATETIME NOT NULL
  )`);
  for (const migration of notificationStatements) await runMigrationTolerant(db, migration.sql);
  return db;
}

test('checkVitalAlerts is a no-op for a reading entirely within range', async () => {
  const db = await seededDb();
  try {
    await run(db, `INSERT INTO users (id, email, timezone) VALUES (1, 'a@example.test', 'Australia/Sydney')`);
    const result = await checkVitalAlerts(db, 1, { heart_rate: 72, blood_pressure_sys: 120 }, new Date());
    assert.deepEqual(result.breaches, []);
    assert.equal((await all(db, `SELECT * FROM reminder_log`)).length, 0);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});

test('checkVitalAlerts claims a reminder_log entry per breach but does not notify family when not opted in', async () => {
  const db = await seededDb();
  try {
    await run(db, `INSERT INTO users (id, email, timezone) VALUES (1, 'a@example.test', 'Australia/Sydney')`); // vital_alerts_enabled defaults to 0
    await run(db, `INSERT INTO family_contacts (user_id, name, email, notify_email) VALUES (1, 'Alex', 'alex@example.test', 1)`);

    const result = await checkVitalAlerts(db, 1, { heart_rate: 135 }, new Date('2026-08-17T00:30:00Z'));
    assert.equal(result.newBreaches.length, 1);
    assert.equal(result.newBreaches[0].severity, 'critical');

    const claims = await all(db, `SELECT * FROM reminder_log WHERE reminder_type LIKE 'vital_alert:%'`);
    assert.equal(claims.length, 1);
    assert.equal(claims[0].reminder_type, 'vital_alert:heart_rate:critical');

    // Not opted in -- no family notification attempt should have been logged.
    assert.equal((await all(db, `SELECT * FROM notification_log`)).length, 0);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});

test('checkVitalAlerts notifies family when opted in and an eligible contact exists', async () => {
  const db = await seededDb();
  try {
    await run(db, `INSERT INTO users (id, email, name, timezone, vital_alerts_enabled) VALUES (1, 'a@example.test', 'Pat', 'Australia/Sydney', 1)`);
    await run(db, `INSERT INTO family_contacts (user_id, name, email, notify_email) VALUES (1, 'Alex', 'alex@example.test', 1)`);

    await checkVitalAlerts(db, 1, { spo2: 88 }, new Date('2026-08-17T00:30:00Z'));

    const notifications = await all(db, `SELECT * FROM notification_log`);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, 'email');
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});

test('checkVitalAlerts does not double-claim the same metric/severity twice the same day, but a new severity is new', async () => {
  const db = await seededDb();
  try {
    await run(db, `INSERT INTO users (id, email, timezone) VALUES (1, 'a@example.test', 'Australia/Sydney')`);
    const now = new Date('2026-08-17T00:30:00Z');

    const first = await checkVitalAlerts(db, 1, { heart_rate: 105 }, now); // warning
    assert.equal(first.newBreaches.length, 1);

    const second = await checkVitalAlerts(db, 1, { heart_rate: 108 }, now); // still warning, same day
    assert.equal(second.breaches.length, 1); // still evaluated as a breach...
    assert.equal(second.newBreaches.length, 0); // ...but already claimed today, so not re-notified

    const third = await checkVitalAlerts(db, 1, { heart_rate: 140 }, now); // now critical -- new information
    assert.equal(third.newBreaches.length, 1);
    assert.equal(third.newBreaches[0].severity, 'critical');

    const claims = await all(db, `SELECT reminder_type FROM reminder_log WHERE reminder_type LIKE 'vital_alert:%' ORDER BY reminder_type`);
    assert.deepEqual(claims.map((c) => c.reminder_type), ['vital_alert:heart_rate:critical', 'vital_alert:heart_rate:warning']);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});

test('checkVitalAlerts handles an unknown user gracefully', async () => {
  const db = await seededDb();
  try {
    const result = await checkVitalAlerts(db, 999, { heart_rate: 140 }, new Date());
    assert.equal(result.newBreaches.length, 0);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});
