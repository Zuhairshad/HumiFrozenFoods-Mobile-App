/** Colour tokens v2 (DESIGN-V2 2.3). Screens read roles via `useTheme().c`; never import hex values. */

/** Brand constants, for gradients and the splash only. */
export const brand = {
  tealInk: '#08302F',
  tealDeep: '#0D4D4D',
  teal: '#125B64',
  gold: '#E5A83B',
} as const;

export const gradients = {
  hero: ['#08302F', '#0D4D4D', '#125B64'] as const,
  status: ['#08302F', '#125B64'] as const,
  scrimBottom: ['rgba(5,12,12,0)', 'rgba(5,12,12,0.78)'] as const,
  scrimTop: ['rgba(5,12,12,0.35)', 'rgba(5,12,12,0)'] as const,
};

export interface ColorRoles {
  background: string;
  groupedBackground: string;
  cell: string;
  elevated: string;
  fill: string;
  fillStrong: string;
  separator: string;
  separatorOpaque: string;
  label: string;
  labelSecondary: string;
  labelTertiary: string;
  labelQuaternary: string;
  tint: string;
  tintFill: string;
  tintPressed: string;
  tintSoft: string;
  onTint: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  destructive: string;
  success: string;
  scrim: string;
  glassTint: string;
  glassSolid: string;
}

export const lightColors: ColorRoles = {
  background: '#FFFFFF',
  groupedBackground: '#F2F4F3',
  cell: '#FFFFFF',
  elevated: '#FFFFFF',
  fill: 'rgba(16,26,26,0.06)',
  fillStrong: 'rgba(16,26,26,0.12)',
  separator: 'rgba(16,26,26,0.14)',
  separatorOpaque: '#D9DEDD',
  label: '#101A1A',
  labelSecondary: '#4A5857',
  labelTertiary: '#627070',
  labelQuaternary: '#8A9695',
  tint: '#125B64',
  tintFill: '#125B64',
  tintPressed: '#0D4D4D',
  tintSoft: 'rgba(18,91,100,0.10)',
  onTint: '#FFFFFF',
  accent: '#E5A83B',
  accentText: '#8A5F00',
  accentSoft: '#FBF1DC',
  destructive: '#C0392B',
  success: '#1E7F52',
  scrim: 'rgba(5,12,12,0.78)',
  glassTint: 'rgba(8,24,25,0.52)',
  glassSolid: 'rgba(14,27,27,0.94)',
};

export const darkColors: ColorRoles = {
  background: '#050C0C',
  groupedBackground: '#050C0C',
  cell: '#141F1F',
  elevated: '#1B2828',
  fill: 'rgba(255,255,255,0.10)',
  fillStrong: 'rgba(255,255,255,0.16)',
  separator: 'rgba(255,255,255,0.14)',
  separatorOpaque: '#2A3636',
  label: '#F2F6F6',
  labelSecondary: '#A8B6B5',
  labelTertiary: '#7F8E8D',
  labelQuaternary: '#566362',
  tint: '#4DB6C1',
  tintFill: '#1A7480',
  tintPressed: '#176B76',
  tintSoft: 'rgba(77,182,193,0.16)',
  onTint: '#FFFFFF',
  accent: '#E5A83B',
  accentText: '#E5A83B',
  accentSoft: 'rgba(229,168,59,0.16)',
  destructive: '#FF6B5B',
  success: '#4CC38A',
  scrim: 'rgba(5,12,12,0.78)',
  glassTint: 'rgba(8,24,25,0.52)',
  glassSolid: 'rgba(14,27,27,0.94)',
};

/** Fixed colours used on the dark glass tab bar and photo overlays (same in both schemes). */
export const onGlass = {
  iconActive: '#FFFFFF',
  iconInactive: 'rgba(255,255,255,0.62)',
  pill: 'rgba(255,255,255,0.16)',
  pillStroke: 'rgba(255,255,255,0.10)',
  stroke: 'rgba(255,255,255,0.16)',
  highlight: 'rgba(255,255,255,0.10)',
  badgeBorder: 'rgba(8,24,25,0.9)',
  badgeFill: '#C0392B',
} as const;

/** Append an alpha channel to a 6-digit hex colour (0..1). */
export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}
