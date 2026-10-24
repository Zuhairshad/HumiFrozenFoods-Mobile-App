import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { Screen } from '@/components/ui';
import {
  BestSellers,
  ClosingCta,
  CollectionsRow,
  FreshGrid,
  HeroCarousel,
  PromoBanner,
  Testimonials,
  TrustStrip,
} from '@/features/home';
import { colors, TAB_BAR_CLEARANCE } from '@/theme';

export default function HomeScreen() {
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  return (
    // Hero is full-bleed under the status bar, so no safe-area edges; clearance is applied on the scroll content.
    <Screen scroll={false} edges={[]} bg={colors.cream}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
      >
        <HeroCarousel scrollY={scrollY} />
        <CollectionsRow />
        <TrustStrip />
        <BestSellers />
        <PromoBanner />
        <FreshGrid />
        <Testimonials />
        <ClosingCta />
      </Animated.ScrollView>
    </Screen>
  );
}
