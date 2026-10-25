import { describe, expect, it } from 'vitest';
import type { PromoCode } from '../../../src/domain/types.js';
import { pence } from '../../../src/lib/money.js';
import { applyPromo, normalisePromoCode } from '../../../src/services/promo.js';
import { NOW } from './fixtures.js';

const CODES: PromoCode[] = [
  { code: 'HUMI15', kind: 'percentage', value: 15 },
  { code: 'TENOFF', kind: 'fixed', value: 1000 },
  { code: 'SHIP', kind: 'free_shipping', value: 0 },
  { code: 'BIG', kind: 'percentage', value: 20, minSubtotalPence: 2550 },
  { code: 'OLD', kind: 'fixed', value: 100, expiresAt: '2026-05-31T23:59:59.000Z' },
  { code: 'EDGE', kind: 'fixed', value: 100, expiresAt: NOW.toISOString() },
  { code: 'FUTURE', kind: 'fixed', value: 100, expiresAt: '2026-06-01T12:00:00.001Z' },
  { code: 'BADDATE', kind: 'fixed', value: 100, expiresAt: 'not-a-date' },
  { code: 'FULL', kind: 'percentage', value: 100 },
  { code: 'NEG', kind: 'fixed', value: -5 },
];

function run(code: string, subtotal: number, delivery = 799) {
  return applyPromo({ code, promoCodes: CODES, subtotalPence: pence(subtotal), deliveryPence: pence(delivery), now: NOW });
}

describe('normalisePromoCode', () => {
  it.each([
    [undefined, null],
    ['', null],
    ['   ', null],
    [' humi15 ', 'HUMI15'],
    ['Humi-15_x', 'HUMI-15_X'],
  ])('%j -> %j', (input, expected) => {
    expect(normalisePromoCode(input)).toBe(expected);
  });
});

describe('applyPromo', () => {
  const cases: {
    name: string;
    code: string;
    subtotal: number;
    delivery?: number;
    valid: boolean;
    message: string;
    discount: number;
    deliveryOut: number;
  }[] = [
    { name: 'percentage rounds half up (15% of 1999 = 299.85)', code: 'HUMI15', subtotal: 1999, valid: true, message: 'Code applied.', discount: 300, deliveryOut: 799 },
    { name: 'percentage exact half rounds up (15% of 110 = 16.5)', code: 'HUMI15', subtotal: 110, valid: true, message: 'Code applied.', discount: 17, deliveryOut: 799 },
    { name: 'percentage rounds down below half (15% of 3 = 0.45)', code: 'HUMI15', subtotal: 3, valid: true, message: 'Code applied.', discount: 0, deliveryOut: 799 },
    { name: 'percentage on odd pence (15% of 9999)', code: 'HUMI15', subtotal: 9999, valid: true, message: 'Code applied.', discount: 1500, deliveryOut: 799 },
    { name: 'percentage 100 is capped at subtotal', code: 'FULL', subtotal: 777, valid: true, message: 'Code applied.', discount: 777, deliveryOut: 799 },
    { name: 'fixed smaller than subtotal', code: 'TENOFF', subtotal: 5000, valid: true, message: 'Code applied.', discount: 1000, deliveryOut: 799 },
    { name: 'fixed larger than subtotal is capped', code: 'TENOFF', subtotal: 600, valid: true, message: 'Code applied.', discount: 600, deliveryOut: 799 },
    { name: 'negative fixed value never produces a surcharge', code: 'NEG', subtotal: 600, valid: true, message: 'Code applied.', discount: 0, deliveryOut: 799 },
    { name: 'free shipping zeroes delivery, no discount', code: 'SHIP', subtotal: 1200, valid: true, message: 'Free delivery applied.', discount: 0, deliveryOut: 0 },
    { name: 'free shipping with already free delivery', code: 'SHIP', subtotal: 9000, delivery: 0, valid: true, message: 'Free delivery applied.', discount: 0, deliveryOut: 0 },
    { name: 'case-insensitive and trimmed lookup', code: 'humi15', subtotal: 1000, valid: true, message: 'Code applied.', discount: 150, deliveryOut: 799 },
    { name: 'unknown code has no effect', code: 'NOPE', subtotal: 1000, valid: false, message: 'That code is not valid.', discount: 0, deliveryOut: 799 },
    { name: 'expired code has no effect', code: 'OLD', subtotal: 1000, valid: false, message: 'This code has expired.', discount: 0, deliveryOut: 799 },
    { name: 'expiry instant itself is expired', code: 'EDGE', subtotal: 1000, valid: false, message: 'This code has expired.', discount: 0, deliveryOut: 799 },
    { name: 'one millisecond before expiry is valid', code: 'FUTURE', subtotal: 1000, valid: true, message: 'Code applied.', discount: 100, deliveryOut: 799 },
    { name: 'unparseable expiry fails closed', code: 'BADDATE', subtotal: 1000, valid: false, message: 'This code has expired.', discount: 0, deliveryOut: 799 },
    { name: 'below minimum spend', code: 'BIG', subtotal: 2549, valid: false, message: 'Spend £25.50 or more to use this code.', discount: 0, deliveryOut: 799 },
    { name: 'exactly the minimum spend', code: 'BIG', subtotal: 2550, valid: true, message: 'Code applied.', discount: 510, deliveryOut: 799 },
  ];

  it.each(cases)('$name', ({ code, subtotal, delivery, valid, message, discount, deliveryOut }) => {
    const out = run(code.toUpperCase(), subtotal, delivery);
    expect(out.promo).toEqual({ code: code.toUpperCase(), valid, message });
    expect(out.discountPence).toBe(discount);
    expect(out.deliveryPence).toBe(deliveryOut);
  });

  it('unknown and expired messages never mention other codes', () => {
    const unknown = JSON.stringify(run('NOPE', 100));
    for (const c of CODES) expect(unknown).not.toContain(c.code);
    expect(JSON.stringify(run('OLD', 100))).not.toContain('HUMI15');
  });

  it('identical unknown responses regardless of which code is guessed', () => {
    expect(run('AAA', 100).promo.message).toBe(run('ZZZ', 100).promo.message);
  });

  it('matches stored codes case-insensitively', () => {
    const out = applyPromo({
      code: 'LOWER',
      promoCodes: [{ code: 'lower', kind: 'fixed', value: 5 }],
      subtotalPence: pence(100),
      deliveryPence: pence(0),
      now: NOW,
    });
    expect(out.discountPence).toBe(5);
  });
});
