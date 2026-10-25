import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, FieldRow, FilterChip, Icon, ListSection, SegmentedControl } from '@/components/ui';
import { haptics } from '@/hooks/useHaptics';
import { useTheme } from '@/hooks/useTheme';
import {
  LIVE_ENQUIRY_MESSAGE,
  LOCAL_ENQUIRY_NOTICE,
  VARIANTS,
  emptyEnquiry,
  submitEnquiry,
  validateEnquiry,
  validateField,
  type EnquiryErrors,
  type EnquiryField,
  type EnquiryValues,
  type EnquiryVariant,
} from './enquiry';

interface EnquiryFormProps {
  variant: EnquiryVariant;
  /** Called from the success state's "Done" button. */
  onDone?: () => void;
}

type Phase = 'idle' | 'submitting' | 'sent';

const TEXT_FIELDS: Partial<
  Record<
    EnquiryField,
    {
      label: string;
      keyboardType?: 'default' | 'email-address' | 'phone-pad';
      autoComplete?: 'email' | 'tel' | 'name' | 'organization' | 'street-address' | 'off';
      autoCapitalize?: 'none' | 'words' | 'sentences';
      textContentType?: 'emailAddress' | 'telephoneNumber' | 'name' | 'organizationName' | 'addressCity';
    }
  >
> = {
  businessName: { label: 'Business', autoComplete: 'organization', autoCapitalize: 'words', textContentType: 'organizationName' },
  name: { label: 'Name', autoComplete: 'name', autoCapitalize: 'words', textContentType: 'name' },
  email: { label: 'Email', keyboardType: 'email-address', autoComplete: 'email', autoCapitalize: 'none', textContentType: 'emailAddress' },
  phone: { label: 'Phone', keyboardType: 'phone-pad', autoComplete: 'tel', textContentType: 'telephoneNumber' },
  area: { label: 'Area', autoComplete: 'off', autoCapitalize: 'words', textContentType: 'addressCity' },
};

/** One enquiry template for wholesale, sales rep applications and contact messages. */
export function EnquiryForm({ variant, onDone }: EnquiryFormProps) {
  const { c } = useTheme();
  const cfg = VARIANTS[variant];
  const [values, setValues] = useState<EnquiryValues>(emptyEnquiry);
  const [touched, setTouched] = useState<Partial<Record<EnquiryField, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [failure, setFailure] = useState<string | null>(null);
  const [delivered, setDelivered] = useState(false);

  const allErrors: EnquiryErrors = useMemo(() => validateEnquiry(variant, values), [variant, values]);
  const valid = Object.keys(allErrors).length === 0;

  const visibleError = useCallback(
    (field: EnquiryField): string | undefined =>
      attempted || touched[field] ? validateField(variant, field, values) : undefined,
    [attempted, touched, variant, values],
  );

  const setField = useCallback((field: EnquiryField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setFailure(null);
  }, []);

  const touch = useCallback((field: EnquiryField) => setTouched((t) => ({ ...t, [field]: true })), []);

  const submit = useCallback(async () => {
    setAttempted(true);
    if (!valid || phase === 'submitting') return;
    setPhase('submitting');
    setFailure(null);
    const result = await submitEnquiry(variant, values);
    if (result.ok) {
      setDelivered(result.delivered);
      setPhase('sent');
      haptics.success();
    } else {
      setPhase('idle');
      setFailure(result.message ?? 'Please check the highlighted fields.');
    }
  }, [valid, phase, variant, values]);

  if (phase === 'sent') {
    return (
      <View style={styles.success} accessibilityLiveRegion="polite">
        <View style={[styles.checkDisc, { backgroundColor: c.tintSoft }]}>
          <Icon fill name="checkmark.circle" size={44} color={c.success} />
        </View>
        <AppText variant="title2" align="center" accessibilityRole="header">
          {delivered ? 'Thank you' : cfg.successTitle}
        </AppText>
        <AppText variant="body" color="labelSecondary" align="center">
          {delivered ? LIVE_ENQUIRY_MESSAGE : cfg.successMessage}
        </AppText>
        {delivered ? null : (
          <View style={[styles.notice, { backgroundColor: c.fill }]}>
            <Icon name="info.circle" size={16} color={c.labelSecondary} />
            <AppText variant="footnote" color="labelSecondary" style={styles.noticeText}>
              {LOCAL_ENQUIRY_NOTICE}
            </AppText>
          </View>
        )}
        {onDone ? <Button title="Done" variant="tinted" size="lg" onPress={onDone} /> : null}
      </View>
    );
  }

  const textFields = cfg.fields.filter((f) => TEXT_FIELDS[f]);
  const errorLines = textFields
    .map((f) => visibleError(f))
    .concat(cfg.fields.includes('message') ? [visibleError('message')] : [])
    .filter((e): e is string => !!e);
  const disabled = phase === 'submitting';

  return (
    <View style={styles.form}>
      <ListSection header={cfg.title}>
        {textFields.map((field) => {
          const meta = TEXT_FIELDS[field];
          if (!meta) return null;
          return (
            <FieldRow
              key={field}
              label={meta.label}
              value={values[field]}
              onChangeText={(t: string) => setField(field, t)}
              onBlur={() => touch(field)}
              error={visibleError(field)}
              keyboardType={meta.keyboardType}
              autoComplete={meta.autoComplete}
              autoCapitalize={meta.autoCapitalize}
              textContentType={meta.textContentType}
              autoCorrect={false}
              editable={!disabled}
              returnKeyType="done"
            />
          );
        })}
      </ListSection>

      {cfg.categoryOptions ? (
        <View>
          <AppText variant="footnote" color="labelSecondary" style={styles.groupLabel} accessibilityRole="header">
            {cfg.categoryLabel}
          </AppText>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {cfg.categoryOptions.map((opt) => (
              <FilterChip
                key={opt}
                label={opt}
                selected={values.category === opt}
                onPress={() => {
                  haptics.selection();
                  setField('category', opt);
                  touch('category');
                }}
              />
            ))}
          </View>
          {visibleError('category') ? (
            <AppText variant="footnote" color="destructive" style={styles.groupLabel}>
              Choose {cfg.categoryLabel?.toLowerCase() ?? 'an option'}.
            </AppText>
          ) : null}
        </View>
      ) : null}

      {cfg.volumeOptions ? (
        <View>
          <AppText variant="footnote" color="labelSecondary" style={styles.groupLabel} accessibilityRole="header">
            {cfg.volumeLabel}
          </AppText>
          <View style={styles.segment}>
            <SegmentedControl
              options={[...cfg.volumeOptions]}
              index={Math.max(0, cfg.volumeOptions.indexOf(values.volume))}
              onChange={(i) => setField('volume', cfg.volumeOptions?.[i] ?? '')}
            />
          </View>
        </View>
      ) : null}

      {cfg.fields.includes('message') ? (
        <ListSection header={cfg.messageLabel}>
          <FieldRow
            label="Message"
            value={values.message}
            onChangeText={(t: string) => setField('message', t)}
            onBlur={() => touch('message')}
            error={visibleError('message')}
            multiline
            editable={!disabled}
            autoCapitalize="sentences"
          />
        </ListSection>
      ) : null}

      {errorLines.length > 0 || failure ? (
        <View style={styles.errors} accessibilityLiveRegion="polite">
          {(failure ? [failure] : errorLines).map((e) => (
            <AppText key={e} variant="footnote" color="destructive">
              {e}
            </AppText>
          ))}
        </View>
      ) : null}

      <View style={styles.cta}>
        <Button
          title={cfg.submitLabel}
          size="lg"
          fullWidth
          loading={disabled}
          disabled={!valid || disabled}
          onPress={submit}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 24 },
  groupLabel: { paddingHorizontal: 36, paddingBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20 },
  segment: { paddingHorizontal: 20 },
  errors: { paddingHorizontal: 36, gap: 4, marginTop: -8 },
  cta: { paddingHorizontal: 20 },
  success: { alignItems: 'center', gap: 12, paddingHorizontal: 32, paddingTop: 40 },
  checkDisc: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginTop: 4 },
  noticeText: { flexShrink: 1 },
});
