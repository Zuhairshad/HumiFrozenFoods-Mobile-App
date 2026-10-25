import { StyleSheet, View } from 'react-native';
import { AppText, ListSection } from '@/components/ui';
import { formatPrice } from '@/lib/format';

/** Pence figures from the server quote (or the labelled estimate). */
export interface SummaryTotals {
  subtotalPence: number;
  deliveryPence: number;
  discountPence: number;
  totalPence: number;
}

export interface SummaryRowsProps {
  totals: SummaryTotals;
  /** Shown in the discount row label (the code the server accepted). */
  promoCode?: string;
  /** Figures are a local placeholder (loading first quote, offline, demo). Server numbers are never labelled. */
  estimate?: boolean;
  footer?: string;
}

function Line({
  label,
  value,
  color,
  strong,
}: {
  label: string;
  value: string;
  color?: 'success' | 'label' | 'labelSecondary';
  strong?: boolean;
}) {
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label}, ${value}`}>
      <AppText variant={strong ? 'headline' : 'callout'} color={color ?? (strong ? 'label' : 'labelSecondary')} style={styles.label}>
        {label}
      </AppText>
      <AppText variant={strong ? 'headline' : 'price'} color={color ?? 'label'} style={styles.value}>
        {value}
      </AppText>
    </View>
  );
}

export function SummaryRows({ totals, promoCode, estimate, footer }: SummaryRowsProps) {
  const free = totals.deliveryPence === 0 && totals.subtotalPence > 0;
  const p = (n: number) => formatPrice(n / 100);
  return (
    <ListSection footer={footer}>
      <Line label="Subtotal" value={p(totals.subtotalPence)} />
      <Line label="Delivery" value={free ? 'Free' : p(totals.deliveryPence)} color={free ? 'success' : undefined} />
      {totals.discountPence > 0 ? (
        <Line
          label={promoCode ? `Discount (${promoCode})` : 'Discount'}
          value={`-${p(totals.discountPence)}`}
          color="success"
        />
      ) : null}
      <Line label={estimate ? 'Estimate' : 'Total'} value={p(totals.totalPence)} strong />
    </ListSection>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, minHeight: 44, paddingVertical: 10 },
  label: { flexShrink: 1 },
  value: { textAlign: 'right' },
});
