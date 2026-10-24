import type { ReactNode } from 'react';

/** Platform-split: implemented in StripeProvider.native.tsx and StripeProvider.web.tsx. */
export declare const MERCHANT_IDENTIFIER: string;
export declare const STRIPE_URL_SCHEME: string;
export declare const stripeAvailable: boolean;
export declare function AppStripeProvider(props: { children: ReactNode }): React.JSX.Element;
