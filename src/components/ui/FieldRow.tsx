import { ComponentRef, useRef } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View, useWindowDimensions } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { A11Y_FONT_SCALE } from '@/theme/layout';

import { AppText } from './AppText';

export interface FieldRowProps extends Omit<TextInputProps, 'value' | 'onChangeText' | 'style'> {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Truthy marks the field invalid (label turns destructive). Render the message under the group yourself. */
  error?: string | boolean;
}

/** Inset-group form row: 96 pt label + value (stacked at large Dynamic Type). Tapping anywhere focuses the input. */
export function FieldRow({ label, value, onChangeText, error, multiline, accessibilityLabel, ...inputProps }: FieldRowProps) {
  const { c, type } = useTheme();
  const { fontScale } = useWindowDimensions();
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  const stacked = fontScale >= A11Y_FONT_SCALE;
  const invalid = !!error;

  return (
    <Pressable
      onPress={() => ref.current?.focus()}
      accessible={false}
      style={[styles.row, stacked ? styles.stacked : styles.inline, { minHeight: multiline ? 96 : 52 }]}
    >
      <View style={stacked ? undefined : styles.label}>
        <AppText variant="callout" color={invalid ? 'destructive' : 'labelSecondary'} numberOfLines={2}>
          {label}
        </AppText>
      </View>
      <TextInput
        ref={ref}
        {...inputProps}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={typeof error === 'string' ? error : undefined}
        placeholderTextColor={c.labelTertiary}
        selectionColor={c.tint}
        maxFontSizeMultiplier={1.6}
        style={[
          type.body,
          styles.input,
          { color: c.label, textAlignVertical: multiline ? 'top' : 'center', minHeight: multiline ? 72 : 24 },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 10 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stacked: { justifyContent: 'center', gap: 2 },
  label: { width: 96 },
  input: { flex: 1, paddingVertical: 0 },
});
