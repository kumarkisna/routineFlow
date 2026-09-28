import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';

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