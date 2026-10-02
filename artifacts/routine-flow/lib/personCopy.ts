import AsyncStorage from '@react-native-async-storage/async-storage';

import { parsePlaylists } from './playlists';
import { PERSON_DATA_KEYS, personStorageKey } from './personStorage';
import { parseRoutinesFile } from './routineTransfer';
import { parseSchedules } from './schedules';
import type { PersonCopySelection, PersonCopySummary, PersonSnapshot } from '@/types/people';
import type { Routine } from '@/types/routines';
import type { RoutinePlaylist } from './playlists';
import type { RoutineSchedule } from './schedules';

function makeId(usedIds: Set<string>): string {
  let id: string;
  do {
    id = `copy-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  } while (usedIds.has(id));
  usedIds.add(id);
  return id;
}

/**
 * Copy selected routines, playlists, and schedules into another person's snapshot.
 * References are remapped as one batch, and schedule reminders are deliberately
 * disabled so copying never creates native notifications.
 */
export function buildPersonCopy(
  source: PersonSnapshot,
  destination: PersonSnapshot,
  selection: PersonCopySelection,
): { snapshot: PersonSnapshot; summary: PersonCopySummary } {
  if (!selection.routineIds.length && !selection.playlistIds.length && !selection.scheduleIds.length) {
    throw new Error('Select at least one routine, playlist, or schedule to copy.');
  }

  const sourceRoutines = new Map(source.routines.map(item => [item.id, item]));
  const sourcePlaylists = new Map(source.playlists.map(item => [item.id, item]));
  const sourceSchedules = new Map(source.schedules.map(item => [item.id, item]));

  const routinesToCopy = new Set<string>();
  const playlistsToCopy = new Set<string>();
  const schedulesToCopy = [...new Set(selection.scheduleIds)].map(id => {
    const schedule = sourceSchedules.get(id);
    if (!schedule) throw new Error(`Cannot copy: selected schedule "${id}" was not found.`);
    return schedule;
  });

  for (const id of selection.routineIds) {
    if (!sourceRoutines.has(id)) throw new Error(`Cannot copy: selected routine "${id}" was not found.`);
    routinesToCopy.add(id);
  }
  for (const id of selection.playlistIds) {
    if (!sourcePlaylists.has(id)) throw new Error(`Cannot copy: selected playlist "${id}" was not found.`);
    playlistsToCopy.add(id);
  }

  const addRoutineDependency = (id: string, owner: string) => {
    if (!sourceRoutines.has(id)) {
      throw new Error(`Cannot copy: ${owner} references missing routine "${id}".`);
    }
    routinesToCopy.add(id);
  };
  const addPlaylistDependency = (id: string, owner: string) => {
    const playlist = sourcePlaylists.get(id);
    if (!playlist) throw new Error(`Cannot copy: ${owner} references missing playlist "${id}".`);
    playlistsToCopy.add(id);
    for (const routineId of playlist.routineIds) addRoutineDependency(routineId, `Playlist "${id}"`);
  };

  for (const id of [...playlistsToCopy]) {
    const playlist = sourcePlaylists.get(id)!;
    for (const routineId of playlist.routineIds) addRoutineDependency(routineId, `Playlist "${id}"`);
  }
  for (const schedule of schedulesToCopy) {
    if (schedule.targetType === 'routine') {
      addRoutineDependency(schedule.targetId, `Schedule "${schedule.id}"`);
    } else {
      addPlaylistDependency(schedule.targetId, `Schedule "${schedule.id}"`);
      if (schedule.playlistOverride) {
        for (const routineId of schedule.playlistOverride.routineIds) {
          addRoutineDependency(routineId, `Schedule "${schedule.id}" playlist override`);
        }
      }
    }
  }

  const usedIds = new Set<string>();
  for (const item of [
    ...source.routines, ...source.playlists, ...source.schedules,
    ...destination.routines, ...destination.playlists, ...destination.schedules,
  ]) usedIds.add(item.id);
  for (const routine of [...source.routines, ...destination.routines]) {
    for (const step of routine.steps) usedIds.add(step.id);
  }
  const routineIdMap = new Map<string, string>();
  const copiedRoutines: Routine[] = [];
  for (const routineId of routinesToCopy) {
    const routine = sourceRoutines.get(routineId)!;
    const copiedId = makeId(usedIds);
    routineIdMap.set(routineId, copiedId);
    copiedRoutines.push({
      ...routine,
      id: copiedId,
      steps: routine.steps.map(step => ({ ...step, id: makeId(usedIds) })),
    });
  }

  const playlistIdMap = new Map<string, string>();
  const copiedPlaylists: RoutinePlaylist[] = [];
  for (const playlistId of playlistsToCopy) {
    const playlist = sourcePlaylists.get(playlistId)!;
    const copiedId = makeId(usedIds);
    playlistIdMap.set(playlistId, copiedId);
    copiedPlaylists.push({
      ...playlist,
      id: copiedId,
      routineIds: playlist.routineIds.map(id => routineIdMap.get(id)!),
    });
  }

  const copiedSchedules: RoutineSchedule[] = schedulesToCopy.map(schedule => ({
    ...schedule,
    id: makeId(usedIds),
    targetId: schedule.targetType === 'routine'
      ? routineIdMap.get(schedule.targetId)!
      : playlistIdMap.get(schedule.targetId)!,
    reminder: false,
    ...(schedule.alertOffsetsMinutes ? { alertOffsetsMinutes: [...schedule.alertOffsetsMinutes] } : {}),
    notificationId: undefined,
    notifications: undefined,
    ...(schedule.playlistOverride ? {
      playlistOverride: {
        ...schedule.playlistOverride,
        routineIds: schedule.playlistOverride.routineIds.map(id => routineIdMap.get(id)!),
      },
    } : {}),
  }));

  return {
    snapshot: {
      routines: [...destination.routines, ...copiedRoutines],
      playlists: [...destination.playlists, ...copiedPlaylists],
      schedules: [...destination.schedules, ...copiedSchedules],
    },
    summary: {
      routines: copiedRoutines.length,
      playlists: copiedPlaylists.length,
      schedules: copiedSchedules.length,
    },
  };
}

/** Read only the selected person's content; progress is intentionally excluded. */
export async function readPersonSnapshot(personId: string): Promise<PersonSnapshot> {
  const [routineValue, playlistValue, scheduleValue] = await Promise.all([
    AsyncStorage.getItem(personStorageKey(personId, PERSON_DATA_KEYS.routines)),
    AsyncStorage.getItem(personStorageKey(personId, PERSON_DATA_KEYS.playlists)),
    AsyncStorage.getItem(personStorageKey(personId, PERSON_DATA_KEYS.schedules)),
  ]);
  let routines: Routine[] = [];
  if (routineValue !== null) {
    const parsed: unknown = JSON.parse(routineValue);
    // Routine storage is a plain array, whereas the transfer parser validates the
    // same routine records inside its versioned backup format.
    const contents = Array.isArray(parsed)
      ? JSON.stringify({ format: 'routine-flow-routines', version: 5, routines: parsed })
      : routineValue;
    routines = parseRoutinesFile(contents).routines;
  }
  return {
    routines,
    playlists: playlistValue === null ? [] : parsePlaylists(playlistValue),
    schedules: scheduleValue === null ? [] : parseSchedules(scheduleValue),
  };
}