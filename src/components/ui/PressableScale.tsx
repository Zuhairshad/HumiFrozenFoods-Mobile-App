import { ReactNode } from 'react';
import { AccessibilityRole, AccessibilityState, GestureResponderEvent, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { durations, pressScale, springs } from '@/theme/motion';

import { HapticKind, fireHaptic } from './haptic';

export interface PressableScaleProps {
  children?: ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  /** Press-in scale (default 0.97). Reduced motion uses 0.99. */
  scaleTo?: number;
  /** Opacity while pressed (text buttons use 0.6). */
  pressedOpacity?: number;
  haptic?: 'none' | Extract<HapticKind, 'selection' | 'light'>;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  hitSlop?: PressableProps['hitSlop'];
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable with a UI-thread `press` spring scale. Defaults to role "button". */
export function PressableScale({
  children,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  scaleTo = pressScale.tile,
  pressedOpacity,
  haptic = 'none',
  disabled,
  style,
  accessibilityRole = 'button',
  accessibilityState,
  ...rest
}: PressableScaleProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
    opacity: opacity.get(),
  }));

  const target = reduced ? Math.max(scaleTo, pressScale.reduced) : scaleTo;

  return (
    <AnimatedPressable
      {...rest}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
      disabled={disabled}
      onPress={(e) => {
        if (haptic !== 'none') fireHaptic(haptic);
        onPress?.(e);
      }}
      onLongPress={onLongPress}
      onPressIn={() => {
        scale.set(reduced ? withTiming(target, { duration: durations.fast }) : withSpring(target, springs.press));
        if (pressedOpacity !== undefined) opacity.set(withTiming(pressedOpacity, { duration: 100 }));
        onPressIn?.();
      }}
      onPressOut={() => {
        scale.set(reduced ? withTiming(1, { duration: durations.fast }) : withSpring(1, springs.press));
        if (pressedOpacity !== undefined) opacity.set(withTiming(1, { duration: 150 }));
        onPressOut?.();
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
