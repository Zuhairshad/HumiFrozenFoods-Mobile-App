import { ComponentRef, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  Badge,
  Button,
  Divider,
  EmptyState,
  Reveal,
  ScreenHeader,
  Surface,
} from '@/components/ui';
import {
  CheckoutForm,
  formatCardNumber,
  formatExpiry,
  FormErrors,
  FormField,
  normalisePostcode,
  PaymentMethod,
  PaymentPicker,
  Slot,
  SlotPicker,
  slotLabel,
  SummaryRows,
  validateCheckout,
} from '@/features/cart';
import { useCart } from '@/hooks/useCart';
import { haptics } from '@/hooks/useHaptics';
import { formatPrice } from '@/lib/format';
import { makeOrderId } from '@/lib/ids';
import { computeTotals } from '@/lib/pricing';
import { useOrdersStore } from '@/store/orders';
import { colors, gutter, spacing } from '@/theme';
import type { Order } from '@/types';

const EMPTY_FORM: CheckoutForm = {
  name: '',
  email: '',
  phone: '',
  line1: '',
  city: '',
  postcode: '',
  cardNumber: '',
  cardExpiry: '',
  cardCvc: '',
};

function Section({ title, overline, children, delay = 0 }: { title: string; overline: string; children: React.ReactNode; delay?: number }) {
  return (
    <Reveal delay={delay}>
      <View style={styles.section}>
        <View>
          <AppText variant="overline" color="goldDeep">
            {overline}
          </AppText>
          <AppText variant="h2">{title}</AppText>
        </View>
        {children}
      </View>
    </Reveal>
  );
}

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const addOrder = useOrdersStore((s) => s.addOrder);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const [form, setForm] = useState<CheckoutForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [slot, setSlot] = useState<Slot | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>('cod');
  const [submitting, setSubmitting] = useState(false);

  const emailRef = useRef<ComponentRef<typeof TextInput>>(null);
  const phoneRef = useRef<ComponentRef<typeof TextInput>>(null);
  const cityRef = useRef<ComponentRef<typeof TextInput>>(null);
  const postcodeRef = useRef<ComponentRef<typeof TextInput>>(null);

  const set = <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  if (cart.lines.length === 0 && !submitting) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenHeader title="Checkout" onBack={() => router.back()} />
        <EmptyState
          icon="basket-outline"
          title="Nothing to check out"
          message="Add a few items to your cart first."
          actionLabel="Browse the shop"
          onAction={() => router.replace('/(tabs)/shop')}
        />
      </View>
    );
  }

  const placeOrder = () => {
    const found = validateCheckout(form, payment, !!slot);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      haptics.medium();
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setSubmitting(true);
    const totals = computeTotals(
      cart.lines.map((l) => ({ price: l.product.price, quantity: l.quantity })),
      { promoApplied: cart.promoApplied },
    );
    const id = makeOrderId();
    const order: Order = {
      id,
      placedAt: new Date().toISOString(),
      lines: cart.lines.map((l) => ({
        productId: l.productId,
        name: l.product.name,
        price: l.product.price,
        quantity: l.quantity,
        image: l.product.image,
      })),
      subtotal: totals.subtotal,
      delivery: totals.delivery,
      discount: totals.discount,
      total: totals.total,
      status: 'placed',
      address: `${form.line1.trim()}, ${form.city.trim()}, ${normalisePostcode(form.postcode)}`,
    };
    // Simulated processing delay so the loading state is visible; no payment is taken.
    setTimeout(() => {
      addOrder(order);
      cart.clear();
      haptics.success();
      const slotParam = slot ? `&slot=${encodeURIComponent(slotLabel(slot))}` : '';
      router.replace(`/order-success?id=${id}${slotParam}`);
    }, 700);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Checkout" subtitle={`${cart.count} items · ${formatPrice(cart.total)}`} onBack={() => router.back()} />
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.giant }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Section overline="1 · About you" title="Contact">
          <FormField
            label="Full name"
            value={form.name}
            onChangeText={(t) => set('name', t)}
            error={errors.name}
            placeholder="Amina Khan"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
          />
          <FormField
            ref={emailRef}
            label="Email"
            value={form.email}
            onChangeText={(t) => set('email', t)}
            error={errors.email}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
          />
          <FormField
            ref={phoneRef}
            label="Phone"
            value={form.phone}
            onChangeText={(t) => set('phone', t)}
            error={errors.phone}
            placeholder="07123 456789"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
          />
        </Section>

        <Section overline="2 · Where to" title="Delivery address" delay={60}>
          <FormField
            label="Address line 1"
            value={form.line1}
            onChangeText={(t) => set('line1', t)}
            error={errors.line1}
            placeholder="12 Cheetham Hill Road"
            autoComplete="street-address"
            textContentType="streetAddressLine1"
            returnKeyType="next"
            onSubmitEditing={() => cityRef.current?.focus()}
          />
          <FormField
            ref={cityRef}
            label="City"
            value={form.city}
            onChangeText={(t) => set('city', t)}
            error={errors.city}
            placeholder="Manchester"
            textContentType="addressCity"
            returnKeyType="next"
            onSubmitEditing={() => postcodeRef.current?.focus()}
          />
          <FormField
            ref={postcodeRef}
            label="Postcode"
            value={form.postcode}
            onChangeText={(t) => set('postcode', t.toUpperCase())}
            onBlur={() => set('postcode', normalisePostcode(form.postcode))}
            error={errors.postcode}
            placeholder="M8 8AB"
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="postal-code"
            textContentType="postalCode"
          />
        </Section>

        <Section overline="3 · When" title="Delivery slot" delay={120}>
          <SlotPicker
            value={slot}
            onChange={(s) => {
              setSlot(s);
              if (errors.slot) setErrors((e) => ({ ...e, slot: undefined }));
            }}
            error={errors.slot}
          />
        </Section>

        <Section overline="4 · Pay" title="Payment" delay={180}>
          <Badge label="Demo only · no real payment is processed" tone="sand" icon="information-circle-outline" />
          <PaymentPicker value={payment} onChange={setPayment} />
          {payment === 'card' ? (
            <View style={styles.cardFields}>
              <FormField
                label="Card number"
                value={form.cardNumber}
                onChangeText={(t) => set('cardNumber', formatCardNumber(t))}
                error={errors.cardNumber}
                placeholder="1234 5678 9012 3456"
                keyboardType="number-pad"
                maxLength={19}
              />
              <View style={styles.pair}>
                <View style={styles.half}>
                  <FormField
                    label="Expiry"
                    value={form.cardExpiry}
                    onChangeText={(t) => set('cardExpiry', formatExpiry(t))}
                    error={errors.cardExpiry}
                    placeholder="MM/YY"
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                </View>
                <View style={styles.half}>
                  <FormField
                    label="CVC"
                    value={form.cardCvc}
                    onChangeText={(t) => set('cardCvc', t.replace(/\D/g, '').slice(0, 4))}
                    error={errors.cardCvc}
                    placeholder="123"
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={4}
                  />
                </View>
              </View>
            </View>
          ) : null}
        </Section>

        <Section overline="5 · Review" title="Order summary" delay={240}>
          <Surface radius="lg" padded={spacing.xl}>
            {cart.lines.map((l) => (
              <View key={l.productId} style={styles.recapRow}>
                <AppText variant="body" style={styles.recapName} numberOfLines={1}>
                  {l.quantity} × {l.product.name}
                </AppText>
                <AppText variant="bodyStrong">{formatPrice(l.product.price * l.quantity)}</AppText>
              </View>
            ))}
            <Divider />
            <View style={styles.recapTotals}>
              <SummaryRows
                subtotal={cart.subtotal}
                delivery={cart.delivery}
                discount={cart.discount}
                total={cart.total}
              />
            </View>
          </Surface>
          <Button
            title={`Place order · ${formatPrice(cart.total)}`}
            variant="gold"
            size="lg"
            fullWidth
            icon="lock-closed"
            loading={submitting}
            onPress={placeOrder}
          />
          <AppText variant="caption" color="muted" align="center">
            Demo app: placing an order saves it on this device only.
          </AppText>
        </Section>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: gutter, gap: spacing.xxxl, paddingTop: spacing.md },
  section: { gap: spacing.md },
  cardFields: { gap: spacing.md },
  pair: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  recapRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  recapName: { flex: 1 },
  recapTotals: { marginTop: spacing.md },
});
