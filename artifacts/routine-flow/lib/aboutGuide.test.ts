import assert from 'node:assert/strict';
import test from 'node:test';
import { aboutGuideSections } from './aboutGuide';

test('About guide sections have unique jump IDs and complete visible content', () => {
  const ids = aboutGuideSections.map(section => section.id);

  assert.equal(new Set(ids).size, ids.length, 'each guide section needs its own jump target');
  for (const section of aboutGuideSections) {
    assert.ok(section.title.trim(), `${section.id} needs a topic title`);
    assert.ok(section.steps.length > 0, `${section.id} needs instructions`);
    assert.ok(section.steps.every(step => step.trim()), `${section.id} has an empty instruction`);
  }
});
