import { describe, expect, it, vi } from 'vitest';
import { createCheckoutMachine } from '../../src/features/checkout/checkout-machine';
import { AppApiError } from '../../src/lib/api/errors';
import { createHttpStripeGateway, type PaymentIntentResult } from '../../src/lib/api/stripe-gateway';
import type { HttpClient } from '../../src/lib/api/http';
import type { OrderDraft } from '../../src/lib/api/types';

const draft: OrderDraft = {
  lines: [{ productId: 'a', quantity: 1 }],
  contact: { name: 'Sam Lee', email: 's@l.co', phone: '07000000000' },
  address: { line1: '1 High St', city: 'Leeds', postcode: 'LS1 1AA' },
  slot: { date: '2026-10-26', window: 'morning' },
};
const intent: PaymentIntentResult = {
  orderId: 'o1',
  orderNumber: 'N1',
  guestToken: 'tok',
  clientSecret: 'cs',
  pricing: { subtotalPence: 2700, deliveryPence: 0, discountPence: 0, totalPence: 2700, currency: 'gbp', promoCode: null, freeDeliveryRemainingPence: 0 },
  lines: [],
  demo: false,
};
const colors = { tint: '', groupedBackground: '', cell: '', elevated: '', separator: '', label: '', labelSecondary: '', labelTertiary: '', destructive: '', isDark: false };

function machine(recordOrder: () => void) {
  return createCheckoutMachine({
    gateway: { mode: 'http', createPaymentIntent: async () => intent },
    sheet: { available: true, run: (async (a: { onPresenting: () => void }) => (a.onPresenting(), { kind: 'success' })) as never },
    getColors: () => colors,
    recordOrder,
  });
}

describe('after the PaymentSheet reports success', () => {
  it('a failure while saving the local order snapshot never turns a paid checkout into "failed"', async () => {
    const m = machine(() => {
      throw new Error('storage exploded');
    });
    const res = await m.pay(draft);
    expect(res.status).toBe('succeeded');
    expect(res.result?.orderNumber).toBe('N1');
  });

  it('a second tap in the same frame does not get a second success/failure to act on', async () => {
    const record = vi.fn();
    const m = machine(record);
    const first = m.pay(draft);
    const second = await m.pay(draft);
    expect(second.status).not.toBe('succeeded');
    expect(second.result).toBeUndefined();
    expect((await first).status).toBe('succeeded');
    expect(record).toHaveBeenCalledTimes(1);
  });
});

describe('http stripe gateway response validation', () => {
  const clientReturning = (body: unknown): HttpClient => ({ baseUrl: 'x', request: (async () => body) as never });
  const good = { orderId: 'o', orderNumber: 'N', guestToken: 't', clientSecret: 'cs', pricing: intent.pricing, lines: [] };

  it('accepts a complete response', async () => {
    const r = await createHttpStripeGateway(clientReturning(good)).createPaymentIntent(draft, { idempotencyKey: 'k' });
    expect(r.demo).toBe(false);
  });

  it.each([['lines'], ['orderNumber']])('rejects a response without %s BEFORE any card is charged', async (field) => {
    const bad = { ...good } as Record<string, unknown>;
    delete bad[field];
    await expect(createHttpStripeGateway(clientReturning(bad)).createPaymentIntent(draft, { idempotencyKey: 'k' })).rejects.toBeInstanceOf(AppApiError);
  });
});
