import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadProductFixture } from '../../support/seed.js';
import { expectError, expectNoLeaks, expectSiteDataIntact } from '../../support/assertions.js';
import { createHarness, type Harness } from '../../support/harness.js';
import type { ProductBody, ProductListBody, QuoteBody } from '../../support/types.js';

let h: Harness;

const FIXTURE = loadProductFixture();
const SKU_VALUES = FIXTURE.map((p) => String(p['sku']));
const PRODUCT_KEYS = [
  'categories',
  'collection',
  'compareAtPricePence',
  'description',
  'gallery',
  'id',
  'image',
  'inStock',
  'lowStock',
  'name',
  'pricePence',
  'rating',
  'reviewCount',
  'sourceId',
  'unit',
];

beforeAll(async () => {
  h = await createHarness();
}, 120_000);

afterAll(async () => {
  await expectSiteDataIntact(h);
  await h.close();
});

async function listAll(limit: number, extra = ''): Promise<{ pages: ProductListBody[]; items: ProductBody[] }> {
  const pages: ProductListBody[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 50; guard += 1) {
    const res = await h.get(`/v1/products?limit=${String(limit)}${extra}${cursor ? `&cursor=${cursor}` : ''}`);
    expect(res.status, res.text).toBe(200);
    const page = res.json<ProductListBody>();
    pages.push(page);
    cursor = page.nextCursor;
    if (cursor === null) break;
  }
  return { pages, items: pages.flatMap((p) => p.items) };
}

describe('GET /v1/config', () => {
  it('reflects the environment and is cacheable', async () => {
    const res = await h.get('/v1/config');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(res.json()).toEqual({
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
    expectNoLeaks(res, { catalogue: true });
  });

  it('follows different config values', async () => {
    const other = await createHarness({
      env: { DELIVERY_FEE_PENCE: '350', FREE_DELIVERY_THRESHOLD_PENCE: '', MIN_ORDER_PENCE: '1500', PROMO_CODES: '[]', LOW_STOCK_THRESHOLD: '9' },
      payments: 'disabled',
    });
    try {
      const body = (await other.get('/v1/config')).json<Record<string, unknown>>();
      expect(body).toMatchObject({
        delivery: { feePence: 350, freeThresholdPence: null, minOrderPence: 1500 },
        promo: { enabled: false },
        payments: { provider: 'stripe', enabled: false },
        lowStockThreshold: 9,
      });
    } finally {
      await other.close();
    }
  }, 120_000);

  it('supports conditional requests with an ETag', async () => {
    const first = await h.get('/v1/config');
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    const again = await h.get('/v1/config', { headers: { 'if-none-match': etag ?? '' } });
    expect(again.status).toBe(304);
    expect(again.text).toBe('');
  });
});

describe('GET /v1/products', () => {
  it('lists all 17 published products with exactly the whitelisted fields', async () => {
    const res = await h.get('/v1/products');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, stale-while-revalidate=300');
    const body = res.json<ProductListBody>();
    expect(body.items).toHaveLength(17);
    expect(body.nextCursor).toBeNull();
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(PRODUCT_KEYS);
      expect(item.id).toMatch(/^[a-z0-9-]+$/);
      expect(item.sourceId).toMatch(/^[0-9a-f]{24}$/);
      expect(Number.isInteger(item.pricePence)).toBe(true);
      expect(item.description).not.toMatch(/<[a-z/][^>]*>/i);
      expect(item.description).not.toContain('&lt;');
    }
    expect(new Set(body.items.map((i) => i.id)).size).toBe(17);
  });

  it('maps site prices to pence, preferring a truthy sale_price', async () => {
    const roti = (await h.get('/v1/products/punjabi-samosa-roti')).json<ProductBody>();
    expect(roti.pricePence).toBe(598); // price 5.99, sale_price 5.98, discount:false
    expect(roti.compareAtPricePence).toBeNull();
    const seekh = (await h.get('/v1/products/chicken-seekh-kebab')).json<ProductBody>();
    expect(seekh.pricePence).toBe(1350);
    expect(seekh.inStock).toBe(true);
    expect(seekh.lowStock).toBe(false);
    expect(seekh.categories).toEqual([{ id: expect.stringMatching(/^[0-9a-f]{24}$/) as string, name: 'Frozen Bakery', slug: 'frozen-bakery-bakery' }]);
  });

  it('pages through the whole catalogue with a small limit, without gaps or duplicates', async () => {
    const { pages, items } = await listAll(5);
    expect(pages.map((p) => p.items.length)).toEqual([5, 5, 5, 2]);
    expect(pages.at(-1)?.nextCursor).toBeNull();
    expect(items.map((i) => i.sourceId)).toEqual([...items.map((i) => i.sourceId)].sort());
    expect(new Set(items.map((i) => i.id)).size).toBe(17);
    const all = (await h.get('/v1/products?limit=100')).json<ProductListBody>();
    expect(items.map((i) => i.id)).toEqual(all.items.map((i) => i.id));
  });

  it('has no phantom page when the catalogue size is an exact multiple of the limit', async () => {
    const exact = await listAll(17);
    expect(exact.pages).toHaveLength(1);
    expect(exact.pages[0]?.nextCursor).toBeNull();
    const nearly = await listAll(16);
    expect(nearly.pages.map((p) => p.items.length)).toEqual([16, 1]);
    const one = await listAll(1);
    expect(one.pages).toHaveLength(17);
  });

  it('filters by collection and the filters partition the catalogue', async () => {
    const ids = ['savory-snacks', 'kebabs', 'vegetable-samosas', 'samosas', 'other'];
    const seen: string[] = [];
    for (const id of ids) {
      const { items } = await listAll(4, `&collection=${id}`);
      for (const item of items) expect(item.collection).toBe(id);
      seen.push(...items.map((i) => i.id));
    }
    expect(seen).toHaveLength(17);
    expect(new Set(seen).size).toBe(17);
    const kebabs = (await listAll(100, '&collection=kebabs')).items.map((i) => i.id);
    expect(kebabs).toEqual(expect.arrayContaining(['chicken-seekh-kebab', 'meat-chapli-kebab', 'meat-shami-kebabs']));
    expect((await listAll(100, '&collection=vegetable-samosas')).items.map((i) => i.id)).toContain('vegetable-crispy-samosa');
  });

  it('searches names case-insensitively and treats q as plain text', async () => {
    for (const q of ['kebab', 'KeBaB', '  kebab  ']) {
      const { items } = await listAll(100, `&q=${encodeURIComponent(q)}`);
      expect(items.length).toBe(5);
      for (const item of items) expect(item.name.toLowerCase()).toContain('kebab');
    }
    for (const q of ['.*', '(', '[a-z]+', '^ALOO$', '$ne', '{"$ne":null}', 'a|b']) {
      const res = await h.get(`/v1/products?q=${encodeURIComponent(q)}`);
      expect(res.status, `${q}: ${res.text}`).toBe(200);
      expect(res.json<ProductListBody>().items, `regex characters must not act as a pattern: ${q}`).toEqual([]);
    }
    expect((await listAll(100, `&q=${encodeURIComponent('spring roll')}`)).items).toHaveLength(3);
  });

  it('rejects malformed queries with 400 and the error envelope', async () => {
    for (const query of [
      'limit=0',
      'limit=101',
      'limit=abc',
      'limit=-1',
      'limit=1.5',
      'collection=pizza',
      'cursor=not-a-cursor!',
      'cursor=Zm9v',
      'unknown=1',
      `q=${'x'.repeat(61)}`,
      'q=bad%00char',
    ]) {
      const res = await h.get(`/v1/products?${query}`);
      expectError(res, 400);
    }
  });

  it('does not list unpublished or hidden products', async () => {
    await h.addProduct({ slug: 'e2e-draft', name: 'E2E DRAFT', status: 'draft' });
    await h.addProduct({ slug: 'e2e-private', name: 'E2E PRIVATE', visibility: 'private' });
    try {
      const { items } = await listAll(100);
      expect(items.map((i) => i.id)).not.toContain('e2e-draft');
      expect(items.map((i) => i.id)).not.toContain('e2e-private');
      expect(items).toHaveLength(17);
    } finally {
      await h.removeProduct('e2e-draft');
      await h.removeProduct('e2e-private');
    }
  });

  it('reports stock only as inStock/lowStock', async () => {
    await h.addProduct({ slug: 'e2e-low', name: 'E2E LOW', quantity: 3 });
    await h.addProduct({ slug: 'e2e-edge', name: 'E2E EDGE', quantity: 5 });
    await h.addProduct({ slug: 'e2e-ok', name: 'E2E OK', quantity: 6 });
    await h.addProduct({ slug: 'e2e-gone', name: 'E2E GONE', quantity: 0 });
    await h.addProduct({ slug: 'e2e-flag', name: 'E2E FLAG', quantity: 50, in_stock: false });
    try {
      const get = async (slug: string): Promise<ProductBody> => (await h.get(`/v1/products/${slug}`)).json<ProductBody>();
      expect(await get('e2e-low')).toMatchObject({ inStock: true, lowStock: true });
      expect(await get('e2e-edge')).toMatchObject({ inStock: true, lowStock: true });
      expect(await get('e2e-ok')).toMatchObject({ inStock: true, lowStock: false });
      expect(await get('e2e-gone')).toMatchObject({ inStock: false, lowStock: false });
      expect(await get('e2e-flag')).toMatchObject({ inStock: false, lowStock: false });
      // Out-of-stock products stay listed (the app shows them as sold out).
      expect((await listAll(100)).items.map((i) => i.id)).toContain('e2e-gone');
    } finally {
      for (const slug of ['e2e-low', 'e2e-edge', 'e2e-ok', 'e2e-gone', 'e2e-flag']) await h.removeProduct(slug);
    }
  });
});

describe('GET /v1/products/:idOrSlug', () => {
  it('returns the same product by slug and by ObjectId', async () => {
    const bySlug = await h.get('/v1/products/aloo-tikki');
    expect(bySlug.status).toBe(200);
    const product = bySlug.json<ProductBody>();
    const byId = await h.get(`/v1/products/${product.sourceId}`);
    expect(byId.status).toBe(200);
    expect(byId.json()).toEqual(product);
    expect(byId.headers.get('etag')).toBe(bySlug.headers.get('etag'));
    const upper = await h.get(`/v1/products/${product.sourceId.toUpperCase()}`);
    expect([200, 404]).toContain(upper.status);
  });

  it('answers 404 for unknown slugs and ids, and for unpublished products', async () => {
    expectError(await h.get('/v1/products/no-such-product'), 404, 'not_found');
    expectError(await h.get('/v1/products/0123456789abcdef01234567'), 404, 'not_found');
    const draft = await h.addProduct({ slug: 'e2e-draft', name: 'E2E DRAFT', status: 'draft' });
    try {
      expectError(await h.get('/v1/products/e2e-draft'), 404, 'not_found');
      expectError(await h.get(`/v1/products/${String(draft['_id'])}`), 404, 'not_found');
    } finally {
      await h.removeProduct('e2e-draft');
    }
  });

  it('rejects hostile identifiers without a server error', async () => {
    for (const id of ['%24ne', '%7B%22%24ne%22%3A1%7D', '..%2F..%2Fetc%2Fpasswd', '%00', 'a'.repeat(101), '%3Cscript%3E']) {
      const res = await h.get(`/v1/products/${id}`);
      expect(res.status, `${id}: ${res.text}`).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
  });
});

describe('GET /v1/collections', () => {
  it('counts published products per collection', async () => {
    const res = await h.get('/v1/collections');
    expect(res.status).toBe(200);
    const { items } = res.json<{ items: { id: string; title: string; productCount: number }[] }>();
    expect(items.reduce((sum, c) => sum + c.productCount, 0)).toBe(17);
    const all = (await listAll(100)).items;
    for (const c of items) expect(c.productCount).toBe(all.filter((p) => p.collection === c.id).length);
    expect(items.map((c) => c.id)).toEqual(expect.arrayContaining(['kebabs', 'samosas', 'savory-snacks']));
  });
});

describe('no private data in any public response', () => {
  it('never leaks b2b_pricing, quantity, sold_quantity, sku, __v or other site internals', async () => {
    // Sanity: the seeded documents really do carry the sensitive fields, so a clean scan is meaningful.
    for (const doc of FIXTURE) {
      expect(doc['b2b_pricing']).toBeDefined();
      expect(doc['quantity']).toBeDefined();
      expect(doc['sold_quantity']).toBeDefined();
      expect(doc['sku']).toBeDefined();
      expect(doc['__v']).toBeDefined();
    }
    const scan = { catalogue: true, forbiddenValues: SKU_VALUES };

    expectNoLeaks(await h.get('/v1/config'), scan);
    expectNoLeaks(await h.get('/v1/collections'), scan);
    expectNoLeaks(await h.get('/v1/products?limit=100'), scan);
    expectNoLeaks(await h.get('/v1/products?q=samosa&limit=3'), scan);
    for (const doc of FIXTURE) {
      expectNoLeaks(await h.get(`/v1/products/${String(doc['slug'])}`), scan);
      expectNoLeaks(await h.get(`/v1/products/${String(doc['_id'])}`), scan);
    }
    // Error bodies must not echo internals either.
    expectNoLeaks(await h.get('/v1/products/nope'), scan);
    expectNoLeaks(await h.get('/v1/products?limit=0'), scan);
    expectNoLeaks(await h.get('/v1/nope'), scan);
  });

  it('keeps stock out of quote responses too', async () => {
    const res = await h.post('/v1/checkout/quote', { lines: FIXTURE.map((p) => ({ productId: String(p['slug']), quantity: 1 })) });
    expect(res.status).toBe(200);
    expectNoLeaks(res, { forbiddenValues: SKU_VALUES });
    expect(res.json<QuoteBody>().lines).toHaveLength(17);
  });
});
