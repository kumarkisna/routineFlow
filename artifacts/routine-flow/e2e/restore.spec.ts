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

test('all-profiles import adds profiles and merges saved history without replacing local records', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  const day = new Date().toISOString().slice(0, 10);
  const localThemeId = 'sandstone';
  const meThemeId = 'porcelain';
  const alexThemeId = 'nordic';
  const caseyThemeId = 'linen';
  const localProfile = {
    id: 'me',
    name: 'Me',
    defaultRateSkillsAtPlaylistEnd: true,
    defaultPlaylistReminderSettings: { stepCompletion: false, routineCompletion: false },
  };
  const caseyProfile = {
    id: 'casey',
    name: 'Alex',
    defaultRateSkillsAtPlaylistEnd: false,
    defaultPlaylistReminderSettings: { stepCompletion: false, routineCompletion: false },
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
          progress: { [day]: { 'travel-reset:unpack': true } },
          personData: {
            playlists: [{
              id: 'travel-list',
              title: 'Travel list',
              routineIds: ['travel-reset'],
              skillIds: ['alex-calm'],
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
  await expect(page.getByText('Restore 2 profiles?')).toBeVisible();
  await page.getByTestId('import-all-with-progress').click();
  await expect(page.getByLabel('Active person: Alex (imported). Open people')).toBeVisible();
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
  }));

  expect(restored.registry.activePersonId).toBe('alex');
  expect(restored.registry.people).toHaveLength(3);
  expect(restored.registry.people.find((person: { id: string }) => person.id === 'casey')).toEqual(caseyProfile);
  expect(restored.registry.people.find((person: { id: string }) => person.id === 'alex')).toMatchObject({
    id: 'alex',
    name: 'Alex (imported)',
  });
  expect(restored.registry.people.find((person: { id: string }) => person.id === 'me')).toMatchObject({
    defaultRateSkillsAtPlaylistEnd: false,
    defaultPlaylistReminderSettings: { stepCompletion: true, routineCompletion: true },
  });
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
  expect(restored.alexSkills[0].ratings[0].note).toBe('Pause before the next step.');
  expect(restored.alexPlaylists[0].title).toBe('Travel list');
  expect(restored.alexWindow).toBe('12');
  expect(restored.alexTheme).toBe(alexThemeId);
  expect(restored.caseyRoutines).toEqual([caseyRoutine]);
  expect(restored.caseyProgress).toEqual({ [day]: { 'casey-routine:unpack': true } });
  expect(restored.caseySkills).toEqual([caseySkill]);
  expect(restored.caseyTheme).toBe(caseyThemeId);
  expect(restored.alexSchedules).toHaveLength(1);
  expect(restored.alexSchedules[0]).toMatchObject({
    targetId: 'travel-reset',
    reminder: false,
  });
  expect(restored.alexSchedules[0].notificationId).toBeUndefined();
  expect(restored.alexSchedules[0].notifications).toBeUndefined();

  await page.reload();
  await expect(page.getByLabel('Active person: Alex (imported). Open people')).toBeVisible();
  await page.getByRole('tab', { name: 'Themes' }).click();
  await expect(page.getByTestId('theme-summary')).toContainText('Active: Nordic');
  await page.reload();
  await expect(page.getByTestId('theme-summary')).toContainText('Active: Nordic');

  await page.getByRole('tab', { name: 'Today' }).click();
  await page.getByLabel('Active person: Alex (imported). Open people').click();
  await page.getByLabel('Switch to Me').click();
  await expect(page.getByLabel('Active person: Me. Open people')).toBeVisible();
  await page.getByRole('tab', { name: 'Themes' }).click();
  await expect(page.getByTestId('theme-summary')).toContainText('Active: Porcelain');
  await page.reload();
  await expect(page.getByTestId('theme-summary')).toContainText('Active: Porcelain');

  await page.getByRole('tab', { name: 'Today' }).click();
  await page.getByLabel('Active person: Me. Open people').click();
  await page.getByTestId('person-switch-casey').click();
  await expect(page.getByLabel('Active person: Alex. Open people')).toBeVisible();
  await page.getByRole('tab', { name: 'Themes' }).click();
  await expect(page.getByTestId('theme-summary')).toContainText('Active: Linen');
  await page.reload();
  await expect(page.getByTestId('theme-summary')).toContainText('Active: Linen');

  const caseyAfterReload = await page.evaluate(() => ({
    routines: JSON.parse(localStorage.getItem('@routine-flow/person/casey/@routine-flow/routines') ?? '[]'),
    progress: JSON.parse(localStorage.getItem('@routine-flow/person/casey/@routine-flow/progress') ?? '{}'),
    skills: JSON.parse(localStorage.getItem('@routine-flow/person/casey/@routine-flow/skills') ?? '[]'),
    theme: localStorage.getItem('@routine-flow/person/casey/@routine-flow/appearance'),
  }));
  expect(caseyAfterReload).toEqual({
    routines: [caseyRoutine],
    progress: { [day]: { 'casey-routine:unpack': true } },
    skills: [caseySkill],
    theme: caseyThemeId,
  });

  await page.getByRole('tab', { name: 'Today' }).click();
  const exportPromise = page.waitForEvent('download');
  await page.getByTestId('export-all-people-data').click();
  const exportedFile = await exportPromise;
  const exportedPath = await exportedFile.path();
  expect(exportedPath).not.toBeNull();
  const exportedContents = readFileSync(exportedPath!, 'utf8');
  const exported = JSON.parse(exportedContents);
  const exportedAlex = exported.people.find((entry: { profile: { id: string } }) => entry.profile.id === 'alex');
  expect(exportedAlex.profile).toMatchObject({
    id: 'alex',
    profileNumber: 'alex',
    name: 'Alex (imported)',
  });
  expect(exportedAlex.backup.routines.map((routine: { id: string }) => routine.id)).toEqual(['travel-reset']);
  expect(exportedAlex.backup.skills[0].ratings[0].note).toBe('Pause before the next step.');
  const exportedCasey = exported.people.find((entry: { profile: { id: string } }) => entry.profile.id === 'casey');
  expect(exportedCasey.profile).toMatchObject({ id: 'casey', profileNumber: 'casey', name: 'Alex' });
  expect(exportedCasey.backup.routines.map((routine: { id: string }) => routine.id)).toEqual(['casey-routine']);

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('import-routines').click();
  await (await chooserPromise).setFiles({
    name: 'routine-flow-collision-round-trip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportedContents),
  });
  await expect(page.getByText('Restore 3 profiles?')).toBeVisible();
  await page.getByTestId('import-all-profiles').click();
  await expect(page.getByText('Restore 3 profiles?')).toHaveCount(0);

  const afterRoundTrip = await page.evaluate(() => ({
    registry: JSON.parse(localStorage.getItem('@routine-flow/people') ?? 'null'),
    meRoutines: JSON.parse(localStorage.getItem('@routine-flow/routines') ?? '[]'),
    alexRoutines: JSON.parse(localStorage.getItem('@routine-flow/person/alex/@routine-flow/routines') ?? '[]'),
    alexSkills: JSON.parse(localStorage.getItem('@routine-flow/person/alex/@routine-flow/skills') ?? '[]'),
    caseyRoutines: JSON.parse(localStorage.getItem('@routine-flow/person/casey/@routine-flow/routines') ?? '[]'),
    caseySkills: JSON.parse(localStorage.getItem('@routine-flow/person/casey/@routine-flow/skills') ?? '[]'),
  }));
  expect(afterRoundTrip.registry.people).toHaveLength(3);
  expect(afterRoundTrip.registry.people.map((person: { id: string }) => person.id)).toEqual(['me', 'casey', 'alex']);
  expect(afterRoundTrip.registry.people.find((person: { id: string }) => person.id === 'alex')).toMatchObject({
    id: 'alex',
    name: 'Alex (imported)',
  });
  expect(afterRoundTrip.meRoutines.map((routine: { id: string }) => routine.id)).toContain('morning-reset');
  expect(afterRoundTrip.alexRoutines.map((routine: { id: string }) => routine.id)).toContain('travel-reset');
  expect(afterRoundTrip.alexSkills[0].ratings[0].note).toBe('Pause before the next step.');
  expect(afterRoundTrip.caseyRoutines).toEqual([caseyRoutine]);
  expect(afterRoundTrip.caseySkills).toEqual([caseySkill]);
});

test('cancelling an all-profiles import leaves every profile and reminder unchanged', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');
  const day = new Date().toISOString().slice(0, 10);
  type TestProfile = {
    id: string;
    name: string;
    defaultRateSkillsAtPlaylistEnd: boolean;
    defaultPlaylistReminderSettings: { stepCompletion: boolean; routineCompletion: boolean };
  };
  const me: TestProfile = {
    id: 'me',
    name: 'Me',
    defaultRateSkillsAtPlaylistEnd: true,
    defaultPlaylistReminderSettings: { stepCompletion: false, routineCompletion: false },
  };
  const alex: TestProfile = {
    id: 'alex',
    name: 'Alex',
    defaultRateSkillsAtPlaylistEnd: false,
    defaultPlaylistReminderSettings: { stepCompletion: true, routineCompletion: false },
  };
  const taylor: TestProfile = {
    id: 'taylor',
    name: 'Taylor',
    defaultRateSkillsAtPlaylistEnd: true,
    defaultPlaylistReminderSettings: { stepCompletion: false, routineCompletion: false },
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
