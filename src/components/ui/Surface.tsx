import { ReactNode } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radii, shadows, spacing } from '@/theme';

export interface SurfaceProps {
  children: ReactNode;
  tone?: 'paper' | 'glass' | 'teal' | 'sand' | 'dark';
  padded?: boolean | number;
  radius?: keyof typeof radii;
  shadow?: 'sm' | 'md' | 'lg' | false;
  style?: StyleProp<ViewStyle>;
}

const BG: Record<NonNullable<SurfaceProps['tone']>, string> = {
  paper: colors.paper,
  glass: Platform.OS === 'ios' ? 'rgba(255,255,255,0.55)' : colors.glassLight,
  teal: colors.teal,
  sand: colors.sand,
  dark: colors.tealInk,
};

export function Surface({
  children,
  tone = 'paper',
  padded = true,
  radius = 'lg',
  shadow = 'sm',
  style,
}: SurfaceProps) {
  const padding = padded === true ? spacing.lg : padded === false ? 0 : padded;
  const r = radii[radius];
  const gradient =
    tone === 'teal' ? gradients.tealCard : tone === 'dark' ? ([colors.tealInk, colors.tealDeep] as const) : null;

  return (
    <View
      style={[
        { backgroundColor: BG[tone], borderRadius: r },
        shadow ? shadows[shadow] : null,
        tone === 'glass' && styles.glassBorder,
        style,
      ]}
    >
      {/* Clipping layer for backgrounds so the shadow on the outer view is not cut off. */}
      <View style={[StyleSheet.absoluteFill, { borderRadius: r, overflow: 'hidden' }]} pointerEvents="none">
        {gradient ? (
          <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        ) : null}
        {tone === 'glass' && Platform.OS !== 'android' ? (
          <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />
        ) : null}
      </View>
      <View style={{ padding }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  glassBorder: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.7)' },
});
