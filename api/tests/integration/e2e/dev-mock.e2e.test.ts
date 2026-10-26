import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertDevOnly, DevOnlyError, startDevMock, type DevMock } from '../../../src/scripts/dev-mock-server.js';
import type { CheckoutBody, OrderBody } from '../../support/types.js';
import { createHarness, type Harness } from '../../support/harness.js';

let mock: DevMock;

beforeAll(async () => {
  mock = await startDevMock({ listen: false, logLevel: 'silent' });
}, 120_000);

afterAll(async () => {
  await mock.close();
});

const tomorrow = (): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 2);
  return d.toISOString().slice(0, 10);
};

describe('dev mock server', () => {
  it('refuses to run in production', async () => {
    expect(() => { assertDevOnly({ NODE_ENV: 'production' }); }).toThrow(DevOnlyError);
    expect(() => { assertDevOnly({ NODE_ENV: 'development' }); }).not.toThrow();
    await expect(startDevMock({ listen: false, processEnv: { NODE_ENV: 'production' } })).rejects.toThrow(DevOnlyError);
  });

  it('seeds the 17 products and no orders', async () => {
    expect(mock.productCount).toBe(17);
    expect(await mock.db.collection('orders').countDocuments({})).toBe(0);
    const res = await mock.app.request('/v1/products?limit=100');
    expect(((await res.json()) as { items: unknown[] }).items).toHaveLength(17);
  });

  it('completes a checkout end to end through POST /dev/pay/:orderId', async () => {
    const create = await mock.app.request('/v1/checkout/payment-intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        lines: [{ productId: 'aloo-tikki', quantity: 2 }],
        contact: { name: 'Dev Tester', email: 'dev@example.com', phone: '07700 900123' },
        address: { line1: '1 Test Street', city: 'London', postcode: 'SW1A 1AA' },
        slot: { date: tomorrow(), window: 'afternoon' },
      }),
    });
    expect(create.status).toBe(201);
    const order = (await create.json()) as CheckoutBody;

    const pending = (await (await mock.app.request(`/v1/orders/${order.orderId}`, { headers: { authorization: `Bearer ${order.guestToken}` } })).json()) as OrderBody;
    expect(pending).toMatchObject({ status: 'pending_payment', paymentStatus: 'pending' });

    const pay = await mock.app.request(`/dev/pay/${order.orderId}`, { method: 'POST' });
    expect(pay.status).toBe(200);
    expect(await pay.json()).toMatchObject({ dev: true, webhook: { status: 200, body: { outcome: 'applied' } }, status: 'placed', paymentStatus: 'paid' });

    const paid = (await (await mock.app.request(`/v1/orders/${order.orderId}`, { headers: { authorization: `Bearer ${order.guestToken}` } })).json()) as OrderBody;
    expect(paid).toMatchObject({ status: 'placed', paymentStatus: 'paid' });
    // Paying again is harmless.
    expect((await mock.app.request(`/dev/pay/${order.orderId}`, { method: 'POST' })).status).toBe(200);
  });

  it('404s for unknown or malformed order ids', async () => {
    expect((await mock.app.request('/dev/pay/0123456789abcdef01234567', { method: 'POST' })).status).toBe(404);
    expect((await mock.app.request('/dev/pay/nope', { method: 'POST' })).status).toBe(404);
  });
});

describe('/dev routes never exist in the production app', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  }, 120_000);
  afterAll(async () => {
    await h.close();
  });

  it('the production router has no /dev/pay', async () => {
    const order = await h.createOrder();
    for (const path of [`/dev/pay/${order.orderId}`, `/v1/dev/pay/${order.orderId}`]) {
      expect((await h.request('POST', path)).status).toBe(404);
    }
    expect((await h.get(`/v1/orders/${order.orderId}`, { token: order.guestToken })).json<OrderBody>().paymentStatus).toBe('pending');
  });
});
