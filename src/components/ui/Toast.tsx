import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { useTabInset } from '@/hooks/useTabInset';
import { useTheme } from '@/hooks/useTheme';
import { durations, springs } from '@/theme/motion';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** ms, default 2400 */
  duration?: number;
  /** Distance from the screen bottom (default: above the tab bar). Pass a bigger value above a BuyBar. */
  bottomOffset?: number;
}

interface ToastApi {
  show: (options: ToastOptions) => void;
  hide: () => void;
}

const noop: ToastApi = { show: () => {}, hide: () => {} };
const ToastContext = createContext<ToastApi>(noop);

/** Imperative toasts. A no-op outside `ToastProvider`. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

interface ActiveToast extends ToastOptions {
  id: number;
}

export interface ToastProps extends ToastOptions {
  visible: boolean;
  onDismiss: () => void;
}

/** Presentational toast capsule (solid `elevated`, `float` shadow in light mode, stroke in dark). */
export function Toast({ message, actionLabel, onAction, visible, onDismiss, bottomOffset }: ToastProps) {
  const { c, isDark, shadow } = useTheme();
  const tabInset = useTabInset();
  const reduced = useReducedMotion();
  const y = useSharedValue(120);
  const o = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      o.set(withTiming(visible ? 1 : 0, { duration: durations.fast }));
      y.set(0);
      return;
    }
    y.set(visible ? withSpring(0, springs.snappy) : withTiming(120, { duration: durations.base }));
    o.set(withTiming(visible ? 1 : 0, { duration: durations.fast }));
  }, [visible, reduced, y, o]);

  const anim = useAnimatedStyle(() => ({ opacity: o.get(), transform: [{ translateY: y.get() }] }));

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[styles.host, { bottom: bottomOffset ?? tabInset + 8 }, anim]}
    >
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.capsule,
          shadow.float,
          {
            backgroundColor: c.elevated,
            borderColor: c.separator,
            borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
          },
        ]}
      >
        <AppText variant="subheadStrong" numberOfLines={2} style={styles.msg}>
          {message}
        </AppText>
        {actionLabel ? (
          <PressableScale
            onPress={() => {
              onAction?.();
              onDismiss();
            }}
            scaleTo={1}
            pressedOpacity={0.6}
            accessibilityLabel={actionLabel}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          >
            <AppText variant="subheadStrong" color="tint" maxScale={1.3}>
              {actionLabel}
            </AppText>
          </PressableScale>
        ) : null}
      </View>
    </Animated.View>
  );
}

/** Mount once near the root, inside the safe-area provider. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveToast | null>(null);
  const [visible, setVisible] = useState(false);
  const idRef = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(false);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setActive(null), 320);
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      idRef.current += 1;
      setActive({ ...options, id: idRef.current });
      setVisible(true);
      if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(options.message);
      hideTimer.current = setTimeout(hide, options.duration ?? 2400);
    },
    [hide],
  );

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (clearTimer.current) clearTimeout(clearTimer.current);
    },
    [],
  );

  const api = useMemo<ToastApi>(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {active ? <Toast key={active.id} {...active} visible={visible} onDismiss={hide} /> : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 20, right: 20, alignItems: 'center', zIndex: 900 },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderCurve: 'continuous',
    maxWidth: '100%',
  },
  msg: { flexShrink: 1 },
});
