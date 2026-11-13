import { useAppTheme } from '@/components/theme-provider';
import { VitaQueueLogo } from '@/components/VitaQueueLogo';
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
  type TextInputProps,
} from 'react-native';
import { registerUser } from '../../services/firebase';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type SignupStyles = ReturnType<typeof createStyles>;

// Alert.alert is unreliable on React Native Web — it can silently no-op.
// This falls back to a real browser alert on web, and uses the native
// Alert everywhere else.
function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

export default function SignupScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // Display-only state (no effect on sign-up)
  const [showPassword, setShowPassword] = useState(false);
  const containsLetters = (str: string): boolean => {
    return /[a-zA-Z]/.test(str);
  }

  const handleSignup = async () => {
    console.log('handleSignup called', { name, phoneNumber, idNumber, homeAddress, email, passwordLength: password.length });

    if (
      !name.trim() ||
      !phoneNumber.trim() ||
      !idNumber.trim() ||
      !homeAddress.trim() ||
      !email.trim() ||
      !password
    ) {
      console.log('Blocked: missing a required field');
      showAlert('Missing information', 'Please complete all fields.');
      return;
    }
     if (phoneNumber.length < 10 || containsLetters(phoneNumber)) {
       console.log('Blocked: invalid phone number', phoneNumber.length);
       showAlert('Invalid phone number', 'Please enter a valid phone number');
       return;
     }
     if (idNumber.length < 13 || containsLetters(idNumber)) {
       console.log('Blocked: invalid ID number, length was', idNumber.length);
       showAlert('Invalid ID number', 'Please enter a valid 13-digit ID number');
       return;
     }
    if (!email.includes('@')) {
      console.log('Blocked: invalid email');
      showAlert('Invalid email', 'Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      console.log('Blocked: password too short');
      showAlert('Invalid password', 'Password must be at least 6 characters.');
      return;
    }

    console.log('Validation passed, calling registerUser...');
    setLoading(true);
    try {
      await registerUser(email.trim(), password, {
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
        idNumber: idNumber.trim(),
        homeAddress: homeAddress.trim(),
      });
      console.log('registerUser succeeded');
    } catch (error) {
      console.log('registerUser failed', error);
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      if (message.includes('email-already-in-use')) {
        showAlert('Signup failed', 'An account already exists for this email.');
      } else if (message.includes('invalid-email')) {
        showAlert('Signup failed', 'Enter a valid email address.');
      } else if (message.includes('weak-password')) {
        showAlert('Signup failed', 'Choose a stronger password.');
      } else {
        showAlert('Signup failed', message);
      }
    } finally {
      setLoading(false);
    }
  };

  const fieldProps = {
    styles,
    placeholderColor: theme.colors.secondary,
    iconColor: theme.colors.secondary,
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          {/* Logo and app name */}
          <View style={styles.header}>
            <VitaQueueLogo size={42} />
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Sign up for VitaQueue</Text>

            <Text style={styles.sectionLabel}>About you</Text>

            <FormField
              {...fieldProps}
              label="Full name"
              icon="person-outline"
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              autoCapitalize="words"
              autoComplete="name"
            />

            <FormField
              {...fieldProps}
              label="Phone number"
              icon="call-outline"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="Your phone number"
              keyboardType="phone-pad"
              autoComplete="tel"
            />

            <FormField
              {...fieldProps}
              label="ID number"
              icon="card-outline"
              value={idNumber}
              onChangeText={setIdNumber}
              placeholder="Your ID number"
              keyboardType="default"
              autoCapitalize="characters"
            />

            <FormField
              {...fieldProps}
              label="Home address"
              icon="home-outline"
              value={homeAddress}
              onChangeText={setHomeAddress}
              placeholder="Your home address"
              autoComplete="street-address"
              multiline
            />

            <Text style={styles.sectionLabel}>Your login</Text>

            <FormField
              {...fieldProps}
              label="Email"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />

            <FormField
              {...fieldProps}
              label="Password"
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              rightElement={
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
              }
            />

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.disabledButton]}
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.primaryButtonText}>Create account</Text>
              )}
            </TouchableOpacity>

            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={styles.loginLink}>Sign in</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// A labelled input with an icon. It keeps its own focus state so only the
// focused field is highlighted. Defined outside SignupScreen so the keyboard
// does not close while typing.
function FormField({
  label,
  icon,
  styles,
  placeholderColor,
  iconColor,
  rightElement,
  multiline,
  onFocus,
  onBlur,
  ...inputProps
}: Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  label: string;
  icon: IconName;
  styles: SignupStyles;
  placeholderColor: string;
  iconColor: string;
  rightElement?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputWrap,
          multiline ? styles.inputWrapMultiline : null,
          focused ? styles.inputWrapFocused : null,
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={iconColor}
          style={multiline ? styles.iconTop : undefined}
        />
        <TextInput
          {...inputProps}
          multiline={multiline}
          placeholderTextColor={placeholderColor}
          style={[styles.input, multiline ? styles.addressInput : null]}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
        {rightElement}
      </View>
    </View>
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
    alignItems: 'center',
    marginBottom: theme.spacing.large,
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
  title: {
    fontSize: theme.fontSizes.heading,
    fontWeight: '700',
    color: theme.colors.darkest,
  },
  subtitle: {
    fontSize: theme.fontSizes.body,
    color: theme.colors.secondary,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: theme.fontSizes.small,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: theme.colors.primary,
    marginTop: theme.spacing.large,
  },
  label: {
    fontSize: theme.fontSizes.small,
    fontWeight: '600',
    color: theme.colors.darkest,
    marginTop: theme.spacing.medium,
    marginBottom: 6,
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
  inputWrapMultiline: {
    height: 90,
    alignItems: 'flex-start',
  },
  inputWrapFocused: {
    borderColor: theme.colors.primary,
  },
  iconTop: {
    marginTop: 14,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: theme.fontSizes.body,
    color: theme.colors.darkest,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  addressInput: {
    paddingTop: 13,
    textAlignVertical: 'top',
  },
  primaryButton: {
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.large,
    borderRadius: theme.borderRadius,
    backgroundColor: theme.colors.primary,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: theme.fontSizes.body,
    fontWeight: '700',
    color: theme.colors.onPrimary,
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: theme.spacing.medium,
  },
  loginText: {
    fontSize: theme.fontSizes.body,
    color: theme.colors.secondary,
  },
  loginLink: {
    fontSize: theme.fontSizes.body,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  });
}