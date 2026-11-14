import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import type { Routine } from '../types/routines';

const baseURL = process.env.RESTORE_TEST_BASE_URL
  ?? (process.env.REPLIT_EXPO_DEV_DOMAIN ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}` : undefined);

test.use({
  baseURL,
  viewport: { width: 400, height: 780 },
  launchOptions: {
    ...(process.env.CHROMIUM_PATH || existsSync('/repl/tools/bin/chromium')
      ? { executablePath: process.env.CHROMIUM_PATH ?? '/repl/tools/bin/chromium' }
      : {}),
  },
});

test('profile, routine and playlist speech pauses save overrides and inheritance in the web app', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  const routine: Routine = {
    id: 'speech-gap-routine',
    title: 'Speech gap routine',
    subtitle: '',
    icon: 'sunny-outline',
    tone: 'coral',
    createdAt: '2026-11-14T08:00:00.000Z',
    steps: [{ id: 'step-one', title: 'One step', durationSeconds: 60 }],
  };
  await page.addInitScript(savedRoutine => {
    localStorage.setItem('@routine-flow/people', JSON.stringify({
      version: 1,
      people: [{
        id: 'me',
        name: 'Me',
        speechVoiceId: null,
        defaultSpeechLineGapSeconds: 0.5,
        defaultRateSkillsAtPlaylistEnd: true,
        defaultPlaylistReminderSettings: { stepCompletion: false, routineCompletion: false },
        defaultSpeakRoutineDescription: true,
      }],
      activePersonId: 'me',
    }));
    localStorage.setItem('@routine-flow/routines', JSON.stringify([savedRoutine]));
    localStorage.setItem('@routine-flow/progress', '{}');
    localStorage.setItem('@routine-flow/playlists', JSON.stringify([{
      id: 'speech-gap-playlist',
      title: 'Speech gap playlist',
      routineIds: [savedRoutine.id],
    }]));
    localStorage.setItem('@routine-flow/skills', '[]');
    localStorage.setItem('@routine-flow/schedules', '[]');
  }, routine);

  await page.goto('/people');
  await page.getByTestId('person-edit-me').click();
  await page.getByTestId('person-speech-line-gap-me-preset-1').click();
  await page.getByTestId('person-edit-save-me').click();
  await expect.poll(() => page.evaluate(() => {
    const registry = JSON.parse(localStorage.getItem('@routine-flow/people') ?? '{}');
    return registry.people?.[0]?.defaultSpeechLineGapSeconds;
  })).toBe(1);

  await page.goto('/routine/speech-gap-routine');
  await page.getByTestId('edit-routine').click();
  await page.getByTestId('routine-speech-line-gap-preset-2').click();
  await page.getByLabel('Save routine').click();
  await expect.poll(() => page.evaluate(() => {
    const routines = JSON.parse(localStorage.getItem('@routine-flow/routines') ?? '[]');
    return routines[0]?.speechLineGapSeconds;
  })).toBe(2);

  await page.getByTestId('edit-routine').click();
  await page.getByTestId('routine-speech-line-gap-inherit').click();
  await page.getByLabel('Save routine').click();
  await expect.poll(() => page.evaluate(() => {
    const routines = JSON.parse(localStorage.getItem('@routine-flow/routines') ?? '[]');
    return Object.hasOwn(routines[0] ?? {}, 'speechLineGapSeconds');
  })).toBe(false);

  await page.goto('/playlist-editor?id=speech-gap-playlist');
  await page.getByTestId('playlist-speech-line-gap-preset-1').click();
  await page.getByTestId('save-playlist').click();
  await expect.poll(() => page.evaluate(() => {
    const playlists = JSON.parse(localStorage.getItem('@routine-flow/playlists') ?? '[]');
    return playlists[0]?.speechLineGapSeconds;
  })).toBe(1);

  await page.goto('/playlist-editor?id=speech-gap-playlist');
  await page.getByTestId('playlist-speech-line-gap-inherit').click();
  await page.getByTestId('save-playlist').click();
  await expect.poll(() => page.evaluate(() => {
    const playlists = JSON.parse(localStorage.getItem('@routine-flow/playlists') ?? '[]');
    return Object.hasOwn(playlists[0] ?? {}, 'speechLineGapSeconds');
  })).toBe(false);
});
