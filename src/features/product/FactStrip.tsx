import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import type { Product } from '@/types';

interface Fact {
  label: string;
  value: string;
}

function factsFor(product: Product): Fact[] {
  const facts: Fact[] = [{ label: 'Ready in', value: `${product.readyInMins} min` }];
  if (product.tags.includes('Halal Certified')) facts.push({ label: 'Certified', value: 'Halal' });
  if (product.tags.includes('Vegan Friendly')) facts.push({ label: 'Suitable for', value: 'Vegans' });
  facts.push({ label: 'Cook', value: 'From frozen' });
  return facts;
}

/** Restrained 3-cell fact row; scrolls horizontally with 4, stacks at large Dynamic Type. */
export function FactStrip({ product }: { product: Product }) {
  const { c } = useTheme();
  const { fontScale } = useWindowDimensions();
  const facts = factsFor(product);
  const stacked = fontScale >= 1.35;

  const cell = (f: Fact, i: number, flexible: boolean) => (
    <View
      key={f.label}
      accessible
      accessibilityLabel={`${f.label}: ${f.value}`}
      style={[
        styles.cell,
        flexible ? styles.flex : styles.fixed,
        stacked ? styles.cellStacked : null,
        i > 0 && !stacked ? { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.separator } : null,
        i > 0 && stacked ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator } : null,
      ]}
    >
      <AppText variant="caption1" color="labelSecondary" maxScale={1.3} numberOfLines={1}>
        {f.label}
      </AppText>
      <AppText variant="headline" maxScale={1.3} numberOfLines={stacked ? 2 : 1}>
        {f.value}
      </AppText>
    </View>
  );

  const frame = {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: c.separator,
  };

  if (stacked) {
    return <View style={frame}>{facts.map((f, i) => cell(f, i, false))}</View>;
  }
  if (facts.length > 3) {
    return (
      <View style={frame}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {facts.map((f, i) => cell(f, i, false))}
        </ScrollView>
      </View>
    );
  }
  return <View style={[styles.rowWrap, frame]}>{facts.map((f, i) => cell(f, i, true))}</View>;
}

const styles = StyleSheet.create({
  rowWrap: { flexDirection: 'row' },
  cell: { minHeight: 72, justifyContent: 'center', gap: 2, paddingHorizontal: 12 },
  cellStacked: { minHeight: 56, paddingVertical: 8 },
  flex: { flex: 1 },
  fixed: { minWidth: 110 },
});
