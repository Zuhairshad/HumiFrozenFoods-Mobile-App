import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { AppText, Button, FieldRow, ListSection } from '@/components/ui';
import { FormScroll, getOrdersGateway, isEmail, isPhone } from '@/features/account';
import { haptics } from '@/hooks/useHaptics';

export default function OrderLookupScreen() {
  const router = useRouter();
  const [orderId, setOrderId] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contactOk = isEmail(contact) || isPhone(contact);
  const ready = orderId.trim().length >= 4 && contactOk;

  const find = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await getOrdersGateway().lookup({ orderId: orderId.trim(), contact: contact.trim() });
      if (result.ok) {
        haptics.success();
        router.replace(`/orders/${result.order.id}` as Href);
        return;
      }
      setError(
        result.reason === 'unavailable'
          ? 'Order lookup is unavailable right now. Try again shortly.'
          : "We couldn't find an order matching those details. Check the order number and the email or phone used at checkout.",
      );
    } catch {
      setError('Order lookup is unavailable right now. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Find an order' }} />
      <FormScroll>
        <ListSection header="Order details" footer="Use the email address or phone number you gave at checkout.">
          <FieldRow
            label="Order no."
            value={orderId}
            onChangeText={(t: string) => {
              setOrderId(t.toUpperCase());
              setError(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="next"
            placeholder="HUMI-48213"
          />
          <FieldRow
            label="Email or phone"
            value={contact}
            onChangeText={(t: string) => {
              setContact(t);
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="default"
            returnKeyType="search"
            onSubmitEditing={find}
          />
        </ListSection>
        {error ? (
          <View style={styles.error} accessibilityLiveRegion="polite">
            <AppText variant="footnote" color="destructive">
              {error}
            </AppText>
          </View>
        ) : null}
        <View style={styles.cta}>
          <Button title="Find Order" size="lg" fullWidth loading={busy} disabled={!ready || busy} onPress={find} />
        </View>
      </FormScroll>
    </>
  );
}

const styles = StyleSheet.create({
  error: { paddingHorizontal: 36, marginTop: -8 },
  cta: { paddingHorizontal: 20 },
});
