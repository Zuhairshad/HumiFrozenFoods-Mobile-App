/** Wire shapes used by the e2e assertions (contract §2). Deliberately loose where the test does not care. */
export interface ErrorBody {
  error: { code: string; message: string; requestId: string; details?: unknown };
}

export interface ProductBody {
  id: string;
  sourceId: string;
  name: string;
  description: string;
  pricePence: number;
  compareAtPricePence: number | null;
  unit: string | null;
  image: { thumbnail: string; original: string } | null;
  gallery: string[];
  inStock: boolean;
  lowStock: boolean;
  collection: string;
  categories: { id: string; name: string; slug: string }[];
  rating: number;
  reviewCount: number;
}

export interface PricingBody {
  subtotalPence: number;
  deliveryPence: number;
  discountPence: number;
  totalPence: number;
  currency: 'gbp';
  promoCode: string | null;
  freeDeliveryRemainingPence: number;
}

export interface PricedLineBody {
  productId: string;
  name: string;
  image: string | null;
  unitPricePence: number;
  quantity: number;
  lineTotalPence: number;
}

export interface QuoteBody {
  pricing: PricingBody;
  lines: PricedLineBody[];
  unavailable: { productId: string; reason: string }[];
  promo?: { code: string; valid: boolean; message?: string };
}

export interface CheckoutBody {
  orderId: string;
  orderNumber: string;
  guestToken: string;
  clientSecret: string;
  pricing: PricingBody;
  lines: PricedLineBody[];
}

export interface OrderBody {
  orderId: string;
  orderNumber: string;
  placedAt: string;
  status: string;
  paymentStatus: string;
  lines: (PricedLineBody & { sourceId?: string })[];
  pricing: PricingBody;
  contact: { name: string; email: string; phone: string };
  address: { line1: string; line2?: string; city: string; postcode: string };
  slot: { date: string; window: string };
  notes?: string;
}

export interface WebhookAck {
  received: boolean;
  outcome: 'ignored' | 'applied' | 'duplicate';
}

export interface ProductListBody {
  items: ProductBody[];
  nextCursor: string | null;
}
