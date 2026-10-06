import assert from 'node:assert/strict';
import test from 'node:test';
import { getSpokenStepDetails, type RoutineStep } from '../types/routines';
import {
  addAdditionalStepDetail,
  buildStepDetailFields,
  createStepDetailDraft,
  removeAdditionalStepDetail,
  setStepDetailSpeech,
  updateAdditionalStepDetail,
} from './stepDetailDraft';

test('detail speech settings stay with their text through add, remove, save, and reopen', () => {
  const originalStep: RoutineStep = {
    id: 'practice',
    title: 'Practice',
    description: ' Main detail ',
    additionalDetails: ['Keep muted', 'Remove me', 'Stay enabled'],
    durationSeconds: 60,
  };

  let draft = createStepDetailDraft(originalStep);
  draft = setStepDetailSpeech(draft, 1, false);
  draft = addAdditionalStepDetail(draft);
  draft = addAdditionalStepDetail(draft);
  draft = updateAdditionalStepDetail(draft, 3, ' New last detail ');
  draft = removeAdditionalStepDetail(draft, 1);
  draft = removeAdditionalStepDetail(draft, 3);
  draft = addAdditionalStepDetail(draft);

  const savedStep = JSON.parse(JSON.stringify({
    ...originalStep,
    ...buildStepDetailFields(draft),
  })) as RoutineStep;
  const reopenedDraft = createStepDetailDraft(savedStep);

  assert.deepEqual(savedStep.additionalDetails, ['Keep muted', 'Stay enabled', 'New last detail']);
  assert.deepEqual(savedStep.detailSpeech, [true, false, true, true]);
  assert.deepEqual(reopenedDraft, {
    description: 'Main detail',
    additionalDetails: ['Keep muted', 'Stay enabled', 'New last detail'],
    detailSpeech: [true, false, true, true],
  });
  assert.deepEqual(getSpokenStepDetails(savedStep), [
    'Main detail',
    'Stay enabled',
    'New last detail',
  ]);
});
