import { memo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText, FadeImage, Price, Rating } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { formatPrice } from '@/lib/format';
import type { Product } from '@/types';
import { TilePlus } from './AddControls';
import { ProductLink } from './ProductLink';
import { StockTag } from './StockTag';
import { productA11yLabel } from './productMeta';

export interface ProductTileProps {
  product: Product;
  variant?: 'grid';
}

const A11Y_FONT_SCALE = 1.35;
const A11Y_IMAGE = 96;

/**
 * Photo tile for the Shop grid: square photo, no card chrome, no badges (design 5.2).
 * At large accessibility text sizes it becomes a single-column row with a 96 pt photo.
 */
function ProductTileBase({ product }: ProductTileProps) {
  const { c, radius } = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= A11Y_FONT_SCALE;
  const label = productA11yLabel(product, formatPrice(product.price));

  const photo = (
    <View
      style={stacked ? { width: A11Y_IMAGE, height: A11Y_IMAGE } : styles.photoWrap}
    >
      <FadeImage
        uri={product.image}
        width={640}
        recyclingKey={product.id}
        contentFit="cover"
        style={[styles.photo, { backgroundColor: c.fill }, radius('lg')]}
      />
      <TilePlus product={product} />
    </View>
  );

  return (
    <ProductLink
      product={product}
      accessibilityLabel={label}
      style={stacked ? styles.stackedFrame : styles.frame}
    >
      {photo}
      <View style={stacked ? styles.stackedText : styles.text}>
        <AppText variant="subheadStrong" numberOfLines={2} maxScale={1.6}>
          {product.name}
        </AppText>
        {product.weight ? (
          <AppText variant="footnote" color="labelSecondary" numberOfLines={1}>
            {product.weight}
          </AppText>
        ) : null}
        <View style={styles.meta}>
          <Price value={product.price} size="sm" />
          {product.reviewCount > 0 ? <Rating value={product.rating} compact /> : null}
        </View>
        <StockTag product={product} />
      </View>
    </ProductLink>
  );
}

const styles = StyleSheet.create({
  frame: { gap: 8 },
  stackedFrame: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: A11Y_IMAGE },
  photoWrap: { width: '100%', aspectRatio: 1 },
  photo: { width: '100%', height: '100%' },
  text: { gap: 2 },
  stackedText: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
});

export const ProductTile = memo(ProductTileBase);
