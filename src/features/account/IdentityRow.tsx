import { StyleSheet, View } from 'react-native';
import { AppText, BrandMark } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

/** Guest identity: there are no accounts, orders are kept on this device. */
export function IdentityRow() {
  const { c } = useTheme();
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel="Guest. Your orders are saved on this device."
    >
      <View style={[styles.avatar, { backgroundColor: c.tintSoft }]}>
        <BrandMark size={48} variant="mark" />
      </View>
      <View style={styles.text}>
        <AppText variant="headline">Guest</AppText>
        <AppText variant="footnote" color="labelSecondary">
          Your orders are saved on this device
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12, minHeight: 72 },
  avatar: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
