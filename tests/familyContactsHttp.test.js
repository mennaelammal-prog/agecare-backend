const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function onRun(error) {
    if (error) return reject(error);
    resolve({ id: this.lastID, changes: this.changes });
  }));
}

async function request(baseUrl, pathName, token) {
  const response = await fetch(`${baseUrl}${pathName}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json() };
}

test('Family Circle loads contacts and linked-patient records from a migrated database', { timeout: 30000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agecare-family-circle-'));
  const dbPath = path.join(directory, 'test.db');
  const port = 3218;
  const secret = 'isolated-family-circle-test-secret';
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, AGECARE_DB_PATH: dbPath, PORT: String(port), JWT_SECRET: secret, NODE_ENV: 'test' },
    stdio: 'ignore',
  });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 130; attempt += 1) {
      await wait(150);
      try { if ((await fetch(`${baseUrl}/health`)).ok) { ready = true; break; } } catch { /* server is booting */ }
    }
      assert.equal(ready, true, 'isolated backend should start');
      const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
      assert.equal(health.database.persistentStorageConfigured, true);
      assert.equal(Object.prototype.hasOwnProperty.call(health.database, 'path'), false);

      const db = new sqlite3.Database(dbPath);
    try {
      const caregiver = await run(db, "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)", ['caregiver@example.test', 'hash', 'Caregiver', 'caregiver']);
      const patient = await run(db, "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)", ['patient@example.test', 'hash', 'Patient']);
      const daughter = await run(db, "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)", ['daughter@example.test', 'hash', 'Daughter']);
      await run(db, "INSERT INTO family_contacts (user_id, name, relationship, email, is_active) VALUES (?, ?, ?, ?, 1)", [caregiver.id, 'Support Person', 'Daughter', 'support@example.test']);
      await run(db, "INSERT INTO family_contacts (user_id, name, relationship, linked_user_id, is_active) VALUES (?, ?, ?, ?, 1)", [caregiver.id, 'Patient', 'Mother', patient.id]);
      const token = jwt.sign({ userId: caregiver.id }, secret);

      const contacts = await request(baseUrl, '/family', token);
      assert.equal(contacts.status, 200);
      assert.equal(contacts.body.count, 2);

      const patientToken = jwt.sign({ userId: patient.id }, secret);
      const deniedLookup = await request(baseUrl, '/family/link/lookup?patient_email=daughter%40example.test', patientToken);
      assert.equal(deniedLookup.status, 403);
      assert.match(deniedLookup.body.error, /caregiver account/i);

      const lookupResponse = await request(baseUrl, '/family/link/lookup?patient_email=%20DAUGHTER%40EXAMPLE.TEST%20', token);
      assert.equal(lookupResponse.status, 200);
      assert.deepEqual(lookupResponse.body.patient, { email: 'daughter@example.test', name: 'Daughter' });

      const selfLookupResponse = await request(baseUrl, '/family/link/lookup?patient_email=CAREGIVER%40EXAMPLE.TEST', token);
      assert.equal(selfLookupResponse.status, 400);
      assert.match(selfLookupResponse.body.error, /patient’s registered email/i);

      const selfLinkResponse = await fetch(`${baseUrl}/family/link/link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_email: 'CAREGIVER@EXAMPLE.TEST', relationship: 'Daughter' }),
      });
      const selfLinkBody = await selfLinkResponse.json();
      assert.equal(selfLinkResponse.status, 400);
      assert.match(selfLinkBody.error, /patient’s registered email/i);

      const linkResponse = await fetch(`${baseUrl}/family/link/link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_email: '  DAUGHTER@EXAMPLE.TEST  ', relationship: 'Daughter' }),
      });
      const linkBody = await linkResponse.json();
      assert.equal(linkResponse.status, 200);
      assert.equal(linkBody.patient.id, daughter.id);
      const linked = await request(baseUrl, '/family/link/linked', token);
      assert.equal(linked.status, 200);
      assert.equal(linked.body.count, 2);
      assert.equal(linked.body.data.some((item) => item.patient_name === 'Patient'), true);
      assert.equal(linked.body.data.some((item) => item.name === 'Support Person'), false);

      const patientLink = linked.body.data.find((item) => item.patient_name === 'Patient');
      const unlinkResponse = await fetch(`${baseUrl}/family/link/${patientLink.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const unlinkBody = await unlinkResponse.json();
      assert.equal(unlinkResponse.status, 200);
      assert.equal(unlinkBody.success, true);

      const linkedAfterRemoval = await request(baseUrl, '/family/link/linked', token);
      assert.equal(linkedAfterRemoval.status, 200);
      assert.equal(linkedAfterRemoval.body.count, 1);
      assert.equal(linkedAfterRemoval.body.data.some((item) => item.patient_name === 'Patient'), false);
    } finally {
      await new Promise((resolve) => db.close(resolve));
    }
  } finally {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
