/**
 * Wire types for the Humi's API as ASSUMED by the mobile client (agent F).
 * To be reconciled against docs/api-contract.md by the lead.
 *
 * Rules: all money is an integer number of pence (`*Pence`); the server is the
 * source of truth for prices; the client sends only product ids + quantities.
 */

export type DeliveryWindowId = 'morning' | 'afternoon' | 'evening';

/** POST /v1/checkout/payment-intent request line. No prices: the server prices the basket. */
export interface CheckoutLineInput {
  productId: string;
  quantity: number;
}

export interface CheckoutContactInput {
  name: string;
  email: string;
  phone: string;
}

export interface CheckoutAddressInput {
  line1: string;
  line2?: string;
  city: string;
  /** Normalised upper-case UK postcode with a single space, e.g. "M1 1AE". */
  postcode: string;
}

export interface CheckoutSlotInput {
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  window: DeliveryWindowId;
}

/** What the client knows and sends. Named OrderDraft in the app. */
export interface OrderDraft {
  lines: CheckoutLineInput[];
  /** Raw code typed by the user, e.g. "HUMI15". Omitted when no promo applied. */
  promoCode?: string;
  contact: CheckoutContactInput;
  address: CheckoutAddressInput;
  slot: CheckoutSlotInput;
  notes?: string;
}

/** Request body of POST /v1/checkout/payment-intent. `idempotencyKey` is also sent as the `Idempotency-Key` header. */
export interface CreatePaymentIntentRequest extends OrderDraft {
  idempotencyKey: string;
}

export interface PricingDto {
  subtotalPence: number;
  deliveryPence: number;
  discountPence: number;
  totalPence: number;
  currency: 'gbp';
  /** Echo of the promo the server accepted, if any. */
  promoCode?: string;
}

export interface OrderLineDto {
  productId: string;
  name: string;
  unitPricePence: number;
  quantity: number;
  /** Remote image URL. */
  image: string;
}

/** Response body (201) of POST /v1/checkout/payment-intent. */
export interface CreatePaymentIntentResponse {
  orderId: string;
  /** Human order number, e.g. "HUMI-48213". */
  orderNumber: string;
  /** Bearer credential scoped to this order, read-only. Send as `Authorization: Bearer <token>`. */
  guestToken: string;
  /** PaymentIntent client secret for PaymentSheet. */
  clientSecret: string;
  pricing: PricingDto;
  lines: OrderLineDto[];
}

export type OrderStatusDto =
  | 'pending_payment'
  | 'placed'
  | 'preparing'
  | 'out-for-delivery'
  | 'delivered'
  | 'cancelled';

/** `demo` is produced only by the offline mock; the real server never returns it. */
export type PaymentStatusDto = 'pending' | 'paid' | 'failed' | 'refunded' | 'demo';

/** Response body of GET /v1/orders/:id (header `Authorization: Bearer <guestToken>`). */
export interface OrderDto {
  orderId: string;
  orderNumber: string;
  /** ISO 8601. */
  placedAt: string;
  status: OrderStatusDto;
  paymentStatus: PaymentStatusDto;
  lines: OrderLineDto[];
  pricing: PricingDto;
  contact: CheckoutContactInput;
  address: CheckoutAddressInput;
  slot: CheckoutSlotInput;
  notes?: string;
}

/** Error envelope assumed for non-2xx responses. */
export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}
