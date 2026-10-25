import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { getHttpClient, isDemoMode } from '../../lib/api/http';
import { postQuote } from '../../lib/api/quote-client';
import type { PricedLine, Pricing, QuoteResponse, UnavailableLine } from '../../lib/api/types';
import { estimateTotalsPence } from '../../lib/pricing';
import { useServerConfig, useConfigSync } from '../../store/server-config';
import { buildQuoteRequest, createQuoteController, type QuoteState } from './quote-state';

export interface UseQuoteLine {
  productId: string;
  quantity: number;
  /** Local price, used ONLY for the placeholder estimate. */
  unitPricePence?: number;
}

export interface UseQuoteResult {
  pricing: Pricing;
  /** Server-priced lines (empty until the first quote). */
  lines: PricedLine[];
  unavailable: UnavailableLine[];
  promo: QuoteResponse['promo'];
  /** True while no server quote exists for the basket (loading first time, offline, or demo). */
  isEstimate: boolean;
  /** A quote request is in flight. Previous numbers stay visible meanwhile. */
  loading: boolean;
  /** Last request failed (offline, rate limited...). Previous quote, if any, is kept. */
  error: QuoteState['error'];
  /** Numbers shown belong to an older basket (refetching or failed). */
  stale: boolean;
  demo: boolean;
  refresh: () => void;
}

/** Debounced POST /v1/checkout/quote. Keeps the previous quote while refetching. */
export function useQuote(lines: UseQuoteLine[], promoCode?: string | null): UseQuoteResult {
  useConfigSync();
  const { config } = useServerConfig();
  const controller = useMemo(
    () =>
      createQuoteController({
        fetchQuote: (req, signal) => postQuote(getHttpClient(), req, signal),
      }),
    [],
  );
  useEffect(() => () => controller.dispose(), [controller]);

  const req = useMemo(
    () => buildQuoteRequest(lines, promoCode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(lines.map((l) => [l.productId, l.quantity])), promoCode],
  );
  useEffect(() => {
    if (!isDemoMode) controller.update(req);
  }, [controller, req]);

  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const refresh = useCallback(() => controller.refresh(), [controller]);

  return useMemo<UseQuoteResult>(() => {
    const data = isDemoMode ? null : state.data;
    if (data) {
      return {
        pricing: data.pricing,
        lines: data.lines,
        unavailable: data.unavailable,
        promo: data.promo,
        isEstimate: false,
        loading: state.status === 'loading',
        error: state.error,
        stale: state.dataKey !== state.requestedKey || state.status === 'error',
        demo: false,
        refresh,
      };
    }
    const est = estimateTotalsPence(
      lines.map((l) => ({ unitPricePence: l.unitPricePence ?? 0, quantity: l.quantity })),
      { feePence: config.delivery.feePence, freeThresholdPence: config.delivery.freeThresholdPence },
    );
    return {
      pricing: { ...est, currency: 'gbp', promoCode: null },
      lines: [],
      unavailable: [],
      promo: undefined,
      isEstimate: true,
      loading: state.status === 'loading',
      error: state.error,
      stale: false,
      demo: isDemoMode,
      refresh,
    };
  }, [state, lines, config, refresh]);
}
