// SettingsScreen.jsx
// This is the settings page for the app. It dynamically displays different
// configuration options based on the logged-in user's role (patient, doctor, or receptionist).

import React, { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSettings } from '../Context/SettingsContext';
import AppDialog, { useDialog } from '../components/AppDialog';

// ---------------------------------------------------------------------------
// Selection options for drop-downs and segmented controls
// ---------------------------------------------------------------------------
const THEME_OPTIONS = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];
const TEXT_SIZES = ['Small', 'Medium', 'Large', 'Extra large'];
const AUTO_LOCK = ['Immediately', '1 minute', '5 minutes', '15 minutes'];
const LANGUAGES = ['English', 'Afrikaans', 'isiZulu', 'isiXhosa', 'Sesotho', 'Setswana'];
const REMINDER_LEADS = ['2 hours before', '1 day before', '2 days before'];
const SLOT_MINUTES = [10, 15, 20, 30];
const DESKS = ['Desk 01', 'Desk 02', 'Desk 03', 'Desk 04'];

// Storage keys used to save or clear local data on the patient's device
const QR_STORAGE_KEYS = ['cachedAppointments'];
const HEALTH_STORAGE_KEYS = ['chronicConditions', 'medicationList', 'isChronicVerified'];

export default function SettingsScreen({
  role: roleFromApp = 'patient', // Default role if none is passed
  user = { name: 'Thandi Mokoena', email: 'thandi@example.com', accountStatus: 'active' },
  onEditProfile, 
  onResetPassword, 
  onLogout, 
}) {
  const { settings, update, reset, colors, fs } = useSettings();
  const styles = useMemo(() => makeStyles(colors, fs), [colors, fs]);
  const { dialog, close, info, confirm, pick } = useDialog();

  // Handy developer toggle to test different roles right from the UI
  const [previewRole, setPreviewRole] = useState(null);
  const role = previewRole || roleFromApp;

  // -------------------------------------------------------------------------
  // Helper functions for user actions
  // -------------------------------------------------------------------------

  // Turns device biometrics (fingerprint/face unlock) on or off securely
  async function handleBiometric(turnOn) {
    if (!turnOn) {
      update('biometric', false);
      return;
    }
    // Biometrics are only available on physical mobile devices, not web browsers
    if (Platform.OS === 'web') {
      info('Not available here', 'Biometric lock only works on the phone app, not in the web preview.');
      return;
    }
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        info('Biometrics not set up', 'Add a fingerprint or face lock in your phone settings first.');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm it is you to turn on app lock',
      });
      if (result.success) update('biometric', true);
    } catch (error) {
      info('Something went wrong', 'Could not turn on biometric lock. Please try again.');
    }
  }

  // Requests notification permissions before turning appointment reminders on
  async function handleReminderToggle(key, turnOn) {
    if (turnOn && Platform.OS !== 'web') {
      try {
        const current = await Notifications.getPermissionsAsync();
        let allowed = current.granted;
        if (!allowed) {
          const asked = await Notifications.requestPermissionsAsync();
          allowed = asked.granted;
        }
        if (!allowed) {
          info('Notifications blocked', 'Please allow notifications in your phone settings to receive reminders.');
          return;
        }
      } catch (error) {
        console.log('Notification permission error:', error);
      }
    }
    update(key, turnOn);
  }

  // Safely clears cached data stored in AsyncStorage
  async function deleteLocalData(keys, doneMessage) {
    try {
      await AsyncStorage.multiRemove(keys);
      info('Done', doneMessage);
    } catch (error) {
      info('Could not clear data', 'Please try again.');
    }
  }

  function clearSavedQrCodes() {
    confirm(
      'Clear saved check-in codes?',
      'Your QR codes will download again next time you connect to the internet.',
      'Clear codes',
      () => deleteLocalData(QR_STORAGE_KEYS, 'Saved check-in codes were cleared.')
    );
  }

  function removeHealthData() {
    confirm(
      'Remove health data from this phone?',
      'Your conditions and medication list will be deleted locally, and your account will need to be re-verified by your doctor.',
      'Remove data',
      () => deleteLocalData(HEALTH_STORAGE_KEYS, 'Health data was removed from this phone.'),
      true // Flags this action as a red/destructive button
    );
  }

  function resetPassword() {
    if (onResetPassword) onResetPassword();
    else info('Reset password', `A reset link will be sent to ${user.email}.`);
  }

  function editProfile() {
    if (onEditProfile) onEditProfile();
    else info('Edit profile', 'Navigating to the profile screen.');
  }

  function logOut() {
    confirm('Log out?', 'You will need to sign in again to access your dashboard.', 'Log out', () => {
      if (onLogout) onLogout();
      else info('Logged out', 'Session ended.');
    });
  }

  function resetAllSettings() {
    confirm('Reset all settings?', 'All preferences will revert back to their default values.', 'Reset', reset, true);
  }

  // -------------------------------------------------------------------------
  // Render setup variables
  // -------------------------------------------------------------------------
  const isVerified = user.accountStatus === 'active';
  const initials = user.name
    .split(' ')
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const roleName = { patient: 'Patient', doctor: 'Doctor', receptionist: 'Receptionist' }[role];

  const rowProps = { styles, colors };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title} accessibilityRole="header">Settings</Text>

        {/* ---------- User Profile Card ---------- */}
        <Pressable style={styles.profileCard} onPress={editProfile} accessibilityRole="button">
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user.name}</Text>
            <Text style={styles.profileSub}>{roleName} · {user.email}</Text>

            {/* Verification badge shown only for patients */}
            {role === 'patient' && (
              <View style={[styles.badge, { backgroundColor: isVerified ? colors.successSoft : colors.warningSoft }]}>
                <Ionicons
                  name={isVerified ? 'checkmark-circle' : 'alert-circle'}
                  size={fs(14)}
                  color={isVerified ? colors.success : colors.warning}
                />
                <Text style={[styles.badgeText, { color: isVerified ? colors.success : colors.warning }]}>
                  {isVerified ? 'Verified by your doctor' : 'Not verified yet'}
                </Text>
              </View>
            )}
          </View>
          <Ionicons name="chevron-forward" size={fs(20)} color={colors.muted} />
        </Pressable>

        {/* ---------- Developer Role Switcher (Visible in development only) ---------- */}
        {__DEV__ && (
          <Section title="Developer: preview a role" styles={styles}>
            <View style={styles.padded}>
              <Segmented
                styles={styles}
                value={role}
                onChange={setPreviewRole}
                options={[
                  { label: 'Patient', value: 'patient' },
                  { label: 'Doctor', value: 'doctor' },
                  { label: 'Receptionist', value: 'receptionist' },
                ]}
              />
            </View>
          </Section>
        )}

        {/* ================= PATIENT ONLY SETTINGS ================= */}
        {role === 'patient' && (
          <>
            <Section title="Reminders" styles={styles}>
              <ToggleRow
                {...rowProps}
                icon="calendar-outline"
                label="Appointment reminders"
                hint="Get a notification before each scheduled check-up"
                value={settings.apptReminders}
                onChange={(on) => handleReminderToggle('apptReminders', on)}
              />
              {settings.apptReminders && (
                <ValueRow
                  {...rowProps}
                  icon="alarm-outline"
                  label="Remind me"
                  value={settings.reminderLead}
                  onPress={() => pick('Remind me', REMINDER_LEADS, settings.reminderLead, (v) => update('reminderLead', v))}
                />
              )}
              <ToggleRow
                {...rowProps}
                icon="medkit-outline"
                label="Medication refill reminders"
                hint="Know when it is time to collect your prescription"
                value={settings.refillReminders}
                onChange={(on) => handleReminderToggle('refillReminders', on)}
                last
              />
            </Section>

            <Section title="Data on this phone" styles={styles}>
              <ValueRow
                {...rowProps}
                icon="qr-code-outline"
                label="Clear saved check-in codes"
                hint="Frees storage. Codes download automatically when online"
                onPress={clearSavedQrCodes}
              />
              <ValueRow
                {...rowProps}
                icon="trash-outline"
                label="Remove health data"
                hint="Deletes conditions and medications stored locally"
                danger
                onPress={removeHealthData}
                last
              />
            </Section>
          </>
        )}

        {/* ================= DOCTOR ONLY SETTINGS ================= */}
        {role === 'doctor' && (
          <Section title="Clinical" styles={styles}>
            <ToggleRow
              {...rowProps}
              icon="pulse-outline"
              label="On duty"
              hint={settings.onDuty ? 'You are accepting patients' : 'You are currently off duty'}
              value={settings.onDuty}
              onChange={(on) => update('onDuty', on)}
            />
            <ValueRow
              {...rowProps}
              icon="time-outline"
              label="Consultation length"
              value={`${settings.slotMinutes} minutes`}
              onPress={() =>
                pick(
                  'Consultation length',
                  SLOT_MINUTES.map((m) => ({ label: `${m} minutes`, value: m })),
                  settings.slotMinutes,
                  (v) => update('slotMinutes', v)
                )
              }
            />
            <ValueRow
              {...rowProps}
              icon="download-outline"
              label="Export consultation log"
              onPress={() => info('Export log', 'Export feature connects to the database.')}
              last
            />
          </Section>
        )}

        {/* ================= RECEPTIONIST ONLY SETTINGS ================= */}
        {role === 'receptionist' && (
          <Section title="Reception desk" styles={styles}>
            <ValueRow
              {...rowProps}
              icon="desktop-outline"
              label="Current desk"
              value={settings.deskNumber}
              onPress={() => pick('Current desk', DESKS, settings.deskNumber, (v) => update('deskNumber', v))}
            />
            <ToggleRow
              {...rowProps}
              icon="sync-outline"
              label="Live queue updates"
              hint="Keep enabled for real-time synchronization"
              value={settings.liveQueue}
              onChange={(on) => update('liveQueue', on)}
            />
            <ToggleRow
              {...rowProps}
              icon="volume-high-outline"
              label="Check-in chime sound"
              value={settings.queueChimes}
              onChange={(on) => update('queueChimes', on)}
            />
            <ToggleRow
              {...rowProps}
              icon="phone-portrait-outline"
              label="Vibrate after successful scan"
              value={settings.vibrateOnScan}
              onChange={(on) => update('vibrateOnScan', on)}
              last
            />
          </Section>
        )}

        {/* ================= GENERAL SETTINGS (EVERYONE) ================= */}
        <Section title="Appearance" styles={styles}>
          <View style={styles.padded}>
            <Text style={styles.rowLabel}>Theme</Text>
            <View style={{ height: 10 }} />
            <Segmented
              styles={styles}
              value={settings.themeMode}
              options={THEME_OPTIONS}
              onChange={(v) => update('themeMode', v)}
            />
          </View>

          <View style={[styles.padded, styles.topBorder]}>
            <Text style={styles.rowLabel}>Text size</Text>
            <View style={{ height: 10 }} />
            <Segmented
              styles={styles}
              value={settings.textSize}
              options={TEXT_SIZES.map((s) => ({ label: s === 'Extra large' ? 'XL' : s, value: s }))}
              onChange={(v) => update('textSize', v)}
            />
            <Text style={styles.preview}>Your next check-up preview text sample.</Text>
          </View>

          <ValueRow
            {...rowProps}
            icon="language-outline"
            label="Language"
            value={settings.language}
            onPress={() => pick('Language', LANGUAGES, settings.language, (v) => update('language', v))}
          />
          <ToggleRow
            {...rowProps}
            icon="cellular-outline"
            label="Data saver"
            hint="Reduces background network usage"
            value={settings.lowData}
            onChange={(on) => update('lowData', on)}
            last
          />
        </Section>

        <Section title="Security" styles={styles}>
          <ToggleRow
            {...rowProps}
            icon="finger-print-outline"
            label="Biometric app lock"
            hint="Use fingerprint or face ID to secure the app"
            value={settings.biometric}
            onChange={handleBiometric}
          />
          {settings.biometric && (
            <ValueRow
              {...rowProps}
              icon="lock-closed-outline"
              label="Auto-lock timer"
              value={settings.autoLock}
              onPress={() => pick('Lock the app', AUTO_LOCK, settings.autoLock, (v) => update('autoLock', v))}
            />
          )}
          <ValueRow {...rowProps} icon="key-outline" label="Reset password" onPress={resetPassword} last />
        </Section>

        <Section title="Privacy and help" styles={styles}>
          <ValueRow
            {...rowProps}
            icon="shield-checkmark-outline"
            label="How your data is protected"
            onPress={() =>
              info(
                'Data Security & Privacy',
                role === 'patient'
                  ? 'Your medical conditions and medications stay securely on your device and are never sent to external servers.'
                  : 'Sensitive medical records remain locally on patient devices in compliance with privacy guidelines.'
              )
            }
          />
          <ValueRow
            {...rowProps}
            icon="help-circle-outline"
            label="Help and support"
            onPress={() => info('Help and support', 'Contact the clinic reception desk for assistance.')}
          />
          <ValueRow
            {...rowProps}
            icon="document-text-outline"
            label="Terms and privacy policy"
            onPress={() => info('Terms', 'Legal agreements and privacy documentation.')}
          />
          <ValueRow {...rowProps} icon="information-circle-outline" label="App version" value="1.0.0" last />
        </Section>

        <Section styles={styles}>
          <ValueRow {...rowProps} icon="refresh-outline" label="Reset all settings" onPress={resetAllSettings} />
          <ValueRow {...rowProps} icon="log-out-outline" label="Log out" danger onPress={logOut} last />
        </Section>
      </ScrollView>

      {/* Reusable modal dialog component */}
      <AppDialog dialog={dialog} onClose={close} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Reusable UI Components
// ---------------------------------------------------------------------------

function Section({ title, children, styles }) {
  return (
    <View style={styles.sectionWrap}>
      {title ? <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text> : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function IconBadge({ name, color, background }) {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={20} color={color} />
    </View>
  );
}

function RowText({ styles, label, hint, danger, colors }) {
  return (
    <View style={{ flex: 1, paddingRight: 12 }}>
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
    </View>
  );
}

function ToggleRow({ styles, colors, icon, label, hint, value, onChange, last }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <IconBadge name={icon} color={colors.primary} background={colors.primarySoft} />
      <View style={{ width: 12 }} />
      <RowText styles={styles} colors={colors} label={label} hint={hint} />
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#FFFFFF"
        accessibilityLabel={label}
      />
    </View>
  );
}

function ValueRow({ styles, colors, icon, label, hint, value, onPress, danger, last }) {
  const iconColor = danger ? colors.danger : colors.primary;
  const iconBackground = danger ? colors.dangerSoft : colors.primarySoft;

  const content = (
    <>
      <IconBadge name={icon} color={iconColor} background={iconBackground} />
      <View style={{ width: 12 }} />
      <RowText styles={styles} colors={colors} label={label} hint={hint} danger={danger} />
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ marginLeft: 6 }} /> : null}
    </>
  );

  const rowStyle = [styles.row, !last && styles.rowBorder];

  if (!onPress) return <View style={rowStyle}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [rowStyle, pressed && { opacity: 0.6 }]}
    >
      {content}
    </Pressable>
  );
}

function Segmented({ styles, options, value, onChange }) {
  return (
    <View style={styles.segment}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Dynamic StyleSheet
// ---------------------------------------------------------------------------
const makeStyles = (c, fs) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, paddingBottom: 48, width: '100%', maxWidth: 640, alignSelf: 'center' },
    title: { fontSize: fs(30), fontWeight: '800', color: c.text, marginTop: 8, marginBottom: 16 },

    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      gap: 14,
    },
    avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: c.onPrimary, fontSize: 20, fontWeight: '800' },
    profileName: { fontSize: fs(18), fontWeight: '700', color: c.text },
    profileSub: { fontSize: fs(13), color: c.muted, marginTop: 2 },
    badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginTop: 8 },
    badgeText: { fontSize: fs(12), fontWeight: '600' },

    sectionWrap: { marginTop: 22 },
    sectionTitle: { fontSize: fs(15), fontWeight: '700', color: c.muted, marginBottom: 8, marginLeft: 4 },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    padded: { padding: 16 },
    topBorder: { borderTopWidth: 1, borderTopColor: c.border },

    row: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: c.border },
    rowLabel: { fontSize: fs(15), fontWeight: '600', color: c.text },
    rowHint: { fontSize: fs(12), color: c.muted, marginTop: 2 },
    rowValue: { fontSize: fs(14), fontWeight: '500', color: c.muted },
    preview: { fontSize: fs(13), color: c.muted, fontStyle: 'italic', marginTop: 10 },

    segment: { flexDirection: 'row', backgroundColor: c.bg, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: c.border },
    segmentItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
    segmentItemActive: { backgroundColor: c.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1, elevation: 1 },
    segmentText: { fontSize: fs(13), fontWeight: '500', color: c.muted },
    segmentTextActive: { fontWeight: '700', color: c.text },
  });