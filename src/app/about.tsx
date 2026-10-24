import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { ScreenScroll } from '@/components/ui';
import { AboutHero, AddressFootnote, KindWords, OurStory, StandFor } from '@/features/account';

export default function AboutScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'About', headerLargeTitleEnabled: true }} />
      <ScreenScroll grouped>
        <AboutHero />
        <View style={styles.stack}>
          <OurStory />
          <StandFor />
          <KindWords />
          <AddressFootnote />
        </View>
      </ScreenScroll>
    </>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 24 },
});
