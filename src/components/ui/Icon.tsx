import { Ionicons } from '@expo/vector-icons';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { ColorRoles } from '@/theme/colors';

import type { IoniconName } from './types';

type SFName = Extract<SymbolViewProps['name'], string>;

interface IconSpec {
  sf: SFName;
  /** SF symbol used when `fill` is set (defaults to `sf`). */
  sfFill?: SFName;
  ion: IoniconName;
  ionFill?: IoniconName;
}

/**
 * Single name map: SF Symbols on iOS, Ionicons everywhere else. Keys are the SF base names.
 * Add entries here; never import Ionicons/SymbolView in features.
 */
export const ICON_MAP = {
  // tabs
  house: { sf: 'house', sfFill: 'house.fill', ion: 'home-outline', ionFill: 'home' },
  'square.grid.2x2': { sf: 'square.grid.2x2', sfFill: 'square.grid.2x2.fill', ion: 'grid-outline', ionFill: 'grid' },
  magnifyingglass: { sf: 'magnifyingglass', ion: 'search-outline', ionFill: 'search' },
  bag: { sf: 'bag', sfFill: 'bag.fill', ion: 'bag-outline', ionFill: 'bag' },
  'bag.circle': { sf: 'bag.circle', sfFill: 'bag.circle.fill', ion: 'bag-handle-outline', ionFill: 'bag-handle' },
  'person.crop.circle': {
    sf: 'person.crop.circle',
    sfFill: 'person.crop.circle.fill',
    ion: 'person-circle-outline',
    ionFill: 'person-circle',
  },
  // actions
  heart: { sf: 'heart', sfFill: 'heart.fill', ion: 'heart-outline', ionFill: 'heart' },
  'square.and.arrow.up': { sf: 'square.and.arrow.up', ion: 'share-outline', ionFill: 'share' },
  'line.3.horizontal.decrease.circle': {
    sf: 'line.3.horizontal.decrease.circle',
    sfFill: 'line.3.horizontal.decrease.circle.fill',
    ion: 'filter-circle-outline',
    ionFill: 'filter-circle',
  },
  plus: { sf: 'plus', ion: 'add' },
  minus: { sf: 'minus', ion: 'remove' },
  xmark: { sf: 'xmark', ion: 'close' },
  'xmark.circle': { sf: 'xmark.circle', sfFill: 'xmark.circle.fill', ion: 'close-circle-outline', ionFill: 'close-circle' },
  checkmark: { sf: 'checkmark', ion: 'checkmark' },
  'checkmark.circle': {
    sf: 'checkmark.circle',
    sfFill: 'checkmark.circle.fill',
    ion: 'checkmark-circle-outline',
    ionFill: 'checkmark-circle',
  },
  'checkmark.seal': { sf: 'checkmark.seal', sfFill: 'checkmark.seal.fill', ion: 'shield-checkmark-outline', ionFill: 'shield-checkmark' },
  trash: { sf: 'trash', sfFill: 'trash.fill', ion: 'trash-outline', ionFill: 'trash' },
  'doc.on.doc': { sf: 'doc.on.doc', ion: 'copy-outline', ionFill: 'copy' },
  'arrow.clockwise': { sf: 'arrow.clockwise', ion: 'refresh' },
  'arrow.counterclockwise': { sf: 'arrow.counterclockwise', ion: 'arrow-undo-outline', ionFill: 'arrow-undo' },
  ellipsis: { sf: 'ellipsis', ion: 'ellipsis-horizontal' },
  'ellipsis.circle': { sf: 'ellipsis.circle', sfFill: 'ellipsis.circle.fill', ion: 'ellipsis-horizontal-circle-outline', ionFill: 'ellipsis-horizontal-circle' },
  // navigation
  'chevron.right': { sf: 'chevron.right', ion: 'chevron-forward' },
  'chevron.left': { sf: 'chevron.left', ion: 'chevron-back' },
  'chevron.down': { sf: 'chevron.down', ion: 'chevron-down' },
  'chevron.up': { sf: 'chevron.up', ion: 'chevron-up' },
  // content
  star: { sf: 'star', sfFill: 'star.fill', ion: 'star-outline', ionFill: 'star' },
  leaf: { sf: 'leaf', sfFill: 'leaf.fill', ion: 'leaf-outline', ionFill: 'leaf' },
  timer: { sf: 'timer', ion: 'timer-outline', ionFill: 'timer' },
  clock: { sf: 'clock', sfFill: 'clock.fill', ion: 'time-outline', ionFill: 'time' },
  flame: { sf: 'flame', sfFill: 'flame.fill', ion: 'flame-outline', ionFill: 'flame' },
  tag: { sf: 'tag', sfFill: 'tag.fill', ion: 'pricetag-outline', ionFill: 'pricetag' },
  shippingbox: { sf: 'shippingbox', sfFill: 'shippingbox.fill', ion: 'cube-outline', ionFill: 'cube' },
  gift: { sf: 'gift', sfFill: 'gift.fill', ion: 'gift-outline', ionFill: 'gift' },
  snowflake: { sf: 'snowflake', ion: 'snow-outline', ionFill: 'snow' },
  'fork.knife': { sf: 'fork.knife', ion: 'restaurant-outline', ionFill: 'restaurant' },
  bolt: { sf: 'bolt', sfFill: 'bolt.fill', ion: 'flash-outline', ionFill: 'flash' },
  flag: { sf: 'flag', sfFill: 'flag.fill', ion: 'flag-outline', ionFill: 'flag' },
  'creditcard': { sf: 'creditcard', sfFill: 'creditcard.fill', ion: 'card-outline', ionFill: 'card' },
  lock: { sf: 'lock', sfFill: 'lock.fill', ion: 'lock-closed-outline', ionFill: 'lock-closed' },
  // company / contact
  phone: { sf: 'phone', sfFill: 'phone.fill', ion: 'call-outline', ionFill: 'call' },
  envelope: { sf: 'envelope', sfFill: 'envelope.fill', ion: 'mail-outline', ionFill: 'mail' },
  'mappin.and.ellipse': { sf: 'mappin.and.ellipse', ion: 'location-outline', ionFill: 'location' },
  'building.2': { sf: 'building.2', sfFill: 'building.2.fill', ion: 'business-outline', ionFill: 'business' },
  briefcase: { sf: 'briefcase', sfFill: 'briefcase.fill', ion: 'briefcase-outline', ionFill: 'briefcase' },
  'person.2': { sf: 'person.2', sfFill: 'person.2.fill', ion: 'people-outline', ionFill: 'people' },
  'info.circle': { sf: 'info.circle', sfFill: 'info.circle.fill', ion: 'information-circle-outline', ionFill: 'information-circle' },
  'questionmark.circle': {
    sf: 'questionmark.circle',
    sfFill: 'questionmark.circle.fill',
    ion: 'help-circle-outline',
    ionFill: 'help-circle',
  },
  'exclamationmark.triangle': {
    sf: 'exclamationmark.triangle',
    sfFill: 'exclamationmark.triangle.fill',
    ion: 'warning-outline',
    ionFill: 'warning',
  },
  globe: { sf: 'globe', ion: 'globe-outline', ionFill: 'globe' },
  'text.bubble': { sf: 'text.bubble', sfFill: 'text.bubble.fill', ion: 'chatbubble-outline', ionFill: 'chatbubble' },
  'paperplane': { sf: 'paperplane', sfFill: 'paperplane.fill', ion: 'paper-plane-outline', ionFill: 'paper-plane' },
  'camera': { sf: 'camera', sfFill: 'camera.fill', ion: 'camera-outline', ionFill: 'camera' },
  'link': { sf: 'link', ion: 'link-outline', ionFill: 'link' },
  'arrow.up.right': { sf: 'arrow.up.right', ion: 'arrow-up' },
  'list.bullet': { sf: 'list.bullet', ion: 'list' },
  'arrow.up.arrow.down': { sf: 'arrow.up.arrow.down', ion: 'swap-vertical' },
} as const satisfies Record<string, IconSpec>;

export type IconName = keyof typeof ICON_MAP;

export interface IconProps {
  name: IconName;
  size?: number;
  /** Colour role or literal colour. Defaults to `label`. */
  color?: keyof ColorRoles | (string & {});
  weight?: 'regular' | 'semibold' | 'bold';
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Decorative by default (hidden from screen readers); put the label on the pressable parent. */
export function Icon({ name, size = 22, color = 'label', weight = 'regular', fill = false, style }: IconProps) {
  const { c } = useTheme();
  const tint = color in c ? c[color as keyof ColorRoles] : color;
  const spec: IconSpec = ICON_MAP[name];
  const box = { width: size, height: size } as const;

  if (Platform.OS === 'ios') {
    return (
      <View style={[box, style]} accessible={false} importantForAccessibility="no-hide-descendants">
        <SymbolView
          name={fill ? (spec.sfFill ?? spec.sf) : spec.sf}
          size={size}
          weight={weight}
          tintColor={tint}
          resizeMode="scaleAspectFit"
          style={box}
          fallback={<Ionicons name={fill ? (spec.ionFill ?? spec.ion) : spec.ion} size={size} color={tint} />}
        />
      </View>
    );
  }
  const ion = fill ? (spec.ionFill ?? spec.ion) : spec.ion;
  return (
    <View
      style={[box, { alignItems: 'center', justifyContent: 'center' }, style]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={ion} size={size} color={tint} />
    </View>
  );
}
