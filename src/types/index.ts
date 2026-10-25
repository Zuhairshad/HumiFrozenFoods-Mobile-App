/** The four browsable categories. */
export type BrowseCategoryId = 'savory-snacks' | 'kebabs' | 'vegetable-samosas' | 'samosas';
/** `other` is a live-only bucket (API `collection: 'other'`); it appears under All, never as a category. */
export type CategoryId = BrowseCategoryId | 'other';

export interface Category {
  id: BrowseCategoryId;
  title: string;
  image: string; // remote URL
  blurb: string;
}

export type ProductTag = 'Best Seller' | 'Premium' | 'Halal Certified' | 'Vegan Friendly' | 'Omega-3 Rich' | 'New';

export interface Product {
  id: string; // url-safe slug
  name: string;
  price: number; // GBP for DISPLAY, e.g. 9.5 (always pricePence / 100). Do maths on pricePence.
  pricePence: number; // integer pence, the unit of truth (matches the API)
  compareAtPricePence?: number; // strike-through price when the API reports a discount
  inStock: boolean;
  lowStock?: boolean;
  gallery?: string[]; // extra https photos (live only)
  category: CategoryId;
  image: string; // remote URL
  description: string;
  tags: ProductTag[];
  readyInMins: number; // 0 = unknown (live-only product without bundled enrichment)
  weight: string; // e.g. "20 pcs · 700g"; '' when unknown
  rating: number; // 0-5
  reviewCount: number;
  ingredients: string; // '' when unknown
}

export interface Testimonial {
  id: string;
  name: string;
  location: string;
  quote: string;
  rating: number;
  avatar: string;
}

export interface HeroSlide {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string;
  productId: string;
  badges: string[];
}

export interface CartLine {
  productId: string;
  quantity: number;
}

export type OrderStatus = 'placed' | 'preparing' | 'out-for-delivery' | 'delivered';

export interface Order {
  id: string; // e.g. "HUMI-48213"
  placedAt: string; // ISO date
  lines: { productId: string; name: string; price: number; quantity: number; image: string }[];
  subtotal: number;
  delivery: number;
  discount: number;
  total: number;
  status: OrderStatus;
  address: string;
}
