import { memo, useCallback, useEffect, useRef } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { AppText, Badge, Button, FadeImage } from '@/components/ui';
import { heroSlides } from '@/data';
import { colors, gradients, gutter, radii, spacing } from '@/theme';
import type { HeroSlide } from '@/types';
import { HomeTopBar } from './HomeTopBar';

const AUTO_MS = 5000;
export const HERO_HEIGHT = 600;

interface SlideProps {
  slide: HeroSlide;
  index: number;
  width: number;
  scrollX: SharedValue<number>;
  scrollY: SharedValue<number>;
}

const Slide = memo(function Slide({ slide, index, width, scrollX, scrollY }: SlideProps) {
  const router = useRouter();

  const imageStyle = useAnimatedStyle(() => {
    const dx = interpolate(scrollX.value, [(index - 1) * width, index * width, (index + 1) * width], [-width * 0.25, 0, width * 0.25]);
    const y = Math.max(scrollY.value, 0);
    const pull = Math.max(-scrollY.value, 0);
    return {
      transform: [
        { translateX: dx },
        { translateY: y * 0.45 - pull * 0.5 },
        { scale: 1.15 + pull / 600 },
      ],
    };
  });

  const textStyle = useAnimatedStyle(() => {
    const dist = Math.abs(scrollX.value - index * width) / width;
    return {
      opacity: interpolate(dist, [0, 0.6], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateY: scrollY.value * 0.2 }, { translateX: interpolate(scrollX.value - index * width, [-width, width], [40, -40]) }],
    };
  });

  return (
    <View style={{ width, height: HERO_HEIGHT, overflow: 'hidden' }}>
      <Animated.View style={[StyleSheet.absoluteFill, imageStyle]}>
        <FadeImage uri={slide.image} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <LinearGradient colors={gradients.scrimTop} style={styles.scrimTop} />
      <LinearGradient colors={['rgba(8,48,47,0)', 'rgba(8,48,47,0.55)', 'rgba(8,48,47,0.95)']} style={styles.scrimBottom} />
      <Animated.View style={[styles.content, textStyle]}>
        <Badge label={slide.eyebrow} tone="gold" icon="sparkles" />
        <AppText variant="hero" color="white" style={styles.title} numberOfLines={3}>
          {slide.title}
        </AppText>
        <AppText variant="body" color="rgba(255,255,255,0.85)" numberOfLines={3}>
          {slide.subtitle}
        </AppText>
        <View style={styles.cta}>
          <Button
            title="Shop Now"
            variant="gold"
            size="md"
            iconRight="arrow-forward"
            onPress={() => router.push(`/product/${slide.productId}`)}
          />
        </View>
        <View style={styles.chips}>
          {slide.badges.map((b) => (
            <Badge key={b} label={b} tone="glass" size="sm" />
          ))}
        </View>
      </Animated.View>
    </View>
  );
});

function Dot({ index, width, scrollX }: { index: number; width: number; scrollX: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      width: interpolate(scrollX.value, input, [8, 26, 8], Extrapolation.CLAMP),
      opacity: interpolate(scrollX.value, input, [0.45, 1, 0.45], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

interface Props {
  scrollY: SharedValue<number>;
}

export function HeroCarousel({ scrollY }: Props) {
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<HeroSlide>>(null);
  const scrollX = useSharedValue(0);
  const current = useRef(0);
  const paused = useRef(false);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  useEffect(() => {
    const id = setInterval(() => {
      if (paused.current) return;
      const next = (current.current + 1) % heroSlides.length;
      current.current = next;
      listRef.current?.scrollToOffset({ offset: next * width, animated: true });
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [width]);

  const settle = useCallback(
    (x: number) => {
      current.current = Math.round(x / width);
      paused.current = false;
    },
    [width],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: HeroSlide; index: number }) => (
      <Slide slide={item} index={index} width={width} scrollX={scrollX} scrollY={scrollY} />
    ),
    [width, scrollX, scrollY],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: width, offset: width * index, index }),
    [width],
  );

  return (
    <View style={styles.hero}>
      <Animated.FlatList
        ref={listRef as never}
        data={heroSlides}
        keyExtractor={(s: HeroSlide) => s.id}
        renderItem={renderItem as never}
        getItemLayout={getItemLayout}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          paused.current = true;
        }}
        onScrollEndDrag={(e) => settle(e.nativeEvent.contentOffset.x)}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.x)}
        windowSize={3}
        initialNumToRender={1}
      />
      <HomeTopBar />
      <View style={styles.dots} pointerEvents="none">
        {heroSlides.map((s, i) => (
          <Dot key={s.id} index={i} width={width} scrollX={scrollX} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: HERO_HEIGHT, backgroundColor: colors.tealInk, overflow: 'hidden' },
  scrimTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 200 },
  scrimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: HERO_HEIGHT * 0.7 },
  content: { position: 'absolute', left: gutter, right: gutter, bottom: 56, gap: spacing.md },
  title: { fontSize: 40, lineHeight: 44 },
  cta: { flexDirection: 'row', marginTop: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dots: { position: 'absolute', bottom: 22, left: gutter, flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 8, borderRadius: radii.pill, backgroundColor: colors.gold },
});
