/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Routine } from '@/types/routines';
import type { RoutineSkill } from './skills';
import {
  createHistorySkillRatingRun, formatHistoryDay, getHistoryForDay, getUnratedSkillIds,
  getSkillRatingsMissingNotes, groupSkillRatingEvents, playlistHistoryOptions, playlistHistoryRatingAnchorId, recordCompletion,
  recordedHistoryDays, recordedPastDays, routineHistoryOptions,
} from './progressHistory';

const routine: Routine = {
  id: 'morning',
  title: 'Morning',
  subtitle: '',
  icon: 'sunny-outline',
  tone: 'coral',
  hidden: true,
  createdAt: '2026-01-01T00:00:00Z',
  steps: [{ id: 'water', title: 'Water', durationSeconds: 60, hidden: true }],
};

test('completion captures names once, retaining an earlier label when completed again', () => {
  const first = recordCompletion('Morning', 'Water', false);
  assert.deepEqual(first, { routineTitle: 'Morning', stepTitle: 'Water' });
  assert.equal(recordCompletion('Edited', 'Changed', first), first);
  assert.equal(recordCompletion('Edited', 'Changed', true), true);
  assert.deepEqual(recordCompletion('Edited', 'Changed', false), {
    routineTitle: 'Edited', stepTitle: 'Changed',
  });
});

test('playlist completions are tagged without replacing labels and support multiple playlist runs', () => {
  const first = recordCompletion('Morning', 'Water', false, {
    playlistId: 'start-day', playlistTitle: 'Start the day',
  });
  const same = recordCompletion('Edited', 'Changed', first, {
    playlistId: 'start-day', playlistTitle: 'Renamed later',
  });
  const second = recordCompletion('Edited', 'Changed', same, {
    playlistId: 'wind-down', playlistTitle: 'Wind down',
  });

  assert.deepEqual(second, {
    routineTitle: 'Morning',
    stepTitle: 'Water',
    playlistRuns: [
      { playlistId: 'start-day', playlistTitle: 'Start the day' },
      { playlistId: 'wind-down', playlistTitle: 'Wind down' },
    ],
  });
});

test('lists only past dates with completions, newest first', () => {
  const days = recordedPastDays({
    '2026-01-03': { 'morning:water': true },
    '2026-01-01': { 'morning:water': { routineTitle: 'Old morning', stepTitle: 'Old water' } },
    '2026-01-02': { 'morning:water': false },
    '2026-01-04': { 'morning:water': true },
    '2026-02-30': { 'morning:water': true },
  }, '2026-01-04');
  assert.deepEqual(days, ['2026-01-03', '2026-01-01']);
  assert.match(formatHistoryDay('2026-01-03'), /January 3, 2026/);
});

test('history includes today so a completed run can be reviewed and exported immediately', () => {
  const progress = {
    '2026-01-03': { 'morning:water': true },
    '2026-01-02': { 'morning:water': true },
    '2026-01-04': { 'morning:water': true },
  };
  assert.deepEqual(recordedHistoryDays(progress, '2026-01-03'), ['2026-01-03', '2026-01-02']);
});

test('skill ratings group by run and stay in the order presented for rating', () => {
  const ratings = [
    {
      id: 'balance', skillId: 'balance-id', ratingId: 'balance-rating', skillName: 'Balance', rating: 7, ratedAt: '2030-06-12T12:05:00.000Z',
      runId: 'run-one', completedAt: '2030-06-12T12:00:00.000Z', sequence: 1,
    },
    {
      id: 'breathing', skillId: 'breathing-id', ratingId: 'breathing-rating', skillName: 'Breathing', rating: 8, ratedAt: '2030-06-12T12:05:00.000Z',
      runId: 'run-one', completedAt: '2030-06-12T12:00:00.000Z', sequence: 0,
    },
    {
      id: 'older-run', skillId: 'focus-id', ratingId: 'focus-rating', skillName: 'Focus', rating: 6, ratedAt: '2030-06-11T12:05:00.000Z',
      runId: 'run-older', completedAt: '2030-06-11T12:00:00.000Z', sequence: 0,
    },
  ];
  const events = groupSkillRatingEvents(ratings);
  assert.deepEqual(events.map(event => event.id), ['run:run-older', 'run:run-one']);
  assert.deepEqual(events[1].ratings.map(rating => rating.skillName), ['Breathing', 'Balance']);
  assert.equal(events[1].dateTime, '2030-06-12T12:00:00.000Z');
  assert.equal(events[1].isRunTime, true);
});

test('history rating IDs stay stable for a backfilled routine or playlist day', () => {
  const routineRun = createHistorySkillRatingRun('2030-06-12', 'routine', 'morning');
  assert.deepEqual(routineRun, createHistorySkillRatingRun('2030-06-12', 'routine', 'morning'));
  assert.equal(routineRun.completedDay, '2030-06-12');
  assert.ok(!routineRun.runId.includes(':'));
  assert.notEqual(
    routineRun.runId,
    createHistorySkillRatingRun('2030-06-12', 'playlist', 'morning').runId,
  );
  assert.notEqual(
    routineRun.runId,
    createHistorySkillRatingRun('2030-06-13', 'routine', 'morning').runId,
  );
  assert.throws(() => createHistorySkillRatingRun('2030-02-30', 'routine', 'morning'));
});

test('history rating choices exclude skills already rated for that entry', () => {
  assert.deepEqual(
    getUnratedSkillIds(['balance', 'focus', 'balance', 'breathing'], [
      { id: 'focus:1', skillId: 'focus', ratingId: 'rating-1', skillName: 'Focus', rating: 8, ratedAt: '2030-06-12T12:00:00Z' },
    ]),
    ['balance', 'breathing'],
  );
});

test('missing-note choices include only ratings without a saved reflection', () => {
  assert.deepEqual(getSkillRatingsMissingNotes([
    { id: 'focus:1', skillId: 'focus', ratingId: 'rating-1', skillName: 'Focus', rating: 8, ratedAt: '2030-06-12T12:00:00Z' },
    { id: 'focus:2', skillId: 'focus', ratingId: 'rating-2', skillName: 'Focus', rating: 9, ratedAt: '2030-06-12T12:30:00Z' },
    { id: 'breathing:2', skillId: 'breathing', ratingId: 'rating-2', skillName: 'Breathing', rating: 6, ratedAt: '2030-06-12T12:00:00Z', note: 'Keep the pace.' },
    { id: 'balance:3', skillId: 'balance', ratingId: 'rating-3', skillName: 'Balance', rating: 7, ratedAt: '2030-06-12T12:00:00Z', note: '  ' },
  ]), [
    { skillId: 'focus', ratingId: 'rating-1', rating: 8, skillName: 'Focus', ratedAt: '2030-06-12T12:00:00Z' },
    { skillId: 'focus', ratingId: 'rating-2', rating: 9, skillName: 'Focus', ratedAt: '2030-06-12T12:30:00Z' },
    { skillId: 'balance', ratingId: 'rating-3', rating: 7, skillName: 'Balance', ratedAt: '2030-06-12T12:00:00Z' },
  ]);
});

test('playlist history has one rating anchor at the last completed routine in playlist order', () => {
  const playlistRuns = [{ playlistId: 'weekday', playlistTitle: 'Weekday start' }];
  const groups = [
    { id: 'first', title: 'First', hidden: false, removed: false, steps: [], playlistRuns },
    { id: 'unrelated', title: 'Other', hidden: false, removed: false, steps: [] },
    { id: 'last', title: 'Last', hidden: false, removed: false, steps: [], playlistRuns },
  ];
  assert.equal(playlistHistoryRatingAnchorId(groups, 'weekday', ['first', 'last']), 'last');
  assert.equal(playlistHistoryRatingAnchorId(groups, 'weekday'), 'last');
  assert.equal(playlistHistoryRatingAnchorId(groups, 'missing'), null);
});

test('routine and playlist filters return only dates belonging to the selected item', () => {
  const progress = {
    '2026-01-01': {
      'morning:water': {
        routineTitle: 'Morning',
        stepTitle: 'Water',
        playlistRuns: [{ playlistId: 'weekday', playlistTitle: 'Weekday start' }],
      },
      'evening:read': { routineTitle: 'Evening', stepTitle: 'Read' },
    },
    '2026-01-02': {
      'morning:water': { routineTitle: 'Morning', stepTitle: 'Water' },
    },
  };

  assert.deepEqual(recordedPastDays(progress, '2026-01-03', { kind: 'routine', id: 'morning' }),
    ['2026-01-02', '2026-01-01']);
  assert.deepEqual(recordedPastDays(progress, '2026-01-03', { kind: 'playlist', id: 'weekday' }),
    ['2026-01-01']);
  assert.deepEqual(getHistoryForDay(progress, [routine], '2026-01-01', [], { kind: 'playlist', id: 'weekday' })
    .map(group => group.id), ['morning']);
});

test('shows hidden and edited routines alongside removed steps and routines', () => {
  const groups = getHistoryForDay({
    '2026-01-03': {
      'morning:water': true,
      'morning:old-step': true,
      'deleted:old-step': true,
      'morning:not-done': false,
    },
  }, [routine], '2026-01-03');

  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, 'Morning');
  assert.equal(groups[0].hidden, true);
  assert.deepEqual(groups[0].steps.map((step) => step.title), ['Water', 'Removed step (old-step)']);
  assert.equal(groups[0].steps[0].hidden, true);
  assert.equal(groups[1].title, 'Removed routine (deleted)');
  assert.equal(groups[1].steps[0].title, 'Removed step (old-step)');
});

test('saved labels survive routine and step edits or removal while older boolean entries still work', () => {
  const progress = {
    '2026-01-03': {
      'morning:water': { routineTitle: 'Original morning', stepTitle: 'Drink water' },
      'morning:old-step': { routineTitle: 'Original morning', stepTitle: 'Take a walk' },
      'morning:legacy': true,
      'deleted:old-step': { routineTitle: 'Evening', stepTitle: 'Read a page' },
      'gone:legacy': true,
    },
  };
  const groups = getHistoryForDay(progress, [{ ...routine, title: 'Edited morning',
    steps: [{ ...routine.steps[0], title: 'Sip water' }] }], '2026-01-03');
  assert.equal(groups[0].title, 'Original morning');
  assert.deepEqual(groups[0].steps.map((step) => step.title), [
    'Drink water', 'Take a walk', 'Removed step (legacy)',
  ]);
  assert.equal(groups[0].steps[1].removed, true);
  assert.equal(groups[1].title, 'Evening');
  assert.equal(groups[1].removed, true);
  assert.equal(groups[1].steps[0].title, 'Read a page');
  assert.equal(groups[2].title, 'Removed routine (gone)');
  assert.equal(groups[2].steps[0].title, 'Removed step (legacy)');
});

test('routine event history shows all same-day skill ratings with optional reflection notes', () => {
  const ratedAt = new Date('2030-06-12T12:00:00.000Z');
  const day = `${ratedAt.getFullYear()}-${String(ratedAt.getMonth() + 1).padStart(2, '0')}-${String(ratedAt.getDate()).padStart(2, '0')}`;
  const skills: RoutineSkill[] = [{
    id: 'focus',
    name: 'Focus',
    ratings: [
      { id: 'focus-good', rating: 8, ratedAt: ratedAt.toISOString(), routineTitle: 'Morning', note: 'I stayed with the task.' },
      { id: 'focus-no-note', rating: 6, ratedAt: ratedAt.toISOString(), routineTitle: 'Morning' },
      { id: 'focus-other-event', rating: 9, ratedAt: ratedAt.toISOString(), routineTitle: 'Evening', note: 'A different routine.' },
    ],
  }];

  const groups = getHistoryForDay({ [day]: { 'morning:water': true } }, [routine], day, skills);
  assert.deepEqual(groups[0].skillRatings, [
    {
      id: 'focus:focus-good',
      skillId: 'focus',
      ratingId: 'focus-good',
      skillName: 'Focus',
      rating: 8,
      ratedAt: ratedAt.toISOString(),
      note: 'I stayed with the task.',
    },
    {
      id: 'focus:focus-no-note',
      skillId: 'focus',
      ratingId: 'focus-no-note',
      skillName: 'Focus',
      rating: 6,
      ratedAt: ratedAt.toISOString(),
    },
  ]);
});

test('ratings added from history stay attached to the completed day, not the later recording day', () => {
  const skills: RoutineSkill[] = [{
    id: 'focus',
    name: 'Focus',
    ratings: [{
      id: 'historical-rating',
      rating: 8,
      ratedAt: '2030-06-14T12:00:00.000Z',
      routineTitle: 'Morning',
      runId: 'history-routine-20300612-test',
      completedDay: '2030-06-12',
      note: 'I stayed with the task.',
    }],
  }];
  const progress = {
    '2030-06-12': { 'morning:water': true },
    '2030-06-14': { 'morning:water': true },
  };

  const completedDay = getHistoryForDay(progress, [routine], '2030-06-12', skills);
  const recordedDay = getHistoryForDay(progress, [routine], '2030-06-14', skills);
  assert.deepEqual(completedDay[0].skillRatings?.map(item => item.skillId), ['focus']);
  assert.equal(completedDay[0].skillRatings?.[0].note, 'I stayed with the task.');
  assert.equal(recordedDay[0].skillRatings, undefined);
});

test('history filter choices retain deleted routine and playlist labels', () => {
  const progress = {
    '2026-01-01': {
      'deleted:water': {
        routineTitle: 'Archived morning',
        stepTitle: 'Water',
        playlistRuns: [{ playlistId: 'old-playlist', playlistTitle: 'Old start' }],
      },
    },
  };
  assert.deepEqual(routineHistoryOptions(progress, [routine]).find(option => option.id === 'deleted'), {
    id: 'deleted', title: 'Archived morning', archived: true,
  });
  assert.deepEqual(playlistHistoryOptions(progress, []).find(option => option.id === 'old-playlist'), {
    id: 'old-playlist', title: 'Old start', archived: true,
  });
});