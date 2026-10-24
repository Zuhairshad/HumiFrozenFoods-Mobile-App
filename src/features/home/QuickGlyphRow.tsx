import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { categories } from '@/data';
import type { IconName } from '@/components/ui';
import { GlyphChip } from './GlyphChip';

const SHORT_LABEL: Record<string, string> = {
  'savory-snacks': 'Savory',
  kebabs: 'Kebabs',
  samosas: 'Samosa',
  'vegetable-samosas': 'Veg',
};

export const QuickGlyphRow = memo(function QuickGlyphRow() {
  const router = useRouter();

  const items = useMemo(() => {
    const cats = categories.slice(0, 4).map((cat) => ({
      key: cat.id,
      label: SHORT_LABEL[cat.id] ?? cat.title,
      imageUri: cat.image,
      icon: undefined as IconName | undefined,
      onPress: () => router.push({ pathname: '/shop', params: { category: cat.id } }),
    }));
    return [
      ...cats,
      {
        key: 'vegan',
        label: 'Vegan',
        imageUri: undefined,
        icon: 'leaf' as IconName,
        onPress: () => router.push({ pathname: '/shop', params: { diet: 'vegan' } }),
      },
      {
        key: 'quick',
        label: '10 min',
        imageUri: undefined,
        icon: 'timer' as IconName,
        onPress: () => router.push({ pathname: '/shop', params: { quick: '1' } }),
      },
    ];
  }, [router]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      accessibilityLabel="Quick filters"
    >
      {items.map((it) => (
        <GlyphChip key={it.key} label={it.label} imageUri={it.imageUri} icon={it.icon} onPress={it.onPress} />
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 16 },
});
