import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { computeTabInset } from '@/theme/layout';

/** Bottom padding for tab-root scroll content: 62 + max(safeBottom - 8, 12) + 16 (104 on Face ID iPhones). */
export function useTabInset(): number {
  const insets = useSafeAreaInsets();
  return computeTabInset(insets.bottom);
}
