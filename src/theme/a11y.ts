import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, useWindowDimensions } from 'react-native';

import { A11Y_FONT_SCALE } from './layout';

/** `AccessibilityInfo.isReduceTransparencyEnabled` (iOS). Always false elsewhere. */
export function useReduceTransparency(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((v) => alive && setOn(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

/** True at fontScale >= 1.35 (7.1). */
export function useA11yLayout(): boolean {
  const { fontScale } = useWindowDimensions();
  return fontScale >= A11Y_FONT_SCALE;
}
