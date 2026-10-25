import type { Logger } from 'pino';
import Stripe from 'stripe';
import type {
  CreatePaymentIntentInput,
  PaymentEvent,
  PaymentGateway,
  PaymentIntentResult,
} from '../domain/ports.js';
import { PaymentSignatureError } from '../domain/ports.js';
import { AppError } from '../lib/errors.js';
import type { Secret } from '../lib/secret.js';
import { normalizeStripeEvent, PAYMENT_SOURCE, WEBHOOK_TOLERANCE_SECONDS } from './stripe-event.js';

/** The slice of the Stripe SDK this gateway uses, so tests can inject a stub and never touch the network. */
export interface StripeClientLike {
  paymentIntents: {
    create(
      params: Stripe.PaymentIntentCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<{ id: string; client_secret: string | null }>;
    cancel(id: string, params?: Stripe.PaymentIntentCancelParams, options?: Stripe.RequestOptions): Promise<unknown>;
  };
  webhooks: {
    constructEvent(payload: string, header: string, secret: string, tolerance?: number): Stripe.Event;
  };
}

export type StripeClientFactory = (secretKey: string) => StripeClientLike;

// Short timeout leaves room inside the 10 s request budget; the SDK reuses the idempotency key on its one retry.
const defaultFactory: StripeClientFactory = (secretKey) =>
  new Stripe(secretKey, { timeout: 8_000, maxNetworkRetries: 1, appInfo: { name: 'humis-api' } });

export interface StripeGatewayOptions {
  secretKey: Secret;
  webhookSecret: Secret;
  logger: Logger;
}

export const PROVIDER_ERROR_CODE = 'payment_provider_error';
const SAFE_PROVIDER_MESSAGE = 'The payment provider is unavailable. Please try again.';

// Stripe codes meaning "nothing left to cancel": the intent is already final or gone.
const TOLERATED_CANCEL_CODES: ReadonlySet<string> = new Set(['payment_intent_unexpected_state', 'resource_missing']);

function providerError(cause: unknown): AppError {
  return new AppError(502, PROVIDER_ERROR_CODE, SAFE_PROVIDER_MESSAGE, { cause });
}

/** Stripe's raw message and ids are never sent to clients; logs get only the classification. */
function describeStripeError(error: unknown): Record<string, unknown> {
  if (error instanceof Stripe.errors.StripeError) {
    return {
      stripeType: error.type,
      stripeCode: error.code,
      statusCode: error.statusCode,
      stripeRequestId: error.requestId,
    };
  }
  return { errorName: error instanceof Error ? error.name : typeof error };
}

export function createStripeGateway(
  options: StripeGatewayOptions,
  clientFactory: StripeClientFactory = defaultFactory,
): PaymentGateway {
  const { logger } = options;
  const stripe = clientFactory(options.secretKey.reveal());

  return {
    enabled: true,

    async createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult> {
      if (!Number.isSafeInteger(input.amountPence) || input.amountPence <= 0) {
        throw new RangeError('amountPence must be a positive integer');
      }
      try {
        const intent = await stripe.paymentIntents.create(
          {
            amount: input.amountPence,
            currency: input.currency,
            automatic_payment_methods: { enabled: true },
            receipt_email: input.receiptEmail,
            metadata: { orderId: input.orderId, orderNumber: input.orderNumber, source: PAYMENT_SOURCE },
          },
          { idempotencyKey: input.idempotencyKey },
        );
        if (!intent.client_secret) throw new Error('PaymentIntent has no client secret');
        return { id: intent.id, clientSecret: intent.client_secret };
      } catch (error) {
        logger.error({ ...describeStripeError(error), orderId: input.orderId }, 'stripe createPaymentIntent failed');
        throw providerError(error);
      }
    },

    async cancelPaymentIntent(paymentIntentId: string): Promise<void> {
      try {
        await stripe.paymentIntents.cancel(paymentIntentId, { cancellation_reason: 'abandoned' });
      } catch (error) {
        if (error instanceof Stripe.errors.StripeError && error.code && TOLERATED_CANCEL_CODES.has(error.code)) {
          logger.debug({ stripeCode: error.code }, 'stripe cancelPaymentIntent: already final');
          return;
        }
        logger.error({ ...describeStripeError(error) }, 'stripe cancelPaymentIntent failed');
        throw providerError(error);
      }
    },

    parseWebhook(rawBody: string, signatureHeader: string | undefined): PaymentEvent {
      if (!signatureHeader) throw new PaymentSignatureError('Missing webhook signature');
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          rawBody,
          signatureHeader,
          options.webhookSecret.reveal(),
          WEBHOOK_TOLERANCE_SECONDS,
        );
      } catch {
        // Bad signature, stale timestamp, malformed header or unparsable body: all the same to the caller.
        throw new PaymentSignatureError();
      }
      return normalizeStripeEvent(event);
    },
  };
}

export function createDisabledGateway(): PaymentGateway {
  return {
    enabled: false,
    createPaymentIntent() {
      return Promise.reject(new AppError(503, PROVIDER_ERROR_CODE, 'Payments are not configured'));
    },
    cancelPaymentIntent() {
      return Promise.resolve();
    },
    parseWebhook() {
      throw new PaymentSignatureError('Payments are not configured');
    },
  };
}
