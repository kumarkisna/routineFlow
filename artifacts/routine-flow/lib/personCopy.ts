import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_THEME_ID, findAppTheme } from './appThemes';
import { parsePlaylists } from './playlists';
import { PERSON_DATA_KEYS, personStorageKey, waitForPersonWrites } from './personStorage';
import { parseRoutinesFile, repairStoredRoutineDurations, ROUTINE_BACKUP_VERSION } from './routineTransfer';
import { parseSchedules } from './schedules';
import { parseSkillRatingWindow, parseSkills, skillNameKey } from './skills';
import type { PersonCopySelection, PersonCopySummary, PersonSnapshot } from '@/types/people';
import type { CompletionMap, Routine } from '@/types/routines';
import type { RoutineSkill } from './skills';

export type PersonExportSnapshot = PersonSnapshot & {
  progress: CompletionMap;
  selectedThemeId: string;
};
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
 * Copy selected routines, playlists, schedules, and the skills they reference.
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
  const sourceSkills = new Map((source.skills ?? []).map(item => [item.id, item]));

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

  const skillsToCopy = new Set<string>();
  const addSkillDependencies = (ids: string[] | undefined, owner: string) => {
    for (const id of ids ?? []) {
      if (!sourceSkills.has(id)) throw new Error(`Cannot copy: ${owner} references missing skill "${id}".`);
      skillsToCopy.add(id);
    }
  };
  for (const id of routinesToCopy) {
    const routine = sourceRoutines.get(id)!;
    addSkillDependencies(routine.skillIds, `Routine "${id}"`);
    for (const step of routine.steps) addSkillDependencies(step.skillIds, `Routine "${id}" step "${step.id}"`);
  }
  for (const id of playlistsToCopy) {
    addSkillDependencies(sourcePlaylists.get(id)?.skillIds, `Playlist "${id}"`);
  }
  for (const schedule of schedulesToCopy) {
    addSkillDependencies(schedule.playlistOverride?.skillIds, `Schedule "${schedule.id}" playlist override`);
  }

  const usedIds = new Set<string>();
  for (const item of [
    ...source.routines, ...source.playlists, ...source.schedules,
    ...destination.routines, ...destination.playlists, ...destination.schedules,
  ]) usedIds.add(item.id);
  for (const skill of [...(source.skills ?? []), ...(destination.skills ?? [])]) usedIds.add(skill.id);
  for (const routine of [...source.routines, ...destination.routines]) {
    for (const step of routine.steps) usedIds.add(step.id);
  }

  const destinationSkills = [...(destination.skills ?? [])];
  const skillIdMap = new Map<string, string>();
  for (const sourceSkillId of skillsToCopy) {
    const sourceSkill = sourceSkills.get(sourceSkillId)!;
    const existing = destinationSkills.find(skill => skillNameKey(skill.name) === skillNameKey(sourceSkill.name));
    if (existing) {
      skillIdMap.set(sourceSkillId, existing.id);
      continue;
    }
    const copiedId = makeId(usedIds);
    skillIdMap.set(sourceSkillId, copiedId);
    const copied: RoutineSkill = { id: copiedId, name: sourceSkill.name };
    destinationSkills.push(copied);
  }
  const mapSkillIds = (ids: string[] | undefined) => ids?.map(id => skillIdMap.get(id)!);

  const routineIdMap = new Map<string, string>();
  const copiedRoutines: Routine[] = [];
  for (const routineId of routinesToCopy) {
    const routine = sourceRoutines.get(routineId)!;
    const copiedId = makeId(usedIds);
    routineIdMap.set(routineId, copiedId);
    copiedRoutines.push({
      ...routine,
      id: copiedId,
      ...(routine.skillIds ? { skillIds: mapSkillIds(routine.skillIds) } : {}),
      steps: routine.steps.map(step => ({
        ...step,
        id: makeId(usedIds),
        ...(step.skillIds ? { skillIds: mapSkillIds(step.skillIds) } : {}),
      })),
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
      ...(playlist.skillIds ? { skillIds: mapSkillIds(playlist.skillIds) } : {}),
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
        ...(schedule.playlistOverride.skillIds
          ? { skillIds: mapSkillIds(schedule.playlistOverride.skillIds) } : {}),
      },
    } : {}),
  }));

  return {
    snapshot: {
      routines: [...destination.routines, ...copiedRoutines],
      playlists: [...destination.playlists, ...copiedPlaylists],
      schedules: [...destination.schedules, ...copiedSchedules],
      skills: [...destinationSkills],
      skillRatingWindow: destination.skillRatingWindow,
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
  const [routineValue, playlistValue, scheduleValue, skillValue, ratingWindowValue] = await Promise.all([
    AsyncStorage.getItem(personStorageKey(personId, PERSON_DATA_KEYS.routines)),
    AsyncStorage.getItem(personStorageKey(personId, PERSON_DATA_KEYS.playlists)),
    AsyncStorage.getItem(personStorageKey(personId, PERSON_DATA_KEYS.schedules)),
    AsyncStorage.getItem(personStorageKey(personId, PERSON_DATA_KEYS.skills)),
    AsyncStorage.getItem(personStorageKey(personId, PERSON_DATA_KEYS.skillRatingWindow)),
  ]);
  let routines: Routine[] = [];
  if (routineValue !== null) {
    const parsed: unknown = JSON.parse(routineValue);
    // Routine storage is a plain array, whereas the transfer parser validates the
    // same routine records inside its versioned backup format.
    const contents = Array.isArray(parsed)
      ? JSON.stringify({ format: 'routine-flow-routines', version: ROUTINE_BACKUP_VERSION, routines: parsed })
      : routineValue;
    routines = parseRoutinesFile(contents).routines;
  }
  return {
    routines,
    playlists: playlistValue === null ? [] : parsePlaylists(playlistValue),
    schedules: scheduleValue === null ? [] : parseSchedules(scheduleValue),
    skills: skillValue === null ? [] : parseSkills(skillValue),
    skillRatingWindow: parseSkillRatingWindow(ratingWindowValue),
  };
}

export async function readPersonExportSnapshot(personId: string): Promise<PersonExportSnapshot> {
  await waitForPersonWrites(personId);
  const snapshot = await readPersonSnapshot(personId);
  const [progressValue, themeValue] = await Promise.all([
    AsyncStorage.getItem(personStorageKey(personId, PERSON_DATA_KEYS.progress)),
    AsyncStorage.getItem(personStorageKey(personId, PERSON_DATA_KEYS.appearance)),
  ]);
  const progress = progressValue === null
    ? {}
    : parseRoutinesFile(JSON.stringify({
      format: 'routine-flow-routines',
      version: ROUTINE_BACKUP_VERSION,
      routines: snapshot.routines,
      progress: JSON.parse(progressValue),
    })).progress ?? {};
  const selectedThemeId = themeValue ?? DEFAULT_THEME_ID;
  if (!findAppTheme(selectedThemeId)) throw new Error('The selected theme could not be validated for export.');
  return { ...snapshot, progress, selectedThemeId };
}

export async function repairPersonRoutineDurations(personId: string): Promise<number> {
  await waitForPersonWrites(personId);
  const routinesKey = personStorageKey(personId, PERSON_DATA_KEYS.routines);
  const original = await AsyncStorage.getItem(routinesKey);
  if (original === null) throw new Error('Saved routines are no longer available. Nothing was changed.');

  const repair = repairStoredRoutineDurations(original);
  const recoveryBase = `${routinesKey}:recovery:${Date.now()}`;
  let recoveryKey = recoveryBase;
  let suffix = 1;
  while (await AsyncStorage.getItem(recoveryKey) !== null) {
    recoveryKey = `${recoveryBase}-${suffix++}`;
  }

  const saveAndConfirm = async (key: string, value: string, message: string) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // Some storage drivers can reject after committing; verify before reporting failure.
    }
    if (await AsyncStorage.getItem(key) !== value) throw new Error(message);
  };

  await saveAndConfirm(
    recoveryKey,
    original,
    'The original routine data could not be preserved, so no repair was made. Please try again.',
  );
  await saveAndConfirm(
    routinesKey,
    repair.serialized,
    'The repair could not be confirmed. The original routine data is preserved in a recovery copy.',
  );

  await readPersonSnapshot(personId);
  return repair.repairedSteps;
}