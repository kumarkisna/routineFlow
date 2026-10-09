import assert from 'node:assert/strict';
import test from 'node:test';
import { restoreScheduleReminders } from './restoreScheduleReminders';
import { persistScheduleChange, type RoutineSchedule } from './schedules';

function makeSchedule(id: string, targetType: 'routine' | 'playlist', targetId: string, targetTitle: string): RoutineSchedule {
  return {
    id,
    targetType,
    targetId,
    targetTitle,
    scheduledAt: '2090-06-01T10:00:00.000Z',
    reminder: true,
    alertOffsetsMinutes: [0, 60],
    notificationId: `backup-${id}`,
    notifications: [{ id: `backup-${id}`, offsetMinutes: 0 }],
  };
}

function restoredProfile(
  personId: string,
  schedulesToRestore: RoutineSchedule[],
  existingSchedules: RoutineSchedule[] = [],
) {
  return {
    profile: { id: personId },
    snapshot: {
      schedules: [
        ...existingSchedules,
        ...schedulesToRestore.map(schedule => ({
          ...schedule,
          reminder: false,
          notificationId: undefined,
          notifications: undefined,
        })),
      ],
    },
    schedulesToEnable: schedulesToRestore.map(schedule => ({
      ...schedule,
      notificationId: undefined,
      notifications: undefined,
    })),
  };
}

function storedProfiles(
  profiles: ReturnType<typeof restoredProfile>[],
) {
  const values = new Map(profiles.map(({ profile, snapshot }) => [
    profile.id,
    JSON.parse(JSON.stringify(snapshot.schedules)) as RoutineSchedule[],
  ]));
  const writes: string[] = [];
  return {
    values,
    writes,
    createStorage: (personId: string) => ({
      getItem: async () => JSON.stringify(values.get(personId) ?? []),
      setItem: async (key: string, value: string) => {
        assert.equal(key, '@routine-flow/schedules');
        writes.push(personId);
        values.set(personId, JSON.parse(value) as RoutineSchedule[]);
      },
    }),
  };
}

for (const platform of ['android', 'ios']) {
  test(`all-profile restore recreates routine and playlist alerts for the right people on ${platform}`, async () => {
    const local = makeSchedule('local-schedule', 'routine', 'local-routine', 'Local routine');
    local.notificationId = 'existing-device-alert';
    local.notifications = [{ id: 'existing-device-alert', offsetMinutes: 0 }];
    const restoredRoutine = makeSchedule('restored-routine', 'routine', 'routine-2', 'Morning Reset');
    const restoredPlaylist = makeSchedule('restored-playlist', 'playlist', 'playlist-2', 'Travel list');
    const profiles = [
      restoredProfile('me', [restoredRoutine], [local]),
      restoredProfile('alex', [restoredPlaylist]),
    ];
    const state = storedProfiles(profiles);
    const created: { personId: string; schedule: RoutineSchedule; offset: number }[] = [];
    let notificationNumber = 0;

    const remindersLeftOff = await restoreScheduleReminders({
      profiles,
      existingSchedules: [local],
      platform,
      createStorage: state.createStorage,
      createReminderService: personId => ({
        create: async (schedule, offset = 0) => {
          created.push({ personId, schedule, offset });
          return `native-${++notificationNumber}`;
        },
        cancel: async () => assert.fail('Restoring imported schedules must not cancel existing profile alerts.'),
      }),
    });

    assert.equal(remindersLeftOff, 0);
    assert.deepEqual(created.map(({ personId, schedule, offset }) => [personId, schedule.id, schedule.targetType, schedule.targetId, schedule.targetTitle, offset]), [
      ['me', 'restored-routine', 'routine', 'routine-2', 'Morning Reset', 0],
      ['me', 'restored-routine', 'routine', 'routine-2', 'Morning Reset', 60],
      ['alex', 'restored-playlist', 'playlist', 'playlist-2', 'Travel list', 0],
      ['alex', 'restored-playlist', 'playlist', 'playlist-2', 'Travel list', 60],
    ]);
    assert.equal(new Set(created.map(({ schedule, offset }) => `${schedule.id}:${offset}`)).size, created.length);

    const meSchedules = state.values.get('me')!;
    expectImportedSchedule(meSchedules, 'restored-routine', ['native-1', 'native-2']);
    assert.deepEqual(meSchedules.find(schedule => schedule.id === 'local-schedule'), local);
    expectImportedSchedule(state.values.get('alex')!, 'restored-playlist', ['native-3', 'native-4']);
    assert.deepEqual(state.writes, ['me', 'alex']);
  });
}

test('a denied reminder stays off and can be enabled later when permission is available', async () => {
  const incoming = makeSchedule('restored-routine', 'routine', 'routine-2', 'Morning Reset');
  const profiles = [restoredProfile('me', [incoming])];
  const state = storedProfiles(profiles);
  let attempts = 0;

  const remindersLeftOff = await restoreScheduleReminders({
    profiles,
    existingSchedules: [],
    platform: 'android',
    createStorage: state.createStorage,
    createReminderService: () => ({
      create: async () => {
        attempts++;
        throw new Error('Enable notifications in your phone settings.');
      },
      cancel: async () => undefined,
    }),
  });

  assert.equal(attempts, 1);
  assert.equal(remindersLeftOff, 1);
  const imported = state.values.get('me')![0];
  assert.equal(imported.reminder, false);
  assert.equal(imported.targetId, incoming.targetId);
  assert.equal(imported.notificationId, undefined);
  assert.equal(imported.notifications, undefined);
  assert.deepEqual(state.writes, []);

  const enabled = await persistScheduleChange(
    state.createStorage('me'),
    '@routine-flow/schedules',
    state.values.get('me')!,
    { ...imported, reminder: true },
    imported.id,
    {
      create: async (_schedule, offset = 0) => `after-permission-${offset}`,
      cancel: async () => undefined,
    },
  );
  assert.equal(enabled[0].reminder, true);
  assert.deepEqual(enabled[0].notifications, [
    { id: 'after-permission-0', offsetMinutes: 0 },
    { id: 'after-permission-60', offsetMinutes: 60 },
  ]);
  assert.deepEqual(state.writes, ['me']);
});

test('iOS pending-notification limits leave imported alerts off without registering any', async () => {
  const incoming = makeSchedule('restored-playlist', 'playlist', 'playlist-2', 'Travel list');
  const profiles = [restoredProfile('me', [incoming])];
  const state = storedProfiles(profiles);
  const existingSchedules = Array.from({ length: 5 }, (_, index) => ({
    ...makeSchedule(`existing-${index}`, 'routine', `routine-${index}`, `Existing ${index}`),
    alertOffsetsMinutes: Array.from({ length: 12 }, (_, offset) => offset * 15),
  }));
  let attempts = 0;

  const remindersLeftOff = await restoreScheduleReminders({
    profiles,
    existingSchedules,
    platform: 'ios',
    createStorage: state.createStorage,
    createReminderService: () => ({
      create: async () => {
        attempts++;
        return `native-${attempts}`;
      },
      cancel: async () => undefined,
    }),
  });

  assert.equal(remindersLeftOff, 1);
  assert.equal(attempts, 0);
  const imported = state.values.get('me')![0];
  assert.equal(imported.reminder, false);
  assert.equal(imported.targetId, incoming.targetId);
  assert.equal(imported.notificationId, undefined);
  assert.equal(imported.notifications, undefined);
  assert.deepEqual(state.writes, []);
});

test('web restore leaves imported reminders off and never requests a phone notification', async () => {
  const incoming = makeSchedule('restored-routine', 'routine', 'routine-2', 'Morning Reset');
  const profiles = [restoredProfile('me', [incoming])];
  const state = storedProfiles(profiles);
  let serviceRequested = false;

  const remindersLeftOff = await restoreScheduleReminders({
    profiles,
    existingSchedules: [],
    platform: 'web',
    createStorage: state.createStorage,
    createReminderService: () => {
      serviceRequested = true;
      throw new Error('The web platform must not create a phone reminder service.');
    },
  });

  assert.equal(remindersLeftOff, 1);
  assert.equal(serviceRequested, false);
  assert.equal(state.values.get('me')![0].reminder, false);
  assert.deepEqual(state.writes, []);
});

function expectImportedSchedule(schedules: RoutineSchedule[], id: string, notificationIds: string[]) {
  const schedule = schedules.find(item => item.id === id);
  assert.ok(schedule);
  assert.equal(schedule.reminder, true);
  assert.deepEqual(schedule.notifications?.map(notification => notification.id), notificationIds);
  assert.deepEqual(schedule.notifications?.map(notification => notification.offsetMinutes), [0, 60]);
  assert.equal(schedule.notificationId, notificationIds[0]);
  assert.equal(schedule.notifications?.some(notification => notification.id.startsWith('backup-')), false);
}
