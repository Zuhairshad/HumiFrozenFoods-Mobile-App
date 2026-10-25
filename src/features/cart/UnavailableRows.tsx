import { StyleSheet, View } from 'react-native';
import { AppText, ListSection, PressableScale } from '@/components/ui';
import { getProduct } from '@/data';
import type { UnavailableLine, UnavailableReason } from '@/lib/api/types';

const REASON_TEXT: Record<UnavailableReason, string> = {
  out_of_stock: 'Out of stock',
  not_found: 'No longer available',
  unpublished: 'No longer available',
};

export interface UnavailableRowsProps {
  items: UnavailableLine[];
  onRemove: (productId: string) => void;
}

/** Lines the server cannot sell. Checkout stays blocked until each is removed. */
export function UnavailableRows({ items, onRemove }: UnavailableRowsProps) {
  if (items.length === 0) return null;
  return (
    <ListSection header="Needs your attention" footer="Remove these items to continue to checkout.">
      {items.map((u) => {
        const name = getProduct(u.productId)?.name ?? 'This item';
        return (
          <View key={u.productId} style={styles.row} accessible accessibilityLabel={`${name}. ${REASON_TEXT[u.reason]}`}>
            <View style={styles.text}>
              <AppText variant="headline" numberOfLines={2}>
                {name}
              </AppText>
              <AppText variant="footnote" color="destructive">
                {REASON_TEXT[u.reason]}
              </AppText>
            </View>
            <PressableScale
              onPress={() => onRemove(u.productId)}
              scaleTo={1}
              pressedOpacity={0.6}
              accessibilityLabel={`Remove ${name}`}
              style={styles.button}
            >
              <AppText variant="body" color="tint">
                Remove
              </AppText>
            </PressableScale>
          </View>
        );
      })}
    </ListSection>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 64 },
  text: { flex: 1, gap: 2 },
  button: { minHeight: 44, justifyContent: 'center' },
});
