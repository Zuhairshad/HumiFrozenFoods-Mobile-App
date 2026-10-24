import { Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { colors, radii } from '@/theme';
import { AppText } from './AppText';
import type { IoniconName } from './types';

type Tone = 'gold' | 'teal' | 'red' | 'green' | 'glass' | 'sand';

export interface BadgeProps {
  label: string;
  tone?: Tone;
  icon?: IoniconName;
  size?: 'sm' | 'md';
}

const TONES: Record<Tone, { bg: string; fg: string }> = {
  gold: { bg: colors.gold, fg: colors.tealInk },
  teal: { bg: colors.teal, fg: colors.white },
  red: { bg: colors.red, fg: colors.white },
  green: { bg: colors.green, fg: colors.white },
  glass: { bg: 'rgba(255,255,255,0.22)', fg: colors.white },
  sand: { bg: colors.sand, fg: colors.inkSoft },
};

export function Badge({ label, tone = 'gold', icon, size = 'md' }: BadgeProps) {
  const t = TONES[tone];
  const small = size === 'sm';
  return (
    <View
      style={[
        styles.badge,
        small ? styles.sm : styles.md,
        { backgroundColor: t.bg },
        tone === 'glass' && styles.glass,
      ]}
    >
      {tone === 'glass' && Platform.OS === 'ios' ? (
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null}
      {icon ? <Ionicons name={icon} size={small ? 10 : 12} color={t.fg} /> : null}
      <AppText
        variant="overline"
        color={t.fg}
        style={small ? styles.textSm : styles.textMd}
        numberOfLines={1}
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: radii.pill, gap: 4 },
  sm: { paddingHorizontal: 8, height: 20 },
  md: { paddingHorizontal: 10, height: 26 },
  glass: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.35)' },
  textSm: { fontSize: 9, lineHeight: 12, letterSpacing: 1 },
  textMd: { fontSize: 10, lineHeight: 13, letterSpacing: 1.2 },
});
