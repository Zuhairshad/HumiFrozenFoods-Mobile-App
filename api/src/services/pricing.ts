import type { BusinessConfig, CartLineInput, PricedLine, ProductRecord, UnavailableLine } from '../domain/types.js';
import type { Clock, PricingService, ProductsRepository, QuoteResult } from '../domain/ports.js';
import { multiply, pence, subtract, sum, type Pence } from '../lib/money.js';
import { applyPromo, normalisePromoCode } from './promo.js';

export interface PricingDeps {
  products: ProductsRepository;
  business: BusinessConfig;
  clock: Clock;
}

/** Sums quantities per product, keeping first-seen order. */
function mergeLines(lines: readonly CartLineInput[]): CartLineInput[] {
  const merged = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      throw new RangeError('Cart line quantity must be a positive integer');
    }
    merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity);
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

function isAvailable(product: ProductRecord, quantity: number): boolean {
  if (!product.inStock) return false;
  return product.stock === null || quantity <= product.stock;
}

function priceLine(product: ProductRecord, quantity: number): PricedLine {
  const unitPricePence = pence(product.pricePence);
  return {
    productId: product.id,
    sourceId: product.sourceId,
    name: product.name,
    image: product.image?.thumbnail ?? null,
    unitPricePence,
    quantity,
    lineTotalPence: multiply(unitPricePence, quantity),
  };
}

function baseDelivery(subtotal: Pence, hasLines: boolean, delivery: BusinessConfig['delivery']): Pence {
  if (!hasLines) return pence(0);
  const { freeThresholdPence, feePence } = delivery;
  return freeThresholdPence !== null && subtotal >= freeThresholdPence ? pence(0) : pence(feePence);
}

export function createPricingService(deps: PricingDeps): PricingService {
  const { products, business, clock } = deps;

  return {
    async quote(input): Promise<QuoteResult> {
      const merged = mergeLines(input.lines);
      const found = merged.length === 0 ? [] : await products.findManyBySlugs(merged.map((l) => l.productId));
      const bySlug = new Map(found.map((p) => [p.id, p]));

      const lines: PricedLine[] = [];
      const unavailable: UnavailableLine[] = [];
      for (const { productId, quantity } of merged) {
        const product = bySlug.get(productId);
        if (!product) unavailable.push({ productId, reason: 'not_found' });
        else if (!isAvailable(product, quantity)) unavailable.push({ productId, reason: 'out_of_stock' });
        else lines.push(priceLine(product, quantity));
      }

      const subtotalPence = sum(lines.map((l) => pence(l.lineTotalPence)));
      const threshold = business.delivery.freeThresholdPence;
      const standardDelivery = baseDelivery(subtotalPence, lines.length > 0, business.delivery);

      const code = normalisePromoCode(input.promoCode);
      const outcome = code
        ? applyPromo({
            code,
            promoCodes: business.promoCodes,
            subtotalPence,
            deliveryPence: standardDelivery,
            now: clock.now(),
          })
        : null;

      const discountPence = outcome?.discountPence ?? pence(0);
      const deliveryPence = outcome?.deliveryPence ?? standardDelivery;
      const totalPence = sum([subtract(subtotalPence, discountPence), deliveryPence]);

      return {
        pricing: {
          subtotalPence,
          deliveryPence,
          discountPence,
          totalPence,
          currency: 'gbp',
          promoCode: outcome?.promo.valid ? outcome.promo.code : null,
          freeDeliveryRemainingPence: threshold === null ? 0 : Math.max(0, threshold - subtotalPence),
        },
        lines,
        unavailable,
        promo: outcome?.promo ?? null,
      };
    },
  };
}
