/**
 * Humi's Frozen Foods palette.
 * Brand values are sampled from humisfrozenfoods.com (computed styles):
 *   teal #125B64, deep teal #0D4D4D, gold #E5A83B, dark gold #D4A017, red #C0392B.
 * Neutrals are warmed up (cream instead of cold white/grey) to feel premium.
 */
export const colors = {
  // Brand
  teal: '#125B64',
  tealDeep: '#0D4D4D',
  tealInk: '#08302F', // darkest, for immersive backgrounds
  tealSoft: '#E3F0EF', // tinted surface
  tealMist: '#F0F7F6',
  gold: '#E5A83B',
  goldDeep: '#D4A017',
  goldSoft: '#FBF1DC',
  red: '#C0392B',
  redSoft: '#FBE9E6',
  green: '#2E9E6B', // success / halal / vegan accents

  // Neutrals (warm)
  cream: '#FAF7F1', // app background
  paper: '#FFFFFF', // cards
  sand: '#F1ECE2', // subtle fills
  line: '#E8E2D6', // hairlines
  ink: '#10201F', // primary text
  inkSoft: '#3C4A49', // secondary text
  muted: '#7A8685', // tertiary text
  placeholder: '#A3ADAC',

  // Utility
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(8,48,47,0.55)',
  glassLight: 'rgba(255,255,255,0.72)',
  glassDark: 'rgba(8,48,47,0.62)',
} as const;

export type ColorName = keyof typeof colors;

/** Gradients as [start, end(, mid)] tuples for expo-linear-gradient. */
export const gradients = {
  hero: ['#08302F', '#0D4D4D', '#125B64'] as const,
  gold: ['#F2C264', '#E5A83B', '#D4A017'] as const,
  scrimBottom: ['rgba(8,48,47,0)', 'rgba(8,48,47,0.88)'] as const,
  scrimTop: ['rgba(8,48,47,0.7)', 'rgba(8,48,47,0)'] as const,
  tealCard: ['#125B64', '#0D4D4D'] as const,
};
