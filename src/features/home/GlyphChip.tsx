import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, FadeImage, Icon, type IconName, PressableScale } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  label: string;
  imageUri?: string;
  icon?: IconName;
  onPress: () => void;
}

export const GlyphChip = memo(function GlyphChip({ label, imageUri, icon, onPress }: Props) {
  const { c } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      accessibilityLabel={label}
      style={styles.item}
    >
      <View
        style={[
          styles.disc,
          imageUri
            ? { borderColor: c.separator, borderWidth: 2, backgroundColor: c.fill }
            : { backgroundColor: c.tintSoft },
        ]}
      >
        {imageUri ? (
          <FadeImage uri={imageUri} width={256} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : icon ? (
          <Icon name={icon} size={28} color={c.tint} />
        ) : null}
      </View>
      <AppText variant="footnote" align="center" numberOfLines={1} maxScale={1.3} style={styles.label}>
        {label}
      </AppText>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  item: { width: 76, alignItems: 'center' },
  disc: {
    width: 68,
    height: 68,
    borderRadius: 34,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { marginTop: 6, width: 76 },
});
