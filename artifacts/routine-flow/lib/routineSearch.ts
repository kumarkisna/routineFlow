import type { Routine } from '@/types/routines';
import type { RoutineStep } from '@/types/routines';
import type { RoutineSkill } from '@/lib/skills';
import { detailHtmlToText } from '@/lib/stepDetailHtml';

export function filterRoutinesByStepKeywords(
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

export function filterRoutineStepsByKeywords(
  routine: Routine,
  skills: RoutineSkill[],
  query: string,
): RoutineStep[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return routine.steps;
  const skillNames = new Map(skills.map(skill => [skill.id, skill.name]));
  const routineContext = [
    routine.title,
    routine.category ?? '',
    routine.subtitle,
    detailHtmlToText(routine.subtitleHtml ?? ''),
    ...(routine.skillIds ?? []).map(id => skillNames.get(id) ?? ''),
  ].join(' ').toLocaleLowerCase();
  return routine.steps.filter(step => {
    const searchable = [
      routineContext,
      step.title,
      step.description ?? '',
      ...(step.additionalDetails ?? []),
      ...(step.detailHtml ?? []).map(detailHtmlToText),
      ...(step.skillIds ?? []).map(id => skillNames.get(id) ?? ''),
    ].join(' ').toLocaleLowerCase();
    return terms.every(term => searchable.includes(term));
  });
}
