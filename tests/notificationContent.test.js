const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { careAccessRequestEmail, sendCareAccessRequestEmail, processNotification } = require('../services/notification');

test('consent-request email is minimal and excludes patient care details', () => {
  const message = careAccessRequestEmail();
  assert.equal(message.subject, 'AgeCare care-access request');
  assert.match(message.body, /Family Circle/);
  assert.match(message.body, /does not include any care-record details/);
  assert.doesNotMatch(message.body, /mood|energy|pain|medication|appointment|vital/i);
});

test('consent requests remain in-app only unless external email is explicitly enabled', async () => {
  const result = await sendCareAccessRequestEmail({ to: 'patient@example.test' });
  assert.equal(result.success, false);
  assert.equal(result.disabled, true);
});

test('processNotification marks an unconfigured channel "skipped" and does not schedule a retry', async () => {
  // Regression test: this used to mark it "retrying" and schedule another
  // attempt via setTimeout(RETRY_DELAY) regardless of the reason for
  // failure -- pointless when the reason is "SMTP was never configured",
  // since nothing changes between now and then. Surfaced by a reminder
  // scheduler test whose in-memory db had already closed by the time the
  // stray retry timer fired.
  const db = new sqlite3.Database(':memory:');
  const exec = (sql) => new Promise((resolve, reject) => db.exec(sql, (error) => (error ? reject(error) : resolve())));
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function onRun(error) {
    if (error) return reject(error);
    resolve(this.lastID);
  }));
  const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row))));

  try {
    await exec(`CREATE TABLE family_contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, email TEXT, phone TEXT, notify_email INTEGER, notify_sms INTEGER)`);
    await exec(`CREATE TABLE notification_log (id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER, checkin_id INTEGER, type TEXT, status TEXT DEFAULT 'pending', retry_count INTEGER DEFAULT 0, error_message TEXT, sent_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    const contactId = await run(`INSERT INTO family_contacts (user_id, name, email, notify_email) VALUES (1, 'Alex', 'alex@example.test', 1)`);
    const logId = await run(`INSERT INTO notification_log (contact_id, type, status) VALUES (?, 'email', 'pending')`, [contactId]);

    await processNotification(logId, { db });

    const row = await get(`SELECT status, retry_count FROM notification_log WHERE id = ?`, [logId]);
    assert.equal(row.status, 'skipped');
    assert.equal(row.retry_count, 1); // Attempted once; not left "retrying" for a stray timer to pick up.
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});

test('processNotification respects notify_email by default, but force:true bypasses it (SOS-only)', async () => {
  const db = new sqlite3.Database(':memory:');
  const exec = (sql) => new Promise((resolve, reject) => db.exec(sql, (error) => (error ? reject(error) : resolve())));
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function onRun(error) {
    if (error) return reject(error);
    resolve(this.lastID);
  }));
  const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row))));

  try {
    await exec(`CREATE TABLE family_contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, email TEXT, phone TEXT, notify_email INTEGER, notify_sms INTEGER)`);
    await exec(`CREATE TABLE notification_log (id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER, checkin_id INTEGER, type TEXT, status TEXT DEFAULT 'pending', retry_count INTEGER DEFAULT 0, error_message TEXT, sent_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    // notify_email = 0 -- this contact has NOT opted into routine notifications.
    const contactId = await run(`INSERT INTO family_contacts (user_id, name, email, notify_email) VALUES (1, 'Alex', 'alex@example.test', 0)`);

    const routineLogId = await run(`INSERT INTO notification_log (contact_id, type, status) VALUES (?, 'email', 'pending')`, [contactId]);
    await processNotification(routineLogId, { db });
    const routineRow = await get(`SELECT status, retry_count FROM notification_log WHERE id = ?`, [routineLogId]);
    assert.equal(routineRow.status, 'pending'); // Never attempted -- returns before the status update at all.
    assert.equal(routineRow.retry_count, 0);

    const sosLogId = await run(`INSERT INTO notification_log (contact_id, type, status) VALUES (?, 'email', 'pending')`, [contactId]);
    await processNotification(sosLogId, { db, force: true });
    const sosRow = await get(`SELECT status, retry_count FROM notification_log WHERE id = ?`, [sosLogId]);
    // Got past the notify_email gate and was actually attempted (still
    // "skipped" here only because SMTP isn't configured in this test).
    assert.equal(sosRow.status, 'skipped');
    assert.equal(sosRow.retry_count, 1);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});
