import type {
  OrderStatus,
  PaymentStatus,
  PaymentTransition,
  SiteOrderStatus,
  SitePaymentStatus,
} from '../domain/types.js';

export const SITE_ORDER_STATUSES: readonly SiteOrderStatus[] = [
  'order-pending',
  'order-processing',
  'order-completed',
  'order-cancelled',
  'order-refunded',
  'order-failed',
  'order-at-local-facility',
  'order-out-for-delivery',
];

export const SITE_PAYMENT_STATUSES: readonly SitePaymentStatus[] = [
  'payment-pending',
  'payment-processing',
  'payment-success',
  'payment-failed',
  'payment-reversal',
  'payment-refunded',
  'cash-on-delivery',
  'payment-awaiting-for-approval',
];

export function isSiteOrderStatus(value: unknown): value is SiteOrderStatus {
  return typeof value === 'string' && (SITE_ORDER_STATUSES as readonly string[]).includes(value);
}

export function isSitePaymentStatus(value: unknown): value is SitePaymentStatus {
  return typeof value === 'string' && (SITE_PAYMENT_STATUSES as readonly string[]).includes(value);
}

const PAYMENT_STATUS_MAP: Readonly<Record<SitePaymentStatus, PaymentStatus>> = {
  'payment-success': 'paid',
  'cash-on-delivery': 'paid',
  'payment-pending': 'pending',
  'payment-processing': 'pending',
  'payment-awaiting-for-approval': 'pending',
  'payment-failed': 'failed',
  'payment-refunded': 'refunded',
  'payment-reversal': 'refunded',
};

export function mapPaymentStatus(site: SitePaymentStatus): PaymentStatus {
  return PAYMENT_STATUS_MAP[site];
}

/** `order-pending` is the only site status whose meaning depends on whether money has arrived. */
export function mapOrderStatus(site: SiteOrderStatus, payment: PaymentStatus): OrderStatus {
  switch (site) {
    case 'order-pending':
      return payment === 'paid' ? 'placed' : 'pending_payment';
    case 'order-processing':
    case 'order-at-local-facility':
      return 'preparing';
    case 'order-out-for-delivery':
      return 'out-for-delivery';
    case 'order-completed':
      return 'delivered';
    case 'order-cancelled':
    case 'order-failed':
    case 'order-refunded':
      return 'cancelled';
  }
}

export interface MappedStatuses {
  siteOrderStatus: SiteOrderStatus;
  sitePaymentStatus: SitePaymentStatus;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
}

/**
 * Tolerates hand-edited admin data. An unknown payment status is treated as unpaid
 * and an unknown order status as `order-pending`, so the app never claims more progress than is certain.
 */
export function mapSiteStatuses(rawOrder: unknown, rawPayment: unknown): MappedStatuses {
  const sitePaymentStatus: SitePaymentStatus = isSitePaymentStatus(rawPayment) ? rawPayment : 'payment-pending';
  const paymentStatus = mapPaymentStatus(sitePaymentStatus);
  const siteOrderStatus: SiteOrderStatus = isSiteOrderStatus(rawOrder) ? rawOrder : 'order-pending';
  return { siteOrderStatus, sitePaymentStatus, paymentStatus, status: mapOrderStatus(siteOrderStatus, paymentStatus) };
}

export interface TransitionRule {
  /** Current site payment statuses from which the transition may be applied (monotonic rules). */
  allowedFrom: readonly SitePaymentStatus[];
  toPayment: SitePaymentStatus;
  /** Null leaves order_status alone. For `paid` it only replaces `order-pending`. */
  toOrder: SiteOrderStatus | null;
}

export function transitionRule(kind: PaymentTransition['kind'], paidOrderStatus: SiteOrderStatus): TransitionRule {
  switch (kind) {
    case 'paid':
      return {
        allowedFrom: ['payment-pending', 'payment-processing', 'payment-failed'],
        toPayment: 'payment-success',
        toOrder: paidOrderStatus,
      };
    case 'failed':
      return {
        allowedFrom: ['payment-pending', 'payment-processing', 'payment-failed'],
        toPayment: 'payment-failed',
        toOrder: null,
      };
    case 'cancelled':
      return { allowedFrom: ['payment-pending', 'payment-failed'], toPayment: 'payment-failed', toOrder: 'order-cancelled' };
    case 'refunded':
      return { allowedFrom: ['payment-success'], toPayment: 'payment-refunded', toOrder: 'order-refunded' };
  }
}
