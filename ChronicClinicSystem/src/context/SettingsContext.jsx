// SettingsContext.jsx
// This file stores the app's settings in ONE place so every screen can use them.
// Example: when the user turns on dark mode, the calendar changes colour too.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The key used to save settings on the phone
const STORAGE_KEY = '@clinic/settings';

// The settings every user starts with
export const DEFAULT_SETTINGS = {
  // Everyone
  themeMode: 'system', // 'system' | 'light' | 'dark'
  textSize: 'Medium', // 'Small' | 'Medium' | 'Large' | 'Extra large'
  biometric: false,
  autoLock: '1 minute',
  lowData: false,
  language: 'English',
  // Patient
  apptReminders: true,
  reminderLead: '1 day before',
  refillReminders: true,
  // Doctor
  onDuty: true,
  slotMinutes: 15,
  // Receptionist
  queueChimes: true,
  vibrateOnScan: true,
  liveQueue: true,
  deskNumber: 'Desk 02',
};

// How much bigger or smaller the text gets for each size
const TEXT_SCALE = { Small: 0.9, Medium: 1, Large: 1.2, 'Extra large': 1.4 };

// Light theme colours
export const LIGHT = {
  bg: '#F2F6F7',
  surface: '#FFFFFF',
  text: '#0F2A3A',
  muted: '#5A7080',
  border: '#E1E9ED',
  primary: '#0B7A85',
  primarySoft: '#DDF1F2',
  onPrimary: '#FFFFFF',
  danger: '#B93A2E',
  dangerSoft: '#FBE9E7',
  success: '#1B7F52',
  successSoft: '#DFF3E8',
  warning: '#9A6200',
  warningSoft: '#FFF1D6',
  overlay: 'rgba(8, 20, 28, 0.5)',
};

// Dark theme colours
export const DARK = {
  bg: '#0A141C',
  surface: '#132430',
  text: '#E8F1F5',
  muted: '#93A9B6',
  border: '#223745',
  primary: '#3DC3CE',
  primarySoft: '#123A40',
  onPrimary: '#06222A',
  danger: '#FF8576',
  dangerSoft: '#3A1D1A',
  success: '#5BD197',
  successSoft: '#123626',
  warning: '#F2B94B',
  warningSoft: '#3B2D0D',
  overlay: 'rgba(0, 0, 0, 0.65)',
};

const SettingsContext = createContext(null);

// Wrap your whole app in this (see Step 3 in the instructions)
export function SettingsProvider({ children }) {
  const systemScheme = useColorScheme(); // 'light' or 'dark' from the phone
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // When the app opens, load any saved settings
  useEffect(() => {
    async function load() {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch (error) {
        console.log('Could not load settings:', error);
      }
    }
    load();
  }, []);

  // Change ONE setting and save it, e.g. update('onDuty', false)
  const update = useCallback((key, value) => {
    setSettings((previous) => {
      const next = { ...previous, [key]: value };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // Put every setting back to the default
  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  const value = useMemo(() => {
    // Work out if we should be in dark mode
    const isDark =
      settings.themeMode === 'system'
        ? systemScheme === 'dark'
        : settings.themeMode === 'dark';

    const scale = TEXT_SCALE[settings.textSize] || 1;

    return {
      settings,
      update,
      reset,
      isDark,
      colors: isDark ? DARK : LIGHT, // use these for all colours
      fs: (size) => Math.round(size * scale), // fs(16) = font size 16 adjusted for the user's text size
    };
  }, [settings, systemScheme, update, reset]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

// Use this in any screen: const { colors, fs, settings } = useSettings();
export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('Wrap your app in <SettingsProvider> first (see _layout.tsx)');
  }
  return context;
}