import { readFileSync } from 'node:fs';
import type { BusinessConfig } from '../../../src/domain/types.js';

export type Doc = Record<string, unknown>;

const FIXTURE = new URL('../../fixtures/products.live.json', import.meta.url);
const BUNDLED = new URL('../../../../src/data/products.ts', import.meta.url);

/** Fresh deep copy each call so tests can mutate freely. */
export function liveDocs(): Doc[] {
  const parsed = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { results: Doc[] };
  return parsed.results;
}

export interface BundledProduct {
  id: string;
  name: string;
  category: string;
}

/** The app's bundled catalogue is TypeScript with an `@/types` import, so it is read as text rather than imported. */
export function loadBundledCatalogue(): BundledProduct[] {
  const source = readFileSync(BUNDLED, 'utf8');
  const pattern = /id:\s*'([a-z0-9-]+)',\s*name:\s*'([^']+)',\s*price:\s*[\d.]+,\s*category:\s*'([a-z-]+)'/g;
  return [...source.matchAll(pattern)].map((m) => ({ id: m[1] ?? '', name: m[2] ?? '', category: m[3] ?? '' }));
}

export const testBusiness: Pick<BusinessConfig, 'lowStockThreshold'> = { lowStockThreshold: 5 };
