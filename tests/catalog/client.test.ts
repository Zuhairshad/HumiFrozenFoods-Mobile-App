import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CatalogError,
  fetchCollections,
  fetchLiveCatalog,
  fetchProducts,
  getCatalogBaseUrl,
  parseCollections,
  parsePublicProduct,
  parseProductsPage,
} from '@/lib/api/catalog-client';
import { jsonResponse, livePublic, page, wireProduct } from './fixtures';

const BASE = 'https://api.test';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('getCatalogBaseUrl', () => {
  it('is undefined when unset or blank (demo mode)', () => {
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', '');
    expect(getCatalogBaseUrl()).toBeUndefined();
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', '   ');
    expect(getCatalogBaseUrl()).toBeUndefined();
  });
  it('trims and strips trailing slashes', () => {
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', ' https://api.test// ');
    expect(getCatalogBaseUrl()).toBe('https://api.test');
  });
});

describe('parsePublicProduct (hostile payloads)', () => {
  it('accepts a valid product and rebuilds it without extra keys', () => {
    const p = parsePublicProduct({ ...wireProduct(), evil: '<script>', __proto__: { polluted: true } });
    expect(p).not.toBeNull();
    expect(p).not.toHaveProperty('evil');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  const bad: [string, unknown][] = [
    ['null', null],
    ['string', 'x'],
    ['array', []],
    ['number', 42],
    ['missing id', wireProduct({ id: undefined })],
    ['numeric id', wireProduct({ id: 5 })],
    ['empty id', wireProduct({ id: '' })],
    ['__proto__ id', wireProduct({ id: '__proto__' })],
    ['path id', wireProduct({ id: '../../etc/passwd' })],
    ['id with space', wireProduct({ id: 'a b' })],
    ['huge id', wireProduct({ id: 'a'.repeat(500) })],
    ['missing name', wireProduct({ name: undefined })],
    ['blank name', wireProduct({ name: '   ' })],
    ['name object', wireProduct({ name: { $gt: '' } })],
    ['float pence', wireProduct({ pricePence: 9.5 })],
    ['negative pence', wireProduct({ pricePence: -1 })],
    ['NaN pence', wireProduct({ pricePence: Number.NaN })],
    ['string pence', wireProduct({ pricePence: '950' })],
    ['Infinity pence', wireProduct({ pricePence: Number.POSITIVE_INFINITY })],
    ['absurd pence', wireProduct({ pricePence: 1e12 })],
    ['missing inStock', wireProduct({ inStock: undefined })],
    ['string inStock', wireProduct({ inStock: 'true' })],
  ];
  it.each(bad)('drops: %s', (_label, value) => {
    expect(parsePublicProduct(value)).toBeNull();
  });

  it('sanitises optional fields instead of dropping', () => {
    const p = parsePublicProduct(
      wireProduct({
        description: 42,
        unit: '  ',
        image: { thumbnail: 'javascript:alert(1)', original: 'ftp://x' },
        gallery: ['https://ok.test/a.jpg', 'javascript:alert(1)', 7, null, 'data:text/html,x'],
        lowStock: 'yes',
        collection: 'weapons',
        categories: [{ id: 1 }, { id: 'a', name: 'A', slug: 'a' }, null],
        rating: 99,
        reviewCount: -5,
        compareAtPricePence: 100,
      }),
    );
    expect(p).toMatchObject({
      description: '',
      unit: null,
      image: null,
      gallery: ['https://ok.test/a.jpg'],
      lowStock: false,
      collection: 'other',
      categories: [{ id: 'a', name: 'A', slug: 'a' }],
      rating: 5,
      reviewCount: 0,
      compareAtPricePence: null, // not above the price
    });
  });

  it('thumbnail-only image is promoted; non-array gallery/categories become []', () => {
    const p = parsePublicProduct(
      wireProduct({ image: { thumbnail: 'https://ok.test/t.jpg' }, gallery: 'nope', categories: 'nope', rating: 'x', compareAtPricePence: 2000 }),
    );
    expect(p?.image).toEqual({ thumbnail: 'https://ok.test/t.jpg', original: 'https://ok.test/t.jpg' });
    expect(p?.gallery).toEqual([]);
    expect(p?.categories).toEqual([]);
    expect(p?.rating).toBe(0);
    expect(p?.compareAtPricePence).toBe(2000);
  });

  it('out of stock is never low stock; rating rounds to one decimal', () => {
    expect(parsePublicProduct(wireProduct({ inStock: false, lowStock: true }))?.lowStock).toBe(false);
    expect(parsePublicProduct(wireProduct({ rating: 4.26 }))?.rating).toBe(4.3);
  });

  it('truncates oversized text', () => {
    const p = parsePublicProduct(wireProduct({ description: 'x'.repeat(50_000), name: 'n'.repeat(1000) }));
    expect(p?.description.length).toBe(5000);
    expect(p?.name.length).toBe(200);
  });
});

describe('parseProductsPage', () => {
  it('drops malformed items and duplicates, counts them, keeps the cursor', () => {
    const r = parseProductsPage(
      page([wireProduct({ id: 'a' }), { nope: 1 }, wireProduct({ id: 'a' }), wireProduct({ id: 'b' }), null], 'next-1'),
    );
    expect(r.items.map((p) => p.id)).toEqual(['a', 'b']);
    expect(r.dropped).toBe(3);
    expect(r.nextCursor).toBe('next-1');
  });
  it('ignores a non-string or oversized cursor', () => {
    expect(parseProductsPage({ items: [], nextCursor: 5 }).nextCursor).toBeNull();
    expect(parseProductsPage({ items: [], nextCursor: 'x'.repeat(501) }).nextCursor).toBeNull();
    expect(parseProductsPage({ items: [], nextCursor: '' }).nextCursor).toBeNull();
  });
  it.each([null, undefined, 'x', [], {}, { items: 'no' }, { items: {} }])('throws malformed for envelope %j', (v) => {
    expect(() => parseProductsPage(v)).toThrow(CatalogError);
  });
});

describe('parseCollections', () => {
  it('keeps valid, drops invalid and duplicates', () => {
    const r = parseCollections({
      items: [
        { id: 'kebabs', title: ' Kebabs ', productCount: 3 },
        { id: 'kebabs', title: 'Dup', productCount: 1 },
        { id: 'bogus', title: 'X', productCount: 1 },
        { id: 'samosas', title: '', productCount: 1 },
        { id: 'other', title: 'Other', productCount: -2 },
        null,
      ],
    });
    expect(r).toEqual([
      { id: 'kebabs', title: 'Kebabs', productCount: 3 },
      { id: 'other', title: 'Other', productCount: 0 },
    ]);
  });
  it('throws on a bad envelope', () => {
    expect(() => parseCollections({})).toThrow(CatalogError);
    expect(() => parseCollections(null)).toThrow(CatalogError);
  });
});

describe('fetchLiveCatalog / fetchProducts', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it('demo mode: never calls fetch', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', '');
    const r = await fetchLiveCatalog({ fetchImpl: fetchMock as unknown as typeof fetch });
    expect(r).toEqual({ mode: 'demo' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('live mode: GETs /v1/products with limit and returns parsed products', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', BASE);
    fetchMock.mockResolvedValueOnce(jsonResponse(page([wireProduct({ id: 'a' }), { bad: true }])));
    const r = await fetchLiveCatalog({ fetchImpl: fetchMock as unknown as typeof fetch });
    expect(r).toMatchObject({ mode: 'live', dropped: 1 });
    expect(r.mode === 'live' && r.products.map((p) => p.id)).toEqual(['a']);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/v1/products?limit=100`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: { Accept: 'application/json' } });
  });

  it('follows nextCursor across pages, de-duplicating', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(page([wireProduct({ id: 'a' })], 'c1')))
      .mockResolvedValueOnce(jsonResponse(page([wireProduct({ id: 'a' }), wireProduct({ id: 'b' })], null)));
    const r = await fetchProducts(BASE, { fetchImpl: fetchMock as unknown as typeof fetch });
    expect(r.items.map((p) => p.id)).toEqual(['a', 'b']);
    expect(r.dropped).toBe(1);
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/v1/products?limit=100&cursor=c1`);
  });

  it('stops on a cursor loop and at the page cap', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(page([wireProduct({ id: 'a' })], 'same')));
    await fetchProducts(BASE, { fetchImpl: fetchMock as unknown as typeof fetch });
    expect(fetchMock).toHaveBeenCalledTimes(2); // first page, then the repeated cursor once

    fetchMock.mockReset();
    let n = 0;
    fetchMock.mockImplementation(async () => jsonResponse(page([wireProduct({ id: `p${n}` })], `c${n++}`)));
    await fetchProducts(BASE, { fetchImpl: fetchMock as unknown as typeof fetch });
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('maps failures to CatalogError kinds', async () => {
    const f = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: {} }, 500));
    await expect(fetchProducts(BASE, { fetchImpl: f })).rejects.toMatchObject({ kind: 'http', status: 500 });

    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(fetchProducts(BASE, { fetchImpl: f })).rejects.toMatchObject({ kind: 'network' });

    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    await expect(fetchProducts(BASE, { fetchImpl: f })).rejects.toMatchObject({ kind: 'malformed' });

    fetchMock.mockResolvedValueOnce(jsonResponse({ nothing: true }));
    await expect(fetchProducts(BASE, { fetchImpl: f })).rejects.toMatchObject({ kind: 'malformed' });
  });

  it('times out', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')))),
    );
    const p = fetchProducts(BASE, { fetchImpl: fetchMock as unknown as typeof fetch, timeoutMs: 1000 });
    const assertion = expect(p).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });

  it('times out while reading the body', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      json: () => new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted')))),
    }));
    const p = fetchProducts(BASE, { fetchImpl: fetchMock as unknown as typeof fetch, timeoutMs: 500 });
    const assertion = expect(p).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(501);
    await assertion;
  });

  it('aborts via the caller signal (unmount), before and during the request', async () => {
    const f = fetchMock as unknown as typeof fetch;
    const pre = new AbortController();
    pre.abort();
    await expect(fetchProducts(BASE, { fetchImpl: f, signal: pre.signal })).rejects.toMatchObject({ kind: 'aborted' });
    expect(fetchMock).not.toHaveBeenCalled();

    const ac = new AbortController();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')))),
    );
    const p = fetchProducts(BASE, { fetchImpl: f, signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ kind: 'aborted' });

    // abort while the body is being read
    const ac2 = new AbortController();
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      json: () => new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted')))),
    }));
    const p2 = fetchProducts(BASE, { fetchImpl: f, signal: ac2.signal });
    await Promise.resolve();
    ac2.abort();
    await expect(p2).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('fetchCollections hits /v1/collections', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [{ id: 'kebabs', title: 'Kebabs', productCount: 2 }] }));
    const r = await fetchCollections(BASE, { fetchImpl: fetchMock as unknown as typeof fetch });
    expect(r).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/v1/collections`);
  });

  it('livePublic fixture is itself valid', () => {
    expect(parsePublicProduct(livePublic())).toEqual(livePublic());
  });
});
