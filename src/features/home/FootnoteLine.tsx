import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { AppText } from '@/components/ui';
import { FREE_DELIVERY_THRESHOLD } from '@/lib/pricing';

export const FootnoteLine = memo(function FootnoteLine() {
  return (
    <AppText variant="footnote" color="labelTertiary" align="center" style={styles.line}>
      {`Free delivery over £${FREE_DELIVERY_THRESHOLD} · Halal · UK made`}
    </AppText>
  );
});

const styles = StyleSheet.create({
  line: { paddingTop: 40, paddingHorizontal: 20 },
});
