import assert from 'node:assert/strict';
import test from 'node:test';
import type { Routine, RoutineStep } from '../types/routines';
import { copyRoutineSteps } from './copyRoutine';
import { buildStepDetailFields, createStepDetailDraft } from './stepDetailDraft';
import { serializeStepDetailEditorSave } from './stepDetailEditor';

test('native rich editor saves formatted HTML and reopens it with readable text', () => {
  const editedHtml = '<h2>Copied watering plan</h2><ul><li>Water each bed</li><li>Check the soil</li></ul>';
  const saved = serializeStepDetailEditorSave('native', 'stale plain-text draft', editedHtml);
  const source: RoutineStep = {
    id: 'source-step',
    title: 'Water the herbs',
    description: 'Original instructions',
    detailHtml: ['<p>Original formatted instructions</p>'],
    durationSeconds: 60,
  };
  const sourceRoutine: Routine = {
    id: 'garden-flow',
    title: 'Garden flow',
    subtitle: '',
    icon: 'leaf',
    tone: 'sage',
    createdAt: '2026-01-01T00:00:00.000Z',
    steps: [source],
  };
  const [copiedSource] = copyRoutineSteps(sourceRoutine, [], () => 'copied-step');
  const copied: RoutineStep = {
    ...copiedSource,
    ...buildStepDetailFields({
      ...createStepDetailDraft(copiedSource),
      description: saved.text,
      detailHtml: [saved.html],
    }),
  };
  const reopened = createStepDetailDraft(JSON.parse(JSON.stringify(copied)) as RoutineStep);

  assert.equal(saved.html, editedHtml);
  assert.match(saved.text, /Copied watering plan/);
  assert.match(saved.text, /Water each bed/);
  assert.deepEqual(reopened.detailHtml, [editedHtml]);
  assert.equal(reopened.description, saved.text);
  assert.notEqual(copied.detailHtml, source.detailHtml);
  assert.deepEqual(source.detailHtml, ['<p>Original formatted instructions</p>']);
  assert.equal(source.description, 'Original instructions');
});
