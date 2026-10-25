import { ObjectId } from 'mongodb';
import { isSiteOrderStatus, isSitePaymentStatus } from './statuses.js';

/** Structure-only view of a document. Values are never kept, so a report cannot leak customer data. */
export interface ShapeEntry {
  /** One JS type, or several joined with "|" (array elements that disagree). */
  type: string;
  /** null, "", [], {} or undefined: such a key proves little about whether it is required. */
  empty: boolean;
}

export type Shape = ReadonlyMap<string, ShapeEntry>;

const MAX_DEPTH = 6;
const MAX_KEYS = 1000;

function typeOf(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return 'date';
  if (value instanceof ObjectId) return 'objectid';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return typeof value;
    case 'object':
      return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null ? 'object' : 'other';
    default:
      return 'other';
  }
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeOf(value) === 'object' && Object.keys(value).length === 0;
}

function merge(shape: Map<string, ShapeEntry>, path: string, entry: ShapeEntry): void {
  const existing = shape.get(path);
  if (!existing) {
    shape.set(path, entry);
    return;
  }
  const types = new Set([...existing.type.split('|'), ...entry.type.split('|')]);
  shape.set(path, { type: [...types].sort().join('|'), empty: existing.empty && entry.empty });
}

function walk(value: unknown, path: string, shape: Map<string, ShapeEntry>, depth: number): void {
  if (shape.size >= MAX_KEYS) return;
  merge(shape, path, { type: typeOf(value), empty: isEmpty(value) });
  if (depth >= MAX_DEPTH) return;
  if (Array.isArray(value)) {
    for (const item of value as unknown[]) walk(item, `${path}[]`, shape, depth + 1);
  } else if (typeOf(value) === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      walk(child, path === '' ? key : `${path}.${key}`, shape, depth + 1);
    }
  }
}

export function shapeOf(doc: Record<string, unknown>): Shape {
  const shape = new Map<string, ShapeEntry>();
  for (const [key, child] of Object.entries(doc)) walk(child, key, shape, 1);
  return shape;
}

export interface OnlyInSite {
  path: string;
  type: string;
  looksRequired: boolean;
}

export interface TypeMismatch {
  path: string;
  site: string;
  ours: string;
  /** One side is null: a nullable field rather than a real disagreement. */
  soft: boolean;
}

export interface ShapeDiff {
  onlyInSite: OnlyInSite[];
  onlyInOurs: { path: string; type: string }[];
  typeMismatches: TypeMismatch[];
}

/** System keys the database or Mongoose adds; our inserts get their own `_id`, timestamps are covered by created_at. */
const SYSTEM_KEYS = new Set(['_id', 'id', '__v', 'createdAt', 'updatedAt']);

function rootKey(path: string): string {
  return path.split(/[.[]/, 1)[0] ?? path;
}

export function diffShapes(site: Shape, ours: Shape): ShapeDiff {
  const onlyInSite: OnlyInSite[] = [];
  const typeMismatches: TypeMismatch[] = [];
  for (const [path, entry] of site) {
    const mine = ours.get(path);
    if (!mine) {
      onlyInSite.push({ path, type: entry.type, looksRequired: !entry.empty && !SYSTEM_KEYS.has(rootKey(path)) });
    } else if (mine.type !== entry.type) {
      const soft = mine.type === 'null' || entry.type === 'null';
      typeMismatches.push({ path, site: entry.type, ours: mine.type, soft });
    }
  }
  const onlyInOurs = [...ours].filter(([path]) => !site.has(path)).map(([path, entry]) => ({ path, type: entry.type }));
  const byPath = (a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path);
  return { onlyInSite: onlyInSite.sort(byPath), onlyInOurs: onlyInOurs.sort(byPath), typeMismatches: typeMismatches.sort(byPath) };
}

export function hasBlockingGap(diff: ShapeDiff): boolean {
  return diff.onlyInSite.some((k) => k.looksRequired);
}

const SAFE_ENUM_VALUE = /^[a-z0-9_-]{1,40}$/;

export interface StatusCount {
  value: string;
  count: number;
  known: boolean;
}

/** Counts a status field. Values that do not look like enum tokens are folded into "<redacted>". */
export function countStatuses(docs: readonly Record<string, unknown>[], field: 'order_status' | 'payment_status'): StatusCount[] {
  const counts = new Map<string, number>();
  for (const doc of docs) {
    const raw = doc[field];
    const label = typeof raw === 'string' && SAFE_ENUM_VALUE.test(raw) ? raw : raw === undefined ? '<missing>' : '<redacted>';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const known = field === 'order_status' ? isSiteOrderStatus : isSitePaymentStatus;
  return [...counts]
    .map(([value, count]) => ({ value, count, known: known(value) }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export interface TrackingNumberProfile {
  sampled: number;
  nonString: number;
  minLength: number | null;
  maxLength: number | null;
  charset: 'digits' | 'digits-and-dashes' | 'alphanumeric' | 'mixed' | 'n/a';
  leadingZeroSeen: boolean;
}

/** Describes the numbering scheme (length and character classes) without ever returning a number. */
export function profileTrackingNumbers(values: readonly unknown[]): TrackingNumberProfile {
  const strings = values.filter((v): v is string => typeof v === 'string' && v !== '');
  const lengths = strings.map((s) => s.length);
  const all = (re: RegExp) => strings.every((s) => re.test(s));
  let charset: TrackingNumberProfile['charset'] = 'n/a';
  if (strings.length > 0) {
    charset = all(/^\d+$/) ? 'digits' : all(/^[\d-]+$/) ? 'digits-and-dashes' : all(/^[A-Za-z0-9]+$/) ? 'alphanumeric' : 'mixed';
  }
  return {
    sampled: values.length,
    nonString: values.length - strings.length,
    minLength: lengths.length > 0 ? Math.min(...lengths) : null,
    maxLength: lengths.length > 0 ? Math.max(...lengths) : null,
    charset,
    leadingZeroSeen: strings.some((s) => s.startsWith('0')),
  };
}

function table(rows: readonly (readonly string[])[]): string[] {
  const widths = rows.reduce<number[]>((acc, row) => row.map((cell, i) => Math.max(acc[i] ?? 0, cell.length)), []);
  return rows.map((row) => `  ${row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join('  ')}`.trimEnd());
}

export interface ReportInput {
  diff: ShapeDiff | null;
  orderStatuses: readonly StatusCount[];
  paymentStatuses: readonly StatusCount[];
  tracking: TrackingNumberProfile;
  sampledOrders: number;
  appOrderCount: number;
}

export function renderReport(input: ReportInput): string[] {
  const out: string[] = ['Schema comparison: newest website-created order vs what toSiteDocument produces', ''];
  if (!input.diff) {
    out.push('No website-created order (without app_meta) was found, so nothing could be compared.');
  } else {
    const { onlyInSite, onlyInOurs, typeMismatches } = input.diff;
    out.push(`Keys only in the website order (${String(onlyInSite.length)}):`);
    out.push(...(onlyInSite.length === 0 ? ['  none'] : table(onlyInSite.map((k) => [k.path, k.type, k.looksRequired ? 'LOOKS REQUIRED' : 'optional-looking']))));
    out.push('', `Keys only in ours (${String(onlyInOurs.length)}):`);
    out.push(...(onlyInOurs.length === 0 ? ['  none'] : table(onlyInOurs.map((k) => [k.path, k.type]))));
    out.push('', `Type mismatches (${String(typeMismatches.length)}):`);
    out.push(...(typeMismatches.length === 0 ? ['  none'] : table(typeMismatches.map((m) => [m.path, `site: ${m.site}`, `ours: ${m.ours}`, m.soft ? 'nullable' : 'REAL']))));
  }
  const statusLines = (label: string, counts: readonly StatusCount[]) => [
    '',
    `${label} in the newest ${String(input.sampledOrders)} orders:`,
    ...(counts.length === 0 ? ['  none'] : table(counts.map((c) => [c.value, String(c.count), c.known ? '' : 'UNKNOWN to the mapper']))),
  ];
  out.push(...statusLines('order_status', input.orderStatuses), ...statusLines('payment_status', input.paymentStatuses));
  const t = input.tracking;
  out.push(
    '',
    `tracking_number (${String(t.sampled)} sampled, values never printed): length ${String(t.minLength ?? 'n/a')}-${String(t.maxLength ?? 'n/a')}, ` +
      `charset ${t.charset}, leading zero ${t.leadingZeroSeen ? 'seen' : 'not seen'}, non-string ${String(t.nonString)}`,
    `Orders created by this app so far: ${String(input.appOrderCount)}`,
  );
  return out;
}
