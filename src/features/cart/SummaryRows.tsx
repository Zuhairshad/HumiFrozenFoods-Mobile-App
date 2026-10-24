import { StyleSheet, View } from 'react-native';
import { AppText, Divider } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import { spacing } from '@/theme';
import { useTween } from './useTween';

interface Props {
  subtotal: number;
  delivery: number;
  discount: number;
  total: number;
}

function Row({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText variant="body" color="inkSoft">
        {label}
      </AppText>
      <AppText variant="bodyStrong" color={green ? 'green' : 'ink'}>
        {value}
      </AppText>
    </View>
  );
}

export function SummaryRows({ subtotal, delivery, discount, total }: Props) {
  const animatedTotal = useTween(total);
  const animatedSubtotal = useTween(subtotal);
  return (
    <View style={styles.wrap}>
      <Row label="Subtotal" value={formatPrice(animatedSubtotal)} />
      <Row label="Delivery" value={delivery === 0 ? 'Free' : formatPrice(delivery)} green={delivery === 0} />
      {discount > 0 ? <Row label="Discount (HUMI15)" value={`-${formatPrice(discount)}`} green /> : null}
      <Divider />
      <View style={styles.row}>
        <AppText variant="h3">Total</AppText>
        <AppText variant="h2" color="teal">
          {formatPrice(animatedTotal)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
