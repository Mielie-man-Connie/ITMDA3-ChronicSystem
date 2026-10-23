import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/components/theme-provider';
import { getClinics } from '../../services/firebase';

type Clinic = {
  id: string;
  name?: string;
  address?: string;
  province?: string;
  dailySlotCapacity?: number;
  numbers?: string[];
};

export default function EmergencyScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [selectedProvince, setSelectedProvince] = useState('');
  const [selectedClinicId, setSelectedClinicId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [callError, setCallError] = useState('');

  useEffect(() => {
    let active = true;
    getClinics()
      .then((records) => {
        if (!active) return;
        const availableClinics = records as Clinic[];
        setClinics(availableClinics);
        setSelectedProvince(availableClinics.find((clinic) => clinic.province)?.province || '');
        setLoadError('');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const provinces = [...new Set(
    clinics.map((clinic) => clinic.province?.trim()).filter((province): province is string => Boolean(province)),
  )].sort((left, right) => left.localeCompare(right));
  const provinceClinics = clinics
    .filter((clinic) => clinic.province?.trim() === selectedProvince)
    .sort((left, right) => (left.name || '').localeCompare(right.name || ''));
  const selectedClinic = provinceClinics.find((clinic) => clinic.id === selectedClinicId) || null;

  const chooseProvince = (province: string) => {
    setSelectedProvince(province);
    setSelectedClinicId('');
    setCallError('');
  };

  const callClinic = async (number: string) => {
    setCallError('');
    try {
      await Linking.openURL(`tel:${number.trim()}`);
    } catch (error) {
      setCallError(error instanceof Error ? error.message : 'Could not open the phone app.');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <Stack.Screen options={{ title: 'Clinic contacts', headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Clinic contacts</Text>
            <Text style={styles.subtitle}>Choose a province and clinic to view its details.</Text>
          </View>
          <Pressable
            onPress={() => router.push('/')}
            accessibilityRole="button"
            accessibilityLabel="Home"
            style={styles.homeButton}
          >
            <Ionicons name="home-outline" size={22} color={theme.colors.text} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.state}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.body}>Loading clinics...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.card}>
            <Text style={styles.error}>Could not load clinic details: {loadError}</Text>
          </View>
        ) : clinics.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.body}>No clinics are available.</Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Province</Text>
              <View style={styles.options}>
                {provinces.map((province) => (
                  <Pressable
                    key={province}
                    onPress={() => chooseProvince(province)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedProvince === province }}
                    style={[styles.option, selectedProvince === province && styles.optionSelected]}
                  >
                    <Text style={[styles.optionText, selectedProvince === province && styles.optionTextSelected]}>
                      {province}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {selectedProvince ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Clinic</Text>
                {provinceClinics.length ? (
                  <View style={styles.options}>
                    {provinceClinics.map((clinic) => (
                      <Pressable
                        key={clinic.id}
                        onPress={() => {
                          setSelectedClinicId(clinic.id);
                          setCallError('');
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: selectedClinicId === clinic.id }}
                        style={[styles.option, selectedClinicId === clinic.id && styles.optionSelected]}
                      >
                        <Text style={[styles.optionText, selectedClinicId === clinic.id && styles.optionTextSelected]}>
                          {clinic.name || 'Unnamed clinic'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.body}>No clinics are listed for this province.</Text>
                )}
              </View>
            ) : null}

            {selectedClinic ? (
              <View style={styles.card}>
                <Text style={styles.clinicTitle}>{selectedClinic.name || 'Clinic'}</Text>
                <Text style={styles.detailLabel}>Location</Text>
                <Text style={styles.body}>{selectedClinic.address || 'Not provided'}</Text>
                <Text style={styles.detailLabel}>Province</Text>
                <Text style={styles.body}>{selectedClinic.province || 'Not provided'}</Text>
                <Text style={styles.detailLabel}>Daily slots</Text>
                <Text style={styles.body}>
                  {Number.isFinite(Number(selectedClinic.dailySlotCapacity))
                    ? selectedClinic.dailySlotCapacity
                    : 'Not provided'}
                </Text>
                <Text style={styles.detailLabel}>Phone number</Text>
                {selectedClinic.numbers?.length ? (
                  selectedClinic.numbers.map((number, index) => (
                    <Pressable
                      key={`${number}-${index}`}
                      onPress={() => void callClinic(number)}
                      accessibilityRole="link"
                      accessibilityLabel={`Call clinic at ${number}`}
                      style={styles.phoneButton}
                    >
                      <Ionicons name="call-outline" size={19} color={theme.colors.primary} />
                      <Text style={styles.phoneText}>{number}</Text>
                    </Pressable>
                  ))
                ) : (
                  <Text style={styles.body}>No phone number listed.</Text>
                )}
                {callError ? <Text style={styles.error}>{callError}</Text> : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, paddingTop: 8, paddingBottom: 40 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    headerText: { flex: 1 },
    title: { color: theme.colors.text, fontSize: theme.fontSizes.heading, fontWeight: '800' },
    subtitle: { color: theme.colors.textSecondary, fontSize: theme.fontSizes.body, marginTop: 4 },
    homeButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.backgroundElement,
    },
    card: {
      padding: 18,
      marginBottom: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.secondaryBorder,
      backgroundColor: theme.colors.backgroundElement,
    },
    sectionTitle: { color: theme.colors.text, fontSize: theme.fontSizes.subheading, fontWeight: '700', marginBottom: 10 },
    clinicTitle: { color: theme.colors.text, fontSize: theme.fontSizes.heading, fontWeight: '800', marginBottom: 8 },
    options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    option: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: theme.colors.secondaryBorder,
      borderRadius: 18,
      backgroundColor: theme.colors.background,
    },
    optionSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.backgroundSelected },
    optionText: { color: theme.colors.text, fontSize: theme.fontSizes.body, fontWeight: '600' },
    optionTextSelected: { color: theme.colors.primary, fontWeight: '700' },
    detailLabel: { color: theme.colors.text, fontSize: theme.fontSizes.small, fontWeight: '700', marginTop: 12 },
    body: { color: theme.colors.textSecondary, fontSize: theme.fontSizes.body, marginTop: 4 },
    phoneButton: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 8 },
    phoneText: { color: theme.colors.primary, fontSize: theme.fontSizes.body, fontWeight: '700', textDecorationLine: 'underline' },
    state: { padding: 24, alignItems: 'center', gap: 8 },
    error: { color: theme.colors.error, fontSize: theme.fontSizes.body },
  });
}
