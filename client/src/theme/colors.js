// Design tokens extracted from "Kalimni App Design.html".
//
// Theming works by MUTATING the single `colors` object (applyTheme) and
// remounting the app root (App.js keys the tree on the theme) — every style
// in the app is an inline object read at render time, so a remount
// re-evaluates all of them. No provider/hook refactor needed.
const LIGHT = {
  primary: '#29627E',
  primaryDark: '#1C4A61',
  ink: '#14313F',
  muted: '#5E7A88',
  faint: '#8FA6B2',
  body: '#3D5866',

  bg: '#F6FAFC',
  bgSoft: '#E7F0F5',
  bgChat: '#F0F5F8',
  card: '#FFFFFF',
  border: '#E2ECF2',
  inputBorder: '#D5E4EC',
  divider: '#EDF3F7',
  track: '#DCE9F0',

  online: '#6FCF97',
  success: '#3E9B6E',
  successBg: '#E2F3E9',
  warn: '#B07A2A',
  warnBg: '#F7EBD7',
  danger: '#E2574C',
  dangerDark: '#B0483C',
  dangerBg: '#F8E4E1',
  dangerBorder: '#F0D8D5',
  readTick: '#4FA3C7',

  tintBlue: ['#BFDCE5', '#8FBCCB'],
  tintGreen: ['#D8E8DC', '#A5C8AF'],
  tintPurple: ['#EDEAF6', '#B9B1DC'],
  tintSand: ['#F3E5D8', '#DDBB94'],
  purple: '#6C63A6',
};

// Navy-based dark counterpart. Same hue family, inverted lightness; the
// pastel gradients/avatars stay as-is (content art reads fine on dark).
const DARK = {
  ...LIGHT,
  primary: '#5E9CBD',
  primaryDark: '#8FC2DD',
  ink: '#E8F1F5',
  muted: '#93ACB9',
  faint: '#6B8493',
  body: '#C4D6DF',

  bg: '#0E1B22',
  bgSoft: '#16303C',
  bgChat: '#122630',
  card: '#15242D',
  border: '#223944',
  inputBorder: '#2A4450',
  divider: '#1B303A',
  track: '#24404D',

  successBg: '#173226',
  warn: '#D6A052',
  warnBg: '#33270F',
  dangerBg: '#3A1F1B',
  dangerBorder: '#54302B',
  readTick: '#6FC0E4',
  purple: '#A79EDC',
};

// The single object every component reads. Mutated in place by applyTheme.
export const colors = { ...LIGHT };

let activeTheme = 'light';
export const currentTheme = () => activeTheme;

export function applyTheme(mode) {
  activeTheme = mode === 'dark' ? 'dark' : 'light';
  Object.assign(colors, activeTheme === 'dark' ? DARK : LIGHT);
}

// Deterministic avatar palette (bg, fg) keyed by name hash — mirrors the
// pastel avatars in the mockups.
const AVATAR_PALETTE = [
  ['#BFDCE5', '#1C4A61'],
  ['#D8E8DC', '#3E6B4F'],
  ['#EDEAF6', '#6C63A6'],
  ['#F3DFDB', '#A05648'],
  ['#F3E5D8', '#8A6A3B'],
];

export function avatarColors(name = '?') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function severityColors(level) {
  switch (level) {
    case 'minimal':
      return { fg: colors.success, bg: colors.successBg };
    case 'mild':
      return { fg: '#3E6B4F', bg: '#D8E8DC' };
    case 'moderate':
      return { fg: colors.warn, bg: colors.warnBg };
    default:
      return { fg: colors.dangerDark, bg: colors.dangerBg };
  }
}
