import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText, Reveal } from '@/components/ui';
import type { IoniconName } from '@/components/ui/types';
import { colors, gradients, gutter, radii, shadows, spacing } from '@/theme';

const ITEMS: { icon: IoniconName; title: string; caption: string }[] = [
  { icon: 'shield-checkmark', title: '100% Halal', caption: 'Certified & trusted' },
  { icon: 'bicycle', title: 'Fast Delivery', caption: 'Straight to your door' },
  { icon: 'ribbon', title: 'Premium Quality', caption: 'Made with real spice' },
  { icon: 'timer', title: 'Ready in Minutes', caption: 'Oven or air fryer' },
];

export function TrustStrip() {
  return (
    <View style={styles.outer}>
      <LinearGradient colors={gradients.tealCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.panel}>
        <View style={styles.grid}>
          {ITEMS.map((it, i) => (
            <Reveal key={it.title} delay={i * 90} style={styles.cell}>
              <View style={styles.iconWrap}>
                <Ionicons name={it.icon} size={22} color={colors.gold} />
              </View>
              <AppText variant="title" color="white" align="center">
                {it.title}
              </AppText>
              <AppText variant="caption" color="rgba(255,255,255,0.7)" align="center">
                {it.caption}
              </AppText>
            </Reveal>
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { paddingHorizontal: gutter, paddingTop: spacing.xxxl },
  panel: { borderRadius: radii.xl, padding: spacing.xl, ...shadows.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.xl },
  cell: { width: '50%', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(229,168,59,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(229,168,59,0.4)',
    marginBottom: spacing.xs,
  },
});
