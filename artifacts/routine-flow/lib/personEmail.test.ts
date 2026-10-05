import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidEmailAddress, maskEmailAddress, normalizeOptionalEmail } from './personEmail';

test('person email addresses are validated and normalized', () => {
  assert.equal(isValidEmailAddress('  backup@example.com  '), true);
  assert.equal(normalizeOptionalEmail('  backup@example.com  ', 'recipient'), 'backup@example.com');
  assert.equal(normalizeOptionalEmail('', 'sender'), undefined);
  assert.throws(() => normalizeOptionalEmail('not-an-address', 'sender'), /valid sender email address/);
});

test('person email display masks the local part', () => {
  assert.equal(maskEmailAddress('backup@example.com'), 'b***@example.com');
  assert.equal(maskEmailAddress('invalid'), 'configured email');
});