import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useAppTheme } from '@/components/theme-provider';
import { auth } from '../../config/firebaseConfig';
import { getLocalIcd10Record, type LocalIcd10Record } from '../../services/cache';
import { buildPatientRecordPayload } from '../../utils/qrPayload';

function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 16, paddingBottom: 32, flexGrow: 1 },
    center: {
      flex: 1,
      padding: 24,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
    },
    card: {
      padding: 20,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.secondaryBorder,
      backgroundColor: theme.colors.backgroundElement,
    },
    heading: {
      color: theme.colors.text,
      fontSize: theme.fontSizes.heading,
      fontWeight: '700',
      marginBottom: 8,
    },
    body: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSizes.body,
      marginTop: 8,
      marginBottom: 12,
      textAlign: 'center',
    },
    button: {
      minHeight: 52,
      borderRadius: 12,
      marginTop: 16,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    buttonText: { color: theme.colors.onPrimary, fontSize: theme.fontSizes.body, fontWeight: '700' },
    qrBox: {
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      padding: 20,
      marginTop: 20,
    },
    error: {
      color: theme.colors.error,
      fontSize: theme.fontSizes.body,
      fontWeight: '600',
      textAlign: 'center',
    },
    detail: { color: theme.colors.text, fontSize: theme.fontSizes.body, marginTop: 8 },
  });
}

export default function QrGeneratorScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [patientId, setPatientId] = useState('');
  const [record, setRecord] = useState<LocalIcd10Record | null>(null);
  const [qrValue, setQrValue] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setError('');
      setQrValue('');
      const loadLocalQrData = async () => {
        try {
          const uid = auth.currentUser?.uid;
          if (!uid) {
            throw new Error('Sign in while online at least once before generating your patient QR code.');
          }
          const localRecord = await getLocalIcd10Record(uid);
          if (!active) return;
          setPatientId(uid);
          setRecord(localRecord);
        } catch (loadError) {
          if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
        } finally {
          if (active) setLoading(false);
        }
      };
      void loadLocalQrData();
      return () => {
        active = false;
      };
    }, []),
  );

  const generate = () => {
    if (!record || !patientId) return;
    setQrValue(
      buildPatientRecordPayload({
        v: 1,
        type: 'patient-record',
        patientId,
        localId: record.localId,
        icd10Codes: record.icd10Codes,
        lastUpdatedAt: record.lastUpdatedAt,
        lastUpdatedByDoctorId: record.lastUpdatedByDoctorId,
      }),
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Patient QR code', headerShown: true }} />
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Patient QR code', headerShown: true }} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!error && record && (
        <View style={styles.card}>
          <Text style={styles.heading}>Your patient QR code</Text>
          <Text style={styles.body}>
            This QR is generated entirely from local data, so it works without internet. It contains your account ID, local ID, ICD-10 codes, and the time and doctor from your last code update.
          </Text>
          <Text style={styles.detail}>ICD-10 codes stored on this device: {record.icd10Codes.length}</Text>
          <Text style={styles.detail}>
            Last updated: {record.lastUpdatedAt ? new Date(record.lastUpdatedAt).toLocaleString() : 'Not updated yet'}
          </Text>
          <Text style={styles.detail}>
            Updated by doctor: {record.lastUpdatedByDoctorId || 'Not recorded'}
          </Text>
          {qrValue ? (
            <View style={styles.qrBox}>
              <QRCode value={qrValue} size={240} />
              <Text style={styles.body}>
                Show this code to clinic staff. Receptionists will not see the ICD-10 codes.
              </Text>
            </View>
          ) : (
            <Pressable style={styles.button} onPress={generate} accessibilityRole="button">
              <Text style={styles.buttonText}>Generate my QR code</Text>
            </Pressable>
          )}
        </View>
      )}
    </ScrollView>
  );
}
