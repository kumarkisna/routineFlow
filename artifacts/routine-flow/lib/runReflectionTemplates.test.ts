import assert from 'node:assert/strict';
import test from 'node:test';
import type { Routine } from '../types/routines';
import { getDeferredReflectionTemplate, getRunReflectionDraft } from './runReflectionTemplates';

const routine = (id: string, reflectionTemplate?: string, reflectionTemplateHtml?: string): Routine => ({
  id,
  title: id,
  subtitle: '',
  icon: 'sunny-outline',
  tone: 'coral',
  createdAt: '',
  steps: [{ id: `${id}-step`, title: 'Step', durationSeconds: 1 }],
  ...(reflectionTemplate ? { reflectionTemplate } : {}),
  ...(reflectionTemplateHtml ? { reflectionTemplateHtml } : {}),
});

test('uses the template snapshot captured when a run was deferred', () => {
  const result = getDeferredReflectionTemplate({
    sourceRoutineId: 'morning',
    templateTextSnapshot: 'Original prompt',
    templateHtmlSnapshot: '<p><strong>Original prompt</strong></p>',
  }, [routine('morning', 'Changed prompt')], []);

  assert.deepEqual(result, {
    text: 'Original prompt',
    html: '<p><strong>Original prompt</strong></p>',
  });
});

test('falls back to the routine template for older deferred routine runs', () => {
  assert.deepEqual(getDeferredReflectionTemplate(
    { sourceRoutineId: 'morning' },
    [routine('morning', 'Routine prompt', '<p>Routine prompt</p>')],
    [],
  ), { text: 'Routine prompt', html: '<p>Routine prompt</p>' });
});

test('uses the playlist template for older deferred runs at the playlist end', () => {
  assert.deepEqual(getDeferredReflectionTemplate({
    sourceRoutineId: 'last',
    sourcePlaylistId: 'morning-list',
  }, [routine('first', 'First routine'), routine('last', 'Last routine')], [{
    id: 'morning-list',
    title: 'Morning',
    routineIds: ['first', 'last'],
    reflectionTemplate: 'Playlist prompt',
    reflectionTemplateHtml: '<p>Playlist prompt</p>',
  }]), { text: 'Playlist prompt', html: '<p>Playlist prompt</p>' });
});

test('uses the routine template when an older playlist run was not at the end', () => {
  assert.deepEqual(getDeferredReflectionTemplate({
    sourceRoutineId: 'first',
    sourcePlaylistId: 'morning-list',
  }, [routine('first', 'Routine prompt'), routine('last', 'Last routine')], [{
    id: 'morning-list',
    title: 'Morning',
    routineIds: ['first', 'last'],
    reflectionTemplate: 'Playlist prompt',
  }]), { text: 'Routine prompt', html: '' });
});

test('keeps an explicitly empty template snapshot empty', () => {
  assert.deepEqual(getDeferredReflectionTemplate({
    sourceRoutineId: 'morning',
    templateTextSnapshot: '',
    templateHtmlSnapshot: '',
  }, [routine('morning', 'Current template')], []), { text: '', html: '' });
});

test('uses the reflection template as the editable draft until a response exists', () => {
  const template = '<p><strong>What went well?</strong></p>';
  assert.equal(getRunReflectionDraft(template), template);
  assert.equal(getRunReflectionDraft(template, ''), template);
  assert.equal(getRunReflectionDraft(template, '  '), template);
});

test('keeps a saved reflection response instead of replacing it with the template', () => {
  const response = '<p>I felt more focused today.</p>';
  assert.equal(getRunReflectionDraft('<p>What went well?</p>', response), response);
  assert.equal(getRunReflectionDraft('', response), response);
});
