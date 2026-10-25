import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { getStripeGateway } from '@/lib/api/gateways';
import { useOrdersStore } from '@/store/orders';
import { useServerConfig } from '@/store/server-config';
import { formatPrice } from '@/lib/format';
import type { OrderDraft } from '@/lib/api/types';
import { createCheckoutMachine, type CheckoutState, type PayOptions } from './checkout-machine';
import { buildOrderRecord } from './order-record';
import type { PaymentSheetColors } from './paymentSheetTypes';
import { usePaymentSheetAdapter } from './usePaymentSheetAdapter';

export * from './checkout-machine';

/** React binding for the checkout machine. */
export function useStripeCheckout() {
  const sheet = usePaymentSheetAdapter();
  const { c, isDark } = useTheme();
  const { config } = useServerConfig();
  const addOrder = useOrdersStore((s) => s.addOrder);

  // Latest values are read lazily so the machine (and its idempotency session) outlives re-renders.
  const live = useRef({ sheet, c, isDark, payments: config.payments.enabled });
  useEffect(() => {
    live.current = { sheet, c, isDark, payments: config.payments.enabled };
  });

  // The machine outlives renders (it owns the idempotency session) and reads the latest values lazily.
  /* eslint-disable react-hooks/refs */
  const machine = useMemo(
    () =>
      createCheckoutMachine({
        gateway: getStripeGateway(),
        sheet: {
          get available() {
            return live.current.sheet.available;
          },
          get unavailableMessage() {
            return live.current.sheet.unavailableMessage;
          },
          run: (args) => live.current.sheet.run(args),
        },
        getColors: (): PaymentSheetColors => {
          const { c: cc, isDark: dark } = live.current;
          return {
            tint: cc.tint,
            groupedBackground: cc.groupedBackground,
            cell: cc.cell,
            elevated: cc.elevated,
            separator: cc.separatorOpaque,
            label: cc.label,
            labelSecondary: cc.labelSecondary,
            labelTertiary: cc.labelTertiary,
            destructive: cc.destructive,
            isDark: dark,
          };
        },
        paymentsEnabled: () => live.current.payments,
        recordOrder: (draft, intent) => addOrder(buildOrderRecord(draft, intent), intent.demo ? undefined : intent.guestToken),
        formatPence: (p) => formatPrice(p / 100),
      }),
    [addOrder],
  );
  /* eslint-enable react-hooks/refs */

  const state: CheckoutState = useSyncExternalStore(machine.subscribe, machine.getState, machine.getState);
  const pay = useCallback((draft: OrderDraft, opts?: PayOptions) => machine.pay(draft, opts), [machine]);
  const busy = state.status === 'creating' || state.status === 'presenting' || state.status === 'confirming';
  return { pay, state, reset: machine.reset, busy, demo: machine.demo, sheetAvailable: sheet.available, sheetUnavailableMessage: sheet.unavailableMessage };
}
