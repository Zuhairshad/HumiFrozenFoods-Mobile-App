import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ProductRow } from '@/features/shop/ProductRow';
import type { Product } from '@/types';

interface Props {
  products: Product[];
  rowsPerPage?: number;
}

const GAP = 12;
const SIDE = 20;
const PEEK = 40;

export const PagedRowShelf = memo(function PagedRowShelf({ products, rowsPerPage = 3 }: Props) {
  const { width: screenW } = useWindowDimensions();
  const pageW = screenW - SIDE - PEEK;

  const pages = useMemo(() => {
    const out: Product[][] = [];
    for (let i = 0; i < products.length; i += rowsPerPage) out.push(products.slice(i, i + rowsPerPage));
    return out;
  }, [products, rowsPerPage]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={pageW + GAP}
      snapToAlignment="start"
      decelerationRate="fast"
      contentContainerStyle={styles.content}
    >
      {pages.map((page, i) => (
        <View key={page[0]?.id ?? i} style={{ width: pageW }}>
          {page.map((p, j) => (
            <ProductRow key={p.id} product={p} variant="shelf" hideSeparator={j === page.length - 1} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  content: { paddingHorizontal: SIDE, gap: GAP },
});
