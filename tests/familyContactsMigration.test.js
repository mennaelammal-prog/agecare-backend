const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { statements } = require('../migrations/familyContacts');

function exec(db, sql) {
  return new Promise((resolve, reject) => db.exec(sql, (error) => error ? reject(error) : resolve()));
}

function all(db, sql) {
  return new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));
}

test('family-contact migration repairs an older contact table for list and linked-patient queries', async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    await exec(db, `CREATE TABLE family_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      relationship TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    for (const migration of statements) {
      try { await exec(db, migration.sql); } catch (error) {
        assert.match(error.message, /duplicate column name/i);
      }
    }
    const columns = await all(db, 'PRAGMA table_info(family_contacts)');
    const names = new Set(columns.map((column) => column.name));
    for (const required of ['email', 'notify_email', 'notify_sms', 'is_active', 'linked_user_id']) {
      assert.equal(names.has(required), true, `${required} should exist`);
    }
    await exec(db, `INSERT INTO family_contacts (user_id, name, relationship, is_active, linked_user_id) VALUES (1, 'Caregiver', 'Daughter', 1, NULL)`);
    const contacts = await all(db, 'SELECT * FROM family_contacts WHERE user_id = 1 AND is_active = 1');
    assert.equal(contacts.length, 1);
    const linked = await all(db, 'SELECT linked_user_id FROM family_contacts WHERE user_id = 1');
    assert.equal(linked.length, 1);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
});
