import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useAppTheme } from '@/components/theme-provider';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const { theme, textScale } = useAppTheme();

  return (
    <Text
      style={[
        { color: theme.colors[themeColor ?? 'text'] },
        type === 'default' && [styles.default, { fontSize: 16 * textScale }],
        type === 'title' && [styles.title, { fontSize: 48 * textScale }],
        type === 'small' && [styles.small, { fontSize: 14 * textScale }],
        type === 'smallBold' && [styles.smallBold, { fontSize: 14 * textScale }],
        type === 'subtitle' && [styles.subtitle, { fontSize: 32 * textScale }],
        type === 'link' && [styles.link, { fontSize: 14 * textScale }],
        type === 'linkPrimary' && [styles.linkPrimary, { fontSize: 14 * textScale }],
        type === 'linkPrimary' && { color: theme.colors.primarylight },
        type === 'code' && [styles.code, { fontSize: 12 * textScale }],
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  title: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 600,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
