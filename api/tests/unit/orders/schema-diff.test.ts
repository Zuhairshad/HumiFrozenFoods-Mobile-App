import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import {
  countStatuses,
  diffShapes,
  hasBlockingGap,
  profileTrackingNumbers,
  renderReport,
  shapeOf,
} from '../../../src/orders/schema-diff.js';

describe('shapeOf', () => {
  it('records JS types and emptiness, never values', () => {
    const shape = shapeOf({
      a: 'secret-value',
      b: 1,
      c: true,
      d: null,
      e: new Date(),
      f: new ObjectId(),
      g: [],
      h: {},
      i: '',
      j: { k: 'x', l: [{ m: 1 }, { m: 'two' }, 5] },
      n: undefined,
      o: new Map(),
      p: () => 1,
    });
    const asObject = Object.fromEntries(shape);
    expect(asObject.a).toEqual({ type: 'string', empty: false });
    expect(asObject.d).toEqual({ type: 'null', empty: true });
    expect(asObject.e?.type).toBe('date');
    expect(asObject.f?.type).toBe('objectid');
    expect(asObject.g).toEqual({ type: 'array', empty: true });
    expect(asObject.h).toEqual({ type: 'object', empty: true });
    expect(asObject.i?.empty).toBe(true);
    expect(asObject['j.k']).toEqual({ type: 'string', empty: false });
    expect(asObject['j.l']).toEqual({ type: 'array', empty: false });
    expect(asObject['j.l[].m']).toEqual({ type: 'number|string', empty: false });
    expect(asObject['j.l[]']?.type).toBe('number|object');
    expect(asObject.n?.type).toBe('null');
    expect(asObject.o?.type).toBe('other');
    expect(asObject.p?.type).toBe('other');
    expect(JSON.stringify([...shape])).not.toContain('secret-value');
  });

  it('is bounded in depth and key count', () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 20; i += 1) deep = { n: deep };
    expect([...shapeOf(deep).keys()].every((k) => k.split('.').length <= 6)).toBe(true);
    const wide = Object.fromEntries(Array.from({ length: 3000 }, (_, i) => [`k${String(i)}`, 1]));
    expect(shapeOf(wide).size).toBeLessThanOrEqual(1000);
  });

  it('handles null-prototype objects', () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare.x = 1;
    expect(shapeOf({ bare }).get('bare.x')?.type).toBe('number');
  });
});

describe('diffShapes', () => {
  const site = shapeOf({
    _id: new ObjectId(),
    __v: 0,
    tracking_number: '1',
    invoice_no: 'INV-1',
    shop_id: null,
    children: [],
    total: 5,
    status_note: 'x',
    weight: 3,
    nested: { a: 1, b: 'x' },
  });
  const ours = shapeOf({ tracking_number: '2', total: '5', status_note: null, weight: 4, extra: true, nested: { a: 1 }, app_meta: { source: 'mobile-app' } });

  it('lists keys only in site, only in ours and type mismatches', () => {
    const diff = diffShapes(site, ours);
    expect(diff.onlyInSite.map((k) => k.path)).toEqual(['__v', '_id', 'children', 'invoice_no', 'nested.b', 'shop_id']);
    expect(diff.onlyInOurs.map((k) => k.path)).toEqual(['app_meta', 'app_meta.source', 'extra']);
    expect(diff.typeMismatches).toEqual([
      { path: 'status_note', site: 'string', ours: 'null', soft: true },
      { path: 'total', site: 'number', ours: 'string', soft: false },
    ]);
  });

  it('flags only non-empty, non-system keys as required-looking', () => {
    const diff = diffShapes(site, ours);
    const required = Object.fromEntries(diff.onlyInSite.map((k) => [k.path, k.looksRequired]));
    expect(required).toEqual({ __v: false, _id: false, children: false, invoice_no: true, 'nested.b': true, shop_id: false });
    expect(hasBlockingGap(diff)).toBe(true);
  });

  it('is clean when every site key exists on our side', () => {
    const diff = diffShapes(shapeOf({ a: 1, createdAt: 'x', _id: new ObjectId() }), shapeOf({ a: 2 }));
    expect(hasBlockingGap(diff)).toBe(false);
    expect(diff.onlyInSite.every((k) => !k.looksRequired)).toBe(true);
  });

  it('identical shapes produce an empty diff', () => {
    const diff = diffShapes(shapeOf({ a: 1 }), shapeOf({ a: 2 }));
    expect(diff).toEqual({ onlyInSite: [], onlyInOurs: [], typeMismatches: [] });
  });
});

describe('countStatuses', () => {
  it('counts, flags unknown and redacts odd values', () => {
    const docs = [
      { order_status: 'order-pending' },
      { order_status: 'order-pending' },
      { order_status: 'order-shipped-by-hand' },
      { order_status: 'Jane Doe 07700 900123' },
      { order_status: { $ne: 1 } },
      {},
    ];
    expect(countStatuses(docs, 'order_status')).toEqual([
      { value: '<redacted>', count: 2, known: false },
      { value: 'order-pending', count: 2, known: true },
      { value: '<missing>', count: 1, known: false },
      { value: 'order-shipped-by-hand', count: 1, known: false },
    ]);
  });

  it('knows payment statuses', () => {
    expect(countStatuses([{ payment_status: 'payment-success' }], 'payment_status')).toEqual([{ value: 'payment-success', count: 1, known: true }]);
  });
});

describe('profileTrackingNumbers', () => {
  it.each([
    [['123456789012', '000123456789'], { minLength: 12, maxLength: 12, charset: 'digits', leadingZeroSeen: true, nonString: 0 }],
    [['12-34', '1234'], { minLength: 4, maxLength: 5, charset: 'digits-and-dashes', leadingZeroSeen: false, nonString: 0 }],
    [['AB12CD', '99'], { minLength: 2, maxLength: 6, charset: 'alphanumeric', leadingZeroSeen: false, nonString: 0 }],
    [['AB-12_CD'], { minLength: 8, maxLength: 8, charset: 'mixed', leadingZeroSeen: false, nonString: 0 }],
    [[undefined, 5, null, ''], { minLength: null, maxLength: null, charset: 'n/a', leadingZeroSeen: false, nonString: 4 }],
    [[], { minLength: null, maxLength: null, charset: 'n/a', leadingZeroSeen: false, nonString: 0 }],
  ])('profiles %j', (values, expected) => {
    expect(profileTrackingNumbers(values)).toMatchObject(expected);
  });

  it('never contains the numbers themselves', () => {
    expect(JSON.stringify(profileTrackingNumbers(['987654321098']))).not.toContain('987654321098');
  });
});

describe('renderReport', () => {
  const tracking = profileTrackingNumbers(['123456789012']);
  const statuses = countStatuses([{ order_status: 'order-pending' }, { order_status: 'weird' }], 'order_status');

  it('prints a readable table with flags', () => {
    const diff = diffShapes(shapeOf({ invoice_no: 'INV-1', t: 1, shop_id: null }), shapeOf({ t: 'x', mine: 1 }));
    const text = renderReport({ diff, orderStatuses: statuses, paymentStatuses: [], tracking, sampledOrders: 2, appOrderCount: 3 }).join('\n');
    expect(text).toContain('Keys only in the website order (2):');
    expect(text).toMatch(/invoice_no\s+string\s+LOOKS REQUIRED/);
    expect(text).toMatch(/shop_id\s+null\s+optional-looking/);
    expect(text).toMatch(/mine\s+number/);
    expect(text).toMatch(/t\s+site: number\s+ours: string\s+REAL/);
    expect(text).toMatch(/weird\s+1\s+UNKNOWN to the mapper/);
    expect(text).toContain('payment_status in the newest 2 orders:\n  none');
    expect(text).toContain('length 12-12, charset digits, leading zero not seen, non-string 0');
    expect(text).toContain('Orders created by this app so far: 3');
    expect(text).not.toContain('123456789012');
  });

  it('prints none for empty sections and handles a missing site order', () => {
    const empty = diffShapes(shapeOf({ a: 1 }), shapeOf({ a: 1 }));
    const text = renderReport({ diff: empty, orderStatuses: [], paymentStatuses: [], tracking: profileTrackingNumbers([]), sampledOrders: 0, appOrderCount: 0 }).join('\n');
    expect(text).toContain('Keys only in ours (0):\n  none');
    expect(text).toContain('length n/a-n/a');
    const none = renderReport({ diff: null, orderStatuses: [], paymentStatuses: [], tracking, sampledOrders: 0, appOrderCount: 0 }).join('\n');
    expect(none).toContain('No website-created order');
  });

  it('marks nullable mismatches as such', () => {
    const diff = diffShapes(shapeOf({ a: null }), shapeOf({ a: 'x' }));
    expect(renderReport({ diff, orderStatuses: [], paymentStatuses: [], tracking, sampledOrders: 0, appOrderCount: 0 }).join('\n')).toMatch(/a\s+site: null\s+ours: string\s+nullable/);
  });
});
