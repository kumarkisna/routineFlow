import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_BACKUP_EMAIL_MESSAGE,
  DEFAULT_BACKUP_EMAIL_SUBJECT,
  isValidEmailAddress,
  maskEmailAddress,
  normalizeBackupEmailMessage,
  normalizeBackupEmailSubject,
  normalizeOptionalEmail,
} from './personEmail';

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

test('backup subject and message can be customized with safe defaults and length limits', () => {
  assert.equal(normalizeBackupEmailSubject('  Family backup\r\nOctober  '), 'Family backup October');
  assert.equal(normalizeBackupEmailSubject('  '), DEFAULT_BACKUP_EMAIL_SUBJECT);
  assert.equal(normalizeBackupEmailMessage(undefined), DEFAULT_BACKUP_EMAIL_MESSAGE);
  assert.equal(normalizeBackupEmailMessage(''), '');
  assert.throws(() => normalizeBackupEmailSubject('s'.repeat(181)), /180 characters or fewer/);
  assert.throws(() => normalizeBackupEmailMessage('m'.repeat(2001)), /2000 characters or fewer/);
});