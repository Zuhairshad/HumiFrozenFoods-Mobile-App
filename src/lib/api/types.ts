/**
 * Wire types of the Humi's API. Mirrors docs/api-contract.md sections 1, 2 and 3 EXACTLY.
 * Money is integer pence (`...Pence`). The server is the only price authority.
 */

export type CollectionId = 'savory-snacks' | 'kebabs' | 'vegetable-samosas' | 'samosas' | 'other';

export interface PublicProduct {
  /** The product SLUG (stable, URL-safe, unique). Used everywhere as productId. */
  id: string;
  /** Mongo ObjectId hex (informational; clients must not depend on it). */
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

export interface Pricing {
  subtotalPence: number;
  deliveryPence: number;
  discountPence: number;
  totalPence: number;
  currency: 'gbp';
  promoCode: string | null;
  freeDeliveryRemainingPence: number;
}

export interface PricedLine {
  productId: string;
  name: string;
  image: string | null;
  unitPricePence: number;
  quantity: number;
  lineTotalPence: number;
}

export interface Contact {
  name: string;
  email: string;
  phone: string;
}

/** UK only; postcode normalised to "AB1 2CD". */
export interface Address {
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
}

export type DeliveryWindowId = 'morning' | 'afternoon' | 'evening';

export interface Slot {
  /** YYYY-MM-DD, today..+14d, not in the past. */
  date: string;
  window: DeliveryWindowId;
}

export type OrderStatus = 'pending_payment' | 'placed' | 'preparing' | 'out-for-delivery' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface Order {
  orderId: string;
  orderNumber: string;
  /** ISO */
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

/* ---- 1. Error envelope ---- */

export type ApiErrorCode =
  | 'validation_failed'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'idempotency_key_reuse'
  | 'unprocessable'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'rate_limited'
  | 'payment_provider_error'
  | 'internal_error';

/** Dotted path into the request body, e.g. `contact.email`, `lines.0.quantity`. */
export interface ValidationDetail {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
    /** Optional. `validation_failed`: ValidationDetail[]; 422: object with specifics. */
    details?: ValidationDetail[] | Record<string, unknown>;
  };
}

/* ---- 3.1 GET /v1/config ---- */

export interface SlotWindowConfig {
  id: DeliveryWindowId;
  label: string;
  range: string;
}

export interface ConfigResponse {
  currency: 'gbp';
  delivery: { feePence: number; freeThresholdPence: number | null; minOrderPence: number };
  promo: { enabled: boolean };
  payments: { provider: 'stripe'; enabled: boolean };
  lowStockThreshold: number;
  slotWindows: SlotWindowConfig[];
}

/* ---- 3.2 Checkout ---- */

export interface QuoteLineInput {
  productId: string;
  quantity: number;
}

export interface QuoteRequest {
  lines: QuoteLineInput[];
  promoCode?: string;
}

export type UnavailableReason = 'not_found' | 'out_of_stock' | 'unpublished';

export interface UnavailableLine {
  productId: string;
  reason: UnavailableReason;
}

export interface QuoteResponse {
  pricing: Pricing;
  lines: PricedLine[];
  unavailable: UnavailableLine[];
  promo?: { code: string; valid: boolean; message?: string };
}

export interface PaymentIntentRequest {
  lines: QuoteLineInput[];
  promoCode?: string;
  contact: Contact;
  address: Address;
  slot: Slot;
  notes?: string;
}

/** What the checkout screen assembles (identical to the request body). */
export type OrderDraft = PaymentIntentRequest;

export interface PaymentIntentResponse {
  orderId: string;
  orderNumber: string;
  guestToken: string;
  clientSecret: string;
  pricing: Pricing;
  lines: PricedLine[];
}

export interface OrderLookupRequest {
  orderNumber: string;
  email?: string;
  phone?: string;
}

export interface OrderLookupResponse {
  orderId: string;
  guestToken: string;
}

/* ---- 3.4 Enquiries ---- */

export type EnquiryType = 'contact' | 'b2b' | 'sales-rep';

export interface EnquiryRequest {
  type: EnquiryType;
  name: string;
  email: string;
  phone?: string;
  business?: { name: string; type: string };
  message: string;
  /** Honeypot: must always be sent empty. */
  website?: string;
}

export interface EnquiryResponse {
  id: string;
}
