import { useMemo } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { EmptyState } from '@/components/ui';
import { useProducts } from '@/hooks/useProducts';
import { ProductTile } from '@/features/shop/ProductTile';
import { useTheme } from '@/hooks/useTheme';
import { useFavoritesStore } from '@/store/favorites';
import type { Product } from '@/types';

const MARGIN = 20;
const GAP = 12;

export default function FavoritesScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const ids = useFavoritesStore((s) => s.ids);
  const products = useProducts();
  const items = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter((p): p is Product => !!p);
  }, [ids, products]);
  const columns = fontScale >= 1.35 ? 1 : 2;
  const cell = columns === 1 ? width - MARGIN * 2 : (width - MARGIN * 2 - GAP) / 2;

  return (
    <>
      <Stack.Screen options={{ title: 'Favourites', headerLargeTitleEnabled: true }} />
      <FlatList
        key={columns}
        data={items}
        keyExtractor={(p) => p.id}
        numColumns={columns}
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: c.background }}
        contentContainerStyle={styles.content}
        columnWrapperStyle={columns > 1 ? styles.column : undefined}
        ItemSeparatorComponent={columns === 1 ? Gap : undefined}
        renderItem={({ item }) => (
          <View style={{ width: cell }}>
            <ProductTile product={item} variant="grid" />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <EmptyState
              icon="heart"
              title="No favourites yet"
              message="Tap the heart on any product to save it here."
              actionLabel="Explore"
              onAction={() => router.push('/(tabs)/shop')}
            />
          </View>
        }
      />
    </>
  );
}

function Gap() {
  return <View style={{ height: 24 }} />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: MARGIN, paddingTop: 8, paddingBottom: 48, flexGrow: 1 },
  column: { gap: GAP, marginBottom: 24 },
  empty: { paddingTop: 80 },
});
