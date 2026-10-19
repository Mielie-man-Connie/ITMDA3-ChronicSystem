import type { TextStyle } from 'react-native';

// Large type and big touch targets: many patients are elderly and phones are low-end.
export const colors = {
  bg: '#F3F6F7',
  surface: '#FFFFFF',
  ink: '#12263A',
  muted: '#5B6B79',
  line: '#D3DCE2',
  primary: '#0F766E',
  primaryText: '#FFFFFF',
  danger: '#B3261E',
  warn: '#B45309',
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const type: Record<'title' | 'heading' | 'body' | 'small', TextStyle> = {
  title: { fontSize: 26, fontWeight: '700', color: colors.ink },
  heading: { fontSize: 20, fontWeight: '600', color: colors.ink },
  body: { fontSize: 18, color: colors.ink },
  small: { fontSize: 15, color: colors.muted },
};

// Minimum height for anything tappable.
export const TOUCH = 56;
