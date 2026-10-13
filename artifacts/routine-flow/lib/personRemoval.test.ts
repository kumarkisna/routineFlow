/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PERSON_DATA_KEYS, personStorageKey } from './personStorage';
import { removePersonSavedData } from './personRemoval';
import type { RoutineSchedule } from './schedules';

const future = '2099-06-01T10:00:00.000Z';
const savedSchedule: RoutineSchedule = {
  id: 'appointment',
  targetType: 'routine',
  targetId: 'routine',
  targetTitle: 'Morning routine',
  scheduledAt: future,
  reminder: true,
  alertOffsetsMinutes: [0, 60],
  notificationId: 'first-reminder',
  notifications: [
    { id: 'first-reminder', offsetMinutes: 0 },
    { id: 'second-reminder', offsetMinutes: 60 },
  ],
};

function fixture() {
  const values = new Map<string, string>([
    [personStorageKey('person-1', PERSON_DATA_KEYS.routines), '[{"id":"one"}]'],
    [personStorageKey('person-1', PERSON_DATA_KEYS.schedules), JSON.stringify([savedSchedule])],
    [personStorageKey('person-1', PERSON_DATA_KEYS.progress), '{"day":{}}'],
    [personStorageKey('person-2', PERSON_DATA_KEYS.routines), '[{"id":"two"}]'],
    [personStorageKey('person-2', PERSON_DATA_KEYS.schedules), '[]'],
    [PERSON_DATA_KEYS.routines, '[{"id":"me"}]'],
  ]);
  const events: string[] = [];
  const storage = {
    getAllKeys: async () => [...values.keys()],
    getItem: async (key: string) => values.get(key) ?? null,
    multiRemove: async (keys: string[]) => {
      events.push('remove-data');
      for (const key of keys) values.delete(key);
    },
  };
  return { values, events, storage };
}

test('cancels only the selected person’s reminders before removing their saved data', async () => {
  const f = fixture();
  const cancelled: string[] = [];

  const result = await removePersonSavedData('person-1', f.storage, async id => {
    cancelled.push(id);
    f.events.push(`cancel:${id}`);
  });

  assert.deepEqual(cancelled, ['first-reminder', 'second-reminder']);
  assert.deepEqual(f.events, ['cancel:first-reminder', 'cancel:second-reminder', 'remove-data']);
  assert.equal(result.removedKeys, 3);
  assert.equal(result.cancelledReminders, 2);
  assert.equal(f.values.has(personStorageKey('person-1', PERSON_DATA_KEYS.routines)), false);
  assert.equal(f.values.has(personStorageKey('person-1', PERSON_DATA_KEYS.schedules)), false);
  assert.equal(f.values.has(personStorageKey('person-2', PERSON_DATA_KEYS.routines)), true);
  assert.equal(f.values.has(personStorageKey('person-2', PERSON_DATA_KEYS.schedules)), true);
  assert.equal(f.values.has(PERSON_DATA_KEYS.routines), true);
});

test('does not remove profile data when a reminder cannot be cancelled', async () => {
  const f = fixture();

  await assert.rejects(
    removePersonSavedData('person-1', f.storage, async () => { throw new Error('notification failure'); }),
    /saved data was kept/,
  );
  assert.equal(f.values.has(personStorageKey('person-1', PERSON_DATA_KEYS.routines)), true);
  assert.equal(f.events.includes('remove-data'), false);
});

test('does not remove data when schedules cannot be checked safely', async () => {
  const f = fixture();
  f.values.set(personStorageKey('person-1', PERSON_DATA_KEYS.schedules), '{invalid');
  let cancelCalls = 0;

  await assert.rejects(
    removePersonSavedData('person-1', f.storage, async () => { cancelCalls += 1; }),
    /could not be checked safely/,
  );
  assert.equal(cancelCalls, 0);
  assert.equal(f.values.has(personStorageKey('person-1', PERSON_DATA_KEYS.routines)), true);
});

test('protects the default profile and refuses to report partial storage removal as success', async () => {
  const f = fixture();
  await assert.rejects(removePersonSavedData('me', f.storage, async () => undefined), /default Me profile/);

  const incompleteStorage = {
    ...f.storage,
    multiRemove: async () => { throw new Error('storage failure'); },
  };
  await assert.rejects(
    removePersonSavedData('person-1', incompleteStorage, async () => undefined),
    /could not confirm/i,
  );
  assert.equal(f.values.has(personStorageKey('person-1', PERSON_DATA_KEYS.routines)), true);
  assert.equal(f.values.has(personStorageKey('person-2', PERSON_DATA_KEYS.routines)), true);
});
