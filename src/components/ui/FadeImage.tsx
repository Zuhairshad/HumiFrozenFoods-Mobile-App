import { Image, ImageContentFit, ImageStyle } from 'expo-image';
import { StyleProp } from 'react-native';
import { colors } from '@/theme';

export interface FadeImageProps {
  uri: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
}

export function FadeImage({ uri, style, contentFit = 'cover', transition = 400 }: FadeImageProps) {
  return (
    <Image
      source={{ uri }}
      style={[{ backgroundColor: colors.sand }, style]}
      contentFit={contentFit}
      transition={transition}
      cachePolicy="memory-disk"
      accessibilityIgnoresInvertColors
    />
  );
}
