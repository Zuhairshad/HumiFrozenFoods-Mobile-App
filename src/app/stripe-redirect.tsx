import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { stripeRedirectNavigation } from '@/features/checkout/stripe-redirect';
import { useTheme } from '@/hooks/useTheme';

/**
 * Target of the Stripe `returnURL` (`humi://stripe-redirect`). It exists so a 3DS / redirect return never
 * lands on +not-found. The URL itself is forwarded to the Stripe SDK by `useStripeUrlForwarding` (root layout).
 * Web never gets here from Stripe (the web adapter does not use a returnURL); a manual visit just goes home.
 */
export default function StripeRedirectScreen() {
  const { c } = useTheme();
  useEffect(() => {
    if (stripeRedirectNavigation(router.canGoBack()) === 'back') router.back();
    else router.replace('/');
  }, []);
  return <View style={{ flex: 1, backgroundColor: c.background }} />;
}
