import assert from 'node:assert/strict';
import test from 'node:test';
import { copyScheduleForDate, editScheduledPlaylist, keepScheduledPlaylistOverride, localDateString, localTimeString, parseSchedules,
  persistScheduleChange, scheduleDate, scheduledPlaylistSource, type RoutineSchedule } from './schedules';
import { alertDate, scheduleAlertContent } from './scheduleAlerts';
import { formatLocalDateTime, localDateTimeCandidates, localDateTimeOccurrence } from './localDateTime';

const future = new Date(Date.now() + 86400000).toISOString();
const entry: RoutineSchedule = {
  id: 's', targetType: 'routine', targetId: 'a', targetTitle: 'Morning',
  scheduledAt: future, reminder: true, notificationId: 'old-reminder',
};
test('schedule dates use local calendar/time and require a valid future moment', () => {
  const date = new Date(2032, 3, 5, 9, 30);
  assert.equal(localDateString(date), '2032-04-05');
  assert.equal(scheduleDate('2032-04-05', '09:30', date.getTime() - 1), date.toISOString());
  for (const [d, t] of [['2032-02-30', '09:30'], ['2032-04-05', '24:00'], ['2032-04-05', '09:60'], ['05/04/2032', '9:30']]) {
    assert.throws(() => scheduleDate(d, t, 0));
  }
  assert.throws(() => scheduleDate('2032-04-05', '09:30', date.getTime()));
});
test('fall-back repeated local times use and display the first occurrence, and reminders follow that instant', () => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const candidates = localDateTimeCandidates('2026-11-01', '01:30');
    assert.deepEqual(candidates.map(candidate => candidate.toISOString()), [
      '2026-11-01T05:30:00.000Z',
      '2026-11-01T06:30:00.000Z',
    ]);

    const scheduledAt = scheduleDate('2026-11-01', '01:30', Date.parse('2026-10-31T12:00:00-04:00'));
    assert.equal(scheduledAt, '2026-11-01T05:30:00.000Z');
    const firstOccurrence = new Date(scheduledAt);
    assert.equal(localTimeString(firstOccurrence), '01:30');
    assert.equal(localDateTimeOccurrence(firstOccurrence), 'first');
    assert.match(formatLocalDateTime(firstOccurrence, { hour: '2-digit', minute: '2-digit', hour12: false }), /01:30 \(first occurrence\)$/);

    const firstReminder = alertDate({ scheduledAt }, 15);
    assert.equal(firstReminder.toISOString(), '2026-11-01T05:15:00.000Z');
    assert.match(scheduleAlertContent({ ...entry, scheduledAt }, 15).body, /Starts .*first occurrence/);
    const secondOccurrence = new Date('2026-11-01T06:30:00.000Z');
    assert.equal(localDateTimeOccurrence(secondOccurrence), 'second');
    assert.equal(alertDate({ scheduledAt: secondOccurrence.toISOString() }, 15).toISOString(), '2026-11-01T06:15:00.000Z');
    assert.throws(() => scheduleDate('2026-03-08', '02:30', Date.parse('2026-03-07T12:00:00-05:00')));
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});
test('native picker local times stay in 24-hour format when saved, reopened, and rescheduled', async () => {
  for (const [hours, minutes] of [[17, 45], [0, 15]] as const) {
    const appointment = new Date();
    appointment.setDate(appointment.getDate() + 1);
    appointment.setHours(hours, minutes, 0, 0);

    const time = localTimeString(appointment);
    assert.equal(time, `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
    const scheduledAt = scheduleDate(localDateString(appointment), time);
    const original: RoutineSchedule = { ...entry, id: `time-${time}`, scheduledAt, reminder: false };
    const f = fixture([]);

    await persistScheduleChange(f.storage, 'key', [], original, original.id, f.reminders);
    const reopened = parseSchedules(JSON.stringify(f.stored()))[0];
    assert.equal(localTimeString(new Date(reopened.scheduledAt)), time);

    const rescheduledDate = new Date(appointment);
    rescheduledDate.setDate(rescheduledDate.getDate() + 1);
    const rescheduled = { ...reopened, scheduledAt: scheduleDate(localDateString(rescheduledDate), time) };
    await persistScheduleChange(f.storage, 'key', [reopened], rescheduled, reopened.id, f.reminders);
    const reopenedAgain = parseSchedules(JSON.stringify(f.stored()))[0];
    assert.equal(localTimeString(new Date(reopenedAgain.scheduledAt)), time);
  }
});
test('schedule parsing accepts routine and playlist references but rejects corrupt values', () => {
  const list = [entry, { ...entry, id: 'p', targetType: 'playlist' }];
  assert.deepEqual(parseSchedules(JSON.stringify(list)), list);
  assert.throws(() => parseSchedules('{}'));
  assert.throws(() => parseSchedules(JSON.stringify([{ ...entry, scheduledAt: 'broken' }])));
  assert.throws(() => parseSchedules(JSON.stringify([{ ...entry, targetType: 'unknown' }])));
});
test('date-only playlist versions survive parsing and malformed versions are rejected', () => {
  const custom: RoutineSchedule = {
    ...entry, targetType: 'playlist', playlistOverride: { title: 'Special day', routineIds: ['b', 'a', 'b'] },
  };
  assert.deepEqual(parseSchedules(JSON.stringify([custom])), [custom]);
  for (const playlistOverride of [null, {}, { title: '', routineIds: ['a'] },
    { title: 'Name', routineIds: [] }, { title: 'Name', routineIds: ['a', 3] },
    { title: 'Name', routineIds: Array(101).fill('a') }, { title: 'x'.repeat(101), routineIds: ['a'] },
    { title: 'Name', routineIds: ['a'], reminderSettings: { stepCompletion: 'yes', routineCompletion: false } }]) {
    assert.throws(() => parseSchedules(JSON.stringify([{ ...custom, playlistOverride }])));
  }
  assert.throws(() => parseSchedules(JSON.stringify([{ ...custom, targetType: 'routine' }])));
});
test('date-only editing owns a copied sequence and never changes the original playlist or sibling date', () => {
  const playlist = {
    id: 'p',
    title: 'Original',
    routineIds: ['a', 'b', 'a'],
    rateSkillsAtPlaylistEnd: true,
    reminderSettings: { stepCompletion: true, routineCompletion: false },
  };
  const scheduled: RoutineSchedule = { ...entry, targetType: 'playlist', targetId: 'p' };
  const sibling = { ...scheduled, id: 'second-date', scheduledAt: new Date(Date.parse(future) + 86400000).toISOString() };
  const ids = ['b', 'c', 'b'];
  const custom = editScheduledPlaylist(scheduled, '  Special day  ', ids, undefined, playlist.reminderSettings);
  ids.push('extra');
  assert.deepEqual(scheduledPlaylistSource(custom, [playlist])?.routineIds, ['b', 'c', 'b']);
  assert.equal(scheduledPlaylistSource(custom, [playlist])?.title, 'Special day');
  assert.equal(scheduledPlaylistSource(custom, [playlist])?.rateSkillsAtPlaylistEnd, true);
  assert.deepEqual(scheduledPlaylistSource(custom, [playlist])?.reminderSettings, playlist.reminderSettings);
  assert.deepEqual(scheduledPlaylistSource(sibling, [playlist]), playlist);
  assert.deepEqual(playlist, {
    id: 'p',
    title: 'Original',
    routineIds: ['a', 'b', 'a'],
    rateSkillsAtPlaylistEnd: true,
    reminderSettings: { stepCompletion: true, routineCompletion: false },
  });
  assert.equal(scheduled.playlistOverride, undefined);
  assert.equal(custom.scheduledAt, scheduled.scheduledAt);
  assert.equal(custom.id, scheduled.id);
  assert.equal(custom.targetId, scheduled.targetId);
  const resolved = scheduledPlaylistSource(custom, [playlist])!;
  resolved.routineIds.push('another');
  assert.deepEqual(custom.playlistOverride?.routineIds, ['b', 'c', 'b']);
  assert.deepEqual(custom.playlistOverride?.reminderSettings, playlist.reminderSettings);
});
test('a custom date ignores later original edits or deletion; uncustomized dates still follow the source', () => {
  const original = { id: 'p', title: 'Original', routineIds: ['a'] };
  const scheduled: RoutineSchedule = { ...entry, targetType: 'playlist', targetId: 'p' };
  const custom = editScheduledPlaylist(scheduled, 'Custom', ['b', 'b']);
  original.title = 'Updated original';
  original.routineIds = ['c'];
  assert.deepEqual(scheduledPlaylistSource(custom, [original])?.routineIds, ['b', 'b']);
  assert.deepEqual(scheduledPlaylistSource(scheduled, [original]), original);
  assert.equal(scheduledPlaylistSource(custom, [])?.title, 'Custom');
  assert.equal(scheduledPlaylistSource(custom, [])?.rateSkillsAtPlaylistEnd, true);
  assert.equal(scheduledPlaylistSource(scheduled, []), null);
});
test('rescheduling preserves a date-only version; changing the source discards it', () => {
  const scheduled: RoutineSchedule = { ...entry, targetType: 'playlist', targetId: 'p' };
  const custom = editScheduledPlaylist(scheduled, 'Custom', ['b', 'a', 'b']);
  const later = new Date(Date.parse(future) + 86400000).toISOString();
  const moved = keepScheduledPlaylistOverride(custom, { ...scheduled, scheduledAt: later });
  assert.deepEqual(moved.playlistOverride, custom.playlistOverride);
  assert.equal(moved.targetTitle, 'Custom');
  assert.equal(moved.scheduledAt, later);
  assert.equal(keepScheduledPlaylistOverride(custom, { ...scheduled, targetId: 'another' }).playlistOverride, undefined);
  assert.equal(keepScheduledPlaylistOverride(custom, { ...entry }).playlistOverride, undefined);
});
test('invalid or oversized date-only playlists are rejected without mutation', () => {
  const scheduled: RoutineSchedule = { ...entry, targetType: 'playlist' };
  assert.throws(() => editScheduledPlaylist(entry, 'Name', ['a']), /Only a scheduled playlist/);
  for (const [title, ids] of [['', ['a']], ['Name', []], ['x'.repeat(101), ['a']],
    ['Name', Array(101).fill('a')]] as [string, string[]][]) {
    assert.throws(() => editScheduledPlaylist(scheduled, title, ids));
  }
  assert.equal(scheduled.playlistOverride, undefined);
});

function fixture(initial: RoutineSchedule[]) {
  let value: string | null = JSON.stringify(initial);
  const events: string[] = [];
  const storage = {
    getItem: async () => value,
    setItem: async (_key: string, next: string) => { value = next; },
  };
  const reminders = {
    create: async (schedule: RoutineSchedule) => {
      const id = schedule.notificationId ?? 'new-reminder';
      events.push(`create:${id}`);
      return id;
    },
    cancel: async (id: string) => { events.push(`cancel:${id}`); },
  };
  return { storage, reminders, events, stored: () => JSON.parse(value!) as RoutineSchedule[] };
}
for (const targetType of ['routine', 'playlist'] as const) {
  test(`copying a past ${targetType} creates a separate future entry without changing or cancelling the previous one`, async () => {
    const source: RoutineSchedule = { ...entry, targetType, scheduledAt: new Date(Date.now() - 86400000).toISOString() };
    const copy = copyScheduleForDate(source, future, 'new-date');
    assert.equal(copy.id, 'new-date');
    assert.equal(copy.targetType, source.targetType);
    assert.equal(copy.targetId, source.targetId);
    assert.equal(copy.reminder, source.reminder);
    assert.equal(copy.notificationId, undefined);
    const f = fixture([source]);
    const next = await persistScheduleChange(f.storage, 'key', [source], copy, copy.id, f.reminders);
    assert.equal(next.length, 2);
    assert.deepEqual(next[0], source);
    assert.equal(next[1].scheduledAt, future);
    assert.equal(next[1].notificationId, 'new-reminder');
    assert.deepEqual(f.events, ['create:new-reminder']);
    assert.deepEqual(parseSchedules(JSON.stringify(f.stored())), next);
  });
}
test('copied date-only playlists preserve order/repeats but future edits to the copy cannot change their source', () => {
  const source = editScheduledPlaylist({ ...entry, targetType: 'playlist' }, 'Special day', ['b', 'a', 'b']);
  const copy = copyScheduleForDate(source, future, 'new-date', false);
  assert.deepEqual(copy.playlistOverride, source.playlistOverride);
  assert.notEqual(copy.playlistOverride, source.playlistOverride);
  assert.notEqual(copy.playlistOverride?.routineIds, source.playlistOverride?.routineIds);
  assert.equal(copy.targetTitle, 'Special day');
  assert.equal(copy.reminder, false);
  copy.playlistOverride!.routineIds.push('c');
  copy.playlistOverride!.title = 'Only the copy';
  assert.deepEqual(source.playlistOverride, { title: 'Special day', routineIds: ['b', 'a', 'b'] });
});
test('invalid copy destinations and reused schedule identifiers are rejected', () => {
  for (const at of ['broken', new Date(Date.now() - 1).toISOString()]) {
    assert.throws(() => copyScheduleForDate(entry, at, 'new-date'), /future/);
  }
  assert.throws(() => copyScheduleForDate(entry, future, entry.id), /new identifier/);
  assert.throws(() => copyScheduleForDate(entry, future, ''), /new identifier/);
});
test('copy save failures leave the source intact and clean up only the copy reminder', async () => {
  const f = fixture([entry]);
  f.storage.setItem = async () => { throw new Error('Disk full'); };
  const copy = copyScheduleForDate(entry, future, 'new-date');
  await assert.rejects(persistScheduleChange(f.storage, 'key', [entry], copy, copy.id, f.reminders), /Disk full/);
  assert.deepEqual(f.stored(), [entry]);
  assert.deepEqual(f.events, ['create:new-reminder', 'cancel:new-reminder']);
});
test('copies without phone reminders add no notifications and never cancel the source reminder', async () => {
  const f = fixture([entry]);
  const copy = copyScheduleForDate(entry, future, 'new-date', false);
  const next = await persistScheduleChange(f.storage, 'key', [entry], copy, copy.id, f.reminders);
  assert.equal(next[1].notificationId, undefined);
  assert.deepEqual(next[0], entry);
  assert.deepEqual(f.events, []);
});
test('saving a date-only version changes just that appointment and survives reload', async () => {
  const scheduled: RoutineSchedule = { ...entry, targetType: 'playlist', targetId: 'p' };
  const sibling = { ...scheduled, id: 'sibling', notificationId: 'sibling-reminder' };
  const f = fixture([scheduled, sibling]);
  const edited = editScheduledPlaylist(scheduled, 'Date-only', ['b', 'a', 'b']);
  const next = await persistScheduleChange(f.storage, 'key', [scheduled, sibling], edited, scheduled.id, f.reminders);
  assert.deepEqual(next[1], sibling);
  assert.equal(next[0].scheduledAt, scheduled.scheduledAt);
  assert.deepEqual(parseSchedules(JSON.stringify(f.stored()))[0].playlistOverride, { title: 'Date-only', routineIds: ['b', 'a', 'b'] });
  assert.deepEqual(f.events, ['cancel:old-reminder', 'create:new-reminder']);
});
test('past date-only edits do not attempt to create reminders in the past', async () => {
  const scheduled: RoutineSchedule = { ...entry, targetType: 'playlist', scheduledAt: new Date(Date.now() - 86400000).toISOString() };
  const f = fixture([scheduled]);
  const next = await persistScheduleChange(f.storage, 'key', [scheduled],
    editScheduledPlaylist(scheduled, 'Past date', ['a']), scheduled.id, f.reminders);
  assert.equal(next[0].scheduledAt, scheduled.scheduledAt);
  assert.equal(next[0].reminder, true);
  assert.equal(next[0].notificationId, undefined);
  assert.deepEqual(f.events, ['cancel:old-reminder']);
});
test('failed date-only saves retain the previous playlist version and restore its reminder', async () => {
  const scheduled: RoutineSchedule = { ...entry, targetType: 'playlist',
    playlistOverride: { title: 'Previous date-only', routineIds: ['a', 'b'] } };
  const f = fixture([scheduled]);
  f.storage.setItem = async () => { throw new Error('Disk full'); };
  await assert.rejects(persistScheduleChange(f.storage, 'key', [scheduled],
    editScheduledPlaylist(scheduled, 'New date-only', ['b', 'b']), scheduled.id, f.reminders), /Disk full/);
  assert.deepEqual(f.stored(), [scheduled]);
  assert.deepEqual(f.events, ['cancel:old-reminder', 'create:new-reminder', 'cancel:new-reminder', 'create:old-reminder']);
});
test('removing a date-only version returns that date to the live original without changing other dates', async () => {
  const scheduled: RoutineSchedule = { ...entry, targetType: 'playlist', targetId: 'p',
    playlistOverride: { title: 'Custom', routineIds: ['b'] } };
  const sibling = { ...scheduled, id: 'sibling', notificationId: 'sibling-reminder' };
  const original = { id: 'p', title: 'Original', routineIds: ['a'] };
  const f = fixture([scheduled, sibling]);
  const next = await persistScheduleChange(f.storage, 'key', [scheduled, sibling],
    { ...scheduled, playlistOverride: undefined, notificationId: undefined, targetTitle: original.title }, scheduled.id, f.reminders);
  assert.deepEqual(scheduledPlaylistSource(next[0], [original]), original);
  assert.deepEqual(next[1], sibling);
});
test('creating and editing schedules persist reminder identifiers and replace old reminders', async () => {
  const f = fixture([]);
  const created = await persistScheduleChange(f.storage, 'key', [], { ...entry, notificationId: undefined }, 's', f.reminders);
  assert.equal(created[0].notificationId, 'new-reminder');
  const edited = await persistScheduleChange(f.storage, 'key', created, { ...created[0], reminder: false }, 's', f.reminders);
  assert.equal(edited[0].notificationId, undefined);
  assert.deepEqual(f.events, ['create:new-reminder', 'cancel:new-reminder']);
  assert.equal(f.stored()[0].reminder, false);
});
for (const targetType of ['routine', 'playlist'] as const) {
  test(`rescheduling a ${targetType} updates its date and reminder without duplicates or changing other schedules`, async () => {
    const original = { ...entry, targetType };
    const other = { ...entry, id: 'other', notificationId: 'other-reminder' };
    const f = fixture([original, other]);
    const later = new Date(Date.parse(original.scheduledAt) + 86400000).toISOString();
    const next = await persistScheduleChange(f.storage, 'key', [original, other],
      { ...original, scheduledAt: later, notificationId: undefined }, original.id, f.reminders);
    assert.equal(next.length, 2);
    assert.equal(next[0].id, original.id);
    assert.equal(next[0].targetId, original.targetId);
    assert.equal(next[0].targetType, targetType);
    assert.equal(next[0].scheduledAt, later);
    assert.equal(next[0].reminder, true);
    assert.equal(next[0].notificationId, 'new-reminder');
    assert.deepEqual(next[1], other);
    assert.deepEqual(f.stored(), next);
    assert.deepEqual(f.events, ['cancel:old-reminder', 'create:new-reminder']);
  });
}
test('deleting a schedule cancels only its reminder and removes only that entry', async () => {
  const other = { ...entry, id: 'other', notificationId: 'other-reminder' };
  const f = fixture([entry, other]);
  assert.deepEqual(await persistScheduleChange(f.storage, 'key', [entry, other], null, 's', f.reminders), [other]);
  assert.deepEqual(f.events, ['cancel:old-reminder']);
});
test('failed scheduling never writes an entry', async () => {
  const f = fixture([]);
  f.reminders.create = async () => { throw new Error('Permission denied'); };
  await assert.rejects(persistScheduleChange(f.storage, 'key', [], entry, 's', f.reminders), /Permission denied/);
  assert.deepEqual(f.stored(), []);
});
test('failed storage write cancels the new reminder and restores the existing one', async () => {
  const f = fixture([entry]);
  f.storage.setItem = async () => { throw new Error('Disk full'); };
  await assert.rejects(persistScheduleChange(f.storage, 'key', [entry],
    { ...entry, notificationId: undefined }, 's', f.reminders), /Disk full/);
  assert.deepEqual(f.events, ['cancel:old-reminder', 'create:new-reminder', 'cancel:new-reminder', 'create:old-reminder']);
  assert.deepEqual(f.stored(), [entry]);
});
test('storage that commits before rejecting is reconciled without undoing a successful save', async () => {
  const f = fixture([]);
  const setItem = f.storage.setItem;
  f.storage.setItem = async (key, value) => { await setItem(key, value); throw new Error('Late failure'); };
  const result = await persistScheduleChange(f.storage, 'key', [], { ...entry, notificationId: undefined }, 's', f.reminders);
  assert.equal(result[0].notificationId, 'new-reminder');
  assert.deepEqual(f.events, ['create:new-reminder']);
});
test('failed old-reminder cancellation prevents the edit before any new reminder is created', async () => {
  const f = fixture([entry]);
  const cancel = f.reminders.cancel;
  f.reminders.cancel = async (id) => {
    if (id === 'old-reminder') throw new Error('Could not cancel');
    await cancel(id);
  };
  await assert.rejects(persistScheduleChange(f.storage, 'key', [entry],
    { ...entry, notificationId: undefined }, 's', f.reminders), /Could not cancel/);
  assert.deepEqual(f.stored(), [entry]);
  assert.deepEqual(f.events, []);
});
test('failed delete persistence restores the original future reminder', async () => {
  const f = fixture([entry]);
  f.storage.setItem = async () => { throw new Error('Disk full'); };
  await assert.rejects(persistScheduleChange(f.storage, 'key', [entry], null, 's', f.reminders), /Disk full/);
  assert.deepEqual(f.stored(), [entry]);
  assert.deepEqual(f.events, ['cancel:old-reminder', 'create:old-reminder']);
});
test('an unconfirmed storage write explicitly requires a restart rather than claiming failure or success', async () => {
  const f = fixture([]);
  f.storage.setItem = async () => { throw new Error('Save failed'); };
  f.storage.getItem = async () => { throw new Error('Read failed'); };
  await assert.rejects(persistScheduleChange(f.storage, 'key', [], entry, 's', f.reminders), /Restart the app/);
});