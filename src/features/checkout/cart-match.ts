export interface LineLike {
  productId: string;
  quantity: number;
}

/**
 * True when the cart holds exactly the items (and quantities) of a just-confirmed order. Used after an order
 * is promoted to paid on app launch: if the customer paid and the app died before clearing the cart, the
 * leftover cart would invite a second purchase. A cart the customer has since changed is never touched.
 */
export function cartMatchesOrder(cart: readonly LineLike[], order: readonly LineLike[]): boolean {
  if (cart.length === 0 || cart.length !== order.length) return false;
  const wanted = new Map<string, number>();
  for (const l of order) wanted.set(l.productId, (wanted.get(l.productId) ?? 0) + l.quantity);
  const have = new Map<string, number>();
  for (const l of cart) have.set(l.productId, (have.get(l.productId) ?? 0) + l.quantity);
  if (wanted.size !== have.size) return false;
  for (const [id, qty] of wanted) if (have.get(id) !== qty) return false;
  return true;
}
