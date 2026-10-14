import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  Platform,
  TextInput,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Team theme
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from '@/constants/theme';

// ---------------------------------------------------------------
// 1. TYPES AND CONSTANTS
// ---------------------------------------------------------------
type Role = 'patient' | 'doctor' | 'receptionist';

// Lifecycle of an appointment (from the data design in Section 7)
type Status =
  | 'booked'
  | 'confirmed'
  | 'checked-in'
  | 'in-progress'
  | 'completed'
  | 'missed'
  | 'cancelled';

type AppointmentType = 'chronic-checkup' | 'medication-collection';

// One appointment document (matches the "appointments" + "tokens" + "queue" collections)
// NOTE: no chronic illness data here. That stays on the patient's phone only.
type Appointment = {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  clinicId: string;
  date: string; // 'YYYY-MM-DD'
  timeSlot: string; // '08:00'
  type: AppointmentType;
  status: Status;
  bookedByPatient: boolean;
  tokenCode: string; // check-in token (the QR screen will use this)
  priorityLevel: number; // queue priority: LOWER number = seen sooner
  checkInTime?: string;
};

type Palette = {
  text: string;
  background: string;
  backgroundElement: string;
  backgroundSelected: string;
  textSecondary: string;
};

type UI = { c: Palette; size: number };

const ACCENT = '#208AEF';
const DANGER = '#E5484D';


const SHOW_DEV_TOOLS = false;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// The clinic opens these time slots every day. One patient per slot.
const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00',
  '10:30', '11:00', '11:30', '13:00', '13:30',
];
const DAILY_SLOT_CAPACITY = TIME_SLOTS.length; // "dailySlotCapacity" in the clinics collection
const CLINIC = { id: 'c1', name: 'Community Clinic' };

// Suggested days between chronic check-ups (the interval scheduler)
const DEFAULT_INTERVAL_DAYS = 30;

const STATUS_INFO: Record<Status, { label: string; color: string }> = {
  booked: { label: 'Booked', color: '#F59E0B' },
  confirmed: { label: 'Confirmed', color: ACCENT },
  'checked-in': { label: 'Checked in', color: '#8B5CF6' },
  'in-progress': { label: 'In progress', color: '#06B6D4' },
  completed: { label: 'Completed', color: '#10B981' },
  missed: { label: 'Missed', color: DANGER },
  cancelled: { label: 'Cancelled', color: '#9CA3AF' },
};

const TYPE_LABEL: Record<AppointmentType, string> = {
  'chronic-checkup': 'Chronic check-up',
  'medication-collection': 'Medication collection',
};

// Placeholder people. In the real app these come from Firebase (users collection).
const PATIENTS = [
  { id: 'p1', name: 'Senzwesihle Zwane', doctorId: 'd1' },
  { id: 'p2', name: 'Thandi Mokoena', doctorId: 'd1' },
  { id: 'p3', name: 'Sipho Dlamini', doctorId: 'd1' },
  { id: 'p4', name: 'Nomsa Khumalo', doctorId: 'd2' }, // belongs to a different doctor
];
const ME = { patientId: 'p1', doctorId: 'd1' };

const APPOINTMENTS_KEY = 'clinicAppointments';
const PATIENTS_KEY = 'clinicPatients'; // the doctor's patient list (add / edit / delete)
const SETTINGS_KEY = 'appSettings'; // saved by the Settings screen

// ---------------------------------------------------------------
// 2. SMALL HELPER FUNCTIONS
// ---------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');

// Dates are stored as 'YYYY-MM-DD' text so we never fight with time zones
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const addDays = (key: string, days: number) => {
  const d = fromKey(key);
  d.setDate(d.getDate() + days);
  return toKey(d);
};

const daysBetween = (from: string, to: string) =>
  Math.round((fromKey(to).getTime() - fromKey(from).getTime()) / 86400000);

const formatLong = (key: string) => {
  const d = fromKey(key);
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

// Random check-in code. In the real app a Cloud Function creates this.
const makeToken = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  for (let i = 0; i < 8; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
};

// Which time slots are already used on a day (cancelled ones are free again)
const takenSlots = (list: Appointment[], dateKey: string) =>
  list.filter((a) => a.date === dateKey && a.status !== 'cancelled').map((a) => a.timeSlot);

// Use the wanted slot if free, otherwise the first free one, otherwise null
const findFreeSlot = (list: Appointment[], dateKey: string, wanted: string) => {
  const taken = takenSlots(list, dateKey);
  if (!taken.includes(wanted)) return wanted;
  return TIME_SLOTS.find((s) => !taken.includes(s)) ?? null;
};

// Alert.alert does nothing on the web, so we use the browser popups there
function notify(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function confirmAction(title: string, message: string, yesText: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onYes();
  } else {
    Alert.alert(title, message, [
      { text: 'No', style: 'cancel' },
      { text: yesText, style: 'destructive', onPress: onYes },
    ]);
  }
}

// ---------------------------------------------------------------
// 3. DATA (REPLACE THESE TWO FUNCTIONS WITH FIRESTORE LATER)
// For now appointments are kept on the phone so the screen works without a backend.
// With Firebase you would use:
//   patient      -> where('patientId', '==', uid)
//   doctor       -> where('doctorId', '==', uid)
//   receptionist -> where('clinicId', '==', clinicId)
// and onSnapshot() so changes appear instantly.
// ---------------------------------------------------------------
function makeSampleAppointments(): Appointment[] {
  const today = toKey(new Date());
  const make = (
    id: string,
    patientId: string,
    dayOffset: number,
    timeSlot: string,
    type: AppointmentType,
    status: Status,
    extra: Partial<Appointment> = {},
  ): Appointment => {
    const patient = PATIENTS.find((p) => p.id === patientId)!;
    return {
      id,
      patientId,
      patientName: patient.name,
      doctorId: patient.doctorId,
      clinicId: CLINIC.id,
      date: addDays(today, dayOffset),
      timeSlot,
      type,
      status,
      bookedByPatient: true,
      tokenCode: makeToken(),
      priorityLevel: 5,
      ...extra,
    };
  };

  return [
    // Today
    make('a1', 'p1', 0, '09:00', 'chronic-checkup', 'confirmed'),
    make('a2', 'p2', 0, '08:00', 'chronic-checkup', 'checked-in', { checkInTime: new Date().toISOString() }),
    make('a3', 'p3', 0, '10:00', 'medication-collection', 'booked'),
    make('a4', 'p4', 0, '08:30', 'chronic-checkup', 'in-progress'),
    // Future
    make('a5', 'p1', 3, '10:00', 'medication-collection', 'booked'),
    make('a6', 'p2', 8, '09:00', 'chronic-checkup', 'confirmed', { bookedByPatient: false }),
    make('a7', 'p3', 14, '11:00', 'chronic-checkup', 'booked'),
    // Past
    make('a8', 'p1', -10, '08:30', 'chronic-checkup', 'completed'),
    make('a9', 'p2', -5, '09:30', 'chronic-checkup', 'missed'),
  ];
}

async function loadAppointments(): Promise<Appointment[]> {
  try {
    const saved = await AsyncStorage.getItem(APPOINTMENTS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (error) {
    console.log('Could not load appointments', error);
  }
  return makeSampleAppointments();
}

async function saveAppointments(list: Appointment[]) {
  try {
    await AsyncStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(list));
  } catch (error) {
    console.log('Could not save appointments', error);
  }
}

// ---------------------------------------------------------------
// 4. SMALL REUSABLE COMPONENTS
// ---------------------------------------------------------------

// A pill button used for choices (type, slot, patient, repeat)
function Chip({ text, active, disabled, onPress, ui }: any) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={text}
      style={[
        styles.chip,
        { backgroundColor: active ? ACCENT : ui.c.backgroundSelected, opacity: disabled ? 0.35 : 1 },
      ]}
    >
      <Text style={{ fontSize: ui.size - 2, fontWeight: '600', color: active ? '#fff' : ui.c.text }}>{text}</Text>
    </Pressable>
  );
}

// The month grid. Sunday first, like the wireframe.
function MonthGrid({ year, month, selected, todayKey, byDate, onSelect, ui }: any) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Empty cells first, then the day numbers, then empty cells to finish the last row
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // Split into weeks of 7
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((name) => (
          <Text key={name} style={[styles.weekdayText, { color: ui.c.textSecondary, fontSize: ui.size - 4 }]}>
            {name}
          </Text>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.weekRow}>
          {week.map((day, dayIndex) => {
            if (day === null) return <View key={dayIndex} style={styles.dayCell} />;

            const key = `${year}-${pad(month + 1)}-${pad(day)}`;
            const appts: Appointment[] = (byDate[key] || []).filter((a: Appointment) => a.status !== 'cancelled');
            const isSelected = key === selected;
            const isToday = key === todayKey;

            return (
              <Pressable
                key={dayIndex}
                style={styles.dayCell}
                onPress={() => onSelect(key)}
                accessibilityRole="button"
                accessibilityLabel={`${day} ${MONTHS[month]}, ${appts.length} appointments`}
              >
                <View
                  style={[
                    styles.dayCircle,
                    isSelected && { backgroundColor: ACCENT },
                    !isSelected && isToday && { borderWidth: 2, borderColor: ACCENT },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: ui.size - 1,
                      fontWeight: isSelected || isToday ? '700' : '500',
                      color: isSelected ? '#fff' : ui.c.text,
                    }}
                  >
                    {day}
                  </Text>
                </View>
                {/* Up to 3 coloured dots, one per appointment, coloured by status */}
                <View style={styles.dotRow}>
                  {appts.slice(0, 3).map((a) => (
                    <View key={a.id} style={[styles.dot, { backgroundColor: STATUS_INFO[a.status].color }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// One appointment in the list below the calendar
function AppointmentCard({ appt, role, ui, position, hint, actions }: any) {
  const info = STATUS_INFO[appt.status as Status];
  // Patients see the visit type. Staff see the patient's name.
  const title = role === 'patient' ? TYPE_LABEL[appt.type as AppointmentType] : appt.patientName;
  const subtitle = role === 'patient' ? CLINIC.name : TYPE_LABEL[appt.type as AppointmentType];

  return (
    <View style={[styles.card, { backgroundColor: ui.c.backgroundElement }]}>
      <View style={styles.cardTop}>
        {position ? (
          <Text style={{ fontSize: ui.size + 3, fontWeight: '800', color: ACCENT, marginRight: 10 }}>#{position}</Text>
        ) : null}
        <View style={[styles.timeBox, { backgroundColor: ui.c.backgroundSelected }]}>
          <Text style={{ fontSize: ui.size - 1, fontWeight: '700', color: ui.c.text }}>{appt.timeSlot}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: ui.size, fontWeight: '600', color: ui.c.text }}>{title}</Text>
          <Text style={{ fontSize: ui.size - 3, color: ui.c.textSecondary, marginTop: 2 }}>{subtitle}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: info.color + '26' }]}>
          <Text style={{ fontSize: ui.size - 5, fontWeight: '700', color: info.color }}>{info.label}</Text>
        </View>
      </View>

      {hint ? (
        <View style={styles.hintRow}>
          <Ionicons name="notifications-outline" size={14} color={ui.c.textSecondary} />
          <Text style={{ fontSize: ui.size - 4, color: ui.c.textSecondary, marginLeft: 6, flex: 1 }}>{hint}</Text>
        </View>
      ) : null}

      {actions.length > 0 && (
        <View style={styles.actionRow}>
          {actions.map((action: any) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              accessibilityRole="button"
              style={[
                styles.actionButton,
                action.kind === 'primary' && { backgroundColor: ACCENT },
                action.kind === 'danger' && { backgroundColor: DANGER + '1F' },
                action.kind === 'plain' && { backgroundColor: ui.c.backgroundSelected },
              ]}
            >
              <Text
                style={{
                  fontSize: ui.size - 3,
                  fontWeight: '700',
                  color: action.kind === 'primary' ? '#fff' : action.kind === 'danger' ? DANGER : ui.c.text,
                }}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// Pop-up used to book (patient) or schedule (doctor) an appointment
function ScheduleModal({ visible, onClose, onSave, dateKey, isDoctor, patients, taken, ui }: any) {
  const [type, setType] = useState<AppointmentType>('chronic-checkup');
  const [slot, setSlot] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [repeatDays, setRepeatDays] = useState(0);

  const close = () => {
    setSlot(null);
    setPatientId(null);
    setRepeatDays(0);
    onClose();
  };

  const save = () => {
    if (isDoctor && !patientId) return notify('Choose a patient', 'Please pick a patient first.');
    if (!slot) return notify('Choose a time', 'Please pick a time slot.');
    onSave({ patientId, type, slot, repeatDays });
    close();
  };

  const sectionLabel = [styles.modalLabel, { color: ui.c.textSecondary, fontSize: ui.size - 4 }];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: ui.c.background }]}>
          <ScrollView>
            <Text style={{ fontSize: ui.size + 5, fontWeight: '800', color: ui.c.text }}>
              {isDoctor ? 'Schedule check-up' : 'Book appointment'}
            </Text>
            <Text style={{ fontSize: ui.size - 1, color: ui.c.textSecondary, marginTop: 4 }}>{formatLong(dateKey)}</Text>

            {isDoctor && (
              <>
                <Text style={sectionLabel}>PATIENT</Text>
                <View style={styles.chipWrap}>
                  {patients.map((p: any) => (
                    <Chip key={p.id} text={p.name} active={patientId === p.id} onPress={() => setPatientId(p.id)} ui={ui} />
                  ))}
                </View>
              </>
            )}

            <Text style={sectionLabel}>VISIT TYPE</Text>
            <View style={styles.chipWrap}>
              <Chip text="Chronic check-up" active={type === 'chronic-checkup'} onPress={() => setType('chronic-checkup')} ui={ui} />
              <Chip text="Medication collection" active={type === 'medication-collection'} onPress={() => setType('medication-collection')} ui={ui} />
            </View>

            <Text style={sectionLabel}>
              TIME SLOT ({DAILY_SLOT_CAPACITY - taken.length} of {DAILY_SLOT_CAPACITY} free)
            </Text>
            <View style={styles.chipWrap}>
              {TIME_SLOTS.map((s) => (
                <Chip key={s} text={s} active={slot === s} disabled={taken.includes(s)} onPress={() => setSlot(s)} ui={ui} />
              ))}
            </View>

            {isDoctor && (
              <>
                <Text style={sectionLabel}>REPEAT (RECURRING CHECK-UPS, 3 VISITS)</Text>
                <View style={styles.chipWrap}>
                  <Chip text="Once" active={repeatDays === 0} onPress={() => setRepeatDays(0)} ui={ui} />
                  <Chip text="Every month" active={repeatDays === 30} onPress={() => setRepeatDays(30)} ui={ui} />
                  <Chip text="Every 2 months" active={repeatDays === 60} onPress={() => setRepeatDays(60)} ui={ui} />
                  <Chip text="Every 3 months" active={repeatDays === 90} onPress={() => setRepeatDays(90)} ui={ui} />
                </View>
              </>
            )}

            <View style={styles.modalButtons}>
              <Pressable style={[styles.modalButton, { backgroundColor: ui.c.backgroundSelected }]} onPress={close}>
                <Text style={{ fontSize: ui.size, fontWeight: '700', color: ui.c.text }}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalButton, { backgroundColor: ACCENT }]} onPress={save}>
                <Text style={{ fontSize: ui.size, fontWeight: '700', color: '#fff' }}>Confirm</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// Pop-up used by the doctor to add a patient or edit a patient's name
function PatientModal({ visible, title, initialName, onClose, onSave, ui }: any) {
  const [name, setName] = useState(initialName);

  // Fill the box with the current name each time the pop-up opens
  useEffect(() => {
    if (visible) setName(initialName);
  }, [visible, initialName]);

  const save = () => {
    if (name.trim().length < 2) return notify('Name needed', 'Please type the patient\'s full name.');
    onSave(name.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: ui.c.background }]}>
          <Text style={{ fontSize: ui.size + 5, fontWeight: '800', color: ui.c.text }}>{title}</Text>
          <Text style={[styles.modalLabel, { color: ui.c.textSecondary, fontSize: ui.size - 4 }]}>FULL NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Thandi Mokoena"
            placeholderTextColor={ui.c.textSecondary}
            style={[styles.input, { backgroundColor: ui.c.backgroundElement, color: ui.c.text, fontSize: ui.size }]}
          />
          <View style={styles.modalButtons}>
            <Pressable style={[styles.modalButton, { backgroundColor: ui.c.backgroundSelected }]} onPress={onClose}>
              <Text style={{ fontSize: ui.size, fontWeight: '700', color: ui.c.text }}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.modalButton, { backgroundColor: ACCENT }]} onPress={save}>
              <Text style={{ fontSize: ui.size, fontWeight: '700', color: '#fff' }}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------
// 5. THE CALENDAR SCREEN
// ---------------------------------------------------------------
export default function CalendarScreen() {
  const router = useRouter();
  const systemScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const todayKey = toKey(new Date());

  // In the real app the role + verification come from the logged-in user's Firestore document.
  const [role, setRole] = useState<Role>('patient');
  const [isVerified, setIsVerified] = useState(true); // accountStatus === 'active'

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState(todayKey);
  const [viewMonth, setViewMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Doctor's patient list. patientModal = null (closed), or add / edit with the patient being edited.
  const [patients, setPatients] = useState(PATIENTS);
  const [patientModal, setPatientModal] = useState<{ mode: 'add' | 'edit'; id?: string; name: string } | null>(null);

  // Theme, text size and reminder time saved by the Settings screen
  const [appSettings, setAppSettings] = useState({ themeMode: 'system', fontSize: 'medium', reminderTime: 'day' });

useEffect(() => {
    loadAppointments().then(setAppointments);
    AsyncStorage.getItem(PATIENTS_KEY)
      .then((saved) => {
        if (saved) setPatients(JSON.parse(saved));
      })
      .catch(() => {});

    // Read the user role saved by the login flow
    AsyncStorage.getItem('userRole').then((savedRole) => {
      if (savedRole && (savedRole === 'patient' || savedRole === 'doctor' || savedRole === 'receptionist')) {
        setRole(savedRole as Role);
      }
    }).catch(() => {});
  }, []);

  // Re-read the settings every time the user comes back to this screen
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(SETTINGS_KEY)
        .then((saved) => {
          if (!saved) return;
          const p = JSON.parse(saved);
          setAppSettings({
            themeMode: p.themeMode ?? 'system',
            fontSize: p.fontSize ?? 'medium',
            reminderTime: p.reminderTime ?? 'day',
          });
        })
        .catch(() => {});
    }, []),
  );

  const scheme = appSettings.themeMode === 'dark' ? 'dark' : appSettings.themeMode === 'light' ? 'light' : systemScheme;
  const size = appSettings.fontSize === 'small' ? 15 : appSettings.fontSize === 'large' ? 20 : 17;
  const ui: UI = { c: Colors[scheme], size };
  const reminderLabel = appSettings.reminderTime === 'hours' ? '2 hours before' : '1 day before';

  // ----- Change data -----
  const saveAndSet = (list: Appointment[]) => {
    setAppointments(list);
    saveAppointments(list);
  };

  const updateAppointment = (id: string, changes: Partial<Appointment>) => {
    saveAndSet(appointments.map((a) => (a.id === id ? { ...a, ...changes } : a)));
  };

  const cancelAppointment = (appt: Appointment) => {
    confirmAction('Cancel appointment?', `${formatLong(appt.date)} at ${appt.timeSlot}`, 'Cancel it', () =>
      updateAppointment(appt.id, { status: 'cancelled' }),
    );
  };

  // ----- Doctor: manage the patient list -----
  const savePatients = (list: typeof PATIENTS) => {
    setPatients(list);
    AsyncStorage.setItem(PATIENTS_KEY, JSON.stringify(list)).catch(() => {});
  };

  // Add a new patient, or rename an existing one
  const handlePatientSave = (name: string) => {
    if (!patientModal) return;
    if (patientModal.mode === 'add') {
      savePatients([...patients, { id: `p${Date.now()}`, name, doctorId: ME.doctorId }]);
    } else {
      savePatients(patients.map((p) => (p.id === patientModal.id ? { ...p, name } : p)));
      // Keep the name on their bookings in sync
      saveAndSet(appointments.map((a) => (a.patientId === patientModal.id ? { ...a, patientName: name } : a)));
    }
    setPatientModal(null);
  };

  // Delete a patient. Their upcoming bookings are cancelled, past visits stay as history.
  const deletePatient = (patient: { id: string; name: string }) => {
    confirmAction('Delete patient?', `${patient.name} will be removed and their upcoming bookings cancelled.`, 'Delete', () => {
      savePatients(patients.filter((p) => p.id !== patient.id));
      saveAndSet(
        appointments.map((a) =>
          a.patientId === patient.id && a.date >= todayKey && (a.status === 'booked' || a.status === 'confirmed')
            ? { ...a, status: 'cancelled' as Status }
            : a,
        ),
      );
    });
  };

  // Receptionist: move a checked-in patient to the front of the queue
  const moveUp = (appt: Appointment) => {
    const queue = appointments
      .filter((a) => a.date === todayKey && a.status === 'checked-in')
      .sort(queueSort);
    if (queue[0]?.id === appt.id) return notify('Already first', 'This patient is already first in the queue.');
    // Priority just below the lowest number in the queue = seen first
    const best = Math.min(...queue.map((a) => a.priorityLevel));
    updateAppointment(appt.id, { priorityLevel: best - 1 });
  };

  // Patient books one appointment. Doctor can create a repeating series (recurring check-ups).
  const handleSave = (data: { patientId: string | null; type: AppointmentType; slot: string; repeatDays: number }) => {
    const patient = (patients.find((p) => p.id === (data.patientId ?? ME.patientId)) ?? PATIENTS[0])!;
    const count = data.repeatDays > 0 ? 3 : 1;
    let list = [...appointments];
    let created = 0;
    let skipped = 0;

    for (let i = 0; i < count; i++) {
      const dateKey = addDays(selected, i * data.repeatDays);
      const alreadyBooked = list.some((a) => a.patientId === patient.id && a.date === dateKey && a.status !== 'cancelled');
      const slot = findFreeSlot(list, dateKey, data.slot);
      if (alreadyBooked || !slot) {
        skipped++;
        continue;
      }
      list.push({
        id: `a${Date.now()}${i}`,
        patientId: patient.id,
        patientName: patient.name,
        doctorId: patient.doctorId,
        clinicId: CLINIC.id,
        date: dateKey,
        timeSlot: slot,
        type: data.type,
        // Set by the patient = booked. Set by the doctor = already confirmed.
        status: role === 'doctor' ? 'confirmed' : 'booked',
        bookedByPatient: role === 'patient',
        tokenCode: makeToken(),
        priorityLevel: 5,
      });
      created++;
    }

    saveAndSet(list);
    if (created === 0) notify('Nothing booked', 'Those days are full or the patient already has a visit.');
    else if (skipped > 0) notify('Done', `${created} booked. ${skipped} skipped (full day or already booked).`);
    else notify('Done', created === 1 ? 'Appointment booked.' : `${created} check-ups scheduled.`);
  };

  // ----- What each role can see -----
  const visible = appointments.filter((a) => {
    if (role === 'patient') return a.patientId === ME.patientId;
    if (role === 'doctor') return a.doctorId === ME.doctorId;
    return true; // receptionist sees the whole clinic
  });

  // Group by date so the calendar can draw dots quickly
  const byDate: Record<string, Appointment[]> = {};
  visible.forEach((a) => {
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  });

  const dayAppointments = visible
    .filter((a) => a.date === selected)
    .sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));

  // Queue order: in-progress first, then lowest priority number, then earliest check-in
  function queueSort(a: Appointment, b: Appointment) {
    if (a.status === 'in-progress' && b.status !== 'in-progress') return -1;
    if (b.status === 'in-progress' && a.status !== 'in-progress') return 1;
    if (a.priorityLevel !== b.priorityLevel) return a.priorityLevel - b.priorityLevel;
    return (a.checkInTime ?? '').localeCompare(b.checkInTime ?? '');
  }

  // The list below the calendar. The receptionist sees today as a live queue.
  type Section = { title: string; items: Appointment[]; numbered?: boolean };
  let sections: Section[] = [];
  if (role === 'receptionist' && selected === todayKey) {
    sections = [
      {
        title: 'Live queue',
        items: dayAppointments.filter((a) => a.status === 'checked-in' || a.status === 'in-progress').sort(queueSort),
        numbered: true,
      },
      { title: 'Waiting to arrive', items: dayAppointments.filter((a) => a.status === 'booked' || a.status === 'confirmed') },
      { title: 'Finished', items: dayAppointments.filter((a) => ['completed', 'missed', 'cancelled'].includes(a.status)) },
    ].filter((s) => s.items.length > 0);
  } else if (dayAppointments.length > 0) {
    sections = [{ title: 'Appointments', items: dayAppointments }];
  }

  // ----- Buttons shown on each appointment, depending on role and status -----
  const actionsFor = (a: Appointment) => {
    const isActive = a.status === 'booked' || a.status === 'confirmed';
    const isToday = a.date === todayKey;
    const isPastDay = a.date < todayKey;
    const actions: { label: string; kind: 'primary' | 'danger' | 'plain'; onPress: () => void }[] = [];
    const cancel = { label: 'Cancel', kind: 'danger' as const, onPress: () => cancelAppointment(a) };

    if (role === 'patient') {
      if (isActive && !isPastDay) actions.push(cancel);
    }

    if (role === 'doctor') {
      if (isActive && !isPastDay) actions.push(cancel);
    }

    if (role === 'receptionist') {
      if (a.status === 'booked') {
        actions.push({ label: 'Confirm', kind: 'primary', onPress: () => updateAppointment(a.id, { status: 'confirmed' }) });
      }
      if (isActive && isToday) {
        actions.push({ label: 'Mark missed', kind: 'danger', onPress: () => updateAppointment(a.id, { status: 'missed' }) });
        // The QR scanner screen (built by a teammate) will also set 'checked-in'.
        // This button is a manual check-in, e.g. for patients without a phone.
        if (a.status === 'confirmed') {
          actions.push({
            label: 'Check in',
            kind: 'plain',
            onPress: () => updateAppointment(a.id, { status: 'checked-in', checkInTime: new Date().toISOString() }),
          });
        }
      }
      if (a.status === 'checked-in') {
        actions.push({ label: 'Start', kind: 'primary', onPress: () => updateAppointment(a.id, { status: 'in-progress' }) });
        actions.push({ label: 'Move up', kind: 'plain', onPress: () => moveUp(a) });
      }
      if (a.status === 'in-progress') {
        actions.push({ label: 'Complete', kind: 'primary', onPress: () => updateAppointment(a.id, { status: 'completed' }) });
      }
    }
    return actions;
  };

  // Small grey line under a patient's upcoming appointment
  const hintFor = (a: Appointment) => {
    if (role !== 'patient') return undefined;
    const isActive = a.status === 'booked' || a.status === 'confirmed';
    if (!isActive) return undefined;
    if (a.date === todayKey) return 'Your appointment is today. Please arrive at the clinic on time.';
    if (a.date > todayKey) return `Reminder ${reminderLabel}.`;
    return undefined;
  };

  // ----- Interval scheduler: suggest the next visit from the last completed one -----
  const lastVisit = visible
    .filter((a) => role === 'patient' && a.status === 'completed')
    .map((a) => a.date)
    .sort()
    .pop();
  let suggestion: { date: string; text: string } | null = null;
  if (role === 'patient' && lastVisit) {
    const wanted = addDays(lastVisit, DEFAULT_INTERVAL_DAYS);
    const date = wanted > todayKey ? wanted : addDays(todayKey, 1);
    suggestion = {
      date,
      text: `${daysBetween(lastVisit, todayKey)} days since your last visit. Next suggested visit: ${formatLong(date)}.`,
    };
  }

  // ----- Calendar navigation -----
  const goToDate = (key: string) => {
    const d = fromKey(key);
    setSelected(key);
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
  };

  const changeMonth = (step: number) => {
    const d = new Date(viewMonth.year, viewMonth.month + step, 1);
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
  };

  // ----- Role-specific text and rules -----
  const titles: Record<Role, { title: string; subtitle: string }> = {
    patient: { title: 'My Calendar', subtitle: 'Your clinic visits and check-in codes' },
    doctor: { title: 'Patient Schedule', subtitle: 'Bookings for your assigned patients' },
    receptionist: { title: 'Clinic Schedule', subtitle: "Today's queue and bookings" },
  };

  const isPastSelected = selected < todayKey;
  const canSchedule = (role === 'doctor' || (role === 'patient' && isVerified)) && !isPastSelected;
  const bookedToday = takenSlots(visible, selected).length;
  const doctorPatients = patients.filter((p) => p.doctorId === ME.doctorId);

  // Doctor's "Calendar Summary": future bookings with their assigned patients
  const isActiveStatus = (s: Status) => s === 'booked' || s === 'confirmed' || s === 'checked-in' || s === 'in-progress';
  const doctorAppts = appointments.filter((a) => a.doctorId === ME.doctorId && isActiveStatus(a.status));
  const todayCount = doctorAppts.filter((a) => a.date === todayKey).length;
  const upcoming = doctorAppts
    .filter((a) => a.date > todayKey)
    .sort((a, b) => (a.date + a.timeSlot).localeCompare(b.date + b.timeSlot));
  const upcomingCount = (patientId: string) => upcoming.filter((a) => a.patientId === patientId).length;

  // ----- What the screen looks like -----
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: ui.c.background }}>
      <ScrollView
        contentContainerStyle={{
          width: '100%',
          maxWidth: MaxContentWidth,
          alignSelf: 'center',
          paddingHorizontal: Spacing.three,
          paddingBottom: BottomTabInset + Spacing.five,
        }}
      >
        {/* HEADER with the home icon from the wireframe */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 30, fontWeight: '800', color: ui.c.text }}>{titles[role].title}</Text>
            <Text style={{ fontSize: ui.size - 2, color: ui.c.textSecondary, marginTop: 2 }}>{titles[role].subtitle}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/')}
            accessibilityRole="button"
            accessibilityLabel="Home"
            style={[styles.homeButton, { backgroundColor: ui.c.backgroundElement }]}
          >
            <Ionicons name="home" size={22} color={ui.c.text} />
          </Pressable>
        </View>

        {/* DEV ONLY: switch role to test each version of the calendar */}
        {SHOW_DEV_TOOLS && (
          <View style={[styles.devBox, { backgroundColor: ui.c.backgroundElement }]}>
            <Text style={{ fontSize: ui.size - 5, fontWeight: '700', color: ui.c.textSecondary, marginBottom: 8 }}>
              DEVELOPER TESTING
            </Text>
            <View style={styles.chipWrap}>
              <Chip text="Patient" active={role === 'patient'} onPress={() => setRole('patient')} ui={ui} />
              <Chip text="Doctor" active={role === 'doctor'} onPress={() => setRole('doctor')} ui={ui} />
              <Chip text="Receptionist" active={role === 'receptionist'} onPress={() => setRole('receptionist')} ui={ui} />
            </View>
            <View style={styles.chipWrap}>
              <Chip text={isVerified ? 'Patient verified' : 'Patient NOT verified'} active={isVerified} onPress={() => setIsVerified(!isVerified)} ui={ui} />
              <Chip
                text="Reset sample data"
                onPress={() => {
                  savePatients(PATIENTS);
                  saveAndSet(makeSampleAppointments());
                  goToDate(todayKey);
                }}
                ui={ui}
              />
            </View>
          </View>
        )}

        {/* Unverified patients cannot book (accountStatus gate) */}
        {role === 'patient' && !isVerified && (
          <View style={[styles.banner, { backgroundColor: '#F59E0B26' }]}>
            <Ionicons name="lock-closed" size={20} color="#F59E0B" />
            <Text style={{ flex: 1, marginLeft: 10, fontSize: ui.size - 2, color: ui.c.text }}>
              Your account is not verified yet. Visit your clinic so your doctor can activate it. Booking is switched off until then.
            </Text>
          </View>
        )}

        {/* Next-visit suggestion (patients) */}
        {suggestion && isVerified && (
          <View style={[styles.banner, { backgroundColor: ACCENT + '1F' }]}>
            <Ionicons name="bulb-outline" size={20} color={ACCENT} />
            <Text style={{ flex: 1, marginLeft: 10, fontSize: ui.size - 2, color: ui.c.text }}>{suggestion.text}</Text>
            <Pressable onPress={() => goToDate(suggestion!.date)} accessibilityRole="button">
              <Text style={{ fontSize: ui.size - 2, fontWeight: '700', color: ACCENT }}>Go</Text>
            </Pressable>
          </View>
        )}

        {/* DOCTOR: calendar summary + patient list (from the wireframe) */}
        {role === 'doctor' && (
          <>
            <Text style={[styles.listTitle, { color: ui.c.textSecondary, fontSize: ui.size - 4, marginTop: 0 }]}>CALENDAR SUMMARY</Text>
            <View style={styles.statRow}>
              {[
                { label: 'Today', value: todayCount },
                { label: 'Upcoming', value: upcoming.length },
                { label: 'Patients', value: doctorPatients.length },
              ].map((s) => (
                <View key={s.label} style={[styles.statBox, { backgroundColor: ui.c.backgroundElement }]}>
                  <Text style={{ fontSize: ui.size + 9, fontWeight: '800', color: ACCENT }}>{s.value}</Text>
                  <Text style={{ fontSize: ui.size - 4, color: ui.c.textSecondary }}>{s.label}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.calendarBox, { backgroundColor: ui.c.backgroundElement, paddingBottom: Spacing.two, marginBottom: Spacing.three }]}>
              <Text style={{ fontSize: ui.size - 1, fontWeight: '700', color: ui.c.text, margin: Spacing.two }}>Future bookings</Text>
              {upcoming.length === 0 ? (
                <Text style={{ fontSize: ui.size - 2, color: ui.c.textSecondary, margin: Spacing.two }}>No upcoming bookings.</Text>
              ) : (
                upcoming.slice(0, 5).map((a) => (
                  <Pressable key={a.id} onPress={() => goToDate(a.date)} style={styles.summaryRow} accessibilityRole="button">
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: ui.size - 1, fontWeight: '600', color: ui.c.text }}>{a.patientName}</Text>
                      <Text style={{ fontSize: ui.size - 4, color: ui.c.textSecondary }}>
                        {formatLong(a.date)} at {a.timeSlot} • {TYPE_LABEL[a.type]}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={ui.c.textSecondary} />
                  </Pressable>
                ))
              )}
              {upcoming.length > 5 && (
                <Text style={{ fontSize: ui.size - 4, color: ui.c.textSecondary, margin: Spacing.two }}>
                  + {upcoming.length - 5} more. Tap a day on the calendar below.
                </Text>
              )}
            </View>

            <Text style={[styles.listTitle, { color: ui.c.textSecondary, fontSize: ui.size - 4, marginTop: 0 }]}>PATIENT LIST</Text>
            <View style={[styles.calendarBox, { backgroundColor: ui.c.backgroundElement, paddingBottom: Spacing.two, marginBottom: Spacing.three }]}>
              {doctorPatients.length === 0 && (
                <Text style={{ fontSize: ui.size - 2, color: ui.c.textSecondary, margin: Spacing.two }}>No patients yet. Tap Add patient.</Text>
              )}
              {doctorPatients.map((p) => (
                <View key={p.id} style={styles.summaryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: ui.size - 1, fontWeight: '600', color: ui.c.text }}>{p.name}</Text>
                    <Text style={{ fontSize: ui.size - 4, color: ui.c.textSecondary }}>{upcomingCount(p.id)} upcoming booking(s)</Text>
                  </View>
                  <Pressable
                    onPress={() => setPatientModal({ mode: 'edit', id: p.id, name: p.name })}
                    accessibilityRole="button"
                    style={[styles.actionButton, { backgroundColor: ui.c.backgroundSelected }]}
                  >
                    <Text style={{ fontSize: ui.size - 3, fontWeight: '700', color: ui.c.text }}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => deletePatient(p)}
                    accessibilityRole="button"
                    style={[styles.actionButton, { backgroundColor: DANGER + '1F', marginRight: 0 }]}
                  >
                    <Text style={{ fontSize: ui.size - 3, fontWeight: '700', color: DANGER }}>Delete</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable
                onPress={() => setPatientModal({ mode: 'add', name: '' })}
                accessibilityRole="button"
                style={[styles.primaryButton, { backgroundColor: ACCENT, alignSelf: 'center', marginTop: Spacing.two }]}
              >
                <Ionicons name="person-add" size={16} color="#fff" />
                <Text style={{ fontSize: ui.size - 2, fontWeight: '700', color: '#fff', marginLeft: 6 }}>Add patient</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* MONTH CALENDAR */}
        <View style={[styles.calendarBox, { backgroundColor: ui.c.backgroundElement }]}>
          <View style={styles.monthRow}>
            <Pressable onPress={() => changeMonth(-1)} style={styles.navButton} accessibilityLabel="Previous month">
              <Ionicons name="chevron-back" size={24} color={ui.c.text} />
            </Pressable>
            <Text style={{ fontSize: ui.size + 2, fontWeight: '700', color: ui.c.text }}>
              {MONTHS[viewMonth.month]} {viewMonth.year}
            </Text>
            <Pressable onPress={() => changeMonth(1)} style={styles.navButton} accessibilityLabel="Next month">
              <Ionicons name="chevron-forward" size={24} color={ui.c.text} />
            </Pressable>
          </View>

          <MonthGrid
            year={viewMonth.year}
            month={viewMonth.month}
            selected={selected}
            todayKey={todayKey}
            byDate={byDate}
            onSelect={setSelected}
            ui={ui}
          />

          <Pressable onPress={() => goToDate(todayKey)} style={styles.todayButton} accessibilityRole="button">
            <Text style={{ fontSize: ui.size - 2, fontWeight: '700', color: ACCENT }}>Jump to today</Text>
          </Pressable>
        </View>

        {/* SELECTED DAY */}
        <View style={styles.dayHeader}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: ui.size + 2, fontWeight: '700', color: ui.c.text }}>
              {formatLong(selected)}
              {selected === todayKey ? '  •  Today' : ''}
            </Text>
            <Text style={{ fontSize: ui.size - 3, color: ui.c.textSecondary, marginTop: 2 }}>
              {role === 'receptionist'
                ? `${bookedToday} of ${DAILY_SLOT_CAPACITY} slots booked`
                : `${dayAppointments.filter((a) => a.status !== 'cancelled').length} appointment(s)`}
            </Text>
          </View>
          {role !== 'receptionist' && (
            <Pressable
              onPress={() => setScheduleOpen(true)}
              disabled={!canSchedule}
              accessibilityRole="button"
              style={[styles.primaryButton, { backgroundColor: ACCENT, opacity: canSchedule ? 1 : 0.35 }]}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={{ fontSize: ui.size - 2, fontWeight: '700', color: '#fff', marginLeft: 4 }}>
                {role === 'doctor' ? 'Schedule' : 'Book'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Receptionist: how full is the clinic today? */}
        {role === 'receptionist' && (
          <View style={[styles.progressTrack, { backgroundColor: ui.c.backgroundSelected }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${(bookedToday / DAILY_SLOT_CAPACITY) * 100}%`, backgroundColor: bookedToday >= DAILY_SLOT_CAPACITY ? DANGER : ACCENT },
              ]}
            />
          </View>
        )}

        {/* APPOINTMENT LIST */}
        {sections.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: ui.c.backgroundElement }]}>
            <Ionicons name="calendar-outline" size={32} color={ui.c.textSecondary} />
            <Text style={{ fontSize: ui.size - 1, color: ui.c.textSecondary, marginTop: 8, textAlign: 'center' }}>
              No appointments on this day.
            </Text>
          </View>
        ) : (
          sections.map((section) => (
            <View key={section.title}>
              {(sections.length > 1 || role === 'receptionist') && (
                <Text style={[styles.listTitle, { color: ui.c.textSecondary, fontSize: ui.size - 4 }]}>
                  {section.title.toUpperCase()} ({section.items.length})
                </Text>
              )}
              {section.items.map((appt, index) => (
                <AppointmentCard
                  key={appt.id}
                  appt={appt}
                  role={role}
                  ui={ui}
                  position={section.numbered ? index + 1 : undefined}
                  hint={hintFor(appt)}
                  actions={actionsFor(appt)}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Book (patient) / schedule (doctor) pop-up */}
      <ScheduleModal
        visible={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onSave={handleSave}
        dateKey={selected}
        isDoctor={role === 'doctor'}
        patients={doctorPatients}
        taken={takenSlots(appointments, selected)}
        ui={ui}
      />


      {/* Add / edit patient pop-up (doctor) */}
      <PatientModal
        visible={patientModal !== null}
        title={patientModal?.mode === 'edit' ? 'Edit patient' : 'Add patient'}
        initialName={patientModal?.name ?? ''}
        onClose={() => setPatientModal(null)}
        onSave={handlePatientSave}
        ui={ui}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------
// 6. STYLES
// ---------------------------------------------------------------
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.two, marginBottom: Spacing.three },
  homeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  devBox: { padding: Spacing.three, borderRadius: 16, marginBottom: Spacing.three },
  banner: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three, borderRadius: 14, marginBottom: Spacing.three },
  calendarBox: { borderRadius: 16, padding: Spacing.two, paddingBottom: Spacing.one },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.two },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row' },
  weekdayText: { flex: 1, textAlign: 'center', fontWeight: '600', paddingVertical: 6 },
  dayCell: { flex: 1, height: 54, alignItems: 'center', paddingTop: 3 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dotRow: { flexDirection: 'row', height: 8, marginTop: 3 },
  dot: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 1 },
  todayButton: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.four, marginBottom: Spacing.two },
  primaryButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 22 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: Spacing.two },
  progressFill: { height: 8, borderRadius: 4 },
  listTitle: { fontWeight: '600', letterSpacing: 0.6, marginTop: Spacing.three, marginBottom: Spacing.two, marginLeft: Spacing.one },
  empty: { alignItems: 'center', padding: Spacing.five, borderRadius: 16, marginTop: Spacing.two },
  card: { borderRadius: 16, padding: Spacing.three, marginBottom: Spacing.two },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  timeBox: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  hintRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.two },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: Spacing.two },
  actionButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, marginRight: 8, marginTop: 4 },
  chip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, marginRight: 8, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  statRow: { flexDirection: 'row', marginBottom: Spacing.three },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: Spacing.three, borderRadius: 14, marginHorizontal: 4 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: Spacing.two },
  input: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.four, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  modalLabel: { fontWeight: '700', letterSpacing: 0.6, marginTop: Spacing.three, marginBottom: Spacing.two },
  modalButtons: { flexDirection: 'row', marginTop: Spacing.four },
  modalButton: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginHorizontal: 4 },
});