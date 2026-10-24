import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText, FadeImage, Icon, ListRow, ListSection } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { heroSlides, siteInfo, testimonials } from '@/data';
import { useTheme } from '@/hooks/useTheme';

const HERO_HEIGHT = 260;

/** Full-bleed photo at the top of About. Decorative, with a scrim at the foot for the native title. */
export function AboutHero() {
  const { width } = useWindowDimensions();
  const { c } = useTheme();
  const uri = heroSlides[0]?.image;
  return (
    <View style={{ width, height: HERO_HEIGHT, backgroundColor: c.fill }} accessible={false}>
      {uri ? (
        <FadeImage uri={uri} width={1080} contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : null}
      <LinearGradient
        colors={['rgba(5,12,12,0)', 'rgba(5,12,12,0.45)']}
        locations={[0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export function OurStory() {
  return (
    <View style={styles.block}>
      <AppText variant="title2" accessibilityRole="header">
        Our story
      </AppText>
      <AppText variant="body" color="labelSecondary" style={styles.para}>
        Humi&apos;s started with a simple idea: the snacks we grew up on, crisp samosas, sizzling
        kebabs and golden spring rolls, should never take hours to enjoy.
      </AppText>
      <AppText variant="body" color="labelSecondary" style={styles.para}>
        Every piece is made in the United Kingdom from halal certified ingredients and traditional
        recipes, then flash frozen so it reaches you as fresh as the day it was folded. Straight from
        the freezer to the fryer, oven or air fryer in minutes.
      </AppText>
    </View>
  );
}

const VALUES: { icon: IconName; title: string; subtitle: string }[] = [
  { icon: 'checkmark.seal', title: 'Halal certified', subtitle: 'Every product, from sourcing to the freezer bag.' },
  { icon: 'flag', title: 'Made in the UK', subtitle: 'Crafted in our kitchens to strict food safety standards.' },
  { icon: 'timer', title: 'Ready in minutes', subtitle: 'Frozen at peak freshness so dinner is quick.' },
];

export function StandFor() {
  return (
    <ListSection header="What we stand for">
      {VALUES.map((v) => (
        <ListRow key={v.title} icon={v.icon} title={v.title} subtitle={v.subtitle} />
      ))}
    </ListSection>
  );
}

const CARD_WIDTH = 280;

export function KindWords() {
  const { c, radius } = useTheme();
  return (
    <View>
      <AppText variant="footnote" color="labelSecondary" style={styles.sectionLabel} accessibilityRole="header">
        Kind words
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.shelf}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + 12}
      >
        {testimonials.slice(0, 3).map((t) => (
          <View
            key={t.id}
            style={[styles.card, radius('lg'), { backgroundColor: c.cell, width: CARD_WIDTH }]}
            accessible
            accessibilityLabel={`${t.name}, ${t.location}. Rated ${t.rating} out of 5. ${t.quote}`}
          >
            <View style={styles.stars} accessible={false}>
              {Array.from({ length: Math.max(0, Math.min(5, Math.round(t.rating))) }).map((_, i) => (
                <Icon key={i} fill name="star" size={13} color={c.accent} />
              ))}
            </View>
            <AppText variant="callout" numberOfLines={6}>
              {t.quote}
            </AppText>
            <AppText variant="footnoteStrong">{t.name}</AppText>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function AddressFootnote() {
  return (
    <AppText variant="footnote" color="labelTertiary" align="center" style={styles.address}>
      {siteInfo.name}
      {'\n'}
      {siteInfo.address}
    </AppText>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: 20, paddingTop: 24 },
  para: { marginTop: 8 },
  sectionLabel: { paddingHorizontal: 36, paddingBottom: 8 },
  shelf: { paddingHorizontal: 20, gap: 12 },
  card: { padding: 16, gap: 10, justifyContent: 'space-between' },
  stars: { flexDirection: 'row', gap: 2 },
  address: { paddingHorizontal: 20, paddingTop: 8 },
});
