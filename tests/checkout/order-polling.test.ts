import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollOrderPayment } from '../../src/features/checkout/order-polling';
import { AppApiError } from '../../src/lib/api/errors';
import type { Order } from '../../src/lib/api/types';

const order = (paymentStatus: Order['paymentStatus']): Order =>
  ({ orderId: 'o', orderNumber: 'N', placedAt: '', status: 'placed', paymentStatus } as unknown as Order);

describe('pollOrderPayment (fake timers)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stops as soon as the server reports paid', async () => {
    const seq = [order('pending'), order('pending'), order('paid')];
    const fetchOrder = vi.fn(async () => seq.shift() as Order);
    const p = pollOrderPayment({ fetchOrder });
    await vi.advanceTimersByTimeAsync(3000 * 2);
    expect(await p).toMatchObject({ kind: 'settled', order: { paymentStatus: 'paid' } });
    expect(fetchOrder).toHaveBeenCalledTimes(3);
  });

  it('polls every 3 s, 10 times, then times out (confirming state)', async () => {
    const fetchOrder = vi.fn(async () => order('pending'));
    const p = pollOrderPayment({ fetchOrder });
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchOrder).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000 * 20);
    expect(await p).toMatchObject({ kind: 'timeout', order: { paymentStatus: 'pending' } });
    expect(fetchOrder).toHaveBeenCalledTimes(10);
  });

  it('network errors consume attempts but do not stop polling', async () => {
    let n = 0;
    const onError = vi.fn();
    const fetchOrder = vi.fn(async () => {
      if (++n < 3) throw new AppApiError({ status: 0, code: 'network_error', message: 'x' });
      return order('paid');
    });
    const p = pollOrderPayment({ fetchOrder, onError });
    await vi.advanceTimersByTimeAsync(6000);
    expect((await p).kind).toBe('settled');
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('401 stops immediately; abort cancels', async () => {
    const un = await pollOrderPayment({ fetchOrder: async () => { throw new AppApiError({ status: 401, code: 'unauthorized', message: 'x' }); } });
    expect(un.kind).toBe('unauthorized');
    const ctl = new AbortController();
    const p = pollOrderPayment({ fetchOrder: async () => order('pending'), signal: ctl.signal });
    await vi.advanceTimersByTimeAsync(100);
    ctl.abort();
    await vi.advanceTimersByTimeAsync(3000);
    expect((await p).kind).toBe('cancelled');
  });
});
