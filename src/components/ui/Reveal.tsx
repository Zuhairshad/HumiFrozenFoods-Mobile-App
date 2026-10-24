import { ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInLeft, FadeInRight } from 'react-native-reanimated';

export interface RevealProps {
  children: ReactNode;
  delay?: number;
  from?: 'bottom' | 'left' | 'right' | 'none';
  style?: StyleProp<ViewStyle>;
}

export function Reveal({ children, delay = 0, from = 'bottom', style }: RevealProps) {
  const base =
    from === 'bottom' ? FadeInDown : from === 'left' ? FadeInLeft : from === 'right' ? FadeInRight : FadeIn;
  const entering =
    from === 'none' ? base.delay(delay).duration(500) : base.delay(delay).duration(550).springify().damping(18);
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
