import { useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, space, type, TOUCH } from '../constants/clinic-theme';
import { parseQrPayload, type QrPayload, type QrType } from '../utils/qrPayload';

// route param "mode":
//   activation - patient scans the doctor's code to verify their account
//   checkin    - receptionist scans the patient's appointment code
const COPY: Record<QrType, { title: string; hint: string }> = {
  activation: {
    title: 'Scan activation code',
    hint: 'Point the camera at the code on your doctor’s screen.',
  },
  checkin: {
    title: 'Scan check-in code',
    hint: 'Point the camera at the patient’s appointment code.',
  },
};

export default function Scanner() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const scanMode: QrType = mode === 'activation' ? 'activation' : 'checkin';
  const copy = COPY[scanMode];

  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const locked = useRef(false); // stops one code firing the handler many times

  const handleValid = async (data: QrPayload) => {
    if (scanMode === 'activation') {
      // Medical data is saved on this phone only. It never goes to Firestore.
      await AsyncStorage.multiSet([
        ['chronicConditions', JSON.stringify(data.conditions ?? [])],
        ['medicationList', JSON.stringify(data.medications ?? [])],
        ['activationClinicId', data.clinicId ?? ''],
        ['isChronicVerified', 'true'],
      ]);
      // TODO: call a Cloud Function to set accountStatus = 'active' for this user.
      Alert.alert('Account verified', 'Your clinic details are saved on this phone.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } else {
      // TODO: call the validateToken Cloud Function with data.tokenCode, mark it used,
      // then create the queue entry and show the patient's position.
      setMessage({ kind: 'ok', text: 'Code read. Checking with the clinic…' });
    }
  };

  const onScanned = ({ data: raw }: { data: string }) => {
    if (locked.current) return;
    locked.current = true;

    const result = parseQrPayload(raw, scanMode);
    if (!result.ok) {
      setMessage({ kind: 'error', text: result.message });
      setTimeout(() => {
        locked.current = false;
        setMessage(null);
      }, 2500);
      return;
    }

    handleValid(result.data).catch(() => {
      setMessage({ kind: 'error', text: 'Something went wrong. Try scanning again.' });
      locked.current = false;
    });
  };

  // Permission still loading
  if (!permission) {
    return <View style={styles.center} />;
  }

  // Permission not granted yet
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: copy.title }} />
        <Text style={styles.centerTitle}>Camera access needed</Text>
        <Text style={styles.centerBody}>The app uses the camera only to read QR codes.</Text>
        {permission.canAskAgain ? (
          <Pressable style={styles.button} onPress={requestPermission} accessibilityRole="button">
            <Text style={styles.buttonText}>Allow camera</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.button} onPress={() => Linking.openSettings()} accessibilityRole="button">
            <Text style={styles.buttonText}>Open phone settings</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
      />

      <View style={styles.top}>
        <Text style={styles.topTitle}>{copy.title}</Text>
        <Text style={styles.topHint}>{copy.hint}</Text>
      </View>

      <View style={styles.frame} pointerEvents="none" />

      {message && (
        <View style={[styles.banner, message.kind === 'error' ? styles.bannerError : styles.bannerOk]}>
          <Text style={styles.bannerText}>{message.text}</Text>
        </View>
      )}

      <Pressable style={styles.cancel} onPress={() => router.back()} accessibilityRole="button">
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const FRAME = 260;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  centerTitle: { ...type.title, textAlign: 'center', marginBottom: space.sm },
  centerBody: { ...type.body, textAlign: 'center', marginBottom: space.lg },
  button: {
    minHeight: TOUCH,
    minWidth: 220,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonText: { fontSize: 18, fontWeight: '600', color: colors.primaryText },

  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: space.lg,
    paddingTop: 56,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  topTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  topHint: { fontSize: 16, color: '#E6EDF1', marginTop: space.xs },

  frame: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: FRAME,
    height: FRAME,
    marginLeft: -FRAME / 2,
    marginTop: -FRAME / 2,
    borderWidth: 4,
    borderColor: '#fff',
    borderRadius: 20,
  },

  banner: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: 120,
    padding: space.md,
    borderRadius: 12,
  },
  bannerError: { backgroundColor: colors.danger },
  bannerOk: { backgroundColor: colors.primary },
  bannerText: { fontSize: 18, fontWeight: '600', color: '#fff', textAlign: 'center' },

  cancel: {
    position: 'absolute',
    bottom: space.lg,
    alignSelf: 'center',
    minHeight: TOUCH,
    minWidth: 180,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 18, fontWeight: '600', color: colors.ink },
});
