import { Tabs } from 'expo-router/js-tabs';
import { GlassTabBar } from '@/components/navigation/GlassTabBar';

/**
 * Five icon-only tabs rendered by the floating glass capsule (design spec section 3).
 * Screens (index, shop, search, cart, account) are owned by other agents; each screen
 * draws its own header (native large titles are configured per screen).
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false, lazy: true }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', lazy: false }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop', lazy: false }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}
