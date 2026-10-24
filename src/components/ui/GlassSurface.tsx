import { BlurView, BlurTint } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { ReactNode } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useReduceTransparency } from '@/theme/a11y';
import { onGlass } from '@/theme/colors';
import { radius as radiusStyle } from '@/theme/layout';

export interface GlassSurfaceProps {
  children?: ReactNode;
  /** Corner radius in points (continuous). Default 20. */
  radius?: number;
  /** `dark` = brand dark glass (tab bar, Today info bar); `light` = light material; `adaptive` follows the scheme. */
  tone?: 'dark' | 'light' | 'adaptive';
  interactive?: boolean;
  /**
   * Never use live blur: render a semi-transparent solid (list items, buttons in lists; 7.5.4).
   * Not part of 6.2 but additive.
   */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
}

let glassSupport: boolean | null = null;
function hasLiquidGlass(): boolean {
  if (glassSupport === null) {
    try {
      glassSupport = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
    } catch {
      glassSupport = false;
    }
  }
  return glassSupport;
}

/**
 * Owns the glass decision (3.4): iOS 26 GlassView -> BlurView+tint+hairline (iOS < 26, web)
 * -> solid (Android, Reduce Transparency, `flat`). Shadows must be applied by a wrapper
 * (this view clips its children). Do not put opacity < 1 on this view or its parents.
 */
export function GlassSurface({ children, radius = 20, tone = 'adaptive', interactive = false, flat = false, style }: GlassSurfaceProps) {
  const { c, isDark, scheme } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const dark = tone === 'dark' || (tone === 'adaptive' && isDark);
  const shape: ViewStyle = { ...radiusStyle(radius), overflow: 'hidden' };
  const stroke = dark ? onGlass.stroke : c.separator;

  if (flat || reduceTransparency || Platform.OS === 'android') {
    let bg: string;
    if (reduceTransparency) bg = dark ? c.glassSolid : c.elevated;
    else if (tone === 'dark') bg = 'rgba(14,27,27,0.78)';
    else bg = dark ? 'rgba(20,31,31,0.78)' : 'rgba(255,255,255,0.78)';
    return (
      <View style={[shape, { backgroundColor: bg, borderWidth: StyleSheet.hairlineWidth, borderColor: stroke }, style]}>
        {children}
      </View>
    );
  }

  if (hasLiquidGlass()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive={interactive}
        tintColor={tone === 'dark' ? c.glassTint : undefined}
        colorScheme={tone === 'dark' ? 'dark' : tone === 'light' ? 'light' : scheme}
        style={[shape, style]}
      >
        {children}
      </GlassView>
    );
  }

  const tint: BlurTint = tone === 'dark' ? 'systemChromeMaterialDark' : dark ? 'systemThinMaterialDark' : 'systemThinMaterialLight';
  return (
    <View style={[shape, { borderWidth: StyleSheet.hairlineWidth, borderColor: stroke }, style]}>
      <BlurView tint={tint} intensity={tone === 'dark' ? 90 : 80} style={StyleSheet.absoluteFill} />
      {tone === 'dark' ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.glassTint }]} /> : null}
      {tone === 'dark' ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 14, right: 14, height: 1, backgroundColor: onGlass.highlight }}
        />
      ) : null}
      {children}
    </View>
  );
}
