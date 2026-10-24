import { useEffect, useState } from 'react';
import { Keyboard, LayoutChangeEvent, Platform, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radii, shadows } from '@/theme';
import { useCart } from '@/hooks/useCart';
import { haptics } from '@/hooks/useHaptics';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { active: IconName; inactive: IconName; label: string }> = {
  index: { active: 'home', inactive: 'home-outline', label: 'Home' },
  shop: { active: 'storefront', inactive: 'storefront-outline', label: 'Shop' },
  cart: { active: 'bag-handle', inactive: 'bag-handle-outline', label: 'Cart' },
  more: { active: 'grid', inactive: 'grid-outline', label: 'More' },
};

const BAR_HEIGHT = 64;
const PAD = 6;
const ITEM_HEIGHT = BAR_HEIGHT - PAD * 2;
const SPRING = { damping: 18, stiffness: 220, mass: 0.8 };

export function FloatingTabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { count } = useCart();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [innerWidth, setInnerWidth] = useState(0);

  const routes = state.routes;
  const n = routes.length;
  const progress = useSharedValue(state.index);

  useEffect(() => {
    progress.value = withSpring(state.index, SPRING);
  }, [state.index, progress]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const b = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);

  const slot = innerWidth / n;

  const indicatorStyle = useAnimatedStyle(() => ({
    width: slot,
    transform: [{ translateX: progress.value * slot }],
  }));

  if (keyboardOpen) return null;

  const onLayout = (e: LayoutChangeEvent) => setInnerWidth(e.nativeEvent.layout.width);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 4 }]}
    >
      <View style={[styles.shadow, shadows.lg]}>
        <View style={styles.pill}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          ) : null}
          <View style={[StyleSheet.absoluteFill, styles.tint, Platform.OS !== 'ios' && styles.tintSolid]} />
          <View style={styles.inner} onLayout={onLayout}>
            {innerWidth > 0 && (
              <Animated.View style={[styles.indicator, indicatorStyle]} pointerEvents="none" />
            )}
            {routes.map((route, index) => {
              const meta = TAB_ICONS[route.name];
              const focused = state.index === index;
              const label = descriptors[route.key].options.title ?? meta?.label ?? route.name;
              const onPress = () => {
                const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  haptics.selection();
                  navigateToTab(route.key);
                }
              };
              return (
                <TabItem
                  key={route.key}
                  focused={focused}
                  icon={focused ? meta?.active : meta?.inactive}
                  label={label}
                  badge={route.name === 'cart' ? count : 0}
                  onPress={onPress}
                  onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
                />
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

type TabItemProps = {
  focused: boolean;
  icon: IconName | undefined;
  label: string;
  badge: number;
  onPress: () => void;
  onLongPress: () => void;
};

function TabItem({ focused, icon, label, badge, onPress, onLongPress }: TabItemProps) {
  const active = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    active.value = withTiming(focused ? 1 : 0, { duration: 220 });
  }, [focused, active]);

  const labelStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    maxWidth: interpolate(active.value, [0, 1], [0, 64]),
    marginLeft: interpolate(active.value, [0, 1], [0, 6]),
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.item}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={icon ?? 'ellipse'} size={22} color={focused ? colors.tealInk : colors.white} />
        {badge > 0 && (
          <View style={[styles.badge, focused && styles.badgeOnGold]}>
            <Animated.Text style={[styles.badgeText, focused && styles.badgeTextOnGold]}>
              {badge > 99 ? '99+' : badge}
            </Animated.Text>
          </View>
        )}
      </View>
      <Animated.Text numberOfLines={1} style={[styles.label, labelStyle]}>
        {label}
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 24 },
  shadow: { borderRadius: radii.pill, alignSelf: 'stretch', maxWidth: 420 },
  pill: {
    height: BAR_HEIGHT,
    borderRadius: radii.pill,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  tint: { backgroundColor: colors.glassDark },
  tintSolid: { backgroundColor: 'rgba(8,48,47,0.94)' },
  inner: { flex: 1, flexDirection: 'row', padding: PAD },
  indicator: {
    position: 'absolute',
    left: PAD,
    top: PAD,
    height: ITEM_HEIGHT,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  item: { flex: 1, height: ITEM_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  label: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    color: colors.tealInk,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.tealInk,
  },
  badgeOnGold: { backgroundColor: colors.tealInk, borderColor: colors.gold },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 10, lineHeight: 12, color: colors.tealInk },
  badgeTextOnGold: { color: colors.gold },
});
