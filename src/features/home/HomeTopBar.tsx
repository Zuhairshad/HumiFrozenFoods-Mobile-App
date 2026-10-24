import { memo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from '@/components/brand';
import { AppText, IconButton, PressableScale } from '@/components/ui';
import { useCart } from '@/hooks';
import { colors, gutter, radii, spacing } from '@/theme';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export const HomeTopBar = memo(function HomeTopBar() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { count } = useCart();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
      <View style={styles.row}>
        <View style={styles.brand}>
          <Logo size={34} light />
          <AppText variant="caption" color="rgba(255,255,255,0.8)">
            {greeting()}, let&apos;s eat well
          </AppText>
        </View>
        <IconButton
          icon="bag-outline"
          variant="glass"
          badge={count}
          accessibilityLabel="Open cart"
          onPress={() => router.push('/(tabs)/cart')}
        />
      </View>
      <PressableScale
        haptic
        accessibilityLabel="Search products"
        onPress={() => router.push('/(tabs)/shop')}
        style={styles.search}
      >
        {Platform.OS === 'android' ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassDark }]} />
        ) : (
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        )}
        <Ionicons name="search" size={18} color="rgba(255,255,255,0.85)" />
        <AppText variant="body" color="rgba(255,255,255,0.75)">
          Search samosas, kebabs, rolls…
        </AppText>
      </PressableScale>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: gutter, gap: spacing.md, zIndex: 5 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { gap: spacing.xs },
  search: {
    height: 48,
    borderRadius: radii.pill,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
});
