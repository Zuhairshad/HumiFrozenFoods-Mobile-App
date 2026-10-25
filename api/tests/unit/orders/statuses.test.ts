import { describe, expect, it } from 'vitest';
import type { OrderStatus, PaymentStatus, SiteOrderStatus, SitePaymentStatus } from '../../../src/domain/types.js';
import {
  isSiteOrderStatus,
  isSitePaymentStatus,
  mapOrderStatus,
  mapPaymentStatus,
  mapSiteStatuses,
  SITE_ORDER_STATUSES,
  SITE_PAYMENT_STATUSES,
  transitionRule,
} from '../../../src/orders/statuses.js';

// Independent oracle: contract section 4, written out by hand.
const PAYMENT: [SitePaymentStatus, PaymentStatus][] = [
  ['payment-success', 'paid'],
  ['cash-on-delivery', 'paid'],
  ['payment-pending', 'pending'],
  ['payment-processing', 'pending'],
  ['payment-awaiting-for-approval', 'pending'],
  ['payment-failed', 'failed'],
  ['payment-refunded', 'refunded'],
  ['payment-reversal', 'refunded'],
];

const ORDER: [SiteOrderStatus, OrderStatus, OrderStatus][] = [
  // site status, when paid, when not paid
  ['order-pending', 'placed', 'pending_payment'],
  ['order-processing', 'preparing', 'preparing'],
  ['order-at-local-facility', 'preparing', 'preparing'],
  ['order-out-for-delivery', 'out-for-delivery', 'out-for-delivery'],
  ['order-completed', 'delivered', 'delivered'],
  ['order-cancelled', 'cancelled', 'cancelled'],
  ['order-failed', 'cancelled', 'cancelled'],
  ['order-refunded', 'cancelled', 'cancelled'],
];

describe('status tables', () => {
  it('covers every site status exactly once', () => {
    expect(PAYMENT.map(([s]) => s).sort()).toEqual([...SITE_PAYMENT_STATUSES].sort());
    expect(ORDER.map(([s]) => s).sort()).toEqual([...SITE_ORDER_STATUSES].sort());
  });

  it.each(PAYMENT)('payment %s -> %s', (site, expected) => {
    expect(mapPaymentStatus(site)).toBe(expected);
  });

  it.each(ORDER)('order %s -> %s when paid, %s otherwise', (site, paid, unpaid) => {
    expect(mapOrderStatus(site, 'paid')).toBe(paid);
    for (const other of ['pending', 'failed', 'refunded'] as const) expect(mapOrderStatus(site, other)).toBe(unpaid);
  });

  it('maps every (order, payment) pair through mapSiteStatuses', () => {
    for (const [order, whenPaid, whenUnpaid] of ORDER) {
      for (const [payment, expectedPayment] of PAYMENT) {
        const mapped = mapSiteStatuses(order, payment);
        expect(mapped).toEqual({
          siteOrderStatus: order,
          sitePaymentStatus: payment,
          paymentStatus: expectedPayment,
          status: expectedPayment === 'paid' ? whenPaid : whenUnpaid,
        });
      }
    }
  });

  it.each([
    [undefined, undefined],
    [null, 42],
    ['order-shipped', 'payment-weird'],
    [{ $ne: '' }, ['payment-success']],
    ['ORDER-PENDING', 'Payment-Success'],
  ])('unknown values (%j, %j) are treated as pending and unpaid', (order, payment) => {
    expect(mapSiteStatuses(order, payment)).toMatchObject({ status: 'pending_payment', paymentStatus: 'pending' });
  });

  it('an unknown order status with a known paid payment is placed', () => {
    expect(mapSiteStatuses('order-teleporting', 'payment-success')).toMatchObject({ status: 'placed', paymentStatus: 'paid' });
  });

  it('type guards reject non-strings and near misses', () => {
    expect(isSiteOrderStatus('order-pending')).toBe(true);
    expect(isSiteOrderStatus('order-pending ')).toBe(false);
    expect(isSiteOrderStatus(1)).toBe(false);
    expect(isSitePaymentStatus('cash-on-delivery')).toBe(true);
    expect(isSitePaymentStatus({})).toBe(false);
  });
});

describe('transitionRule (monotonic rules)', () => {
  it('encodes the contract', () => {
    expect(transitionRule('paid', 'order-processing')).toEqual({
      allowedFrom: ['payment-pending', 'payment-processing', 'payment-failed'],
      toPayment: 'payment-success',
      toOrder: 'order-processing',
    });
    expect(transitionRule('failed', 'order-pending')).toMatchObject({ toPayment: 'payment-failed', toOrder: null });
    expect(transitionRule('cancelled', 'order-pending')).toMatchObject({
      allowedFrom: ['payment-pending', 'payment-failed'],
      toOrder: 'order-cancelled',
    });
    expect(transitionRule('refunded', 'order-pending')).toMatchObject({
      allowedFrom: ['payment-success'],
      toPayment: 'payment-refunded',
      toOrder: 'order-refunded',
    });
  });

  it('never lets failed or cancelled start from a settled payment', () => {
    for (const kind of ['failed', 'cancelled'] as const) {
      const { allowedFrom } = transitionRule(kind, 'order-pending');
      for (const settled of ['payment-success', 'payment-refunded', 'payment-reversal', 'cash-on-delivery'] as const) {
        expect(allowedFrom).not.toContain(settled);
      }
    }
  });
});
