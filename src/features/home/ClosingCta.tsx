import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { AppText, Button, Reveal } from '@/components/ui';
import { siteInfo } from '@/data';
import { gradients, gutter, radii, shadows, spacing } from '@/theme';

export function ClosingCta() {
  const router = useRouter();
  return (
    <View style={styles.outer}>
      <Reveal>
        <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.panel}>
          <AppText variant="overline" color="gold" align="center">
            Humi&apos;s Frozen Foods
          </AppText>
          <AppText variant="h1" color="white" align="center">
            Ready to Experience Authentic Taste?
          </AppText>
          <AppText variant="body" color="rgba(255,255,255,0.78)" align="center">
            Halal, handmade-style snacks that go from freezer to table in minutes.
          </AppText>
          <View style={styles.buttons}>
            <Button title="Shop Now" variant="gold" fullWidth iconRight="arrow-forward" onPress={() => router.push('/(tabs)/shop')} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Contact us"
              onPress={() => router.push('/contact')}
              style={({ pressed }) => [styles.outline, pressed && { opacity: 0.7 }]}
            >
              <AppText variant="title" color="white">
                Contact Us
              </AppText>
            </Pressable>
          </View>
        </LinearGradient>
      </Reveal>
      <View style={styles.footer}>
        <AppText variant="caption" color="muted" align="center">
          © {new Date().getFullYear()} Humi&apos;s Frozen Foods
        </AppText>
        <AppText variant="caption" color="muted" align="center">
          {siteInfo.address}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { paddingHorizontal: gutter, paddingTop: spacing.xxxl, gap: spacing.xxl },
  panel: { borderRadius: radii.xl, padding: spacing.xxl, gap: spacing.md, ...shadows.lg },
  buttons: { gap: spacing.md, marginTop: spacing.md },
  outline: {
    height: 52,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { gap: spacing.xs, paddingBottom: spacing.md },
});
