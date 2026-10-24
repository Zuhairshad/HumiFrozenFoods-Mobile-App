import { StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import { FadeImage } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

/** Photo height as a multiple of screen width (spec 5.4). */
export const HERO_ASPECT = 1.07;
/** How far the content sheet overlaps the photo. */
export const SHEET_OVERLAP = 28;

export function useHeroHeight(): number {
  const { width } = useWindowDimensions();
  return Math.round(width * HERO_ASPECT);
}

interface ProductHeroProps {
  uri: string;
  scrollY: SharedValue<number>;
}

/**
 * Full-bleed photo rendered behind the scroll view. Pulling down stretches it
 * (anchored to the top); scrolling up moves it at 0.6x so the sheet slides over it.
 */
export function ProductHero({ uri, scrollY }: ProductHeroProps) {
  const { c } = useTheme();
  const height = useHeroHeight();
  const reduceMotion = useReducedMotion();

  const imageStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {};
    const y = scrollY.get();
    const stretch = Math.max(-y, 0);
    const scale = 1 + stretch / height;
    return {
      transform: [
        { translateY: (height * (scale - 1)) / 2 - interpolate(y, [0, height], [0, height * 0.6], Extrapolation.CLAMP) },
        { scale },
      ],
    };
  });

  return (
    <Animated.View style={[styles.hero, { height, backgroundColor: c.fill }]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, imageStyle]}>
        <FadeImage uri={uri} style={StyleSheet.absoluteFill} contentFit="cover" width={1080} />
      </Animated.View>
      <LinearGradient
        colors={[c.scrim, 'rgba(5,12,12,0)']}
        style={styles.topScrim}
        pointerEvents="none"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hero: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 90, opacity: 0.45 },
});
