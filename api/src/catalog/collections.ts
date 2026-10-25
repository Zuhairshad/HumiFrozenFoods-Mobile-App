import type { CollectionId } from '../domain/types.js';

interface Rule {
  collection: CollectionId;
  pattern: RegExp;
}

/**
 * First match wins, so order is the specification. The live data only has one category, so collections are
 * derived from the product name and slug. Notes on the order:
 * - vegetable samosas before samosas (the generic rule would swallow them); "vegatable" is a real typo in a live slug.
 * - savory-snacks before kebabs so "Aloo Tikki" is a snack (matches the bundled catalogue) although "tikki" is a kebab word.
 * - "Punjabi Samosa Roti" is a roti, not a samosa, hence savory-snacks before samosas.
 */
const RULES: readonly Rule[] = [
  { collection: 'vegetable-samosas', pattern: /\bveg(?:e|a)table\b.*\bsamosas?\b/ },
  { collection: 'savory-snacks', pattern: /\b(?:spring rolls?|rotis?|punjabi|aloo tikkis?|aloo tikkas?)\b/ },
  { collection: 'kebabs', pattern: /\b(?:kebabs?|shami|tikki|chapli|seekh)\b/ },
  { collection: 'samosas', pattern: /\bsamosas?\b/ },
];

export const COLLECTION_IDS: readonly CollectionId[] = ['savory-snacks', 'kebabs', 'vegetable-samosas', 'samosas', 'other'];

export const COLLECTION_TITLES: Readonly<Record<CollectionId, string>> = {
  'savory-snacks': 'Savory Snacks',
  kebabs: 'Kebabs',
  'vegetable-samosas': 'Vegetable Samosas',
  samosas: 'Samosas',
  other: 'Other',
};

export function isCollectionId(value: unknown): value is CollectionId {
  return typeof value === 'string' && (COLLECTION_IDS as readonly string[]).includes(value);
}

export function deriveCollection(name: string, slug: string): CollectionId {
  // Name is the editorial text; slug is only a fallback signal (it can carry typos the name does not, and vice versa).
  // Capped so a hostile or accidental megabyte name cannot make the `.*` rule scan quadratically.
  const haystack = `${name.slice(0, 200)} ${slug.slice(0, 100)}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (const rule of RULES) {
    if (rule.pattern.test(haystack)) return rule.collection;
  }
  return 'other';
}

export function emptyCollectionCounts(): Record<CollectionId, number> {
  return { 'savory-snacks': 0, kebabs: 0, 'vegetable-samosas': 0, samosas: 0, other: 0 };
}
