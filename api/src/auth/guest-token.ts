import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Keyring } from './keyring.js';

const VERSION = 'hgt1';
const MAX_TOKEN_LENGTH = 512;
const FUTURE_IAT_LEEWAY_SECONDS = 60;
const ORDER_ID = /^[A-Za-z0-9_-]{1,64}$/;

const payloadSchema = z.strictObject({
  oid: z.string().regex(ORDER_ID),
  scope: z.literal('guest-order'),
  iat: z.number().int(),
  exp: z.number().int(),
});

export type GuestTokenFailure =
  | 'malformed'
  | 'unknown_kid'
  | 'bad_signature'
  | 'expired'
  | 'not_yet_valid'
  | 'wrong_order';

export type GuestTokenResult =
  | { ok: true; orderId: string; expiresAt: Date; kid: string }
  | { ok: false; reason: GuestTokenFailure };

export interface IssuedGuestToken {
  token: string;
  expiresAt: Date;
}

export interface GuestTokenService {
  issue(orderId: string): IssuedGuestToken;
  /** Verifies signature, expiry and, when given, that the token was issued for `expectedOrderId`. */
  verify(token: string, expectedOrderId?: string): GuestTokenResult;
}

export interface GuestTokenOptions {
  keyring: Keyring;
  ttlSeconds: number;
  /** Epoch milliseconds; injectable for tests. */
  now?: () => number;
}

const fail = (reason: GuestTokenFailure): GuestTokenResult => ({ ok: false, reason });

/**
 * Token layout: `hgt1.<kid>.<base64url(payload JSON)>.<base64url(HMAC-SHA256)>`.
 * The MAC covers the version, kid and payload, so none can be altered.
 * Tokens are bearer credentials scoped to one order; they grant read access
 * only and should be sent in the Authorization header, never in URLs.
 */
export function createGuestTokenService(options: GuestTokenOptions): GuestTokenService {
  const { keyring, ttlSeconds } = options;
  const now = options.now ?? Date.now;

  return {
    issue(orderId) {
      if (!ORDER_ID.test(orderId)) throw new RangeError('Invalid order id for guest token');
      const iat = Math.floor(now() / 1000);
      const exp = iat + ttlSeconds;
      const payload = Buffer.from(JSON.stringify({ oid: orderId, scope: 'guest-order', iat, exp })).toString('base64url');
      const signingInput = `${VERSION}.${keyring.activeKid}.${payload}`;
      const mac = keyring.hmac(keyring.activeKid, signingInput);
      if (!mac) throw new Error('Active key missing from keyring');
      return { token: `${signingInput}.${mac.toString('base64url')}`, expiresAt: new Date(exp * 1000) };
    },

    verify(token, expectedOrderId) {
      if (token.length > MAX_TOKEN_LENGTH) return fail('malformed');
      const parts = token.split('.');
      const [version, kid, encodedPayload, encodedMac] = parts;
      if (parts.length !== 4 || version !== VERSION || !kid || !encodedPayload || !encodedMac) {
        return fail('malformed');
      }

      const expected = keyring.hmac(kid, `${version}.${kid}.${encodedPayload}`);
      if (!expected) return fail('unknown_kid');
      const provided = Buffer.from(encodedMac, 'base64url');
      // Node's decoder ignores padding bits and '=' padding, so several spellings decode to the same bytes.
      // Accept only the canonical one: a token has exactly one valid form, which closes signature malleability.
      if (
        provided.length !== expected.length ||
        provided.toString('base64url') !== encodedMac ||
        !timingSafeEqual(provided, expected)
      ) {
        return fail('bad_signature');
      }

      const payload = parsePayload(encodedPayload);
      if (!payload) return fail('malformed');

      const nowSeconds = Math.floor(now() / 1000);
      if (payload.iat > nowSeconds + FUTURE_IAT_LEEWAY_SECONDS) return fail('not_yet_valid');
      if (payload.exp <= nowSeconds) return fail('expired');
      if (expectedOrderId !== undefined && !safeEqual(payload.oid, expectedOrderId)) return fail('wrong_order');

      return { ok: true, orderId: payload.oid, expiresAt: new Date(payload.exp * 1000), kid };
    },
  };
}

function parsePayload(encoded: string): z.infer<typeof payloadSchema> | undefined {
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
