import assert from 'node:assert/strict';
import test from 'node:test';
import { splitStepDetails } from './stepDetailLinks';

test('recognizes links within ordinary step details and keeps surrounding punctuation', () => {
  const details = 'Read (https://example.com/guide?q=1), then www.docs.org.';
  const segments = splitStepDetails(details);
  assert.equal(segments.map((segment) => segment.text).join(''), details);
  assert.deepEqual(segments.filter((segment) => segment.url), [
    { text: 'https://example.com/guide?q=1', url: 'https://example.com/guide?q=1' },
    { text: 'www.docs.org', url: 'https://www.docs.org/' },
  ]);
});

test('keeps plain text and malformed links unchanged', () => {
  assert.deepEqual(splitStepDetails('No link here'), [{ text: 'No link here' }]);
  assert.deepEqual(splitStepDetails('Try https:// later'), [{ text: 'Try https:// later' }]);
});