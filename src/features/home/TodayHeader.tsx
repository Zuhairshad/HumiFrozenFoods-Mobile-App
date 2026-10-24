import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, BrandMark, PressableScale } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { dateLineFor, greetingFor } from './selectors';

interface Props {
  onLogoPress: () => void;
  now: Date;
}

export const TodayHeader = memo(function TodayHeader({ onLogoPress, now }: Props) {
  const { c, space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.row, { paddingTop: insets.top + space.sm, paddingHorizontal: space.xl }]}>
      <View style={styles.texts}>
        <AppText
          variant="caption1Strong"
          color="labelSecondary"
          style={styles.date}
          accessibilityRole="text"
        >
          {dateLineFor(now).toUpperCase()}
        </AppText>
        <AppText variant="largeTitle" accessibilityRole="header">
          {greetingFor(now)}
        </AppText>
      </View>
      <PressableScale
        onPress={onLogoPress}
        haptic="selection"
        accessibilityLabel="About Humi's Frozen Foods"
        style={[styles.logo, { backgroundColor: c.fill, borderColor: c.separator }]}
        hitSlop={4}
      >
        <BrandMark size={36} variant="mark" />
      </PressableScale>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  texts: { flex: 1, paddingRight: 12 },
  date: { letterSpacing: 0.6 },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
});
