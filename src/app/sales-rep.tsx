import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { AppText, ListRow, ListSection } from '@/components/ui';
import { EnquiryForm, FormScroll } from '@/features/account';

export default function SalesRepScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: 'Sales Rep', headerLargeTitleEnabled: true }} />
      <FormScroll>
        <View style={styles.intro}>
          <AppText variant="body" color="labelSecondary">
            Introduce local businesses to Humi&apos;s and earn commission on the orders you bring in.
          </AppText>
        </View>
        <ListSection>
          <ListRow icon="tag" title="Earn commission" subtitle="On every business you introduce." />
          <ListRow icon="mappin.and.ellipse" title="Work your own area" subtitle="Cover the patch you know best." />
        </ListSection>
        <EnquiryForm variant="salesRep" onDone={() => router.back()} />
      </FormScroll>
    </>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: 20 },
});
