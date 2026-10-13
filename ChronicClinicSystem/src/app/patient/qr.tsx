import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';
import { colors, space, type, TOUCH } from '../../constants/clinic-theme';
import { buildCheckinPayload } from '../../utils/qrPayload';

// Mock appointment for now. Later: read the patient's next appointment and its token
// from the backend (and from the cached copy on the phone so it works offline).
const MOCK_APPOINTMENT = {
  when: 'Tomorrow, 08:30',
  kind: 'Chronic check-up',
  clinic: 'Community clinic',
  tokenCode: 'A7K9-2QX4',
};

export default function PatientQr() {
  const router = useRouter();
  // null = still loading, true/false = known
  const [verified, setVerified] = useState<boolean | null>(null);

  // Re-read the flag every time this tab comes into view, so the screen updates
  // straight after the patient returns from scanning an activation code.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      AsyncStorage.getItem('isChronicVerified')
        .then((v) => active && setVerified(v === 'true'))
        .catch(() => active && setVerified(false));
      return () => {
        active = false;
      };
    }, [])
  );

  const qrValue = useMemo(
    () =>
      buildCheckinPayload({
        patientId: 'PATIENT_ID', // TODO: signed-in user's id
        tokenCode: MOCK_APPOINTMENT.tokenCode,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // valid for 24 hours
      }),
    []
  );

  const openActivationScanner = () =>
    router.push({ pathname: '/scanner', params: { mode: 'activation' } });

  // DEV ONLY: lets you see both states without a second phone. Delete before submitting.
  const devToggleVerified = async () => {
    const next = !verified;
    await AsyncStorage.setItem('isChronicVerified', next ? 'true' : 'false');
    setVerified(next);
  };

  if (verified === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }}>
      {verified ? (
        <View style={styles.card}>
          <Text style={type.heading}>{MOCK_APPOINTMENT.kind}</Text>
          <Text style={styles.when}>{MOCK_APPOINTMENT.when}</Text>
          <Text style={type.small}>{MOCK_APPOINTMENT.clinic}</Text>

          <View style={styles.qrWrap}>
            <QRCode value={qrValue} size={240} />
          </View>

          <Text style={styles.code}>{MOCK_APPOINTMENT.tokenCode}</Text>
          <Text style={[type.small, styles.centerText]}>
            Show this code to the receptionist when you arrive. It can only be used once.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={type.heading}>Verify your account</Text>
          <Text style={[type.body, styles.gap]}>
            Your doctor will show you a QR code at the clinic. Scan it to verify your account and
            unlock your appointment code.
          </Text>
        </View>
      )}

      <Pressable
        style={[styles.button, verified && styles.buttonOutline]}
        onPress={openActivationScanner}
        accessibilityRole="button"
      >
        <Text style={[styles.buttonText, verified && styles.buttonOutlineText]}>
          Scan doctor’s code
        </Text>
      </Pressable>

      {__DEV__ && (
        <Pressable style={styles.dev} onPress={devToggleVerified} accessibilityRole="button">
          <Text style={styles.devText}>Dev: switch to {verified ? 'unverified' : 'verified'}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: space.lg,
    alignItems: 'center',
    marginBottom: space.md,
  },
  when: { fontSize: 22, fontWeight: '700', color: colors.primary, marginVertical: space.xs },
  qrWrap: { marginVertical: space.lg },
  code: { fontSize: 22, fontWeight: '700', letterSpacing: 2, color: colors.ink, marginBottom: space.sm },
  centerText: { textAlign: 'center' },
  gap: { marginTop: space.sm, textAlign: 'center' },

  button: {
    minHeight: TOUCH,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 18, fontWeight: '600', color: colors.primaryText },
  buttonOutline: { backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.primary },
  buttonOutlineText: { color: colors.primary },

  dev: { marginTop: space.lg, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  devText: { fontSize: 14, color: colors.muted, textDecorationLine: 'underline' },
});
