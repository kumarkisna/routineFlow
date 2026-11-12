import type { Routine, RoutineNotificationSettings, RoutineStep } from '../types/routines';
import { getStepSeconds } from '../types/routines';
import { detailHtmlToText, sanitizeStepDetailHtml } from './stepDetailHtml';

export const DEFAULT_PLAYLIST_REMINDER_SETTINGS: RoutineNotificationSettings = {
  stepCompletion: false,
  routineCompletion: false,
};

export function resolvePlaylistReminderSettings(
  personDefaults?: RoutineNotificationSettings,
  savedSettings?: RoutineNotificationSettings,
): RoutineNotificationSettings {
  return {
    ...(savedSettings ?? personDefaults ?? DEFAULT_PLAYLIST_REMINDER_SETTINGS),
  };
}

export type RoutinePlaylist = {
  id: string;
  title: string;
  routineIds: string[];
  /** Optional ordered step snapshots; absent means legacy all-visible-steps behavior. */
  stepSelections?: PlaylistStepSelection[];
  /** Optional links to reusable, person-specific skills. */
  skillIds?: string[];
  /** When enabled, defer skill ratings until the complete playlist run finishes. */
  rateSkillsAtPlaylistEnd?: boolean;
  /** Reminder choices for runs launched from this playlist. */
  reminderSettings?: RoutineNotificationSettings;
  /** Optional plain-text fallback for the rich-text reflection prompt. */
  reflectionTemplate?: string;
  /** Sanitized rich-text prompt captured for each completed playlist run. */
  reflectionTemplateHtml?: string;
};

export type PlaylistStepSelection = {
  routineId: string;
  steps: { stepId: string; durationSeconds: number }[];
};

export type PlaylistRunEntry = { routineId: string; steps: RoutineStep[] };

export function createDefaultPlaylistStepSelections(routineIds: string[], routines: Routine[]): PlaylistStepSelection[] {
  return routineIds.map(routineId => {
    const routine = routines.find(item => item.id === routineId);
    return {
      routineId,
      steps: (routine?.steps ?? []).filter(step => !step.hidden).map(step => ({
        stepId: step.id,
        durationSeconds: getStepSeconds(step),
      })),
    };
  });
}

export function getPlaylistRunEntries(playlist: Pick<RoutinePlaylist, 'routineIds' | 'stepSelections'>, routines: Routine[]): PlaylistRunEntry[] {
  const selections = playlist.stepSelections ?? createDefaultPlaylistStepSelections(playlist.routineIds, routines);
  const routinesById = new Map(routines.map(routine => [routine.id, routine]));
  return selections.flatMap((selection, index) => {
    const routineId = playlist.routineIds[index];
    const source = routinesById.get(routineId);
    if (!source || source.hidden || selection.routineId !== routineId) return [];
    const visibleById = new Map(source.steps.filter(step => !step.hidden).map(step => [step.id, step]));
    const steps = selection.steps.flatMap(selected => {
      const sourceStep = visibleById.get(selected.stepId);
      return sourceStep ? [{ ...sourceStep, durationSeconds: selected.durationSeconds }] : [];
    });
    return steps.length ? [{ routineId, steps }] : [];
  });
}

export function getPlaylistDurationSeconds(playlist: Pick<RoutinePlaylist, 'routineIds' | 'stepSelections'>, routines: Routine[]): number {
  return getPlaylistRunEntries(playlist, routines).reduce(
    (total, entry) => total + entry.steps.reduce((sum, step) => sum + getStepSeconds(step), 0),
    0,
  );
}

export function isValidPlaylistStepSelections(value: unknown, routineIds: string[]): value is PlaylistStepSelection[] {
  if (!Array.isArray(value) || value.length !== routineIds.length) return false;
  return value.every((raw: unknown, index) => {
    if (!raw || typeof raw !== 'object') return false;
    const selection = raw as Record<string, unknown>;
    if (selection.routineId !== routineIds[index] || !Array.isArray(selection.steps) || selection.steps.length > 1000) return false;
    const steps = selection.steps as unknown[];
    if (!steps.every(step => {
      if (!step || typeof step !== 'object') return false;
      const entry = step as Record<string, unknown>;
      return typeof entry.stepId === 'string' && !!entry.stepId.trim()
        && typeof entry.durationSeconds === 'number' && Number.isSafeInteger(entry.durationSeconds)
        && entry.durationSeconds > 0;
    })) return false;
    return new Set(steps.map(step => (step as Record<string, unknown>).stepId)).size === steps.length;
  });
}

export function playablePlaylistIds(ids: string[], routines: Routine[]): string[] {
  const available = new Set(routines
    .filter(routine => !routine.hidden && routine.steps.some(step => !step.hidden))
    .map(routine => routine.id));
  return ids.filter(id => available.has(id));
}

export function getPlaylistSpeechSteps(
  playlist: Pick<RoutinePlaylist, 'routineIds' | 'stepSelections'>,
  routines: Routine[],
): { routine: Routine; stepIndex: number }[] {
  return getPlaylistRunEntries(playlist, routines).flatMap(entry => {
    const routine = routines.find(item => item.id === entry.routineId);
    if (!routine) return [];
    const playableRoutine = { ...routine, steps: entry.steps };
    return entry.steps.map((_, stepIndex) => ({ routine: playableRoutine, stepIndex }));
  });
}

export function createPlaylistRunLaunch(
  playlist: RoutinePlaylist,
  routines: Routine[],
): {
  ids: string[];
  params: {
    id: string;
    queue: string;
    stepQueue: string;
    cursor: '0';
    playlistId: string;
    playlistTitle: string;
    playlistSkills: string;
    playlistRateSkillsAtEnd: '0' | '1';
    stepReminder: '0' | '1';
    routineReminder: '0' | '1';
    autoStart: '1';
  };
} | null {
  const entries = getPlaylistRunEntries(playlist, routines);
  const ids = entries.map(entry => entry.routineId);
  if (!ids.length) return null;

  return {
    ids,
    params: {
      id: ids[0],
      queue: JSON.stringify(ids),
      stepQueue: JSON.stringify(entries.map(entry => ({
        routineId: entry.routineId,
        steps: entry.steps.map(step => ({ stepId: step.id, durationSeconds: getStepSeconds(step) })),
      }))),
      cursor: '0',
      playlistId: playlist.id,
      playlistTitle: playlist.title,
      playlistSkills: JSON.stringify(playlist.skillIds ?? []),
      playlistRateSkillsAtEnd: (playlist.rateSkillsAtPlaylistEnd ?? true) ? '1' : '0',
      stepReminder: playlist.reminderSettings?.stepCompletion ? '1' : '0',
      routineReminder: playlist.reminderSettings?.routineCompletion ? '1' : '0',
      autoStart: '1',
    },
  };
}

export function validatePlaylist(title: string, ids: string[], stepSelections?: PlaylistStepSelection[]) {
  if (!title.trim()) throw new Error('Give your playlist a name.');
  if (title.trim().length > 100) throw new Error('Use a playlist name of 100 characters or fewer.');
  if (!ids.length) throw new Error('Add at least one routine.');
  if (ids.length > 100) throw new Error('A playlist can contain up to 100 routines.');
  if (stepSelections !== undefined) {
    if (!isValidPlaylistStepSelections(stepSelections, ids)) throw new Error('The selected playlist steps are invalid.');
    if (!stepSelections.some(selection => selection.steps.length)) throw new Error('Select at least one step.');
  }
}

export function parsePlaylists(value: string): RoutinePlaylist[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some(item =>
    !item || typeof item.id !== 'string' || typeof item.title !== 'string'
    || !Array.isArray(item.routineIds) || item.routineIds.some((id: unknown) => typeof id !== 'string')
    || (item.stepSelections !== undefined && !isValidPlaylistStepSelections(item.stepSelections, item.routineIds))
    || (item.skillIds !== undefined && (!Array.isArray(item.skillIds)
      || item.skillIds.some((id: unknown) => typeof id !== 'string' || !id.trim())
      || new Set(item.skillIds).size !== item.skillIds.length))
    || (item.rateSkillsAtPlaylistEnd !== undefined && typeof item.rateSkillsAtPlaylistEnd !== 'boolean')
    || (item.reminderSettings !== undefined && (
      !item.reminderSettings
      || typeof item.reminderSettings.stepCompletion !== 'boolean'
      || typeof item.reminderSettings.routineCompletion !== 'boolean'
    ))
    || (item.reflectionTemplate !== undefined
      && (typeof item.reflectionTemplate !== 'string' || item.reflectionTemplate.length > 20_000))
    || (item.reflectionTemplateHtml !== undefined
      && (typeof item.reflectionTemplateHtml !== 'string' || item.reflectionTemplateHtml.length > 100_000))
  )) throw new Error('Saved playlists could not be read.');
  return (parsed as RoutinePlaylist[]).map(playlist => ({
    ...playlist,
    ...(playlist.reflectionTemplateHtml && detailHtmlToText(sanitizeStepDetailHtml(playlist.reflectionTemplateHtml)).trim()
      ? { reflectionTemplateHtml: sanitizeStepDetailHtml(playlist.reflectionTemplateHtml) }
      : {}),
    ...(playlist.stepSelections ? {
      stepSelections: playlist.stepSelections.map(selection => ({
        routineId: selection.routineId,
        steps: selection.steps.map(step => ({ ...step })),
      })),
    } : {}),
    rateSkillsAtPlaylistEnd: playlist.rateSkillsAtPlaylistEnd ?? true,
    reminderSettings: {
      stepCompletion: playlist.reminderSettings?.stepCompletion ?? DEFAULT_PLAYLIST_REMINDER_SETTINGS.stepCompletion,
      routineCompletion: playlist.reminderSettings?.routineCompletion ?? DEFAULT_PLAYLIST_REMINDER_SETTINGS.routineCompletion,
    },
  }));
}

export function mergePlaylistCatalog(
  existing: RoutinePlaylist[],
  imported: RoutinePlaylist[],
  createId: () => string = () => `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
): {
  playlists: RoutinePlaylist[];
  idMap: Record<string, string>;
  added: number;
  skipped: number;
  renamed: number;
  updated: number;
} {
  const playlists = [...existing];
  const usedIds = new Set(playlists.map(playlist => playlist.id));
  const coreKey = (playlist: RoutinePlaylist) => JSON.stringify([playlist.title, playlist.routineIds, playlist.stepSelections ?? null]);
  const matchingIds = new Map(playlists.map(playlist => [coreKey(playlist), playlist.id]));
  const idMap: Record<string, string> = Object.create(null) as Record<string, string>;
  let added = 0;
  let skipped = 0;
  let renamed = 0;
  let updated = 0;

  for (const incoming of imported) {
    const key = coreKey(incoming);
    const matchingId = matchingIds.get(key);
    if (matchingId) {
      idMap[incoming.id] = matchingId;
      const index = playlists.findIndex(playlist => playlist.id === matchingId);
      const current = playlists[index];
      const skillIds = [...new Set([...(current.skillIds ?? []), ...(incoming.skillIds ?? [])])];
      if (skillIds.length !== (current.skillIds ?? []).length) {
        playlists[index] = { ...current, skillIds };
        updated++;
      } else {
        skipped++;
      }
      continue;
    }

    let id = incoming.id;
    if (usedIds.has(id)) {
      do {
        id = createId();
      } while (usedIds.has(id));
      renamed++;
    }
    usedIds.add(id);
    idMap[incoming.id] = id;
    playlists.push({
      ...incoming,
      id,
      routineIds: [...incoming.routineIds],
      ...(incoming.stepSelections ? {
        stepSelections: incoming.stepSelections.map(selection => ({
          routineId: selection.routineId,
          steps: selection.steps.map(step => ({ ...step })),
        })),
      } : {}),
      ...(incoming.skillIds ? { skillIds: [...incoming.skillIds] } : {}),
    });
    matchingIds.set(key, id);
    added++;
  }

  return { playlists, idMap, added, skipped, renamed, updated };
}

export function remapPlaylistReferences(
  playlists: RoutinePlaylist[],
  routineIdMap: Record<string, string>,
  skillIdMap: Record<string, string>,
): RoutinePlaylist[] {
  return playlists.map(playlist => ({
    ...playlist,
    routineIds: playlist.routineIds.map(id => routineIdMap[id] ?? id),
    ...(playlist.stepSelections ? {
      stepSelections: playlist.stepSelections.map(selection => ({
        routineId: routineIdMap[selection.routineId] ?? selection.routineId,
        steps: selection.steps.map(step => ({ ...step })),
      })),
    } : {}),
    ...(playlist.skillIds !== undefined
      ? { skillIds: playlist.skillIds.map(id => skillIdMap[id] ?? id) }
      : {}),
    ...(playlist.reminderSettings ? { reminderSettings: { ...playlist.reminderSettings } } : {}),
  }));
}

export function parsePlaylistQueue(value?: string): string[] | null {
  if (!value) return null;
  try {
    const ids: unknown = JSON.parse(value);
    return Array.isArray(ids) && ids.length > 0 && ids.length <= 100
      && ids.every(id => typeof id === 'string') ? ids : null;
  } catch {
    return null;
  }
}

export function parsePlaylistStepQueue(value?: string): PlaylistStepSelection[] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 100) return null;
    const ids = parsed.map(item => item && typeof item === 'object' ? (item as Record<string, unknown>).routineId : '');
    return isValidPlaylistStepSelections(parsed, ids as string[]) ? parsed : null;
  } catch {
    return null;
  }
}

export function nextPlaylistCursor(
  ids: string[],
  cursor: number,
  routines: Routine[],
  stepQueue?: PlaylistStepSelection[] | null,
): number {
  const available = new Set(playablePlaylistIds(ids, routines));
  return ids.findIndex((id, index) => {
    if (index <= cursor || !available.has(id)) return false;
    const selected = stepQueue?.[index];
    if (!selected) return true;
    const routine = routines.find(item => item.id === id);
    if (!routine || selected.routineId !== id) return false;
    const visible = new Set(routine.steps.filter(step => !step.hidden).map(step => step.id));
    return selected.steps.some(step => visible.has(step.stepId));
  });
}
