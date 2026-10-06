import assert from 'node:assert/strict';
import test from 'node:test';
import type { Routine } from '../types/routines';
import { buildStepAnnouncement } from './routineSpeech';
import { getNextRoutineStepIndex, getPlayableRoutine, getRoutinePlaybackStep, getRoutinePlaybackStepSeconds } from './routinePlayback';
import { moveRoutineStep } from './routineStepOrdering';

test('a saved reordered routine announces, times, and completes each step in order', () => {
  const originalRoutine: Routine = {
    id: 'morning-reset',
    title: 'Morning reset',
    subtitle: '',
    icon: 'sun',
    tone: 'sage',
    createdAt: '2030-01-01T00:00:00.000Z',
    steps: [
      { id: 'warm-up', title: 'Warm up', description: 'Roll your shoulders', durationSeconds: 19 },
      { id: 'optional', title: 'Optional stretch', durationSeconds: 13, hidden: true },
      { id: 'drink-water', title: 'Drink water', description: 'Take a few sips', durationSeconds: 27 },
    ],
  };
  const reorderedSteps = moveRoutineStep(
    moveRoutineStep(originalRoutine.steps, 2, -1),
    1,
    -1,
  );
  const savedRoutine = JSON.parse(JSON.stringify({
    ...originalRoutine,
    steps: reorderedSteps,
  })) as Routine;
  const playbackRoutine = getPlayableRoutine(savedRoutine);

  assert.deepEqual(savedRoutine.steps.map(step => step.id), ['drink-water', 'warm-up', 'optional']);
  assert.deepEqual(playbackRoutine.steps.map(step => step.id), ['drink-water', 'warm-up']);
  assert.deepEqual(
    playbackRoutine.steps.map((_, index) => getRoutinePlaybackStepSeconds(playbackRoutine, index)),
    [27, 19],
  );
  assert.deepEqual(
    playbackRoutine.steps.map((_, index) => buildStepAnnouncement(playbackRoutine, index, [])),
    [
      'Step 1. Drink water. Take a few sips. You have 27 seconds.',
      'Step 2. Warm up. Roll your shoulders. You have 19 seconds.',
    ],
  );

  const completedStepIds: string[] = [];
  let activeIndex: number | null = 0;
  while (activeIndex !== null) {
    completedStepIds.push(getRoutinePlaybackStep(playbackRoutine, activeIndex).id);
    activeIndex = getNextRoutineStepIndex(playbackRoutine, activeIndex);
  }

  assert.deepEqual(completedStepIds, ['drink-water', 'warm-up']);
  assert.equal(new Set(completedStepIds).size, playbackRoutine.steps.length);
});
