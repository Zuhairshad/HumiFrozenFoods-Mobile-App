# Humi's mobile API — contract v1

Single source of truth for `api/` (server) and `src/lib/api/` (app). If code and this file disagree, fix one of them in the same change.
Status tags: **FIXED** = decided here, implement exactly. **CONFIG** = value comes from env/config, never hard-coded. **UNVERIFIED** = depends on the owner's real database/Stripe setup; isolated behind one module so it can change without touching callers.

## 0. Principles
1. **The server is the only price authority.** Clients send product ids + quantities (+ promo code); the server recomputes from the database. Client totals are never trusted, never stored.
2. **Money is integer pence on the wire** (`...Pence`). The existing site database stores GBP floats; conversion happens only in `api/src/orders/site-order-mapper.ts` and `api/src/catalog/product-mapper.ts` via `lib/money.ts` (round half away from zero at the pence).
3. **Public by whitelist.** Product JSON from the DB is never passed through. Never exposed: `b2b_pricing`, `quantity`, `sold_quantity`, `sku`, `__v`, `status`, `visibility`, embedded `type` documents, seller/shop data. Stock is exposed only as `inStock` and `lowStock`.
4. **Never modify the owner's existing collections' structure.** The API does not create indexes on `orders` or `products`. It only manages its own collections: `webhook_events`, `app_idempotency`, `app_enquiries`. It inserts into `orders` (new documents only) and updates only documents it created itself (`app_meta.source === "mobile-app"`). It never deletes from `orders`.
5. **Guest identity** = HMAC guest token bound to one order id (`Authorization: Bearer <token>`), issued when the order is created or looked up by order number + contact.
6. All routes are under `/v1`. JSON only (except the Stripe webhook which reads the raw body). Errors use one envelope.

## 1. Error envelope (FIXED)
```json
{ "error": { "code": "validation_failed", "message": "Human readable", "requestId": "…", "details": [{ "path": "contact.email", "message": "Enter a valid email" }] } }
```
`details` is optional. On `validation_failed` it is an array of `{ path, message }` (dotted path into the request body, e.g. `lines.0.quantity`); on business-rule errors (422) it is an object with specifics. Clients must treat `details` as optional and display only `message` when they cannot interpret it. Codes: `validation_failed` 400 (also bad slot dates and bad `Idempotency-Key`), `unsafe_input`/`invalid_json`/`invalid_id`/`invalid_cursor` 400, `unauthorized`/`invalid_token` 401, `forbidden` 403 (`wrong_order` when a valid token is for another order, `origin_not_allowed` for browser origins), `not_found` 404, `method_not_allowed` 405, `conflict` 409 (`checkout_expired`, `order_number_unavailable`), `idempotency_key_reuse` 409, **422 business-rule errors (below)**, `payload_too_large` 413, `unsupported_media_type` 415, `rate_limited` 429 (+ `Retry-After`), `payment_provider_error` 502 (503 when payments are not configured), `request_timeout` 504, `internal_error` 500. 422 is emitted ONLY by `POST /v1/checkout/payment-intent`, and always with the specific business code as `error.code` (there is no `details.reason`): `unavailable` (`details: { unavailable: [{ productId, reason: 'not_found'|'out_of_stock'|'unpublished' }] }`; stock problems are reported this way, `out_of_stock` is never an `error.code`), `invalid_promo` (`details: { code }`), `min_order` (`details: { minOrderPence, totalPence }`, compared with the payable total including delivery and after discount), and the generic `unprocessable` (empty basket, or total under the 30p card minimum; the latter carries `details: { totalPence }`). `POST /v1/checkout/quote` never returns 422. Never include stack traces or internals. (Implementation: `api/src/lib/errors.ts` `toEnvelope`.)

## 2. Shared shapes (FIXED)
```ts
type CollectionId = 'savory-snacks' | 'kebabs' | 'vegetable-samosas' | 'samosas' | 'other';

interface PublicProduct {
  id: string;                // the product SLUG (stable, URL-safe, unique). Used everywhere as productId.
  sourceId: string;          // Mongo ObjectId hex (informational; clients must not depend on it)
  name: string;
  description: string;       // plain text (HTML entities decoded, tags stripped)
  pricePence: number;        // sale_price if truthy else price
  compareAtPricePence: number | null; // price when sale_price < price AND discount shown, else null
  unit: string | null;
  image: { thumbnail: string; original: string } | null;
  gallery: string[];         // https URLs
  inStock: boolean;
  lowStock: boolean;         // true when 0 < stock <= LOW_STOCK_THRESHOLD (5); stock itself never exposed
  collection: CollectionId;  // derived by documented rules (api/src/catalog/collections.ts), see §3.1
  categories: { id: string; name: string; slug: string }[];
  rating: number;            // 0..5, one decimal
  reviewCount: number;
}

interface Pricing {
  subtotalPence: number; deliveryPence: number; discountPence: number; totalPence: number;
  currency: 'gbp'; promoCode: string | null; freeDeliveryRemainingPence: number;
}
interface PricedLine { productId: string; name: string; image: string | null; unitPricePence: number; quantity: number; lineTotalPence: number }
interface Contact { name: string; email: string; phone: string }
interface Address { line1: string; line2?: string; city: string; postcode: string }   // UK only; postcode normalised to "AB1 2CD"
interface Slot { date: string /* YYYY-MM-DD, today..+14d, not in the past */; window: 'morning' | 'afternoon' | 'evening' }
type OrderStatus = 'pending_payment' | 'placed' | 'preparing' | 'out-for-delivery' | 'delivered' | 'cancelled';
type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
interface Order {
  orderId: string;           // Mongo ObjectId hex of the order document
  orderNumber: string;       // = site `tracking_number`
  placedAt: string;          // ISO
  status: OrderStatus; paymentStatus: PaymentStatus;
  lines: PricedLine[]; pricing: Pricing; contact: Contact; address: Address; slot: Slot; notes?: string;
}
```
Limits: 1–20 per product, ≤ 30 lines, notes ≤ 300 chars, name ≤ 80, email ≤ 254, phone 7–20 chars `[0-9+() -]`, line1/line2/city ≤ 80, promo code ≤ 32 `[A-Za-z0-9_-]`. All strings trimmed; control characters rejected.

## 3. Endpoints

### 3.1 Catalogue (public, cacheable)
- `GET /v1/config` → `{ currency:'gbp', delivery:{ feePence:number, freeThresholdPence:number|null, minOrderPence:number }, promo:{ enabled:boolean }, payments:{ provider:'stripe', enabled:boolean }, lowStockThreshold:number, slotWindows:[{id,label,range}] }` — values from CONFIG; `Cache-Control: public, max-age=60`.
- `GET /v1/products?collection=&q=&limit=&cursor=` → `{ items: PublicProduct[], nextCursor: string|null }`. Only published products. `limit` 1–100 (default 50). `q` ≤ 60 chars, matched against name (case-insensitive, regex-escaped, never passed raw into a query operator). `Cache-Control: public, max-age=60, stale-while-revalidate=300`.
- `GET /v1/products/:idOrSlug` → `PublicProduct` (slug, or 24-hex ObjectId). 404 if unpublished.
- `GET /v1/collections` → `{ items:[{ id:CollectionId, title:string, productCount:number }] }`.
- Collection derivation (UNVERIFIED data quality): the live DB only has the category "Frozen Bakery". `collection` is therefore derived from the product name/slug by ordered keyword rules in `api/src/catalog/collections.ts` (e.g. `kebab|shami|tikki|chapli|seekh` → `kebabs`; `vegetable.*samosa` → `vegetable-samosas`; `samosa` → `samosas`; `spring roll|roti|punjabi` → `savory-snacks`; else `other`). A test asserts parity with the 17 bundled app products (`src/data/products.ts`) so app and API cannot drift. Config `COLLECTIONS_SOURCE=rules` only for now.

### 3.2 Checkout
- `POST /v1/checkout/quote` body `{ lines:[{productId,quantity}], promoCode?:string }` → `{ pricing:Pricing, lines:PricedLine[], unavailable:[{productId, reason:'not_found'|'out_of_stock'|'unpublished'}], promo?:{ code, valid:boolean, message?:string } }`. Never errors for unavailable lines (reports them); errors only for malformed input. Used for live cart totals. Rate limit: 60/min/IP.
- `POST /v1/checkout/payment-intent` (header **`Idempotency-Key`**: UUID v4, required) body `{ lines, promoCode?, contact:Contact, address:Address, slot:Slot, notes? }`.
  - Validates everything, **re-prices server-side**, rejects with 422 (`error.code` is `unavailable`, `invalid_promo`, `min_order` or `unprocessable`; see section 1) rather than silently dropping lines. Slot problems are 400 `validation_failed` with path `slot`.
  - Inserts the order (pending) in the site `orders` collection via the site-order-mapper, creates a Stripe PaymentIntent for `totalPence` (gbp, automatic payment methods, metadata `{orderId, orderNumber, source:"humi-mobile-app"}`, receipt_email), stores `payment_intent.id` on the order.
  - 201 → `{ orderId, orderNumber, guestToken, clientSecret, pricing:Pricing, lines:PricedLine[] }`.
  - Idempotency: same key + same canonical body → same stored response (200 replay with `Idempotent-Replay: true`, new `guestToken` re-issued); same key + different body → 409 `idempotency_key_reuse`. Keys expire after 24 h (own collection `app_idempotency`, TTL index).
  - Rate limit: 10/min/IP. 
  - If Stripe is not configured (`payments.enabled=false`) → 503 `payment_provider_error` with message "Payments are not configured" and **no order is created**.
- `GET /v1/orders/:orderId` (Bearer guest token for that order) → `Order`. Token for another order → 403. Missing/invalid/expired → 401. Never reveals whether an order id exists to an unauthenticated caller (401 either way).
- `POST /v1/orders/lookup` body `{ orderNumber, email?, phone? }` (one of email/phone required) → `{ orderId, guestToken }`; 404 `not_found` on any mismatch (identical response and timing class for "no such order" and "contact does not match"; contact comparison is normalised (email lower-cased, phone digits only) and constant-time). Rate limit: 5/min/IP **and** 10/hour per orderNumber. 

### 3.3 Stripe webhook
- `POST /v1/webhooks/stripe` — raw body, header `Stripe-Signature` verified with `STRIPE_WEBHOOK_SECRET` (tolerance 300 s). Invalid/missing signature → 400, nothing processed. Dedupe by `event.id` in `webhook_events` (unique index) → duplicates return 200 with no side effects.
- Only acts on PaymentIntents whose `metadata.source === "humi-mobile-app"`; any other event/intent → 200, ignored (so the site's own Stripe traffic is never touched).
- `payment_intent.succeeded`: load order by `metadata.orderId`; verify `amount_received === order total`, `currency === 'gbp'`, intent id matches the stored one; if all true → `payment_status: "payment-success"` (and `order_status` := CONFIG `PAID_ORDER_STATUS`, default unchanged `"order-pending"`). On mismatch → do NOT mark paid, log `payment_amount_mismatch` at error level, respond 200.
- `payment_intent.payment_failed` → `payment_status: "payment-failed"` (order remains retryable; no `order-failed` unless intent is `canceled`).
- `payment_intent.canceled` → `order_status: "order-cancelled"`, `payment_status: "payment-failed"`.
- `charge.refunded` (full) → `payment_status: "payment-refunded"`, `order_status: "order-refunded"`.
- Transitions are monotonic: a late `payment_failed` can never overwrite `payment-success`; a paid order can only move to refunded.
- Response is always 200 for verified events (even ignored/unknown) so Stripe stops retrying; 5xx only for our transient failures (so Stripe retries).

### 3.4 Enquiries (forms)
- `POST /v1/enquiries` body `{ type:'contact'|'b2b'|'sales-rep', name, email, phone?, business?:{ name, type }, message, website?:string /* honeypot, must be empty */ }` → 202 `{ id }`. Stored in `app_enquiries` (`{type, fields, createdAt, ipHash, status:'new'}`; IP stored only as a salted hash). Honeypot filled → 202 but silently dropped. Rate limit: 5/hour/IP. No email is sent (needs the owner's provider); staff read the collection or a transport is added later (`EnquiryNotifier` port).

### 3.5 Ops
`GET /healthz`, `GET /readyz` exist. `GET /v1/version` → `{ api:'1', commit?:string }`.

## 4. Site-order mapping (UNVERIFIED — isolated in `api/src/orders/site-order-mapper.ts`)
Document inserted into `ORDERS_COLLECTION` (field names from the live checkout payload, docs/site-contract.md §3.3; money in GBP pounds as numbers = pence/100):
```
tracking_number, products:[{product_id:ObjectId, order_quantity, unit_price, subtotal, name, image}],
amount (=subtotal), sales_tax:0, delivery_fee, discount, paid_total (=total), total,
coupon_id:null, delivery_method:"shipping", store_id:null, pickup_location:null,
customer_contact, customer_name, first_name, last_name, customer_email, note,
payment_gateway:"STRIPE", payment_sub_gateway:"", use_wallet_points:false, isFullWalletPayment:false,
billing_address & shipping_address: { city, country:"", street_address, post_code, location:null },
language:"en",
order_status:"order-pending", payment_status:"payment-pending",
payment_intent:{ id, client_secret_redacted:true }, created_at, updated_at (Date),
app_meta:{ source:"mobile-app", slot:{date,window}, promo_code, idempotency_key_hash, app_version? }
```
- `street_address` = `line1[, line2]`. `note` = user notes + `\nDelivery: <date> <window>` so staff see the slot in the portal.
- `tracking_number`: `ORDER_NUMBER_DIGITS` (default 12) random decimal digits, `crypto.randomInt`, collision-checked against `orders.tracking_number` (up to 5 tries) — **UNVERIFIED** against the site's real scheme.
- `npm run verify:schema` (read-only) loads the newest non-app order from the DB and prints a key-by-key diff against what the mapper produces, plus type mismatches. Run it once the connection string exists, before enabling writes.
- Reverse mapping (site doc → `Order`): `order-pending`+`payment-pending` → `pending_payment`; `order-pending`+`payment-success` → `placed`; `order-processing`|`order-at-local-facility` → `preparing`; `order-out-for-delivery` → `out-for-delivery`; `order-completed` → `delivered`; `order-cancelled`|`order-failed`|`order-refunded` → `cancelled`. `payment-success`|`cash-on-delivery` → `paid`; `payment-pending`|`payment-processing`|`payment-awaiting-for-approval` → `pending`; `payment-failed` → `failed`; `payment-refunded`|`payment-reversal` → `refunded`.

## 5. CONFIG (env) — see `api/.env.example`
`MONGODB_URI`, `MONGODB_DB`, `ORDERS_COLLECTION` (orders), `PRODUCTS_COLLECTION` (products), `DELIVERY_FEE_PENCE` (default **799**), `FREE_DELIVERY_THRESHOLD_PENCE` (default **5000**, empty = never free), `MIN_ORDER_PENCE` (0), `PROMO_CODES` (JSON array, default `[]`, e.g. `[{"code":"HUMI15","kind":"percentage","value":15}]`; kinds `percentage|fixed|free_shipping`; optional `minSubtotalPence`, `expiresAt`), `PAID_ORDER_STATUS` (default `order-pending`), `ORDER_NUMBER_DIGITS` (12), `PENDING_ORDER_TTL_MINUTES` (120), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GUEST_TOKEN_KEYS`, plus the foundation vars. The defaults for delivery come from the live site settings (`codDeliveryCharge` 7.99 / `codFreeDeliveryThreshold` 50) and conflict with the homepage banner ("free over £25") — the owner must confirm; changing it is an env edit.

## 6. Pending-order hygiene
`npm run jobs:expire-pending`: finds orders with `app_meta.source === "mobile-app"`, `payment_status === "payment-pending"`, older than `PENDING_ORDER_TTL_MINUTES`; cancels the Stripe PaymentIntent (ignoring already-final states) and sets `order_status:"order-cancelled"`, `payment_status:"payment-failed"`. Never touches non-app orders; never deletes.

## 7. Client behaviour (app)
- Base URL `EXPO_PUBLIC_API_BASE_URL`. Unset → **demo mode** (local mock gateway, bundled catalogue, loudly labelled).
- Catalogue: bundled data is the offline fallback; live data overrides price/stock/name/images; bundled enrichment (weight, ingredients, readyInMins, tags) is merged by slug when the API lacks them.
- Cart totals shown = latest `/v1/checkout/quote`; the local estimate is only a placeholder while loading. Before presenting the PaymentSheet the client compares the quote total to the payment-intent response total and aborts if they differ.
- The client never marks an order paid; it polls `GET /v1/orders/:id` (3 s × 10) after PaymentSheet success.
