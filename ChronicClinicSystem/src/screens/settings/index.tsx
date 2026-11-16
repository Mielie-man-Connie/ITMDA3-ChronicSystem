import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Firebase imports for live authentication and role fetching
import { AccountVerificationIcon } from '@/components/account-verification-icon';
import { clearLocalHealthData } from '@/services/cache';
import {
  getCurrentUserProfile,
  logoutUser,
  requestAccountDeletion,
  sendCurrentUserPasswordReset,
  updateUserProfile,
} from '@/services/firebase';

import { useAppTheme } from '@/components/theme-provider';
import {
  BottomTabInset,
  MaxContentWidth,
  Spacing,
  type ThemeMode,
  type ThemePalette,
} from '@/constants/theme';

type Role = 'doctor' | 'patient' | 'receptionist';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Shape of the profile returned by getCurrentUserProfile() in firebase.js
type UserProfile = {
  id: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  idNumber?: string;
  homeAddress?: string;
  profileImage?: string;
  role?: string;
  clinicId?: string;
  accountVerified?: boolean;
  accountStatus?: string;
};

type Settings = {
  themeMode: ThemeMode;
  fontSize: 'small' | 'medium' | 'large';
  language: 'en' | 'ss' | 'zu' | 'af';
  pushNotifications: boolean;
  reminderTime: 'day' | 'hours';
  lowDataMode: boolean;
  patientReminders: boolean;
  doctorAlerts: boolean;
  dailySummary: boolean;
  queueChime: boolean;
  vibrateOnScan: boolean;
  biometricLogin: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  themeMode: 'system',
  fontSize: 'medium',
  language: 'en',
  pushNotifications: true,
  reminderTime: 'day',
  lowDataMode: false,
  patientReminders: true,
  doctorAlerts: true,
  dailySummary: true,
  queueChime: true,
  vibrateOnScan: true,
  biometricLogin: false,
};

const LANGUAGES = [
  { value: 'en', text: 'English' },
  { value: 'ss', text: 'siSwati' },
  { value: 'zu', text: 'isiZulu' },
  { value: 'af', text: 'Afrikaans' },
];

const STORAGE_KEY = 'appSettings';

function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

type UI = {
  c: ThemePalette['colors'];
  size: number;
  iconTextColor: string;
};

function SectionTitle({ title, ui }: { title: string; ui: UI }) {
  return (
    <Text
      style={[
        styles.sectionTitle,
        {
          color: ui.c.textSecondary,
          fontSize: ui.size - 5,
        },
      ]}
    >
      {title.toUpperCase()}
    </Text>
  );
}

function Group({ children, ui }: { children: React.ReactNode; ui: UI }) {
  const rows = React.Children.toArray(children).filter(Boolean);

  return (
    <View style={[
      styles.group,
      {
        backgroundColor: ui.c.backgroundElement,
        borderColor: ui.c.secondaryBorder,
      },
    ]}>
      {rows.map((row, index) => (
        <View key={index}>
          {row}
          {index < rows.length - 1 && (
            <View
              style={[
                styles.separator,
                { backgroundColor: ui.c.secondaryBorder },
              ]}
            />
          )}
        </View>
      ))}
    </View>
  );
}

function Row({
  icon,
  tint,
  label,
  hint,
  right,
  below,
  onPress,
  danger,
  ui,
}: {
  icon?: IconName;
  tint?: string;
  label: string;
  hint?: string;
  right?: React.ReactNode;
  below?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  ui: UI;
}) {
  const content = (
    <>
      <View style={styles.rowTop}>
        <View style={styles.iconSlot}>
          {icon ? (
            <View
              style={[
                styles.iconTile,
                { backgroundColor: danger ? ui.c.error : tint ?? ui.c.primarylight },
              ]}
            >
              <Ionicons name={icon} size={19} color={ui.iconTextColor} />
            </View>
          ) : null}
        </View>

        <View style={styles.labelContainer}>
          <Text
            style={{
              fontSize: ui.size,
              fontWeight: '500',
              color: danger ? ui.c.error : ui.c.text,
            }}
          >
            {label}
          </Text>

          {hint ? (
            <Text
              style={{
                fontSize: ui.size - 3,
                color: ui.c.textSecondary,
                marginTop: 4,
                lineHeight: ui.size + 2,
              }}
            >
              {hint}
            </Text>
          ) : null}
        </View>

        {right ? <View style={styles.rightContainer}>{right}</View> : null}
      </View>

      {below ? <View style={styles.belowContent}>{below}</View> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.row}>{content}</View>;
}

function Chevron({ text, ui }: { text?: string; ui: UI }) {
  return (
    <View style={styles.chevronContainer}>
      {text ? (
        <Text
          numberOfLines={1}
          style={{
            fontSize: ui.size - 1,
            color: ui.c.textSecondary,
            marginRight: 4,
          }}
        >
          {text}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={ui.c.textSecondary} />
    </View>
  );
}

function Toggle({
  value,
  onChange,
  label,
  ui,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  ui: UI;
}) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: ui.c.primarylight, false: ui.c.muted }}
      thumbColor={ui.c.onPrimary}
      accessibilityLabel={label}
    />
  );
}

function Segmented({
  options,
  selected,
  onSelect,
  ui,
}: {
  options: { value: string; text: string }[];
  selected: string;
  onSelect: (value: string) => void;
  ui: UI;
}) {
  return (
    <View
      style={[
        styles.segmentTrack,
        { backgroundColor: ui.c.secondarySurface },
      ]}
    >
      {options.map((opt) => {
        const isActive = selected === opt.value;

        return (
          <Pressable
            key={opt.value}
            onPress={() => onSelect(opt.value)}
            accessibilityRole="button"
            accessibilityLabel={opt.text}
            accessibilityState={{ selected: isActive }}
            style={[
              styles.segment,
              isActive && { backgroundColor: ui.c.background },
            ]}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                fontSize: ui.size - 2,
                fontWeight: isActive ? '700' : '500',
                color: isActive ? ui.c.text : ui.c.textSecondary,
              }}
            >
              {opt.text}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EditProfileModal({
  visible,
  name,
  phoneNumber,
  idNumber,
  homeAddress,
  profileImage,
  ui,
  onClose,
  onSave,
}: {
  visible: boolean;
  name: string;
  phoneNumber: string;
  idNumber: string;
  homeAddress: string;
  profileImage: string;
  ui: UI;
  onClose: () => void;
  onSave: (name: string, phoneNumber: string, idNumber: string, homeAddress: string, profileImage: string) => Promise<void>;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draftPhone, setDraftPhone] = useState(phoneNumber);
  const [draftIdNumber, setDraftIdNumber] = useState(idNumber);
  const [draftHomeAddress, setDraftHomeAddress] = useState(homeAddress);
  const [draftImage, setDraftImage] = useState(profileImage);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setDraftName(name);
    setDraftPhone(phoneNumber);
    setDraftIdNumber(idNumber);
    setDraftHomeAddress(homeAddress);
    setDraftImage(profileImage);
    setSaveError('');
  }, [visible, name, phoneNumber, idNumber, homeAddress, profileImage]);

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showMessage('Permission required', 'Permission to access gallery is required to change profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setDraftImage(result.assets[0].uri);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draftName.trim(), draftPhone.trim(), draftIdNumber.trim(), draftHomeAddress.trim(), draftImage);
      onClose();
      setSaveError('');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const initials = (draftName || '')
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.profileOverlay}>
        <View style={[styles.profileSheet, { backgroundColor: ui.c.background }]}>
          <Text style={{ color: ui.c.text, fontSize: ui.size + 4, fontWeight: '700' }}>Edit profile</Text>

          <Pressable onPress={pickImage} style={styles.avatarPickerContainer}>
            {draftImage ? (
              <Image source={{ uri: draftImage }} style={styles.modalAvatar} />
            ) : (
              <View style={[styles.modalAvatarPlaceholder, { backgroundColor: ui.c.primarylight }]}>
                <Text style={{ color: ui.c.onPrimary, fontSize: ui.size + 8, fontWeight: '700' }}>{initials}</Text>
              </View>
            )}
            <Text style={{ color: ui.c.primarylight, fontSize: ui.size - 2, fontWeight: '600', marginTop: 6 }}>
              Change profile picture
            </Text>
          </Pressable>

          <TextInput
            value={draftName}
            onChangeText={setDraftName}
            placeholder="Full name"
            placeholderTextColor={ui.c.textSecondary}
            accessibilityLabel="Full name"
            style={[styles.profileInput, { backgroundColor: ui.c.backgroundElement, color: ui.c.text, borderColor: ui.c.secondaryBorder, fontSize: ui.size }]}
          />
          {saveError ? <Text style={{ color: ui.c.error, fontSize: ui.size - 2 }}>{saveError}</Text> : null}
          <TextInput
            value={draftPhone}
            onChangeText={setDraftPhone}
            placeholder="Phone number"
            placeholderTextColor={ui.c.textSecondary}
            keyboardType="phone-pad"
            accessibilityLabel="Phone number"
            style={[styles.profileInput, { backgroundColor: ui.c.backgroundElement, color: ui.c.text, borderColor: ui.c.secondaryBorder, fontSize: ui.size }]}
          />
          <TextInput
            value={draftIdNumber}
            onChangeText={setDraftIdNumber}
            placeholder="ID number"
            placeholderTextColor={ui.c.textSecondary}
            accessibilityLabel="ID number"
            style={[styles.profileInput, { backgroundColor: ui.c.backgroundElement, color: ui.c.text, borderColor: ui.c.secondaryBorder, fontSize: ui.size }]}
          />
          <TextInput
            value={draftHomeAddress}
            onChangeText={setDraftHomeAddress}
            placeholder="Home address"
            placeholderTextColor={ui.c.textSecondary}
            accessibilityLabel="Home address"
            multiline
            style={[styles.profileInput, { backgroundColor: ui.c.backgroundElement, color: ui.c.text, borderColor: ui.c.secondaryBorder, fontSize: ui.size }]}
          />
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={[styles.profileAction, { backgroundColor: ui.c.backgroundSelected }]}>
              <Text style={{ color: ui.c.text, fontSize: ui.size, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void save()}
              disabled={saving || !draftName.trim() || !draftPhone.trim() || !draftIdNumber.trim() || !draftHomeAddress.trim()}
              style={[styles.profileAction, { backgroundColor: ui.c.primarylight, opacity: saving ? 0.6 : 1 }]}
            >
              <Text style={{ color: ui.c.onPrimary, fontSize: ui.size, fontWeight: '600' }}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { scheme, theme, textScale, setThemeMode, setTextSize } = useAppTheme();

  const [user, setUser] = useState<{
    id: string;
    name: string;
    role: Role;
    email: string;
    phoneNumber: string;
    idNumber: string;
    homeAddress: string;
    profileImage?: string;
    accountActive: boolean;
  } | null>(null);
  const [profileError, setProfileError] = useState('');
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showLanguages, setShowLanguages] = useState(false);
  const [hasBiometricHardware, setHasBiometricHardware] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometrics');

  useEffect(() => {
    let active = true;
    getCurrentUserProfile()
      .then((profile: UserProfile) => {
        if (!active) return;
        const role: Role =
          profile.role === 'd' || profile.role === 'doctor'
            ? 'doctor'
            : profile.role === 'r' || profile.role === 'receptionist'
              ? 'receptionist'
              : 'patient';
        setUser({
          id: profile.id,
          name: profile.name || 'User',
          email: profile.email || '',
          phoneNumber: profile.phoneNumber || '',
          idNumber: profile.idNumber || '',
          homeAddress: profile.homeAddress || '',
          profileImage: profile.profileImage || '',
          role,
          accountActive: profile.accountVerified === true || profile.accountStatus === 'active',
        });
        setProfileError('');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setProfileError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // Check device biometric capabilities
    const checkBiometrics = async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      setHasBiometricHardware(compatible);
      if (compatible) {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('Face ID');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType('Fingerprint');
        }
      }
    };
    void checkBiometrics();

    const loadSettings = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...JSON.parse(saved),
          });
        }
      } catch (error) {
        console.log('Could not load settings', error);
      }
    };

    void loadSettings();
  }, []);

  const updateSetting = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    if (key === 'biometricLogin' && value === true) {
      // Prompt biometric authentication verification before enabling
      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: `Authenticate with ${biometricType} to enable security`,
        fallbackLabel: 'Use Passcode',
      });
      if (!authResult.success) {
        showMessage('Authentication Failed', 'Could not verify biometrics. Setting was not enabled.');
        return;
      }
    }

    const newSettings = {
      ...settings,
      [key]: value,
    };

    setSettings(newSettings);
    if (key === 'themeMode') setThemeMode(newSettings.themeMode);
    if (key === 'fontSize') setTextSize(newSettings.fontSize);

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
    } catch (error) {
      console.log('Could not save settings', error);
    }
  };

  const size = Math.round(17 * textScale);

  const ui: UI = {
    c: theme.colors,
    size,
    iconTextColor: scheme === 'dark' ? theme.colors.onSecondary : theme.colors.onPrimary,
  };

  const currentLanguage = LANGUAGES.find(
    (language) => language.value === settings.language,
  )?.text;

  const initials = (user?.name || '')
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2);

  const handleSaveProfile = async (name: string, phoneNumber: string, idNumber: string, homeAddress: string, profileImage: string) => {
    if (!user) return;
    await updateUserProfile(user.id, { name, phoneNumber, idNumber, homeAddress, profileImage });
    setUser({ ...user, name, phoneNumber, idNumber, homeAddress, profileImage });
    showMessage('Profile updated', 'Your profile was saved successfully.');
  };

  const handleChangePassword = async () => {
    try {
      await sendCurrentUserPasswordReset();
      showMessage('Password reset sent', `A password reset link was sent to ${user?.email || 'your email address'}.`);
    } catch (error) {
      showMessage('Could not send reset email', error instanceof Error ? error.message : String(error));
    }
  };

  const handleClearMedicalData = () => {
    const clear = async () => {
      try {
        await clearLocalHealthData();
        showMessage('Done', 'Medical data removed from this device.');
      } catch (error) {
        showMessage('Error', error instanceof Error ? error.message : 'Could not remove data.');
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Clear medical data?')) void clear();
    } else {
      Alert.alert('Clear medical data?', 'This removes your conditions and medication from this device.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => void clear() },
      ]);
    }
  };

  const handleDeleteAccount = () => {
    const submitRequest = async () => {
      try {
        await requestAccountDeletion();
        showMessage('Request submitted', 'Your account-deletion request was recorded.');
      } catch (error) {
        showMessage('Could not submit request', error instanceof Error ? error.message : String(error));
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Request account deletion?')) void submitRequest();
    } else {
      Alert.alert('Request account deletion?', 'Your clinic will need to complete the deletion process.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Submit request', style: 'destructive', onPress: () => void submitRequest() },
      ]);
    }
  };

  const handleLogout = () => {
    const signOut = () => {
      void logoutUser().catch((error: unknown) =>
        showMessage('Could not log out', error instanceof Error ? error.message : String(error)),
      );
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Log out?')) signOut();
    } else {
      Alert.alert('Log out', 'Are you sure you want to log out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', onPress: signOut },
      ]);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: ui.c.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          width: '100%',
          maxWidth: MaxContentWidth,
          alignSelf: 'center',
          paddingHorizontal: Spacing.three,
          paddingBottom: BottomTabInset + Spacing.five,
        }}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: ui.c.text, fontSize: size + 17, flex: 1, marginTop: 0, marginBottom: 0 }]}>Settings</Text>
          <Pressable
            onPress={() => router.push('/')}
            accessibilityRole="button"
            accessibilityLabel="Home"
            style={[styles.homeButton, { backgroundColor: ui.c.backgroundElement }]}
          >
            <Ionicons name="home" size={22} color={ui.c.text} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => user && setProfileModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          style={[
          styles.profileCard,
          {
            backgroundColor: ui.c.backgroundElement,
            borderLeftColor: ui.c.secondary,
          },
        ]}>
          {user?.profileImage ? (
            <Image source={{ uri: user.profileImage }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: ui.c.primarylight }]}>
              <Text style={[styles.avatarText, { color: ui.c.onPrimary, fontSize: size + 5 }]}>{initials}</Text>
            </View>
          )}

          <View style={styles.profileInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: size + 3, fontWeight: '700', color: ui.c.text }}>
                {user?.name || 'Loading profile…'}
              </Text>
              {user && <AccountVerificationIcon verified={user.accountActive} size={18} />}
            </View>
            <Text style={{ fontSize: size - 3, color: ui.c.textSecondary, marginTop: 3 }}>
              {user?.email || profileError || ''}
            </Text>
            <Text style={{ fontSize: size - 3, color: ui.c.primarylight, marginTop: 3 }}>
              Tap to edit profile & picture
            </Text>
            <Text style={{ fontSize: size - 3, color: ui.c.textSecondary, marginTop: 3 }}>
              {user?.phoneNumber || ''}
            </Text>
            <Text style={{ fontSize: size - 3, color: ui.c.textSecondary, marginTop: 3 }}>
              ID: {user?.idNumber || 'Not provided'}
            </Text>
            <Text style={{ fontSize: size - 3, color: ui.c.textSecondary, marginTop: 3 }}>
              {user?.homeAddress || 'No home address provided'}
            </Text>
            <View style={[styles.roleBadge, { backgroundColor: `${ui.c.primarylight}26` }]}>
              <Text style={[styles.roleBadgeText, { color: ui.c.primary, fontSize: size - 6 }]}>{user?.role.toUpperCase() || ''}</Text>
            </View>
          </View>
        </Pressable>

        <SectionTitle title="Display & Appearance" ui={ui} />
        <Group ui={ui}>
          <Row
            icon="contrast-outline"
            tint={ui.c.violet}
            label="Appearance"
            hint="Choose theme mode"
            ui={ui}
            below={
              <Segmented
                ui={ui}
                selected={settings.themeMode}
                onSelect={(value) => updateSetting('themeMode', value as ThemeMode)}
                options={[
                  { value: 'system', text: 'System' },
                  { value: 'light', text: 'Light' },
                  { value: 'dark', text: 'Dark' },
                ]}
              />
            }
          />
          <Row
            icon="text-outline"
            tint={ui.c.primarylight}
            label="Text size"
            hint="Make the text easier to read"
            ui={ui}
            below={
              <Segmented
                ui={ui}
                selected={settings.fontSize}
                onSelect={(value) => updateSetting('fontSize', value as Settings['fontSize'])}
                options={[
                  { value: 'small', text: 'Small' },
                  { value: 'medium', text: 'Medium' },
                  { value: 'large', text: 'Large' },
                ]}
              />
            }
          />
          <Row
            icon="globe-outline"
            tint={ui.c.success}
            label="Language"
            ui={ui}
            onPress={() => setShowLanguages(!showLanguages)}
            right={<Chevron text={currentLanguage} ui={ui} />}
          />
          {showLanguages &&
            LANGUAGES.map((language) => (
              <Row
                key={language.value}
                label={language.text}
                ui={ui}
                onPress={() => {
                  updateSetting('language', language.value as Settings['language']);
                  setShowLanguages(false);
                }}
                right={
                  settings.language === language.value ? (
                    <Ionicons name="checkmark" size={22} color={ui.c.primarylight} />
                  ) : undefined
                }
              />
            ))}
        </Group>

        <SectionTitle title="Security & Authentication" ui={ui} />
        <Group ui={ui}>
          {hasBiometricHardware ? (
            <Row
              icon={biometricType === 'Face ID' ? 'scan-outline' : 'finger-print-outline'}
              tint={ui.c.primarylight}
              label={`Enable ${biometricType} Unlock`}
              hint={`Secure app access with your device's ${biometricType}`}
              ui={ui}
              right={
                <Toggle
                  label={`Enable ${biometricType} Unlock`}
                  value={settings.biometricLogin}
                  onChange={(value) => void updateSetting('biometricLogin', value)}
                  ui={ui}
                />
              }
            />
          ) : (
            <Row
              icon="finger-print-outline"
              tint={ui.c.muted}
              label="Biometric Authentication"
              hint="Not supported or disabled on this device"
              ui={ui}
            />
          )}
          <Row
            icon="key-outline"
            tint={ui.c.primarydark}
            label="Change password"
            ui={ui}
            onPress={() => void handleChangePassword()}
            right={<Chevron ui={ui} />}
          />
        </Group>

        <SectionTitle title="Privacy" ui={ui} />
        <Group ui={ui}>
          <Row
            icon="medical-outline"
            danger
            label="Clear medical data on this device"
            hint="Removes locally stored conditions and medication"
            ui={ui}
            onPress={handleClearMedicalData}
          />
          <Row
            icon="trash-outline"
            danger
            label="Request account deletion"
            ui={ui}
            onPress={handleDeleteAccount}
          />
        </Group>

        <View style={styles.logoutSection}>
          <Group ui={ui}>
            <Row
              icon="log-out-outline"
              danger
              label="Log out"
              ui={ui}
              onPress={handleLogout}
            />
          </Group>
        </View>
      </ScrollView>
      <EditProfileModal
        visible={profileModalVisible}
        name={user?.name || ''}
        phoneNumber={user?.phoneNumber || ''}
        idNumber={user?.idNumber || ''}
        homeAddress={user?.homeAddress || ''}
        profileImage={user?.profileImage || ''}
        ui={ui}
        onClose={() => setProfileModalVisible(false)}
        onSave={handleSaveProfile}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.two, marginBottom: Spacing.three },
  homeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '800', marginTop: Spacing.two, marginBottom: Spacing.three },
  sectionTitle: { fontWeight: '600', letterSpacing: 0.8, marginTop: Spacing.five, marginBottom: Spacing.two, marginLeft: Spacing.three },
  group: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.three + 36 + 12 },
  row: { paddingHorizontal: Spacing.three, paddingVertical: 14, minHeight: 60, justifyContent: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  iconSlot: { width: 36, height: 36, marginRight: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconTile: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  labelContainer: { flex: 1, minWidth: 0, justifyContent: 'center', paddingRight: 8 },
  rightContainer: { minWidth: 44, flexShrink: 0, justifyContent: 'center', alignItems: 'flex-end', marginLeft: 8 },
  belowContent: { marginTop: Spacing.three, marginLeft: 48 },
  chevronContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  segmentTrack: { flexDirection: 'row', borderRadius: 10, padding: 3, width: '100%', alignItems: 'stretch' },
  segment: { flex: 1, minWidth: 0, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  profileCard: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three, borderRadius: 16, borderLeftWidth: 4 },
  profileInfo: { flex: 1, minWidth: 0, marginLeft: Spacing.three },
  profileOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  profileSheet: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.four, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: Spacing.two },
  profileInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  modalActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  profileAction: { flex: 1, alignItems: 'center', paddingVertical: Spacing.three, borderRadius: 12 },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontWeight: '700' },
  avatarPickerContainer: { alignSelf: 'center', alignItems: 'center', marginBottom: Spacing.two },
  modalAvatar: { width: 80, height: 80, borderRadius: 40 },
  modalAvatarPlaceholder: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginTop: 6 },
  roleBadgeText: { fontWeight: '700', letterSpacing: 0.5 },
  logoutSection: { marginTop: Spacing.four },
});