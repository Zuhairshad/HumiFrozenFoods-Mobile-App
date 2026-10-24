import { memo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Icon, PressableScale } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  title: string;
  onSeeAll?: () => void;
  children: ReactNode;
  /** Wrap children in a horizontal scroller (default). Pass false to supply your own. */
  scroll?: boolean;
}

export const Shelf = memo(function Shelf({ title, onSeeAll, children, scroll = true }: Props) {
  const { c } = useTheme();
  return (
    <View>
      <View style={styles.header}>
        <AppText variant="title2" accessibilityRole="header" style={styles.title} numberOfLines={1}>
          {title}
        </AppText>
        {onSeeAll ? (
          <PressableScale
            onPress={onSeeAll}
            haptic="none"
            scaleTo={0.97}
            accessibilityLabel={`See all ${title}`}
            style={styles.seeAll}
            hitSlop={8}
          >
            <AppText variant="footnoteStrong" color="tint" maxScale={1.3}>
              See All
            </AppText>
            <Icon name="chevron.right" size={12} weight="semibold" color={c.tint} />
          </PressableScale>
        ) : null}
      </View>
      {scroll ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          contentContainerStyle={styles.scroller}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { flex: 1, paddingRight: 12 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 32 },
  scroller: { paddingHorizontal: 20, gap: 12 },
});
