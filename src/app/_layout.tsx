import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '@/components/ui/Toast';
import { useReconcilePendingOrders, useStripeUrlForwarding } from '@/features/checkout';
import { BrandSplash, useAppReady } from '@/features/shell';
import { useLargeTitleHeaderOptions } from '@/features/shop/LargeTitleStack';
import { AppStripeProvider } from '@/lib/stripe/StripeProvider';
import { useCatalogSync } from '@/hooks/useProducts';
import { useTheme } from '@/hooks/useTheme';
import { useConfigSync } from '@/store/server-config';

// Keep the native splash up until the brand splash overlay has laid out.
SplashScreen.preventAutoHideAsync().catch(() => {});

const STANDARD = Easing.bezier(0.2, 0, 0, 1);
const REVEAL_MS = 480;

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <AppStripeProvider>
          <ToastProvider>
            <AppShell />
          </ToastProvider>
        </AppStripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppShell() {
  const { c, isDark } = useTheme();
  // Pushed screens set their own title; the root stack hides headers by default, so opt them back in.
  const pushedHeader = useLargeTitleHeaderOptions();
  const reduced = useReducedMotion();
  const ready = useAppReady();
  // Start live data at launch (not per screen) so deep links to any route have data.
  useCatalogSync();
  useConfigSync();
  // Stripe returnURL forwarding (3DS / redirects) and recovery of orders saved before a payment sheet opened.
  useStripeUrlForwarding();
  useReconcilePendingOrders();
  const [splashDone, setSplashDone] = useState(false);
  const reveal = useSharedValue(0);

  const onExitStart = useCallback(
    (durationMs: number) => {
      reveal.set(
        withTiming(1, { duration: reduced ? durationMs : REVEAL_MS, easing: STANDARD }),
      );
    },
    [reveal, reduced],
  );

  const onDone = useCallback(() => setSplashDone(true), []);

  // The Stack is mounted underneath from the start so the first screen is ready on cross-fade.
  const revealStyle = useAnimatedStyle(() => {
    const t = reveal.get();
    return {
      opacity: t,
      transform: reduced
        ? []
        : [{ translateY: 12 * (1 - t) }, { scale: 0.985 + 0.015 * t }],
    };
  });

  return (
    <View style={[styles.flex, { backgroundColor: c.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Animated.View style={[styles.flex, revealStyle]}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'default',
            contentStyle: { backgroundColor: c.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="product/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen
            name="sort-filter"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.5, 0.85],
              sheetInitialDetentIndex: 0,
              sheetGrabberVisible: true,
              sheetCornerRadius: 28,
              contentStyle: { backgroundColor: c.groupedBackground },
            }}
          />
          <Stack.Screen
            name="checkout"
            options={{
              presentation: 'modal',
              sheetGrabberVisible: true,
              contentStyle: { backgroundColor: c.groupedBackground },
            }}
          />
          <Stack.Screen
            name="order/[id]"
            options={{ gestureEnabled: false, animation: 'fade' }}
          />
          <Stack.Screen name="stripe-redirect" options={{ animation: 'none', gestureEnabled: false }} />
          <Stack.Screen name="orders/index" options={pushedHeader} />
          <Stack.Screen name="orders/[id]" options={pushedHeader} />
          <Stack.Screen
            name="orders/lookup"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.4, 0.7],
              sheetInitialDetentIndex: 0,
              sheetGrabberVisible: true,
              sheetCornerRadius: 28,
              contentStyle: { backgroundColor: c.groupedBackground },
            }}
          />
          <Stack.Screen name="favorites" options={pushedHeader} />
          <Stack.Screen name="about" options={pushedHeader} />
          <Stack.Screen name="contact" options={pushedHeader} />
          <Stack.Screen name="b2b" options={pushedHeader} />
          <Stack.Screen name="sales-rep" options={pushedHeader} />
        </Stack>
      </Animated.View>
      {splashDone ? null : <BrandSplash ready={ready} onExitStart={onExitStart} onDone={onDone} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
