import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/components/theme-provider';
import {
  getCurrentUserProfile,
  getPatientAppointments,
  getUserById,
  updateAppointment,
} from '../../services/firebase';
import { saveLocalIcd10Record } from '../../services/cache';
import { parseQrPayload, type PatientQrPayload, type QrType } from '../../utils/qrPayload';

type Role = 'patient' | 'doctor' | 'receptionist' | 'admin';
type PatientProfile = Record<string, unknown> & {
  id: string;
  name?: string;
  phoneNumber?: string;
  idNumber?: string;
  homeAddress?: string;
  email?: string;
  role?: string;
  accountVerified?: boolean;
  accountStatus?: string;
};
type AppointmentRecord = {
  id: string;
  appointmentDate?: string | Date | { toDate: () => Date };
  status?: string;
  doctorId?: string;
  timeSlot?: string;
};
type ScanNotice = { kind: 'success' | 'error'; message: string };

function normalizeRole(value?: string): Role | null {
  if (value === 'p' || value === 'patient') return 'patient';
  if (value === 'd' || value === 'doctor') return 'doctor';
  if (value === 'r' || value === 'receptionist') return 'receptionist';
  if (value === 'a' || value === 'admin') return 'admin';
  return null;
}

function isAccountActive(profile: PatientProfile): boolean {
  return profile.accountVerified === true || profile.accountStatus === 'active';
}

function getAppointmentDate(value: AppointmentRecord['appointmentDate']): Date | null {
  if (!value) return null;
  const date =
    value instanceof Date
      ? value
      : typeof value === 'object'
        ? value.toDate()
        : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function displayValue(value: unknown): string {
  if (value instanceof Date) return value.toLocaleString();
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toLocaleString();
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(displayValue).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return '';
}

function isSensitiveHealthField(key: string): boolean {
  return /icd|condition|illness|diagnos|medicat|chronic|health|code/i.test(key);
}

function sanitizeProfileValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeProfileValue);
  if (value && typeof value === 'object' && !(value instanceof Date) && !('toDate' in value)) {
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => !isSensitiveHealthField(key))
        .map(([key, nestedValue]) => [key, sanitizeProfileValue(nestedValue)]),
    );
  }
  return value;
}

function formatUpdateTime(value: string): string {
  return value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleString()
    : 'Not recorded';
}

function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000000' },
    center: {
      flex: 1,
      backgroundColor: theme.colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    title: {
      color: theme.colors.text,
      fontSize: theme.fontSizes.heading,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 10,
    },
    body: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSizes.body,
      textAlign: 'center',
      marginBottom: 16,
    },
    button: {
      minHeight: 50,
      minWidth: 210,
      borderRadius: 12,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      marginTop: 10,
    },
    buttonAlt: { backgroundColor: theme.colors.success },
    buttonText: { fontSize: theme.fontSizes.body, fontWeight: '700', color: theme.colors.onPrimary },
    top: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      padding: 24,
      paddingTop: 56,
      backgroundColor: 'rgba(0,0,0,0.65)',
    },
    topTitle: { fontSize: theme.fontSizes.heading, fontWeight: '700', color: '#FFFFFF' },
    topHint: { fontSize: theme.fontSizes.body, color: '#E6EDF1', marginTop: 8 },
    frame: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      width: 260,
      height: 260,
      marginLeft: -130,
      marginTop: -130,
      borderWidth: 4,
      borderColor: '#FFFFFF',
      borderRadius: 20,
    },
    panel: {
      position: 'absolute',
      left: 14,
      right: 14,
      bottom: 88,
      maxHeight: '62%',
      padding: 16,
      borderRadius: 14,
      backgroundColor: theme.colors.backgroundElement,
      borderWidth: 1,
      borderColor: theme.colors.secondaryBorder,
    },
    panelTitle: {
      color: theme.colors.text,
      fontSize: theme.fontSizes.heading,
      fontWeight: '700',
      textAlign: 'center',
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    warning: { color: theme.colors.warning },
    detail: { color: theme.colors.text, fontSize: theme.fontSizes.body, marginTop: 8 },
    detailLabel: { color: theme.colors.textSecondary, fontWeight: '700' },
    banner: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 100,
      padding: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    bannerError: { backgroundColor: theme.colors.error },
    bannerSuccess: { backgroundColor: theme.colors.success },
    bannerText: { color: '#FFFFFF', fontSize: theme.fontSizes.body, fontWeight: '600', textAlign: 'center' },
    cancel: {
      position: 'absolute',
      bottom: 20,
      alignSelf: 'center',
      minHeight: 48,
      minWidth: 170,
      borderRadius: 12,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: { fontSize: theme.fontSizes.body, fontWeight: '600', color: '#0D1B2A' },
  });
}

export default function QrScannerScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [permission, requestPermission] = useCameraPermissions();
  const [role, setRole] = useState<Role | null>(null);
  const [userId, setUserId] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [notice, setNotice] = useState<ScanNotice | null>(null);
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [payload, setPayload] = useState<PatientQrPayload | null>(null);
  const [appointment, setAppointment] = useState<AppointmentRecord | null>(null);
  const [lastDoctorName, setLastDoctorName] = useState('');
  const [lastDoctorLookupError, setLastDoctorLookupError] = useState('');
  const [receptionistStatusMessage, setReceptionistStatusMessage] = useState('');
  const [appointmentLookupMessage, setAppointmentLookupMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  useEffect(() => {
    let active = true;
    getCurrentUserProfile()
      .then((profile) => {
        if (!active) return;
        const currentRole = normalizeRole(profile.role);
        if (!currentRole) {
          setProfileError('This account does not have a supported QR scanner role.');
          return;
        }
        setRole(currentRole);
        setUserId(profile.id);
      })
      .catch((error: unknown) => {
        if (active) setProfileError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setLoadingProfile(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const title =
    role === 'patient'
      ? 'Scan ICD-10 update'
      : role === 'doctor'
        ? 'Scan patient QR code'
        : 'Scan patient QR code';
  const hint =
    role === 'patient'
      ? 'Scan the update QR provided by your doctor to replace the codes stored on this device.'
      : 'Scan the patient’s QR code to look up their profile.';

  const openModifier = (patientQr: PatientQrPayload, appointmentId?: string) => {
    const query =
      `?patientId=${encodeURIComponent(patientQr.patientId)}` +
      `&localId=${encodeURIComponent(patientQr.localId)}` +
      `&icd10Codes=${encodeURIComponent(JSON.stringify(patientQr.icd10Codes))}` +
      `&lastUpdatedAt=${encodeURIComponent(patientQr.lastUpdatedAt)}` +
      `&lastUpdatedByDoctorId=${encodeURIComponent(patientQr.lastUpdatedByDoctorId)}` +
      (appointmentId ? `&appointmentId=${encodeURIComponent(appointmentId)}` : '');
    router.push(`/patient-data-modifier${query}` as Href);
  };

  const loadProfileAndAppointment = async (
    patientQr: PatientQrPayload,
    currentRole: Role,
    currentUserId: string,
  ) => {
    const profile = (await getUserById(patientQr.patientId)) as PatientProfile;
    if (profile.role !== 'p' && profile.role !== 'patient') {
      throw new Error('This QR code does not belong to a patient account.');
    }

    let records: AppointmentRecord[] = [];
    let appointmentLookupMessage = '';
    try {
      records = (await getPatientAppointments(patientQr.patientId)) as AppointmentRecord[];
    } catch (error) {
      appointmentLookupMessage = `Appointments could not be checked: ${error instanceof Error ? error.message : String(error)}`;
    }
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const activeRecords = records
      .filter((item) => {
        const date = getAppointmentDate(item.appointmentDate);
        return (
          date &&
          date >= todayStart &&
          ['booked', 'confirmed', 'checked-in', 'in-progress'].includes(item.status || '') &&
          (currentRole !== 'doctor' || item.doctorId === currentUserId)
        );
      })
      .sort((left, right) => {
        const leftTime = getAppointmentDate(left.appointmentDate)?.getTime() ?? Infinity;
        const rightTime = getAppointmentDate(right.appointmentDate)?.getTime() ?? Infinity;
        return leftTime - rightTime;
      });

    const todaysAppointments = activeRecords.filter(
      (item) => getAppointmentDate(item.appointmentDate)?.toDateString() === new Date().toDateString(),
    );

    let checkInMessage =
      appointmentLookupMessage || 'No booked or confirmed appointment was available to check in today.';
    if (currentRole === 'receptionist') {
      const todaysAppointment = todaysAppointments.find((item) =>
        ['booked', 'confirmed'].includes(item.status || ''),
      );
      if (todaysAppointment) {
        try {
          await updateAppointment(todaysAppointment.id, {
            status: 'checked-in',
            checkInTime: new Date().toISOString(),
          });
          checkInMessage = 'Today’s appointment was checked in.';
        } catch (error) {
          checkInMessage = `Patient profile loaded, but check-in failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    }

    return {
      profile,
      appointment: currentRole === 'doctor' ? todaysAppointments[0] ?? null : null,
      checkInMessage,
      appointmentLookupMessage,
    };
  };

  const onScanned = useCallback(
    async ({ data: raw }: { data: string }) => {
      if (locked.current || busy || !role) return;
      locked.current = true;
      setBusy(true);
      setNotice(null);
      setPatient(null);
      setPayload(null);
      setAppointment(null);
      setLastDoctorName('');
      setLastDoctorLookupError('');
      setReceptionistStatusMessage('');
      setAppointmentLookupMessage('');

      const expectedType: QrType = role === 'patient' ? 'icd10-update' : 'patient-record';
      const parsed = parseQrPayload(raw, expectedType);
      if (!parsed.ok) {
        setNotice({ kind: 'error', message: parsed.message });
        setBusy(false);
        return;
      }

      try {
        if (parsed.data.type === 'icd10-update') {
          if (role !== 'patient' || parsed.data.patientId !== userId) {
            throw new Error('This ICD-10 update is for a different patient account.');
          }
          await saveLocalIcd10Record(userId, {
            localId: parsed.data.localId,
            icd10Codes: parsed.data.icd10Codes,
            lastUpdatedAt: parsed.data.lastUpdatedAt,
            lastUpdatedByDoctorId: parsed.data.lastUpdatedByDoctorId,
          });
          setNotice({
            kind: 'success',
            message: `${parsed.data.icd10Codes.length} ICD-10 code${parsed.data.icd10Codes.length === 1 ? '' : 's'} saved on this device.`,
          });
          return;
        }

        if (role !== 'doctor' && role !== 'receptionist' && role !== 'admin') {
          throw new Error('Only clinic staff can scan a patient QR code.');
        }
        const {
          profile,
          appointment: nextAppointment,
          checkInMessage,
          appointmentLookupMessage: appointmentMessage,
        } = await loadProfileAndAppointment(parsed.data, role, userId);
        setPatient(profile);
        setPayload(parsed.data);
        setAppointment(role === 'doctor' ? nextAppointment : null);
        setReceptionistStatusMessage(checkInMessage);
        setAppointmentLookupMessage(appointmentMessage);
        if (parsed.data.lastUpdatedByDoctorId) {
          try {
            const doctor = await getUserById(parsed.data.lastUpdatedByDoctorId);
            setLastDoctorName(doctor.name || '');
          } catch (error) {
            setLastDoctorName('');
            setLastDoctorLookupError(
              error instanceof Error ? error.message : 'Could not look up the last updating doctor.',
            );
          }
        }
        if (role === 'receptionist') {
          setNotice({
            kind:
              checkInMessage.includes('failed') || checkInMessage.includes('could not be checked')
                ? 'error'
                : 'success',
            message: `Patient profile loaded. ${checkInMessage}`,
          });
        }
      } catch (error) {
        setNotice({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, role, userId],
  );

  const setDoctorAppointmentStatus = async (status: 'in-progress' | 'completed') => {
    if (!appointment || !payload) {
      setNotice({ kind: 'error', message: 'There is no appointment to update.' });
      return;
    }
    if (appointment.doctorId !== userId) {
      setNotice({ kind: 'error', message: 'You can only update your own assigned appointments.' });
      return;
    }
    if (getAppointmentDate(appointment.appointmentDate)?.toDateString() !== new Date().toDateString()) {
      setNotice({ kind: 'error', message: 'Only an appointment scheduled for today can be updated here.' });
      setAppointment(null);
      return;
    }
    setBusy(true);
    try {
      await updateAppointment(appointment.id, { status });
      openModifier(payload, appointment.id);
    } catch (error) {
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      setBusy(false);
    }
  };

  const scanAgain = () => {
    locked.current = false;
    setNotice(null);
    setPatient(null);
    setPayload(null);
    setAppointment(null);
    setLastDoctorName('');
    setLastDoctorLookupError('');
    setReceptionistStatusMessage('');
    setAppointmentLookupMessage('');
  };

  if (loadingProfile || !permission) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'QR scanner' }} />
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (profileError) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'QR scanner' }} />
        <Text style={styles.title}>Scanner unavailable</Text>
        <Text style={styles.body}>{profileError}</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.body}>The camera is used to read clinic QR codes.</Text>
        <Pressable
          style={styles.button}
          onPress={permission.canAskAgain ? requestPermission : () => Linking.openSettings()}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>
            {permission.canAskAgain ? 'Allow camera' : 'Open phone settings'}
          </Text>
        </Pressable>
      </View>
    );
  }

  const scannerPaused = busy || Boolean(notice) || Boolean(patient);
  const profileRows = patient
      ? Object.entries(patient)
          .filter(([key, value]) =>
            key !== 'name' &&
            key !== 'phoneNumber' &&
            key !== 'email' &&
            key !== 'id' &&
            key !== 'idNumber' &&
            key !== 'homeAddress' &&
            !isSensitiveHealthField(key) &&
            value !== undefined &&
            value !== null &&
            displayValue(sanitizeProfileValue(value)) !== '',
          )
          .map(([key, value]) => [key, sanitizeProfileValue(value)] as const)
      : [];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scannerPaused ? undefined : onScanned}
      />
      <View style={styles.top}>
        <Text style={styles.topTitle}>{title}</Text>
        <Text style={styles.topHint}>{hint}</Text>
      </View>
      <View style={styles.frame} pointerEvents="none" />

      {busy && (
        <View style={[styles.banner, styles.bannerSuccess]}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}

      {patient && payload && role === 'receptionist' && (
        <View style={styles.panel}>
          <ScrollView>
            <View style={styles.nameRow}>
              <Text style={styles.panelTitle}>{patient.name || 'Patient'}</Text>
              {isAccountActive(patient) && (
                <Ionicons
                  name="warning"
                  size={23}
                  color={theme.colors.warning}
                  accessibilityLabel="Account is activated"
                />
              )}
            </View>
            <Text style={styles.detail}><Text style={styles.detailLabel}>User ID: </Text>{patient.id}</Text>
            <Text style={styles.detail}><Text style={styles.detailLabel}>Local ID: </Text>{payload.localId}</Text>
            <Text style={styles.detail}><Text style={styles.detailLabel}>Phone: </Text>{patient.phoneNumber || 'Not provided'}</Text>
            <Text style={styles.detail}><Text style={styles.detailLabel}>ID number: </Text>{patient.idNumber || 'Not provided'}</Text>
            <Text style={styles.detail}><Text style={styles.detailLabel}>Home address: </Text>{patient.homeAddress || 'Not provided'}</Text>
            <Text style={styles.detail}><Text style={styles.detailLabel}>Email: </Text>{patient.email || 'Not provided'}</Text>
            <Text style={styles.detail}>
              <Text style={styles.detailLabel}>Last ICD-10 update: </Text>
              {formatUpdateTime(payload.lastUpdatedAt)}
            </Text>
            <Text style={styles.detail}>
              <Text style={styles.detailLabel}>Updated by doctor: </Text>
              {lastDoctorName || payload.lastUpdatedByDoctorId || 'Not recorded'}
            </Text>
            {!!lastDoctorLookupError && (
              <Text style={styles.detail}>
                <Text style={styles.detailLabel}>Doctor name lookup issue: </Text>
                {lastDoctorLookupError}
              </Text>
            )}
            <Text style={styles.detail}>
              <Text style={styles.detailLabel}>Check-in: </Text>
              {receptionistStatusMessage}
            </Text>
            {profileRows.map(([key, value]) => (
              <Text key={key} style={styles.detail}>
                <Text style={styles.detailLabel}>{key}: </Text>{displayValue(value)}
              </Text>
            ))}
            <Text style={styles.body}>ICD-10 and other health details are hidden from reception staff.</Text>
            <Pressable style={styles.button} onPress={scanAgain} accessibilityRole="button">
              <Text style={styles.buttonText}>Scan next patient</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}

      {patient && payload && (role === 'doctor' || role === 'admin') && (
        <View style={styles.panel}>
          <View style={styles.nameRow}>
            <Text style={styles.panelTitle}>{patient.name || 'Patient'}</Text>
            {isAccountActive(patient) && (
              <Ionicons
                name="warning"
                size={23}
                color={theme.colors.warning}
                accessibilityLabel="Account is activated"
              />
            )}
          </View>
          <Text style={styles.detail}>Phone: {patient.phoneNumber || 'Not provided'}</Text>
          <Text style={styles.detail}>ID number: {patient.idNumber || 'Not provided'}</Text>
          <Text style={styles.detail}>Home address: {patient.homeAddress || 'Not provided'}</Text>
          <Text style={styles.detail}>
            Last code update: {formatUpdateTime(payload.lastUpdatedAt)}
          </Text>
          <Text style={styles.detail}>
            Last updated by: {lastDoctorName || payload.lastUpdatedByDoctorId || 'Not recorded'}
          </Text>
          {appointmentLookupMessage ? (
            <Text style={styles.detail}>Appointment lookup issue: {appointmentLookupMessage}</Text>
          ) : null}
          {!!lastDoctorLookupError && (
            <Text style={styles.detail}>Doctor name lookup issue: {lastDoctorLookupError}</Text>
          )}
          {role === 'doctor' && appointment ? (
            <>
              <Text style={styles.detail}>
                Appointment: {appointment.status || 'unknown'} · {getAppointmentDate(appointment.appointmentDate)?.toLocaleString() || 'date unavailable'}
              </Text>
              <Pressable
                style={styles.button}
                onPress={() => void setDoctorAppointmentStatus('in-progress')}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>Mark appointment in progress</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.buttonAlt]}
                onPress={() => void setDoctorAppointmentStatus('completed')}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>Mark appointment completed</Text>
              </Pressable>
            </>
          ) : role === 'doctor' ? (
            <Text style={styles.body}>No current appointment was found. You can still update the patient’s ICD-10 data.</Text>
          ) : null}
          <Pressable
            style={styles.button}
            onPress={() => openModifier(payload, appointment?.id)}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Open patient data</Text>
          </Pressable>
        </View>
      )}

      {notice && !patient && (
        <View style={[styles.banner, notice.kind === 'error' ? styles.bannerError : styles.bannerSuccess]}>
          <Text style={styles.bannerText}>{notice.message}</Text>
          <Pressable style={styles.button} onPress={scanAgain} accessibilityRole="button">
            <Text style={styles.buttonText}>{notice.kind === 'error' ? 'Scan again' : 'Done'}</Text>
          </Pressable>
        </View>
      )}

      <Pressable style={styles.cancel} onPress={() => router.back()} accessibilityRole="button">
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}
