import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../../src/services/canonical-json.js';
import {
  IDEMPOTENCY_KEY_PATTERN,
  normalisePostcode,
  paymentIntentBodySchema,
} from '../../../src/services/checkout-schema.js';

export const validBody = {
  lines: [{ productId: 'chicken-samosa', quantity: 2 }],
  contact: { name: 'Asha Patel', email: 'Asha@Example.com', phone: '+44 7123 456789' },
  address: { line1: '1 High Street', city: 'London', postcode: 'sw1a1aa' },
  slot: { date: '2026-10-28', window: 'morning' },
};

const parse = (body: unknown) => paymentIntentBodySchema.safeParse(body);
const paths = (body: unknown): string[] => {
  const result = parse(body);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
};

describe('postcode normalisation', () => {
  it.each([
    ['sw1a1aa', 'SW1A 1AA'],
    [' ec1a  1bb ', 'EC1A 1BB'],
    ['M1 1AE', 'M1 1AE'],
    ['b338th', 'B33 8TH'],
    ['CR26XH', 'CR2 6XH'],
    ['dn551pt', 'DN55 1PT'],
    ['w1a0ax', 'W1A 0AX'],
    ['GIR 0AA', 'GIR 0AA'],
  ])('%j -> %j', (input, expected) => {
    expect(normalisePostcode(input)).toBe(expected);
  });

  it.each(['', 'ABC', '12345', 'QQ1 1AA', 'SW1A 1AAA', 'SW1A 1CA', 'S W1A1AA!', 'A1 1AA\nB2 2BB', 'VV1 1AA'])(
    'rejects %j',
    (input) => {
      expect(normalisePostcode(input)).toBeNull();
    },
  );
});

describe('payment intent body schema', () => {
  it('accepts a valid body and normalises postcode, email and trims strings', () => {
    const result = parse({ ...validBody, contact: { ...validBody.contact, name: '  Asha  ' }, notes: ' ring bell ' });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      contact: { name: 'Asha', email: 'asha@example.com' },
      address: { postcode: 'SW1A 1AA' },
      notes: 'ring bell',
    });
  });

  it('drops empty optional line2 and notes', () => {
    const result = parse({ ...validBody, address: { ...validBody.address, line2: '  ' }, notes: '' });
    expect(result.data?.address.line2).toBeUndefined();
    expect(result.data?.notes).toBeUndefined();
  });

  it('rejects unknown fields at every level (strict)', () => {
    expect(parse({ ...validBody, extra: 1 }).success).toBe(false);
    expect(parse({ ...validBody, contact: { ...validBody.contact, role: 'admin' } }).success).toBe(false);
    expect(parse({ ...validBody, lines: [{ productId: 'a', quantity: 1, pricePence: 1 }] }).success).toBe(false);
    expect(parse({ ...validBody, totalPence: 1 }).success).toBe(false);
  });

  it('enforces line limits', () => {
    expect(paths({ ...validBody, lines: [] })).toContain('lines');
    const many = Array.from({ length: 31 }, (_, i) => ({ productId: `p${String(i)}`, quantity: 1 }));
    expect(paths({ ...validBody, lines: many })).toContain('lines');
    expect(parse({ ...validBody, lines: many.slice(0, 30) }).success).toBe(true);
    expect(paths({ ...validBody, lines: [{ productId: 'a', quantity: 0 }] })).toContain('lines.0.quantity');
    expect(paths({ ...validBody, lines: [{ productId: 'a', quantity: 21 }] })).toContain('lines.0.quantity');
    expect(paths({ ...validBody, lines: [{ productId: 'a', quantity: 1.5 }] })).toContain('lines.0.quantity');
    expect(paths({ ...validBody, lines: [{ productId: 'a b', quantity: 1 }] })).toContain('lines.0.productId');
    expect(paths({ ...validBody, lines: [{ productId: 'a', quantity: 15 }, { productId: 'a', quantity: 6 }] })).toContain('lines.1.quantity');
  });

  it.each([
    ['contact.name', { ...validBody.contact, name: '' }],
    ['contact.name', { ...validBody.contact, name: 'x'.repeat(81) }],
    ['contact.name', { ...validBody.contact, name: 'Asha\u0007' }],
    ['contact.email', { ...validBody.contact, email: 'not-an-email' }],
    ['contact.email', { ...validBody.contact, email: `${'a'.repeat(250)}@x.co` }],
    ['contact.phone', { ...validBody.contact, phone: '12345' }],
    ['contact.phone', { ...validBody.contact, phone: 'abcdefgh' }],
    ['contact.phone', { ...validBody.contact, phone: '+'.repeat(10) }],
    ['contact.phone', { ...validBody.contact, phone: '1'.repeat(21) }],
  ])('rejects invalid %s', (path, contact) => {
    expect(paths({ ...validBody, contact })).toContain(path);
  });

  it.each([
    ['address.line1', { ...validBody.address, line1: '' }],
    ['address.line1', { ...validBody.address, line1: 'x'.repeat(81) }],
    ['address.line2', { ...validBody.address, line2: 'x'.repeat(81) }],
    ['address.city', { ...validBody.address, city: 'Lon\ndon' }],
    ['address.postcode', { ...validBody.address, postcode: 'NOTAPC' }],
    ['address.postcode', { ...validBody.address, postcode: 'x'.repeat(40) }],
  ])('rejects invalid %s', (path, address) => {
    expect(paths({ ...validBody, address })).toContain(path);
  });

  it('validates slot shape, notes length and promo code format', () => {
    expect(paths({ ...validBody, slot: { date: '28/10/2026', window: 'morning' } })).toContain('slot.date');
    expect(paths({ ...validBody, slot: { date: '2026-10-28', window: 'midnight' } })).toContain('slot.window');
    expect(paths({ ...validBody, notes: 'x'.repeat(301) })).toContain('notes');
    expect(parse({ ...validBody, notes: 'x'.repeat(300) }).success).toBe(true);
    expect(paths({ ...validBody, notes: 'a\nb' })).toContain('notes');
    expect(paths({ ...validBody, promoCode: 'bad code!' })).toContain('promoCode');
    expect(paths({ ...validBody, promoCode: 'A'.repeat(33) })).toContain('promoCode');
    expect(parse({ ...validBody, promoCode: 'HUMI15' }).success).toBe(true);
  });

  it('rejects non-object bodies', () => {
    for (const body of [null, 'x', 5, [], undefined]) expect(parse(body).success).toBe(false);
  });
});

describe('idempotency key pattern', () => {
  it('accepts UUID v4 only', () => {
    expect(IDEMPOTENCY_KEY_PATTERN.test('0b0d9a4e-8f3b-4f64-9a52-3c6c1f7a2e10')).toBe(true);
    expect(IDEMPOTENCY_KEY_PATTERN.test('0B0D9A4E-8F3B-4F64-9A52-3C6C1F7A2E10')).toBe(true);
    for (const bad of ['', 'abc', '0b0d9a4e-8f3b-1f64-9a52-3c6c1f7a2e10', '0b0d9a4e-8f3b-4f64-7a52-3c6c1f7a2e10', '0b0d9a4e8f3b4f649a523c6c1f7a2e10']) {
      expect(IDEMPOTENCY_KEY_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe('canonicalJson', () => {
  it('is independent of key order and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: undefined }], c: null } })).toBe(
      canonicalJson({ a: { c: null, d: [1, { z: 1 }] }, b: 1 }),
    );
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});
