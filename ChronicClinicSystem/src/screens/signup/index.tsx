import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { registerUser } from '../../services/firebase';
import { useAppTheme } from '@/components/theme-provider';

export default function SignupScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!name.trim() || !phoneNumber.trim() || !email.trim() || !password) {
      Alert.alert('Missing information', 'Please complete all fields.');
      return;
    }
    if (!email.includes('@')) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Invalid password', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await registerUser(email.trim(), password, {
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      if (message.includes('email-already-in-use')) {
        Alert.alert('Signup failed', 'An account already exists for this email.');
      } else if (message.includes('invalid-email')) {
        Alert.alert('Signup failed', 'Enter a valid email address.');
      } else if (message.includes('weak-password')) {
        Alert.alert('Signup failed', 'Choose a stronger password.');
      } else {
        Alert.alert('Signup failed', message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Sign up for Chronic-Clinic</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your full name"
            placeholderTextColor={theme.colors.secondary}
            autoCapitalize="words"
            autoComplete="name"
          />

          <Text style={styles.label}>Phone number</Text>
          <TextInput
            style={styles.input}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="Your phone number"
            placeholderTextColor={theme.colors.secondary}
            keyboardType="phone-pad"
            autoComplete="tel"
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="name@example.com"
            placeholderTextColor={theme.colors.secondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={theme.colors.secondary}
            secureTextEntry
            autoComplete="new-password"
          />

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabledButton]}
            onPress={handleSignup}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.onPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>Create account</Text>
            )}
          </TouchableOpacity>

          <View style={styles.loginRow}>
            <Text style={styles.subtitle}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.loginLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.large,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xlarge,
  },
  title: {
    fontSize: theme.fontSizes.title,
    fontWeight: '700',
    color: theme.colors.darkest,
    marginBottom: theme.spacing.small,
  },
  subtitle: {
    fontSize: theme.fontSizes.body,
    color: theme.colors.secondary,
  },
  form: {
    gap: theme.spacing.small,
  },
  label: {
    fontSize: theme.fontSizes.small,
    fontWeight: '600',
    color: theme.colors.primary,
    marginTop: theme.spacing.small,
  },
  input: {
    height: 48,
    paddingHorizontal: theme.spacing.medium,
    borderWidth: 1,
    borderColor: theme.colors.secondaryBorder,
    borderRadius: theme.borderRadius,
    backgroundColor: theme.colors.secondarySurface,
    fontSize: theme.fontSizes.body,
    color: theme.colors.darkest,
  },
  primaryButton: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    backgroundColor: theme.colors.secondarylight,
  },
  disabledButton: {
    backgroundColor: theme.colors.light,
  },
  primaryButtonText: {
    fontSize: theme.fontSizes.body,
    fontWeight: '700',
    color: theme.colors.onSecondary,
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: theme.spacing.small,
  },
  loginLink: {
    fontSize: theme.fontSizes.body,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  });
}