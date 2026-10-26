import { useMemo } from 'react';
import * as Linking from 'expo-linking';
import { PaymentSheetError, useStripe, type PaymentSheet } from '@stripe/stripe-react-native';
import { stripeAvailable } from '@/lib/stripe/StripeProvider';
import type { PaymentSheetAdapter, PaymentSheetColors } from './paymentSheetTypes';

/** Google Pay test environment follows the publishable key, not __DEV__. */
const STRIPE_TEST_MODE = (process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').startsWith('pk_test');

function appearance(c: PaymentSheetColors): PaymentSheet.AppearanceParams {
  return {
    colors: {
      primary: c.tint,
      background: c.elevated,
      componentBackground: c.groupedBackground,
      componentBorder: c.separator,
      componentDivider: c.separator,
      primaryText: c.label,
      secondaryText: c.labelSecondary,
      componentText: c.label,
      placeholderText: c.labelTertiary,
      icon: c.tint,
      error: c.destructive,
    },
    shapes: { borderRadius: 14, borderWidth: 0.5 },
    primaryButton: {
      shapes: { borderRadius: 27 },
      colors: { background: '#125B64', text: '#FFFFFF' },
    },
  };
}

export function usePaymentSheetAdapter(): PaymentSheetAdapter {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  return useMemo<PaymentSheetAdapter>(
    () => ({
      available: stripeAvailable,
      unavailableMessage: "Card payments aren't set up in this build.",
      async run({ clientSecret, billing, colors, onPresenting }) {
        const init = await initPaymentSheet({
          merchantDisplayName: "Humi's Frozen Foods",
          paymentIntentClientSecret: clientSecret,
          applePay: { merchantCountryCode: 'GB' },
          googlePay: { merchantCountryCode: 'GB', currencyCode: 'GBP', testEnv: STRIPE_TEST_MODE },
          returnURL: Linking.createURL('stripe-redirect'),
          allowsDelayedPaymentMethods: false,
          style: colors.isDark ? 'alwaysDark' : 'alwaysLight',
          defaultBillingDetails: {
            name: billing.name,
            email: billing.email,
            phone: billing.phone,
            address: {
              line1: billing.line1,
              line2: billing.line2,
              city: billing.city,
              postalCode: billing.postcode,
              country: 'GB',
            },
          },
          appearance: appearance(colors),
        });
        if (init.error) return { kind: 'failed', message: init.error.localizedMessage ?? init.error.message, code: 'InitFailed' };

        onPresenting();
        const res = await presentPaymentSheet();
        if (res.error) {
          if (res.error.code === PaymentSheetError.Canceled) return { kind: 'cancelled' };
          return {
            kind: 'failed',
            message: res.error.localizedMessage ?? res.error.message,
            code: res.error.code,
            declineCode: res.error.declineCode,
            errorType: res.error.type,
          };
        }
        return res.didCancel ? { kind: 'cancelled' } : { kind: 'success' };
      },
    }),
    [initPaymentSheet, presentPaymentSheet],
  );
}
