import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';

import { colors, fonts, gradients } from '@/theme';

export type LogoProps = {
  /** Height of the mark in points. The wordmark scales with it. */
  size?: number;
  /** `mark` = monogram only, `full` = monogram + "Humi's" wordmark. */
  variant?: 'full' | 'mark';
  /** Use on dark/teal backgrounds: wordmark turns cream and the mark gets a gold hairline. */
  light?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Logo({ size = 40, variant = 'full', light = false, style }: LogoProps) {
  const radius = size * 0.3;
  const wordColor = light ? colors.cream : colors.tealDeep;
  const subColor = light ? colors.gold : colors.muted;

  return (
    <View
      style={[styles.row, { gap: size * 0.28 }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Humi's Frozen Foods"
    >
      <LinearGradient
        colors={gradients.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.mark,
          {
            width: size,
            height: size,
            borderRadius: radius,
            borderWidth: light ? StyleSheet.hairlineWidth * 2 : 0,
            borderColor: colors.gold,
          },
        ]}
      >
        <Text
          allowFontScaling={false}
          style={[styles.glyph, { fontSize: size * 0.62, lineHeight: size * 0.8, color: colors.gold }]}
        >
          H
        </Text>
        <View
          style={[
            styles.dot,
            { width: size * 0.09, height: size * 0.09, top: size * 0.14, right: size * 0.16 },
          ]}
        />
      </LinearGradient>

      {variant === 'full' ? (
        <View>
          <Text
            allowFontScaling={false}
            style={{ fontFamily: fonts.displayBlack, fontSize: size * 0.58, lineHeight: size * 0.68, color: wordColor, letterSpacing: -size * 0.01 }}
          >
            Humi’s
          </Text>
          <Text
            allowFontScaling={false}
            style={{ fontFamily: fonts.bodyBold, fontSize: size * 0.2, lineHeight: size * 0.26, color: subColor, letterSpacing: size * 0.06, textTransform: 'uppercase' }}
          >
            Frozen Foods
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  mark: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  glyph: { fontFamily: fonts.displayBlack, textAlign: 'center', includeFontPadding: false },
  dot: { position: 'absolute', borderRadius: 999, backgroundColor: colors.gold, opacity: 0.85 },
});
