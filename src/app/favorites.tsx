import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ProductCard } from '@/components/product/ProductCard';
import { EmptyState, Reveal, Screen, ScreenHeader } from '@/components/ui';
import { getProduct } from '@/data';
import { useFavoritesStore } from '@/store/favorites';
import type { Product } from '@/types';
import { gutter, spacing } from '@/theme';

export default function FavoritesScreen() {
  const router = useRouter();
  const ids = useFavoritesStore((s) => s.ids);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/more'));
  const items = ids.map((id) => getProduct(id)).filter((p): p is Product => !!p);

  return (
    <Screen contentContainerStyle={styles.content}>
      <ScreenHeader
        title="Favourites"
        subtitle={items.length ? `${items.length} saved ${items.length === 1 ? 'product' : 'products'}` : undefined}
        onBack={back}
      />
      {items.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="No favourites yet"
          message="Tap the heart on any product to save it here for later."
          actionLabel="Browse products"
          onAction={() => router.push('/(tabs)/shop')}
        />
      ) : (
        <View style={styles.grid}>
          {items.map((p, i) => (
            <Reveal key={p.id} delay={Math.min(i, 8) * 50} style={styles.cell}>
              <ProductCard product={p} variant="grid" index={i} />
            </Reveal>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.huge },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: gutter, paddingTop: spacing.sm },
  cell: { width: '48%', flexGrow: 1 },
});
