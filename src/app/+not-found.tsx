import { StyleSheet, Text, View } from 'react-native';
import { Link, Stack } from 'expo-router';
import { colors, fonts, radii, spacing } from '@/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={styles.root}>
        <Text style={styles.title}>Lost in the freezer aisle</Text>
        <Text style={styles.body}>We couldn't find that page.</Text>
        <Link href="/" style={styles.button}>
          Back to Home
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
    backgroundColor: colors.cream,
  },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.teal, textAlign: 'center' },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.inkSoft },
  button: {
    marginTop: spacing.md,
    overflow: 'hidden',
    paddingHorizontal: spacing.xxl,
    paddingVertical: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.teal,
    color: colors.white,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
  },
});
