import assert from 'node:assert/strict';
import test from 'node:test';
import { getSpokenStepDetails, type Routine, type RoutineStep } from '../types/routines';
import {
  addAdditionalStepDetail,
  addStepDetailAttachment,
  buildStepDetailFields,
  createStepDetailDraft,
  removeAdditionalStepDetail,
  setStepDetailHtml,
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
    detailAttachments: [[], [], [], []],
    detailHtml: ['', '', '', ''],
  });
  assert.deepEqual(getSpokenStepDetails(savedStep), [
    'Main detail',
    'Stay enabled',
    'New last detail',
  ]);
});

test('formatted details retain plain editable text and HTML through save and reopen', () => {
  const legacyStep: RoutineStep = {
    id: 'legacy',
    title: 'Read the guide',
    description: '  Old unformatted note  ',
    durationSeconds: 60,
  };
  const oldDraft = createStepDetailDraft(legacyStep);
  assert.equal(oldDraft.description, '  Old unformatted note  ');
  assert.equal(buildStepDetailFields(oldDraft).description, 'Old unformatted note');

  let draft = createStepDetailDraft({
    ...legacyStep,
    description: 'Read each instruction in order.',
    additionalDetails: ['Open the reference.'],
  });
  draft = setStepDetailHtml(draft, 0, '<h2>Read each instruction in order.</h2>');
  draft = setStepDetailHtml(draft, 1, '<p><a href="https://example.com">Open the reference</a></p>');
  const savedFields = buildStepDetailFields(draft);
  const reopened = createStepDetailDraft({
    ...legacyStep,
    ...savedFields,
  });

  assert.equal(savedFields.description, 'Read each instruction in order.');
  assert.deepEqual(savedFields.additionalDetails, ['Open the reference.']);
  assert.deepEqual(reopened.detailHtml, [
    '<h2>Read each instruction in order.</h2>',
    '<p><a href="https://example.com">Open the reference</a></p>',
  ]);
  assert.equal(reopened.description, 'Read each instruction in order.');
  assert.deepEqual(getSpokenStepDetails({ ...legacyStep, ...savedFields }), [
    'Read each instruction in order.',
    'Open the reference.',
  ]);
});

test('editing a step appends files to the selected detail and preserves them after save and reopen', () => {
  const photo = {
    id: 'photo-1', name: 'before.png', uri: 'file:///old/before.png',
    mimeType: 'image/png', kind: 'image' as const, contentBase64: 'aGVsbG8=',
  };
  const document = {
    id: 'document-1', name: 'guide.pdf', uri: 'file:///old/guide.pdf',
    mimeType: 'application/pdf', kind: 'document' as const, contentBase64: 'JVBERi0=',
  };
  const originalStep: RoutineStep = {
    id: 'practice', title: 'Practice', description: 'Read the note',
    additionalDetails: ['Open the guide'], detailAttachments: [[photo], []], durationSeconds: 60,
  };
  let draft = createStepDetailDraft(originalStep);
  draft = addStepDetailAttachment(draft, 1, document);
  const updatedStep = { ...originalStep, ...buildStepDetailFields(draft) };
  const reopened = createStepDetailDraft(updatedStep);
  assert.deepEqual(updatedStep.detailAttachments, [[photo], [document]]);
  assert.deepEqual(reopened.detailAttachments, [[photo], [document]]);
  assert.equal(reopened.detailAttachments[1][0].contentBase64, 'JVBERi0=');
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
