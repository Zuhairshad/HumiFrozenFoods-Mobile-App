export interface PaymentSheetColors {
  tint: string;
  groupedBackground: string;
  cell: string;
  elevated: string;
  separator: string;
  label: string;
  labelSecondary: string;
  labelTertiary: string;
  destructive: string;
  isDark: boolean;
}

export interface PaymentSheetBilling {
  name: string;
  email: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
}

export type SheetOutcome =
  | { kind: 'success' }
  | { kind: 'cancelled' }
  | {
      kind: 'failed';
      message: string;
      /** PaymentSheetError code ('Failed' | 'Canceled' | 'Timeout'), or 'InitFailed' (sheet never opened). */
      code?: string;
      declineCode?: string;
      /** Stripe error type, e.g. 'card_error' (an explicit decline). */
      errorType?: string;
    };

export interface PaymentSheetAdapter {
  /** False on web / when no publishable key is configured. */
  available: boolean;
  /** Why payments cannot run here (shown instead of Pay). */
  unavailableMessage?: string;
  /** Initialise then present PaymentSheet. `onPresenting` fires between the two. */
  run(args: {
    clientSecret: string;
    billing: PaymentSheetBilling;
    colors: PaymentSheetColors;
    onPresenting: () => void;
  }): Promise<SheetOutcome>;
}
