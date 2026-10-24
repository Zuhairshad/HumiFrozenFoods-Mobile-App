import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { AppText, EmptyState, ListSection, Price, PressableScale, Rating } from '@/components/ui';
import { getProduct, getRelatedProducts } from '@/data';
import { useTheme } from '@/hooks/useTheme';
import { BUY_BAR_HEIGHT, BuyBar } from '@/features/product/BuyBar';
import { cookingMethods, cookingNote } from '@/features/product/cooking';
import { DisclosureRow } from '@/features/product/DisclosureRow';
import { FactStrip } from '@/features/product/FactStrip';
import { ProductHeaderButtons } from '@/features/product/ProductHeaderButtons';
import { ProductHero, SHEET_OVERLAP, useHeroHeight } from '@/features/product/ProductHero';
import { ProductTile } from '@/features/shop/ProductTile';
import type { Product } from '@/types';

const LONG_DESCRIPTION = 160;
/** Tags that are shown as plain text; health-claim style tags are left out. */
const HIDDEN_TAGS: readonly string[] = ['Omega-3 Rich'];

function Description({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > LONG_DESCRIPTION;
  return (
    <View>
      <AppText variant="body" numberOfLines={expanded || !long ? undefined : 4}>
        {text}
      </AppText>
      {long ? (
        <PressableScale
          onPress={() => setExpanded((v) => !v)}
          scaleTo={1}
          accessibilityLabel={expanded ? 'Show less description' : 'Show full description'}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={styles.more}
        >
          <AppText variant="body" color="tint">
            {expanded ? 'less' : 'more'}
          </AppText>
        </PressableScale>
      ) : null}
    </View>
  );
}

function RelatedShelf({ products }: { products: Product[] }) {
  if (products.length === 0) return null;
  return (
    <View style={styles.related}>
      <AppText variant="title2" accessibilityRole="header" style={styles.relatedTitle}>
        You May Also Like
      </AppText>
      <FlatList
        horizontal
        data={products}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <View style={styles.tileSlot}>
            <ProductTile product={item} />
          </View>
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.relatedList}
        initialNumToRender={4}
        windowSize={5}
      />
    </View>
  );
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const product = id ? getProduct(String(id)) : undefined;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const heroHeight = useHeroHeight();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  if (!product) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <Stack.Screen options={{ headerShown: true, title: '', headerTransparent: true }} />
        <EmptyState
          icon="magnifyingglass"
          title="Product not found"
          message="This item may have been removed or the link is out of date."
          actionLabel="Back"
          onAction={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </View>
    );
  }

  const tags = product.tags.filter((t) => !HIDDEN_TAGS.includes(t));
  const tagLine = tags.map((t) => (t === 'Halal Certified' ? 'Halal' : t)).join(' · ');
  const related = getRelatedProducts(product.id, 8);

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <ProductHero uri={product.image} scrollY={scrollY} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: BUY_BAR_HEIGHT + insets.bottom + 44 }}
      >
        <View style={{ height: heroHeight - SHEET_OVERLAP }} />
        <View style={[styles.sheet, { backgroundColor: c.background }]}>
          <View style={styles.titleBlock}>
            <AppText variant="title1" numberOfLines={2} accessibilityRole="header">
              {product.name}
            </AppText>
            <AppText variant="callout" color="labelSecondary">
              {product.weight}
            </AppText>
            <View style={styles.metaRow}>
              <Rating value={product.rating} count={product.reviewCount} compact />
              {tagLine ? (
                <AppText variant="footnote" color="labelSecondary" style={styles.tagLine}>
                  {tagLine}
                </AppText>
              ) : null}
            </View>
          </View>

          <View>
            <Price value={product.price} size="lg" />
            <AppText variant="footnote" color="labelSecondary">
              per pack
            </AppText>
          </View>

          <FactStrip product={product} />

          <Description text={product.description} />

          <View style={[styles.group, { backgroundColor: c.groupedBackground }]}>
            <ListSection>
              <DisclosureRow title="Ingredients">
                <AppText variant="callout" color="labelSecondary">
                  {product.ingredients}
                </AppText>
              </DisclosureRow>
              <DisclosureRow title="Cooking instructions">
                {cookingMethods.map((m) => (
                  <View key={m.title}>
                    <AppText variant="subheadStrong">{m.title}</AppText>
                    <AppText variant="callout" color="labelSecondary">
                      {m.detail}
                    </AppText>
                  </View>
                ))}
                <AppText variant="footnote" color="labelTertiary">
                  {cookingNote}
                </AppText>
              </DisclosureRow>
              <DisclosureRow title="Allergens">
                <AppText variant="callout" color="labelSecondary">
                  Check the pack for allergen information. Ingredients can change, so always read the label before eating.
                </AppText>
              </DisclosureRow>
            </ListSection>
          </View>
        </View>

        <RelatedShelf products={related} />
      </Animated.ScrollView>
      <ProductHeaderButtons product={product} />
      <BuyBar key={product.id} product={product} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: 'continuous',
    paddingTop: 24,
    paddingHorizontal: 20,
    gap: 20,
  },
  titleBlock: { gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 4, marginTop: 4 },
  tagLine: { flexShrink: 1 },
  more: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  group: { borderRadius: 28, borderCurve: 'continuous', padding: 8 },
  related: { paddingTop: 32, gap: 12 },
  relatedTitle: { paddingHorizontal: 20 },
  relatedList: { paddingHorizontal: 20, gap: 12 },
  tileSlot: { width: 160 },
});
