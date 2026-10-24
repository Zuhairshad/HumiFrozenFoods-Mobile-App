import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

function safe(fn: () => Promise<unknown>) {
  if (!enabled) return;
  try {
    fn().catch(() => {});
  } catch {
    /* haptics are best-effort */
  }
}

export const haptics = {
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  selection: () => safe(() => Haptics.selectionAsync()),
};
