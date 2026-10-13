import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors, space, type, TOUCH } from '../../constants/clinic-theme';

type Patient = { id: string; name: string; surname: string; phone: string; email: string };

// Mock data for now. Later: query Firestore for patients assigned to this doctor.
// There is deliberately no condition field: chronic data stays on the patient's phone.
const MOCK_PATIENTS: Patient[] = [
  { id: 'p1', name: 'Thandi', surname: 'Mokoena', phone: '+27 82 000 0001', email: 'thandi@example.com' },
  { id: 'p2', name: 'Sipho', surname: 'Dlamini', phone: '+27 82 000 0002', email: 'sipho@example.com' },
  { id: 'p3', name: 'Maria', surname: 'Khumalo', phone: '+27 82 000 0003', email: 'maria@example.com' },
];

export default function DoctorHome() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>(MOCK_PATIENTS);

  const openPatient = (p?: Patient) =>
    router.push({
      pathname: '/doctor/patient-info',
      params: p ? { id: p.id, name: p.name, surname: p.surname, phone: p.phone, email: p.email } : {},
    });

  const confirmDelete = (p: Patient) => {
    Alert.alert('Remove patient?', `${p.name} ${p.surname} will be removed from your list.`, [
      { text: 'Keep patient', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setPatients((list) => list.filter((x) => x.id !== p.id)),
        // TODO: also unassign / delete in Firestore
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Your patients' }} />

      <FlatList
        data={patients}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: space.md }}
        ListEmptyComponent={
          <Text style={[type.body, styles.empty]}>
            No patients yet. Tap “Add patient” to create the first one.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable
              style={styles.rowMain}
              onPress={() => openPatient(item)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.name} ${item.surname}`}
            >
              <Text style={styles.name}>
                {item.name} {item.surname}
              </Text>
              <Text style={type.small}>{item.phone}</Text>
            </Pressable>

            <Pressable
              style={[styles.smallButton, { borderColor: colors.primary }]}
              onPress={() => openPatient(item)}
              accessibilityRole="button"
            >
              <Text style={[styles.smallText, { color: colors.primary }]}>Edit</Text>
            </Pressable>

            <Pressable
              style={[styles.smallButton, { borderColor: colors.danger }]}
              onPress={() => confirmDelete(item)}
              accessibilityRole="button"
            >
              <Text style={[styles.smallText, { color: colors.danger }]}>Delete</Text>
            </Pressable>
          </View>
        )}
      />

      <Pressable style={styles.addButton} onPress={() => openPatient()} accessibilityRole="button">
        <Text style={styles.addText}>Add patient</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: space.md },
  empty: { textAlign: 'center', marginTop: space.xl },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: space.sm,
    marginBottom: space.sm,
  },
  rowMain: { flex: 1, minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: space.sm },
  name: { ...type.heading },

  smallButton: {
    minHeight: 48,
    minWidth: 68,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: space.sm,
    paddingHorizontal: space.sm,
  },
  smallText: { fontSize: 16, fontWeight: '600' },

  addButton: {
    minHeight: TOUCH,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { fontSize: 18, fontWeight: '600', color: colors.primaryText },
});
