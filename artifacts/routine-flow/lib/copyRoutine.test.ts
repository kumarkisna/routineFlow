import assert from 'node:assert/strict';
import test from 'node:test';
import { copyRoutineSteps } from './copyRoutine';
import type { Routine } from '../types/routines';

const routine: Routine = {
  id: 'morning',
  title: 'Morning reset',
  subtitle: 'Start the day calmly',
  category: 'Wellness',
  icon: 'sun',
  tone: 'sage',
  createdAt: '2026-01-01T00:00:00.000Z',
  skillIds: ['routine-skill'],
  steps: [
    {
      id: 'breathe',
      title: 'Breathe slowly',
      description: 'Take a calming breath',
      additionalDetails: ['Relax your shoulders'],
      detailSpeech: [true, false],
      detailHtml: ['<p>Calm instruction</p>', '<p>Extra note</p>'],
      detailAttachments: [[{
        id: 'image',
        name: 'breathing.png',
        mimeType: 'image/png',
        kind: 'image',
        contentBase64: 'AQID',
      }]],
      skillIds: ['step-skill'],
      hidden: true,
      durationSeconds: 75,
    },
    { id: 'stretch', title: 'Stretch gently', durationSeconds: 120 },
  ],
};

test('copies ordered steps with fresh IDs and independent nested data', () => {
  const ids = ['breathe', 'already-used', 'copy-1', 'copy-2'];
  const copied = copyRoutineSteps(routine, [{ id: 'already-used', title: 'Existing', durationSeconds: 1 }], () =>
    ids.shift()!,
  );

  assert.deepEqual(copied.map(step => step.title), ['Breathe slowly', 'Stretch gently']);
  assert.deepEqual(copied.map(step => step.id), ['copy-1', 'copy-2']);
  assert.equal(copied[0].durationSeconds, 75);
  assert.equal(copied[0].hidden, true);
  assert.deepEqual(copied[0].skillIds, ['step-skill']);
  assert.deepEqual(copied[0].detailSpeech, [true, false]);
  assert.deepEqual(copied[0].detailHtml, ['<p>Calm instruction</p>', '<p>Extra note</p>']);
  assert.deepEqual(copied[0].detailAttachments?.[0]?.[0], routine.steps[0].detailAttachments?.[0]?.[0]);
  assert.notEqual(copied[0].additionalDetails, routine.steps[0].additionalDetails);
  assert.notEqual(copied[0].detailSpeech, routine.steps[0].detailSpeech);
  assert.notEqual(copied[0].detailHtml, routine.steps[0].detailHtml);
  assert.notEqual(copied[0].skillIds, routine.steps[0].skillIds);
  assert.notEqual(copied[0].detailAttachments?.[0], routine.steps[0].detailAttachments?.[0]);
  assert.notEqual(copied[0].detailAttachments?.[0]?.[0], routine.steps[0].detailAttachments?.[0]?.[0]);

  copied[0].additionalDetails?.push('Copied-only detail');
  copied[0].detailAttachments?.[0]?.[0] && (copied[0].detailAttachments[0][0].name = 'renamed.png');
  assert.deepEqual(routine.steps[0].additionalDetails, ['Relax your shoulders']);
  assert.equal(routine.steps[0].detailAttachments?.[0]?.[0]?.name, 'breathing.png');
});
