import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import type { Page } from '@playwright/test';

const baseURL = process.env.RESTORE_TEST_BASE_URL
  ?? (process.env.REPLIT_EXPO_DEV_DOMAIN ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}` : undefined);

test.use({
  baseURL,
  timezoneId: 'UTC',
  viewport: { width: 400, height: 820 },
  launchOptions: {
    ...(process.env.CHROMIUM_PATH || existsSync('/repl/tools/bin/chromium')
      ? { executablePath: process.env.CHROMIUM_PATH ?? '/repl/tools/bin/chromium' }
      : {}),
  },
});

test('history can add a missing routine skill rating and reflection without duplicating saved ratings', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  const day = '2020-01-02';
  const routines = [{
    id: 'morning',
    title: 'Morning routine',
    subtitle: '',
    icon: 'sunny-outline',
    tone: 'coral',
    createdAt: '2020-01-01T00:00:00.000Z',
    skillIds: ['focus', 'breathing'],
    steps: [{ id: 'water', title: 'Drink water', durationSeconds: 60 }],
  }];
  const progress = {
    [day]: {
      'morning:water': { routineTitle: 'Morning routine', stepTitle: 'Drink water' },
    },
  };
  const skills = [
    {
      id: 'focus',
      name: 'Focus',
      ratings: [{
        id: 'existing-focus-rating',
        rating: 6,
        ratedAt: '2020-01-02T10:00:00.000Z',
        routineTitle: 'Morning routine',
      }],
    },
    { id: 'breathing', name: 'Breathing' },
  ];

  await page.addInitScript(({ routines, progress, skills }) => {
    if (localStorage.getItem('@routine-flow/routines') === null) {
      localStorage.setItem('@routine-flow/routines', JSON.stringify(routines));
      localStorage.setItem('@routine-flow/progress', JSON.stringify(progress));
      localStorage.setItem('@routine-flow/skills', JSON.stringify(skills));
      localStorage.setItem('@routine-flow/playlists', JSON.stringify([]));
    }
  }, { routines, progress, skills });

  await page.goto('/history');
  await page.getByTestId('history-filter-routine').click();
  await page.getByTestId('history-routine-morning').click();
  await expect(page.getByTestId('history-add-skill-ratings-morning')).toBeVisible();
  await expect(page.getByTestId('history-add-skill-notes-morning')).toBeVisible();
  await page.getByTestId('history-add-skill-notes-morning').click();
  await expect(page.getByText('Add notes to past ratings')).toBeVisible();
  await expect(page.getByText('Saved score · 6/10')).toBeVisible();
  await expect(page.getByTestId('rate-skill-focus-8')).toHaveCount(0);
  await page.getByTestId('skill-note-focus-existing-focus-rating').fill('I noticed a steady start helps.');
  await page.getByTestId('save-skill-notes').click();
  await expect(page.getByText('I noticed a steady start helps.')).toBeVisible();
  await expect(page.getByTestId('history-add-skill-notes-morning')).toHaveCount(0);

  await page.getByTestId('history-add-skill-ratings-morning').click();
  await expect(page.getByText('Routine: Morning routine')).toBeVisible();
  await expect(page.getByTestId('rate-skill-focus-8')).toHaveCount(0);
  await page.getByTestId('rate-skill-breathing-8').click();
  await page.getByTestId('skill-note-breathing').fill('Keep a steady pace.');
  await page.getByTestId('save-skill-ratings').click();

  await expect(page.getByText('Breathing', { exact: true })).toBeVisible();
  await expect(page.getByText('Keep a steady pace.')).toBeVisible();
  await expect(page.getByTestId('history-add-skill-ratings-morning')).toHaveCount(0);
  await expect(page.getByTestId('history-add-skill-notes-morning')).toHaveCount(0);
  await page.reload();
  await page.getByTestId('history-filter-routine').click();
  await page.getByTestId('history-routine-morning').click();
  await expect(page.getByText('Keep a steady pace.')).toBeVisible();
  await expect(page.getByTestId('history-add-skill-ratings-morning')).toHaveCount(0);
  await expect(page.getByTestId('history-add-skill-notes-morning')).toHaveCount(0);

  const storedSkills = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('@routine-flow/skills') ?? '[]') as {
      id: string;
      ratings?: { rating: number; note?: string; runId?: string; completedDay?: string }[];
    }[],
  );
  const focus = storedSkills.find(skill => skill.id === 'focus');
  const breathing = storedSkills.find(skill => skill.id === 'breathing');
  expect(focus?.ratings).toHaveLength(1);
  expect(focus?.ratings?.[0]).toMatchObject({
    rating: 6,
    note: 'I noticed a steady start helps.',
  });
  expect(breathing?.ratings).toHaveLength(1);
  expect(breathing?.ratings?.[0]).toMatchObject({
    rating: 8,
    note: 'Keep a steady pace.',
    completedDay: day,
  });
  expect(breathing?.ratings?.[0].runId).toMatch(/^history-routine-/);
});

test('playlist history offers one end-of-run rating action for playlist and routine skills', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  const day = '2020-02-03';
  const routines = [
    {
      id: 'first',
      title: 'First routine',
      subtitle: '',
      icon: 'sunny-outline',
      tone: 'coral',
      createdAt: '2020-01-01T00:00:00.000Z',
      skillIds: ['first-skill'],
      steps: [{ id: 'start', title: 'Get ready', durationSeconds: 60 }],
    },
    {
      id: 'last',
      title: 'Last routine',
      subtitle: '',
      icon: 'sunny-outline',
      tone: 'sage',
      createdAt: '2020-01-01T00:00:00.000Z',
      steps: [{ id: 'finish', title: 'Wrap up', durationSeconds: 60, skillIds: ['last-skill'] }],
    },
  ];
  const progress = {
    [day]: {
      'first:start': {
        routineTitle: 'First routine',
        stepTitle: 'Get ready',
        playlistRuns: [{ playlistId: 'daily', playlistTitle: 'Daily flow' }],
      },
      'last:finish': {
        routineTitle: 'Last routine',
        stepTitle: 'Wrap up',
        playlistRuns: [{ playlistId: 'daily', playlistTitle: 'Daily flow' }],
      },
    },
  };
  const playlists = [{
    id: 'daily',
    title: 'Daily flow',
    routineIds: ['first', 'last'],
    skillIds: ['playlist-skill'],
    rateSkillsAtPlaylistEnd: true,
  }];
  const skills = [
    {
      id: 'first-skill',
      name: 'Preparation',
      ratings: [{
        id: 'first-existing-rating',
        rating: 7,
        ratedAt: `${day}T10:00:00.000Z`,
        routineTitle: 'First routine',
      }],
    },
    { id: 'last-skill', name: 'Reflection' },
    { id: 'playlist-skill', name: 'Consistency' },
  ];

  await page.addInitScript(({ routines, progress, playlists, skills }) => {
    if (localStorage.getItem('@routine-flow/routines') === null) {
      localStorage.setItem('@routine-flow/routines', JSON.stringify(routines));
      localStorage.setItem('@routine-flow/progress', JSON.stringify(progress));
      localStorage.setItem('@routine-flow/playlists', JSON.stringify(playlists));
      localStorage.setItem('@routine-flow/skills', JSON.stringify(skills));
    }
  }, { routines, progress, playlists, skills });

  await page.goto('/history');
  await page.getByTestId('history-filter-playlist').click();
  await page.getByTestId('history-playlist-daily').click();
  await expect(page.getByTestId('history-add-skill-ratings-last')).toBeVisible();
  await expect(page.getByTestId('history-add-skill-notes-last')).toBeVisible();
  await expect(page.getByTestId('history-add-skill-ratings-first')).toHaveCount(0);
  await page.getByTestId('history-add-skill-notes-last').click();
  await expect(page.getByText('Saved score · 7/10')).toBeVisible();
  await page.getByTestId('skill-note-first-skill-first-existing-rating').fill('Preparation feels more natural now.');
  await page.getByTestId('save-skill-notes').click();
  await expect(page.getByText('Preparation feels more natural now.')).toBeVisible();
  await expect(page.getByTestId('history-add-skill-notes-last')).toHaveCount(0);
  await page.getByTestId('history-add-skill-ratings-last').click();
  await expect(page.getByText('Playlist: Daily flow', { exact: true })).toBeVisible();

  for (const [skillId, score] of [
    ['last-skill', 8],
    ['playlist-skill', 9],
  ] as const) {
    await page.getByTestId(`rate-skill-${skillId}-${score}`).click();
    await page.getByTestId(`skill-note-${skillId}`).fill(`Reflection for ${skillId}.`);
  }
  await page.getByTestId('save-skill-ratings').click();
  await expect(page.getByText('Reflection for playlist-skill.')).toBeVisible();
  await expect(page.getByTestId('history-add-skill-ratings-last')).toHaveCount(0);
  await page.reload();
  await page.getByTestId('history-filter-playlist').click();
  await page.getByTestId('history-playlist-daily').click();
  await expect(page.getByText('Preparation feels more natural now.')).toBeVisible();
  await expect(page.getByText('Reflection for playlist-skill.')).toBeVisible();
  await expect(page.getByTestId('history-add-skill-ratings-last')).toHaveCount(0);
  await expect(page.getByTestId('history-add-skill-notes-last')).toHaveCount(0);

  const storedSkills = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('@routine-flow/skills') ?? '[]') as {
      id: string;
      ratings?: { rating: number; runId?: string; completedDay?: string; note?: string }[];
    }[],
  );
  const firstSkill = storedSkills.find(skill => skill.id === 'first-skill');
  expect(firstSkill?.ratings).toHaveLength(1);
  expect(firstSkill?.ratings?.[0]).toMatchObject({
    rating: 7,
    note: 'Preparation feels more natural now.',
  });
  const ratings = storedSkills
    .filter(skill => skill.id !== 'first-skill')
    .flatMap(skill => skill.ratings ?? []);
  expect(ratings).toHaveLength(2);
  expect(new Set(ratings.map(rating => rating.runId)).size).toBe(1);
  expect(ratings.every(rating => rating.completedDay === day)).toBe(true);
  expect(ratings.map(rating => rating.note)).toEqual([
    'Reflection for last-skill.',
    'Reflection for playlist-skill.',
  ]);
});

const reflectionFixtures = {
  day: '2020-03-04',
  routines: [{
    id: 'morning',
    title: 'Morning routine',
    subtitle: '',
    icon: 'sunny-outline',
    tone: 'coral',
    createdAt: '2020-01-01T00:00:00.000Z',
    steps: [{ id: 'water', title: 'Drink water', durationSeconds: 60 }],
  }],
  playlists: [{
    id: 'daily',
    title: 'Daily flow',
    routineIds: ['morning'],
    rateSkillsAtPlaylistEnd: true,
  }],
  get progress() {
    return {
      [this.day]: {
        'morning:water': {
          routineTitle: 'Morning routine',
          stepTitle: 'Drink water',
          playlistRuns: [{ playlistId: 'daily', playlistTitle: 'Daily flow' }],
        },
      },
    };
  },
  skills: [
    {
      id: 'focus',
      name: 'Focus',
      ratings: [{
        id: 'routine-reflection',
        rating: 8,
        ratedAt: '2020-03-04T09:15:00.000Z',
        routineTitle: 'Morning routine',
        runId: 'routine-run',
        completedAt: '2020-03-04T09:00:00.000Z',
        sequence: 0,
        note: 'Original routine reflection',
      }],
    },
    {
      id: 'planning',
      name: 'Planning',
      ratings: [{
        id: 'playlist-reflection',
        rating: 6,
        ratedAt: '2020-03-04T10:15:00.000Z',
        routineTitle: 'Morning routine',
        runId: 'playlist-run',
        completedAt: '2020-03-04T10:00:00.000Z',
        sequence: 1,
        note: 'Original playlist reflection',
      }],
    },
  ],
};

async function seedSavedReflections(page: Page) {
  await page.addInitScript(({ routines, progress, playlists, skills }) => {
    if (localStorage.getItem('@routine-flow/routines') === null) {
      localStorage.setItem('@routine-flow/routines', JSON.stringify(routines));
      localStorage.setItem('@routine-flow/progress', JSON.stringify(progress));
      localStorage.setItem('@routine-flow/playlists', JSON.stringify(playlists));
      localStorage.setItem('@routine-flow/skills', JSON.stringify(skills));
    }
  }, reflectionFixtures);
}

test('routine history can cancel or save a reflection edit without changing its rating event', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  await seedSavedReflections(page);
  await page.goto('/history');
  await page.getByTestId('history-filter-routine').click();
  await page.getByTestId('history-routine-morning').click();

  await page.getByTestId('history-edit-reflection-routine-reflection').click();
  await expect(page.getByTestId('save-reflection-edit')).toBeVisible();
  const input = page.getByTestId('edit-skill-note-focus-routine-reflection');
  await expect(input).toHaveValue('Original routine reflection');
  await input.fill('An unsaved correction');
  await page.getByTestId('cancel-edit-reflection').click();
  await expect(page.getByText('Original routine reflection')).toBeVisible();

  const beforeSave = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('@routine-flow/skills') ?? '[]') as {
      id: string;
      ratings?: Record<string, unknown>[];
    }[]).find(skill => skill.id === 'focus')?.ratings?.[0],
  );
  await page.getByTestId('history-edit-reflection-routine-reflection').click();
  await page.getByTestId('edit-skill-note-focus-routine-reflection').fill('Corrected routine reflection');
  await page.getByTestId('save-reflection-edit').click();
  await expect(page.getByText('Corrected routine reflection')).toBeVisible();

  const afterSave = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('@routine-flow/skills') ?? '[]') as {
      id: string;
      ratings?: Record<string, unknown>[];
    }[]).find(skill => skill.id === 'focus')?.ratings?.[0],
  );
  expect(beforeSave).toEqual({
    id: 'routine-reflection',
    rating: 8,
    ratedAt: '2020-03-04T09:15:00.000Z',
    routineTitle: 'Morning routine',
    runId: 'routine-run',
    completedAt: '2020-03-04T09:00:00.000Z',
    sequence: 0,
    note: 'Original routine reflection',
  });
  expect(afterSave).toEqual({ ...beforeSave, note: 'Corrected routine reflection' });
});

test('playlist history can edit a saved reflection for that playlist run', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  await seedSavedReflections(page);
  await page.goto('/history');
  await page.getByTestId('history-filter-playlist').click();
  await page.getByTestId('history-playlist-daily').click();

  await page.getByTestId('history-edit-reflection-playlist-reflection').click();
  await expect(page.getByText('Planning · Playlist: Daily flow')).toBeVisible();
  await page.getByTestId('edit-skill-note-planning-playlist-reflection').fill('Updated playlist reflection');
  await page.getByTestId('save-reflection-edit').click();
  await expect(page.getByText('Updated playlist reflection')).toBeVisible();

  const savedRating = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('@routine-flow/skills') ?? '[]') as {
      id: string;
      ratings?: { id: string; rating: number; ratedAt: string; runId?: string; completedAt?: string; note?: string }[];
    }[]).find(skill => skill.id === 'planning')?.ratings?.[0],
  );
  expect(savedRating).toEqual({
    id: 'playlist-reflection',
    rating: 6,
    ratedAt: '2020-03-04T10:15:00.000Z',
    routineTitle: 'Morning routine',
    runId: 'playlist-run',
    completedAt: '2020-03-04T10:00:00.000Z',
    sequence: 1,
    note: 'Updated playlist reflection',
  });
});

test('skill history can edit a reflection and the corrected note appears in routine history', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  await seedSavedReflections(page);
  await page.goto('/skills');
  await page.getByTestId('skill-rating-history-toggle-focus').click();

  await page.getByTestId('skill-edit-reflection-focus-routine-reflection').click();
  await expect(page.getByText('Focus · Morning routine')).toBeVisible();
  await page.getByTestId('edit-skill-note-focus-routine-reflection').fill('Updated from skill history');
  await page.getByTestId('save-reflection-edit').click();
  await expect(page.getByText('Updated from skill history')).toBeVisible();

  await page.goto('/history');
  await page.getByTestId('history-edit-reflection-routine-reflection').waitFor({ state: 'visible' });
  await expect(page.getByText('Updated from skill history')).toBeVisible();
});
