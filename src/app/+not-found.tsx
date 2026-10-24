import { StyleSheet, View } from 'react-native';
import { Link, Stack } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/hooks/useTheme';

export default function NotFoundScreen() {
  const { c, space } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: true }} />
      <View style={[styles.root, { backgroundColor: c.background, gap: space.sm, padding: space.xxl }]}>
        <AppText variant="title3" align="center">
          Page not found
        </AppText>
        <AppText variant="callout" color="labelSecondary" align="center">
          We couldn&apos;t find that page.
        </AppText>
        <Link href="/" replace style={{ marginTop: space.md }}>
          <AppText variant="headline" color="tint">
            Back to Home
          </AppText>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
