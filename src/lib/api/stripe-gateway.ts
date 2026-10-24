import { getProduct } from '@/data';
import { computeTotals, isValidPromo } from '@/lib/pricing';
import { GatewayError } from './errors';
import { API_BASE_URL, apiRequest } from './http';
import type { CreatePaymentIntentRequest, CreatePaymentIntentResponse, OrderDraft, OrderLineDto, PricingDto } from './types';

export interface PaymentIntentResult extends CreatePaymentIntentResponse {
  /** True only for the offline mock. In demo mode no payment is ever taken or claimed. */
  demo: boolean;
}

export interface StripeGateway {
  readonly mode: 'http' | 'mock';
  /** Server prices the draft, creates the order + PaymentIntent and returns the secret. */
  createPaymentIntent(draft: OrderDraft, opts: { idempotencyKey: string }): Promise<PaymentIntentResult>;
}

export function makeIdempotencyKey(): string {
  return `co_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** HTTP implementation: POST {EXPO_PUBLIC_API_BASE_URL}/v1/checkout/payment-intent */
export function createHttpStripeGateway(baseUrl: string): StripeGateway {
  return {
    mode: 'http',
    async createPaymentIntent(draft, { idempotencyKey }) {
      const body: CreatePaymentIntentRequest = { ...draft, idempotencyKey };
      const res = await apiRequest<CreatePaymentIntentResponse>(baseUrl, {
        method: 'POST',
        path: '/v1/checkout/payment-intent',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      if (!res.clientSecret || !res.orderId || !res.guestToken) {
        throw new GatewayError('server', 'Unexpected response from the server.');
      }
      return { ...res, demo: false };
    },
  };
}

const pence = (pounds: number) => Math.round(pounds * 100);

/** Offline mock: prices locally, waits a beat, returns an obviously fake secret. */
export function createMockStripeGateway(): StripeGateway {
  return {
    mode: 'mock',
    async createPaymentIntent(draft) {
      await new Promise<void>((r) => setTimeout(r, 600));
      const lines: OrderLineDto[] = [];
      for (const l of draft.lines) {
        const p = getProduct(l.productId);
        if (!p) throw new GatewayError('validation', `Product ${l.productId} is no longer available.`, { status: 422 });
        lines.push({ productId: p.id, name: p.name, unitPricePence: pence(p.price), quantity: l.quantity, image: p.image });
      }
      const promoApplied = !!draft.promoCode && isValidPromo(draft.promoCode);
      const t = computeTotals(
        lines.map((l) => ({ price: l.unitPricePence / 100, quantity: l.quantity })),
        { promoApplied },
      );
      const pricing: PricingDto = {
        subtotalPence: pence(t.subtotal),
        deliveryPence: pence(t.delivery),
        discountPence: pence(t.discount),
        totalPence: pence(t.total),
        currency: 'gbp',
        promoCode: promoApplied ? 'HUMI15' : undefined,
      };
      const n = Math.floor(10000 + Math.random() * 90000);
      return {
        orderId: `demo_${n}`,
        orderNumber: `HUMI-${n}`,
        guestToken: 'demo-guest-token',
        clientSecret: 'demo_client_secret_not_a_real_payment',
        pricing,
        lines,
        demo: true,
      };
    },
  };
}

let cached: StripeGateway | undefined;

/** HTTP when EXPO_PUBLIC_API_BASE_URL is set, otherwise the mock. */
export function getStripeGateway(): StripeGateway {
  cached ??= API_BASE_URL ? createHttpStripeGateway(API_BASE_URL) : createMockStripeGateway();
  return cached;
}
