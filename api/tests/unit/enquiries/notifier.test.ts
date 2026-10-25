import { describe, expect, it } from 'vitest';
import { NoopNotifier } from '../../../src/enquiries/notifier.js';

describe('NoopNotifier', () => {
  it('resolves and does nothing', async () => {
    await expect(new NoopNotifier().notify()).resolves.toBeUndefined();
  });
});
