import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import {
  getTheme,
  type ColorScheme,
  type ThemeMode,
  type ThemePalette,
  type TextSize,
} from './themes';

const SETTINGS_KEY = 'appSettings';

type ThemeContextValue = {
  mode: ThemeMode;
  scheme: ColorScheme;
  textSize: TextSize;
  textScale: number;
  theme: ThemePalette;
  setThemeMode: (mode: ThemeMode) => void;
  setTextSize: (size: TextSize) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: React.PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');
  const [textSize, setTextSize] = useState<TextSize>('medium');

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(SETTINGS_KEY)
      .then((storedSettings) => {
        if (!storedSettings || !mounted) return;
        const settings: unknown = JSON.parse(storedSettings);
        if (
          typeof settings === 'object' &&
          settings !== null &&
          'themeMode' in settings &&
          (settings.themeMode === 'system' ||
            settings.themeMode === 'light' ||
            settings.themeMode === 'dark')
        ) {
          setMode(settings.themeMode);
        }
        if (
          typeof settings === 'object' &&
          settings !== null &&
          'fontSize' in settings &&
          (settings.fontSize === 'small' ||
            settings.fontSize === 'medium' ||
            settings.fontSize === 'large')
        ) {
          setTextSize(settings.fontSize);
        }
      })
      .catch((error: unknown) => {
        console.error('Could not load appearance setting', error);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const scheme: ColorScheme =
    mode === 'system'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : mode;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      scheme,
      textSize,
      textScale: textSize === 'small' ? 0.88 : textSize === 'large' ? 1.18 : 1,
      theme: getTheme(scheme, textSize),
      setThemeMode: setMode,
      setTextSize,
    }),
    [mode, scheme, textSize],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within ThemeProvider.');
  }
  return context;
}
