import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';

const baseURL = process.env.RESTORE_TEST_BASE_URL
  ?? (process.env.REPLIT_EXPO_DEV_DOMAIN ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}` : undefined);

test.use({
  baseURL,
  viewport: { width: 400, height: 720 },
  launchOptions: {
    ...(process.env.CHROMIUM_PATH || existsSync('/repl/tools/bin/chromium')
      ? { executablePath: process.env.CHROMIUM_PATH ?? '/repl/tools/bin/chromium' }
      : {}),
  },
});

test('startup logo stays for three seconds and does not return during navigation', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('@routine-flow/routines', '[]');
    localStorage.setItem('@routine-flow/progress', '{}');
    localStorage.setItem('@routine-flow/skills', '[]');
    localStorage.setItem('@routine-flow/playlists', '[]');
  });

  await page.goto('/');
  const startup = page.getByTestId('app-startup-loading');
  const logo = page.getByTestId('app-startup-logo');
  await expect(logo).toBeVisible();
  const logoVisibleAt = Date.now();

  await page.waitForTimeout(2600);
  await expect(logo).toBeVisible();
  await expect(startup).toBeVisible();
  await expect(startup).toHaveCount(0, { timeout: 10000 });
  expect(Date.now() - logoVisibleAt).toBeGreaterThanOrEqual(2900);

  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(startup).toHaveCount(0);
  await expect(logo).toHaveCount(0);
});
