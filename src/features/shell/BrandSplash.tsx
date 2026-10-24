import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Minimum time the brand splash stays up (design spec 4.2). */
export const BRAND_SPLASH_MIN_MS = 3000;
/** Hard cap: the splash exits at this point even if data is not ready. */
export const BRAND_SPLASH_MAX_MS = 5000;

const REDUCED_MIN_MS = 1500;
const EXIT_MS = 450;
const REDUCED_EXIT_MS = 250;

/** Must equal the expo-splash-screen plugin `backgroundColor` in app.json. */
export const BRAND_SPLASH_BACKGROUND = '#08302F';
const GRADIENT = ['#08302F', '#0D4D4D', '#125B64'] as const;
const GOLD = '#E5A83B';

const STANDARD = Easing.bezier(0.2, 0, 0, 1);
const IN_OUT = Easing.bezier(0.42, 0, 0.58, 1);
const SMOOTH = { damping: 28, stiffness: 180, mass: 1 };

const MARK_SIZE = 120;

const MARK_SOURCE = require('../../../assets/splash-icon.png') as number;

export interface BrandSplashProps {
  /** Fonts loaded, stores hydrated and images prefetched. */
  ready: boolean;
  /** Called when the exit fade begins so the app beneath can reveal itself. */
  onExitStart?: (durationMs: number) => void;
  /** Called after the exit fade; the splash should then be unmounted. */
  onDone: () => void;
}

export function BrandSplash({ ready, onExitStart, onDone }: BrandSplashProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const minMs = reduced ? REDUCED_MIN_MS : BRAND_SPLASH_MIN_MS;
  const exitMs = reduced ? REDUCED_EXIT_MS : EXIT_MS;

  const [minElapsed, setMinElapsed] = useState(false);
  const [maxElapsed, setMaxElapsed] = useState(false);
  const exiting = useRef(false);

  const enterMark = useSharedValue(0);
  const enterGlow = useSharedValue(0);
  const enterWord = useSharedValue(0);
  const enterTag = useSharedValue(0);
  const markScale = useSharedValue(reduced ? 1 : 0.82);
  const settle = useSharedValue(1);
  const exit = useSharedValue(0);

  // Entrance timeline (4.2).
  useEffect(() => {
    if (reduced) {
      enterMark.set(withTiming(1, { duration: 400 }));
      enterGlow.set(withTiming(1, { duration: 400 }));
      enterWord.set(withDelay(200, withTiming(1, { duration: 400 })));
      enterTag.set(withDelay(400, withTiming(1, { duration: 400 })));
      return;
    }
    enterMark.set(withDelay(150, withTiming(1, { duration: 500, easing: STANDARD })));
    markScale.set(withDelay(150, withSpring(1, SMOOTH)));
    enterGlow.set(withDelay(150, withTiming(1, { duration: 900 })));
    enterWord.set(withDelay(900, withTiming(1, { duration: 600, easing: STANDARD })));
    enterTag.set(withDelay(1500, withTiming(1, { duration: 400 })));
    settle.set(withDelay(1500, withTiming(1.035, { duration: 1500, easing: Easing.linear })));
  }, [reduced, enterMark, enterGlow, enterWord, enterTag, markScale, settle]);

  useEffect(() => {
    const a = setTimeout(() => setMinElapsed(true), minMs);
    const b = setTimeout(() => setMaxElapsed(true), BRAND_SPLASH_MAX_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [minMs]);

  const finish = useCallback(() => onDone(), [onDone]);

  useEffect(() => {
    if (exiting.current) return;
    if (!(maxElapsed || (minElapsed && ready))) return;
    exiting.current = true;
    onExitStart?.(exitMs);
    exit.set(
      withTiming(1, { duration: exitMs, easing: IN_OUT }, (finished) => {
        if (finished) scheduleOnRN(finish);
      }),
    );
  }, [minElapsed, maxElapsed, ready, exitMs, exit, onExitStart, finish]);

  const hideNative = useCallback(() => {
    // Hide the native splash only once this overlay has laid out (no flicker).
    try {
      SplashScreen.hide();
    } catch {
      /* web / already hidden */
    }
  }, []);

  const rootStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.get() }));

  const glowStyle = useAnimatedStyle(() => ({ opacity: enterGlow.get() }));

  const groupStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : settle.get() * (1 + 0.082 * exit.get()) }],
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: enterMark.get(),
    transform: [{ scale: markScale.get() }],
  }));

  const wordStyle = useAnimatedStyle(() => ({
    opacity: enterWord.get(),
    letterSpacing: reduced ? -0.4 : interpolate(enterWord.get(), [0, 1], [6, -0.4]),
    transform: [{ translateY: reduced ? 0 : interpolate(enterWord.get(), [0, 1], [10, 0]) }],
  }));

  const tagStyle = useAnimatedStyle(() => ({ opacity: enterTag.get() }));

  return (
    <Animated.View
      style={[styles.root, rootStyle]}
      onLayout={hideNative}
      accessible
      accessibilityViewIsModal
      accessibilityRole="image"
      accessibilityLabel="Humi's Frozen Foods"
    >
      <StatusBar style="light" />
      <LinearGradient
        colors={GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.centerAnchor, { height: height * 0.92 }]} pointerEvents="none">
        <Animated.View style={[styles.glow, glowStyle]} />
        <Animated.View style={[styles.stack, groupStyle]}>
          <Animated.View style={markStyle}>
            <Image
              source={MARK_SOURCE}
              contentFit="contain"
              style={{ width: MARK_SIZE, height: MARK_SIZE }}
              accessible={false}
            />
          </Animated.View>
          <Animated.Text
            allowFontScaling={false}
            style={[styles.wordmark, wordStyle]}
            numberOfLines={1}
          >
            Humi&apos;s
          </Animated.Text>
          <Animated.View style={tagStyle}>
            <Text allowFontScaling={false} style={styles.tagline}>
              FROZEN FOODS
            </Text>
          </Animated.View>
        </Animated.View>
      </View>

      <Animated.View
        style={[styles.bottom, { bottom: insets.bottom + 32 }, tagStyle]}
        pointerEvents="none"
      >
        <Text allowFontScaling={false} style={styles.footer}>
          Halal. Made in the UK.
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 1000 },
  centerAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(229,168,59,0.06)',
    boxShadow: '0 0 90px 50px rgba(229,168,59,0.10)',
  },
  stack: { alignItems: 'center' },
  wordmark: {
    marginTop: 20,
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 44,
    lineHeight: 48,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  tagline: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 3.2,
    color: GOLD,
    textAlign: 'center',
  },
  bottom: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  footer: { fontSize: 12, lineHeight: 16, color: 'rgba(255,255,255,0.55)' },
});
