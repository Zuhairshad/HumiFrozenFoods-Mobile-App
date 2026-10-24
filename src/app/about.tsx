import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppText, Button, Reveal, Screen, ScreenHeader, Surface } from '@/components/ui';
import type { IoniconName } from '@/components/ui/types';
import { products } from '@/data';
import { colors, gradients, gutter, radii, shadows, spacing } from '@/theme';

const VALUES: { icon: IoniconName; title: string; text: string }[] = [
  { icon: 'shield-checkmark-outline', title: '100% Halal', text: 'Every product is certified halal, from sourcing to the freezer bag.' },
  { icon: 'flag-outline', title: 'Made in Britain', text: 'Crafted in our UK kitchens to strict food-safety standards.' },
  { icon: 'book-outline', title: 'Traditional recipes', text: 'Family spice blends and hand-folded pastry, passed down generations.' },
  { icon: 'flash-outline', title: 'Modern convenience', text: 'Frozen at peak freshness so dinner is ready in minutes.' },
];

export default function AboutScreen() {
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/more'));
  const stats = [
    { value: `${products.length}+`, label: 'Products' },
    { value: '100%', label: 'Halal' },
    { value: '8 min', label: 'Avg prep' },
  ];

  return (
    <Screen contentContainerStyle={styles.content}>
      <ScreenHeader title="About Us" onBack={back} />
      <View style={styles.body}>
        <Reveal>
          <View style={styles.heroShadow}>
            <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <View style={styles.glow} />
              <AppText variant="overline" color="gold">
                Our story
              </AppText>
              <AppText variant="h1" color="white" style={styles.headline}>
                Tradition you can taste, ready when you are.
              </AppText>
              <AppText variant="body" color="tealSoft">
                Humi's brings the warmth of a home-cooked table to your freezer.
              </AppText>
            </LinearGradient>
          </View>
        </Reveal>

        <Reveal delay={80}>
          <Surface radius="lg" padded={spacing.xl}>
            <AppText variant="h3">Born in a British kitchen</AppText>
            <AppText variant="body" color="inkSoft" style={styles.para}>
              Humi's started with a simple idea: the snacks we grew up on, crisp samosas, sizzling kebabs and golden spring rolls, should never take hours to enjoy.
            </AppText>
            <AppText variant="body" color="inkSoft" style={styles.para}>
              Today we make every piece in the United Kingdom using halal-certified ingredients and traditional recipes, then flash-freeze it so it arrives at your door as fresh as the day it was folded. Straight from freezer to fryer, oven or air fryer, in minutes.
            </AppText>
          </Surface>
        </Reveal>

        <View style={styles.statsRow}>
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={140 + i * 70} style={styles.statWrap}>
              <Surface tone="teal" radius="lg" padded={spacing.lg} shadow="md">
                <AppText variant="h2" color="gold" align="center">
                  {s.value}
                </AppText>
                <AppText variant="caption" color="tealSoft" align="center">
                  {s.label}
                </AppText>
              </Surface>
            </Reveal>
          ))}
        </View>

        <AppText variant="h2" style={styles.sectionTitle}>
          What we stand for
        </AppText>
        <View style={styles.grid}>
          {VALUES.map((v, i) => (
            <Reveal key={v.title} delay={i * 80} style={styles.valueWrap}>
              <Surface radius="lg" padded={spacing.lg} style={styles.value}>
                <View style={styles.tile}>
                  <Ionicons name={v.icon} size={22} color={colors.goldDeep} />
                </View>
                <AppText variant="title" style={styles.valueTitle}>
                  {v.title}
                </AppText>
                <AppText variant="caption" color="muted">
                  {v.text}
                </AppText>
              </Surface>
            </Reveal>
          ))}
        </View>

        <Reveal>
          <Button title="Explore the range" icon="storefront-outline" variant="gold" fullWidth onPress={() => router.push('/(tabs)/shop')} />
        </Reveal>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.huge },
  body: { paddingHorizontal: gutter, gap: spacing.xl, paddingTop: spacing.sm },
  heroShadow: { borderRadius: radii.xl, ...shadows.lg },
  hero: { borderRadius: radii.xl, padding: spacing.xxl, gap: spacing.md, overflow: 'hidden' },
  glow: { position: 'absolute', top: -70, right: -60, width: 220, height: 220, borderRadius: radii.pill, backgroundColor: colors.gold, opacity: 0.16 },
  headline: { marginVertical: spacing.xs },
  para: { marginTop: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  statWrap: { flex: 1 },
  sectionTitle: { marginTop: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  valueWrap: { width: '48%', flexGrow: 1 },
  value: { flex: 1 },
  tile: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  valueTitle: { marginTop: spacing.md, marginBottom: spacing.xs },
});
