# Owner's setup checklist

This is the list of things only the business owner can do: accounts, keys, database access and business decisions. Work through it top to bottom. Each step says where the value goes.

Ground rules (read these first):

- **Secrets never go in git, chat, screenshots or the app.** A secret is anything that lets someone spend money or read customer data: the MongoDB connection string, `sk_...` Stripe keys, `whsec_...` webhook secrets, `GUEST_TOKEN_KEYS`. They go only into the API host's environment settings (Vercel project settings, or a local `api/.env` file that git ignores).
- **Variables starting with `EXPO_PUBLIC_` are public.** They are baked into the app and anyone can read them. Only the Stripe *publishable* key (`pk_...`) and the API URL belong there.
- **Test mode first.** Do everything with Stripe test keys and a database user you can safely lose, before touching live money.
- Anything marked **CHECK** depends on the current vendor docs or on your live system, which I could not verify from here. Do not skip those checks.

Status of this repo (what exists today, so you know what the steps rely on): the API has config, security middleware, health endpoints, catalogue-related code, `POST /v1/checkout/quote`, enquiries, and version routes. The order, payment-intent and webhook routes, and the scripts `verify:schema` and `jobs:expire-pending`, are described in `docs/api-contract.md` but may not all be merged yet. Check `api/package.json` scripts and `api/src/routes/` before you rely on a step.

---

## A. MongoDB Atlas (the existing website database)

The API reads your existing `products` and `orders` collections and inserts new orders into `orders`. The database is shared with the live website, so we start with a user that can only read.

### A1. Create a READ-ONLY database user first

1. Atlas > your project > **Security > Database & Network Access > Database Users > Add New Database User**.
2. Authentication method: **Password**. Use a long generated password (let Atlas autogenerate it) and store it in your password manager.
3. Database User Privileges: **Built-in Role > Select Specific Privileges** (or "Add Specific Privilege") and choose the built-in role **`read`** on **the website's database name** (the name that appears in your current connection string after the host, for example `.../<dbname>?...`). Not "Read any database", not `readWrite`, not `atlasAdmin`.
4. Name it something obvious, for example `humi-api-readonly`.
5. Under **Restrict Access to Specific Clusters/Federated Database Instances** select only the one cluster.
6. Save.

### A2. Restrict network access

1. **Security > Database & Network Access > IP Access List**.
2. Add the IP address of your own computer for local testing (Atlas offers "Add Current IP Address").
3. For the hosted API: Vercel serverless functions do not have fixed IP addresses on standard plans, so teams often allow `0.0.0.0/0` and rely on a strong password. That is a real weakness: anyone on the internet can attempt a login. Prefer, in order: Vercel's fixed-egress/Secure Compute features or Atlas private networking if your plans include them (**CHECK** current Vercel and Atlas docs), or a host with a static outbound IP. If you do use `0.0.0.0/0`, say so in the launch review (section F) and use the least-privilege user from A5.
4. Remove your own IP again when you no longer need it.

### A3. Put the connection string in the API environment

1. Atlas > **Database > Connect > Drivers**: copy the connection string. It looks like `mongodb+srv://<user>:<password>@<cluster-host>/...` Replace `<password>` locally; do not paste the finished string anywhere shared.
2. Local: copy `api/.env.example` to `api/.env` and set `MONGODB_URI=...` and `MONGODB_DB=<the website's database name>`.
3. Hosted: add `MONGODB_URI` and `MONGODB_DB` in the host's environment variable settings (mark as secret / sensitive).
4. `api/.env` is ignored by git. Run `git status` before every commit and make sure it is not listed.

### A4. Run the schema check and read its report

The lead is adding an npm script `verify:schema` (see `docs/api-contract.md` section 4). It is read-only: it loads the newest order that was *not* created by the app and prints a field-by-field comparison with the order document our API would write, including type differences (for example string vs number, date vs string).

```bash
cd api
npm install
npm run verify:schema
```

How to read it: every field the website's own orders have that ours does not, or has with a different type, is a risk that the admin portal shows our orders wrongly or breaks on them. Send the report (it contains field names, not customer data; check it before sharing anyway) to whoever maintains the site and ask them to confirm the mapping. **Do not enable order writes (A5) until the differences are explained or fixed.** If the script does not exist yet in `api/package.json`, ask the lead; do not proceed to A5.

### A5. Only then: a second user with limited write access

Atlas "custom roles" let you list exactly which actions are allowed on which collection. Create one, then a user that has only that role.

1. **Security > Database & Network Access > Custom Roles tab > Add New Custom Role** (you need Organization Owner, Project Owner or Project Database Access Admin).
2. Role name: `humi_api_rw` (letters, numbers, underscores, hyphens only; must not start with `xgen-`).
3. Add privileges (one row each; choose **Collection Actions**, then enter the database and collection names exactly, do not use "any database/collection"):

   | Database | Collection | Actions | Why |
   |---|---|---|---|
   | website DB | `orders` | `find`, `insert`, `update` | read orders, create new orders, update orders the app created (payment status) |
   | website DB | `products` | `find` | read the catalogue and prices |
   | website DB | `app_idempotency` | `find`, `insert`, `update`, `remove` | our own collection: replay protection |
   | website DB | `app_enquiries` | `find`, `insert`, `update`, `remove` | our own collection: contact/B2B enquiries |
   | website DB | `webhook_events` | `find`, `insert`, `update`, `remove` | our own collection: Stripe event de-duplication |

   Deliberately absent: `remove` on `orders` and `products`, any write on `products`, and any access to other collections (users, shops, settings).
4. Index creation: the API manages indexes only on its own three collections (`npm run db:indexes`). Creating them needs extra actions (`createIndex`, and `createCollection` if the collection does not exist yet) on those three collections. Simplest safe approach: run `npm run db:indexes` once with a temporary admin-ish user you then delete, or add `createIndex` and `createCollection` to the three rows above. **CHECK** the exact action names offered in the Atlas role form.
5. **Add New Database User**, name `humi-api-app`, password auth, then under privileges choose **Custom Roles** and select only `humi_api_rw`. Restrict to the one cluster.
6. Replace `MONGODB_URI` in the API environment with this user's connection string. Delete or keep the read-only user for running `verify:schema` and ad-hoc inspection.

Honest limits of this setup:

- Atlas custom roles work per collection, not per document. The write user can `update` *any* document in `orders`, including the website's own orders, even though the code only updates documents it created. A stolen credential could therefore change real orders. Treat the `MONGODB_URI` as highly sensitive and rotate it if there is any doubt.
- "Atlas applies the highest permission from any assigned role": do not also give the user a broader built-in role or you silently remove the restriction.
- Custom roles support only a subset of actions, and changes can take up to about 30 seconds on Free/Flex clusters.
- **CHECK** the current official instructions before relying on this: <https://www.mongodb.com/docs/atlas/security-add-mongodb-roles/> (the steps above follow that page as fetched on 2026-10-25; the assignment of roles to users is on <https://www.mongodb.com/docs/atlas/security-add-mongodb-users/>).
- Backups: confirm Atlas backups (cloud backup) are enabled for the cluster before the app writes anything (Atlas > cluster > Backup). Free tier clusters do not include continuous cloud backup; if you are on one, take manual exports first.

---

## B. Stripe

### B1. Test mode first

1. In the Stripe Dashboard switch to **Test mode** (toggle at the top). Everything below is done in test mode first; repeat with live keys only in section F.
2. **Developers > API keys**. Copy:
   - **Secret key** (`sk_test_...`) into the API environment as `STRIPE_SECRET_KEY`. Never into the app. Consider a **restricted key** (`rk_...`) with only "PaymentIntents: write" and nothing else; the API accepts `sk_` or `rk_` prefixes. **CHECK** in the key creation form which permissions are needed for refunds-related reads (the API only receives refund events via webhook).
   - **Publishable key** (`pk_test_...`) into the app environment as `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (local `.env.local`, and an EAS environment variable for builds, see E3).

### B2. Create the webhook endpoint

1. **Developers > Webhooks > Add endpoint**.
2. Endpoint URL: `https://<api-host>/v1/webhooks/stripe` (your deployed API; for local testing see the Stripe CLI note below).
3. Select **exactly these four events** and no others:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
   - `charge.refunded`
4. After creating it, reveal the **Signing secret** (`whsec_...`) and put it in the API environment as `STRIPE_WEBHOOK_SECRET`. Redeploy/restart the API so it is picked up.
5. Test: Stripe Dashboard > the endpoint > "Send test webhook" is useful for signature checks, but note the API ignores any payment intent that lacks `metadata.source = humi-mobile-app`, so a generic test event will return 200 and do nothing. A real test-mode order from the app is the proper test.

Local testing: install the Stripe CLI and run `stripe listen --forward-to localhost:3000/v1/webhooks/stripe`. It prints a *different* `whsec_...` that is only valid for that session; use it in your local `api/.env`, never in production.

### B3. The double-webhook caveat (ask the website's maintainer)

Your website probably has its **own** Stripe webhook endpoint on the same Stripe account. Stripe sends every event to every endpoint, so the website's handler will also receive the `payment_intent.*` events caused by app orders.

- Our API ignores PaymentIntents that do not carry `metadata.source = humi-mobile-app`.
- **The website's handler must ignore intents it did not create too.** We have not seen its code. Ask whoever maintains the site to verify that a `payment_intent.succeeded` / `payment_failed` / `canceled` or `charge.refunded` event for an unknown intent does not cause errors, repeated retries, wrong order updates, or emails. If the site handler returns 4xx/5xx for unknown intents, Stripe will retry and may eventually disable that endpoint, which could break the website's payments. Do this check in test mode before going live.

### B4. Apple Pay (needs a development or production build; not Expo Go)

Source: Stripe's React Native Apple Pay guide, <https://docs.stripe.com/apple-pay?platform=react-native> (fetched 2026-10-25).

1. Enrol in the Apple Developer Program (paid).
2. Register a merchant ID at <https://developer.apple.com/account/resources/identifiers/add/merchant>. The repo's placeholder in `app.json` is `merchant.com.humisfrozenfoods.app`. If you register a different identifier, tell the lead so `app.json` can be changed (it is passed to the Stripe config plugin as `merchantIdentifier`).
3. In Stripe, open **Settings > iOS certificates** (<https://dashboard.stripe.com/settings/ios_certificates>), click **Add new application**, download the **Certificate Signing Request (CSR)**. One CSR issues exactly one certificate. Use Stripe's CSR, not one you generate yourself.
4. In the Apple developer site, open your merchant ID, create an **Apple Pay Payment Processing Certificate** from that CSR, download it and upload it back in the Stripe dashboard step.
5. Rebuild the app (`eas build`, section E). With Expo's generated native projects the Stripe config plugin is expected to add the Apple Pay entitlement for the merchant ID, so the manual Xcode step in Stripe's guide should not be needed. **CHECK** on the first device build that the Apple Pay button appears.
6. Testing: per Stripe, use a real card in your Apple Wallet with **test-mode API keys**; Stripe returns a test token and does not charge the card. Stripe test card numbers and Apple sandbox cards cannot be added to Wallet.

### B5. Google Pay

`app.json` already sets `enableGooglePay: true` for the Stripe plugin. In test mode Google Pay works in a development build on a device with a card in Google Wallet. For production you must complete Google's Pay & Wallet Console business profile/production access. **CHECK** Stripe's current Google Pay guide: <https://docs.stripe.com/google-pay?platform=react-native>.

---

## C. Business rules you must confirm (four open questions)

The API has defaults copied from the live site's settings, but they conflict in places. Decide each, then set the variable in the API environment. Changing any of them is an environment edit plus a restart/redeploy; no code change.

| # | Question | Env var | Default now | What I found | Where to look |
|---|---|---|---|---|---|
| 1 | Delivery fee and free-delivery threshold | `DELIVERY_FEE_PENCE`, `FREE_DELIVERY_THRESHOLD_PENCE` (empty = delivery is never free), optionally `MIN_ORDER_PENCE` | 799 and 5000 | The site settings say fee 7.99 and free over 50 (`codDeliveryCharge`, `codFreeDeliveryThreshold`). The old app README and homepage banner say "free over 25". They cannot both be right. The site checkout could also charge by delivery method; unverified. | Admin portal settings page for shipping/delivery (the values the checkout banner reads) and a test checkout on the website in test mode |
| 2 | Promo codes | `PROMO_CODES` (JSON array, kinds `percentage`, `fixed`, `free_shipping`; optional `minSubtotalPence`, `expiresAt`) | `[]` (no codes; the app hides the promo field) | `HUMI15` appears in old app docs but could not be verified on the site (no coupon input in guest checkout; coupon list is login-only). Do not enable it unless you really run it. | Admin portal coupons section |
| 3 | Status written when payment succeeds | `PAID_ORDER_STATUS` | `order-pending` (staff process it manually) | Known site statuses: `order-pending`, `order-processing`, `order-completed`, `order-cancelled`, `order-refunded`, `order-failed`, `order-at-local-facility`, `order-out-for-delivery`. Setting `order-processing` is more natural once paid, but confirm that the admin portal does not trigger emails or stock changes on that status that you do not want. | Admin portal orders list: look at how a website-paid order appears and which status staff expect to see |
| 4 | Order number format | `ORDER_NUMBER_DIGITS` | 12 random digits | The website's `tracking_number` format was never observed (no real order could be viewed). The admin portal or invoices may expect a particular pattern. | Open two or three recent real orders in the admin portal and compare the tracking number |

Also confirm `PENDING_ORDER_TTL_MINUTES` (default 120): unpaid app orders older than this are cancelled by the expire job (RUNBOOK section on pending orders).

---

## D. Generate keys and set origins

1. **Guest token keys.** Generate a key (works on any computer with Node 22):

   ```bash
   node -e "console.log('k1:' + require('crypto').randomBytes(32).toString('base64url'))"
   ```

   Put the whole output (`k1:...`) in `GUEST_TOKEN_KEYS`. Each key must be at least 32 bytes. The first entry signs, all entries verify, which is how rotation works (RUNBOOK). Never reuse the example value, never commit it.
2. **`ALLOWED_ORIGINS`**: comma-separated exact origins of browsers allowed to call the API, with no trailing slash and no `*`. The native app sends no `Origin` header and is not affected. Leave empty to deny all browsers (correct if you do not ship a web build). For local web testing use `http://localhost:8081`. In production only `https://` origins are accepted.
3. **`TRUSTED_IP_HEADER`**: which header carries the real client IP. On Vercel use `x-real-ip`. Set it **only** when the host's proxy overwrites that header; if you set it on a host that passes client-supplied headers through, anyone can fake their IP and evade rate limits. Unset means the raw socket address is used (right for local development).
4. `PUBLIC_API_BASE` (production): the API's public URL, no trailing slash.

---

## E. Run it locally and build the app

### E1. API

```bash
cd api
npm install
cp .env.example .env     # then edit: MONGODB_URI, MONGODB_DB, Stripe test keys, GUEST_TOKEN_KEYS
npm run dev              # http://localhost:3000
curl http://localhost:3000/healthz        # {"status":"ok"}
curl http://localhost:3000/readyz         # {"status":"ready"} only if MongoDB answers
```

### E2. App with Expo Go (limited)

Find your computer's LAN IP (for example `192.168.1.50`), then, in the repo root:

```bash
npm install
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.50:3000 npx expo start
```

Scan the QR code with Expo Go on a phone on the same Wi-Fi. Use the LAN IP, never `localhost` (on a phone, localhost is the phone). Without `EXPO_PUBLIC_API_BASE_URL` the app runs in demo mode with the bundled catalogue and a mock checkout.

Expo Go limits: it contains only Expo's fixed set of native modules. Card payments with the Stripe PaymentSheet can work in Expo Go, but **Apple Pay and Google Pay do not** (Stripe's documentation says so). Anything with custom native code needs a development build.

### E3. Development build with EAS

One-time:

```bash
npm install --global eas-cli      # eas.json requires >= 25.3.0; latest at time of writing: 25.3.0
eas login
eas init                           # links the project to your Expo account (writes projectId into app config; ask the lead to commit it)
npx expo install expo-dev-client   # REQUIRED for development builds; not yet in package.json (see lead notes)
```

Environment variables for builds live in EAS, not in `eas.json`. The profiles in `eas.json` select an EAS *environment* (`development`, `preview`, `production`). Create the two public variables for each environment you build (the Expo docs page I checked shows `eas env:set`; if your CLI version uses `eas env:create`, the flags are the same; run `eas env --help`):

```bash
eas env:set --name EXPO_PUBLIC_API_BASE_URL --value https://<your-api-host> --environment preview --visibility plaintext
eas env:set --name EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY --value pk_test_... --environment preview --visibility plaintext
```

Repeat for `development` (test keys) and `production` (live key, only at go-live). These are public values: do not mark them secret and never put secret keys in EAS variables for the app.

Build:

```bash
eas build --profile development --platform android              # installable .apk
eas build --profile development --platform ios                  # real iPhone; needs paid Apple Developer account, device registered, Developer Mode on
eas build --profile development-simulator --platform ios        # iOS Simulator only (Mac)
```

Install via the QR code/link EAS prints, then run `npx expo start`; the development build opens instead of Expo Go.

### E4. TestFlight and Google Play internal testing

1. Make sure the version and identifiers are right (`app.json`: `version`, `ios.bundleIdentifier`, `android.package`). Build numbers are managed remotely by EAS (`appVersionSource: remote`, `autoIncrement` on the production profile).
2. Set production-environment variables (E3) with test keys while still testing.
3. `eas build --profile production --platform ios` then `eas submit --platform ios --profile production` (asks for App Store Connect access; create the app record in App Store Connect first with bundle id `com.humisfrozenfoods.app`). After processing, add testers in TestFlight.
4. `eas build --profile production --platform android` produces an `.aab`. Google requires the first upload of a new app to be done by hand in the Play Console; create the app, upload the `.aab` to the **Internal testing** track, add testers. Later uploads can use `eas submit --platform android` (needs a Google service account key; keep that JSON file out of git; `*.json` service keys are not auto-ignored, so store it outside the repo).
5. Use `preview` profile builds (`eas build --profile preview`) for quick internal installs without stores.

---

## F. Go-live checklist

Do not take real payments until every box is ticked.

- [ ] A person has read `docs/SECURITY.md` end to end, including residual risks and the "Issues found on the existing website API" section, and accepted or fixed each item.
- [ ] A dependency audit is clean or each remaining advisory is explained (Appendix below; run `npm audit --omit=dev` in the root and in `api/` again).
- [ ] An independent security review or penetration test of the payment and order flow is done (the api README states this is required before real payments).
- [ ] Stripe: live-mode keys created; live webhook endpoint created with the same four events; live `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` set only in the production API environment; live publishable key set in the EAS `production` environment; Apple Pay certificate uploaded for live mode.
- [ ] Stripe Radar rules reviewed (3D Secure, block high-risk, see SECURITY.md pre-launch list).
- [ ] The website maintainer confirmed their webhook ignores unknown PaymentIntents (B3).
- [ ] Business rules C1 to C4 confirmed and set; one full test-mode order appears correctly in the admin portal.
- [ ] `verify:schema` report reviewed and differences resolved (A4); least-privilege user in use (A5); old broader credentials deleted.
- [ ] Rate limiting uses a **shared store** (the default in-memory store is per instance and resets on cold start). Implement `RateLimitStore` on Upstash/Redis or set WAF rules at the host, with `failOpen: false` on payment routes.
- [ ] `TRUSTED_IP_HEADER`, `ALLOWED_ORIGINS`, `PUBLIC_API_BASE` set correctly; `GUEST_TOKEN_KEYS` generated freshly for production.
- [ ] Monitoring: uptime check on `/readyz`, alerts for 5xx rate, webhook failures (Stripe dashboard shows delivery failures), and Atlas alerts.
- [ ] Backups: Atlas cloud backup on and a restore tested at least once.
- [ ] Rollback plan understood (RUNBOOK): previous deployment can be promoted, `STRIPE_SECRET_KEY` can be unset to disable payments, previous app version stays available in the stores.
- [ ] Privacy policy updated to cover the app (guest order data, enquiries, retention, deletion route); app store privacy questionnaires filled in truthfully.
- [ ] A scheduler runs the pending-order expiry job (RUNBOOK) if that script exists in `api/package.json`.

---

## Appendix: Known dependency advisories

Collected on 2026-10-25 with `npx expo-doctor`, `npx expo install --check`, and `npm audit --omit=dev` in the root and in `api/` (read-only; nothing was fixed).

**Expo diagnostics**

- `npx expo-doctor`: 20/20 checks passed, no issues.
- `npx expo install --check`: "Dependencies are up to date".

**Root app (`npm audit --omit=dev`): 6 high**

| Package | Advisory | Why it is listed | Dev-only / transitive? | Recommended action |
|---|---|---|---|---|
| `node-forge` 1.4.0 | GHSA-86w9-cpqp-85rv (RSA PKCS#1 v1.5 signature verification accepts extra nested DigestAlgorithm elements), high | Pulled in by `expo` > `@expo/cli` (and `@expo/code-signing-certificates`) | Transitive through the Expo CLI, which is build/dev tooling and is not bundled into the app JavaScript. The `expo` and `@stripe/stripe-react-native` rows in the audit are only "depends on a vulnerable version" propagation. | Wait for an Expo SDK 58 patch release that updates `@expo/cli`; run `npx expo install expo` (patch) periodically. **Do NOT run `npm audit fix --force`**: it proposes installing `expo@44.0.6`, a downgrade of 14 major versions that would break the app. |
| `zod` 3.25.76 | GHSA-mrhx-c7xc-m3w5 (memory exhaustion validating oversized constrained collections), high (affects `<4.6.6`) | Pulled in by `@expo/cli` and by `eslint-config-expo` > `eslint-plugin-react-hooks` | Transitive, development tooling only (CLI and linter). The app does not import zod at runtime. | Same as above; wait for upstream bumps. No action in this repo. |

**API (`cd api && npm audit --omit=dev`): 4 high, one root cause**

| Package | Advisory | Path | Dev-only / transitive? | Recommended action |
|---|---|---|---|---|
| `zod` 4.1.11 (nested) | GHSA-mrhx-c7xc-m3w5, high | `@vercel/functions` > `@vercel/oidc` > `@vercel/cli-config` > `zod` | Transitive and **in the production dependency tree** (not dev-only). The API's own direct `zod` is 4.6.7 and is not affected. This nested copy belongs to Vercel's OIDC/CLI-config code and, as far as I can tell, does not validate request input from the public (not verified by code review). | Update `@vercel/functions` when Vercel releases a version that depends on a patched `@vercel/cli-config`; check with `npm outdated`. npm's suggested "fix" (downgrade to `@vercel/functions@3.6.1`) goes the wrong way; do not apply it. Lead could also add an npm `overrides` entry for `zod` in `api/package.json` and re-run tests, if the maintainers accept the risk of overriding. |

The CI `audit` job runs the same two audits with `continue-on-error`, so these will show as a failed (but non-blocking) step until upstream fixes land.

**Gaps to be aware of**

- `npm audit` only knows published advisories. It says nothing about logic bugs in this repo.
- Versions are pinned only by lock files; Dependabot is configured weekly (`.github/dependabot.yml`) and Expo/React Native major and minor bumps are deliberately ignored there because they must follow the Expo SDK upgrade guide.
