import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { AppText, Button, fireHaptic, Icon, ListSection, PressableScale } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { formatPrice } from '@/lib/format';
import { usePromoStore } from '@/store/promo';

export interface PromoRowInputProps {
  /** Code the server accepted for this basket (from the quote), else null. */
  appliedCode: string | null;
  /** Server message for a rejected code (generic fallback applied upstream). */
  rejection: string | null;
  /** A quote with the typed code is in flight. */
  checking?: boolean;
  /** Discount in pence the server applied (shown in the chip). */
  discountPence?: number;
}

/** Inline-expanding promo row. The server decides validity and amount; this only collects the code. */
export function PromoRowInput({ appliedCode, rejection, checking, discountPence }: PromoRowInputProps) {
  const { c, type } = useTheme();
  const pendingCode = usePromoStore((s) => s.code);
  const setPromo = usePromoStore((s) => s.set);
  const clearPromo = usePromoStore((s) => s.clear);
  const applied = appliedCode !== null;
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const invalid = !!rejection && !applied;
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const submit = () => {
    if (!code.trim()) return;
    fireHaptic('selection');
    setPromo(code);
  };

  if (applied) {
    return (
      <ListSection>
        <View style={styles.row}>
          <Icon name="tag" fill size={20} color="tint" />
          <AppText variant="body" style={styles.grow} numberOfLines={1}>
            {appliedCode}
            {discountPence ? ` · -${formatPrice(discountPence / 100)}` : ''}
          </AppText>
          <PressableScale
            onPress={() => {
              fireHaptic('selection');
              clearPromo();
              setCode('');
            }}
            pressedOpacity={0.6}
            scaleTo={1}
            accessibilityLabel={`Remove promo code ${appliedCode}`}
            style={styles.textButton}
          >
            <AppText variant="body" color="tint">
              Remove
            </AppText>
          </PressableScale>
        </View>
      </ListSection>
    );
  }

  if (!open) {
    return (
      <ListSection>
        <PressableScale
          onPress={() => {
            setOpen(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          scaleTo={1}
          pressedOpacity={0.6}
          accessibilityLabel="Add promo code"
          style={styles.row}
        >
          <Icon name="tag" size={20} color="tint" />
          <AppText variant="body" style={styles.grow}>
            Add promo code
          </AppText>
          <Icon name="chevron.right" size={13} color="labelQuaternary" />
        </PressableScale>
      </ListSection>
    );
  }

  return (
    <ListSection>
      <View style={styles.col}>
        <View style={styles.row}>
          <Icon name="tag" size={20} color="tint" />
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={(t) => {
              setCode(t.toUpperCase());
            }}
            placeholder="Promo code"
            placeholderTextColor={c.labelTertiary}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={submit}
            accessibilityLabel="Promo code"
            maxFontSizeMultiplier={1.6}
            style={[type.body, styles.input, { color: c.label }]}
          />
          <Button title="Apply" size="sm" variant="tinted" onPress={submit} loading={!!checking && !!pendingCode} disabled={!code.trim() || !!checking} />
        </View>
        {invalid ? (
          <AppText variant="footnote" color="destructive" accessibilityLiveRegion="polite" style={styles.error}>
            {rejection}
          </AppText>
        ) : null}
      </View>
    </ListSection>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52 },
  col: { paddingBottom: 0 },
  grow: { flex: 1 },
  input: { flex: 1, minHeight: 44, paddingVertical: 8 },
  textButton: { minHeight: 44, justifyContent: 'center' },
  error: { paddingHorizontal: 16, paddingBottom: 10, paddingLeft: 48 },
});
