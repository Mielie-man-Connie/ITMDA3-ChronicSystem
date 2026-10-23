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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  bookAppointment,
  cancelAppointment as cancelFirebaseAppointment,
  getClinicDoctors,
  getClinicPatients,
  getClinics,
  getCurrentUserProfile,
  searchUsersByName,
  searchUsersByPhoneNumber,
  subscribeToAppointments,
  updateAppointment as updateFirebaseAppointment,
  updateAppointmentSeries,
} from '../../services/firebase';
import { updateCachedAppointmentStatus } from '../../services/cache';

import {
  BottomTabInset,
  MaxContentWidth,
  Spacing,
  type ThemePalette,
} from '../../components/themes';
import { useAppTheme } from '../../components/theme-provider';
import { AccountVerificationIcon } from '@/components/account-verification-icon';

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
  clinicName?: string;
  doctorName?: string;
  checkInTime?: string;
  recurringSeriesId?: string;
  accountActive?: boolean;
};

type Patient = {
  id: string;
  name: string;
  phoneNumber?: string;
  idNumber?: string;
  homeAddress?: string;
  doctorId?: string;
  clinicId?: string;
  accountVerified?: boolean;
  accountStatus?: string;
};

type Clinic = {
  id: string;
  name: string;
  numbers?: string[];
  dailySlotCapacity?: number;
};

type Doctor = {
  id: string;
  name?: string;
  clinicId?: string;
};

type Palette = {
  [K in keyof ThemePalette['colors']]: string;
};

type UI = { c: Palette; size: number };

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

const DEFAULT_INTERVAL_DAYS = 30;

const STATUS_INFO: Record<Status, { label: string; color: keyof ThemePalette['colors'] }> = {
  booked: { label: 'Booked', color: 'warning' },
  confirmed: { label: 'Confirmed', color: 'primarylight' },
  'checked-in': { label: 'Checked in', color: 'violet' },
  'in-progress': { label: 'In progress', color: 'info' },
  completed: { label: 'Completed', color: 'success' },
  missed: { label: 'Missed', color: 'error' },
  cancelled: { label: 'Cancelled', color: 'muted' },
};

const TYPE_LABEL: Record<AppointmentType, string> = {
  'chronic-checkup': 'Chronic check-up',
  'medication-collection': 'Medication collection',
};

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

const addMonths = (key: string, months: number) => {
  const [year, month, day] = key.split('-').map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  return toKey(new Date(targetYear, normalizedMonth, Math.min(day, lastDay)));
};

const daysBetween = (from: string, to: string) =>
  Math.round((fromKey(to).getTime() - fromKey(from).getTime()) / 86400000);

const formatLong = (key: string) => {
  const d = fromKey(key);
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

// Which time slots are already used on a day (cancelled ones are free again)
const takenSlots = (list: Appointment[], dateKey: string) =>
  list.filter((a) => a.date === dateKey && a.status !== 'cancelled').map((a) => a.timeSlot);

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

function toCalendarAppointment(record: any, patientsById: Map<string, Patient>): Appointment | null {
  const rawDate = record.appointmentDate?.toDate
    ? record.appointmentDate.toDate()
    : new Date(record.appointmentDate);
  if (!(rawDate instanceof Date) || Number.isNaN(rawDate.getTime())) {
    console.error(`Skipping appointment ${record.id}: invalid appointmentDate.`);
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(STATUS_INFO, record.status)) {
    console.error(`Skipping appointment ${record.id}: unsupported status "${record.status}".`);
    return null;
  }

  const rawType = String(record.appointmentType || '').toLowerCase();
  const type: AppointmentType = rawType.includes('medication')
    ? 'medication-collection'
    : 'chronic-checkup';

  const patient = patientsById.get(record.patientId);
  return {
    id: record.id,
    patientId: record.patientId,
    patientName: record.patientName || patient?.name || 'Patient',
    accountActive: patient?.accountVerified === true || patient?.accountStatus === 'active',
    doctorId: record.doctorId || '',
    clinicId: record.clinicId || '',
    clinicName: record.clinicName || record.clinicId || '',
    date: toKey(rawDate),
    timeSlot: record.timeSlot || `${pad(rawDate.getHours())}:${pad(rawDate.getMinutes())}`,
    type,
    status: record.status as Status,
    bookedByPatient: record.bookedByPatient !== false,
    tokenCode: record.tokenCode || '',
    priorityLevel: Number.isFinite(record.priorityLevel) ? record.priorityLevel : 5,
    checkInTime: record.checkInTime,
    recurringSeriesId: record.recurringSeriesId,
  };
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
        { backgroundColor: active ? ui.c.primarylight : ui.c.backgroundSelected, opacity: disabled ? 0.35 : 1 },
      ]}
    >
      <Text style={{ fontSize: ui.size - 2, fontWeight: '600', color: active ? ui.c.onPrimary : ui.c.text }}>{text}</Text>
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
                    isSelected && { backgroundColor: ui.c.primarylight },
                    !isSelected && isToday && { borderWidth: 2, borderColor: ui.c.primarylight },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: ui.size - 1,
                      fontWeight: isSelected || isToday ? '700' : '500',
                      color: isSelected ? ui.c.onPrimary : ui.c.text,
                    }}
                  >
                    {day}
                  </Text>
                </View>
                {/* Up to 3 coloured dots, one per appointment, coloured by status */}
                <View style={styles.dotRow}>
                  {appts.slice(0, 3).map((a) => (
                    <View key={a.id} style={[styles.dot, { backgroundColor: ui.c[STATUS_INFO[a.status].color] }]} />
                  ))}
                </View>
                {appts.length > 3 ? (
                  <Text style={{ color: ui.c.textSecondary, fontSize: ui.size - 7, lineHeight: ui.size - 5 }}>
                    +{appts.length - 3}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// One appointment in the list below the calendar
function AppointmentCard({ appt, role, ui, position, hint, actions, clinicNumbers = [], doctorName }: any) {
  const status = STATUS_INFO[appt.status as Status];
  const info = { ...status, color: ui.c[status.color] };
  // Patients see the visit type. Staff see the patient's name.
  const title = role === 'patient' ? TYPE_LABEL[appt.type as AppointmentType] : appt.patientName;
  const subtitle = role === 'patient' ? appt.clinicName || 'Clinic' : TYPE_LABEL[appt.type as AppointmentType];

  return (
    <View style={[
      styles.card,
      {
        backgroundColor: ui.c.backgroundElement,
        borderLeftColor: ui.c.secondary,
      },
    ]}>
      <View style={styles.cardTop}>
        {position ? (
          <Text style={{ fontSize: ui.size + 3, fontWeight: '800', color: ui.c.primarylight, marginRight: 10 }}>#{position}</Text>
        ) : null}
        <View style={[styles.timeBox, { backgroundColor: ui.c.backgroundSelected }]}>
          <Text style={{ fontSize: ui.size - 1, fontWeight: '700', color: ui.c.text }}>{appt.timeSlot}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: ui.size, fontWeight: '600', color: ui.c.text }}>{title}</Text>
          <Text style={{ fontSize: ui.size - 3, color: ui.c.textSecondary, marginTop: 2 }}>{subtitle}</Text>
          {role === 'patient' && clinicNumbers.length ? (
            <Text style={{ fontSize: ui.size - 4, color: ui.c.textSecondary, marginTop: 2 }}>
              Clinic phone: {clinicNumbers.join(', ')}
            </Text>
          ) : null}
          {role === 'receptionist' ? (
            <Text style={{ fontSize: ui.size - 4, color: ui.c.textSecondary, marginTop: 2 }}>
              Doctor: {doctorName || appt.doctorName || 'Not assigned'}
            </Text>
          ) : null}
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
                action.kind === 'primary' && { backgroundColor: ui.c.primarylight },
                action.kind === 'danger' && { backgroundColor: ui.c.error + '1F' },
                action.kind === 'plain' && { backgroundColor: ui.c.backgroundSelected },
              ]}
            >
              <Text
                style={{
                  fontSize: ui.size - 3,
                  fontWeight: '700',
                  color: action.kind === 'primary' ? ui.c.onPrimary : action.kind === 'danger' ? ui.c.error : ui.c.text,
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

function AppointmentStatusModal({
  appointment,
  ui,
  onClose,
  onSave,
}: {
  appointment: Appointment;
  ui: UI;
  onClose: () => void;
  onSave: (status: Status, applyToSeries: boolean) => Promise<boolean>;
}) {
  const [selectedStatus, setSelectedStatus] = useState<Status>(appointment.status);
  const [applyToSeries, setApplyToSeries] = useState(false);
  const [saving, setSaving] = useState(false);
  const statuses = Object.keys(STATUS_INFO) as Status[];

  const save = async () => {
    setSaving(true);
    try {
      if (await onSave(selectedStatus, applyToSeries)) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: ui.c.background }]}>
          <Text style={{ fontSize: ui.size + 4, fontWeight: '800', color: ui.c.text }}>
            Change appointment status
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one, marginTop: Spacing.one }}>
            <Text style={{ fontSize: ui.size - 1, color: ui.c.textSecondary }}>
              {appointment.patientName} · {formatLong(appointment.date)} at {appointment.timeSlot}
            </Text>
            <AccountVerificationIcon verified={appointment.accountActive} size={17} />
          </View>
          <View style={[styles.chipWrap, { marginTop: Spacing.three }]}>
            {statuses.map((status) => (
              <Chip
                key={status}
                text={STATUS_INFO[status].label}
                active={selectedStatus === status}
                onPress={() => setSelectedStatus(status)}
                ui={ui}
              />
            ))}
          </View>
          {appointment.recurringSeriesId ? (
            <View style={styles.chipWrap}>
              <Chip text="This appointment only" active={!applyToSeries} onPress={() => setApplyToSeries(false)} ui={ui} />
              <Chip text="Entire repeating series" active={applyToSeries} onPress={() => setApplyToSeries(true)} ui={ui} />
            </View>
          ) : null}
          <View style={styles.modalButtons}>
            <Pressable
              style={[styles.modalButton, { backgroundColor: ui.c.backgroundSelected }]}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={{ fontSize: ui.size, fontWeight: '700', color: ui.c.text }}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalButton, { backgroundColor: ui.c.primarylight, opacity: saving ? 0.6 : 1 }]}
              onPress={() => void save()}
              disabled={saving}
            >
              <Text style={{ fontSize: ui.size, fontWeight: '700', color: ui.c.onPrimary }}>
                {saving ? 'Saving…' : 'Save status'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Pop-up used to book (patient) or schedule (doctor) an appointment
function ScheduleModal({
  visible,
  onClose,
  onSave,
  dateKey,
  role,
  clinics,
  doctors,
  currentUserId,
  initialClinicId,
  appointments,
  ui,
}: any) {
  const [type, setType] = useState<AppointmentType>('chronic-checkup');
  const [slot, setSlot] = useState<string | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [clinicId, setClinicId] = useState(initialClinicId ?? '');
  const [assignedDoctorId, setAssignedDoctorId] = useState(role === 'doctor' ? currentUserId : '');
  const [nameSearch, setNameSearch] = useState('');
  const [phoneSearch, setPhoneSearch] = useState('');
  const [nameResults, setNameResults] = useState<Patient[]>([]);
  const [phoneResults, setPhoneResults] = useState<Patient[]>([]);
  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [searchingName, setSearchingName] = useState(false);
  const [searchingPhone, setSearchingPhone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [repeatCount, setRepeatCount] = useState('3');
  const [repeatEveryMonths, setRepeatEveryMonths] = useState('1');

  useEffect(() => {
    if (!visible || !nameSearch.trim()) {
      setNameResults([]);
      setNameError('');
      setSearchingName(false);
      return;
    }
    let active = true;
    const timeout = setTimeout(() => {
      setSearchingName(true);
      void (async () => {
        try {
          const results = await searchUsersByName(nameSearch) as Patient[];
          if (active) {
            setNameResults(results);
            setNameError('');
          }
        } catch (error) {
          if (active) {
            setNameResults([]);
            setNameError(error instanceof Error ? error.message : 'Could not search by name.');
          }
        } finally {
          if (active) setSearchingName(false);
        }
      })();
    }, 300);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [visible, nameSearch]);

  useEffect(() => {
    if (!visible || !phoneSearch.trim()) {
      setPhoneResults([]);
      setPhoneError('');
      setSearchingPhone(false);
      return;
    }
    let active = true;
    const timeout = setTimeout(() => {
      setSearchingPhone(true);
      void (async () => {
        try {
          const results = await searchUsersByPhoneNumber(phoneSearch) as Patient[];
          if (active) {
            setPhoneResults(results);
            setPhoneError('');
          }
        } catch (error) {
          if (active) {
            setPhoneResults([]);
            setPhoneError(error instanceof Error ? error.message : 'Could not search by phone number.');
          }
        } finally {
          if (active) setSearchingPhone(false);
        }
      })();
    }, 300);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [visible, phoneSearch]);

  useEffect(() => {
    setClinicId(initialClinicId ?? '');
    setAssignedDoctorId(role === 'doctor' ? currentUserId : '');
  }, [initialClinicId, visible, role, currentUserId]);

  const close = () => {
    setSlot(null);
    setPatient(null);
    setRepeatCount('3');
    setRepeatEveryMonths('1');
    setNameSearch('');
    setPhoneSearch('');
    setNameResults([]);
    setPhoneResults([]);
    onClose();
  };

  const save = async () => {
    if (!patient) return notify('Choose a patient', 'Search for and select a patient first.');
    if (!clinicId) return notify('Choose a clinic', 'Select a clinic before booking.');
    if (role === 'receptionist' && !assignedDoctorId) {
      return notify('Choose a doctor', 'Select the doctor who will be assigned to this appointment.');
    }
    if (!slot) return notify('Choose a time', 'Please pick a time slot.');
    const visitCount = role === 'doctor' ? Number(repeatCount) : 1;
    const intervalMonths = Number(repeatEveryMonths);
    if (!Number.isInteger(visitCount) || visitCount < 1 || visitCount > 60) {
      return notify('Invalid visit count', 'Enter a whole number of visits between 1 and 60.');
    }
    if (
      role === 'doctor' &&
      visitCount > 1 &&
      (!Number.isInteger(intervalMonths) || intervalMonths < 1 || intervalMonths > 36)
    ) {
      return notify('Invalid visit gap', 'Enter a whole number of months between 1 and 36.');
    }
    setSaving(true);
    try {
      await onSave({
        patient,
        clinicId,
        doctorId: assignedDoctorId,
        type,
        slot,
        repeatCount: visitCount,
        repeatEveryMonths: intervalMonths,
      });
      close();
    } finally {
      setSaving(false);
    }
  };

  const sectionLabel = [styles.modalLabel, { color: ui.c.textSecondary, fontSize: ui.size - 4 }];
  const selectedClinic = clinics.find((clinic: Clinic) => clinic.id === clinicId);
  const availableDoctors = doctors.filter((doctor: Doctor) => !doctor.clinicId || doctor.clinicId === clinicId);
  const taken = appointments
    .filter((appointment: Appointment) =>
      appointment.date === dateKey &&
      appointment.clinicId === clinicId &&
      appointment.status !== 'cancelled',
    )
    .map((appointment: Appointment) => appointment.timeSlot);
  const capacity = Math.max(
    1,
    Math.min(TIME_SLOTS.length, Number(selectedClinic?.dailySlotCapacity) || TIME_SLOTS.length),
  );
  const timeSlots = TIME_SLOTS.slice(0, capacity);
  const selectPatient = (item: Patient) => {
    setPatient(item);
    setNameSearch('');
    setPhoneSearch('');
  };
  const renderResults = (
    results: Patient[],
    loading: boolean,
    error: string,
  ) => (
    <View style={styles.searchResults}>
      {loading && <ActivityIndicator color={ui.c.primarylight} />}
      {error ? (
        <Text style={{ color: ui.c.error, fontSize: ui.size - 2 }}>{error}</Text>
      ) : null}
      {!loading && !error && results.length === 0 ? (
        <Text style={{ color: ui.c.textSecondary, fontSize: ui.size - 2 }}>No matching patients.</Text>
      ) : null}
      {results.map((result) => (
        <Pressable
          key={result.id}
          onPress={() => selectPatient(result)}
          style={[
            styles.searchResult,
            { backgroundColor: patient?.id === result.id ? ui.c.backgroundSelected : ui.c.backgroundElement },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
            <Text style={{ color: ui.c.text, fontSize: ui.size, fontWeight: '600' }}>
              {result.name || 'Unnamed patient'}
            </Text>
            <AccountVerificationIcon
              verified={result.accountVerified === true || result.accountStatus === 'active'}
              size={17}
            />
          </View>
          <Text style={{ color: ui.c.textSecondary, fontSize: ui.size - 2 }}>
            {result.phoneNumber || 'No phone number on profile'}
          </Text>
          <Text style={{ color: ui.c.textSecondary, fontSize: ui.size - 3 }}>
            ID: {result.idNumber || 'Not provided'} · Address: {result.homeAddress || 'Not provided'}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: ui.c.background }]}>
          <ScrollView>
            <Text style={{ fontSize: ui.size + 5, fontWeight: '800', color: ui.c.text }}>
              {role === 'doctor' ? 'Schedule appointment' : 'Book appointment'}
            </Text>
            <Text style={{ fontSize: ui.size - 1, color: ui.c.textSecondary, marginTop: 4 }}>{formatLong(dateKey)}</Text>

            <Text style={sectionLabel}>PATIENT SEARCH</Text>
            {patient && (
              <Pressable
                onPress={() => setPatient(null)}
                style={[styles.selectedPatient, { backgroundColor: ui.c.backgroundSelected }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
                  <Text style={{ color: ui.c.text, fontSize: ui.size, fontWeight: '700' }}>
                    {patient.name || 'Unnamed patient'} · {patient.phoneNumber || 'No phone'}
                  </Text>
                  <AccountVerificationIcon
                    verified={patient.accountVerified === true || patient.accountStatus === 'active'}
                    size={17}
                  />
                </View>
                <Text style={{ color: ui.c.primarylight, fontSize: ui.size - 2 }}>Tap to change</Text>
                <Text style={{ color: ui.c.textSecondary, fontSize: ui.size - 3 }}>
                  ID: {patient.idNumber || 'Not provided'} · Address: {patient.homeAddress || 'Not provided'}
                </Text>
              </Pressable>
            )}
            <TextInput
              value={nameSearch}
              onChangeText={setNameSearch}
              placeholder="Search by patient's name"
              placeholderTextColor={ui.c.textSecondary}
              accessibilityLabel="Search patients by name"
              style={[styles.input, styles.searchInput, { backgroundColor: ui.c.backgroundElement, color: ui.c.text, fontSize: ui.size }]}
            />
            {nameSearch.trim() ? renderResults(nameResults, searchingName, nameError) : null}
            <TextInput
              value={phoneSearch}
              onChangeText={setPhoneSearch}
              placeholder="Search by phone number"
              placeholderTextColor={ui.c.textSecondary}
              keyboardType="phone-pad"
              accessibilityLabel="Search patients by phone number"
              style={[styles.input, styles.searchInput, { backgroundColor: ui.c.backgroundElement, color: ui.c.text, fontSize: ui.size }]}
            />
            {phoneSearch.trim() ? renderResults(phoneResults, searchingPhone, phoneError) : null}

            <Text style={sectionLabel}>CLINIC</Text>
            {clinics.length ? (
              <View style={styles.chipWrap}>
                {clinics.map((clinic: Clinic) => (
                  <Chip
                    key={clinic.id}
                    text={clinic.numbers?.length ? `${clinic.name} · ${clinic.numbers.join(', ')}` : clinic.name}
                    active={clinicId === clinic.id}
                    onPress={() => setClinicId(clinic.id)}
                    ui={ui}
                  />
                ))}
              </View>
            ) : (
              <Text style={{ color: ui.c.error, fontSize: ui.size - 2 }}>No clinics are configured in Firebase.</Text>
            )}

            {role === 'receptionist' && (
              <>
                <Text style={sectionLabel}>ASSIGN DOCTOR</Text>
                {availableDoctors.length > 0 ? (
                  <View style={styles.chipWrap}>
                    {availableDoctors.map((doctor: Doctor) => (
                      <Chip
                        key={doctor.id}
                        text={doctor.name || 'Unnamed doctor'}
                        active={assignedDoctorId === doctor.id}
                        onPress={() => setAssignedDoctorId(doctor.id)}
                        ui={ui}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={{ color: ui.c.error, fontSize: ui.size - 2 }}>
                    No doctors are available for this clinic.
                  </Text>
                )}
              </>
            )}

            <Text style={sectionLabel}>VISIT TYPE</Text>
            <View style={styles.chipWrap}>
              <Chip text="Chronic check-up" active={type === 'chronic-checkup'} onPress={() => setType('chronic-checkup')} ui={ui} />
              <Chip text="Medication collection" active={type === 'medication-collection'} onPress={() => setType('medication-collection')} ui={ui} />
            </View>

            <Text style={sectionLabel}>
              TIME SLOT ({timeSlots.filter((time: string) => !taken.includes(time)).length} of {capacity} free)
            </Text>
            <View style={styles.chipWrap}>
              {timeSlots.map((s: string) => (
                <Chip key={s} text={s} active={slot === s} disabled={taken.includes(s)} onPress={() => setSlot(s)} ui={ui} />
              ))}
            </View>

            {role === 'doctor' && (
              <>
                <Text style={sectionLabel}>REPEATING VISITS</Text>
                <View style={styles.recurrenceFields}>
                  <View style={styles.recurrenceField}>
                    <Text style={{ color: ui.c.textSecondary, fontSize: ui.size - 2, marginBottom: 6 }}>
                      Number of visits (1–60)
                    </Text>
                    <TextInput
                      value={repeatCount}
                      onChangeText={setRepeatCount}
                      keyboardType="number-pad"
                      placeholder="3"
                      accessibilityLabel="Number of visits"
                      style={[
                        styles.input,
                        styles.recurrenceInput,
                        {
                          backgroundColor: ui.c.backgroundElement,
                          borderColor: ui.c.secondaryBorder,
                          color: ui.c.text,
                          fontSize: ui.size,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.recurrenceField}>
                    <Text style={{ color: ui.c.textSecondary, fontSize: ui.size - 2, marginBottom: 6 }}>
                      Gap in months (1–36)
                    </Text>
                    <TextInput
                      value={repeatEveryMonths}
                      onChangeText={setRepeatEveryMonths}
                      keyboardType="number-pad"
                      placeholder="1"
                      accessibilityLabel="Gap between visits in months"
                      editable={Number(repeatCount) > 1}
                      style={[
                        styles.input,
                        styles.recurrenceInput,
                        {
                          backgroundColor: ui.c.backgroundElement,
                          borderColor: ui.c.secondaryBorder,
                          color: ui.c.text,
                          fontSize: ui.size,
                          opacity: Number(repeatCount) > 1 ? 1 : 0.5,
                        },
                      ]}
                    />
                  </View>
                </View>
                <Text style={{ color: ui.c.textSecondary, fontSize: ui.size - 2, marginTop: 4 }}>
                  {Number(repeatCount) === 1
                    ? 'This creates one visit.'
                    : `Creates ${repeatCount || '…'} visits, ${repeatEveryMonths || '…'} month(s) apart.`}
                </Text>
              </>
            )}

            <View style={styles.modalButtons}>
              <Pressable style={[styles.modalButton, { backgroundColor: ui.c.backgroundSelected }]} onPress={close}>
                <Text style={{ fontSize: ui.size, fontWeight: '700', color: ui.c.text }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, { backgroundColor: ui.c.primarylight, opacity: saving ? 0.6 : 1 }]}
                onPress={() => void save()}
                disabled={saving}
              >
                <Text style={{ fontSize: ui.size, fontWeight: '700', color: ui.c.onPrimary }}>
                  {saving ? 'Booking…' : 'Confirm'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
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
  const { theme, textScale } = useAppTheme();
  const todayKey = toKey(new Date());

  const [role, setRole] = useState<Role>('patient');
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentClinicId, setCurrentClinicId] = useState('');
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selected, setSelected] = useState(todayKey);
  const [viewMonth, setViewMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [statusAppointment, setStatusAppointment] = useState<Appointment | null>(null);

  const [appSettings, setAppSettings] = useState({ reminderTime: 'day' });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let unsubscribe: (() => void) | undefined;
      setLoading(true);
      setLoadError('');

      const loadCalendar = async () => {
        try {
          const profile = await getCurrentUserProfile();
          const roleCode = profile.role;
          const resolvedRole: Role | null =
            roleCode === 'p' || roleCode === 'patient'
              ? 'patient'
              : roleCode === 'd' || roleCode === 'doctor'
                ? 'doctor'
                : roleCode === 'r' || roleCode === 'receptionist'
                  ? 'receptionist'
                  : null;
          if (!resolvedRole) {
            throw new Error('Your account does not have a supported calendar role.');
          }

          const [rawPatients, rawClinics, rawDoctors] = await Promise.all([
            resolvedRole === 'patient' ? Promise.resolve([]) : getClinicPatients(),
            getClinics(),
            resolvedRole === 'receptionist' ? getClinicDoctors() : Promise.resolve([]),
          ]);
          const clinicId = profile.clinicId || '';
          const clinicList = rawClinics as Clinic[];
          const resolvedClinicId =
            clinicId ||
            (clinicList.length === 1 ? clinicList[0].id : '');
          const patientList = rawPatients as Patient[];
          const patientsById = new Map(patientList.map((patient) => [patient.id, patient]));
          if (resolvedRole === 'patient') {
            patientsById.set(profile.id, profile as Patient);
          }

          if (!active) return;
          setRole(resolvedRole);
          setCurrentUserId(profile.id);
          setCurrentClinicId(resolvedClinicId);
          setClinics(clinicList);
          setPatients(patientList);
          setDoctors(rawDoctors as Doctor[]);
          unsubscribe = subscribeToAppointments(
            (records: any[]) => {
              if (!active) return;
              let scopedRecords = records;
              if (resolvedRole === 'patient') {
                scopedRecords = records.filter((record) => record.patientId === profile.id);
              } else if (resolvedRole === 'receptionist' && resolvedClinicId) {
                scopedRecords = records.filter((record) => record.clinicId === resolvedClinicId);
              } else if (resolvedRole === 'doctor') {
                scopedRecords = records.filter((record) =>
                  record.doctorId === profile.id ||
                  (!record.doctorId && (!resolvedClinicId || record.clinicId === resolvedClinicId)),
                );
              }
              const calendarAppointments = scopedRecords
                .map((record) => toCalendarAppointment(record, patientsById))
                .filter((appointment): appointment is Appointment => appointment !== null);
              setAppointments(calendarAppointments);
            },
            (error: Error) => {
              if (active) {
                setLoadError(error.message);
                console.error('Could not subscribe to Firebase appointments.', error);
              }
            },
            resolvedRole === 'patient' ? profile.id : undefined,
            (updatedAt: Date) => {
              if (active) setLastUpdated(updatedAt);
            },
          );
        } catch (error) {
          if (active) {
            const message = error instanceof Error ? error.message : String(error);
            setLoadError(message);
            console.error('Could not load calendar data from Firebase.', error);
          }
        } finally {
          if (active) setLoading(false);
        }
      };

      void loadCalendar();
      AsyncStorage.getItem(SETTINGS_KEY)
        .then((saved) => {
          if (!saved) return;
          const p = JSON.parse(saved);
          setAppSettings({
            reminderTime: p.reminderTime ?? 'day',
          });
        })
        .catch((error: unknown) => console.error('Could not load calendar preferences.', error));

      return () => {
        active = false;
        unsubscribe?.();
      };
    }, []),
  );

  const size = Math.round(17 * textScale);
  const ui: UI = { c: theme.colors, size };
  const reminderLabel = appSettings.reminderTime === 'hours' ? '2 hours before' : '1 day before';

  const updateAppointment = async (id: string, changes: Partial<Appointment>) => {
    try {
      await updateFirebaseAppointment(id, changes);
      setAppointments((current) =>
        current.map((appointment) =>
          appointment.id === id ? { ...appointment, ...changes } : appointment,
        ),
      );
      if (changes.status) {
        try {
          await updateCachedAppointmentStatus(id, changes.status);
        } catch (cacheError) {
          notify('Appointment updated', `The status was saved, but the local QR cache could not be refreshed: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`);
        }
      }
    } catch (error) {
      notify('Update failed', error instanceof Error ? error.message : String(error));
    }
  };

  const saveAppointmentStatus = async (
    appointment: Appointment,
    status: Status,
    applyToSeries: boolean,
  ): Promise<boolean> => {
    try {
      if (applyToSeries && appointment.recurringSeriesId) {
        const updatedIds = await updateAppointmentSeries(appointment.recurringSeriesId, { status });
        setAppointments((current) => current.map((item) =>
          item.recurringSeriesId === appointment.recurringSeriesId ? { ...item, status } : item,
        ));
        const cacheResults = await Promise.allSettled(
          updatedIds.map((id: string) => updateCachedAppointmentStatus(id, status)),
        );
        if (cacheResults.some((result) => result.status === 'rejected')) {
          notify('Status updated', 'The recurring appointments were saved, but one or more local QR cache entries could not be refreshed.');
        }
      } else {
        await updateFirebaseAppointment(appointment.id, { status });
        setAppointments((current) => current.map((item) =>
          item.id === appointment.id ? { ...item, status } : item,
        ));
        try {
          await updateCachedAppointmentStatus(appointment.id, status);
        } catch (cacheError) {
          notify('Status updated', `The status was saved, but the local QR cache could not be refreshed: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`);
        }
      }
      return true;
    } catch (error) {
      notify('Status update failed', error instanceof Error ? error.message : String(error));
      return false;
    }
  };

  const cancelSelectedAppointment = (appt: Appointment) => {
    confirmAction(
      'Cancel appointment?',
      `${formatLong(appt.date)} at ${appt.timeSlot}`,
      'Cancel it',
      () => {
        void cancelFirebaseAppointment(appt.id)
          .then(() => updateCachedAppointmentStatus(appt.id, 'cancelled'))
          .then(() => {
            setAppointments((current) =>
              current.map((appointment) =>
                appointment.id === appt.id ? { ...appointment, status: 'cancelled' } : appointment,
              ),
            );
          })
          .catch((error: unknown) =>
            notify('Cancellation failed', error instanceof Error ? error.message : String(error)),
          );
      },
    );
  };

  // Receptionist: move a checked-in patient to the front of the queue
  const moveUp = (appt: Appointment) => {
    const queue = appointments
      .filter((a) => a.date === todayKey && a.status === 'checked-in')
      .sort(queueSort);
    if (queue[0]?.id === appt.id) return notify('Already first', 'This patient is already first in the queue.');
    // Priority just below the lowest number in the queue = seen first
    const best = Math.min(...queue.map((a) => a.priorityLevel));
    void updateAppointment(appt.id, { priorityLevel: best - 1 });
  };

  const handleSave = async (data: {
    patient: Patient;
    clinicId: string;
    doctorId: string;
    type: AppointmentType;
    slot: string;
    repeatCount: number;
    repeatEveryMonths: number;
  }) => {
    const clinic = clinics.find((item) => item.id === data.clinicId);
    if (!clinic) return notify('Choose a clinic', 'Select a valid clinic before booking.');
    const count = role === 'doctor' ? data.repeatCount : 1;
    const recurringSeriesId = count > 1 ? `series-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : undefined;
    let updatedAppointments = [...appointments];
    let created = 0;
    let skipped = 0;

    for (let i = 0; i < count; i++) {
      const dateKey =
        count > 1
          ? addMonths(selected, i * data.repeatEveryMonths)
          : selected;
      const alreadyBooked = updatedAppointments.some(
        (appointment) =>
          appointment.patientId === data.patient.id &&
          appointment.clinicId === clinic.id &&
          appointment.date === dateKey &&
          appointment.status !== 'cancelled',
      );
      const slotTaken = updatedAppointments.some(
        (appointment) =>
          appointment.clinicId === clinic.id &&
          appointment.date === dateKey &&
          appointment.timeSlot === data.slot &&
          appointment.status !== 'cancelled',
      );
      if (alreadyBooked || slotTaken) {
        skipped++;
        continue;
      }
      const [year, month, day] = dateKey.split('-').map(Number);
      const [hour, minute] = data.slot.split(':').map(Number);
      const appointmentDate = new Date(year, month - 1, day, hour, minute);
      try {
        const result = await bookAppointment(data.patient.id, {
          appointmentDate: appointmentDate.toISOString(),
          appointmentType: TYPE_LABEL[data.type],
          clinicId: clinic.id,
          timeSlot: data.slot,
          doctorId: role === 'doctor' ? currentUserId : data.doctorId,
          patientName: data.patient.name,
          clinicName: clinic.name,
          status: 'confirmed',
          recurringSeriesId,
        });
        updatedAppointments.push({
          id: result.appointmentId,
          patientId: data.patient.id,
          patientName: data.patient.name,
          clinicName: clinic.name,
          doctorId: role === 'doctor' ? currentUserId : data.doctorId,
          clinicId: clinic.id,
          date: dateKey,
          timeSlot: data.slot,
          type: data.type,
          status: 'confirmed',
          bookedByPatient: false,
          tokenCode: result.tokenCode,
          priorityLevel: 5,
          recurringSeriesId,
        });
        created++;
      } catch (error) {
        notify('Booking failed', error instanceof Error ? error.message : String(error));
        break;
      }
    }

    setAppointments(updatedAppointments);
    if (created === 0 && skipped > 0) {
      notify('Nothing booked', 'The patient already has an appointment or the selected time is taken.');
    } else if (created > 0 && skipped > 0) {
      notify('Partially booked', `${created} appointment(s) booked. ${skipped} date(s) skipped.`);
    } else if (created > 0) {
      notify('Done', created === 1 ? 'Appointment booked.' : `${created} check-ups scheduled.`);
    }
  };

  // ----- What each role can see -----
  const visible = appointments.filter((a) => {
    if (role === 'patient') return a.patientId === currentUserId;
    if (a.clinicId && currentClinicId && a.clinicId !== currentClinicId) return false;
    if (role === 'doctor' && a.doctorId) return a.doctorId === currentUserId;
    return true;
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
    const cancel = { label: 'Cancel', kind: 'danger' as const, onPress: () => cancelSelectedAppointment(a) };

    if (role === 'patient') {
      if (isActive && !isPastDay) actions.push(cancel);
    }

    if (role === 'doctor') {
      if (isActive && !isPastDay) actions.push(cancel);
      actions.push({ label: 'Change status', kind: 'plain', onPress: () => setStatusAppointment(a) });
    }

    if (role === 'receptionist') {
      actions.push({ label: 'Change status', kind: 'plain', onPress: () => setStatusAppointment(a) });
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
  const canSchedule = (role === 'doctor' || role === 'receptionist') && !isPastSelected;
  const selectedClinic = clinics.find((clinic) => clinic.id === currentClinicId);
  const dailyCapacity = Math.max(
    1,
    Math.min(TIME_SLOTS.length, Number(selectedClinic?.dailySlotCapacity) || TIME_SLOTS.length),
  );
  const bookedToday = takenSlots(visible, selected).length;
  const isActiveStatus = (s: Status) => s === 'booked' || s === 'confirmed' || s === 'checked-in' || s === 'in-progress';
  const doctorPatientIds = new Set(
    appointments
      .filter((appointment) =>
        appointment.doctorId === currentUserId &&
        isActiveStatus(appointment.status) &&
        appointment.date >= todayKey &&
        appointment.date < addDays(todayKey, 10),
      )
      .map((appointment) => appointment.patientId),
  );
  const doctorPatients = patients.filter((patient) => doctorPatientIds.has(patient.id));

  // Doctor's "Calendar Summary": future bookings with their assigned patients
  const doctorAppts = appointments.filter((a) => isActiveStatus(a.status) && a.date >= todayKey);
  const todayCount = doctorAppts.filter((a) => a.date === todayKey).length;
  const upcomingCountTotal = doctorAppts.filter((a) => a.date > todayKey).length;
  const nextMonthLimit = addDays(todayKey, 30);
  const scheduledAppointments = doctorAppts
    .filter((a) => a.date < nextMonthLimit)
    .sort((a, b) => (a.date + a.timeSlot).localeCompare(b.date + b.timeSlot));
  const laterAppointmentCount = doctorAppts.filter((a) => a.date >= nextMonthLimit).length;
  const upcomingCount = (patientId: string) => scheduledAppointments.filter((a) => a.patientId === patientId).length;

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
            <Text style={{ fontSize: ui.size + 13, fontWeight: '800', color: ui.c.text }}>{titles[role].title}</Text>
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

        {loading ? (
          <View style={styles.empty}>
            <ActivityIndicator size="large" color={ui.c.primarylight} />
            <Text style={{ color: ui.c.textSecondary, fontSize: ui.size, marginTop: Spacing.two }}>
              Loading calendar from Firebase…
            </Text>
          </View>
        ) : loadError ? (
          <View style={[styles.empty, { backgroundColor: ui.c.backgroundElement }]}>
            <Text style={{ color: ui.c.error, fontSize: ui.size, textAlign: 'center' }}>{loadError}</Text>
          </View>
        ) : null}

        {/* Next-visit suggestion (patients) */}
        {!loading && !loadError && suggestion && (
          <View style={[styles.banner, { backgroundColor: `${ui.c.primarylight}1F` }]}>
            <Ionicons name="bulb-outline" size={20} color={ui.c.primarylight} />
            <Text style={{ flex: 1, marginLeft: 10, fontSize: ui.size - 2, color: ui.c.text }}>{suggestion.text}</Text>
            <Pressable onPress={() => goToDate(suggestion!.date)} accessibilityRole="button">
              <Text style={{ fontSize: ui.size - 2, fontWeight: '700', color: ui.c.primarylight }}>Go</Text>
            </Pressable>
          </View>
        )}

        {/* DOCTOR: calendar summary + patient list (from the wireframe) */}
        {!loading && !loadError && role === 'doctor' && (
          <>
            <Text style={[styles.listTitle, { color: ui.c.textSecondary, fontSize: ui.size - 4, marginTop: 0 }]}>CALENDAR SUMMARY</Text>
            <View style={styles.statRow}>
              {[
                { label: 'Today', value: todayCount },
                { label: 'Upcoming', value: upcomingCountTotal },
                { label: 'Patients', value: doctorPatients.length },
              ].map((s) => (
                <View key={s.label} style={[styles.statBox, { backgroundColor: ui.c.secondarySurface }]}>
                  <Text style={{ fontSize: ui.size + 9, fontWeight: '800', color: ui.c.secondary }}>{s.value}</Text>
                  <Text style={{ fontSize: ui.size - 4, color: ui.c.textSecondary }}>{s.label}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.calendarBox, { backgroundColor: ui.c.backgroundElement, borderColor: ui.c.secondaryBorder, paddingBottom: Spacing.two, marginBottom: Spacing.three }]}>
              <Text style={{ fontSize: ui.size - 1, fontWeight: '700', color: ui.c.text, margin: Spacing.two }}>Today and upcoming bookings</Text>
              {scheduledAppointments.length === 0 && (
                <Text style={{ fontSize: ui.size - 2, color: ui.c.textSecondary, margin: Spacing.two }}>No upcoming bookings.</Text>
              )}
              {scheduledAppointments.map((a) => (
                  <Pressable key={a.id} onPress={() => goToDate(a.date)} style={styles.summaryRow} accessibilityRole="button">
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
                        <Text style={{ fontSize: ui.size - 1, fontWeight: '600', color: ui.c.text }}>{a.patientName}</Text>
                        <AccountVerificationIcon verified={a.accountActive} size={17} />
                      </View>
                      <Text style={{ fontSize: ui.size - 4, color: ui.c.textSecondary }}>
                        {formatLong(a.date)} at {a.timeSlot} • {TYPE_LABEL[a.type]}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={ui.c.textSecondary} />
                  </Pressable>
                ))}
              {laterAppointmentCount > 0 && (
                <Text style={{ fontSize: ui.size - 4, color: ui.c.textSecondary, margin: Spacing.two }}>
                  + {laterAppointmentCount} more after the next 30 days. Tap a day on the calendar below.
                </Text>
              )}
            </View>

            <Text style={[styles.listTitle, { color: ui.c.textSecondary, fontSize: ui.size - 4, marginTop: 0 }]}>PATIENT LIST</Text>
            <View style={[styles.calendarBox, { backgroundColor: ui.c.backgroundElement, borderColor: ui.c.secondaryBorder, paddingBottom: Spacing.two, marginBottom: Spacing.three }]}>
              {doctorPatients.length === 0 && (
                <Text style={{ fontSize: ui.size - 2, color: ui.c.textSecondary, margin: Spacing.two }}>No patients are registered in Firebase.</Text>
              )}
              {doctorPatients.map((p) => (
                <View key={p.id} style={styles.summaryRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
                      <Text style={{ fontSize: ui.size - 1, fontWeight: '600', color: ui.c.text }}>{p.name}</Text>
                      <AccountVerificationIcon
                        verified={p.accountVerified === true || p.accountStatus === 'active'}
                        size={17}
                      />
                    </View>
                    <Text style={{ fontSize: ui.size - 4, color: ui.c.textSecondary }}>{upcomingCount(p.id)} upcoming booking(s)</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* MONTH CALENDAR */}
        {!loading && !loadError && (
        <View style={[styles.calendarBox, { backgroundColor: ui.c.backgroundElement, borderColor: ui.c.secondaryBorder }]}>
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

          <Text style={{ color: ui.c.textSecondary, fontSize: ui.size - 4, textAlign: 'center' }}>
            Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Waiting for server'}
          </Text>

          <Pressable onPress={() => goToDate(todayKey)} style={styles.todayButton} accessibilityRole="button">
            <Text style={{ fontSize: ui.size - 2, fontWeight: '700', color: ui.c.primarylight }}>Jump to today</Text>
          </Pressable>
        </View>
        )}

        {/* SELECTED DAY */}
        {!loading && !loadError && (
        <View style={styles.dayHeader}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: ui.size + 2, fontWeight: '700', color: ui.c.text }}>
              {formatLong(selected)}
              {selected === todayKey ? '  •  Today' : ''}
            </Text>
            <Text style={{ fontSize: ui.size - 3, color: ui.c.textSecondary, marginTop: 2 }}>
              {role === 'receptionist'
                ? `${bookedToday} of ${dailyCapacity} slots booked`
                : `${dayAppointments.filter((a) => a.status !== 'cancelled').length} appointment(s)`}
            </Text>
          </View>
          {(role === 'doctor' || role === 'receptionist') && (
            <Pressable
              onPress={() => setScheduleOpen(true)}
              disabled={!canSchedule}
              accessibilityRole="button"
              style={[styles.primaryButton, { backgroundColor: ui.c.primarylight, opacity: canSchedule ? 1 : 0.35 }]}
            >
              <Ionicons name="add" size={18} color={ui.c.onPrimary} />
              <Text style={{ fontSize: ui.size - 2, fontWeight: '700', color: ui.c.onPrimary, marginLeft: 4 }}>
                {role === 'doctor' ? 'Schedule' : 'Book'}
              </Text>
            </Pressable>
          )}
        </View>
        )}

        {/* Receptionist: how full is the clinic today? */}
        {!loading && !loadError && role === 'receptionist' && (
          <View style={[styles.progressTrack, { backgroundColor: ui.c.backgroundSelected }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(100, (bookedToday / dailyCapacity) * 100)}%`, backgroundColor: bookedToday >= dailyCapacity ? ui.c.error : ui.c.primarylight },
              ]}
            />
          </View>
        )}

        {/* APPOINTMENT LIST */}
        {!loading && !loadError && sections.length === 0 && (
          <View style={[styles.empty, { backgroundColor: ui.c.backgroundElement }]}>
            <Ionicons name="calendar-outline" size={32} color={ui.c.textSecondary} />
            <Text style={{ fontSize: ui.size - 1, color: ui.c.textSecondary, marginTop: 8, textAlign: 'center' }}>
              No appointments on this day.
            </Text>
          </View>
        )}
        {!loading && !loadError && sections.map((section) => (
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
                  clinicNumbers={clinics.find((clinic) => clinic.id === appt.clinicId)?.numbers || []}
                  doctorName={doctors.find((doctor) => doctor.id === appt.doctorId)?.name}
                  position={section.numbered ? index + 1 : undefined}
                  hint={hintFor(appt)}
                  actions={actionsFor(appt)}
                />
              ))}
            </View>
          ))}
      </ScrollView>

      {/* Book (patient) / schedule (doctor) pop-up */}
      <ScheduleModal
        visible={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onSave={handleSave}
        dateKey={selected}
        role={role}
        clinics={clinics}
        doctors={doctors}
        currentUserId={currentUserId}
        initialClinicId={currentClinicId}
        appointments={appointments}
        ui={ui}
      />
      {statusAppointment && (role === 'doctor' || role === 'receptionist') && (
        <AppointmentStatusModal
          appointment={statusAppointment}
          ui={ui}
          onClose={() => setStatusAppointment(null)}
          onSave={(status, applyToSeries) =>
            saveAppointmentStatus(statusAppointment, status, applyToSeries)
          }
        />
      )}
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
  calendarBox: { borderRadius: 16, padding: Spacing.two, paddingBottom: Spacing.one, borderWidth: 1 },
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
  card: { borderRadius: 16, padding: Spacing.three, marginBottom: Spacing.two, borderLeftWidth: 4 },
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
  searchInput: { marginTop: Spacing.one, borderWidth: 1 },
  recurrenceFields: { flexDirection: 'row', gap: Spacing.two },
  recurrenceField: { flex: 1 },
  recurrenceInput: { minHeight: 46, borderWidth: 1 },
  selectedPatient: { padding: Spacing.two, borderRadius: 10, marginBottom: Spacing.two },
  searchResults: { gap: Spacing.one, marginTop: Spacing.one, marginBottom: Spacing.two },
  searchResult: { padding: Spacing.two, borderRadius: 10 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.four, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  modalLabel: { fontWeight: '700', letterSpacing: 0.6, marginTop: Spacing.three, marginBottom: Spacing.two },
  modalButtons: { flexDirection: 'row', marginTop: Spacing.four },
  modalButton: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginHorizontal: 4 },
});