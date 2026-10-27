import { useMemo } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';

const IS_IOS = Platform.OS === 'ios';
/** iOS 26+ draws its own Liquid Glass header; older iOS needs the blur material. */
const HAS_LIQUID_HEADER = IS_IOS && Number.parseInt(String(Platform.Version), 10) >= 26;

/**
 * Native large-title header that collapses on scroll over a transparent header (design 3.7).
 * Shared by the per-tab stacks and the pushed screens in the root stack (Orders, Favourites, About...).
 */
export function useLargeTitleHeaderOptions() {
  const { c, isDark } = useTheme();
  return useMemo(
    () => ({
      headerShown: true,
      headerLargeTitleEnabled: IS_IOS,
      headerLargeTitleShadowVisible: false,
      headerShadowVisible: false,
      headerTransparent: IS_IOS,
      headerBlurEffect: IS_IOS && !HAS_LIQUID_HEADER ? (isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterial') : undefined,
      // Chevron only: the previous screen's title would otherwise show route names such as "(tabs)".
      // The back title is still read by VoiceOver, so give it a real word.
      headerBackButtonDisplayMode: 'minimal',
      headerBackTitle: 'Back',
      headerTintColor: c.tint,
      headerTitleStyle: { color: c.label },
      headerLargeTitleStyle: { color: c.label },
      headerStyle: IS_IOS ? undefined : { backgroundColor: c.background },
    }) as const,
    [c, isDark],
  );
}

/**
 * Per-tab native stack with a large-title header. Used by the Shop and Search tab layouts.
 * The index screen must be named "index".
 */
export function LargeTitleStack({ title }: { title: string }) {
  const { c } = useTheme();
  const header = useLargeTitleHeaderOptions();
  return (
    <Stack screenOptions={{ ...header, contentStyle: { backgroundColor: c.background } }}>
      <Stack.Screen name="index" options={{ title }} />
    </Stack>
  );
}
