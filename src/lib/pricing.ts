// Mirrors siteInfo in '@/data' (kept local so pricing stays a dependency-free pure module).
export const FREE_DELIVERY_THRESHOLD = 25;
export const DELIVERY_FEE = 3.99;
export const PROMO_CODE = 'HUMI15';
export const PROMO_PERCENT = 15;

export const roundMoney = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function isValidPromo(code: string): boolean {
  return code.trim().toUpperCase() === PROMO_CODE;
}

export interface Totals {
  subtotal: number;
  delivery: number;
  discount: number;
  total: number;
  freeDeliveryRemaining: number;
}

export function computeTotals(
  lines: { price: number; quantity: number }[],
  opts?: { promoApplied?: boolean },
): Totals {
  const subtotal = roundMoney(lines.reduce((sum, l) => sum + l.price * l.quantity, 0));
  const discount = opts?.promoApplied ? roundMoney((subtotal * PROMO_PERCENT) / 100) : 0;
  const delivery = subtotal === 0 || subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
  const total = roundMoney(subtotal - discount + delivery);
  const freeDeliveryRemaining =
    subtotal === 0 ? FREE_DELIVERY_THRESHOLD : roundMoney(Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal));
  return { subtotal, delivery, discount, total, freeDeliveryRemaining };
}
