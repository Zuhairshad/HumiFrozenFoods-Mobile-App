import { isAppApiError, type AppApiError } from '../../lib/api/errors';
import type { QuoteRequest, QuoteResponse } from '../../lib/api/types';

export interface QuoteLine {
  productId: string;
  quantity: number;
}

/** Canonical request: merged duplicates, stable order, trimmed promo. */
export function buildQuoteRequest(lines: QuoteLine[], promoCode?: string | null): QuoteRequest {
  const merged = new Map<string, number>();
  for (const l of lines) {
    if (l.quantity > 0) merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.quantity);
  }
  const out = [...merged.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([productId, quantity]) => ({ productId, quantity }));
  const code = promoCode?.trim();
  return { lines: out, ...(code ? { promoCode: code } : null) };
}

export const quoteKey = (req: QuoteRequest): string => JSON.stringify(req);

export interface QuoteState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Latest successful quote. KEPT while refetching or after an error (stale). */
  data: QuoteResponse | null;
  /** Request key `data` belongs to. */
  dataKey: string | null;
  /** Key of the newest request (responses for older keys are discarded). */
  requestedKey: string | null;
  error: AppApiError | null;
}

export const INITIAL_QUOTE_STATE: QuoteState = { status: 'idle', data: null, dataKey: null, requestedKey: null, error: null };

export type QuoteAction =
  | { type: 'request'; key: string }
  | { type: 'success'; key: string; data: QuoteResponse }
  | { type: 'failure'; key: string; error: AppApiError }
  | { type: 'empty' };

export function quoteReducer(state: QuoteState, action: QuoteAction): QuoteState {
  switch (action.type) {
    case 'empty':
      return INITIAL_QUOTE_STATE;
    case 'request':
      return { ...state, status: 'loading', requestedKey: action.key, error: null };
    case 'success':
      if (action.key !== state.requestedKey) return state;
      return { status: 'ready', data: action.data, dataKey: action.key, requestedKey: action.key, error: null };
    case 'failure':
      if (action.key !== state.requestedKey) return state;
      return { ...state, status: 'error', error: action.error };
  }
}

export interface QuoteControllerDeps {
  fetchQuote: (req: QuoteRequest, signal: AbortSignal) => Promise<QuoteResponse>;
  debounceMs?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (h: unknown) => void;
}

/**
 * Framework-free debounce + abort + stale-discard around the reducer.
 * `update(req)` is cheap to call on every cart/promo change.
 */
export function createQuoteController(deps: QuoteControllerDeps) {
  const debounceMs = deps.debounceMs ?? 350;
  const st = deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const ct = deps.clearTimeoutFn ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let state = INITIAL_QUOTE_STATE;
  let handle: unknown;
  let abort: AbortController | null = null;
  let current: QuoteRequest | null = null;
  const listeners = new Set<() => void>();

  const dispatch = (a: QuoteAction) => {
    const next = quoteReducer(state, a);
    if (next !== state) {
      state = next;
      listeners.forEach((l) => l());
    }
  };

  async function run(req: QuoteRequest) {
    abort?.abort();
    const ctl = new AbortController();
    abort = ctl;
    const key = quoteKey(req);
    dispatch({ type: 'request', key });
    try {
      const data = await deps.fetchQuote(req, ctl.signal);
      if (!ctl.signal.aborted) dispatch({ type: 'success', key, data });
    } catch (e) {
      if (ctl.signal.aborted || (isAppApiError(e) && e.isAborted)) return;
      if (isAppApiError(e)) dispatch({ type: 'failure', key, error: e });
      else throw e;
    }
  }

  return {
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    /** Schedule a quote for `req` (debounced). Empty carts reset to idle immediately. */
    update(req: QuoteRequest) {
      if (handle !== undefined) ct(handle);
      handle = undefined;
      if (req.lines.length === 0) {
        abort?.abort();
        current = null;
        dispatch({ type: 'empty' });
        return;
      }
      if (current && quoteKey(current) === quoteKey(req) && state.status !== 'error') return;
      current = req;
      handle = st(() => {
        handle = undefined;
        void run(req);
      }, debounceMs);
    },
    /** Re-fetch now (manual retry / after a price change). */
    refresh() {
      if (!current) return;
      if (handle !== undefined) ct(handle);
      handle = undefined;
      void run(current);
    },
    dispose() {
      if (handle !== undefined) ct(handle);
      abort?.abort();
      listeners.clear();
    },
  };
}
