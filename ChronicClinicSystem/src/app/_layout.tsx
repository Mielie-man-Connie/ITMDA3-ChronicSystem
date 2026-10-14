// app/_layout.tsx

import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { theme } from '../components/themes';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Global auth listener — stays mounted for the entire app session.
    // Fires immediately with the current auth state on startup,
    // then again whenever the user logs in or out from any screen.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is logged in — redirect to home
        // replace() prevents the user going back to login with the back button
        router.replace('/home');
      } else {
        // User is not logged in or just logged out — redirect to login
        router.replace('/login');
      }
    });

    return unsubscribe;
  }, []);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          // Use your theme colours directly instead of react-navigation theme objects
          contentStyle: {
            backgroundColor: colorScheme === 'dark'
              ? theme.colors.darkest
              : theme.colors.background,
          },
        }}
      />
      <AnimatedSplashOverlay />
    </>
  );
}