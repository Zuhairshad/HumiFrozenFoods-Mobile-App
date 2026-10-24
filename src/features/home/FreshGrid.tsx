import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Reveal, SectionHeader } from '@/components/ui';
import { ProductCard } from '@/components/product/ProductCard';
import { products } from '@/data';
import { gutter, spacing } from '@/theme';

const FIRST = products.slice(0, 6);

export function FreshGrid() {
  const router = useRouter();
  return (
    <View style={styles.section}>
      <Reveal>
        <SectionHeader
          overline="Just for you"
          title="Fresh from the freezer"
          actionLabel="Shop all"
          onAction={() => router.push('/(tabs)/shop')}
        />
      </Reveal>
      <View style={styles.grid}>
        {FIRST.map((p, i) => (
          <View key={p.id} style={styles.cell}>
            <ProductCard product={p} variant="grid" index={i} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.lg, paddingTop: spacing.xxxl, paddingHorizontal: gutter },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.sm / 2 },
  cell: { width: '50%', paddingHorizontal: spacing.sm / 2, paddingBottom: spacing.md },
});
