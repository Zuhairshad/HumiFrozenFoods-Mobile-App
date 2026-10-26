import { useEffect } from 'react';
import { Linking } from 'react-native';
import { handleURLCallback } from '@stripe/stripe-react-native';
import { stripeAvailable } from '@/lib/stripe/StripeProvider';
import { classifyIncomingUrl } from './stripe-redirect';

/**
 * Stripe docs ("Set up a return URL"): forward every incoming URL (and the initial one) to the SDK via
 * `handleURLCallback`, which returns false for URLs that are not Stripe's. No-op without a publishable key.
 */
export function useStripeUrlForwarding(): void {
  useEffect(() => {
    if (!stripeAvailable) return;
    const forward = (url: string | null | undefined) => {
      if (!classifyIncomingUrl(url)?.forwardToStripe || !url) return;
      handleURLCallback(url).catch(() => undefined);
    };
    Linking.getInitialURL()
      .then(forward)
      .catch(() => undefined);
    const sub = Linking.addEventListener('url', (e) => forward(e.url));
    return () => sub.remove();
  }, []);
}
