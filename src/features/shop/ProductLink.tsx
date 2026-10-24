import { memo, useCallback, type ReactNode } from 'react';
import { Platform, Share, type StyleProp, type ViewStyle } from 'react-native';
import { Link, router } from 'expo-router';
import { PressableScale, useToast } from '@/components/ui';
import { haptics } from '@/hooks/useHaptics';
import { useCartStore } from '@/store/cart';
import { useFavoritesStore } from '@/store/favorites';
import type { Product } from '@/types';

interface ProductLinkProps {
  product: Product;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  accessibilityLabel: string;
}

/**
 * Pressable that opens the product page. On iOS a long-press shows the native context menu
 * (Add to cart, Favourite, Share) through `Link.Menu`; elsewhere it is a plain press target.
 */
export const ProductLink = memo(function ProductLink({
  product,
  children,
  style,
  scaleTo = 0.97,
  accessibilityLabel,
}: ProductLinkProps) {
  const { id, name } = product;
  const toast = useToast();
  const isFavourite = useFavoritesStore((s) => s.ids.includes(id));

  const open = useCallback(() => {
    router.push({ pathname: '/product/[id]', params: { id } });
  }, [id]);

  const addToCart = useCallback(() => {
    useCartStore.getState().add(id, 1);
    haptics.light();
    toast.show({ message: 'Added to cart' });
  }, [id, toast]);

  const toggleFavourite = useCallback(() => {
    const was = useFavoritesStore.getState().ids.includes(id);
    useFavoritesStore.getState().toggle(id);
    if (!was) haptics.success();
  }, [id]);

  const share = useCallback(() => {
    Share.share({ message: `${name} from Humi's Frozen Foods` }).catch(() => {});
  }, [name]);

  if (Platform.OS !== 'ios') {
    return (
      <PressableScale
        onPress={open}
        scaleTo={scaleTo}
        style={style}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Opens product"
      >
        {children}
      </PressableScale>
    );
  }

  return (
    <Link href={{ pathname: '/product/[id]', params: { id } }} asChild>
      <Link.Trigger>
        <PressableScale
          scaleTo={scaleTo}
          style={style}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint="Opens product"
        >
          {children}
        </PressableScale>
      </Link.Trigger>
      <Link.Menu>
        <Link.MenuAction icon="cart.badge.plus" onPress={addToCart}>
          Add to cart
        </Link.MenuAction>
        <Link.MenuAction icon={isFavourite ? 'heart.slash' : 'heart'} onPress={toggleFavourite}>
          {isFavourite ? 'Remove from favourites' : 'Add to favourites'}
        </Link.MenuAction>
        <Link.MenuAction icon="square.and.arrow.up" onPress={share}>
          Share
        </Link.MenuAction>
      </Link.Menu>
    </Link>
  );
});
