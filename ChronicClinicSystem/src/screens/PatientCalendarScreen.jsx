// PatientCalendarScreen.jsx
// Shows the patient's appointments in a month calendar (like our wireframe),
// plus their next visit and past visits.

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useSettings } from '../context/SettingsContext';
import AppDialog, { useDialog } from '../components/AppDialog';

// ---------------------------------------------------------------------------
// Mock data. Later this will come from Firestore.
// "upcoming" = still to happen, "completed" = already happened
// Dates are written as YEAR-MONTH-DAY
// ---------------------------------------------------------------------------
const APPOINTMENTS = [
  {
    id: '1',
    date: '2026-11-14',
    time: '09:00',
    doctor: 'Dr. Dlamini',
    location: 'Pretoria Central Public Clinic, Room 4',
    purpose: 'Chronic medication and BP review',
    status: 'upcoming',
  },
  {
    id: '2',
    date: '2026-09-14',
    time: '08:30',
    doctor: 'Dr. Dlamini',
    location: 'Pretoria Central Public Clinic, Room 4',
    purpose: 'Script renewed',
    status: 'completed',
  },
  {
    id: '3',
    date: '2026-08-17',
    time: '10:15',
    doctor: 'Dr. Dlamini',
    location: 'Pretoria Central Public Clinic, Room 4',
    purpose: 'Initial diagnosis',
    status: 'completed',
  },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// ---------------------------------------------------------------------------
// Small helper functions
// ---------------------------------------------------------------------------

// Turns year, month and day into text like "2026-11-14" so we can match appointments
function makeDateKey(year, month, day) {
  const mm = String(month + 1).padStart(2, '0'); // months start at 0 in JavaScript
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

// Makes the list of boxes for one month.
// null = an empty box before the 1st, a number = that day of the month
function buildMonthCells(year, month) {
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null); // fill the last row
  return cells;
}

// "2026-11-14" -> "14 Nov 2026"
function formatNiceDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return `${day} ${MONTH_NAMES[month - 1].slice(0, 3)} ${year}`;
}

// How many days from today until a date
function daysUntil(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------
export default function PatientCalendarScreen() {
  const { settings, colors, fs } = useSettings();
  const styles = useMemo(() => makeStyles(colors, fs), [colors, fs]);
  const { dialog, close, info, confirm } = useDialog();

  // Which month is on screen (starts on the current month)
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  // Which day the patient tapped (e.g. "2026-11-14")
  const [selectedKey, setSelectedKey] = useState(null);

  // Find the next upcoming visit and the past visits
  const nextVisit = APPOINTMENTS.filter((a) => a.status === 'upcoming').sort((a, b) =>
    a.date.localeCompare(b.date)
  )[0];
  const pastVisits = APPOINTMENTS.filter((a) => a.status === 'completed').sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  const daysToNextVisit = nextVisit ? daysUntil(nextVisit.date) : null;

  // The appointment on the day the patient tapped (if any)
  const selectedAppointment = APPOINTMENTS.find((a) => a.date === selectedKey);

  const cells = buildMonthCells(year, month);

  // Go to the previous or next month
  function changeMonth(step) {
    let newMonth = month + step;
    let newYear = year;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    setMonth(newMonth);
    setYear(newYear);
    setSelectedKey(null);
  }

  function requestReschedule() {
    confirm(
      'Request a new date?',
      'We will send your request to the clinic receptionist. They will contact you to confirm a new date.',
      'Send request',
      () => {
        // TODO: save this request to Firestore so the receptionist can see it
        info('Request sent', 'The clinic will contact you to confirm a new date.');
      }
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title} accessibilityRole="header">My calendar</Text>
        <Text style={styles.subtitle}>Visits are set by your clinic practitioner</Text>

        {/* ---------- Countdown to the next visit ---------- */}
        {nextVisit && (
          <View style={styles.countdownCard}>
            <Text style={styles.countdownLabel}>Next visit</Text>
            <Text style={styles.countdownValue}>
              {daysToNextVisit === 0
                ? 'Today'
                : daysToNextVisit === 1
                ? 'Tomorrow'
                : `In ${daysToNextVisit} days`}
            </Text>
            <Text style={styles.countdownSub}>
              {formatNiceDate(nextVisit.date)} at {nextVisit.time}
            </Text>

            {/* Shows whether reminders are on (these are controlled in Settings) */}
            <View style={styles.reminderRow}>
              <Ionicons
                name={settings.apptReminders ? 'notifications-outline' : 'notifications-off-outline'}
                size={fs(16)}
                color={colors.primary}
              />
              <Text style={styles.reminderText}>
                {settings.apptReminders
                  ? `We will remind you ${settings.reminderLead}`
                  : 'Reminders are off. Turn them on in Settings.'}
              </Text>
            </View>
          </View>
        )}

        {/* ---------- Month calendar ---------- */}
        <View style={styles.card}>
          {/* Month name with previous / next arrows */}
          <View style={styles.monthHeader}>
            <Pressable
              onPress={() => changeMonth(-1)}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              style={styles.arrowButton}
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
            <Text style={styles.monthTitle}>
              {MONTH_NAMES[month]} {year}
            </Text>
            <Pressable
              onPress={() => changeMonth(1)}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              style={styles.arrowButton}
            >
              <Ionicons name="chevron-forward" size={22} color={colors.text} />
            </Pressable>
          </View>

          {/* Su Mo Tu We Th Fr Sa */}
          <View style={styles.weekRow}>
            {WEEKDAYS.map((name) => (
              <Text key={name} style={styles.weekdayText}>{name}</Text>
            ))}
          </View>

          {/* The days of the month */}
          <View style={styles.grid}>
            {cells.map((day, index) => {
              // Empty box
              if (day === null) return <View key={`empty-${index}`} style={styles.cell} />;

              const key = makeDateKey(year, month, day);
              const appointment = APPOINTMENTS.find((a) => a.date === key);
              const isToday = key === makeDateKey(today.getFullYear(), today.getMonth(), today.getDate());
              const isSelected = key === selectedKey;
              const isUpcoming = appointment && appointment.status === 'upcoming';
              const isCompleted = appointment && appointment.status === 'completed';

              return (
                <Pressable
                  key={key}
                  style={styles.cell}
                  onPress={() => setSelectedKey(key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${day} ${MONTH_NAMES[month]}${appointment ? ', has an appointment' : ''}`}
                >
                  <View
                    style={[
                      styles.dayCircle,
                      isToday && styles.todayCircle,
                      isUpcoming && { backgroundColor: colors.primary },
                      isSelected && styles.selectedCircle,
                    ]}
                  >
                    <Text style={[styles.dayText, isUpcoming && { color: colors.onPrimary, fontWeight: '800' }]}>
                      {day}
                    </Text>
                  </View>
                  {/* Small green dot for visits that already happened */}
                  {isCompleted && <View style={styles.doneDot} />}
                </Pressable>
              );
            })}
          </View>

          {/* Explains the colours */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.legendText}>Upcoming</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
              <Text style={styles.legendText}>Completed</Text>
            </View>
          </View>
        </View>

        {/* ---------- Details of the tapped day ---------- */}
        {selectedKey && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{formatNiceDate(selectedKey)}</Text>
            {selectedAppointment ? (
              <AppointmentDetails appointment={selectedAppointment} styles={styles} />
            ) : (
              <Text style={styles.emptyText}>No appointments on this day.</Text>
            )}
          </View>
        )}

        {/* ---------- Next visit details + reschedule ---------- */}
        {nextVisit && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Next assigned visit</Text>
            <AppointmentDetails appointment={nextVisit} styles={styles} />

            <Pressable
              style={styles.rescheduleButton}
              onPress={requestReschedule}
              accessibilityRole="button"
            >
              <Text style={styles.rescheduleText}>Request a new date</Text>
            </Pressable>
          </View>
        )}

        {/* ---------- Past visits ---------- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Past consultations</Text>
          {pastVisits.length === 0 ? (
            <Text style={styles.emptyText}>No past visits yet.</Text>
          ) : (
            pastVisits.map((visit, index) => (
              <View key={visit.id} style={[styles.pastRow, index > 0 && styles.pastRowBorder]}>
                <Ionicons name="checkmark-circle" size={fs(20)} color={colors.success} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.pastDate}>{formatNiceDate(visit.date)}</Text>
                  <Text style={styles.pastPurpose}>{visit.purpose}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <AppDialog dialog={dialog} onClose={close} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shows the details of one appointment (date, time, doctor...)
// ---------------------------------------------------------------------------
function AppointmentDetails({ appointment, styles }) {
  const rows = [
    ['Date', formatNiceDate(appointment.date)],
    ['Time', appointment.time],
    ['Practitioner', appointment.doctor],
    ['Location', appointment.location],
    ['Visit type', appointment.purpose],
  ];
  return (
    <View>
      {rows.map(([label, value], index) => (
        <View key={label} style={[styles.infoRow, index > 0 && styles.infoRowBorder]}>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text style={styles.infoValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles. This is a function so the colours and text size can change live.
// ---------------------------------------------------------------------------
const makeStyles = (c, fs) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, paddingBottom: 48, width: '100%', maxWidth: 640, alignSelf: 'center' },
    title: { fontSize: fs(30), fontWeight: '800', color: c.text, marginTop: 8 },
    subtitle: { fontSize: fs(14), color: c.muted, marginTop: 4, marginBottom: 16 },

    // Countdown card
    countdownCard: {
      backgroundColor: c.primarySoft,
      borderRadius: 16,
      padding: 18,
    },
    countdownLabel: { fontSize: fs(12), fontWeight: '600', color: c.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
    countdownValue: { fontSize: fs(24), fontWeight: '800', color: c.text, marginTop: 4 },
    countdownSub: { fontSize: fs(13), color: c.muted, marginTop: 2 },
    reminderRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border },
    reminderText: { fontSize: fs(12), color: c.muted, marginLeft: 8 },

    // General card
    card: { backgroundColor: c.cardBg, borderRadius: 16, padding: 16, marginTop: 16, borderWidth: 1, borderColor: c.border },
    cardTitle: { fontSize: fs(18), fontWeight: '700', color: c.text, marginBottom: 12 },
    emptyText: { fontSize: fs(13), color: c.muted, fontStyle: 'italic' },

    // Month calendar grid
    monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    arrowButton: { padding: 8, borderRadius: 8 },
    monthTitle: { fontSize: fs(16), fontWeight: '700', color: c.text },
    weekRow: { flexDirection: 'row', marginBottom: 8 },
    weekdayText: { flex: 1, textAlign: 'center', fontSize: fs(12), fontWeight: '600', color: c.muted },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    todayCircle: { borderWidth: 1.5, borderColor: c.primary },
    selectedCircle: { backgroundColor: c.text },
    dayText: { fontSize: fs(14), fontWeight: '500', color: c.text },
    doneDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: c.success, position: 'absolute', bottom: 4 },
    legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border },
    legendItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12 },
    legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    legendText: { fontSize: fs(12), color: c.muted },

    // Reschedule button
    rescheduleButton: { marginTop: 16, backgroundColor: c.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    rescheduleText: { fontSize: fs(14), fontWeight: '600', color: c.onPrimary },

    // Past visits list
    pastRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
    pastRowBorder: { borderTopWidth: 1, borderTopColor: c.border },
    pastDate: { fontSize: fs(13), fontWeight: '600', color: c.text },
    pastPurpose: { fontSize: fs(12), color: c.muted, marginTop: 2 },

    // Appointment details rows
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
    infoRowBorder: { borderTopWidth: 1, borderTopColor: c.border },
    infoLabel: { fontSize: fs(13), color: c.muted },
    infoValue: { fontSize: fs(13), fontWeight: '600', color: c.text, textAlign: 'right', flex: 1, marginLeft: 16 },
  });