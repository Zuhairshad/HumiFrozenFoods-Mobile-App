import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type HapticKind = 'selection' | 'light' | 'success' | 'warning';

/** Fire-and-forget haptic; no-op on web and when unavailable (2.6, 7.5.9). */
export function fireHaptic(kind: HapticKind): void {
  if (Platform.OS === 'web') return;
  try {
    let p: Promise<void>;
    if (kind === 'selection') p = Haptics.selectionAsync();
    else if (kind === 'light') p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else
      p = Haptics.notificationAsync(
        kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
      );
    p.catch(() => {});
  } catch {
    // haptics unavailable
  }
}
