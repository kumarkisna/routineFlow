import { getStepSeconds, type Routine, type RoutineStep, type RoutineTone } from '@/types/routines';

export const MAX_ROUTINE_FILE_BYTES = 5_000_000;
const FILE_FORMAT = 'routine-flow-routines';
const FILE_VERSION = 1;
const TONES: RoutineTone[] = ['coral', 'sage', 'lavender', 'sun'];

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
  const steps = value.steps.map((step, stepIndex) => parseStep(step, index, stepIndex));
  if (new Set(steps.map((step) => step.id)).size !== steps.length) {
    throw new Error(`${label} contains duplicate step IDs.`);
  }
  return {
    id: value.id,
    title: value.title,
    subtitle: value.subtitle,
    ...(value.hidden !== undefined ? { hidden: value.hidden } : {}),
    icon: value.icon,
    tone: value.tone as RoutineTone,
    steps,
    createdAt: value.createdAt,
  };
}

export function serializeRoutines(routines: Routine[]): string {
  return JSON.stringify({
    format: FILE_FORMAT,
    version: FILE_VERSION,
    exportedAt: new Date().toISOString(),
    routines,
  }, null, 2);
}

export function parseRoutinesFile(contents: string): Routine[] {
  if (contents.length > MAX_ROUTINE_FILE_BYTES) {
    throw new Error('This file is too large to import (5 MB maximum).');
  }
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error('This is not a valid JSON file.');
  }
  if (!isRecord(value) || value.format !== FILE_FORMAT || value.version !== FILE_VERSION ||
      !Array.isArray(value.routines) || value.routines.length > 1000) {
    throw new Error('Choose a routines JSON file exported from Routine Flow.');
  }
  const routines = value.routines.map((routine, index) => parseRoutine(routine, index));
  if (new Set(routines.map((routine) => routine.id)).size !== routines.length) {
    throw new Error('The file contains duplicate routine IDs.');
  }
  return routines;
}

function routineSignature(routine: Routine): string {
  return JSON.stringify([
    routine.title,
    routine.subtitle,
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
): { routines: Routine[]; added: number; skipped: number; renamed: number } {
  const ids = new Set(existing.map((routine) => routine.id));
  const signatures = new Set(existing.map(routineSignature));
  const routines = [...existing];
  let added = 0;
  let skipped = 0;
  let renamed = 0;

  for (const routine of imported) {
    const signature = routineSignature(routine);
    if (signatures.has(signature)) {
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
    signatures.add(signature);
    routines.push(id === routine.id ? routine : { ...routine, id });
    added += 1;
  }
  return { routines, added, skipped, renamed };
}