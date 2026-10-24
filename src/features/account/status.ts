import type { Order, OrderStatus } from '@/types';

export interface StatusStep {
  key: OrderStatus;
  label: string;
}

export const STEPS: readonly StatusStep[] = [
  { key: 'placed', label: 'Order placed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'out-for-delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

const MIN = 60 * 1000;

export function stepIndex(status: OrderStatus): number {
  return STEPS.findIndex((s) => s.key === status);
}

/**
 * Demo only: derive a live-feeling status from elapsed time since the order was placed.
 * Never moves backwards from the stored status.
 */
export function deriveStatus(order: Order, now: number = Date.now()): OrderStatus {
  const elapsed = now - new Date(order.placedAt).getTime();
  if (Number.isNaN(elapsed)) return order.status;
  let derived: OrderStatus = 'delivered';
  if (elapsed < 2 * MIN) derived = 'placed';
  else if (elapsed < 10 * MIN) derived = 'preparing';
  else if (elapsed < 30 * MIN) derived = 'out-for-delivery';
  return stepIndex(derived) >= stepIndex(order.status) ? derived : order.status;
}

export const STATUS_HEADLINE: Record<OrderStatus, string> = {
  placed: 'Order placed',
  preparing: 'Preparing your order',
  'out-for-delivery': 'Out for delivery',
  delivered: 'Delivered',
};

export const STATUS_TAG: Record<OrderStatus, string> = {
  placed: 'Placed',
  preparing: 'Preparing',
  'out-for-delivery': 'On the way',
  delivered: 'Delivered',
};

export type StatusTone = 'neutral' | 'tint' | 'success' | 'accent';

export const STATUS_TONE: Record<OrderStatus, StatusTone> = {
  placed: 'neutral',
  preparing: 'tint',
  'out-for-delivery': 'accent',
  delivered: 'success',
};

export const STATUS_COPY: Record<OrderStatus, string> = {
  placed: 'We have received your order.',
  preparing: 'Your order is being packed with care.',
  'out-for-delivery': 'Your frozen goods are on their way.',
  delivered: 'Delivered. Enjoy every bite.',
};

export function isActive(status: OrderStatus): boolean {
  return status !== 'delivered';
}
