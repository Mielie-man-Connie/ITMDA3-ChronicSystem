// HomeScreen.js
// ─────────────────────────────────────────────────────────────────────────────
// Home screen — shows different content depending on the signed-in user's role.
//
// HOW DATA LOADING WORKS:
//   1. getCurrentUserProfile() fetches the signed-in user's Firestore document
//   2. Based on their role, the relevant Firebase functions are called
//   3. Loading and error states are shown while data is fetching
//
// ROLE CODES (from firebase.js):
//   'p' = patient
//   'd' = doctor
//   'r' = receptionist
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// Firebase service functions — never call Firebase directly from this file
import {
  getAllAppointments,
  getClinicPatients,
  getCurrentUserProfile,
  getPatientAppointments,
} from '../../services/firebase';

// This is the hotbar component
import BottomHotbar from '../../components/BottomHotbar';

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Helper — converts Firestore date values (Timestamp, ISO string, or Date) into a regular JavaScript Date object for display.
// Returns null if the value is missing or invalid.
function getAppointmentDate(value) {
  if (!value) return null;
  // Firestore Timestamps have a .toDate() method
  const date = typeof value === 'object' && value.toDate
    ? value.toDate()
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

type HomeScreenProps = {
  navigation: any;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main HomeScreen component
// Loads user profile on mount, then fetches the right data for their role.
// ─────────────────────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }: HomeScreenProps) {
  const [role, setRole] = useState('');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // isActive prevents state updates if the component unmounts before the
    // async calls finish — avoids the "can't update unmounted component" warning
    let isActive = true;

    async function loadHomeData() {
      try {

        // Step 1: get the signed-in user's Firestore profile (name, role, etc.)
        const user = (await getCurrentUserProfile()) as {
          role?: string;
          id?: string;
        } | null;

        if (!isActive) return;
        if (!user) {
          setError('User profile could not be loaded.');
          return;
        }

        setRole(user.role || '');
                

        // Step 2: fetch data that matches the user's role
        if (user.role === 'p') {
          // Patient — only fetch their own appointments
          if (!user.id) {
            setError('User ID could not be loaded.');
            return;
          }
          const userAppointments = await getPatientAppointments(user.id);
          if (isActive) setAppointments(userAppointments);

        } else if (user.role === 'd' || user.role === 'r') {
          // Doctor or Receptionist — fetch all appointments and all patients
          // Promise.all runs both fetches at the same time so it is faster
          const [allAppointments, clinicPatients] = await Promise.all([
            getAllAppointments(),
            getClinicPatients(),
          ]);
          if (isActive) {
            setAppointments(allAppointments);
            setPatients(clinicPatients);
          }
        }
      } catch (loadError) {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (isActive) setLoading(false);
      }
    }

    void loadHomeData();

    // Cleanup: prevent stale state updates if the screen unmounts
    return () => {
      isActive = false;
    };
  }, []);

  // Filter appointments to today only — used by the receptionist view
  const today = new Date();
  const todaysAppointments = appointments.filter((appointment) => {
    const date = getAppointmentDate(appointment.appointmentDate);
    return (
      date &&
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  });

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Loading state */}
        {loading && (
          <View style={styles.messageContainer}>
            <ActivityIndicator color="#415A77" />
            <Text style={styles.messageText}>Loading...</Text>
          </View>
        )}

        {/* Error state */}
        {!loading && error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {/* Role-based content — same structure as the teammate's original */}
        {!loading && !error && role === 'p' && (
          <PatientHome
            appointments={appointments}
            navigation={navigation}
          />
        )}

        {!loading && !error && role === 'd' && (
          <DoctorHome
            appointments={appointments}
            patients={patients}
            navigation={navigation}
          />
        )}

        {!loading && !error && role === 'r' && (
          <ReceptionistHome
            appointments={todaysAppointments}
            patients={patients}
            navigation={navigation}
          />
        )}

        {/* Fallback for unknown roles */}
        {!loading && !error && role !== 'p' && role !== 'd' && role !== 'r' && (
          <Text style={styles.messageText}>
            No home screen is available for this account role.
          </Text>
        )}
      </ScrollView>

      <BottomHotbar
        role={role}
        navigation={navigation}
        activeItem={null}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Patient Home
// Shows the patient's upcoming appointments as a calendar summary.
// appointments: array fetched from getPatientAppointments() in firebase.js
// ─────────────────────────────────────────────────────────────────────────────
function PatientHome({ appointments, navigation }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Calendar Summary</Text>

      <View style={styles.calendarCard}>
        {appointments.length > 0 ? (
          appointments.map((appointment) => {
            // Convert Firestore date to something readable
            const date = getAppointmentDate(appointment.appointmentDate);
            const dateLabel = date ? date.toLocaleDateString('en-ZA') : 'Date not set';
            const timeLabel = appointment.timeSlot || '';

            return (
              <View key={appointment.id} style={styles.calendarItem}>
                <View style={styles.calendarLine} />
                <View>
                  <Text style={styles.appointmentTitle}>
                    {appointment.appointmentType || 'Appointment'}
                  </Text>
                  <Text style={styles.appointmentDetails}>
                    {dateLabel}{timeLabel ? ` • ${timeLabel}` : ''}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.emptyText}>No upcoming appointments.</Text>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Doctor Home
// Shows the doctor's appointment schedule and a list of all registered patients.
// appointments: fetched from getAllAppointments() in firebase.js
// patients:     fetched from getClinicPatients() in firebase.js
// ─────────────────────────────────────────────────────────────────────────────
function DoctorHome({ appointments, patients, navigation }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Calendar Summary</Text>

      <View style={styles.calendarCard}>
        {appointments.length > 0 ? (
          appointments.map((appointment) => {
            const date = getAppointmentDate(appointment.appointmentDate);
            const dateLabel = date ? date.toLocaleDateString('en-ZA') : 'Date not set';
            const timeLabel = appointment.timeSlot || '';

            // Try to show the patient's name instead of just the appointment type
            const patient = patients.find((p) => p.id === appointment.patientId);

            return (
              <View key={appointment.id} style={styles.calendarItem}>
                <View style={styles.calendarLine} />
                <View>
                  <Text style={styles.appointmentTitle}>
                    {patient?.name || appointment.appointmentType || 'Appointment'}
                  </Text>
                  <Text style={styles.appointmentDetails}>
                    {dateLabel}{timeLabel ? ` • ${timeLabel}` : ''}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.emptyText}>No appointments found.</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Patient List</Text>

      <View style={styles.patientList}>
        {patients.length > 0 ? (
          patients.map((patient) => (
            <View key={patient.id} style={styles.patientRow}>
              <View style={styles.patientNameContainer}>
                <View style={styles.patientLine} />
                <Text style={styles.patientName}>
                  {patient.name || 'Unnamed patient'}
                </Text>
              </View>

              <View style={styles.patientActions}>
                {/* Edit navigates to the patient management screen */}
                {/* Replace console.log with navigation.navigate() once those screens exist */}
                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={() => console.log('Edit patient:', patient.id)}
                >
                  <Text style={styles.smallButtonText}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={() => console.log('Delete patient:', patient.id)}
                >
                  <Text style={styles.smallButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No patients found.</Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.addPatientButton}
        onPress={() => console.log('Add patient')}
      >
        <Text style={styles.addPatientText}>Add patient</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Receptionist Home
// Shows today's appointments with patient names where available.
// appointments: today's appointments filtered from getAllAppointments()
// patients:     fetched from getClinicPatients() — used to look up patient names
// ─────────────────────────────────────────────────────────────────────────────
function ReceptionistHome({ appointments, patients, navigation }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Today's appointments</Text>

      <View style={styles.calendarCard}>
        {appointments.length > 0 ? (
          appointments.map((appointment) => {
            const date = getAppointmentDate(appointment.appointmentDate);
            const timeLabel = appointment.timeSlot || (date ? date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '');

            // Look up the patient name by matching patientId to the patients array
            const patient = patients.find((p) => p.id === appointment.patientId);

            return (
              <View key={appointment.id} style={styles.calendarItem}>
                <View style={styles.calendarLine} />
                <View>
                  <Text style={styles.appointmentTitle}>
                    {patient?.name || 'Unknown patient'}
                  </Text>
                  <Text style={styles.appointmentDetails}>
                    {timeLabel}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.emptyText}>No appointments for today.</Text>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — kept exactly as the teammate wrote them, with theme colours
// substituted for the hardcoded hex values where they match.
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F1DE', // theme.colors.background
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 18,
    paddingBottom: 30,
  },
  messageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  messageText: {
    marginTop: 8,
    color: '#778D7A',  // theme.colors.secondary
    fontSize: 16,
    textAlign: 'center',
  },
  errorText: {
    color: '#C0392B', // theme.colors.error
    fontSize: 16,
    textAlign: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#778D7A', // theme.colors.secondary
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 18,
    marginTop: 10,
    color: '#0D1B2A', // theme.colors.darkest
  },
  calendarCard: {
    borderWidth: 1,
    borderColor: '#1B263B', // theme.colors.dark
    borderRadius: 14,
    padding: 15,
    marginBottom: 30,
    backgroundColor: '#FFFFFF', // theme.colors.white
  },
  calendarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarLine: {
    height: 7,
    width: '30%',
    backgroundColor: '#415A77', // theme.colors.primary
    marginRight: 15,
  },
  appointmentTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0D1B2A', // theme.colors.darkest
  },
  appointmentDetails: {
    fontSize: 11,
    color: '#778D7A', // theme.colors.secondary
    marginTop: 2,
  },
  patientList: {
    marginBottom: 15,
  },
  patientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  patientNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  patientLine: {
    height: 7,
    width: 55,
    backgroundColor: '#415A77', // theme.colors.primary
    marginRight: 12,
  },
  patientName: {
    fontSize: 12,
    color: '#0D1B2A', // theme.colors.darkest
  },
  patientActions: {
    flexDirection: 'row',
    gap: 8,
  },
  smallButton: {
    borderWidth: 1,
    borderColor: '#778D7A', // theme.colors.secondary
    borderRadius: 3,
    paddingVertical: 4,
    paddingHorizontal: 9,
    backgroundColor: '#FFFFFF', // theme.colors.white
  },
  smallButtonText: {
    fontSize: 9,
    color: '#0D1B2A', // theme.colors.darkest
  },
  addPatientButton: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#778D7A', // theme.colors.secondary
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 5,
  },
  addPatientText: {
    fontSize: 10,
    color: '#0D1B2A', // theme.colors.darkest
  },
});