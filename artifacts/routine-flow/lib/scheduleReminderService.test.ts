import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createScheduleReminderService,
  type ScheduleReminderNotifications,
} from './scheduleReminderService';
import type { RoutineSchedule } from './schedules';

type NotificationRequest = Parameters<ScheduleReminderNotifications['scheduleNotificationAsync']>[0];

function notificationApi(options: {
  initialPermission?: boolean;
  requestedPermission?: boolean;
} = {}) {
  const requests: NotificationRequest[] = [];
  const permissions: string[] = [];
  let permissionGranted = options.initialPermission ?? true;
  const api = {
    SchedulableTriggerInputTypes: { DATE: 'date' },
    getPermissionsAsync: async () => {
      permissions.push('get');
      return { granted: permissionGranted };
    },
    requestPermissionsAsync: async () => {
      permissions.push('request');
      permissionGranted = options.requestedPermission ?? false;
      return { granted: permissionGranted };
    },
    scheduleNotificationAsync: async (request: NotificationRequest) => {
      requests.push(request);
      return `native-${requests.length}`;
    },
    cancelScheduledNotificationAsync: async () => undefined,
  } as unknown as ScheduleReminderNotifications;
  return { api, requests, permissions };
}

function schedule(targetType: 'routine' | 'playlist', id: string): RoutineSchedule {
  return {
    id,
    targetType,
    targetId: `${targetType}-target-${id}`,
    targetTitle: targetType === 'routine' ? 'Morning Reset' : 'Travel list',
    scheduledAt: '2090-06-01T10:00:00.000Z',
    reminder: true,
    alertOffsetsMinutes: [0, 60],
  };
}

for (const platform of ['android', 'ios']) {
  test(`restored ${platform} reminders carry the owner and exact schedule destination`, async () => {
    const { api, requests, permissions } = notificationApi();
    const reminderService = createScheduleReminderService('alex', platform, api);
    const routine = schedule('routine', 'morning');
    const playlist = schedule('playlist', 'travel');

    const routineNotification = await reminderService.create(routine, 60);
    const playlistNotification = await reminderService.create(playlist, 0);

    assert.deepEqual(permissions, ['get', 'get']);
    assert.equal(routineNotification, 'native-1');
    assert.equal(playlistNotification, 'native-2');
    const routineRequest = requests[0];
    const playlistRequest = requests[1];
    assert.ok(routineRequest);
    assert.ok(playlistRequest);
    assert.equal(routineRequest.content.title, 'Upcoming routine');
    assert.equal(routineRequest.content.body?.includes('Morning Reset'), true);
    assert.deepEqual(routineRequest.content.data, {
      scheduleId: 'morning',
      alertOffsetMinutes: 60,
      personId: 'alex',
    });
    assert.deepEqual(routineRequest.trigger, {
      type: 'date',
      date: new Date(Date.parse(routine.scheduledAt) - 60 * 60000),
    });
    assert.equal(playlistRequest.content.title, 'Time for your playlist');
    assert.equal(playlistRequest.content.body?.includes('Travel list'), true);
    assert.deepEqual(playlistRequest.content.data, {
      scheduleId: 'travel',
      alertOffsetMinutes: 0,
      personId: 'alex',
    });
    assert.equal('identifier' in routineRequest, false);
    assert.equal('identifier' in playlistRequest, false);
  });
}

test('native restore requests permission when needed and schedules only after it is granted', async () => {
  const { api, requests, permissions } = notificationApi({
    initialPermission: false,
    requestedPermission: true,
  });
  const reminderService = createScheduleReminderService('me', 'android', api);

  await reminderService.create(schedule('routine', 'morning'));

  assert.deepEqual(permissions, ['get', 'request']);
  assert.equal(requests.length, 1);
});

test('a denied permission rejects registration before creating any alert', async () => {
  const { api, requests, permissions } = notificationApi({
    initialPermission: false,
    requestedPermission: false,
  });
  const reminderService = createScheduleReminderService('me', 'ios', api);

  await assert.rejects(reminderService.create(schedule('playlist', 'travel')), /Enable notifications/);

  assert.deepEqual(permissions, ['get', 'request']);
  assert.deepEqual(requests, []);
});

test('the web service cannot create phone alerts', async () => {
  const { api, requests, permissions } = notificationApi();
  const reminderService = createScheduleReminderService('web', 'web', api);

  await assert.rejects(reminderService.create(schedule('routine', 'morning')), /unavailable in the web preview/);

  assert.deepEqual(permissions, []);
  assert.deepEqual(requests, []);
});
