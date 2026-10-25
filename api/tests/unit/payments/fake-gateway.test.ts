import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { PaymentSignatureError } from '../../../src/domain/ports.js';
import { createFakeGateway } from '../../../src/payments/fake-gateway.js';
import { createStripeGateway } from '../../../src/payments/stripe-gateway.js';
import { createLogger } from '../../../src/lib/logger.js';
import { Secret } from '../../../src/lib/secret.js';

const body = JSON.stringify({
  id: 'evt_1',
  type: 'payment_intent.succeeded',
  data: { object: { id: 'pi_1', amount_received: 100, currency: 'gbp', metadata: { source: 'humi-mobile-app' } } },
});
const input = {
  amountPence: 500,
  currency: 'gbp' as const,
  orderId: 'o1',
  orderNumber: '1',
  receiptEmail: 'a@b.co',
  idempotencyKey: 'k1',
};

describe('fake gateway', () => {
  it('creates deterministic, idempotent intents and records them', async () => {
    const gateway = createFakeGateway();
    const first = await gateway.createPaymentIntent(input);
    expect(first).toEqual({ id: 'pi_fake_000001', clientSecret: 'pi_fake_000001_secret_fake' });
    expect(await gateway.createPaymentIntent(input)).toEqual(first);
    expect((await gateway.createPaymentIntent({ ...input, idempotencyKey: 'k2' })).id).toBe('pi_fake_000002');
    expect(gateway.intents.get('pi_fake_000001')).toMatchObject({ amountPence: 500, status: 'requires_payment_method' });
  });

  it('cancels known intents and ignores unknown ones', async () => {
    const gateway = createFakeGateway();
    const { id } = await gateway.createPaymentIntent(input);
    await gateway.cancelPaymentIntent(id);
    await gateway.cancelPaymentIntent('pi_unknown');
    expect(gateway.intents.get(id)?.status).toBe('canceled');
  });

  it('verifies its own signatures and rejects bad ones', () => {
    const gateway = createFakeGateway();
    expect(gateway.parseWebhook(body, gateway.sign(body))).toMatchObject({ type: 'payment_intent.succeeded', amountReceivedPence: 100 });
    expect(() => gateway.parseWebhook(body + ' ', gateway.sign(body))).toThrow(PaymentSignatureError);
    expect(() => gateway.parseWebhook(body, undefined)).toThrow(PaymentSignatureError);
    expect(() => gateway.parseWebhook(body, 'nonsense')).toThrow(PaymentSignatureError);
    expect(() => gateway.parseWebhook(body, `t=1,v1=${'0'.repeat(64)}`)).toThrow(PaymentSignatureError);
    expect(() => gateway.parseWebhook(body, `t=1,v1=nothex`)).toThrow(PaymentSignatureError);
    const stale = gateway.sign(body, Math.floor(Date.now() / 1000) - 400);
    expect(() => gateway.parseWebhook(body, stale)).toThrow(PaymentSignatureError);
  });

  it('rejects a signed but non-JSON body and a different secret', () => {
    const gateway = createFakeGateway();
    expect(() => gateway.parseWebhook('nope', gateway.sign('nope'))).toThrow(PaymentSignatureError);
    const other = createFakeGateway({ webhookSecret: 'another' });
    expect(() => gateway.parseWebhook(body, other.sign(body))).toThrow(PaymentSignatureError);
  });

  it('produces signatures that the real stripe-node accepts (same scheme)', () => {
    const secret = 'whsec_shared_between_fake_and_real';
    const fake = createFakeGateway({ webhookSecret: secret });
    const real = createStripeGateway(
      { secretKey: new Secret('sk_test_x'), webhookSecret: new Secret(secret), logger: createLogger({ level: 'silent' }) },
      () => new Stripe('sk_test_x'),
    );
    expect(real.parseWebhook(body, fake.sign(body))).toEqual(fake.parseWebhook(body, fake.sign(body)));
    const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret });
    expect(fake.parseWebhook(body, header).type).toBe('payment_intent.succeeded');
  });
});
