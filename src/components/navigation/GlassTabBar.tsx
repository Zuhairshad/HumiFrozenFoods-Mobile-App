import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '@/hooks/useCart';
import { useTheme } from '@/hooks/useTheme';
import { haptics } from '@/hooks/useHaptics';
import { TabIcon } from './TabIcon';

/* Design spec section 3 (final values). */
const CAPSULE_HEIGHT = 62;
const CAPSULE_RADIUS = 31;
const SIDE_MARGIN = 20;
const MAX_WIDTH = 440;
const PAD = 6;
const SLOT_HEIGHT = CAPSULE_HEIGHT - PAD * 2; // 50
const PILL_RADIUS = 25;

/**
 * Frosted glass that follows the app theme, like the Instagram iOS 26 bar: a BlurView frosts
 * whatever scrolls behind, Liquid Glass on top adds the rim and lensing. Dark icons in light
 * mode, light icons in dark mode. Keep tints light: a heavy tint turns it into a solid slab.
 */
interface GlassPalette {
  scheme: 'light' | 'dark';
  tint: string;
  blurTint: 'systemThinMaterialLight' | 'systemThinMaterialDark';
  solid: string;
  stroke: string;
  highlight: string;
  pillFill: string;
  pillStroke: string;
  iconActive: string;
  iconInactive: string;
  badgeBorder: string;
}

const LIGHT_GLASS: GlassPalette = {
  scheme: 'light',
  tint: 'rgba(255,255,255,0.18)',
  blurTint: 'systemThinMaterialLight',
  solid: 'rgba(250,250,248,0.97)',
  stroke: 'rgba(14,27,27,0.10)',
  highlight: 'rgba(255,255,255,0.70)',
  pillFill: 'rgba(14,27,27,0.08)',
  pillStroke: 'rgba(14,27,27,0.06)',
  iconActive: '#0E1B1B',
  iconInactive: 'rgba(14,27,27,0.62)',
  badgeBorder: 'rgba(255,255,255,0.95)',
};

const DARK_GLASS: GlassPalette = {
  scheme: 'dark',
  tint: 'rgba(20,28,28,0.22)',
  blurTint: 'systemThinMaterialDark',
  solid: 'rgba(30,38,38,0.96)',
  stroke: 'rgba(255,255,255,0.20)',
  highlight: 'rgba(255,255,255,0.14)',
  pillFill: 'rgba(255,255,255,0.16)',
  pillStroke: 'rgba(255,255,255,0.10)',
  iconActive: '#FFFFFF',
  iconInactive: 'rgba(255,255,255,0.66)',
  badgeBorder: 'rgba(8,24,25,0.9)',
};

/** Soft float shadow (light mode only; dark mode has no shadows, 2.5). Outset boxShadow
 * is drawn outside the capsule, so it never darkens the glass itself. */
const FLOAT_SHADOW = '0 8px 24px rgba(8,48,47,0.10)';
const BADGE_FILL = '#C0392B';

/** snappy spring (2.6) */
const SNAPPY = { damping: 24, stiffness: 300, mass: 1 };
/** press spring */
const PRESS = { damping: 22, stiffness: 420, mass: 0.6 };
/** bouncy spring */
const BOUNCY = { damping: 14, stiffness: 210, mass: 0.9 };

const LABELS: Record<string, string> = {
  index: 'Home',
  shop: 'Shop',
  search: 'Search',
  cart: 'Cart',
  account: 'Account',
};

function useGlassCapability(): boolean {
  // Gate per tech-notes: iOS only, API present and Liquid Glass available.
  if (Platform.OS !== 'ios') return false;
  try {
    return isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

function useReduceTransparency(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, () => setVisible(true));
    const b = Keyboard.addListener(hideEvt, () => setVisible(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return visible;
}

function accessibilityLabelFor(routeName: string, title: string | undefined, count: number): string {
  const base = LABELS[routeName] ?? title ?? routeName;
  if (routeName !== 'cart') return base;
  if (count <= 0) return `${base}, empty`;
  return `${base}, ${count} ${count === 1 ? 'item' : 'items'}`;
}

export function GlassTabBar({ state, descriptors, emitter, navigateToTab, insets: navInsets }: BottomTabBarProps) {
  const safe = useSafeAreaInsets();
  const bottomInset = navInsets?.bottom ?? safe.bottom;
  const { width: windowWidth } = useWindowDimensions();
  const { isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const glass = useGlassCapability();
  const reduceTransparency = useReduceTransparency();
  const keyboardVisible = useKeyboardVisible();
  const { count } = useCart();

  const routes = state.routes;
  const n = Math.max(routes.length, 1);
  const capsuleWidth = Math.min(windowWidth - SIDE_MARGIN * 2, MAX_WIDTH);
  const slotWidth = (capsuleWidth - PAD * 2) / n;
  const bottom = Math.max(bottomInset - 8, 12);

  // Sliding pill: `position` follows the active index with the snappy spring.
  const position = useSharedValue(state.index);
  const from = useSharedValue(state.index);
  const to = useSharedValue(state.index);
  const hidden = useSharedValue(0);

  useEffect(() => {
    from.set(position.get());
    to.set(state.index);
    position.set(
      reducedMotion
        ? withTiming(state.index, { duration: 150 })
        : withSpring(state.index, SNAPPY),
    );
  }, [state.index, reducedMotion, position, from, to]);

  useEffect(() => {
    hidden.set(withTiming(keyboardVisible ? 1 : 0, { duration: 200 }));
  }, [keyboardVisible, hidden]);

  const pillStyle = useAnimatedStyle(() => {
    const span = to.get() - from.get();
    const frac = span === 0 ? 1 : (position.get() - from.get()) / span;
    // Stretch to 1.08 at mid-travel then return (skipped with reduced motion).
    const stretch = reducedMotion ? 1 : 1 + 0.08 * Math.sin(Math.PI * Math.min(Math.max(frac, 0), 1));
    return {
      transform: [{ translateX: position.get() * slotWidth }, { scaleX: stretch }],
    };
  });

  // Fade/slide away while the keyboard is open. On the glass path only translate:
  // opacity < 1 on a GlassView ancestor makes the glass disappear.
  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(hidden.get(), [0, 1], [0, CAPSULE_HEIGHT + bottom + 24]) }],
    opacity: glass ? 1 : interpolate(hidden.get(), [0, 1], [1, 0]),
  }));

  const onPressTab = useCallback(
    (routeKey: string, focused: boolean) => {
      const event = emitter.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
      // Re-tapping the active tab only emits tabPress; screens scroll to top via useScrollToTop.
      if (!focused && !event.defaultPrevented) {
        haptics.selection();
        navigateToTab(routeKey);
      }
    },
    [emitter, navigateToTab],
  );

  const onLongPressTab = useCallback(
    (routeKey: string) => {
      emitter.emit({ type: 'tabLongPress', target: routeKey });
    },
    [emitter],
  );

  const solid = reduceTransparency || Platform.OS === 'android';
  const palette = isDark ? DARK_GLASS : LIGHT_GLASS;

  return (
    <Animated.View
      pointerEvents={keyboardVisible ? 'none' : 'box-none'}
      style={[styles.wrap, { bottom }, wrapStyle]}
    >
      <View
        accessibilityRole="tablist"
        style={[
          styles.capsule,
          { width: capsuleWidth },
          !isDark && { boxShadow: FLOAT_SHADOW },
          solid && { backgroundColor: palette.solid },
        ]}
      >
        {/* Material layers */}
        {/* Frost: blur whatever is behind the capsule. */}
        {!solid ? (
          <View style={[StyleSheet.absoluteFill, styles.rounded, styles.clip]} pointerEvents="none">
            <BlurView tint={palette.blurTint} intensity={80} style={StyleSheet.absoluteFill} />
            {!glass ? <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.tint }]} /> : null}
          </View>
        ) : null}
        {/* iOS 26: Liquid Glass over the frost for the specular rim and lensing. */}
        {glass && !solid ? (
          <GlassView
            glassEffectStyle="regular"
            isInteractive
            tintColor={palette.tint}
            colorScheme={palette.scheme}
            style={[StyleSheet.absoluteFill, styles.rounded]}
          />
        ) : null}
        {/* Rim + top highlight on every path, so the capsule edge reads on any background. */}
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.rounded, styles.stroke, { borderColor: palette.stroke }]}
        />
        <View pointerEvents="none" style={[styles.highlight, { backgroundColor: palette.highlight }]} />

        {/* Active pill */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            { width: slotWidth, backgroundColor: palette.pillFill, borderColor: palette.pillStroke },
            pillStyle,
          ]}
        />

        {/* Slots */}
        <View style={styles.row}>
          {routes.map((route, index) => {
            const focused = state.index === index;
            const { options } = descriptors[route.key];
            return (
              <TabSlot
                key={route.key}
                routeName={route.name}
                width={slotWidth}
                focused={focused}
                label={accessibilityLabelFor(route.name, options.title, count)}
                badge={route.name === 'cart' ? count : 0}
                reducedMotion={reducedMotion}
                palette={palette}
                onPress={() => onPressTab(route.key, focused)}
                onLongPress={() => onLongPressTab(route.key)}
              />
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

interface TabSlotProps {
  routeName: string;
  width: number;
  focused: boolean;
  label: string;
  badge: number;
  reducedMotion: boolean;
  palette: GlassPalette;
  onPress: () => void;
  onLongPress: () => void;
}

function TabSlot({
  routeName,
  width,
  focused,
  label,
  badge,
  reducedMotion,
  palette,
  onPress,
  onLongPress,
}: TabSlotProps) {
  const scale = useSharedValue(1);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const pressIn = () => {
    scale.set(reducedMotion ? withTiming(0.99, { duration: 100 }) : withSpring(0.88, PRESS));
  };
  const pressOut = () => {
    scale.set(reducedMotion ? withTiming(1, { duration: 150 }) : withSpring(1, PRESS));
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      hitSlop={{ top: 6, bottom: 6 }}
      style={[styles.slot, { width }]}
    >
      <Animated.View style={[styles.iconWrap, iconStyle]}>
        <TabIcon
          routeName={routeName}
          focused={focused}
          color={focused ? palette.iconActive : palette.iconInactive}
        />
        {badge > 0 ? (
          <CartBadge count={badge} reducedMotion={reducedMotion} borderColor={palette.badgeBorder} />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

function CartBadge({
  count,
  reducedMotion,
  borderColor,
}: {
  count: number;
  reducedMotion: boolean;
  borderColor: string;
}) {
  const scale = useSharedValue(1);
  const previous = useRef(count);

  useEffect(() => {
    if (count > previous.current) {
      haptics.light();
      if (!reducedMotion) {
        scale.set(withSequence(withSpring(1.35, BOUNCY), withSpring(1, BOUNCY)));
      }
    }
    previous.current = count;
  }, [count, reducedMotion, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.badge, { borderColor }, style]}
    >
      <Text allowFontScaling={false} style={styles.badgeText}>
        {count > 9 ? '9+' : String(count)}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  capsule: {
    height: CAPSULE_HEIGHT,
    borderRadius: CAPSULE_RADIUS,
    borderCurve: 'continuous',
    padding: PAD,
  },
  rounded: { borderRadius: CAPSULE_RADIUS, borderCurve: 'continuous' },
  clip: { overflow: 'hidden' },
  stroke: { borderWidth: StyleSheet.hairlineWidth },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 1,
  },
  pill: {
    position: 'absolute',
    left: PAD,
    top: PAD,
    height: SLOT_HEIGHT,
    borderRadius: PILL_RADIUS,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', height: SLOT_HEIGHT },
  slot: { height: SLOT_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -2,
    left: 16,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: BADGE_FILL,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
