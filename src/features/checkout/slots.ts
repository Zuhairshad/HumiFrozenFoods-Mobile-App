import type { DeliveryWindowId } from '@/lib/api/types';

export interface DeliveryWindow {
  id: DeliveryWindowId;
  label: string;
  range: string;
  startHour: number;
}

export const DELIVERY_WINDOWS: readonly DeliveryWindow[] = [
  { id: 'morning', label: 'Morning', range: '8am-12pm', startHour: 8 },
  { id: 'afternoon', label: 'Afternoon', range: '12pm-5pm', startHour: 12 },
  { id: 'evening', label: 'Evening', range: '5pm-9pm', startHour: 17 },
];

/** Same-day delivery is offered only before 15:00 (site rule). */
export const SAME_DAY_CUTOFF_HOUR = 15;
const LEAD_HOURS = 2;
const DAY_COUNT = 5;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

export const toDateKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export interface DeliveryDay {
  key: string;
  /** "Today" or "Sat 25" */
  label: string;
  isToday: boolean;
  date: Date;
}

export function getDeliveryDays(now: Date = new Date()): DeliveryDay[] {
  const out: DeliveryDay[] = [];
  const startOffset = now.getHours() < SAME_DAY_CUTOFF_HOUR ? 0 : 1;
  for (let i = 0; i < DAY_COUNT; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + startOffset + i);
    const isToday = startOffset + i === 0;
    out.push({ key: toDateKey(d), label: isToday ? 'Today' : `${WEEKDAYS[d.getDay()]} ${d.getDate()}`, isToday, date: d });
  }
  return out;
}

export function isWindowAvailable(day: DeliveryDay, w: DeliveryWindow, now: Date = new Date()): boolean {
  return !day.isToday || w.startHour >= now.getHours() + LEAD_HOURS;
}

/** "Sat 25 Oct, 8am-12pm" */
export function formatSlotLabel(dateKey: string, window: DeliveryWindowId): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const w = DELIVERY_WINDOWS.find((x) => x.id === window);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}, ${w?.range ?? ''}`;
}
