import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Internal light-impact helper; no-op on web. */
export function tapHaptic(kind: 'light' | 'medium' | 'selection' = 'light') {
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'selection') void Haptics.selectionAsync();
    else
      void Haptics.impactAsync(
        kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
      );
  } catch {
    // haptics unavailable
  }
}
