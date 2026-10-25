import type { PublicProduct } from '@/lib/api/catalog-client';

export function livePublic(over: Partial<PublicProduct> = {}): PublicProduct {
  return {
    id: 'chicken-shami-kebab',
    sourceId: 'abc123',
    name: 'Chicken Shami Kebab',
    description: 'Live description',
    pricePence: 950,
    compareAtPricePence: null,
    unit: 'pack',
    image: { thumbnail: 'https://cdn.example.com/t.jpg', original: 'https://cdn.example.com/o.jpg' },
    gallery: [],
    inStock: true,
    lowStock: false,
    collection: 'kebabs',
    categories: [],
    rating: 4.2,
    reviewCount: 10,
    ...over,
  };
}

/** Wire JSON for one valid product (what the server sends). */
export function wireProduct(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...livePublic(), ...over };
}

export function page(items: unknown[], nextCursor: string | null = null): { items: unknown[]; nextCursor: string | null } {
  return { items, nextCursor };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
