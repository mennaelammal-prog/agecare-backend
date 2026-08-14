const test = require('node:test');
const assert = require('node:assert/strict');
const { isActiveGrantForScope, parseScopes } = require('../services/careAccess');

test('parseScopes safely handles valid and malformed scope JSON', () => {
  assert.deepEqual(parseScopes('["checkins:read"]'), ['checkins:read']);
  assert.deepEqual(parseScopes('not-json'), []);
  assert.deepEqual(parseScopes({ invalid: true }), []);
});

test('active grant requires exact caregiver, active state, unexpired access, and matching scope', () => {
  const grant = { caregiver_user_id: 7, status: 'active', granted_scopes: '["checkins:read"]', expires_at: '2027-01-01T00:00:00.000Z' };
  assert.equal(isActiveGrantForScope(grant, 7, 'checkins:read', new Date('2026-01-01')), true);
  assert.equal(isActiveGrantForScope(grant, 8, 'checkins:read', new Date('2026-01-01')), false);
  assert.equal(isActiveGrantForScope({ ...grant, status: 'pending' }, 7, 'checkins:read', new Date('2026-01-01')), false);
  assert.equal(isActiveGrantForScope({ ...grant, granted_scopes: '[]' }, 7, 'checkins:read', new Date('2026-01-01')), false);
  assert.equal(isActiveGrantForScope({ ...grant, expires_at: '2025-01-01T00:00:00.000Z' }, 7, 'checkins:read', new Date('2026-01-01')), false);
});
