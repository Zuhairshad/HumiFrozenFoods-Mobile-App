import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { AppText, FilterChip, Icon, PressableScale } from '@/components/ui';
import { bestSellersOf } from '@/data/selectors';
import { useCategories, useProducts } from '@/hooks/useProducts';
import { haptics } from '@/hooks/useHaptics';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore } from '@/store/settings';
import { CategoryTile } from './CategoryTile';

export interface SearchIdleProps {
  /** Fills the search field with this text and runs the search. */
  onSelectQuery: (query: string) => void;
}

const SIDE = 20;
const GAP = 12;
const DELETE_WIDTH = 88;
const A11Y_FONT_SCALE = 1.35;

interface RecentRowProps {
  query: string;
  onSelect: (query: string) => void;
  onRemove: (query: string) => void;
}

const RecentRow = memo(function RecentRow({ query, onSelect, onRemove }: RecentRowProps) {
  const { c } = useTheme();

  const renderDelete = useCallback(
    () => (
      <View style={[styles.deleteAction, { backgroundColor: c.destructive }]}>
        <AppText variant="subheadStrong" color="#FFFFFF" maxScale={1.3}>
          Delete
        </AppText>
      </View>
    ),
    [c.destructive],
  );

  const onOpen = useCallback(() => {
    haptics.selection();
    onRemove(query);
  }, [onRemove, query]);

  return (
    <ReanimatedSwipeable
      renderRightActions={renderDelete}
      onSwipeableOpen={onOpen}
      rightThreshold={DELETE_WIDTH * 0.6}
      overshootRight={false}
      friction={1.5}
    >
      <View style={[styles.recent, { backgroundColor: c.background }]}>
        <PressableScale
          onPress={() => onSelect(query)}
          scaleTo={1}
          haptic="none"
          accessibilityLabel={`Search ${query}`}
          style={styles.recentMain}
        >
          <Icon name="clock" size={18} color="labelTertiary" />
          <AppText variant="body" numberOfLines={1} style={styles.recentText}>
            {query}
          </AppText>
        </PressableScale>
        <PressableScale
          onPress={() => onRemove(query)}
          scaleTo={0.9}
          haptic="none"
          accessibilityLabel={`Remove ${query} from recent searches`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.recentRemove}
        >
          <Icon name="xmark" size={14} color="labelTertiary" weight="semibold" />
        </PressableScale>
      </View>
    </ReanimatedSwipeable>
  );
});

/** Idle Search content: Recent (swipe to delete), Browse (2x2 categories) and Popular. */
function SearchIdleBase({ onSelectQuery }: SearchIdleProps) {
  const { width, fontScale } = useWindowDimensions();
  const categories = useCategories();
  const products = useProducts();
  const popular = useMemo(() => bestSellersOf(products, 6), [products]);
  const recents = useSettingsStore((s) => s.recentSearches);
  const removeRecent = useSettingsStore((s) => s.removeRecentSearch);
  const clearRecents = useSettingsStore((s) => s.clearRecentSearches);

  const tileWidth = fontScale >= A11Y_FONT_SCALE ? width - SIDE * 2 : (width - SIDE * 2 - GAP) / 2;

  const onClear = useCallback(() => {
    haptics.selection();
    clearRecents();
  }, [clearRecents]);

  return (
    <View style={styles.root}>
      {recents.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.titleRow}>
            <AppText variant="title3" accessibilityRole="header">
              Recent
            </AppText>
            <PressableScale onPress={onClear} haptic="none" accessibilityLabel="Clear recent searches" scaleTo={0.96}>
              <AppText variant="footnoteStrong" color="tint">
                Clear
              </AppText>
            </PressableScale>
          </View>
          <View>
            {recents.map((q) => (
              <RecentRow key={q} query={q} onSelect={onSelectQuery} onRemove={removeRecent} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.titleRow}>
          <AppText variant="title3" accessibilityRole="header">
            Browse
          </AppText>
        </View>
        <View style={styles.grid}>
          {categories.map((cat) => (
            <View key={cat.id} style={{ width: tileWidth }}>
              <CategoryTile category={cat} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.titleRow}>
          <AppText variant="title3" accessibilityRole="header">
            Popular
          </AppText>
        </View>
        <View style={styles.chips}>
          {popular.map((p) => (
            <FilterChip key={p.id} label={p.name} icon="flame" selected={false} onPress={() => onSelectQuery(p.name)} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 28, paddingTop: 8 },
  section: { gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  recent: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  recentMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  recentText: { flex: 1 },
  recentRemove: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  deleteAction: { width: DELETE_WIDTH, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

export const SearchIdle = memo(SearchIdleBase);
