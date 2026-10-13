/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergePersonRestore, type PersonRestoreSnapshot } from './personRestore';
import type { AllPeopleBackup } from './routineTransfer';

const activeProfile = {
  id: 'me',
  name: 'Me',
  speechVoiceId: null,
  defaultRateSkillsAtPlaylistEnd: true,
  defaultPlaylistReminderSettings: { stepCompletion: false, routineCompletion: false },
  defaultSpeakRoutineDescription: true,
};
const day = '2026-10-01';

function routine(id: string, title: string, skillId: string) {
  return {
    id,
    title,
    subtitle: '',
    icon: 'sunny-outline',
    tone: 'coral' as const,
    createdAt: '2026-09-01T08:00:00.000Z',
    skillIds: [skillId],
    steps: [{ id: 'water', title: 'Drink water', durationSeconds: 60, skillIds: [skillId] }],
  };
}

function skill(id: string, name: string, ratingId: string, note: string) {
  return {
    id,
    name,
    ratings: [{
      id: ratingId,
      rating: 7,
      ratedAt: '2026-09-30T10:00:00.000Z',
      routineTitle: 'Practice',
      note,
    }],
  };
}

function backup(includeProgress = true): AllPeopleBackup {
  const profile = {
    ...activeProfile,
    defaultRateSkillsAtPlaylistEnd: false,
    defaultPlaylistReminderSettings: { stepCompletion: true, routineCompletion: true },
    defaultSpeakRoutineDescription: false,
  };
  return {
    activePersonId: 'me',
    people: [{
      profile,
      backup: {
        routines: [routine('same', 'Backup routine', 'backup-focus')],
        skills: [skill('backup-focus', 'Focus', 'backup-rating', 'Backup reflection.')],
        ...(includeProgress ? { progress: { [day]: { 'same:water': true } } } : {}),
        personData: {
          playlists: [{
            id: 'backup-list',
            title: 'Backup playlist',
            routineIds: ['same'],
            skillIds: ['backup-focus'],
            rateSkillsAtPlaylistEnd: true,
            reminderSettings: { stepCompletion: false, routineCompletion: false },
          }],
          schedules: [{
            id: 'backup-schedule',
            targetType: 'routine',
            targetId: 'same',
            targetTitle: 'Backup routine',
            scheduledAt: '2035-10-01T10:00:00.000Z',
            reminder: true,
            alertOffsetsMinutes: [60],
            notificationId: 'stale-notification-id',
            notifications: [{ id: 'stale-notification-id', offsetMinutes: 60 }],
          }],
          selectedThemeId: 'routine-flow',
          skillRatingWindow: 7,
        },
      },
    }],
  };
}

function currentSnapshot(): PersonRestoreSnapshot {
  return {
    routines: [routine('same', 'Local routine', 'local-focus')],
    playlists: [],
    schedules: [],
    skills: [skill('local-focus', 'Focus', 'local-rating', 'Local reflection.')],
    skillRatingWindow: 3,
    progress: { [day]: { 'same:water': false } },
    selectedThemeId: 'routine-flow',
  };
}

test('all-profile restore adds conflicting routine copies and merges skill reflections without losing local history', () => {
  const current = currentSnapshot();
  const imported = backup();
  const result = mergePersonRestore(current, imported.people[0].profile, imported.people[0], true);

  assert.equal(result.profile.defaultRateSkillsAtPlaylistEnd, false);
  assert.deepEqual(result.snapshot.skills[0].ratings?.map(item => [item.id, item.note]), [
    ['local-rating', 'Local reflection.'],
    ['backup-rating', 'Backup reflection.'],
  ]);
  assert.equal(result.snapshot.skillRatingWindow, 7);
  assert.equal(result.snapshot.routines.length, 2);
  assert.equal(result.snapshot.routines[0].title, 'Local routine');
  assert.equal(result.snapshot.routines[1].title, 'Backup routine');
  assert.equal(result.snapshot.routines[1].skillIds?.[0], 'local-focus');
  assert.equal(result.snapshot.playlists[0].routineIds[0], result.snapshot.routines[1].id);
  assert.equal(result.snapshot.playlists[0].skillIds?.[0], 'local-focus');
  assert.equal(result.snapshot.progress[day]['same:water'], false);
  assert.equal(result.snapshot.progress[day][`${result.snapshot.routines[1].id}:water`], true);
  assert.equal(result.schedulesToEnable.length, 1);
  assert.equal(result.schedulesToEnable[0].targetId, result.snapshot.routines[1].id);
  assert.equal(result.schedulesToEnable[0].notificationId, undefined);
  assert.equal(result.snapshot.schedules[0].reminder, false);
  assert.equal(result.counts.progressAdded, 1);
  assert.equal(current.skills[0].ratings?.length, 1);
  assert.equal(current.routines[0].title, 'Local routine');
});

test('all-profile restore can leave imported progress out while preserving local progress', () => {
  const current = currentSnapshot();
  const imported = backup(false);
  const result = mergePersonRestore(current, imported.people[0].profile, imported.people[0], false);

  assert.deepEqual(result.snapshot.progress, current.progress);
  assert.equal(result.counts.progressAdded, 0);
  assert.equal(result.counts.progressKept, 0);
});
