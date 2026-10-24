import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useToast } from '@/components/ui';

/** Shows the "Added to Cart" toast with a trailing "View Cart" action (2.4 s). */
export function useAddedToast(): () => void {
  const router = useRouter();
  const { show } = useToast();
  return useCallback(() => {
    show({
      message: 'Added to Cart',
      actionLabel: 'View Cart',
      onAction: () => router.push('/cart'),
      duration: 2400,
    });
  }, [router, show]);
}
