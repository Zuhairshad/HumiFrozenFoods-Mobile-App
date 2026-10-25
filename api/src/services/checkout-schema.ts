import { z } from 'zod';

const MAX_LINES = 30;
const MAX_PER_PRODUCT = 20;

// Unicode Cc: C0/C1 controls and DEL. Newlines are rejected too (contract: control characters rejected).
const CONTROL_CHARS = /\p{Cc}/u;

const text = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !CONTROL_CHARS.test(value), 'Contains invalid characters');

const optionalText = (max: number) => text(max, 0).transform((value) => (value === '' ? undefined : value)).optional();

// Royal Mail format: outward code (A9, A99, AA9, AA99, A9A, AA9A) + inward code (9AA); GIR 0AA is the special case.
const UK_POSTCODE =
  /^(?:GIR0AA|[A-PR-UWYZ](?:[0-9]{1,2}|[A-HK-Y][0-9]{1,2}|[0-9][A-HJKPSTUW]|[A-HK-Y][0-9][ABEHMNPRV-Y])[0-9][ABD-HJLNP-UW-Z]{2})$/;

/** 'sw1a1aa', ' sw1a  1aa ' -> 'SW1A 1AA'; returns null when it is not a UK postcode. */
export function normalisePostcode(input: string): string | null {
  const compact = input.replace(/\s+/g, '').toUpperCase();
  if (!UK_POSTCODE.test(compact)) return null;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

const lineSchema = z.strictObject({
  productId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,100}$/, 'Invalid product id'),
  quantity: z.number().int().min(1).max(MAX_PER_PRODUCT),
});

const contactSchema = z.strictObject({
  name: text(80),
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email('Enter a valid email'))
    .transform((value) => value.toLowerCase()),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[0-9+() -]+$/, 'Enter a valid phone number')
    .refine((value) => value.replace(/\D/g, '').length >= 7, 'Enter a valid phone number'),
});

const addressSchema = z.strictObject({
  line1: text(80),
  line2: optionalText(80),
  city: text(80),
  postcode: z
    .string()
    .trim()
    .max(12)
    .transform((value, ctx) => {
      const normalised = normalisePostcode(value);
      if (normalised === null) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid UK postcode' });
        return z.NEVER;
      }
      return normalised;
    }),
});

const slotSchema = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  window: z.enum(['morning', 'afternoon', 'evening']),
});

export const paymentIntentBodySchema = z
  .strictObject({
    lines: z.array(lineSchema).min(1).max(MAX_LINES),
    promoCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,32}$/, 'Invalid promo code')
      .optional(),
    contact: contactSchema,
    address: addressSchema,
    slot: slotSchema,
    notes: optionalText(300),
  })
  .superRefine((body, ctx) => {
    const totals = new Map<string, number>();
    body.lines.forEach((line, index) => {
      const total = (totals.get(line.productId) ?? 0) + line.quantity;
      totals.set(line.productId, total);
      if (total > MAX_PER_PRODUCT && total - line.quantity <= MAX_PER_PRODUCT) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', index, 'quantity'],
          message: `At most ${String(MAX_PER_PRODUCT)} of each product`,
        });
      }
    });
  });

export type PaymentIntentBody = z.output<typeof paymentIntentBodySchema>;

export const IDEMPOTENCY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
