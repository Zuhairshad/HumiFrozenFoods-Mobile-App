import { memo } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii, shadows, spacing } from '@/theme';
import { Glass } from './Glass';

interface SearchBarProps {
  value: string;
  onChangeText: (t: string) => void;
}

export const SearchBar = memo(function SearchBar({ value, onChangeText }: SearchBarProps) {
  return (
    <Glass style={[styles.wrap, shadows.sm]}>
      <Ionicons name="search" size={20} color={colors.teal} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search samosas, kebabs, rolls…"
        placeholderTextColor={colors.muted}
        style={styles.input}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        selectionColor={colors.teal}
        accessibilityLabel="Search products"
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={styles.clear}
        >
          <Ionicons name="close" size={14} color={colors.white} />
        </Pressable>
      ) : null}
    </Glass>
  );
});

const styles = StyleSheet.create({
  wrap: {
    height: 52,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  input: {
    flex: 1,
    height: '100%',
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    outlineStyle: 'none',
  } as never,
  clear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
