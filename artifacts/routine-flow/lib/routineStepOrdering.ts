import type { RoutineStep } from '../types/routines';

export function moveRoutineStep(steps: RoutineStep[], index: number, direction: -1 | 1): RoutineStep[] {
  const destination = index + direction;
  if (!Number.isInteger(index) || index < 0 || index >= steps.length
    || destination < 0 || destination >= steps.length) return steps;

  const reordered = [...steps];
  [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
  return reordered;
}
