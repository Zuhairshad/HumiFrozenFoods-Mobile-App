/**
 * Stripe `returnURL` handling (R7). PaymentSheet is given `Linking.createURL('stripe-redirect')`
 * (`humi://stripe-redirect`); after a 3DS web view or a redirect-based payment method the OS opens the app
 * on that URL. Per the Stripe React Native docs the root component must forward incoming URLs to
 * `handleURLCallback`, and Expo Router also tries to route the URL, so `src/app/stripe-redirect.tsx` exists
 * to swallow it instead of showing the not-found screen. Both decisions are pure functions so they can be tested.
 */

export type IncomingUrlAction =
  | { kind: 'stripe-redirect'; forwardToStripe: true; redirectStatus?: string }
  | { kind: 'other'; forwardToStripe: true };

/** The last meaningful path segment of a deep link, ignoring query, hash and the Expo Go `/--/` prefix. */
function pathOf(url: string): string[] {
  const noQuery = url.split('#')[0].split('?')[0];
  const afterScheme = noQuery.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  return afterScheme
    .split('/')
    .filter((p) => p.length > 0 && p !== '--');
}

/**
 * Classify a URL the app was opened with. Every URL is forwarded to Stripe (the docs: `handleURLCallback`
 * returns false for URLs that are not Stripe's), so `forwardToStripe` is always true; `kind` tells the
 * caller whether this is the redirect that must not reach the router as an unknown screen.
 */
export function classifyIncomingUrl(url: string | null | undefined): IncomingUrlAction | null {
  if (!url) return null;
  const segments = pathOf(url);
  // `humi://stripe-redirect` parses with the host as the first segment; `exp://host/--/stripe-redirect` as the last.
  const isRedirect = segments[segments.length - 1] === 'stripe-redirect';
  if (!isRedirect) return { kind: 'other', forwardToStripe: true };
  const status = /[?&]redirect_status=([^&#]+)/.exec(url)?.[1];
  return { kind: 'stripe-redirect', forwardToStripe: true, redirectStatus: status ? decodeURIComponent(status) : undefined };
}

export type StripeRedirectNavigation = 'back' | 'home';

/**
 * What the `stripe-redirect` route does once it is on screen. Normally the app was only backgrounded, so the
 * route sits on top of checkout and going back reveals it again (the sheet's own result still arrives through
 * `presentPaymentSheet`). When the app was killed during authentication there is nothing to go back to: land
 * on home; the pending order is recovered by the launch reconciliation.
 */
export function stripeRedirectNavigation(canGoBack: boolean): StripeRedirectNavigation {
  return canGoBack ? 'back' : 'home';
}
