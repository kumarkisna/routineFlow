import assert from 'node:assert/strict';
import test from 'node:test';
import { createPersonStorage, PERSON_DATA_KEYS } from './personStorage';
import {
  getSkillAverage,
  getSkillRatingPoints,
  parseSkillRatingWindow,
  parseSkills,
  removeSkillFromCatalog,
  type RoutineSkill,
  type SkillRating,
} from './skills';

function rating(id: string, value: number, day: string, note: string): SkillRating {
  return {
    id,
    rating: value,
    ratedAt: `2030-04-${day}T10:00:00.000Z`,
    routineTitle: 'Practice routine',
    note,
  };
}

test('rating history, reflections, chart averages, and N follow the active person and return on switch-back', async () => {
  const values = new Map<string, string>();
  const backend = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
  };
  const profiles: Record<string, { skill: RoutineSkill; window: number }> = {
    me: {
      skill: {
        id: 'skill-focus',
        name: 'Focus',
        ratings: [
          rating('me-rating-1', 2, '01', 'Me: pause before starting.'),
          rating('me-rating-2', 4, '02', 'Me: keep a steady pace.'),
        ],
      },
      window: 2,
    },
    'person-alex': {
      skill: {
        id: 'skill-focus',
        name: 'Focus',
        ratings: [
          rating('alex-rating-1', 8, '01', 'Alex: stay with the task.'),
          rating('alex-rating-2', 10, '02', 'Alex: repeat this approach.'),
        ],
      },
      window: 1,
    },
  };

  for (const [personId, profile] of Object.entries(profiles)) {
    const storage = createPersonStorage(personId, backend);
    await Promise.all([
      storage.setItem(PERSON_DATA_KEYS.skills, JSON.stringify([profile.skill])),
      storage.setItem(PERSON_DATA_KEYS.skillRatingWindow, String(profile.window)),
    ]);
  }

  for (const activePersonId of ['me', 'person-alex', 'me']) {
    const storage = createPersonStorage(activePersonId, backend);
    const [skillsJson, windowValue] = await Promise.all([
      storage.getItem(PERSON_DATA_KEYS.skills),
      storage.getItem(PERSON_DATA_KEYS.skillRatingWindow),
    ]);
    assert.ok(skillsJson);
    const [skill] = parseSkills(skillsJson);
    const windowSize = parseSkillRatingWindow(windowValue);
    const expected = activePersonId === 'me'
      ? {
          ratingIds: ['me-rating-1', 'me-rating-2'],
          historyNotes: ['Me: keep a steady pace.', 'Me: pause before starting.'],
          chartAverages: [2, 3],
          average: { average: 3, count: 2 },
        }
      : {
          ratingIds: ['alex-rating-1', 'alex-rating-2'],
          historyNotes: ['Alex: repeat this approach.', 'Alex: stay with the task.'],
          chartAverages: [8, 10],
          average: { average: 10, count: 1 },
        };
    const history = [...(skill.ratings ?? [])].sort((a, b) =>
      Date.parse(b.ratedAt) - Date.parse(a.ratedAt) || b.id.localeCompare(a.id));

    assert.equal(skill.name, 'Focus');
    assert.deepEqual(history.map(item => item.id), [...expected.ratingIds].reverse());
    assert.deepEqual(history.map(item => item.note), expected.historyNotes);
    assert.deepEqual(getSkillRatingPoints(skill, windowSize).map(point => point.average), expected.chartAverages);
    assert.deepEqual(getSkillAverage(skill, windowSize), expected.average);
  }
});

test('deleting a skill from one person leaves the other person’s history and average intact', async () => {
  const values = new Map<string, string>();
  const backend = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
  };
  const profiles: Record<string, { skill: RoutineSkill; window: number }> = {
    me: {
      skill: {
        id: 'skill-focus',
        name: 'Focus',
        ratings: [rating('me-rating', 3, '03', 'Me: slow down.')],
      },
      window: 2,
    },
    'person-alex': {
      skill: {
        id: 'skill-focus',
        name: 'Focus',
        ratings: [
          rating('alex-rating-1', 8, '01', 'Alex: stay present.'),
          rating('alex-rating-2', 10, '02', 'Alex: repeat this plan.'),
        ],
      },
      window: 1,
    },
  };

  for (const [personId, profile] of Object.entries(profiles)) {
    const storage = createPersonStorage(personId, backend);
    await Promise.all([
      storage.setItem(PERSON_DATA_KEYS.skills, JSON.stringify([profile.skill])),
      storage.setItem(PERSON_DATA_KEYS.skillRatingWindow, String(profile.window)),
    ]);
  }

  const meStorage = createPersonStorage('me', backend);
  const meSkillsJson = await meStorage.getItem(PERSON_DATA_KEYS.skills);
  assert.ok(meSkillsJson);
  const nextMeSkills = removeSkillFromCatalog(parseSkills(meSkillsJson), 'skill-focus');
  await meStorage.setItem(PERSON_DATA_KEYS.skills, JSON.stringify(nextMeSkills));

  const alexStorage = createPersonStorage('person-alex', backend);
  const [alexSkillsJson, alexWindowValue] = await Promise.all([
    alexStorage.getItem(PERSON_DATA_KEYS.skills),
    alexStorage.getItem(PERSON_DATA_KEYS.skillRatingWindow),
  ]);
  assert.ok(alexSkillsJson);
  const [alexSkill] = parseSkills(alexSkillsJson);
  assert.deepEqual(alexSkill, profiles['person-alex'].skill);
  assert.equal(parseSkillRatingWindow(alexWindowValue), profiles['person-alex'].window);
  assert.deepEqual(getSkillAverage(alexSkill, parseSkillRatingWindow(alexWindowValue)), {
    average: 10,
    count: 1,
  });
  assert.deepEqual(
    alexSkill.ratings?.map(item => item.note),
    ['Alex: stay present.', 'Alex: repeat this plan.'],
  );

  const switchedBackMeSkillsJson = await meStorage.getItem(PERSON_DATA_KEYS.skills);
  assert.ok(switchedBackMeSkillsJson);
  assert.deepEqual(parseSkills(switchedBackMeSkillsJson), []);
  assert.equal(
    parseSkillRatingWindow(await meStorage.getItem(PERSON_DATA_KEYS.skillRatingWindow)),
    profiles.me.window,
  );
});
