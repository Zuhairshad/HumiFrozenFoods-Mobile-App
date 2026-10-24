import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabGlyph {
  sf: string;
  sfActive: string;
  ion: IoniconName;
  ionActive: IoniconName;
}

/** Design spec 3.8 icon table. */
export const TAB_GLYPHS: Record<string, TabGlyph> = {
  index: { sf: 'house', sfActive: 'house.fill', ion: 'home-outline', ionActive: 'home' },
  shop: {
    sf: 'square.grid.2x2',
    sfActive: 'square.grid.2x2.fill',
    ion: 'grid-outline',
    ionActive: 'grid',
  },
  search: { sf: 'magnifyingglass', sfActive: 'magnifyingglass', ion: 'search-outline', ionActive: 'search' },
  cart: { sf: 'bag', sfActive: 'bag.fill', ion: 'bag-outline', ionActive: 'bag' },
  account: {
    sf: 'person.crop.circle',
    sfActive: 'person.crop.circle.fill',
    ion: 'person-circle-outline',
    ionActive: 'person-circle',
  },
};

const FALLBACK: TabGlyph = {
  sf: 'circle',
  sfActive: 'circle.fill',
  ion: 'ellipse-outline',
  ionActive: 'ellipse',
};

export const TAB_ICON_SIZE = 26;

interface TabIconProps {
  routeName: string;
  focused: boolean;
  color: string;
}

export function TabIcon({ routeName, focused, color }: TabIconProps) {
  const glyph = TAB_GLYPHS[routeName] ?? FALLBACK;
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={(focused ? glyph.sfActive : glyph.sf) as React.ComponentProps<typeof SymbolView>['name']}
        size={TAB_ICON_SIZE}
        tintColor={color}
        weight={focused && routeName === 'search' ? 'semibold' : 'regular'}
        resizeMode="scaleAspectFit"
        style={{ width: TAB_ICON_SIZE, height: TAB_ICON_SIZE }}
      />
    );
  }
  return <Ionicons name={focused ? glyph.ionActive : glyph.ion} size={TAB_ICON_SIZE} color={color} />;
}
