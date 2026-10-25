import { describe, expect, it } from 'vitest';
import {
  dedupeText,
  enquirySchema,
  isHoneypotTripped,
  normaliseEmail,
  normaliseLine,
  normaliseMessage,
} from '../../../src/enquiries/validation.js';
import { validB2b, validContact, validSalesRep } from './support.js';

const issuePaths = (input: unknown): string[] => {
  const result = enquirySchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
};

describe('normaliseLine', () => {
  it('applies NFC, collapses unicode spaces and trims', () => {
    expect(normaliseLine('  Café   Bar  ')).toBe('Café Bar');
  });

  it.each([
    ['zero-width space', 'a​b'],
    ['zero-width joiner', 'a‍b'],
    ['RTL override', 'a‮b'],
    ['bidi isolate', 'a⁦b'],
    ['BOM', '﻿ab'],
    ['newline', 'a\nb'],
    ['carriage return', 'a\rb'],
    ['NUL', 'a\u0000b'],
    ['line separator', 'a b'],
    ['lone surrogate', 'a\ud800b'],
    ['private use', 'ab'],
  ])('rejects %s', (_label, value) => {
    expect(normaliseLine(value)).toBeNull();
  });

  it('keeps HTML and operators as plain text', () => {
    expect(normaliseLine('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
    expect(normaliseLine('{"$gt":""}')).toBe('{"$gt":""}');
  });
});

describe('normaliseMessage', () => {
  it('normalises line endings, tabs and blank-line runs', () => {
    expect(normaliseMessage('  one\r\ntwo\t\tthree\r\r\r\rfour  ')).toBe('one\ntwo three\n\nfour');
  });

  it('rejects other controls and format characters', () => {
    expect(normaliseMessage('hello\u0007 world')).toBeNull();
    expect(normaliseMessage('hello​ world')).toBeNull();
    expect(normaliseMessage('hello‮ world')).toBeNull();
    expect(normaliseMessage('hello  world')).toBeNull();
  });
});

describe('normaliseEmail', () => {
  it('lowercases only the domain', () => {
    expect(normaliseEmail(' Ada.L+tag@Example.COM ')).toBe('Ada.L+tag@example.com');
  });

  it.each([
    'plain',
    '@example.com',
    'a@',
    'a@example',
    'a@@example.com',
    'a b@example.com',
    'a@exa mple.com',
    '.a@example.com',
    'a.@example.com',
    'a..b@example.com',
    'a@-example.com',
    'a@example-.com',
    'a@example.c',
    'a@example.123',
    'a@exam_ple.com',
    '"a"@example.com',
    'a@example.com\r\nBcc: evil@example.org',
    'a@example.com\nBcc: evil@example.org',
    'a@example.com,b@example.org',
    'a@example.com;b@example.org',
    '<a@example.com>',
    'ädä@example.com',
    'a@exämple.com',
    'a@example.com​',
    `${'a'.repeat(65)}@example.com`,
    `a@${'b'.repeat(64)}.com`,
    `${'a'.repeat(60)}@${'b.'.repeat(100)}com`,
  ])('rejects %j', (value) => {
    expect(normaliseEmail(value)).toBeNull();
  });

  it('accepts punycode domains', () => {
    expect(normaliseEmail('a@example.xn--p1ai')).toBe('a@example.xn--p1ai');
  });
});

describe('enquirySchema', () => {
  it('accepts each valid shape and drops the honeypot key', () => {
    expect(enquirySchema.parse({ ...validContact, website: '' })).toEqual(validContact);
    expect(enquirySchema.parse(validB2b)).toEqual(validB2b);
    expect(enquirySchema.parse(validSalesRep)).toEqual(validSalesRep);
    expect(enquirySchema.parse({ ...validSalesRep, business: { name: 'Rep Ltd', type: 'Agent' } }).business).toEqual({
      name: 'Rep Ltd',
      type: 'Agent',
    });
    expect(enquirySchema.parse({ ...validContact, phone: '07700 900123' }).phone).toBe('07700 900123');
  });

  it('enforces per-type requirements', () => {
    const { business: _b, ...b2bNoBusiness } = validB2b;
    expect(issuePaths(b2bNoBusiness)).toEqual(['business']);
    const { phone: _p, ...b2bNoPhone } = validB2b;
    expect(issuePaths(b2bNoPhone)).toEqual(['phone']);
    const { phone: _q, ...repNoPhone } = validSalesRep;
    expect(issuePaths(repNoPhone)).toEqual(['phone']);
    expect(issuePaths({ ...validContact, business: { name: 'Ab', type: 'Cd' } })).toEqual(['']);
  });

  it('rejects unknown types, unknown keys and non-objects', () => {
    expect(issuePaths({ ...validContact, type: 'complaint' })).toEqual(['type']);
    expect(issuePaths({ ...validContact, role: 'admin' })).toEqual(['']);
    expect(issuePaths({ ...validContact, status: 'resolved' })).toEqual(['']);
    expect(enquirySchema.safeParse('x').success).toBe(false);
    expect(enquirySchema.safeParse(null).success).toBe(false);
    expect(enquirySchema.safeParse([]).success).toBe(false);
  });

  it('enforces length bounds after normalisation', () => {
    expect(issuePaths({ ...validContact, name: 'A' })).toEqual(['name']);
    expect(issuePaths({ ...validContact, name: ' A ' })).toEqual(['name']);
    expect(issuePaths({ ...validContact, name: 'x'.repeat(81) })).toEqual(['name']);
    expect(issuePaths({ ...validContact, name: 'x'.repeat(80) })).toEqual([]);
    expect(issuePaths({ ...validContact, message: 'too short' })).toEqual(['message']);
    expect(issuePaths({ ...validContact, message: '   123456789   ' })).toEqual(['message']);
    expect(issuePaths({ ...validContact, message: 'm'.repeat(2001) })).toEqual(['message']);
    expect(issuePaths({ ...validContact, message: 'm'.repeat(2000) })).toEqual([]);
    expect(issuePaths({ ...validContact, message: 'm'.repeat(5_000_000) })).toEqual(['message']);
  });

  it.each([
    ['name', 'Ada\r\nBcc: evil@example.org'],
    ['name', 'Ada‮Lovelace'],
    ['name', 'Ada​Lovelace'],
    ['email', 'ada@example.com\r\nBcc: evil@example.org'],
    ['message', 'Hello there\u0000 friend'],
  ])('rejects header-injection and control characters in %s', (field, value) => {
    expect(issuePaths({ ...validContact, [field]: value })).toEqual([field]);
  });

  it('rejects non-string values including NoSQL operator objects', () => {
    expect(issuePaths({ ...validContact, email: { $gt: '' } })).toEqual(['email']);
    expect(issuePaths({ ...validContact, name: ['Ada', 'Bob'] })).toEqual(['name']);
    expect(issuePaths({ ...validContact, message: 12345678901 })).toEqual(['message']);
    expect(issuePaths({ ...validContact, website: { $ne: '' } })).toEqual(['website']);
  });

  it.each(['123456', '+44 (0)20 7946 0958', 'abc1234567', '+++++++++++', '1234567<script>', `${'1'.repeat(21)}`, '12345\n67890'])(
    'rejects phone %j or accepts only well-formed ones',
    (phone) => {
      const ok = enquirySchema.safeParse({ ...validB2b, phone }).success;
      expect(ok).toBe(phone === '+44 (0)20 7946 0958');
    },
  );

  it('keeps stored-XSS strings as inert plain text', () => {
    const xss = '<img src=x onerror=alert(1)> <script>alert("x")</script>';
    const parsed = enquirySchema.parse({ ...validContact, name: '<b>Ada</b>', message: xss });
    expect(parsed.name).toBe('<b>Ada</b>');
    expect(parsed.message).toBe(xss);
  });
});

describe('helpers', () => {
  it('dedupeText folds case and whitespace', () => {
    expect(dedupeText('Hello\n  WORLD')).toBe('hello world');
  });

  it('isHoneypotTripped only fires on a non-empty string', () => {
    expect(isHoneypotTripped({ website: 'http://spam' })).toBe(true);
    expect(isHoneypotTripped({ website: '' })).toBe(false);
    expect(isHoneypotTripped({})).toBe(false);
    expect(isHoneypotTripped({ website: 5 })).toBe(false);
    expect(isHoneypotTripped(null)).toBe(false);
    expect(isHoneypotTripped([])).toBe(false);
    expect(isHoneypotTripped('website')).toBe(false);
  });
});
