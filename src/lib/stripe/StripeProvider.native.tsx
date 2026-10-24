import type { ReactNode } from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

export const MERCHANT_IDENTIFIER = 'merchant.com.humisfrozenfoods.app';
export const STRIPE_URL_SCHEME = 'humi';

const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

/** True when a publishable key is configured; payments show an "unavailable" state otherwise. */
export const stripeAvailable = publishableKey.length > 0;

export function AppStripeProvider({ children }: { children: ReactNode }) {
  // Without a key, Stripe is never initialised so the app cannot crash on launch.
  if (!stripeAvailable) return <>{children}</>;
  return (
    <StripeProvider
      publishableKey={publishableKey}
      merchantIdentifier={MERCHANT_IDENTIFIER}
      urlScheme={STRIPE_URL_SCHEME}
    >
      <>{children}</>
    </StripeProvider>
  );
}
