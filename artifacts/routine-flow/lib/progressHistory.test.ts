/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Routine } from '@/types/routines';
import type { RoutineSkill } from './skills';
import {
  formatHistoryDay, getHistoryForDay, playlistHistoryOptions, recordCompletion,
  recordedPastDays, routineHistoryOptions,
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
      skillName: 'Focus',
      rating: 8,
      ratedAt: ratedAt.toISOString(),
      note: 'I stayed with the task.',
    },
    {
      id: 'focus:focus-no-note',
      skillName: 'Focus',
      rating: 6,
      ratedAt: ratedAt.toISOString(),
    },
  ]);
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