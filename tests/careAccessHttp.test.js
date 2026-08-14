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

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
}

async function request(baseUrl, pathName, token, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: options.method || 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

test('patient-controlled care access requires approval and stops immediately after revocation', { timeout: 20000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agecare-care-access-'));
  const dbPath = path.join(directory, 'test.db');
  const port = 3217;
  const secret = 'isolated-care-access-test-secret';
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, AGECARE_DB_PATH: dbPath, PORT: String(port), JWT_SECRET: secret, NODE_ENV: 'test' },
    stdio: 'ignore',
  });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await wait(150);
      try {
        const health = await fetch(`${baseUrl}/health`);
        if (health.ok) { ready = true; break; }
      } catch { /* server is still booting */ }
    }
    assert.equal(ready, true, 'isolated backend should start');

    const db = new sqlite3.Database(dbPath);
    try {
      const patient = await run(db, "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)", ['patient@example.test', 'hash', 'Patient']);
      const caregiver = await run(db, "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)", ['caregiver@example.test', 'hash', 'Caregiver']);
      const unrelated = await run(db, "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)", ['unrelated@example.test', 'hash', 'Unrelated']);
      await run(db, "INSERT INTO checkins (user_id, mood, energy, pain, sleep_hours, notes, ai_response) VALUES (?, ?, ?, ?, ?, ?, ?)", [patient.id, 3, 2, 4, 6.5, 'Patient-authored note', 'Private assistant response']);

      const patientToken = jwt.sign({ userId: patient.id }, secret);
      const caregiverToken = jwt.sign({ userId: caregiver.id }, secret);
      const unrelatedToken = jwt.sign({ userId: unrelated.id }, secret);

      const noToken = await request(baseUrl, '/care-access/grants/1/checkins');
      assert.equal(noToken.status, 401);

      const created = await request(baseUrl, '/care-access/requests', caregiverToken, {
        method: 'POST', body: { patient_email: 'patient@example.test', relationship: 'Daughter', requested_scopes: ['checkins:read'] },
      });
      assert.equal(created.status, 202);

      const incoming = await request(baseUrl, '/care-access/incoming', patientToken);
      assert.equal(incoming.status, 200);
      assert.equal(incoming.body.count, 1);
      const grantId = incoming.body.data[0].id;

      const pendingRead = await request(baseUrl, `/care-access/grants/${grantId}/checkins`, caregiverToken);
      assert.equal(pendingRead.status, 403);

      const approved = await request(baseUrl, `/care-access/${grantId}/approve`, patientToken, {
        method: 'POST', body: { scopes: ['checkins:read'], expires_at: '2027-01-01T00:00:00.000Z' },
      });
      assert.equal(approved.status, 200);

      const wrongCaregiver = await request(baseUrl, `/care-access/grants/${grantId}/checkins`, unrelatedToken);
      assert.equal(wrongCaregiver.status, 403);

      const history = await request(baseUrl, `/care-access/grants/${grantId}/checkins?limit=100`, caregiverToken);
      assert.equal(history.status, 200);
      assert.equal(history.body.count, 1);
      assert.equal(history.body.data[0].notes, 'Patient-authored note');
      assert.equal(Object.hasOwn(history.body.data[0], 'ai_response'), false);

      const revoked = await request(baseUrl, `/care-access/${grantId}/revoke`, patientToken, { method: 'POST' });
      assert.equal(revoked.status, 200);
      const afterRevoke = await request(baseUrl, `/care-access/grants/${grantId}/checkins`, caregiverToken);
      assert.equal(afterRevoke.status, 403);

      const audit = await get(db, "SELECT COUNT(*) AS count FROM care_access_audit WHERE grant_id = ?", [grantId]);
      assert.equal(audit.count >= 4, true);
    } finally {
      await new Promise((resolve) => db.close(resolve));
    }
  } finally {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
