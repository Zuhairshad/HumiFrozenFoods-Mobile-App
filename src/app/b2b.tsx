import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { AppText, ListRow, ListSection } from '@/components/ui';
import { EnquiryForm, FormScroll } from '@/features/account';

export default function WholesaleScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: 'Wholesale', headerLargeTitleEnabled: true }} />
      <FormScroll>
        <View style={styles.intro}>
          <AppText variant="body" color="labelSecondary">
            Stock halal, UK made favourites in your restaurant, takeaway or shop. Tell us about your
            business and our trade team will call you back.
          </AppText>
        </View>
        <ListSection>
          <ListRow icon="tag" title="Wholesale pricing" subtitle="Trade prices that improve with volume." />
          <ListRow icon="shippingbox" title="Bulk catering packs" subtitle="Large formats for kitchens and events." />
          <ListRow icon="snowflake" title="Reliable UK delivery" subtitle="Temperature controlled, on a schedule that suits you." />
        </ListSection>
        <EnquiryForm variant="b2b" onDone={() => router.back()} />
      </FormScroll>
    </>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: 20 },
});
