import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

// Firebase imports for live authentication and role fetching
import { auth, db } from '@/config/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

import {
  Colors,
  Spacing,
  BottomTabInset,
  MaxContentWidth,
} from '@/constants/theme';

type Role = 'doctor' | 'patient' | 'receptionist';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Settings = {
  themeMode: 'system' | 'light' | 'dark';
  fontSize: 'small' | 'medium' | 'large';
  language: 'en' | 'ss' | 'zu' | 'af';
  biometrics: boolean;
  autoLock: '1' | '5' | '15';
  pushNotifications: boolean;
  reminderTime: 'day' | 'hours';
  lowDataMode: boolean;
  lastSynced: string;
  patientReminders: boolean;
  doctorAlerts: boolean;
  dailySummary: boolean;
  queueChime: boolean;
  vibrateOnScan: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  themeMode: 'system',
  fontSize: 'medium',
  language: 'en',
  biometrics: true,
  autoLock: '5',
  pushNotifications: true,
  reminderTime: 'day',
  lowDataMode: false,
  lastSynced: 'Never',
  patientReminders: true,
  doctorAlerts: true,
  dailySummary: true,
  queueChime: true,
  vibrateOnScan: true,
};

const LANGUAGES = [
  { value: 'en', text: 'English' },
  { value: 'ss', text: 'siSwati' },
  { value: 'zu', text: 'isiZulu' },
  { value: 'af', text: 'Afrikaans' },
];

const STORAGE_KEY = 'appSettings';
const ACCENT = '#208AEF';
const DANGER = '#E5484D';

const SHOW_DEV_TOOLS = false;

type UI = {
  c: (typeof Colors)['light'] | (typeof Colors)['dark'];
  size: number;
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
    <View style={[styles.group, { backgroundColor: ui.c.backgroundElement }]}>
      {rows.map((row, index) => (
        <View key={index}>
          {row}
          {index < rows.length - 1 && (
            <View
              style={[
                styles.separator,
                { backgroundColor: ui.c.backgroundSelected },
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
  tint = ACCENT,
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
                { backgroundColor: danger ? DANGER : tint },
              ]}
            >
              <Ionicons name={icon} size={19} color="#FFFFFF" />
            </View>
          ) : null}
        </View>

        <View style={styles.labelContainer}>
          <Text
            style={{
              fontSize: ui.size,
              fontWeight: '500',
              color: danger ? DANGER : ui.c.text,
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
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: ACCENT, false: '#9CA3AF' }}
      thumbColor="#FFFFFF"
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
        { backgroundColor: ui.c.backgroundSelected },
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

export default function SettingsScreen() {
  const systemScheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  const [user, setUser] = useState<{
    name: string;
    role: Role;
    email: string;
  }>({
    name: 'Senzwesihle Zwane',
    role: 'doctor',
    email: 'senzwesihle@example.com',
  });

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showLanguages, setShowLanguages] = useState(false);

  useEffect(() => {
    if (SHOW_DEV_TOOLS) return;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userDocRef);

          if (userSnap.exists()) {
            const userData = userSnap.data();
            setUser({
              name: userData.name || currentUser.displayName || 'User',
              email: currentUser.email || userData.email || '',
              role: (userData.role as Role) || 'patient',
            });
          }
        } catch (error) {
          console.log('Error fetching user data from Firestore', error);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
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

    loadSettings();
  }, []);

  const updateSetting = async (key: keyof Settings, value: any) => {
    const newSettings = {
      ...settings,
      [key]: value,
    };

    setSettings(newSettings);

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
    } catch (error) {
      console.log('Could not save settings', error);
    }
  };

  const handleBiometricToggle = async (value: boolean) => {
    if (value) {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (!hasHardware || !isEnrolled) {
          Alert.alert(
            'Biometrics Unavailable',
            'Your device does not support biometrics or none are enrolled.'
          );
          return;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Authenticate to enable biometric security',
          fallbackLabel: 'Use passcode',
        });

        if (result.success) {
          updateSetting('biometrics', true);
        } else {
          Alert.alert('Authentication Cancelled', 'Biometric verification failed.');
        }
      } catch (error) {
        console.log('Biometric authentication error', error);
      }
    } else {
      updateSetting('biometrics', false);
    }
  };

  const activeScheme =
    settings.themeMode === 'system' ? systemScheme : settings.themeMode;

  const size =
    settings.fontSize === 'small'
      ? 15
      : settings.fontSize === 'large'
        ? 20
        : 17;

  const currentColors = Colors[activeScheme] || Colors.light;

  const ui: UI = {
    c: currentColors,
    size,
  };

  const currentLanguage = LANGUAGES.find(
    (language) => language.value === settings.language,
  )?.text;

  const initials = user.name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2);

  const handleSyncNow = () => {
    updateSetting('lastSynced', new Date().toLocaleString());
    Alert.alert('Synced', 'Your appointments are up to date.');
  };

  const handleChangePassword = () => {
    Alert.alert('Change password', 'A reset link will be sent to ' + user.email);
  };

  const handleClearMedicalData = () => {
    Alert.alert(
      'Clear medical data?',
      'This removes your conditions and medication from this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove([
                'chronicConditions',
                'medicationList',
              ]);
              Alert.alert('Done', 'Medical data removed.');
            } catch (error) {
              Alert.alert('Error', 'Could not remove data.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'Your account and appointments will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => Alert.alert('Request sent', 'Account deletion requested.'),
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', onPress: () => auth.signOut() },
    ]);
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
        <Text style={[styles.title, { color: ui.c.text }]}>Settings</Text>

        <View style={[styles.profileCard, { backgroundColor: ui.c.backgroundElement }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>

          <View style={styles.profileInfo}>
            <Text style={{ fontSize: size + 3, fontWeight: '700', color: ui.c.text }}>
              {user.name}
            </Text>
            <Text style={{ fontSize: size - 3, color: ui.c.textSecondary, marginTop: 3 }}>
              {user.email}
            </Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{user.role.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        <SectionTitle title="Display & Appearance" ui={ui} />
        <Group ui={ui}>
          <Row
            icon="contrast-outline"
            tint="#8B5CF6"
            label="Appearance"
            hint="Choose theme mode"
            ui={ui}
            below={
              <Segmented
                ui={ui}
                selected={settings.themeMode}
                onSelect={(value) => updateSetting('themeMode', value)}
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
            tint="#0EA5E9"
            label="Text size"
            hint="Make the text easier to read"
            ui={ui}
            below={
              <Segmented
                ui={ui}
                selected={settings.fontSize}
                onSelect={(value) => updateSetting('fontSize', value)}
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
            tint="#10B981"
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
                  updateSetting('language', language.value);
                  setShowLanguages(false);
                }}
                right={
                  settings.language === language.value ? (
                    <Ionicons name="checkmark" size={22} color={ACCENT} />
                  ) : undefined
                }
              />
            ))}
        </Group>

        <SectionTitle title="Notifications" ui={ui} />
        <Group ui={ui}>
          <Row
            icon="notifications-outline"
            tint="#F59E0B"
            label="Push notifications"
            hint="Appointment reminders from the clinic"
            ui={ui}
            right={
              <Toggle
                label="Push notifications"
                value={settings.pushNotifications}
                onChange={(value) => updateSetting('pushNotifications', value)}
              />
            }
          />
        </Group>

        <SectionTitle title="Security" ui={ui} />
        <Group ui={ui}>
          <Row
            icon="finger-print-outline"
            tint="#6366F1"
            label="Fingerprint / Face unlock"
            hint="Protects your health information"
            ui={ui}
            right={
              <Toggle
                label="Fingerprint or Face unlock"
                value={settings.biometrics}
                onChange={handleBiometricToggle}
              />
            }
          />
          <Row
            icon="lock-closed-outline"
            tint="#6366F1"
            label="Lock app after"
            ui={ui}
            below={
              <Segmented
                ui={ui}
                selected={settings.autoLock}
                onSelect={(value) => updateSetting('autoLock', value)}
                options={[
                  { value: '1', text: '1 min' },
                  { value: '5', text: '5 min' },
                  { value: '15', text: '15 min' },
                ]}
              />
            }
          />
          <Row
            icon="key-outline"
            tint="#6366F1"
            label="Change password"
            ui={ui}
            onPress={handleChangePassword}
            right={<Chevron ui={ui} />}
          />
        </Group>

        <SectionTitle title="Privacy" ui={ui} />
        <Group ui={ui}>
          <Row
            icon="trash-outline"
            danger
            label="Delete my account"
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 34, fontWeight: '800', marginTop: Spacing.two, marginBottom: Spacing.three },
  sectionTitle: { fontWeight: '600', letterSpacing: 0.8, marginTop: Spacing.five, marginBottom: Spacing.two, marginLeft: Spacing.three },
  group: { borderRadius: 16, overflow: 'hidden' },
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
  profileCard: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three, borderRadius: 16 },
  profileInfo: { flex: 1, minWidth: 0, marginLeft: Spacing.three },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  roleBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(32, 138, 239, 0.15)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginTop: 6 },
  roleBadgeText: { color: ACCENT, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  logoutSection: { marginTop: Spacing.four },
});