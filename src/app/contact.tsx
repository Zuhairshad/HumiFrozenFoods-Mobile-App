import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppText, Button, PressableScale, Reveal, Screen, ScreenHeader, Surface } from '@/components/ui';
import type { IoniconName } from '@/components/ui/types';
import { siteInfo } from '@/data';
import { FormInput, SuccessCard, isEmail } from '@/features/more';
import { colors, gutter, radii, spacing } from '@/theme';

function ContactRow({ icon, title, value, onPress }: { icon: IoniconName; title: string; value: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} haptic scaleTo={0.98} accessibilityLabel={`${title}: ${value}`}>
      <Surface radius="lg" padded={spacing.lg} style={styles.cardRow}>
        <View style={styles.tile}>
          <Ionicons name={icon} size={22} color={colors.goldDeep} />
        </View>
        <View style={styles.flex}>
          <AppText variant="label" color="muted">
            {title}
          </AppText>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {value}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />
      </Surface>
    </PressableScale>
  );
}

const open = (url: string) => Linking.openURL(url).catch(() => {});

export default function ContactScreen() {
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/more'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  const info = siteInfo as unknown as { phone: string; email: string; address: string; hours: string | string[] };
  const hours = Array.isArray(info.hours) ? info.hours : [info.hours];
  const digits = info.phone.replace(/[^\d+]/g, '');
  const mapsUrl = Platform.select({
    ios: `http://maps.apple.com/?q=${encodeURIComponent(info.address)}`,
    android: `geo:0,0?q=${encodeURIComponent(info.address)}`,
    default: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address)}`,
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = 'Please tell us your name';
    if (!isEmail(email)) e.email = 'Enter a valid email address';
    if (message.trim().length < 10) e.message = 'Message should be at least 10 characters';
    setErrors(e);
    if (Object.keys(e).length === 0) setSent(true);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentContainerStyle={styles.content}>
        <ScreenHeader title="Contact Us" subtitle="We usually reply within a day" onBack={back} />
        <View style={styles.body}>
          <Reveal>
            <ContactRow icon="call-outline" title="Call us" value={info.phone} onPress={() => open(`tel:${digits}`)} />
          </Reveal>
          <Reveal delay={60}>
            <ContactRow icon="mail-outline" title="Email" value={info.email} onPress={() => open(`mailto:${info.email}`)} />
          </Reveal>
          <Reveal delay={120}>
            <ContactRow icon="logo-whatsapp" title="WhatsApp" value="Chat with us" onPress={() => open(`https://wa.me/${digits.replace('+', '')}`)} />
          </Reveal>
          <Reveal delay={180}>
            <Surface radius="lg" padded={spacing.lg} style={styles.gap}>
              <View style={styles.cardRow}>
                <View style={styles.tile}>
                  <Ionicons name="location-outline" size={22} color={colors.goldDeep} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="label" color="muted">
                    Address
                  </AppText>
                  <AppText variant="bodyStrong">{info.address}</AppText>
                </View>
              </View>
              <Button title="Open in Maps" icon="map-outline" variant="outline" onPress={() => mapsUrl && open(mapsUrl)} />
            </Surface>
          </Reveal>
          <Reveal delay={240}>
            <Surface tone="teal" radius="lg" padded={spacing.lg} shadow="md" style={styles.gap}>
              <View style={styles.cardRow}>
                <Ionicons name="time-outline" size={20} color={colors.gold} />
                <AppText variant="title" color="white">
                  Opening hours
                </AppText>
              </View>
              {hours.map((h) => (
                <AppText key={h} variant="body" color="tealSoft">
                  {h}
                </AppText>
              ))}
            </Surface>
          </Reveal>

          <AppText variant="h2" style={styles.formTitle}>
            Send us a message
          </AppText>
          {sent ? (
            <SuccessCard
              title="Message sent"
              message={`Thank you${name.trim() ? `, ${name.trim().split(' ')[0]}` : ''}. Our team will get back to you shortly.`}
              actionLabel="Done"
              onAction={back}
            />
          ) : (
            <Surface radius="lg" padded={spacing.lg}>
              <View style={styles.form}>
                <FormInput label="Name" value={name} onChangeText={setName} placeholder="Your full name" autoCapitalize="words" textContentType="name" error={errors.name} />
                <FormInput label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" error={errors.email} />
                <FormInput label="Message" value={message} onChangeText={setMessage} placeholder="How can we help?" multiline error={errors.message} />
                <Button title="Send message" icon="send" variant="gold" fullWidth onPress={submit} />
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
  body: { paddingHorizontal: gutter, gap: spacing.md, paddingTop: spacing.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  gap: { gap: spacing.md },
  tile: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  formTitle: { marginTop: spacing.lg },
  form: { gap: spacing.lg },
});
