import { getStepSeconds, type CompletionMap, type Routine, type RoutineStep } from './routines';

export type RoutineBackup = {
  format: 'routine-flow-backup';
  version: 1;
  exportedAt: string;
  routines: Routine[];
  progress: CompletionMap;
};

export const MAX_BACKUP_SIZE = 10_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(): never {
  throw new Error('This is not a valid Routine Flow backup file.');
}

export function createRoutineBackup(routines: Routine[], progress: CompletionMap): string {
  const backup: RoutineBackup = {
    format: 'routine-flow-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    routines: routines.map((routine) => ({
      ...routine,
      steps: routine.steps.map((step) => ({
        id: step.id,
        title: step.title,
        durationSeconds: getStepSeconds(step),
      })),
    })),
    progress,
  };
  return `${JSON.stringify(backup, null, 2)}\n`;
}

export function parseRoutineBackup(text: string): RoutineBackup {
  if (text.length > MAX_BACKUP_SIZE) throw new Error('Backup is too large (10 MB maximum).');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return invalid();
  }
  if (!isRecord(value) || value.format !== 'routine-flow-backup') return invalid();
  if (value.version !== 1) throw new Error('This backup version is not supported.');
  if (
    typeof value.exportedAt !== 'string' ||
    !Array.isArray(value.routines) ||
    value.routines.length > 10000 ||
    !isRecord(value.progress)
  ) return invalid();

  const routineIds = new Set<string>();
  const routines: Routine[] = value.routines.map((item: unknown) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' || !item.id || item.id.length > 200 ||
      routineIds.has(item.id) ||
      typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500 ||
      typeof item.subtitle !== 'string' || item.subtitle.length > 2000 ||
      typeof item.icon !== 'string' || !item.icon || item.icon.length > 100 ||
      !['coral', 'sage', 'lavender', 'sun'].includes(String(item.tone)) ||
      typeof item.createdAt !== 'string' ||
      !Array.isArray(item.steps) || item.steps.length === 0 || item.steps.length > 1000
    ) return invalid();
    routineIds.add(item.id);
    const stepIds = new Set<string>();
    const steps: RoutineStep[] = item.steps.map((rawStep: unknown) => {
      if (
        !isRecord(rawStep) ||
        typeof rawStep.id !== 'string' || !rawStep.id || rawStep.id.length > 200 ||
        stepIds.has(rawStep.id) ||
        typeof rawStep.title !== 'string' || !rawStep.title.trim() || rawStep.title.length > 500 ||
        !Number.isSafeInteger(rawStep.durationSeconds) ||
        (rawStep.durationSeconds as number) <= 0
      ) return invalid();
      stepIds.add(rawStep.id);
      return { id: rawStep.id, title: rawStep.title, durationSeconds: rawStep.durationSeconds as number };
    });
    return {
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      icon: item.icon,
      tone: item.tone as Routine['tone'],
      createdAt: item.createdAt,
      steps,
    };
  });

  const progress: CompletionMap = {};
  for (const [day, entries] of Object.entries(value.progress)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isRecord(entries)) return invalid();
    progress[day] = {};
    for (const [key, done] of Object.entries(entries)) {
      if (typeof done !== 'boolean' || key.length > 500) return invalid();
      progress[day][key] = done;
    }
  }
  return { format: 'routine-flow-backup', version: 1, exportedAt: value.exportedAt, routines, progress };
}