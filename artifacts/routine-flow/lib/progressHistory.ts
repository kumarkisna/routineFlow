import {
  isCompleted, type CompletionMap, type CompletionValue, type PlaylistCompletionSource, type Routine,
} from '@/types/routines';
import { historySourceId, splitProgressKey } from '@/lib/historyIdentity';
import type { RoutineSkill } from '@/lib/skills';
import type { RoutinePlaylist } from '@/lib/playlists';

export type HistoryFilter =
  | { kind: 'routine'; id: string }
  | { kind: 'playlist'; id: string };
export type HistoryFilterOption = { id: string; title: string; archived: boolean };
export type HistoryRoutine = {
  id: string;
  title: string;
  hidden: boolean;
  removed: boolean;
  steps: { id: string; title: string; hidden: boolean; removed: boolean }[];
  playlistRuns?: PlaylistCompletionSource[];
  skillRatings?: { id: string; skillName: string; rating: number; ratedAt: string; note?: string }[];
};

export function recordCompletion(
  routineTitle: string,
  stepTitle: string,
  previous: CompletionValue | undefined,
  playlistRun?: PlaylistCompletionSource,
): CompletionValue {
  if (!playlistRun && isCompleted(previous)) return previous!;
  const previousRecord = typeof previous === 'object' && previous !== null ? previous : undefined;
  const base = previousRecord ?? { routineTitle, stepTitle };
  const playlistRuns = Array.isArray(previousRecord?.playlistRuns)
    ? [...previousRecord.playlistRuns]
    : [];
  if (playlistRun && !playlistRuns.some(run => run.playlistId === playlistRun.playlistId)) {
    playlistRuns.push(playlistRun);
  }
  return playlistRuns.length ? { ...base, playlistRuns } : base;
}

function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function completionMatchesFilter(
  key: string,
  value: CompletionValue | undefined,
  filter?: HistoryFilter,
): boolean {
  if (!isCompleted(value)) return false;
  if (!filter) return true;
  const parsed = splitProgressKey(key);
  if (!parsed) return false;
  if (filter.kind === 'routine') return parsed.routineId === filter.id;
  return typeof value === 'object' && value !== null
    && Array.isArray(value.playlistRuns) && value.playlistRuns.some(run => run.playlistId === filter.id);
}

export function recordedPastDays(progress: CompletionMap, today: string, filter?: HistoryFilter): string[] {
  return Object.entries(progress)
    .filter(([day, entries]) =>
      isValidDay(day) && day < today && entries
      && Object.entries(entries).some(([key, value]) => completionMatchesFilter(key, value, filter)))
    .map(([day]) => day)
    .sort((a, b) => b.localeCompare(a));
}

export function formatHistoryDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(year, month - 1, date));
}

export function getHistoryForDay(
  progress: CompletionMap,
  routines: Routine[],
  day: string,
  skills: RoutineSkill[] = [],
  filter?: HistoryFilter,
): HistoryRoutine[] {
  const byId = new Map(routines.map((routine) => [routine.id, routine]));
  const groups = new Map<string, HistoryRoutine>();
  const namedGroups = new Set<string>();

  for (const [key, completed] of Object.entries(progress[day] ?? {})) {
    if (!completionMatchesFilter(key, completed, filter)) continue;
    const parsed = splitProgressKey(key);
    if (!parsed) continue;
    const { routineId, stepId } = parsed;
    const routine = byId.get(routineId);
    let group = groups.get(routineId);
    if (!group) {
      group = {
        id: routineId,
        title: typeof completed === 'object' ? completed.routineTitle : routine?.title ?? `Removed routine (${historySourceId(routineId)})`,
        hidden: routine?.hidden ?? false,
        removed: !routine,
        steps: [],
      };
      groups.set(routineId, group);
    }
    if (typeof completed === 'object' && !namedGroups.has(routineId)) {
      group.title = completed.routineTitle;
      namedGroups.add(routineId);
    }
    const step = routine?.steps.find((item) => item.id === stepId);
    group.steps.push({
      id: stepId,
      title: typeof completed === 'object' ? completed.stepTitle : step?.title ?? `Removed step (${stepId})`,
      hidden: step?.hidden ?? false,
      removed: !step,
    });
    if (typeof completed === 'object' && completed !== null && Array.isArray(completed.playlistRuns)) {
      group.playlistRuns ??= [];
      for (const run of completed.playlistRuns ?? []) {
        if (!group.playlistRuns.some(existing => existing.playlistId === run.playlistId)) {
          group.playlistRuns.push(run);
        }
      }
    }
  }

  const history = [...groups.values()].sort((a, b) => {
    const aIndex = routines.findIndex((item) => item.id === a.id);
    const bIndex = routines.findIndex((item) => item.id === b.id);
    return (aIndex < 0 ? Infinity : aIndex) - (bIndex < 0 ? Infinity : bIndex);
  });
  for (const group of history) {
    const ratings = skills.flatMap(skill => (skill.ratings ?? [])
      .filter(rating => rating.routineTitle === group.title
        && localDayKey(new Date(rating.ratedAt)) === day)
      .map(rating => ({
        id: `${skill.id}:${rating.id}`,
        skillName: skill.name,
        rating: rating.rating,
        ratedAt: rating.ratedAt,
        ...(rating.note?.trim() ? { note: rating.note.trim() } : {}),
      })))
      .sort((a, b) => Date.parse(a.ratedAt) - Date.parse(b.ratedAt));
    if (ratings.length) group.skillRatings = ratings;
  }
  return history;
}

export function routineHistoryOptions(progress: CompletionMap, routines: Routine[]): HistoryFilterOption[] {
  const options = new Map<string, HistoryFilterOption>();
  for (const routine of routines) {
    options.set(routine.id, { id: routine.id, title: routine.title, archived: false });
  }
  for (const entries of Object.values(progress)) {
    for (const [key, value] of Object.entries(entries)) {
      if (!isCompleted(value)) continue;
      const parsed = splitProgressKey(key);
      if (!parsed || options.has(parsed.routineId)) continue;
      const title = typeof value === 'object' && value !== null
        ? value.routineTitle
        : `Removed routine (${historySourceId(parsed.routineId)})`;
      options.set(parsed.routineId, { id: parsed.routineId, title, archived: true });
    }
  }
  return [...options.values()].sort((a, b) =>
    a.title.localeCompare(b.title) || Number(a.archived) - Number(b.archived));
}

export function playlistHistoryOptions(
  progress: CompletionMap,
  playlists: RoutinePlaylist[],
): HistoryFilterOption[] {
  const options = new Map<string, HistoryFilterOption>();
  for (const playlist of playlists) {
    options.set(playlist.id, { id: playlist.id, title: playlist.title, archived: false });
  }
  for (const entries of Object.values(progress)) {
    for (const value of Object.values(entries)) {
      if (!isCompleted(value) || typeof value !== 'object' || value === null) continue;
      for (const run of (Array.isArray(value.playlistRuns) ? value.playlistRuns : [])) {
        if (!options.has(run.playlistId)) {
          options.set(run.playlistId, { id: run.playlistId, title: run.playlistTitle, archived: true });
        }
      }
    }
  }
  return [...options.values()].sort((a, b) =>
    a.title.localeCompare(b.title) || Number(a.archived) - Number(b.archived));
}