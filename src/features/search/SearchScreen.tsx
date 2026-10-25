import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, StyleSheet, View, type ListRenderItem } from 'react-native';
import { router, Stack, useScrollToTop } from 'expo-router';
import type { SearchBarCommands } from 'react-native-screens';
import { AppText, EmptyState, FadeImage, Icon, PressableScale } from '@/components/ui';
import { ProductRow } from '@/features/shop/ProductRow';
import { useCategories, useProducts } from '@/hooks/useProducts';
import { useTabInset } from '@/hooks/useTabInset';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore } from '@/store/settings';
import type { Category } from '@/types';
import { SearchField } from './SearchField';
import { SearchIdle } from './SearchIdle';
import { buildSearchItems, type SearchItem } from './results';

const NATIVE_SEARCH = Platform.OS === 'ios';
const PLACEHOLDER = 'Search samosas, kebabs';

const keyExtractor = (item: SearchItem) => item.key;

interface CategoryMatchRowProps {
  category: Category;
  count: number;
}

function CategoryMatchRow({ category, count }: CategoryMatchRowProps) {
  const { c, radius } = useTheme();
  const open = useCallback(() => {
    router.navigate({ pathname: '/shop', params: { category: category.id } });
  }, [category.id]);
  return (
    <PressableScale
      onPress={open}
      scaleTo={1}
      accessibilityLabel={`${category.title}, category, ${count} products`}
      style={styles.categoryRow}
    >
      <FadeImage
        uri={category.image}
        width={256}
        contentFit="cover"
        style={[styles.categoryThumb, { backgroundColor: c.fill }, radius('md')]}
      />
      <View style={styles.categoryText}>
        <AppText variant="headline" numberOfLines={1}>
          {category.title}
        </AppText>
        <AppText variant="footnote" color="labelSecondary">
          {`Category · ${count} products`}
        </AppText>
      </View>
      <Icon name="chevron.right" size={13} color="labelQuaternary" weight="semibold" />
    </PressableScale>
  );
}

export function SearchScreen() {
  const { c } = useTheme();
  const tabInset = useTabInset();
  const addRecent = useSettingsStore((s) => s.addRecentSearch);
  const products = useProducts();
  const categories = useCategories();

  const [query, setQuery] = useState('');
  const queryRef = useRef('');
  const searchBarRef = useRef<SearchBarCommands>(null);
  const listRef = useRef<FlatList<SearchItem>>(null);
  useScrollToTop(listRef);

  const onChangeText = useCallback((text: string) => {
    queryRef.current = text;
    setQuery(text);
  }, []);

  const commit = useCallback(
    (text: string) => {
      if (text.trim().length > 0) addRecent(text);
    },
    [addRecent],
  );

  /** Used by Recent / Popular / "Browse all": fill the (native or fallback) field and search. */
  const applyQuery = useCallback(
    (text: string) => {
      searchBarRef.current?.setText(text);
      onChangeText(text);
      commit(text);
    },
    [commit, onChangeText],
  );

  const searchBarOptions = useMemo(
    () =>
      NATIVE_SEARCH
        ? {
            ref: searchBarRef,
            placeholder: PLACEHOLDER,
            placement: 'stacked' as const,
            hideWhenScrolling: false,
            autoCapitalize: 'none' as const,
            tintColor: c.tint,
            onChangeText: (e: { nativeEvent: { text: string } }) => onChangeText(e.nativeEvent.text),
            onSearchButtonPress: (e: { nativeEvent: { text: string } }) => commit(e.nativeEvent.text),
            onCancelButtonPress: () => onChangeText(''),
            onBlur: () => commit(queryRef.current),
          }
        : undefined,
    [c.tint, commit, onChangeText],
  );

  const items = useMemo(() => buildSearchItems(query, products, categories), [query, products, categories]);
  const trimmed = query.trim();

  const renderItem = useCallback<ListRenderItem<SearchItem>>(
    ({ item }) => {
      if (item.kind === 'category') return <CategoryMatchRow category={item.category} count={item.count} />;
      if (item.kind === 'header') {
        return (
          <AppText variant="title3" accessibilityRole="header" style={styles.sectionTitle}>
            {item.title}
          </AppText>
        );
      }
      return <ProductRow product={item.product} variant="search" query={trimmed} hideSeparator={item.last} />;
    },
    [trimmed],
  );

  const browseAll = useCallback(() => {
    applyQuery('');
    router.navigate('/shop');
  }, [applyQuery]);

  const listHeader = useMemo(
    () =>
      NATIVE_SEARCH ? undefined : (
        <View style={styles.fallbackField}>
          <SearchField value={query} onChangeText={onChangeText} onSubmit={commit} placeholder={PLACEHOLDER} />
        </View>
      ),
    [commit, onChangeText, query],
  );

  const empty = useMemo(
    () =>
      trimmed ? (
        <EmptyState
          icon="magnifyingglass"
          title={`No results for ‘${trimmed}’`}
          message="Check the spelling or try a different word."
          actionLabel="Browse all products"
          onAction={browseAll}
        />
      ) : (
        <SearchIdle onSelectQuery={applyQuery} />
      ),
    [applyQuery, browseAll, trimmed],
  );

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      {searchBarOptions ? <Stack.Screen options={{ headerSearchBarOptions: searchBarOptions }} /> : null}
      <FlatList
        ref={listRef}
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={empty}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        scrollIndicatorInsets={{ bottom: tabInset - 16 }}
        contentContainerStyle={[styles.content, { paddingBottom: tabInset }]}
        initialNumToRender={10}
        windowSize={7}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  fallbackField: { paddingBottom: 12 },
  sectionTitle: { paddingTop: 12, paddingBottom: 4 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingVertical: 8 },
  categoryThumb: { width: 56, height: 56 },
  categoryText: { flex: 1, gap: 1 },
});
