import { ReactNode } from 'react';
import { Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { tapHaptic } from './haptic';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 16, stiffness: 320, mass: 0.6 };

export interface PressableScaleProps {
  onPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
  scaleTo?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export function PressableScale({
  onPress,
  children,
  style,
  haptic = false,
  scaleTo = 0.96,
  disabled,
  accessibilityLabel,
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={() => {
        scale.value = withSpring(scaleTo, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      onPress={() => {
        if (haptic) tapHaptic('light');
        onPress?.();
      }}
      style={[animated, style]}
    >
      {children}
    </AnimatedPressable>
  );
}
