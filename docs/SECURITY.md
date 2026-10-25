# Security notes

Status: written 2026-10-25 by the devops-docs pass. This is a working threat model for a small business, not an audit and not a compliance statement. Nothing here has been penetration tested. The API's own README says a human security review is required before taking real payments; that still applies.

File paths below are in this repo. Items marked *(planned)* are specified in `docs/api-contract.md` but were not present in the tree when this was written (no `orders` route, order repository or webhook route yet); verify before relying on them.

## 1. System and assets

Components: the Expo app (iOS, Android, optional web export), the Hono API in `api/` (intended for Vercel, Node runtime), MongoDB Atlas (shared with the existing website), Stripe, and the existing website plus its API at `api.humisfrozenfoods.com`.

Assets worth protecting, roughly by impact:

1. Customers' money and payment credentials. Card data never touches this repo: the app uses Stripe's PaymentSheet and the API only sees PaymentIntent ids and webhook events.
2. Customer personal data: name, email, phone, delivery address, order contents, enquiry messages.
3. Order integrity in the shared `orders` collection that staff fulfil from.
4. Price and stock integrity (what the server charges).
5. Secrets: MongoDB URI, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GUEST_TOKEN_KEYS`.
6. Availability of ordering.

## 2. Actors

- Anonymous internet user (any API caller, scripted or not).
- Guest customer holding a guest order token.
- Malicious customer (tampers with prices, quantities, promo codes, or tries to read other people's orders).
- Someone who obtains a leaked secret (git, logs, chat, screenshots).
- Compromised or careless website component sharing the database or Stripe account.
- Insider/admin with portal or Atlas access (out of scope here, but it matters: see residual risks).
- Stripe, Atlas and the hosting provider as trusted third parties.

## 3. Trust boundaries

1. App/device to API: untrusted client. Everything in the request is attacker-controlled, including prices and totals.
2. Internet to Stripe webhook endpoint: only Stripe's signature makes a request trusted.
3. API to MongoDB: the API holds a credential with the power to write to the live orders collection.
4. API to Stripe: the API holds the secret key.
5. The shared database and the shared Stripe account: other applications (the website and its admin portal, its webhook) read and write the same data.
6. Build pipeline (EAS, GitHub Actions) to the shipped app: `EXPO_PUBLIC_*` values cross this boundary into public code.

## 4. STRIDE-lite

| Threat | Example | Mitigation in this repo | Where | Residual |
|---|---|---|---|---|
| **S**poofing: access another customer's order | Guess an order id or number | Guest tokens are HMAC-SHA256 signed, bound to one order id, expiring, verified in constant time; every auth failure returns the same 401 so order existence is not revealed | `api/src/auth/guest-token.ts`, `api/src/auth/keyring.ts`, `api/src/middleware/guest-auth.ts` | Tokens are bearer credentials with no revocation list. Order lookup by number plus contact is *(planned)* and depends on the 12-digit number's unguessability and rate limits |
| Spoofing: fake Stripe webhook | POST a forged "payment succeeded" | Signature verified with `STRIPE_WEBHOOK_SECRET` on the raw body, 300 s tolerance, event de-duplication by id | `api/src/payments/stripe-event.ts`, `api/src/payments/stripe-gateway.ts`; unique index in `api/src/db/indexes.ts`. The webhook route itself is *(planned)* | Secret leakage defeats it. Rotate per RUNBOOK |
| Spoofing: fake client IP to evade limits | Send `X-Forwarded-For` | Forwarding headers ignored unless `TRUSTED_IP_HEADER` names one | `api/src/lib/client-ip.ts`, `api/src/middleware/client-ip.ts` | Misconfiguring `TRUSTED_IP_HEADER` on a host that does not overwrite it re-opens this |
| **T**ampering: client-supplied prices | Send `unitPrice: 1` | Contract: clients send product ids and quantities only; server recomputes from the database in integer pence; unknown fields rejected by strict schemas; client totals never stored | `api/src/services/pricing.ts`, `api/src/lib/money.ts`, `api/src/lib/validation.ts`, `api/src/routes/quote.ts` | The payment-intent route that re-checks the quote is *(planned)*; the app compares quote and payment-intent totals before presenting the sheet but that is a client-side convenience, not a control |
| Tampering: amount mismatch at payment | Pay less than the order total | Webhook marks paid only if `amount_received`, currency and intent id match the stored order, otherwise logs `payment_amount_mismatch` and does not mark paid | per `docs/api-contract.md` 3.3 *(planned)* | Needs staff attention to mismatches (RUNBOOK) |
| Tampering: NoSQL injection | `{"$ne":null}` in a body | Keys starting with `$`, containing `.` or `__proto__` are rejected before schema parsing; queries built only from typed values; search text regex-escaped | `api/src/lib/safe-object.ts`, `api/src/lib/validation.ts`, `api/src/catalog/sanitize.ts` | New routes must follow the same pattern; no automated check enforces it |
| Tampering: modify the website's orders | A bug or stolen DB credential updates any order | Code only updates documents it created (`app_meta.source`); DB role limited to specific actions per collection (SETUP A5) | Contract section 0.4; Atlas role | Atlas roles are per collection: the credential can still update every order. The restriction is code discipline plus credential secrecy |
| **R**epudiation: who did what | Disputed order or refund | Request id on every request and log line; access log with method, path, status, duration; webhook events stored | `api/src/middleware/request-id.ts`, `api/src/middleware/access-log.ts`, `api/src/lib/logger.ts` | No audit log of staff actions; logs are only as durable as the host's log retention |
| **I**nformation disclosure: product data | Leak wholesale price, stock | Product JSON is built from a whitelist, never passed through; stock exposed only as booleans | `api/src/catalog/product-mapper.ts` | Does not fix the website's own API (section 6) |
| Information disclosure: PII in logs | Email or address in a log | pino redaction of authorization, cookie, Stripe signature, token, card, email, phone, address keys to 4 levels; query strings never logged; `Secret` wrapper | `api/src/lib/logger.ts`, `api/src/lib/secret.ts` | Redaction is key-based; PII in free-text messages is not caught |
| Information disclosure: error leakage | Stack traces | 5xx responses are opaque; no stack ever returned | `api/src/lib/errors.ts` | Non-production adds the underlying message |
| Information disclosure: secrets in the app | Stripe secret in bundle | `.env.example` states `EXPO_PUBLIC_*` is public; only publishable key and API URL used; CI secret scan heuristic | `.env.example`, `.github/workflows/ci.yml` | Heuristic only; a developer can still paste a secret into an `EXPO_PUBLIC_` variable |
| Information disclosure: enquiry data | IP addresses stored | IP stored only as a salted hash | `api/src/enquiries/ip-hash.ts` | Message bodies contain whatever people type |
| **D**enial of service | Flood quote or order endpoints | Per-IP global limit and per-route limits, body size cap, timeout, strict schemas | `api/src/middleware/rate-limit.ts`, `body-limit.ts`, `timeout.ts` | **The rate-limit store is in memory and per instance**; on serverless the effective limit is multiplied and resets on cold start. No WAF or bot protection |
| DoS: stock/pending-order griefing | Create many unpaid orders | Idempotency keys; pending-order expiry job *(planned)* | per contract section 6 | Unpaid orders appear in the staff's real order list until expired |
| **E**levation of privilege | Browser page calls state-changing routes | Deny-by-default CORS with exact origins; cross-origin state changes rejected with 403; no cookies, bearer tokens only | `api/src/middleware/cors.ts` | No end-user accounts or admin roles exist; any admin function needs its own design |
| Elevation: dependency compromise | Malicious package update | Lock files, Dependabot weekly, CI `npm audit` (non-blocking) | `.github/dependabot.yml`, `.github/workflows/ci.yml` | Audit currently reports high advisories in transitive packages (SETUP appendix). No provenance checks; Actions pinned to major tags, not SHAs |
| Security headers | Clickjacking, sniffing | CSP `default-src 'none'`, HSTS, nosniff, frame deny, no-referrer, `Cache-Control: no-store` by default | `api/src/middleware/security-headers.ts` | API only; the web export's hosting must set its own headers |

## 5. Residual risks, stated plainly

1. **Rate limiting is not production-grade.** Per-instance memory only. Until a shared store (Redis/Upstash) or WAF rule is added, an attacker can exceed intended limits, including the order-lookup limits that protect against guessing order numbers.
2. **The database credential can modify the website's live orders.** Collection-level roles cannot be narrowed to our documents. Compromise of `MONGODB_URI` means compromise of order data.
3. **The order document shape is UNVERIFIED** against the website's real orders. A wrong mapping can break the admin portal or fulfilment. `verify:schema` mitigates this once run.
4. **Guest tokens cannot be revoked** individually. Only rotating `GUEST_TOKEN_KEYS` (RUNBOOK) invalidates them, and that invalidates all of them.
5. **Shared Stripe account.** The website's webhook receives our events. If it mishandles unknown intents the website, not the app, may misbehave. Unverified.
6. **Atlas network exposure.** Hosting without a static IP usually means the Atlas IP allow list is wide open to the internet; the database password and TLS are then the only barrier.
7. **No monitoring or alerting exists in code.** Outages and abuse will be noticed only if you set up uptime checks and Stripe/Atlas alerts.
8. **Order lookup and guest checkout are inherently weak authentication.** There are no accounts, no email verification, and no multi-factor step. Knowledge of an order number plus an email/phone is the only proof.
9. **App binaries can be inspected.** Anything in the app, including the API URL and publishable key, is public; the API must be safe against a hostile client (it is designed that way, but only tests and review can confirm it).
10. **Unreviewed.** No external review of payment flows has happened.

## 6. Issues found on the existing website API (owner action)

These come from the read-only research in `docs/site-contract.md` (2026-10-24). They concern `https://api.humisfrozenfoods.com/api`, which this repo does not control. They affect your customers and your business regardless of the app. Please pass them to whoever maintains the website.

| # | Finding | Why it matters | Suggested remediation |
|---|---|---|---|
| 1 | Public `GET /shops` returns other sellers' email, phone, user ids, staff ids and balance fields (commission, total earnings, withdrawn amount, current balance) | Personal data and financial data exposed to anyone, scrapeable | Require authentication, or return only public fields (name, slug, logo); if the site is single-vendor, disable the endpoint. Review what else the unauthenticated API returns |
| 2 | Public product JSON includes `b2b_pricing` (wholesale prices and tiers), exact `quantity`, `sold_quantity`, `sku` and internal fields | Competitors and retail customers can see wholesale prices, stock and sales volume | Serialise public products through a whitelist; serve B2B pricing only to authenticated B2B accounts |
| 3 | `POST /orders` accepts `unit_price`, `subtotal`, `amount`, `paid_total` from the client. It is **not verified** whether the server recomputes them | If it trusts them, a customer could underpay. This needs checking in the site's code, not by testing against production | Have the maintainer confirm in code that totals are recomputed from database prices on the server and the Stripe amount is derived from that; add a test. If not, fix before anything else on this list |
| 4 | `GET /orders/tracking/:tracking_number` is unauthenticated | The tracking number acts as a password for an order containing name, address, phone and email. Its randomness and format are unknown | Confirm numbers are long and unpredictable; add rate limiting; return reduced data for unauthenticated callers (status only) or require email/phone as a second factor |

Also worth checking while they are in there: the site's Stripe webhook handling of unrelated intents (SETUP B3), the `DELETE /orders/delete_temp_order/:id` route (what authorises it), and whether error responses leak internals.

## 7. What this repo does NOT protect against

- Flaws in the existing website, its admin portal, or its API (section 6). A customer can still use the website instead of the app.
- A compromised Atlas, Stripe, Vercel, Expo or GitHub account. Turn on multi-factor authentication on all of them; this repo cannot.
- A stolen or jailbroken phone, or malware on the device.
- Phishing of the owner or staff.
- Card testing/fraud at the payment level beyond what Stripe Radar provides.
- Sophisticated DDoS or bot traffic (no WAF in this repo).
- Data breaches at the database level if backups, access lists and credentials are mishandled.
- Business-logic abuse, for example promo code stacking, reselling, or ordering from addresses you do not deliver to, beyond the checks coded in the API.
- Legal compliance. Nothing here is a statement of GDPR, PCI DSS or any other compliance.

## 8. Pre-launch security review checklist

- [ ] **Dependency audit**: `npm audit --omit=dev` in root and `api/`; every high/critical either fixed or explained (SETUP appendix lists the current ones). Check Dependabot PRs are being handled.
- [ ] **Secrets**: rotate anything that has ever been pasted into chat, tickets or screenshots. Confirm no `.env` is tracked (`git ls-files | grep env`). Enable GitHub secret scanning and push protection in repository settings. Scan git history too, not just the current tree.
- [ ] **Penetration test or independent review** of: order creation, payment-intent creation, webhook handler, order lookup, guest token handling, idempotency, CORS, rate limits. Give the tester a test-mode environment.
- [ ] **Rate limiting** moved to a shared store or WAF, with a test showing the limit holds across instances.
- [ ] **Stripe Radar**: review default rules; consider requiring 3D Secure for risky payments, blocking when the CVC or postcode check fails, and velocity rules per email/IP. Set up Stripe email alerts for disputes and failed webhooks. **CHECK** current Radar options in your plan.
- [ ] **Stripe webhook**: confirm only the four events are enabled; confirm the website's webhook ignores unknown intents.
- [ ] **Atlas**: least-privilege user in use, IP access list reviewed, backups on, MFA on all Atlas users, audit/alerts enabled where the plan allows.
- [ ] **Website API issues** (section 6) triaged with the maintainer.
- [ ] **Logging**: test that real PII does not reach logs (place a test order and read the logs).
- [ ] **Mobile**: HTTPS only (no cleartext in production builds), no secrets in the bundle (`EXPO_PUBLIC_*` review), store listing privacy declarations accurate.
- [ ] **Privacy and data protection (UK/EU GDPR notes, not legal advice):**
  - Guest order data (name, email, phone, address, order contents) is personal data. You need a lawful basis (fulfilling the contract) and a privacy policy that names the app, what is collected, why, who receives it (Stripe, hosting, database provider) and for how long.
  - **Retention**: decide how long guest orders and enquiries are kept. Order records may need to be kept for accounting purposes (check with your accountant for the period); enquiries usually need much less. Nothing in this repo deletes orders; enquiries have no automatic expiry in the current index set. Decide and implement a policy (for example a TTL index on `app_enquiries`).
  - **Deletion path**: there is no self-service deletion. Define how a person asks (an email address in the policy) and how staff erase or anonymise: the `orders` document (subject to legal retention), `app_enquiries`, and `app_idempotency` (expires after 24 h).
  - **Enquiry data**: free-text messages may contain anything, including sensitive details. Keep access to `app_enquiries` limited, and do not forward them to unreviewed tools.
  - **IP addresses** are stored only as salted hashes for enquiries; the salt must stay secret.
  - Check what the host and Atlas log, which region data sits in, and whether you need data processing agreements (Stripe, Atlas and Vercel offer standard ones; **CHECK** current terms).
- [ ] **Incident readiness**: the RUNBOOK incident steps are understood, and someone besides the lead can rotate the keys.
