import assert from 'node:assert/strict';
import test from 'node:test';
import original from '../constants/colors';
import {
  APP_THEMES,
  DEFAULT_THEME_ID,
  THEME_GROUPS,
  applyThemeCustomization,
  contrastRatio,
  createThemeCustomizationWriteQueue,
  defaultThemeCustomization,
  findAppTheme,
  migrateLegacyThemePreference,
  parseLegacyThemePreference,
  parseThemeCustomizationStore,
  saveThemeCustomizationStore,
  saveThemePreference,
  serializeThemeCustomizationStore,
  themeColorSwatches,
  updatePersonThemeOperationCount,
  updatePersonThemeSaveState,
  type PersonThemeOperations,
  type PersonThemeSaveState,
} from './appThemes';

test('the catalog contains 90 uniquely named themes, retaining the original families', () => {
  assert.equal(APP_THEMES.length, 90);
  assert.equal(new Set(APP_THEMES.map(theme => theme.id)).size, 90);
  assert.equal(new Set(APP_THEMES.map(theme => theme.name)).size, 90);
  const counts = { Classic: 15, Nature: 15, Warm: 22, Bright: 21, Night: 17 };
  for (const group of THEME_GROUPS) {
    assert.equal(APP_THEMES.filter(theme => theme.group === group).length, counts[group]);
  }
  assert.equal(APP_THEMES.filter(theme => theme.scheme === 'light').length, 73);
  assert.equal(APP_THEMES.filter(theme => theme.scheme === 'dark').length, 17);
});
test('each theme supplies all the existing color tokens and a distinct complete palette', () => {
  const palettes = new Set<string>();
  for (const theme of APP_THEMES) {
    for (const token of Object.keys(original.light)) {
      assert.match(theme.colors[token as keyof typeof original.light], /^#[0-9a-f]{6}$/i, `${theme.name} ${token}`);
    }
    assert.equal(theme.colors.radius, original.radius);
    palettes.add(JSON.stringify(theme.colors));
    assert.ok(contrastRatio(theme.colors.foreground, theme.colors.background) >= 4.5, theme.name);
    assert.ok(contrastRatio(theme.colors.cardForeground, theme.colors.card) >= 4.5, theme.name);
    assert.ok(contrastRatio(theme.colors.input, theme.colors.background) > 1, `${theme.name} input surface differs from screen`);
    const luminance = (hex: string) => [1, 3, 5].map(index => {
      const value = parseInt(hex.slice(index, index + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    assert.ok(luminance(theme.colors.input) > luminance(theme.colors.background), `${theme.name} input is lighter than screen`);
  }
  assert.equal(palettes.size, 90);
  assert.deepEqual(findAppTheme(DEFAULT_THEME_ID)?.colors, { ...original.light, radius: original.radius });
});
test('orange, saffron and sunrise additions include warm highlights and light/dark options', () => {
  for (const id of ['orange-blossom', 'burnt-orange', 'orange-glow', 'saffron-gold',
    'deep-saffron', 'saffron-night', 'sunrise', 'peach-sunrise', 'golden-sunrise']) {
    assert.ok(findAppTheme(id), id);
  }
  assert.equal(findAppTheme('saffron-gold')?.colors.accent, '#ff9933');
  assert.equal(findAppTheme('saffron-night')?.scheme, 'dark');
  assert.equal(findAppTheme('orange-glow')?.scheme, 'dark');
  for (const id of ['saffron', 'sunset', 'tangerine']) assert.ok(findAppTheme(id), id);
});
test('vibrant presets use strongly colored backgrounds as well as bright accents', () => {
  for (const id of ['vibrant-coral', 'electric-blue', 'hot-pink', 'citrus-burst', 'vivid-violet', 'tropical-teal']) {
    const theme = findAppTheme(id)!;
    assert.ok(theme, id);
    assert.equal(theme.group, 'Bright');
    const channels = [1, 3, 5].map(index => parseInt(theme.colors.background.slice(index, index + 2), 16));
    assert.ok(Math.max(...channels) - Math.min(...channels) > 30, `${id} has a colorful background`);
    assert.ok(contrastRatio(theme.colors.foreground, theme.colors.background) >= 4.5, id);
  }
});
test('new palettes have readable button, muted text, and semantic accent contrast', () => {
  // The original theme is kept unchanged; all new themes use contrast-aware tokens.
  for (const theme of APP_THEMES.filter(theme => theme.id !== DEFAULT_THEME_ID)) {
    const c = theme.colors;
    for (const [fg, bg] of [
      [c.primaryForeground, c.primary], [c.destructiveForeground, c.destructive],
      [c.accentForeground, c.accent], [c.heroForeground, c.hero],
      [c.mutedForeground, c.background], [c.primary, c.card], [c.success, c.background],
    ]) {
      assert.ok(contrastRatio(fg, bg) >= 4.5, `${theme.name}: ${fg} on ${bg}`);
    }
  }
});
test('unknown theme IDs are rejected without writing preferences', async () => {
  let written = false;
  const storage = { getItem: async () => null, setItem: async () => { written = true; } };
  assert.equal(findAppTheme('missing'), undefined);
  await assert.rejects(saveThemePreference(storage, 'key', 'missing'), /Theme not found/);
  assert.equal(written, false);
});
test('selection persists a stable ID that restores the same light or dark theme', async () => {
  let value: string | null = null;
  const storage = { getItem: async () => value, setItem: async (_key: string, next: string) => { value = next; } };
  for (const id of ['forest', 'midnight-navy', DEFAULT_THEME_ID]) {
    const selected = await saveThemePreference(storage, 'key', id);
    assert.equal(selected.id, id);
    assert.equal(findAppTheme((await storage.getItem())!)?.colors.background, selected.colors.background);
  }
});
test('failed preference writes keep the previous ID, while committed-but-rejected writes are reconciled', async () => {
  let value = DEFAULT_THEME_ID;
  const storage = {
    getItem: async () => value,
    setItem: async (_key: string, _next: string) => { throw new Error('Storage failed'); },
  };
  await assert.rejects(saveThemePreference(storage, 'key', 'forest'), /previous appearance is still shown/);
  assert.equal(value, DEFAULT_THEME_ID);
  storage.setItem = async (_key: string, next: string) => { value = next; throw new Error('Late rejection'); };
  assert.equal((await saveThemePreference(storage, 'key', 'forest')).id, 'forest');
});

test('custom palette tones and swatches keep semantic tokens complete and readable', () => {
  for (const base of APP_THEMES) {
    const swatches = themeColorSwatches(base.scheme, base.colors.primary);
    for (const tone of [0, 50, 100]) {
      for (const swatch of swatches) {
        const theme = applyThemeCustomization(base, {
          ...defaultThemeCustomization(base),
          tone,
          primary: swatch.color,
          accent: swatch.color,
        });
        for (const token of Object.keys(original.light)) {
          assert.match(theme.colors[token as keyof typeof original.light], /^#[0-9a-f]{6}$/i);
        }
        assert.ok(contrastRatio(theme.colors.foreground, theme.colors.background) >= 4.5, `${base.name} foreground`);
        assert.ok(contrastRatio(theme.colors.cardForeground, theme.colors.card) >= 4.5, `${base.name} card`);
        assert.ok(contrastRatio(theme.colors.primary, theme.colors.background) >= 4.5, `${base.name} primary`);
        assert.ok(contrastRatio(theme.colors.primaryForeground, theme.colors.primary) >= 4.5, `${base.name} primary text`);
        assert.ok(contrastRatio(theme.colors.accentForeground, theme.colors.accent) >= 4.5, `${base.name} accent text`);
      }
    }
  }
});

test('custom palette preferences serialize, validate, and restore by theme', async () => {
  let saved: string | null = null;
  const storage = {
    getItem: async () => saved,
    setItem: async (_key: string, value: string) => { saved = value; },
  };
  const customization = { tone: 72, primary: '#1657a8', accent: '#ff8a80' };
  const store = { forest: customization };
  await saveThemeCustomizationStore(storage, 'custom', store);
  assert.deepEqual(parseThemeCustomizationStore(await storage.getItem()), store);
  assert.equal(serializeThemeCustomizationStore(store), saved);
  assert.throws(() => parseThemeCustomizationStore('{"version":1,"themes":{"missing":{"tone":50,"primary":"#123456","accent":"#123456"}}}'), /invalid/);
  assert.throws(() => parseThemeCustomizationStore('{"version":1,"themes":{"forest":{"tone":101,"primary":"#123456","accent":"#123456"}}}'), /invalid/);
});

test('queued palette edits keep the latest confirmed colors visible and retry the newest choice', async () => {
  const initial = { tone: 50, primary: '#28653d', accent: '#a5c7ad' };
  const firstEdit = { tone: 65, primary: '#1657a8', accent: '#83b6ff' };
  const latestEdit = { tone: 82, primary: '#6633a8', accent: '#c6a6ff' };
  const otherProfile = { tone: 42, primary: '#006b68', accent: '#6fe2c1' };
  const rawByPerson = new Map([
    ['person-a', serializeThemeCustomizationStore({ forest: initial })],
    ['person-b', serializeThemeCustomizationStore({ forest: otherProfile })],
  ]);
  const confirmedByPerson = new Map([
    ['person-a', { forest: initial }],
    ['person-b', { forest: otherProfile }],
  ]);
  const visibleByPerson = new Map([
    ['person-a', { forest: initial }],
    ['person-b', { forest: otherProfile }],
  ]);
  const queue = createThemeCustomizationWriteQueue();
  let request = 0;
  let latestRequest = 0;
  let failedWrites = 0;
  let releaseFirstWrite!: () => void;
  let markFirstWriteStarted!: () => void;
  const firstWriteGate = new Promise<void>(resolve => { releaseFirstWrite = resolve; });
  const firstWriteStarted = new Promise<void>(resolve => { markFirstWriteStarted = resolve; });

  async function edit(personId: string, value: typeof initial) {
    const ownRequest = ++request;
    latestRequest = ownRequest;
    visibleByPerson.set(personId, { ...(visibleByPerson.get(personId) ?? {}), forest: value });
    try {
      await queue(personId, async () => {
        const next = { ...(confirmedByPerson.get(personId) ?? {}), forest: value };
        await saveThemeCustomizationStore({
          getItem: async () => rawByPerson.get(personId) ?? null,
          setItem: async (_key, serialized) => {
            if (personId === 'person-a' && failedWrites < 2) {
              const attempt = failedWrites++;
              if (attempt === 0) {
                markFirstWriteStarted();
                await firstWriteGate;
              }
              throw new Error('Storage unavailable');
            }
            rawByPerson.set(personId, serialized);
          },
        }, 'customizations', next);
        confirmedByPerson.set(personId, next);
        if (latestRequest === ownRequest) visibleByPerson.set(personId, next);
      });
    } catch (error) {
      if (latestRequest === ownRequest) visibleByPerson.set(personId, confirmedByPerson.get(personId)!);
      throw error;
    }
  }

  const firstSave = edit('person-a', firstEdit);
  await firstWriteStarted;
  const latestSave = edit('person-a', latestEdit);
  releaseFirstWrite();
  const otherProfileBefore = rawByPerson.get('person-b');
  const [firstResult, latestResult] = await Promise.allSettled([firstSave, latestSave]);
  assert.equal(firstResult.status, 'rejected');
  assert.equal(latestResult.status, 'rejected');
  assert.deepEqual(visibleByPerson.get('person-a'), { forest: initial });
  assert.equal(rawByPerson.get('person-b'), otherProfileBefore);
  assert.deepEqual(parseThemeCustomizationStore(rawByPerson.get('person-b')!), { forest: otherProfile });

  const retrySelection = latestEdit;
  await edit('person-a', retrySelection);
  assert.deepEqual(visibleByPerson.get('person-a'), { forest: latestEdit });
  assert.deepEqual(parseThemeCustomizationStore(rawByPerson.get('person-a')!), { forest: latestEdit });
  assert.equal(rawByPerson.get('person-b'), otherProfileBefore);
});

test('palette save errors and retries stay with their profile across interleaved failures', async () => {
  const initialA = { forest: { tone: 50, primary: '#28653d', accent: '#a5c7ad' } };
  const initialB = { forest: { tone: 50, primary: '#006b68', accent: '#6fe2c1' } };
  const choiceA = { tone: 72, primary: '#1657a8', accent: '#83b6ff' };
  const choiceB = { tone: 68, primary: '#6633a8', accent: '#c6a6ff' };
  const confirmed = new Map([['person-a', initialA], ['person-b', initialB]]);
  const raw = new Map([
    ['person-a', serializeThemeCustomizationStore(initialA)],
    ['person-b', serializeThemeCustomizationStore(initialB)],
  ]);
  const queue = createThemeCustomizationWriteQueue();
  const failOnce = new Set(['person-a', 'person-b']);
  let state: Record<string, PersonThemeSaveState> = {};
  let releaseA!: () => void;
  let firstAWriteStarted!: () => void;
  const aWriteGate = new Promise<void>(resolve => { releaseA = resolve; });
  const aWriteStarted = new Promise<void>(resolve => { firstAWriteStarted = resolve; });

  async function save(personId: string, customization: typeof choiceA) {
    state = updatePersonThemeSaveState(state, personId, {
      error: '',
      retry: { kind: 'customization', themeId: 'forest', customization },
    });
    try {
      await queue(personId, async () => {
        const next = { ...(confirmed.get(personId) ?? {}), forest: customization };
        await saveThemeCustomizationStore({
          getItem: async () => raw.get(personId) ?? null,
          setItem: async (_key, serialized) => {
            if (failOnce.has(personId)) {
              failOnce.delete(personId);
              if (personId === 'person-a') {
                firstAWriteStarted();
                await aWriteGate;
              }
              throw new Error(`${personId} storage unavailable`);
            }
            raw.set(personId, serialized);
          },
        }, 'custom', next);
        confirmed.set(personId, next);
      });
      state = updatePersonThemeSaveState(state, personId, { error: '', retry: null });
    } catch (error) {
      state = updatePersonThemeSaveState(state, personId, {
        error: error instanceof Error ? error.message : 'Palette save failed.',
      });
    }
  }

  const pendingA = save('person-a', choiceA);
  await aWriteStarted;
  await save('person-b', choiceB);
  assert.ok(state['person-b'].error);
  assert.equal(state['person-b'].retry?.kind, 'customization');
  releaseA();
  await pendingA;

  assert.ok(state['person-a'].error);
  assert.equal(state['person-a'].retry?.kind, 'customization');
  const retryA = state['person-a'].retry;
  const retryB = state['person-b'].retry;
  assert.equal(retryA?.kind, 'customization');
  assert.equal(retryB?.kind, 'customization');
  if (retryA?.kind === 'customization') assert.deepEqual(retryA.customization, choiceA);
  if (retryB?.kind === 'customization') assert.deepEqual(retryB.customization, choiceB);

  await save('person-a', choiceA);
  assert.equal(state['person-a'], undefined);
  assert.ok(state['person-b'].error);
  assert.deepEqual(parseThemeCustomizationStore(raw.get('person-a')!), { forest: choiceA });

  await save('person-b', choiceB);
  assert.deepEqual(state, {});
  assert.deepEqual(parseThemeCustomizationStore(raw.get('person-b')!), { forest: choiceB });
});

test('profile loading and saving indicators stay accurate when delayed saves finish out of order', async () => {
  let operations: PersonThemeOperations = {};
  operations = updatePersonThemeOperationCount(operations, 'person-a', 'loading', 1);
  operations = updatePersonThemeOperationCount(operations, 'person-b', 'loading', 1);
  operations = updatePersonThemeOperationCount(operations, 'person-a', 'loading', -1);
  assert.equal(operations['person-a'], undefined);
  assert.equal(operations['person-b']?.loading, 1);
  operations = updatePersonThemeOperationCount(operations, 'person-b', 'loading', -1);
  assert.deepEqual(operations, {});

  const raw = new Map([
    ['person-a', serializeThemeCustomizationStore({})],
    ['person-b', serializeThemeCustomizationStore({})],
  ]);
  const queue = createThemeCustomizationWriteQueue();
  const choice = { tone: 72, primary: '#1657a8', accent: '#83b6ff' };
  let releaseA!: () => void;
  let releaseB!: () => void;
  let startA!: () => void;
  let startB!: () => void;
  const gateA = new Promise<void>(resolve => { releaseA = resolve; });
  const gateB = new Promise<void>(resolve => { releaseB = resolve; });
  const startedA = new Promise<void>(resolve => { startA = resolve; });
  const startedB = new Promise<void>(resolve => { startB = resolve; });

  async function save(personId: 'person-a' | 'person-b') {
    operations = updatePersonThemeOperationCount(operations, personId, 'saving', 1);
    try {
      await queue(personId, async () => {
        await saveThemeCustomizationStore({
          getItem: async () => raw.get(personId) ?? null,
          setItem: async (_key, serialized) => {
            if (personId === 'person-a') {
              startA();
              await gateA;
            } else {
              startB();
              await gateB;
            }
            raw.set(personId, serialized);
          },
        }, 'custom', { forest: choice });
      });
    } finally {
      operations = updatePersonThemeOperationCount(operations, personId, 'saving', -1);
    }
  }

  const pendingA = save('person-a');
  const pendingB = save('person-b');
  await Promise.all([startedA, startedB]);
  releaseA();
  await pendingA;
  assert.equal(operations['person-a'], undefined);
  assert.equal(operations['person-b']?.saving, 1);

  releaseB();
  await pendingB;
  assert.deepEqual(operations, {});
  assert.deepEqual(parseThemeCustomizationStore(raw.get('person-a')!), { forest: choice });
  assert.deepEqual(parseThemeCustomizationStore(raw.get('person-b')!), { forest: choice });
});

test('legacy inline palette preferences migrate without losing other saved themes', async () => {
  const values = new Map<string, string>();
  const legacy = JSON.stringify({
    version: 1,
    themeId: 'forest',
    tone: 80,
    primaryColor: '#3867bd',
    accentColor: null,
  });
  const previous = { nordic: { tone: 65, primary: '#1657a8', accent: '#74b6d1' } };
  values.set('appearance', legacy);
  values.set('customizations', JSON.stringify({ version: 1, themes: previous }));
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
  };

  const parsed = parseLegacyThemePreference(legacy);
  assert.deepEqual(parsed, {
    themeId: 'forest',
    customization: {
      tone: 80,
      primary: '#3867bd',
      accent: findAppTheme('forest')!.colors.accent,
    },
  });
  assert.equal(await migrateLegacyThemePreference(storage, 'appearance', 'customizations', legacy), 'forest');
  assert.equal(await storage.getItem('appearance'), 'forest');
  assert.deepEqual(parseThemeCustomizationStore(await storage.getItem('customizations')), {
    ...previous,
    forest: parsed!.customization,
  });
  assert.equal(parseLegacyThemePreference('forest'), undefined);
  assert.equal(parseLegacyThemePreference('{"version":1,"themeId":"missing","tone":50,"primaryColor":null,"accentColor":null}'), undefined);
  await assert.rejects(
    migrateLegacyThemePreference(storage, 'appearance', 'customizations', 'not a saved theme'),
    /saved theme could not load/,
  );
});