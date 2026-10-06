import type { Routine, RoutineStep } from '../types/routines';
import { getStepSeconds } from '../types/routines';

export function getPlayableRoutine(routine: Routine): Routine {
  return {
    ...routine,
    steps: routine.steps.filter(step => !step.hidden),
  };
}

export function getRoutinePlaybackStep(routine: Pick<Routine, 'steps'>, index: number): RoutineStep {
  const step = routine.steps[index];
  if (!step) throw new RangeError('Routine playback step index is out of range.');
  return step;
}

export function getRoutinePlaybackStepSeconds(routine: Pick<Routine, 'steps'>, index: number): number {
  return getStepSeconds(getRoutinePlaybackStep(routine, index));
}

export function getNextRoutineStepIndex(
  routine: Pick<Routine, 'steps'>,
  currentIndex: number,
): number | null {
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= routine.steps.length) {
    return null;
  }
  const nextIndex = currentIndex + 1;
  return nextIndex < routine.steps.length ? nextIndex : null;
}
