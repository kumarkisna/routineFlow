import assert from 'node:assert/strict';
import test from 'node:test';
import type { Routine, RoutineStep } from '../types/routines';
import { copyRoutineSteps } from './copyRoutine';
import { buildStepDetailFields, createStepDetailDraft } from './stepDetailDraft';
import { openStepDetailEditorDraft, serializeStepDetailEditorSave } from './stepDetailEditor';

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

test('native rich-detail draft stays available after closing and reopening a copied step editor', () => {
  const source: RoutineStep = {
    id: 'source-step',
    title: 'Water the herbs',
    description: 'Original instructions',
    detailHtml: ['<p><strong>Original instructions</strong></p>'],
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
  const [copied] = copyRoutineSteps(sourceRoutine, [], () => 'copied-step');
  const originalDraft = openStepDetailEditorDraft('Main step detail', copied.description ?? '', copied.detailHtml?.[0] ?? '', null);
  const interruptedDraft = { ...originalDraft, html: '<h2>Updated while editing</h2><p>Keep this draft</p>' };
  // Android Modal.onRequestClose hides the editor without clearing draftRef.
  const resumedDraft = openStepDetailEditorDraft(
    'Main step detail',
    copied.description ?? '',
    copied.detailHtml?.[0] ?? '',
    interruptedDraft,
  );
  const saved = serializeStepDetailEditorSave('native', resumedDraft.text, resumedDraft.html);
  const updatedCopy = {
    ...copied,
    ...buildStepDetailFields({
      ...createStepDetailDraft(copied),
      description: saved.text,
      detailHtml: [saved.html],
    }),
  };
  const reopened = createStepDetailDraft(JSON.parse(JSON.stringify(updatedCopy)) as RoutineStep);

  assert.equal(resumedDraft.html, interruptedDraft.html);
  assert.equal(reopened.detailHtml[0], interruptedDraft.html);
  assert.match(reopened.description, /Updated while editing/);
  assert.deepEqual(source.detailHtml, ['<p><strong>Original instructions</strong></p>']);
  assert.equal(source.description, 'Original instructions');
});
