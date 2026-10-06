import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPersonCopy } from './personCopy';
import type { PersonSnapshot } from '@/types/people';
import type { Routine } from '@/types/routines';

const routine = (id: string, hidden = false): Routine => ({
  id,
  title: `Routine ${id}`,
  subtitle: 'Keep settings',
  category: 'Morning',
  hidden,
  icon: 'sunny-outline',
  tone: 'sage',
  createdAt: '2030-01-02T03:04:05.000Z',
  steps: [
    { id: `${id}-step-a`, title: 'First', durationSeconds: 60, hidden: true,
      ...(id === 'a' ? { skillIds: ['skill-mobility'] } : {}) },
    { id: `${id}-step-b`, title: 'Second', description: 'Details', durationSeconds: 120 },
  ],
  ...(id === 'a' ? { skillIds: ['skill-mindfulness'] } : {}),
});

const sourceSnapshot = (): PersonSnapshot => ({
  routines: [routine('a'), routine('b', true), routine('unused')],
  playlists: [{
    id: 'playlist',
    title: 'Sequence',
    routineIds: ['a', 'b', 'a'],
    skillIds: ['skill-cardio'],
    reminderSettings: { stepCompletion: true, routineCompletion: false },
  }],
  skills: [
    { id: 'skill-mindfulness', name: 'Mindfulness', ratings: [{
      id: 'rating-mindfulness-1', rating: 9, ratedAt: '2035-04-01T08:00:00.000Z', routineTitle: 'Morning routine',
    }] },
    { id: 'skill-mobility', name: 'Mobility' },
    { id: 'skill-cardio', name: 'Cardio' },
    { id: 'skill-special', name: 'Special' },
  ],
  schedules: [
    {
      id: 'routine-date',
      targetType: 'routine',
      targetId: 'b',
      targetTitle: 'Routine b',
      scheduledAt: '2035-04-05T09:30:00.000Z',
      reminder: true,
      notificationId: 'native-routine',
      alertOffsetsMinutes: [30, 0],
      notifications: [{ id: 'native-alert', offsetMinutes: 30 }],
    },
    {
      id: 'playlist-date',
      targetType: 'playlist',
      targetId: 'playlist',
      targetTitle: 'Special sequence',
      scheduledAt: '2035-04-06T10:15:00.000Z',
      reminder: true,
      notificationId: 'native-playlist',
      alertOffsetsMinutes: [15, 0],
      notifications: [{ id: 'native-alert-2', offsetMinutes: 15 }],
      playlistOverride: {
        title: 'Date-only order',
        routineIds: ['b', 'a', 'b'],
        skillIds: ['skill-special'],
        reminderSettings: { stepCompletion: false, routineCompletion: true },
      },
    },
  ],
  skillRatingWindow: 3,
});

test('copies routine, playlist, schedule, and override dependencies with shared remapping', () => {
  const source = sourceSnapshot();
  const destination: PersonSnapshot = {
    routines: [routine('destination-routine')],
    playlists: [{ id: 'destination-playlist', title: 'Existing', routineIds: ['destination-routine'] }],
    skills: [{ id: 'destination-mobility', name: 'Mobility' }],
    skillRatingWindow: 9,
    schedules: [{
      id: 'destination-schedule',
      targetType: 'routine',
      targetId: 'destination-routine',
      targetTitle: 'Existing routine',
      scheduledAt: '2035-04-07T10:00:00.000Z',
      reminder: false,
    }],
  };
  const originalSource = structuredClone(source);
  const originalDestination = structuredClone(destination);
  const result = buildPersonCopy(source, destination, {
    routineIds: ['a'],
    playlistIds: ['playlist'],
    scheduleIds: ['routine-date', 'playlist-date'],
  });

  assert.deepEqual(result.summary, { routines: 2, playlists: 1, schedules: 2 });
  assert.deepEqual(source, originalSource);
  assert.deepEqual(destination, originalDestination);
  assert.equal(result.snapshot.routines.length, destination.routines.length + 2);
  assert.equal(result.snapshot.playlists.length, destination.playlists.length + 1);
  assert.equal(result.snapshot.schedules.length, destination.schedules.length + 2);
  assert.equal('progress' in result.snapshot, false);
  assert.equal(result.snapshot.skillRatingWindow, destination.skillRatingWindow);

  const copiedA = result.snapshot.routines[destination.routines.length];
  const copiedB = result.snapshot.routines[destination.routines.length + 1];
  const copiedPlaylist = result.snapshot.playlists.at(-1)!;
  const [copiedRoutineSchedule, copiedPlaylistSchedule] = result.snapshot.schedules.slice(-2);
  assert.notEqual(copiedA.id, 'a');
  assert.notEqual(copiedB.id, 'b');
  assert.notEqual(copiedA.steps[0].id, 'a-step-a');
  assert.notEqual(copiedA.steps[0].id, copiedA.id);
  assert.deepEqual(copiedPlaylist.routineIds, [copiedA.id, copiedB.id, copiedA.id]);
  assert.equal(copiedPlaylist.title, 'Sequence');
  assert.equal(copiedB.hidden, true);
  assert.equal(copiedB.steps[0].hidden, true);
  assert.equal(copiedB.category, 'Morning');
  assert.equal(copiedB.steps[1].description, 'Details');
  assert.equal(result.snapshot.skills.find(skill => skill.name === 'Mindfulness')!.ratings, undefined);
  const copiedMindfulness = result.snapshot.skills.find(skill => skill.name === 'Mindfulness')!;
  const copiedCardio = result.snapshot.skills.find(skill => skill.name === 'Cardio')!;
  const copiedSpecial = result.snapshot.skills.find(skill => skill.name === 'Special')!;
  assert.deepEqual(copiedA.skillIds, [copiedMindfulness.id]);
  assert.deepEqual(copiedA.steps[0].skillIds, ['destination-mobility']);
  assert.deepEqual(copiedPlaylist.skillIds, [copiedCardio.id]);
  assert.deepEqual(copiedPlaylist.reminderSettings, { stepCompletion: true, routineCompletion: false });
  assert.equal(copiedRoutineSchedule.targetId, copiedB.id);
  assert.equal(copiedRoutineSchedule.scheduledAt, '2035-04-05T09:30:00.000Z');
  assert.deepEqual(copiedRoutineSchedule.alertOffsetsMinutes, [30, 0]);
  assert.equal(copiedPlaylistSchedule.targetId, copiedPlaylist.id);
  assert.equal(copiedPlaylistSchedule.targetTitle, 'Special sequence');
  assert.deepEqual(copiedPlaylistSchedule.playlistOverride, {
    title: 'Date-only order',
    routineIds: [copiedB.id, copiedA.id, copiedB.id],
    skillIds: [copiedSpecial.id],
    reminderSettings: { stepCompletion: false, routineCompletion: true },
  });
  for (const schedule of [copiedRoutineSchedule, copiedPlaylistSchedule]) {
    assert.equal(schedule.reminder, false);
    assert.equal(schedule.notificationId, undefined);
    assert.equal(schedule.notifications, undefined);
  }
});

test('each copy allocates fresh IDs and missing selections or dependencies are rejected', () => {
  const source = sourceSnapshot();
  const selection = { routineIds: [], playlistIds: ['playlist'], scheduleIds: [] };
  const first = buildPersonCopy(source, { routines: [], playlists: [], schedules: [], skills: [], skillRatingWindow: 5 }, selection);
  const second = buildPersonCopy(source, first.snapshot, selection);
  const firstRoutineId = first.snapshot.routines[0].id;
  const secondRoutineId = second.snapshot.routines[1].id;
  assert.notEqual(secondRoutineId, firstRoutineId);
  assert.notEqual(second.snapshot.playlists[1].id, first.snapshot.playlists[0].id);

  assert.throws(() => buildPersonCopy(source, { routines: [], playlists: [], schedules: [], skills: [], skillRatingWindow: 5 }, {
    routineIds: [], playlistIds: [], scheduleIds: [],
  }), /Select at least one/);
  assert.throws(() => buildPersonCopy(source, { routines: [], playlists: [], schedules: [], skills: [], skillRatingWindow: 5 }, {
    routineIds: ['missing'], playlistIds: [], scheduleIds: [],
  }), /selected routine "missing" was not found/);
  assert.throws(() => buildPersonCopy(source, { routines: [], playlists: [], schedules: [], skills: [], skillRatingWindow: 5 }, {
    routineIds: [], playlistIds: [], scheduleIds: ['missing'],
  }), /selected schedule "missing" was not found/);
  assert.throws(() => buildPersonCopy(
    { ...source, playlists: [{ id: 'broken', title: 'Broken', routineIds: ['missing'] }] },
    { routines: [], playlists: [], schedules: [], skills: [], skillRatingWindow: 5 },
    { routineIds: [], playlistIds: ['broken'], scheduleIds: [] },
  ), /Playlist "broken" references missing routine "missing"/);
  assert.throws(() => buildPersonCopy(
    { ...source, schedules: [{ ...source.schedules[0], targetId: 'missing' }] },
    { routines: [], playlists: [], schedules: [], skills: [], skillRatingWindow: 5 },
    { routineIds: [], playlistIds: [], scheduleIds: ['routine-date'] },
  ), /Schedule "routine-date" references missing routine "missing"/);
});