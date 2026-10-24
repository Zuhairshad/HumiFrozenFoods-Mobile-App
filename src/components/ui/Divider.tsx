import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme';

export interface DividerProps {
  inset?: number;
  light?: boolean;
}

export function Divider({ inset = 0, light }: DividerProps) {
  return (
    <View
      style={[
        styles.line,
        { marginHorizontal: inset, backgroundColor: light ? 'rgba(255,255,255,0.16)' : colors.line },
      ]}
    />
  );
}

const styles = StyleSheet.create({ line: { height: StyleSheet.hairlineWidth * 2 } });
