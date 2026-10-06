import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SKILL_RATING_WINDOW,
  getRoutineSkillIds,
  getSkillAssociations,
  getSkillAverage,
  getSkillRatingPoints,
  MAX_SKILL_NOTE_LENGTH,
  mergeSkillCatalog,
  parseSkillRatingWindow,
  parseSkills,
  type RoutineSkill,
} from './skills';

const history: RoutineSkill = {
  id: 'skill-focus',
  name: 'Focus',
  ratings: [
    { id: 'rating-2', rating: 8, ratedAt: '2030-01-02T00:00:00.000Z', routineTitle: 'Morning', note: 'Keep breathing steadily.' },
    { id: 'rating-4', rating: 10, ratedAt: '2030-01-04T00:00:00.000Z', routineTitle: 'Evening' },
    { id: 'rating-1', rating: 2, ratedAt: '2030-01-01T00:00:00.000Z', routineTitle: 'Morning' },
    { id: 'rating-3', rating: 4, ratedAt: '2030-01-03T00:00:00.000Z', routineTitle: 'Midday' },
  ],
};

test('each chart point shows the moving average over the latest N ratings at that point', () => {
  const points = getSkillRatingPoints(history, 3, 2);
  assert.deepEqual(points.map(point => point.rating), [4, 10]);
  assert.deepEqual(points.map(point => point.average), [14 / 3, 22 / 3]);
  assert.deepEqual(getSkillAverage(history, 3), { average: 22 / 3, count: 3 });
  assert.deepEqual(getSkillAverage({ id: 'unrated', name: 'New skill' }, 5), { average: null, count: 0 });
});

test('rating history import merges matching skills and ignores duplicate rating IDs', () => {
  const existing: RoutineSkill[] = [{
    id: 'local-focus',
    name: 'Focus',
    ratings: [{ ...history.ratings![0] }],
  }];
  const incoming: RoutineSkill[] = [{
    id: 'imported-focus',
    name: ' focus ',
    ratings: [
      { ...history.ratings![0], rating: 1 },
      history.ratings![1],
    ],
  }];

  const first = mergeSkillCatalog(existing, incoming);
  assert.equal(first.idMap['imported-focus'], 'local-focus');
  assert.deepEqual(first.skills[0].ratings?.map(rating => rating.id), ['rating-2', 'rating-4']);
  assert.equal(first.skills[0].ratings?.[0].rating, 8, 'a conflicting imported copy must not replace local rating history');
  assert.equal(first.skills[0].ratings?.[0].note, 'Keep breathing steadily.');
  const second = mergeSkillCatalog(first.skills, incoming);
  assert.equal(second.skills[0].ratings?.length, 2);
});

test('skill parser validates saved rating entries and the shared window', () => {
  const parsed = parseSkills(JSON.stringify([history]));
  assert.deepEqual(parsed, [history]);
  assert.equal(parseSkillRatingWindow(null), DEFAULT_SKILL_RATING_WINDOW);
  assert.equal(parseSkillRatingWindow('12'), 12);
  assert.throws(() => parseSkillRatingWindow('0'), /could not be read/);
  assert.throws(() => parseSkills(JSON.stringify([{
    ...history,
    ratings: [{ ...history.ratings![0], rating: 11 }],
  }])), /could not be read/);
  assert.throws(() => parseSkills(JSON.stringify([{
    ...history,
    ratings: [{ ...history.ratings![0], note: 'x'.repeat(MAX_SKILL_NOTE_LENGTH + 1) }],
  }])), /could not be read/);
});

test('run time and skill sequence metadata survive skill backup parsing', () => {
  const skill = {
    id: 'skill-balance',
    name: 'Balance',
    ratings: [{
      id: 'rating-run-1',
      rating: 8,
      ratedAt: '2030-06-12T12:05:00.000Z',
      routineTitle: 'Morning',
      runId: 'run-1',
      completedAt: '2030-06-12T12:00:00.000Z',
      sequence: 2,
      note: 'Slow down on the turns.',
    }],
  };
  assert.deepEqual(parseSkills(JSON.stringify([skill])), [skill]);
  assert.throws(() => parseSkills(JSON.stringify([{
    ...skill,
    ratings: [{ ...skill.ratings[0], completedAt: undefined }],
  }])), /could not be read/);
});

test('a completed routine rates unique skills from visible steps only', () => {
  const skillIds = getRoutineSkillIds({
    id: 'routine',
    title: 'Morning',
    subtitle: '',
    icon: 'sun',
    tone: 'sage',
    createdAt: '2030-01-01T00:00:00.000Z',
    skillIds: ['routine-skill'],
    steps: [
      { id: 'visible', title: 'Stretch', durationSeconds: 30, skillIds: ['step-skill', 'routine-skill'] },
      { id: 'hidden', title: 'Optional', durationSeconds: 30, hidden: true, skillIds: ['hidden-skill'] },
    ],
  });
  assert.deepEqual(skillIds, ['routine-skill', 'step-skill']);
});

test('skill usage includes direct and step assignments, plus playlists containing linked routines', () => {
  const routines = [
    {
      id: 'direct', title: 'Direct routine', subtitle: '', icon: 'sun', tone: 'sage' as const,
      createdAt: '2030-01-01T00:00:00.000Z', skillIds: ['skill-focus'],
      steps: [
        { id: 'visible', title: 'Stretch', durationSeconds: 30, skillIds: ['skill-focus'] },
        { id: 'hidden', title: 'Optional mobility', durationSeconds: 30, hidden: true, skillIds: ['skill-focus'] },
      ],
    },
    {
      id: 'step-only', title: 'Step-only routine', subtitle: '', icon: 'sun', tone: 'sage' as const,
      createdAt: '2030-01-01T00:00:00.000Z', hidden: true,
      steps: [{ id: 'step', title: 'Breathe', durationSeconds: 30, skillIds: ['skill-focus'] }],
    },
    {
      id: 'unrelated', title: 'Unrelated routine', subtitle: '', icon: 'sun', tone: 'sage' as const,
      createdAt: '2030-01-01T00:00:00.000Z',
      steps: [{ id: 'step', title: 'Rest', durationSeconds: 30 }],
    },
  ];
  const playlists = [
    { id: 'direct-playlist', title: 'Focus playlist', routineIds: ['direct'], skillIds: ['skill-focus'] },
    { id: 'contains-routine', title: 'Breathing playlist', routineIds: ['step-only', 'step-only'] },
    { id: 'unrelated-playlist', title: 'Other playlist', routineIds: ['unrelated'] },
  ];

  const uses = getSkillAssociations('skill-focus', routines, playlists);

  assert.deepEqual(uses.routines.map(use => [use.id, use.hidden, use.assignedToRoutine, use.steps]), [
    ['direct', false, true, [
      { title: 'Stretch', hidden: false },
      { title: 'Optional mobility', hidden: true },
    ]],
    ['step-only', true, false, [{ title: 'Breathe', hidden: false }]],
  ]);
  assert.deepEqual(uses.playlists.map(use => [
    use.id, use.assignedToPlaylist, use.routines.map(routine => routine.title),
  ]), [
    ['direct-playlist', true, ['Direct routine']],
    ['contains-routine', false, ['Step-only routine']],
  ]);
});
