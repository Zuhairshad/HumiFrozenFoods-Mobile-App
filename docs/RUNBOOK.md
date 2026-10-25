# API runbook

For whoever is on call for the Humi API (`api/`). Written 2026-10-25. Some behaviour below is specified in `docs/api-contract.md` but may not be implemented yet (orders, webhook, expire job); sections say so. Check `api/src/routes/` and `api/package.json` before relying on them.

## 1. Quick reference

| What | Where |
|---|---|
| Liveness | `GET /healthz` returns `{"status":"ok"}`. Does not touch dependencies. If this fails, the process is down or the route is unreachable |
| Readiness | `GET /readyz` returns `{"status":"ready"}` when MongoDB answers a ping within 2 s, else 503 with code `not_ready` (details are in logs only) |
| Version | `GET /v1/version` |
| Config summary for the app | `GET /v1/config` shows `payments.enabled` *(per contract)* |
| Logs | Host log stream (Vercel: project > Logs, or its CLI). JSON lines from pino |
| Stripe deliveries | Stripe Dashboard > Developers > Webhooks > your endpoint > recent deliveries |
| Database | Atlas > Database > Browse Collections / Metrics / Alerts |

Point an uptime monitor at `/readyz` (not `/healthz`) so database outages are noticed, and alert on two consecutive failures.

## 2. Reading the logs

Each request produces a line `request completed` with fields `method`, `path` (never the query string), `status`, `durationMs`, plus the request id that also appears in the error envelope returned to the client (`error.requestId`). To investigate a customer report, ask for the request id shown in the error, or search by time and path.

Sensitive keys (authorization, cookies, Stripe signature, tokens, card, email, phone, address) are redacted to four levels deep; free-text messages are not redacted, so do not paste raw log lines into public tickets without reading them. Level is set by `LOG_LEVEL` (`info` default; use `debug` briefly only if needed, then revert).

Messages to look for:

- `readiness check failed` (warn): MongoDB unreachable or slow.
- `payment_amount_mismatch` (error) *(webhook, per contract)*: Stripe reports a different amount than the stored order. The order is not marked paid. Needs a human, see 4.4.
- 5xx responses: the client only sees an opaque message; the real error is in the log under the same request id.

## 3. Deploy and rollback

- Deploy: new deployment from the main branch. After each deploy that changes indexes run `npm run db:indexes` against production with a user that is allowed to create indexes on the app's own collections.
- Rollback (Vercel): promote the previous good deployment (dashboard > Deployments > previous > Promote / "Instant Rollback"). Environment variable changes need a redeploy to take effect; rolling back does not undo them.
- App store builds cannot be rolled back instantly: ship a fix, or turn off the failing feature server-side (section 6). Keep the previous release available.

## 4. Common failure modes

### 4.1 Webhook signature failures (Stripe shows 400)

Symptoms: Stripe dashboard shows failed deliveries with 400; orders stay `payment-pending` after customers paid.

Likely causes, in order:
1. `STRIPE_WEBHOOK_SECRET` is wrong: test secret in production or vice versa, the `stripe listen` secret, or the endpoint was recreated (new endpoint = new secret). Copy the current signing secret from the endpoint page, set it, redeploy.
2. Something altered the raw body before verification (a proxy, a body parser). The route must read the raw text first.
3. Server clock far off (tolerance is 300 s). Rare on managed hosts.

Recovery: after fixing, in the Stripe dashboard open the failed events and use **Resend** (or wait for automatic retries, which continue for up to about three days in live mode; **CHECK** Stripe's current retry policy). Duplicates are harmless: events are de-duplicated by id. Then confirm affected orders flipped to `payment-success`.

If the failing deliveries are for events our API deliberately ignores (not ours) they still return 200; 400s mean signature trouble only.

### 4.2 Pending orders piling up

Cause: customers abandon the payment sheet; each attempt leaves a `payment-pending` order in the shared `orders` collection that staff can see.

Mitigation: the expire job `npm run jobs:expire-pending` *(per contract section 6; confirm the script exists)* cancels the Stripe PaymentIntent and sets `order_status: "order-cancelled"`, `payment_status: "payment-failed"` for app-created orders (`app_meta.source = "mobile-app"`) older than `PENDING_ORDER_TTL_MINUTES`. It never touches website orders and never deletes. Run it on a schedule (for example every 15 minutes: Vercel Cron, a GitHub Actions schedule, or a small scheduler; credentials must be supplied as secrets). If many pending orders exist, first check that the webhook is working (4.1); a broken webhook looks the same as abandonment and expiring would cancel paid orders. The job should only cancel intents that Stripe still reports as unpaid; verify that in the first run against test mode.

Manual check: in Atlas filter `orders` by `{"app_meta.source":"mobile-app","payment_status":"payment-pending"}` (read only).

### 4.3 MongoDB connectivity

Symptoms: `/readyz` 503, 5xx on catalogue and orders.

1. Atlas status page and cluster state (paused free clusters need resuming).
2. Atlas IP access list: if the host's IPs changed or your entry was removed, connections time out.
3. Credentials: password rotated or user deleted gives auth errors in the logs.
4. Connection limits: serverless instances each open a pool (small `maxPoolSize`); a spike in instances can exhaust the cluster's connections. Check Atlas metrics for connections.
5. `MONGODB_URI` mistakes after edits (special characters in the password must be URL-encoded).

The API fails readiness but keeps serving `/healthz`, so the platform does not restart it needlessly. The catalogue has an in-process cache for a short time; orders cannot be created without the database.

### 4.4 Amount mismatch or paid-but-not-updated orders

If `payment_amount_mismatch` is logged: do not mark the order paid by hand until you have compared the Stripe PaymentIntent (amount, currency, metadata.orderId) with the order. Decide to refund in Stripe (the `charge.refunded` webhook will then update the order) or correct the order deliberately. Record what you did.

### 4.5 Stripe outage or API errors

Behaviour (per contract): creating a payment intent fails with 503 `payment_provider_error` and **no order is created**. Existing paid orders are unaffected. Webhook events missed during an outage are retried by Stripe when it recovers. Check <https://status.stripe.com>. Nothing to do except communicate; if the outage is long, disable payments (section 6) so customers see a clear message instead of errors.

### 4.6 Rate limiting complaints or abuse

The limiter is per instance and resets on cold start; blocked real users are rare, abuse getting through is the bigger risk. For an active abuse event: tighten `RATE_LIMIT_MAX` and redeploy, add host-level WAF/firewall rules (Vercel Firewall) for the offending IPs or paths, and review SECURITY.md residual risk 1.

### 4.7 CORS errors from a browser

The native app is not affected. For the web build add the exact origin to `ALLOWED_ORIGINS` (scheme + host + optional port, no trailing slash, https only in production) and redeploy.

## 5. Rotating secrets

Rotate immediately if a secret was exposed (committed, pasted in chat or a screenshot, sent to the wrong person, a laptop was lost) and on a routine schedule you choose (for example every six months).

### 5.1 `GUEST_TOKEN_KEYS`

Format: `kid:base64url[,kid:base64url]`. The first entry signs new tokens; all entries verify.

Zero-downtime rotation:
1. Generate: `node -e "console.log('k2:' + require('crypto').randomBytes(32).toString('base64url'))"` (use a new kid each time).
2. Set `GUEST_TOKEN_KEYS=k2:<new>,k1:<old>` (new first). Redeploy. New tokens use k2; existing tokens still verify with k1.
3. After `GUEST_TOKEN_TTL_SECONDS` has passed (default 14 days), remove `k1`. Redeploy.

Emergency (key compromised): set only the new key. All outstanding guest tokens stop working immediately. Customers can recover access via order lookup (order number plus email or phone) *(planned route)*. Tell support to expect questions.

### 5.2 Stripe secret key

1. Stripe Dashboard > Developers > API keys > roll the secret key (you can set an expiry for the old key to overlap; **CHECK** current options) or create a new restricted key.
2. Update `STRIPE_SECRET_KEY` in the production API environment; redeploy.
3. Confirm a test payment works (test mode) or watch the first live payment, then let the old key expire/delete it.

### 5.3 Stripe webhook secret

1. Dashboard > Developers > Webhooks > the endpoint > roll the signing secret (an overlap period is offered; **CHECK**), or create a new endpoint with the same four events and delete the old one afterwards.
2. Update `STRIPE_WEBHOOK_SECRET`; redeploy promptly. Between the Stripe change and the redeploy, deliveries fail with 400 and are retried, so do these close together.

### 5.4 MongoDB credentials

1. Atlas: create a new database user with the same custom role (SETUP A5), switch `MONGODB_URI`, redeploy, check `/readyz`, then delete the old user.
2. Never rotate by editing the existing user's password while the API is live unless you update the environment at the same moment.

### 5.5 Publishable key and API URL

These are public and baked into app builds. A new publishable key requires a new app build (and a store release). Another reason not to treat them as secrets, and not to assume you can change them quickly.

## 6. Disable payments quickly

Unset `STRIPE_SECRET_KEY` in the production API environment and redeploy. With no key configured, `payments.enabled` is false; the app sees that in `GET /v1/config` and creating a payment intent returns 503 `payment_provider_error` ("Payments are not configured") without creating an order. Browsing and enquiries keep working.

Notes:
- Also consider disabling the Stripe webhook endpoint only if you want to stop all processing; leaving it is normally better, so already-paid orders still get updated. If `STRIPE_WEBHOOK_SECRET` is also unset, verification cannot succeed and deliveries fail until restored.
- To re-enable, set the key back and redeploy.
- This is graceful behaviour described in the contract; test it in a staging environment before you need it.
- Dashboard-side alternative for a fraud attack: pause or tighten Radar rules, or temporarily roll the secret key (which breaks payments immediately).

## 7. Incident steps

1. **Declare and assign.** One person leads; others help. Note the start time.
2. **Assess** (5 minutes): is `/healthz` up? `/readyz`? Are payments failing, wrong, or being abused? Is customer data involved?
3. **Contain first, then diagnose.**
   - Suspected key leak: rotate it (section 5) before investigating.
   - Payment abuse or double charging: disable payments (section 6).
   - Bad deploy: roll back (section 3).
   - Suspected database misuse: revoke the API's database user in Atlas (the API then fails closed), review Atlas access logs and orders created in the window.
4. **Preserve evidence**: save relevant log excerpts and Stripe event ids; do not delete anything.
5. **Check money**: compare Stripe payments in the window with orders marked paid; fix mismatches deliberately (4.4).
6. **Communicate**: tell staff what to do with affected orders; tell customers if their orders are affected.
7. **Personal data**: if personal data may have been exposed, write down what, whose and when. In the UK, a reportable breach must be reported to the ICO within 72 hours of becoming aware; **CHECK** the current ICO guidance and take legal advice. Do not rely on this document for that decision.
8. **Recover and review**: restore service, re-enable payments, then write a short blameless review: what happened, how it was detected, what to change (add it to SECURITY.md residual risks if applicable).
