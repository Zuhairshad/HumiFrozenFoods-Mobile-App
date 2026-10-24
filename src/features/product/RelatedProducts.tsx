import { ScrollView, StyleSheet, View } from 'react-native';
import { SectionHeader } from '@/components/ui';
import { ProductCard } from '@/components/product/ProductCard';
import { getRelatedProducts } from '@/data';
import { gutter, spacing } from '@/theme';

const CARD_WIDTH = 176;

export function RelatedProducts({ productId }: { productId: string }) {
  const related = getRelatedProducts(productId, 6);
  if (related.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <SectionHeader overline="Pairs well" title="You might also like" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
        {related.map((p, i) => (
          <View key={p.id} style={{ width: CARD_WIDTH }}>
            <ProductCard product={p} variant="grid" index={i} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  header: { paddingHorizontal: gutter },
  list: { paddingHorizontal: gutter, gap: spacing.md, paddingBottom: spacing.sm },
});
