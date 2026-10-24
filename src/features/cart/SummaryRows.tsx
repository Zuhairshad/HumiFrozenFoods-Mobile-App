import { StyleSheet, View } from 'react-native';
import { AppText, ListSection } from '@/components/ui';
import { formatPrice } from '@/lib/format';

export interface SummaryTotals {
  subtotal: number;
  delivery: number;
  discount: number;
  total: number;
}

export interface SummaryRowsProps {
  totals: SummaryTotals;
  /** Shown in the discount row label, e.g. "HUMI15". */
  promoCode?: string;
  /** Marks the figures as an estimate (client-side preview before the server prices the order). */
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
  const free = totals.delivery === 0 && totals.subtotal > 0;
  return (
    <ListSection footer={footer}>
      <Line label="Subtotal" value={formatPrice(totals.subtotal)} />
      <Line label="Delivery" value={free ? 'Free' : formatPrice(totals.delivery)} color={free ? 'success' : undefined} />
      {totals.discount > 0 ? (
        <Line
          label={promoCode ? `Discount (${promoCode})` : 'Discount'}
          value={`-${formatPrice(totals.discount)}`}
          color="success"
        />
      ) : null}
      <Line label={estimate ? 'Estimated total' : 'Total'} value={formatPrice(totals.total)} strong />
    </ListSection>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, minHeight: 44, paddingVertical: 10 },
  label: { flexShrink: 1 },
  value: { textAlign: 'right' },
});
