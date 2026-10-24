export type CategoryId = 'savory-snacks' | 'kebabs' | 'vegetable-samosas' | 'samosas';

export interface Category {
  id: CategoryId;
  title: string;
  image: string; // remote URL
  blurb: string;
}

export type ProductTag = 'Best Seller' | 'Premium' | 'Halal Certified' | 'Vegan Friendly' | 'Omega-3 Rich' | 'New';

export interface Product {
  id: string; // url-safe slug
  name: string;
  price: number; // GBP, e.g. 9.5
  category: CategoryId;
  image: string; // remote URL
  description: string;
  tags: ProductTag[];
  readyInMins: number;
  weight: string; // e.g. "20 pcs · 700g"
  rating: number; // 0-5
  reviewCount: number;
  ingredients: string;
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
