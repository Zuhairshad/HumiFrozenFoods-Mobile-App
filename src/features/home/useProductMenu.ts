import { useCallback } from 'react';
import { ActionSheetIOS, Alert, Platform, Share } from 'react-native';
import { formatPrice } from '@/lib/format';
import { useCartStore } from '@/store/cart';
import { useFavoritesStore } from '@/store/favorites';
import type { Product } from '@/types';

/**
 * Long-press menu for a product tile: Add to cart, Favourite, Share.
 * Uses ActionSheetIOS on iOS and a plain Alert elsewhere (no native context-menu dependency).
 */
export function useProductMenu(product: Product): () => void {
  const add = useCartStore((s) => s.add);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);

  return useCallback(() => {
    const isFavorite = useFavoritesStore.getState().has(product.id);
    const favLabel = isFavorite ? 'Remove from Favourites' : 'Add to Favourites';
    const share = () => {
      Share.share({ message: `${product.name} (${formatPrice(product.price)}) from Humi's Frozen Foods` }).catch(
        () => undefined,
      );
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: product.name, options: ['Add to Cart', favLabel, 'Share', 'Cancel'], cancelButtonIndex: 3 },
        (i) => {
          if (i === 0) add(product.id, 1);
          else if (i === 1) toggleFavorite(product.id);
          else if (i === 2) share();
        },
      );
    } else {
      Alert.alert(product.name, undefined, [
        { text: 'Add to Cart', onPress: () => add(product.id, 1) },
        { text: favLabel, onPress: () => toggleFavorite(product.id) },
        { text: 'Share', onPress: share },
      ]);
    }
  }, [add, product, toggleFavorite]);
}
