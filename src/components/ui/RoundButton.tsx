import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

import { AppText } from './AppText';
import { GlassSurface } from './GlassSurface';
import { Icon, IconName } from './Icon';
import { PressableScale } from './PressableScale';

export interface RoundButtonProps {
  icon: IconName;
  onPress: () => void;
  size?: 32 | 40 | 44;
  /**
   * `glass`: translucent circle (flat semi-transparent fill, never live blur, so it is safe in lists);
   * `fill`: `fill` token; `tint`: primary teal.
   */
  material?: 'glass' | 'fill' | 'tint';
  badge?: number | string;
  accessibilityLabel: string;
  /** Use the filled symbol variant (e.g. a selected heart). */
  filled?: boolean;
  /** Override the icon colour role. */
  iconColor?: string;
}

const ICON = { 32: 16, 40: 20, 44: 22 } as const;

export function RoundButton({ icon, onPress, size = 40, material = 'glass', badge, accessibilityLabel, filled, iconColor }: RoundButtonProps) {
  const { c } = useTheme();
  const fg = iconColor ?? (material === 'tint' ? c.onTint : c.label);
  const showBadge = badge !== undefined && badge !== 0 && badge !== '';
  const slop = Math.max(0, (44 - size) / 2);

  const inner = <Icon name={icon} size={ICON[size]} color={fg} weight="semibold" fill={filled} />;

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.92}
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: slop, bottom: slop, left: slop, right: slop }}
      style={{ width: size, height: size }}
    >
      {material === 'glass' ? (
        <GlassSurface flat radius={size / 2} style={[styles.fill, { width: size, height: size }]}>
          <View style={styles.center}>{inner}</View>
        </GlassSurface>
      ) : (
        <View
          style={[
            styles.fill,
            styles.center,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: material === 'tint' ? c.tintFill : c.fill },
          ]}
        >
          {inner}
        </View>
      )}
      {showBadge ? (
        <View style={[styles.badge, { backgroundColor: c.destructive, borderColor: c.background }]}>
          <AppText variant="caption2" color="#FFFFFF" maxScale={1.3} accessible={false}>
            {badge}
          </AppText>
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fill: { borderCurve: 'continuous' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
