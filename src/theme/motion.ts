import { Easing } from 'react-native-reanimated';

/** Motion tokens (2.6). reanimated 4 only. */
export const springs = {
  press: { damping: 22, stiffness: 420, mass: 0.6 },
  snappy: { damping: 24, stiffness: 300, mass: 1 },
  smooth: { damping: 28, stiffness: 180, mass: 1 },
  bouncy: { damping: 14, stiffness: 210, mass: 0.9 },
} as const;

export const durations = {
  fast: 150,
  base: 250,
  slow: 400,
  splashIn: 700,
  splashOut: 450,
} as const;

export const easings = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  exit: Easing.bezier(0.4, 0, 1, 1),
  inOut: Easing.bezier(0.42, 0, 0.58, 1),
};

export const pressScale = { row: 1, tile: 0.97, button: 0.97, todayCard: 0.96, tabIcon: 0.88, reduced: 0.99 } as const;

export const motion = { springs, durations, easings, pressScale };
export type Motion = typeof motion;
