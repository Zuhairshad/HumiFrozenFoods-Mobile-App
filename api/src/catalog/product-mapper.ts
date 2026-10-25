import { ObjectId } from 'mongodb';
import type { BusinessConfig, CategoryRef, ProductRecord, PublicProduct } from '../domain/types.js';
import { pence } from '../lib/money.js';
import { deriveCollection } from './collections.js';
import { cleanLine, htmlToText, toHttpsUrl } from './sanitize.js';

export type MapResult = { ok: true; record: ProductRecord } | { ok: false; reason: string };

type Raw = Readonly<Record<string, unknown>>;

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const DECIMAL = /^\d{1,9}(?:\.\d{1,6})?$/;
const MAX_PRICE_PENCE = 10_000_000;
const MAX_GALLERY = 20;
const MAX_CATEGORIES = 10;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && DECIMAL.test(value.trim())) return Number(value);
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1) return true;
  if (value === 'false' || value === 0) return false;
  return null;
}

function asObjectIdHex(value: unknown): string | null {
  if (value instanceof ObjectId) return value.toHexString();
  if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) return value.toLowerCase();
  return null;
}

/** GBP float (the site stores pounds) to whole pence; half away from zero, tolerant of binary float noise. */
function poundsToPence(pounds: number): number | null {
  if (pounds < 0) return null;
  const value = Math.round(pounds * 100 + 1e-6);
  return value <= MAX_PRICE_PENCE ? pence(value) : null;
}

function mapImage(value: unknown): { thumbnail: string; original: string } | null {
  if (!isRecord(value)) return null;
  const original = toHttpsUrl(value['original']);
  const thumbnail = toHttpsUrl(value['thumbnail']);
  const either = original ?? thumbnail;
  return either === null ? null : { thumbnail: thumbnail ?? either, original: original ?? either };
}

function mapGallery(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls = new Set<string>();
  for (const entry of value as unknown[]) {
    const url = typeof entry === 'string' ? toHttpsUrl(entry) : isRecord(entry) ? (toHttpsUrl(entry['original']) ?? toHttpsUrl(entry['thumbnail'])) : null;
    if (url !== null) urls.add(url);
    if (urls.size >= MAX_GALLERY) break;
  }
  return [...urls];
}

function mapCategories(value: unknown): CategoryRef[] {
  if (!Array.isArray(value)) return [];
  const out: CategoryRef[] = [];
  for (const entry of value as unknown[]) {
    if (!isRecord(entry)) continue;
    const rawId = entry['_id'] ?? entry['id'];
    const id = rawId instanceof ObjectId ? rawId.toHexString() : asString(rawId);
    const name = asString(entry['name']);
    const slug = asString(entry['slug']);
    if (id === null || name === null || slug === null) continue;
    const cleanName = cleanLine(name, 80);
    const cleanSlug = cleanLine(slug, 100);
    const cleanId = cleanLine(id, 64);
    if (cleanName && cleanSlug && cleanId) out.push({ id: cleanId, name: cleanName, slug: cleanSlug });
    if (out.length >= MAX_CATEGORIES) break;
  }
  return out;
}

function mapStock(value: unknown): number | null {
  const n = asNumber(value);
  return n === null || n < 0 ? null : Math.floor(n);
}

/**
 * Whitelist mapper: DB document (hand-edited in an admin portal, so nothing is assumed) to ProductRecord.
 * Reads only the fields below; b2b_pricing, sold_quantity, sku, __v, status, visibility and the embedded `type`
 * are never touched, so they cannot leak. Returns a reason instead of throwing so one bad document cannot break a list.
 */
export function mapProductDocument(doc: unknown, business: Pick<BusinessConfig, 'lowStockThreshold'>): MapResult {
  if (!isRecord(doc)) return { ok: false, reason: 'not an object' };

  const sourceId = asObjectIdHex(doc['_id']);
  if (sourceId === null) return { ok: false, reason: 'missing or invalid _id' };

  const slug = asString(doc['slug'])?.trim() ?? '';
  if (!SLUG.test(slug)) return { ok: false, reason: 'missing or non-URL-safe slug' };

  const name = cleanLine(asString(doc['name']) ?? '', 120);
  if (name === '') return { ok: false, reason: 'missing name' };

  const price = asNumber(doc['price']);
  const basePence = price === null ? null : poundsToPence(price);
  if (basePence === null || basePence <= 0) return { ok: false, reason: 'missing or invalid price' };

  // Same rule as the live site: sale_price wins when truthy (0/null/absent mean "no sale").
  const sale = asNumber(doc['sale_price']);
  const salePence = sale !== null && sale > 0 ? poundsToPence(sale) : null;
  if (sale !== null && sale > 0 && salePence === null) return { ok: false, reason: 'invalid sale_price' };
  const pricePence = salePence ?? basePence;
  const showDiscount = asBoolean(doc['discount']) === true;
  const compareAtPricePence = showDiscount && salePence !== null && salePence < basePence ? basePence : null;

  const stock = mapStock(doc['quantity']);
  const flag = asBoolean(doc['in_stock']);
  const inStock = flag !== false && (stock === null || stock > 0);
  const lowStock = inStock && stock !== null && stock <= business.lowStockThreshold;

  const rating = asNumber(doc['ratings']);
  const reviews = asNumber(doc['total_reviews']);
  const rawUnit = doc['unit'];
  const unit = cleanLine(typeof rawUnit === 'string' ? rawUnit : typeof rawUnit === 'number' && Number.isFinite(rawUnit) ? String(rawUnit) : '', 30);

  const record: ProductRecord = {
    id: slug,
    sourceId,
    name,
    description: htmlToText(asString(doc['description']) ?? ''),
    pricePence,
    compareAtPricePence,
    unit: unit === '' ? null : unit,
    image: mapImage(doc['image']),
    gallery: mapGallery(doc['gallery']),
    inStock,
    lowStock,
    collection: deriveCollection(name, slug),
    categories: mapCategories(doc['categories']),
    rating: rating === null ? 0 : Math.round(Math.min(5, Math.max(0, rating)) * 10) / 10,
    reviewCount: reviews === null ? 0 : Math.min(1_000_000_000, Math.max(0, Math.floor(reviews))),
    stock,
  };
  return { ok: true, record };
}

/** The wire view: strips the server-only stock. Built by whitelist so a new ProductRecord field is private by default. */
export function toPublicProduct(record: ProductRecord): PublicProduct {
  return {
    id: record.id,
    sourceId: record.sourceId,
    name: record.name,
    description: record.description,
    pricePence: record.pricePence,
    compareAtPricePence: record.compareAtPricePence,
    unit: record.unit,
    image: record.image,
    gallery: record.gallery,
    inStock: record.inStock,
    lowStock: record.lowStock,
    collection: record.collection,
    categories: record.categories,
    rating: record.rating,
    reviewCount: record.reviewCount,
  };
}
