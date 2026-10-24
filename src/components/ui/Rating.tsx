import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
import { AppText } from './AppText';

export interface RatingProps {
  value: number;
  count?: number;
  size?: number;
}

export function Rating({ value, count, size = 13 }: RatingProps) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`Rated ${value.toFixed(1)} out of 5`}>
      <Ionicons name="star" size={size} color={colors.gold} />
      <AppText variant="label" color="ink" style={{ fontSize: size, lineHeight: size + 4 }}>
        {value.toFixed(1)}
      </AppText>
      {count != null ? (
        <AppText variant="caption" color="muted" style={{ fontSize: size, lineHeight: size + 4 }}>
          ({count})
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 4 } });
