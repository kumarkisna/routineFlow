import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import type { CompletionMap, Routine } from '../types/routines';

// Match restore.spec.ts: a fresh Playwright context, real AsyncStorage web
// persistence, UTC dates, and the mobile preview viewport.
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

const routines: Routine[] = [
  {
    id: 'visible-care',
    title: 'Visible care',
    subtitle: 'Keep every setting',
    category: 'Home Care',
    icon: 'sunny-outline',
    tone: 'coral',
    skillIds: ['care-skill'],
    createdAt: '2026-09-01T08:00:00.000Z',
    steps: [
      {
        id: 'water',
        title: 'Water the plants',
        description: 'Check the soil first',
        additionalDetails: ['Use the small jug', 'Empty the tray'],
        speakDetails: false,
        skillIds: ['care-skill'],
        durationSeconds: 90,
        duration: '2',
      },
      { id: 'shelf', title: 'Clean the shelf', hidden: true, durationSeconds: 45 },
    ],
  },
  {
    id: 'hidden-care',
    title: 'Hidden care',
    subtitle: 'Still included in bulk removal',
    category: ' home   care ',
    hidden: true,
    icon: 'moon-outline',
    tone: 'lavender',
    skillIds: ['care-skill'],
    createdAt: '2026-09-02T08:00:00.000Z',
    steps: [{ id: 'tidy', title: 'Tidy up', description: 'One drawer', durationSeconds: 60 }],
  },
  {
    id: 'unrelated-work',
    title: 'Unrelated work',
    subtitle: 'Keep its category too',
    category: 'Work',
    hidden: false,
    icon: 'layers-outline',
    tone: 'sage',
    createdAt: '2026-09-03T08:00:00.000Z',
    steps: [{ id: 'focus', title: 'Focus', speakDetails: true, durationSeconds: 300 }],
  },
];

async function storedData(page: Page) {
  return page.evaluate(() => ({
    routines: JSON.parse(localStorage.getItem('@routine-flow/routines') ?? 'null') as Routine[],
    progress: JSON.parse(localStorage.getItem('@routine-flow/progress') ?? 'null') as CompletionMap,
  }));
}

test('bulk category removal cancels safely, survives a failed save, and persists only labels after retry', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  test.setTimeout(90_000);

  const today = new Date().toISOString().slice(0, 10);
  const progress: CompletionMap = {
    [today]: {
      'visible-care:water': { routineTitle: 'Visible care', stepTitle: 'Water the plants' },
      'visible-care:shelf': true,
      'hidden-care:tidy': true,
      'unrelated-work:focus': false,
    },
    '2026-09-01': {
      'visible-care:water': true,
      'history:deleted-care:old-step': { routineTitle: 'Deleted care', stepTitle: 'Old step' },
    },
  };
  const before = { routines, progress };
  const after = {
    routines: routines.map((routine) => {
      if (routine.id === 'unrelated-work') return routine;
      const { category: _category, ...rest } = routine;
      return rest;
    }),
    progress,
  };

  // Playwright's page fixture has isolated storage, never the user's session.
  // Init scripts also run on reload: seed only empty storage, not saved results.
  await page.addInitScript(({ routines, progress }) => {
    if (localStorage.length === 0) {
      localStorage.setItem('@routine-flow/routines', JSON.stringify(routines));
      localStorage.setItem('@routine-flow/progress', JSON.stringify(progress));
    }
  }, before);
  await page.goto('/');
  const visible = page.getByLabel('Open Visible care', { exact: true });
  const hidden = page.getByLabel('Open Hidden care', { exact: true });
  const unrelated = page.getByLabel('Open Unrelated work', { exact: true });
  const filter = page.getByTestId('category-filter-home care');
  const confirmation = page.getByText('Remove “Home Care”?', { exact: true });

  await expect(visible).toBeVisible();
  await expect(hidden).toHaveCount(0);
  await expect(unrelated).toBeVisible();
  await page.getByTestId('toggle-hidden-routines').click();
  await expect(hidden).toBeVisible();
  await filter.click();
  await expect(unrelated).toHaveCount(0);
  await expect(visible.getByText('Home Care', { exact: true })).toBeVisible();
  await expect(hidden.getByText('home care', { exact: true })).toBeVisible();
  expect(await storedData(page)).toEqual(before);

  await page.getByTestId('remove-category').click();
  await expect(confirmation).toBeVisible();
  await expect(page.getByText(/Clears this label from all 2 matching routines, including hidden routines/)).toBeVisible();
  await page.getByTestId('cancel-category-removal').click();
  await expect(confirmation).toHaveCount(0);
  await expect(filter).toBeVisible();
  await expect(visible.getByText('Home Care', { exact: true })).toBeVisible();
  await expect(hidden.getByText('home care', { exact: true })).toBeVisible();
  expect(await storedData(page)).toEqual(before);

  await page.getByTestId('remove-category').click();
  await expect(confirmation).toBeVisible();
  // Arm only after hydration/cancel. Reject exactly the next routine write at
  // the real storage boundary, restoring the method before throwing so retry
  // exercises production persistence without another test intervention.
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === '@routine-flow/routines') {
        Storage.prototype.setItem = originalSetItem;
        throw new Error('Category removal test: one-shot storage write failure');
      }
      return originalSetItem.call(this, key, value);
    };
  });
  await page.getByTestId('confirm-category-removal').click();
  await expect(page.getByRole('alert')).toHaveText('Category removal test: one-shot storage write failure');
  await expect(confirmation).toBeVisible();
  await expect(page.getByTestId('confirm-category-removal')).toBeEnabled();
  await expect(filter).toBeVisible();
  await expect(visible.getByText('Home Care', { exact: true })).toBeVisible();
  await expect(hidden.getByText('home care', { exact: true })).toBeVisible();
  expect(await storedData(page)).toEqual(before);

  await page.getByTestId('confirm-category-removal').click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(filter).toHaveCount(0);
  await expect(visible).toBeVisible();
  await expect(hidden).toBeVisible();
  await expect(unrelated).toBeVisible(); // Removal resets the selected filter.
  await expect(visible.getByText('Home Care', { exact: true })).toHaveCount(0);
  await expect(hidden.getByText('home care', { exact: true })).toHaveCount(0);
  await expect(unrelated.getByText('Work', { exact: true })).toBeVisible();
  expect(await storedData(page)).toEqual(after);

  await page.reload();
  await expect(visible).toBeVisible();
  await expect(unrelated).toBeVisible();
  await expect(filter).toHaveCount(0);
  await expect(page.getByTestId('category-filter-work')).toBeVisible();
  await expect(hidden).toHaveCount(0); // Hidden state persists; showHidden does not.
  await page.getByTestId('toggle-hidden-routines').click();
  await expect(hidden).toBeVisible();
  await expect(visible.getByText('Home Care', { exact: true })).toHaveCount(0);
  await expect(hidden.getByText('home care', { exact: true })).toHaveCount(0);
  await expect(unrelated.getByText('Work', { exact: true })).toBeVisible();
  await expect(visible.getByText('1/1', { exact: true })).toBeVisible();
  expect(await storedData(page)).toEqual(after);
});
