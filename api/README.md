# Humi's Frozen Foods API

TypeScript API on Hono, deployable to Vercel (Node runtime), backed by MongoDB Atlas. This package is the
**foundation**: config, DB access, security middleware, error/validation/money/ID primitives and guest order
tokens. Product, order and payment routes are added on top by mounting them in `createApp(deps, mount)`.

It is isolated from the Expo app: its own `package.json`, `tsconfig`, ESLint and tests. The root `tsc`/`eslint`
exclude `api/`.

## Run

```bash
cd api
npm install
cp .env.example .env        # fill in MONGODB_URI etc. Never commit .env
npm run dev                 # http://localhost:3000, node --env-file loads .env

npm run typecheck && npm run lint
npm test                    # unit tests, fully offline
npm run test:coverage       # unit tests + coverage thresholds (>=90% on src/lib and src/middleware)
npm run test:integration    # real MongoDB via mongodb-memory-server (binary is fetched on npm install, then offline)
npm run db:indexes          # create indexes against MONGODB_URI (run on deploy for serverless)
npm run build               # tsc -> dist/
```

## Layout

```
src/
  app.ts            createApp(deps, mount?) factory; all collaborators injected (tests pass fakes)
  index.ts          Node server for local dev / long-lived hosts (graceful shutdown)
  vercel.ts         serverless entry: module-scope runtime, `export default app`
  bootstrap.ts      wires production dependencies from config
  config/env.ts     zod-validated env, fail-fast, secrets wrapped in Secret
  db/client.ts      module-scope cached MongoClient, ping, close, ensureIndexes
  db/indexes.ts     index definitions (feature modules append here)
  auth/             HMAC guest order tokens + key ring (kid rotation)
  lib/              errors, logger, validation, money, ids, safe-object, rate-limit store, secret, http
  middleware/       request-id, access-log, security headers, CORS, body limit, timeout, content-type,
                    rate limit, client IP, guest auth
  routes/health.ts  /healthz, /readyz
tests/unit/         mirrors src/
tests/integration/  mongodb-memory-server
```

Request pipeline order: request-id -> access log -> secure headers -> client IP -> CORS -> health probes ->
global rate limit -> timeout -> body limit -> JSON-only enforcement -> your routes -> 404/405 -> error handler.

## Environment variables

| Name | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `PORT` | no | `3000` | local server only |
| `LOG_LEVEL` | no | `info` | pino level or `silent` |
| `MONGODB_URI` | **yes** | - | `mongodb://` or `mongodb+srv://`; secret |
| `MONGODB_DB` | no | `humis` | |
| `ALLOWED_ORIGINS` | no | empty (deny all browsers) | comma-separated exact origins; no `*`, no paths; https only in production |
| `PUBLIC_API_BASE` | prod | - | no trailing slash |
| `STRIPE_SECRET_KEY` | prod | - | `sk_`/`rk_` prefix; secret |
| `STRIPE_WEBHOOK_SECRET` | prod | - | `whsec_` prefix; secret |
| `GUEST_TOKEN_KEYS` | prod | ephemeral key in dev | `kid:base64url[,kid:base64url]`, each key >= 32 bytes; first signs, all verify |
| `GUEST_TOKEN_TTL_SECONDS` | no | 14 days | 60 s to 90 days |
| `TRUSTED_IP_HEADER` | prod on Vercel | unset | e.g. `x-real-ip` behind Vercel; unset uses the socket address. `src/vercel.ts` refuses to start in production without it (no socket there, so all clients would share one rate-limit bucket). The header MUST be one the platform overwrites; the first comma-separated value is used, so do not name `x-forwarded-for` behind a proxy that appends |
| `BODY_LIMIT_BYTES` | no | 102400 | |
| `REQUEST_TIMEOUT_MS` | no | 10000 | |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | no | 120 / 60000 | global per-IP budget |

Configuration errors name the variable and the reason, never the value.

## Conventions for feature modules

- **Errors**: throw `AppError` subclasses (`NotFoundError`, `ConflictError`, ...). Clients always get
  `{ "error": { "code", "message", "requestId", "details?" } }`. Anything else becomes an opaque 500 with the real
  error in the logs under the same `requestId`.
- **Input**: `jsonBody(z.strictObject({...}))`, `queryParams(...)`, `pathParams(...)`. Keys beginning `$`, containing
  `.`, or named `__proto__`/`constructor`/`prototype` are rejected before the schema runs. Validation issues carry
  paths and messages, not submitted values.
- **Mongo**: build queries from validated, typed fields only. Never pass `req.json()` or any request object into a
  filter or update. Parse ids with `parseObjectId` (400, not 500).
- **Money**: `Pence` integers only. `toPence("12.99")`, `fromPence`, `formatGBP`, `multiply`, `applyBasisPoints`
  (explicit rounding mode), `allocate` (largest remainder; parts always sum to the total). Floats that are not an
  exact number of pence are rejected, not rounded.
- **Routes with extra budgets**: `rateLimit({ store, name: 'orders:create', limit: 10, windowMs: 60_000, failOpen: false })`.
- **Guest order access**: `deps.guestTokens.issue(orderId)` at order creation; protect reads with
  `requireGuestOrderToken(deps.guestTokens)`. Token goes in `Authorization: Bearer`, never a URL.
- **Stripe webhook** (later): read the raw body with `c.req.text()` *before* any JSON parsing and verify the signature;
  dedupe on `event.id` using the unique index on `webhook_events`.

## Security model

Controls in place:

- Secure headers (CSP `default-src 'none'`, HSTS, nosniff, frame deny, no-referrer), `Cache-Control: no-store` by default.
- CORS is deny-by-default with an exact-origin allow-list. Native mobile clients send no `Origin` and pass through.
  Browser requests from unlisted origins that change state are rejected with 403 (CORS alone would not stop the request being sent).
  No cookies or credentialed CORS are used; auth is by bearer token.
- Body size cap enforced on Content-Length and on streamed bytes; JSON-only content type on writes; handler timeout.
- Per-IP global limit plus per-route limits through a pluggable `RateLimitStore`. Forwarding headers are ignored unless
  `TRUSTED_IP_HEADER` names one, so clients cannot choose their own rate-limit identity.
- NoSQL-injection hardening at the validation layer; strict zod objects reject unknown fields.
- Secrets are `Secret` instances (redacted by `toString`, `JSON.stringify`, `util.inspect`); pino redacts authorization,
  cookie, Stripe signature, token, card, email, phone, address and similar keys to four levels deep. Query strings are never logged.
- Guest tokens: `hgt1.<kid>.<payload>.<HMAC-SHA256>`, MAC over version+kid+payload, constant-time compare, expiry,
  per-order scope, keyring rotation (prepend a new key, remove the old one after the TTL). All failures return the
  same 401 so callers learn nothing about order existence.
- 5xx responses are opaque in every environment; only non-production adds the underlying message (never a stack).

**Not covered / honest gaps**

- **Rate limiting is per instance.** `MemoryRateLimitStore` does not share state between serverless instances, so the
  effective limit is multiplied by the instance count and resets on cold start. Production needs a shared store
  (Upstash Redis `INCR` + `PEXPIRE`, or Vercel/WAF rules) implementing `RateLimitStore`. Use `failOpen: false` on payment routes.
  Fixed windows also allow short bursts at window boundaries.
- **No end-user accounts or admin auth.** Only guest order tokens exist. Admin or account routes need their own design.
- Guest tokens are bearer credentials: anyone holding one can read that order until it expires, and there is no
  server-side revocation list. Keep TTLs short, and keep order responses free of data the guest does not need.
- The timeout middleware answers 504 but cannot cancel the running handler.
- Redaction is key-based. Personal data placed inside free-text log messages or unlisted keys will not be redacted.
- No audit log, no bot/WAF protection, no CSRF tokens (not needed without cookies, but revisit if cookies are introduced).
- Atlas network access (Vercel IPs), database user least privilege, backups, and secret rotation are operational tasks outside this code.
- No Stripe, order, or product code exists yet, so nothing here has been reviewed against payment flows.
- **A human security review (and ideally a penetration test) is required before taking real payments.**

## Deployment notes (not yet deployed)

Set the Vercel root directory to `api/`, use the Node runtime (Stripe and the Mongo driver need it), and point the
function entry at `src/vercel.ts` (`export default app`; `@vercel/functions` `attachDatabasePool` is already wired).
Allow Atlas access from Vercel, run `npm run db:indexes` once per deploy, and supply every production variable above.

## End-to-end tests and the local mock server

```bash
npm run test:e2e     # whole API against a real in-memory MongoDB (~10 s); no network, no Stripe
npm run dev:mock     # local mock server on http://localhost:3000 (PORT overrides), bound to 0.0.0.0
```

**E2E suite** (`tests/integration/e2e/*.e2e.test.ts`, helpers in `tests/support/`). `createHarness()` boots
MongoMemoryServer, seeds `products` from `tests/fixtures/products.live.json` (raw site-shaped documents, including
`b2b_pricing`, `quantity`, `sku`) plus three website-style `orders`, and builds the app from the same modules as
`src/composition.ts`, with the signing fake gateway, a controllable clock (starts Monday 2030-03-04 09:00 London)
and the test config (HUMI15 15% promo, delivery 799 / free from 5000). It covers catalogue, quote, payment-intent,
idempotency, webhooks, order read, lookup, enquiries, concurrency, the expire-pending job and data safety (website
orders byte-identical, no indexes on `products`/`orders`). A failing `it.fails` under a `BUG:` describe documents a
confirmed defect and turns red once it is fixed.

**Mock server** (`src/scripts/dev-mock-server.ts`): the real API on an in-memory database seeded with the 17 live
products and no orders, fake payments, promo codes `HUMI15` and `FREESHIP`. Point the app at the printed URL
(`EXPO_PUBLIC_API_BASE_URL`; Android emulator: `http://10.0.2.2:3000`). It prints a `curl` smoke test. Because there
is no Stripe, `POST /dev/pay/<orderId>` simulates `payment_intent.succeeded` for an order by sending a correctly
signed event through the real `/v1/webhooks/stripe` route. That route exists only in this script (never in the
production app) and the script refuses to start when `NODE_ENV=production`. **Never deploy it.**
