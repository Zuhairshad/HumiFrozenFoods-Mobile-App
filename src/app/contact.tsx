import { Linking, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { ListRow, ListSection } from '@/components/ui';
import { siteInfo } from '@/data';
import { EnquiryForm, FormScroll } from '@/features/account';

const open = (url: string) => {
  Linking.openURL(url).catch(() => {});
};

const phoneDigits = siteInfo.phone.replace(/[^\d+]/g, '');
const mapsUrl = Platform.select({
  ios: `https://maps.apple.com/?q=${encodeURIComponent(siteInfo.address)}`,
  android: `geo:0,0?q=${encodeURIComponent(siteInfo.address)}`,
  default: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(siteInfo.address)}`,
});

export default function ContactScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Contact Us', headerLargeTitleEnabled: true }} />
      <FormScroll>
        <ListSection>
          <ListRow icon="phone" title="Call" value={siteInfo.phone} onPress={() => open(`tel:${phoneDigits}`)} chevron />
          <ListRow icon="envelope" title="Email" value={siteInfo.email} onPress={() => open(`mailto:${siteInfo.email}`)} chevron />
          <ListRow icon="mappin.and.ellipse" title="Visit" subtitle={siteInfo.address} onPress={() => open(mapsUrl)} chevron />
          <ListRow icon="clock" title="Opening hours" subtitle={siteInfo.hours} />
        </ListSection>
        <EnquiryForm variant="contact" />
      </FormScroll>
    </>
  );
}
