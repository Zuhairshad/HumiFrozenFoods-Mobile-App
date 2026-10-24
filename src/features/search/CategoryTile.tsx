import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { AppText, FadeImage, PressableScale } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import type { Category } from '@/types';

export interface CategoryTileProps {
  category: Category;
}

const CLEAR_SCRIM = 'rgba(5,12,12,0)';

/** 96 pt category photo tile with the white title on a bottom scrim (Search > Browse). */
function CategoryTileBase({ category }: CategoryTileProps) {
  const { c, radius } = useTheme();

  const open = useCallback(() => {
    router.navigate({ pathname: '/shop', params: { category: category.id } });
  }, [category.id]);

  return (
    <PressableScale
      onPress={open}
      accessibilityLabel={`${category.title}, browse category`}
      style={[styles.tile, radius('lg'), { backgroundColor: c.fill }]}
    >
      <FadeImage uri={category.image} width={640} contentFit="cover" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={[CLEAR_SCRIM, c.scrim]}
        locations={[0.2, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.label} pointerEvents="none">
        <AppText variant="headline" color="#FFFFFF" numberOfLines={2} maxScale={1.4}>
          {category.title}
        </AppText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: { minHeight: 96, overflow: 'hidden', justifyContent: 'flex-end' },
  label: { padding: 12 },
});

export const CategoryTile = memo(CategoryTileBase);
