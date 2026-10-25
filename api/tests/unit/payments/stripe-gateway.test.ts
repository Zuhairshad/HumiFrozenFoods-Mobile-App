import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { PaymentSignatureError } from '../../../src/domain/ports.js';
import { AppError } from '../../../src/lib/errors.js';
import { createLogger } from '../../../src/lib/logger.js';
import { Secret } from '../../../src/lib/secret.js';
import {
  createDisabledGateway,
  createStripeGateway,
  type StripeClientLike,
} from '../../../src/payments/stripe-gateway.js';
import { captureLogs } from '../helpers.js';

const WEBHOOK_SECRET = 'whsec_unit_test_secret';
const offline = new Stripe('sk_test_offline_unit_tests');

function event(type: string, object: Record<string, unknown>, id = 'evt_1'): string {
  return JSON.stringify({ id, object: 'event', type, data: { object } });
}

function header(payload: string, overrides: { timestamp?: number; secret?: string } = {}): string {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: overrides.secret ?? WEBHOOK_SECRET,
    ...(overrides.timestamp === undefined ? {} : { timestamp: overrides.timestamp }),
  });
}

function gatewayWithRealWebhooks() {
  // Real SDK for constructEvent (pure local crypto); network methods are never reached in these tests.
  return createStripeGateway(
    { secretKey: new Secret('sk_test_x'), webhookSecret: new Secret(WEBHOOK_SECRET), logger: createLogger({ level: 'silent' }) },
    () => offline,
  );
}

describe('parseWebhook (real stripe-node verification, offline)', () => {
  const gateway = gatewayWithRealWebhooks();
  const succeeded = event('payment_intent.succeeded', {
    id: 'pi_1',
    amount_received: 2499,
    currency: 'GBP',
    metadata: { orderId: 'o1', source: 'humi-mobile-app' },
  });

  it('accepts a valid signature and normalises payment_intent.succeeded', () => {
    expect(gateway.parseWebhook(succeeded, header(succeeded))).toEqual({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      paymentIntentId: 'pi_1',
      amountReceivedPence: 2499,
      currency: 'gbp',
      metadata: { orderId: 'o1', source: 'humi-mobile-app' },
    });
  });

  it('rejects a tampered body', () => {
    const signature = header(succeeded);
    expect(() => gateway.parseWebhook(succeeded.replace('2499', '1'), signature)).toThrow(PaymentSignatureError);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(() => gateway.parseWebhook(succeeded, header(succeeded, { secret: 'whsec_other' }))).toThrow(PaymentSignatureError);
  });

  it('rejects a missing or empty header', () => {
    expect(() => gateway.parseWebhook(succeeded, undefined)).toThrow(PaymentSignatureError);
    expect(() => gateway.parseWebhook(succeeded, '')).toThrow(PaymentSignatureError);
  });

  it('rejects a timestamp older than the 300 s tolerance but accepts one inside it', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => gateway.parseWebhook(succeeded, header(succeeded, { timestamp: now - 301 - 5 }))).toThrow(PaymentSignatureError);
    expect(gateway.parseWebhook(succeeded, header(succeeded, { timestamp: now - 200 })).type).toBe('payment_intent.succeeded');
  });

  it.each(['garbage', 't=abc,v1=zz', 'v1=deadbeef', 't=1700000000', 't=1700000000,v0=abcd'])(
    'rejects malformed header %j',
    (bad) => {
      expect(() => gateway.parseWebhook(succeeded, bad)).toThrow(PaymentSignatureError);
    },
  );

  it('rejects a validly signed body that is not JSON', () => {
    const body = 'not json at all';
    expect(() => gateway.parseWebhook(body, header(body))).toThrow(PaymentSignatureError);
  });

  it('normalises failed, canceled and refunded events', () => {
    const failed = event('payment_intent.payment_failed', { id: 'pi_2', metadata: { orderId: 'o2' } }, 'evt_f');
    expect(gateway.parseWebhook(failed, header(failed))).toEqual({
      id: 'evt_f',
      type: 'payment_intent.payment_failed',
      paymentIntentId: 'pi_2',
      metadata: { orderId: 'o2' },
    });
    const canceled = event('payment_intent.canceled', { id: 'pi_3', metadata: null }, 'evt_c');
    expect(gateway.parseWebhook(canceled, header(canceled))).toMatchObject({ type: 'payment_intent.canceled', metadata: {} });

    const full = event('charge.refunded', { id: 'ch_1', amount: 500, amount_refunded: 500, payment_intent: 'pi_4', metadata: { a: 'b' } }, 'evt_r');
    expect(gateway.parseWebhook(full, header(full))).toEqual({
      id: 'evt_r',
      type: 'charge.refunded',
      paymentIntentId: 'pi_4',
      fullyRefunded: true,
      metadata: { a: 'b' },
    });
    const partial = event('charge.refunded', { id: 'ch_2', amount: 500, amount_refunded: 100, payment_intent: { id: 'pi_5' }, metadata: {} });
    expect(gateway.parseWebhook(partial, header(partial))).toMatchObject({ paymentIntentId: 'pi_5', fullyRefunded: false });
    const noIntent = event('charge.refunded', { id: 'ch_3', amount: 500, amount_refunded: 500, payment_intent: null, metadata: {} });
    expect(gateway.parseWebhook(noIntent, header(noIntent))).toMatchObject({ paymentIntentId: null });
  });

  it('marks other event types as ignored', () => {
    const other = event('customer.created', { id: 'cus_1' }, 'evt_o');
    expect(gateway.parseWebhook(other, header(other))).toEqual({ id: 'evt_o', type: 'ignored', rawType: 'customer.created' });
  });

  it('throws a non-signature error for a signed event with an unexpected shape', () => {
    const bad = event('payment_intent.succeeded', { id: 'pi_1' });
    let thrown: unknown;
    try {
      gateway.parseWebhook(bad, header(bad));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(PaymentSignatureError);
  });
});

function stubClient() {
  const create = vi.fn<StripeClientLike['paymentIntents']['create']>();
  const cancel = vi.fn<StripeClientLike['paymentIntents']['cancel']>();
  const client: StripeClientLike = {
    paymentIntents: { create, cancel },
    webhooks: { constructEvent: () => Promise.reject(new Error('unused')) as never },
  };
  const logs = captureLogs();
  const gateway = createStripeGateway(
    { secretKey: new Secret('sk_test_stubbed'), webhookSecret: new Secret(WEBHOOK_SECRET), logger: createLogger({ level: 'debug', destination: logs.stream }) },
    () => client,
  );
  return { create, cancel, gateway, logs };
}

const input = {
  amountPence: 2499,
  currency: 'gbp' as const,
  orderId: '65a1b2c3d4e5f60718293a4b',
  orderNumber: '123456789012',
  receiptEmail: 'asha@example.com',
  idempotencyKey: 'humi-pi-key',
};

describe('createPaymentIntent (stubbed client)', () => {
  it('sends integer pence, gbp, automatic payment methods, metadata, receipt email and the idempotency key', async () => {
    const { create, gateway } = stubClient();
    create.mockResolvedValue({ id: 'pi_1', client_secret: 'pi_1_secret_abc' });

    await expect(gateway.createPaymentIntent(input)).resolves.toEqual({ id: 'pi_1', clientSecret: 'pi_1_secret_abc' });
    expect(create).toHaveBeenCalledWith(
      {
        amount: 2499,
        currency: 'gbp',
        automatic_payment_methods: { enabled: true },
        receipt_email: 'asha@example.com',
        metadata: { orderId: input.orderId, orderNumber: '123456789012', source: 'humi-mobile-app' },
      },
      { idempotencyKey: 'humi-pi-key' },
    );
    expect(gateway.enabled).toBe(true);
  });

  it.each([0, -5, 12.5, Number.NaN])('rejects amount %s before calling Stripe', async (amountPence) => {
    const { create, gateway } = stubClient();
    await expect(gateway.createPaymentIntent({ ...input, amountPence })).rejects.toThrow(RangeError);
    expect(create).not.toHaveBeenCalled();
  });

  it('maps provider failures to a safe 502 and never leaks Stripe details to the client or the logs', async () => {
    const { create, gateway, logs } = stubClient();
    const stripeError = new Stripe.errors.StripeAPIError({
      type: 'api_error',
      message: 'Invalid API Key provided: sk_test_SECRETKEYLEAK',
      code: 'api_key_expired',
      request_log_url: 'https://dashboard.stripe.com/logs/req_leak',
    });
    create.mockRejectedValue(stripeError);

    const error = await gateway.createPaymentIntent(input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 502, code: 'payment_provider_error' });
    expect((error as AppError).message).not.toMatch(/sk_|Stripe|req_|key/i);
    expect(JSON.stringify((error as AppError).details ?? null)).not.toMatch(/sk_|req_/);
    expect(logs.text()).not.toContain('SECRETKEYLEAK');
    expect(logs.text()).toContain('stripeCode');
  });

  it('maps non-Stripe failures and a missing client secret the same way', async () => {
    const { create, gateway } = stubClient();
    create.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(gateway.createPaymentIntent(input)).rejects.toMatchObject({ status: 502, code: 'payment_provider_error' });
    create.mockResolvedValueOnce({ id: 'pi_2', client_secret: null });
    await expect(gateway.createPaymentIntent(input)).rejects.toMatchObject({ status: 502, code: 'payment_provider_error' });
  });
});

describe('cancelPaymentIntent (stubbed client)', () => {
  it('cancels an open intent', async () => {
    const { cancel, gateway } = stubClient();
    cancel.mockResolvedValue({});
    await gateway.cancelPaymentIntent('pi_1');
    expect(cancel).toHaveBeenCalledWith('pi_1', { cancellation_reason: 'abandoned' });
  });

  it.each(['payment_intent_unexpected_state', 'resource_missing'])('tolerates %s (already final or gone)', async (code) => {
    const { cancel, gateway } = stubClient();
    cancel.mockRejectedValue(new Stripe.errors.StripeInvalidRequestError({ type: 'invalid_request_error', message: 'x', code }));
    await expect(gateway.cancelPaymentIntent('pi_1')).resolves.toBeUndefined();
  });

  it('surfaces other failures as a safe 502', async () => {
    const { cancel, gateway } = stubClient();
    cancel.mockRejectedValueOnce(new Stripe.errors.StripeAPIError({ type: 'api_error', message: 'boom', code: 'lock_timeout' }));
    await expect(gateway.cancelPaymentIntent('pi_1')).rejects.toMatchObject({ status: 502, code: 'payment_provider_error' });
    cancel.mockRejectedValueOnce(new Error('network'));
    await expect(gateway.cancelPaymentIntent('pi_1')).rejects.toMatchObject({ status: 502 });
  });
});

describe('createDisabledGateway', () => {
  it('is disabled, refuses to create intents with a 503, and verifies nothing', async () => {
    const gateway = createDisabledGateway();
    expect(gateway.enabled).toBe(false);
    await expect(gateway.createPaymentIntent(input)).rejects.toMatchObject({
      status: 503,
      code: 'payment_provider_error',
      message: 'Payments are not configured',
    });
    await expect(gateway.cancelPaymentIntent('pi_1')).resolves.toBeUndefined();
    expect(() => gateway.parseWebhook('{}', 't=1,v1=ab')).toThrow(PaymentSignatureError);
  });
});

describe('default client factory', () => {
  it('builds a real SDK client without any network access', () => {
    const gateway = createStripeGateway({
      secretKey: new Secret('sk_test_never_used'),
      webhookSecret: new Secret(WEBHOOK_SECRET),
      logger: createLogger({ level: 'silent' }),
    });
    const body = event('payment_intent.canceled', { id: 'pi_9', metadata: {} });
    expect(gateway.parseWebhook(body, header(body)).type).toBe('payment_intent.canceled');
  });
});
