import { useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { AppText, FadeImage, Icon, ListSection, PressableScale } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { formatPrice } from '@/lib/format';
import type { CartLineWithProduct } from '@/hooks/useCart';
import { DaySegment } from './DaySegment';
import { FieldPair, FieldRow, GroupError, RadioRow } from './fields';
import { DELIVERY_WINDOWS, getDeliveryDays, isWindowAvailable } from './slots';
import type { CheckoutFormValues, FormErrors, RequiredField } from './validation';
import type { DeliveryWindowId } from '@/lib/api/types';

export interface SlotSelection {
  date: string | null;
  window: DeliveryWindowId | null;
}

export interface CheckoutFormProps {
  values: CheckoutFormValues;
  errors: FormErrors;
  slot: SlotSelection;
  disabled?: boolean;
  onChange: <K extends keyof CheckoutFormValues>(key: K, value: CheckoutFormValues[K]) => void;
  onBlurField: (field: RequiredField) => void;
  onSlotChange: (slot: SlotSelection) => void;
  lines: CartLineWithProduct[];
  itemCount: number;
  /** Total shown in the collapsed summary row (pounds). */
  total: number;
}

export function CheckoutForm({
  values,
  errors,
  slot,
  disabled,
  onChange,
  onBlurField,
  onSlotChange,
  lines,
  itemCount,
  total,
}: CheckoutFormProps) {
  const { c } = useTheme();
  const phone = useRef<ComponentRef<typeof TextInput>>(null);
  const name = useRef<ComponentRef<typeof TextInput>>(null);
  const line1 = useRef<ComponentRef<typeof TextInput>>(null);
  const line2 = useRef<ComponentRef<typeof TextInput>>(null);
  const city = useRef<ComponentRef<typeof TextInput>>(null);
  const postcode = useRef<ComponentRef<typeof TextInput>>(null);
  const notes = useRef<ComponentRef<typeof TextInput>>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const days = useMemo(() => getDeliveryDays(), []);
  const selectedDay = days.find((d) => d.key === slot.date) ?? null;
  const now = new Date();

  const contactError = errors.email ?? errors.phone;
  const addressError = errors.name ?? errors.line1 ?? errors.city ?? errors.postcode;

  const next = (ref: RefObject<ComponentRef<typeof TextInput> | null>) => () => ref.current?.focus();

  return (
    <View pointerEvents={disabled ? 'none' : 'auto'} style={disabled ? styles.disabled : undefined}>
      <ListSection header="Contact">
        <FieldRow
          label="Email"
          value={values.email}
          onChangeText={(t) => onChange('email', t)}
          onBlur={() => onBlurField('email')}
          invalid={!!errors.email}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={next(phone)}
        />
        <FieldRow
          inputRef={phone}
          label="Phone"
          value={values.phone}
          onChangeText={(t) => onChange('phone', t)}
          onBlur={() => onBlurField('phone')}
          invalid={!!errors.phone}
          placeholder="07123 456789"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={next(name)}
        />
      </ListSection>
      <GroupError message={contactError} />

      <ListSection header="Delivery address">
        <FieldRow
          inputRef={name}
          label="Full name"
          value={values.name}
          onChangeText={(t) => onChange('name', t)}
          onBlur={() => onBlurField('name')}
          invalid={!!errors.name}
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={next(line1)}
        />
        <FieldRow
          inputRef={line1}
          label="Address line 1"
          value={values.line1}
          onChangeText={(t) => onChange('line1', t)}
          onBlur={() => onBlurField('line1')}
          invalid={!!errors.line1}
          autoComplete="address-line1"
          textContentType="streetAddressLine1"
          autoCapitalize="words"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={next(line2)}
        />
        <FieldRow
          inputRef={line2}
          label="Address line 2"
          value={values.line2}
          onChangeText={(t) => onChange('line2', t)}
          placeholder="Optional"
          autoComplete="address-line2"
          textContentType="streetAddressLine2"
          autoCapitalize="words"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={next(city)}
        />
        <FieldPair
          left={{
            inputRef: city,
            label: 'Town / City',
            value: values.city,
            onChangeText: (t) => onChange('city', t),
            onBlur: () => onBlurField('city'),
            invalid: !!errors.city,
            textContentType: 'addressCity',
            autoCapitalize: 'words',
            returnKeyType: 'next',
            submitBehavior: 'submit',
            onSubmitEditing: next(postcode),
          }}
          right={{
            inputRef: postcode,
            label: 'Postcode',
            value: values.postcode,
            onChangeText: (t) => onChange('postcode', t.toUpperCase()),
            onBlur: () => onBlurField('postcode'),
            invalid: !!errors.postcode,
            autoComplete: 'postal-code',
            textContentType: 'postalCode',
            autoCapitalize: 'characters',
            autoCorrect: false,
            returnKeyType: 'done',
          }}
        />
      </ListSection>
      <GroupError message={addressError} />

      <AppText variant="footnote" color="labelSecondary" accessibilityRole="header" style={styles.header}>
        Delivery time
      </AppText>
      <DaySegment days={days} value={slot.date} onChange={(date) => {
        const day = days.find((d) => d.key === date);
        const keep = day && slot.window && isWindowAvailable(day, DELIVERY_WINDOWS.find((w) => w.id === slot.window)!, now);
        onSlotChange({ date, window: keep ? slot.window : null });
      }} />
      <ListSection>
        {DELIVERY_WINDOWS.map((w) => (
          <RadioRow
            key={w.id}
            title={w.label}
            detail={w.range}
            selected={slot.window === w.id}
            disabled={!selectedDay || !isWindowAvailable(selectedDay, w, now)}
            onPress={() => onSlotChange({ ...slot, window: w.id })}
          />
        ))}
      </ListSection>
      <GroupError message={errors.slot} />

      <ListSection>
        <PressableScale
          onPress={() => setSummaryOpen((o) => !o)}
          scaleTo={1}
          accessibilityLabel={`Order summary, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}, ${formatPrice(total)}`}
          accessibilityState={{ expanded: summaryOpen }}
          style={styles.summaryRow}
        >
          <AppText variant="body" style={styles.grow}>
            Order summary
          </AppText>
          <AppText variant="callout" color="labelSecondary">
            {itemCount} {itemCount === 1 ? 'item' : 'items'} · {formatPrice(total)}
          </AppText>
          <Icon name={summaryOpen ? 'chevron.up' : 'chevron.down'} size={13} color="labelQuaternary" />
        </PressableScale>
        {summaryOpen
          ? lines.map((l) => (
              <View key={l.productId} style={styles.line}>
                <FadeImage uri={l.product.image} width={256} style={styles.thumb} recyclingKey={l.productId} />
                <AppText variant="subhead" numberOfLines={2} style={styles.grow}>
                  {l.quantity} × {l.product.name}
                </AppText>
                <AppText variant="price">{formatPrice(l.product.price * l.quantity)}</AppText>
              </View>
            ))
          : null}
      </ListSection>

      <ListSection header="Delivery notes (optional)">
        <FieldRow
          inputRef={notes}
          label="Notes"
          value={values.notes}
          onChangeText={(t) => onChange('notes', t)}
          placeholder="Gate code, safe place..."
          multiline
          returnKeyType="default"
        />
      </ListSection>
    </View>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.6 },
  header: { marginLeft: 36, marginBottom: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 16, paddingVertical: 8 },
  grow: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  thumb: { width: 40, height: 40, borderRadius: 10, borderCurve: 'continuous' },
});
