import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alertDate, DEFAULT_ALERT_MINUTES, formatAlertOffset, futureScheduleAlerts, MAX_SCHEDULE_ALERTS,
  scheduleAlertContent, scheduleAlertOffsets, scheduleNotificationRecords, validateAlertOffsets,
} from './scheduleAlerts';
import { copyScheduleForDate, editScheduledPlaylist, parseSchedules, persistScheduleChange, type RoutineSchedule } from './schedules';

const now = Date.now();
const at = new Date(now + 7 * 86400000).toISOString();
const base: RoutineSchedule = {
  id: 'appointment', targetType: 'playlist', targetId: 'playlist', targetTitle: 'Morning playlist',
  scheduledAt: at, reminder: true, alertOffsetsMinutes: [0, 15, 60],
};

function fixture(initial: RoutineSchedule[] = []) {
  let value = JSON.stringify(initial);
  let serial = 0;
  const pending = new Map(initial.flatMap(s => scheduleNotificationRecords(s).map(n => [n.id, n.offsetMinutes] as const)));
  const events: { action: string; id: string; offset?: number; at?: number }[] = [];
  const storage = {
    getItem: async () => value,
    setItem: async (_key: string, next: string) => { value = next; },
  };
  const reminders = {
    create: async (s: RoutineSchedule, offset = 0) => {
      const id = s.notificationId ?? `new-${++serial}`;
      events.push({ action: 'create', id, offset, at: alertDate(s, offset).getTime() });
      pending.set(id, offset);
      return id;
    },
    cancel: async (id: string) => { events.push({ action: 'cancel', id }); pending.delete(id); },
  };
  return { storage, reminders, pending, events, stored: () => parseSchedules(value) };
}

test('new schedules start with three slots, with a twelve-alert limit per appointment', () => {
  assert.deepEqual(DEFAULT_ALERT_MINUTES, [0, 15, 60]);
  assert.equal(MAX_SCHEDULE_ALERTS, 12);
  validateAlertOffsets([0]);
  validateAlertOffsets(Array.from({ length: 12 }, (_, i) => i * 15));
  for (const offsets of [[], Array.from({ length: 13 }, (_, i) => i), [0, 0], [-1], [0.5], [Infinity], [NaN], ['15'], null, [Number.MAX_SAFE_INTEGER]]) {
    assert.throws(() => validateAlertOffsets(offsets));
  }
});
test('minute, hour and day lead times subtract exact elapsed time from the fixed appointment instant', () => {
  for (const offset of [0, 15, 60, 1440, 2880]) {
    assert.equal(alertDate(base, offset).getTime(), Date.parse(at) - offset * 60000);
  }
  assert.equal(formatAlertOffset(0), 'At start');
  assert.equal(formatAlertOffset(30), '30 min before');
  assert.equal(formatAlertOffset(60), '1 hour before');
  assert.equal(formatAlertOffset(120), '2 hours before');
  assert.equal(formatAlertOffset(1440), '1 day before');
  assert.equal(formatAlertOffset(2880), '2 days before');
});
test('legacy schedules keep a single start-time reminder and legacy ID', () => {
  const legacy = { ...base, alertOffsetsMinutes: undefined, notificationId: 'legacy-id' };
  assert.deepEqual(scheduleAlertOffsets(legacy), [0]);
  assert.deepEqual(scheduleNotificationRecords(legacy), [{ id: 'legacy-id', offsetMinutes: 0 }]);
  assert.deepEqual(futureScheduleAlerts(legacy, now), [0]);
  assert.equal(parseSchedules(JSON.stringify([legacy]))[0].notificationId, 'legacy-id');
});
test('elapsed advance alerts are excluded when updating existing appointments, and disabled reminders never fire', () => {
  const soon = { ...base, scheduledAt: new Date(now + 30 * 60000).toISOString() };
  assert.deepEqual(futureScheduleAlerts(soon, now), [0, 15]);
  assert.deepEqual(futureScheduleAlerts({ ...soon, reminder: false }, now), []);
  assert.deepEqual(futureScheduleAlerts({ ...soon, scheduledAt: new Date(now - 1).toISOString() }, now), []);
});
for (const targetType of ['routine', 'playlist'] as const) {
  test(`${targetType} notifications include the source name, lead time, and tap destination`, () => {
    const schedule = { ...base, targetType };
    const early = scheduleAlertContent(schedule, 60);
    assert.equal(early.title, `Upcoming ${targetType}`);
    assert.match(early.body, /Morning playlist/);
    assert.match(early.body, /1 hour before/);
    assert.match(early.body, /Starts/);
    assert.deepEqual(early.data, { scheduleId: schedule.id, alertOffsetMinutes: 60 });
    assert.equal(early.sound, 'default');
    const start = scheduleAlertContent(schedule, 0);
    assert.equal(start.title, `Time for your ${targetType}`);
    assert.match(start.body, /scheduled now/);
  });
  test(`${targetType} saves all three independent notifications and retains configuration after reload`, async () => {
    const schedule = { ...base, targetType };
    const f = fixture();
    const next = await persistScheduleChange(f.storage, 'key', [], schedule, schedule.id, f.reminders);
    assert.deepEqual(next[0].notifications?.map(n => n.offsetMinutes), [0, 15, 60]);
    assert.equal(new Set(next[0].notifications?.map(n => n.id)).size, 3);
    assert.equal(next[0].notificationId, next[0].notifications?.[0].id);
    assert.deepEqual(f.events.map(e => e.at), [0, 15, 60].map(m => Date.parse(at) - m * 60000));
    assert.deepEqual(f.stored(), next);
  });
}
test('two appointments can each have twelve alerts; the limit is not global', async () => {
  const schedule = { ...base, alertOffsetsMinutes: Array.from({ length: 12 }, (_, i) => i * 15) };
  const f = fixture();
  const first = await persistScheduleChange(f.storage, 'key', [], schedule, schedule.id, f.reminders);
  const second = await persistScheduleChange(f.storage, 'key', first, { ...schedule, id: 'second' }, 'second', f.reminders);
  assert.equal(second.length, 2);
  assert.equal(f.pending.size, 24);
  assert.deepEqual(second[0], first[0]);
  assert.equal(second[1].notifications?.length, 12);
});
test('over-limit or duplicate offsets are rejected before cancelling existing notifications', async () => {
  const original = { ...base, notificationId: 'old', notifications: [{ id: 'old', offsetMinutes: 0 }] };
  const f = fixture([original]);
  for (const offsets of [Array.from({ length: 13 }, (_, i) => i), [0, 0]]) {
    await assert.rejects(persistScheduleChange(f.storage, 'key', [original],
      { ...base, alertOffsetsMinutes: offsets }, base.id, f.reminders));
  }
  assert.deepEqual(f.events, []);
  assert.deepEqual(f.stored(), [original]);
});
test('rescheduling replaces all alerts before exceeding the native pending capacity; sibling alerts stay intact', async () => {
  const original = { ...base, notificationId: 'old-0', notifications: [
    { id: 'old-0', offsetMinutes: 0 }, { id: 'old-15', offsetMinutes: 15 }, { id: 'old-60', offsetMinutes: 60 },
  ] };
  const sibling = { ...original, id: 'sibling', notificationId: 'sibling-0', notifications: [{ id: 'sibling-0', offsetMinutes: 0 }] };
  const f = fixture([original, sibling]);
  const moved = { ...base, scheduledAt: new Date(Date.parse(at) + 86400000).toISOString() };
  const next = await persistScheduleChange(f.storage, 'key', [original, sibling], moved, base.id, f.reminders);
  assert.deepEqual(f.events.slice(0, 3).map(e => e.action), ['cancel', 'cancel', 'cancel']);
  assert.deepEqual(f.events.slice(3).map(e => e.offset), [0, 15, 60]);
  assert.deepEqual(next[1], sibling);
  assert.equal(f.pending.has('sibling-0'), true);
  for (const id of ['old-0', 'old-15', 'old-60']) assert.equal(f.pending.has(id), false);
  assert.deepEqual(next[0].alertOffsetsMinutes, base.alertOffsetsMinutes);
  assert.deepEqual(f.stored(), next);
});
test('copying alert settings creates independent arrays and notification IDs without cancelling the source', async () => {
  const f = fixture();
  const first = await persistScheduleChange(f.storage, 'key', [], base, base.id, f.reminders);
  const source = first[0];
  const copy = copyScheduleForDate(source, new Date(Date.parse(at) + 86400000).toISOString(), 'copy');
  assert.notEqual(copy.alertOffsetsMinutes, source.alertOffsetsMinutes);
  assert.deepEqual(copy.alertOffsetsMinutes, source.alertOffsetsMinutes);
  assert.equal(copy.notificationId, undefined);
  assert.equal(copy.notifications, undefined);
  f.events.length = 0;
  const next = await persistScheduleChange(f.storage, 'key', first, copy, copy.id, f.reminders);
  assert.deepEqual(next[0], source);
  assert.equal(f.events.some(e => e.action === 'cancel'), false);
  assert.equal(f.pending.size, 6);
  assert.equal(next[1].notifications?.some(n => source.notifications?.some(old => n.id === old.id)), false);
  copy.alertOffsetsMinutes!.push(120);
  assert.deepEqual(source.alertOffsetsMinutes, [0, 15, 60]);
});
test('turning alerts off cancels every native ID but keeps the lead times for later', async () => {
  const f = fixture();
  const first = await persistScheduleChange(f.storage, 'key', [], base, base.id, f.reminders);
  const next = await persistScheduleChange(f.storage, 'key', first, { ...first[0], reminder: false }, base.id, f.reminders);
  assert.equal(f.pending.size, 0);
  assert.equal(next[0].notificationId, undefined);
  assert.deepEqual(next[0].notifications, []);
  assert.deepEqual(next[0].alertOffsetsMinutes, base.alertOffsetsMinutes);
  assert.deepEqual(f.stored(), JSON.parse(JSON.stringify(next)));
});
test('deleting an appointment removes all its notifications but not a sibling reminder', async () => {
  const f = fixture();
  const first = await persistScheduleChange(f.storage, 'key', [], base, base.id, f.reminders);
  const sibling = { ...base, id: 'sibling' };
  const all = await persistScheduleChange(f.storage, 'key', first, sibling, sibling.id, f.reminders);
  const next = await persistScheduleChange(f.storage, 'key', all, null, base.id, f.reminders);
  assert.deepEqual(next, [all[1]]);
  assert.equal(f.pending.size, 3);
  for (const n of first[0].notifications!) assert.equal(f.pending.has(n.id), false);
});
test('failed storage writes restore every old notification with the SAME ID and correct offset', async () => {
  const f = fixture();
  const first = await persistScheduleChange(f.storage, 'key', [], base, base.id, f.reminders);
  const original = first[0];
  f.storage.setItem = async () => { throw new Error('Disk full'); };
  await assert.rejects(persistScheduleChange(f.storage, 'key', first,
    { ...base, alertOffsetsMinutes: [0, 30, 120] }, base.id, f.reminders), /Disk full/);
  assert.deepEqual(f.stored(), first);
  assert.deepEqual([...f.pending], original.notifications!.map(n => [n.id, n.offsetMinutes]));
  assert.deepEqual(f.events.slice(-3).map(e => [e.id, e.offset]), original.notifications!.map(n => [n.id, n.offsetMinutes]));
});
test('failure partway through notification creation cleans partial alerts and restores the old set', async () => {
  const f = fixture();
  const first = await persistScheduleChange(f.storage, 'key', [], base, base.id, f.reminders);
  const create = f.reminders.create;
  f.reminders.create = async (s, offset = 0) => {
    if (!s.notificationId && offset === 120) throw new Error('Native scheduling failed');
    return create(s, offset);
  };
  await assert.rejects(persistScheduleChange(f.storage, 'key', first,
    { ...base, alertOffsetsMinutes: [0, 120, 1440] }, base.id, f.reminders), /Native scheduling failed/);
  assert.deepEqual(f.stored(), first);
  assert.deepEqual([...f.pending], first[0].notifications!.map(n => [n.id, n.offsetMinutes]));
});
test('partial cancellation failure restores already-cancelled old reminders and adds no new alerts', async () => {
  const f = fixture();
  const first = await persistScheduleChange(f.storage, 'key', [], base, base.id, f.reminders);
  const cancel = f.reminders.cancel;
  f.reminders.cancel = async id => {
    if (id === first[0].notifications![1].id) throw new Error('Cancel failed');
    return cancel(id);
  };
  await assert.rejects(persistScheduleChange(f.storage, 'key', first, base, base.id, f.reminders), /Cancel failed/);
  assert.deepEqual(f.stored(), first);
  assert.equal(f.pending.size, 3);
  assert.equal(f.pending.has(first[0].notifications![0].id), true);
});
test('a confirmed late storage rejection keeps all newly saved alerts rather than restoring the old set', async () => {
  const f = fixture();
  const first = await persistScheduleChange(f.storage, 'key', [], base, base.id, f.reminders);
  const setItem = f.storage.setItem;
  f.storage.setItem = async (key, value) => { await setItem(key, value); throw new Error('Late failure'); };
  const next = await persistScheduleChange(f.storage, 'key', first, { ...base, alertOffsetsMinutes: [0, 30] }, base.id, f.reminders);
  assert.equal(f.pending.size, 2);
  assert.deepEqual(f.stored(), next);
  for (const n of first[0].notifications!) assert.equal(f.pending.has(n.id), false);
});
test('failed notification recovery is explicit and requires a restart, not a false success', async () => {
  const f = fixture();
  const first = await persistScheduleChange(f.storage, 'key', [], base, base.id, f.reminders);
  const create = f.reminders.create;
  f.reminders.create = async (s, offset = 0) => {
    if (s.notificationId) throw new Error('Permission revoked');
    return create(s, offset);
  };
  f.storage.setItem = async () => { throw new Error('Disk full'); };
  await assert.rejects(persistScheduleChange(f.storage, 'key', first, base, base.id, f.reminders), /Restart the app/);
  assert.deepEqual(f.stored(), first);
});
test('date-only playlist edits retain alert timings and refresh notification content only for that date', async () => {
  const f = fixture();
  const first = await persistScheduleChange(f.storage, 'key', [], base, base.id, f.reminders);
  const custom = editScheduledPlaylist(first[0], 'Date-only morning', ['b', 'a', 'b']);
  assert.deepEqual(custom.alertOffsetsMinutes, [0, 15, 60]);
  assert.equal(custom.notifications, undefined);
  const next = await persistScheduleChange(f.storage, 'key', first, custom, custom.id, f.reminders);
  assert.equal(next[0].notifications?.length, 3);
  assert.match(scheduleAlertContent(next[0], 15).body, /Date-only morning/);
  assert.deepEqual(next[0].playlistOverride?.routineIds, ['b', 'a', 'b']);
});
test('invalid notification metadata fails explicitly rather than silently losing pending alerts', () => {
  for (const patch of [
    { alertOffsetsMinutes: {} }, { alertOffsetsMinutes: [] }, { notifications: 'bad' },
    { notifications: [{ id: 'a', offsetMinutes: -1 }] },
    { notifications: [{ id: 'a', offsetMinutes: 0 }, { id: 'a', offsetMinutes: 15 }] },
    { notifications: [{ id: 'a', offsetMinutes: 0 }, { id: 'b', offsetMinutes: 0 }] },
    { notifications: [{ id: 'a', offsetMinutes: 999 }] },
    { notificationId: 'orphan', notifications: [{ id: 'a', offsetMinutes: 0 }] },
  ]) assert.throws(() => parseSchedules(JSON.stringify([{ ...base, ...patch }])), /could not be read/);
});