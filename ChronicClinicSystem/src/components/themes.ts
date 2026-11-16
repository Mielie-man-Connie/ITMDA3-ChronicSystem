// Central theme file — import this in every screen for consistent styling
//
// VitaQueue palette:
//   teal #2A747B (primary) · navy #0F2E38 (headings) · soft grey-blue #F3F7F8 (background)
// Token names are unchanged, so every screen that uses useAppTheme() updates automatically.

import '@/global.css';
import { Platform } from 'react-native';

const baseTheme = {
  colors: {
    darkest: '#0F2E38', // headings and main text
    dark: '#163F4C',
    primary: '#2A747B', // buttons, links, active items
    secondary: '#52686E', // secondary text
    primarylight: '#6FC3CB', // accents, spinners, dark-mode primary
    secondarylight: '#A9D3D7',
    primarydark: '#0B2229', // dark-mode background
    secondarydark: '#12363F', // dark-mode cards
    secondarySurface: '#FFFFFF', // cards and forms
    secondaryBorder: '#D8E6E8', // borders, chips, dividers
    light: '#CFE3E5',
    background: '#F3F7F8', // screen background
    white: '#FFFFFF',
    onPrimary: '#FFFFFF',
    onSecondary: '#0F2E38',
    error: '#C0392B',
    success: '#2E7D62',
    warning: '#F59E0B',
    info: '#06B6D4',
    violet: '#8B5CF6',
    muted: '#9CA3AF',
    textDark: '#0F2E38',
    textLight: '#F1F7F8',
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
  borderRadius: 10,
};

export type ThemeMode = 'system' | 'light' | 'dark';
export type ColorScheme = Exclude<ThemeMode, 'system'>;
export type TextSize = 'small' | 'medium' | 'large';

export const Colors: Record<ColorScheme, {
  text: string;
  background: string;
  backgroundElement: string;
  backgroundSelected: string;
  textSecondary: string;
}> = {
  light: {
    text: baseTheme.colors.textDark,
    background: baseTheme.colors.background,
    backgroundElement: baseTheme.colors.secondarySurface,
    backgroundSelected: '#E3F0F1',
    textSecondary: baseTheme.colors.secondary,
  },
  dark: {
    text: baseTheme.colors.textLight,
    background: baseTheme.colors.primarydark,
    backgroundElement: baseTheme.colors.secondarydark,
    backgroundSelected: '#1B4A56',
    textSecondary: baseTheme.colors.secondarylight,
  },
};

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type ThemePalette = typeof baseTheme & {
  colors: typeof baseTheme.colors & {
    text: string;
    background: string;
    backgroundElement: string;
    backgroundSelected: string;
    textSecondary: string;
  };
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
        secondaryBorder: '#245563',
        light: baseTheme.colors.secondarydark,
        background: palette.background,
        white: palette.backgroundElement,
        // Dark text on the light teal primary keeps buttons readable in dark mode
        onPrimary: '#0B2229',
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