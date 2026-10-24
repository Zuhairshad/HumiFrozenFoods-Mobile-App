import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Badge, Divider, FadeImage, PressableScale, Surface } from '@/components/ui';
import { formatDate, formatPrice } from '@/lib';
import type { Order } from '@/types';
import { colors, radii, spacing } from '@/theme';
import { OrderTimeline } from './OrderTimeline';
import { deriveStatus, STATUS_COPY, STEPS, stepIndex } from './status';

export function OrderCard({ order, initiallyOpen = false, highlight = false }: { order: Order; initiallyOpen?: boolean; highlight?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const status = deriveStatus(order, now);
  const label = STEPS[stepIndex(status)].label;
  const units = order.lines.reduce((n, l) => n + l.quantity, 0);

  return (
    <Surface padded={spacing.lg} radius="lg" shadow={highlight ? 'md' : 'sm'} style={highlight ? styles.highlight : undefined}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <AppText variant="h3">{order.id}</AppText>
          <AppText variant="caption" color="muted">
            {formatDate(order.placedAt)} · {units} {units === 1 ? 'item' : 'items'} · {formatPrice(order.total)}
          </AppText>
        </View>
        <Badge label={label} tone={status === 'delivered' ? 'green' : 'gold'} size="sm" />
      </View>

      <OrderTimeline status={status} />
      <AppText variant="caption" color="inkSoft" align="center" style={styles.copy}>
        {STATUS_COPY[status]}
      </AppText>

      <Divider />
      <PressableScale onPress={() => setOpen((o) => !o)} haptic scaleTo={0.98} accessibilityLabel="Toggle order items">
        <View style={styles.toggle}>
          <AppText variant="label" color="teal">
            {open ? 'Hide items' : 'View items'}
          </AppText>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.teal} />
        </View>
      </PressableScale>

      {open ? (
        <View style={styles.lines}>
          {order.lines.map((l) => (
            <View key={l.productId} style={styles.line}>
              <FadeImage uri={l.image} style={styles.thumb} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {l.name}
                </AppText>
                <AppText variant="caption" color="muted">
                  {l.quantity} × {formatPrice(l.price)}
                </AppText>
              </View>
              <AppText variant="bodyStrong">{formatPrice(l.price * l.quantity)}</AppText>
            </View>
          ))}
          <Divider />
          <View style={styles.sumRow}>
            <AppText variant="caption" color="muted">Delivery</AppText>
            <AppText variant="caption">{order.delivery === 0 ? 'Free' : formatPrice(order.delivery)}</AppText>
          </View>
          {order.discount > 0 ? (
            <View style={styles.sumRow}>
              <AppText variant="caption" color="muted">Discount</AppText>
              <AppText variant="caption" color="green">-{formatPrice(order.discount)}</AppText>
            </View>
          ) : null}
          <View style={styles.sumRow}>
            <AppText variant="bodyStrong">Total</AppText>
            <AppText variant="bodyStrong">{formatPrice(order.total)}</AppText>
          </View>
          <View style={styles.addr}>
            <Ionicons name="location-outline" size={16} color={colors.muted} />
            <AppText variant="caption" color="muted" style={styles.flex}>
              {order.address}
            </AppText>
          </View>
        </View>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  highlight: { borderWidth: 1.5, borderColor: colors.gold },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  copy: { marginBottom: spacing.md, marginTop: spacing.xs },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: spacing.md, minHeight: 44 },
  lines: { gap: spacing.md, marginTop: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 48, height: 48, borderRadius: radii.sm, backgroundColor: colors.sand },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
  addr: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
});
