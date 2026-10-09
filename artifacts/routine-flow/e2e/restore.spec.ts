import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import type { CompletionMap } from '../types/routines';

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

const original = {
  id: 'morning-reset',
  title: 'Morning Reset',
  subtitle: 'Original backup routine',
  icon: 'sunny-outline',
  tone: 'coral',
  createdAt: '2026-09-01T08:00:00.000Z',
  steps: [{ id: 'morning-water', title: 'Drink a glass of water', durationSeconds: 120 }],
};
const customized = {
  ...original,
  title: 'My own reset',
  subtitle: 'Locally customized',
  steps: [{ ...original.steps[0], title: 'Drink tea instead' }],
};
const second = {
  ...original,
  id: 'travel-reset',
  title: 'Travel Reset',
  subtitle: 'From the backup',
  steps: [{ id: 'unpack', title: 'Unpack', durationSeconds: 60 }],
};

for (const [label, includeProgress] of [
  ['accepted', true],
  ['declined', false],
] as const) {
  test(`restoring daily progress ${label} survives a reload`, async ({ page }) => {
    if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');

    const day = new Date().toISOString().slice(0, 10);
    const backup = JSON.stringify({
      format: 'routine-flow-routines',
      version: 2,
      exportedAt: new Date().toISOString(),
      routines: [original, second],
      progress: { [day]: { 'morning-reset:morning-water': true, 'travel-reset:unpack': true } },
    });

    // Fresh storage for each choice, with a same-ID local edit and an explicit
    // incomplete step. This is the actual AsyncStorage web backend, not a mock.
    await page.addInitScript(({ routines, progress }) => {
      if (localStorage.getItem('@routine-flow/routines') === null) {
        localStorage.setItem('@routine-flow/routines', JSON.stringify(routines));
        localStorage.setItem('@routine-flow/progress', JSON.stringify(progress));
      }
    }, {
      routines: [customized],
      progress: { [day]: { 'morning-reset:morning-water': false } },
    });
    await page.goto('/');
    await expect(page.getByLabel('Open My own reset')).toBeVisible();

    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByTestId('import-routines').click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'routine-flow-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(backup),
    });
    await expect(page.getByText('This backup includes daily progress.')).toBeVisible();
    await page.getByTestId(includeProgress ? 'import-with-progress' : 'import-without-progress').click();
    await expect(page.getByText(/2 routines imported/)).toBeVisible();
    await expect(page.getByText('This backup includes daily progress.')).toHaveCount(0);

    // A full navigation remounts the provider and hydrates it from AsyncStorage.
    await page.reload();
    await expect(page.getByLabel('Open My own reset')).toBeVisible();
    await expect(page.getByLabel('Open Morning Reset')).toBeVisible();
    await expect(page.getByLabel('Open Travel Reset')).toBeVisible();
    await expect(page.getByText(includeProgress ? '2 steps complete today.' : 'Choose a routine and get started.')).toBeVisible();

    const stored = await page.evaluate(() => ({
      routines: JSON.parse(localStorage.getItem('@routine-flow/routines') ?? '[]') as typeof original[],
      progress: JSON.parse(localStorage.getItem('@routine-flow/progress') ?? '{}') as Record<string, Record<string, boolean>>,
    }));
    expect(stored.routines).toHaveLength(3);
    expect(stored.routines[0]).toEqual(customized);
    const restored = stored.routines.find((routine) => routine.title === original.title);
    expect(restored).toBeDefined();
    expect(restored!.id).not.toBe(customized.id);
    expect(restored).toEqual({ ...original, id: restored!.id });
    expect(stored.routines.find((routine) => routine.id === second.id)).toEqual(second);
    expect(stored.progress[day]['morning-reset:morning-water']).toBe(false);
    expect(stored.progress[day][`${restored!.id}:morning-water`]).toBe(includeProgress ? true : undefined);
    expect(stored.progress[day]['travel-reset:unpack']).toBe(includeProgress ? true : undefined);
  });
}

test('all-profiles export keeps each profile and its skill history together', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  const day = new Date().toISOString().slice(0, 10);
  const people = {
    version: 1,
    activePersonId: 'alex',
    people: [
      {
        id: 'me',
        name: 'Me',
        defaultRateSkillsAtPlaylistEnd: true,
        defaultPlaylistReminderSettings: { stepCompletion: false, routineCompletion: false },
      },
      {
        id: 'alex',
        name: 'Alex',
        defaultRateSkillsAtPlaylistEnd: false,
        defaultPlaylistReminderSettings: { stepCompletion: true, routineCompletion: false },
      },
    ],
  };
  const storage: Record<string, unknown> = {
    '@routine-flow/people': people,
    '@routine-flow/routines': [original],
    '@routine-flow/progress': { [day]: { 'morning-reset:morning-water': true } },
    '@routine-flow/playlists': [{
      id: 'morning-list',
      title: 'Morning list',
      routineIds: ['morning-reset'],
      skillIds: ['me-focus'],
      rateSkillsAtPlaylistEnd: true,
    }],
    '@routine-flow/schedules': [],
    '@routine-flow/skills': [{
      id: 'me-focus',
      name: 'Focus',
      ratings: [{
        id: 'me-focus-rating',
        rating: 6,
        ratedAt: `${day}T09:00:00.000Z`,
        routineTitle: 'Morning Reset',
        note: 'Keep the plan visible.',
      }],
    }],
    '@routine-flow/skill-rating-window': '5',
    '@routine-flow/appearance': 'routine-flow',
    '@routine-flow/person/alex/@routine-flow/routines': [second],
    '@routine-flow/person/alex/@routine-flow/progress': { [day]: { 'travel-reset:unpack': true } },
    '@routine-flow/person/alex/@routine-flow/playlists': [{
      id: 'travel-list',
      title: 'Travel list',
      routineIds: ['travel-reset'],
      skillIds: ['alex-calm'],
      rateSkillsAtPlaylistEnd: false,
    }],
    '@routine-flow/person/alex/@routine-flow/schedules': [],
    '@routine-flow/person/alex/@routine-flow/skills': [{
      id: 'alex-calm',
      name: 'Calm',
      ratings: [{
        id: 'alex-calm-rating',
        rating: 9,
        ratedAt: `${day}T10:00:00.000Z`,
        routineTitle: 'Travel Reset',
        note: 'Pause before the next step.',
      }],
    }],
    '@routine-flow/person/alex/@routine-flow/skill-rating-window': '12',
    '@routine-flow/person/alex/@routine-flow/appearance': 'routine-flow',
  };
  await page.addInitScript(storage => {
    if (localStorage.getItem('@routine-flow/people') === null) {
      for (const [key, value] of Object.entries(storage)) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    }
  }, storage);

  await page.goto('/');
  await expect(page.getByLabel('Open Travel Reset')).toBeVisible();
  await page.getByTestId('include-daily-progress').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-all-people-data').click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const exported = JSON.parse(readFileSync(path!, 'utf8'));

  expect(exported).toMatchObject({
    format: 'routine-flow-all-people',
    version: 1,
    activePersonId: 'alex',
  });
  expect(exported.people.map((entry: { profile: { id: string } }) => entry.profile.id)).toEqual(['me', 'alex']);
  const meBackup = exported.people[0].backup;
  const alexBackup = exported.people[1].backup;
  expect(meBackup.routines.map((routine: { id: string }) => routine.id)).toEqual(['morning-reset']);
  expect(meBackup.skills[0].ratings[0]).toMatchObject({
    rating: 6,
    note: 'Keep the plan visible.',
  });
  expect(meBackup.personData.playlists[0].title).toBe('Morning list');
  expect(meBackup.personData.skillRatingWindow).toBe(5);
  expect(meBackup.progress[day]['morning-reset:morning-water']).toBe(true);
  expect(alexBackup.routines.map((routine: { id: string }) => routine.id)).toEqual(['travel-reset']);
  expect(alexBackup.skills[0].ratings[0]).toMatchObject({
    rating: 9,
    note: 'Pause before the next step.',
  });
  expect(alexBackup.personData.playlists[0].title).toBe('Travel list');
  expect(alexBackup.personData.skillRatingWindow).toBe(12);
  expect(alexBackup.progress[day]['travel-reset:unpack']).toBe(true);
});

async function importBackup(page: Page, contents: string, includeProgress: boolean) {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('import-routines').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'deleted-routine-history.json',
    mimeType: 'application/json',
    buffer: Buffer.from(contents),
  });
  await expect(page.getByText('This backup includes daily progress.')).toBeVisible();
  await page.getByTestId(includeProgress ? 'import-with-progress' : 'import-without-progress').click();
  await expect(page.getByText(/0 routines imported/)).toBeVisible();
  await expect(page.getByText('This backup includes daily progress.')).toHaveCount(0);
}

async function storedBackup(page: Page) {
  return page.evaluate(() => ({
    routines: JSON.parse(localStorage.getItem('@routine-flow/routines') ?? '[]') as typeof original[],
    progress: JSON.parse(localStorage.getItem('@routine-flow/progress') ?? '{}') as CompletionMap,
  }));
}

async function expectRemovedHistory(page: Page) {
  await page.goto('/history');
  await expect(page.getByText('RECORDED PROGRESS', { exact: true })).toBeVisible();
  await expect(page.getByTestId('history-older-day')).toBeEnabled();
  await page.getByTestId('history-older-day').click();
  await expect(page.getByText('3 steps completed', { exact: true })).toBeVisible();
  await expect(page.getByText('2 of 2', { exact: true })).toBeVisible();
  await expect(page.getByText('Deleted morning', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Old water', { exact: true })).toBeVisible();
  await expect(page.getByText('Removed step (legacy)', { exact: true })).toBeVisible();
  await expect(page.getByText('Removed routine (legacy routine)', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Removed step (old)', { exact: true })).toBeVisible();
  await expect(page.getByText('2 completed · No longer in your routines', { exact: true })).toHaveCount(1);
  await expect(page.getByText('1 completed · No longer in your routines', { exact: true })).toHaveCount(1);
  await expect(page.getByText(customized.title, { exact: true })).toHaveCount(0);
}

for (const [label, includeProgress] of [
  ['accepted', true],
  ['declined', false],
] as const) {
  test(`deleted-routine history ${label} stays separate from live progress after restore and reload`, async ({ page }) => {
    if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
    test.setTimeout(90_000);

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const pastDay = yesterday.toISOString().slice(0, 10);
    const labeled = { routineTitle: 'Deleted morning', stepTitle: 'Old water' };
    const liveProgress: CompletionMap = {
      [today]: { 'morning-reset:morning-water': false },
    };
    const backup = JSON.stringify({
      format: 'routine-flow-routines',
      version: 5,
      exportedAt: new Date().toISOString(),
      routines: [],
      progress: {
        [pastDay]: {
          'morning-reset:morning-water': labeled,
          'morning-reset:legacy': true,
          'legacy routine:old': true,
          'morning-reset:incomplete': false,
        },
        // Even a same-day completion with the exact live routine/step IDs must
        // stay archived rather than mark the unrelated live step complete.
        [today]: { 'morning-reset:morning-water': labeled },
      },
    });
    const expectedProgress: CompletionMap = includeProgress ? {
      [today]: {
        ...liveProgress[today],
        'history:morning-reset:morning-water': labeled,
      },
      [pastDay]: {
        'history:morning-reset:morning-water': labeled,
        'history:morning-reset:legacy': true,
        'history:legacy%20routine:old': true,
      },
    } : liveProgress;

    // Init scripts also run on reload; never overwrite the restored provider
    // state with the seed while verifying persistence.
    await page.addInitScript(({ routine, progress }) => {
      if (localStorage.getItem('@routine-flow/routines') === null) {
        localStorage.setItem('@routine-flow/routines', JSON.stringify([routine]));
        localStorage.setItem('@routine-flow/progress', JSON.stringify(progress));
      }
    }, { routine: customized, progress: liveProgress });
    await page.goto('/');
    await expect(page.getByLabel('Open My own reset')).toBeVisible();
    await importBackup(page, backup, includeProgress);
    if (includeProgress) {
      await expect(page.getByText(/4 completed steps added/)).toBeVisible();
    }

    await page.reload();
    await expect(page.getByLabel('Open My own reset')).toBeVisible();
    await expect(page.getByText('Choose a routine and get started.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Open Morning Reset')).toHaveCount(0);
    expect(await storedBackup(page)).toEqual({ routines: [customized], progress: expectedProgress });

    if (!includeProgress) {
      await page.goto('/history');
      await page.reload();
      await expect(page.getByText('No recorded progress yet', { exact: true })).toBeVisible();
      await expect(page.getByText('Deleted morning', { exact: true })).toHaveCount(0);
      await expect(page.getByText(/No longer in your routines/)).toHaveCount(0);
      expect(await storedBackup(page)).toEqual({ routines: [customized], progress: liveProgress });
      return;
    }

    await expectRemovedHistory(page);

    // Repeating the history-only import must reuse the detached identities.
    await page.goto('/');
    await expect(page.getByLabel('Open My own reset')).toBeVisible();
    await importBackup(page, backup, true);
    await expect(page.getByText(/0 completed steps added \(4 local entries kept\)/)).toBeVisible();
    await page.reload();
    await expect(page.getByText('Choose a routine and get started.', { exact: true })).toBeVisible();
    expect(await storedBackup(page)).toEqual({ routines: [customized], progress: expectedProgress });
    await expectRemovedHistory(page);

    // Download the actual exported file, then feed it back through the picker.
    // Already-archived IDs must not acquire another "history:" prefix or group.
    await page.goto('/');
    await expect(page.getByLabel('Open My own reset')).toBeVisible();
    await page.getByTestId('include-daily-progress').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-person-data').click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).not.toBeNull();
    const exportedContents = readFileSync(path!, 'utf8');
    const exported = JSON.parse(exportedContents);
    expect(exported.version).toBe(7);
    expect(exported.routines).toEqual([customized]);
    // Export omits incomplete entries, but retains both archive value formats.
    expect(exported.progress).toEqual({
      [today]: { 'history:morning-reset:morning-water': labeled },
      [pastDay]: expectedProgress[pastDay],
    });
    await importBackup(page, exportedContents, true);
    await expect(page.getByText(/1 already present · 0 playlists imported · Shared skill-average window restored · 0 completed steps added \(4 local entries kept\)/)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Open My own reset')).toBeVisible();
    await expect(page.getByText('Choose a routine and get started.', { exact: true })).toBeVisible();
    expect(await storedBackup(page)).toEqual({ routines: [customized], progress: expectedProgress });
    await expectRemovedHistory(page);
  });
}