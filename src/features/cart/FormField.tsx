import { forwardRef } from 'react';
import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AppText } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

interface Props extends TextInputProps {
  label: string;
  error?: string;
}

export const FormField = forwardRef<TextInput, Props>(function FormField({ label, error, style, ...rest }, ref) {
  return (
    <View style={styles.wrap}>
      <AppText variant="label" color="inkSoft" style={styles.label}>
        {label}
      </AppText>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.placeholder}
        {...rest}
        style={[styles.input, !!error && styles.inputError, style]}
        accessibilityLabel={label}
      />
      {error ? (
        <Animated.View entering={FadeIn.duration(180)}>
          <AppText variant="caption" color="red" style={styles.error}>
            {error}
          </AppText>
        </Animated.View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { marginLeft: spacing.xs },
  input: {
    height: 54,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: spacing.lg,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.ink,
  },
  inputError: { borderColor: colors.red, backgroundColor: colors.redSoft },
  error: { marginLeft: spacing.xs },
});
