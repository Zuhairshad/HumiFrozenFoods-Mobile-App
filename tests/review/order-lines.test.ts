import { describe, expect, it, vi } from 'vitest';
import { linesFromApi } from '../../src/features/account/order-mapping';

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: async () => false,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

// vi.mock is hoisted above the imports by vitest.
describe('linesFromApi', () => {
  it('shows server ALL-CAPS product names in normal case and converts pence to pounds', () => {
    const [line] = linesFromApi([
      { productId: 'aloo-tikki', name: 'ALOO TIKKI', image: null, unitPricePence: 730, quantity: 2, lineTotalPence: 1460 },
    ]);
    expect(line).toEqual({ productId: 'aloo-tikki', name: 'Aloo Tikki', price: 7.3, quantity: 2, image: '' });
  });

  it('leaves a name that already has lower-case letters untouched', () => {
    const [line] = linesFromApi([
      { productId: 'p', name: 'Chicken Samosa', image: 'https://x/y.png', unitPricePence: 700, quantity: 1, lineTotalPence: 700 },
    ]);
    expect(line?.name).toBe('Chicken Samosa');
    expect(line?.image).toBe('https://x/y.png');
  });
});
