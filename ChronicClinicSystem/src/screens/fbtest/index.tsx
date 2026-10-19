import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  addPatientToQueue,
  bookAppointment,
  createClinic,
  createNotification,
  getAllAppointments,
  getFirestoreCollections,
  getUserById,
  loginUser,
  logoutUser,
  searchUsersByName,
  updateUserProfile,
} from '../../services/firebase';
import { useAppTheme } from '@/components/theme-provider';

type UserRecord = {
  id: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  role?: string;
};

type Appointment = {
  id: string;
  appointmentDate?: string | Date | { toDate: () => Date };
  appointmentType?: string;
  clinicId?: string;
  patientId?: string;
  status?: string;
  timeSlot?: string;
};

type FirestoreCollection = {
  name: string;
  documents: { id: string; data: Record<string, unknown> }[];
  error?: string;
};

type AppointmentCalendarProps = {
  title: string;
  appointments: Appointment[];
};

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function appointmentDateKey(appointment: Appointment) {
  if (!appointment.appointmentDate) return '';
  const value = appointment.appointmentDate;
  const date = typeof value === 'object' && 'toDate' in value
    ? value.toDate()
    : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateKey(date);
}

function AppointmentCalendar({ title, appointments }: AppointmentCalendarProps) {
  const styles = useScreenStyles();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(dateKey(new Date()));

  const days = useMemo(() => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);

  const appointmentsByDay = useMemo(() => {
    const grouped: Record<string, Appointment[]> = {};
    appointments.forEach((appointment) => {
      const key = appointmentDateKey(appointment);
      if (key) grouped[key] = [...(grouped[key] ?? []), appointment];
    });
    return grouped;
  }, [appointments]);

  const selectedAppointments = appointmentsByDay[selectedDay] ?? [];

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.monthHeading}>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.smallButton}
          onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          <Text style={styles.smallButtonText}>Previous</Text>
        </TouchableOpacity>
        <Text style={styles.monthTitle}>
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.smallButton}
          onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          <Text style={styles.smallButtonText}>Next</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.calendarGrid}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
          <Text key={`${day}-${index}`} style={styles.weekday}>
            {day}
          </Text>
        ))}
        {days.map((day) => {
          const key = dateKey(day);
          const count = appointmentsByDay[key]?.length ?? 0;
          const inMonth = day.getMonth() === month.getMonth();
          const selected = key === selectedDay;
          return (
            <TouchableOpacity
              key={key}
              accessibilityRole="button"
              onPress={() => setSelectedDay(key)}
              style={[
                styles.calendarDay,
                !inMonth && styles.outsideMonth,
                selected && styles.selectedDay,
              ]}
            >
              <Text style={[styles.dayNumber, selected && styles.selectedDayText]}>
                {day.getDate()}
              </Text>
              {count > 0 ? (
                <Text style={[styles.appointmentCount, selected && styles.selectedDayText]}>
                  {count}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.listTitle}>Appointments on {selectedDay}</Text>
      {selectedAppointments.length === 0 ? (
        <Text style={styles.muted}>No appointments on this date.</Text>
      ) : (
        selectedAppointments.map((appointment) => (
          <View key={appointment.id} style={styles.appointmentRow}>
            <Text style={styles.appointmentText}>
              {appointment.timeSlot || 'Time not set'} · {appointment.appointmentType || 'Appointment'}
            </Text>
            <Text style={styles.muted}>
              Patient: {appointment.patientId || 'Unknown'} · Clinic: {appointment.clinicId || 'Unknown'} ·{' '}
              {appointment.status || 'No status'}
            </Text>
            <Text style={styles.muted}>ID: {appointment.id}</Text>
          </View>
        ))
      )}
    </View>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secure?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  secure,
  multiline,
  keyboardType = 'default',
}: FieldProps) {
  const styles = useScreenStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        secureTextEntry={secure}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize="none"
        style={[styles.input, multiline && styles.multilineInput]}
      />
    </View>
  );
}

export default function FBTestScreen() {
  const { theme } = useAppTheme();
  const styles = useScreenStyles();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedInUser, setSignedInUser] = useState<UserRecord | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<UserRecord[]>([]);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [clinicCapacity, setClinicCapacity] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [clinicProvince, setClinicProvince] = useState('');
  const [clinicNumbers, setClinicNumbers] = useState('');
  const [notificationPatientId, setNotificationPatientId] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationStatus, setNotificationStatus] = useState('pending');
  const [appointmentClinicId, setAppointmentClinicId] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [appointmentType, setAppointmentType] = useState('');
  const [queueAppointmentId, setQueueAppointmentId] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [collections, setCollections] = useState<FirestoreCollection[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);

  useEffect(() => {
    void refreshAppointments();
    void refreshDatabaseContents();
  }, []);

  async function refreshDatabaseContents() {
    setLoadingCollections(true);
    try {
      const data = await getFirestoreCollections();
      setCollections(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setMessageIsError(true);
    } finally {
      setLoadingCollections(false);
    }
  }

  async function refreshAppointments() {
    setLoadingAppointments(true);
    try {
      const all = await getAllAppointments();
      setAppointments(all);
      void refreshDatabaseContents();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setMessageIsError(true);
    } finally {
      setLoadingAppointments(false);
    }
  }

  async function runAction(action: () => Promise<string>) {
    setBusy(true);
    setMessage('');
    setMessageIsError(false);
    try {
      setMessage(await action());
      await refreshDatabaseContents();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setMessageIsError(true);
    } finally {
      setBusy(false);
    }
  }

  const userForCalendar = selectedUser ?? signedInUser;
  const selectedUserAppointments = userForCalendar
    ? appointments.filter((appointment) => appointment.patientId === userForCalendar.id)
    : [];

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={styles.pageTitle}>Clinic management</Text>
      <Text style={styles.intro}>Sign in, manage clinic information, find patients, and work with appointments.</Text>

      {message ? (
        <Text style={[styles.message, messageIsError ? styles.errorMessage : styles.successMessage]}>
          {message}
        </Text>
      ) : null}

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Database contents</Text>
        <TouchableOpacity onPress={() => void refreshDatabaseContents()} disabled={loadingCollections}>
          <Text style={styles.refreshText}>{loadingCollections ? 'Loading...' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>
      {loadingCollections && collections.length === 0 ? (
        <View style={styles.databaseLoading}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.muted}>Loading collections...</Text>
        </View>
      ) : null}
      {collections.map((collection) => (
        <View key={collection.name} style={styles.card}>
          <Text style={styles.cardTitle}>
            {collection.name} ({collection.documents.length})
          </Text>
          {collection.error ? (
            <Text style={styles.errorMessage}>Could not load: {collection.error}</Text>
          ) : collection.documents.length === 0 ? (
            <Text style={styles.muted}>No documents found.</Text>
          ) : (
            collection.documents.map((document) => (
              <View key={document.id} style={styles.databaseDocument}>
                <Text style={styles.userName}>Document ID: {document.id}</Text>
                <Text selectable style={styles.databaseDocumentText}>
                  {JSON.stringify(document.data, null, 2)}
                </Text>
              </View>
            ))
          )}
        </View>
      ))}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        {signedInUser ? (
          <>
            <Text style={styles.muted}>
              Signed in as {signedInUser.name || signedInUser.email || signedInUser.id}
            </Text>
            <Button title="Sign out" disabled={busy} onPress={() => void runAction(async () => {
              await logoutUser();
              setSignedInUser(null);
              return 'Signed out.';
            })} />
          </>
        ) : (
          <>
            <Field label="Email" value={email} onChange={setEmail} keyboardType="email-address" />
            <Field label="Password" value={password} onChange={setPassword} secure />
            <Button title={busy ? 'Please wait...' : 'Sign in'} disabled={busy} onPress={() => void runAction(async () => {
              const user = await loginUser(email.trim(), password);
              const profile = await getUserById(user.uid) as UserRecord;
              setSignedInUser(profile);
              setSelectedUser(profile);
              setProfileName(profile.name || '');
              setProfilePhone(profile.phoneNumber || '');
              return `Signed in as ${profile.name || user.email || user.uid}.`;
            })} />
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Find a user</Text>
        <Field
          label="Search by name"
          value={searchText}
          onChange={setSearchText}
          placeholder="Enter all or part of a name"
        />
        <Button title={busy ? 'Please wait...' : 'Search users'} disabled={busy} onPress={() => void runAction(async () => {
          const found = await searchUsersByName(searchText);
          const users = found as UserRecord[];
          setSearchResults(users);
          return `Found ${users.length} user(s).`;
        })} />
        {searchResults.map((user) => (
          <TouchableOpacity
            key={user.id}
            style={[styles.userResult, selectedUser?.id === user.id && styles.selectedUser]}
            onPress={() => {
              setSelectedUser(user);
              setProfileName(user.name || '');
              setProfilePhone(user.phoneNumber || '');
              setNotificationPatientId(user.id);
            }}
          >
            <Text style={styles.userName}>{user.name || 'Unnamed user'}</Text>
            <Text style={styles.muted}>{user.email || user.id} · {user.phoneNumber || 'No phone'}</Text>
            <Text style={styles.muted}>UID: {user.id}</Text>
          </TouchableOpacity>
        ))}
        {selectedUser ? (
          <View style={styles.editPanel}>
            <Text style={styles.listTitle}>User details: {selectedUser.name || selectedUser.id}</Text>
            <Field label="Name" value={profileName} onChange={setProfileName} />
            <Field label="Phone number" value={profilePhone} onChange={setProfilePhone} keyboardType="phone-pad" />
            <Button title="Save user details" disabled={busy} onPress={() => void runAction(async () => {
              await updateUserProfile(selectedUser.id, {
                name: profileName,
                phoneNumber: profilePhone,
              });
              const updated = await getUserById(selectedUser.id) as UserRecord;
              setSelectedUser(updated);
              setSearchResults((users) => users.map((user) => user.id === updated.id ? updated : user));
              if (signedInUser?.id === updated.id) setSignedInUser(updated);
              return 'User details saved.';
            })} />
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add a clinic</Text>
        <Field label="Clinic name" value={clinicName} onChange={setClinicName} />
        <Field label="Address" value={clinicAddress} onChange={setClinicAddress} />
        <Field label="Clinic phone numbers (comma-separated)" value={clinicNumbers} onChange={setClinicNumbers} keyboardType="phone-pad" />
        <Field label="Province" value={clinicProvince} onChange={setClinicProvince} />
        <Field label="Daily slot capacity" value={clinicCapacity} onChange={setClinicCapacity} keyboardType="numeric" />
        <Button title="Save clinic" disabled={busy} onPress={() => void runAction(async () => {
          const id = await createClinic({
            address: clinicAddress,
            dailySlotCapacity: Number(clinicCapacity),
            name: clinicName,
            numbers: clinicNumbers.split(',').map((number) => number.trim()).filter(Boolean),
            province: clinicProvince,
          });
          return `Clinic added. ID: ${id}`;
        })} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Send a notification</Text>
        <Field
          label="Patient ID"
          value={notificationPatientId}
          onChange={setNotificationPatientId}
          placeholder={selectedUser?.id}
        />
        <Field label="Message" value={notificationMessage} onChange={setNotificationMessage} multiline />
        <Field label="Delivery status" value={notificationStatus} onChange={setNotificationStatus} />
        <Button title="Save notification" disabled={busy} onPress={() => void runAction(async () => {
          const id = await createNotification({
            deliveryStatus: notificationStatus,
            message: notificationMessage,
            patientId: notificationPatientId,
          });
          return `Notification added. ID: ${id}`;
        })} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Make an appointment</Text>
        <Text style={styles.muted}>
          {selectedUser
            ? `Patient: ${selectedUser.name || selectedUser.id} (${selectedUser.id})`
            : 'Search for and select a patient first.'}
        </Text>
        <Field label="Clinic ID" value={appointmentClinicId} onChange={setAppointmentClinicId} />
        <Field label="Date (YYYY-MM-DD)" value={appointmentDate} onChange={setAppointmentDate} placeholder="2026-10-09" />
        <Field label="Time slot" value={appointmentTime} onChange={setAppointmentTime} placeholder="09:00-09:15" />
        <Field label="Appointment type" value={appointmentType} onChange={setAppointmentType} />
        <Button title="Book appointment" disabled={busy || !selectedUser} onPress={() => void runAction(async () => {
          if (!selectedUser) throw new Error('Select a user before making an appointment.');
          const day = new Date(`${appointmentDate}T12:00:00`);
          if (Number.isNaN(day.getTime()) || dateKey(day) !== appointmentDate) {
            throw new Error('Enter a valid date in YYYY-MM-DD format.');
          }
          const id = await bookAppointment(selectedUser.id, {
            clinicId: appointmentClinicId,
            appointmentDate: new Date(`${appointmentDate}T00:00:00`).toISOString(),
            timeSlot: appointmentTime,
            appointmentType,
          });
          await refreshAppointments();
          return `Appointment booked. ID: ${id}`;
        })} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add patient to the queue</Text>
        <Text style={styles.muted}>
          {selectedUser
            ? `Patient: ${selectedUser.name || selectedUser.id} (${selectedUser.id})`
            : 'Search for and select a patient first.'}
        </Text>
        <Field label="Appointment ID" value={queueAppointmentId} onChange={setQueueAppointmentId} />
        <Button title="Add to queue" disabled={busy || !selectedUser} onPress={() => void runAction(async () => {
          if (!selectedUser) throw new Error('Select a user before adding them to the queue.');
          const id = await addPatientToQueue({
            appointmentId: queueAppointmentId,
            patientId: selectedUser.id,
            patientName: selectedUser.name || '',
          });
          return `Patient added to queue. Entry ID: ${id}`;
        })} />
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Appointments</Text>
        <TouchableOpacity onPress={() => void refreshAppointments()} disabled={loadingAppointments}>
          <Text style={styles.refreshText}>{loadingAppointments ? 'Loading...' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>
      {loadingAppointments ? <ActivityIndicator color={theme.colors.primary} /> : null}
      <AppointmentCalendar
        title={userForCalendar
          ? `Selected user: ${userForCalendar.name || userForCalendar.id}`
          : 'Selected user appointments'}
        appointments={selectedUserAppointments}
      />
      <AppointmentCalendar title="All appointments" appointments={appointments} />
    </ScrollView>
  );
}

function useScreenStyles() {
  const { theme } = useAppTheme();
  return useMemo(() => StyleSheet.create({
  page: {
    padding: theme.spacing.medium,
    paddingTop: 40,
    paddingBottom: 48,
    backgroundColor: theme.colors.background,
  },
  pageTitle: {
    marginBottom: 6,
    color: theme.colors.textDark,
    fontSize: theme.fontSizes.heading,
    fontWeight: '700',
  },
  intro: {
    marginBottom: theme.spacing.medium,
    color: theme.colors.secondary,
    fontSize: theme.fontSizes.body,
  },
  card: {
    marginBottom: theme.spacing.medium,
    padding: theme.spacing.medium,
    borderWidth: 1,
    borderColor: theme.colors.secondaryBorder,
    borderRadius: theme.borderRadius,
    backgroundColor: theme.colors.secondarySurface,
  },
  cardTitle: {
    marginBottom: theme.spacing.small,
    color: theme.colors.dark,
    fontSize: theme.fontSizes.subheading,
    fontWeight: '700',
  },
  field: {
    marginBottom: 10,
  },
  fieldLabel: {
    marginBottom: 4,
    color: theme.colors.primary,
    fontSize: theme.fontSizes.small,
    fontWeight: '600',
  },
  input: {
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.secondaryBorder,
    borderRadius: 6,
    color: theme.colors.textDark,
    backgroundColor: theme.colors.white,
    fontSize: theme.fontSizes.body,
  },
  multilineInput: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  message: {
    marginBottom: theme.spacing.medium,
    padding: 12,
    borderRadius: theme.borderRadius,
    fontSize: theme.fontSizes.body,
  },
  successMessage: {
    color: theme.colors.success,
    backgroundColor: theme.colors.white,
  },
  errorMessage: {
    color: theme.colors.error,
    backgroundColor: theme.colors.white,
  },
  userResult: {
    marginTop: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.secondaryBorder,
    borderRadius: 6,
    backgroundColor: theme.colors.background,
  },
  selectedUser: {
    borderColor: theme.colors.secondary,
    borderWidth: 2,
  },
  userName: {
    color: theme.colors.textDark,
    fontWeight: '700',
  },
  muted: {
    marginTop: 3,
    color: theme.colors.secondary,
    fontSize: theme.fontSizes.small,
  },
  databaseLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.spacing.small,
  },
  databaseDocument: {
    marginTop: 8,
    padding: 10,
    borderRadius: 6,
    backgroundColor: theme.colors.background,
  },
  databaseDocumentText: {
    marginTop: 4,
    color: theme.colors.dark,
    fontFamily: 'monospace',
    fontSize: theme.fontSizes.small,
  },
  editPanel: {
    marginTop: theme.spacing.medium,
    paddingTop: theme.spacing.small,
    borderTopWidth: 1,
    borderTopColor: theme.colors.secondaryBorder,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.medium,
    marginBottom: theme.spacing.small,
  },
  sectionTitle: {
    color: theme.colors.textDark,
    fontSize: theme.fontSizes.subheading,
    fontWeight: '700',
  },
  refreshText: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  monthHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 10,
  },
  monthTitle: {
    color: theme.colors.textDark,
    fontWeight: '700',
  },
  smallButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 5,
    backgroundColor: theme.colors.background,
  },
  smallButtonText: {
    color: theme.colors.primary,
    fontSize: theme.fontSizes.small,
    fontWeight: '600',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  weekday: {
    width: '14.285%',
    paddingVertical: 6,
    color: theme.colors.secondary,
    textAlign: 'center',
    fontSize: theme.fontSizes.small,
    fontWeight: '700',
  },
  calendarDay: {
    width: '14.285%',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  outsideMonth: {
    opacity: 0.4,
  },
  selectedDay: {
    backgroundColor: theme.colors.secondary,
  },
  dayNumber: {
    color: theme.colors.textDark,
    fontSize: theme.fontSizes.small,
  },
  appointmentCount: {
    color: theme.colors.success,
    fontSize: theme.fontSizes.small - 2,
    fontWeight: '700',
  },
  selectedDayText: {
    color: theme.colors.onPrimary,
  },
  listTitle: {
    marginTop: theme.spacing.medium,
    marginBottom: 6,
    color: theme.colors.textDark,
    fontWeight: '700',
  },
  appointmentRow: {
    marginTop: 6,
    padding: 9,
    borderRadius: 6,
    backgroundColor: theme.colors.background,
  },
  appointmentText: {
    color: theme.colors.dark,
    fontWeight: '600',
  },
  }), [theme]);
}
