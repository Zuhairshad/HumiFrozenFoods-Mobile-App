import { ObjectId } from 'mongodb';
import type { Logger } from 'pino';
import type { NewOrder, PricedLine, SlotWindow, StoredOrder } from '../domain/types.js';
import { isObjectIdString, parseObjectId } from '../lib/ids.js';
import { fromPence, pence, toPence } from '../lib/money.js';
import { ORDER_NUMBER_PATTERN } from './order-number.js';
import { mapSiteStatuses } from './statuses.js';

/** Value of `app_meta.source` on every document this API inserts; the only documents it may ever update. */
export const APP_SOURCE = 'mobile-app';

export interface SiteProductLine {
  product_id: ObjectId;
  order_quantity: number;
  unit_price: number;
  subtotal: number;
  name: string;
  image: string | null;
}

export interface SiteAddress {
  city: string;
  country: string;
  street_address: string;
  post_code: string;
  location: null;
}

export interface SiteOrderDocument {
  tracking_number: string;
  products: SiteProductLine[];
  amount: number;
  sales_tax: number;
  delivery_fee: number;
  discount: number;
  paid_total: number;
  total: number;
  coupon_id: null;
  delivery_method: 'shipping';
  store_id: null;
  pickup_location: null;
  customer_contact: string;
  customer_name: string;
  first_name: string;
  last_name: string;
  customer_email: string;
  note: string;
  payment_gateway: 'STRIPE';
  payment_sub_gateway: '';
  use_wallet_points: false;
  isFullWalletPayment: false;
  billing_address: SiteAddress;
  shipping_address: SiteAddress;
  language: 'en';
  order_status: 'order-pending';
  payment_status: 'payment-pending';
  payment_intent: { id: string | null; client_secret_redacted: true };
  created_at: Date;
  updated_at: Date;
  app_meta: {
    source: typeof APP_SOURCE;
    slot: { date: string; window: SlotWindow };
    promo_code: string | null;
    idempotency_key_hash: string;
    app_version?: string;
    /** Parallel to `products`: the slugs the app uses as product ids, which the site document has no field for. */
    product_slugs: string[];
    /** Present only when the address has a second line, so `street_address` can be split back losslessly. */
    address_line2?: string;
  };
}

export interface MapContext {
  now: Date;
}

const SLOT_NOTE = /(?:^|\n)Delivery: (\d{4}-\d{2}-\d{2}) (morning|afternoon|evening)\s*$/;

/** GBP pounds as an exactly rounded double: fromPence yields the exact decimal string, Number() the nearest double. */
function pounds(value: number): number {
  return Number(fromPence(pence(value)));
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const [first = '', ...rest] = parts;
  return { first, last: rest.join(' ') };
}

function assertConsistent(order: NewOrder): void {
  const { lines, pricing } = order;
  const lineSum = lines.reduce((acc, line) => acc + line.lineTotalPence, 0);
  const consistent =
    lines.length > 0 &&
    lines.every(
      (l) =>
        Number.isSafeInteger(l.quantity) &&
        l.quantity > 0 &&
        l.unitPricePence >= 0 &&
        l.unitPricePence * l.quantity === l.lineTotalPence,
    ) &&
    pricing.subtotalPence === lineSum &&
    pricing.deliveryPence >= 0 &&
    pricing.discountPence >= 0 &&
    pricing.totalPence === pricing.subtotalPence + pricing.deliveryPence - pricing.discountPence;
  if (!consistent) throw new RangeError('Order totals are inconsistent');
  if (!ORDER_NUMBER_PATTERN.test(order.orderNumber)) throw new RangeError('Invalid order number');
}

function productLine(line: PricedLine): SiteProductLine {
  return {
    product_id: parseObjectId(line.sourceId, 'product id'),
    order_quantity: line.quantity,
    unit_price: pounds(line.unitPricePence),
    subtotal: pounds(line.lineTotalPence),
    name: line.name,
    image: line.image,
  };
}

/** Builds the document inserted into the owner's `orders` collection (contract §4). Throws on inconsistent totals. */
export function toSiteDocument(order: NewOrder, ctx: MapContext): SiteOrderDocument {
  assertConsistent(order);
  const { contact, address, pricing, slot } = order;
  const street = address.line2 ? `${address.line1}, ${address.line2}` : address.line1;
  const siteAddress: SiteAddress = {
    city: address.city,
    country: '',
    street_address: street,
    post_code: address.postcode,
    location: null,
  };
  const { first, last } = splitName(contact.name);
  const deliveryLine = `Delivery: ${slot.date} ${slot.window}`;
  const total = pounds(pricing.totalPence);

  return {
    tracking_number: order.orderNumber,
    products: order.lines.map(productLine),
    amount: pounds(pricing.subtotalPence),
    sales_tax: 0,
    delivery_fee: pounds(pricing.deliveryPence),
    discount: pounds(pricing.discountPence),
    paid_total: total,
    total,
    coupon_id: null,
    delivery_method: 'shipping',
    store_id: null,
    pickup_location: null,
    customer_contact: contact.phone,
    customer_name: contact.name.trim(),
    first_name: first,
    last_name: last,
    customer_email: contact.email,
    note: order.notes ? `${order.notes}\n${deliveryLine}` : deliveryLine,
    payment_gateway: 'STRIPE',
    payment_sub_gateway: '',
    use_wallet_points: false,
    isFullWalletPayment: false,
    billing_address: { ...siteAddress },
    shipping_address: siteAddress,
    language: 'en',
    order_status: 'order-pending',
    payment_status: 'payment-pending',
    payment_intent: { id: null, client_secret_redacted: true },
    created_at: ctx.now,
    updated_at: ctx.now,
    app_meta: {
      source: APP_SOURCE,
      slot: { date: slot.date, window: slot.window },
      promo_code: pricing.promoCode,
      idempotency_key_hash: order.idempotencyKeyHash,
      ...(order.appVersion === undefined ? {} : { app_version: order.appVersion }),
      product_slugs: order.lines.map((l) => l.productId),
      ...(address.line2 ? { address_line2: address.line2 } : {}),
    },
  };
}

/* ------------------------------ reading ------------------------------ */

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof ObjectId);
}

const MAX_TEXT = 2000;

function text(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, MAX_TEXT);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function hex(value: unknown): string | null {
  if (value instanceof ObjectId) return value.toHexString();
  return isObjectIdString(value) ? value.toLowerCase() : null;
}

/** Hand-edited data can hold floats like 7.994 or strings; clamp to a non-negative whole number of pence. */
function loosePence(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1e9) return null;
  try {
    return toPence(n);
  } catch {
    return Math.round(n * 100);
  }
}

function looseDate(value: unknown): Date | null {
  const date = value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function isRealDate(value: string): boolean {
  const [y = 0, m = 0, d = 0] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function isWindow(value: unknown): value is SlotWindow {
  return value === 'morning' || value === 'afternoon' || value === 'evening';
}

function readSlot(meta: Rec | null, note: string, placedAt: Date): { slot: StoredOrder['slot']; notes: string } {
  const match = SLOT_NOTE.exec(note);
  const [, noteDate, noteWindow] = match ?? [];
  const fromNote = noteDate && noteWindow && isWindow(noteWindow) && isRealDate(noteDate) ? { date: noteDate, window: noteWindow } : null;
  const notes = (match && fromNote ? note.slice(0, match.index) : note).trim();
  const metaSlot = meta && isRec(meta.slot) ? meta.slot : null;
  if (metaSlot && typeof metaSlot.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(metaSlot.date) && isRealDate(metaSlot.date) && isWindow(metaSlot.window)) {
    return { slot: { date: metaSlot.date, window: metaSlot.window }, notes };
  }
  if (fromNote) return { slot: fromNote, notes };
  // Website orders carry no slot; the order date is the least misleading stand-in.
  return { slot: { date: placedAt.toISOString().slice(0, 10), window: 'morning' }, notes };
}

function readLines(products: unknown, meta: Rec | null): PricedLine[] {
  if (!Array.isArray(products)) return [];
  const slugs: unknown[] = meta && Array.isArray(meta.product_slugs) ? (meta.product_slugs as unknown[]) : [];
  return (products as unknown[]).filter(isRec).map((p, index) => {
    const sourceId = hex(p.product_id) ?? '';
    const slug = slugs[index];
    const quantity = Math.max(0, Math.round(typeof p.order_quantity === 'number' && Number.isFinite(p.order_quantity) ? p.order_quantity : 0));
    const unit = loosePence(p.unit_price) ?? 0;
    const image = isRec(p.image) ? p.image.thumbnail : p.image;
    return {
      productId: typeof slug === 'string' && slug !== '' ? slug.slice(0, 200) : sourceId,
      sourceId,
      name: text(p.name),
      image: typeof image === 'string' && image !== '' ? image.slice(0, MAX_TEXT) : null,
      unitPricePence: unit,
      quantity,
      lineTotalPence: loosePence(p.subtotal) ?? unit * quantity,
    };
  });
}

export interface ReadOptions {
  /** Used only to derive `freeDeliveryRemainingPence`, which the site document has no field for. */
  freeDeliveryThresholdPence?: number | null;
  logger?: Pick<Logger, 'warn'>;
}

/**
 * Reverse mapping (contract §4). Never throws on a malformed document: returns null (and logs the
 * document id, never its contents) only when the document cannot be identified at all.
 */
export function fromSiteDocument(doc: unknown, options: ReadOptions = {}): StoredOrder | null {
  try {
    return readDocument(doc, options);
  } catch (error) {
    options.logger?.warn({ err: error }, 'unreadable order document');
    return null;
  }
}

function readDocument(doc: unknown, options: ReadOptions): StoredOrder | null {
  if (!isRec(doc)) {
    options.logger?.warn('order document is not an object');
    return null;
  }
  const orderId = hex(doc._id);
  const orderNumber = text(doc.tracking_number).trim();
  if (!orderId || !orderNumber) {
    options.logger?.warn({ orderId }, 'order document lacks _id or tracking_number');
    return null;
  }

  const meta = isRec(doc.app_meta) ? doc.app_meta : null;
  const createdByApp = meta?.source === APP_SOURCE;
  const placedAt = looseDate(doc.created_at) ?? looseDate(doc.createdAt) ?? new ObjectId(orderId).getTimestamp();
  const statuses = mapSiteStatuses(doc.order_status, doc.payment_status);
  const lines = readLines(doc.products, meta);

  const subtotalPence = loosePence(doc.amount) ?? lines.reduce((acc, l) => acc + l.lineTotalPence, 0);
  const deliveryPence = loosePence(doc.delivery_fee) ?? 0;
  const discountPence = loosePence(doc.discount) ?? 0;
  const totalPence = loosePence(doc.total) ?? loosePence(doc.paid_total) ?? Math.max(0, subtotalPence + deliveryPence - discountPence);
  const threshold = options.freeDeliveryThresholdPence ?? null;

  const addressDoc = isRec(doc.shipping_address) ? doc.shipping_address : isRec(doc.billing_address) ? doc.billing_address : {};
  const street = text(addressDoc.street_address);
  const rawLine2 = meta?.address_line2;
  const line2 = createdByApp && typeof rawLine2 === 'string' ? rawLine2 : '';
  const hasLine2 = line2 !== '' && street.endsWith(`, ${line2}`);
  const { slot, notes } = readSlot(meta, text(doc.note), placedAt);

  const first = text(doc.first_name).trim();
  const last = text(doc.last_name).trim();
  const paymentIntent = isRec(doc.payment_intent) ? doc.payment_intent.id : null;

  return {
    orderId,
    orderNumber,
    placedAt: placedAt.toISOString(),
    status: statuses.status,
    paymentStatus: statuses.paymentStatus,
    lines,
    pricing: {
      subtotalPence,
      deliveryPence,
      discountPence,
      totalPence,
      currency: 'gbp',
      promoCode: meta && typeof meta.promo_code === 'string' && meta.promo_code !== '' ? meta.promo_code : null,
      freeDeliveryRemainingPence: threshold === null || deliveryPence === 0 ? 0 : Math.max(0, threshold - subtotalPence),
    },
    contact: {
      name: text(doc.customer_name).trim() || `${first} ${last}`.trim(),
      email: text(doc.customer_email).trim(),
      phone: text(doc.customer_contact).trim(),
    },
    address: {
      line1: hasLine2 ? street.slice(0, street.length - line2.length - 2) : street,
      ...(hasLine2 ? { line2 } : {}),
      city: text(addressDoc.city),
      postcode: text(addressDoc.post_code),
    },
    slot,
    ...(notes === '' ? {} : { notes }),
    siteOrderStatus: statuses.siteOrderStatus,
    sitePaymentStatus: statuses.sitePaymentStatus,
    paymentIntentId: typeof paymentIntent === 'string' && paymentIntent !== '' ? paymentIntent : null,
    createdByApp,
  };
}
