import { memo, useCallback } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { AppText, FadeImage, PressableScale, Reveal, SectionHeader } from '@/components/ui';
import { categories, products } from '@/data';
import { gradients, gutter, radii, shadows, spacing } from '@/theme';
import type { Category } from '@/types';

const GAP = spacing.md;

const counts = products.reduce<Record<string, number>>((acc, p) => {
  acc[p.category] = (acc[p.category] ?? 0) + 1;
  return acc;
}, {});

const Card = memo(function Card({ item, width }: { item: Category; width: number }) {
  const router = useRouter();
  const n = counts[item.id] ?? 0;
  return (
    <PressableScale
      haptic
      accessibilityLabel={`${item.title}, ${n} items`}
      onPress={() => router.push({ pathname: '/shop', params: { category: item.id } })}
      style={[styles.card, { width }]}
    >
      <FadeImage uri={item.image} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={gradients.scrimBottom} style={styles.scrim} />
      <View style={styles.text}>
        <AppText variant="h3" color="white" numberOfLines={2}>
          {item.title}
        </AppText>
        <AppText variant="label" color="gold">
          {n} {n === 1 ? 'item' : 'items'}
        </AppText>
      </View>
    </PressableScale>
  );
});

export function CollectionsRow() {
  const { width } = useWindowDimensions();
  const cardW = Math.min(width * 0.62, 280);
  const renderItem = useCallback(({ item }: { item: Category }) => <Card item={item} width={cardW} />, [cardW]);

  return (
    <View style={styles.section}>
      <Reveal style={styles.pad}>
        <SectionHeader overline="Shop by category" title="Explore Our Collections" />
      </Reveal>
      <FlatList
        data={categories}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardW + GAP}
        decelerationRate="fast"
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
      />
    </View>
  );
}

const Separator = () => <View style={{ width: GAP }} />;

const styles = StyleSheet.create({
  section: { gap: spacing.lg, paddingTop: spacing.xxxl },
  pad: { paddingHorizontal: gutter },
  list: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  card: { height: 300, borderRadius: radii.lg, overflow: 'hidden', ...shadows.md },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '65%' },
  text: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, gap: spacing.xs },
});
