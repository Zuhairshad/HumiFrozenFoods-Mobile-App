import type { Order, OrderStatus } from '@/types';

export const STEPS: { key: OrderStatus; label: string; icon: 'receipt-outline' | 'restaurant-outline' | 'bicycle-outline' | 'checkmark-done-outline' }[] = [
  { key: 'placed', label: 'Placed', icon: 'receipt-outline' },
  { key: 'preparing', label: 'Preparing', icon: 'restaurant-outline' },
  { key: 'out-for-delivery', label: 'On the way', icon: 'bicycle-outline' },
  { key: 'delivered', label: 'Delivered', icon: 'checkmark-done-outline' },
];

const MIN = 60 * 1000;

/** Demo only: derive a live-feeling status from elapsed time since the order was placed. */
export function deriveStatus(order: Order, now: number = Date.now()): OrderStatus {
  const elapsed = now - new Date(order.placedAt).getTime();
  if (Number.isNaN(elapsed)) return order.status;
  if (elapsed < 2 * MIN) return 'placed';
  if (elapsed < 10 * MIN) return 'preparing';
  if (elapsed < 30 * MIN) return 'out-for-delivery';
  return 'delivered';
}

export function stepIndex(status: OrderStatus): number {
  return STEPS.findIndex((s) => s.key === status);
}

export const STATUS_COPY: Record<OrderStatus, string> = {
  placed: 'We have received your order',
  preparing: 'Your order is being packed with care',
  'out-for-delivery': 'Your frozen goods are on their way',
  delivered: 'Delivered. Enjoy every bite!',
};
