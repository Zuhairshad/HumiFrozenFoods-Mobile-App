import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, PressableScale } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  added: boolean;
  /** Out of stock: dimmed and not pressable. */
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  /** 32 for tiles; 40 for the Today card bar. */
  size?: 32 | 40;
  /** 'solid' = white fill + tint icon (on photography); 'chip' = translucent elevated fill. */
  tone?: 'solid' | 'chip';
}

/** Round add button. Solid semi-transparent fill instead of blur (no blur inside list items). */
export const MiniAddButton = memo(function MiniAddButton({
  added,
  disabled = false,
  onPress,
  accessibilityLabel,
  size = 32,
  tone = 'chip',
}: Props) {
  const { c } = useTheme();
  const fill = tone === 'solid' ? c.onTint : c.elevated;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic="light"
      scaleTo={0.9}
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      hitSlop={size === 32 ? 6 : 2}
    >
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: fill, opacity: disabled ? 0.4 : tone === 'solid' ? 1 : 0.86 }]} />
      <View style={styles.center}>
        <Icon name={added ? 'checkmark' : 'plus'} size={size === 32 ? 16 : 18} weight="bold" color={c.tint} />
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
