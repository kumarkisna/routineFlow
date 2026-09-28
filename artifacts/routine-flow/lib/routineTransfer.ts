import { getStepSeconds, type CompletionMap, type Routine, type RoutineStep, type RoutineTone } from '@/types/routines';
import { MAX_CATEGORY_LENGTH, categoryKey } from '@/lib/routineCategories';

export const MAX_ROUTINE_FILE_BYTES = 5_000_000;
const FILE_FORMAT = 'routine-flow-routines';
const FILE_VERSION = 2;
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

function parseProgress(value: unknown, routines: Routine[]): CompletionMap {
  if (!isRecord(value)) throw new Error('The backup has invalid daily progress.');
  const allowed = new Set(routines.flatMap((routine) =>
    routine.steps.map((step) => `${routine.id}:${step.id}`)));
  const result: CompletionMap = {};
  let count = 0;
  for (const [day, entries] of Object.entries(value)) {
    if (!isDay(day) || !isRecord(entries)) throw new Error('The backup has an invalid progress date.');
    result[day] = {};
    for (const [key, completed] of Object.entries(entries)) {
      if (!allowed.has(key) || typeof completed !== 'boolean' || ++count > 100_000) {
        throw new Error('The backup has invalid step progress.');
      }
      if (completed) result[day][key] = true;
    }
  }
  return result;
}

export function serializeRoutines(routines: Routine[], progress?: CompletionMap): string {
  const allowed = new Set(routines.flatMap((routine) =>
    routine.steps.map((step) => `${routine.id}:${step.id}`)));
  const history: CompletionMap = {};
  if (progress) {
    for (const [day, entries] of Object.entries(progress)) {
      if (!isDay(day) || !isRecord(entries)) continue;
      const completed = Object.fromEntries(Object.entries(entries).filter(([key, value]) =>
        allowed.has(key) && value === true));
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
  if (!isRecord(value) || value.format !== FILE_FORMAT || (value.version !== 1 && value.version !== FILE_VERSION) ||
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
    ...(value.progress !== undefined ? { progress: parseProgress(value.progress, routines) } : {}),
  };
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
): { routines: Routine[]; added: number; skipped: number; renamed: number; idMap: Record<string, string> } {
  const ids = new Set(existing.map((routine) => routine.id));
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
      if (!completed) continue;
      const separator = key.indexOf(':');
      const targetId = idMap[key.slice(0, separator)];
      if (!targetId) continue;
      const targetKey = `${targetId}:${key.slice(separator + 1)}`;
      if (Object.prototype.hasOwnProperty.call(nextDay, targetKey)) {
        kept++;
      } else {
        nextDay[targetKey] = true;
        added++;
      }
    }
    if (Object.keys(nextDay).length) progress[day] = nextDay;
  }
  return { progress, added, kept };
}