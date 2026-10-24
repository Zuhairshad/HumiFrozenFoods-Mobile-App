import type { CartLineWithProduct } from '@/hooks/useCart';
import type { OrderDraft } from '@/lib/api/types';
import { PROMO_CODE } from '@/lib/pricing';
import type { SlotSelection } from './CheckoutForm';
import { normalisePostcode, type CheckoutFormValues } from './validation';

/** Builds the request the server prices. Carries ids + quantities only, never prices. */
export function buildOrderDraft(
  values: CheckoutFormValues,
  slot: Required<{ [K in keyof SlotSelection]: NonNullable<SlotSelection[K]> }>,
  lines: CartLineWithProduct[],
  promoApplied: boolean,
): OrderDraft {
  const line2 = values.line2.trim();
  const notes = values.notes.trim();
  return {
    lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    promoCode: promoApplied ? PROMO_CODE : undefined,
    contact: { name: values.name.trim(), email: values.email.trim(), phone: values.phone.trim() },
    address: {
      line1: values.line1.trim(),
      line2: line2 || undefined,
      city: values.city.trim(),
      postcode: normalisePostcode(values.postcode),
    },
    slot: { date: slot.date, window: slot.window },
    notes: notes || undefined,
  };
}
