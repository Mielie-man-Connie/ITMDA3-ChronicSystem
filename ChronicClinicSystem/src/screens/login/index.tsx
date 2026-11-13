// screens/login/LoginScreen.tsx

import { useAppTheme } from '@/components/theme-provider';
import VitaQueueLogo from '@/components/VitaQueueLogo';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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
import { loginUser } from '../../services/firebase';

export default function LoginScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  // Display-only state (no effect on sign-in)
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  const validate = (): boolean => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      newErrors.email = 'Email is required.';
    } else if (!email.includes('@')) {
      newErrors.email = 'Enter a valid email address.';
    }
    if (!password) {
      newErrors.password = 'Password is required.';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
  if (!validate()) return;
  setLoading(true);
  try {
    await loginUser(email.trim(), password);
    // Do not navigate here — _layout.tsx detects the auth change
    // via onAuthStateChanged and calls router.replace('/home') automatically
    console.log('[Login] Firebase sign-in successful — waiting for redirect');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    if (message.includes('invalid-credential') || message.includes('wrong-password')) {
      Alert.alert('Login failed', 'Incorrect email or password. Please try again.');
    } else if (message.includes('too-many-requests')) {
      Alert.alert('Too many attempts', 'Please wait a moment before trying again.');
    } else if (message.includes('network-request-failed')) {
      Alert.alert('No connection', 'Check your internet connection and try again.');
    } else {
      Alert.alert('Login failed', message);
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
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inner}>
          {/* Logo and app name */}
          <View style={styles.header}>
            <VitaQueueLogo size={50} />
          </View>

          {/* Login form */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in</Text>
            <Text style={styles.cardSubtitle}>Sign in to your account</Text>

            {/* Email field */}
            <Text style={styles.label}>Email</Text>
            <View
              style={[
                styles.inputWrap,
                focusedField === 'email' ? styles.inputWrapFocused : null,
                errors.email ? styles.inputError : null,
              ]}
            >
              <Ionicons name="mail-outline" size={20} color={theme.colors.secondary} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                }}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                placeholder="name@example.com"
                placeholderTextColor={theme.colors.secondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="next"
              />
            </View>
            {errors.email ? (
              <Text style={styles.errorText}>{errors.email}</Text>
            ) : null}

            {/* Password field */}
            <Text style={styles.label}>Password</Text>
            <View
              style={[
                styles.inputWrap,
                focusedField === 'password' ? styles.inputWrapFocused : null,
                errors.password ? styles.inputError : null,
              ]}
            >
              <Ionicons name="lock-closed-outline" size={20} color={theme.colors.secondary} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                }}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                placeholder="Your password"
                placeholderTextColor={theme.colors.secondary}
                secureTextEntry={!showPassword}
                autoComplete="current-password"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={theme.colors.secondary}
                />
              </TouchableOpacity>
            </View>
            {errors.password ? (
              <Text style={styles.errorText}>{errors.password}</Text>
            ) : null}

            {/* Sign in button */}
            <TouchableOpacity
              style={[styles.primaryButton, loading ? styles.primaryButtonDisabled : null]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.primaryButtonText}>Sign in</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Link to sign up */}
            <View style={styles.signUpRow}>
              <Text style={styles.signUpText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/signup')}>
                <Text style={styles.signUpLink}>Create account</Text>
              </TouchableOpacity>
            </View>
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
    alignItems: 'center',
    padding: theme.spacing.large,
  },
  inner: {
    width: '100%',
    maxWidth: 440,
  },
  header: {
    marginBottom: theme.spacing.xlarge,
    alignItems: 'center',
  },
  card: {
    backgroundColor: theme.colors.secondarySurface,
    borderWidth: 1,
    borderColor: theme.colors.secondaryBorder,
    borderRadius: 16,
    padding: theme.spacing.large,
    shadowColor: '#0F2E38',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardTitle: {
    fontSize: theme.fontSizes.heading,
    fontWeight: '700',
    color: theme.colors.darkest,
  },
  cardSubtitle: {
    fontSize: theme.fontSizes.body,
    color: theme.colors.secondary,
    marginTop: 4,
    marginBottom: theme.spacing.small,
  },
  label: {
    fontSize: theme.fontSizes.small,
    fontWeight: '600',
    color: theme.colors.darkest,
    marginBottom: 6,
    marginTop: theme.spacing.medium,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    paddingHorizontal: theme.spacing.medium,
    borderWidth: 1.5,
    borderColor: theme.colors.secondaryBorder,
    borderRadius: theme.borderRadius,
    backgroundColor: theme.colors.background,
  },
  inputWrapFocused: {
    borderColor: theme.colors.primary,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: theme.fontSizes.body,
    color: theme.colors.darkest,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  errorText: {
    fontSize: theme.fontSizes.small,
    color: theme.colors.error,
    marginTop: 4,
  },
  primaryButton: {
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.large,
    borderRadius: theme.borderRadius,
    backgroundColor: theme.colors.primary,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: theme.fontSizes.body,
    fontWeight: '700',
    color: theme.colors.onPrimary,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: theme.spacing.medium,
    gap: theme.spacing.small,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.secondaryBorder,
  },
  dividerText: {
    fontSize: theme.fontSizes.small,
    color: theme.colors.secondary,
  },
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: theme.spacing.small,
  },
  signUpText: {
    fontSize: theme.fontSizes.body,
    color: theme.colors.secondary,
  },
  signUpLink: {
    fontSize: theme.fontSizes.body,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  });
}