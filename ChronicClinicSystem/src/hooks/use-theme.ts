/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useAppTheme } from '@/components/theme-provider';

export function useTheme() {
  const { theme } = useAppTheme();
  return theme.colors;
}
