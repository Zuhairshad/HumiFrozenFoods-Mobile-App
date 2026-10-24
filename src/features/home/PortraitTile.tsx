import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { AppText, FadeImage, PressableScale } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { formatPrice } from '@/lib/format';
import type { Product } from '@/types';
import { useProductMenu } from './useProductMenu';

interface Props {
  product: Product;
}

export const PortraitTile = memo(function PortraitTile({ product }: Props) {
  const { c, radius } = useTheme();
  const router = useRouter();
  const onLongPress = useProductMenu(product);
  const open = useCallback(
    () => router.push({ pathname: '/product/[id]', params: { id: product.id } }),
    [router, product.id],
  );

  return (
    <PressableScale
      onPress={open}
      onLongPress={onLongPress}
      haptic="none"
      scaleTo={0.97}
      accessibilityLabel={`${product.name}, ${formatPrice(product.price)}`}
      style={[styles.tile, radius('lg'), { backgroundColor: c.fill }]}
    >
      <View style={[StyleSheet.absoluteFill, radius('lg'), styles.clip]}>
        <FadeImage uri={product.image} width={640} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={['transparent', c.scrim]} style={styles.scrim} pointerEvents="none" />
        <View style={styles.text} pointerEvents="none">
          <AppText variant="footnoteStrong" color="onTint" numberOfLines={2}>
            {product.name}
          </AppText>
          <AppText variant="caption1" color="onTint" style={styles.price}>
            {formatPrice(product.price)}
          </AppText>
        </View>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  tile: { width: 156, height: 208 },
  clip: { overflow: 'hidden' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  text: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  price: { opacity: 0.8, marginTop: 2, fontVariant: ['tabular-nums'] },
});
