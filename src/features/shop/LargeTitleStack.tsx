import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';

const IS_IOS = Platform.OS === 'ios';
/** iOS 26+ draws its own Liquid Glass header; older iOS needs the blur material. */
const HAS_LIQUID_HEADER = IS_IOS && Number.parseInt(String(Platform.Version), 10) >= 26;

/**
 * Per-tab native stack: large title that collapses on scroll over a transparent header
 * (design 3.7). Used by the Shop and Search tab layouts. The index screen must be named "index".
 */
export function LargeTitleStack({ title }: { title: string }) {
  const { c, isDark } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: IS_IOS,
        headerLargeTitleShadowVisible: false,
        headerShadowVisible: false,
        headerTransparent: IS_IOS,
        headerBlurEffect: IS_IOS && !HAS_LIQUID_HEADER ? (isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterial') : undefined,
        headerTintColor: c.tint,
        headerTitleStyle: { color: c.label },
        headerLargeTitleStyle: { color: c.label },
        headerStyle: IS_IOS ? undefined : { backgroundColor: c.background },
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Screen name="index" options={{ title }} />
    </Stack>
  );
}
