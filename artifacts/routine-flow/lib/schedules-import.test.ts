/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeImportedSchedules, type RoutineSchedule } from './schedules';

function schedule(
  id: string,
  targetType: 'routine' | 'playlist',
  targetId: string,
  scheduledAt: string,
  overrides?: RoutineSchedule['playlistOverride'],
): RoutineSchedule {
  return {
    id,
    targetType,
    targetId,
    targetTitle: targetId,
    scheduledAt,
    reminder: true,
    alertOffsetsMinutes: [60],
    notificationId: 'old-notification',
    notifications: [{ id: 'old-notification', offsetMinutes: 60 }],
    ...(overrides ? { playlistOverride: overrides } : {}),
  };
}

test('schedule restore remaps targets, keeps local duplicates, and drops device notification IDs', () => {
  const existing = schedule('local', 'routine', 'routine-1', '2035-05-02T10:00:00.000Z');
  const duplicate = schedule('archived-same', 'routine', 'archived-routine', '2035-05-02T10:00:00.000Z');
  const conflicting = schedule('local', 'playlist', 'archived-playlist', '2035-05-03T10:00:00.000Z', {
    title: 'Travel version',
    routineIds: ['archived-routine'],
    skillIds: ['archived-skill'],
  });
  const imported = mergeImportedSchedules(
    [existing],
    [duplicate, conflicting],
    { 'archived-routine': 'routine-1' },
    { 'archived-playlist': 'playlist-1' },
    { 'archived-skill': 'skill-1' },
    () => 'imported-schedule',
  );

  assert.equal(imported.skipped, 1);
  assert.equal(imported.renamed, 1);
  assert.equal(imported.schedules.length, 2);
  assert.equal(imported.schedules[0].id, 'local');
  assert.equal(imported.schedules[0].reminder, true);
  assert.equal(imported.schedules[1].id, 'imported-schedule');
  assert.equal(imported.schedules[1].targetId, 'playlist-1');
  assert.deepEqual(imported.schedules[1].playlistOverride, {
    title: 'Travel version',
    routineIds: ['routine-1'],
    skillIds: ['skill-1'],
  });
  assert.equal(imported.schedules[1].reminder, false);
  assert.equal(imported.schedules[1].notificationId, undefined);
  assert.equal(imported.schedules[1].notifications, undefined);
  assert.equal(imported.added[0].reminder, true);

  const repeated = mergeImportedSchedules(
    imported.schedules,
    [conflicting],
    { 'archived-routine': 'routine-1' },
    { 'archived-playlist': 'playlist-1' },
    { 'archived-skill': 'skill-1' },
    () => 'second-import',
  );
  assert.equal(repeated.added.length, 0);
  assert.equal(repeated.skipped, 1);
});
