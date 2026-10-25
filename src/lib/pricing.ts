/**
 * Pure ESTIMATE helper. The server (POST /v1/checkout/quote) is the only price authority;
 * nothing here may be shown as a final figure. The delivery rule is injected: it comes from
 * GET /v1/config, or from FALLBACK_DELIVERY_RULE (the API's own defaults) before the first fetch.
 */
export interface DeliveryRule {
  feePence: number;
  /** null = delivery is never free. */
  freeThresholdPence: number | null;
}

/** API defaults (docs/api-contract.md section 5). Used ONLY for estimates until /v1/config answers. */
export const FALLBACK_DELIVERY_RULE: DeliveryRule = { feePence: 799, freeThresholdPence: 5000 };

export const roundMoney = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface EstimateTotals {
  subtotalPence: number;
  deliveryPence: number;
  /** Always 0: discounts are only known to the server. */
  discountPence: number;
  totalPence: number;
  freeDeliveryRemainingPence: number;
}

export function estimateTotalsPence(
  lines: { unitPricePence: number; quantity: number }[],
  rule: DeliveryRule = FALLBACK_DELIVERY_RULE,
): EstimateTotals {
  const subtotalPence = lines.reduce((s, l) => s + Math.round(l.unitPricePence) * l.quantity, 0);
  const free = rule.freeThresholdPence !== null && subtotalPence >= rule.freeThresholdPence;
  const deliveryPence = subtotalPence === 0 || free ? 0 : rule.feePence;
  const freeDeliveryRemainingPence =
    rule.freeThresholdPence === null ? 0 : Math.max(0, rule.freeThresholdPence - subtotalPence);
  return { subtotalPence, deliveryPence, discountPence: 0, totalPence: subtotalPence + deliveryPence, freeDeliveryRemainingPence };
}

export interface Totals {
  subtotal: number;
  delivery: number;
  discount: number;
  total: number;
  freeDeliveryRemaining: number;
}

/** Pounds-based wrapper kept for `useCart`. `promoApplied` is ignored: the client cannot know a discount. */
export function computeTotals(
  lines: { price: number; quantity: number }[],
  opts?: { promoApplied?: boolean; rule?: DeliveryRule },
): Totals {
  const t = estimateTotalsPence(
    lines.map((l) => ({ unitPricePence: Math.round(l.price * 100), quantity: l.quantity })),
    opts?.rule,
  );
  return {
    subtotal: t.subtotalPence / 100,
    delivery: t.deliveryPence / 100,
    discount: 0,
    total: t.totalPence / 100,
    freeDeliveryRemaining: t.freeDeliveryRemainingPence / 100,
  };
}
