import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

// Shared colours, spacing, and text sizes used throughout the app.
import { theme } from '../components/themes';

// Add an entry here for each screen you want to link from this test launcher.

// The path must match an Expo Router route under src/app (for example /calendar).
// If you dont understand completely, look at the files under app/calendar, the intext.tsx, and imitate it
// This router just routes to the screen component in src/screens/<route> and does not contain any logic itself.

// After this, you can create a new screen under src/screens/<route> and implement it there. The launcher will link to it automatically.

const appRoutes = [
  { name: 'Home', path: '/home' },
  { name: 'Calendar', path: '/calendar' },
  { name: 'Emergency', path: '/emergency' },
  { name: 'Login', path: '/login' },
  { name: 'QR Scanner', path: '/qrscanner' },
  { name: 'Settings', path: '/settings' },
  { name: 'FBTest', path: '/fbtest' },
] as const;

export default function AppEntry() {
  // Track the Firebase check so the launcher can show loading, success, or error.
  const [dbStatus, setDbStatus] = useState<'testing' | 'connected' | 'error'>('testing');
  const [dbError, setDbError] = useState<string>('');

  // Run a small Firestore read once when this screen opens to verify connectivity.
  useEffect(() => {
    const checkFirebase = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        console.log(`[Firebase Initialized]: Found ${snapshot.size} users.`);
        setDbStatus('connected');
      } catch (error: any) {
        console.error('[Firebase Init Error]:', error);
        setDbError(error.message || 'Check network or Firestore rules');
        setDbStatus('error');
      }
    };

    checkFirebase();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>ChronicClinic System Launcher</Text>

      {/* Database Status Panel */}
      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Database Sync Status:</Text>
        {dbStatus === 'testing' && (
          <View style={styles.row}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.statusText}> Connecting to Firebase...</Text>
          </View>
        )}
        {dbStatus === 'connected' && (
          <Text style={[styles.statusText, styles.successText]}>✅ Online & Verified</Text>
        )}
        {dbStatus === 'error' && (
          <View>
            <Text style={[styles.statusText, styles.errorText]}>❌ Connection Failed</Text>
            <Text style={styles.errorSubtext}>{dbError}</Text>
          </View>
        )}
      </View>

      <Text style={styles.subtitle}>Temporary Screen Navigation</Text>

      {/* Render one navigation link for each entry in appRoutes. */}
      {appRoutes.map((route) => (
        <View key={route.path} style={styles.buttonContainer}>
          {/* Link href must match the route path listed above. */}
          <Link href={route.path} asChild>
            <Pressable style={styles.customButton}>
              <Text style={styles.buttonText}>Open {route.name} Screen</Text>
            </Pressable>
          </Link>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: theme.spacing.medium,
    paddingTop: 48,
    backgroundColor: theme.colors.background,
  },
  title: {
    marginBottom: theme.spacing.medium,
    color: theme.colors.textDark,
    fontSize: theme.fontSizes.heading,
    fontWeight: '700',
  },
  statusCard: {
    backgroundColor: theme.colors.white,
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.large,
    borderWidth: 1,
    borderColor: theme.colors.light,
  },
  statusLabel: {
    fontSize: theme.fontSizes.small,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: theme.fontSizes.body,
    fontWeight: '600',
    color: theme.colors.textDark,
  },
  successText: {
    color: theme.colors.success,
  },
  errorText: {
    color: theme.colors.error,
  },
  errorSubtext: {
    fontSize: theme.fontSizes.small,
    color: theme.colors.error,
    marginTop: 4,
  },
  subtitle: {
    marginBottom: theme.spacing.small,
    color: theme.colors.textDark,
    fontSize: theme.fontSizes.subheading,
    fontWeight: '600',
  },
  buttonContainer: {
    marginBottom: theme.spacing.small,
  },
  customButton: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.medium - 2,
    borderRadius: theme.borderRadius,
    alignItems: 'center',
  },
  buttonText: {
    color: theme.colors.textLight,
    fontWeight: '600',
    fontSize: theme.fontSizes.body,
  },
});
