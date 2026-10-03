import { usePeople, usePersonStorage } from '@/context/PeopleContext';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useRoutines } from '@/context/RoutineContext';
import { usePlaylists } from '@/context/PlaylistContext';
import { playablePlaylistIds } from '@/lib/playlists';
import { createRoutineWriteGuard } from '@/lib/routineWriteGuard';
import { createPersonStorage } from '@/lib/personStorage';
import { Notifications, REMINDER_CHANNEL_GROUP_ID, SCHEDULE_REMINDER_CHANNEL_ID } from '@/lib/localNotifications';
import { alertDate, futureScheduleAlerts, scheduleAlertContent, scheduleAlertOffsets, validateAlertOffsets } from '@/lib/scheduleAlerts';
import { copyScheduleForDate, editScheduledPlaylist, keepScheduledPlaylistOverride, parseSchedules, persistScheduleChange,
  scheduledPlaylistSource, type RoutineSchedule, type ScheduleTargetType } from '@/lib/schedules';

const KEY = '@routine-flow/schedules';
type Draft = { targetType: ScheduleTargetType; targetId: string; scheduledAt: string; reminder: boolean; alertOffsetsMinutes?: number[] };
type ScheduleContextValue = {
  schedules: RoutineSchedule[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  saveSchedule: (draft: Draft, id?: string) => Promise<void>;
  copySchedule: (sourceId: string, draft: Draft) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
  savePlaylistForSchedule: (id: string, title: string, routineIds: string[]) => Promise<void>;
  resetScheduledPlaylist: (id: string) => Promise<void>;
};
const ScheduleContext = createContext<ScheduleContextValue | null>(null);

function createReminderService(personId: string) {
  return {
    create: async (schedule: RoutineSchedule, offsetMinutes = 0): Promise<string> => {
      if (Platform.OS === 'web') throw new Error('Phone reminders are unavailable in the web preview. Turn off the reminder to save.');
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelGroupAsync(REMINDER_CHANNEL_GROUP_ID, {
          name: 'Routine Flow reminders',
        });
        await Notifications.setNotificationChannelAsync(SCHEDULE_REMINDER_CHANNEL_ID, {
          name: 'Scheduled routines',
          importance: Notifications.AndroidImportance.HIGH,
          groupId: REMINDER_CHANNEL_GROUP_ID,
        });
      }
      let permission = await Notifications.getPermissionsAsync();
      if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) throw new Error('Enable notifications in your phone settings, or turn off the reminder to save.');
      const notificationAt = alertDate(schedule, offsetMinutes);
      if (!Number.isFinite(notificationAt.getTime()) || notificationAt.getTime() <= Date.now()) {
        throw new Error('An alert time has passed. Choose a later date or a shorter lead time.');
      }
      const alertContent = scheduleAlertContent(schedule, offsetMinutes);
      return Notifications.scheduleNotificationAsync({
        ...(schedule.notificationId ? { identifier: schedule.notificationId } : {}),
        content: { ...alertContent, data: { ...alertContent.data, personId } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: notificationAt, ...(Platform.OS === 'android' ? { channelId: SCHEDULE_REMINDER_CHANNEL_ID } : {}) },
      });
    },
    cancel: async (id: string) => {
      if (Platform.OS !== 'web') await Notifications.cancelScheduledNotificationAsync(id);
    },
  };
}

export function ScheduleProvider({ children }: { children: React.ReactNode }) {
  const { activePerson, people } = usePeople();
  const AsyncStorage = usePersonStorage();
  const reminderService = useMemo(() => createReminderService(activePerson.id), [activePerson.id]);
  const { routines, loading: routinesLoading } = useRoutines();
  const { playlists, loading: playlistsLoading, error: playlistsError } = usePlaylists();
  const [schedules, setSchedules] = useState<RoutineSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const current = useRef<RoutineSchedule[]>([]);
  const unsafe = useRef(false);
  const runWrite = useRef(createRoutineWriteGuard()).current;
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const stored = await AsyncStorage.getItem(KEY);
      const next = stored ? parseSchedules(stored) : [];
      current.current = next;
      setSchedules(next);
    } catch {
      setError('Your schedules could not load. Retry before making changes.');
    } finally { setLoading(false); }
  }, [AsyncStorage]);
  useEffect(() => { void reload(); }, [reload]);

  const commit = useCallback(async (draft: RoutineSchedule | null, id: string) => {
    if (loading || error || unsafe.current) throw new Error('Schedules are not ready to change. Restart the app if a previous save could not be confirmed.');
    if (Platform.OS === 'ios' && draft?.reminder) {
      const otherSchedules = await Promise.all(people.filter(person => person.id !== activePerson.id).map(async person => {
        const saved = await createPersonStorage(person.id).getItem(KEY);
        return saved ? parseSchedules(saved) : [];
      }));
      const pending = current.current.filter(item => item.id !== id)
        .reduce((total, item) => total + futureScheduleAlerts(item).length, 0) + futureScheduleAlerts(draft).length
        + otherSchedules.flat().reduce((total, item) => total + futureScheduleAlerts(item).length, 0);
      if (pending > 60) throw new Error('Your phone has reached its pending reminder limit. Remove some upcoming alerts or turn off phone reminders for another schedule.');
    }
    try {
      const next = await persistScheduleChange(AsyncStorage, KEY, current.current, draft, id, reminderService);
      current.current = next;
      setSchedules(next);
    } catch (e) {
      if (e instanceof Error && e.message.includes('Restart the app')) unsafe.current = true;
      throw e;
    }
  }, [loading, error, AsyncStorage, reminderService, people, activePerson.id]);
  const writeSchedule = useCallback((draft: Draft, id?: string, copyFromId?: string) => runWrite(async () => {
    if (routinesLoading || playlistsLoading) throw new Error('Wait for your routines and playlists to load.');
    if (!Number.isFinite(Date.parse(draft.scheduledAt)) || Date.parse(draft.scheduledAt) <= Date.now()) {
      throw new Error('Choose a date and time in the future.');
    }
    const routine = routines.find(item => item.id === draft.targetId);
    const playlist = playlists.find(item => item.id === draft.targetId);
    const old = id ? current.current.find(item => item.id === id) : undefined;
    if (id && !old) throw new Error('Schedule not found.');
    const copySource = copyFromId ? current.current.find(item => item.id === copyFromId) : undefined;
    if (copyFromId && !copySource) throw new Error('The schedule you wanted to copy no longer exists.');
    if (copySource && (copySource.targetType !== draft.targetType || copySource.targetId !== draft.targetId)) {
      throw new Error('A copied schedule must keep its routine or playlist. Create a new schedule to choose a different one.');
    }
    const newId = id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const schedule = copySource
      ? copyScheduleForDate(copySource, draft.scheduledAt, newId, draft.reminder)
      : keepScheduledPlaylistOverride(old, {
      ...draft, id: newId,
      targetTitle: draft.targetType === 'routine' ? routine?.title ?? '' : playlist?.title ?? '',
    });
    if (!schedule.playlistOverride) {
      schedule.targetTitle = draft.targetType === 'routine' ? routine?.title ?? '' : playlist?.title ?? '';
    }
    const offsets = draft.alertOffsetsMinutes ?? schedule.alertOffsetsMinutes ?? old?.alertOffsetsMinutes;
    if (offsets !== undefined) {
      validateAlertOffsets(offsets);
      schedule.alertOffsetsMinutes = [...offsets];
    }
    if (schedule.reminder && scheduleAlertOffsets(schedule).some(offset => alertDate(schedule, offset).getTime() <= Date.now()
      || !Number.isFinite(alertDate(schedule, offset).getTime()))) {
      throw new Error('An alert time has already passed. Choose a later date or a shorter lead time.');
    }
    const source = scheduledPlaylistSource(schedule, playlists);
    if (draft.targetType === 'routine' ? !routine || !playablePlaylistIds([routine.id], routines).length
      : (!schedule.playlistOverride && playlistsError) || !source || !playablePlaylistIds(source.routineIds, routines).length) {
      throw new Error('Choose an available routine or playlist with visible steps.');
    }
    await commit(schedule, schedule.id);
  }), [commit, routines, playlists, routinesLoading, playlistsLoading, playlistsError, runWrite]);
  const saveSchedule = useCallback((draft: Draft, id?: string) => writeSchedule(draft, id), [writeSchedule]);
  const copySchedule = useCallback((sourceId: string, draft: Draft) => writeSchedule(draft, undefined, sourceId), [writeSchedule]);
  const deleteSchedule = useCallback((id: string) => runWrite(() => commit(null, id)), [commit, runWrite]);
  const savePlaylistForSchedule = useCallback((id: string, title: string, routineIds: string[]) => runWrite(async () => {
    if (routinesLoading) throw new Error('Wait for your routines to load.');
    const old = current.current.find(item => item.id === id);
    if (!old) throw new Error('Schedule not found.');
    const next = editScheduledPlaylist(old, title, routineIds);
    if (!playablePlaylistIds(next.playlistOverride!.routineIds, routines).length) {
      throw new Error('Add at least one available routine with visible steps.');
    }
    await commit(next, id);
  }), [routinesLoading, routines, commit, runWrite]);
  const resetScheduledPlaylist = useCallback((id: string) => runWrite(async () => {
    if (playlistsLoading || routinesLoading || playlistsError) throw new Error('Wait for your saved playlists and routines to load.');
    const old = current.current.find(item => item.id === id);
    if (!old || old.targetType !== 'playlist') throw new Error('Scheduled playlist not found.');
    const source = playlists.find(item => item.id === old.targetId);
    if (!source || !playablePlaylistIds(source.routineIds, routines).length) {
      throw new Error('The original playlist is unavailable. Your date-only version has been kept.');
    }
    await commit({ ...old, targetTitle: source.title, playlistOverride: undefined, notificationId: undefined }, id);
  }), [playlistsLoading, routinesLoading, playlistsError, playlists, routines, commit, runWrite]);
  return <ScheduleContext.Provider value={{ schedules, loading, error, reload, saveSchedule, copySchedule, deleteSchedule,
    savePlaylistForSchedule, resetScheduledPlaylist }}>
    {children}
  </ScheduleContext.Provider>;
}

export function useSchedules() {
  const context = useContext(ScheduleContext);
  if (!context) throw new Error('useSchedules must be used within ScheduleProvider');
  return context;
}