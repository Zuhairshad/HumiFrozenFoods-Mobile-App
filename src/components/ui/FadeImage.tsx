import { Image, ImageContentFit, ImageStyle } from 'expo-image';
import { StyleProp } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

export interface FadeImageProps {
  uri: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  /** Requested pixel width: rewrites the `w=` param of next/image URLs (256 thumbs, 640 grid, 1080 hero). */
  width?: number;
  recyclingKey?: string;
  /** Accessibility label for meaningful photos; omitted photos are decorative. */
  accessibilityLabel?: string;
}

function withWidth(uri: string, width?: number): string {
  if (!width || !uri.includes('_next/image')) return uri;
  return /([?&])w=\d+/.test(uri) ? uri.replace(/([?&])w=\d+/, `$1w=${width}`) : `${uri}&w=${width}`;
}

/** expo-image with a `fill` placeholder, 180 ms cross-fade and memory-disk caching. */
export function FadeImage({ uri, style, contentFit = 'cover', width, recyclingKey, accessibilityLabel }: FadeImageProps) {
  const { c } = useTheme();
  return (
    <Image
      source={{ uri: withWidth(uri, width) }}
      style={[{ backgroundColor: c.fill }, style]}
      contentFit={contentFit}
      transition={180}
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityIgnoresInvertColors
    />
  );
}
