/**
 * Catalogue client: GET /v1/products (paged) and GET /v1/collections per docs/api-contract.md 2 and 3.1.
 *
 * - Base URL comes from EXPO_PUBLIC_API_BASE_URL. Unset => demo mode: nothing is ever fetched.
 * - Every response is validated by hand-written guards. Malformed items are DROPPED (never thrown on),
 *   optional fields are sanitised to safe defaults, and the output is rebuilt from scratch so hostile
 *   extra keys never reach the app.
 * - Own small fetch wrapper (not http.ts): it needs a caller-supplied AbortSignal for unmount.
 */

export type CollectionId = 'savory-snacks' | 'kebabs' | 'vegetable-samosas' | 'samosas' | 'other';

export interface PublicProduct {
  /** The product SLUG: stable, URL-safe, unique. Used everywhere as productId. */
  id: string;
  sourceId: string;
  name: string;
  description: string;
  pricePence: number;
  compareAtPricePence: number | null;
  unit: string | null;
  image: { thumbnail: string; original: string } | null;
  gallery: string[];
  inStock: boolean;
  lowStock: boolean;
  collection: CollectionId;
  categories: { id: string; name: string; slug: string }[];
  rating: number;
  reviewCount: number;
}

export interface PublicCollection {
  id: CollectionId;
  title: string;
  productCount: number;
}

export type CatalogErrorKind = 'network' | 'timeout' | 'http' | 'malformed' | 'aborted';

export class CatalogError extends Error {
  readonly kind: CatalogErrorKind;
  readonly status?: number;

  constructor(kind: CatalogErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'CatalogError';
    this.kind = kind;
    this.status = status;
  }
}

export interface ParsedProducts {
  items: PublicProduct[];
  nextCursor: string | null;
  /** Items discarded because a required field was missing or invalid, or the id was a duplicate. */
  dropped: number;
}

export type CatalogFetchResult =
  | { mode: 'demo' }
  | { mode: 'live'; products: PublicProduct[]; dropped: number };

// ---------------------------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------------------------

/**
 * Read at call time. The literal `process.env.EXPO_PUBLIC_API_BASE_URL` is required so Expo can inline it
 * at build time (dynamic `process.env[name]` access is not inlined).
 */
export function getCatalogBaseUrl(): string | undefined {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  return raw ? raw.replace(/\/+$/, '') : undefined;
}

export const DEFAULT_TIMEOUT_MS = 12_000;
const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

// ---------------------------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------------------------

const COLLECTIONS: readonly CollectionId[] = ['savory-snacks', 'kebabs', 'vegetable-samosas', 'samosas', 'other'];
/** Slug: starts alphanumeric, then alphanumerics, `-` or `_`. Rejects `__proto__`, paths, spaces, empty. */
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const MAX_PENCE = 10_000_000; // GBP 100k: anything above is nonsense for a frozen snack
const MAX_TEXT = 5_000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const isCollectionId = (v: unknown): v is CollectionId =>
  typeof v === 'string' && (COLLECTIONS as readonly string[]).includes(v);

const isPence = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_PENCE;

const isHttpUrl = (v: unknown): v is string => {
  if (typeof v !== 'string' || v.length === 0 || v.length > 2_000) return false;
  return /^https?:\/\/[^\s]+$/i.test(v);
};

function text(v: unknown, max = MAX_TEXT): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function parseImage(v: unknown): PublicProduct['image'] {
  if (!isRecord(v)) return null;
  const original = isHttpUrl(v.original) ? v.original : null;
  const thumbnail = isHttpUrl(v.thumbnail) ? v.thumbnail : null;
  const best = original ?? thumbnail;
  if (!best) return null;
  return { original: best, thumbnail: thumbnail ?? best };
}

function parseCategories(v: unknown): PublicProduct['categories'] {
  if (!Array.isArray(v)) return [];
  const out: PublicProduct['categories'] = [];
  for (const c of v.slice(0, 20)) {
    if (!isRecord(c)) continue;
    if (typeof c.id !== 'string' || typeof c.name !== 'string' || typeof c.slug !== 'string') continue;
    out.push({ id: c.id.slice(0, 100), name: c.name.slice(0, 100), slug: c.slug.slice(0, 100) });
  }
  return out;
}

/**
 * Validates one product. Required: id (slug), name, pricePence (non-negative integer), inStock (boolean).
 * Everything else is sanitised to a default. Returns null when a required field is bad.
 */
export function parsePublicProduct(v: unknown): PublicProduct | null {
  if (!isRecord(v)) return null;
  const { id, name, pricePence, inStock } = v;
  if (typeof id !== 'string' || !SLUG.test(id)) return null;
  if (typeof name !== 'string' || name.trim().length === 0) return null;
  if (!isPence(pricePence)) return null;
  if (typeof inStock !== 'boolean') return null;

  const rating = typeof v.rating === 'number' && Number.isFinite(v.rating) ? Math.min(5, Math.max(0, v.rating)) : 0;
  const reviewCount =
    typeof v.reviewCount === 'number' && Number.isInteger(v.reviewCount) && v.reviewCount >= 0
      ? Math.min(v.reviewCount, 10_000_000)
      : 0;
  const compareAt =
    isPence(v.compareAtPricePence) && v.compareAtPricePence > pricePence ? v.compareAtPricePence : null;

  return {
    id,
    sourceId: text(v.sourceId, 64),
    name: name.trim().slice(0, 200),
    description: text(v.description),
    pricePence,
    compareAtPricePence: compareAt,
    unit: typeof v.unit === 'string' && v.unit.trim() ? v.unit.trim().slice(0, 80) : null,
    image: parseImage(v.image),
    gallery: Array.isArray(v.gallery) ? v.gallery.slice(0, 20).filter(isHttpUrl) : [],
    inStock,
    // Out of stock can never also be "low stock".
    lowStock: inStock && v.lowStock === true,
    collection: isCollectionId(v.collection) ? v.collection : 'other',
    categories: parseCategories(v.categories),
    rating: Math.round(rating * 10) / 10,
    reviewCount,
  };
}

/** Validates a `{ items, nextCursor }` page. Throws CatalogError('malformed') only when the envelope itself is wrong. */
export function parseProductsPage(json: unknown): ParsedProducts {
  if (!isRecord(json) || !Array.isArray(json.items)) {
    throw new CatalogError('malformed', 'Unexpected catalogue response.');
  }
  const seen = new Set<string>();
  const items: PublicProduct[] = [];
  let dropped = 0;
  for (const raw of json.items) {
    const p = parsePublicProduct(raw);
    if (!p || seen.has(p.id)) {
      dropped += 1;
      continue;
    }
    seen.add(p.id);
    items.push(p);
  }
  const nextCursor =
    typeof json.nextCursor === 'string' && json.nextCursor.length > 0 && json.nextCursor.length <= 500
      ? json.nextCursor
      : null;
  return { items, nextCursor, dropped };
}

export function parseCollections(json: unknown): PublicCollection[] {
  if (!isRecord(json) || !Array.isArray(json.items)) {
    throw new CatalogError('malformed', 'Unexpected collections response.');
  }
  const out: PublicCollection[] = [];
  const seen = new Set<string>();
  for (const raw of json.items) {
    if (!isRecord(raw) || !isCollectionId(raw.id) || seen.has(raw.id)) continue;
    if (typeof raw.title !== 'string' || raw.title.trim().length === 0) continue;
    const count =
      typeof raw.productCount === 'number' && Number.isInteger(raw.productCount) && raw.productCount >= 0
        ? raw.productCount
        : 0;
    seen.add(raw.id);
    out.push({ id: raw.id, title: raw.title.trim().slice(0, 100), productCount: count });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------------------------

export interface RequestOpts {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

async function getJson(base: string, path: string, opts: RequestOpts): Promise<unknown> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = opts;
  if (signal?.aborted) throw new CatalogError('aborted', 'Catalogue request cancelled.');

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch {
      if (signal?.aborted) throw new CatalogError('aborted', 'Catalogue request cancelled.');
      if (timedOut) throw new CatalogError('timeout', 'The catalogue request timed out.');
      throw new CatalogError('network', "Couldn't reach Humi's.");
    }
    if (!res.ok) throw new CatalogError('http', `Catalogue request failed (${res.status}).`, res.status);
    try {
      return await res.json();
    } catch {
      if (signal?.aborted) throw new CatalogError('aborted', 'Catalogue request cancelled.');
      if (timedOut) throw new CatalogError('timeout', 'The catalogue request timed out.');
      throw new CatalogError('malformed', 'The catalogue response was not JSON.');
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Fetches every published product (follows `nextCursor`, capped at MAX_PAGES, guarded against cursor loops). */
export async function fetchProducts(base: string, opts: RequestOpts = {}): Promise<ParsedProducts> {
  const items: PublicProduct[] = [];
  const seen = new Set<string>();
  const cursors = new Set<string>();
  let dropped = 0;
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const qs = `limit=${PAGE_LIMIT}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const parsed = parseProductsPage(await getJson(base, `/v1/products?${qs}`, opts));
    dropped += parsed.dropped;
    for (const p of parsed.items) {
      if (seen.has(p.id)) {
        dropped += 1;
        continue;
      }
      seen.add(p.id);
      items.push(p);
    }
    cursor = parsed.nextCursor;
    if (!cursor || cursors.has(cursor)) break;
    cursors.add(cursor);
  }
  return { items, nextCursor: null, dropped };
}

export async function fetchCollections(base: string, opts: RequestOpts = {}): Promise<PublicCollection[]> {
  return parseCollections(await getJson(base, '/v1/collections', opts));
}

/** Live catalogue, or `{ mode: 'demo' }` (and no network call at all) when no base URL is configured. */
export async function fetchLiveCatalog(opts: RequestOpts = {}): Promise<CatalogFetchResult> {
  const base = getCatalogBaseUrl();
  if (!base) return { mode: 'demo' };
  const { items, dropped } = await fetchProducts(base, opts);
  return { mode: 'live', products: items, dropped };
}
