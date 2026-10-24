import { useCallback, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router, Stack, usePreventRemove } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, EmptyState, fireHaptic, PressableScale, ScreenScroll } from '@/components/ui';
import { CheckoutBar } from '@/features/cart';
import {
  buildOrderDraft,
  CheckoutForm,
  EMPTY_FORM,
  validateField,
  validateForm,
  type CheckoutFormValues,
  type FormErrors,
  type RequiredField,
  type SlotSelection,
  useStripeCheckout,
} from '@/features/checkout';
import { useCart } from '@/hooks/useCart';
import { useTheme } from '@/hooks/useTheme';
import { formatPrice } from '@/lib/format';

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const cart = useCart();
  const checkout = useStripeCheckout();
  const scrollRef = useRef<ComponentRef<typeof ScreenScroll>>(null);

  const [values, setValues] = useState<CheckoutFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [slot, setSlot] = useState<SlotSelection>({ date: null, window: null });
  const [done, setDone] = useState(false);

  const dirty = useMemo(() => Object.values(values).some((v) => v.trim().length > 0) || slot.date !== null, [values, slot]);
  const busy = checkout.busy;

  const disablePrevention = usePreventRemove(!done && (dirty || busy), ({ repeat }) => {
    if (busy) return;
    Alert.alert('Discard checkout?', 'The details you entered will be lost.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: repeat },
    ]);
  });

  const onChange = useCallback(<K extends keyof CheckoutFormValues>(key: K, value: CheckoutFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (key in e ? { ...e, [key]: undefined } : e));
  }, []);

  const onBlurField = useCallback(
    (field: RequiredField) => {
      if (values[field].length === 0 && !errors[field]) return; // don't nag untouched fields
      setErrors((e) => ({ ...e, [field]: validateField(field, values) }));
    },
    [values, errors],
  );

  const onSlotChange = useCallback((next: SlotSelection) => {
    setSlot(next);
    if (next.date && next.window) setErrors((e) => ({ ...e, slot: undefined }));
  }, []);

  const previewPence = Math.round(cart.total * 100);
  const showQuote = checkout.state.error?.kind === 'price_changed' && checkout.quote;
  const displayTotal = showQuote && checkout.quote ? checkout.quote.totalPence / 100 : cart.total;

  const submit = useCallback(async () => {
    if (checkout.busy) return;
    const found = validateForm(values, !!slot.date && !!slot.window);
    setErrors(found);
    if (Object.keys(found).length > 0 || !slot.date || !slot.window) {
      fireHaptic('warning');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const draft = buildOrderDraft(values, { date: slot.date, window: slot.window }, cart.lines, cart.promoApplied);
    const expected = showQuote && checkout.quote ? checkout.quote.totalPence : previewPence;
    const res = await checkout.pay(draft, { expectedTotalPence: expected });

    if (res.status === 'succeeded' && res.result) {
      fireHaptic('success');
      cart.clear();
      setDone(true);
      disablePrevention();
      router.replace({ pathname: '/order/[id]', params: { id: res.result.orderNumber } });
    } else if (res.status === 'failed' && res.error) {
      const err = res.error;
      const buttons =
        err.kind === 'unsupported' || err.kind === 'validation'
          ? [{ text: 'OK', style: 'cancel' as const }]
          : err.kind === 'price_changed'
            ? [{ text: 'OK', style: 'default' as const }]
            : [
                { text: 'Cancel', style: 'cancel' as const },
                { text: 'Try Again', onPress: () => void submit() },
              ];
      Alert.alert(err.title, err.message, buttons);
    }
    // 'cancelled' returns quietly to idle: no alert.
  }, [cart, checkout, disablePrevention, previewPence, showQuote, slot, values]);

  const onCancel = useCallback(() => router.back(), []);

  const header = (
    <Stack.Screen
      options={{
        title: 'Checkout',
        gestureEnabled: !busy,
        headerLeft: () => (
          <PressableScale
            onPress={onCancel}
            disabled={busy}
            scaleTo={1}
            pressedOpacity={0.6}
            accessibilityLabel="Cancel checkout"
            style={styles.cancel}
          >
            <AppText variant="body" color="tint">
              Cancel
            </AppText>
          </PressableScale>
        ),
      }}
    />
  );

  if (cart.lines.length === 0 && !done) {
    return (
      <View style={[styles.root, { backgroundColor: c.groupedBackground }]}>
        {header}
        <EmptyState
          icon="bag"
          title="Nothing to check out"
          message="Add a few items to your cart first."
          actionLabel="Browse the Freezer"
          onAction={() => router.replace('/shop')}
        />
      </View>
    );
  }

  const footnote = checkout.demo
    ? 'Demo mode · no payment is taken'
    : 'Secured by Stripe · Apple Pay accepted';
  const label = busy ? 'Processing' : 'Pay';

  return (
    <View style={[styles.root, { backgroundColor: c.groupedBackground }]}>
      {header}
      <ScreenScroll
        ref={scrollRef}
        grouped
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 150 }}
      >
        {checkout.demo ? (
          <AppText variant="footnote" color="labelSecondary" style={styles.demo} accessibilityRole="text">
            Demo mode: this order is simulated and no card is charged.
          </AppText>
        ) : null}
        <CheckoutForm
          values={values}
          errors={errors}
          slot={slot}
          disabled={busy}
          onChange={onChange}
          onBlurField={onBlurField}
          onSlotChange={onSlotChange}
          lines={cart.lines}
          itemCount={cart.count}
          total={displayTotal}
        />
      </ScreenScroll>
      <CheckoutBar
        variant="glass"
        total={displayTotal}
        label={label}
        loading={busy}
        onPress={() => void submit()}
        footnote={footnote}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  cancel: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  demo: { marginHorizontal: 36, marginBottom: 16 },
});
