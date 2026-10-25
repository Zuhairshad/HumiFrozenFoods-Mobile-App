import type { Slot, SlotWindow } from '../domain/types.js';

/**
 * Mirrors the app's delivery-slot rules (src/features/checkout/slots.ts: DELIVERY_WINDOWS,
 * SAME_DAY_CUTOFF_HOUR, LEAD_HOURS, isWindowAvailable). tests/unit/services/checkout-slots.test.ts
 * holds a parity table and a drift guard against that file.
 */
export const WINDOW_START_HOUR: Readonly<Record<SlotWindow, number>> = { morning: 8, afternoon: 12, evening: 17 };
export const SAME_DAY_CUTOFF_HOUR = 15;
export const LEAD_HOURS = 2;
export const MAX_DAYS_AHEAD = 14;

const LONDON = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

export interface LondonTime {
  /** YYYY-MM-DD in Europe/London. */
  dateKey: string;
  /** 0-23 in Europe/London. */
  hour: number;
}

export function londonTime(instant: Date): LondonTime {
  const parts = Object.fromEntries(LONDON.formatToParts(instant).map((part) => [part.type, part.value]));
  return { dateKey: `${parts.year ?? ''}-${parts.month ?? ''}-${parts.day ?? ''}`, hour: Number(parts.hour) };
}

/** Adds whole days to a YYYY-MM-DD key using UTC arithmetic, so DST never shifts the date. */
export function addDays(dateKey: string, days: number): string {
  const [year = 0, month = 1, day = 1] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** True for a YYYY-MM-DD string that is a real calendar date (rejects 2026-02-30). */
export function isCalendarDate(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  return addDays(dateKey, 0) === dateKey;
}

/** Same rule as the app's isWindowAvailable, plus its rule that today is only offered before the cutoff. */
export function isWindowAvailable(isToday: boolean, window: SlotWindow, londonHour: number): boolean {
  if (!isToday) return true;
  return londonHour < SAME_DAY_CUTOFF_HOUR && WINDOW_START_HOUR[window] >= londonHour + LEAD_HOURS;
}

/** Returns a client-safe reason when the slot cannot be booked, otherwise null. */
export function slotProblem(slot: Slot, now: Date): string | null {
  if (!isCalendarDate(slot.date)) return 'Choose a valid delivery date';
  const { dateKey: today, hour } = londonTime(now);
  if (slot.date < today) return 'Delivery date is in the past';
  if (slot.date > addDays(today, MAX_DAYS_AHEAD)) return `Delivery can be booked up to ${String(MAX_DAYS_AHEAD)} days ahead`;
  if (!isWindowAvailable(slot.date === today, slot.window, hour)) return 'That delivery window is no longer available today';
  return null;
}
