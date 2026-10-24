import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { AppText, Button, PressableScale } from '@/components/ui';
import { haptics } from '@/hooks/useHaptics';
import { PROMO_CODE, PROMO_PERCENT } from '@/lib/pricing';
import { colors, fonts, radii, spacing } from '@/theme';

interface Props {
  applied: boolean;
  onApply: (code: string) => boolean;
  onRemove: () => void;
}

export function PromoField({ applied, onApply, onRemove }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const submit = () => {
    if (!code.trim()) return;
    if (onApply(code)) {
      haptics.success();
      setCode('');
      setError(false);
    } else {
      haptics.medium();
      setError(true);
      shake.value = withSequence(
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 80 }),
        withTiming(-8, { duration: 80 }),
        withTiming(8, { duration: 80 }),
        withTiming(0, { duration: 50 }),
      );
    }
  };

  if (applied) {
    return (
      <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.chip}>
        <Ionicons name="pricetag" size={18} color={colors.green} />
        <AppText variant="bodyStrong" color="tealInk" style={styles.chipText}>
          {PROMO_CODE} — {PROMO_PERCENT}% off applied
        </AppText>
        <PressableScale onPress={onRemove} haptic accessibilityLabel="Remove promo code" style={styles.x}>
          <Ionicons name="close" size={18} color={colors.tealInk} />
        </PressableScale>
      </Animated.View>
    );
  }

  return (
    <View>
      <Animated.View style={[styles.row, error && styles.rowError, shakeStyle]}>
        <Ionicons name="pricetag-outline" size={18} color={colors.muted} />
        <TextInput
          value={code}
          onChangeText={(t) => {
            setCode(t);
            if (error) setError(false);
          }}
          onSubmitEditing={submit}
          placeholder="Promo code"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          style={styles.input}
        />
        <Button title="Apply" size="sm" variant="primary" onPress={submit} disabled={!code.trim()} />
      </Animated.View>
      <AppText variant="caption" color={error ? 'red' : 'muted'} style={styles.hint}>
        {error ? "That code isn't valid. Try HUMI15" : 'Try HUMI15'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.paper,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    height: 56,
  },
  rowError: { borderColor: colors.red },
  input: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink, letterSpacing: 1, height: '100%' },
  hint: { marginTop: spacing.xs, marginLeft: spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tealSoft,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
  },
  chipText: { flex: 1 },
  x: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
