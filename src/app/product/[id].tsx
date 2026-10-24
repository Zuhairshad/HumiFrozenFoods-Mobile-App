import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { AppText, Badge, EmptyState, Price, Rating, Reveal, ScreenHeader } from '@/components/ui';
import { getProduct } from '@/data';
import { colors, gutter, radii, spacing } from '@/theme';
import { Accordion } from '@/features/product/Accordion';
import { AddToCartBar, BAR_HEIGHT } from '@/features/product/AddToCartBar';
import { cookingMethods, cookingNote } from '@/features/product/cooking';
import { InfoPills } from '@/features/product/InfoPills';
import { HERO_HEIGHT, HeroActions, HeroImage } from '@/features/product/ProductHero';
import { RelatedProducts } from '@/features/product/RelatedProducts';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const product = id ? getProduct(String(id)) : undefined;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  if (!product) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Product" onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <EmptyState
          icon="fast-food-outline"
          title="Product not found"
          message="This item may have been removed or the link is out of date."
          actionLabel="Browse the shop"
          onAction={() => router.replace('/shop')}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <HeroImage product={product} scrollY={scrollY} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: BAR_HEIGHT + insets.bottom + spacing.xxl }}
      >
        <View style={{ height: HERO_HEIGHT - radii.xl }} />
        <View style={styles.sheet}>
          <Reveal delay={60} from="bottom">
            <View style={styles.tags}>
              {product.tags.map((t) => (
                <Badge key={t} label={t} tone={t === 'Best Seller' ? 'gold' : t === 'Halal Certified' ? 'green' : 'sand'} size="sm" />
              ))}
            </View>
            <AppText variant="h1" style={styles.name}>
              {product.name}
            </AppText>
            <View style={styles.metaRow}>
              <Rating value={product.rating} count={product.reviewCount} size={14} />
              <AppText variant="caption" color="muted">
                {product.weight}
              </AppText>
            </View>
            <View style={styles.priceRow}>
              <Price value={product.price} size="lg" />
              <AppText variant="caption" color="muted">
                per pack
              </AppText>
            </View>
          </Reveal>

          <Reveal delay={140} from="bottom">
            <InfoPills product={product} />
          </Reveal>

          <Reveal delay={200} from="bottom">
            <AppText variant="h3" style={styles.sectionTitle}>
              About this product
            </AppText>
            <AppText variant="body" color="inkSoft">
              {product.description}
            </AppText>
          </Reveal>

          <View style={styles.accordions}>
            <Accordion title="Ingredients" icon="leaf-outline">
              <AppText variant="body" color="inkSoft">
                {product.ingredients}
              </AppText>
            </Accordion>
            <Accordion title="Cooking instructions" icon="restaurant-outline">
              <View style={styles.methods}>
                {cookingMethods.map((m) => (
                  <View key={m.title} style={styles.method}>
                    <AppText variant="bodyStrong">{m.title}</AppText>
                    <AppText variant="body" color="inkSoft">
                      {m.detail}
                    </AppText>
                  </View>
                ))}
                <AppText variant="caption" color="muted">
                  {cookingNote}
                </AppText>
              </View>
            </Accordion>
          </View>
        </View>
        <View style={styles.related}>
          <RelatedProducts productId={product.id} />
        </View>
      </Animated.ScrollView>
      <HeroActions product={product} scrollY={scrollY} />
      <AddToCartBar key={product.id} product={product} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  sheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.xxl,
    paddingHorizontal: gutter,
    gap: spacing.xl,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  name: { marginTop: spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.md },
  sectionTitle: { marginBottom: spacing.sm },
  accordions: { gap: spacing.md },
  methods: { gap: spacing.md },
  method: { gap: 2 },
  related: { backgroundColor: colors.cream, paddingTop: spacing.xxl },
});
