import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { AppText, PressableScale, Reveal } from '@/components/ui';
import { siteInfo } from '@/data';
import { haptics } from '@/hooks';
import { colors, gradients, gutter, radii, shadows, spacing } from '@/theme';

export function PromoBanner() {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const onPress = () => {
    haptics.success();
    Clipboard.setStringAsync(siteInfo.promoCode).catch(() => {});
    setCopied(true);
    resetTimer.current = setTimeout(() => setCopied(false), 1600);
    router.push('/(tabs)/shop');
  };

  return (
    <Reveal style={styles.outer}>
      <PressableScale
        accessibilityLabel={`Use code ${siteInfo.promoCode} for ${siteInfo.promoPercent} percent off your first order`}
        onPress={onPress}
        style={styles.card}
      >
        <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Ionicons name="gift" size={120} color="rgba(8,48,47,0.08)" style={styles.watermark} />
        <AppText variant="overline" color="tealInk">
          First order treat
        </AppText>
        <AppText variant="h1" color="tealInk" style={styles.title}>
          Get {siteInfo.promoPercent}% off your first order
        </AppText>
        <View style={styles.row}>
          <View style={styles.code}>
            <Ionicons name={copied ? 'checkmark-circle' : 'pricetag'} size={14} color={colors.gold} />
            <AppText variant="label" color="white" style={styles.codeText}>
              {copied ? 'COPIED' : siteInfo.promoCode}
            </AppText>
          </View>
          <AppText variant="caption" color="tealInk" style={styles.note}>
            Free delivery over £{siteInfo.freeDeliveryThreshold}
          </AppText>
        </View>
      </PressableScale>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  outer: { paddingHorizontal: gutter, paddingTop: spacing.xxxl },
  card: { borderRadius: radii.xl, overflow: 'hidden', padding: spacing.xl, gap: spacing.sm, ...shadows.gold },
  watermark: { position: 'absolute', right: -10, top: -10 },
  title: { maxWidth: '85%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, flexWrap: 'wrap' },
  code: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.tealInk,
    paddingHorizontal: spacing.lg,
    height: 36,
    borderRadius: radii.pill,
  },
  codeText: { letterSpacing: 2 },
  note: { fontWeight: '600' },
});
