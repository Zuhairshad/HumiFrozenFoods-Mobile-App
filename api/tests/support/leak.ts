/**
 * Leak detection for public responses (contract §0.3). Two independent scans:
 *  - a recursive KEY scan over the parsed JSON, and
 *  - a STRING scan over the raw body text (catches leaks that survive as values, or inside strings).
 */

/** Keys that must never appear in any public response. */
export const ALWAYS_FORBIDDEN_KEYS = ['b2b_pricing', 'sold_quantity', 'sku', '__v', 'tier_prices', 'min_quantity', 'product_details'];

/** Extra keys forbidden on catalogue-style responses (an order line legitimately has `quantity`). */
export const CATALOGUE_FORBIDDEN_KEYS = ['quantity', 'status', 'visibility', 'type', 'type_slug', 'banners', 'promotional_sliders', 'shop', 'seller'];

// Needles must be impossible to hit by chance in random hex ids (ObjectIds) or base64url tokens, which are
// regenerated every run: bare 'b2b' is valid hex and '__v' is valid base64url, so both are matched only as
// the quoted JSON key or with an underscore that hex cannot contain.
const FORBIDDEN_SUBSTRINGS = ['b2b_', '"__v"', 'sold_quantity', 'tier_prices', 'product_details'];

export interface LeakScanOptions {
  /** Add the catalogue-only key list. */
  catalogue?: boolean;
  /** Exact string values that must not appear anywhere (e.g. seeded sku values). */
  forbiddenValues?: readonly string[];
}

function walk(value: unknown, path: string, visit: (path: string, key: string | null, value: unknown) => void): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      visit(`${path}[${String(index)}]`, null, item);
      walk(item, `${path}[${String(index)}]`, visit);
    });
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      visit(`${path}.${key}`, key, child);
      walk(child, `${path}.${key}`, visit);
    }
  }
}

/** Returns human-readable descriptions of every leak found; an empty array means clean. */
export function findLeaks(text: string, options: LeakScanOptions = {}): string[] {
  const problems: string[] = [];
  const forbiddenKeys = new Set([...ALWAYS_FORBIDDEN_KEYS, ...(options.catalogue ? CATALOGUE_FORBIDDEN_KEYS : [])]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }

  if (parsed !== undefined) {
    walk(parsed, '$', (path, key, value) => {
      if (key !== null && forbiddenKeys.has(key)) problems.push(`forbidden key ${path}`);
      if (typeof value === 'string' && options.forbiddenValues?.includes(value)) problems.push(`forbidden value at ${path}`);
    });
  }
  const lower = text.toLowerCase();
  for (const needle of FORBIDDEN_SUBSTRINGS) {
    if (lower.includes(needle)) problems.push(`forbidden substring "${needle}"`);
  }
  if (/"sku"/i.test(text)) problems.push('forbidden substring "sku" key');
  return problems;
}
