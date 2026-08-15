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
  throw new Error('isolated auth backend did not start');
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

test('account persistence repro distinguishes duplicate registration, wrong password, and ephemeral database loss', { timeout: 30000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agecare-auth-persistence-'));
  const dbPath = path.join(directory, 'test.db');
  const replacementPath = path.join(directory, 'replacement.db');
  const secret = 'isolated-auth-persistence-test-secret';
  const first = await startServer(dbPath, 3220, secret);

  try {
    const registration = await jsonRequest(first.baseUrl, '/auth/register', {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Test Caregiver', email: 'Caregiver@Example.Test', password: 'correct-password' }),
    });
    assert.equal(registration.status, 201);

    const duplicate = await jsonRequest(first.baseUrl, '/auth/register', {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Test Caregiver', email: ' caregiver@example.test ', password: 'another-password' }),
    });
    assert.equal(duplicate.status, 409);

    const wrongPassword = await jsonRequest(first.baseUrl, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'CAREGIVER@EXAMPLE.TEST', password: 'wrong-password' }),
    });
    assert.equal(wrongPassword.status, 401);

    const validLogin = await jsonRequest(first.baseUrl, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ' CAREGIVER@EXAMPLE.TEST ', password: 'correct-password' }),
    });
    assert.equal(validLogin.status, 200);
    assert.ok(validLogin.body.token);
  } finally {
    await stopServer(first.server);
  }

  await fs.copyFile(dbPath, replacementPath);
  await fs.rm(dbPath);
  const second = await startServer(dbPath, 3221, secret);
  try {
    const afterReplacement = await jsonRequest(second.baseUrl, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'caregiver@example.test', password: 'correct-password' }),
    });
    assert.equal(afterReplacement.status, 401);
    assert.equal(afterReplacement.body.error, 'Invalid email or password');
  } finally {
    await stopServer(second.server);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
