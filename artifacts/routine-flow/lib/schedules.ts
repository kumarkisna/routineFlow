import { validatePlaylist, type RoutinePlaylist } from './playlists';

export type ScheduleTargetType = 'routine' | 'playlist';
export type ScheduledPlaylistOverride = { title: string; routineIds: string[] };
export type RoutineSchedule = {
  id: string;
  targetType: ScheduleTargetType;
  targetId: string;
  targetTitle: string;
  scheduledAt: string;
  reminder: boolean;
  notificationId?: string;
  playlistOverride?: ScheduledPlaylistOverride;
};

/** A customized appointment owns its sequence; ordinary appointments follow the saved playlist. */
export function scheduledPlaylistSource(schedule: RoutineSchedule, playlists: RoutinePlaylist[]): RoutinePlaylist | null {
  if (schedule.targetType !== 'playlist') return null;
  if (schedule.playlistOverride) {
    return { id: schedule.targetId, title: schedule.playlistOverride.title, routineIds: [...schedule.playlistOverride.routineIds] };
  }
  return playlists.find(item => item.id === schedule.targetId) ?? null;
}

export function editScheduledPlaylist(schedule: RoutineSchedule, title: string, routineIds: string[]): RoutineSchedule {
  if (schedule.targetType !== 'playlist') throw new Error('Only a scheduled playlist can have a date-only playlist edit.');
  validatePlaylist(title, routineIds);
  return {
    ...schedule, targetTitle: title.trim(), notificationId: undefined,
    playlistOverride: { title: title.trim(), routineIds: [...routineIds] },
  };
}

/** Changing only the appointment time must not discard its local playlist version. */
export function keepScheduledPlaylistOverride(
  previous: RoutineSchedule | undefined, draft: RoutineSchedule,
): RoutineSchedule {
  if (!previous?.playlistOverride || previous.targetType !== draft.targetType || previous.targetId !== draft.targetId) return draft;
  return { ...draft, targetTitle: previous.playlistOverride.title,
    playlistOverride: { title: previous.playlistOverride.title, routineIds: [...previous.playlistOverride.routineIds] } };
}

/** Copy an appointment without sharing its notification or date-only playlist array. */
export function copyScheduleForDate(
  source: RoutineSchedule, scheduledAt: string, id: string, reminder = source.reminder, now = Date.now(),
): RoutineSchedule {
  if (!id || id === source.id) throw new Error('A copied schedule needs a new identifier.');
  if (!Number.isFinite(Date.parse(scheduledAt)) || Date.parse(scheduledAt) <= now) {
    throw new Error('Choose a date and time in the future.');
  }
  return keepScheduledPlaylistOverride(source, {
    id, targetType: source.targetType, targetId: source.targetId, targetTitle: source.targetTitle,
    scheduledAt, reminder,
  });
}

export function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function scheduleDate(date: string, time: string, now = Date.now()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error('Choose a date and enter time as HH:MM (24-hour time).');
  }
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const value = new Date(year, month - 1, day, hours, minutes);
  if (year < 2000 || hours > 23 || minutes > 59 || value.getFullYear() !== year
    || value.getMonth() !== month - 1 || value.getDate() !== day
    || value.getHours() !== hours || value.getMinutes() !== minutes) {
    throw new Error('Choose a valid date and time. This time may be unavailable because the clocks change.');
  }
  if (value.getTime() <= now) throw new Error('Choose a date and time in the future.');
  return value.toISOString();
}

export function parseSchedules(value: string): RoutineSchedule[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some(item =>
    !item || typeof item.id !== 'string' || !['routine', 'playlist'].includes(item.targetType)
    || typeof item.targetId !== 'string' || typeof item.targetTitle !== 'string'
    || typeof item.scheduledAt !== 'string' || !Number.isFinite(Date.parse(item.scheduledAt))
    || typeof item.reminder !== 'boolean'
    || (item.notificationId !== undefined && typeof item.notificationId !== 'string')
    || (item.playlistOverride !== undefined && (
      item.targetType !== 'playlist' || !item.playlistOverride || typeof item.playlistOverride.title !== 'string'
      || !item.playlistOverride.title.trim() || item.playlistOverride.title.trim().length > 100
      || !Array.isArray(item.playlistOverride.routineIds) || item.playlistOverride.routineIds.length === 0
      || item.playlistOverride.routineIds.length > 100
      || item.playlistOverride.routineIds.some((id: unknown) => typeof id !== 'string')
    ))
  )) throw new Error('Saved schedules could not be read.');
  return parsed;
}

type ScheduleStorage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> };
type ReminderService = {
  create: (schedule: RoutineSchedule) => Promise<string>;
  cancel: (notificationId: string) => Promise<void>;
};

/** Keep saved entries and phone reminders aligned when a write fails. */
export async function persistScheduleChange(
  storage: ScheduleStorage, key: string, previous: RoutineSchedule[], draft: RoutineSchedule | null,
  id: string, reminders: ReminderService,
): Promise<RoutineSchedule[]> {
  const old = previous.find(item => item.id === id);
  let notificationId: string | undefined;
  let cancelledOld = false;
  let uncertainWrite = false;
  try {
    if (draft?.reminder && Date.parse(draft.scheduledAt) > Date.now()) notificationId = await reminders.create(draft);
    if (old?.notificationId) {
      await reminders.cancel(old.notificationId);
      cancelledOld = true;
    }
    const entry = draft ? { ...draft, notificationId } : null;
    const next = entry ? old ? previous.map(item => item.id === id ? entry : item)
      : [...previous, entry] : previous.filter(item => item.id !== id);
    const serialized = JSON.stringify(next);
    try {
      await storage.setItem(key, serialized);
    } catch (error) {
      // Some storage implementations commit before rejecting. Do not undo a confirmed save.
      let stored: string | null;
      try { stored = await storage.getItem(key); } catch { uncertainWrite = true; throw error; }
      if (stored === serialized) return next;
      if (stored !== null && stored !== JSON.stringify(previous)) uncertainWrite = true;
      throw error;
    }
    return next;
  } catch (error) {
    if (uncertainWrite) {
      throw new Error('Could not confirm the saved schedule. Restart the app before making more schedule changes.');
    }
    try {
      if (notificationId) await reminders.cancel(notificationId);
      if (cancelledOld && old?.reminder && Date.parse(old.scheduledAt) > Date.now()) {
        await reminders.create(old);
      }
    } catch {
      throw new Error('Schedule change failed and the reminder could not be restored. Restart the app and check phone notification settings.');
    }
    throw error;
  }
}