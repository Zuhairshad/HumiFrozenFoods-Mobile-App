import { formatDate } from '@/lib/format';
import type { Order } from '@/types';

export interface OrderExtras {
  name?: string;
  email?: string;
  phone?: string;
  slotLabel?: string;
  paymentStatus?: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Orders may carry `contact`, `slot` and `paymentStatus` (added by the checkout work).
 * Read them defensively so older persisted orders keep working.
 */
export function readOrderExtras(order: Order): OrderExtras {
  const raw = asRecord(order) ?? {};
  const contact = asRecord(raw.contact);
  const slotRaw = raw.slot;
  const slot = asRecord(slotRaw);

  let slotLabel = str(slotRaw);
  if (slot) {
    const composed = [str(slot.dayLabel) ?? str(slot.day) ?? str(slot.date), str(slot.window) ?? str(slot.time)]
      .filter((p): p is string => !!p)
      .join(' ');
    slotLabel = str(slot.label) ?? (composed || undefined);
  }

  return {
    name: str(contact?.name) ?? str(contact?.fullName),
    email: str(contact?.email),
    phone: str(contact?.phone),
    slotLabel,
    paymentStatus: str(raw.paymentStatus),
  };
}

export function itemCount(order: Order): number {
  return order.lines.reduce((n, l) => n + l.quantity, 0);
}

export function itemsLabel(order: Order): string {
  const n = itemCount(order);
  return `${n} ${n === 1 ? 'item' : 'items'}`;
}

/** "24 Oct" (no year) for list rows. */
export function shortDate(iso: string): string {
  const full = formatDate(iso);
  if (!full) return '';
  const parts = full.split(' ');
  return parts.slice(0, 2).join(' ');
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${shortDate(iso)} ${hh}:${mm}`;
}

export function orderLabel(order: Order): string {
  return `Order ${order.id}`;
}
