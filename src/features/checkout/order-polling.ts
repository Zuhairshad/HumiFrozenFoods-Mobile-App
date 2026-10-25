import { isAppApiError } from '../../lib/api/errors';
import type { Order } from '../../lib/api/types';

export const POLL_INTERVAL_MS = 3000;
export const POLL_MAX_ATTEMPTS = 10;

export type PollOutcome =
  | { kind: 'settled'; order: Order } // paymentStatus is no longer 'pending' (paid / failed / refunded)
  | { kind: 'timeout'; order: Order | null } // still pending after all attempts: show "confirming" + manual refresh
  | { kind: 'unauthorized' }
  | { kind: 'cancelled' };

export interface PollDeps {
  fetchOrder: (signal: AbortSignal) => Promise<Order>;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
  onUpdate?: (order: Order) => void;
  onError?: (e: unknown) => void;
  intervalMs?: number;
  maxAttempts?: number;
}

/**
 * GET /v1/orders/:id every 3 s, up to 10 times, until the server reports a non-pending payment.
 * Network errors count as an attempt (the order screen keeps showing the saved snapshot).
 */
export async function pollOrderPayment(deps: PollDeps): Promise<PollOutcome> {
  const interval = deps.intervalMs ?? POLL_INTERVAL_MS;
  const max = deps.maxAttempts ?? POLL_MAX_ATTEMPTS;
  const sleep = deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const ctl = new AbortController();
  deps.signal?.addEventListener('abort', () => ctl.abort(), { once: true });
  let last: Order | null = null;
  for (let attempt = 0; attempt < max; attempt++) {
    if (ctl.signal.aborted) return { kind: 'cancelled' };
    try {
      const order = await deps.fetchOrder(ctl.signal);
      if (ctl.signal.aborted) return { kind: 'cancelled' };
      last = order;
      deps.onUpdate?.(order);
      if (order.paymentStatus !== 'pending') return { kind: 'settled', order };
    } catch (e) {
      if (ctl.signal.aborted || (isAppApiError(e) && e.isAborted)) return { kind: 'cancelled' };
      if (isAppApiError(e) && (e.status === 401 || e.status === 403)) return { kind: 'unauthorized' };
      deps.onError?.(e);
    }
    if (attempt < max - 1) {
      await sleep(interval);
      if (ctl.signal.aborted) return { kind: 'cancelled' };
    }
  }
  return { kind: 'timeout', order: last };
}
