import { StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { maxFontScale } from '@/theme/typography';

import { AppText } from './AppText';
import { Icon, IconName } from './Icon';
import { PressableScale } from './PressableScale';

export interface FilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
}

/** Filled capsule when selected, `fill` capsule otherwise (5.2). */
export function FilterChip({ label, selected, onPress, icon }: FilterChipProps) {
  const { c } = useTheme();
  const fg = selected ? c.onTint : c.label;
  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      scaleTo={0.96}
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={{ top: 5, bottom: 5 }}
      style={[styles.chip, { backgroundColor: selected ? c.tintFill : c.fill }]}
    >
      {icon ? <Icon name={icon} size={14} color={fg} weight="semibold" /> : null}
      <AppText variant="subheadStrong" color={fg} maxScale={maxFontScale.control} numberOfLines={1}>
        {label}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderCurve: 'continuous',
    alignSelf: 'flex-start',
  },
});
