import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppText, Button, EmptyState, Reveal, Screen, ScreenHeader, Surface } from '@/components/ui';
import { OrderCard, FormInput } from '@/features/more';
import { useOrdersStore } from '@/store/orders';
import { gutter, spacing } from '@/theme';

export default function TrackScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const orders = useOrdersStore((s) => s.orders);
  const getOrder = useOrdersStore((s) => s.getOrder);
  const [query, setQuery] = useState(id ?? '');
  const [searched, setSearched] = useState<string | null>(id ?? null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/more'));
  const found = searched ? getOrder(searched) : undefined;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentContainerStyle={styles.content}>
        <ScreenHeader title="Track Orders" subtitle="Follow your Humi's delivery" onBack={back} />
        <View style={styles.body}>
          <Reveal>
            <Surface radius="lg" shadow="sm" padded={spacing.lg}>
              <View style={styles.lookup}>
                <FormInput
                  label="Enter order ID"
                  placeholder="e.g. HUMI-48213"
                  value={query}
                  onChangeText={setQuery}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={() => setSearched(query.trim() || null)}
                />
                <Button
                  title="Track order"
                  icon="search"
                  variant="gold"
                  fullWidth
                  disabled={!query.trim()}
                  onPress={() => setSearched(query.trim())}
                />
              </View>
            </Surface>
          </Reveal>

          {searched ? (
            found ? (
              <Reveal>
                <OrderCard key={found.id} order={found} initiallyOpen highlight />
              </Reveal>
            ) : (
              <Reveal>
                <Surface tone="sand" shadow={false} radius="lg">
                  <AppText variant="bodyStrong" align="center">
                    We couldn't find "{searched}"
                  </AppText>
                  <AppText variant="caption" color="muted" align="center" style={styles.nf}>
                    Check the order ID in your confirmation (it looks like HUMI-48213) and try again.
                  </AppText>
                </Surface>
              </Reveal>
            )
          ) : null}

          <AppText variant="overline" color="muted" style={styles.heading}>
            Your orders
          </AppText>
          {orders.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title="No orders yet"
              message="When you place an order it will appear here with live tracking."
              actionLabel="Start shopping"
              onAction={() => router.push('/(tabs)/shop')}
            />
          ) : (
            [...orders]
              .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
              .map((o, i) => (
                <Reveal key={o.id} delay={i * 70}>
                  <OrderCard order={o} initiallyOpen={i === 0 && !searched} />
                </Reveal>
              ))
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: spacing.huge },
  body: { paddingHorizontal: gutter, gap: spacing.lg, paddingTop: spacing.sm },
  lookup: { gap: spacing.md },
  nf: { marginTop: spacing.xs },
  heading: { marginTop: spacing.sm, paddingHorizontal: spacing.sm },
});
