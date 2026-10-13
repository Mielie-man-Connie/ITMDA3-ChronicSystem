import { useState } from 'react';
import {
  KeyboardTypeOptions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { colors, space, type, TOUCH } from '../../constants/clinic-theme';
import { buildActivationPayload } from '../../utils/qrPayload';

// The doctor enters the patient's chronic conditions and medication, then generates an
// activation QR. The patient scans it and the data is written to THEIR phone only.
export default function PatientInfo() {
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    surname?: string;
    phone?: string;
    email?: string;
  }>();

  const [name, setName] = useState(params.name ?? '');
  const [surname, setSurname] = useState(params.surname ?? '');
  const [phone, setPhone] = useState(params.phone ?? '');
  const [email, setEmail] = useState(params.email ?? '');
  const [conditions, setConditions] = useState('');
  const [medications, setMedications] = useState('');
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const splitList = (text: string) =>
    text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const generate = () => {
    if (!name.trim() || !surname.trim()) {
      setError('Enter the patient’s name and surname first.');
      return;
    }
    if (splitList(conditions).length === 0) {
      setError('Enter at least one condition.');
      return;
    }
    setError(null);
    setQrValue(
      buildActivationPayload({
        patientId: params.id ?? 'NEW', // TODO: real Firestore user id
        doctorId: 'DOCTOR_ID', // TODO: signed-in doctor's uid
        clinicId: 'CLINIC_ID', // TODO: the doctor's clinic
        conditions: splitList(conditions),
        medications: splitList(medications),
      })
    );
    // TODO: save only non-sensitive fields (name, phone, email, doctor assignment)
    // to Firestore. Conditions and medication must NOT be saved there.
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: space.md }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: params.id ? 'Patient info' : 'New patient' }} />

      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Surname" value={surname} onChangeText={setSurname} />
      <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Text style={styles.note}>
        Medical details go onto the patient’s phone through the QR code. They are not saved on the
        server.
      </Text>
      <Field
        label="Conditions (separate with commas)"
        value={conditions}
        onChangeText={setConditions}
      />
      <Field
        label="Medication (separate with commas)"
        value={medications}
        onChangeText={setMedications}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={generate} accessibilityRole="button">
        <Text style={styles.buttonText}>Generate QR code</Text>
      </Pressable>

      {qrValue && (
        <View style={styles.qrBox}>
          <QRCode value={qrValue} size={240} />
          <Text style={[type.small, styles.qrNote]}>
            Ask the patient to scan this within 10 minutes.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  const { label, ...inputProps } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.muted} {...inputProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  note: { ...type.small, marginVertical: space.sm },
  field: { marginBottom: space.md },
  label: { ...type.small, marginBottom: space.xs },
  input: {
    minHeight: TOUCH,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: space.md,
    fontSize: 18,
    color: colors.ink,
  },
  error: { fontSize: 16, fontWeight: '600', color: colors.danger, marginBottom: space.sm },
  button: {
    minHeight: TOUCH,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 18, fontWeight: '600', color: colors.primaryText },
  qrBox: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    marginTop: space.lg,
    marginBottom: space.xl,
  },
  qrNote: { marginTop: space.md, textAlign: 'center' },
});
