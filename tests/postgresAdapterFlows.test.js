const test = require('node:test');
const assert = require('node:assert/strict');
const { newDb } = require('pg-mem');
const bcrypt = require('bcrypt');
const { PostgresCompatDatabase } = require('../database/postgresAdapter');
const { getPostgresHealth } = require('../db');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(error) {
      if (error) reject(error);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
}

test('PostgreSQL adapter preserves account roles, Family Circle links, and consent grants', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const db = new PostgresCompatDatabase('postgres://unused', new Pool());

  await run(db, 'CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL)');
  await run(db, 'CREATE TABLE family_contacts (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, linked_user_id INTEGER, relationship TEXT)');
  await run(db, 'CREATE TABLE care_access_grants (id SERIAL PRIMARY KEY, patient_user_id INTEGER NOT NULL, caregiver_user_id INTEGER NOT NULL, status TEXT NOT NULL)');

  const patient = await run(db, 'INSERT INTO users (email, role) VALUES (?, ?)', ['patient@example.test', 'patient']);
  const caregiver = await run(db, 'INSERT INTO users (email, role) VALUES (?, ?)', ['caregiver@example.test', 'caregiver']);
  assert.ok(patient.id);
  assert.ok(caregiver.id);

  const caregiverAccount = await get(db, 'SELECT email, role FROM users WHERE id = ?', [caregiver.id]);
  assert.deepEqual(caregiverAccount, { email: 'caregiver@example.test', role: 'caregiver' });

  await run(db, 'INSERT INTO family_contacts (user_id, linked_user_id, relationship) VALUES (?, ?, ?)', [caregiver.id, patient.id, 'Daughter']);
  const links = await all(db, 'SELECT linked_user_id, relationship FROM family_contacts WHERE user_id = ?', [caregiver.id]);
  assert.deepEqual(links, [{ linked_user_id: patient.id, relationship: 'Daughter' }]);

  await run(db, "INSERT INTO care_access_grants (patient_user_id, caregiver_user_id, status) VALUES (?, ?, 'pending')", [patient.id, caregiver.id]);
  const grant = await get(db, 'SELECT status FROM care_access_grants WHERE patient_user_id = ? AND caregiver_user_id = ?', [patient.id, caregiver.id]);
  assert.equal(grant.status, 'pending');

  await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
});

test('PostgreSQL adapter supports registration, login, and authenticated role lookup queries', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const db = new PostgresCompatDatabase('postgres://unused', new Pool());
  await run(db, 'CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT NOT NULL, password_hash TEXT NOT NULL, name TEXT, role TEXT NOT NULL)');

  const email = 'caregiver@example.test';
  const existing = await get(db, 'SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
  assert.equal(existing, undefined);

  const passwordHash = await bcrypt.hash('safe-test-password', 4);
  const created = await run(db, 'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)', [email, passwordHash, 'Caregiver', 'caregiver']);
  const loginUser = await get(db, 'SELECT * FROM users WHERE LOWER(email) = LOWER(?)', ['CAREGIVER@EXAMPLE.TEST']);
  assert.equal(await bcrypt.compare('safe-test-password', loginUser.password_hash), true);

  const sessionUser = await get(db, 'SELECT id, email, name, role FROM users WHERE id = ?', [created.id]);
  assert.deepEqual(sessionUser, { id: created.id, email, name: 'Caregiver', role: 'caregiver' });
  await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
});

test('PostgreSQL adapter data survives a fresh connection lifecycle and returns the ready health contract', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const first = new PostgresCompatDatabase('postgres://unused', new Pool());
  await run(first, 'CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL)');
  await run(first, 'CREATE TABLE family_contacts (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, linked_user_id INTEGER)');
  await run(first, 'CREATE TABLE care_access_grants (id SERIAL PRIMARY KEY, patient_user_id INTEGER NOT NULL, caregiver_user_id INTEGER NOT NULL, status TEXT NOT NULL)');
  const patient = await run(first, 'INSERT INTO users (email, role) VALUES (?, ?)', ['patient@example.test', 'patient']);
  const caregiver = await run(first, 'INSERT INTO users (email, role) VALUES (?, ?)', ['caregiver@example.test', 'caregiver']);
  await run(first, 'INSERT INTO family_contacts (user_id, linked_user_id) VALUES (?, ?)', [caregiver.id, patient.id]);
  await run(first, "INSERT INTO care_access_grants (patient_user_id, caregiver_user_id, status) VALUES (?, ?, 'active')", [patient.id, caregiver.id]);
  await new Promise((resolve, reject) => first.close((error) => error ? reject(error) : resolve()));

  const second = new PostgresCompatDatabase('postgres://unused', new Pool());
  const link = await get(second, 'SELECT linked_user_id FROM family_contacts WHERE user_id = ?', [caregiver.id]);
  const grant = await get(second, 'SELECT status FROM care_access_grants WHERE patient_user_id = ? AND caregiver_user_id = ?', [patient.id, caregiver.id]);
  assert.equal(link.linked_user_id, patient.id);
  assert.equal(grant.status, 'active');
  assert.deepEqual(await getPostgresHealth(second.pool), {
    driver: 'postgres', persistentStorageConfigured: true, configuredPath: false, connection: 'ready',
  });
  await new Promise((resolve, reject) => second.close((error) => error ? reject(error) : resolve()));
});
