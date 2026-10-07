import React, { useState } from 'react';
import { StyleSheet, Text, View, Switch, TouchableOpacity, ScrollView } from 'react-native';

export default function SettingsScreen() {
  const [pushNotifications, setPushNotifications] = useState(true);
  const [refillReminders, setRefillReminders] = useState(true);
  const [locationServices, setLocationServices] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  
  // New state for Font configuration (Phone-like settings)
  const [fontSize, setFontSize] = useState('Medium'); // 'Small', 'Medium', 'Large'
  const [fontStyle, setFontStyle] = useState('Standard'); // 'Standard', 'Bold / Accessible'

  // Dynamic multiplier based on selected font size
  const fontMultiplier = fontSize === 'Small' ? 0.85 : fontSize === 'Large' ? 1.2 : 1.0;

  return (
    <ScrollView style={styles.container}>
      {/* Header Section */}
      <Text style={[styles.headerTitle, { fontSize: 26 * fontMultiplier }]}>System Settings</Text>
      <Text style={[styles.subtitle, { fontSize: 14 * fontMultiplier }]}>Manage your clinic notification preferences and display layout.</Text>

      {/* Font & Display Section */}
      <Text style={styles.sectionHeader}>DISPLAY & FONT SIZE</Text>
      <View style={styles.card}>
        {/* Font Size Selector */}
        <View style={styles.settingColumn}>
          <View style={styles.settingTextContainerFull}>
            <Text style={[styles.settingTitle, { fontSize: 16 * fontMultiplier }]}>Text Size</Text>
            <Text style={[styles.settingDescription, { fontSize: 13 * fontMultiplier }]}>Adjust the font size across clinic schedules and menus.</Text>
          </View>
          <View style={styles.segmentedControl}>
            {['Small', 'Medium', 'Large'].map((size) => (
              <TouchableOpacity
                key={size}
                style={[styles.segmentButton, fontSize === size && styles.segmentButtonActive]}
                onPress={() => setFontSize(size)}
              >
                <Text style={[styles.segmentText, fontSize === size && styles.segmentTextActive]}>
                  {size}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Font Weight / Style Selector */}
        <View style={styles.settingColumn}>
          <View style={styles.settingTextContainerFull}>
            <Text style={[styles.settingTitle, { fontSize: 16 * fontMultiplier }]}>Font Style</Text>
            <Text style={[styles.settingDescription, { fontSize: 13 * fontMultiplier }]}>Switch between standard and bold text for readability.</Text>
          </View>
          <View style={styles.segmentedControl}>
            {['Standard', 'Bold'].map((style) => (
              <TouchableOpacity
                key={style}
                style={[styles.segmentButton, fontStyle === style && styles.segmentButtonActive]}
                onPress={() => setFontStyle(style)}
              >
                <Text style={[styles.segmentText, fontStyle === style && styles.segmentTextActive]}>
                  {style}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Preferences Section */}
      <Text style={styles.sectionHeader}>PREFERENCES</Text>
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingTitle, { fontSize: 16 * fontMultiplier }]}>Push Notifications</Text>
            <Text style={[styles.settingDescription, { fontSize: 13 * fontMultiplier }]}>Receive alerts regarding appointments and status updates.</Text>
          </View>
          <Switch
            trackColor={{ false: '#d1d5db', true: '#007AFF' }}
            thumbColor={'#ffffff'}
            onValueChange={setPushNotifications}
            value={pushNotifications}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.settingRow}>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingTitle, { fontSize: 16 * fontMultiplier }]}>Medication Refill Reminders</Text>
            <Text style={[styles.settingDescription, { fontSize: 13 * fontMultiplier }]}>Get notified 24 hours prior to your collection date.</Text>
          </View>
          <Switch
            trackColor={{ false: '#d1d5db', true: '#007AFF' }}
            thumbColor={'#ffffff'}
            onValueChange={setRefillReminders}
            value={refillReminders}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.settingRow}>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingTitle, { fontSize: 16 * fontMultiplier }]}>Location Services</Text>
            <Text style={[styles.settingDescription, { fontSize: 13 * fontMultiplier }]}>Enable express QR check-in when arriving at the clinic.</Text>
          </View>
          <Switch
            trackColor={{ false: '#d1d5db', true: '#007AFF' }}
            thumbColor={'#ffffff'}
            onValueChange={setLocationServices}
            value={locationServices}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.settingRow}>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingTitle, { fontSize: 16 * fontMultiplier }]}>Dark Theme Preview</Text>
            <Text style={[styles.settingDescription, { fontSize: 13 * fontMultiplier }]}>Switch application color scheme.</Text>
          </View>
          <Switch
            trackColor={{ false: '#d1d5db', true: '#007AFF' }}
            thumbColor={'#ffffff'}
            onValueChange={setDarkMode}
            value={darkMode}
          />
        </View>
      </View>

      {/* Account & Support Section */}
      <Text style={styles.sectionHeader}>ACCOUNT & SUPPORT</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.actionRow} onPress={() => console.log('Edit Profile Pressed')}>
          <Text style={[styles.actionTextPrimary, { fontSize: 16 * fontMultiplier }]}>Edit Patient Profile</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.actionRow} onPress={() => console.log('Support Pressed')}>
          <Text style={[styles.actionTextPrimary, { fontSize: 16 * fontMultiplier }]}>Contact Clinic Support</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.actionRow} onPress={() => console.log('Logout Pressed')}>
          <Text style={[styles.actionTextDanger, { fontSize: 16 * fontMultiplier }]}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 20,
  },
  headerTitle: {
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  subtitle: {
    color: '#64748b',
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  settingColumn: {
    paddingVertical: 14,
  },
  settingTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
  settingTextContainerFull: {
    marginBottom: 10,
  },
  settingTitle: {
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  settingDescription: {
    color: '#64748b',
    lineHeight: 18,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  segmentTextActive: {
    fontWeight: '600',
    color: '#007AFF',
  },
  actionRow: {
    paddingVertical: 16,
  },
  actionTextPrimary: {
    fontWeight: '600',
    color: '#007AFF',
  },
  actionTextDanger: {
    fontWeight: '600',
    color: '#ef4444',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
  },
});