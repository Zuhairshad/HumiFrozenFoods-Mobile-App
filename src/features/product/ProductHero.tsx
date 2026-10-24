import { useEffect } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation,
  SharedValue,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { FadeImage, IconButton } from '@/components/ui';
import { haptics } from '@/hooks';
import { useFavoritesStore } from '@/store/favorites';
import { gradients, gutter } from '@/theme';
import type { Product } from '@/types';

export const HERO_HEIGHT = 440;

interface ProductHeroProps {
  product: Product;
  scrollY: SharedValue<number>;
}

/** Parallax image, rendered behind the scroll view. */
export function HeroImage({ product, scrollY }: ProductHeroProps) {
  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-HERO_HEIGHT, 0, HERO_HEIGHT], [-HERO_HEIGHT / 2, 0, HERO_HEIGHT * 0.4], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [-HERO_HEIGHT, 0], [2.2, 1], Extrapolation.CLAMP) },
    ],
  }));
  return (
    <Animated.View style={[styles.hero, imageStyle]} pointerEvents="none">
      <FadeImage uri={product.image} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient colors={gradients.scrimTop} style={styles.topScrim} />
    </Animated.View>
  );
}

/** Floating glass controls: back, favourite, share. */
export function HeroActions({ product, scrollY }: ProductHeroProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFav = useFavoritesStore((s) => s.ids.includes(product.id));
  const toggle = useFavoritesStore((s) => s.toggle);
  const pop = useSharedValue(1);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scrollY.value, [-100, 0], [60, 0], Extrapolation.CLAMP) }],
  }));
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  useEffect(() => {
    pop.value = 1;
  }, [product.id, pop]);

  const onFav = () => {
    const adding = !isFav;
    toggle(product.id);
    haptics[adding ? 'success' : 'light']();
    pop.value = withSequence(withSpring(1.4, { damping: 6, stiffness: 400 }), withSpring(1, { damping: 8, stiffness: 260 }));
  };

  const onShare = () => {
    Share.share({ message: `${product.name} from Humi's Frozen Foods — https://humisfrozenfoods.com` }).catch(() => {});
  };

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <Animated.View style={[styles.actions, { top: insets.top + 8 }, rowStyle]} pointerEvents="box-none">
      <IconButton icon="chevron-back" variant="glass" onPress={onBack} accessibilityLabel="Go back" />
      <View style={styles.right}>
        <Animated.View style={heartStyle}>
          <IconButton
            icon={isFav ? 'heart' : 'heart-outline'}
            variant="glass"
            onPress={onFav}
            accessibilityLabel={isFav ? 'Remove from favourites' : 'Add to favourites'}
          />
        </Animated.View>
        <IconButton icon="share-outline" variant="glass" onPress={onShare} accessibilityLabel="Share product" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hero: { position: 'absolute', top: 0, left: 0, right: 0, height: HERO_HEIGHT, overflow: 'hidden' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  actions: {
    position: 'absolute',
    left: gutter,
    right: gutter,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  right: { flexDirection: 'row', gap: 10 },
});
