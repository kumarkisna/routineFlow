import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import type { Person } from '../types/people';
import type { Routine } from '../types/routines';

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

const image = (id: string, name: string) => ({
  id,
  name,
  mimeType: 'image/png',
  kind: 'image' as const,
  contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p2sAAAAASUVORK5CYII=',
});

const profile = (defaultStepPhotoSlideshow: boolean): Person => ({
  id: 'me',
  name: 'Me',
  speechVoiceId: null,
  defaultSpeechLineGapSeconds: 0.5,
  defaultRateSkillsAtPlaylistEnd: true,
  defaultPlaylistReminderSettings: { stepCompletion: false, routineCompletion: false },
  defaultSpeakRoutineDescription: true,
  defaultStepPhotoSlideshow,
});

function photoRoutine(showPhotoSlideshow?: boolean): Routine {
  return {
    id: 'photo-routine',
    title: 'Photo routine',
    subtitle: '',
    icon: 'sunny-outline',
    tone: 'coral',
    createdAt: '2026-11-14T08:00:00.000Z',
    steps: [
      {
        id: 'first-step',
        title: 'First step',
        durationSeconds: 60,
        description: 'First instructions',
        additionalDetails: ['More instructions'],
        ...(showPhotoSlideshow === undefined ? {} : { showPhotoSlideshow }),
        detailAttachments: [
          [image('first-photo', 'first-photo.png'), {
            id: 'manual', name: 'instructions.pdf', mimeType: 'application/pdf',
            kind: 'document' as const, contentBase64: 'JVBERi0=',
          }],
          [image('second-photo', 'second-photo.png')],
        ],
      },
      {
        id: 'last-step',
        title: 'Last step',
        durationSeconds: 3,
        showPhotoSlideshow: true,
        detailAttachments: [[image('last-photo', 'last-photo.png')]],
      },
    ],
  };
}

async function seed(page: Page, person: Person, routine: Routine) {
  await page.addInitScript(({ savedPerson, savedRoutine }) => {
    localStorage.setItem('@routine-flow/people', JSON.stringify({
      version: 1,
      people: [savedPerson],
      activePersonId: 'me',
    }));
    localStorage.setItem('@routine-flow/routines', JSON.stringify([savedRoutine]));
    localStorage.setItem('@routine-flow/progress', '{}');
    localStorage.setItem('@routine-flow/playlists', '[]');
    localStorage.setItem('@routine-flow/skills', '[]');
    localStorage.setItem('@routine-flow/schedules', '[]');
  }, { savedPerson: person, savedRoutine: routine });
}

test('step photos cycle while the timer runs, switch steps, and end on completion', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  await seed(page, profile(false), photoRoutine(true));
  await page.goto('/routine/photo-routine/run?autoStart=1&voice=0');

  const slide = page.getByTestId('step-photo-slideshow-image');
  await expect(slide).toHaveAttribute('aria-label', 'first-photo.png');
  await expect.poll(() => slide.getAttribute('aria-label'), { timeout: 8_000 }).toBe('second-photo.png');
  await expect(page.getByTestId('photo-slideshow-countdown')).toBeVisible();
  const countdown = page.getByTestId('photo-slideshow-countdown');
  const secondsBeforeClose = await countdown.textContent();

  await page.getByTestId('close-step-photo-slideshow').click();
  await expect(page.getByTestId('close-step-photo-slideshow')).toHaveCount(0);
  await expect(page.getByTestId('start-pause-timer')).toBeVisible();
  await expect.poll(async () => countdownTextToSeconds(await page.getByTestId('routine-countdown').textContent()))
    .toBeLessThan(countdownTextToSeconds(secondsBeforeClose));

  await page.getByLabel('Skip current step').click();
  await expect(page.getByTestId('step-photo-slideshow-image')).toHaveAttribute('aria-label', 'last-photo.png');
  await expect(page.getByText('Routine complete', { exact: true })).toBeVisible({ timeout: 6_000 });
  await expect(page.getByTestId('step-photo-slideshow-image')).toHaveCount(0);
});

test('profile default and per-step slideshow choices save and inherit correctly', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  await seed(page, profile(false), photoRoutine());
  await page.goto('/people');

  await page.getByTestId('person-edit-me').click();
  await page.getByTestId('person-step-photo-slideshow-default-me').click();
  await page.getByTestId('person-edit-save-me').click();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('@routine-flow/people') ?? '{}');
    return saved.people?.[0]?.defaultStepPhotoSlideshow;
  })).toBe(true);

  await page.goto('/routine/photo-routine');
  await page.getByTestId('edit-routine').click();
  await page.getByTestId('edit-step-first-step').click();
  await page.getByTestId('step-photo-slideshow-off').click();
  await page.getByLabel('Update step').click();
  await page.getByLabel('Save routine').click();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('@routine-flow/routines') ?? '[]');
    return saved[0]?.steps?.[0]?.showPhotoSlideshow;
  })).toBe(false);

  await page.goto('/routine/photo-routine/run?autoStart=1&voice=0');
  await expect(page.getByTestId('step-photo-slideshow-image')).toHaveCount(0);
  await page.getByLabel('Skip current step').click();
  await expect(page.getByTestId('step-photo-slideshow-image')).toHaveAttribute('aria-label', 'last-photo.png');
});

function countdownTextToSeconds(value: string | null): number {
  const parts = (value ?? '').split(':').map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}
