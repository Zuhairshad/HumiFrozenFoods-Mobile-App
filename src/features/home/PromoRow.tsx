import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { AppText, Icon, PressableScale } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { haptics } from '@/hooks/useHaptics';
import { PROMO_CODE, PROMO_PERCENT } from '@/lib/pricing';
import { useCartStore } from '@/store/cart';
import { useOrdersStore } from '@/store/orders';

/** First-order incentive. Hidden once the code is applied or any order exists. */
export const PromoRow = memo(function PromoRow() {
  const { c } = useTheme();
  const promoApplied = useCartStore((s) => s.promoApplied);
  const hasOrders = useOrdersStore((s) => s.orders.length > 0);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (promoApplied || hasOrders) return null;

  const copy = () => {
    Clipboard.setStringAsync(PROMO_CODE).catch(() => undefined);
    haptics.success();
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1200);
  };

  return (
    <View style={[styles.row, { backgroundColor: c.tintSoft }]}>
      <Icon name="tag" fill size={20} color={c.tint} />
      <AppText variant="subhead" numberOfLines={1} style={styles.text}>
        {`${PROMO_PERCENT}% off your first order`}
      </AppText>
      <PressableScale
        onPress={copy}
        haptic="none"
        accessibilityLabel={copied ? 'Code copied' : `Copy code ${PROMO_CODE}`}
        style={[styles.code, { backgroundColor: c.fill }]}
        hitSlop={6}
      >
        <AppText variant="footnoteStrong" maxScale={1.3}>
          {copied ? 'Copied' : PROMO_CODE}
        </AppText>
      </PressableScale>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    marginHorizontal: 20,
    marginTop: 24,
    minHeight: 52,
    borderRadius: 16,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  text: { flex: 1 },
  code: { height: 32, paddingHorizontal: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
