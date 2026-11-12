import assert from 'node:assert/strict';
import test from 'node:test';
import { filterRoutinesByStepKeywords } from './routineSearch';
import type { Routine } from '../types/routines';

const morning: Routine = {
  id: 'morning',
  title: 'Morning reset',
  subtitle: 'Start the day calmly',
  category: 'Wellness',
  icon: 'sun',
  tone: 'sage',
  createdAt: '2026-01-01T00:00:00.000Z',
  skillIds: ['routine-skill'],
  steps: [{
    id: 'breathe',
    title: 'Breathe slowly',
    description: 'Take a calming breath',
    additionalDetails: ['Relax your shoulders'],
    detailHtml: ['<p>Calm instruction</p>'],
    skillIds: ['step-skill'],
    durationSeconds: 75,
  }],
};

const work: Routine = {
  ...morning,
  id: 'work',
  title: 'Desk reset',
  category: 'Work',
  skillIds: [],
  steps: [{ id: 'desk', title: 'Clear desk', durationSeconds: 30 }],
};

test('routine search matches titles, categories, descriptions, rich text, and skills', () => {
  const routines = [morning, work];
  const skills = [
    { id: 'routine-skill', name: 'Mindful focus' },
    { id: 'step-skill', name: 'Breathwork' },
  ];
  assert.deepEqual(filterRoutinesByStepKeywords(routines, skills, 'MORNING WELLNESS'), [morning]);
  assert.deepEqual(filterRoutinesByStepKeywords(routines, skills, 'calming breath'), [morning]);
  assert.deepEqual(filterRoutinesByStepKeywords(routines, skills, 'calm instruction'), [morning]);
  assert.deepEqual(filterRoutinesByStepKeywords(routines, skills, 'breathwork'), [morning]);
  assert.deepEqual(filterRoutinesByStepKeywords(routines, skills, 'mindful focus'), [morning]);
  assert.deepEqual(filterRoutinesByStepKeywords(routines, skills, 'nothing matches'), []);
  assert.deepEqual(filterRoutinesByStepKeywords(routines, skills, '   '), routines);
});
