import assert from 'node:assert/strict';
import test from 'node:test';
import { getSpokenStepDetails, type Routine, type RoutineStep } from '../types/routines';
import {
  addAdditionalStepDetail,
  buildStepDetailFields,
  createStepDetailDraft,
  removeAdditionalStepDetail,
  setStepDetailSpeech,
  updateAdditionalStepDetail,
} from './stepDetailDraft';
import { moveRoutineStep } from './routineStepOrdering';
import { getSkillAssociations } from './skills';

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

test('step speech choices stay with their details when the routine is reordered and reopened', () => {
  const steps: RoutineStep[] = [
    {
      id: 'breathing',
      title: 'Breathing',
      description: 'Count each breath',
      additionalDetails: ['Notice the pause'],
      detailSpeech: [true, false],
      skillIds: ['skill-breathing'],
      durationSeconds: 45,
    },
    {
      id: 'planning',
      title: 'Planning',
      description: 'Choose a priority',
      additionalDetails: ['Write one next action'],
      detailSpeech: [false, true],
      skillIds: ['skill-planning'],
      durationSeconds: 60,
    },
  ];

  const savedRoutine: Routine = JSON.parse(JSON.stringify({
    id: 'morning-reset',
    title: 'Morning reset',
    subtitle: '',
    icon: 'sun',
    tone: 'sage',
    createdAt: '2030-01-01T00:00:00.000Z',
    steps: moveRoutineStep(steps, 1, -1),
  }));
  const reopenedSteps = savedRoutine.steps;

  assert.deepEqual(reopenedSteps.map(step => step.id), ['planning', 'breathing']);
  assert.equal(reopenedSteps[0].description, 'Choose a priority');
  assert.equal(reopenedSteps[1].description, 'Count each breath');
  assert.deepEqual(
    Object.fromEntries(reopenedSteps.map(step => [step.id, step.skillIds])),
    { planning: ['skill-planning'], breathing: ['skill-breathing'] },
  );
  assert.deepEqual(
    Object.fromEntries(reopenedSteps.map(step => [step.id, createStepDetailDraft(step).detailSpeech])),
    { planning: [false, true], breathing: [true, false] },
  );
  assert.deepEqual(getSpokenStepDetails(reopenedSteps[0]), ['Write one next action']);
  assert.deepEqual(getSpokenStepDetails(reopenedSteps[1]), ['Count each breath']);
  assert.deepEqual(
    getSkillAssociations('skill-planning', [savedRoutine], []).routines.map(use => [
      use.id,
      use.title,
      use.assignedToRoutine,
      use.steps,
    ]),
    [['morning-reset', 'Morning reset', false, [{ title: 'Planning', hidden: false }]]],
  );
  assert.deepEqual(
    getSkillAssociations('skill-breathing', [savedRoutine], []).routines.map(use => [
      use.id,
      use.title,
      use.assignedToRoutine,
      use.steps,
    ]),
    [['morning-reset', 'Morning reset', false, [{ title: 'Breathing', hidden: false }]]],
  );
  assert.equal(moveRoutineStep(reopenedSteps, 0, -1), reopenedSteps);
  assert.equal(moveRoutineStep(reopenedSteps, 1, 1), reopenedSteps);
  assert.equal(moveRoutineStep(reopenedSteps, 2, -1), reopenedSteps);
});
