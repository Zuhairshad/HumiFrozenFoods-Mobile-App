# Humi's Frozen Foods - site/API contract (read-only research)

Date of research: 2026-10-24. Target: https://humisfrozenfoods.com (Next.js pages router) and https://api.humisfrozenfoods.com/api.
Companion types: `docs/site-contract.types.ts`.

Evidence legend
- **OBSERVED** = seen in a live GET response, a captured (then aborted) request, or literal code in the site's served JS bundles.
- **INFERRED** = deduced from code or analogy. Not seen on the wire.

Safety record: every non-GET request to the API was aborted client-side by Playwright route handlers before leaving the browser (3 attempts total: `POST /orders/checkout/verify`, `POST /orders`, plus Google Analytics beacons). No order, payment, account, newsletter or coupon call reached the server. No token/cookie value was recorded. Total API requests: about 110.

---

## 0. Big picture

- OBSERVED: the stack is the "Pickbazar" (Redq) Next.js storefront talking to a Node/Express/Mongoose re-implementation of the Pickbazar Laravel API. Evidence: route names (`/orders/checkout/verify`, `/categories/for-type`, `PICKBAZAR_ERROR.NOT_AUTHORIZED` string in the client), Mongoose `__v`, `_id` plus virtual `id`, Laravel-style pagination keys next to `results/page/limit/totalPages/totalResults`.
- OBSERVED: the cart lives only in the browser (`localStorage` key `pick-cart`). Prices in the cart are computed client-side and the client sends `unit_price` and `subtotal` to the server. Checkout form state is in `localStorage` key `pickbazar-checkout`, and the guest checkout page RESETS that state on every mount.
- OBSERVED: **there is no guest token.** Every request carries `Authorization: Bearer ` with an EMPTY token for guests (confirmed: header present, value equals "Bearer "). The token comes from a cookie that only exists after login. Guest checkout is simply an unauthenticated `POST /orders`. Cookie/localStorage NAMES seen: `next-auth.csrf-token`, `next-auth.callback-url` (cookies), `pick-cart`, `pickbazar-checkout` (localStorage). No auth cookie for guests.
- OBSERVED: `/checkout` (logged-in) shows a login form; `/checkout/guest` is the guest page and is gated on `settings.options.guestCheckout === true` (currently true).

---

## 1. Endpoint inventory

Base: `https://api.humisfrozenfoods.com/api`. Errors are `{ "code": number, "message": string }` (OBSERVED: 401 "Please authenticate", 404 "Order not found" / "Not found" / "Shop not found").

"Probed" = I issued the GET. "Code" = found in the JS bundle (`F.P` endpoint table, module 95439, and the API client, module 57659) but not called.

| Method + path | Auth | Status | Purpose / notes |
|---|---|---|---|
| GET `/settings?language=en` | none | OBSERVED 200 | Site options, payment gateways, shipping/free-delivery numbers (section 4). Fetched on every page. |
| GET `/types?limit=15&language=en` | none | OBSERVED 200 | Array (not paginated) of types. Exactly one: slug `bakery`, name "Frozen Foods". |
| GET `/types/slug/bakery?language=en` | none | OBSERVED 200 | Single type. |
| GET `/categories/for-type?limit=1000&language=en&parent=null&search=type.slug:bakery` | none | OBSERVED 200 | Paginated; 8 categories (only "Frozen Bakery" holds real products; the others look like template seed data with lorem text). |
| GET `/products?with=type;author&limit=30&language=en&search=type.slug:bakery;status:publish;visibility:visibility_public` | none | OBSERVED 200 | Paginated list (17 products). `search` is Pickbazar's `key:value;key:value` syntax. Unfiltered `GET /products?limit=100` also returned the same 17 (all `publish`/`public`). |
| GET `/products/:slug` (also by `_id`) with optional `?with=categories;shop;type;variations;variations.attribute.values;variation_options;tags` | none | OBSERVED 200 | Single product. Both slug and ObjectId resolve. `shop` is absent (single-vendor in practice). |
| GET `/popular-products?limit=` | none | OBSERVED 200 | Plain array of products. |
| GET `/best-selling-products` | - | OBSERVED 404 | Not implemented. |
| GET `/flash-sales` | none | OBSERVED 200 | Empty page. |
| GET `/tags?limit=` | none | OBSERVED 200 | Seed-data tags. |
| GET `/reviews?product=:id&limit=5&page=1` | none | OBSERVED 200 | Empty. POST `/reviews` exists in code. |
| GET `/shops?search=is_active:1&limit=100&is_active=true` | none | OBSERVED 200 | **Leaks other sellers' email/phone/user ids publicly** (see section 9). Used by the delivery-method component only to build legacy "pickup location" lists. |
| GET `/store-notices`, `/faqs`, `/terms-and-conditions`, `/refunds/policies` | none | OBSERVED 200 | CMS-like content; HTML in `description` fields. |
| GET `/shippings` | none | OBSERVED 200 | **Empty list.** No shipping-class rows exist. |
| GET `/taxes` | none | OBSERVED 200 | **Empty array.** No tax-class rows exist. |
| GET `/coupons` | required | OBSERVED 401 | Coupon list is NOT public. |
| POST `/coupons/verify` | ? | Code only | Client method `coupons.verify` exists; no UI calls it. Not exercised (non-GET). |
| POST `/orders/checkout/verify` | none (guest ok) | OBSERVED request shape (aborted) | Computes tax + shipping + availability. Body: `VerifyCheckoutRequest`. Response shape INFERRED (section 3.2). Triggered by the "Check Availability" button. |
| POST `/orders` | none (guest ok) | OBSERVED request shape (aborted) | Creates the order. Body: `CreateOrderRequest` (section 3.3). |
| GET `/orders/tracking/:tracking_number?with=refund;reviews` | none | OBSERVED 404 for a fake number; INFERRED public for real ones | Order lookup by tracking number. The 404 was returned with an empty Bearer, so the endpoint is not auth-gated. |
| GET `/orders` | required | OBSERVED 401 | Customer order list. |
| POST `/orders/payment` | ? | Code only | Body `{tracking_number, payment_gateway(lowercase)}`. Called by `/orders/:tn/thank-you` on load. Likely verifies/settles payment status. |
| GET `/payment-intent?tracking_number=&payment_gateway=&recall_gateway=` | ? | OBSERVED 404 for fake tn | For non-redirect gateways, returns `payment_intent_info`. Not used for Stripe redirect. |
| DELETE `/orders/delete_temp_order/:order_id` body `{email?}` | ? | Code only | Called when returning from Stripe via cancel URL (`/checkout/guest?cancelled_order_id=<id>&email=<email>`). Implies an order exists BEFORE payment is completed and is deleted on cancel. |
| GET/POST `/refunds`, `/refund-reasons`, `/downloads`, `/cards`, `/wishlists`, `/address`, `/newsletters`, `/contact-us`, `/auth/*`, `/send-otp-code`, `/verify-otp-code`, `/otp-login`, `/social-login-token`, `/became-seller`, `/sale-rep-applications` | various | Code only | Not needed for guest checkout. NEVER call POSTs from research. |

Query/pagination conventions (OBSERVED): `limit`, `page`, `language`, `with=a;b`, `search=key:value;key:value`, nested keys like `type.slug:bakery`, `orderBy`/`sortBy` (code). Product list envelope: `{results, data, page, limit, totalPages, totalResults}`.

Static assets are served from `https://api.humisfrozenfoods.com/uploads/...` (both `http://` and `https://` URLs appear in data; normalise to https in the app).

---

## 2. Catalogue shapes (OBSERVED)

- ObjectId strings in `_id` and `id`; timestamps `createdAt`/`updatedAt` ISO strings, `__v` leaks. Field naming is MIXED: product fields snake_case (`product_type`, `sale_price`, `is_taxable`, `in_stock`), timestamps camelCase on catalogue docs, `type_slug` extra. Order timestamps are `created_at` (INFERRED from UI code).
- 17 products, all `product_type: "simple"`, `status: "publish"`, `visibility: "public"`, `is_taxable: false`, `is_digital: false`, no variations. Prices (GBP major units, floats): 5.99 to 14.00. Example: "PUNJABI SAMOSA ROTI" `price 5.99`, `sale_price 5.98`, `discount false` (the `discount` field is a boolean flag, not an amount).
- `unit` is a grams string such as "500".
- `description` and `product_details` are HTML, but the leading `<` is entity-escaped (`&lt;h2>`) while `>` is raw: double-encoding oddity; the app must decode `&lt;`/`&amp;` before sanitising.
- Cart item (localStorage) shape OBSERVED: `{id, name, slug, unit, is_digital, image(thumbnail url), stock, price, language, in_flash_sale, min_quantity, is_b2b_price, b2b_pricing, quantity, itemTotal}`.

---

## 3. Checkout flow (guest, card)

### 3.1 UI walk (OBSERVED)

1. Product page: promo/newsletter popup appears after about 1 s (blocks clicks; press Escape). "Add To Shopping Cart" writes `pick-cart`.
2. `/checkout/guest` renders six numbered sections: (1) Contact Number (phone input, stored with a leading `+`, e.g. `+447700900123`; typing `+44...` into the pre-seeded field mangles the number, so enter the national number only), (2) Name: First, Last, Email (all required), (3) Delivery Method, (4) Shipping Address, "Same As Above" checkbox, (5) Billing Address, (6) Order Note. Right panel: line items, Sub Total, "VAT: Calculated at checkout", "Estimated Shipping: Calculated at checkout", button **Check Availability**.
3. Address form fields: `street_address` (textarea, 5-200 chars), `post_code`, `city`, optional map "Location" (lat/lng; Google map + Nominatim reverse geocode). `country` is NOT collected (sent as `""`). Address state is auto-saved once all three required fields are non-empty.
4. Delivery methods offered (OBSERVED): "Local Shipping - Fast delivery within your area" (value `local_shipping`) and "Shipping - Standard shipping to your address" (value `shipping`). Selecting either only stores the value; no fee changes in the client. Code also contains `store_pickup`/`local_delivery` branches (with `store_id` and `pickup_location`) but the radio buttons for them are not rendered.
5. "Check Availability" posts `POST /orders/checkout/verify` (captured, aborted). On a real response the right panel switches to the verified view (`verified_response` stored in `pickbazar-checkout`): lines (unavailable ones flagged), Sub Total, VAT = `total_tax`, Shipping = `shipping_charge` (suffixed "(Free shipping)" only when `settings.freeShipping && freeShippingAmount <= subtotal`), Total, a "Choose Payment Method" grid and **Place Order**.
6. To see the verified view without calling the server I injected a SYNTHETIC `verified_response` `{total_tax: 0, shipping_charge: 7.99, unavailable_products: []}` into the in-memory state. The totals shown (VAT 0.00, shipping 7.99, total 14.99 on a 7.00 basket) are therefore my numbers, NOT server output. Only the UI behaviour is evidence.
7. Payment options rendered (OBSERVED): two buttons: **Stripe** (logo) and **Cash**. The settings list `stripe` and `cod` gateways, but `cod` has no matching UI entry. Default selection is the settings default (`STRIPE`). A banner reads "£7.99 delivery charge applies to this order. Add £X more for FREE home delivery (orders over £50.00)" and switches to "You qualify for FREE Home Delivery! Your order is over £50.00" once subtotal >= 50. The banner reads `codDeliveryCharge` (7.99) and `codFreeDeliveryThreshold` (50) from settings.
8. **Place Order** posts `POST /orders` (captured, aborted). Client-side guards: email required; delivery method required; gateway required. The button also stays disabled until phone, names, email, both addresses, delivery method and non-empty cart lines are all present.

### 3.2 `POST /orders/checkout/verify` (OBSERVED request, INFERRED response)

Request keys (typed; values redacted): see `VerifyCheckoutRequest` in the types file. Headers sent (NAMES only): accept, authorization, content-type, origin, referer, user-agent, sec-ch-ua*.

Response (INFERRED from the client code that reads it): `{ total_tax:number, shipping_charge:number, unavailable_products: string[] , errors?: [{message}] }`, possibly more (wallet fields). The real values were never seen because the call was aborted.

### 3.3 `POST /orders` (OBSERVED request, typed with values redacted)

```jsonc
{
  "products": [{ "product_id": "string(ObjectId)", "order_quantity": "number", "unit_price": "number", "subtotal": "number" }],
  "amount": "number",
  "coupon_id": null,                // Number(undefined) -> NaN -> JSON null
  "discount": "number",             // 0
  "paid_total": "number",
  "sales_tax": "number",
  "delivery_fee": "number",
  "total": "number",                // equals paid_total
  "delivery_method": "string",      // "shipping" | "local_shipping"
  "store_id": null,
  "pickup_location": null,
  "customer_contact": "string",
  "customer_name": "string",        // `${first_name} ${last_name}`
  "first_name": "string",
  "last_name": "string",
  "customer_email": "string",
  "note": "string",
  "payment_gateway": "string",      // "STRIPE"
  "payment_sub_gateway": "string",  // ""
  "use_wallet_points": "boolean",   // false
  "isFullWalletPayment": "boolean", // false
  "billing_address":  { "city": "s", "country": "s", "street_address": "s", "post_code": "s", "location": null },
  "shipping_address": { "same keys" },
  "language": "string",             // "en"
  "invoice_translated_text": { "subtotal": "s", "discount": "s", "tax": "s", "delivery_fee": "s", "total": "s", "products": "s", "quantity": "s", "invoice_no": "s", "date": "s" }
}
```

Observations about the payload (all OBSERVED in code or capture):
- No `delivery_time`, no `token`, no customer/user id, no `payment_intent`. Guest = unauthenticated request.
- `invoice_translated_text` carries localized labels (the server presumably builds an invoice/email with them).
- `paid_total = amount + sales_tax + shipping_charge - discount` (code `calculatePaidTotal`). `delivery_fee` is zeroed when `settings.freeShipping && amount >= freeShippingAmount`, but `paid_total` is NOT reduced in that case (client inconsistency). Currently moot because `freeShipping` is false.
- Line items use `order_quantity`/`unit_price`/`subtotal`; variation lines add `variation_option_id`.
- Client sends prices. Whether the server recomputes from the DB is UNKNOWN (top risk).

### 3.4 Create-order response (INFERRED)

The client reads `{ tracking_number, payment_gateway, payment_intent, checkout_url }` from the response:
- if `payment_gateway === "STRIPE"` and `checkout_url` is set: `window.location.href = checkout_url` (hosted redirect);
- else if gateway is `CASH_ON_DELIVERY`, `CASH`, `FULL_WALLET_PAYMENT`: go to `/orders/:tracking_number`;
- else if `payment_intent.payment_intent_info.is_redirect`: go to its `redirect_url`;
- else go to `/orders/:tracking_number/payment` (opens an in-page payment modal).
The remainder of the body is presumably the order document.

---

## 4. Pricing, shipping, tax, coupons

| Rule | Evidence |
|---|---|
| Currency GBP, 2 fractions, locale en-GB | OBSERVED settings |
| Unit price in cart = `sale_price` if truthy else `price` (B2B mode swaps to `b2b_pricing`) | OBSERVED bundle code (`getPrice`). Note a product with `price 5.99` / `sale_price 5.98` / `discount:false` sells at 5.98. |
| Subtotal = sum(quantity x price) | OBSERVED code |
| Shipping fee amount | settings `codDeliveryCharge = 7.99` and banner text "£7.99 delivery charge applies" (OBSERVED). The actual `shipping_charge` returned by verify was NOT observed. INFERRED rule: 7.99 when subtotal < 50, else 0. |
| Free delivery threshold | `codFreeDeliveryThreshold = 50` drives the banner (OBSERVED). `freeShipping:false`, `freeShippingAmount:100` is a separate generic mechanism and currently OFF (OBSERVED). Whether the server honours 50 is UNKNOWN. |
| Fee depends on delivery method? | Client sends the same fee for `shipping` and `local_shipping` (no client-side difference). Server behaviour UNKNOWN. The banner is labelled "home delivery" regardless of method. |
| Tax / VAT | All 17 products `is_taxable:false`; `/taxes` is `[]`; `taxClass:1`. INFERRED: VAT = 0 today. Server value in `total_tax` UNOBSERVED. |
| Minimum order | `minimumOrderAmount: 0` (OBSERVED). B2B minimum 500 (`minB2BOrderAmount`), B2B is a separate mode (header "B2B" button; `b2b_pricing.min_quantity` 9) and out of scope for the consumer app. |
| Coupons | `enableCoupons: true` but **no coupon input exists in the guest checkout UI or loaded bundles**; `coupon_id` is always null (OBSERVED). `GET /coupons` is 401 (not public). `POST /coupons/verify` exists in the client but was not callable under the safety rules, so **I could not determine whether HUMI15 (or any code) exists or what verify returns**. Coupon types known from code: `fixed`, `percentage`, `free_shipping` (percentage discount = subtotal x amount / 100; free_shipping discount = shipping charge; fixed = amount). |
| Stock | `quantity` is public; cart caps quantity at `stock`; `unavailable_products` from verify removes lines. |
| Delivery slots | `settings.deliveryTime` lists 5 slots but the guest flow never sends `delivery_time`. |

---

## 5. Status enums (OBSERVED in bundle)

- `order_status`: `order-pending`, `order-processing`, `order-completed`, `order-cancelled`, `order-refunded`, `order-failed`, `order-at-local-facility`, `order-out-for-delivery`. The tracker UI shows Pending, Processing, At Local Facility, Out For Delivery, Completed (terminal alternatives Cancelled, Refunded, Failed).
- `payment_status`: `payment-pending`, `payment-processing`, `payment-success`, `payment-failed`, `payment-reversal`, `payment-refunded`, `cash-on-delivery`, `payment-awaiting-for-approval`.
- `payment_gateway` values: `STRIPE`, `CASH`, `CASH_ON_DELIVERY`, `FULL_WALLET_PAYMENT`, plus PayPal/Mollie/etc. enum entries (unused). Note UPPER-case in orders vs lower-case `stripe` in settings and in `POST /orders/payment`.
- Tracker logic (OBSERVED): payment statuses `payment-success` and `cash-on-delivery` are treated as "paid" for progress display.

---

## 6. Stripe flow

OBSERVED: no Stripe.js, PaymentElement, CardElement or publishable key appears in any loaded bundle. The only Stripe-specific client code is the redirect on `checkout_url`.

INFERRED flow (Stripe-hosted Checkout):
1. `POST /orders` with `payment_gateway:"STRIPE"` creates the order (status presumably `order-pending` / `payment-pending`) AND a Stripe Checkout Session server-side; response contains `checkout_url`.
2. Browser redirects to `checkout_url`.
3. Success return URL: `/orders/success?session_id=<stripe session id>`. That page only clears the cart (`resetCart`) (OBSERVED code). The page `/orders/:tracking_number/thank-you` calls `POST /orders/payment {tracking_number, payment_gateway:"stripe"}` on load, which probably re-checks the session and updates `payment_status` (INFERRED).
4. Cancel return URL: `/checkout/guest?cancelled_order_id=<orderId>&email=<email>`, which triggers `DELETE /orders/delete_temp_order/:orderId` (OBSERVED code). So an unpaid Stripe order is a real DB row until cancelled/deleted.
5. A Stripe webhook almost certainly exists server-side as the reliable settlement path, but nothing client-visible mentions it. UNKNOWN.

Implication for the mobile app: reproduce with Stripe Checkout (open `checkout_url` in an in-app browser / `expo-web-browser`, return via deep link) or use the same server-created Checkout Session; a PaymentSheet flow would require a new PaymentIntent path that the admin portal may not understand.

---

## 7. Guest identity

OBSERVED: none. No guest-token endpoint, no cookie. Guests send `Authorization: Bearer ` (empty). Identity of an order = `customer_email` + `customer_contact` + `customer_name` fields and the `tracking_number`. Order lookup `GET /orders/tracking/:tn` is unauthenticated, so the tracking number acts as a bearer secret.

---

## 8. Do NOT expose publicly (fields found on the public product / shop JSON today)

Product (`GET /products*`, `/popular-products`):
- `b2b_pricing` (whole object: `enabled`, `price`, `sale_price`, `min_quantity`, `tier_prices`), currently visible to anyone; wholesale prices (e.g. 3.50 vs retail 7.00) are exposed.
- `quantity` and `sold_quantity` (exact stock and sales volume).
- `sku`, `__v`, `status`/`visibility` internals, `createdAt`/`updatedAt` (low risk but unnecessary).
- Embedded `type` documents with `promotional_sliders`/`banners` on every product (bloat, seed placeholders).
Other:
- `GET /shops` exposes other sellers' `email`, `phone`, `user` (user ObjectId), `staffs` (user ids), `balance` (`admin_commission_rate`, `total_earnings`, `withdrawn_amount`, `current_balance`). The new backend must not republish these, and the owner should consider locking the endpoint.
- Settings expose business contact details by design (fine) but also internal `_id`s.

Mobile BFF recommendation: whitelist `id, slug, name, description(decoded), price, sale_price, unit, image, gallery, in_stock, is_taxable, categories[{id,name,slug}]`, and a coarse `low_stock` flag instead of `quantity`.

---

## 9. Mongo document shapes (INFERRED from API output)

- `_id`: ObjectId (24 hex), `id` virtual duplicates it. IDs embed creation time (first 4 bytes), e.g. `6985bc5e...` for Feb 2026.
- Naming: snake_case business fields (`product_type`, `sale_price`, `is_taxable`, `b2b_pricing`, `customer_email`), camelCase for Mongoose timestamps (`createdAt`, `updatedAt`), camelCase in settings (`codDeliveryCharge`, `useCashOnDelivery`) and a stray camelCase in the order payload (`isFullWalletPayment`). Orders appear to expose `created_at` (snake) rather than `createdAt`: confirm in the DB.
- Money: JS numbers (floats) in major units (GBP pounds), not pence.
- `tracking_number`: format UNKNOWN (no order created; fake lookups 404). Upstream Pickbazar uses a random 12-digit-ish string; do not assume.
- Orders embed `products[]`, `billing_address`, `shipping_address`, and probably `children[]` (sub-orders, multi-vendor heritage) and `payment_intent` blob.

---

## 10. Unknowns and risks (ranked)

1. **Server-side price authority.** Client sends `unit_price`/`subtotal`/`amount`/`paid_total`. Unknown if the API recomputes. The new backend MUST recompute from the DB product price (`sale_price || price`), shipping and tax, and ignore client totals; the admin portal will display whatever is stored.
2. **Real verify response** (`shipping_charge`, `total_tax`, free-delivery cut-off at 50 vs 100, per delivery_method behaviour) was never observed because the POST was aborted. Needs the owner (or the server code) to confirm.
3. **Order document schema and numbering** (tracking_number generation, which fields the admin portal reads: `order_status`, `payment_status`, `payment_intent`, `children`, `shop_id`, invoice fields), plus indexes. Only admin-portal/server code reveals this.
4. **Stripe specifics**: Checkout vs PaymentIntent, webhook endpoint and which events flip `payment_status`, whether the order row is created pre-payment (the `delete_temp_order` route says yes), statement of what the admin portal does with `payment-pending` orders, and the success/cancel URLs configured in the Session.
5. **Coupon system**: `HUMI15` unverifiable; `/coupons/verify` request/response and whether coupons are even live (no storefront UI).
6. **Public data exposure** (section 8): wholesale prices, stock counts, seller PII.
7. **Phone and country handling**: `country` is always `""`; phone is `+44...` form; the phone widget mangles a typed `+44`. Decide validation in the new app (UK-only?).
8. **Order lookup is unauthenticated** by tracking number; if tracking numbers are guessable, order PII leaks. The mobile app should not rely on it for anything beyond showing the user's own order.
9. **Product `discount` boolean** and a `sale_price` (5.98) just under `price` (5.99): data-quality oddity, confirm intended.
10. **Category/tag data are template seed** (lorem details, picsum images). Only "Frozen Bakery" has products; expect category UX cleanup.
11. Free-delivery inconsistency in client code (`delivery_fee` zeroed but `paid_total` not) if `freeShipping` is ever enabled.
12. B2B mode is a separate pricing/min-order path (min 500, min qty 9) that must not leak into the consumer app (cart items carry `is_b2b_price`).

---

## 11. Reproduction checklist for the new backend

1. Serve catalogue from the same MongoDB `products` collection but through a whitelisted projection (section 8).
2. `POST /orders` (guest): validate, recompute totals from DB, apply shipping/tax rules once confirmed, insert order with the SAME field names as above (snake_case order fields, `order_status: "order-pending"`, `payment_status: "payment-pending"`, `payment_gateway: "STRIPE"`), create Stripe Checkout Session, return `{tracking_number, payment_gateway, checkout_url, ...order}`.
3. Webhook updates `payment_status` to `payment-success` (and `order_status` to `order-processing`; confirm with owner what the portal expects) and handle cancel via delete/mark `order-cancelled` rather than leaving pending rows.
4. Keep `tracking_number` generation compatible with the existing scheme (needs the owner to supply it).
