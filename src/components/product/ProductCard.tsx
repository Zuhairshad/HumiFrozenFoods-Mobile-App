import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { colors, gradients, radii, shadows, spacing } from '@/theme';
import type { Product } from '@/types';
import { useCart } from '@/hooks/useCart';
import { haptics } from '@/hooks/useHaptics';
import { formatPrice } from '@/lib/format';
import { useFavoritesStore } from '@/store/favorites';
import { AppText, Badge, FadeImage, PressableScale, Price, QuantityStepper, Rating } from '../ui';

export interface ProductCardProps {
  product: Product;
  variant?: 'grid' | 'featured' | 'row';
  index?: number;
}

const STAGGER = 60;

function ProductCardBase({ product, variant = 'grid', index = 0 }: ProductCardProps) {
  const { quantityOf, add, setQty } = useCart();
  const favorite = useFavoritesStore((s) => s.ids.includes(product.id));
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const quantity = quantityOf(product.id);
  const tag = product.tags[0];

  const open = () => router.push(`/product/${product.id}` as never);
  const onAdd = () => {
    haptics.medium();
    add(product.id, 1);
  };
  const onToggleFav = () => {
    haptics.selection();
    toggleFavorite(product.id);
  };

  const heart = (
    <PressableScale
      onPress={onToggleFav}
      scaleTo={0.8}
      accessibilityLabel={favorite ? `Remove ${product.name} from favourites` : `Add ${product.name} to favourites`}
      style={styles.heart}
    >
      <Ionicons
        name={favorite ? 'heart' : 'heart-outline'}
        size={18}
        color={favorite ? colors.red : colors.inkSoft}
      />
    </PressableScale>
  );

  const addControl = (size: 'sm' | 'md') =>
    quantity > 0 ? (
      <Animated.View entering={FadeIn.duration(180)}>
        <QuantityStepper value={quantity} onChange={(n) => setQty(product.id, n)} size={size} />
      </Animated.View>
    ) : (
      <Animated.View entering={ZoomIn.duration(200)}>
        <PressableScale
          onPress={onAdd}
          scaleTo={0.88}
          accessibilityLabel={`Add ${product.name} to cart`}
          style={[styles.add, size === 'sm' && styles.addSm]}
        >
          <LinearGradient
            colors={gradients.gold}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: radii.pill }]}
          />
          <Ionicons name="add" size={size === 'sm' ? 20 : 24} color={colors.tealInk} />
        </PressableScale>
      </Animated.View>
    );

  if (variant === 'featured') {
    return (
      <Animated.View entering={FadeInDown.delay(index * STAGGER).duration(500)} style={styles.featuredWrap}>
        <PressableScale onPress={open} scaleTo={0.98} accessibilityLabel={product.name} style={styles.featured}>
          <FadeImage uri={product.image} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={gradients.scrimBottom} style={styles.featuredScrim} />
          <View style={styles.featuredTop}>
            {tag ? <Badge label={tag} tone="gold" /> : <View />}
            {heart}
          </View>
          <View style={styles.featuredBottom}>
            <View style={styles.flex}>
              <AppText variant="h3" color="white" numberOfLines={2}>
                {product.name}
              </AppText>
              <AppText variant="caption" color="tealSoft" numberOfLines={1}>
                {product.weight}
              </AppText>
              <View style={styles.featuredMeta}>
                <AppText variant="price" color="gold">
                  {formatPrice(product.price)}
                </AppText>
                <Rating value={product.rating} count={product.reviewCount} />
              </View>
            </View>
            {addControl('md')}
          </View>
        </PressableScale>
      </Animated.View>
    );
  }

  if (variant === 'row') {
    return (
      <Animated.View entering={FadeInDown.delay(index * STAGGER).duration(450)}>
        <PressableScale onPress={open} scaleTo={0.985} accessibilityLabel={product.name} style={styles.row}>
          <View style={styles.rowImageWrap}>
            <FadeImage uri={product.image} style={styles.rowImage} />
          </View>
          <View style={styles.rowBody}>
            {tag ? <Badge label={tag} tone="sand" size="sm" /> : null}
            <AppText variant="title" numberOfLines={2}>
              {product.name}
            </AppText>
            <AppText variant="caption" color="muted" numberOfLines={1}>
              {product.weight}
            </AppText>
            <View style={styles.rowFooter}>
              <Price value={product.price} size="sm" />
              <Rating value={product.rating} size={12} />
            </View>
          </View>
          <View style={styles.rowActions}>
            {heart}
            {addControl('sm')}
          </View>
        </PressableScale>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.delay(index * STAGGER).duration(450)} style={styles.flex}>
      <PressableScale onPress={open} scaleTo={0.97} accessibilityLabel={product.name} style={styles.grid}>
        <View style={styles.gridImageWrap}>
          <FadeImage uri={product.image} style={StyleSheet.absoluteFill} />
          <View style={styles.gridTop}>
            {tag ? <Badge label={tag} tone="gold" size="sm" /> : <View />}
            {heart}
          </View>
        </View>
        <View style={styles.gridBody}>
          <AppText variant="title" numberOfLines={2} style={styles.gridName}>
            {product.name}
          </AppText>
          <AppText variant="caption" color="muted" numberOfLines={1}>
            {product.weight}
          </AppText>
          <Rating value={product.rating} count={product.reviewCount} size={12} />
          <View style={styles.gridFooter}>
            <Price value={product.price} />
            {addControl('sm')}
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

export const ProductCard = memo(ProductCardBase);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heart: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  add: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.gold,
  },
  addSm: { width: 38, height: 38 },

  grid: { flex: 1, backgroundColor: colors.paper, borderRadius: radii.lg, ...shadows.md },
  gridImageWrap: {
    aspectRatio: 1,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.sand,
  },
  gridTop: {
    ...StyleSheet.absoluteFillObject,
    padding: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  gridBody: { padding: spacing.md, gap: spacing.xs },
  gridName: { minHeight: 44 },
  gridFooter: { marginTop: spacing.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  featuredWrap: { width: 288 },
  featured: {
    height: 360,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.tealInk,
    justifyContent: 'space-between',
    ...shadows.lg,
  },
  featuredScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 220 },
  featuredTop: { padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  featuredBottom: { padding: spacing.lg, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  featuredMeta: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    ...shadows.sm,
  },
  rowImageWrap: { width: 96, height: 96, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.sand },
  rowImage: { width: '100%', height: '100%' },
  rowBody: { flex: 1, gap: spacing.xs },
  rowFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowActions: { alignSelf: 'stretch', alignItems: 'flex-end', justifyContent: 'space-between' },
});
