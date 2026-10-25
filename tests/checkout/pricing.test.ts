import { describe, expect, it } from 'vitest';
import { estimateTotalsPence, FALLBACK_DELIVERY_RULE } from '../../src/lib/pricing';

describe('estimateTotalsPence', () => {
  it('uses the injected rule', () => {
    const lines = [{ unitPricePence: 1000, quantity: 3 }];
    expect(estimateTotalsPence(lines, { feePence: 500, freeThresholdPence: 2500 }).deliveryPence).toBe(0);
    expect(estimateTotalsPence(lines, { feePence: 500, freeThresholdPence: 5000 })).toMatchObject({ deliveryPence: 500, totalPence: 3500, freeDeliveryRemainingPence: 2000 });
    expect(estimateTotalsPence(lines, { feePence: 500, freeThresholdPence: null }).deliveryPence).toBe(500);
  });
  it('fallback equals API defaults; empty cart costs nothing', () => {
    expect(FALLBACK_DELIVERY_RULE).toEqual({ feePence: 799, freeThresholdPence: 5000 });
    expect(estimateTotalsPence([]).totalPence).toBe(0);
  });
});
