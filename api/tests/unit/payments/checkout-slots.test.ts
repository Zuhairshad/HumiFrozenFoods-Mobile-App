import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_SLOT_TABLE } from './slot-parity-table.js';
import {
  addDays,
  isCalendarDate,
  isWindowAvailable,
  LEAD_HOURS,
  londonTime,
  SAME_DAY_CUTOFF_HOUR,
  slotProblem,
  WINDOW_START_HOUR,
} from '../../../src/services/checkout-slots.js';

const WINDOWS = ['morning', 'afternoon', 'evening'] as const;

describe('isWindowAvailable parity with the app', () => {
  it.each(APP_SLOT_TABLE)('at %s the app first offers %s', (iso, firstKey, expected) => {
    const now = new Date(iso);
    const { dateKey, hour } = londonTime(now);
    const apiFirst = hour < SAME_DAY_CUTOFF_HOUR ? dateKey : addDays(dateKey, 1);
    expect(apiFirst).toBe(firstKey);
    const todayOffered = firstKey === dateKey;
    const api = WINDOWS.map((window) => todayOffered && isWindowAvailable(true, window, hour));
    expect(api).toEqual([...expected]);
  });

  it('offers every window on any later day', () => {
    for (const hour of [0, 9, 15, 23]) {
      expect(WINDOWS.map((window) => isWindowAvailable(false, window, hour))).toEqual([true, true, true]);
    }
  });

  it('app source still has the structure this mirrors (drift guard)', () => {
    const path = fileURLToPath(new URL('../../../../src/features/checkout/slots.ts', import.meta.url));
    if (!existsSync(path)) return; // api/ checked out alone
    const source = readFileSync(path, 'utf8');
    expect(source).toMatch(new RegExp(`morning: ${String(WINDOW_START_HOUR.morning)}, afternoon: ${String(WINDOW_START_HOUR.afternoon)}, evening: ${String(WINDOW_START_HOUR.evening)}`));
    expect(source).toMatch(new RegExp(`SAME_DAY_CUTOFF_HOUR = ${String(SAME_DAY_CUTOFF_HOUR)}`));
    expect(source).toMatch(new RegExp(`LEAD_HOURS = ${String(LEAD_HOURS)}`));
    expect(source).toMatch(/SLOT_TIME_ZONE = 'Europe\/London'/);
    expect(source).toMatch(/hour < SAME_DAY_CUTOFF_HOUR && w\.startHour >= hour \+ LEAD_HOURS/);
    expect(source).toMatch(/t\.hour < SAME_DAY_CUTOFF_HOUR \? 0 : 1/);
  });
});

describe('londonTime', () => {
  it('uses BST in summer and GMT after the clock change', () => {
    expect(londonTime(new Date('2026-07-01T07:30:00Z'))).toEqual({ dateKey: '2026-07-01', hour: 8 });
    expect(londonTime(new Date('2026-10-26T07:30:00Z'))).toEqual({ dateKey: '2026-10-26', hour: 7 });
  });

  it('rolls the London date over at local midnight, not UTC midnight', () => {
    expect(londonTime(new Date('2026-07-01T23:30:00Z'))).toEqual({ dateKey: '2026-07-02', hour: 0 });
  });
});

describe('date helpers', () => {
  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
  });

  it.each([
    ['2026-02-28', true],
    ['2028-02-29', true],
    ['2026-02-29', false],
    ['2026-13-01', false],
    ['2026-1-01', false],
    ['20261001', false],
    ['', false],
  ])('isCalendarDate(%j) = %s', (value, expected) => {
    expect(isCalendarDate(value)).toBe(expected);
  });
});

describe('slotProblem', () => {
  const monday9 = new Date('2026-10-26T09:00:00Z');

  it('accepts tomorrow through +14 days in any window', () => {
    expect(slotProblem({ date: '2026-10-27', window: 'morning' }, monday9)).toBeNull();
    expect(slotProblem({ date: '2026-11-09', window: 'evening' }, monday9)).toBeNull();
  });

  it('rejects the past, beyond +14 days, and impossible dates', () => {
    expect(slotProblem({ date: '2026-10-25', window: 'morning' }, monday9)).toMatch(/past/);
    expect(slotProblem({ date: '2026-11-10', window: 'morning' }, monday9)).toMatch(/14 days/);
    expect(slotProblem({ date: '2026-02-30', window: 'morning' }, monday9)).toMatch(/valid/);
  });

  it('applies the same-day lead time and cutoff in London time', () => {
    expect(slotProblem({ date: '2026-10-26', window: 'morning' }, monday9)).toMatch(/no longer available/);
    expect(slotProblem({ date: '2026-10-26', window: 'afternoon' }, monday9)).toBeNull();
    const evening = new Date('2026-10-26T15:30:00Z');
    expect(slotProblem({ date: '2026-10-26', window: 'evening' }, evening)).toMatch(/no longer available/);
    expect(slotProblem({ date: '2026-10-27', window: 'morning' }, evening)).toBeNull();
  });

  it('uses the London calendar day near midnight (BST)', () => {
    const justAfterLondonMidnight = new Date('2026-07-01T23:30:00Z'); // 2 July 00:30 BST
    expect(slotProblem({ date: '2026-07-01', window: 'evening' }, justAfterLondonMidnight)).toMatch(/past/);
    expect(slotProblem({ date: '2026-07-02', window: 'evening' }, justAfterLondonMidnight)).toBeNull();
  });
});
