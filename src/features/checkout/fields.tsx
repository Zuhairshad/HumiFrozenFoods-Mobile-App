import type { Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { AppText, Icon, PressableScale } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { useA11yLayout } from '@/theme';

export interface FieldProps extends Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  /** Truthy flags the field invalid; render the message under the group (see `GroupError`). */
  invalid?: boolean;
  inputRef?: Ref<TextInput>;
}

/** Inset-group row: 96 pt label + value; label stacks above at large Dynamic Type. */
export function FieldRow({ label, value, onChangeText, invalid, inputRef, multiline, ...rest }: FieldProps) {
  const { c, type } = useTheme();
  const stacked = useA11yLayout();
  return (
    <View style={[styles.row, stacked ? styles.stacked : styles.inline, { minHeight: multiline ? 96 : 52 }]}>
      <View style={stacked ? undefined : styles.label}>
        <AppText variant="callout" color={invalid ? 'destructive' : 'labelSecondary'} numberOfLines={2}>
          {label}
        </AppText>
      </View>
      <TextInput
        ref={inputRef}
        {...rest}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        accessibilityLabel={label}
        placeholderTextColor={c.labelTertiary}
        selectionColor={c.tint}
        maxFontSizeMultiplier={1.6}
        style={[type.body, styles.input, { color: c.label, minHeight: multiline ? 72 : 24, textAlignVertical: multiline ? 'top' : 'center' }]}
      />
    </View>
  );
}

export interface FieldPairProps {
  left: FieldProps;
  right: FieldProps;
  rightWidth?: number;
}

/** "Town / City | Postcode" side by side (stacks at large Dynamic Type). Labels are placeholders. */
export function FieldPair({ left, right, rightWidth = 128 }: FieldPairProps) {
  const { c, type } = useTheme();
  const stacked = useA11yLayout();
  const render = (f: FieldProps, extra?: object) => {
    const { label, value, onChangeText, invalid, inputRef, ...rest } = f;
    return (
      <TextInput
        ref={inputRef}
        {...rest}
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        accessibilityLabel={label}
        placeholderTextColor={invalid ? c.destructive : c.labelTertiary}
        selectionColor={c.tint}
        maxFontSizeMultiplier={1.6}
        style={[type.body, styles.pairInput, { color: invalid ? c.destructive : c.label }, extra]}
      />
    );
  };
  if (stacked) {
    return (
      <View>
        <View style={styles.pairRowStacked}>{render(left)}</View>
        <View style={[styles.hair, { backgroundColor: c.separator }]} />
        <View style={styles.pairRowStacked}>{render(right)}</View>
      </View>
    );
  }
  return (
    <View style={styles.pair}>
      <View style={styles.pairLeft}>{render(left)}</View>
      <View style={[styles.vhair, { backgroundColor: c.separator }]} />
      <View style={{ width: rightWidth, paddingLeft: 12 }}>{render(right)}</View>
    </View>
  );
}

export function GroupError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <AppText
      variant="footnote"
      color="destructive"
      accessibilityLiveRegion="polite"
      style={styles.error}
    >
      {message}
    </AppText>
  );
}

export interface RadioRowProps {
  title: string;
  detail: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export function RadioRow({ title, detail, selected, disabled, onPress }: RadioRowProps) {
  const { c } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={1}
      haptic="selection"
      accessibilityRole="radio"
      accessibilityLabel={`${title}, ${detail}${disabled ? ', unavailable' : ''}`}
      accessibilityState={{ selected, disabled: !!disabled }}
      style={[styles.radio, disabled && { opacity: 0.4 }]}
    >
      {selected ? (
        <Icon name="checkmark.circle" fill size={22} color="tint" />
      ) : (
        <View style={[styles.ring, { borderColor: c.labelTertiary }]} />
      )}
      <AppText variant="body" style={styles.radioTitle}>
        {title}
      </AppText>
      <AppText variant="callout" color="labelSecondary">
        {detail}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 10 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stacked: { justifyContent: 'center', gap: 2 },
  label: { width: 96 },
  input: { flex: 1, paddingVertical: 0 },
  pair: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 16 },
  pairLeft: { flex: 1, paddingRight: 12 },
  pairInput: { paddingVertical: 0, minHeight: 24 },
  pairRowStacked: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 16 },
  vhair: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 8 },
  hair: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  error: { marginHorizontal: 16, marginTop: -16, marginBottom: 20 },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 8 },
  radioTitle: { flex: 1 },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5 },
});
