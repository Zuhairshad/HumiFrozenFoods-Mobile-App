import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppText, FadeImage, PressableScale } from '@/components/ui';
import { getBestSellers } from '@/data';
import { haptics } from '@/hooks/useHaptics';
import { formatPrice } from '@/lib/format';
import { colors, gutter, radii, shadows, spacing } from '@/theme';

interface Props {
  onAdd: (productId: string) => void;
  limit?: number;
}

export function SuggestedRow({ onAdd, limit = 4 }: Props) {
  const items = getBestSellers(limit);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      {items.map((p) => (
        <PressableScale key={p.id} onPress={() => router.push(`/product/${p.id}`)} style={styles.card}>
          <FadeImage uri={p.image} style={styles.image} />
          <AppText variant="label" numberOfLines={2} style={styles.name}>
            {p.name}
          </AppText>
          <View style={styles.foot}>
            <AppText variant="bodyStrong" color="teal">
              {formatPrice(p.price)}
            </AppText>
            <PressableScale
              accessibilityLabel={`Add ${p.name}`}
              onPress={() => {
                haptics.light();
                onAdd(p.id);
              }}
              style={styles.add}
            >
              <Ionicons name="add" size={18} color={colors.tealInk} />
            </PressableScale>
          </View>
        </PressableScale>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: gutter, gap: spacing.md, paddingBottom: spacing.sm },
  card: { width: 150, backgroundColor: colors.paper, borderRadius: radii.lg, padding: spacing.sm, ...shadows.sm },
  image: { width: '100%', height: 110, borderRadius: radii.md },
  name: { marginTop: spacing.sm, minHeight: 32 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  add: { width: 32, height: 32, borderRadius: radii.pill, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
});
