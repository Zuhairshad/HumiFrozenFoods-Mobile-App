import { StyleSheet, View } from 'react-native';

import { ColorRoles } from '@/theme/colors';
import { formatPrice } from '@/lib/format';

import { AppText } from './AppText';

export interface PriceProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  compareAt?: number;
  color?: keyof ColorRoles | (string & {});
}

export function Price({ value, size = 'md', compareAt, color = 'label' }: PriceProps) {
  return (
    <View style={styles.row} accessible accessibilityLabel={compareAt && compareAt > value ? `${formatPrice(value)}, was ${formatPrice(compareAt)}` : formatPrice(value)}>
      <AppText
        variant={size === 'lg' ? 'priceLarge' : 'price'}
        color={color}
        style={size === 'sm' ? styles.sm : undefined}
        accessible={false}
      >
        {formatPrice(value)}
      </AppText>
      {compareAt && compareAt > value ? (
        <AppText variant="footnote" color="labelTertiary" style={styles.strike} accessible={false}>
          {formatPrice(compareAt)}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  sm: { fontSize: 13, lineHeight: 18 },
  strike: { textDecorationLine: 'line-through', fontVariant: ['tabular-nums'] },
});
