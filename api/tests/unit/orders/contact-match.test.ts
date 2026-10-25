import { describe, expect, it } from 'vitest';
import {
  constantTimeEqual,
  contactMatches,
  DUMMY_CONTACT,
  normaliseEmail,
  normalisePhone,
  phoneDigits,
} from '../../../src/orders/contact-match.js';

const stored = { email: 'Ada@Example.com', phone: '+44 7700 900123' };

describe('normalisation', () => {
  it('lower-cases and trims email', () => {
    expect(normaliseEmail('  ADA@Example.COM ')).toBe('ada@example.com');
  });

  it.each([
    ['+44 7700 900123', '7700900123'],
    ['07700 900123', '7700900123'],
    ['(0770) 090-0123', '7700900123'],
    ['+447700900123', '7700900123'],
    ['900123', '900123'],
    ['', ''],
  ])('phone %j -> %j', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it('strips everything but digits', () => {
    expect(phoneDigits('+(1) 2-3 x4')).toBe('1234');
  });
});

describe('constantTimeEqual', () => {
  it('compares equal and unequal strings of any length', () => {
    expect(constantTimeEqual('a', 'a')).toBe(true);
    expect(constantTimeEqual('a', 'b')).toBe(false);
    expect(constantTimeEqual('a', 'a'.repeat(5000))).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });
});

describe('contactMatches', () => {
  it('matches case-insensitively on email', () => {
    expect(contactMatches({ email: 'ada@example.com' }, stored)).toBe(true);
    expect(contactMatches({ email: ' ADA@EXAMPLE.COM ' }, stored)).toBe(true);
  });

  it('matches phone by its last ten digits, whatever the prefix', () => {
    expect(contactMatches({ phone: '07700 900123' }, stored)).toBe(true);
    expect(contactMatches({ phone: '+44 (0)7700-900123' }, { ...stored, phone: '07700900123' })).toBe(true);
  });

  it('rejects a different email or phone', () => {
    expect(contactMatches({ email: 'eve@example.com' }, stored)).toBe(false);
    expect(contactMatches({ phone: '07700 900124' }, stored)).toBe(false);
  });

  it('requires every supplied field to match', () => {
    expect(contactMatches({ email: 'ada@example.com', phone: '07700 900123' }, stored)).toBe(true);
    expect(contactMatches({ email: 'ada@example.com', phone: '07700 000000' }, stored)).toBe(false);
    expect(contactMatches({ email: 'eve@example.com', phone: '07700 900123' }, stored)).toBe(false);
  });

  it('never matches when nothing was supplied', () => {
    expect(contactMatches({}, stored)).toBe(false);
    expect(contactMatches({ email: undefined, phone: undefined }, stored)).toBe(false);
  });

  it('does not let a short phone match by suffix collision with an empty stored phone', () => {
    expect(contactMatches({ phone: '1234567' }, { email: 'x@y.z', phone: '' })).toBe(false);
  });

  it('the dummy never matches realistic claims', () => {
    expect(contactMatches({ email: 'ada@example.com' }, DUMMY_CONTACT)).toBe(false);
    expect(contactMatches({ phone: '07700 900123' }, DUMMY_CONTACT)).toBe(false);
  });
});
