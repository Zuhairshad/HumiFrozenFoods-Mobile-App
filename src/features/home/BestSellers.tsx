import { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Reveal, SectionHeader } from '@/components/ui';
import { ProductCard } from '@/components/product/ProductCard';
import { getBestSellers } from '@/data';
import { gutter, spacing } from '@/theme';
import type { Product } from '@/types';

const Separator = () => <View style={{ width: spacing.md }} />;

export function BestSellers() {
  const router = useRouter();
  const data = useMemo(() => getBestSellers(8), []);
  const renderItem = useCallback(
    ({ item, index }: { item: Product; index: number }) => <ProductCard product={item} variant="featured" index={index} />,
    [],
  );
  return (
    <View style={styles.section}>
      <Reveal style={styles.pad}>
        <SectionHeader
          overline="Customer favourites"
          title="Best Sellers"
          actionLabel="See all"
          onAction={() => router.push('/(tabs)/shop')}
        />
      </Reveal>
      <FlatList
        data={data}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        initialNumToRender={3}
        windowSize={5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.lg, paddingTop: spacing.xxxl },
  pad: { paddingHorizontal: gutter },
  list: { paddingHorizontal: gutter, paddingBottom: spacing.lg },
});
