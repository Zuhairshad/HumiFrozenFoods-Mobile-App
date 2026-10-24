import { StyleSheet, View } from 'react-native';
import { SegmentedControl } from '@/components/ui';
import { haptics } from '@/hooks/useHaptics';
import { useSettingsStore, type Appearance } from '@/store/settings';

const OPTIONS = ['System', 'Light', 'Dark'] as const;
const VALUES: readonly Appearance[] = ['system', 'light', 'dark'];

/** System / Light / Dark. Persisted in the settings store, applies live. */
export function AppearancePicker() {
  const appearance = useSettingsStore((s) => s.appearance);
  const setAppearance = useSettingsStore((s) => s.setAppearance);
  const index = Math.max(0, VALUES.indexOf(appearance));

  return (
    <View style={styles.wrap}>
      <SegmentedControl
        options={[...OPTIONS]}
        index={index}
        onChange={(i) => {
          const next = VALUES[i];
          if (next && next !== appearance) {
            haptics.selection();
            setAppearance(next);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingVertical: 10 },
});
