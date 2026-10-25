import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../../../src/catalog/cursor.js';
import { mapProductDocument } from '../../../src/catalog/product-mapper.js';
import type { FeatureDeps, ProductQuery, ProductsRepository } from '../../../src/domain/ports.js';
import type { CollectionId, ProductRecord } from '../../../src/domain/types.js';
import { catalogRoutes } from '../../../src/routes/catalog.js';
import type { AppEnv } from '../../../src/types.js';
import { errorBody, testApp, testDeps } from '../helpers.js';
import { liveDocs, testBusiness } from './support.js';

const records: ProductRecord[] = liveDocs().map((doc) => {
  const result = mapProductDocument(doc, testBusiness);
  if (!result.ok) throw new Error(result.reason);
  return result.record;
});

class FakeProducts implements ProductsRepository {
  readonly queries: ProductQuery[] = [];
  failWith: Error | undefined;

  constructor(private readonly all: readonly ProductRecord[] = records) {}

  list(query: ProductQuery) {
    this.queries.push(query);
    if (this.failWith) return Promise.reject(this.failWith);
    const after = query.cursor === undefined ? '' : decodeCursor(query.cursor);
    const q = query.q?.toLowerCase();
    const matching = [...this.all]
      .sort((a, b) => a.sourceId.localeCompare(b.sourceId))
      .filter((p) => p.sourceId > after)
      .filter((p) => query.collection === undefined || p.collection === query.collection)
      .filter((p) => q === undefined || p.name.toLowerCase().includes(q));
    const items = matching.slice(0, query.limit);
    const last = items.at(-1);
    return Promise.resolve({ items, nextCursor: matching.length > query.limit && last ? encodeCursor(last.sourceId) : null });
  }

  findByIdOrSlug(idOrSlug: string) {
    return Promise.resolve(this.all.find((p) => p.id === idOrSlug || p.sourceId === idOrSlug) ?? null);
  }

  findManyBySlugs(slugs: readonly string[]) {
    return Promise.resolve(this.all.filter((p) => slugs.includes(p.id)));
  }

  countByCollection() {
    const counts: Record<CollectionId, number> = { 'savory-snacks': 0, kebabs: 0, 'vegetable-samosas': 0, samosas: 0, other: 0 };
    for (const p of this.all) counts[p.collection] += 1;
    return Promise.resolve(counts);
  }
}

function build(env: Record<string, string> = {}, products = new FakeProducts(), paymentsEnabled = true) {
  const base = testDeps({}, env);
  // Only config, products and payments are read by the catalogue routes; the rest of FeatureDeps is irrelevant here.
  const deps = { ...base, products, payments: { enabled: paymentsEnabled } } as unknown as FeatureDeps;
  const app: Hono<AppEnv> = testApp((a) => a.route('/v1', catalogRoutes(deps)), {}, env);
  return { app, products };
}

interface ProductsBody {
  items: Record<string, unknown>[];
  nextCursor: string | null;
}

describe('GET /v1/config', () => {
  it('returns contract values from config with a 60 s public cache', async () => {
    const { app } = build({ PROMO_CODES: '[{"code":"HUMI15","kind":"percentage","value":15}]' });
    const res = await app.request('/v1/config');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(res.headers.get('etag')).toMatch(/^W\/"[A-Za-z0-9_-]+"$/);
    expect(await res.json()).toEqual({
      currency: 'gbp',
      delivery: { feePence: 799, freeThresholdPence: 5000, minOrderPence: 0 },
      promo: { enabled: true },
      payments: { provider: 'stripe', enabled: true },
      lowStockThreshold: 5,
      slotWindows: [
        { id: 'morning', label: 'Morning', range: '8am-12pm' },
        { id: 'afternoon', label: 'Afternoon', range: '12pm-5pm' },
        { id: 'evening', label: 'Evening', range: '5pm-9pm' },
      ],
    });
  });

  it('reflects overrides, no promos and disabled payments', async () => {
    const { app } = build({ DELIVERY_FEE_PENCE: '499', FREE_DELIVERY_THRESHOLD_PENCE: '', MIN_ORDER_PENCE: '1500', LOW_STOCK_THRESHOLD: '8' }, new FakeProducts(), false);
    const body = (await (await app.request('/v1/config')).json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      delivery: { feePence: 499, freeThresholdPence: null, minOrderPence: 1500 },
      promo: { enabled: false },
      payments: { provider: 'stripe', enabled: false },
      lowStockThreshold: 8,
    });
  });

  it('answers a matching If-None-Match with 304 and keeps the cache headers', async () => {
    const { app } = build();
    const first = await app.request('/v1/config');
    const etag = first.headers.get('etag') ?? '';
    for (const header of [etag, etag.replace('W/', ''), `"other", ${etag}`, '*']) {
      const res = await app.request('/v1/config', { headers: { 'if-none-match': header } });
      expect(res.status, header).toBe(304);
      expect(await res.text()).toBe('');
      expect(res.headers.get('etag')).toBe(etag);
      expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    }
    const stale = await app.request('/v1/config', { headers: { 'if-none-match': 'W/"different"' } });
    expect(stale.status).toBe(200);
  });
});

describe('GET /v1/products', () => {
  it('lists with defaults and the catalogue cache header', async () => {
    const { app, products } = build();
    const res = await app.request('/v1/products');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, stale-while-revalidate=300');
    const body = (await res.json()) as ProductsBody;
    expect(body.items).toHaveLength(17);
    expect(body.nextCursor).toBeNull();
    expect(products.queries[0]).toEqual({ limit: 50 });
  });

  it('never exposes server-only fields', async () => {
    const text = await (await build().app.request('/v1/products')).text();
    for (const key of ['stock', 'quantity', 'b2b_pricing', 'sku', '__v', 'sold_quantity', 'status']) expect(text).not.toContain(`"${key}"`);
    expect(text).toContain('"pricePence"');
  });

  it('passes validated filters through and pages with the opaque cursor', async () => {
    const { app, products } = build();
    const first = (await (await app.request('/v1/products?collection=kebabs&limit=2&q=%20Kebab%20')).json()) as ProductsBody;
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    expect(products.queries[0]).toEqual({ limit: 2, collection: 'kebabs', q: 'Kebab' });
    const second = (await (await app.request(`/v1/products?collection=kebabs&limit=2&q=Kebab&cursor=${first.nextCursor ?? ''}`)).json()) as ProductsBody;
    expect(second.items[0]?.['id']).not.toBe(first.items[0]?.['id']);
  });

  it('treats a blank q as absent', async () => {
    const { app, products } = build();
    await app.request('/v1/products?q=');
    await app.request('/v1/products?q=%20%20');
    expect(products.queries).toEqual([{ limit: 50 }, { limit: 50 }]);
  });

  it('accepts the limit boundaries and a q of exactly 60 characters', async () => {
    const { app } = build();
    expect((await app.request('/v1/products?limit=1')).status).toBe(200);
    expect((await app.request('/v1/products?limit=100')).status).toBe(200);
    expect((await app.request(`/v1/products?q=${'a'.repeat(60)}`)).status).toBe(200);
  });

  it.each([
    ['limit zero', 'limit=0'],
    ['limit 101', 'limit=101'],
    ['limit negative', 'limit=-1'],
    ['limit fractional', 'limit=1.5'],
    ['limit exponent', 'limit=1e1'],
    ['limit text', 'limit=abc'],
    ['limit empty', 'limit='],
    ['limit hex', 'limit=0x10'],
    ['limit padded', 'limit=%2010'],
    ['limit repeated', 'limit=5&limit=6'],
    ['limit huge', `limit=${'9'.repeat(40)}`],
    ['unknown collection', 'collection=frozen-pizza'],
    ['collection operator', 'collection[$ne]=kebabs'],
    ['collection repeated', 'collection=kebabs&collection=samosas'],
    ['q too long', `q=${'a'.repeat(61)}`],
    ['q huge', `q=${'a'.repeat(5000)}`],
    ['q control char', 'q=a%00b'],
    ['q newline', 'q=a%0Ab'],
    ['q repeated', 'q=a&q=b'],
    ['q operator key', 'q[$ne]=x'],
    ['dollar key', '$where=1'],
    ['dotted key', 'a.b=1'],
    ['proto key', '__proto__=x'],
    ['unknown param', 'sort=price'],
    ['cursor not base64url', 'cursor=a%20b'],
    ['cursor too long', `cursor=${'A'.repeat(65)}`],
    ['cursor empty', 'cursor='],
  ])('rejects %s with a 400 envelope', async (_label, query) => {
    const res = await build().app.request(`/v1/products?${query}`);
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await errorBody(res);
    expect(['validation_failed', 'unsafe_input']).toContain(body.error.code);
    expect(body.error.requestId).toBeTruthy();
  });

  it('rejects a well-formed but bogus cursor from the repository with 400', async () => {
    const res = await build().app.request(`/v1/products?cursor=${Buffer.from('{"$ne":null}').toString('base64url')}`);
    expect(res.status).toBe(400);
    expect((await errorBody(res)).error.code).toBe('invalid_cursor');
  });

  it('does not echo the submitted value in validation errors', async () => {
    const res = await build().app.request('/v1/products?q=%3Cscript%3E&limit=zzz-secret');
    const text = JSON.stringify(await errorBody(res));
    expect(text).not.toContain('zzz-secret');
  });

  it('turns repository failures into a generic 500', async () => {
    const products = new FakeProducts();
    products.failWith = new Error('mongodb://user:pw@host failed');
    const res = await build({}, products).app.request('/v1/products');
    expect(res.status).toBe(500);
    const { error } = await errorBody(res);
    expect(error).toMatchObject({ code: 'internal_error', message: 'Internal server error' });
  });

  it('supports conditional requests', async () => {
    const { app } = build();
    const first = await app.request('/v1/products?limit=3');
    const etag = first.headers.get('etag') ?? '';
    const second = await app.request('/v1/products?limit=3', { headers: { 'if-none-match': etag } });
    expect(second.status).toBe(304);
    expect(second.headers.get('cache-control')).toBe('public, max-age=60, stale-while-revalidate=300');
  });
});

describe('GET /v1/products/:idOrSlug', () => {
  it('finds by slug and by ObjectId, returning the public shape', async () => {
    const { app } = build();
    const bySlug = await app.request('/v1/products/chicken-seekh-kebab');
    expect(bySlug.status).toBe(200);
    expect(bySlug.headers.get('cache-control')).toBe('public, max-age=60, stale-while-revalidate=300');
    const body = (await bySlug.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ id: 'chicken-seekh-kebab', collection: 'kebabs', pricePence: 1350 });
    expect('stock' in body).toBe(false);
    const byId = await app.request(`/v1/products/${String(body['sourceId'])}`);
    expect(((await byId.json()) as Record<string, unknown>)['id']).toBe('chicken-seekh-kebab');
  });

  it.each(['nope', '$where', '%24ne', '000000000000000000000000', '..%2F..%2Fetc', '%7B%22%24ne%22%3Anull%7D'])('404s %s with the standard envelope', async (param) => {
    const res = await build().app.request(`/v1/products/${param}`);
    expect(res.status).toBe(404);
    const body = await errorBody(res);
    expect(body.error.code).toBe('not_found');
    expect(body.error.requestId).toBeTruthy();
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects an oversize identifier with 400', async () => {
    const res = await build().app.request(`/v1/products/${'a'.repeat(101)}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/collections', () => {
  it('lists the four app collections with counts, hiding an empty "other"', async () => {
    const res = await build().app.request('/v1/collections');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, stale-while-revalidate=300');
    const body = (await res.json()) as { items: { id: string; title: string; productCount: number }[] };
    expect(body.items.map((i) => i.id)).toEqual(['savory-snacks', 'kebabs', 'vegetable-samosas', 'samosas']);
    expect(body.items.reduce((sum, i) => sum + i.productCount, 0)).toBe(17);
    expect(body.items[0]).toEqual({ id: 'savory-snacks', title: 'Savory Snacks', productCount: 5 });
  });

  it('includes "other" once something lands in it', async () => {
    const odd = { ...(records[0] as ProductRecord), collection: 'other' as const };
    const { app } = build({}, new FakeProducts([odd]));
    const body = (await (await app.request('/v1/collections')).json()) as { items: { id: string; productCount: number }[] };
    expect(body.items.at(-1)).toEqual({ id: 'other', title: 'Other', productCount: 1 });
  });
});
