import { isCompleted, type CompletionMap, type CompletionValue, type Routine } from '@/types/routines';
import { historySourceId, splitProgressKey } from '@/lib/historyIdentity';
import type { RoutineSkill } from '@/lib/skills';

export type HistoryRoutine = {
  id: string;
  title: string;
  hidden: boolean;
  removed: boolean;
  steps: { id: string; title: string; hidden: boolean; removed: boolean }[];
  skillRatings?: { id: string; skillName: string; rating: number; ratedAt: string; note: string }[];
};

export function recordCompletion(
  routineTitle: string,
  stepTitle: string,
  previous: CompletionValue | undefined,
): CompletionValue {
  return isCompleted(previous) ? previous! : { routineTitle, stepTitle };
}

function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function recordedPastDays(progress: CompletionMap, today: string): string[] {
  return Object.entries(progress)
    .filter(([day, entries]) =>
      isValidDay(day) && day < today && entries && Object.values(entries).some(isCompleted))
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
): HistoryRoutine[] {
  const byId = new Map(routines.map((routine) => [routine.id, routine]));
  const groups = new Map<string, HistoryRoutine>();
  const namedGroups = new Set<string>();

  for (const [key, completed] of Object.entries(progress[day] ?? {})) {
    if (!isCompleted(completed)) continue;
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
  }

  const history = [...groups.values()].sort((a, b) => {
    const aIndex = routines.findIndex((item) => item.id === a.id);
    const bIndex = routines.findIndex((item) => item.id === b.id);
    return (aIndex < 0 ? Infinity : aIndex) - (bIndex < 0 ? Infinity : bIndex);
  });
  for (const group of history) {
    const ratings = skills.flatMap(skill => (skill.ratings ?? [])
      .filter(rating => rating.routineTitle === group.title
        && rating.note?.trim()
        && localDayKey(new Date(rating.ratedAt)) === day)
      .map(rating => ({
        id: `${skill.id}:${rating.id}`,
        skillName: skill.name,
        rating: rating.rating,
        ratedAt: rating.ratedAt,
        note: rating.note!.trim(),
      })))
      .sort((a, b) => Date.parse(a.ratedAt) - Date.parse(b.ratedAt));
    if (ratings.length) group.skillRatings = ratings;
  }
  return history;
}