import { expect, test } from '@playwright/test';

const baseURL = process.env.RESTORE_TEST_BASE_URL
  ?? (process.env.REPLIT_EXPO_DEV_DOMAIN ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}` : undefined);

test('People theme settings customize, restore, filter and reset a profile palette', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  await page.goto(`${baseURL}/people`);
  await expect(page.getByTestId('active-person')).toContainText('Active: Me');
  await page.getByTestId('person-edit-me').click();
  await page.getByTestId('person-theme-toggle-me').click();
  await expect(page.getByTestId('person-theme-me-customization')).toBeVisible();

  await page.getByTestId('person-theme-choice-me-forest').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('@routine-flow/appearance'))).toBe('forest');
  await page.getByTestId('person-theme-me-primary-color-blue').click();
  await expect.poll(() => page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('@routine-flow/appearance-customization') ?? '{}');
    return store.themes?.forest?.primary;
  })).toBe('#1657a8');

  const slider = page.getByTestId('person-theme-me-tone-slider');
  const bounds = await slider.boundingBox();
  if (!bounds) throw new Error('The theme depth slider is not visible in People settings.');
  await slider.click({ position: { x: bounds.width * 0.8, y: bounds.height / 2 } });
  await expect.poll(() => page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('@routine-flow/appearance-customization') ?? '{}');
    return store.themes?.forest?.tone;
  })).toBe(80);

  await page.reload();
  await page.getByTestId('person-edit-me').click();
  if (!(await page.getByTestId('person-theme-me-customization').isVisible())) {
    await page.getByTestId('person-theme-toggle-me').click();
  }
  await expect(page.getByTestId('person-theme-me-customization')).toBeVisible();
  await expect(page.getByText('80%', { exact: true })).toBeVisible();
  await page.getByTestId('person-theme-me-reset').click();
  await expect.poll(() => page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('@routine-flow/appearance-customization') ?? '{}');
    return store.themes?.forest?.tone;
  })).toBe(50);

  await page.getByTestId('person-theme-search-me').fill('midnight navy');
  await expect(page.getByText('Showing 1 of 90 themes', { exact: true })).toBeVisible();
  await page.getByTestId('person-theme-scheme-me-dark').click();
  await expect(page.getByTestId('person-theme-choice-me-midnight-navy')).toBeVisible();
  await page.getByTestId('person-theme-scheme-me-all').click();
  await page.getByTestId('person-theme-search-me').fill('routine flow');
  await page.getByTestId('person-theme-choice-me-routine-flow').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('@routine-flow/appearance'))).toBe('routine-flow');
});

test('custom palettes remain separate when switching between people', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  await page.goto(`${baseURL}/people`);
  await page.getByTestId('person-edit-me').click();
  await page.getByTestId('person-theme-toggle-me').click();
  await page.getByTestId('person-theme-me-primary-color-blue').click();
  const meSlider = page.getByTestId('person-theme-me-tone-slider');
  const meSliderBounds = await meSlider.boundingBox();
  if (!meSliderBounds) throw new Error('The theme depth slider is not visible for Me.');
  await meSlider.click({ position: { x: meSliderBounds.width * 0.8, y: meSliderBounds.height / 2 } });
  await expect.poll(() => page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('@routine-flow/appearance-customization') ?? '{}');
    return store.themes?.['routine-flow']?.tone;
  })).toBe(80);

  await page.getByTestId('person-name-input').fill('Palette Test Person');
  await page.getByTestId('person-add').click();
  await expect.poll(() => page.evaluate(() => {
    const registry = JSON.parse(localStorage.getItem('@routine-flow/people') ?? 'null');
    return registry?.people.find((person: { name: string }) => person.name === 'Palette Test Person')?.id;
  })).not.toBeUndefined();
  const otherPersonId = await page.evaluate(() => {
    const registry = JSON.parse(localStorage.getItem('@routine-flow/people') ?? 'null');
    return registry.people.find((person: { name: string }) => person.name === 'Palette Test Person').id as string;
  });

  await page.goto(`${baseURL}/people`);
  await page.getByTestId(`person-edit-${otherPersonId}`).click();
  await page.getByTestId(`person-theme-toggle-${otherPersonId}`).click();
  await page.getByTestId(`person-theme-${otherPersonId}-primary-color-orange`).click();
  const otherPreferenceKey = `@routine-flow/person/${otherPersonId}/@routine-flow/appearance`;
  await expect.poll(() => page.evaluate(key => {
    const store = JSON.parse(localStorage.getItem(`${key}-customization`) ?? '{}');
    return store.themes?.['routine-flow']?.primary;
  }, otherPreferenceKey)).toBe('#8a3b00');

  await page.getByTestId('person-switch-me').click();
  await expect.poll(() => page.evaluate(() => {
    const registry = JSON.parse(localStorage.getItem('@routine-flow/people') ?? 'null');
    return registry?.activePersonId;
  })).toBe('me');
  await page.goto(`${baseURL}/people`);
  await page.getByTestId('person-edit-me').click();
  if (!(await page.getByTestId('person-theme-me-customization').isVisible())) {
    await page.getByTestId('person-theme-toggle-me').click();
  }
  await expect(page.getByText('80%', { exact: true })).toBeVisible();
  const savedThemes = await page.evaluate(key => ({
    me: JSON.parse(localStorage.getItem('@routine-flow/appearance-customization') ?? '{}'),
    other: JSON.parse(localStorage.getItem(`${key}-customization`) ?? '{}'),
  }), otherPreferenceKey);
  expect(savedThemes.me.themes['routine-flow']).toMatchObject({ primary: '#1657a8', tone: 80 });
  expect(savedThemes.other.themes['routine-flow'].primary).toBe('#8a3b00');
});

test('older saved palettes migrate and no longer block the web preview', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  await page.addInitScript(() => {
    if (localStorage.getItem('@routine-flow/appearance')) return;
    localStorage.setItem('@routine-flow/appearance', JSON.stringify({
      version: 1,
      themeId: 'forest',
      tone: 80,
      primaryColor: '#3867bd',
      accentColor: null,
    }));
    localStorage.setItem('@routine-flow/progress', '{}');
  });
  await page.goto(`${baseURL}/people`);
  await expect(page.getByTestId('active-person')).toContainText('Active: Me');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('@routine-flow/appearance'))).toBe('forest');
  await expect.poll(() => page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('@routine-flow/appearance-customization') ?? '{}');
    return store.themes?.forest?.primary;
  })).toBe('#3867bd');

  await page.getByTestId('person-edit-me').click();
  await page.getByTestId('person-theme-toggle-me').click();
  await expect(page.getByTestId('person-theme-me-customization')).toBeVisible();
  await expect(page.getByTestId('person-theme-me-primary-color-saved')).toBeVisible();
  await expect(page.getByText('80%', { exact: true })).toBeVisible();
});
