import { memo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppText, fireHaptic, FadeImage, Icon, PressableScale } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { formatPrice } from '@/lib/format';
import type { Product } from '@/types';

const TILE = 132;

interface TileProps {
  product: Product;
  onAdd: (productId: string) => void;
}

const Tile = memo(function Tile({ product, onAdd }: TileProps) {
  const { c } = useTheme();
  return (
    <View style={styles.tile}>
      <PressableScale
        onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } })}
        accessibilityLabel={`${product.name}, ${product.weight}, ${formatPrice(product.price)}`}
      >
        <FadeImage uri={product.image} width={256} style={styles.image} recyclingKey={product.id} />
        <AppText variant="subheadStrong" numberOfLines={2} style={styles.name}>
          {product.name}
        </AppText>
        <AppText variant="footnote" color="labelSecondary">
          {formatPrice(product.price)}
        </AppText>
      </PressableScale>
      <PressableScale
        onPress={() => {
          fireHaptic('light');
          onAdd(product.id);
        }}
        accessibilityLabel={`Add ${product.name} to cart`}
        style={[styles.plus, { backgroundColor: c.elevated }]}
      >
        <Icon name="plus" size={16} color="tint" />
      </PressableScale>
    </View>
  );
});

export interface ExtraShelfProps {
  title: string;
  products: Product[];
  onAdd: (productId: string) => void;
}

/** Horizontal shelf used for "Add a little extra" and "Buy again". */
export function ExtraShelf({ title, products, onAdd }: ExtraShelfProps) {
  if (products.length === 0) return null;
  return (
    <View style={styles.shelf}>
      <AppText variant="title2" accessibilityRole="header" style={styles.title}>
        {title}
      </AppText>
      <FlatList
        horizontal
        data={products}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <Tile product={item} onAdd={onAdd} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        initialNumToRender={4}
        windowSize={5}
        ItemSeparatorComponent={Gap}
      />
    </View>
  );
}

const Gap = () => <View style={{ width: 12 }} />;

const styles = StyleSheet.create({
  shelf: { gap: 12 },
  title: { paddingHorizontal: 20 },
  list: { paddingHorizontal: 20 },
  tile: { width: TILE },
  image: { width: TILE, height: TILE, borderRadius: 20, borderCurve: 'continuous' },
  name: { marginTop: 8 },
  plus: { position: 'absolute', top: TILE - 40, right: 8, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
