import { getProduct } from '../../data';
import { computeTotals } from '../pricing';
import { AppApiError } from './errors';
import type { StripeGateway } from './stripe-gateway';
import type { PricedLine, Pricing } from './types';

const pence = (pounds: number) => Math.round(pounds * 100);

/** DEMO ONLY: prices locally with the FALLBACK delivery rule, waits a beat, returns an obviously fake secret. */
export function createMockStripeGateway(): StripeGateway {
  return {
    mode: 'mock',
    async createPaymentIntent(draft) {
      await new Promise<void>((r) => setTimeout(r, 600));
      const lines: PricedLine[] = [];
      for (const l of draft.lines) {
        const p = getProduct(l.productId);
        if (!p) throw new AppApiError({ status: 422, code: 'unprocessable', message: `Product ${l.productId} is no longer available.` });
        lines.push({
          productId: p.id,
          name: p.name,
          image: p.image,
          unitPricePence: pence(p.price),
          quantity: l.quantity,
          lineTotalPence: pence(p.price) * l.quantity,
        });
      }
      const t = computeTotals(lines.map((l) => ({ price: l.unitPricePence / 100, quantity: l.quantity })));
      const pricing: Pricing = {
        subtotalPence: pence(t.subtotal),
        deliveryPence: pence(t.delivery),
        discountPence: 0,
        totalPence: pence(t.total),
        currency: 'gbp',
        promoCode: null,
        freeDeliveryRemainingPence: pence(t.freeDeliveryRemaining),
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
