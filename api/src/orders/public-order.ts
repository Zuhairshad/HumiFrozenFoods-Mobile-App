import type { Order, StoredOrder } from '../domain/types.js';

/**
 * Explicit whitelist of the public Order (contract §2). Internal fields (raw site statuses, payment intent id,
 * createdByApp) are left out by construction, not by deletion. The line's sourceId stays: the catalogue exposes it too.
 */
export function toPublicOrder(order: StoredOrder): Order {
  return {
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    placedAt: order.placedAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    lines: order.lines.map((l) => ({
      productId: l.productId,
      sourceId: l.sourceId,
      name: l.name,
      image: l.image,
      unitPricePence: l.unitPricePence,
      quantity: l.quantity,
      lineTotalPence: l.lineTotalPence,
    })),
    pricing: { ...order.pricing },
    contact: { ...order.contact },
    address: { ...order.address },
    slot: { ...order.slot },
    ...(order.notes === undefined ? {} : { notes: order.notes }),
  };
}
