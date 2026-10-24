import { Children, Fragment, ReactNode, isValidElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { margin } from '@/theme/layout';

import { AppText } from './AppText';
import { Separator } from './Separator';

export interface ListSectionProps {
  header?: string;
  footer?: string;
  children: ReactNode;
  /** Leading inset of the hairlines between rows. Default 16 (use 58 for rows with a leading icon). */
  separatorInset?: number;
}

/** Inset grouped container (r20 `cell`) with 20 pt side margin and 24 pt bottom gap. Falsy children are skipped. */
export function ListSection({ header, footer, children, separatorInset = 16 }: ListSectionProps) {
  const { c } = useTheme();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.wrap}>
      {header ? (
        <AppText variant="footnote" color="labelSecondary" accessibilityRole="header" style={styles.header}>
          {header}
        </AppText>
      ) : null}
      <View style={[styles.box, { backgroundColor: c.cell }]}>
        {items.map((child, i) => (
          <Fragment key={child.key ?? i}>
            {i > 0 ? <Separator inset={separatorInset} /> : null}
            {child}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <AppText variant="footnote" color="labelTertiary" style={styles.footer}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: margin, marginBottom: 24 },
  header: { marginLeft: 16, marginBottom: 8 },
  footer: { marginHorizontal: 16, marginTop: 8 },
  box: { borderRadius: 20, borderCurve: 'continuous', overflow: 'hidden' },
});
