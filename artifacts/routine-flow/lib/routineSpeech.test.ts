import assert from 'node:assert/strict';
import test from 'node:test';
import type { Routine } from '../types/routines';
import {
  buildStepAnnouncement,
  getSpeechResumeMode,
  RoutineSpeechQueue,
  type RoutineSpeechOptions,
} from './routineSpeech';
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
const speechOptions: RoutineSpeechOptions = { rate: 0.92, pitch: 1 };

test('speech resume restarts the current step on Android and resumes the utterance on iOS and web', () => {
  assert.equal(getSpeechResumeMode('android'), 'replay-current-step');
  assert.equal(getSpeechResumeMode('ios'), 'resume-utterance');
  assert.equal(getSpeechResumeMode('web'), 'resume-utterance');
});

test('overlapping routine announcements play in FIFO order and resolve independently', async () => {
  const spoken: string[] = [];
  const finishByText = new Map<string, (result: 'finished' | 'error') => void>();
  const queue = new RoutineSpeechQueue((text, _options, finish) => {
    spoken.push(text);
    finishByText.set(text, finish);
  }, () => undefined);

  const first = queue.announce('run-one', 'First routine, step one.', speechOptions);
  const second = queue.announce('run-two', 'Second routine, step one.', speechOptions);
  assert.deepEqual(spoken, ['First routine, step one.']);

  finishByText.get('First routine, step one.')?.('finished');
  assert.equal(await first, 'finished');
  assert.deepEqual(spoken, ['First routine, step one.', 'Second routine, step one.']);

  finishByText.get('Second routine, step one.')?.('finished');
  assert.equal(await second, 'finished');
});

test('pausing or closing a queued run removes its speech without blocking the active run', async () => {
  const spoken: string[] = [];
  let finishActive: ((result: 'finished' | 'error') => void) | undefined;
  const queue = new RoutineSpeechQueue((text, _options, finish) => {
    spoken.push(text);
    finishActive = finish;
  }, () => undefined);

  const first = queue.announce('run-one', 'Active announcement.', speechOptions);
  const cancelled = queue.announce('run-two', 'Announcement to cancel.', speechOptions);
  await queue.cancel('run-two');

  assert.equal(await cancelled, 'cancelled');
  assert.deepEqual(spoken, ['Active announcement.']);
  finishActive?.('finished');
  assert.equal(await first, 'finished');
  assert.deepEqual(spoken, ['Active announcement.']);
});

test('cancelling an active run stops it before the next routine starts speaking', async () => {
  const spoken: string[] = [];
  const completions = new Map<string, (result: 'finished' | 'error') => void>();
  let releaseStop: (() => void) | undefined;
  let stopCount = 0;
  const queue = new RoutineSpeechQueue((text, _options, finish) => {
    spoken.push(text);
    completions.set(text, finish);
  }, () => {
    stopCount += 1;
    return new Promise<void>((resolve) => { releaseStop = resolve; });
  });

  const first = queue.announce('run-one', 'Announcement being paused.', speechOptions);
  const second = queue.announce('run-two', 'Next routine announcement.', speechOptions);
  const cancellation = queue.cancel('run-one');
  assert.equal(await first, 'cancelled');
  assert.equal(stopCount, 1);
  assert.deepEqual(spoken, ['Announcement being paused.']);

  releaseStop?.();
  await cancellation;
  assert.deepEqual(spoken, ['Announcement being paused.', 'Next routine announcement.']);
  completions.get('Next routine announcement.')?.('finished');
  assert.equal(await second, 'finished');
});

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

test('multi-skill announcements use renamed names in assignment order without repeating IDs', () => {
  const multiRoutine: Routine = {
    ...routine,
    skillIds: ['skill-focus', 'skill-planning', 'skill-focus'],
    steps: [
      { ...routine.steps[0], skillIds: ['skill-mobility', 'skill-focus', 'skill-mobility'] },
      { ...routine.steps[1], skillIds: ['skill-planning', 'skill-mobility', 'skill-planning'] },
    ],
  };
  const multiPlaylist = {
    ...playlist,
    skillIds: ['skill-planning', 'skill-focus', 'skill-planning'],
  };
  const catalog = renameSkillInCatalog([
    { id: 'skill-planning', name: 'Planning' },
    { id: 'skill-focus', name: 'Focus' },
    { id: 'skill-mobility', name: 'Mobility' },
  ], 'skill-focus', 'Sustained focus');

  assert.equal(
    buildStepAnnouncement(multiRoutine, 0, catalog),
    'Routine Morning reset. Skills: Sustained focus, Planning. Step 1. Drink a glass of water. Skills: Mobility, Sustained focus. You have 1 minute.',
  );
  assert.equal(
    buildStepAnnouncement(multiRoutine, 1, catalog),
    'Step 2. Stretch. Skills: Planning, Mobility. You have 30 seconds.',
  );
  assert.equal(
    buildStepAnnouncement(multiRoutine, 0, catalog, multiPlaylist),
    'Playlist Start the day. Skills: Planning, Sustained focus. Routine Morning reset. Skills: Sustained focus, Planning. Step 1. Drink a glass of water. Skills: Mobility, Sustained focus. You have 1 minute.',
  );

  assert.deepEqual(multiRoutine.skillIds, ['skill-focus', 'skill-planning', 'skill-focus']);
  assert.deepEqual(multiRoutine.steps[0].skillIds, ['skill-mobility', 'skill-focus', 'skill-mobility']);
  assert.deepEqual(multiPlaylist.skillIds, ['skill-planning', 'skill-focus', 'skill-planning']);
});

test('muted details are omitted while the renamed assigned skill and enabled details remain in order', () => {
  const routineWithOneMutedDetail: Routine = {
    ...routine,
    steps: [
      {
        ...routine.steps[0],
        description: 'Main instruction',
        additionalDetails: ['First extra', 'Muted extra', 'Last extra'],
        detailSpeech: [true, true, false, true],
      },
      routine.steps[1],
    ],
  };

  assert.equal(
    buildStepAnnouncement(routineWithOneMutedDetail, 0, renamedSkills),
    'Routine Morning reset. Skills: Sustained focus. Step 1. Drink a glass of water. Skills: Sustained focus. Main instruction. First extra. Last extra. You have 1 minute.',
  );
});

test('assigned skill names remain spoken when all step details are muted', () => {
  const routineWithMutedDetails: Routine = {
    ...routine,
    steps: [
      {
        ...routine.steps[0],
        description: 'Muted main instruction',
        additionalDetails: ['Muted extra'],
        detailSpeech: [false, false],
      },
      routine.steps[1],
    ],
  };

  assert.equal(
    buildStepAnnouncement(routineWithMutedDetails, 0, renamedSkills),
    'Routine Morning reset. Skills: Sustained focus. Step 1. Drink a glass of water. Skills: Sustained focus. You have 1 minute.',
  );
});

test('step announcements use formatted details as plain text without reading HTML markup', () => {
  const richRoutine: Routine = {
    ...routine,
    steps: [
      {
        ...routine.steps[0],
        description: 'Prepare the surface.\nSpread the mixture evenly.',
        detailHtml: [
          '<h2 style="text-align:center;color:#345">Prepare the surface.</h2><ul><li>Spread the mixture evenly.</li></ul>',
        ],
      },
      routine.steps[1],
    ],
  };

  const announcement = buildStepAnnouncement(richRoutine, 0, []);
  assert.ok(announcement.includes('Prepare the surface.\nSpread the mixture evenly.'));
  assert.doesNotMatch(announcement, /<\/?[a-z][^>]*>/i);
  assert.doesNotMatch(announcement, /text-align|color:#345/);
});

test('routine description is spoken before the first step, using formatted text and respecting its speech setting', () => {
  const described: Routine = {
    ...routine,
    subtitle: 'Prepare calmly.',
    subtitleHtml: '<h2>Prepare calmly.</h2><p>Clear the workspace.</p>',
  };
  const announcement = buildStepAnnouncement(described, 0, []);
  assert.ok(announcement.startsWith('Prepare calmly.\nClear the workspace. Step 1.'));
  assert.doesNotMatch(announcement, /<\/?[a-z][^>]*>/i);

  assert.equal(
    buildStepAnnouncement({ ...described, speakSubtitle: false }, 0, []),
    'Step 1. Drink a glass of water. You have 1 minute.',
  );
});

test('routine description is not repeated on later step announcements', () => {
  const described: Routine = { ...routine, subtitle: 'Prepare calmly.' };
  assert.equal(
    buildStepAnnouncement(described, 1, []),
    'Step 2. Stretch. You have 30 seconds.',
  );
});
