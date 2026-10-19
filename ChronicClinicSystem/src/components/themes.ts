// Central theme file — import this in every screen for consistent styling

import '@/global.css';
import { Platform } from 'react-native';

const baseTheme = {
  colors: {
    darkest: '#0D1B2A',
    dark: '#1B263B',
    primary: '#415A77',
    secondary: '#657D61',
    primarylight: '#538cce',
    secondarylight: '#a2c795',
    primarydark: '#15202e',
    secondarydark: '#38473c',
    secondarySurface: '#EDF2E7',
    secondaryBorder: '#C5D3BB',
    light: '#C3D1B8',
    background: '#e2e0d0',
    white: '#FFFFFF',
    onPrimary: '#FFFFFF',
    onSecondary: '#0D1B2A',
    error: '#C0392B',
    success: '#2D6A4F',
    warning: '#F59E0B',
    info: '#06B6D4',
    violet: '#8B5CF6',
    muted: '#9CA3AF',
    textDark: '#0D1B2A',
    textLight: '#F4F1DE',
  },
  fontSizes: {
    small: 12,
    body: 16,
    subheading: 18,
    heading: 24,
    title: 28,
  },
  spacing: {
    small: 8,
    medium: 16,
    large: 24,
    xlarge: 32,
  },
  borderRadius: 8,
};

export type ThemeMode = 'system' | 'light' | 'dark';
export type ColorScheme = Exclude<ThemeMode, 'system'>;
export type TextSize = 'small' | 'medium' | 'large';

export const Colors = {
  light: {
    text: baseTheme.colors.textDark,
    background: baseTheme.colors.background,
    backgroundElement: baseTheme.colors.secondarySurface,
    backgroundSelected: '#DCE7D4',
    textSecondary: baseTheme.colors.secondary,
  },
  dark: {
    text: baseTheme.colors.textLight,
    background: baseTheme.colors.primarydark,
    backgroundElement: baseTheme.colors.secondarydark,
    backgroundSelected: baseTheme.colors.secondarydark,
    textSecondary: baseTheme.colors.secondarylight,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type ThemePalette = typeof baseTheme & {
  colors: typeof baseTheme.colors & (typeof Colors)['light'];
};

export function getTheme(scheme: ColorScheme, textSize: TextSize = 'medium'): ThemePalette {
  const palette = Colors[scheme];
  const fontScale = textSize === 'small' ? 0.88 : textSize === 'large' ? 1.18 : 1;
  const colors = scheme === 'dark'
    ? {
        ...baseTheme.colors,
        darkest: palette.text,
        dark: palette.text,
        primary: baseTheme.colors.primarylight,
        secondary: palette.textSecondary,
        secondarylight: baseTheme.colors.secondarylight,
        primarydark: baseTheme.colors.primarydark,
        secondarydark: baseTheme.colors.secondarydark,
        secondarySurface: palette.backgroundElement,
        secondaryBorder: baseTheme.colors.secondarylight,
        light: baseTheme.colors.secondarydark,
        background: palette.background,
        white: palette.backgroundElement,
        onPrimary: '#FFFFFF',
        onSecondary: palette.text,
        error: '#F28B82',
        success: '#8CD696',
        warning: '#FBBF24',
        info: '#67E8F9',
        violet: '#C4B5FD',
        muted: '#9CA3AF',
        textDark: palette.text,
        textLight: baseTheme.colors.textLight,
      }
    : baseTheme.colors;

  return {
    ...baseTheme,
    fontSizes: {
      small: Math.round(baseTheme.fontSizes.small * fontScale),
      body: Math.round(baseTheme.fontSizes.body * fontScale),
      subheading: Math.round(baseTheme.fontSizes.subheading * fontScale),
      heading: Math.round(baseTheme.fontSizes.heading * fontScale),
      title: Math.round(baseTheme.fontSizes.title * fontScale),
    },
    colors: {
      ...colors,
      ...palette,
    },
  };
}

export const theme = getTheme('light');

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
