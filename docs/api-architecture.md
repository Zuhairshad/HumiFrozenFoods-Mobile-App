# ADR: API architecture (`api/`)

Status: accepted (foundation). Date: 2026-10-24.

## Context

The Expo app needs a backend for products, orders and Stripe payments, replacing direct coupling to the existing
website. It will run on Vercel (serverless) with MongoDB Atlas. Money and personal data are involved, so the
foundation must make the safe path the default for later feature work.

## Decisions

1. **Separate package in `api/`.** Own `package.json`, tsconfig, lint and tests; excluded from the app's root `tsc`
   and ESLint. The app's dependency tree is untouched. Versions follow `docs/tech-notes.md` (Hono 4, zod 4, mongodb 7, pino 10, vitest 5; TypeScript stays on 6.x like the app).
2. **Hono with a `createApp(deps, mount)` factory.** All collaborators (config, logger, database, rate-limit store,
   guest-token service) are injected, so tests use `app.request()` with fakes and no server or network. The same app
   runs under `@hono/node-server` locally and as `export default app` on Vercel.
3. **One module-scope `MongoClient`**, small pool, reused across warm invocations (`getDatabase`), with
   `attachDatabasePool` on Vercel. Persistence is reached through a narrow `Database` interface.
4. **Fail-fast, typed config** (zod). Secrets are `Secret` wrappers so logging cannot reveal them; production
   requires Stripe, token keys and public base URL.
5. **Uniform error envelope** `{error:{code,message,requestId,details?}}` from an `AppError` hierarchy; unknown
   errors become opaque 500s, logged with the request id.
6. **Validation at the edge.** Strict zod schemas plus a pre-pass rejecting `$`/`.`/prototype keys. Handlers receive typed data
   and never forward request objects to Mongo.
7. **Money as integer pence** in a branded type; floats that are not exact pence are rejected; BigInt intermediates for percentage math; explicit rounding modes; largest-remainder allocation.
8. **Pluggable rate limiting.** `RateLimitStore` interface with an in-memory implementation for dev/test. Production must supply a shared store; this is a known gap, documented in the README.
9. **Guest access without accounts** via HMAC-SHA256 tokens built on `node:crypto` (no extra dependency; format is
   small enough to audit): `kid` for rotation, expiry, per-order scope, constant-time verification.
10. **Index definitions live in code** (`src/db/indexes.ts`) and are applied by `ensureIndexes` (at boot locally, via `npm run db:indexes` on deploy).

## Consequences

- Feature agents add routes via `mount` and index specs via `defaultIndexes`; cross-cutting security is already applied.
- Serverless instances each hold their own rate-limit counters and Mongo pool until a shared limiter is added.
- Guest tokens cannot be revoked individually; mitigated by short TTLs and key rotation (rotation invalidates all outstanding tokens signed with the removed key).
- A human security review is still required before real payments (see `api/README.md`).

## Alternatives considered

- `jose` JWTs for guest tokens: more features than needed (algorithm negotiation is itself an attack surface); a fixed-format HMAC token is simpler.
- `@hono/zod-validator`: would add a dependency; Hono's built-in `validator` plus our `parseWith` gives the same typing with the error envelope and operator-key guard.
- Mongoose: heavier cold starts and a second schema layer beside zod.
