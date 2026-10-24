import { Linking, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { AppText, ListRow, ListSection, ScreenScroll } from '@/components/ui';
import { siteInfo } from '@/data';
import { AppearancePicker, IdentityRow } from '@/features/account';
import { useFavoritesStore } from '@/store/favorites';
import { useOrdersStore } from '@/store/orders';

const open = (url: string) => {
  Linking.openURL(url).catch(() => {});
};

export default function AccountScreen() {
  const router = useRouter();
  const orderCount = useOrdersStore((s) => s.orders.length);
  const favouriteCount = useFavoritesStore((s) => s.ids.length);
  const version = Constants.expoConfig?.version ?? '';
  const go = (href: string) => () => router.push(href as Href);

  return (
    <>
      <Stack.Screen options={{ title: 'Account', headerLargeTitleEnabled: true }} />
      <ScreenScroll grouped tabInset>
        <View style={styles.stack}>
          <ListSection>
            <IdentityRow />
          </ListSection>

          <ListSection>
            <ListRow
              icon="bag"
              title="Orders"
              value={orderCount > 0 ? String(orderCount) : undefined}
              onPress={go('/orders')}
              chevron
            />
            <ListRow
              icon="heart"
              title="Favourites"
              value={favouriteCount > 0 ? String(favouriteCount) : undefined}
              onPress={go('/favorites')}
              chevron
            />
          </ListSection>

          <ListSection header="Help & Company">
            <ListRow icon="info.circle" title="About Humi's" onPress={go('/about')} chevron />
            <ListRow icon="envelope" title="Contact Us" onPress={go('/contact')} chevron />
            <ListRow icon="building.2" title="Wholesale (B2B)" onPress={go('/b2b')} chevron />
            <ListRow icon="person.2" title="Become a Sales Rep" onPress={go('/sales-rep')} chevron />
          </ListSection>

          <ListSection header="Appearance">
            <AppearancePicker />
          </ListSection>

          <View style={styles.footer}>
            <AppText variant="footnote" color="labelSecondary" align="center">
              Follow us{'  '}
              <AppText
                variant="footnote"
                color="tint"
                accessibilityRole="link"
                onPress={() => open(siteInfo.social.facebook)}
              >
                Facebook
              </AppText>
              {'  ·  '}
              <AppText
                variant="footnote"
                color="tint"
                accessibilityRole="link"
                onPress={() => open(siteInfo.social.tiktok)}
              >
                TikTok
              </AppText>
            </AppText>
            <AppText variant="caption1" color="labelTertiary" align="center">
              {siteInfo.name}
              {version ? ` ${version}` : ''}
            </AppText>
          </View>
        </View>
      </ScreenScroll>
    </>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 24, paddingTop: 8 },
  footer: { gap: 6, paddingHorizontal: 20, paddingTop: 4 },
});
