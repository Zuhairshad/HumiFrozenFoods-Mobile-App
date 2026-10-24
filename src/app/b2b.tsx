import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppText, Button, Chip, Reveal, Screen, ScreenHeader, Surface } from '@/components/ui';
import type { IoniconName } from '@/components/ui/types';
import { FormInput, SuccessCard, isEmail, isPhone } from '@/features/more';
import { colors, gradients, gutter, radii, shadows, spacing } from '@/theme';

const BENEFITS: { icon: IoniconName; title: string; text: string }[] = [
  { icon: 'pricetags-outline', title: 'Wholesale pricing', text: 'Competitive trade prices that grow with your volume.' },
  { icon: 'cube-outline', title: 'Bulk catering packs', text: 'Large formats built for restaurants, caterers and events.' },
  { icon: 'shield-checkmark-outline', title: 'Halal certified', text: 'Fully certified range your customers can trust.' },
  { icon: 'car-outline', title: 'Reliable UK delivery', text: 'Temperature-controlled delivery on a schedule that suits you.' },
  { icon: 'cash-outline', title: 'Sales rep earnings', text: 'Introduce businesses to Humi\'s and earn commission.' },
];

const TYPES = ['Restaurant', 'Takeaway', 'Caterer', 'Retailer', 'Sales rep', 'Other'];

export default function B2BScreen() {
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/more'));
  const [form, setForm] = useState({ business: '', contact: '', email: '', phone: '', message: '' });
  const [type, setType] = useState<string>('Restaurant');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const e: Record<string, string> = {};
    if (form.business.trim().length < 2) e.business = 'Enter your business name';
    if (form.contact.trim().length < 2) e.contact = 'Enter a contact name';
    if (!isEmail(form.email)) e.email = 'Enter a valid email address';
    if (!isPhone(form.phone)) e.phone = 'Enter a valid phone number';
    setErrors(e);
    if (Object.keys(e).length === 0) setSent(true);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentContainerStyle={styles.content}>
        <ScreenHeader title="B2B / Wholesale" onBack={back} />
        <View style={styles.body}>
          <Reveal>
            <View style={styles.heroShadow}>
              <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
                <AppText variant="overline" color="gold">
                  Partner with Humi&apos;s
                </AppText>
                <AppText variant="h1" color="white">
                  Grow your business with us
                </AppText>
                <AppText variant="body" color="tealSoft">
                  Stock halal, British-made favourites or join our sales team.
                </AppText>
              </LinearGradient>
            </View>
          </Reveal>

          <Surface radius="lg" padded={spacing.lg} style={styles.benefits}>
            {BENEFITS.map((b, i) => (
              <Reveal key={b.title} delay={i * 60} style={styles.benefit}>
                <View style={styles.tile}>
                  <Ionicons name={b.icon} size={20} color={colors.goldDeep} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="title">{b.title}</AppText>
                  <AppText variant="caption" color="muted">
                    {b.text}
                  </AppText>
                </View>
              </Reveal>
            ))}
          </Surface>

          <AppText variant="h2" style={styles.formTitle}>
            Apply now
          </AppText>
          {sent ? (
            <SuccessCard
              title="Application received"
              message="Thanks for your interest. A member of our trade team will be in touch within 2 working days."
              actionLabel="Done"
              onAction={back}
            />
          ) : (
            <Surface radius="lg" padded={spacing.lg}>
              <View style={styles.form}>
                <FormInput label="Business name" value={form.business} onChangeText={set('business')} placeholder="Your business" autoCapitalize="words" error={errors.business} />
                <FormInput label="Contact name" value={form.contact} onChangeText={set('contact')} placeholder="Full name" autoCapitalize="words" textContentType="name" error={errors.contact} />
                <FormInput label="Email" value={form.email} onChangeText={set('email')} placeholder="you@business.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" error={errors.email} />
                <FormInput label="Phone" value={form.phone} onChangeText={set('phone')} placeholder="07123 456789" keyboardType="phone-pad" textContentType="telephoneNumber" error={errors.phone} />
                <View style={styles.types}>
                  <AppText variant="label" color="inkSoft">
                    I am a
                  </AppText>
                  <View style={styles.chips}>
                    {TYPES.map((t) => (
                      <Chip key={t} label={t} selected={type === t} onPress={() => setType(t)} />
                    ))}
                  </View>
                </View>
                <FormInput label="Message (optional)" value={form.message} onChangeText={set('message')} placeholder="Tell us about your business" multiline />
                <Button title="Submit application" icon="paper-plane" variant="gold" fullWidth onPress={submit} />
              </View>
            </Surface>
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
  heroShadow: { borderRadius: radii.xl, ...shadows.lg },
  hero: { borderRadius: radii.xl, padding: spacing.xxl, gap: spacing.md },
  benefits: { gap: spacing.lg },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tile: { width: 40, height: 40, borderRadius: radii.sm, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  formTitle: { marginTop: spacing.sm },
  form: { gap: spacing.lg },
  types: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
