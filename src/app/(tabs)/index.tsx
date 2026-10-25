import { useCallback, useMemo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import {
  FootnoteLine,
  PagedRowShelf,
  PortraitTile,
  QuickGlyphRow,
  Shelf,
  SquareTile,
  StatusBarBlur,
  TodayCard,
  TodayHeader,
} from '@/features/home';
import { selectBuyAgain, selectNewThisWeek, selectTopPicks, dayOfYear } from '@/features/home/selectors';
import { bestSellersOf, findProduct } from '@/data/selectors';
import { heroSlides } from '@/data';
import { useCatalogSync, useProducts, usePullToRefresh } from '@/hooks/useProducts';
import { useTabInset } from '@/hooks/useTabInset';
import { useTheme } from '@/hooks/useTheme';
import { useCartStore } from '@/store/cart';
import { useOrdersStore } from '@/store/orders';

export default function HomeScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const tabInset = useTabInset();
  const add = useCartStore((s) => s.add);
  const orders = useOrdersStore((s) => s.orders);
  const products = useProducts();
  const { refreshing, onRefresh } = usePullToRefresh();
  useCatalogSync();
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  const now = useMemo(() => new Date(), []);

  const hero = useMemo(() => {
    const slide = heroSlides.length > 0 ? heroSlides[dayOfYear(now) % heroSlides.length] : undefined;
    const product = (slide ? findProduct(products, slide.productId) : undefined) ?? bestSellersOf(products, 1)[0];
    // The editorial slide only describes its own product; a fallback product gets its own headline.
    return product ? { product, slide: slide && slide.productId === product.id ? slide : undefined } : null;
  }, [now, products]);

  const buyAgain = useMemo(() => selectBuyAgain(orders, products, 8), [orders, products]);
  const showBuyAgain = buyAgain.length > 0;
  const bestSellers = useMemo(() => bestSellersOf(products, 8), [products]);
  const topPicks = useMemo(() => selectTopPicks(products, !showBuyAgain), [products, showBuyAgain]);
  const newThisWeek = useMemo(() => selectNewThisWeek(products, 6), [products]);

  const openAbout = useCallback(() => router.push('/about'), [router]);
  const openShop = useCallback(() => router.push('/shop'), [router]);

  const openHero = useCallback(() => {
    if (hero) router.push({ pathname: '/product/[id]', params: { id: hero.product.id } });
  }, [hero, router]);
  const addHero = useCallback(() => {
    if (hero && hero.product.inStock) add(hero.product.id, 1);
  }, [add, hero]);

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        scrollIndicatorInsets={{ bottom: tabInset - 16 }}
        contentContainerStyle={{ paddingBottom: tabInset }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
      >
        <TodayHeader onLogoPress={openAbout} now={now} />

        {hero ? (
          <View style={styles.card}>
            <TodayCard
              product={hero.product}
              eyebrow={hero.slide?.eyebrow ?? 'Best seller'}
              title={hero.slide?.title}
              imageUri={hero.slide?.image}
              scrollY={scrollY}
              onPress={openHero}
              onAdd={addHero}
            />
          </View>
        ) : null}

        <View style={styles.glyphs}>
          <QuickGlyphRow />
        </View>

        <View style={styles.shelf}>
          {showBuyAgain ? (
            <Shelf title="Buy Again" onSeeAll={openShop}>
              {buyAgain.map((b) => (
                <SquareTile key={b.product.id} product={b.product} reorderQty={b.quantity} />
              ))}
            </Shelf>
          ) : (
            <Shelf title="Best Sellers" onSeeAll={openShop}>
              {bestSellers.map((p) => (
                <SquareTile key={p.id} product={p} />
              ))}
            </Shelf>
          )}
        </View>

        {topPicks.length > 0 ? (
          <View style={styles.shelf}>
            <Shelf title="Top Picks" onSeeAll={openShop} scroll={false}>
              <PagedRowShelf products={topPicks} />
            </Shelf>
          </View>
        ) : null}

        {newThisWeek.length > 0 ? (
          <View style={styles.shelf}>
            <Shelf title="New This Week" onSeeAll={openShop}>
              {newThisWeek.map((p) => (
                <PortraitTile key={p.id} product={p} />
              ))}
            </Shelf>
          </View>
        ) : null}

        <FootnoteLine />
      </Animated.ScrollView>
      <StatusBarBlur scrollY={scrollY} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { marginTop: 16, paddingHorizontal: 20 },
  glyphs: { marginTop: 24 },
  shelf: { marginTop: 32 },
});
