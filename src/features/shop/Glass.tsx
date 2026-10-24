import { ReactNode } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors } from '@/theme';

interface GlassProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
  intensity?: number;
}

/** Blurred translucent surface; falls back to a flat tint on Android/web. */
export function Glass({ children, style, dark, intensity = 50 }: GlassProps) {
  const fallback = dark ? colors.glassDark : 'rgba(255,255,255,0.88)';
  return (
    <View style={[styles.base, dark ? styles.darkBorder : styles.lightBorder, style]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={intensity} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: fallback }]} />
      )}
      {Platform.OS === 'ios' ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(8,48,47,0.35)' : colors.glassLight }]} />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  lightBorder: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  darkBorder: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)' },
});
