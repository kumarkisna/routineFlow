import assert from 'node:assert/strict';
import test from 'node:test';
import original from '../constants/colors';
import { APP_THEMES, DEFAULT_THEME_ID, THEME_GROUPS, contrastRatio, findAppTheme, saveThemePreference } from './appThemes';

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