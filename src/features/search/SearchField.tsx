import { memo } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Icon, PressableScale } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

export interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: (text: string) => void;
  placeholder?: string;
}

/** Capsule search field used where the native header search bar is unavailable (Android, web). */
function SearchFieldBase({ value, onChangeText, onSubmit, placeholder = 'Search samosas, kebabs' }: SearchFieldProps) {
  const { c, type } = useTheme();
  return (
    <View style={[styles.field, { backgroundColor: c.fill }]} accessibilityRole="search">
      <Icon name="magnifyingglass" size={16} color="labelTertiary" weight="semibold" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={(e) => onSubmit?.(e.nativeEvent.text)}
        placeholder={placeholder}
        placeholderTextColor={c.labelTertiary}
        selectionColor={c.tint}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        maxFontSizeMultiplier={1.6}
        accessibilityLabel="Search products"
        style={[type.body, styles.input, { color: c.label }]}
      />
      {value.length > 0 ? (
        <PressableScale
          onPress={() => onChangeText('')}
          scaleTo={0.9}
          haptic="none"
          accessibilityLabel="Clear search"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="xmark.circle" size={18} color="labelTertiary" fill />
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderCurve: 'continuous',
  },
  input: { flex: 1, paddingVertical: 8 },
});

export const SearchField = memo(SearchFieldBase);
