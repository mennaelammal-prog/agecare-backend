const test = require('node:test');
const assert = require('node:assert/strict');
const { careAccessRequestEmail } = require('../services/notification');

test('consent-request email is minimal and excludes patient care details', () => {
  const message = careAccessRequestEmail();
  assert.equal(message.subject, 'AgeCare care-access request');
  assert.match(message.body, /Family Circle/);
  assert.match(message.body, /does not include any care-record details/);
  assert.doesNotMatch(message.body, /mood|energy|pain|medication|appointment|vital/i);
});
