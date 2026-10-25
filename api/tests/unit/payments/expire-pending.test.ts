import { describe, expect, it, vi } from 'vitest';
import { expirePendingOrders } from '../../../src/jobs/expire-pending.js';
import { createFakeGateway } from '../../../src/payments/fake-gateway.js';
import { buildHarness, type Harness, NOW } from './fakes.js';

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

function run(h: Harness) {
  return expirePendingOrders({ orders: h.orders, payments: h.deps.payments, logger: h.deps.logger, clock: h.deps.clock, config: h.deps.config });
}

async function seedIntent(h: Harness, orderId: string, placedAt: string, extra = {}) {
  const intent = await h.gateway.createPaymentIntent({
    amountPence: 1000, currency: 'gbp', orderId, orderNumber: orderId.slice(0, 12), receiptEmail: 'a@b.co', idempotencyKey: `k-${orderId}`,
  });
  return h.orders.seed({ orderId, placedAt, paymentIntentId: intent.id, ...extra });
}

describe('expirePendingOrders', () => {
  it('cancels the intent then the order for stale app orders and leaves fresh ones alone', async () => {
    const h = buildHarness(); // TTL default 120 min
    await seedIntent(h, '1'.repeat(24), minutesAgo(121));
    await seedIntent(h, '2'.repeat(24), minutesAgo(30));
    const result = await run(h);
    expect(result).toEqual({ examined: 1, cancelled: 1, errors: 0 });
    expect(h.orders.orders.get('1'.repeat(24))).toMatchObject({ siteOrderStatus: 'order-cancelled', sitePaymentStatus: 'payment-failed' });
    expect(h.orders.orders.get('2'.repeat(24))?.siteOrderStatus).toBe('order-pending');
    expect(h.gateway.intents.get('pi_fake_000001')?.status).toBe('canceled');
    expect(h.gateway.intents.get('pi_fake_000002')?.status).toBe('requires_payment_method');
  });

  it('honours PENDING_ORDER_TTL_MINUTES', async () => {
    const h = buildHarness({ env: { PENDING_ORDER_TTL_MINUTES: '10' } });
    await seedIntent(h, '3'.repeat(24), minutesAgo(11));
    expect((await run(h)).cancelled).toBe(1);
  });

  it('cancels orders that never got an intent without calling the gateway', async () => {
    const h = buildHarness();
    h.orders.seed({ orderId: '4'.repeat(24), placedAt: minutesAgo(500), paymentIntentId: null });
    const cancel = vi.spyOn(h.gateway, 'cancelPaymentIntent');
    expect(await run(h)).toEqual({ examined: 1, cancelled: 1, errors: 0 });
    expect(cancel).not.toHaveBeenCalled();
    expect(h.orders.orders.get('4'.repeat(24))?.siteOrderStatus).toBe('order-cancelled');
  });

  it('never touches paid orders, non-app orders, or already-cancelled orders, and never deletes', async () => {
    const h = buildHarness();
    await seedIntent(h, '5'.repeat(24), minutesAgo(999), { sitePaymentStatus: 'payment-success' });
    await seedIntent(h, '6'.repeat(24), minutesAgo(999), { createdByApp: false });
    await seedIntent(h, '7'.repeat(24), minutesAgo(999), { sitePaymentStatus: 'payment-failed', siteOrderStatus: 'order-cancelled' });
    const result = await run(h);
    expect(result).toEqual({ examined: 0, cancelled: 0, errors: 0 });
    expect(h.orders.orders.size).toBe(3);
    expect(h.orders.transitions).toHaveLength(0);
  });

  it('leaves an order pending (for the next run) when its intent cannot be cancelled, and keeps going', async () => {
    const h = buildHarness();
    await seedIntent(h, '8'.repeat(24), minutesAgo(300));
    await seedIntent(h, '9'.repeat(24), minutesAgo(300));
    const original = h.gateway.cancelPaymentIntent.bind(h.gateway);
    vi.spyOn(h.gateway, 'cancelPaymentIntent').mockImplementationOnce(() => Promise.reject(new Error('stripe down'))).mockImplementation(original);
    const result = await run(h);
    expect(result).toEqual({ examined: 2, cancelled: 1, errors: 1 });
    expect(h.orders.orders.get('8'.repeat(24))?.siteOrderStatus).toBe('order-pending');
    expect(h.orders.orders.get('9'.repeat(24))?.siteOrderStatus).toBe('order-cancelled');
    // The next run retries the failed one.
    expect(await run(h)).toEqual({ examined: 1, cancelled: 1, errors: 0 });
  });

  it('counts a failing order update as an error and does not loop forever on persistent failures', async () => {
    const h = buildHarness();
    await seedIntent(h, 'a'.repeat(24), minutesAgo(300));
    vi.spyOn(h.orders, 'applyPaymentTransition').mockRejectedValue(new Error('mongo down'));
    expect(await run(h)).toEqual({ examined: 1, cancelled: 0, errors: 1 });
  });

  it('works through more than one batch', async () => {
    const h = buildHarness();
    for (let i = 1; i <= 130; i += 1) h.orders.seed({ orderId: i.toString(16).padStart(24, '0'), placedAt: minutesAgo(300), paymentIntentId: null });
    expect(await run(h)).toEqual({ examined: 130, cancelled: 130, errors: 0 });
  });

  it('propagates a failure to list stale orders', async () => {
    const h = buildHarness();
    h.orders.failNext('findStalePending');
    await expect(run(h)).rejects.toThrow('database unavailable');
  });

  it('tolerates a gateway that reports intents as already final', async () => {
    const h = buildHarness();
    await seedIntent(h, 'b'.repeat(24), minutesAgo(300));
    const gateway = createFakeGateway();
    const result = await expirePendingOrders({ orders: h.orders, payments: gateway, logger: h.deps.logger, clock: h.deps.clock, config: h.deps.config });
    expect(result.cancelled).toBe(1);
  });
});
