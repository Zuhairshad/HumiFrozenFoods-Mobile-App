import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { AppText, Button, fireHaptic, Icon, ListSection, PressableScale } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { PROMO_CODE, PROMO_PERCENT } from '@/lib/pricing';
import { useCartStore } from '@/store/cart';

/** Inline-expanding promo code row (HUMI15 = 15% off the subtotal). */
export function PromoRowInput() {
  const { c, type } = useTheme();
  const applied = useCartStore((s) => s.promoApplied);
  const applyPromo = useCartStore((s) => s.applyPromo);
  const removePromo = useCartStore((s) => s.removePromo);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const submit = () => {
    if (!code.trim()) return;
    if (applyPromo(code)) {
      fireHaptic('success');
      setInvalid(false);
      setOpen(false);
      setCode('');
    } else {
      fireHaptic('warning');
      setInvalid(true);
    }
  };

  if (applied) {
    return (
      <ListSection>
        <View style={styles.row}>
          <Icon name="tag" fill size={20} color="tint" />
          <AppText variant="body" style={styles.grow} numberOfLines={1}>
            {PROMO_CODE} · {PROMO_PERCENT}% off
          </AppText>
          <PressableScale
            onPress={() => {
              fireHaptic('selection');
              removePromo();
            }}
            pressedOpacity={0.6}
            scaleTo={1}
            accessibilityLabel={`Remove promo code ${PROMO_CODE}`}
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
              if (invalid) setInvalid(false);
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
          <Button title="Apply" size="sm" variant="tinted" onPress={submit} disabled={!code.trim()} />
        </View>
        {invalid ? (
          <AppText variant="footnote" color="destructive" accessibilityLiveRegion="polite" style={styles.error}>
            That code isn&apos;t valid.
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
