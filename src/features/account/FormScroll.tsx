import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface FormScrollProps {
  children: ReactNode;
}

/**
 * Scroll container for forms: grouped background, native large-title inset handling and
 * keyboard avoidance (iOS adjusts insets automatically; Android resizes the window).
 */
export function FormScroll({ children }: FormScrollProps) {
  const { c } = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: c.groupedBackground }}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <View style={styles.gap}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 48 },
  gap: { gap: 24 },
});
