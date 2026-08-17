const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { statements } = require('../migrations/notifications');

function exec(db, sql) {
  return new Promise((resolve, reject) => db.exec(sql, (error) => error ? reject(error) : resolve()));
}

function all(db, sql) {
  return new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));
}

test('notifications migration adds reminder preference columns and the subscription/dedupe tables', async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    await exec(db, `CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL)`);
    for (const migration of statements) await exec(db, migration.sql);

    const objects = await all(db, `SELECT name FROM sqlite_master WHERE type IN ('table', 'index')`);
    const names = new Set(objects.map((object) => object.name));
    for (const required of ['push_subscriptions', 'reminder_log', 'idx_push_subscriptions_user', 'idx_reminder_log_lookup']) {
      assert.equal(names.has(required), true, `${required} should exist`);
    }

    const userColumns = new Set((await all(db, 'PRAGMA table_info(users)')).map((column) => column.name));
    for (const required of ['timezone', 'checkin_reminder_time', 'checkin_reminder_enabled', 'medication_reminders_enabled']) {
      assert.equal(userColumns.has(required), true, `users.${required} should exist`);
    }

    const subscriptionColumns = new Set((await all(db, 'PRAGMA table_info(push_subscriptions)')).map((column) => column.name));
    for (const required of ['user_id', 'endpoint', 'p256dh', 'auth']) {
      assert.equal(subscriptionColumns.has(required), true, `push_subscriptions.${required} should exist`);
    }
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});

test('reminder_log rejects a second reminder of the same type for the same user and day', async () => {
  const db = new sqlite3.Database(':memory:');
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, (error) => error ? reject(error) : resolve()));
  try {
    await exec(db, `CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL)`);
    for (const migration of statements) await exec(db, migration.sql);
    await run('INSERT INTO users (id, email) VALUES (1, ?)', ['patient@example.test']);

    await run('INSERT INTO reminder_log (user_id, reminder_type, reference_id, reminder_date) VALUES (1, ?, 0, ?)', ['checkin', '2026-08-17']);
    await assert.rejects(
      run('INSERT INTO reminder_log (user_id, reminder_type, reference_id, reminder_date) VALUES (1, ?, 0, ?)', ['checkin', '2026-08-17']),
      /UNIQUE constraint failed/,
    );
    // A different day is a distinct reminder and must be allowed.
    await run('INSERT INTO reminder_log (user_id, reminder_type, reference_id, reminder_date) VALUES (1, ?, 0, ?)', ['checkin', '2026-08-18']);
    // A different medication (reference_id) on the same day is also distinct.
    await run('INSERT INTO reminder_log (user_id, reminder_type, reference_id, reminder_date) VALUES (1, ?, 7, ?)', ['medication', '2026-08-17']);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});
