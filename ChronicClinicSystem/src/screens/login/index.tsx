// screens/login/LoginScreen.tsx

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { loginUser } from '../../services/firebase';
import { theme } from '../../components/themes';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

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
        {/* App name and subtitle */}
        <View style={styles.header}>
          <Text style={styles.appName}>KweziClinic</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </View>

        {/* Login form */}
        <View style={styles.form}>

          {/* Email field */}
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, errors.email ? styles.inputError : null]}
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            placeholder="name@example.com"
            placeholderTextColor={theme.colors.secondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            returnKeyType="next"
          />
          {errors.email ? (
            <Text style={styles.errorText}>{errors.email}</Text>
          ) : null}

          {/* Password field */}
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={[styles.input, errors.password ? styles.inputError : null]}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
            }}
            placeholder="Your password"
            placeholderTextColor={theme.colors.secondary}
            secureTextEntry
            autoComplete="current-password"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />
          {errors.password ? (
            <Text style={styles.errorText}>{errors.password}</Text>
          ) : null}

          {/* Sign in button */}
          <TouchableOpacity
            style={[styles.primaryButton, loading ? styles.primaryButtonDisabled : null]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.white} />
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,      // warm cream — screen background
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.large,
  },
  header: {
    marginBottom: theme.spacing.xlarge,
    alignItems: 'center',
  },
  appName: {
    fontSize: theme.fontSizes.title,
    fontWeight: '700',
    color: theme.colors.darkest,                    // darkest navy — strong heading
    marginBottom: theme.spacing.small,
  },
  subtitle: {
    fontSize: theme.fontSizes.body,
    color: theme.colors.secondary,                  // muted sage — secondary text
  },
  form: {
    gap: theme.spacing.small,
  },
  label: {
    fontSize: theme.fontSizes.small,
    fontWeight: '600',
    color: theme.colors.primary,                    // medium blue-grey — field labels
    marginBottom: 4,
    marginTop: theme.spacing.small,
  },
  input: {
    height: 48,
    paddingHorizontal: theme.spacing.medium,
    borderWidth: 1,
    borderColor: theme.colors.light,                // light sage — input border
    borderRadius: theme.borderRadius,
    backgroundColor: theme.colors.white,            // white — input background
    fontSize: theme.fontSizes.body,
    color: theme.colors.darkest,                    // darkest — typed text
  },
  inputError: {
    borderColor: theme.colors.error,                // red — error state border
  },
  errorText: {
    fontSize: theme.fontSizes.small,
    color: theme.colors.error,                      // red — error message text
    marginTop: 4,
  },
  primaryButton: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    backgroundColor: theme.colors.primarybtn,       // blue — primary action button
  },
  primaryButtonDisabled: {
    backgroundColor: theme.colors.light,            // light sage — disabled state
  },
  primaryButtonText: {
    fontSize: theme.fontSizes.body,
    fontWeight: '700',
    color: theme.colors.white,                      // white text on blue button
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
    backgroundColor: theme.colors.light,            // light sage — divider line
  },
  dividerText: {
    fontSize: theme.fontSizes.small,
    color: theme.colors.secondary,                  // muted sage — "or" text
  },
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: theme.spacing.small,
  },
  signUpText: {
    fontSize: theme.fontSizes.body,
    color: theme.colors.secondary,                  // muted sage — plain text
  },
  signUpLink: {
    fontSize: theme.fontSizes.body,
    fontWeight: '600',
    color: theme.colors.primary,                    // medium blue-grey — link
  },
});