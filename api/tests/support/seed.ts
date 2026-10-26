import { readFileSync } from 'node:fs';
import { ObjectId, type Db, type Document } from 'mongodb';

interface FixtureFile {
  results: Record<string, unknown>[];
}

const FIXTURE_URL = new URL('../fixtures/products.live.json', import.meta.url);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The live snapshot is API JSON (string ids, ISO dates). The database holds ObjectIds and Dates, so convert
 * the id and date fields back; every other field (b2b_pricing, quantity, sold_quantity, sku, __v, ...) is
 * kept verbatim so the leak tests are meaningful.
 */
function toSiteShape(doc: Record<string, unknown>): Document {
  const out: Document = { ...doc };
  if (typeof doc['_id'] === 'string') out['_id'] = new ObjectId(doc['_id']);
  for (const key of ['createdAt', 'updatedAt']) {
    const value = doc[key];
    if (typeof value === 'string') out[key] = new Date(value);
  }
  if (Array.isArray(doc['categories'])) {
    out['categories'] = (doc['categories'] as unknown[]).map((c) => {
      if (!isRecord(c)) return c;
      const copy: Document = { ...c };
      if (typeof c['_id'] === 'string') copy['_id'] = new ObjectId(c['_id']);
      return copy;
    });
  }
  return out;
}

export function loadProductFixture(): Document[] {
  const file = JSON.parse(readFileSync(FIXTURE_URL, 'utf8')) as FixtureFile;
  return file.results.map(toSiteShape);
}

export const FIXTURE_PRODUCT_COUNT = 17;

/** A published, in-stock product cloned from a real one with overrides, for tests that need exact prices or stock. */
export function extraProduct(overrides: Document & { slug: string; name: string }): Document {
  const base = loadProductFixture().find((p) => p['slug'] === 'aloo-tikki');
  if (!base) throw new Error('fixture is missing aloo-tikki');
  const doc: Document = {
    ...base,
    _id: new ObjectId(),
    sku: 'E2E',
    quantity: 1000,
    sold_quantity: 0,
    in_stock: true,
    status: 'publish',
    visibility: 'public',
    discount: false,
    sale_price: null,
    ...overrides,
  };
  // The live `id` is a Mongoose virtual duplicating _id; a stale copy would be misleading.
  delete doc['id'];
  return doc;
}

export interface SiteOrderSpec {
  trackingNumber: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
  orderStatus: string;
  paymentStatus: string;
  lines: { productId: ObjectId; name: string; quantity: number; unitPrice: number }[];
  deliveryFee: number;
}

/** A document shaped like what the live website's POST /orders stores (docs/site-contract.md 3.3 and 9). No app_meta. */
export function siteOrderDocument(spec: SiteOrderSpec): Document {
  const products = spec.lines.map((l) => ({
    product_id: l.productId,
    order_quantity: l.quantity,
    unit_price: l.unitPrice,
    subtotal: Math.round(l.unitPrice * l.quantity * 100) / 100,
    name: l.name,
  }));
  const amount = Math.round(products.reduce((a, p) => a + p.subtotal, 0) * 100) / 100;
  const total = Math.round((amount + spec.deliveryFee) * 100) / 100;
  const address = {
    city: 'Manchester',
    country: 'GB',
    street_address: '5 Site Customer Road',
    post_code: 'M1 1AA',
    location: null,
  };
  return {
    _id: new ObjectId(),
    tracking_number: spec.trackingNumber,
    products,
    amount,
    sales_tax: 0,
    delivery_fee: spec.deliveryFee,
    discount: 0,
    paid_total: total,
    total,
    coupon_id: null,
    delivery_method: 'shipping',
    store_id: null,
    pickup_location: null,
    customer_contact: spec.phone,
    customer_name: `${spec.firstName} ${spec.lastName}`,
    first_name: spec.firstName,
    last_name: spec.lastName,
    customer_email: spec.email,
    note: 'Website order',
    payment_gateway: 'STRIPE',
    payment_sub_gateway: '',
    use_wallet_points: false,
    isFullWalletPayment: false,
    billing_address: { ...address },
    shipping_address: { ...address },
    language: 'en',
    order_status: spec.orderStatus,
    payment_status: spec.paymentStatus,
    children: [],
    created_at: spec.createdAt,
    updated_at: spec.createdAt,
    __v: 0,
  };
}

export const SITE_CUSTOMER = { email: 'sam.site@example.com', phone: '07700 900111' };

/** Three website orders: two completed and paid, one old payment-pending (the dangerous one for the expiry job). */
export function seedSiteOrders(products: readonly Document[]): Document[] {
  const idOf = (slug: string): ObjectId => {
    const found = products.find((p) => p['slug'] === slug);
    if (!(found?.['_id'] instanceof ObjectId)) throw new Error(`fixture is missing ${slug}`);
    return found['_id'];
  };
  return [
    siteOrderDocument({
      trackingNumber: '482915037264',
      ...SITE_CUSTOMER,
      firstName: 'Sam',
      lastName: 'Site',
      createdAt: new Date('2026-02-10T12:30:00.000Z'),
      orderStatus: 'order-completed',
      paymentStatus: 'payment-success',
      lines: [{ productId: idOf('aloo-tikki'), name: 'ALOO TIKKI', quantity: 3, unitPrice: 7.3 }],
      deliveryFee: 7.99,
    }),
    siteOrderDocument({
      trackingNumber: '175000012399',
      email: 'priya.web@example.com',
      phone: '07700 900222',
      firstName: 'Priya',
      lastName: 'Web',
      createdAt: new Date('2026-03-01T09:00:00.000Z'),
      orderStatus: 'order-completed',
      paymentStatus: 'payment-success',
      lines: [{ productId: idOf('chicken-seekh-kebab'), name: 'CHICKEN SEEKH KEBAB', quantity: 4, unitPrice: 13.5 }],
      deliveryFee: 0,
    }),
    siteOrderDocument({
      trackingNumber: '660011223344',
      email: 'old.pending@example.com',
      phone: '07700 900333',
      firstName: 'Olly',
      lastName: 'Pending',
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
      orderStatus: 'order-pending',
      paymentStatus: 'payment-pending',
      lines: [{ productId: idOf('meat-samosa-large'), name: 'MEAT SAMOSA LARGE', quantity: 2, unitPrice: 7.8 }],
      deliveryFee: 7.99,
    }),
  ];
}

export async function seedDatabase(db: Db): Promise<{ products: Document[]; siteOrders: Document[] }> {
  const products = loadProductFixture();
  const siteOrders = seedSiteOrders(products);
  await db.collection('products').insertMany(products);
  await db.collection('orders').insertMany(siteOrders);
  return { products, siteOrders };
}
