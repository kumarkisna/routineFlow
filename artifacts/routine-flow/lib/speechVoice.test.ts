/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSpeechVoiceId } from './speechVoice';

test('voice selection falls back to the device default when no matching voice is available', () => {
  const available = new Set(['en-us-default', 'en-gb-enhanced']);
  assert.equal(resolveSpeechVoiceId(null, available), undefined);
  assert.equal(resolveSpeechVoiceId('missing-from-this-device', available), undefined);
  assert.equal(resolveSpeechVoiceId('en-gb-enhanced', available), 'en-gb-enhanced');
});
