const test = require('node:test');
const assert = require('node:assert/strict');
const { careAccessRequestEmail, sendCareAccessRequestEmail } = require('../services/notification');

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
