import type { CompletionMap, Routine } from '@/types/routines';

export type HistoryRoutine = {
  id: string;
  title: string;
  hidden: boolean;
  removed: boolean;
  steps: { id: string; title: string; hidden: boolean; removed: boolean }[];
};

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
      isValidDay(day) && day < today && entries && Object.values(entries).some((value) => value === true))
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
): HistoryRoutine[] {
  const byId = new Map(routines.map((routine) => [routine.id, routine]));
  const groups = new Map<string, HistoryRoutine>();

  for (const [key, completed] of Object.entries(progress[day] ?? {})) {
    if (completed !== true) continue;
    const separator = key.indexOf(':');
    if (separator <= 0 || separator === key.length - 1) continue;
    const routineId = key.slice(0, separator);
    const stepId = key.slice(separator + 1);
    const routine = byId.get(routineId);
    let group = groups.get(routineId);
    if (!group) {
      group = {
        id: routineId,
        title: routine?.title ?? `Removed routine (${routineId})`,
        hidden: routine?.hidden ?? false,
        removed: !routine,
        steps: [],
      };
      groups.set(routineId, group);
    }
    const step = routine?.steps.find((item) => item.id === stepId);
    group.steps.push({
      id: stepId,
      title: step?.title ?? `Removed step (${stepId})`,
      hidden: step?.hidden ?? false,
      removed: !step,
    });
  }

  return [...groups.values()].sort((a, b) => {
    const aIndex = routines.findIndex((item) => item.id === a.id);
    const bIndex = routines.findIndex((item) => item.id === b.id);
    return (aIndex < 0 ? Infinity : aIndex) - (bIndex < 0 ? Infinity : bIndex);
  });
}