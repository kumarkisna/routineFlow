import assert from 'node:assert/strict';
import test from 'node:test';
import { getSpokenStepDetails, type Routine, type RoutineStep } from '../types/routines';
import {
  addAdditionalStepDetail,
  addStepDetailAttachment,
  buildStepDetailFields,
  createStepDetailDraft,
  moveAdditionalStepDetail,
  removeAdditionalStepDetail,
  setStepDetailHtml,
  setStepDetailSpeech,
  updateAdditionalStepDetail,
  undoRemoveAdditionalStepDetail,
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

test('removing a middle additional detail keeps remaining links with their notes', () => {
  const originalStep: RoutineStep = {
    id: 'practice',
    title: 'Practice',
    description: 'Main guide',
    additionalDetails: ['First note', 'Remove this note', 'Last note'],
    detailHtml: [
      '<p><a href="https://example.com/main">Main guide</a></p>',
      '<p><a href="https://example.com/first">First note</a></p>',
      '<p><a href="https://example.com/remove">Remove this note</a></p>',
      '<p><a href="mailto:team@example.com">Last note</a></p>',
    ],
    durationSeconds: 60,
  };

  const draft = removeAdditionalStepDetail(createStepDetailDraft(originalStep), 1);
  const saved = {
    ...originalStep,
    ...buildStepDetailFields(draft),
  };
  const reopened = createStepDetailDraft(JSON.parse(JSON.stringify(saved)) as RoutineStep);

  assert.deepEqual(reopened.additionalDetails, ['First note', 'Last note']);
  assert.deepEqual(reopened.detailHtml, [
    '<p><a href="https://example.com/main">Main guide</a></p>',
    '<p><a href="https://example.com/first">First note</a></p>',
    '<p><a href="mailto:team@example.com">Last note</a></p>',
  ]);
  assert.deepEqual(
    reopened.detailHtml.map(html => html.match(/href="([^"]+)"/)?.[1]),
    ['https://example.com/main', 'https://example.com/first', 'mailto:team@example.com'],
  );
  assert.deepEqual(originalStep.additionalDetails, ['First note', 'Remove this note', 'Last note']);
});

test('reordering additional notes keeps each formatted link with its note after save and reopen', () => {
  const originalStep: RoutineStep = {
    id: 'practice',
    title: 'Practice',
    description: 'Main guide',
    additionalDetails: ['First note', 'Second note', 'Third note'],
    detailSpeech: [true, true, false, true],
    detailHtml: [
      '<p><a href="https://example.com/main">Main guide</a></p>',
      '<p><a href="https://example.com/first">First note</a></p>',
      '<p><a href="mailto:team@example.com">Second note</a></p>',
      '<p><a href="https://example.com/third">Third note</a></p>',
    ],
    durationSeconds: 60,
  };
  let draft = createStepDetailDraft(originalStep);
  draft = moveAdditionalStepDetail(draft, 2, -1);
  const saved = JSON.parse(JSON.stringify({
    ...originalStep,
    ...buildStepDetailFields(draft),
  })) as RoutineStep;
  const reopened = createStepDetailDraft(saved);

  assert.deepEqual(reopened.additionalDetails, ['First note', 'Third note', 'Second note']);
  assert.deepEqual(reopened.detailHtml, [
    '<p><a href="https://example.com/main">Main guide</a></p>',
    '<p><a href="https://example.com/first">First note</a></p>',
    '<p><a href="https://example.com/third">Third note</a></p>',
    '<p><a href="mailto:team@example.com">Second note</a></p>',
  ]);
  assert.deepEqual(reopened.detailSpeech, [true, true, true, false]);
  assert.equal(moveAdditionalStepDetail(draft, 0, -1), draft);
  assert.deepEqual(originalStep.additionalDetails, ['First note', 'Second note', 'Third note']);
});

test('undoing removal restores a formatted detail with speech choice and attachments', () => {
  const attachment = {
    id: 'removed-file',
    name: 'instructions.pdf',
    uri: 'file:///instructions.pdf',
    mimeType: 'application/pdf',
    kind: 'document' as const,
    contentBase64: 'JVBERi0=',
  };
  const originalStep: RoutineStep = {
    id: 'practice',
    title: 'Practice',
    description: 'Main guide',
    additionalDetails: ['First note', 'Open the linked instructions', 'Last note'],
    detailSpeech: [true, false, false, true],
    detailAttachments: [[], [], [attachment], []],
    detailHtml: [
      '',
      '<p>First note</p>',
      '<p><a href="https://example.com/instructions">Open the linked instructions</a></p>',
      '',
    ],
    durationSeconds: 60,
  };
  const originalDraft = createStepDetailDraft(originalStep);
  const removedDraft = removeAdditionalStepDetail(originalDraft, 1);
  const restoredDraft = undoRemoveAdditionalStepDetail(removedDraft);
  const saved = buildStepDetailFields(restoredDraft);

  assert.deepEqual(restoredDraft, originalDraft);
  assert.deepEqual(saved.additionalDetails, originalStep.additionalDetails);
  assert.deepEqual(saved.detailSpeech, originalStep.detailSpeech);
  assert.deepEqual(saved.detailAttachments, originalStep.detailAttachments);
  assert.deepEqual(saved.detailHtml, originalStep.detailHtml);
  assert.equal(removedDraft.additionalDetails.length, 2);
  assert.equal(undoRemoveAdditionalStepDetail(originalDraft), originalDraft);
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
  const secondPhoto = {
    id: 'photo-2', name: 'after.png', uri: 'file:///old/after.png',
    mimeType: 'image/png', kind: 'image' as const, contentBase64: 'c2Vjb25kLWltYWdl',
  };
  const originalStep: RoutineStep = {
    id: 'practice', title: 'Practice', description: 'Read the note',
    additionalDetails: ['Open the guide'], detailAttachments: [[photo], []], durationSeconds: 60,
  };
  let draft = createStepDetailDraft(originalStep);
  draft = addStepDetailAttachment(draft, 0, document);
  draft = addStepDetailAttachment(draft, 0, secondPhoto);
  const updatedStep = { ...originalStep, ...buildStepDetailFields(draft) };
  const reopened = createStepDetailDraft(updatedStep);
  assert.deepEqual(updatedStep.detailAttachments, [[photo, document, secondPhoto], []]);
  assert.deepEqual(reopened.detailAttachments, [[photo, document, secondPhoto], []]);
  assert.equal(reopened.detailAttachments[0][1].contentBase64, 'JVBERi0=');
});

test('step speech choices stay with their details when the routine is reordered and reopened', () => {
  const steps: RoutineStep[] = [
    {
      id: 'breathing',
      title: 'Breathing',
      description: 'Count each breath',
      additionalDetails: ['Notice the pause'],
      detailHtml: [
        '<p><a href="https://example.com/breathing">Count each breath</a></p>',
        '<p><a href="mailto:coach@example.com">Notice the pause</a></p>',
      ],
      detailSpeech: [true, false],
      skillIds: ['skill-breathing'],
      durationSeconds: 45,
    },
    {
      id: 'planning',
      title: 'Planning',
      description: 'Choose a priority',
      additionalDetails: ['Write one next action'],
      detailHtml: [
        '<p><a href="https://example.com/priority">Choose a priority</a></p>',
        '<p><a href="mailto:planner@example.com">Write one next action</a></p>',
      ],
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
  assert.deepEqual(
    Object.fromEntries(reopenedSteps.map(step => [step.id, createStepDetailDraft(step).detailHtml])),
    {
      planning: [
        '<p><a href="https://example.com/priority">Choose a priority</a></p>',
        '<p><a href="mailto:planner@example.com">Write one next action</a></p>',
      ],
      breathing: [
        '<p><a href="https://example.com/breathing">Count each breath</a></p>',
        '<p><a href="mailto:coach@example.com">Notice the pause</a></p>',
      ],
    },
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
