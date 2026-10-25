import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { type SharedValue, useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import { AppText, FadeImage, GlassSurface, PressableScale } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { formatPrice } from '@/lib/format';
import type { Product } from '@/types';
import { MiniAddButton } from './MiniAddButton';
import { useAddFeedback } from './useAddFeedback';

interface Props {
  product: Product;
  eyebrow: string;
  onPress: () => void;
  onAdd: () => void;
  /** Headline over the photo; defaults to the product name. */
  title?: string;
  /** Wide editorial image; defaults to the product photo. */
  imageUri?: string;
  /** Parent scroll offset, drives the subtle parallax. */
  scrollY?: SharedValue<number>;
}

const MARGIN = 20;

export const TodayCard = memo(function TodayCard({
  product,
  eyebrow,
  onPress,
  onAdd,
  title,
  imageUri,
  scrollY,
}: Props) {
  const { c, radius, shadow, isDark } = useTheme();
  const { width: screenW, fontScale } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { added, trigger } = useAddFeedback(1200);

  const width = screenW - MARGIN * 2;
  const height = Math.round(screenW * 1.2);
  const roomy = fontScale >= 1.35;
  const headline = title ?? product.name;

  const parallax = useAnimatedStyle(() => {
    if (reduceMotion || !scrollY) return { transform: [{ scale: 1.1 }] };
    const dy = Math.max(-24, Math.min(24, scrollY.get() * 0.12));
    return { transform: [{ translateY: dy }, { scale: 1.1 }] };
  });

  const available = product.inStock;
  const handleAdd = () => {
    if (!available) return;
    onAdd();
    trigger();
  };

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.96}
      haptic="none"
      accessibilityLabel={`Featured: ${product.name}, from ${formatPrice(product.price)}. Opens product`}
      style={[{ width, height }, radius('xl'), isDark ? undefined : shadow.card]}
    >
      <View style={[StyleSheet.absoluteFill, radius('xl'), styles.clip, { backgroundColor: c.fill }]}>
        <Animated.View style={[StyleSheet.absoluteFill, parallax]}>
          <FadeImage uri={imageUri ?? product.image} width={1080} style={StyleSheet.absoluteFill} contentFit="cover" />
        </Animated.View>
        <LinearGradient
          colors={['transparent', c.scrim]}
          locations={[0, 1]}
          style={styles.scrim}
          pointerEvents="none"
        />
        <View style={[styles.text, { bottom: roomy ? 116 : 92 }]} pointerEvents="none">
          <AppText variant="caption1" color="onTint" style={styles.eyebrow}>
            {eyebrow}
          </AppText>
          <AppText variant="brandDisplay" color="onTint" numberOfLines={2}>
            {headline}
          </AppText>
        </View>
        <View style={styles.barWrap}>
          <GlassSurface radius={20} tone="dark" style={styles.bar}>
            <View style={[styles.thumb, radius('sm'), { backgroundColor: c.fill }]}>
              <FadeImage uri={product.image} width={256} style={StyleSheet.absoluteFill} contentFit="cover" />
            </View>
            <View style={styles.barText}>
              <AppText variant="subheadStrong" color="onTint" numberOfLines={roomy ? 2 : 1}>
                {!available ? 'Out of stock' : product.readyInMins > 0 ? `Ready in ${product.readyInMins} min` : product.weight || 'Cook from frozen'}
              </AppText>
              <AppText variant="footnote" color="onTint" style={styles.sub} numberOfLines={1}>
                {`From ${formatPrice(product.price)}`}
              </AppText>
            </View>
            <MiniAddButton
              size={40}
              tone="solid"
              added={added}
              disabled={!available}
              onPress={handleAdd}
              accessibilityLabel={
                !available ? `${product.name} is out of stock` : added ? `${product.name} added` : `Add ${product.name} to cart`
              }
            />
          </GlassSurface>
        </View>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  text: { position: 'absolute', left: 20, right: 20 },
  eyebrow: { opacity: 0.8, marginBottom: 4 },
  barWrap: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  bar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 12 },
  thumb: { width: 40, height: 40, overflow: 'hidden' },
  barText: { flex: 1 },
  sub: { opacity: 0.72 },
});
