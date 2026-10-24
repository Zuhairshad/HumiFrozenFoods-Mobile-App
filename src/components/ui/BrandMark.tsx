import { Image } from 'expo-image';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { AppText } from './AppText';

export interface BrandMarkProps {
  size?: number;
  variant?: 'mark' | 'wordmark';
  /** Wordmark text colour for dark backgrounds. */
  onDark?: boolean;
  style?: StyleProp<ViewStyle>;
}

// The real Humi's logo (gold "H" with leaves on teal), shipped as the app icon.
const MARK = require('../../../assets/icon.png') as number;

/**
 * Brand logo. `mark`: the round logo. `wordmark`: mark + "Humi's / Frozen foods" in the system font
 * (Playfair is reserved for the 3 sanctioned moments, which draw their own text).
 */
export function BrandMark({ size = 36, variant = 'mark', onDark = false, style }: BrandMarkProps) {
  const mark = (
    <Image
      source={MARK}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      accessibilityIgnoresInvertColors
    />
  );
  if (variant === 'mark') {
    return (
      <View style={style} accessible accessibilityRole="image" accessibilityLabel="Humi's Frozen Foods">
        {mark}
      </View>
    );
  }
  return (
    <View style={[styles.row, { gap: size * 0.3 }, style]} accessible accessibilityRole="image" accessibilityLabel="Humi's Frozen Foods">
      {mark}
      <View>
        <AppText variant="title3" color={onDark ? '#FFFFFF' : 'label'} style={{ fontSize: size * 0.5, lineHeight: size * 0.6 }} maxScale={1.2}>
          Humi’s
        </AppText>
        <AppText variant="caption1Strong" color={onDark ? '#E5A83B' : 'labelSecondary'} maxScale={1.2}>
          Frozen foods
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center' } });
