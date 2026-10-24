import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText, FadeImage } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import type { Order } from '@/types';

const MAX_THUMBS = 3;
const RING = 2;

interface OrderStackProps {
  lines: Order['lines'];
  /** Thumbnail edge. Defaults to 44 (48 is used by Items lists), 36 at large text sizes. */
  size?: number;
}

/** Up to three overlapped product thumbnails with a `cell` coloured ring, plus a "+n" overflow. */
export function OrderStack({ lines, size }: OrderStackProps) {
  const { c, radius } = useTheme();
  const { fontScale } = useWindowDimensions();
  const edge = size ?? (fontScale >= 1.35 ? 36 : 44);
  const overlap = Math.round(edge * 0.32);
  const shown = lines.slice(0, MAX_THUMBS);
  const extra = lines.length - shown.length;
  const outer = edge + RING * 2;

  return (
    <View
      style={[styles.row, { height: outer }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {shown.map((line, i) => (
        <View
          key={`${line.productId}-${i}`}
          style={[
            styles.ring,
            radius('md'),
            {
              width: outer,
              height: outer,
              backgroundColor: c.cell,
              marginLeft: i === 0 ? 0 : -overlap,
              zIndex: MAX_THUMBS - i,
            },
          ]}
        >
          <FadeImage
            uri={line.image}
            width={256}
            contentFit="cover"
            style={[{ width: edge, height: edge }, radius('sm')]}
          />
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={[
            styles.ring,
            styles.more,
            radius('md'),
            { width: outer, height: outer, backgroundColor: c.fill, marginLeft: -overlap },
          ]}
        >
          <AppText variant="caption1Strong" color="labelSecondary" maxScale={1.3}>
            +{extra}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  ring: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  more: { zIndex: 0 },
});
