import { describe, expect, it } from 'vitest';
import type { StoredOrder } from '../../../src/domain/types.js';
import { toPublicOrder } from '../../../src/orders/public-order.js';
import { storedAppOrder } from './fixtures.js';

describe('toPublicOrder', () => {
  it('exposes exactly the public Order fields', async () => {
    const stored: StoredOrder = { ...(await storedAppOrder()), paymentIntentId: 'pi_secret_1' };
    const publicOrder = toPublicOrder(stored);
    expect(Object.keys(publicOrder).sort()).toEqual(
      ['address', 'contact', 'lines', 'notes', 'orderId', 'orderNumber', 'paymentStatus', 'placedAt', 'pricing', 'slot', 'status'].sort(),
    );
    const json = JSON.stringify(publicOrder);
    for (const hidden of ['siteOrderStatus', 'sitePaymentStatus', 'paymentIntentId', 'createdByApp', 'pi_secret_1', 'order-pending', 'client_secret']) {
      expect(json).not.toContain(hidden);
    }
  });

  it('omits notes when there are none and copies nested objects', async () => {
    const { notes: _n, ...rest } = await storedAppOrder();
    const publicOrder = toPublicOrder(rest as StoredOrder);
    expect('notes' in publicOrder).toBe(false);
    const stored = await storedAppOrder();
    expect(toPublicOrder(stored).pricing).not.toBe(stored.pricing);
    expect(toPublicOrder(stored).lines[0]).toEqual(stored.lines[0]);
  });
});
