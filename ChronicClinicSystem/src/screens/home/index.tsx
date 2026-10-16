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

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Firebase service functions — never call Firebase directly from this file
import {
  getAllAppointments,
  getClinicPatients,
  getCurrentUserProfile,
  getPatientAppointments,
  subscribeToAppointments,
} from '../../services/firebase';
import { useFocusEffect } from 'expo-router';

// Update this import path to wherever your BottomHotbar component lives
import BottomHotbar from '../../components/BottomHotbar';
import { useAppTheme } from '@/components/theme-provider';

// ─────────────────────────────────────────────────────────────────────────────
// Helper — converts Firestore date values (Timestamp, ISO string, or Date)
// into a regular JavaScript Date object for display.
// Returns null if the value is missing or invalid.
function getAppointmentDate(value: Appointment['appointmentDate']): Date | null {
  if (!value) return null;
  const date = value instanceof Date
    ? value
    : typeof value === 'object'
      ? value.toDate()
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

type Appointment = {
  id: string;
  appointmentDate?: string | Date | { toDate: () => Date };
  appointmentType?: string;
  timeSlot?: string;
  patientId?: string;
  doctorId?: string;
  status?: string;
};

type Patient = {
  id: string;
  name?: string;
  accountVerified?: boolean;
  accountStatus?: string;
};

function isAccountActive(patient: Patient): boolean {
  return patient.accountVerified === true || patient.accountStatus === 'active';
}

type HomeStyles = ReturnType<typeof createStyles>;


// Main HomeScreen component
// Loads user profile on mount, then fetches the right data for their role.
export default function HomeScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [role, setRole] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
    let isActive = true;
    let unsubscribe: (() => void) | undefined;
    setLoading(true);
    setError('');

    async function loadHomeData() {
      try {
        const user = await getCurrentUserProfile();
        if (!isActive) return;
        setRole(user.role || '');
        setCurrentUserId(user.id);

        if (user.role === 'p') {
          const userAppointments = await getPatientAppointments(user.id);
          if (!isActive) return;
          setAppointments(userAppointments);
          unsubscribe = subscribeToAppointments(
            (updates: Appointment[]) => isActive && setAppointments(updates),
            (listenerError: Error) => {
              if (isActive) setError(listenerError.message);
            },
            user.id,
          );
        } else if (user.role === 'd' || user.role === 'r') {
          const [allAppointments, clinicPatients] = await Promise.all([
            getAllAppointments(),
            getClinicPatients(),
          ]);
          if (!isActive) return;
          setAppointments(allAppointments);
          setPatients(clinicPatients);
          unsubscribe = subscribeToAppointments(
            (updates: Appointment[]) => isActive && setAppointments(updates),
            (listenerError: Error) => {
              if (isActive) setError(listenerError.message);
            },
          );
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

    return () => {
      isActive = false;
      unsubscribe?.();
    };
  }, []),
  );

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
            <ActivityIndicator color={theme.colors.primarylight} />
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
            styles={styles}
          />
        )}

        {!loading && !error && role === 'd' && (
          <DoctorHome
            appointments={appointments}
            patients={patients}
            currentUserId={currentUserId}
            styles={styles}
          />
        )}

        {!loading && !error && role === 'r' && (
          <ReceptionistHome
            appointments={todaysAppointments}
            patients={patients}
            styles={styles}
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
function PatientHome({ appointments, styles }: { appointments: Appointment[]; styles: HomeStyles }) {
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
function DoctorHome({ appointments, patients, currentUserId, styles }: { appointments: Appointment[]; patients: Patient[]; currentUserId: string; styles: HomeStyles }) {
  const { theme } = useAppTheme();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const tenDayLimit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10);
  const tenDayLimitKey = `${tenDayLimit.getFullYear()}-${String(tenDayLimit.getMonth() + 1).padStart(2, '0')}-${String(tenDayLimit.getDate()).padStart(2, '0')}`;
  const upcomingAppointments = appointments.filter((appointment) => {
    const date = getAppointmentDate(appointment.appointmentDate);
    if (!date || appointment.doctorId !== currentUserId || appointment.status === 'cancelled') return false;
    const appointmentKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return appointmentKey >= todayKey && appointmentKey < tenDayLimitKey;
  }).sort((a, b) => {
    const dateA = getAppointmentDate(a.appointmentDate)?.getTime() ?? 0;
    const dateB = getAppointmentDate(b.appointmentDate)?.getTime() ?? 0;
    return dateA - dateB;
  });
  const bookedPatientIds = new Set(
    upcomingAppointments
      .filter((appointment) => appointment.patientId)
      .map((appointment) => appointment.patientId as string),
  );
  const doctorPatients = patients.filter((patient) => bookedPatientIds.has(patient.id));

  return (
    <View>
      <Text style={styles.sectionTitle}>Calendar Summary</Text>

      <View style={styles.calendarCard}>
        {upcomingAppointments.length > 0 ? (
          upcomingAppointments.map((appointment) => {
            const date = getAppointmentDate(appointment.appointmentDate);
            const dateLabel = date ? date.toLocaleDateString('en-ZA') : 'Date not set';
            const timeLabel = appointment.timeSlot || '';

            // Try to show the patient's name instead of just the appointment type
            const patient = doctorPatients.find((p) => p.id === appointment.patientId);

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
        {doctorPatients.length > 0 ? (
          doctorPatients.map((patient) => (
            <View key={patient.id} style={styles.patientRow}>
              <View style={styles.patientNameContainer}>
                <View style={styles.patientLine} />
                <Text style={styles.patientName}>
                  {patient.name || 'Unnamed patient'}
                </Text>
                {isAccountActive(patient) && (
                  <Ionicons name="warning" size={18} color={theme.colors.warning} accessibilityLabel="Account is activated" />
                )}
              </View>

            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No patients found.</Text>
        )}
      </View>

    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Receptionist Home
// Shows today's appointments with patient names where available.
// appointments: today's appointments filtered from getAllAppointments()
// patients:     fetched from getClinicPatients() — used to look up patient names
// ─────────────────────────────────────────────────────────────────────────────
function ReceptionistHome({ appointments, patients, styles }: { appointments: Appointment[]; patients: Patient[]; styles: HomeStyles }) {
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
function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background
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
    color: theme.colors.secondary,
    fontSize: theme.fontSizes.body,
    textAlign: 'center',
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.fontSizes.body,
    textAlign: 'center',
    padding: 24,
  },
  emptyText: {
    color: theme.colors.secondary,
    fontSize: theme.fontSizes.small + 2,
    textAlign: 'center',
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: theme.fontSizes.body - 1,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 18,
    marginTop: 10,
    color: theme.colors.darkest
  },
  calendarCard: {
    borderWidth: 1,
    borderColor: theme.colors.secondaryBorder,
    borderRadius: 14,
    padding: 15,
    marginBottom: 30,
    backgroundColor: theme.colors.secondarySurface,
  },
  calendarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarLine: {
    height: 7,
    width: '30%',
    backgroundColor: theme.colors.secondary,
    marginRight: 15,
  },
  appointmentTitle: {
    fontSize: theme.fontSizes.small + 1,
    fontWeight: '500',
    color: theme.colors.darkest
  },
  appointmentDetails: {
    fontSize: theme.fontSizes.small - 1,
    color: theme.colors.secondary,
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
    backgroundColor: theme.colors.secondarylight,
    marginRight: 12,
  },
  patientName: {
    fontSize: theme.fontSizes.small,
    color: theme.colors.darkest
  },
  });
}