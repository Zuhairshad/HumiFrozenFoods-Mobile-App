import { applyBasisPoints, formatGBP, pence, type Pence } from '../lib/money.js';
import type { PromoCode } from '../domain/types.js';

export interface PromoVerdict {
  code: string;
  valid: boolean;
  message: string;
}

export interface PromoInput {
  code: string;
  promoCodes: readonly PromoCode[];
  subtotalPence: Pence;
  deliveryPence: Pence;
  now: Date;
}

export interface PromoOutcome {
  promo: PromoVerdict;
  discountPence: Pence;
  deliveryPence: Pence;
}

const ZERO = pence(0);

/** Trimmed and upper-cased; null when nothing usable was supplied. */
export function normalisePromoCode(raw: string | undefined): string | null {
  const code = raw?.trim().toUpperCase() ?? '';
  return code === '' ? null : code;
}

function isExpired(promo: PromoCode, now: Date): boolean {
  if (promo.expiresAt === undefined) return false;
  const expiresAt = Date.parse(promo.expiresAt);
  // An unparseable expiry fails closed rather than granting a discount forever.
  return Number.isNaN(expiresAt) || now.getTime() >= expiresAt;
}

function discountFor(promo: PromoCode, subtotal: Pence): Pence {
  if (promo.kind === 'free_shipping') return ZERO;
  const raw = promo.kind === 'percentage' ? applyBasisPoints(subtotal, promo.value * 100, 'half-up') : pence(promo.value);
  return pence(Math.min(Math.max(raw, 0), subtotal));
}

/**
 * Pure promo evaluation. Unknown codes give one fixed message so responses never
 * reveal which codes exist, and an invalid code never changes any amount.
 */
export function applyPromo(input: PromoInput): PromoOutcome {
  const { code, subtotalPence, deliveryPence, now } = input;
  const reject = (message: string): PromoOutcome => ({
    promo: { code, valid: false, message },
    discountPence: ZERO,
    deliveryPence,
  });

  const promo = input.promoCodes.find((candidate) => candidate.code.toUpperCase() === code);
  if (!promo) return reject('That code is not valid.');
  if (isExpired(promo, now)) return reject('This code has expired.');
  if (promo.minSubtotalPence !== undefined && subtotalPence < promo.minSubtotalPence) {
    return reject(`Spend ${formatGBP(pence(promo.minSubtotalPence))} or more to use this code.`);
  }

  if (promo.kind === 'free_shipping') {
    return { promo: { code, valid: true, message: 'Free delivery applied.' }, discountPence: ZERO, deliveryPence: ZERO };
  }
  return {
    promo: { code, valid: true, message: 'Code applied.' },
    discountPence: discountFor(promo, subtotalPence),
    deliveryPence,
  };
}
