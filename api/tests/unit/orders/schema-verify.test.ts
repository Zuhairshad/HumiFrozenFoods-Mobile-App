import type { Collection } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { sampleNewOrder, verifyOrdersSchema } from '../../../src/orders/schema-verify.js';
import { toSiteDocument } from '../../../src/orders/site-order-mapper.js';
import { NOW, websiteDoc } from './fixtures.js';

type Fake = Pick<Collection, 'find' | 'countDocuments'>;

/** A collection whose only methods are the two read operations; anything else is a TypeError. */
function fakeCollection(site: Record<string, unknown> | undefined, recent: Record<string, unknown>[]): { collection: Fake; find: ReturnType<typeof vi.fn> } {
  const find = vi.fn((filter: Record<string, unknown>) => {
    const docs = 'app_meta' in filter ? (site ? [site] : []) : recent;
    const cursor = { sort: () => cursor, limit: () => cursor, toArray: () => Promise.resolve(docs) };
    return cursor;
  });
  const collection = { find, countDocuments: vi.fn(() => Promise.resolve(2)) } as unknown as Fake;
  return { collection, find };
}

describe('sampleNewOrder', () => {
  it('maps cleanly through the real mapper', () => {
    expect(() => toSiteDocument(sampleNewOrder(), { now: NOW })).not.toThrow();
  });
});

describe('verifyOrdersSchema', () => {
  it('exits 1 when the site order has a required-looking key we do not write', async () => {
    const { collection } = fakeCollection(websiteDoc({ invoice_no: 'INV-SECRET-1' }), [{ order_status: 'order-pending', payment_status: 'payment-pending', tracking_number: '555000111222' }]);
    const result = await verifyOrdersSchema(collection, NOW);
    expect(result.exitCode).toBe(1);
    const text = result.lines.join('\n');
    expect(text).toMatch(/invoice_no\s+string\s+LOOKS REQUIRED/);
    expect(text).toContain('Do not enable writes yet');
    for (const secret of ['INV-SECRET-1', 'Grace', 'grace@example.com', '555000111222', '+447700900999', '9 Low Road']) {
      expect(text).not.toContain(secret);
    }
  });

  it('exits 0 when everything the site writes is covered', async () => {
    const site = { ...toSiteDocument(sampleNewOrder(), { now: NOW }) } as Record<string, unknown>;
    delete site.app_meta;
    const result = await verifyOrdersSchema(fakeCollection(site, []).collection, NOW);
    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toContain('no required-looking key is missing');
  });

  it('exits 2 when there is no website order to compare with', async () => {
    const result = await verifyOrdersSchema(fakeCollection(undefined, []).collection, NOW);
    expect(result.exitCode).toBe(2);
    expect(result.lines.join('\n')).toContain('No website-created order');
  });

  it('only issues constant, read-only queries and projects the status sample', async () => {
    const { collection, find } = fakeCollection(websiteDoc(), []);
    await verifyOrdersSchema(collection, NOW);
    expect(find.mock.calls[0]).toEqual([{ app_meta: { $exists: false } }]);
    expect(find.mock.calls[1]).toEqual([{}, { projection: { _id: 0, order_status: 1, payment_status: 1, tracking_number: 1 } }]);
  });
});
