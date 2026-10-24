import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '@/theme';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import type { IoniconName } from './types';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IoniconName;
}

export function Chip({ label, selected, onPress, icon }: ChipProps) {
  const fg = selected ? colors.white : colors.inkSoft;
  return (
    <PressableScale
      onPress={onPress}
      haptic
      scaleTo={0.95}
      accessibilityLabel={label}
      style={[styles.chip, selected ? styles.selected : styles.idle]}
    >
      {icon ? <Ionicons name={icon} size={16} color={selected ? colors.gold : colors.teal} /> : null}
      <AppText variant="label" color={fg}>
        {label}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  idle: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  selected: { backgroundColor: colors.teal, borderWidth: 1, borderColor: colors.teal },
});
