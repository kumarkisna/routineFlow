import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SPEECH_LINE_GAP_SECONDS,
  isValidSpeechLineGapSeconds,
  parsePlaylistSpeechLineGapParam,
  resolveSpeechLineGapSeconds,
} from './speechGap';

test('speech line gaps use a validated seconds value and resolve playlist, routine, then profile', () => {
  assert.equal(DEFAULT_SPEECH_LINE_GAP_SECONDS, 0.5);
  assert.equal(isValidSpeechLineGapSeconds(0), true);
  assert.equal(isValidSpeechLineGapSeconds(5), true);
  assert.equal(isValidSpeechLineGapSeconds(-0.1), false);
  assert.equal(isValidSpeechLineGapSeconds(5.01), false);
  assert.equal(isValidSpeechLineGapSeconds(Number.NaN), false);
  assert.equal(resolveSpeechLineGapSeconds(1, 2, 3), 1);
  assert.equal(resolveSpeechLineGapSeconds(undefined, 2, 3), 2);
  assert.equal(resolveSpeechLineGapSeconds(undefined, undefined, 3), 3);
  assert.equal(resolveSpeechLineGapSeconds(5.25, 0.75, 0.25), 0.75);
  assert.equal(resolveSpeechLineGapSeconds(undefined, 5.25, 0.25), 0.25);
});

test('playlist run parameters distinguish an override from profile inheritance', () => {
  assert.equal(parsePlaylistSpeechLineGapParam('1.25'), 1.25);
  assert.equal(parsePlaylistSpeechLineGapParam('profile'), undefined);
  assert.equal(parsePlaylistSpeechLineGapParam(undefined), undefined);
  assert.equal(parsePlaylistSpeechLineGapParam('6'), undefined);
});
