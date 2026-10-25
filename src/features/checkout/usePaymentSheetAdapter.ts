import type { PaymentSheetAdapter } from './paymentSheetTypes';

/** Web (and TS fallback): the Stripe RN SDK does not exist here, so payments are unavailable. */
const adapter: PaymentSheetAdapter = {
  available: false,
  unavailableMessage: 'Card payments need the mobile app',
  async run() {
    return { kind: 'failed', message: 'Card payments need the mobile app' };
  },
};

export function usePaymentSheetAdapter(): PaymentSheetAdapter {
  return adapter;
}
