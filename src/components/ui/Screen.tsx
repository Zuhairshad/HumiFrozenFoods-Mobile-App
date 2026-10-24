import { ReactNode } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControlProps,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, TAB_BAR_CLEARANCE } from '@/theme';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  bg?: string;
  edges?: ('top' | 'bottom')[];
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  footer?: ReactNode;
  /** Adds bottom padding so content clears the floating tab bar. */
  tabs?: boolean;
}

export function Screen({
  children,
  scroll = true,
  bg = colors.cream,
  edges = ['top', 'bottom'],
  contentContainerStyle,
  refreshControl,
  onScroll,
  footer,
  tabs,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const top = edges.includes('top') ? insets.top : 0;
  const bottomInset = edges.includes('bottom') ? insets.bottom : 0;
  // A footer or the tab bar already owns the bottom area.
  const contentBottom = tabs ? TAB_BAR_CLEARANCE : footer ? 16 : bottomInset;

  return (
    <View style={[styles.root, { backgroundColor: bg, paddingTop: top }]}>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[{ paddingBottom: contentBottom }, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, { paddingBottom: contentBottom }, contentContainerStyle]}>{children}</View>
      )}
      {footer ? <View style={{ paddingBottom: bottomInset }}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
});
