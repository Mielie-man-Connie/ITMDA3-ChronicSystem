// app/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Entry point — checks Firebase Auth state and redirects immediately.
// The user should never see this screen for more than a brief moment.
// If you are logged in → goes to /home
// If you are not logged in → goes to /login
// ─────────────────────────────────────────────────────────────────────────────

import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';
import { theme } from '../components/themes';

export default function Index() {
  // null = still checking, true = logged in, false = not logged in
  const [authState, setAuthState] = useState<boolean | null>(null);

  useEffect(() => {
    // onAuthStateChanged fires once immediately with the current state,
    // then again whenever login or logout happens.
    // The returned function unsubscribes the listener when this component unmounts.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthState(user !== null);
    });
    return unsubscribe;
  }, []);

  // Still checking — show a loading spinner on the brand background
  if (authState === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // Auth state resolved — redirect immediately
  return <Redirect href={authState ? '/home' : '/login'} />;
}