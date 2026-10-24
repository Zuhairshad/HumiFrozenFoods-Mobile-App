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

const GLASS_TINT = 'rgba(8,24,25,0.52)';
const GLASS_SOLID = 'rgba(14,27,27,0.94)';
const STROKE = 'rgba(255,255,255,0.16)';
const HIGHLIGHT = 'rgba(255,255,255,0.10)';
const PILL_FILL = 'rgba(255,255,255,0.16)';
const PILL_STROKE = 'rgba(255,255,255,0.10)';
const ICON_ACTIVE = '#FFFFFF';
const ICON_INACTIVE = 'rgba(255,255,255,0.62)';
const BADGE_FILL = '#C0392B';
const BADGE_BORDER = 'rgba(8,24,25,0.9)';

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
  const showShadow = !isDark;

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
          showShadow && !glass && styles.shadow,
          solid && { backgroundColor: GLASS_SOLID },
        ]}
      >
        {/* Material layers */}
        {glass && !reduceTransparency ? (
          <GlassView
            glassEffectStyle="regular"
            isInteractive
            tintColor={GLASS_TINT}
            colorScheme="dark"
            style={[StyleSheet.absoluteFill, styles.rounded]}
          />
        ) : (
          <>
            {!solid ? (
              <View style={[StyleSheet.absoluteFill, styles.rounded, styles.clip]} pointerEvents="none">
                <BlurView
                  tint="systemChromeMaterialDark"
                  intensity={90}
                  style={StyleSheet.absoluteFill}
                />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: GLASS_TINT }]} />
              </View>
            ) : null}
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, styles.rounded, styles.stroke]}
            />
            <View pointerEvents="none" style={styles.highlight} />
          </>
        )}

        {/* Active pill */}
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, { width: slotWidth }, pillStyle]}
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
        <TabIcon routeName={routeName} focused={focused} color={focused ? ICON_ACTIVE : ICON_INACTIVE} />
        {badge > 0 ? <CartBadge count={badge} reducedMotion={reducedMotion} /> : null}
      </Animated.View>
    </Pressable>
  );
}

function CartBadge({ count, reducedMotion }: { count: number; reducedMotion: boolean }) {
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
      style={[styles.badge, style]}
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
  shadow: {
    shadowColor: '#08302F',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  rounded: { borderRadius: CAPSULE_RADIUS, borderCurve: 'continuous' },
  clip: { overflow: 'hidden' },
  stroke: { borderWidth: StyleSheet.hairlineWidth, borderColor: STROKE },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 1,
    backgroundColor: HIGHLIGHT,
  },
  pill: {
    position: 'absolute',
    left: PAD,
    top: PAD,
    height: SLOT_HEIGHT,
    borderRadius: PILL_RADIUS,
    borderCurve: 'continuous',
    backgroundColor: PILL_FILL,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PILL_STROKE,
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
    borderColor: BADGE_BORDER,
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
