import type { Logger } from 'pino';
import type { GuestTokenService } from '../auth/guest-token.js';
import type { AppConfig } from '../config/env.js';
import type { RateLimitStore } from '../lib/rate-limit-store.js';
import type {
  CartLineInput,
  CollectionId,
  EnquiryInput,
  NewOrder,
  PaymentTransition,
  PricedLine,
  Pricing,
  ProductRecord,
  StoredOrder,
  UnavailableLine,
} from './types.js';

/**
 * Ports: everything feature code needs from the outside world. Production
 * implementations live in src/repositories and src/payments; tests use in-memory fakes.
 * Feature code must depend on these interfaces, never on mongodb or stripe directly.
 */

export interface ProductQuery {
  collection?: CollectionId;
  /** Free text, already length-limited by the route. Implementations must escape it. */
  q?: string;
  limit: number;
  cursor?: string;
}

export interface ProductsRepository {
  /** Published products only. */
  list(query: ProductQuery): Promise<{ items: ProductRecord[]; nextCursor: string | null }>;
  /** Slug or 24-hex ObjectId. Returns unpublished products as null. */
  findByIdOrSlug(idOrSlug: string): Promise<ProductRecord | null>;
  /** Published products matching the slugs; missing slugs are simply absent. */
  findManyBySlugs(slugs: readonly string[]): Promise<ProductRecord[]>;
  /** Published products grouped for GET /v1/collections. */
  countByCollection(): Promise<Record<CollectionId, number>>;
}

export interface OrdersRepository {
  /** Inserts a new pending order and returns it. Must generate a unique order number if `order.orderNumber` collides. */
  insertPending(order: NewOrder): Promise<StoredOrder>;
  findById(orderId: string): Promise<StoredOrder | null>;
  findByOrderNumber(orderNumber: string): Promise<StoredOrder | null>;
  attachPaymentIntent(orderId: string, paymentIntentId: string): Promise<void>;
  /**
   * Applies a payment transition to an order created by this app (never others).
   * Monotonic: must not downgrade a paid order except to refunded.
   * Returns the updated order, or null if the order is unknown / not app-created.
   */
  applyPaymentTransition(orderId: string, transition: PaymentTransition): Promise<StoredOrder | null>;
  /** App-created, payment-pending orders created before `olderThan`. */
  findStalePending(olderThan: Date, limit: number): Promise<StoredOrder[]>;
  /** Highest-numbered unused order number check for generators. */
  orderNumberExists(orderNumber: string): Promise<boolean>;
}

export interface IdempotencyRecord {
  keyHash: string;
  /** sha256 of the canonical request body. */
  requestHash: string;
  /** JSON-serialisable stored response body. */
  response: unknown;
  status: number;
  createdAt: Date;
}

export interface IdempotencyStore {
  find(keyHash: string): Promise<IdempotencyRecord | null>;
  /** Returns false if a record for this key already exists (race). */
  save(record: IdempotencyRecord): Promise<boolean>;
}

export interface EnquiryRepository {
  insert(enquiry: EnquiryInput & { ipHash: string }): Promise<{ id: string }>;
}

export interface WebhookEventStore {
  /** Atomically records the event id. Returns false if it was already recorded. */
  recordIfNew(eventId: string, type: string): Promise<boolean>;
}

export interface CreatePaymentIntentInput {
  amountPence: number;
  currency: 'gbp';
  orderId: string;
  orderNumber: string;
  receiptEmail: string;
  /** Forwarded to Stripe as the idempotency key for this creation. */
  idempotencyKey: string;
}

export interface PaymentIntentResult {
  id: string;
  clientSecret: string;
}

/** The slice of a Stripe event the API cares about, normalised so tests need no Stripe SDK. */
export type PaymentEvent =
  | {
      id: string;
      type: 'payment_intent.succeeded';
      paymentIntentId: string;
      amountReceivedPence: number;
      currency: string;
      metadata: Record<string, string>;
    }
  | {
      id: string;
      type: 'payment_intent.payment_failed' | 'payment_intent.canceled';
      paymentIntentId: string;
      metadata: Record<string, string>;
    }
  | {
      id: string;
      type: 'charge.refunded';
      paymentIntentId: string | null;
      fullyRefunded: boolean;
      metadata: Record<string, string>;
    }
  | { id: string; type: 'ignored'; rawType: string };

export class PaymentSignatureError extends Error {
  constructor(message = 'Invalid webhook signature') {
    super(message);
    this.name = 'PaymentSignatureError';
  }
}

export interface PaymentGateway {
  readonly enabled: boolean;
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult>;
  /** Cancels an unpaid intent. Must succeed (no-op) if it is already final. */
  cancelPaymentIntent(paymentIntentId: string): Promise<void>;
  /** Verifies the signature over the RAW body and normalises the event. Throws PaymentSignatureError. */
  parseWebhook(rawBody: string, signatureHeader: string | undefined): PaymentEvent;
}

export interface Clock {
  now(): Date;
}

export interface QuoteResult {
  pricing: Pricing;
  lines: PricedLine[];
  unavailable: UnavailableLine[];
  /** null when no promo code was supplied. */
  promo: { code: string; valid: boolean; message?: string } | null;
}

/** Server-side price authority. Owned by the pricing module; used by quote and payment-intent routes. */
export interface PricingService {
  /**
   * Prices a cart from database prices. Never throws for unavailable lines or bad promo codes
   * (it reports them); throws only for programmer errors. Lines for the same product are merged.
   */
  quote(input: { lines: readonly CartLineInput[]; promoCode?: string | undefined }): Promise<QuoteResult>;
}

/** Everything feature routes receive. Built once in src/bootstrap.ts; tests build it from fakes. */
export interface FeatureDeps {
  config: AppConfig;
  logger: Logger;
  clock: Clock;
  products: ProductsRepository;
  orders: OrdersRepository;
  idempotency: IdempotencyStore;
  enquiries: EnquiryRepository;
  webhookEvents: WebhookEventStore;
  payments: PaymentGateway;
  pricing: PricingService;
  guestTokens: GuestTokenService;
  rateLimitStore: RateLimitStore;
}
