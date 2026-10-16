import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/components/theme-provider';
import {
  getChronicIllnesses,
  getCurrentUserProfile,
  getUserById,
  setPatientAccountActivation,
} from '../../services/firebase';
import { buildIcd10UpdatePayload } from '../../utils/qrPayload';

type Illness = { id: string; code: string; name: string };
type PatientProfile = {
  id: string;
  name?: string;
  phoneNumber?: string;
  accountVerified?: boolean;
  accountStatus?: string;
};

function normalizeIcdCode(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeConditionName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function isAccountActive(profile: PatientProfile): boolean {
  return profile.accountVerified === true || profile.accountStatus === 'active';
}

function parseCodes(value?: string): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .filter((code): code is string => typeof code === 'string')
          .map((code) => code.trim().toUpperCase()),
      ),
    ].slice(0, 10);
  } catch {
    return [];
  }
}

function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 16, paddingBottom: 32 },
    card: {
      padding: 18,
      marginBottom: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.secondaryBorder,
      backgroundColor: theme.colors.backgroundElement,
    },
    title: {
      color: theme.colors.text,
      fontSize: theme.fontSizes.heading,
      fontWeight: '700',
      marginBottom: 12,
    },
    body: { color: theme.colors.textSecondary, fontSize: theme.fontSizes.body, marginTop: 6 },
    label: {
      color: theme.colors.text,
      fontSize: theme.fontSizes.body,
      fontWeight: '600',
      marginTop: 14,
      marginBottom: 6,
    },
    patientNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    patientName: {
      color: theme.colors.text,
      fontSize: theme.fontSizes.heading,
      fontWeight: '700',
      flexShrink: 1,
    },
    readonly: {
      minHeight: 48,
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: theme.colors.secondaryBorder,
      borderRadius: 10,
      backgroundColor: theme.colors.background,
      color: theme.colors.text,
      fontSize: theme.fontSizes.body,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      minHeight: 50,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: theme.colors.secondaryBorder,
      borderRadius: 10,
      backgroundColor: theme.colors.background,
      color: theme.colors.text,
      fontSize: theme.fontSizes.body,
    },
    searchRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    codeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.colors.secondaryBorder,
      borderRadius: 10,
      backgroundColor: theme.colors.background,
    },
    codeDescription: { flex: 1 },
    code: { color: theme.colors.primary, fontSize: theme.fontSizes.body, fontWeight: '700' },
    codeName: { color: theme.colors.text, fontSize: theme.fontSizes.body, marginTop: 2 },
    smallButton: {
      minHeight: 42,
      minWidth: 78,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: theme.colors.primary,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smallButtonText: { color: theme.colors.primary, fontSize: theme.fontSizes.small, fontWeight: '700' },
    removeButton: {
      minHeight: 42,
      minWidth: 42,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.error,
    },
    resultOption: {
      padding: 12,
      marginTop: 8,
      borderWidth: 1,
      borderColor: theme.colors.secondaryBorder,
      borderRadius: 10,
      backgroundColor: theme.colors.background,
    },
    button: {
      minHeight: 52,
      marginTop: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonSecondary: { backgroundColor: theme.colors.secondary },
    buttonText: { color: theme.colors.onPrimary, fontSize: theme.fontSizes.body, fontWeight: '700' },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      marginTop: 8,
    },
    error: { color: theme.colors.error, fontSize: theme.fontSizes.body, fontWeight: '600', marginTop: 12 },
    qrBox: {
      marginTop: 18,
      padding: 18,
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      backgroundColor: theme.colors.background,
    },
  });
}

export default function PatientDataModifierScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{
    patientId?: string;
    id?: string;
    appointmentId?: string;
    icd10Codes?: string;
    localId?: string;
    lastUpdatedAt?: string;
    lastUpdatedByDoctorId?: string;
  }>();
  const patientId = params.patientId || params.id;
  const localId = params.localId || `local-${patientId || 'patient'}`;
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [currentDoctorId, setCurrentDoctorId] = useState('');
  const [catalogue, setCatalogue] = useState<Illness[]>([]);
  const [codes, setCodes] = useState<string[]>(() => parseCodes(params.icd10Codes));
  const [codeSearch, setCodeSearch] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState<'code' | 'name' | null>(null);
  const [replaceCode, setReplaceCode] = useState<string | null>(null);
  const [qrValue, setQrValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingActivation, setSavingActivation] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        if (!patientId) throw new Error('The scanned QR code does not contain a patient ID.');
        const [profile, currentUser, illnesses] = await Promise.all([
          getUserById(patientId),
          getCurrentUserProfile(),
          getChronicIllnesses(),
        ]);
        if (currentUser.role !== 'd' && currentUser.role !== 'doctor') {
          throw new Error('Only a doctor can edit patient ICD-10 data or account activation.');
        }
        if (profile.role !== 'p' && profile.role !== 'patient') {
          throw new Error('The scanned account is not a patient account.');
        }
        if (active) {
          setPatient(profile as PatientProfile);
          setCurrentDoctorId(currentUser.id);
          setCatalogue(illnesses as Illness[]);
          setCodes(parseCodes(params.icd10Codes));
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [params.icd10Codes, patientId]);

  const matches = useMemo(() => {
    if (!activeSearch) return [];
    const term = activeSearch === 'code' ? codeSearch.trim() : nameSearch.trim();
    if (!term) return [];

    const normalizedTerm =
      activeSearch === 'code' ? normalizeIcdCode(term) : normalizeConditionName(term);
    if (!normalizedTerm) return [];

    return catalogue
      .map((illness) => {
        const value =
          activeSearch === 'code'
            ? normalizeIcdCode(illness.code)
            : normalizeConditionName(illness.name);
        const rank =
          value === normalizedTerm
            ? 0
            : value.startsWith(normalizedTerm)
              ? 1
              : value.includes(normalizedTerm)
                ? 2
                : -1;
        return { illness, rank };
      })
      .filter(({ rank }) => rank >= 0)
      .sort(
        (left, right) =>
          left.rank - right.rank || left.illness.code.localeCompare(right.illness.code),
      )
      .slice(0, 12)
      .map(({ illness }) => illness);
  }, [activeSearch, catalogue, codeSearch, nameSearch]);

  const handleCodeSearch = (value: string) => {
    setActiveSearch('code');
    setCodeSearch(value);
    const normalized = normalizeIcdCode(value);
    const exactMatch = catalogue.find(
      (illness) => normalizeIcdCode(illness.code) === normalized,
    );
    setNameSearch(exactMatch?.name || '');
  };

  const handleNameSearch = (value: string) => {
    setActiveSearch('name');
    setNameSearch(value);
    const normalized = normalizeConditionName(value);
    const exactMatch = catalogue.find(
      (illness) => normalizeConditionName(illness.name) === normalized,
    );
    setCodeSearch(exactMatch?.code || '');
  };
  const active = patient ? isAccountActive(patient) : false;

  const updateActivation = async (nextActive: boolean) => {
    if (!patient) return;
    setSavingActivation(true);
    setError('');
    try {
      await setPatientAccountActivation(patient.id, nextActive);
      setPatient((current) =>
        current
          ? { ...current, accountVerified: nextActive, accountStatus: nextActive ? 'active' : 'inactive' }
          : current,
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSavingActivation(false);
    }
  };

  const applyIllness = (illness: Illness) => {
    if (replaceCode) {
      setCodes((current) =>
        [...new Set(current.map((code) => (code === replaceCode ? illness.code : code)))].slice(0, 10),
      );
      setReplaceCode(null);
    } else if (!codes.includes(illness.code) && codes.length < 10) {
      setCodes((current) => [...current, illness.code]);
    }
    setQrValue('');
    setCodeSearch('');
    setNameSearch('');
    setActiveSearch(null);
  };

  const generateUpdateQr = () => {
    if (!patient) return;
    if (!currentDoctorId) {
      setError('Could not identify the signed-in doctor. Please reload the patient record.');
      return;
    }
    if (codes.length > 10) {
      setError('A maximum of 10 ICD-10 codes can be sent to the patient.');
      return;
    }
    setError('');
    setQrValue(
      buildIcd10UpdatePayload({
        patientId: patient.id,
        localId,
        icd10Codes: codes,
        lastUpdatedAt: new Date().toISOString(),
        lastUpdatedByDoctorId: currentDoctorId,
      }),
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Patient data', headerShown: true }} />
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!patient) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Patient data', headerShown: true }} />
        <Text style={styles.error}>{error || 'Could not load patient details.'}</Text>
      </View>
    );
  }

  const displayedName = patient.name || 'Patient';
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Patient data', headerShown: true }} />
      <View style={styles.card}>
        <View style={styles.patientNameRow}>
          <Text style={styles.patientName}>{displayedName}</Text>
          {active && (
            <Ionicons
              name="warning"
              size={24}
              color={theme.colors.warning}
              accessibilityLabel="Account is activated"
            />
          )}
        </View>
        <Text style={styles.label}>Patient name</Text>
        <TextInput value={displayedName} editable={false} style={styles.readonly} />
        <Text style={styles.label}>Phone number</Text>
        <TextInput value={patient.phoneNumber || 'Not provided'} editable={false} style={styles.readonly} />
        <Text style={styles.body}>
          Previous code update: {params.lastUpdatedAt && !Number.isNaN(Date.parse(params.lastUpdatedAt))
            ? new Date(params.lastUpdatedAt).toLocaleString()
            : 'Not recorded'}
        </Text>
        <Text style={styles.body}>
          Previous updating doctor: {params.lastUpdatedByDoctorId || 'Not recorded'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Account activation</Text>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.body}>
              {active ? 'Patient account is active' : 'Patient account is not active'}
            </Text>
            {active && <Text style={styles.body}>The warning icon indicates an activated account.</Text>}
          </View>
          <Switch
            value={active}
            onValueChange={(value) => void updateActivation(value)}
            disabled={savingActivation}
            trackColor={{ false: theme.colors.muted, true: theme.colors.secondary }}
            thumbColor={theme.colors.white}
            accessibilityLabel="Activate patient account"
          />
        </View>
        {savingActivation && <ActivityIndicator color={theme.colors.primary} />}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>ICD-10 conditions ({codes.length}/10)</Text>
        <Text style={styles.body}>
          Changes are encoded in a temporary QR for the patient to scan. Medical codes are not written to Firestore.
        </Text>
        {codes.map((code) => {
          const illness = catalogue.find((item) => item.code === code);
          return (
            <View key={code} style={styles.codeRow}>
              <View style={styles.codeDescription}>
                <Text style={styles.code}>{code}</Text>
                <Text style={styles.codeName}>{illness?.name || 'Condition name not found in catalogue'}</Text>
              </View>
              <Pressable
                style={styles.smallButton}
                onPress={() => {
                  setReplaceCode(code);
                  handleCodeSearch(code);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.smallButtonText}>Modify</Text>
              </Pressable>
              <Pressable
                style={styles.removeButton}
                onPress={() => {
                  setCodes((current) => current.filter((item) => item !== code));
                  setQrValue('');
                }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${code}`}
              >
                <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          );
        })}
        {codes.length === 0 && <Text style={styles.body}>No ICD-10 conditions are currently listed.</Text>}
        <Text style={styles.label}>{replaceCode ? `Replace ${replaceCode}` : 'Add a chronic illness'}</Text>
        <View style={styles.searchRow}>
          <TextInput
            value={codeSearch}
            onChangeText={handleCodeSearch}
            placeholder="ICD-10 code"
            placeholderTextColor={theme.colors.muted}
            accessibilityLabel="Search ICD-10 code"
            style={styles.searchInput}
            autoCapitalize="characters"
          />
          <TextInput
            value={nameSearch}
            onChangeText={handleNameSearch}
            placeholder="Condition name"
            placeholderTextColor={theme.colors.muted}
            accessibilityLabel="Search condition name"
            style={styles.searchInput}
          />
        </View>
        {matches.map((illness) => (
          <Pressable
            key={illness.id}
            style={styles.resultOption}
            onPress={() => applyIllness(illness)}
            accessibilityRole="button"
          >
            <Text style={styles.code}>{illness.code}</Text>
            <Text style={styles.codeName}>{illness.name}</Text>
          </Pressable>
        ))}
        {(codeSearch.trim().length >= 2 || nameSearch.trim().length >= 2) && matches.length === 0 && (
          <Text style={styles.body}>No matching ICD-10 conditions were found.</Text>
        )}
        {!replaceCode && codes.length < 10 && (
          <Pressable
            style={[styles.button, styles.buttonSecondary]}
            onPress={() => {
              setCodeSearch('');
              setNameSearch('');
              setActiveSearch(null);
              setReplaceCode(null);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Add another code</Text>
          </Pressable>
        )}
        {codes.length >= 10 && <Text style={styles.body}>You have reached the 10-code limit.</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={styles.button} onPress={generateUpdateQr} accessibilityRole="button">
          <Text style={styles.buttonText}>Generate patient update QR</Text>
        </Pressable>
        {qrValue ? (
          <View style={styles.qrBox}>
            <QRCode value={qrValue} size={240} />
            <Text style={styles.body}>The patient must scan this code to overwrite the ICD-10 list on their device.</Text>
          </View>
        ) : null}
      </View>
      {!!params.appointmentId && <Text style={styles.body}>Appointment: {params.appointmentId}</Text>}
    </ScrollView>
  );
}