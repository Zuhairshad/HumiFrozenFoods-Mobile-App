import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, page, wireProduct } from './fixtures';

type Store = typeof import('@/store/catalog');
type Storage = typeof import('@/../tests/mocks/async-storage').default;

const T0 = new Date('2026-10-25T12:00:00Z').getTime();
const MIN = 60_000;

let fetchMock: ReturnType<typeof vi.fn>;

async function load(env: string | null = 'https://api.test'): Promise<{ mod: Store; storage: Storage }> {
  vi.resetModules();
  vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', env ?? '');
  const storage = (await import('@react-native-async-storage/async-storage')).default as unknown as Storage;
  const mod = await import('@/store/catalog');
  await mod.useCatalogStore.persist.rehydrate();
  return { mod, storage };
}

const liveList = (...ids: string[]) => jsonResponse(page(ids.map((id) => wireProduct({ id, name: `Live ${id}`, pricePence: 700 }))));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('initial state', () => {
  it('starts from the bundled catalogue so first paint never waits', async () => {
    const { mod } = await load();
    const s = mod.useCatalogStore.getState();
    expect(s.products).toHaveLength(17);
    expect(s.status).toBe('idle');
    expect(s.fetchedAt).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('demo mode: status demo, refresh never fetches', async () => {
    const { mod } = await load(null);
    expect(mod.useCatalogStore.getState().status).toBe('demo');
    await mod.useCatalogStore.getState().refresh({ force: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mod.useCatalogStore.getState().status).toBe('demo');
    expect(mod.getCatalogProducts()).toHaveLength(17);
  });

  it('demo status is restored if the env disappears after a live status', async () => {
    const { mod } = await load();
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', '');
    await mod.useCatalogStore.getState().refresh();
    expect(mod.useCatalogStore.getState().status).toBe('demo');
  });
});

describe('refresh transitions', () => {
  it('idle -> loading -> ready; merges live over bundled and drops unpublished products', async () => {
    const { mod } = await load();
    let release!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (release = r)));

    const p = mod.useCatalogStore.getState().refresh();
    expect(mod.useCatalogStore.getState().status).toBe('loading');
    expect(mod.useCatalogStore.getState().products).toHaveLength(17); // stale-while-revalidate: still showing bundled

    release(liveList('aloo-tikki', 'brand-new'));
    await p;

    const s = mod.useCatalogStore.getState();
    expect(s.status).toBe('ready');
    expect(s.fetchedAt).toBe(T0);
    expect(s.products.map((x) => x.id)).toEqual(['aloo-tikki', 'brand-new']);
    expect(s.products[0]).toMatchObject({ name: 'Live aloo-tikki', pricePence: 700, price: 7 });
    expect(s.products[0].ingredients).not.toBe(''); // bundled enrichment kept
    expect(s.products[1].tags).toEqual([]); // live-only default
  });

  it('TTL: no refetch inside 5 minutes, refetch after; force always refetches', async () => {
    const { mod } = await load();
    const { refresh } = mod.useCatalogStore.getState();
    fetchMock.mockImplementation(async () => liveList('aloo-tikki'));

    await refresh();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(T0 + 4 * MIN);
    await refresh();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(T0 + 5 * MIN + 1);
    await refresh();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await refresh({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mod.CATALOG_TTL_MS).toBe(5 * MIN);
  });

  it('a fresh persisted snapshot flips idle to ready without fetching', async () => {
    const { mod, storage } = await load();
    await storage.setItem(
      'humi-catalog',
      JSON.stringify({ state: { products: mod.useCatalogStore.getState().products, fetchedAt: T0 }, version: 1 }),
    );
    await mod.useCatalogStore.persist.rehydrate();
    expect(mod.useCatalogStore.getState().status).toBe('idle');
    await mod.useCatalogStore.getState().refresh();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mod.useCatalogStore.getState().status).toBe('ready');
  });

  it('failure -> offline keeps the products on screen; the next success recovers', async () => {
    const { mod } = await load();
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await mod.useCatalogStore.getState().refresh();
    expect(mod.useCatalogStore.getState().status).toBe('offline');
    expect(mod.useCatalogStore.getState().products).toHaveLength(17);
    expect(mod.useCatalogStore.getState().fetchedAt).toBeNull();

    fetchMock.mockResolvedValueOnce(liveList('aloo-tikki'));
    await mod.useCatalogStore.getState().refresh(); // fetchedAt null => not TTL-fresh
    expect(mod.useCatalogStore.getState().status).toBe('ready');
  });

  it('HTTP 500, timeout and malformed bodies all end offline', async () => {
    const { mod } = await load();
    const refresh = () => mod.useCatalogStore.getState().refresh({ force: true });

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await refresh();
    expect(mod.useCatalogStore.getState().status).toBe('offline');

    fetchMock.mockResolvedValueOnce(new Response('nope'));
    await refresh();
    expect(mod.useCatalogStore.getState().status).toBe('offline');

    fetchMock.mockImplementationOnce(
      (_u: string, init: RequestInit) =>
        new Promise((_r, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')))),
    );
    const p = refresh();
    await vi.advanceTimersByTimeAsync(13_000);
    await p;
    expect(mod.useCatalogStore.getState().status).toBe('offline');
    expect(mod.useCatalogStore.getState().products).toHaveLength(17);
  });

  it('an empty or fully malformed list never blanks the menu', async () => {
    const { mod } = await load();
    fetchMock.mockResolvedValueOnce(jsonResponse(page([])));
    await mod.useCatalogStore.getState().refresh({ force: true });
    expect(mod.useCatalogStore.getState().status).toBe('offline');
    expect(mod.useCatalogStore.getState().products).toHaveLength(17);

    fetchMock.mockResolvedValueOnce(jsonResponse(page([{ junk: 1 }, 'x', null])));
    await mod.useCatalogStore.getState().refresh({ force: true });
    expect(mod.useCatalogStore.getState().status).toBe('offline');
    expect(mod.useCatalogStore.getState().products).toHaveLength(17);
  });

  it('malformed items are dropped, valid ones are shown', async () => {
    const { mod } = await load();
    fetchMock.mockResolvedValueOnce(jsonResponse(page([wireProduct({ id: 'ok-one' }), { id: '__proto__', name: 'x', pricePence: 1, inStock: true }])));
    await mod.useCatalogStore.getState().refresh({ force: true });
    expect(mod.useCatalogStore.getState().products.map((p) => p.id)).toEqual(['ok-one']);
  });

  it('out-of-stock and low-stock flags flow through to the app product', async () => {
    const { mod } = await load();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(page([wireProduct({ id: 'a', inStock: false }), wireProduct({ id: 'b', lowStock: true })])),
    );
    await mod.useCatalogStore.getState().refresh({ force: true });
    const [a, b] = mod.useCatalogStore.getState().products;
    expect([a.inStock, b.inStock, b.lowStock]).toEqual([false, true, true]);
  });
});

describe('concurrency and abort', () => {
  it('concurrent refreshes share one request', async () => {
    const { mod } = await load();
    let release!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (release = r)));
    const a = mod.useCatalogStore.getState().refresh();
    const b = mod.useCatalogStore.getState().refresh({ force: true });
    release(liveList('aloo-tikki'));
    await Promise.all([a, b]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mod.useCatalogStore.getState().status).toBe('ready');
  });

  const hangUntilAborted = () =>
    fetchMock.mockImplementationOnce(
      (_u: string, init: RequestInit) =>
        new Promise((_r, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')))),
    );

  it('aborting the only caller cancels the request and restores the previous status', async () => {
    const { mod } = await load();
    hangUntilAborted();
    const ac = new AbortController();
    const p = mod.useCatalogStore.getState().refresh({ signal: ac.signal });
    expect(mod.useCatalogStore.getState().status).toBe('loading');
    ac.abort();
    await p;
    expect(mod.useCatalogStore.getState().status).toBe('idle');
    expect(mod.useCatalogStore.getState().products).toHaveLength(17);
  });

  it('keeps the request alive while another caller still waits', async () => {
    const { mod } = await load();
    let release!: (r: Response) => void;
    fetchMock.mockImplementationOnce(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((res, rej) => {
          release = res;
          init.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')));
        }),
    );
    const ac = new AbortController();
    const a = mod.useCatalogStore.getState().refresh({ signal: ac.signal });
    const b = mod.useCatalogStore.getState().refresh(); // pull-to-refresh style caller, no signal
    ac.abort();
    release(liveList('aloo-tikki'));
    await Promise.all([a, b]);
    expect(mod.useCatalogStore.getState().status).toBe('ready');
  });

  it('an already-aborted signal is a no-op', async () => {
    const { mod } = await load();
    const ac = new AbortController();
    ac.abort();
    await mod.useCatalogStore.getState().refresh({ signal: ac.signal });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mod.useCatalogStore.getState().status).toBe('idle');
  });

  it('a later refresh works after an abort', async () => {
    const { mod } = await load();
    hangUntilAborted();
    const ac = new AbortController();
    const p = mod.useCatalogStore.getState().refresh({ signal: ac.signal });
    ac.abort();
    await p;
    fetchMock.mockResolvedValueOnce(liveList('aloo-tikki'));
    await mod.useCatalogStore.getState().refresh();
    expect(mod.useCatalogStore.getState().status).toBe('ready');
  });
});

describe('persistence', () => {
  it('persists only { products, fetchedAt }', async () => {
    const { mod, storage } = await load();
    fetchMock.mockResolvedValueOnce(liveList('aloo-tikki'));
    await mod.useCatalogStore.getState().refresh();
    await vi.advanceTimersByTimeAsync(0);
    const saved = JSON.parse((await storage.getItem('humi-catalog')) as string);
    expect(Object.keys(saved.state).sort()).toEqual(['fetchedAt', 'products']);
    expect(saved.state.products.map((p: { id: string }) => p.id)).toEqual(['aloo-tikki']);
    expect(saved.state.fetchedAt).toBe(T0);
  });

  it('rehydrates a previous live snapshot (offline cold start shows the saved menu)', async () => {
    const first = await load();
    fetchMock.mockResolvedValueOnce(liveList('aloo-tikki', 'brand-new'));
    await first.mod.useCatalogStore.getState().refresh();
    await vi.advanceTimersByTimeAsync(0);
    const raw = (await first.storage.getItem('humi-catalog')) as string;

    const second = await load();
    await second.storage.setItem('humi-catalog', raw);
    await second.mod.useCatalogStore.persist.rehydrate();
    expect(second.mod.useCatalogStore.getState().products.map((p) => p.id)).toEqual(['aloo-tikki', 'brand-new']);
    expect(second.mod.useCatalogStore.getState().fetchedAt).toBe(T0);
  });

  it('ignores corrupt or hostile persisted data', async () => {
    const { mod, storage } = await load();
    const rehydrate = async (state: unknown) => {
      await storage.setItem('humi-catalog', JSON.stringify({ state, version: 1 }));
      await mod.useCatalogStore.persist.rehydrate();
    };
    await rehydrate({ products: 'nope', fetchedAt: 1 });
    expect(mod.useCatalogStore.getState().products).toHaveLength(17);
    await rehydrate({ products: [null, 5, { id: 'x' }, { id: 'y', name: 'Y', pricePence: -1 }], fetchedAt: 1 });
    expect(mod.useCatalogStore.getState().products).toHaveLength(17);
    await rehydrate(null);
    expect(mod.useCatalogStore.getState().products).toHaveLength(17);
  });

  it('sanitises partially valid persisted products and a bad fetchedAt', async () => {
    const { mod, storage } = await load();
    const good = { id: 'p', name: 'P', price: 1, pricePence: 100, inStock: true, category: 'kebabs', image: '' };
    await storage.setItem(
      'humi-catalog',
      JSON.stringify({
        state: { products: [good, { ...good, id: 'bad-cat', category: 'weapons' }, { ...good, id: 'bad-image', image: 3 }, { ...good, id: 'bad-price', price: 'x' }], fetchedAt: 'yesterday' },
        version: 1,
      }),
    );
    await mod.useCatalogStore.persist.rehydrate();
    const s = mod.useCatalogStore.getState();
    expect(s.products.map((p) => p.id)).toEqual(['p']);
    expect(s.products[0]).toMatchObject({ tags: [], weight: '', ingredients: '', readyInMins: 0, rating: 0, reviewCount: 0, description: '' });
    expect(s.fetchedAt).toBeNull();
  });

  it('demo mode ignores any persisted live snapshot', async () => {
    const { mod, storage } = await load(null);
    const good = { id: 'p', name: 'P', price: 1, pricePence: 100, inStock: true, category: 'kebabs', image: '' };
    await storage.setItem('humi-catalog', JSON.stringify({ state: { products: [good], fetchedAt: T0 }, version: 1 }));
    await mod.useCatalogStore.persist.rehydrate();
    expect(mod.useCatalogStore.getState().products).toHaveLength(17);
  });
});
