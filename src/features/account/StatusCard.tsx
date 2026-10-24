import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import type { Order, OrderStatus } from '@/types';
import { AppText, Icon } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { readOrderExtras } from './order-utils';
import { STATUS_COPY, STATUS_HEADLINE, STEPS, deriveStatus, stepIndex } from './status';

// Brand gradient (spec 2.3). Live status is the one sanctioned teal hero outside the splash.
const GRADIENT = ['#08302F', '#0D4D4D', '#125B64'] as const;
const WHITE = '#FFFFFF';
const WHITE_80 = 'rgba(255,255,255,0.8)';
const TRACK = 'rgba(255,255,255,0.24)';

interface StatusCardProps {
  order: Order;
  /** Override the clock (tests / ticking parents). */
  now?: number;
  status?: OrderStatus;
}

function Segment({ state, index }: { state: 'done' | 'current' | 'todo'; index: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const fill = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    const target = state === 'todo' ? 0 : 1;
    fill.set(
      reduced
        ? target
        : withDelay(index * 120, withTiming(target, { duration: 400, easing: Easing.bezier(0.2, 0, 0, 1) })),
    );
  }, [state, index, reduced, fill]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: fill.get() }],
  }));

  return (
    <View style={[styles.segment, { backgroundColor: TRACK }]}>
      <Animated.View
        style={[
          styles.segmentFill,
          { backgroundColor: state === 'current' ? c.accent : WHITE, transformOrigin: 'left' },
          style,
        ]}
      />
    </View>
  );
}

export function StatusCard({ order, now, status: forced }: StatusCardProps) {
  const status = forced ?? deriveStatus(order, now);
  const current = stepIndex(status);
  const { slotLabel } = readOrderExtras(order);
  const delivered = status === 'delivered';

  let detail: string = STATUS_COPY[status];
  if (slotLabel && !delivered) {
    detail = status === 'out-for-delivery' ? `Arriving ${slotLabel}` : `Delivery slot: ${slotLabel}`;
  }

  return (
    <LinearGradient
      colors={GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Order ${order.id}, ${STATUS_HEADLINE[status]}, step ${current + 1} of ${STEPS.length}. ${detail}`}
    >
      <View style={styles.titleRow}>
        {delivered ? <Icon fill name="checkmark.circle" size={26} color={WHITE} /> : null}
        <AppText variant="title1" color={WHITE} style={styles.title} maxScale={1.4}>
          {STATUS_HEADLINE[status]}
        </AppText>
      </View>
      <AppText variant="callout" color={WHITE_80}>
        {detail}
      </AppText>
      <View style={styles.segments} importantForAccessibility="no-hide-descendants">
        {STEPS.map((s, i) => (
          <Segment key={s.key} index={i} state={i < current || delivered ? 'done' : i === current ? 'current' : 'todo'} />
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    borderCurve: 'continuous',
    padding: 20,
    minHeight: 160,
    justifyContent: 'flex-end',
    gap: 6,
    overflow: 'hidden',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1 },
  segments: { flexDirection: 'row', gap: 6, marginTop: 14 },
  segment: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  segmentFill: StyleSheet.absoluteFill,
});
