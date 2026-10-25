import { useEffect, useMemo } from 'react';
import { useCart } from '@/hooks/useCart';
import { useCartStore } from '@/store/cart';
import { usePromoStore } from '@/store/promo';
import { useServerConfig } from '@/store/server-config';
import { isAppApiError } from '@/lib/api/errors';
import { useQuote, type UseQuoteResult } from './useQuote';

export const GENERIC_PROMO_MESSAGE = "That code isn't valid.";

export interface CartQuote extends UseQuoteResult {
  /** Promo row is shown only when the server config enables promos. */
  promoEnabled: boolean;
  /** Code the server accepted for this basket, else null. */
  appliedPromo: string | null;
  promoRejection: string | null;
  /** Some lines cannot be bought; checkout must stay blocked until they are removed. */
  hasUnavailable: boolean;
  /** Free delivery is possible at all (server threshold is not null). */
  freeThresholdPence: number | null;
}

/** Cart lines + promo + server config -> one quote. Single source for Cart and Checkout. */
export function useCartQuote(): CartQuote {
  const cart = useCart();
  const rawLines = useCartStore((s) => s.lines);
  const code = usePromoStore((s) => s.code);
  const rejection = usePromoStore((s) => s.rejection);
  const rejectPromo = usePromoStore((s) => s.reject);
  const { config } = useServerConfig();

  const priceById = useMemo(() => new Map(cart.lines.map((l) => [l.productId, Math.round(l.product.price * 100)])), [cart.lines]);
  const lines = useMemo(
    () => rawLines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPricePence: priceById.get(l.productId) })),
    [rawLines, priceById],
  );
  const promoEnabled = config.promo.enabled;
  const quote = useQuote(lines, promoEnabled ? code : null);

  // The server decides: a rejected code (or a 400 on the promo field) is dropped and its message shown inline.
  const promo = quote.promo;
  const promoFieldError = isAppApiError(quote.error) && quote.error.code === 'validation_failed'
    ? Object.entries(quote.error.fieldErrors).find(([p]) => p.endsWith('promoCode'))?.[1]
    : undefined;
  useEffect(() => {
    if (code && promo && !promo.valid && promo.code.toLowerCase() === code.toLowerCase()) {
      rejectPromo(promo.message?.trim() || GENERIC_PROMO_MESSAGE);
    } else if (code && promoFieldError) {
      rejectPromo(GENERIC_PROMO_MESSAGE);
    }
  }, [code, promo, promoFieldError, rejectPromo]);

  const appliedPromo = promo?.valid ? promo.code : null;
  return {
    ...quote,
    promoEnabled,
    appliedPromo,
    promoRejection: rejection,
    hasUnavailable: quote.unavailable.length > 0,
    freeThresholdPence: config.delivery.freeThresholdPence,
  };
}
