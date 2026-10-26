import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCheckoutMachine, MAX_INTENT_AGE_MS, classifyFailure } from '../../src/features/checkout/checkout-machine';
import type { SheetOutcome } from '../../src/features/checkout/paymentSheetTypes';
import { reconcilePendingOrders } from '../../src/features/checkout/reconcile';
import { classifyIncomingUrl, stripeRedirectNavigation } from '../../src/features/checkout/stripe-redirect';
import { AppApiError } from '../../src/lib/api/errors';
import type { PaymentIntentResult } from '../../src/lib/api/stripe-gateway';
import type { Order, OrderDraft } from '../../src/lib/api/types';
import { setOrderTokenStorage } from '../../src/store/order-token-storage';
import { useOrdersStore, type StoredOrder } from '../../src/store/orders';

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: async () => false,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

const draft: OrderDraft = {
  lines: [{ productId: 'a', quantity: 1 }],
  contact: { name: 'Sam Lee', email: 's@l.co', phone: '07000000000' },
  address: { line1: '1 High St', city: 'Leeds', postcode: 'LS1 1AA' },
  slot: { date: '2026-10-26', window: 'morning' },
};
const pricing = { subtotalPence: 2700, deliveryPence: 0, discountPence: 0, totalPence: 2700, currency: 'gbp' as const, promoCode: null, freeDeliveryRemainingPence: 0 };
let seq = 0;
const mkIntent = (): PaymentIntentResult => {
  seq++;
  return { orderId: `o${seq}`, orderNumber: `N${seq}`, guestToken: `tok${seq}`, clientSecret: `cs${seq}`, pricing, lines: [], demo: false };
};
const colors = { tint: '', groupedBackground: '', cell: '', elevated: '', separator: '', label: '', labelSecondary: '', labelTertiary: '', destructive: '', isDark: false };
const remote = (i: PaymentIntentResult, o: Partial<Order>): Order =>
  ({ orderId: i.orderId, orderNumber: i.orderNumber, placedAt: '', status: 'pending_payment', paymentStatus: 'pending', lines: [], pricing, contact: draft.contact, address: draft.address, slot: draft.slot, ...o }) as Order;

function setup(over: { sheet?: () => Promise<SheetOutcome>; server?: (n: number) => Partial<Order> | 'error'; recordOrder?: () => void } = {}) {
  let clock = 1_000_000;
  const intents: PaymentIntentResult[] = [];
  const create = vi.fn(async () => {
    const i = mkIntent();
    intents.push(i);
    return i;
  });
  let polls = 0;
  const fetchOrder = vi.fn(async (i: PaymentIntentResult) => {
    const r = over.server ? over.server(++polls) : { };
    if (r === 'error') throw new AppApiError({ status: 0, code: 'network_error', message: 'offline' });
    return remote(i, r);
  });
  const events: string[] = [];
  const m = createCheckoutMachine({
    gateway: { mode: 'http', createPaymentIntent: create },
    sheet: { available: true, run: (async (a: { onPresenting: () => void }) => (a.onPresenting(), over.sheet ? over.sheet() : { kind: 'success' })) as never },
    getColors: () => colors,
    recordPending: () => void events.push('pending'),
    recordOrder: over.recordOrder ?? (() => void events.push('confirmed')),
    discardPending: () => void events.push('discard'),
    fetchOrder,
    now: () => clock,
    makeKey: (() => { let n = 0; return () => `key-${++n}`; })(),
  });
  return { m, create, fetchOrder, events, advance: (ms: number) => (clock += ms), intents };
}

/** Runs pay() while fake timers drive the 3 s poll sleeps. */
async function pay(m: ReturnType<typeof setup>['m']) {
  const p = m.pay(draft);
  await vi.advanceTimersByTimeAsync(40_000);
  return p;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('R2 payment recovery state machine', () => {
  it('saves the pending order BEFORE the sheet opens', async () => {
    let seenAtSheet: string[] = [];
    const s: ReturnType<typeof setup> = setup({ sheet: async () => ((seenAtSheet = [...s.events]), { kind: 'success' }) });
    await pay(s.m);
    expect(seenAtSheet).toEqual(['pending']);
    expect(s.events).toEqual(['pending', 'confirmed']);
  });

  it('sheet success + snapshot save failure still succeeds (no failure claimed)', async () => {
    const { m } = setup({ recordOrder: () => { throw new Error('disk full'); } });
    expect((await pay(m)).status).toBe('succeeded');
  });

  it('sheet throws but server says paid -> succeeded, never "failed"', async () => {
    const { m, events } = setup({ sheet: async () => { throw new Error('bridge died'); }, server: () => ({ status: 'placed', paymentStatus: 'paid' }) });
    const r = await pay(m);
    expect(r.status).toBe('succeeded');
    expect(events).toContain('confirmed');
    expect(events).not.toContain('discard');
  });

  it('sheet throws, server pending then paid -> polls every 3 s and succeeds', async () => {
    const { m, fetchOrder } = setup({
      sheet: async () => ({ kind: 'failed', message: 'network', code: 'Failed' }),
      server: (n) => (n < 3 ? {} : { status: 'placed', paymentStatus: 'paid' }),
    });
    const states: string[] = [];
    m.subscribe(() => states.push(m.getState().status));
    const r = await pay(m);
    expect(r.status).toBe('succeeded');
    expect(fetchOrder).toHaveBeenCalledTimes(3);
    expect(states).toContain('verifying');
  });

  it('unclear failure and server still pending after 10 polls -> unconfirmed, NOT failed; pending order kept', async () => {
    const { m, fetchOrder, events } = setup({ sheet: async () => ({ kind: 'failed', message: 'x', code: 'Timeout' }) });
    const r = await pay(m);
    expect(r.status).toBe('unconfirmed');
    expect(fetchOrder).toHaveBeenCalledTimes(10);
    expect(events).not.toContain('discard');
  });

  it('server says payment failed -> only then "payment didn\'t go through"', async () => {
    const { m, events } = setup({ sheet: async () => ({ kind: 'failed', message: 'x' }), server: () => ({ paymentStatus: 'failed' }) });
    const r = await pay(m);
    expect(r.status).toBe('failed');
    expect(r.error?.title).toBe("Payment didn't go through");
    expect(events).toContain('discard');
  });

  it('explicit cancel: quiet, no polling, pending discarded', async () => {
    const { m, fetchOrder, events } = setup({ sheet: async () => ({ kind: 'cancelled' }) });
    expect((await pay(m)).status).toBe('cancelled');
    expect(fetchOrder).not.toHaveBeenCalled();
    expect(events).toContain('discard');
  });

  it('explicit decline (declineCode or card_error): failed at once, no polling', async () => {
    for (const o of [{ declineCode: 'insufficient_funds' }, { errorType: 'card_error' }]) {
      const { m, fetchOrder } = setup({ sheet: async () => ({ kind: 'failed', message: 'declined', code: 'Failed', ...o }) });
      const r = await pay(m);
      expect(r.error?.kind).toBe('declined');
      expect(fetchOrder).not.toHaveBeenCalled();
    }
    expect(classifyFailure({ kind: 'failed', message: '', code: 'Failed' })).toBe('unclear');
    expect(classifyFailure({ kind: 'failed', message: '', code: 'InitFailed' })).toBe('init');
  });

  it('after an unconfirmed outcome the next tap asks the server first and goes straight to success if paid', async () => {
    let paid = false;
    let sheets = 0;
    const { m } = setup({ sheet: async () => (sheets++, { kind: 'failed', message: 'x', code: 'Timeout' }), server: () => (paid ? { paymentStatus: 'paid', status: 'placed' } : {}) });
    expect((await pay(m)).status).toBe('unconfirmed');
    paid = true;
    expect((await pay(m)).status).toBe('succeeded');
    expect(sheets).toBe(1); // the sheet was not shown again
  });

  it('app restart reconciliation: paid promoted, cancelled purged, pending kept, old purged, offline skipped', async () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    const mk = (id: string, ageH: number): StoredOrder => ({ id, remoteId: `r-${id}`, placedAt: new Date(now - ageH * 3600_000).toISOString() }) as StoredOrder;
    const orders = [mk('PAID', 1), mk('CANC', 1), mk('WAIT', 1), mk('OLD', 30), mk('OFF', 1)];
    const server: Record<string, Partial<Order> | 'error'> = {
      PAID: { paymentStatus: 'paid', status: 'placed' }, CANC: { status: 'cancelled', paymentStatus: 'failed' }, WAIT: {}, OLD: {}, OFF: 'error',
    };
    const log: string[] = [];
    const res = await reconcilePendingOrders({
      now: () => now,
      getPending: () => orders,
      getToken: () => 't',
      fetchOrder: async (rid) => {
        const k = rid.slice(2);
        const r = server[k];
        if (r === 'error') throw new AppApiError({ status: 0, code: 'network_error', message: 'x' });
        return remote({ orderId: rid, orderNumber: k } as PaymentIntentResult, r ?? {});
      },
      promote: (o) => void log.push(`promote ${o.id}`),
      discard: (o) => void log.push(`discard ${o.id}`),
    });
    expect(res).toEqual({ PAID: 'promoted', CANC: 'discarded', WAIT: 'kept', OLD: 'discarded', OFF: 'skipped' });
  });
});

describe('R2 store: pending orders stay out of the orders list', () => {
  beforeEach(() => {
    setOrderTokenStorage({ getAll: async () => ({}), set: async () => undefined, remove: async () => undefined, clear: async () => undefined });
    useOrdersStore.setState({ orders: [], pending: [], tokens: {} });
  });
  const rec = (): StoredOrder => ({ id: 'N9', remoteId: 'o9', placedAt: new Date().toISOString(), lines: [], total: 27, status: 'placed', paymentStatus: 'pending' }) as unknown as StoredOrder;

  it('savePending is hidden from orders, keeps the token, and confirmOrder moves it across', () => {
    const s = useOrdersStore.getState();
    s.savePending(rec(), 'tok');
    expect(useOrdersStore.getState().orders).toHaveLength(0);
    expect(useOrdersStore.getState().getToken('o9')).toBe('tok');
    expect(useOrdersStore.getState().getOrder('n9')?.remoteStatus).toBe('pending_payment');
    useOrdersStore.getState().confirmOrder(rec(), 'tok');
    expect(useOrdersStore.getState().orders.map((o) => o.id)).toEqual(['N9']);
    expect(useOrdersStore.getState().pending).toHaveLength(0);
    expect(useOrdersStore.getState().orders[0].paymentStatus).toBe('pending'); // never paid client-side
  });

  it('a server "paid" patch on a pending order promotes it; discard removes it', () => {
    useOrdersStore.getState().savePending(rec(), 'tok');
    useOrdersStore.getState().patchOrder('N9', { paymentStatus: 'paid' });
    expect(useOrdersStore.getState().orders[0].paymentStatus).toBe('paid');
    useOrdersStore.getState().savePending({ ...rec(), id: 'N10', remoteId: 'o10' }, 't2');
    useOrdersStore.getState().discardPending('N10', { removeToken: true });
    expect(useOrdersStore.getState().pending).toHaveLength(0);
    expect(useOrdersStore.getState().getToken('o10')).toBeUndefined();
  });

  it('getVisiblePending hides entries older than 24 h', () => {
    useOrdersStore.getState().savePending({ ...rec(), placedAt: new Date(Date.now() - 25 * 3600_000).toISOString() }, 'tok');
    expect(useOrdersStore.getState().getVisiblePending()).toHaveLength(0);
  });
});

describe('R8 stale / cancelled payment intents', () => {
  it('replaces an intent older than 55 minutes with a new key, discarding the old pending order', async () => {
    const { m, create, events, advance } = setup({ sheet: async () => ({ kind: 'cancelled' }) });
    await pay(m);
    advance(MAX_INTENT_AGE_MS + 1000);
    await pay(m);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.map((c) => (c as unknown[])[1])).toEqual([{ idempotencyKey: 'key-1' }, { idempotencyKey: 'key-2' }]);
    expect(events.filter((e) => e === 'discard').length).toBeGreaterThanOrEqual(2);
  });

  it('reuses a fresh intent (54 min)', async () => {
    const { m, create, advance } = setup({ sheet: async () => ({ kind: 'cancelled' }) });
    await pay(m);
    advance(54 * 60_000);
    await pay(m);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('server reports the order cancelled -> new attempt with a new key', async () => {
    let first = true;
    const { m, create } = setup({ sheet: async () => ({ kind: 'cancelled' }), server: () => (first ? (first = false, { status: 'cancelled', paymentStatus: 'failed' }) : {}) });
    await pay(m);
    await pay(m);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('409 checkout_expired on create -> transparent new Idempotency-Key', async () => {
    const keys: string[] = [];
    const m = createCheckoutMachine({
      gateway: {
        mode: 'http',
        createPaymentIntent: async (_d, o) => {
          keys.push(o.idempotencyKey);
          if (keys.length === 1) throw new AppApiError({ status: 409, code: 'checkout_expired', message: 'expired' });
          return mkIntent();
        },
      },
      sheet: { available: true, run: (async () => ({ kind: 'success' })) as never },
      getColors: () => colors,
      recordOrder: () => undefined,
      makeKey: (() => { let n = 0; return () => `k${++n}`; })(),
    });
    expect((await pay(m as never)).status).toBe('succeeded');
    expect(keys).toEqual(['k1', 'k2']);
  });
});

describe('R7 Stripe returnURL handling', () => {
  it('recognises the redirect in every URL shape and always forwards to Stripe', () => {
    for (const u of ['humi://stripe-redirect', 'humi://stripe-redirect?payment_intent=pi_1&redirect_status=succeeded', 'exp://192.168.0.2:8081/--/stripe-redirect', 'humi:///stripe-redirect#x']) {
      expect(classifyIncomingUrl(u)).toMatchObject({ kind: 'stripe-redirect', forwardToStripe: true });
    }
    expect(classifyIncomingUrl('humi://stripe-redirect?redirect_status=failed')).toMatchObject({ redirectStatus: 'failed' });
    expect(classifyIncomingUrl('humi://orders/N1')).toEqual({ kind: 'other', forwardToStripe: true });
    expect(classifyIncomingUrl(null)).toBeNull();
  });

  it('route goes back when it can, home after a cold start', () => {
    expect(stripeRedirectNavigation(true)).toBe('back');
    expect(stripeRedirectNavigation(false)).toBe('home');
  });
});
