import { getStepSeconds, isCompleted, type CompletionMap, type Routine, type RoutineStep, type RoutineTone } from '@/types/routines';
import { MAX_CATEGORY_LENGTH, categoryKey } from '@/lib/routineCategories';
import { detachedHistoryId, progressRoutineIds, splitProgressKey } from '@/lib/historyIdentity';

export const MAX_ROUTINE_FILE_BYTES = 5_000_000;
const FILE_FORMAT = 'routine-flow-routines';
const FILE_VERSION = 5;
const TONES: RoutineTone[] = ['coral', 'sage', 'lavender', 'sun'];

export type RoutineBackup = { routines: Routine[]; progress?: CompletionMap };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes(':');
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseStep(value: unknown, routineIndex: number, stepIndex: number): RoutineStep {
  const label = `Routine ${routineIndex + 1}, step ${stepIndex + 1}`;
  if (!isRecord(value) || !isId(value.id) || !isText(value.title)) {
    throw new Error(`${label} needs a valid ID and name.`);
  }
  if (value.description !== undefined && typeof value.description !== 'string') {
    throw new Error(`${label} has invalid details.`);
  }
  if (value.hidden !== undefined && typeof value.hidden !== 'boolean') {
    throw new Error(`${label} has an invalid visibility setting.`);
  }
  if (value.duration !== undefined && typeof value.duration !== 'string') {
    throw new Error(`${label} has an invalid legacy duration.`);
  }

  const seconds = value.durationSeconds;
  const hasSeconds = typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0;
  const legacyMinutes = typeof value.duration === 'string' ? Number.parseInt(value.duration, 10) : NaN;
  if (!hasSeconds && !(Number.isFinite(legacyMinutes) && legacyMinutes > 0)) {
    throw new Error(`${label} needs a valid duration.`);
  }

  return {
    id: value.id,
    title: value.title,
    ...(value.description !== undefined ? { description: value.description as string } : {}),
    ...(value.hidden !== undefined ? { hidden: value.hidden as boolean } : {}),
    durationSeconds: hasSeconds ? seconds : legacyMinutes * 60,
    ...(value.duration !== undefined ? { duration: value.duration as string } : {}),
  };
}

function parseRoutine(value: unknown, index: number): Routine {
  const label = `Routine ${index + 1}`;
  if (!isRecord(value) || !isId(value.id) || !isText(value.title) ||
      typeof value.subtitle !== 'string' || !isText(value.icon) ||
      typeof value.tone !== 'string' || !TONES.includes(value.tone as RoutineTone) ||
      !isText(value.createdAt) || !Array.isArray(value.steps) ||
      value.steps.length === 0 || value.steps.length > 1000) {
    throw new Error(`${label} is missing required routine details or steps.`);
  }
  if (value.hidden !== undefined && typeof value.hidden !== 'boolean') {
    throw new Error(`${label} has an invalid visibility setting.`);
  }
  if (value.category !== undefined &&
      (typeof value.category !== 'string' || !value.category.trim() || value.category.length > MAX_CATEGORY_LENGTH)) {
    throw new Error(`${label} has an invalid category.`);
  }
  const steps = value.steps.map((step, stepIndex) => parseStep(step, index, stepIndex));
  if (new Set(steps.map((step) => step.id)).size !== steps.length) {
    throw new Error(`${label} contains duplicate step IDs.`);
  }
  return {
    id: value.id,
    title: value.title,
    subtitle: value.subtitle,
    ...(value.category !== undefined ? { category: (value.category as string).trim() } : {}),
    ...(value.hidden !== undefined ? { hidden: value.hidden } : {}),
    icon: value.icon,
    tone: value.tone as RoutineTone,
    steps,
    createdAt: value.createdAt,
  };
}

function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidCompletion(value: unknown): value is CompletionMap[string][string] {
  return typeof value === 'boolean' ||
    (isRecord(value) && Object.keys(value).length === 2 &&
      isText(value.routineTitle) && isText(value.stepTitle));
}

function parseProgress(value: unknown, routines: Routine[], version: number): CompletionMap {
  if (!isRecord(value)) throw new Error('The backup has invalid daily progress.');
  const allowed = new Set(routines.flatMap((routine) =>
    routine.steps.map((step) => `${routine.id}:${step.id}`)));
  const routineIds = new Set(routines.map((routine) => routine.id));
  const result: CompletionMap = {};
  let count = 0;
  for (const [day, entries] of Object.entries(value)) {
    if (!isDay(day) || !isRecord(entries)) throw new Error('The backup has an invalid progress date.');
    result[day] = {};
    for (const [key, completed] of Object.entries(entries)) {
      const parsed = splitProgressKey(key);
      // V4 restores removed steps; V5 also retains history of deleted routines.
      const historicalStep = parsed && version >= 4 &&
        (version >= 5 || routineIds.has(parsed.routineId));
      if (!(allowed.has(key) || historicalStep) || !isValidCompletion(completed) || ++count > 100_000) {
        throw new Error('The backup has invalid step progress.');
      }
      if (isCompleted(completed)) {
        result[day][key] = completed;
      }
    }
  }
  return result;
}

export function serializeRoutines(routines: Routine[], progress?: CompletionMap): string {
  const history: CompletionMap = {};
  if (progress) {
    for (const [day, entries] of Object.entries(progress)) {
      if (!isDay(day) || !isRecord(entries)) continue;
      const completed = Object.fromEntries(Object.entries(entries).filter(([key, value]) => {
        return splitProgressKey(key) && isValidCompletion(value) && isCompleted(value);
      }));
      if (Object.keys(completed).length) history[day] = completed;
    }
  }
  return JSON.stringify({
    format: FILE_FORMAT,
    version: FILE_VERSION,
    exportedAt: new Date().toISOString(),
    routines,
    ...(progress ? { progress: history } : {}),
  }, null, 2);
}

export function parseRoutinesFile(contents: string): RoutineBackup {
  if (contents.length > MAX_ROUTINE_FILE_BYTES) {
    throw new Error('This file is too large to import (5 MB maximum).');
  }
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error('This is not a valid JSON file.');
  }
  if (!isRecord(value) || value.format !== FILE_FORMAT || (value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4 && value.version !== FILE_VERSION) ||
      !Array.isArray(value.routines) || value.routines.length > 1000) {
    throw new Error('Choose a routines JSON file exported from Routine Flow.');
  }
  const routines = value.routines.map((routine, index) => parseRoutine(routine, index));
  if (new Set(routines.map((routine) => routine.id)).size !== routines.length) {
    throw new Error('The file contains duplicate routine IDs.');
  }
  if (value.version === 1 && value.progress !== undefined) {
    throw new Error('This older backup cannot contain daily progress.');
  }
  return {
    routines,
    ...(value.progress !== undefined ? { progress: parseProgress(value.progress, routines, value.version as number) } : {}),
  };
}

export function repairStoredRoutineDurations(contents: string): { serialized: string; repairedSteps: number } {
  if (contents.length > MAX_ROUTINE_FILE_BYTES) {
    throw new Error('Saved routines are too large to repair automatically. No changes were made.');
  }

  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error('Saved routines are not valid JSON. No changes were made.');
  }
  if (!Array.isArray(value) || value.length > 1000) {
    throw new Error('Saved routines are not in a supported list format. No changes were made.');
  }

  let repairedSteps = 0;
  const routines = value.map((routine) => {
    if (!isRecord(routine) || !Array.isArray(routine.steps)) return routine;
    const steps = routine.steps.map((step) => {
      if (!isRecord(step)) return step;

      const seconds = step.durationSeconds;
      const hasSeconds = typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0;
      const legacyIsString = step.duration === undefined || typeof step.duration === 'string';
      const legacyMinutes = typeof step.duration === 'string' ? Number.parseInt(step.duration, 10) : NaN;
      const hasLegacyMinutes = Number.isFinite(legacyMinutes) && legacyMinutes > 0;

      if (legacyIsString && hasSeconds) return step;

      repairedSteps += 1;
      if (legacyIsString && hasLegacyMinutes) {
        return { ...step, durationSeconds: legacyMinutes * 60 };
      }

      const repaired: Record<string, unknown> = {
        ...step,
        durationSeconds: hasSeconds ? seconds : 60,
      };
      if (!legacyIsString || !hasLegacyMinutes) delete repaired.duration;
      return repaired;
    });
    return { ...routine, steps };
  });

  if (repairedSteps === 0) {
    throw new Error('No invalid routine durations were found. No changes were made.');
  }

  parseRoutinesFile(JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, routines }));
  return { serialized: JSON.stringify(routines), repairedSteps };
}

function routineSignature(routine: Routine): string {
  return JSON.stringify([
    routine.title,
    routine.subtitle,
    categoryKey(routine.category),
    routine.icon,
    routine.tone,
    routine.createdAt,
    routine.hidden ?? false,
    routine.steps.map((step) => [
      step.id,
      step.title,
      step.description ?? '',
      getStepSeconds(step),
      step.hidden ?? false,
    ]),
  ]);
}

export function mergeImportedRoutines(
  existing: Routine[],
  imported: Routine[],
  createId: () => string,
  existingProgress: CompletionMap = {},
): { routines: Routine[]; added: number; skipped: number; renamed: number; idMap: Record<string, string> } {
  // A new routine must not take over history belonging to a deleted one.
  const ids = new Set([...existing.map((routine) => routine.id), ...progressRoutineIds(existingProgress)]);
  const signatures = new Map(existing.map((routine) => [routineSignature(routine), routine.id]));
  const routines = [...existing];
  const idMap: Record<string, string> = Object.create(null);
  let added = 0;
  let skipped = 0;
  let renamed = 0;

  for (const routine of imported) {
    const signature = routineSignature(routine);
    const matchingId = signatures.get(signature);
    if (matchingId) {
      idMap[routine.id] = matchingId;
      skipped += 1;
      continue;
    }
    let id = routine.id;
    if (ids.has(id)) {
      do {
        id = createId();
      } while (ids.has(id));
      renamed += 1;
    }
    ids.add(id);
    signatures.set(signature, id);
    idMap[routine.id] = id;
    routines.push(id === routine.id ? routine : { ...routine, id });
    added += 1;
  }
  return { routines, added, skipped, renamed, idMap };
}

export function mergeImportedProgress(
  existing: CompletionMap,
  imported: CompletionMap,
  idMap: Record<string, string>,
): { progress: CompletionMap; added: number; kept: number } {
  const progress = { ...existing };
  let added = 0;
  let kept = 0;
  for (const [day, entries] of Object.entries(imported)) {
    const nextDay = { ...(progress[day] ?? {}) };
    for (const [key, completed] of Object.entries(entries)) {
      if (!isCompleted(completed)) continue;
      const parsed = splitProgressKey(key);
      if (!parsed) continue;
      const targetId = Object.prototype.hasOwnProperty.call(idMap, parsed.routineId)
        ? idMap[parsed.routineId] : detachedHistoryId(parsed.routineId);
      const targetKey = `${targetId}:${parsed.stepId}`;
      if (Object.prototype.hasOwnProperty.call(nextDay, targetKey)) {
        kept++;
      } else {
        nextDay[targetKey] = completed;
        added++;
      }
    }
    if (Object.keys(nextDay).length) progress[day] = nextDay;
  }
  return { progress, added, kept };
}

// Keep the in-memory routine list aligned with the first successful write even if
// the subsequent history write fails. A retry then matches the saved routines.
export async function persistImportedBackup(
  storage: {
    setItem: (key: string, value: string) => Promise<unknown>;
    getItem: (key: string) => Promise<string | null>;
  },
  routinesKey: string,
  progressKey: string,
  routines: Routine[],
  progress: CompletionMap,
  routinesAdded: number,
  progressAdded: number,
  onRoutinesSaved: (routines: Routine[]) => void,
  onProgressSaved: (progress: CompletionMap) => void,
  onUncertainRoutinesSave: () => void,
): Promise<void> {
  if (routinesAdded > 0) {
    const serialized = JSON.stringify(routines);
    try {
      await storage.setItem(routinesKey, serialized);
    } catch {
      let saved: string | null;
      try {
        saved = await storage.getItem(routinesKey);
      } catch {
        onUncertainRoutinesSave();
        throw new Error('Could not confirm whether routines were saved. Restart the app before trying this backup again to avoid duplicates.');
      }
      if (saved === serialized) {
        onRoutinesSaved(routines);
        throw new Error(`${routinesAdded} ${routinesAdded === 1 ? 'routine was' : 'routines were'} saved, but daily progress was not restored. Try importing this backup again; routines will not be duplicated.`);
      }
      onUncertainRoutinesSave();
      throw new Error('Could not confirm which routines were saved. Restart the app before trying this backup again to avoid duplicates.');
    }
    onRoutinesSaved(routines);
  }
  if (progressAdded > 0) {
    try {
      await storage.setItem(progressKey, JSON.stringify(progress));
      onProgressSaved(progress);
    } catch {
      const routineStatus = routinesAdded > 0
        ? `${routinesAdded} ${routinesAdded === 1 ? 'routine was' : 'routines were'} saved`
        : 'Your routines were already present';
      throw new Error(`${routineStatus}, but daily progress could not be confirmed saved. Try importing this backup again to finish restoring progress; routines will not be duplicated.`);
    }
  }
}