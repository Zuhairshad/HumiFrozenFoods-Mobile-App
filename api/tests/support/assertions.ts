import { expect } from 'vitest';
import type { Harness } from './harness.js';
import { findLeaks, type LeakScanOptions } from './leak.js';
import type { ApiResponse } from './harness.js';
import type { ErrorBody } from './types.js';

/** Fails with the list of leaks, so the message names the offending key or substring. */
export function expectNoLeaks(res: ApiResponse, options: LeakScanOptions = {}): void {
  expect(findLeaks(res.text, options), `leaks in response body`).toEqual([]);
}

export function expectError(res: ApiResponse, status: number, code?: string): ErrorBody['error'] {
  expect(res.status, res.text).toBe(status);
  const { error } = res.json<ErrorBody>();
  expect(error.requestId).toEqual(expect.any(String));
  if (code !== undefined) expect(error.code).toBe(code);
  return error;
}

/**
 * The strongest data-safety claim: website orders are byte-identical to what was seeded, the seeded products
 * were never written, and no index was created on products/orders (the owner's collections).
 */
export async function expectSiteDataIntact(harness: Harness): Promise<void> {
  expect(await harness.siteOrdersNow(), 'website orders changed').toEqual(harness.seededOrderHashes());
  expect(await harness.fixtureProductsNow(), 'seeded products changed').toEqual(harness.seededProductHashes());
  expect(await harness.indexSummary(), 'indexes were created on products/orders').toEqual(harness.indexBaseline());
}

/** Everything except volatile ids/timestamps, so two error responses can be compared for indistinguishability. */
export function errorSignature(res: ApiResponse): unknown {
  const { error } = res.json<ErrorBody>();
  return {
    status: res.status,
    code: error.code,
    message: error.message,
    details: error.details,
    contentType: res.headers.get('content-type'),
    cacheControl: res.headers.get('cache-control'),
  };
}
