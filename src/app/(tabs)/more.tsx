import { Linking, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Logo } from '@/components/brand';
import { AppText, Badge, PressableScale, Reveal, Screen } from '@/components/ui';
import type { IoniconName } from '@/components/ui/types';
import { siteInfo } from '@/data';
import { MenuGroup, MenuRow } from '@/features/more';
import { useFavoritesStore } from '@/store/favorites';
import { colors, gradients, gutter, radii, shadows, spacing } from '@/theme';

const SOCIALS: { key: 'instagram' | 'facebook' | 'tiktok'; icon: IoniconName; label: string }[] = [
  { key: 'instagram', icon: 'logo-instagram', label: 'Instagram' },
  { key: 'facebook', icon: 'logo-facebook', label: 'Facebook' },
  { key: 'tiktok', icon: 'logo-tiktok', label: 'TikTok' },
];

export default function MoreScreen() {
  const router = useRouter();
  const favCount = useFavoritesStore((s) => s.ids.length);
  const go = (href: Href) => () => router.push(href);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen tabs contentContainerStyle={styles.content}>
      <Reveal>
        <View style={styles.heroShadow}>
          <LinearGradient
            colors={gradients.hero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.glow} />
            <Logo size={52} light />
            <AppText variant="h3" color="cream" style={styles.tagline}>
              {siteInfo.tagline}
            </AppText>
            <View style={styles.badges}>
              <Badge label="Made in United Kingdom" tone="glass" icon="flag-outline" size="sm" />
              <Badge label="100% Halal" tone="gold" icon="shield-checkmark-outline" size="sm" />
            </View>
          </LinearGradient>
        </View>
      </Reveal>

      <Reveal delay={80}>
        <MenuGroup title="Your account">
          <MenuRow icon="bicycle-outline" title="Track Orders" subtitle="See where your order is" onPress={go('/track')} />
          <MenuRow
            icon="heart-outline"
            title="Favourites"
            subtitle="Products you love"
            badge={favCount > 0 ? String(favCount) : undefined}
            onPress={go('/favorites')}
            last
          />
        </MenuGroup>
      </Reveal>

      <Reveal delay={140}>
        <MenuGroup title="Humi's">
          <MenuRow icon="sparkles-outline" title="About Us" subtitle="Our story and values" onPress={go('/about')} />
          <MenuRow icon="chatbubbles-outline" title="Contact Us" subtitle="We'd love to hear from you" onPress={go('/contact')} />
          <MenuRow icon="business-outline" title="B2B / Wholesale" subtitle="Stock Humi's in your business" onPress={go('/b2b')} />
          <MenuRow icon="briefcase-outline" title="Apply as Sales Rep" subtitle="Earn with us" onPress={go('/b2b')} last />
        </MenuGroup>
      </Reveal>

      <Reveal delay={200}>
        <View style={styles.socialBlock}>
          <AppText variant="overline" color="muted">
            Follow us
          </AppText>
          <View style={styles.socialRow}>
            {SOCIALS.map((s) => (
              <PressableScale
                key={s.key}
                haptic
                accessibilityLabel={s.label}
                onPress={() => Linking.openURL(siteInfo.social[s.key]).catch(() => {})}
                style={styles.social}
              >
                <Ionicons name={s.icon} size={22} color={colors.teal} />
              </PressableScale>
            ))}
          </View>
        </View>
      </Reveal>

      <View style={styles.footer}>
        <AppText variant="caption" color="muted" align="center">
          {siteInfo.name} · Version {version}
        </AppText>
        <AppText variant="caption" color="placeholder" align="center">
          Made with care in the United Kingdom
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: spacing.lg, gap: spacing.xxl },
  heroShadow: { borderRadius: radii.xl, ...shadows.lg },
  hero: { borderRadius: radii.xl, padding: spacing.xxl, gap: spacing.lg, overflow: 'hidden' },
  glow: {
    position: 'absolute',
    top: -60,
    right: -50,
    width: 180,
    height: 180,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    opacity: 0.16,
  },
  tagline: { opacity: 0.92 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  socialBlock: { alignItems: 'center', gap: spacing.md },
  socialRow: { flexDirection: 'row', gap: spacing.lg },
  social: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  footer: { alignItems: 'center', gap: 2, paddingTop: spacing.sm },
});
