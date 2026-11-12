import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import type { Routine } from '../types/routines';

const baseURL = process.env.RESTORE_TEST_BASE_URL
  ?? (process.env.REPLIT_EXPO_DEV_DOMAIN ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}` : undefined);

test.use({
  baseURL,
  timezoneId: 'UTC',
  viewport: { width: 400, height: 720 },
  launchOptions: {
    ...(process.env.CHROMIUM_PATH || existsSync('/repl/tools/bin/chromium')
      ? { executablePath: process.env.CHROMIUM_PATH ?? '/repl/tools/bin/chromium' }
      : {}),
  },
});

const sourceRoutines: Routine[] = [
  {
    id: 'garden-flow',
    title: 'Garden flow',
    subtitle: 'A calm garden start',
    category: 'Home Care',
    icon: 'sunny-outline',
    tone: 'sage',
    createdAt: '2026-10-01T08:00:00.000Z',
    skillIds: ['watering'],
    steps: [
      {
        id: 'water-herbs',
        title: 'Water the herbs',
        description: 'Morning watering plan',
        additionalDetails: ['Use the blue jug'],
        skillIds: ['watering'],
        durationSeconds: 60,
      },
      {
        id: 'wipe-leaves',
        title: 'Wipe the leaves',
        description: 'Morning care check',
        skillIds: ['care'],
        durationSeconds: 90,
      },
      {
        id: 'rest-hands',
        title: 'Rest your hands',
        description: 'Take an evening break',
        durationSeconds: 120,
      },
    ],
  },
  {
    id: 'watering-outside-category',
    title: 'Office plants',
    subtitle: 'A workday check',
    category: 'Work',
    icon: 'layers-outline',
    tone: 'coral',
    createdAt: '2026-10-02T08:00:00.000Z',
    steps: [{ id: 'water-office', title: 'Water office plants', skillIds: ['watering'], durationSeconds: 60 }],
  },
  {
    id: 'unrelated-home',
    title: 'Tidy the entry',
    subtitle: 'A quick home reset',
    category: 'Home Care',
    icon: 'home-outline',
    tone: 'lavender',
    createdAt: '2026-10-03T08:00:00.000Z',
    steps: [{ id: 'shoes', title: 'Line up shoes', skillIds: ['care'], durationSeconds: 60 }],
  },
  {
    id: 'step-linked-garden',
    title: 'Herb task',
    subtitle: 'A small garden check',
    category: 'Home Care',
    icon: 'leaf-outline',
    tone: 'sage',
    createdAt: '2026-10-04T08:00:00.000Z',
    steps: [
      { id: 'prune-herbs', title: 'Prune the herbs', description: 'Morning check', skillIds: ['watering'], durationSeconds: 60 },
      { id: 'wipe-pot', title: 'Wipe the pot', description: 'Morning cleanup', skillIds: ['care'], durationSeconds: 60 },
    ],
  },
];

const skills = [
  { id: 'watering', name: 'Watering' },
  { id: 'care', name: 'Care' },
];

test('copy routine empty states distinguish search from filters and let filters be cleared', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');

  await page.addInitScript(({ routines, skills }) => {
    localStorage.setItem('@routine-flow/routines', JSON.stringify(routines));
    localStorage.setItem('@routine-flow/progress', '{}');
    localStorage.setItem('@routine-flow/skills', JSON.stringify(skills));
    localStorage.setItem('@routine-flow/playlists', '[]');
  }, { routines: sourceRoutines, skills });

  await page.goto('/new-routine');
  await page.getByLabel('Routine name').fill('My garden routine');
  await page.getByTestId('toggle-copy-routine-steps').click();

  await page.getByTestId('copy-routine-steps-search').fill('nothing matches');
  await expect(page.getByText('No routines match that search.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('clear-copy-routine-filters')).toHaveCount(0);

  await page.getByTestId('copy-routine-steps-search').fill('');
  await page.getByTestId('copy-category-filter-work').click();
  await page.getByTestId('copy-skill-filter-care').click();
  await expect(page.getByText('No routines match category “Work” and skill “Care”.', { exact: true })).toBeVisible();
  await page.getByTestId('clear-copy-routine-filters').click();
  await expect(page.getByTestId('choose-steps-from-watering-outside-category')).toBeVisible();
  await expect(page.getByTestId('choose-steps-from-garden-flow')).toBeVisible();
});

test('copy step filters, search, selection, details, and speech preview stay scoped', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');

  await page.addInitScript(({ routines, skills }) => {
    localStorage.setItem('@routine-flow/routines', JSON.stringify(routines));
    localStorage.setItem('@routine-flow/progress', '{}');
    localStorage.setItem('@routine-flow/skills', JSON.stringify(skills));
    localStorage.setItem('@routine-flow/playlists', '[]');

    const testWindow = window as unknown as { __routineSpeechTexts: string[] };
    testWindow.__routineSpeechTexts = [];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [],
        speak: (utterance: SpeechSynthesisUtterance) => testWindow.__routineSpeechTexts.push(utterance.text),
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        get speaking() { return false; },
        get pending() { return false; },
        get paused() { return false; },
        onvoiceschanged: null,
      },
    });
  }, { routines: sourceRoutines, skills });

  await page.goto('/new-routine');
  await page.getByLabel('Routine name').fill('My garden routine');
  await page.getByTestId('toggle-copy-routine-steps').click();

  await page.getByTestId('copy-category-filter-home care').click();
  await page.getByTestId('copy-skill-filter-watering').click();
  await expect(page.getByTestId('choose-steps-from-garden-flow')).toBeVisible();
  await expect(page.getByTestId('choose-steps-from-step-linked-garden')).toBeVisible();
  await expect(page.getByTestId('choose-steps-from-unrelated-home')).toHaveCount(0);
  await expect(page.getByTestId('choose-steps-from-watering-outside-category')).toHaveCount(0);

  const sourceBefore = await page.evaluate(() => localStorage.getItem('@routine-flow/routines'));
  await page.getByTestId('copy-routine-steps-search').fill('morning');
  await page.getByTestId('choose-steps-from-step-linked-garden').click();
  await expect(page.getByTestId('select-copy-step-step-linked-garden-prune-herbs')).toBeVisible();
  await expect(page.getByTestId('select-copy-step-step-linked-garden-wipe-pot')).toHaveCount(0);
  await page.getByTestId('choose-steps-from-step-linked-garden').click();
  await page.getByTestId('choose-steps-from-garden-flow').click();
  await expect(page.getByTestId('select-copy-step-garden-flow-water-herbs')).toBeVisible();
  await expect(page.getByTestId('select-copy-step-garden-flow-wipe-leaves')).toBeVisible();
  await expect(page.getByTestId('select-copy-step-garden-flow-rest-hands')).toHaveCount(0);

  await page.getByTestId('toggle-copy-step-details-garden-flow-water-herbs').click();
  await expect(page.getByText(/Use the blue jug/)).toBeVisible();
  await page.getByTestId('speak-copy-step-garden-flow-water-herbs').click();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __routineSpeechTexts: string[] }).__routineSpeechTexts,
  )).toEqual(expect.arrayContaining([expect.stringContaining('Water the herbs')]));
  expect(await page.evaluate(() => localStorage.getItem('@routine-flow/routines'))).toBe(sourceBefore);

  await page.getByTestId('select-copy-step-garden-flow-water-herbs').click();
  await expect(page.getByTestId('copy-selected-steps-garden-flow')).toContainText('Add selected (1)');
  await page.getByTestId('copy-selected-steps-garden-flow').click();
  await expect(page.getByText('1 added', { exact: true })).toBeVisible();
  await expect(page.getByText('Water the herbs', { exact: true })).toBeVisible();
  await expect(page.getByText('Wipe the leaves', { exact: true })).toHaveCount(0);

  await page.getByTestId('choose-steps-from-garden-flow').click();
  await page.getByTestId('select-all-copy-steps-garden-flow').click();
  await expect(page.getByTestId('copy-selected-steps-garden-flow')).toContainText('Add selected (2)');
  await page.getByTestId('copy-selected-steps-garden-flow').click();
  await expect(page.getByText('3 added', { exact: true })).toBeVisible();
  await expect(page.getByText('Wipe the leaves', { exact: true })).toBeVisible();
  await expect(page.getByText('Rest your hands', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('@routine-flow/routines'))).toBe(sourceBefore);
});

test('select all shown copies only keyword-matched steps from the filtered source', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');

  await page.addInitScript(({ routines, skills }) => {
    localStorage.setItem('@routine-flow/routines', JSON.stringify(routines));
    localStorage.setItem('@routine-flow/progress', '{}');
    localStorage.setItem('@routine-flow/skills', JSON.stringify(skills));
    localStorage.setItem('@routine-flow/playlists', '[]');
  }, { routines: sourceRoutines, skills });

  await page.goto('/new-routine');
  await page.getByLabel('Routine name').fill('Morning garden routine');
  await page.getByTestId('toggle-copy-routine-steps').click();
  await page.getByTestId('copy-category-filter-home care').click();
  await page.getByTestId('copy-skill-filter-watering').click();
  await page.getByTestId('copy-routine-steps-search').fill('morning');
  await page.getByTestId('choose-steps-from-garden-flow').click();
  await page.getByTestId('select-all-copy-steps-garden-flow').click();
  await expect(page.getByTestId('copy-selected-steps-garden-flow')).toContainText('Add selected (2)');
  await page.getByTestId('copy-selected-steps-garden-flow').click();

  await expect(page.getByText('2 added', { exact: true })).toBeVisible();
  await expect(page.getByText('Water the herbs', { exact: true })).toBeVisible();
  await expect(page.getByText('Wipe the leaves', { exact: true })).toBeVisible();
  await expect(page.getByText('Rest your hands', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('@routine-flow/routines') ?? '[]')))
    .toEqual(sourceRoutines);
});

test('editing a routine can copy and inspect steps from another routine', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');

  await page.addInitScript(({ routines, skills }) => {
    localStorage.setItem('@routine-flow/routines', JSON.stringify(routines));
    localStorage.setItem('@routine-flow/progress', '{}');
    localStorage.setItem('@routine-flow/skills', JSON.stringify(skills));
    localStorage.setItem('@routine-flow/playlists', '[]');

    const testWindow = window as unknown as { __routineSpeechTexts: string[] };
    testWindow.__routineSpeechTexts = [];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [],
        speak: (utterance: SpeechSynthesisUtterance) => testWindow.__routineSpeechTexts.push(utterance.text),
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        get speaking() { return false; },
        get pending() { return false; },
        get paused() { return false; },
        onvoiceschanged: null,
      },
    });
  }, { routines: sourceRoutines, skills });

  await page.goto('/new-routine?editId=garden-flow');
  await expect(page.getByText('Edit routine', { exact: true })).toBeVisible();
  await page.getByTestId('toggle-copy-routine-steps').click();
  await expect(page.getByTestId('choose-steps-from-garden-flow')).toHaveCount(0);
  await page.getByTestId('choose-steps-from-watering-outside-category').click();
  await expect(page.getByTestId('toggle-copy-step-details-watering-outside-category-water-office')).toBeVisible();
  await page.getByTestId('toggle-copy-step-details-watering-outside-category-water-office').click();
  await expect(page.getByText('No additional details saved for this step.', { exact: true })).toBeVisible();
  await page.getByTestId('choose-steps-from-step-linked-garden').click();
  await page.getByTestId('select-copy-step-step-linked-garden-prune-herbs').click();
  await expect(page.getByText('Morning check', { exact: true })).toBeVisible();
  await page.getByTestId('speak-copy-step-step-linked-garden-prune-herbs').click();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __routineSpeechTexts: string[] }).__routineSpeechTexts,
  )).toEqual(expect.arrayContaining([expect.stringContaining('Prune the herbs')]));
  await page.getByTestId('copy-selected-steps-step-linked-garden').click();
  await expect(page.getByText('4 added', { exact: true })).toBeVisible();

  await page.getByLabel('Save routine').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('@routine-flow/routines') ?? '[]')
    .find((routine: Routine) => routine.id === 'garden-flow')?.steps?.length)).toBe(4);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('@routine-flow/routines') ?? '[]') as Routine[]);
  const destination = saved.find(routine => routine.id === 'garden-flow')!;
  expect(destination.steps.slice(0, 3)).toEqual(sourceRoutines[0].steps);
  expect(destination.steps[3].title).toBe('Prune the herbs');
  expect(destination.steps[3].id).not.toBe('prune-herbs');
  expect(saved.filter(routine => routine.id !== 'garden-flow')).toEqual(sourceRoutines.filter(routine => routine.id !== 'garden-flow'));
});

test('playlist summary shows and speaks selected steps out of each routine total', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');

  await page.addInitScript(({ routines, skills }) => {
    localStorage.setItem('@routine-flow/routines', JSON.stringify(routines));
    localStorage.setItem('@routine-flow/progress', '{}');
    localStorage.setItem('@routine-flow/skills', JSON.stringify(skills));
    localStorage.setItem('@routine-flow/playlists', JSON.stringify([{
      id: 'partial-morning',
      title: 'Partial morning',
      routineIds: ['garden-flow'],
      stepSelections: [{
        routineId: 'garden-flow',
        steps: [{ stepId: 'water-herbs', durationSeconds: 60 }],
      }],
    }]));

    const testWindow = window as unknown as { __routineSpeechTexts: string[] };
    testWindow.__routineSpeechTexts = [];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [],
        speak: (utterance: SpeechSynthesisUtterance) => testWindow.__routineSpeechTexts.push(utterance.text),
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        get speaking() { return false; },
        get pending() { return false; },
        get paused() { return false; },
        onvoiceschanged: null,
      },
    });
  }, { routines: sourceRoutines, skills });

  await page.goto('/playlists');
  await expect(page.getByText('1. Garden flow · 1 of 3 steps selected', { exact: true })).toBeVisible();
  await page.getByTestId('speak-playlist-partial-morning').click();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __routineSpeechTexts: string[] }).__routineSpeechTexts,
  )).toEqual(expect.arrayContaining([expect.stringContaining('Garden flow, 1 of 3 steps selected')]));

  await page.getByTestId('edit-playlist-partial-morning').click();
  await page.getByTestId('toggle-playlist-steps-0').click();
  await expect(page.getByTestId('playlist-duration-0-water-herbs-hours')).toHaveValue('0');
  await expect(page.getByTestId('playlist-duration-0-water-herbs-minutes')).toHaveValue('1');
  await expect(page.getByTestId('playlist-duration-0-water-herbs-seconds')).toHaveValue('0');
  await page.getByTestId('playlist-duration-0-water-herbs-minutes').fill('2');
  await page.getByTestId('playlist-duration-0-water-herbs-seconds').fill('30');
  await page.getByTestId('save-playlist').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('@routine-flow/playlists') ?? '[]')
    .find((playlist: { id: string }) => playlist.id === 'partial-morning')
    ?.stepSelections?.[0]?.steps?.[0]?.durationSeconds)).toBe(150);
  const savedRoutines = await page.evaluate(() => JSON.parse(localStorage.getItem('@routine-flow/routines') ?? '[]') as Routine[]);
  expect(savedRoutines.find(routine => routine.id === 'garden-flow')?.steps.find(step => step.id === 'water-herbs')?.durationSeconds).toBe(60);
});
