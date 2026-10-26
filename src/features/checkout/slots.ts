import type { DeliveryWindowId, SlotWindowConfig } from '../../lib/api/types';

export interface DeliveryWindow {
  id: DeliveryWindowId;
  label: string;
  range: string;
  startHour: number;
}

/** FALLBACK labels, used until GET /v1/config returns `slotWindows`. */
export const DELIVERY_WINDOWS: readonly DeliveryWindow[] = [
  { id: 'morning', label: 'Morning', range: '8am-12pm', startHour: 8 },
  { id: 'afternoon', label: 'Afternoon', range: '12pm-5pm', startHour: 12 },
  { id: 'evening', label: 'Evening', range: '5pm-9pm', startHour: 17 },
];

const START_HOURS: Record<DeliveryWindowId, number> = { morning: 8, afternoon: 12, evening: 17 };

/** Windows from the server config (labels/ranges), else the fallback list. */
export function getDeliveryWindows(server?: SlotWindowConfig[]): readonly DeliveryWindow[] {
  if (!server || server.length === 0) return DELIVERY_WINDOWS;
  return server
    .filter((w) => w.id in START_HOURS)
    .map((w) => ({ id: w.id, label: w.label, range: w.range, startHour: START_HOURS[w.id] }));
}

/** Same-day delivery is offered only before 15:00 (site rule). */
export const SAME_DAY_CUTOFF_HOUR = 15;
const LEAD_HOURS = 2;
const DAY_COUNT = 5;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

export const toDateKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The server's cutoff and "today" are UK time, whatever zone the phone is set to. */
const SLOT_TIME_ZONE = 'Europe/London';

/** Calendar date and hour (0-23) at `now` in Europe/London. Falls back to the device zone if Intl lacks time zones. */
export function londonNow(now: Date): { year: number; month: number; day: number; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: SLOT_TIME_ZONE,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const year = get('year');
    const month = get('month');
    const day = get('day');
    const hour = get('hour') % 24;
    if ([year, month, day, hour].every(Number.isFinite)) return { year, month, day, hour };
  } catch {
    /* fall through */
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours() };
}

export interface DeliveryDay {
  key: string;
  /** "Today" or "Sat 25" */
  label: string;
  isToday: boolean;
  date: Date;
}

export function getDeliveryDays(now: Date = new Date()): DeliveryDay[] {
  const out: DeliveryDay[] = [];
  const t = londonNow(now);
  const startOffset = t.hour < SAME_DAY_CUTOFF_HOUR ? 0 : 1;
  for (let i = 0; i < DAY_COUNT; i++) {
    // Pure calendar arithmetic on the London date: immune to DST and to the device zone.
    const utc = new Date(Date.UTC(t.year, t.month - 1, t.day + startOffset + i));
    const isToday = startOffset + i === 0;
    out.push({
      key: `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`,
      label: isToday ? 'Today' : `${WEEKDAYS[utc.getUTCDay()]} ${utc.getUTCDate()}`,
      isToday,
      date: new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()),
    });
  }
  return out;
}

export function isWindowAvailable(day: DeliveryDay, w: DeliveryWindow, now: Date = new Date()): boolean {
  if (!day.isToday) return true;
  const hour = londonNow(now).hour;
  return hour < SAME_DAY_CUTOFF_HOUR && w.startHour >= hour + LEAD_HOURS;
}

/** "Sat 25 Oct, 8am-12pm" */
export function formatSlotLabel(dateKey: string, window: DeliveryWindowId, windows: readonly DeliveryWindow[] = DELIVERY_WINDOWS): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const w = windows.find((x) => x.id === window);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}, ${w?.range ?? ''}`;
}
