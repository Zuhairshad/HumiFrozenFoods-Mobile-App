import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, FadeImage, PressableScale, useToast } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { formatPrice } from '@/lib/format';
import { useCartStore } from '@/store/cart';
import type { Product } from '@/types';
import { MiniAddButton } from './MiniAddButton';
import { useAddFeedback } from './useAddFeedback';
import { useProductMenu } from './useProductMenu';

const SIZE = 132;

interface Props {
  product: Product;
  /** One-tap reorder: quantity from the last order (Buy Again shelf). */
  reorderQty?: number;
}

export const SquareTile = memo(function SquareTile({ product, reorderQty }: Props) {
  const { c, radius } = useTheme();
  const router = useRouter();
  const add = useCartStore((s) => s.add);
  const toast = useToast();
  const { added, trigger } = useAddFeedback();
  const onLongPress = useProductMenu(product);
  const qty = reorderQty ?? 1;

  const open = useCallback(
    () => router.push({ pathname: '/product/[id]', params: { id: product.id } }),
    [router, product.id],
  );
  const onAdd = useCallback(() => {
    add(product.id, qty);
    trigger();
    if (reorderQty) toast.show({ message: `Added ${qty}` });
  }, [add, product.id, qty, reorderQty, toast, trigger]);

  return (
    <PressableScale
      onPress={open}
      onLongPress={onLongPress}
      haptic="none"
      scaleTo={0.97}
      accessibilityLabel={`${product.name}, ${formatPrice(product.price)}`}
      style={styles.tile}
    >
      <View style={[styles.photo, radius('lg'), { backgroundColor: c.fill }]}>
        <FadeImage uri={product.image} width={640} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.plus}>
          <MiniAddButton
            added={added}
            onPress={onAdd}
            accessibilityLabel={added ? `${product.name} added` : `Add ${product.name} to cart`}
          />
        </View>
      </View>
      <AppText variant="subheadStrong" numberOfLines={2} style={styles.name}>
        {product.name}
      </AppText>
      <AppText variant="footnote" color="labelSecondary" style={styles.price}>
        {formatPrice(product.price)}
      </AppText>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  tile: { width: SIZE },
  photo: { width: SIZE, height: SIZE, overflow: 'hidden' },
  plus: { position: 'absolute', right: 8, bottom: 8 },
  name: { marginTop: 8 },
  price: { marginTop: 2, fontVariant: ['tabular-nums'] },
});
