import { memo, useCallback } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, FadeImage, Rating, Reveal, SectionHeader } from '@/components/ui';
import { testimonials } from '@/data';
import { colors, gutter, radii, shadows, spacing } from '@/theme';
import type { Testimonial } from '@/types';

const GAP = spacing.md;

const Card = memo(function Card({ item, width }: { item: Testimonial; width: number }) {
  return (
    <View style={[styles.card, { width }]}>
      <Ionicons name="chatbox-ellipses" size={26} color={colors.gold} />
      <AppText variant="body" color="inkSoft" style={styles.quote} numberOfLines={6}>
        {item.quote}
      </AppText>
      <Rating value={item.rating} />
      <View style={styles.person}>
        <FadeImage uri={item.avatar} style={styles.avatar} />
        <View style={styles.flex}>
          <AppText variant="title" numberOfLines={1}>
            {item.name}
          </AppText>
          <AppText variant="caption" color="muted" numberOfLines={1}>
            {item.location}
          </AppText>
        </View>
      </View>
    </View>
  );
});

export function Testimonials() {
  const { width } = useWindowDimensions();
  const cardW = Math.min(width * 0.82, 340);
  const renderItem = useCallback(({ item }: { item: Testimonial }) => <Card item={item} width={cardW} />, [cardW]);
  return (
    <View style={styles.section}>
      <Reveal style={styles.pad}>
        <SectionHeader overline="Loved by families" title="What Our Customers Say" />
      </Reveal>
      <FlatList
        data={testimonials}
        keyExtractor={(t) => t.id}
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
  list: { paddingHorizontal: gutter, paddingVertical: spacing.sm },
  flex: { flex: 1 },
  card: { backgroundColor: colors.paper, borderRadius: radii.lg, padding: spacing.xl, gap: spacing.md, ...shadows.md },
  quote: { fontStyle: 'italic', minHeight: 100 },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  avatar: { width: 44, height: 44, borderRadius: radii.pill },
});
