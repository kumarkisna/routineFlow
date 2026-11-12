import type { Routine, RoutineStep } from '@/types/routines';

export function makeRoutineCopy(source: Routine, existing: Routine[], createId: () => string): Routine {
  const usedIds = new Set([...existing.map(routine => routine.id), ...source.steps.map(step => step.id)]);
  const id = createUniqueId(createId, usedIds);
  return {
    ...source,
    id,
    title: `${source.title} (copy)`,
    steps: copyRoutineStepsWithUsedIds(source, usedIds, createId),
    createdAt: new Date().toISOString(),
  };
}

function createUniqueId(createId: () => string, usedIds: Set<string>): string {
  let id = createId();
  while (usedIds.has(id)) id = createId();
  usedIds.add(id);
  return id;
}

function cloneStep(step: RoutineStep, id: string): RoutineStep {
  return {
    ...step,
    ...(step.additionalDetails ? { additionalDetails: [...step.additionalDetails] } : {}),
    ...(step.detailSpeech ? { detailSpeech: [...step.detailSpeech] } : {}),
    ...(step.detailAttachments
      ? { detailAttachments: step.detailAttachments.map(group => group.map(file => ({ ...file }))) }
      : {}),
    ...(step.detailHtml ? { detailHtml: [...step.detailHtml] } : {}),
    ...(step.skillIds ? { skillIds: [...step.skillIds] } : {}),
    id,
  };
}

export function copyRoutineSteps(
  source: Routine,
  existingSteps: RoutineStep[],
  createId: () => string,
  selectedStepIds?: string[],
): RoutineStep[] {
  const usedIds = new Set([
    ...source.steps.map(step => step.id),
    ...existingSteps.map(step => step.id),
  ]);
  const selected = selectedStepIds ? new Set(selectedStepIds) : null;
  const steps = selected ? source.steps.filter(step => selected.has(step.id)) : source.steps;
  return steps.map(step => cloneStep(step, createUniqueId(createId, usedIds)));
}

function copyRoutineStepsWithUsedIds(source: Routine, usedIds: Set<string>, createId: () => string): RoutineStep[] {
  return source.steps.map(step => cloneStep(step, createUniqueId(createId, usedIds)));
}