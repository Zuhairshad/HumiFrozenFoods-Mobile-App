import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expirePendingOrders } from '../../../src/jobs/expire-pending.js';
import { expectSiteDataIntact } from '../../support/assertions.js';
import { createHarness, type Harness } from '../../support/harness.js';
import type { OrderBody } from '../../support/types.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
}, 120_000);

afterAll(async () => {
  await expectSiteDataIntact(h);
  await h.close();
});

const runJob = () =>
  expirePendingOrders({ orders: h.deps.orders, payments: h.deps.payments, logger: h.deps.logger, clock: h.deps.clock, config: h.config });

describe('expire-pending job', () => {
  it('cancels stale pending app orders and their intents; leaves fresh, paid and website orders untouched', async () => {
    const stale1 = await h.createOrder();
    const stale2 = await h.createOrder();
    const paidEarly = await h.createOrder();
    await h.pay(paidEarly);
    const failedEarly = await h.createOrder();
    await h.deliver(h.paymentEvent('payment_intent.payment_failed', failedEarly));

    h.clock.advanceMinutes(121); // TTL is 120
    const fresh = await h.createOrder({ slot: { date: h.slotDate(2), window: 'morning' } });
    const freshBefore = await h.requireOrderDoc(fresh.orderId);
    const paidBefore = await h.requireOrderDoc(paidEarly.orderId);

    const result = await runJob();
    expect(result).toEqual({ examined: 2, cancelled: 2, errors: 0 });

    for (const o of [stale1, stale2]) {
      expect(await h.requireOrderDoc(o.orderId)).toMatchObject({ order_status: 'order-cancelled', payment_status: 'payment-failed' });
      expect(h.gateway.intents.get(h.intentIdFor(o.orderId))?.status).toBe('canceled');
      const read = (await h.get(`/v1/orders/${o.orderId}`, { token: h.deps.guestTokens.issue(o.orderId).token })).json<OrderBody>();
      expect(read).toMatchObject({ status: 'cancelled', paymentStatus: 'failed' });
    }
    expect(await h.requireOrderDoc(fresh.orderId)).toEqual(freshBefore);
    expect(await h.requireOrderDoc(paidEarly.orderId)).toEqual(paidBefore);
    expect(h.gateway.intents.get(h.intentIdFor(fresh.orderId))?.status).toBe('requires_payment_method');
    // payment-failed (retryable) orders are not "pending", so the job leaves them alone.
    expect(await h.requireOrderDoc(failedEarly.orderId)).toMatchObject({ order_status: 'order-pending', payment_status: 'payment-failed' });

    // The seeded website order that is old AND payment-pending is exactly what a careless job would cancel.
    expect(await h.siteOrdersNow()).toEqual(h.seededOrderHashes());
    expect(await h.db.collection('orders').countDocuments({ tracking_number: '660011223344', payment_status: 'payment-pending' })).toBe(1);

    // Idempotent: nothing left to do.
    expect(await runJob()).toEqual({ examined: 0, cancelled: 0, errors: 0 });
  });

  it('keeps an order pending when its intent cannot be cancelled, and retries next run', async () => {
    const order = await h.createOrder();
    h.clock.advanceMinutes(121);
    h.control.failCancel = new Error('stripe down');
    try {
      const failed = await runJob();
      expect(failed).toMatchObject({ cancelled: 0 });
      expect(failed.errors).toBeGreaterThan(0);
      expect(await h.requireOrderDoc(order.orderId)).toMatchObject({ order_status: 'order-pending', payment_status: 'payment-pending' });
    } finally {
      h.control.failCancel = null;
    }
    expect(await runJob()).toMatchObject({ errors: 0 }); // also sweeps the earlier test's now-stale fresh order
    expect(await h.requireOrderDoc(order.orderId)).toMatchObject({ order_status: 'order-cancelled' });
  });

  it('never deletes: every order created remains in the collection', async () => {
    const before = await h.countOrders();
    await runJob();
    expect(await h.countOrders()).toBe(before);
  });

  it('a late payment for an expired order is flagged, not silently accepted as a live order', async () => {
    const order = await h.createOrder();
    h.clock.advanceMinutes(121);
    await runJob();
    const before = h.logsAt('error', 'payment_not_applied').length;
    await h.pay(order);
    expect(h.logsAt('error', 'payment_not_applied').length).toBe(before + 1);
    expect((await h.requireOrderDoc(order.orderId))['order_status']).toBe('order-cancelled');
  });
});
