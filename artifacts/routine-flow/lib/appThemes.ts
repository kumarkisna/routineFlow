import original from '../constants/colors';

export type AppColors = typeof original.light & { radius: number };
export type ThemeGroup = 'Classic' | 'Nature' | 'Warm' | 'Bright' | 'Night';
export type AppTheme = {
  id: string;
  name: string;
  group: ThemeGroup;
  scheme: 'light' | 'dark';
  colors: AppColors;
};
export const THEME_GROUPS: ThemeGroup[] = ['Classic', 'Nature', 'Warm', 'Bright', 'Night'];

function hsl(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      .toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(index => {
      const value = parseInt(hex.slice(index, index + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function onColor(background: string): string {
  return contrastRatio(background, '#ffffff') >= contrastRatio(background, '#101820')
    ? '#ffffff' : '#101820';
}

function readableAccent(hue: number, saturation: number, dark: boolean, backgrounds: string[]): string {
  let lightness = dark ? 68 : 38;
  let color = hsl(hue, saturation, lightness);
  while (backgrounds.some(background => contrastRatio(color, background) < 4.5) && lightness > 10 && lightness < 90) {
    lightness += dark ? 2 : -2;
    color = hsl(hue, saturation, lightness);
  }
  return color;
}

function palette(surfaceHue: number, accentHue: number, dark: boolean, saturation: number, highlight?: string, vibrant = false): AppColors {
  const background = hsl(surfaceHue, dark ? 23 : vibrant ? 65 : 24, dark ? 9 : vibrant ? 82 : 96);
  const card = hsl(surfaceHue, dark ? 21 : vibrant ? 60 : 24, dark ? 14 : vibrant ? 94 : 99);
  const foreground = hsl(surfaceHue, dark ? 12 : 23, dark ? 95 : 13);
  const secondary = hsl(surfaceHue, dark ? 19 : vibrant ? 50 : 24, dark ? 21 : vibrant ? 87 : 89);
  const mutedForeground = readableAccent(surfaceHue, 15, dark, [background, card]);
  const primary = readableAccent(accentHue, saturation, dark, [background, card]);
  const destructive = readableAccent(355, 63, dark, [background, card]);
  const success = readableAccent(148, 42, dark, [background, card]);
  const accent = highlight ?? hsl(accentHue + 36, 65, dark ? 67 : 68);
  const hero = hsl(surfaceHue, dark ? 28 : vibrant ? 80 : 32, dark ? 23 : vibrant ? 22 : 20);
  return {
    text: foreground, tint: primary, background, foreground,
    card, cardForeground: foreground,
    primary, primaryForeground: onColor(primary),
    secondary, secondaryForeground: foreground,
    muted: secondary, mutedForeground,
    accent, accentForeground: onColor(accent),
    destructive, destructiveForeground: onColor(destructive),
    border: hsl(surfaceHue, dark ? 15 : 19, dark ? 31 : 82),
    input: hsl(surfaceHue, dark ? 16 : 20, dark ? 39 : 75),
    hero, heroForeground: '#fffdf9',
    sage: hsl(148, 30, dark ? 58 : 66),
    sageSoft: hsl(148, dark ? 22 : 28, dark ? 20 : 91),
    coralSoft: hsl(accentHue, dark ? 27 : vibrant ? 65 : 40, dark ? 23 : vibrant ? 89 : 91),
    lavenderSoft: hsl(accentHue + 45, 25, dark ? 24 : 92),
    inkSoft: mutedForeground, success, radius: original.radius,
  };
}

// Hand-curated hue combinations; each choice supplies a complete semantic palette.
type Seed = [name: string, surfaceHue: number, accentHue: number, saturation?: number, highlight?: string, vibrant?: boolean];
const seeds: Record<ThemeGroup, Seed[]> = {
  Classic: [
    ['Routine Flow', 35, 8], ['Porcelain', 218, 215, 45], ['Linen', 38, 30, 48],
    ['Slate', 214, 208, 42], ['Navy', 220, 228, 60], ['Nordic', 196, 187, 46],
    ['Sandstone', 32, 22, 53], ['Pebble', 42, 205, 32], ['Graphite Light', 225, 232, 25],
    ['Cloud Blue', 207, 205, 65], ['Lavender Mist', 269, 271, 48], ['Rosewater', 344, 341, 52],
    ['Mint Paper', 151, 156, 48], ['Silver Sage', 132, 125, 30], ['Ocean Glass', 183, 194, 56],
  ],
  Nature: [
    ['Forest', 146, 142, 46], ['Fern', 115, 120, 46], ['Moss', 88, 87, 40],
    ['Olive Grove', 65, 71, 44], ['Eucalyptus', 160, 168, 42], ['Matcha', 96, 100, 38],
    ['Meadow', 128, 134, 55], ['Pine', 167, 153, 56], ['Seafoam', 172, 178, 52],
    ['Alpine', 201, 159, 45], ['Lagoon', 188, 181, 65], ['Riverstone', 205, 182, 32],
    ['Desert Sage', 48, 100, 31], ['Willow', 78, 151, 39], ['Rainforest', 155, 132, 66],
  ],
  Warm: [
    ['Terracotta', 18, 14, 59], ['Peach', 26, 19, 66], ['Apricot', 34, 27, 69],
    ['Honey', 45, 41, 76], ['Amber', 38, 35, 84], ['Saffron', 52, 47, 79],
    ['Sunset', 22, 350, 66], ['Rose Clay', 12, 354, 40], ['Cinnamon', 28, 18, 47],
    ['Cocoa', 24, 25, 34], ['Caramel', 37, 32, 62], ['Copper', 15, 23, 66],
    ['Blush', 353, 346, 58], ['Marigold', 56, 30, 80], ['Sand Dune', 43, 45, 36],
    ['Orange Blossom', 26, 24, 80, '#ff9843'], ['Burnt Orange', 22, 18, 72, '#e87524'],
    ['Saffron Gold', 46, 38, 86, '#ff9933'], ['Deep Saffron', 33, 30, 87, '#ff7f24'],
    ['Sunrise', 38, 18, 82, '#ffb74d'], ['Peach Sunrise', 16, 10, 70, '#ffb199'],
    ['Golden Sunrise', 50, 32, 88, '#ffc857'],
  ],
  Bright: [
    ['Coral Pop', 9, 5, 76], ['Cherry', 350, 357, 78], ['Raspberry', 335, 330, 74],
    ['Magenta', 310, 312, 76], ['Orchid', 289, 286, 65], ['Violet', 271, 265, 72],
    ['Indigo', 240, 245, 76], ['Cobalt', 219, 221, 82], ['Azure', 202, 202, 84],
    ['Cyan', 187, 187, 86], ['Teal Spark', 179, 174, 78], ['Lime', 84, 83, 76],
    ['Lemon', 59, 56, 85], ['Tangerine', 31, 25, 90], ['Electric Mint', 154, 149, 82],
    ['Vibrant Coral', 8, 5, 90, '#ff4f40', true],
    ['Electric Blue', 214, 220, 95, '#2684ff', true],
    ['Hot Pink', 326, 332, 86, '#ff2c94', true],
    ['Citrus Burst', 48, 32, 94, '#ffe000', true],
    ['Vivid Violet', 276, 274, 88, '#aa2cf2', true],
    ['Tropical Teal', 168, 176, 88, '#00e5bb', true],
  ],
  Night: [
    ['Midnight Navy', 225, 220, 68], ['Charcoal', 218, 208, 26], ['Obsidian', 245, 255, 24],
    ['Night Forest', 144, 136, 49], ['Deep Teal', 181, 171, 55], ['Plum Night', 289, 295, 53],
    ['Violet Dusk', 267, 263, 69], ['Burgundy', 345, 340, 56], ['Espresso', 27, 32, 48],
    ['Copper Night', 16, 24, 69], ['Moonstone', 237, 215, 32], ['Arctic Night', 203, 190, 69],
    ['Neon Blue', 222, 208, 88], ['Neon Rose', 328, 325, 82], ['Emerald Night', 156, 152, 68],
    ['Orange Glow', 26, 28, 82, '#ff942e'], ['Saffron Night', 36, 36, 83, '#ff9933'],
  ],
};

export const APP_THEMES: AppTheme[] = THEME_GROUPS.flatMap(group => seeds[group].map(
  ([name, surfaceHue, accentHue, saturation = 58, highlight, vibrant = false]) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name, group, scheme: group === 'Night' ? 'dark' as const : 'light' as const,
    colors: name === 'Routine Flow' ? { ...original.light, radius: original.radius }
      : palette(surfaceHue, accentHue, group === 'Night', saturation, highlight, vibrant),
  }),
));

export const DEFAULT_THEME_ID = 'routine-flow';
export function findAppTheme(id: string): AppTheme | undefined {
  return APP_THEMES.find(theme => theme.id === id);
}

export async function saveThemePreference(
  storage: { setItem: (key: string, value: string) => Promise<void>; getItem: (key: string) => Promise<string | null> },
  key: string, id: string,
): Promise<AppTheme> {
  const theme = findAppTheme(id);
  if (!theme) throw new Error('Theme not found.');
  try {
    await storage.setItem(key, id);
  } catch {
    // Preserve a confirmed write even if the storage promise rejected afterwards.
    try { if (await storage.getItem(key) === id) return theme; } catch { /* Report an unconfirmed save below. */ }
    throw new Error('Your theme could not be saved. Your previous appearance is still shown. Please try again.');
  }
  return theme;
}