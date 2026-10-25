import type { Hono } from 'hono';
import { createApp } from '../../../src/app.js';
import type {
  FeatureDeps,
  IdempotencyRecord,
  IdempotencyStore,
  OrdersRepository,
  PricingService,
  QuoteResult,
  WebhookEventStore,
} from '../../../src/domain/ports.js';
import type {
  NewOrder,
  PaymentTransition,
  PricedLine,
  Pricing,
  SiteOrderStatus,
  SitePaymentStatus,
  StoredOrder,
} from '../../../src/domain/types.js';
import { createLogger } from '../../../src/lib/logger.js';
import { transitionRule } from '../../../src/orders/statuses.js';
import { createFakeGateway, type FakeGateway } from '../../../src/payments/fake-gateway.js';
import { paymentIntentRoutes } from '../../../src/routes/payment-intent.js';
import { webhookRoutes } from '../../../src/routes/webhooks.js';
import type { AppEnv } from '../../../src/types.js';
import { captureLogs, testDeps } from '../helpers.js';

export const NOW = new Date('2026-10-26T09:00:00Z'); // Monday, 09:00 London (GMT after the 25 Oct clock change)

type Failable = 'insertPending' | 'attachPaymentIntent' | 'applyPaymentTransition' | 'findById' | 'findStalePending';

export class FakeOrders implements OrdersRepository {
  readonly orders = new Map<string, StoredOrder>();
  readonly transitions: { orderId: string; transition: PaymentTransition }[] = [];
  readonly #failures = new Map<Failable, Error>();
  #counter = 0;

  /** Makes the next call to `method` reject once. */
  failNext(method: Failable, error: Error = new Error('database unavailable')): void {
    this.#failures.set(method, error);
  }

  #maybeFail(method: Failable): void {
    const error = this.#failures.get(method);
    if (error) {
      this.#failures.delete(method);
      throw error;
    }
  }

  insertPending(order: NewOrder): Promise<StoredOrder> {
    this.#maybeFail('insertPending');
    this.#counter += 1;
    const orderId = this.#counter.toString(16).padStart(24, '0');
    const stored: StoredOrder = {
      orderId,
      orderNumber: order.orderNumber,
      placedAt: NOW.toISOString(),
      status: 'pending_payment',
      paymentStatus: 'pending',
      lines: order.lines,
      pricing: order.pricing,
      contact: order.contact,
      address: order.address,
      slot: order.slot,
      ...(order.notes === undefined ? {} : { notes: order.notes }),
      siteOrderStatus: 'order-pending',
      sitePaymentStatus: 'payment-pending',
      paymentIntentId: null,
      createdByApp: true,
    };
    this.orders.set(orderId, stored);
    return Promise.resolve(stored);
  }

  findById(orderId: string): Promise<StoredOrder | null> {
    this.#maybeFail('findById');
    return Promise.resolve(this.orders.get(orderId) ?? null);
  }

  findByOrderNumber(orderNumber: string): Promise<StoredOrder | null> {
    return Promise.resolve([...this.orders.values()].find((o) => o.orderNumber === orderNumber) ?? null);
  }

  attachPaymentIntent(orderId: string, paymentIntentId: string): Promise<void> {
    this.#maybeFail('attachPaymentIntent');
    const order = this.orders.get(orderId);
    if (!order) return Promise.reject(new Error('unknown order'));
    this.orders.set(orderId, { ...order, paymentIntentId });
    return Promise.resolve();
  }

  /** Mirrors the real repository's monotonic rules via the shared transitionRule table. */
  applyPaymentTransition(orderId: string, transition: PaymentTransition): Promise<StoredOrder | null> {
    this.#maybeFail('applyPaymentTransition');
    this.transitions.push({ orderId, transition });
    const order = this.orders.get(orderId);
    if (!order?.createdByApp) return Promise.resolve(null);
    const rule = transitionRule(transition.kind, 'order-pending');
    const intentOk = order.paymentIntentId === null || order.paymentIntentId === transition.paymentIntentId;
    if (!intentOk || !rule.allowedFrom.includes(order.sitePaymentStatus)) return Promise.resolve(order);
    const next: StoredOrder = {
      ...order,
      sitePaymentStatus: rule.toPayment,
      siteOrderStatus:
        transition.kind === 'paid'
          ? order.siteOrderStatus === 'order-pending'
            ? rule.toOrder ?? order.siteOrderStatus
            : order.siteOrderStatus
          : (rule.toOrder ?? order.siteOrderStatus),
    };
    this.orders.set(orderId, next);
    return Promise.resolve(next);
  }

  findStalePending(olderThan: Date, limit: number): Promise<StoredOrder[]> {
    this.#maybeFail('findStalePending');
    const stale = [...this.orders.values()].filter(
      (o) => o.createdByApp && o.sitePaymentStatus === 'payment-pending' && new Date(o.placedAt) < olderThan,
    );
    return Promise.resolve(stale.slice(0, limit));
  }

  orderNumberExists(orderNumber: string): Promise<boolean> {
    return Promise.resolve([...this.orders.values()].some((o) => o.orderNumber === orderNumber));
  }

  /** Test helper: puts an order into a given state. */
  seed(partial: Partial<StoredOrder> & { orderId: string }): StoredOrder {
    const pricing = partial.pricing ?? pricingFor(2000);
    const order: StoredOrder = {
      orderNumber: '123456789012',
      placedAt: NOW.toISOString(),
      status: 'pending_payment',
      paymentStatus: 'pending',
      lines: [],
      pricing,
      contact: { name: 'Asha', email: 'asha@example.com', phone: '07123456789' },
      address: { line1: '1 High St', city: 'London', postcode: 'SW1A 1AA' },
      slot: { date: '2026-10-28', window: 'morning' },
      siteOrderStatus: 'order-pending' satisfies SiteOrderStatus,
      sitePaymentStatus: 'payment-pending' satisfies SitePaymentStatus,
      paymentIntentId: 'pi_fake_000001',
      createdByApp: true,
      ...partial,
    };
    this.orders.set(order.orderId, order);
    return order;
  }
}

export class FakeIdempotency implements IdempotencyStore {
  readonly records = new Map<string, IdempotencyRecord>();
  /** When set, the next save loses a "race" to this record. */
  raceWinner: IdempotencyRecord | undefined;
  failSave: Error | undefined;

  find(keyHash: string): Promise<IdempotencyRecord | null> {
    return Promise.resolve(this.records.get(keyHash) ?? null);
  }

  save(record: IdempotencyRecord): Promise<boolean> {
    if (this.failSave) return Promise.reject(this.failSave);
    if (this.raceWinner) {
      this.records.set(record.keyHash, this.raceWinner);
      this.raceWinner = undefined;
      return Promise.resolve(false);
    }
    if (this.records.has(record.keyHash)) return Promise.resolve(false);
    this.records.set(record.keyHash, record);
    return Promise.resolve(true);
  }
}

export class FakeWebhookEvents implements WebhookEventStore {
  readonly ids = new Set<string>();
  failNext: Error | undefined;

  recordIfNew(eventId: string): Promise<boolean> {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = undefined;
      return Promise.reject(error);
    }
    if (this.ids.has(eventId)) return Promise.resolve(false);
    this.ids.add(eventId);
    return Promise.resolve(true);
  }
}

export function pricingFor(totalPence: number, overrides: Partial<Pricing> = {}): Pricing {
  return {
    subtotalPence: totalPence,
    deliveryPence: 0,
    discountPence: 0,
    totalPence,
    currency: 'gbp',
    promoCode: null,
    freeDeliveryRemainingPence: 0,
    ...overrides,
  };
}

export const CATALOGUE: Readonly<Record<string, { name: string; sourceId: string; pricePence: number }>> = {
  'chicken-samosa': { name: 'Chicken Samosa', sourceId: 'a'.repeat(24), pricePence: 450 },
  'seekh-kebab': { name: 'Seekh Kebab', sourceId: 'b'.repeat(24), pricePence: 1250 },
};

/** Simple deterministic price authority: delivery 799 under 5000, HUMI15 = 15% off. */
export class FakePricing implements PricingService {
  override: ((input: Parameters<PricingService['quote']>[0]) => QuoteResult) | undefined;
  calls = 0;

  quote(input: Parameters<PricingService['quote']>[0]): Promise<QuoteResult> {
    this.calls += 1;
    if (this.override) return Promise.resolve(this.override(input));
    const lines: PricedLine[] = [];
    const unavailable: QuoteResult['unavailable'] = [];
    for (const line of input.lines) {
      const product = CATALOGUE[line.productId];
      if (!product) {
        unavailable.push({ productId: line.productId, reason: 'not_found' });
        continue;
      }
      lines.push({
        productId: line.productId,
        sourceId: product.sourceId,
        name: product.name,
        image: null,
        unitPricePence: product.pricePence,
        quantity: line.quantity,
        lineTotalPence: product.pricePence * line.quantity,
      });
    }
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotalPence, 0);
    const promoValid = input.promoCode === undefined || input.promoCode.toUpperCase() === 'HUMI15';
    const discount = input.promoCode !== undefined && promoValid ? Math.round(subtotal * 0.15) : 0;
    const delivery = subtotal >= 5000 ? 0 : 799;
    return Promise.resolve({
      lines,
      unavailable,
      pricing: pricingFor(subtotal + delivery - discount, {
        subtotalPence: subtotal,
        deliveryPence: delivery,
        discountPence: discount,
        promoCode: input.promoCode !== undefined && promoValid ? input.promoCode.toUpperCase() : null,
      }),
      promo:
        input.promoCode === undefined
          ? null
          : { code: input.promoCode, valid: promoValid, ...(promoValid ? {} : { message: 'Promo code not recognised' }) },
    });
  }
}

export interface Harness {
  app: Hono<AppEnv>;
  deps: FeatureDeps;
  orders: FakeOrders;
  idempotency: FakeIdempotency;
  webhookEvents: FakeWebhookEvents;
  pricing: FakePricing;
  gateway: FakeGateway;
  logs: ReturnType<typeof captureLogs>;
}

export function buildHarness(
  options: { env?: Record<string, string>; now?: Date; gateway?: FeatureDeps['payments'] } = {},
): Harness {
  const logs = captureLogs();
  const logger = createLogger({ level: 'debug', destination: logs.stream });
  const base = testDeps({ logger }, options.env);
  const orders = new FakeOrders();
  const idempotency = new FakeIdempotency();
  const webhookEvents = new FakeWebhookEvents();
  const pricing = new FakePricing();
  const gateway = createFakeGateway({ now: () => (options.now ?? NOW).getTime() });
  const deps: FeatureDeps = {
    config: base.config,
    logger,
    clock: { now: () => options.now ?? NOW },
    products: {
      list: () => Promise.reject(new Error('unused')),
      findByIdOrSlug: () => Promise.reject(new Error('unused')),
      findManyBySlugs: () => Promise.reject(new Error('unused')),
      countByCollection: () => Promise.reject(new Error('unused')),
    },
    orders,
    idempotency,
    enquiries: { insert: () => Promise.reject(new Error('unused')) },
    webhookEvents,
    payments: options.gateway ?? gateway,
    pricing,
    guestTokens: base.guestTokens,
    rateLimitStore: base.rateLimitStore,
  };
  const app = createApp(base, (a) => {
    a.route('/v1', paymentIntentRoutes(deps));
    a.route('/v1', webhookRoutes(deps));
  });
  return { app, deps, orders, idempotency, webhookEvents, pricing, gateway, logs };
}
