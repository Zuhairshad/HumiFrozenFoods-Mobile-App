import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

export interface SeparatorProps {
  /** Leading inset in points (horizontal) or top inset (vertical). */
  inset?: number;
  vertical?: boolean;
}

export function Separator({ inset = 0, vertical = false }: SeparatorProps) {
  const { c } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={
        vertical
          ? { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginTop: inset, backgroundColor: c.separator }
          : { height: StyleSheet.hairlineWidth, marginLeft: inset, backgroundColor: c.separator }
      }
    />
  );
}
