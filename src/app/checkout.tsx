import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router, Stack, usePreventRemove } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, EmptyState, fireHaptic, PressableScale, ScreenScroll } from '@/components/ui';
import { CheckoutBar, SummaryRows, useCartQuote } from '@/features/cart';
import { usePromoStore } from '@/store/promo';
import { useConfigSync } from '@/store/server-config';
import {
  buildOrderDraft,
  CheckoutForm,
  EMPTY_FORM,
  getDeliveryDays,
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

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  useConfigSync();
  const cart = useCart();
  const quote = useCartQuote();
  const clearPromo = usePromoStore((s) => s.clear);
  const checkout = useStripeCheckout();
  const scrollRef = useRef<ComponentRef<typeof ScreenScroll>>(null);

  const [values, setValues] = useState<CheckoutFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [slot, setSlot] = useState<SlotSelection>(() => ({ date: getDeliveryDays()[0]?.key ?? null, window: null }));
  const [done, setDone] = useState(false);
  const retry = useRef<() => void>(() => {});

  const dirty = useMemo(() => Object.values(values).some((v) => v.trim().length > 0) || slot.window !== null, [values, slot]);
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

  const priceChange = checkout.state.error?.kind === 'price_changed' ? checkout.state.priceChange : undefined;
  const totalPence = priceChange?.newTotalPence ?? quote.pricing.totalPence;
  const payBlocked = quote.hasUnavailable || (!checkout.demo && !checkout.sheetAvailable);

  const submit = useCallback(async () => {
    if (checkout.busy) return;
    if (quote.hasUnavailable) {
      Alert.alert('Some items are unavailable', 'Remove them from your cart to continue.', [
        { text: 'Back to Cart', onPress: () => router.back() },
      ]);
      return;
    }
    const found = validateForm(values, !!slot.date && !!slot.window);
    setErrors(found);
    if (Object.keys(found).length > 0 || !slot.date || !slot.window) {
      fireHaptic('warning');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    // Live mode: only pay against a server quote, so the payment-intent total can be compared with it.
    if (!checkout.demo && quote.isEstimate) {
      quote.refresh();
      Alert.alert("We couldn't confirm your total", 'Check your connection, then tap Pay again.', [{ text: 'OK' }]);
      return;
    }
    const draft = buildOrderDraft(values, { date: slot.date, window: slot.window }, cart.lines, quote.appliedPromo);
    const res = await checkout.pay(draft, checkout.demo ? undefined : { expectedTotalPence: totalPence });

    if (res.status === 'succeeded' && res.result) {
      fireHaptic('success');
      cart.clear();
      clearPromo();
      setDone(true);
      disablePrevention();
      router.replace({ pathname: '/order/[id]', params: { id: res.result.orderNumber } });
    } else if (res.status === 'unconfirmed') {
      // Unclear sheet outcome and the server still says pending after ~30 s. Neither "paid" nor "failed":
      // the cart is kept, the pending order is kept, and Check Again asks the server before showing the sheet.
      Alert.alert(
        "We're still confirming your payment",
        "We haven't had an answer from your bank yet. If you were charged you won't be charged again, and the order will appear in Orders once it is confirmed.",
        [
          { text: 'Close', style: 'cancel' },
          { text: 'Check Again', onPress: () => retry.current() },
        ],
      );
    } else if (res.status === 'failed' && res.error) {
      const err = res.error;
      if (err.kind === 'price_changed' || err.returnToCart) quote.refresh();
      if (err.kind === 'validation' && err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        const mapped: FormErrors = {};
        for (const [k, msg] of Object.entries(err.fieldErrors)) {
          if (k === 'email' || k === 'phone' || k === 'name' || k === 'line1' || k === 'city' || k === 'postcode') mapped[k] = msg;
          else if (k === 'date' || k === 'window') mapped.slot = msg;
        }
        setErrors((e) => ({ ...e, ...mapped }));
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
      const buttons = err.returnToCart
        ? [
            { text: 'Stay Here', style: 'cancel' as const },
            { text: 'Back to Cart', onPress: () => router.back() },
          ]
        : err.retryable && err.kind !== 'price_changed'
          ? [
              { text: 'Cancel', style: 'cancel' as const },
              { text: 'Try Again', onPress: () => retry.current() },
            ]
          : [{ text: 'OK', style: 'cancel' as const }];
      Alert.alert(err.title, err.message, buttons);
    }
    // 'cancelled' returns quietly to idle: no alert.
  }, [cart, checkout, clearPromo, disablePrevention, quote, slot, totalPence, values]);

  useEffect(() => {
    retry.current = () => void submit();
  }, [submit]);

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
    : !checkout.sheetAvailable
      ? (checkout.sheetUnavailableMessage ?? 'Card payments need the mobile app')
      : 'Secured by Stripe · Apple Pay accepted';
  const label = checkout.state.status === 'verifying' ? 'Confirming payment' : busy ? 'Processing' : 'Pay';

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
          totalPence={totalPence}
          pricedLines={quote.lines}
        />
        {quote.hasUnavailable ? (
          <AppText variant="footnote" color="destructive" style={styles.demo} accessibilityLiveRegion="polite">
            Some items are no longer available. Go back to your cart and remove them to continue.
          </AppText>
        ) : null}
        <SummaryRows
          totals={priceChange ? { ...quote.pricing, totalPence: priceChange.newTotalPence } : quote.pricing}
          promoCode={quote.appliedPromo ?? undefined}
          estimate={quote.isEstimate}
          footer={quote.isEstimate && !checkout.demo ? 'Estimate. Your final total is confirmed before you pay.' : undefined}
        />
      </ScreenScroll>
      <CheckoutBar
        variant="glass"
        total={totalPence / 100}
        estimate={quote.isEstimate}
        disabled={payBlocked}
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
