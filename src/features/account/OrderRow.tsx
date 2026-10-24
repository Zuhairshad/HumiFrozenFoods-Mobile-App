import { memo, useCallback } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import type { Order } from '@/types';
import { AppText, Price, Tag } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { OrderStack } from './OrderStack';
import { itemsLabel, shortDate } from './order-utils';
import { STATUS_TAG, STATUS_TONE, deriveStatus, STEPS, stepIndex } from './status';

interface OrderRowProps {
  order: Order;
  now?: number;
  onPress: (order: Order) => void;
  onReorder?: (order: Order) => void;
  onCopy?: (order: Order) => void;
}

function OrderRowBase({ order, now, onPress, onReorder, onCopy }: OrderRowProps) {
  const { c } = useTheme();
  const status = deriveStatus(order, now);
  const step = stepIndex(status) + 1;

  const openMenu = useCallback(() => {
    const labels = ['Reorder', 'Copy order number', 'Cancel'];
    const run = (i: number) => {
      if (i === 0) onReorder?.(order);
      else if (i === 1) onCopy?.(order);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: `Order ${order.id}`, options: labels, cancelButtonIndex: 2 },
        run,
      );
    } else {
      Alert.alert(`Order ${order.id}`, undefined, [
        { text: labels[0], onPress: () => run(0) },
        { text: labels[1], onPress: () => run(1) },
        { text: labels[2], style: 'cancel' },
      ]);
    }
  }, [order, onReorder, onCopy]);

  return (
    <Pressable
      onPress={() => onPress(order)}
      onLongPress={onReorder || onCopy ? openMenu : undefined}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.id}, ${STATUS_TAG[status]}, step ${step} of ${STEPS.length}, ${itemsLabel(order)}, placed ${shortDate(order.placedAt)}`}
      accessibilityHint="Opens order tracking"
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.fill : c.cell }]}
    >
      <OrderStack lines={order.lines} />
      <View style={styles.text}>
        <AppText variant="headline" numberOfLines={1}>
          Order {order.id}
        </AppText>
        <AppText variant="footnote" color="labelSecondary" numberOfLines={1}>
          {shortDate(order.placedAt)} · {itemsLabel(order)}
        </AppText>
        <View style={styles.tag}>
          <Tag label={STATUS_TAG[status]} tone={STATUS_TONE[status]} />
        </View>
      </View>
      <Price value={order.total} size="md" />
    </Pressable>
  );
}

export const OrderRow = memo(OrderRowBase);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 92 },
  text: { flex: 1, gap: 2 },
  tag: { flexDirection: 'row', marginTop: 4 },
});
