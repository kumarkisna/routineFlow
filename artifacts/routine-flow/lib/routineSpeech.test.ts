import assert from 'node:assert/strict';
import test from 'node:test';
import type { Routine } from '../types/routines';
import { buildStepAnnouncement } from './routineSpeech';
import { renameSkillInCatalog, type RoutineSkill } from './skills';

const routine: Routine = {
  id: 'morning-reset',
  title: 'Morning reset',
  subtitle: '',
  icon: 'sun',
  tone: 'sage',
  createdAt: '2030-04-01T00:00:00.000Z',
  skillIds: ['skill-focus'],
  steps: [
    { id: 'water', title: 'Drink a glass of water', durationSeconds: 60, skillIds: ['skill-focus'] },
    { id: 'stretch', title: 'Stretch', durationSeconds: 30, skillIds: ['skill-focus'] },
  ],
};

const playlist = { title: 'Start the day', skillIds: ['skill-focus'] };
const initialSkills: RoutineSkill[] = [{ id: 'skill-focus', name: 'Focus' }];
const renamedSkills = renameSkillInCatalog(initialSkills, 'skill-focus', 'Sustained focus');

test('routine and step announcements use the current renamed skill while keeping assignment IDs', () => {
  assert.equal(
    buildStepAnnouncement(routine, 0, renamedSkills),
    'Routine Morning reset. Skills: Sustained focus. Step 1. Drink a glass of water. Skills: Sustained focus. You have 1 minute.',
  );
  assert.equal(
    buildStepAnnouncement(routine, 1, renamedSkills),
    'Step 2. Stretch. Skills: Sustained focus. You have 30 seconds.',
  );
  assert.deepEqual(routine.skillIds, ['skill-focus']);
  assert.deepEqual(routine.steps.map(step => step.skillIds), [['skill-focus'], ['skill-focus']]);
});

test('playlist-start speech uses the current renamed playlist, routine, and step skill names', () => {
  assert.equal(
    buildStepAnnouncement(routine, 0, renamedSkills, playlist),
    'Playlist Start the day. Skills: Sustained focus. Routine Morning reset. Skills: Sustained focus. Step 1. Drink a glass of water. Skills: Sustained focus. You have 1 minute.',
  );
  assert.deepEqual(playlist.skillIds, ['skill-focus']);
});
