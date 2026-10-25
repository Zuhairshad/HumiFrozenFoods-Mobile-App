/** Domain types shared by every API module. Mirrors docs/api-contract.md §2; money is integer pence. */

export type CollectionId = 'savory-snacks' | 'kebabs' | 'vegetable-samosas' | 'samosas' | 'other';

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface PublicProduct {
  /** The product slug. Used as productId everywhere. */
  id: string;
  /** Mongo ObjectId hex. Informational only. */
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
  categories: CategoryRef[];
  rating: number;
  reviewCount: number;
}

/** A product as the server needs it for pricing: public view plus private stock. Never serialised to clients as-is. */
export interface ProductRecord extends PublicProduct {
  /** Exact stock, or null when the source does not track stock. Server-only. */
  stock: number | null;
}

export interface Contact {
  name: string;
  email: string;
  phone: string;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
}

export type SlotWindow = 'morning' | 'afternoon' | 'evening';

export interface Slot {
  /** YYYY-MM-DD */
  date: string;
  window: SlotWindow;
}

export interface CartLineInput {
  productId: string;
  quantity: number;
}

export interface PricedLine {
  productId: string;
  /** Mongo ObjectId hex of the product, needed by the site order document. */
  sourceId: string;
  name: string;
  image: string | null;
  unitPricePence: number;
  quantity: number;
  lineTotalPence: number;
}

export interface Pricing {
  subtotalPence: number;
  deliveryPence: number;
  discountPence: number;
  totalPence: number;
  currency: 'gbp';
  promoCode: string | null;
  freeDeliveryRemainingPence: number;
}

export type UnavailableReason = 'not_found' | 'out_of_stock' | 'unpublished';

export interface UnavailableLine {
  productId: string;
  reason: UnavailableReason;
}

export type OrderStatus = 'pending_payment' | 'placed' | 'preparing' | 'out-for-delivery' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

/** Raw status vocabulary used by the owner's site/admin portal (docs/site-contract.md §5). */
export type SiteOrderStatus =
  | 'order-pending'
  | 'order-processing'
  | 'order-completed'
  | 'order-cancelled'
  | 'order-refunded'
  | 'order-failed'
  | 'order-at-local-facility'
  | 'order-out-for-delivery';

export type SitePaymentStatus =
  | 'payment-pending'
  | 'payment-processing'
  | 'payment-success'
  | 'payment-failed'
  | 'payment-reversal'
  | 'payment-refunded'
  | 'cash-on-delivery'
  | 'payment-awaiting-for-approval';

export interface Order {
  orderId: string;
  orderNumber: string;
  placedAt: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  lines: PricedLine[];
  pricing: Pricing;
  contact: Contact;
  address: Address;
  slot: Slot;
  notes?: string;
}

/** Internal order view: the public Order plus the raw site statuses and payment intent id. */
export interface StoredOrder extends Order {
  siteOrderStatus: SiteOrderStatus;
  sitePaymentStatus: SitePaymentStatus;
  paymentIntentId: string | null;
  /** True only for orders this API created (app_meta.source === "mobile-app"). */
  createdByApp: boolean;
}

export interface NewOrder {
  orderNumber: string;
  lines: PricedLine[];
  pricing: Pricing;
  contact: Contact;
  address: Address;
  slot: Slot;
  notes?: string;
  /** sha256 hex of the idempotency key; the raw key is never stored on the order. */
  idempotencyKeyHash: string;
  appVersion?: string;
}

export type PaymentTransition =
  | { kind: 'paid'; paymentIntentId: string }
  | { kind: 'failed'; paymentIntentId: string }
  | { kind: 'cancelled'; paymentIntentId: string }
  | { kind: 'refunded'; paymentIntentId: string };

export type EnquiryType = 'contact' | 'b2b' | 'sales-rep';

export interface EnquiryInput {
  type: EnquiryType;
  name: string;
  email: string;
  phone?: string;
  business?: { name: string; type: string };
  message: string;
}

export type PromoKind = 'percentage' | 'fixed' | 'free_shipping';

export interface PromoCode {
  /** Stored upper-case. */
  code: string;
  kind: PromoKind;
  /** percentage: 1-100; fixed: pence; free_shipping: ignored. */
  value: number;
  minSubtotalPence?: number;
  /** ISO timestamp. */
  expiresAt?: string;
}

export interface BusinessConfig {
  delivery: { feePence: number; freeThresholdPence: number | null; minOrderPence: number };
  promoCodes: readonly PromoCode[];
  paidOrderStatus: SiteOrderStatus;
  orderNumberDigits: number;
  pendingOrderTtlMinutes: number;
  lowStockThreshold: number;
  collections: { orders: string; products: string };
}
