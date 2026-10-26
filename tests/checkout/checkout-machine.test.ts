import { describe, expect, it, vi } from 'vitest';
import { createCheckoutMachine, toCheckoutError } from '../../src/features/checkout/checkout-machine';
import type { SheetOutcome } from '../../src/features/checkout/paymentSheetTypes';
import { AppApiError } from '../../src/lib/api/errors';
import type { PaymentIntentResult, StripeGateway } from '../../src/lib/api/stripe-gateway';
import type { OrderDraft } from '../../src/lib/api/types';

const draft = (qty = 1): OrderDraft => ({
  lines: [{ productId: 'a', quantity: qty }],
  contact: { name: 'Sam Lee', email: 's@l.co', phone: '07000000000' },
  address: { line1: '1 High St', city: 'Leeds', postcode: 'LS1 1AA' },
  slot: { date: '2026-10-26', window: 'morning' },
});

const intent = (total = 2700): PaymentIntentResult => ({
  orderId: 'o1',
  orderNumber: 'N1',
  guestToken: 'tok',
  clientSecret: 'cs',
  pricing: { subtotalPence: total, deliveryPence: 0, discountPence: 0, totalPence: total, currency: 'gbp', promoCode: null, freeDeliveryRemainingPence: 0 },
  lines: [],
  demo: false,
});

const colors = { tint: '', groupedBackground: '', cell: '', elevated: '', separator: '', label: '', labelSecondary: '', labelTertiary: '', destructive: '', isDark: false };

function setup(over: { create?: StripeGateway['createPaymentIntent']; outcome?: () => Promise<SheetOutcome>; available?: boolean; mode?: 'http' | 'mock' } = {}) {
  const create = vi.fn(over.create ?? (async () => intent()));
  const run = vi.fn(async (a: { onPresenting: () => void }) => {
    a.onPresenting();
    return over.outcome ? over.outcome() : ({ kind: 'success' } as SheetOutcome);
  });
  const recordOrder = vi.fn();
  let n = 0;
  const m = createCheckoutMachine({
    gateway: { mode: over.mode ?? 'http', createPaymentIntent: create },
    sheet: { available: over.available ?? true, run: run as never, unavailableMessage: 'Card payments need the mobile app' },
    getColors: () => colors,
    recordOrder,
    makeKey: () => `key-${++n}`,
  });
  return { m, create, run, recordOrder };
}

describe('checkout machine', () => {
  it('happy path walks creating -> presenting -> confirming -> succeeded and records a non-paid order', async () => {
    const seen: string[] = [];
    const { m, recordOrder } = setup();
    m.subscribe(() => seen.push(m.getState().status));
    const res = await m.pay(draft(), { expectedTotalPence: 2700 });
    expect(seen).toEqual(['creating', 'presenting', 'confirming', 'succeeded']);
    expect(res.result).toMatchObject({ orderNumber: 'N1', orderId: 'o1', demo: false });
    expect(recordOrder).toHaveBeenCalledTimes(1);
  });

  it('double-tap pay() shares one run (one intent, one sheet)', async () => {
    const { m, create, run } = setup();
    const [a, b] = [m.pay(draft()), m.pay(draft())];
    expect(a).not.toBe(b); // the duplicate resolves immediately with a non-final snapshot
    expect((await b).status).toBe('creating');
    expect((await a).status).toBe('succeeded');
    expect(create).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('aborts BEFORE the sheet when totals differ, then reuses the same intent/key on retry', async () => {
    const { m, create, run } = setup();
    const r1 = await m.pay(draft(), { expectedTotalPence: 2500 });
    expect(r1.status).toBe('failed');
    expect(r1.error?.kind).toBe('price_changed');
    expect(r1.priceChange).toEqual({ newTotalPence: 2700 });
    expect(run).not.toHaveBeenCalled();
    const r2 = await m.pay(draft(), { expectedTotalPence: 2700 });
    expect(r2.status).toBe('succeeded');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('cancelled and failed sheet outcomes; retry after failure reuses key and intent', async () => {
    let outcome: SheetOutcome = { kind: 'cancelled' };
    const { m, create } = setup({ outcome: async () => outcome });
    expect((await m.pay(draft())).status).toBe('cancelled');
    outcome = { kind: 'failed', message: 'Card declined', code: 'Failed', declineCode: 'insufficient_funds' };
    const f = await m.pay(draft());
    expect(f.status).toBe('failed');
    expect(f.error).toMatchObject({ kind: 'declined', retryable: true });
    outcome = { kind: 'success' };
    expect((await m.pay(draft())).status).toBe('succeeded');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('mints a NEW idempotency key only when the draft changes', async () => {
    const { m, create } = setup({ outcome: async () => ({ kind: 'cancelled' }) });
    await m.pay(draft(1));
    await m.pay(draft(1));
    await m.pay(draft(2));
    const keys = create.mock.calls.map((c) => c[1].idempotencyKey);
    expect(keys).toEqual(['key-1', 'key-2']); // second pay reused cached intent (no 2nd create)
  });

  it('web / no key: blocks without creating an order', async () => {
    const { m, create } = setup({ available: false });
    const r = await m.pay(draft());
    expect(r.error).toMatchObject({ kind: 'unsupported', message: 'Card payments need the mobile app' });
    expect(create).not.toHaveBeenCalled();
  });

  it('demo mode skips the sheet and claims no payment', async () => {
    const { m, run } = setup({ mode: 'mock', available: false, create: async () => ({ ...intent(), demo: true }) });
    const r = await m.pay(draft());
    expect(r.status).toBe('succeeded');
    expect(r.result?.demo).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });

  it('maps API errors to friendly states', () => {
    const e = (status: number, code: string, extra: Partial<ConstructorParameters<typeof AppApiError>[0]> = {}) => toCheckoutError(new AppApiError({ status, code, message: 'm', ...extra }));
    expect(e(422, 'out_of_stock')).toMatchObject({ kind: 'unavailable', returnToCart: true });
    expect(e(422, 'unavailable')).toMatchObject({ kind: 'unavailable', returnToCart: true });
    expect(e(422, 'min_order')).toMatchObject({ kind: 'min_order', returnToCart: true });
    expect(e(422, 'invalid_promo')).toMatchObject({ kind: 'invalid_promo', returnToCart: true });
    expect(e(422, 'unprocessable', { details: { reason: 'min_order' } })).toMatchObject({ kind: 'min_order' });
    expect(e(429, 'rate_limited', { retryAfter: 30 })).toMatchObject({ kind: 'rate_limited', retryAfterSeconds: 30, retryable: true });
    expect(e(0, 'network_error')).toMatchObject({ kind: 'network', retryable: true });
    expect(e(400, 'validation_failed', { details: [{ path: 'address.postcode', message: 'Bad postcode' }] }).fieldErrors).toEqual({ postcode: 'Bad postcode' });
    expect(e(503, 'payment_provider_error')).toMatchObject({ kind: 'payments_unavailable' });
  });

  it('gateway network error surfaces as retryable and a later retry works', async () => {
    let fail = true;
    const { m } = setup({
      create: async () => {
        if (fail) throw new AppApiError({ status: 0, code: 'network_error', message: 'offline' });
        return intent();
      },
    });
    expect((await m.pay(draft())).error?.kind).toBe('network');
    fail = false;
    expect((await m.pay(draft())).status).toBe('succeeded');
  });
});
