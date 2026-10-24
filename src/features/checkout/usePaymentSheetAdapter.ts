import type { PaymentSheetAdapter } from './paymentSheetTypes';

/** Web (and TS fallback): the Stripe RN SDK does not exist here, so payments are unavailable. */
const adapter: PaymentSheetAdapter = {
  available: false,
  async run() {
    return { kind: 'failed', message: 'Payments need the Humi app build.' };
  },
};

export function usePaymentSheetAdapter(): PaymentSheetAdapter {
  return adapter;
}
