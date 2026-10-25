import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { OfflineNote } from '@/features/shop/OfflineNote';

/** Closing line of Home. No delivery or promo claims: the server owns those (shown in cart and checkout). */
export const FootnoteLine = memo(function FootnoteLine() {
  return (
    <View style={styles.line}>
      <OfflineNote />
      <AppText variant="footnote" color="labelTertiary" align="center">
        Halal · UK made
      </AppText>
    </View>
  );
});

const styles = StyleSheet.create({
  line: { paddingTop: 40, paddingHorizontal: 20, alignItems: 'center', gap: 4 },
});
