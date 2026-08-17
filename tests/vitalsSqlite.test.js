const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer(dbPath, port, secret) {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, AGECARE_DB_PATH: dbPath, PORT: String(port), JWT_SECRET: secret, NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  const baseUrl = `http://127.0.0.1:${port}/api`;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await wait(100);
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return { server, baseUrl };
    } catch {
      // Server is still booting.
    }
  }
  server.kill('SIGTERM');
  throw new Error('isolated vitals backend did not start');
}

async function stopServer(server) {
  server.kill('SIGTERM');
  await new Promise((resolve) => server.once('exit', resolve));
}

async function jsonRequest(baseUrl, route, options) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  return { status: response.status, body: await response.json() };
}

// Regression test: database/schema.sql (SQLite) named this table "vitals",
// but routes/vitals.js has always queried "vital_signs" -- exactly what
// database/postgresSchema.js (production) already calls it. Every vitals
// call in SQLite mode (local dev, this test itself before the fix) failed
// outright with a 500 "no such table: vital_signs" -- unlike the other
// SQLite/Postgres schema-name mismatches found this session, this one was
// never silent; it's a hard failure on every request. Production on
// Postgres was never affected.
test('vitals can be recorded and retrieved against a real SQLite-backed server', { timeout: 30000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agecare-vitals-'));
  const dbPath = path.join(directory, 'test.db');
  const { server, baseUrl } = await startServer(dbPath, 3230, 'isolated-vitals-test-secret');

  try {
    const registration = await jsonRequest(baseUrl, '/auth/register', {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Vitals Test', email: 'vitals-test@example.test', password: 'correct-password' }),
    });
    assert.equal(registration.status, 201);
    const token = registration.body.token;

    const created = await jsonRequest(baseUrl, '/vitals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ heart_rate: 72, blood_pressure_sys: 120, blood_pressure_dia: 80, spo2: 97 }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.heart_rate, 72);

    const list = await jsonRequest(baseUrl, '/vitals', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(list.status, 200);
    assert.equal(list.body.count, 1);
    assert.equal(list.body.data[0].blood_pressure_sys, 120);

    const updated = await jsonRequest(baseUrl, `/vitals/${created.body.data.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ heart_rate: 75, blood_pressure_sys: 122, blood_pressure_dia: 81 }),
    });
    assert.equal(updated.status, 200);

    const removed = await jsonRequest(baseUrl, `/vitals/${created.body.data.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(removed.status, 200);
  } finally {
    await stopServer(server);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
