const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const net = require('node:net');
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
  for (let attempt = 0; attempt < 200; attempt += 1) {
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

test('SOS trigger responds immediately even when the email provider never answers', { timeout: 30000 }, async () => {
  // Reproduces the real production incident this test guards against: the
  // resident pressed "I need help" and the request hung with no response
  // at all, because processNotification -> sendEmail was awaited directly
  // in the SOS request path with no bound on how long a stuck SMTP
  // connection could take (nodemailer's own defaults allow minutes). This
  // spins up a bare TCP listener that accepts the connection but never
  // sends an SMTP greeting -- as unresponsive as a mail server gets -- and
  // asserts the SOS response comes back quickly anyway.
  const stuckSmtp = net.createServer((socket) => {
    socket.on('error', () => {}); // never greets; just let it sit there.
  });
  await new Promise((resolve) => stuckSmtp.listen(0, '127.0.0.1', resolve));
  const stuckPort = stuckSmtp.address().port;

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agecare-sos-slow-'));
  const dbPath = path.join(directory, 'test.db');
  const port = 3243;
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      AGECARE_DB_PATH: dbPath,
      PORT: String(port),
      JWT_SECRET: 'isolated-sos-slow-test-secret',
      NODE_ENV: 'test',
      EMAIL_HOST: '127.0.0.1',
      EMAIL_PORT: String(stuckPort),
      EMAIL_SECURE: 'false',
      EMAIL_USER: 'test',
      EMAIL_PASS: 'test',
    },
    stdio: 'ignore',
  });
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      await wait(100);
      try {
        if ((await fetch(`${baseUrl}/health`)).ok) { ready = true; break; }
      } catch {
        // Server is still booting.
      }
    }
    assert.equal(ready, true, 'isolated backend should start');

    const registration = await jsonRequest(baseUrl, '/auth/register', {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Slow SMTP Test', email: 'slow-smtp@example.test', password: 'correct-password' }),
    });
    const token = registration.body.token;
    const auth = { Authorization: `Bearer ${token}` };

    await jsonRequest(baseUrl, '/family', {
      method: 'POST', headers: auth,
      body: JSON.stringify({ name: 'Alex', relationship: 'Daughter', email: 'alex@example.test' }),
    });

    const started = Date.now();
    const triggered = await jsonRequest(baseUrl, '/sos', { method: 'POST', headers: auth });
    const elapsedMs = Date.now() - started;

    assert.equal(triggered.status, 201);
    assert.equal(triggered.body.contactsNotified, 1);
    // nodemailer's own connection/greeting timeout on this stuck server is
    // 10s (services/notification.js); comfortably under that is proof the
    // response isn't waiting on the send at all, not just that it's fast
    // this one time.
    assert.ok(elapsedMs < 3000, `expected SOS to respond well under the SMTP timeout, took ${elapsedMs}ms`);
  } finally {
    await stopServer(server);
    await new Promise((resolve) => stuckSmtp.close(resolve));
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
