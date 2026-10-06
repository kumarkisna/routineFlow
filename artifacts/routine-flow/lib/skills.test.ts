import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SKILL_RATING_WINDOW,
  getRoutineSkillIds,
  getSkillAverage,
  getSkillRatingPoints,
  mergeSkillCatalog,
  parseSkillRatingWindow,
  parseSkills,
  type RoutineSkill,
} from './skills';

const history: RoutineSkill = {
  id: 'skill-focus',
  name: 'Focus',
  ratings: [
    { id: 'rating-2', rating: 8, ratedAt: '2030-01-02T00:00:00.000Z', routineTitle: 'Morning' },
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
    ratings: [history.ratings![0], history.ratings![1]],
  }];

  const first = mergeSkillCatalog(existing, incoming);
  assert.equal(first.idMap['imported-focus'], 'local-focus');
  assert.deepEqual(first.skills[0].ratings?.map(rating => rating.id), ['rating-2', 'rating-4']);
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
