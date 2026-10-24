import { useEffect } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { RoundButton } from '@/components/ui';
import { haptics } from '@/hooks';
import { useFavoritesStore } from '@/store/favorites';
import type { Product } from '@/types';

const BOUNCY = { damping: 14, stiffness: 210, mass: 0.9 } as const;

/** Glass round buttons floating over the photo: back, favourite, share. */
export function ProductHeaderButtons({ product }: { product: Product }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const isFav = useFavoritesStore((s) => s.ids.includes(product.id));
  const toggle = useFavoritesStore((s) => s.toggle);
  const pop = useSharedValue(1);

  useEffect(() => {
    pop.set(1);
  }, [product.id, pop]);

  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  const onFav = () => {
    const adding = !isFav;
    toggle(product.id);
    if (adding) haptics.success();
    else haptics.light();
    if (!reduceMotion) pop.set(withSequence(withSpring(1.3, BOUNCY), withSpring(1, BOUNCY)));
  };

  const onShare = () => {
    Share.share({ message: `${product.name} from Humi's Frozen Foods` }).catch(() => undefined);
  };

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={[styles.row, { top: insets.top + 8 }]} pointerEvents="box-none">
      <RoundButton icon="chevron.left" size={44} material="glass" onPress={onBack} accessibilityLabel="Back" />
      <View style={styles.right}>
        <Animated.View style={heartStyle}>
          <RoundButton
            icon="heart"
            filled={isFav}
            size={44}
            material="glass"
            onPress={onFav}
            accessibilityLabel={isFav ? 'Remove from favourites' : 'Add to favourites'}
          />
        </Animated.View>
        <RoundButton
          icon="square.and.arrow.up"
          size={44}
          material="glass"
          onPress={onShare}
          accessibilityLabel={`Share ${product.name}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  right: { flexDirection: 'row', gap: 12 },
});
