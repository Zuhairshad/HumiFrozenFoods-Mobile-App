import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { Icon, PressableScale } from '@/components/ui';

interface FilterButtonProps {
  active: boolean;
  count: number;
  onPress: () => void;
}

/** Header bar item that opens the Sort & Filter sheet; filled glyph when refinements are active. */
export const FilterButton = memo(function FilterButton({ active, count, onPress }: FilterButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.9}
      haptic="selection"
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      accessibilityLabel={active ? `Sort and filter, ${count} active` : 'Sort and filter'}
      accessibilityRole="button"
      style={styles.button}
    >
      <Icon name="line.3.horizontal.decrease.circle" size={26} color="tint" fill={active} />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
