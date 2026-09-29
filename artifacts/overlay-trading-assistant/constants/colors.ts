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
    text: '#F5F7FB',
    tint: '#73D2B5',
    background: '#09111E',
    foreground: '#F5F7FB',
    card: '#111D2C',
    cardForeground: '#F5F7FB',
    primary: '#73D2B5',
    primaryForeground: '#09111E',
    secondary: '#1A293B',
    secondaryForeground: '#DCE6F1',
    muted: '#142236',
    mutedForeground: '#8999AC',
    accent: '#E7A45C',
    accentForeground: '#09111E',
    destructive: '#F06D6A',
    destructiveForeground: '#FFFFFF',
    border: '#22344A',
    input: '#1C2C3F',
    surfaceStrong: '#0E1928',
    green: '#73D2B5',
    red: '#F06D6A',
    amber: '#E7A45C',
    blue: '#75A9E8',
    grid: '#182A3E',
  },
  radius: 16,
};

export default colors;
