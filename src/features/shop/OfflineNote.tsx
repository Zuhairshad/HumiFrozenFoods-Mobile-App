import { memo } from 'react';
import { AppText } from '@/components/ui';
import { useCatalogStatus } from '@/hooks/useProducts';

/** Subtle, non-blocking footnote shown when the last catalogue refresh failed and saved data is on screen. */
export const OfflineNote = memo(function OfflineNote() {
  const status = useCatalogStatus();
  if (status !== 'offline') return null;
  return (
    <AppText variant="footnote" color="labelTertiary" accessibilityLiveRegion="polite">
      Showing saved menu
    </AppText>
  );
});
