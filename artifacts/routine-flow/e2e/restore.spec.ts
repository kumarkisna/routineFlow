import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import type { CompletionMap } from '../types/routines';

const baseURL = process.env.RESTORE_TEST_BASE_URL
  ?? (process.env.REPLIT_EXPO_DEV_DOMAIN ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}` : undefined);

test('step detail image slideshow starts at the tapped image and stays within that detail', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  const image = (id: string, name: string) => ({
    id, name, uri: `local://${id}`, mimeType: 'image/png', kind: 'image' as const,
    contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p2sAAAAASUVORK5CYII=',
  });
  await page.addInitScript(({ routinesKey, routine }) => {
    localStorage.setItem(routinesKey, JSON.stringify([routine]));
  }, {
    routinesKey: '@routine-flow/routines',
    routine: {
      id: 'image-carousel',
      title: 'Image carousel routine',
      subtitle: 'Test',
      icon: 'sunny-outline',
      tone: 'coral',
      createdAt: '2026-10-14T00:00:00.000Z',
      steps: [
        {
          id: 'carousel-step',
          title: 'First step',
          durationSeconds: 60,
          description: 'Main instructions',
          additionalDetails: ['Additional instructions'],
          detailAttachments: [[image('main-1', 'main-one.png'), image('main-2', 'main-two.png')], [image('additional-1', 'other-detail.png')]],
        },
        {
          id: 'second-step',
          title: 'Second step',
          durationSeconds: 60,
          description: 'Another step',
          detailAttachments: [[image('step-two-1', 'other-step.png')]],
        },
      ],
    },
  });
  await page.goto('/routine/image-carousel');

  await page.getByLabel('View image main-two.png').click();
  await expect(page.getByText('2 / 2', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Next image')).toHaveCount(0);
  await page.getByLabel('Previous image').click();
  await expect(page.getByText('1 / 2', { exact: true })).toBeVisible();
  await page.getByLabel('Next image').click();
  await expect(page.getByText('2 / 2', { exact: true })).toBeVisible();
  await page.getByLabel('Close image viewer').click();
  await expect(page.getByText('this detail’s 2 images')).toBeVisible();
});

test('two routine timers can run independently and switch without changing saved routines', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  const makeRoutine = (id: string, title: string) => ({
    id, title, subtitle: 'Parallel run test', icon: 'sunny-outline', tone: 'coral',
    createdAt: '2026-10-14T00:00:00.000Z',
    steps: [{ id: `${id}-step`, title: 'Wait', durationSeconds: 180, description: 'Independent timer.' }],
  });
  await page.addInitScript(routines => {
    localStorage.setItem('@routine-flow/routines', JSON.stringify(routines));
    localStorage.setItem('@routine-flow/progress', '{}');
  }, [
    makeRoutine('parallel-one', 'First parallel routine'),
    makeRoutine('parallel-two', 'Second parallel routine'),
  ]);
  await page.goto('/routine/parallel-one/run?autoStart=1&voice=0');
  await expect(page.getByTestId('routine-play-context')).toContainText('First parallel routine');
  await expect(page.locator('[data-testid="start-pause-timer"]:visible')).toBeVisible();

  await page.getByTestId('run-another-routine').click();
  await expect(page.getByTestId('active-runs-switcher')).toContainText('Running routines · 1');
  await page.getByLabel('Open Second parallel routine').click();
  await page.getByLabel('Run routine timer').click();
  await page.getByTestId('toggle-step-voice').last().click();
  await page.getByTestId('start-pause-timer').last().click();
  await expect(page.locator('[data-testid="start-pause-timer"]:visible')).toBeVisible();

  await page.getByTestId('run-another-routine').last().click();
  await expect(page.getByTestId('active-runs-switcher').last()).toContainText('Running routines · 2');
  await page.getByRole('button', { name: /Switch to First parallel routine/ }).click();
  await expect(page.getByTestId('routine-play-context').last()).toContainText('First parallel routine');
  await expect(page.locator('[data-testid="start-pause-timer"]:visible')).toBeVisible();
  await page.getByTestId('run-another-routine').last().click();
  await expect(page.getByTestId('active-runs-switcher').last()).toContainText('Running routines · 2');
  await page.getByRole('button', { name: /Switch to Second parallel routine/ }).click();
  await expect(page.getByTestId('routine-play-context').last()).toContainText('Second parallel routine');

  const routinesAfterRuns = await page.evaluate(() => JSON.parse(localStorage.getItem('@routine-flow/routines') ?? '[]'));
  expect(routinesAfterRuns.map((routine: { id: string }) => routine.id)).toEqual(['parallel-one', 'parallel-two']);
  expect(await page.evaluate(() => localStorage.getItem('@routine-flow/progress'))).toBe('{}');
});

test('a shared run saves separate ratings for each selected person without changing their routines or progress', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  const routine = {
    id: 'group-rated',
    title: 'Shared group routine',
    subtitle: 'Group rating test',
    icon: 'sunny-outline',
    tone: 'coral',
    createdAt: '2026-10-14T00:00:00.000Z',
    steps: [{ id: 'group-step', title: 'Practice focus', durationSeconds: 1, description: 'Stay on task.', skillIds: ['me-focus'] }],
  };
  await page.addInitScript(({ routine: seededRoutine }) => {
    const profile = (id: string, name: string) => ({
      id, name, speechVoiceId: null, defaultRateSkillsAtPlaylistEnd: true,
      defaultPlaylistReminderSettings: { stepCompletion: false, routineCompletion: false },
      defaultSpeakRoutineDescription: true,
    });
    const seed = {
      '@routine-flow/people': { version: 1, activePersonId: 'me', people: [profile('me', 'Me'), profile('alex', 'Alex')] },
      '@routine-flow/routines': [seededRoutine],
      '@routine-flow/progress': '{}',
      '@routine-flow/skills': [{ id: 'me-focus', name: 'Focus' }],
      '@routine-flow/person/alex/@routine-flow/routines': '[]',
      '@routine-flow/person/alex/@routine-flow/progress': '{"keep":{"old-entry":true}}',
      '@routine-flow/person/alex/@routine-flow/skills': [{ id: 'alex-communication', name: 'Communication' }],
    };
    for (const [key, value] of Object.entries(seed)) {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }, { routine });
  await page.goto('/routine/group-rated/run?voice=0');
  await page.getByTestId('rating-people-picker').click();
  await page.getByTestId('rating-person-alex').click();
  await page.getByTestId('rating-person-me').click();
  await page.getByTestId('done-rating-people').click();
  await page.getByTestId('start-pause-timer').click();
  await expect(page.getByTestId('group-rating-person-name')).toHaveText('Alex', { timeout: 10000 });
  await page.getByTestId('group-rate-alex-me-focus-8').click();
  await page.getByTestId('group-note-alex-me-focus').fill('Stayed focused with support.');
  await page.getByTestId('save-group-ratings').click();

  const saved = await page.evaluate(() => ({
    alexSkills: JSON.parse(localStorage.getItem('@routine-flow/person/alex/@routine-flow/skills') ?? '[]'),
    alexRoutines: localStorage.getItem('@routine-flow/person/alex/@routine-flow/routines'),
    alexProgress: localStorage.getItem('@routine-flow/person/alex/@routine-flow/progress'),
    meRoutines: JSON.parse(localStorage.getItem('@routine-flow/routines') ?? '[]'),
  }));
  expect(saved.alexSkills).toHaveLength(2);
  expect(saved.alexSkills.find((skill: { name: string }) => skill.name === 'Focus').ratings[0]).toMatchObject({
    rating: 8,
    note: 'Stayed focused with support.',
    routineTitle: 'Shared group routine',
  });
  expect(saved.alexRoutines).toBe('[]');
  expect(saved.alexProgress).toBe('{"keep":{"old-entry":true}}');
  expect(saved.meRoutines).toHaveLength(1);
});

test('playlist-end group ratings retain participants across routines and isolate saved and skipped profiles', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  const routines = [
    {
      id: 'group-playlist-one', title: 'Playlist routine one', subtitle: 'First', icon: 'sunny-outline', tone: 'coral',
      createdAt: '2026-10-14T00:00:00.000Z',
      steps: [{ id: 'group-playlist-step-one', title: 'First short step', durationSeconds: 2, description: 'First.', skillIds: ['me-focus'] }],
    },
    {
      id: 'group-playlist-two', title: 'Playlist routine two', subtitle: 'Second', icon: 'sunny-outline', tone: 'sage',
      createdAt: '2026-10-14T00:00:00.000Z',
      steps: [{ id: 'group-playlist-step-two', title: 'Second short step', durationSeconds: 2, description: 'Second.', skillIds: ['me-communication'] }],
    },
  ];
  const caseyOriginalSkills = [{
    id: 'casey-focus',
    name: 'Focus',
    ratings: [{ id: 'casey-old-rating', rating: 5, ratedAt: '2026-10-10T10:00:00.000Z', routineTitle: 'Past routine', note: 'Existing note' }],
  }];
  await page.addInitScript(({ seededRoutines, caseySkills }) => {
    const profile = (id: string, name: string) => ({
      id, name, speechVoiceId: null, defaultRateSkillsAtPlaylistEnd: true,
      defaultPlaylistReminderSettings: { stepCompletion: false, routineCompletion: false },
      defaultSpeakRoutineDescription: true,
    });
    const seed = {
      '@routine-flow/people': { version: 1, activePersonId: 'me', people: [profile('me', 'Me'), profile('alex', 'Alex'), profile('casey', 'Casey')] },
      '@routine-flow/routines': seededRoutines,
      '@routine-flow/progress': '{}',
      '@routine-flow/playlists': [{
        id: 'group-playlist',
        title: 'Group playlist',
        routineIds: ['group-playlist-one', 'group-playlist-two'],
        skillIds: ['me-independence'],
        rateSkillsAtPlaylistEnd: true,
      }],
      '@routine-flow/skills': [
        { id: 'me-focus', name: 'Focus' },
        { id: 'me-communication', name: 'Communication' },
        { id: 'me-independence', name: 'Independence' },
      ],
      '@routine-flow/person/alex/@routine-flow/routines': '[]',
      '@routine-flow/person/alex/@routine-flow/progress': '{"keep":{"alex-old":true}}',
      '@routine-flow/person/alex/@routine-flow/skills': [],
      '@routine-flow/person/casey/@routine-flow/routines': '[{"id":"casey-saved-routine"}]',
      '@routine-flow/person/casey/@routine-flow/progress': '{"keep":{"casey-old":true}}',
      '@routine-flow/person/casey/@routine-flow/skills': caseySkills,
    };
    for (const [key, value] of Object.entries(seed)) {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }, { seededRoutines: routines, caseySkills: caseyOriginalSkills });

  const params = new URLSearchParams({
    queue: JSON.stringify(routines.map(routine => routine.id)),
    cursor: '0',
    playlistId: 'group-playlist',
    playlistTitle: 'Group playlist',
    playlistSkills: JSON.stringify(['me-independence']),
    playlistRateSkillsAtEnd: '1',
    voice: '0',
  });
  await page.goto(`/routine/group-playlist-one/run?${params.toString()}`);
  await page.getByTestId('rating-people-picker').click();
  await page.getByTestId('rating-person-alex').click();
  await page.getByTestId('rating-person-casey').click();
  await page.getByTestId('toggle-admin-rating-mode').click();
  await page.getByTestId('done-rating-people').click();
  await page.getByTestId('start-pause-timer').click();

  await expect(page.getByText('Second short step').last()).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('group-rating-person-name')).toHaveCount(0);
  await expect(page.getByTestId('group-rating-person-name')).toHaveText('Alex', { timeout: 10000 });
  for (const [skillId, score] of [['me-focus', '8'], ['me-communication', '7'], ['me-independence', '9']]) {
    await page.getByTestId(`group-rate-alex-${skillId}-${score}`).click();
  }
  await page.getByTestId('group-note-alex-me-focus').fill('Playlist reflection for Alex.');
  await page.getByTestId('save-group-ratings').click();
  await expect(page.getByTestId('group-rating-person-name')).toHaveText('Casey');
  await page.getByTestId('skip-group-person').click();

  const saved = await page.evaluate(() => ({
    alexSkills: JSON.parse(localStorage.getItem('@routine-flow/person/alex/@routine-flow/skills') ?? '[]'),
    alexRoutines: localStorage.getItem('@routine-flow/person/alex/@routine-flow/routines'),
    alexProgress: localStorage.getItem('@routine-flow/person/alex/@routine-flow/progress'),
    caseySkills: JSON.parse(localStorage.getItem('@routine-flow/person/casey/@routine-flow/skills') ?? '[]'),
    caseyRoutines: localStorage.getItem('@routine-flow/person/casey/@routine-flow/routines'),
    caseyProgress: localStorage.getItem('@routine-flow/person/casey/@routine-flow/progress'),
    meSkills: JSON.parse(localStorage.getItem('@routine-flow/skills') ?? '[]'),
  }));
  expect(saved.alexSkills).toHaveLength(3);
  for (const skillName of ['Focus', 'Communication', 'Independence']) {
    const savedSkill = saved.alexSkills.find((skill: { name: string }) => skill.name === skillName);
    expect(savedSkill?.ratings).toHaveLength(1);
  }
  expect(saved.alexSkills.find((skill: { name: string }) => skill.name === 'Focus').ratings[0].note)
    .toBe('Playlist reflection for Alex.');
  expect(saved.alexRoutines).toBe('[]');
  expect(saved.alexProgress).toBe('{"keep":{"alex-old":true}}');
  expect(saved.caseySkills).toEqual(caseyOriginalSkills);
  expect(saved.caseyRoutines).toBe('[{"id":"casey-saved-routine"}]');
  expect(saved.caseyProgress).toBe('{"keep":{"casey-old":true}}');
  expect(saved.meSkills).toEqual([
    { id: 'me-focus', name: 'Focus' },
    { id: 'me-communication', name: 'Communication' },
    { id: 'me-independence', name: 'Independence' },
  ]);
});

test('person theme settings can be changed and their collapsed choice is remembered', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  await page.goto('/people');
  await page.getByTestId('person-edit-me').click();

  const section = page.getByTestId('person-theme-toggle-me');
  await expect(page.getByTestId('person-theme-search-me')).toHaveCount(0);
  await section.click();
  await expect(page.getByTestId('person-theme-search-me')).toBeVisible();

  const forestTheme = page.getByTestId('person-theme-choice-me-forest');
  await forestTheme.click();
  await page.waitForFunction(() => localStorage.getItem('@routine-flow/appearance') === 'forest');
  await page.waitForFunction(() =>
    localStorage.getItem('routine-flow:disclosure:v1:person-theme-settings:me')?.includes('"me":true'),
  );

  await page.reload();
  await page.getByTestId('person-edit-me').click();
  const restoredSection = page.getByTestId('person-theme-toggle-me');
  await expect(page.getByTestId('person-theme-search-me')).toBeVisible();
  await restoredSection.click();
  await expect(page.getByTestId('person-theme-search-me')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('@routine-flow/appearance'))).toBe('forest');

  const backgroundSection = page.getByTestId('person-background-toggle-me');
  await backgroundSection.click();
  await expect(page.getByTestId('person-background-choose-me')).toBeVisible();
  await expect(page.getByTestId('person-background-camera-me')).toBeVisible();
  await expect(backgroundSection).toContainText('No photo');
  await expect(page.getByTestId('person-background-clear-me')).toBeEnabled();
  await page.getByTestId('person-background-clear-me').click();
  await expect(page.getByText('No background picture is set for this person.')).toBeVisible();

  await page.evaluate(() => localStorage.setItem('@routine-flow/background-image', 'data:image/jpeg;base64,dGVzdA=='));
  await page.reload();
  await expect(page.getByTestId('app-background-image')).toBeVisible();
  await page.getByTestId('person-edit-me').click();
  await expect(page.getByTestId('person-background-clear-me')).toBeEnabled();
  await page.getByTestId('person-background-clear-me').click();
  await expect(page.getByText('No background picture is set for this person.')).toBeVisible();
  await expect(page.getByTestId('app-background-image')).toHaveCount(0);
});

test('canceling a background camera capture keeps the current photo and camera available', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  const savedPhoto = 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
  await page.addInitScript(photo => {
    localStorage.setItem('@routine-flow/background-image', photo);
  }, savedPhoto);
  await page.goto('/people');

  const expectRenderedPhoto = async (testId: string) => {
    const image = page.getByTestId(testId).locator('div').last();
    await expect.poll(() => image.evaluate(element => getComputedStyle(element).backgroundImage))
      .toContain(savedPhoto.slice(savedPhoto.indexOf(',') + 1));
  };
  await expectRenderedPhoto('app-background-image');
  await page.getByTestId('person-edit-me').click();
  await page.getByTestId('person-background-toggle-me').click();
  await expectRenderedPhoto('person-background-preview-me');

  const pickerPromise = page.waitForEvent('filechooser');
  await page.getByTestId('person-background-camera-me').click();
  const cameraPicker = await pickerPromise;
  expect(await cameraPicker.element().getAttribute('capture')).toBe('camera');
  await cameraPicker.element().dispatchEvent('cancel');

  await expect.poll(() => page.evaluate(() => localStorage.getItem('@routine-flow/background-image'))).toBe(savedPhoto);
  await expectRenderedPhoto('person-background-preview-me');
  await expectRenderedPhoto('app-background-image');
  await expect(page.getByTestId('person-background-camera-me')).toBeEnabled();
});

test('background photos stay with their person across switches, reloads, and clearing', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  const mePhotoBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
  const alexPhotoBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/5ncLrgAAAABJRU5ErkJggg==';
  await page.addInitScript(() => {
    if (localStorage.getItem('@routine-flow/people') !== null) return;
    localStorage.setItem('@routine-flow/people', JSON.stringify({
      version: 1,
      activePersonId: 'me',
      people: [
        {
          id: 'me',
          name: 'Me',
          speechVoiceId: null,
          defaultRateSkillsAtPlaylistEnd: true,
          defaultPlaylistReminderSettings: { stepCompletion: true, routineCompletion: true },
          defaultSpeakRoutineDescription: true,
        },
        {
          id: 'alex',
          name: 'Alex',
          speechVoiceId: null,
          defaultRateSkillsAtPlaylistEnd: true,
          defaultPlaylistReminderSettings: { stepCompletion: true, routineCompletion: true },
          defaultSpeakRoutineDescription: true,
        },
      ],
    }));
    localStorage.setItem('@routine-flow/routines', '[]');
    localStorage.setItem('@routine-flow/progress', '{}');
    localStorage.setItem('@routine-flow/playlists', '[]');
    localStorage.setItem('@routine-flow/schedules', '[]');
    localStorage.setItem('@routine-flow/skills', '[]');
  });

  await page.goto('/people');
  const expectRenderedPhoto = async (uri: string) => {
    const image = page.getByTestId('app-background-image').locator('div').last();
    await expect.poll(() => image.evaluate(element => getComputedStyle(element).backgroundImage))
      .toContain(uri.slice(uri.indexOf(',') + 1));
  };
  const choosePhoto = async (personId: string, fileName: string, base64: string) => {
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByTestId(`person-background-choose-${personId}`).click();
    await (await chooserPromise).setFiles({
      name: fileName,
      mimeType: 'image/png',
      buffer: Buffer.from(base64, 'base64'),
    });
    await expect(page.getByText('Background photo saved for this person.', { exact: true })).toBeVisible();
  };

  await page.getByTestId('person-edit-me').click();
  await page.getByTestId('person-background-toggle-me').click();
  await choosePhoto('me', 'me-background.png', mePhotoBase64);
  const mePhoto = await page.evaluate(() => localStorage.getItem('@routine-flow/background-image'));
  expect(mePhoto).not.toBeNull();
  await expectRenderedPhoto(mePhoto!);

  await page.getByTestId('person-edit-alex').click();
  await page.getByTestId('person-background-toggle-alex').click();
  await choosePhoto('alex', 'alex-background.png', alexPhotoBase64);
  const alexPhoto = await page.evaluate(() =>
    localStorage.getItem('@routine-flow/person/alex/@routine-flow/background-image'));
  expect(alexPhoto).not.toBeNull();
  expect(alexPhoto).not.toBe(mePhoto);
  await expectRenderedPhoto(mePhoto!);

  await page.getByTestId('person-switch-alex').click();
  await expect(page.getByLabel('Active person: Alex. Open people')).toBeVisible();
  await expectRenderedPhoto(alexPhoto!);

  await page.reload();
  await expect(page.getByLabel('Active person: Alex. Open people')).toBeVisible();
  await expectRenderedPhoto(alexPhoto!);

  await page.getByLabel('Active person: Alex. Open people').click();
  await page.getByTestId('person-switch-me').click();
  await expect(page.getByLabel('Active person: Me. Open people')).toBeVisible();
  await expectRenderedPhoto(mePhoto!);
  await page.reload();
  await expect(page.getByLabel('Active person: Me. Open people')).toBeVisible();
  await expectRenderedPhoto(mePhoto!);

  await page.getByLabel('Active person: Me. Open people').click();
  await page.getByTestId('person-edit-me').click();
  const clearMePhoto = page.getByTestId('person-background-clear-me');
  if (!(await clearMePhoto.isVisible())) await page.getByTestId('person-background-toggle-me').click();
  await clearMePhoto.click();
  await expect(page.getByTestId('app-background-image')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => ({
    me: localStorage.getItem('@routine-flow/background-image'),
    alex: localStorage.getItem('@routine-flow/person/alex/@routine-flow/background-image'),
  }))).toEqual({ me: null, alex: alexPhoto });

  await page.getByTestId('person-switch-alex').click();
  await expectRenderedPhoto(alexPhoto!);
  await page.reload();
  await expect(page.getByLabel('Active person: Alex. Open people')).toBeVisible();
  await expectRenderedPhoto(alexPhoto!);
});

test('failed background saves and clears keep the selected photo and can be retried', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  const oldMePhoto = 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
  const newMePhotoBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
  const alexPhoto = 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/5ncLrgAAAABJRU5ErkJggg==';
  await page.addInitScript(({ oldMePhoto, alexPhoto }) => {
    localStorage.setItem('@routine-flow/people', JSON.stringify({
      version: 1,
      activePersonId: 'me',
      people: [
        {
          id: 'me', name: 'Me', speechVoiceId: null, defaultRateSkillsAtPlaylistEnd: true,
          defaultPlaylistReminderSettings: { stepCompletion: true, routineCompletion: true },
          defaultSpeakRoutineDescription: true,
        },
        {
          id: 'alex', name: 'Alex', speechVoiceId: null, defaultRateSkillsAtPlaylistEnd: true,
          defaultPlaylistReminderSettings: { stepCompletion: true, routineCompletion: true },
          defaultSpeakRoutineDescription: true,
        },
      ],
    }));
    localStorage.setItem('@routine-flow/routines', '[]');
    localStorage.setItem('@routine-flow/progress', '{}');
    localStorage.setItem('@routine-flow/playlists', '[]');
    localStorage.setItem('@routine-flow/schedules', '[]');
    localStorage.setItem('@routine-flow/skills', '[]');
    localStorage.setItem('@routine-flow/background-image', oldMePhoto);
    localStorage.setItem('@routine-flow/person/alex/@routine-flow/background-image', alexPhoto);

    const nativeSetItem = Storage.prototype.setItem;
    const nativeRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === '@routine-flow/background-image' && nativeGetItem.call(this, '__fail_next_background_set') === '1') {
        nativeSetItem.call(this, key, value);
        nativeSetItem.call(this, '__fail_next_background_set', '0');
        throw new Error('Temporary storage failure after commit.');
      }
      nativeSetItem.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key) {
      if (key === '@routine-flow/background-image' && nativeGetItem.call(this, '__fail_next_background_remove') === '1') {
        nativeRemoveItem.call(this, key);
        nativeSetItem.call(this, '__fail_next_background_remove', '0');
        throw new Error('Temporary storage failure after removal.');
      }
      nativeRemoveItem.call(this, key);
    };
    const nativeGetItem = Storage.prototype.getItem;
    const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      if (type === 'image/jpeg' && nativeGetItem.call(localStorage, '__fail_next_background_jpeg_encode') === '1') {
        nativeRemoveItem.call(localStorage, '__fail_next_background_jpeg_encode');
        callback(null);
        return;
      }
      nativeToBlob.call(this, callback, type, quality);
    };
  }, { oldMePhoto, alexPhoto });

  await page.goto('/people');
  const expectRenderedPhoto = async (uri: string) => {
    const image = page.getByTestId('app-background-image').locator('div').last();
    await expect.poll(() => image.evaluate(element => getComputedStyle(element).backgroundImage))
      .toContain(uri.slice(uri.indexOf(',') + 1));
  };
  const expectSelectedProfilePhoto = async (uri: string) => {
    const image = page.getByTestId('person-background-preview-me').locator('div').last();
    await expect.poll(() => image.evaluate(element => getComputedStyle(element).backgroundImage))
      .toContain(uri.slice(uri.indexOf(',') + 1));
  };
  await expectRenderedPhoto(oldMePhoto);
  await page.getByTestId('person-edit-me').click();
  await page.getByTestId('person-background-toggle-me').click();
  await expectSelectedProfilePhoto(oldMePhoto);

  await page.evaluate(() => localStorage.setItem('__fail_next_background_set', '1'));
  let chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('person-background-choose-me').click();
  await (await chooserPromise).setFiles({
    name: 'new-me-background.png',
    mimeType: 'image/png',
    buffer: Buffer.from(newMePhotoBase64, 'base64'),
  });
  await expect(page.getByText(/background photo could not be saved.*previous photo is still selected/i)).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('@routine-flow/background-image'))).toBe(oldMePhoto);
  await expectRenderedPhoto(oldMePhoto);
  await expectSelectedProfilePhoto(oldMePhoto);

  chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('person-background-choose-me').click();
  await (await chooserPromise).setFiles({
    name: 'new-me-background.png',
    mimeType: 'image/png',
    buffer: Buffer.from(newMePhotoBase64, 'base64'),
  });
  await expect(page.getByText('Background photo saved for this person.', { exact: true })).toBeVisible();
  const savedMePhoto = await page.evaluate(() => localStorage.getItem('@routine-flow/background-image'));
  expect(savedMePhoto).not.toBe(oldMePhoto);
  await expectRenderedPhoto(savedMePhoto!);
  await expectSelectedProfilePhoto(savedMePhoto!);

  await page.evaluate(() => localStorage.setItem('__fail_next_background_set', '1'));
  let cameraChooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('person-background-camera-me').click();
  let cameraChooser = await cameraChooserPromise;
  expect(await cameraChooser.element().getAttribute('capture')).toBe('camera');
  await cameraChooser.setFiles({
    name: 'camera-me-background.png',
    mimeType: 'image/png',
    buffer: Buffer.from(alexPhoto.slice('data:image/jpeg;base64,'.length), 'base64'),
  });
  await expect(page.getByText(/background photo could not be saved.*previous photo is still selected/i)).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('@routine-flow/background-image'))).toBe(savedMePhoto);
  await expectRenderedPhoto(savedMePhoto!);
  await expectSelectedProfilePhoto(savedMePhoto!);

  await page.evaluate(() => localStorage.setItem('__fail_next_background_jpeg_encode', '1'));
  cameraChooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('person-background-camera-me').click();
  cameraChooser = await cameraChooserPromise;
  expect(await cameraChooser.element().getAttribute('capture')).toBe('camera');
  await cameraChooser.setFiles({
    name: 'camera-me-background.png',
    mimeType: 'image/png',
    buffer: Buffer.from(alexPhoto.slice('data:image/jpeg;base64,'.length), 'base64'),
  });
  await expect(page.getByText(/new picture could not be prepared.*current background photo is still selected/i)).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('@routine-flow/background-image'))).toBe(savedMePhoto);
  await expectRenderedPhoto(savedMePhoto!);
  await expectSelectedProfilePhoto(savedMePhoto!);

  cameraChooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('person-background-camera-me').click();
  cameraChooser = await cameraChooserPromise;
  expect(await cameraChooser.element().getAttribute('capture')).toBe('camera');
  await cameraChooser.setFiles({
    name: 'camera-me-background.png',
    mimeType: 'image/png',
    buffer: Buffer.from(alexPhoto.slice('data:image/jpeg;base64,'.length), 'base64'),
  });
  await expect(page.getByText('Background photo saved for this person.', { exact: true })).toBeVisible();
  const savedCameraPhoto = await page.evaluate(() => localStorage.getItem('@routine-flow/background-image'));
  expect(savedCameraPhoto).not.toBe(savedMePhoto);
  await expectRenderedPhoto(savedCameraPhoto!);
  await expectSelectedProfilePhoto(savedCameraPhoto!);
  await expect.poll(() => page.evaluate(() =>
    localStorage.getItem('@routine-flow/person/alex/@routine-flow/background-image'))).toBe(alexPhoto);

  await page.evaluate(() => localStorage.setItem('__fail_next_background_jpeg_encode', '1'));
  chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('person-background-choose-me').click();
  await (await chooserPromise).setFiles({
    name: 'library-me-background.png',
    mimeType: 'image/png',
    buffer: Buffer.from(alexPhoto.slice('data:image/jpeg;base64,'.length), 'base64'),
  });
  await expect(page.getByText(/new picture could not be prepared.*current background photo is still selected/i)).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('@routine-flow/background-image'))).toBe(savedCameraPhoto);
  await expectRenderedPhoto(savedCameraPhoto!);
  await expectSelectedProfilePhoto(savedCameraPhoto!);

  chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('person-background-choose-me').click();
  await (await chooserPromise).setFiles({
    name: 'library-me-background-retry.png',
    mimeType: 'image/png',
    buffer: Buffer.from(newMePhotoBase64, 'base64'),
  });
  await expect(page.getByText('Background photo saved for this person.', { exact: true })).toBeVisible();
  const savedLibraryPhoto = await page.evaluate(() => localStorage.getItem('@routine-flow/background-image'));
  expect(savedLibraryPhoto).not.toBe(savedCameraPhoto);
  await expectRenderedPhoto(savedLibraryPhoto!);
  await expectSelectedProfilePhoto(savedLibraryPhoto!);

  await page.evaluate(() => localStorage.setItem('__fail_next_background_remove', '1'));
  await page.getByTestId('person-background-clear-me').click();
  await expect(page.getByText(/background photo could not be cleared.*previous photo is still selected/i)).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('@routine-flow/background-image'))).toBe(savedLibraryPhoto);
  await expectRenderedPhoto(savedLibraryPhoto!);
  await expectSelectedProfilePhoto(savedLibraryPhoto!);

  await page.getByTestId('person-background-clear-me').click();
  await expect(page.getByText('No background picture is set for this person.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('app-background-image')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    localStorage.getItem('@routine-flow/person/alex/@routine-flow/background-image'))).toBe(alexPhoto);

  await page.getByTestId('person-switch-alex').click();
  await expect(page.getByLabel('Active person: Alex. Open people')).toBeVisible();
  await expectRenderedPhoto(alexPhoto);
});

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

test('dedicated all-profile import action rejects routine-only backups', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  await page.goto('/');
  await expect(page.getByTestId('import-all-people-data')).toBeVisible();

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('import-all-people-data').click();
  await (await chooserPromise).setFiles({
    name: 'routine-only-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'routine-flow-routines' })),
  });
  await expect(page.getByText('Select an all-profiles backup file.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Restore \d+ profiles\?/)).toHaveCount(0);
});

test('all-profile restore remaps colliding routine IDs without crossing same-named skill assignments through export and re-import', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  const profiles = [
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
  ];
  const entries = [
    { profile: profiles[0], backupSkillId: 'me-backup-focus', localSkillId: 'me-local-focus', prefix: 'me' },
    { profile: profiles[1], backupSkillId: 'alex-backup-focus', localSkillId: 'alex-local-focus', prefix: 'alex' },
  ];
  const conflictingRoutineId = 'shared-focus-routine';
  const backupRoutine = (prefix: string, skillId: string) => ({
    id: conflictingRoutineId,
    title: `${prefix} Focus routine`,
    subtitle: '',
    icon: 'sunny-outline',
    tone: 'coral',
    createdAt: '2026-09-01T08:00:00.000Z',
    skillIds: [skillId],
    steps: [{
      id: `${prefix}-focus-step`,
      title: 'Practice focus',
      durationSeconds: 60,
      skillIds: [skillId],
    }],
  });

  const backupSchedule = (prefix: string, skillId: string, routineId: string, playlistId: string) => ({
    id: `${prefix}-focus-schedule`,
    targetType: 'playlist',
    targetId: playlistId,
    targetTitle: `${prefix} Focus playlist`,
    scheduledAt: prefix === 'me' ? '2090-06-01T09:00:00.000Z' : '2090-06-01T10:00:00.000Z',
    reminder: true,
    alertOffsetsMinutes: [0],
    playlistOverride: {
      title: `${prefix} Focus date`,
      routineIds: [routineId],
      skillIds: [skillId],
      reminderSettings: { stepCompletion: true, routineCompletion: false },
    },
  });
  const localConflictRoutine = (prefix: string, skillId: string) => ({
    id: conflictingRoutineId,
    title: `${prefix} local routine`,
    subtitle: 'Saved on this device',
    icon: 'sunny-outline',
    tone: 'coral',
    createdAt: '2026-09-02T08:00:00.000Z',
    skillIds: [skillId],
    steps: [{
      id: `${prefix}-local-step`,
      title: 'Keep the local version',
      durationSeconds: 90,
      skillIds: [skillId],
    }],
  });
  const allProfilesBackup = {
    format: 'routine-flow-all-people',
    version: 1,
    activePersonId: 'alex',
    people: entries.map(({ profile, backupSkillId, prefix }) => {
      const routine = backupRoutine(prefix, backupSkillId);
      const playlistId = `${prefix}-focus-playlist`;
      return {
        profile,
        backup: {
          format: 'routine-flow-routines',
          version: 7,
          exportedAt: '2026-10-01T08:00:00.000Z',
          routines: [routine],
          skills: [{ id: backupSkillId, name: 'Focus' }],
          personData: {
            playlists: [{
              id: playlistId,
              title: `${prefix} Focus playlist`,
              routineIds: [routine.id],
              skillIds: [backupSkillId],
              rateSkillsAtPlaylistEnd: true,
            }],
            schedules: [backupSchedule(prefix, backupSkillId, routine.id, playlistId)],
            selectedThemeId: 'routine-flow',
            skillRatingWindow: 5,
          },
        },
      };
    }),
  };
  const localStorageSeed = {
    '@routine-flow/people': { version: 1, activePersonId: 'me', people: profiles },
    '@routine-flow/routines': [localConflictRoutine('me', 'me-local-focus')],
    '@routine-flow/progress': {},
    '@routine-flow/playlists': [],
    '@routine-flow/schedules': [],
    '@routine-flow/skills': [{ id: 'me-local-focus', name: 'Focus' }],
    '@routine-flow/skill-rating-window': '5',
    '@routine-flow/appearance': 'routine-flow',
    '@routine-flow/person/alex/@routine-flow/routines': [localConflictRoutine('alex', 'alex-local-focus')],
    '@routine-flow/person/alex/@routine-flow/progress': {},
    '@routine-flow/person/alex/@routine-flow/playlists': [],
    '@routine-flow/person/alex/@routine-flow/schedules': [],
    '@routine-flow/person/alex/@routine-flow/skills': [{ id: 'alex-local-focus', name: 'Focus' }],
    '@routine-flow/person/alex/@routine-flow/skill-rating-window': '5',
    '@routine-flow/person/alex/@routine-flow/appearance': 'routine-flow',
  };
  await page.addInitScript(storage => {
    if (localStorage.getItem('@routine-flow/people') === null) {
      for (const [key, value] of Object.entries(storage)) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    }
  }, localStorageSeed);

  await page.goto('/');
  await expect(page.getByLabel('Active person: Me. Open people')).toBeVisible();
  await expect(page.getByTestId('import-all-people-data')).toBeVisible();
  const restoreChooser = page.waitForEvent('filechooser');
  await page.getByTestId('import-all-people-data').click();
  await (await restoreChooser).setFiles({
    name: 'same-named-profile-skills.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(allProfilesBackup)),
  });
  await expect(page.getByText('Restore 2 profiles?')).toBeVisible();
  await page.getByTestId('import-all-profiles').click();
  await expect(page.getByText('Restore 2 profiles?')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Active person: Alex. Open people')).toBeVisible();

  const readAssignments = () => page.evaluate(() => {
    const read = (key: string) => JSON.parse(localStorage.getItem(key) ?? '[]');
    return {
      meRoutines: read('@routine-flow/routines'),
      mePlaylists: read('@routine-flow/playlists'),
      meSchedules: read('@routine-flow/schedules'),
      meSkills: read('@routine-flow/skills'),
      alexRoutines: read('@routine-flow/person/alex/@routine-flow/routines'),
      alexPlaylists: read('@routine-flow/person/alex/@routine-flow/playlists'),
      alexSchedules: read('@routine-flow/person/alex/@routine-flow/schedules'),
      alexSkills: read('@routine-flow/person/alex/@routine-flow/skills'),
    };
  });
  const afterRestore = await readAssignments();
  expect(afterRestore.meSkills.map((skill: { id: string; name: string }) => [skill.id, skill.name]))
    .toEqual([['me-local-focus', 'Focus']]);
  expect(afterRestore.alexSkills.map((skill: { id: string; name: string }) => [skill.id, skill.name]))
    .toEqual([['alex-local-focus', 'Focus']]);
  const meRestoredRoutine = afterRestore.meRoutines.find((routine: { title: string }) => routine.title === 'me Focus routine');
  const alexRestoredRoutine = afterRestore.alexRoutines.find((routine: { title: string }) => routine.title === 'alex Focus routine');
  expect(meRestoredRoutine).toMatchObject({
    skillIds: ['me-local-focus'],
    steps: [{ id: 'me-focus-step', skillIds: ['me-local-focus'] }],
  });
  expect(meRestoredRoutine.id).not.toBe(conflictingRoutineId);
  expect(afterRestore.meRoutines.find((routine: { title: string }) => routine.title === 'me local routine')).toEqual(
    localConflictRoutine('me', 'me-local-focus'),
  );
  expect(alexRestoredRoutine).toMatchObject({
    skillIds: ['alex-local-focus'],
    steps: [{ id: 'alex-focus-step', skillIds: ['alex-local-focus'] }],
  });
  expect(alexRestoredRoutine.id).not.toBe(conflictingRoutineId);
  expect(afterRestore.alexRoutines.find((routine: { title: string }) => routine.title === 'alex local routine')).toEqual(
    localConflictRoutine('alex', 'alex-local-focus'),
  );
  expect(afterRestore.mePlaylists[0]).toMatchObject({
    routineIds: [meRestoredRoutine.id],
    skillIds: ['me-local-focus'],
  });
  expect(afterRestore.alexPlaylists[0]).toMatchObject({
    routineIds: [alexRestoredRoutine.id],
    skillIds: ['alex-local-focus'],
  });
  expect(afterRestore.meSchedules[0]).toMatchObject({
    id: 'me-focus-schedule',
    targetId: 'me-focus-playlist',
    playlistOverride: {
      routineIds: [meRestoredRoutine.id],
      skillIds: ['me-local-focus'],
    },
  });
  expect(afterRestore.alexSchedules[0]).toMatchObject({
    id: 'alex-focus-schedule',
    targetId: 'alex-focus-playlist',
    playlistOverride: {
      routineIds: [alexRestoredRoutine.id],
      skillIds: ['alex-local-focus'],
    },
  });

  const exportPromise = page.waitForEvent('download');
  await page.getByTestId('export-all-people-data').click();
  const exportedFile = await exportPromise;
  const exportedPath = await exportedFile.path();
  expect(exportedPath).not.toBeNull();
  const exportedContents = readFileSync(exportedPath!, 'utf8');
  const exported = JSON.parse(exportedContents);
  const exportedMeBackup = exported.people[0].backup;
  const exportedAlexBackup = exported.people[1].backup;
  const exportedMeRoutine = exportedMeBackup.routines.find((routine: { title: string }) => routine.title === 'me Focus routine');
  const exportedAlexRoutine = exportedAlexBackup.routines.find((routine: { title: string }) => routine.title === 'alex Focus routine');
  expect(exportedMeRoutine).toMatchObject({
    id: meRestoredRoutine.id,
    skillIds: ['me-local-focus'],
    steps: [{ skillIds: ['me-local-focus'] }],
  });
  expect(exportedMeBackup.routines.find((routine: { title: string }) => routine.title === 'me local routine'))
    .toEqual(localConflictRoutine('me', 'me-local-focus'));
  expect(exportedMeBackup.personData.playlists[0]).toMatchObject({
    routineIds: [meRestoredRoutine.id],
    skillIds: ['me-local-focus'],
  });
  expect(exportedAlexRoutine).toMatchObject({
    id: alexRestoredRoutine.id,
    skillIds: ['alex-local-focus'],
    steps: [{ skillIds: ['alex-local-focus'] }],
  });
  expect(exportedAlexBackup.routines.find((routine: { title: string }) => routine.title === 'alex local routine'))
    .toEqual(localConflictRoutine('alex', 'alex-local-focus'));
  expect(exportedAlexBackup.personData.playlists[0]).toMatchObject({
    routineIds: [alexRestoredRoutine.id],
    skillIds: ['alex-local-focus'],
  });
  expect(exportedMeBackup.personData.schedules[0].playlistOverride).toMatchObject({
    routineIds: [meRestoredRoutine.id],
    skillIds: ['me-local-focus'],
  });
  expect(exportedAlexBackup.personData.schedules[0].playlistOverride).toMatchObject({
    routineIds: [alexRestoredRoutine.id],
    skillIds: ['alex-local-focus'],
  });

  const reimportChooser = page.waitForEvent('filechooser');
  await page.getByTestId('import-all-people-data').click();
  await (await reimportChooser).setFiles({
    name: 'same-named-profile-skills-round-trip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportedContents),
  });
  await expect(page.getByText('Restore 2 profiles?')).toBeVisible();
  await page.getByTestId('import-all-profiles').click();
  await expect(page.getByText('Restore 2 profiles?')).toHaveCount(0);
  await page.reload();

  const afterReimport = await readAssignments();
  expect(afterReimport.meRoutines).toHaveLength(2);
  expect(afterReimport.alexRoutines).toHaveLength(2);
  const meReimportedRoutine = afterReimport.meRoutines.find((routine: { title: string }) => routine.title === 'me Focus routine');
  const alexReimportedRoutine = afterReimport.alexRoutines.find((routine: { title: string }) => routine.title === 'alex Focus routine');
  expect(meReimportedRoutine).toMatchObject({
    id: meRestoredRoutine.id,
    skillIds: ['me-local-focus'],
    steps: [{ id: 'me-focus-step', skillIds: ['me-local-focus'] }],
  });
  expect(afterReimport.meRoutines.find((routine: { title: string }) => routine.title === 'me local routine'))
    .toEqual(localConflictRoutine('me', 'me-local-focus'));
  expect(afterReimport.mePlaylists[0]).toMatchObject({
    routineIds: [meRestoredRoutine.id],
    skillIds: ['me-local-focus'],
  });
  expect(alexReimportedRoutine).toMatchObject({
    id: alexRestoredRoutine.id,
    skillIds: ['alex-local-focus'],
    steps: [{ id: 'alex-focus-step', skillIds: ['alex-local-focus'] }],
  });
  expect(afterReimport.alexRoutines.find((routine: { title: string }) => routine.title === 'alex local routine'))
    .toEqual(localConflictRoutine('alex', 'alex-local-focus'));
  expect(afterReimport.alexPlaylists[0]).toMatchObject({
    routineIds: [alexRestoredRoutine.id],
    skillIds: ['alex-local-focus'],
  });
  expect(afterReimport.meSchedules[0].playlistOverride).toMatchObject({
    routineIds: [meRestoredRoutine.id],
    skillIds: ['me-local-focus'],
  });
  expect(afterReimport.alexSchedules[0].playlistOverride).toMatchObject({
    routineIds: [alexRestoredRoutine.id],
    skillIds: ['alex-local-focus'],
  });
});

test('all-profiles import adds profiles and merges saved history without replacing local records', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  const day = new Date().toISOString().slice(0, 10);
  const localThemeId = 'sandstone';
  const meThemeId = 'porcelain';
  const alexThemeId = 'nordic';
  const lowerAlexThemeId = 'slate';
  const caseyThemeId = 'linen';
  const localProfile = {
    id: 'me',
    name: 'Me',
    defaultRateSkillsAtPlaylistEnd: true,
    defaultPlaylistReminderSettings: { stepCompletion: false, routineCompletion: false },
    defaultSpeakRoutineDescription: true,
  };
  const caseyProfile = {
    id: 'casey',
    name: 'Alex',
    speechVoiceId: null,
    defaultRateSkillsAtPlaylistEnd: false,
    defaultPlaylistReminderSettings: { stepCompletion: false, routineCompletion: false },
    defaultSpeakRoutineDescription: false,
  };
  const caseyRoutine = { ...second, id: 'casey-routine', title: 'Casey morning' };
  const caseySkill = {
    id: 'casey-skill',
    name: 'Casey focus',
    ratings: [{
      id: 'casey-rating',
      rating: 6,
      ratedAt: `${day}T08:00:00.000Z`,
      routineTitle: 'Casey morning',
      note: 'Casey’s local reflection stays intact.',
    }],
  };
  const lowerAlexRoutine = {
    ...second,
    id: 'alex-lower-routine',
    title: 'Lowercase Alex routine',
    steps: [{ id: 'lowercase-step', title: 'Plan the next day', durationSeconds: 90 }],
  };
  const lowerAlexSkill = {
    id: 'alex-lower-skill',
    name: 'Planning',
    ratings: [{
      id: 'alex-lower-rating',
      rating: 7,
      ratedAt: `${day}T11:00:00.000Z`,
      routineTitle: 'Lowercase Alex routine',
      note: 'Lowercase Alex history remains separate.',
    }],
  };
  const incomingRoutine = {
    ...original,
    skillIds: ['backup-focus'],
    steps: [{ ...original.steps[0], skillIds: ['backup-focus'] }],
  };
  const incomingSkill = {
    id: 'backup-focus',
    name: 'Focus',
    ratings: [{
      id: 'backup-focus-rating',
      rating: 8,
      ratedAt: `${day}T12:00:00.000Z`,
      routineTitle: 'Morning Reset',
      note: 'Backup reflection stays with this profile.',
    }],
  };
  const localStorageSeed = {
    '@routine-flow/people': {
      version: 1,
      activePersonId: 'me',
      people: [localProfile, caseyProfile],
    },
    '@routine-flow/routines': [customized],
    '@routine-flow/progress': { [day]: { 'morning-reset:morning-water': true } },
    '@routine-flow/playlists': [],
    '@routine-flow/schedules': [],
    '@routine-flow/skills': [{
      id: 'local-focus',
      name: 'Focus',
      ratings: [{
        id: 'local-focus-rating',
        rating: 4,
        ratedAt: `${day}T09:00:00.000Z`,
        routineTitle: 'My own reset',
        note: 'Local reflection stays intact.',
      }],
    }],
    '@routine-flow/skill-rating-window': '3',
    '@routine-flow/appearance': localThemeId,
    '@routine-flow/person/casey/@routine-flow/routines': [caseyRoutine],
    '@routine-flow/person/casey/@routine-flow/progress': {
      [day]: { 'casey-routine:unpack': true },
    },
    '@routine-flow/person/casey/@routine-flow/playlists': [],
    '@routine-flow/person/casey/@routine-flow/schedules': [],
    '@routine-flow/person/casey/@routine-flow/skills': [caseySkill],
    '@routine-flow/person/casey/@routine-flow/skill-rating-window': '6',
    '@routine-flow/person/casey/@routine-flow/appearance': caseyThemeId,
  };
  const allPeopleBackup = JSON.stringify({
    format: 'routine-flow-all-people',
    version: 1,
    activePersonId: 'alex',
    people: [
      {
        profile: {
          ...localProfile,
          profileNumber: localProfile.id,
          defaultRateSkillsAtPlaylistEnd: false,
          defaultPlaylistReminderSettings: { stepCompletion: true, routineCompletion: true },
        },
        backup: {
          format: 'routine-flow-routines',
          version: 7,
          exportedAt: new Date().toISOString(),
          routines: [incomingRoutine],
          skills: [incomingSkill],
          progress: { [day]: { 'morning-reset:morning-water': true } },
          personData: {
            playlists: [{
              id: 'morning-list',
              title: 'Morning list',
              routineIds: ['morning-reset'],
              skillIds: ['backup-focus'],
              rateSkillsAtPlaylistEnd: true,
              reminderSettings: { stepCompletion: false, routineCompletion: false },
            }],
            schedules: [{
              id: 'morning-playlist-schedule',
              targetType: 'playlist',
              targetId: 'morning-list',
              targetTitle: 'Morning list',
              scheduledAt: '2090-06-01T09:00:00.000Z',
              reminder: true,
              alertOffsetsMinutes: [0],
              notificationId: 'old-playlist-device-notification',
              notifications: [{ id: 'old-playlist-device-notification', offsetMinutes: 0 }],
            }],
            selectedThemeId: meThemeId,
            skillRatingWindow: 7,
          },
        },
      },
      {
        profile: {
          id: 'alex',
          profileNumber: 'alex',
          name: 'Alex',
          defaultRateSkillsAtPlaylistEnd: true,
          defaultPlaylistReminderSettings: { stepCompletion: false, routineCompletion: true },
        },
        backup: {
          format: 'routine-flow-routines',
          version: 7,
          exportedAt: new Date().toISOString(),
          routines: [second],
          skills: [{
            id: 'alex-focus',
            name: 'Focus',
            ratings: [{
              id: 'alex-focus-rating',
              rating: 9,
              ratedAt: `${day}T10:00:00.000Z`,
              routineTitle: 'Travel Reset',
              note: 'Alex’s Focus reflection belongs only to Alex.',
            }],
          }],
          progress: { [day]: { 'travel-reset:unpack': true } },
          personData: {
            playlists: [{
              id: 'travel-list',
              title: 'Travel list',
              routineIds: ['travel-reset'],
              skillIds: ['alex-focus'],
              rateSkillsAtPlaylistEnd: true,
              reminderSettings: { stepCompletion: true, routineCompletion: false },
            }],
            schedules: [{
              id: 'travel-schedule',
              targetType: 'routine',
              targetId: 'travel-reset',
              targetTitle: 'Travel Reset',
              scheduledAt: '2090-06-01T10:00:00.000Z',
              reminder: true,
              alertOffsetsMinutes: [0],
              notificationId: 'old-device-notification',
              notifications: [{ id: 'old-device-notification', offsetMinutes: 0 }],
            }],
            selectedThemeId: alexThemeId,
            skillRatingWindow: 12,
          },
        },
      },
      {
        profile: {
          id: 'alex-lower',
          profileNumber: 'alex-lower',
          name: 'aLeX',
          defaultRateSkillsAtPlaylistEnd: false,
          defaultPlaylistReminderSettings: { stepCompletion: false, routineCompletion: false },
        },
        backup: {
          format: 'routine-flow-routines',
          version: 7,
          exportedAt: new Date().toISOString(),
          routines: [lowerAlexRoutine],
          skills: [lowerAlexSkill],
          progress: {},
          personData: {
            playlists: [],
            schedules: [],
            selectedThemeId: lowerAlexThemeId,
            skillRatingWindow: 4,
          },
        },
      },
    ],
  });
  await page.addInitScript(seed => {
    if (localStorage.getItem('@routine-flow/people') === null) {
      for (const [key, value] of Object.entries(seed)) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    }
  }, localStorageSeed);

  await page.goto('/');
  await expect(page.getByLabel('Open My own reset')).toBeVisible();
  const roundTripChooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('import-routines').click();
  await (await roundTripChooserPromise).setFiles({
    name: 'routine-flow-all-profiles.json',
    mimeType: 'application/json',
    buffer: Buffer.from(allPeopleBackup),
  });
  await expect(page.getByText('Restore 3 profiles?')).toBeVisible();
  await expect(page.getByText('“Alex” conflicts with an existing profile. Suggested name:', { exact: true })).toBeVisible();
  await expect(page.getByText('“aLeX” conflicts with an existing profile. Suggested name:', { exact: true })).toBeVisible();
  await expect(page.getByTestId('restore-profile-name-alex')).toHaveValue('Alex (imported)');
  await expect(page.getByTestId('restore-profile-name-alex-lower')).toHaveValue('aLeX (imported 2)');
  await page.getByTestId('restore-profile-name-alex').fill('Me');
  await expect(page.getByTestId('restore-profile-name-error')).toBeVisible();
  await expect(page.getByTestId('import-all-with-progress')).toBeDisabled();
  await page.getByTestId('restore-profile-name-alex').fill('Alex from backup');
  await expect(page.getByTestId('restore-profile-name-alex')).toHaveValue('Alex from backup');
  await expect(page.getByTestId('restore-profile-name-error')).toHaveCount(0);
  await page.getByTestId('import-all-with-progress').click();
  await expect(page.getByLabel('Active person: Alex from backup. Open people')).toBeVisible();
  await expect(page.getByLabel('Open Travel Reset')).toBeVisible();

  const restored = await page.evaluate(() => ({
    registry: JSON.parse(localStorage.getItem('@routine-flow/people') ?? 'null'),
    meRoutines: JSON.parse(localStorage.getItem('@routine-flow/routines') ?? '[]'),
    meProgress: JSON.parse(localStorage.getItem('@routine-flow/progress') ?? '{}'),
    meSkills: JSON.parse(localStorage.getItem('@routine-flow/skills') ?? '[]'),
    mePlaylists: JSON.parse(localStorage.getItem('@routine-flow/playlists') ?? '[]'),
    meSchedules: JSON.parse(localStorage.getItem('@routine-flow/schedules') ?? '[]'),
    meWindow: localStorage.getItem('@routine-flow/skill-rating-window'),
    meTheme: localStorage.getItem('@routine-flow/appearance'),
    alexRoutines: JSON.parse(localStorage.getItem('@routine-flow/person/alex/@routine-flow/routines') ?? '[]'),
    alexProgress: JSON.parse(localStorage.getItem('@routine-flow/person/alex/@routine-flow/progress') ?? '{}'),
    alexSkills: JSON.parse(localStorage.getItem('@routine-flow/person/alex/@routine-flow/skills') ?? '[]'),
    alexPlaylists: JSON.parse(localStorage.getItem('@routine-flow/person/alex/@routine-flow/playlists') ?? '[]'),
    alexSchedules: JSON.parse(localStorage.getItem('@routine-flow/person/alex/@routine-flow/schedules') ?? '[]'),
    alexWindow: localStorage.getItem('@routine-flow/person/alex/@routine-flow/skill-rating-window'),
    alexTheme: localStorage.getItem('@routine-flow/person/alex/@routine-flow/appearance'),
    caseyRoutines: JSON.parse(localStorage.getItem('@routine-flow/person/casey/@routine-flow/routines') ?? '[]'),
    caseyProgress: JSON.parse(localStorage.getItem('@routine-flow/person/casey/@routine-flow/progress') ?? '{}'),
    caseySkills: JSON.parse(localStorage.getItem('@routine-flow/person/casey/@routine-flow/skills') ?? '[]'),
    caseyTheme: localStorage.getItem('@routine-flow/person/casey/@routine-flow/appearance'),
    lowerAlexRoutines: JSON.parse(localStorage.getItem('@routine-flow/person/alex-lower/@routine-flow/routines') ?? '[]'),
    lowerAlexSkills: JSON.parse(localStorage.getItem('@routine-flow/person/alex-lower/@routine-flow/skills') ?? '[]'),
    lowerAlexTheme: localStorage.getItem('@routine-flow/person/alex-lower/@routine-flow/appearance'),
  }));

  expect(restored.registry.activePersonId).toBe('alex');
  expect(restored.registry.people).toHaveLength(4);
  expect(restored.registry.people.find((person: { id: string }) => person.id === 'casey')).toEqual(caseyProfile);
  expect(restored.registry.people.find((person: { id: string }) => person.id === 'alex')).toMatchObject({
    id: 'alex',
    name: 'Alex from backup',
  });
  expect(restored.registry.people.find((person: { id: string }) => person.id === 'alex-lower')).toMatchObject({
    id: 'alex-lower',
    name: 'aLeX (imported 2)',
  });
  expect(restored.registry.people.find((person: { id: string }) => person.id === 'me')).toMatchObject({
    defaultRateSkillsAtPlaylistEnd: false,
    defaultPlaylistReminderSettings: { stepCompletion: true, routineCompletion: true },
  });
  expect(restored.registry.people.find((person: { id: string }) => person.id === 'casey'))
    .toMatchObject({ defaultSpeakRoutineDescription: false });
  const localAndImported = restored.meRoutines as Array<{
    id: string;
    title: string;
    steps: Array<{ skillIds?: string[] }>;
  }>;
  expect(localAndImported.find(routine => routine.title === customized.title)).toEqual(customized);
  const mergedRoutine = localAndImported.find(routine => routine.title === original.title)!;
  expect(mergedRoutine.id).not.toBe(original.id);
  expect(mergedRoutine.steps[0].skillIds).toEqual(['local-focus']);
  expect(restored.meProgress[day]['morning-reset:morning-water']).toBe(true);
  expect(restored.meProgress[day][`${mergedRoutine.id}:morning-water`]).toBe(true);
  expect(restored.meSkills).toHaveLength(1);
  expect(restored.meSkills[0].id).toBe('local-focus');
  expect(restored.meSkills[0].name).toBe('Focus');
  expect(restored.meSkills[0].ratings.map((rating: { note: string }) => rating.note)).toEqual([
    'Local reflection stays intact.',
    'Backup reflection stays with this profile.',
  ]);
  expect(restored.mePlaylists[0].routineIds).toEqual([mergedRoutine.id]);
  expect(restored.mePlaylists[0].skillIds).toEqual(['local-focus']);
  expect(restored.meSchedules).toHaveLength(1);
  expect(restored.meSchedules[0]).toMatchObject({
    targetType: 'playlist',
    targetId: 'morning-list',
    reminder: false,
  });
  expect(restored.meSchedules[0].notificationId).toBeUndefined();
  expect(restored.meSchedules[0].notifications).toBeUndefined();
  expect(restored.meWindow).toBe('7');
  expect(restored.meTheme).toBe(meThemeId);
  expect(restored.alexRoutines.map((routine: { id: string }) => routine.id)).toEqual(['travel-reset']);
  expect(restored.alexProgress[day]['travel-reset:unpack']).toBe(true);
  expect(restored.alexSkills).toHaveLength(1);
  expect(restored.alexSkills[0]).toMatchObject({
    id: 'alex-focus',
    name: 'Focus',
    ratings: [{ id: 'alex-focus-rating', note: 'Alex’s Focus reflection belongs only to Alex.' }],
  });
  expect(restored.alexPlaylists[0].title).toBe('Travel list');
  expect(restored.alexWindow).toBe('12');
  expect(restored.alexTheme).toBe(alexThemeId);
  expect(restored.caseyRoutines).toEqual([caseyRoutine]);
  expect(restored.caseyProgress).toEqual({ [day]: { 'casey-routine:unpack': true } });
  expect(restored.caseySkills).toEqual([caseySkill]);
  expect(restored.caseyTheme).toBe(caseyThemeId);
  expect(restored.lowerAlexRoutines).toEqual([lowerAlexRoutine]);
  expect(restored.lowerAlexSkills).toEqual([lowerAlexSkill]);
  expect(restored.lowerAlexTheme).toBe(lowerAlexThemeId);
  expect(restored.alexSchedules).toHaveLength(1);
  expect(restored.alexSchedules[0]).toMatchObject({
    targetId: 'travel-reset',
    reminder: false,
  });
  expect(restored.alexSchedules[0].notificationId).toBeUndefined();
  expect(restored.alexSchedules[0].notifications).toBeUndefined();

  await page.reload();
  await expect(page.getByLabel('Active person: Alex from backup. Open people')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Themes' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('@routine-flow/person/alex/@routine-flow/appearance'))).toBe('nordic');

  await page.getByLabel('Active person: Alex from backup. Open people').click();
  await page.getByLabel('Switch to Me').click();
  await expect(page.getByLabel('Active person: Me. Open people')).toBeVisible();
  await page.reload();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('@routine-flow/appearance'))).toBe('porcelain');

  await page.getByLabel('Active person: Me. Open people').click();
  await page.getByTestId('person-switch-casey').click();
  await expect(page.getByLabel('Active person: Alex. Open people')).toBeVisible();
  await page.reload();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('@routine-flow/person/casey/@routine-flow/appearance'))).toBe('linen');

  await page.getByLabel('Active person: Alex. Open people').click();
  await page.getByTestId('person-switch-alex-lower').click();
  await expect(page.getByLabel('Active person: aLeX (imported 2). Open people')).toBeVisible();
  await expect(page.getByLabel('Open Lowercase Alex routine')).toBeVisible();
  await page.reload();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('@routine-flow/person/alex-lower/@routine-flow/appearance'))).toBe('slate');

  const profilesAfterReload = await page.evaluate(() => ({
    routines: JSON.parse(localStorage.getItem('@routine-flow/person/casey/@routine-flow/routines') ?? '[]'),
    progress: JSON.parse(localStorage.getItem('@routine-flow/person/casey/@routine-flow/progress') ?? '{}'),
    skills: JSON.parse(localStorage.getItem('@routine-flow/person/casey/@routine-flow/skills') ?? '[]'),
    theme: localStorage.getItem('@routine-flow/person/casey/@routine-flow/appearance'),
    lowerAlexRoutines: JSON.parse(localStorage.getItem('@routine-flow/person/alex-lower/@routine-flow/routines') ?? '[]'),
    lowerAlexSkills: JSON.parse(localStorage.getItem('@routine-flow/person/alex-lower/@routine-flow/skills') ?? '[]'),
    lowerAlexTheme: localStorage.getItem('@routine-flow/person/alex-lower/@routine-flow/appearance'),
  }));
  expect(profilesAfterReload).toEqual({
    routines: [caseyRoutine],
    progress: { [day]: { 'casey-routine:unpack': true } },
    skills: [caseySkill],
    theme: caseyThemeId,
    lowerAlexRoutines: [lowerAlexRoutine],
    lowerAlexSkills: [lowerAlexSkill],
    lowerAlexTheme: lowerAlexThemeId,
  });

  await page.getByRole('tab', { name: 'Today' }).click();
  const exportPromise = page.waitForEvent('download');
  await page.getByTestId('export-all-people-data').click();
  const exportedFile = await exportPromise;
  const exportedPath = await exportedFile.path();
  expect(exportedPath).not.toBeNull();
  const exportedContents = readFileSync(exportedPath!, 'utf8');
  const exported = JSON.parse(exportedContents);
  expect(exported.activePersonId).toBe('alex-lower');
  expect(exported.people.map((entry: { profile: { id: string; profileNumber: string } }) =>
    [entry.profile.id, entry.profile.profileNumber])).toEqual([
    ['me', 'me'], ['casey', 'casey'], ['alex', 'alex'], ['alex-lower', 'alex-lower'],
  ]);
  const exportedAlex = exported.people.find((entry: { profile: { id: string } }) => entry.profile.id === 'alex');
  expect(exportedAlex.profile).toMatchObject({
    id: 'alex',
    profileNumber: 'alex',
    name: 'Alex from backup',
  });
  expect(exportedAlex.backup.routines.map((routine: { id: string }) => routine.id)).toEqual(['travel-reset']);
  expect(exportedAlex.backup.skills[0]).toMatchObject({
    id: 'alex-focus',
    name: 'Focus',
    ratings: [{ id: 'alex-focus-rating', note: 'Alex’s Focus reflection belongs only to Alex.' }],
  });
  const exportedCasey = exported.people.find((entry: { profile: { id: string } }) => entry.profile.id === 'casey');
  expect(exportedCasey.profile).toMatchObject({ id: 'casey', profileNumber: 'casey', name: 'Alex' });
  expect(exportedCasey.backup.routines.map((routine: { id: string }) => routine.id)).toEqual(['casey-routine']);
  const exportedLowerAlex = exported.people.find((entry: { profile: { id: string } }) => entry.profile.id === 'alex-lower');
  expect(exportedLowerAlex.profile).toMatchObject({
    id: 'alex-lower',
    profileNumber: 'alex-lower',
    name: 'aLeX (imported 2)',
  });
  expect(exportedLowerAlex.backup.routines.map((routine: { id: string }) => routine.id)).toEqual(['alex-lower-routine']);
  expect(exportedLowerAlex.backup.skills[0].ratings[0].note).toBe('Lowercase Alex history remains separate.');

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('import-routines').click();
  await (await chooserPromise).setFiles({
    name: 'routine-flow-collision-round-trip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportedContents),
  });
  await expect(page.getByText('Restore 4 profiles?')).toBeVisible();
  await expect(page.getByTestId('restore-profile-name-alex')).toHaveCount(0);
  await expect(page.getByTestId('restore-profile-name-alex-lower')).toHaveCount(0);
  await page.getByTestId('import-all-profiles').click();
  await expect(page.getByText('Restore 4 profiles?')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Active person: aLeX (imported 2). Open people')).toBeVisible();

  const afterRoundTrip = await page.evaluate(() => ({
    registry: JSON.parse(localStorage.getItem('@routine-flow/people') ?? 'null'),
    meRoutines: JSON.parse(localStorage.getItem('@routine-flow/routines') ?? '[]'),
    meSkills: JSON.parse(localStorage.getItem('@routine-flow/skills') ?? '[]'),
    alexRoutines: JSON.parse(localStorage.getItem('@routine-flow/person/alex/@routine-flow/routines') ?? '[]'),
    alexSkills: JSON.parse(localStorage.getItem('@routine-flow/person/alex/@routine-flow/skills') ?? '[]'),
    caseyRoutines: JSON.parse(localStorage.getItem('@routine-flow/person/casey/@routine-flow/routines') ?? '[]'),
    caseySkills: JSON.parse(localStorage.getItem('@routine-flow/person/casey/@routine-flow/skills') ?? '[]'),
    lowerAlexRoutines: JSON.parse(localStorage.getItem('@routine-flow/person/alex-lower/@routine-flow/routines') ?? '[]'),
    lowerAlexSkills: JSON.parse(localStorage.getItem('@routine-flow/person/alex-lower/@routine-flow/skills') ?? '[]'),
  }));
  expect(afterRoundTrip.registry.activePersonId).toBe('alex-lower');
  expect(afterRoundTrip.registry.people).toHaveLength(4);
  expect(afterRoundTrip.registry.people.map((person: { id: string }) => person.id))
    .toEqual(['me', 'casey', 'alex', 'alex-lower']);
  expect(afterRoundTrip.registry.people.find((person: { id: string }) => person.id === 'alex')).toMatchObject({
    id: 'alex',
    name: 'Alex from backup',
  });
  expect(afterRoundTrip.meRoutines.map((routine: { id: string }) => routine.id)).toContain('morning-reset');
  expect(afterRoundTrip.meSkills).toHaveLength(1);
  expect(afterRoundTrip.meSkills[0]).toMatchObject({
    id: 'local-focus',
    name: 'Focus',
    ratings: [
      { id: 'local-focus-rating', note: 'Local reflection stays intact.' },
      { id: 'backup-focus-rating', note: 'Backup reflection stays with this profile.' },
    ],
  });
  expect(afterRoundTrip.alexRoutines.map((routine: { id: string }) => routine.id)).toContain('travel-reset');
  expect(afterRoundTrip.alexSkills).toHaveLength(1);
  expect(afterRoundTrip.alexSkills[0]).toMatchObject({
    id: 'alex-focus',
    name: 'Focus',
    ratings: [{ id: 'alex-focus-rating', note: 'Alex’s Focus reflection belongs only to Alex.' }],
  });
  expect(afterRoundTrip.caseyRoutines).toEqual([caseyRoutine]);
  expect(afterRoundTrip.caseySkills).toEqual([caseySkill]);
  expect(afterRoundTrip.registry.people.find((person: { id: string }) => person.id === 'alex-lower'))
    .toMatchObject({ id: 'alex-lower', name: 'aLeX (imported 2)' });
  expect(afterRoundTrip.lowerAlexRoutines).toEqual([lowerAlexRoutine]);
  expect(afterRoundTrip.lowerAlexSkills).toEqual([lowerAlexSkill]);

  await page.getByRole('tab', { name: 'Today' }).click();
  await page.getByLabel('Active person: aLeX (imported 2). Open people').click();
  await page.getByTestId('person-switch-alex').click();
  await expect(page.getByLabel('Active person: Alex from backup. Open people')).toBeVisible();
  await page.getByRole('tab', { name: 'Skills' }).click();
  await page.getByTestId('skill-rating-history-toggle-alex-focus').click();
  await expect(page.getByText('Alex’s Focus reflection belongs only to Alex.', { exact: true })).toBeVisible();
  await expect(page.getByText('Local reflection stays intact.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Backup reflection stays with this profile.', { exact: true })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Today' }).click();
  await page.getByLabel('Active person: Alex from backup. Open people').click();
  await page.getByTestId('person-switch-me').click();
  await expect(page.getByLabel('Active person: Me. Open people')).toBeVisible();
  await page.getByRole('tab', { name: 'Skills' }).click();
  await page.getByTestId('skill-rating-history-toggle-local-focus').click();
  await expect(page.getByText('Local reflection stays intact.', { exact: true })).toBeVisible();
  await expect(page.getByText('Backup reflection stays with this profile.', { exact: true })).toBeVisible();
  await expect(page.getByText('Alex’s Focus reflection belongs only to Alex.', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Today' }).click();

  const exportedMe = exported.people.find((entry: { profile: { id: string } }) => entry.profile.id === 'me');
  const acceptedSuggestionBackup = JSON.stringify({
    ...exported,
    activePersonId: 'restore-copy',
    people: [
      exportedMe,
      {
        ...exportedAlex,
        profile: {
          ...exportedAlex.profile,
          id: 'restore-copy',
          profileNumber: 'restore-copy',
          name: 'Alex from backup',
        },
      },
    ],
  });
  const acceptSuggestionChooser = page.waitForEvent('filechooser');
  await page.getByTestId('import-routines').click();
  await (await acceptSuggestionChooser).setFiles({
    name: 'routine-flow-accept-profile-name-suggestion.json',
    mimeType: 'application/json',
    buffer: Buffer.from(acceptedSuggestionBackup),
  });
  await expect(page.getByTestId('restore-profile-name-restore-copy')).toHaveValue('Alex from backup (imported)');
  await page.getByTestId('import-all-profiles').click();
  await expect(page.getByLabel('Active person: Alex from backup (imported). Open people')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Active person: Alex from backup (imported). Open people')).toBeVisible();
  const acceptedSuggestion = await page.evaluate(() => ({
    registry: JSON.parse(localStorage.getItem('@routine-flow/people') ?? 'null'),
    routines: JSON.parse(localStorage.getItem('@routine-flow/person/restore-copy/@routine-flow/routines') ?? '[]'),
    skills: JSON.parse(localStorage.getItem('@routine-flow/person/restore-copy/@routine-flow/skills') ?? '[]'),
  }));
  expect(acceptedSuggestion.registry.activePersonId).toBe('restore-copy');
  expect(acceptedSuggestion.registry.people.find((person: { id: string }) => person.id === 'restore-copy'))
    .toMatchObject({ id: 'restore-copy', name: 'Alex from backup (imported)' });
  expect(acceptedSuggestion.routines.map((routine: { id: string }) => routine.id)).toContain('travel-reset');
  expect(acceptedSuggestion.skills[0].ratings[0].note).toBe('Alex’s Focus reflection belongs only to Alex.');
});

test('cancelling an all-profiles import leaves every profile and reminder unchanged', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  const day = new Date().toISOString().slice(0, 10);
  type TestProfile = {
    id: string;
    name: string;
    defaultRateSkillsAtPlaylistEnd: boolean;
    defaultPlaylistReminderSettings: { stepCompletion: boolean; routineCompletion: boolean };
    defaultSpeakRoutineDescription: boolean;
  };
  const me: TestProfile = {
    id: 'me',
    name: 'Me',
    defaultRateSkillsAtPlaylistEnd: true,
    defaultPlaylistReminderSettings: { stepCompletion: false, routineCompletion: false },
    defaultSpeakRoutineDescription: false,
  };
  const alex: TestProfile = {
    id: 'alex',
    name: 'Alex',
    defaultRateSkillsAtPlaylistEnd: false,
    defaultPlaylistReminderSettings: { stepCompletion: true, routineCompletion: false },
    defaultSpeakRoutineDescription: true,
  };
  const taylor: TestProfile = {
    id: 'taylor',
    name: 'Taylor',
    defaultRateSkillsAtPlaylistEnd: true,
    defaultPlaylistReminderSettings: { stepCompletion: false, routineCompletion: false },
    defaultSpeakRoutineDescription: true,
  };
  const makeSchedule = (id: string, targetId: string, targetTitle: string, notificationId: string) => ({
    id,
    targetType: 'routine',
    targetId,
    targetTitle,
    scheduledAt: '2090-06-01T10:00:00.000Z',
    reminder: true,
    alertOffsetsMinutes: [0],
    notificationId,
    notifications: [{ id: notificationId, offsetMinutes: 0 }],
  });
  const localSchedules = [
    makeSchedule('me-schedule', 'morning-reset', 'My own reset', 'me-existing-native-reminder'),
    makeSchedule('alex-schedule', 'travel-reset', 'Travel Reset', 'alex-existing-native-reminder'),
  ];
  const storageSeed: Record<string, unknown> = {
    '@routine-flow/people': { version: 1, activePersonId: 'alex', people: [me, alex] },
    '@routine-flow/routines': [customized],
    '@routine-flow/progress': { [day]: { 'morning-reset:morning-water': false } },
    '@routine-flow/playlists': [{
      id: 'me-local-playlist',
      title: 'Me local playlist',
      routineIds: ['morning-reset'],
      skillIds: ['me-local-skill'],
      rateSkillsAtPlaylistEnd: false,
      reminderSettings: { stepCompletion: false, routineCompletion: true },
    }],
    '@routine-flow/schedules': [localSchedules[0]],
    '@routine-flow/skills': [{
      id: 'me-local-skill',
      name: 'Me local skill',
      ratings: [{
        id: 'me-local-rating',
        rating: 4,
        ratedAt: `${day}T08:00:00.000Z`,
        routineTitle: 'My own reset',
        note: 'Me local reflection.',
      }],
    }],
    '@routine-flow/skill-rating-window': '3',
    '@routine-flow/appearance': 'routine-flow',
    '@routine-flow/person/alex/@routine-flow/routines': [second],
    '@routine-flow/person/alex/@routine-flow/progress': { [day]: { 'travel-reset:unpack': true } },
    '@routine-flow/person/alex/@routine-flow/playlists': [{
      id: 'alex-local-playlist',
      title: 'Alex local playlist',
      routineIds: ['travel-reset'],
      skillIds: ['alex-local-skill'],
      rateSkillsAtPlaylistEnd: true,
      reminderSettings: { stepCompletion: true, routineCompletion: false },
    }],
    '@routine-flow/person/alex/@routine-flow/schedules': [localSchedules[1]],
    '@routine-flow/person/alex/@routine-flow/skills': [{
      id: 'alex-local-skill',
      name: 'Alex local skill',
      ratings: [{
        id: 'alex-local-rating',
        rating: 9,
        ratedAt: `${day}T09:00:00.000Z`,
        routineTitle: 'Travel Reset',
        note: 'Alex local reflection.',
      }],
    }],
    '@routine-flow/person/alex/@routine-flow/skill-rating-window': '12',
    '@routine-flow/person/alex/@routine-flow/appearance': 'routine-flow',
  };
  const makeBackupEntry = (profile: TestProfile, routine: typeof original, skillId: string) => ({
    profile: {
      ...profile,
      defaultRateSkillsAtPlaylistEnd: !profile.defaultRateSkillsAtPlaylistEnd,
      defaultPlaylistReminderSettings: { stepCompletion: true, routineCompletion: true },
    },
    backup: {
      format: 'routine-flow-routines',
      version: 7,
      exportedAt: new Date().toISOString(),
      routines: [routine],
      skills: [{
        id: skillId,
        name: `${profile.name} backup skill`,
        ratings: [{
          id: `${skillId}-rating`,
          rating: 7,
          ratedAt: `${day}T12:00:00.000Z`,
          routineTitle: routine.title,
          note: `${profile.name} backup reflection.`,
        }],
      }],
      progress: { [day]: { [`${routine.id}:${routine.steps[0].id}`]: true } },
      personData: {
        playlists: [{
          id: `${profile.id}-backup-playlist`,
          title: `${profile.name} backup playlist`,
          routineIds: [routine.id],
          skillIds: [skillId],
          rateSkillsAtPlaylistEnd: false,
          reminderSettings: { stepCompletion: false, routineCompletion: true },
        }],
        schedules: [makeSchedule(
          `${profile.id}-backup-schedule`, routine.id, routine.title, `${profile.id}-backup-native-reminder`,
        )],
        selectedThemeId: 'routine-flow',
        skillRatingWindow: 15,
      },
    },
  });
  const taylorRoutine = { ...second, id: 'taylor-routine', title: 'Taylor routine' };
  const allProfilesBackup = JSON.stringify({
    format: 'routine-flow-all-people',
    version: 1,
    activePersonId: 'taylor',
    people: [
      makeBackupEntry(me, original, 'me-backup-skill'),
      makeBackupEntry(alex, second, 'alex-backup-skill'),
      makeBackupEntry(taylor, taylorRoutine, 'taylor-backup-skill'),
    ],
  });

  await page.addInitScript(seed => {
    if (localStorage.getItem('@routine-flow/people') === null) {
      for (const [key, value] of Object.entries(seed)) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    }
  }, storageSeed);
  await page.goto('/');
  await expect(page.getByLabel('Active person: Alex. Open people')).toBeVisible();
  await expect(page.getByLabel('Open Travel Reset')).toBeVisible();
  const before = await storedRoutineFlowData(page);

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('import-routines').click();
  await (await chooserPromise).setFiles({
    name: 'routine-flow-all-profiles-to-cancel.json',
    mimeType: 'application/json',
    buffer: Buffer.from(allProfilesBackup),
  });
  await expect(page.getByText('Restore 3 profiles?')).toBeVisible();
  await page.getByTestId('cancel-all-profiles-import').click();
  await expect(page.getByText('Restore 3 profiles?')).toHaveCount(0);
  await expect(page.getByLabel('Active person: Alex. Open people')).toBeVisible();
  await expect(page.getByLabel('Open Travel Reset')).toBeVisible();

  const afterCancel = await storedRoutineFlowData(page);
  expect(afterCancel).toEqual(before);
  expect(JSON.parse(afterCancel['@routine-flow/person/alex/@routine-flow/schedules']!))
    .toEqual([localSchedules[1]]);
  expect(JSON.stringify(afterCancel)).not.toContain('taylor');
  expect(JSON.stringify(afterCancel)).not.toContain('backup-native-reminder');

  await page.reload();
  await expect(page.getByLabel('Active person: Alex. Open people')).toBeVisible();
  await expect(page.getByLabel('Open Travel Reset')).toBeVisible();
  const afterReload = await storedRoutineFlowData(page);
  expect(afterReload).toEqual(before);
  const registry = JSON.parse(afterReload['@routine-flow/people']!);
  expect(registry.activePersonId).toBe('alex');
  expect(registry.people.map((person: { id: string }) => person.id)).toEqual(['me', 'alex']);
  expect(JSON.parse(afterReload['@routine-flow/schedules']!)).toEqual([localSchedules[0]]);
});

async function storedRoutineFlowData(page: Page) {
  return page.evaluate(() => Object.fromEntries(
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith('@routine-flow/'))
      .sort(([left], [right]) => left.localeCompare(right)),
  ));
}

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
