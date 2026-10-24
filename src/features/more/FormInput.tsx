import { useState } from 'react';
import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { AppText } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

export interface FormInputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  multiline?: boolean;
}

export function FormInput({ label, error, multiline, onFocus, onBlur, ...rest }: FormInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <AppText variant="label" color="inkSoft">
        {label}
      </AppText>
      <TextInput
        {...rest}
        multiline={multiline}
        accessibilityLabel={label}
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.teal}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          multiline && styles.multiline,
          focused && styles.focused,
          !!error && styles.errored,
        ]}
      />
      {error ? (
        <AppText variant="caption" color="red">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: {
    minHeight: 50,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: spacing.lg,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  multiline: { minHeight: 120, paddingTop: spacing.md, textAlignVertical: 'top' },
  focused: { borderColor: colors.teal },
  errored: { borderColor: colors.red },
});
