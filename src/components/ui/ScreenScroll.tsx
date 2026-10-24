import { ComponentProps, ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabInset } from '@/hooks/useTabInset';
import { useTheme } from '@/hooks/useTheme';

type AnimatedScrollProps = ComponentProps<typeof Animated.ScrollView>;

export interface ScreenScrollProps extends Omit<AnimatedScrollProps, 'children' | 'contentContainerStyle'> {
  children?: ReactNode;
  /** `groupedBackground` instead of `background`. */
  grouped?: boolean;
  /**
   * Pad the bottom for the floating tab bar (tab-root screens). Default false: pushed screens get
   * the safe-area bottom + 24 instead.
   */
  tabInset?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * Standard scroller: system background, automatic content inset under transparent native headers,
 * keyboard dismiss on drag, tab-bar bottom padding. Renders an Animated.ScrollView so
 * `useAnimatedScrollHandler` works via `onScroll`. Side padding is NOT applied (shelves bleed).
 */
export function ScreenScroll({ children, grouped = false, tabInset = false, contentContainerStyle, style, ...rest }: ScreenScrollProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const tab = useTabInset();
  const bottom = tabInset ? tab : insets.bottom + 24;
  return (
    <Animated.ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      scrollIndicatorInsets={{ bottom: tabInset ? tab - 16 : 0 }}
      {...rest}
      style={[{ flex: 1, backgroundColor: grouped ? c.groupedBackground : c.background }, style]}
      contentContainerStyle={[{ paddingBottom: bottom }, contentContainerStyle]}
    >
      {children}
    </Animated.ScrollView>
  );
}
