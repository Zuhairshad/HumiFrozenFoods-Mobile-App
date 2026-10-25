import { bestSellersOf, findProduct } from '@/data/selectors';
import type { Order, Product } from '@/types';

export interface BuyAgainItem {
  product: Product;
  /** Quantity on the most recent order containing the product. */
  quantity: number;
}

/** Unique products from past orders, most recent first. Falls back to nothing (callers show best sellers). */
export function selectBuyAgain(orders: Order[], products: readonly Product[], limit = 8): BuyAgainItem[] {
  const seen = new Set<string>();
  const out: BuyAgainItem[] = [];
  for (const order of orders) {
    for (const line of order.lines) {
      if (seen.has(line.productId)) continue;
      const product = findProduct(products, line.productId);
      if (!product) continue;
      seen.add(line.productId);
      out.push({ product, quantity: line.quantity });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Products tagged "New", else the 6 newest by data order (end of the list is newest). */
export function selectNewThisWeek(products: readonly Product[], limit = 6): Product[] {
  const tagged = products.filter((p) => p.tags.includes('New'));
  if (tagged.length > 0) return tagged.slice(0, limit);
  return products.slice(-limit).reverse();
}

/** Top Picks: ranks 1-9, or the next 9 when the first shelf already shows the top best sellers. */
export function selectTopPicks(products: readonly Product[], skipTop: boolean): Product[] {
  const ranked = bestSellersOf(products, 18);
  return skipTop ? ranked.slice(8, 17) : ranked.slice(0, 9);
}

export function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

export function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "Saturday 24 October" (manual so it is identical on every JS engine). Uppercased by the text style. */
export function dateLineFor(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}
