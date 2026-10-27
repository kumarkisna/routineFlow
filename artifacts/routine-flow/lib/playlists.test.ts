import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlaylistRunLaunch, getPlaylistSpeechSteps, mergePlaylistCatalog, nextPlaylistCursor, parsePlaylistQueue, parsePlaylists, playablePlaylistIds,
  remapPlaylistReferences, resolvePlaylistReminderSettings, validatePlaylist } from './playlists';
import type { Routine } from '../types/routines';
import { getNextRoutineStepIndex, getPlayableRoutine, getRoutinePlaybackStep, getRoutinePlaybackStepSeconds } from './routinePlayback';
import { buildStepAnnouncement } from './routineSpeech';
import { moveRoutineStep } from './routineStepOrdering';

const routine = (id: string, hidden = false, hiddenStep = false): Routine => ({
  id, title: id, subtitle: '', icon: 'sunny-outline', tone: 'coral',
  createdAt: '', hidden, steps: [{ id: `${id}-step`, title: 'Step', durationSeconds: 1, hidden: hiddenStep }],
});
test('playlist runs retain order and repeats, excluding missing or inactive routines', () => {
  assert.deepEqual(playablePlaylistIds(['b', 'gone', 'a', 'hidden', 'empty', 'b'],
    [routine('a'), routine('b'), routine('hidden', true), routine('empty', false, true)]),
  ['b', 'a', 'b']);
});
test('playlist playback uses a routine’s saved step order before advancing once to the next routine', () => {
  const originalFirstRoutine = {
    ...routine('first'),
    title: 'Morning reset',
    steps: [
      { id: 'warm-up', title: 'Warm up', description: 'Roll your shoulders', durationSeconds: 19 },
      { id: 'optional', title: 'Optional stretch', durationSeconds: 13, hidden: true },
      { id: 'drink-water', title: 'Drink water', description: 'Take a few sips', durationSeconds: 27 },
    ],
  };
  const reorderedSteps = moveRoutineStep(
    moveRoutineStep(originalFirstRoutine.steps, 2, -1),
    1,
    -1,
  );
  const savedFirstRoutine = JSON.parse(JSON.stringify({
    ...originalFirstRoutine,
    steps: reorderedSteps,
  })) as Routine;
  const followingRoutine = {
    ...routine('next'),
    title: 'Next routine',
    steps: [{ id: 'next-step', title: 'Close out', durationSeconds: 11 }],
  };
  const routines = [savedFirstRoutine, followingRoutine];
  const playlist = {
    id: 'playlist-morning',
    title: 'Morning playlist',
    routineIds: ['first', 'next'],
    skillIds: ['focus'],
    rateSkillsAtPlaylistEnd: true,
    reminderSettings: { stepCompletion: false, routineCompletion: false },
  };
  const launch = createPlaylistRunLaunch(playlist, routines);
  assert.ok(launch);
  assert.deepEqual(launch.ids, ['first', 'next']);
  assert.deepEqual(
    getPlaylistSpeechSteps(playlist, routines).map(({ routine: spokenRoutine, stepIndex }) => [
      spokenRoutine.id,
      spokenRoutine.steps[stepIndex].id,
    ]),
    [
      ['first', 'drink-water'],
      ['first', 'warm-up'],
      ['next', 'next-step'],
    ],
  );
  assert.equal(launch.params.id, 'first');
  assert.equal(launch.params.cursor, '0');
  assert.equal(launch.params.autoStart, '1');
  const queue = parsePlaylistQueue(launch.params.queue);
  assert.ok(queue);
  assert.deepEqual(queue, ['first', 'next']);

  const firstPlayback = getPlayableRoutine(routines.find(item => item.id === launch.params.id)!);
  assert.deepEqual(firstPlayback.steps.map(step => step.id), ['drink-water', 'warm-up']);
  assert.deepEqual(
    firstPlayback.steps.map((_, index) => getRoutinePlaybackStepSeconds(firstPlayback, index)),
    [27, 19],
  );
  assert.deepEqual(
    firstPlayback.steps.map((_, index) => buildStepAnnouncement(firstPlayback, index, [])),
    [
      'Step 1. Drink water. Take a few sips. You have 27 seconds.',
      'Step 2. Warm up. Roll your shoulders. You have 19 seconds.',
    ],
  );

  const events: string[] = [];
  let cursor = Number(launch.params.cursor);
  while (cursor >= 0) {
    const currentRoutineId = queue[cursor];
    const currentRoutine = routines.find(item => item.id === currentRoutineId);
    assert.ok(currentRoutine);
    const visibleRoutine = getPlayableRoutine(currentRoutine);
    let stepIndex: number | null = 0;
    while (stepIndex !== null) {
      events.push(`step:${currentRoutineId}:${getRoutinePlaybackStep(visibleRoutine, stepIndex).id}`);
      stepIndex = getNextRoutineStepIndex(visibleRoutine, stepIndex);
    }
    events.push(`complete:${currentRoutineId}`);
    const nextCursor = nextPlaylistCursor(queue, cursor, routines);
    if (nextCursor !== -1) events.push(`advance:${queue[nextCursor]}`);
    cursor = nextCursor;
  }

  assert.deepEqual(events, [
    'step:first:drink-water',
    'step:first:warm-up',
    'complete:first',
    'advance:next',
    'step:next:next-step',
    'complete:next',
  ]);
  assert.equal(events.filter(event => event.startsWith('advance:')).length, 1);
});
test('playlist names and at least one routine are required', () => {
  assert.throws(() => validatePlaylist(' ', ['a']));
  assert.throws(() => validatePlaylist('Morning', []));
  assert.throws(() => validatePlaylist('Morning', Array(101).fill('a')));
  assert.doesNotThrow(() => validatePlaylist('Morning', ['a', 'a']));
});
test('saved playlist parsing keeps ordered identifiers and rejects corrupt storage', () => {
  const list = [{ id: 'p', title: 'Morning', routineIds: ['b', 'a', 'b'] }];
  assert.deepEqual(parsePlaylists(JSON.stringify(list)), [
    {
      ...list[0],
      rateSkillsAtPlaylistEnd: true,
      reminderSettings: { stepCompletion: false, routineCompletion: false },
    },
  ]);
  assert.equal(parsePlaylists(JSON.stringify(list))[0].rateSkillsAtPlaylistEnd, true);
  assert.deepEqual(parsePlaylists(JSON.stringify(list))[0].reminderSettings, {
    stepCompletion: false,
    routineCompletion: false,
  });
  assert.equal(parsePlaylists(JSON.stringify([{ ...list[0], rateSkillsAtPlaylistEnd: true }]))[0].rateSkillsAtPlaylistEnd, true);
  assert.deepEqual(parsePlaylists(JSON.stringify([{
    ...list[0],
    reminderSettings: { stepCompletion: true, routineCompletion: false },
  }]))[0].reminderSettings, { stepCompletion: true, routineCompletion: false });
  assert.deepEqual(resolvePlaylistReminderSettings({ stepCompletion: true, routineCompletion: false }), {
    stepCompletion: true,
    routineCompletion: false,
  });
  assert.deepEqual(resolvePlaylistReminderSettings(
    { stepCompletion: true, routineCompletion: true },
    { stepCompletion: false, routineCompletion: true },
  ), { stepCompletion: false, routineCompletion: true });
  assert.throws(() => parsePlaylists('{}'));
  assert.throws(() => parsePlaylists('[{"id":"p","title":"Morning","routineIds":[12]}]'));
  assert.throws(() => parsePlaylists('[{"id":"p","title":"Morning","routineIds":["a"],"rateSkillsAtPlaylistEnd":"yes"}]'));
  assert.throws(() => parsePlaylists('[{"id":"p","title":"Morning","routineIds":["a"],"reminderSettings":{"stepCompletion":"yes","routineCompletion":false}}]'));
  assert.equal(
    parsePlaylists(JSON.stringify([{
      ...list[0],
      reflectionTemplateHtml: '<p onclick="alert(1)" style="color:#345">Think about <strong>today</strong>.</p>',
    }]))[0].reflectionTemplateHtml,
    '<p style="color:#345">Think about <strong>today</strong>.</p>',
  );
  assert.throws(() => parsePlaylists(JSON.stringify([{
    ...list[0], reflectionTemplateHtml: 'x'.repeat(100_001),
  }])));
});

test('playlist backup imports merge skill links and keep conflicting local playlists intact', () => {
  const existing = [
    {
      id: 'focus-local', title: 'Focus', routineIds: ['morning'], skillIds: ['local-skill'],
      reminderSettings: { stepCompletion: false, routineCompletion: true },
    },
    { id: 'evening', title: 'Evening', routineIds: ['wind-down'] },
  ];
  const incoming = [
    {
      id: 'focus-backup', title: 'Focus', routineIds: ['morning'], skillIds: ['backup-skill'],
      reminderSettings: { stepCompletion: true, routineCompletion: false },
    },
    {
      id: 'evening', title: 'Evening v2', routineIds: ['wind-down', 'stretch'], skillIds: ['mobility'],
      reminderSettings: { stepCompletion: true, routineCompletion: true },
    },
  ];
  let nextId = 0;
  const first = mergePlaylistCatalog(existing, incoming, () => `copy-${++nextId}`);

  assert.deepEqual(first.playlists, [
    { ...existing[0], skillIds: ['local-skill', 'backup-skill'] },
    existing[1],
    { ...incoming[1], id: 'copy-1' },
  ]);
  assert.deepEqual({ added: first.added, skipped: first.skipped, renamed: first.renamed, updated: first.updated }, {
    added: 1, skipped: 0, renamed: 1, updated: 1,
  });
  assert.equal(first.idMap['focus-backup'], 'focus-local');
  assert.equal(first.idMap.evening, 'copy-1');

  const retry = mergePlaylistCatalog(first.playlists, incoming, () => {
    throw new Error('Repeated import must not allocate another playlist ID');
  });
  assert.deepEqual({ added: retry.added, skipped: retry.skipped, renamed: retry.renamed, updated: retry.updated }, {
    added: 0, skipped: 2, renamed: 0, updated: 0,
  });
  assert.deepEqual(retry.playlists, first.playlists);
});

test('backup playlist references follow remapped routine and skill IDs', () => {
  assert.deepEqual(remapPlaylistReferences([{
    id: 'playlist', title: 'Focus', routineIds: ['routine-old', 'local-routine'],
    skillIds: ['skill-old', 'local-skill'],
    reminderSettings: { stepCompletion: true, routineCompletion: false },
  }], {
    'routine-old': 'routine-copy',
  }, {
    'skill-old': 'local-focus',
  }), [{
    id: 'playlist', title: 'Focus', routineIds: ['routine-copy', 'local-routine'],
    skillIds: ['local-focus', 'local-skill'],
    reminderSettings: { stepCompletion: true, routineCompletion: false },
  }]);
});

test('run queue parsing rejects invalid route data', () => {
  assert.deepEqual(parsePlaylistQueue('["b","a","b"]'), ['b', 'a', 'b']);
  assert.equal(parsePlaylistQueue('nope'), null);
  assert.equal(parsePlaylistQueue('[1]'), null);
  assert.equal(parsePlaylistQueue('[]'), null);
});
test('automatic progression skips removed/hidden routines and handles repeats and the final routine', () => {
  const routines = [routine('a'), routine('b'), routine('hidden', true)];
  const ids = ['a', 'gone', 'hidden', 'a', 'b'];
  assert.equal(nextPlaylistCursor(ids, 0, routines), 3);
  assert.equal(nextPlaylistCursor(ids, 3, routines), 4);
  assert.equal(nextPlaylistCursor(ids, 4, routines), -1);
});