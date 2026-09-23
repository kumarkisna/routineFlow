/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#17202e',
    tint: '#e66b5d',

    background: '#f7f4ef',
    foreground: '#17202e',

    card: '#fffdf9',
    cardForeground: '#17202e',

    primary: '#e66b5d',
    primaryForeground: '#ffffff',

    secondary: '#ece8df',
    secondaryForeground: '#394352',

    muted: '#ebe7df',
    mutedForeground: '#77808d',

    accent: '#f5c66b',
    accentForeground: '#6d4a16',

    destructive: '#c94f55',
    destructiveForeground: '#ffffff',

    border: '#e2ddd3',
    input: '#d8d2c8',

    hero: '#27384b',
    heroForeground: '#fffaf2',
    sage: '#8fae9a',
    sageSoft: '#e1ebe2',
    coralSoft: '#f9dfd8',
    lavenderSoft: '#e7e1ee',
    inkSoft: '#526071',
    success: '#4f8b69',
  },

  radius: 8,
};

export default colors;
