import type { ReactNode } from 'react';

export const MERCHANT_IDENTIFIER = 'merchant.com.humisfrozenfoods.app';
export const STRIPE_URL_SCHEME = 'humi';

/** Payments are not available on web (no Stripe RN SDK); checkout shows a notice instead. */
export const stripeAvailable = false;

export function AppStripeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
