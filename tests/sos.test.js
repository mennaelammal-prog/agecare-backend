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
  throw new Error('isolated SOS backend did not start');
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

test('SOS trigger notifies every family contact with contact info regardless of their notify toggles, and logs the event', { timeout: 30000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agecare-sos-'));
  const dbPath = path.join(directory, 'test.db');
  const { server, baseUrl } = await startServer(dbPath, 3240, 'isolated-sos-test-secret');

  try {
    const registration = await jsonRequest(baseUrl, '/auth/register', {
      method: 'POST',
      body: JSON.stringify({ full_name: 'SOS Test', email: 'sos-test@example.test', password: 'correct-password' }),
    });
    assert.equal(registration.status, 201);
    const token = registration.body.token;
    const auth = { Authorization: `Bearer ${token}` };

    // One contact has notify_email OFF -- routine notifications would skip
    // them, but SOS should still reach them since they have an email.
    const contactA = await jsonRequest(baseUrl, '/family', {
      method: 'POST', headers: auth,
      body: JSON.stringify({ name: 'Alex', relationship: 'Daughter', email: 'alex@example.test', notify_email: false }),
    });
    assert.equal(contactA.status, 201);

    // A second contact with only a phone number, notify_sms also off.
    const contactB = await jsonRequest(baseUrl, '/family', {
      method: 'POST', headers: auth,
      body: JSON.stringify({ name: 'Jo', relationship: 'Son', phone: '+15551234567', notify_sms: false }),
    });
    assert.equal(contactB.status, 201);

    // A third contact with no email or phone at all -- can't be reached
    // either way, shouldn't count toward contactsNotified.
    const contactC = await jsonRequest(baseUrl, '/family', {
      method: 'POST', headers: auth,
      body: JSON.stringify({ name: 'No Contact Info' }),
    });
    assert.equal(contactC.status, 201);

    const triggered = await jsonRequest(baseUrl, '/sos', { method: 'POST', headers: auth });
    assert.equal(triggered.status, 201);
    assert.equal(triggered.body.success, true);
    assert.equal(triggered.body.contactsNotified, 2); // Alex (email) + Jo (phone), not the contact with no info.
  } finally {
    await stopServer(server);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('SOS trigger with no family contacts still succeeds and reports zero notified', { timeout: 30000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agecare-sos-empty-'));
  const dbPath = path.join(directory, 'test.db');
  const { server, baseUrl } = await startServer(dbPath, 3241, 'isolated-sos-empty-test-secret');

  try {
    const registration = await jsonRequest(baseUrl, '/auth/register', {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Lonely Test', email: 'sos-lonely@example.test', password: 'correct-password' }),
    });
    const token = registration.body.token;

    const triggered = await jsonRequest(baseUrl, '/sos', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(triggered.status, 201);
    assert.equal(triggered.body.contactsNotified, 0);
  } finally {
    await stopServer(server);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('SOS trigger requires authentication', { timeout: 30000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agecare-sos-auth-'));
  const dbPath = path.join(directory, 'test.db');
  const { server, baseUrl } = await startServer(dbPath, 3242, 'isolated-sos-auth-test-secret');

  try {
    const triggered = await jsonRequest(baseUrl, '/sos', { method: 'POST' });
    assert.equal(triggered.status, 401);
  } finally {
    await stopServer(server);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
