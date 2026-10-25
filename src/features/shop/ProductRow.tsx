import { memo, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText, FadeImage, Price } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { formatPrice } from '@/lib/format';
import type { Product } from '@/types';
import { AddPill } from './AddControls';
import { ProductLink } from './ProductLink';
import { StockTag } from './StockTag';
import { productA11yLabel, searchFootnote } from './productMeta';

export type ProductRowVariant = 'shelf' | 'search' | 'compact';

export interface ProductRowProps {
  product: Product;
  variant?: ProductRowVariant;
  /** Search text; the matched substring of the name is rendered at weight 700. */
  query?: string;
  /** Hide the hairline under the row (last row of a group). */
  hideSeparator?: boolean;
}

const THUMB: Record<ProductRowVariant, number> = { shelf: 64, search: 56, compact: 48 };
const GAP = 12;
const A11Y_FONT_SCALE = 1.35;

interface Segments {
  before: string;
  match: string;
  after: string;
}

function splitMatch(text: string, query: string | undefined): Segments | null {
  const q = query?.trim().toLowerCase();
  if (!q) return null;
  const at = text.toLowerCase().indexOf(q);
  if (at < 0) return null;
  return { before: text.slice(0, at), match: text.slice(at, at + q.length), after: text.slice(at + q.length) };
}

function ProductRowBase({ product, variant = 'shelf', query, hideSeparator = false }: ProductRowProps) {
  const { c, radius } = useTheme();
  const { fontScale } = useWindowDimensions();
  const accessibilityLayout = fontScale >= A11Y_FONT_SCALE;
  const thumb = accessibilityLayout ? 48 : THUMB[variant];

  const segments = useMemo(() => splitMatch(product.name, query), [product.name, query]);
  const subtitle = variant === 'search' ? searchFootnote(product) : product.weight;
  const label = productA11yLabel(product, formatPrice(product.price));
  const nameLines = variant === 'search' ? 2 : 1;

  return (
    <View style={variant === 'shelf' ? styles.shelfFrame : undefined}>
      <ProductLink product={product} scaleTo={1} accessibilityLabel={label} style={styles.row}>
        <FadeImage
          uri={product.image}
          width={256}
          recyclingKey={product.id}
          contentFit="cover"
          style={[{ width: thumb, height: thumb, backgroundColor: c.fill }, radius('md')]}
        />
        <View style={styles.text}>
          <AppText variant="headline" numberOfLines={nameLines} maxScale={1.6}>
            {segments ? (
              <>
                {segments.before}
                <AppText variant="headline" style={styles.match}>
                  {segments.match}
                </AppText>
                {segments.after}
              </>
            ) : (
              product.name
            )}
          </AppText>
          {variant !== 'compact' && subtitle ? (
            <AppText variant="footnote" color="labelSecondary" numberOfLines={1}>
              {subtitle}
            </AppText>
          ) : null}
          <Price value={product.price} size="sm" />
          <StockTag product={product} />
        </View>
        <AddPill product={product} />
      </ProductLink>
      {hideSeparator ? null : (
        <View
          style={[styles.separator, { left: thumb + GAP, backgroundColor: c.separator }]}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shelfFrame: { minHeight: 76, justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    minHeight: 76,
    paddingVertical: 6,
  },
  text: { flex: 1, minWidth: 0, gap: 1 },
  match: { fontWeight: '700' },
  separator: { position: 'absolute', right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});

export const ProductRow = memo(ProductRowBase);
