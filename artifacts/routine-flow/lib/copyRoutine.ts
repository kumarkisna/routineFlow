import type { Routine, RoutineStep } from '@/types/routines';
import type { RoutineSkill } from '@/lib/skills';
import { detailHtmlToText } from '@/lib/stepDetailHtml';

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
): RoutineStep[] {
  const usedIds = new Set([
    ...source.steps.map(step => step.id),
    ...existingSteps.map(step => step.id),
  ]);
  return copyRoutineStepsWithUsedIds(source, usedIds, createId);
}

function copyRoutineStepsWithUsedIds(source: Routine, usedIds: Set<string>, createId: () => string): RoutineStep[] {
  return source.steps.map(step => cloneStep(step, createUniqueId(createId, usedIds)));
}

export function filterRoutineSourcesForStepCopy(
  routines: Routine[],
  skills: RoutineSkill[],
  query: string,
): Routine[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return routines;
  const skillNames = new Map(skills.map(skill => [skill.id, skill.name]));

  return routines.filter(routine => {
    const searchable = [
      routine.title,
      routine.category ?? '',
      routine.subtitle,
      detailHtmlToText(routine.subtitleHtml ?? ''),
      ...(routine.skillIds ?? []).map(id => skillNames.get(id) ?? ''),
      ...routine.steps.flatMap(step => [
        step.title,
        step.description ?? '',
        ...(step.additionalDetails ?? []),
        ...(step.detailHtml ?? []).map(detailHtmlToText),
        ...(step.skillIds ?? []).map(id => skillNames.get(id) ?? ''),
      ]),
    ].join(' ').toLocaleLowerCase();
    return terms.every(term => searchable.includes(term));
  });
}