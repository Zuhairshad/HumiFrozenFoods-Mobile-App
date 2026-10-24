import { StyleSheet, View } from 'react-native';
import { ColorName } from '@/theme';
import { formatPrice } from '@/lib/format';
import { AppText } from './AppText';

export interface PriceProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  compareAt?: number;
  color?: ColorName | (string & {});
}

const FONT = { sm: 15, md: 17, lg: 28 } as const;

export function Price({ value, size = 'md', compareAt, color = 'teal' }: PriceProps) {
  return (
    <View style={styles.row}>
      <AppText
        variant={size === 'lg' ? 'h1' : 'price'}
        color={color}
        style={{ fontSize: FONT[size], lineHeight: Math.round(FONT[size] * 1.25) }}
      >
        {formatPrice(value)}
      </AppText>
      {compareAt && compareAt > value ? (
        <AppText variant="caption" color="muted" style={styles.strike}>
          {formatPrice(compareAt)}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  strike: { textDecorationLine: 'line-through' },
});
