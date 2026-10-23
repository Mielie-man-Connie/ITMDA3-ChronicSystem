import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Button, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  bookAppointment,
  createClinic,
  deleteAdminFirestoreDocument,
  getAllAppointments,
  getAdminFirestoreCollections,
  getCurrentUserProfile,
  getUserById,
  logoutUser,
  searchAdminUsersByName,
  saveAdminFirestoreDocument,
  updateAdminUserProfile,
} from '../../services/firebase';
import { useAppTheme } from '@/components/theme-provider';
import { scheduleTestNotification } from '../../services/notifications';
import { AccountVerificationIcon } from '@/components/account-verification-icon';

type UserRecord = {
  [key: string]: unknown;
  id: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  idNumber?: string;
  homeAddress?: string;
  role?: string;
  clinicId?: string;
  accountVerified?: boolean;
  accountStatus?: string;
};

const EDITABLE_USER_FIELDS = new Set([
  'name',
  'email',
  'phoneNumber',
  'idNumber',
  'homeAddress',
  'role',
  'clinicId',
  'accountVerified',
  'accountStatus',
  'updatedAt',
]);

function stringifyAdditionalUserFields(user: UserRecord): string {
  const additionalFields = Object.fromEntries(
    Object.entries(user).filter(([key]) => key !== 'id' && !EDITABLE_USER_FIELDS.has(key)),
  );
  return JSON.stringify(additionalFields, null, 2);
}

function isAccountActive(user: UserRecord): boolean {
  return user.accountVerified === true || user.accountStatus === 'active';
}

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

const ADMIN_COLLECTIONS = [
  'appointments',
  'chronic-illnesses',
  'clinics',
  'queue',
  'tokens',
  'users',
];

type AppointmentCalendarProps = {
  title: string;
  appointments: Appointment[];
  lastUpdated: Date | null;
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

function AppointmentCalendar({ title, appointments, lastUpdated }: AppointmentCalendarProps) {
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
      <Text style={styles.muted}>
        Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Not refreshed yet'}
      </Text>
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

export default function AdminConsoleScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const styles = useScreenStyles();
  const [signedInUser, setSignedInUser] = useState<UserRecord | null>(null);
  const [accessStatus, setAccessStatus] = useState<'checking' | 'signed-out' | 'denied' | 'admin'>('checking');
  const [accessError, setAccessError] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<UserRecord[]>([]);
  const [searchResultQuery, setSearchResultQuery] = useState('');
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [userSearchError, setUserSearchError] = useState('');
  const [userSearchErrorQuery, setUserSearchErrorQuery] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileIdNumber, setProfileIdNumber] = useState('');
  const [profileHomeAddress, setProfileHomeAddress] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileRole, setProfileRole] = useState('');
  const [profileClinicId, setProfileClinicId] = useState('');
  const [profileAccountActive, setProfileAccountActive] = useState(false);
  const [profileAdditionalJson, setProfileAdditionalJson] = useState('{}');
  const [clinicAddress, setClinicAddress] = useState('');
  const [clinicCapacity, setClinicCapacity] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [clinicNumbers, setClinicNumbers] = useState('');
  const [clinicProvince, setClinicProvince] = useState('');
  const [appointmentClinicId, setAppointmentClinicId] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [appointmentType, setAppointmentType] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [collections, setCollections] = useState<FirestoreCollection[]>([]);
  const [visibleCollections, setVisibleCollections] = useState<Record<string, boolean>>({});
  const [documentCollection, setDocumentCollection] = useState('appointments');
  const [documentId, setDocumentId] = useState('');
  const [documentJson, setDocumentJson] = useState('{\n  \n}');
  const [editingDocument, setEditingDocument] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ collection: string; id: string } | null>(null);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [appointmentsLastUpdated, setAppointmentsLastUpdated] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);

  useEffect(() => {
    let active = true;
    getCurrentUserProfile()
      .then((profile) => {
        if (!active) return;
        const user = profile as UserRecord;
        setSignedInUser(user);
        setAccessStatus(user.role === 'a' ? 'admin' : 'denied');
      })
      .catch((error: unknown) => {
        if (active) {
          setAccessError(error instanceof Error ? error.message : String(error));
          setAccessStatus('signed-out');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (accessStatus === 'admin') {
      void refreshAppointments();
    }
  }, [accessStatus]);

  useEffect(() => {
    const query = searchText.trim();
    if (accessStatus !== 'admin' || !query) return;
    let active = true;
    const timer = setTimeout(() => {
      setSearchingUsers(true);
      searchAdminUsersByName(query)
        .then((users) => {
          if (active) {
            setSearchResults(users as UserRecord[]);
            setSearchResultQuery(query);
            setUserSearchError('');
          }
        })
        .catch((error: unknown) => {
          if (active) {
            setSearchResults([]);
            setSearchResultQuery(query);
            setUserSearchError(error instanceof Error ? error.message : String(error));
            setUserSearchErrorQuery(query);
          }
        })
        .finally(() => {
          if (active) setSearchingUsers(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [accessStatus, searchText]);

  async function refreshDatabaseContents() {
    setLoadingCollections(true);
    try {
      const data = await getAdminFirestoreCollections();
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
      setAppointmentsLastUpdated(new Date());
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

  function editDocument(collectionName: string, id: string, data: Record<string, unknown>) {
    setDocumentCollection(collectionName);
    setDocumentId(id);
    setDocumentJson(JSON.stringify(data, null, 2));
    setEditingDocument(true);
    setDeleteTarget(null);
  }

  async function saveDocument() {
    await runAction(async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(documentJson);
      } catch (error) {
        throw new Error(`Document JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Enter a JSON object for the document data.');
      }
      const id = await saveAdminFirestoreDocument(
        documentCollection,
        documentId,
        parsed as Record<string, unknown>,
      );
      setDocumentId(id);
      setEditingDocument(true);
      return `${documentCollection}/${id} saved.`;
    });
    if (documentCollection === 'appointments') await refreshAppointments();
  }

  async function removeDocument(collectionName: string, id: string) {
    if (collectionName === 'users' && id === signedInUser?.id) {
      setMessage('You cannot delete the currently signed-in administrator profile.');
      setMessageIsError(true);
      return;
    }
    await runAction(async () => {
      await deleteAdminFirestoreDocument(collectionName, id);
      if (editingDocument && documentCollection === collectionName && documentId === id) {
        setEditingDocument(false);
        setDocumentId('');
        setDocumentJson('{\n  \n}');
      }
      setDeleteTarget(null);
      return `${collectionName}/${id} deleted.`;
    });
    if (collectionName === 'appointments') await refreshAppointments();
  }

  const userForCalendar = selectedUser ?? signedInUser;
  const selectedUserAppointments = userForCalendar
    ? appointments.filter((appointment) => appointment.patientId === userForCalendar.id)
    : [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={[styles.pageTitle, { flex: 1, marginBottom: 0 }]}>Admin console</Text>
        <Pressable
          onPress={() => router.push('/')}
          accessibilityRole="button"
          accessibilityLabel="Home"
          style={[styles.homeButton, { backgroundColor: theme.colors.secondarySurface }]}
        >
          <Ionicons name="home" size={22} color={theme.colors.textDark} />
        </Pressable>
      </View>
      <Text style={styles.intro}>Administrator tools for database records, clinic workflows, and QR testing.</Text>

      {accessStatus === 'checking' ? (
        <View style={styles.card}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.muted}>Checking administrator access...</Text>
        </View>
      ) : accessStatus !== 'admin' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Administrator access required</Text>
          <Text style={styles.muted}>
            {accessStatus === 'signed-out'
              ? accessError
                ? `Could not verify the signed-in account: ${accessError}`
                : 'Sign in through the app with an account whose role is a.'
              : `The signed-in account role “${signedInUser?.role || 'unknown'}” cannot access admin tools.`}
          </Text>
          {signedInUser ? (
            <Button
              title="Sign out"
              onPress={() => {
                void logoutUser()
                  .then(() => {
                    setSignedInUser(null);
                    setAccessStatus('signed-out');
                  })
                  .catch((error: unknown) => {
                    setMessage(error instanceof Error ? error.message : String(error));
                    setMessageIsError(true);
                  });
              }}
            />
          ) : (
            <Button title="Go to sign in" onPress={() => router.push('/login')} />
          )}
        </View>
      ) : (
        <>
      {message ? (
        <Text style={[styles.message, messageIsError ? styles.errorMessage : styles.successMessage]}>
          {message}
        </Text>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Test local notifications</Text>
        <Text style={styles.muted}>
          Sends an example notification to this device only. It does not create a Firestore record or notify other users.
        </Text>
        <Button
          title={busy ? 'Please wait...' : 'Send test notification'}
          disabled={busy}
          onPress={() => void runAction(async () => {
            if (signedInUser?.role !== 'a' && signedInUser?.role !== 'admin') {
              throw new Error('Administrator access is required to send a test notification.');
            }
            await scheduleTestNotification();
            return 'Test notification scheduled on this device.';
          })}
        />
      </View>

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
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{editingDocument ? 'Edit database document' : 'Create database document'}</Text>
        <Text style={styles.muted}>
          Create, replace, or delete Firestore documents. User records here are profile documents; Firebase Authentication accounts must be managed separately.
        </Text>
        <View style={styles.collectionPicker}>
          {ADMIN_COLLECTIONS.map((name) => (
            <TouchableOpacity
              key={name}
              style={[
                styles.collectionChip,
                documentCollection === name && styles.selectedCollectionChip,
              ]}
              onPress={() => setDocumentCollection(name)}
            >
              <Text style={styles.collectionChipText}>{name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Field
          label="Document ID (leave blank to create with an automatic ID)"
          value={documentId}
          onChange={setDocumentId}
        />
        <Field
          label="Document data (JSON object)"
          value={documentJson}
          onChange={setDocumentJson}
          multiline
        />
        <Button
          title={busy ? 'Please wait...' : editingDocument ? 'Save document changes' : 'Create document'}
          disabled={busy}
          onPress={() => void saveDocument()}
        />
        {editingDocument ? (
          <Button
            title="Stop editing / create new"
            disabled={busy}
            onPress={() => {
              setEditingDocument(false);
              setDocumentId('');
              setDocumentJson('{\n  \n}');
            }}
          />
        ) : null}
      </View>
      {collections.map((collection) => (
        <View key={collection.name} style={styles.card}>
          <View style={styles.collectionHeading}>
            <Text style={[styles.cardTitle, { flex: 1, marginBottom: 0 }]}>
              {collection.name} ({collection.documents.length})
            </Text>
            <Switch
              value={visibleCollections[collection.name] === true}
              onValueChange={(value) =>
                setVisibleCollections((current) => ({ ...current, [collection.name]: value }))
              }
              accessibilityLabel={`Display ${collection.name}`}
            />
          </View>
          {visibleCollections[collection.name] !== true ? null : collection.error ? (
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
                <View style={styles.documentActions}>
                  <Button
                    title="Edit"
                    onPress={() => editDocument(collection.name, document.id, document.data)}
                  />
                  {deleteTarget?.collection === collection.name && deleteTarget.id === document.id ? (
                    <>
                      <Button title="Confirm delete" color={theme.colors.error} onPress={() => void removeDocument(collection.name, document.id)} />
                      <Button title="Keep" onPress={() => setDeleteTarget(null)} />
                    </>
                  ) : (
                    <Button
                      title="Delete"
                      color={theme.colors.error}
                      onPress={() => setDeleteTarget({ collection: collection.name, id: document.id })}
                    />
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      ))}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        {signedInUser && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.muted}>
                Signed in as {signedInUser.name || signedInUser.email || signedInUser.id}
              </Text>
              <AccountVerificationIcon verified={isAccountActive(signedInUser)} size={17} />
            </View>
            <Button
              title="Sign out"
              disabled={busy}
              onPress={() => {
                void logoutUser()
                  .then(() => {
                    setSignedInUser(null);
                    setAccessStatus('signed-out');
                  })
                  .catch((error: unknown) => {
                    setMessage(error instanceof Error ? error.message : String(error));
                    setMessageIsError(true);
                  });
              }}
            />
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Find a user</Text>
        <Field
          label="Search users"
          value={searchText}
          onChange={(value) => {
            setSearchText(value);
            setSelectedUser(null);
          }}
          placeholder="Type a name to see matching users"
        />
        {searchingUsers ? <ActivityIndicator color={theme.colors.primary} /> : null}
        {userSearchErrorQuery === searchText.trim() && userSearchError ? <Text style={styles.errorMessage}>Search failed: {userSearchError}</Text> : null}
        {!searchingUsers && searchResultQuery === searchText.trim() && !userSearchError && searchText.trim() && !searchResults.length ? (
          <View style={styles.userSuggestions}>
            <Text style={styles.muted}>No matching users found.</Text>
          </View>
        ) : null}
        {searchResultQuery === searchText.trim() && searchResults.length > 0 ? (
          <ScrollView
            style={styles.userSuggestions}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {searchResults.map((user) => (
              <TouchableOpacity
                key={user.id}
                style={styles.userSuggestion}
                onPress={() => {
                  setSelectedUser(user);
                  setProfileName(user.name || '');
                  setProfilePhone(user.phoneNumber || '');
                  setProfileIdNumber(user.idNumber || '');
                  setProfileHomeAddress(user.homeAddress || '');
                  setProfileEmail(user.email || '');
                  setProfileRole(user.role || '');
                  setProfileClinicId(user.clinicId || '');
                  setProfileAccountActive(isAccountActive(user));
                  setProfileAdditionalJson(stringifyAdditionalUserFields(user));
                  setSearchText('');
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.userName}>{user.name || 'Unnamed user'}</Text>
                  <AccountVerificationIcon verified={isAccountActive(user)} size={17} />
                </View>
                <Text style={styles.muted}>{user.phoneNumber || user.email || user.id}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
        {selectedUser ? (
          <View style={styles.editPanel}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.listTitle}>User details: {selectedUser.name || selectedUser.id}</Text>
              <AccountVerificationIcon verified={isAccountActive(selectedUser)} size={17} />
            </View>
            <Field label="Name" value={profileName} onChange={setProfileName} />
            <Field label="Phone number" value={profilePhone} onChange={setProfilePhone} keyboardType="phone-pad" />
            <Field label="ID number" value={profileIdNumber} onChange={setProfileIdNumber} />
            <Field label="Home address" value={profileHomeAddress} onChange={setProfileHomeAddress} />
            <Field label="Email address (profile only; does not change sign-in credentials)" value={profileEmail} onChange={setProfileEmail} keyboardType="email-address" />
            <Field label="Role (p, d, r, or a)" value={profileRole} onChange={setProfileRole} />
            <Field label="Clinic ID (used to assign doctors to clinics)" value={profileClinicId} onChange={setProfileClinicId} />
            <View style={styles.collectionHeading}>
              <Text style={[styles.muted, { flex: 1 }]}>Account active</Text>
              <Switch
                value={profileAccountActive}
                onValueChange={setProfileAccountActive}
                accessibilityLabel="Set account active"
              />
            </View>
            <Text style={styles.muted}>
              Additional profile fields can be edited as JSON. This lets you maintain fields beyond the standard profile details.
            </Text>
            <Field
              label="Additional profile data (JSON object)"
              value={profileAdditionalJson}
              onChange={setProfileAdditionalJson}
              multiline
            />
            <Button title="Save user details" disabled={busy} onPress={() => void runAction(async () => {
              let additionalFields: unknown;
              try {
                additionalFields = JSON.parse(profileAdditionalJson);
              } catch (error) {
                throw new Error(`Additional profile JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
              }
              if (!additionalFields || typeof additionalFields !== 'object' || Array.isArray(additionalFields)) {
                throw new Error('Additional profile data must be a JSON object.');
              }
              await updateAdminUserProfile(selectedUser.id, {
                ...(additionalFields as Record<string, unknown>),
                name: profileName.trim(),
                phoneNumber: profilePhone.trim(),
                idNumber: profileIdNumber.trim(),
                homeAddress: profileHomeAddress.trim(),
                email: profileEmail.trim(),
                role: profileRole.trim(),
                clinicId: profileClinicId.trim(),
                accountVerified: profileAccountActive,
                accountStatus: profileAccountActive ? 'active' : 'inactive',
              });
              const updated = await getUserById(selectedUser.id) as UserRecord;
              setSelectedUser(updated);
              setSearchResults((users) => users.map((user) => user.id === updated.id ? updated : user));
              setProfileRole(updated.role || '');
              setProfileClinicId(updated.clinicId || '');
              setProfileAccountActive(isAccountActive(updated));
              setProfileAdditionalJson(stringifyAdditionalUserFields(updated));
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
        <Text style={styles.cardTitle}>Make an appointment</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.muted}>
            {selectedUser
              ? `Patient: ${selectedUser.name || selectedUser.id} (${selectedUser.id})`
              : 'Search for and select a patient first.'}
          </Text>
          {selectedUser && <AccountVerificationIcon verified={isAccountActive(selectedUser)} size={17} />}
        </View>
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
        lastUpdated={appointmentsLastUpdated}
      />
      <AppointmentCalendar
        title="All appointments"
        appointments={appointments}
        lastUpdated={appointmentsLastUpdated}
      />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>QR code tools</Text>
        <Text style={styles.muted}>
          Open the app’s existing QR scanner or patient QR generator.
        </Text>
        <Pressable
          style={styles.qrToolButton}
          onPress={() => router.push('/qrscanner' as Href)}
          accessibilityRole="button"
        >
          <Ionicons name="scan-outline" size={20} color={theme.colors.onPrimary} />
          <Text style={styles.qrToolButtonText}>Open doctor QR scanner</Text>
        </Pressable>
        <Pressable
          style={[styles.qrToolButton, styles.qrToolButtonSecondary]}
          onPress={() => router.push('/qrgenerator' as Href)}
          accessibilityRole="button"
        >
          <Ionicons name="qr-code-outline" size={20} color={theme.colors.onPrimary} />
          <Text style={styles.qrToolButtonText}>Open patient QR generator</Text>
        </Pressable>
      </View>
        </>
      )}
    </ScrollView>
    </SafeAreaView>
  );
}

function useScreenStyles() {
  const { theme } = useAppTheme();
  return useMemo(() => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.small,
    marginBottom: theme.spacing.medium,
  },
  homeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: {
    padding: theme.spacing.medium,
    paddingTop: 0,
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
  userSuggestions: {
    maxHeight: 220,
    marginTop: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: theme.colors.secondaryBorder,
    borderRadius: 8,
    backgroundColor: theme.colors.background,
  },
  userSuggestion: {
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.secondaryBorder,
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
  collectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collectionPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: theme.spacing.small,
  },
  collectionChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.colors.secondaryBorder,
    borderRadius: 16,
    backgroundColor: theme.colors.background,
  },
  selectedCollectionChip: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.backgroundSelected,
  },
  collectionChipText: {
    color: theme.colors.textDark,
    fontSize: theme.fontSizes.small,
    fontWeight: '600',
  },
  documentActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
    marginTop: theme.spacing.small,
  },
  qrToolButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: theme.spacing.small,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: theme.colors.primary,
  },
  qrToolButtonSecondary: {
    backgroundColor: theme.colors.secondary,
  },
  qrToolButtonText: {
    color: theme.colors.onPrimary,
    fontSize: theme.fontSizes.body,
    fontWeight: '700',
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
