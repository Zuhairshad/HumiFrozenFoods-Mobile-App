import { describe, expect, it } from 'vitest';
import { getDeliveryDays, isWindowAvailable, DELIVERY_WINDOWS } from '../../src/features/checkout/slots';

// The suite runs with TZ=UTC. The server cutoff and "today" are Europe/London.
describe('delivery slots use Europe/London, not the device zone', () => {
  it('after the 15:00 London cutoff in BST (14:30 UTC) today is not offered', () => {
    const now = new Date('2026-07-01T14:30:00Z'); // 15:30 BST
    const days = getDeliveryDays(now);
    expect(days[0].isToday).toBe(false);
    expect(days[0].key).toBe('2026-07-02');
    expect(days).toHaveLength(5);
  });

  it('just after London midnight (still the previous day in UTC) the London date is today', () => {
    const now = new Date('2026-10-24T23:30:00Z'); // 00:30 BST on 25 Oct
    const days = getDeliveryDays(now);
    expect(days[0]).toMatchObject({ key: '2026-10-25', isToday: true, label: 'Today' });
    expect(days[1].key).toBe('2026-10-26'); // clocks go back at 02:00 BST: still consecutive keys
    expect(days[2].key).toBe('2026-10-27');
  });

  it('window availability uses the London hour and refuses today once past the cutoff', () => {
    const early = new Date('2026-07-01T06:00:00Z'); // 07:00 BST
    const [today] = getDeliveryDays(early);
    const morning = DELIVERY_WINDOWS[0];
    const evening = DELIVERY_WINDOWS[2];
    expect(isWindowAvailable(today, morning, early)).toBe(false); // 8 < 7 + 2
    expect(isWindowAvailable(today, evening, early)).toBe(true);
    const late = new Date('2026-07-01T14:30:00Z'); // 15:30 BST, a stale "today" chip
    expect(isWindowAvailable(today, evening, late)).toBe(false);
  });
});
