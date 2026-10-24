import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/theme';

export default function CartScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Cart</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.teal },
});
