/**
 * Humi's Frozen Foods - storefront/API contract types.
 * Source: docs/site-contract.md (read that for OBSERVED vs INFERRED evidence).
 * Pure types: no runtime code. Tags in comments: [OBS] = observed (live response,
 * captured request, or literal code in the site's JS bundles), [INF] = inferred.
 */

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/** [OBS] Mongo ObjectId serialised as 24-char hex string. Mongoose also adds a virtual `id` equal to `_id`. */
export type ObjectIdString = string;
/** [OBS] ISO-8601 UTC string, e.g. "2026-02-06T14:59:15.883Z". */
export type IsoDateString = string;

/** [OBS] Image object used everywhere (http:// AND https:// hosts both occur). */
export interface ImageSet {
  original: string;
  thumbnail: string;
}

/* ------------------------------------------------------------------ */
/* Enums (values OBSERVED in the site's JS bundle, module 10265)       */
/* ------------------------------------------------------------------ */

export type OrderStatus =
  | 'order-pending'
  | 'order-processing'
  | 'order-completed'
  | 'order-cancelled'
  | 'order-refunded'
  | 'order-failed'
  | 'order-at-local-facility'
  | 'order-out-for-delivery';

export type PaymentStatus =
  | 'payment-pending'
  | 'payment-processing'
  | 'payment-success'
  | 'payment-failed'
  | 'payment-reversal'
  | 'payment-refunded'
  | 'cash-on-delivery'
  | 'payment-awaiting-for-approval';

/** Values the storefront sends in `payment_gateway`. Only STRIPE and CASH are offered in the UI today. */
export type PaymentGateway =
  | 'STRIPE'
  | 'CASH' // [OBS] the "Cash" button in the UI sends this
  | 'CASH_ON_DELIVERY' // [OBS] enum exists; UI does not render a button for it
  | 'FULL_WALLET_PAYMENT'
  | 'PAYPAL'
  | 'MOLLIE'
  | 'RAZORPAY'
  | 'SSLCOMMERZ'
  | 'PAYSTACK'
  | 'PAYMONGO'
  | 'XENDIT'
  | 'IYZICO'
  | 'BKASH'
  | 'FLUTTERWAVE';

/** [OBS] The only two options rendered in the guest checkout UI. */
export type DeliveryMethod = 'local_shipping' | 'shipping';
/** [OBS in code, not reachable from the UI] legacy values handled by checkout code; they carry store_id / pickup_location. */
export type LegacyDeliveryMethod = 'store_pickup' | 'local_delivery';

export type CouponType = 'fixed' | 'percentage' | 'free_shipping'; // [OBS in code]
export type ProductType = 'simple' | 'variable'; // [OBS in code]; all live products are 'simple'

/* ------------------------------------------------------------------ */
/* GET /settings?language=en  [OBS live response; unrelated fields kept minimal] */
/* ------------------------------------------------------------------ */

export interface SettingsResponse {
  _id: ObjectIdString;
  id: ObjectIdString;
  language: string;
  translated_languages: string[];
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  options: SiteOptions;
}

export interface SiteOptions {
  _id: ObjectIdString;
  siteTitle: string;
  siteSubtitle: string;
  currency: string; // [OBS] "GBP"
  currencyOptions: { _id: ObjectIdString; fractions: number; formation: string }; // [OBS] 2, "en-GB"
  defaultPaymentGateway: string; // [OBS] "stripe" (lower-case here, UPPER-case in orders)
  useCashOnDelivery: boolean; // [OBS] true
  useEnableGateway: boolean; // [OBS] true
  stripeCardOnly: boolean; // [OBS] false
  paymentGateway: Array<{ _id: ObjectIdString; name: string; title: string }>; // [OBS] stripe, cod
  guestCheckout: boolean; // [OBS] true  (page /checkout/guest redirects home if false)
  enableCoupons: boolean; // [OBS] true
  freeShipping: boolean; // [OBS] false
  freeShippingAmount: number; // [OBS] 100 (only used when freeShipping === true)
  codDeliveryCharge: number; // [OBS] 7.99
  codFreeDeliveryThreshold: number; // [OBS] 50
  shippingClass: number; // [OBS] 1  (GET /shippings is an empty list)
  taxClass: number; // [OBS] 1      (GET /taxes is an empty list)
  minimumOrderAmount: number; // [OBS] 0
  enableB2B: boolean; // [OBS] true
  minB2BOrderAmount: number; // [OBS] 500
  deliveryTime: Array<{ _id: ObjectIdString; title: string; description: string }>; // [OBS] 5 slots; NOT sent by guest checkout
  currencyToWalletRatio: number;
  signupPoints: number;
  isUnderMaintenance: boolean;
  contactDetails: {
    contact: string;
    website: string;
    emailAddress: string;
    location: { city: string; state: string; country: string; zip: string; formattedAddress: string; street_address: string; lat: number; lng: number };
    socials: Array<{ _id: ObjectIdString; icon: string; url: string }>;
  };
  seo: Record<string, string>;
  logo: ImageSet;
  [other: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

/** [OBS] Envelope of list endpoints (/products, /shops, /categories/for-type, /reviews ...). Both Laravel-style and page-style keys are present. */
export interface Paginated<T> {
  data: T[];
  results: T[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
  // Laravel-style extras (present on most lists, absent on /products list) [OBS]
  current_page?: number;
  per_page?: number;
  last_page?: number;
  total?: number;
  from?: number | null;
  to?: number | null;
  first_page_url?: string;
  last_page_url?: string;
  next_page_url?: string | null;
  prev_page_url?: string | null;
  path?: string;
  links?: unknown[];
}

/** [OBS] Internal / sensitive-for-public fields present on the PUBLIC product JSON today. See "Do not expose" in site-contract.md. */
export interface B2BPricing {
  enabled: boolean;
  price?: number;
  sale_price?: number;
  min_quantity: number;
  tier_prices: Array<{ min_quantity: number; price: number }>; // [INF] element shape from client code (tier.min_quantity, tier.price)
}

/** [OBS] Public product as returned by GET /products and GET /products/:slugOrId. */
export interface ApiProduct {
  _id: ObjectIdString;
  id: ObjectIdString;
  __v: number; // [OBS] Mongoose version key leaks
  name: string; // [OBS] UPPER-CASE in data
  slug: string;
  sku: string;
  description: string; // [OBS] HTML, HTML-entity-escaped opening "&lt;" with raw ">" (double-encoded oddity)
  product_details: string; // [OBS] same oddity
  product_type: ProductType;
  status: 'publish' | string; // [OBS] "publish"
  visibility: 'public' | string; // [OBS] "public" (the list query filter value is "visibility_public")
  price: number; // [OBS] GBP, major units, float
  sale_price: number | null;
  discount: boolean; // [OBS] flag; NOT a number. Semantics unclear (see risks)
  min_price: number | null;
  max_price: number | null;
  quantity: number; // [OBS] stock on hand (public!)
  sold_quantity: number; // [OBS] public
  in_stock: boolean;
  is_taxable: boolean; // [OBS] false for all 17 products
  unit: string; // [OBS] grams as string e.g. "500"
  width: string;
  height: string;
  length: string;
  is_digital: boolean;
  is_external: boolean;
  external_product_url: string;
  external_product_button_text: string;
  in_flash_sale: boolean;
  ratings: number;
  total_reviews: number;
  language: string;
  translated_languages: string[];
  image: ImageSet;
  gallery: ImageSet[];
  video: unknown[];
  tags: unknown[];
  categories: ApiCategory[]; // [OBS] on list: full objects with `type` as ObjectId string
  variations: unknown[];
  variation_options: unknown[];
  type: ApiType; // [OBS] populated on list
  type_slug: string; // [OBS] "bakery"
  b2b_pricing: B2BPricing; // [OBS] SHOULD NOT BE PUBLIC
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface ApiType {
  _id: ObjectIdString;
  id?: ObjectIdString;
  name: string; // [OBS] "Frozen Foods"
  slug: string; // [OBS] "bakery"  (only one type)
  icon: string;
  language: string;
  translated_languages: string[];
  settings: { _id: ObjectIdString; isHome: boolean; layoutType: string; productCard: string };
  promotional_sliders: Array<{ _id: ObjectIdString } & ImageSet>;
  banners: Array<{ _id: ObjectIdString; title: string; description: string; image: ImageSet }>;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  __v?: number;
}

export interface ApiCategory {
  _id: ObjectIdString;
  id?: ObjectIdString;
  name: string;
  slug: string;
  details: string;
  icon: string;
  parent: ObjectIdString | null;
  language: string;
  translated_languages: string[];
  type: ObjectIdString | ApiType; // [OBS] id string on product.categories, populated object on /categories/for-type
  image: ImageSet;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  __v?: number;
}

/* ------------------------------------------------------------------ */
/* Checkout                                                            */
/* ------------------------------------------------------------------ */

/** [OBS captured] Address object exactly as the site sends it (billing & shipping). `country` is always "" from the guest form. */
export interface OrderAddress {
  street_address: string; // [OBS] required, 5..200 chars (client yup)
  post_code: string; // [OBS] required
  city: string; // [OBS] required
  country: string; // [OBS] "" unless the optional map picker fills it
  location: { lat: number; lng: number } | null; // [OBS] null unless map picker used
  state?: string; // [INF] not sent by the form
}

/** [OBS captured] One line of `products` (used by BOTH /orders/checkout/verify and /orders). */
export interface OrderLineInput {
  product_id: ObjectIdString;
  variation_option_id?: string; // [OBS in code] only when a variation is chosen; never for the current simple products
  order_quantity: number;
  unit_price: number; // client-computed: sale_price || price
  subtotal: number; // unit_price * order_quantity (client-computed)
}

/** POST /orders/checkout/verify  [OBS captured request body shape; request was ABORTED, never sent]. */
export interface VerifyCheckoutRequest {
  amount: number; // cart subtotal (sum of unit_price*qty)
  products: OrderLineInput[];
  billing_address: OrderAddress;
  shipping_address: OrderAddress;
}

/** [INF from client code reads; real response NOT observed because the call was aborted] */
export interface VerifyCheckoutResponse {
  total_tax: number;
  shipping_charge: number;
  unavailable_products: ObjectIdString[]; // product ids; UI strikes these lines and drops them from the order
  errors?: Array<{ message: string }>; // UI shows errors[0].message when present
  [other: string]: unknown;
}

/** POST /orders  [OBS captured request body shape (values redacted), request was ABORTED, never sent]. */
export interface CreateOrderRequest {
  products: OrderLineInput[];
  amount: number; // sub-total of available lines
  coupon_id: number | null; // [OBS] always null for guests: Number(undefined) = NaN -> JSON null
  discount: number; // [OBS] 0 (no coupon UI)
  paid_total: number; // amount + sales_tax + shipping_charge - discount
  sales_tax: number; // from verify.total_tax
  delivery_fee: number; // from verify.shipping_charge (0 if settings.freeShipping && amount >= freeShippingAmount)
  total: number; // same value as paid_total
  delivery_method: DeliveryMethod | LegacyDeliveryMethod;
  store_id: string | null; // [OBS] null
  pickup_location: unknown | null; // [OBS] null
  customer_contact: string; // [OBS] E.164-ish with "+", e.g. "+447700900123"
  customer_name: string; // [OBS] `${first_name} ${last_name}` computed client-side
  first_name: string;
  last_name: string;
  customer_email: string;
  note: string; // free text order note ("" if none)
  payment_gateway: PaymentGateway; // 'STRIPE' for card
  payment_sub_gateway: string; // [OBS] "" (only used for PAYMONGO)
  use_wallet_points: boolean; // [OBS] false
  isFullWalletPayment: boolean; // [OBS] false  (camelCase! mixed naming)
  billing_address: OrderAddress;
  shipping_address: OrderAddress;
  language: string; // [OBS] "en"
  invoice_translated_text: {
    subtotal: string;
    discount: string;
    tax: string;
    delivery_fee: string;
    total: string;
    products: string;
    quantity: string;
    invoice_no: string;
    date: string;
  };
  // NOTE [OBS]: no `delivery_time`, no `token`, no `payment_intent`, no shop/customer id for guests.
}

/**
 * Response of POST /orders. [INF] from the client's onSuccess destructuring
 * ({ tracking_number, payment_gateway, payment_intent, checkout_url }); the real response was never observed.
 * Shape of the rest is the Order below.
 */
export interface CreateOrderResponse extends Partial<Order> {
  tracking_number: string;
  payment_gateway: PaymentGateway | string;
  /** [INF] Stripe-hosted Checkout URL. For STRIPE the site does window.location.href = checkout_url. */
  checkout_url?: string;
  /** [INF] used by non-Stripe gateways; { payment_intent_info: { is_redirect, redirect_url, client_secret?, ... } } */
  payment_intent?: { payment_gateway?: string; payment_intent_info?: { is_redirect?: boolean; redirect_url?: string; [k: string]: unknown } };
}

/** [INF] Order as read by the storefront (field names read from the order-detail UI code; GET /orders/tracking/:tn). */
export interface Order {
  _id?: ObjectIdString;
  id?: ObjectIdString;
  tracking_number: string; // numbering scheme UNKNOWN (no order was created)
  created_at?: IsoDateString; // [OBS in code] snake_case here, unlike camelCase createdAt on catalogue docs
  customer_name: string;
  customer_contact?: string;
  customer_email?: string;
  amount: number;
  discount: number;
  sales_tax: number;
  delivery_fee: number;
  paid_total: number;
  total: number;
  delivery_method?: string;
  delivery_time?: unknown;
  note?: string;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  payment_gateway: PaymentGateway | string;
  payment_intent?: unknown;
  billing_address: OrderAddress;
  shipping_address: OrderAddress;
  products: Array<{ product_id?: ObjectIdString; name?: string; order_quantity?: number; unit_price?: number; subtotal?: number; pivot?: unknown; [k: string]: unknown }>;
  children?: unknown[]; // sub-orders (multi-vendor template heritage)
  refund?: unknown;
  language?: string;
}

/** POST /orders/payment  [OBS in code: called from /orders/:tn/thank-you after returning from the gateway]. Response shape unknown. */
export interface ConfirmPaymentRequest {
  tracking_number: string;
  payment_gateway: string; // lower-case, e.g. "stripe"
}

/** GET /payment-intent?tracking_number=&payment_gateway=&recall_gateway=  [OBS in code]. Unauthenticated bogus tn -> 404 {code,message}. */
export interface PaymentIntentQuery {
  tracking_number: string;
  payment_gateway?: string;
  recall_gateway?: boolean;
}

/** DELETE /orders/delete_temp_order/:order_id  body {email?}  [OBS in code: used when user returns from Stripe via cancel URL]. */
export interface DeleteTempOrderRequest {
  email?: string;
}

/** [OBS] Error body of every endpoint probed. */
export interface ApiError {
  code: number;
  message: string; // e.g. "Please authenticate", "Order not found", "Not found", "Shop not found"
}

/** [OBS in code] POST /coupons/verify exists in the client; never called from any UI. Request/response shape UNKNOWN. */
export interface VerifyCouponRequest {
  code: string; // [INF]
  sub_total?: number; // [INF]
}
