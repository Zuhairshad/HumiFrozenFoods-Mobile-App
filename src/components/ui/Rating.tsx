import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Icon } from './Icon';

export interface RatingProps {
  value: number;
  count?: number;
  compact?: boolean;
}

/** Single gold star + value (+ count). Gold is allowed here (2.3 gold rules). */
export function Rating({ value, count, compact = false }: RatingProps) {
  const label = `Rated ${value.toFixed(1)} out of 5${count !== undefined ? `, ${count} reviews` : ''}`;
  return (
    <View style={styles.row} accessible accessibilityRole="text" accessibilityLabel={label}>
      <Icon name="star" fill size={compact ? 11 : 13} color="accent" />
      <AppText variant={compact ? 'footnote' : 'subhead'} accessible={false} style={styles.num}>
        {value.toFixed(1)}
      </AppText>
      {count !== undefined && !compact ? (
        <AppText variant={'footnote'} color="labelSecondary" accessible={false} style={styles.num}>
          ({count})
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  num: { fontVariant: ['tabular-nums'] },
});
