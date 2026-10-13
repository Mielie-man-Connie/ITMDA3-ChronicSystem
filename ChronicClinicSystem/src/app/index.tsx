import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, space, type, TOUCH } from '../constants/clinic-theme';

// Temporary home screen for development. Later this becomes the login screen
// and sends each role (patient / doctor / receptionist) to its own screens.
export default function Home() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chronic Clinic</Text>
      <Text style={styles.subtitle}>Development menu</Text>

      <Pressable style={styles.button} onPress={() => router.push('/patient')} accessibilityRole="button">
        <Text style={styles.buttonText}>Patient screens</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={() => router.push('/doctor')} accessibilityRole="button">
        <Text style={styles.buttonText}>Doctor screens</Text>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() => router.push({ pathname: '/scanner', params: { mode: 'activation' } })}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Scan activation code</Text>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() => router.push({ pathname: '/scanner', params: { mode: 'checkin' } })}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Scan check-in code</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: space.lg, justifyContent: 'center' },
  title: { ...type.title, textAlign: 'center' },
  subtitle: { ...type.small, textAlign: 'center', marginBottom: space.xl },
  button: {
    minHeight: TOUCH,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  buttonText: { fontSize: 18, fontWeight: '600', color: colors.primaryText },
});
