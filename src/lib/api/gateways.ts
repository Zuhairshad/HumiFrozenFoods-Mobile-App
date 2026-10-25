import { getHttpClient, isDemoMode } from './http';
import { createMockStripeGateway } from './mock-stripe-gateway';
import { createHttpStripeGateway, type StripeGateway } from './stripe-gateway';

let cached: StripeGateway | undefined;

/** HTTP when EXPO_PUBLIC_API_BASE_URL is set, otherwise the labelled demo mock. */
export function getStripeGateway(): StripeGateway {
  cached ??= isDemoMode ? createMockStripeGateway() : createHttpStripeGateway(getHttpClient());
  return cached;
}
