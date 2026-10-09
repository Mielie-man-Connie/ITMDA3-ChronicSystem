// DoctorCalendarScreen.jsx
// The doctor's schedule. The doctor can:
//   - switch between dates
//   - search for a patient
//   - filter chronic reviews vs routine check-ups
//   - move each patient through the visit steps
//     (Booked -> Checked in -> In progress -> Completed)

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useSettings } from '../context/SettingsContext';
import AppDialog, { useDialog } from '../components/AppDialog';

// ---------------------------------------------------------------------------
// The steps of a visit, in order.
// "missed" is separate because it is not part of the normal flow.
// ---------------------------------------------------------------------------
const STATUS_FLOW = ['booked', 'checkedIn', 'inProgress', 'completed'];

const STATUS_INFO = {
  booked: { label: 'Booked', icon: 'calendar-outline', tone: 'muted', nextLabel: 'Check in' },
  checkedIn: { label: 'Checked in', icon: 'log-in-outline', tone: 'warning', nextLabel: 'Start consultation' },
  inProgress: { label: 'In progress', icon: 'play-circle-outline', tone: 'primary', nextLabel: 'Mark completed' },
  completed: { label: 'Completed', icon: 'checkmark-circle', tone: 'success', nextLabel: null },
  missed: { label: 'Missed', icon: 'close-circle', tone: 'danger', nextLabel: null },
};

// The two kinds of visit
const TYPE_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Chronic', value: 'chronic' },
  { label: 'Routine', value: 'routine' },
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

// Turns a date into text like "2026-10-09" so we can match appointments to days
function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // months start at 0
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Returns a new date that is "days" days later (use a negative number to go back)
function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// The Monday of the week that this date is in
function startOfWeek(date) {
  const copy = new Date(date);
  const daysSinceMonday = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - daysSinceMonday);
  return copy;
}

// "Friday, 9 Oct 2026"
function prettyDate(date) {
  return `${DAY_NAMES[date.getDay()]}, ${date.getDate()} ${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

// "Today", "Tomorrow", "Yesterday" or empty text
function relativeLabel(date, today) {
  const diff = Math.round((date - today) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return '';
}

// ---------------------------------------------------------------------------
// Mock data. Later this will come from Firestore.
// Dates are based on today so there is always something to see.
// type: 'chronic' = chronic medication review, 'routine' = routine check-up
// ---------------------------------------------------------------------------
function makeSampleAppointments(today) {
  const day = (offset) => toDateKey(addDays(today, offset));
  return [
    { id: '1', date: day(0), time: '08:30', patient: 'Thandi Mokoena', purpose: 'Chronic medication and BP review', type: 'chronic', status: 'completed' },
    { id: '2', date: day(0), time: '09:00', patient: 'Sizwe Khumalo', purpose: 'Routine blood check', type: 'routine', status: 'inProgress' },
    { id: '3', date: day(0), time: '09:30', patient: 'Nomvula Dlamini', purpose: 'Prescription refill', type: 'chronic', status: 'checkedIn' },
    { id: '4', date: day(0), time: '10:00', patient: 'Johan Pretorius', purpose: 'Diabetes review', type: 'chronic', status: 'booked' },
    { id: '5', date: day(0), time: '10:30', patient: 'Lerato Molefe', purpose: 'Vitals check', type: 'routine', status: 'booked' },
    { id: '6', date: day(1), time: '09:00', patient: 'Ayanda Zulu', purpose: 'Hypertension review', type: 'chronic', status: 'booked' },
    { id: '7', date: day(1), time: '09:30', patient: 'Pieter Nel', purpose: 'Routine blood check', type: 'routine', status: 'booked' },
    { id: '8', date: day(2), time: '08:45', patient: 'Naledi Sithole', purpose: 'Chronic medication review', type: 'chronic', status: 'booked' },
    { id: '9', date: day(-1), time: '09:15', patient: 'Mpho Radebe', purpose: 'Routine check-up', type: 'routine', status: 'completed' },
    { id: '10', date: day(-1), time: '10:00', patient: 'Zanele Ndlovu', purpose: 'Prescription refill', type: 'chronic', status: 'missed' },
  ];
}

// ---------------------------------------------------------------------------
// The screen
// Pass role="doctor" (or "receptionist") from your login code.
// If no role is given, it checks the settings, and then defaults to "doctor".
// ---------------------------------------------------------------------------
export default function DoctorCalendarScreen({ role: roleFromApp }) {
  const settingsData = useSettings();
  const { settings, colors, fs } = settingsData;
  const styles = useMemo(() => makeStyles(colors, fs), [colors, fs]);
  const { dialog, close, confirm } = useDialog();

  // Work out who is using the screen
  const role = roleFromApp || settingsData.role || settings.role || 'doctor';
  const canEdit = role === 'doctor'; // only doctors can change statuses
  const canView = role === 'doctor' || role === 'receptionist';

  // "today" at midnight, worked out once
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const [selectedDate, setSelectedDate] = useState(today);
  const [appointments, setAppointments] = useState(() => makeSampleAppointments(today));
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');

  // -------------------------------------------------------------------------
  // Work out what to show
  // -------------------------------------------------------------------------
  const selectedKey = toDateKey(selectedDate);

  // Everything booked on the chosen date, earliest first
  const dayAppointments = appointments
    .filter((a) => a.date === selectedKey)
    .sort((a, b) => a.time.localeCompare(b.time));

  // Then apply the type filter and the search box
  const searchText = search.trim().toLowerCase();
  const visibleAppointments = dayAppointments.filter((a) => {
    const matchesType = typeFilter === 'all' || a.type === typeFilter;
    const matchesSearch = a.patient.toLowerCase().includes(searchText);
    return matchesType && matchesSearch;
  });

  // Counts for the summary and the filter buttons
  const countByStatus = (status) => dayAppointments.filter((a) => a.status === status).length;
  const countByType = (type) => dayAppointments.filter((a) => a.type === type).length;
  const filterCounts = { all: dayAppointments.length, chronic: countByType('chronic'), routine: countByType('routine') };

  // The 7 days (Mon to Sun) shown in the week strip
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(selectedDate), i));
  const datesWithAppointments = new Set(appointments.map((a) => a.date));

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  // Change the status of one appointment
  function setStatus(id, newStatus) {
    setAppointments((previous) =>
      previous.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
    );
    // TODO: save the new status to Firestore so the receptionist's queue updates too
  }

  // Move to the next step: Booked -> Checked in -> In progress -> Completed
  function advance(appointment) {
    const position = STATUS_FLOW.indexOf(appointment.status);
    const next = STATUS_FLOW[position + 1];
    if (next) setStatus(appointment.id, next);
  }

  // Go back one step (or back to Booked if it was marked missed)
  function undo(appointment) {
    if (appointment.status === 'missed') {
      setStatus(appointment.id, 'booked');
      return;
    }
    const position = STATUS_FLOW.indexOf(appointment.status);
    if (position > 0) setStatus(appointment.id, STATUS_FLOW[position - 1]);
  }

  function markMissed(appointment) {
    confirm(
      'Mark as missed?',
      `${appointment.patient} will be marked as not having attended. You can undo this later.`,
      'Mark missed',
      () => setStatus(appointment.id, 'missed'),
      true // red button
    );
  }

  function goToDate(date) {
    setSelectedDate(date);
    setSearch('');
  }

  // -------------------------------------------------------------------------
  // Patients and other roles should not see this screen
  // -------------------------------------------------------------------------
  if (!canView) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Ionicons name="lock-closed-outline" size={fs(40)} color={colors.muted} />
        <Text style={styles.blockedTitle}>Clinic staff only</Text>
        <Text style={styles.blockedText}>This schedule is only available to doctors and reception staff.</Text>
      </View>
    );
  }

  const relative = relativeLabel(selectedDate, today);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">
          {role === 'doctor' ? "Doctor's schedule" : 'Clinic schedule'}
        </Text>
        <Text style={styles.subtitle}>
          {settings.slotMinutes}-minute consultations{canEdit ? '' : ' · view only'}
        </Text>

        {/* Warning if the doctor turned "On duty" off in Settings */}
        {canEdit && !settings.onDuty && (
          <View style={styles.dutyBanner}>
            <Ionicons name="alert-circle-outline" size={fs(18)} color={colors.warning} />
            <Text style={styles.dutyText}>You are set to off duty. Turn "On duty" back on in Settings to accept patients.</Text>
          </View>
        )}

        {/* ---------- Date navigation ---------- */}
        <View style={styles.card}>
          <View style={styles.dateRow}>
            <Pressable
              onPress={() => goToDate(addDays(selectedDate, -1))}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              style={styles.arrowButton}
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>

            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.dateTitle}>{prettyDate(selectedDate)}</Text>
              {relative ? <Text style={styles.dateRelative}>{relative}</Text> : null}
            </View>

            <Pressable
              onPress={() => goToDate(addDays(selectedDate, 1))}
              accessibilityRole="button"
              accessibilityLabel="Next day"
              style={styles.arrowButton}
            >
              <Ionicons name="chevron-forward" size={22} color={colors.text} />
            </Pressable>
          </View>

          {/* Mon Tue Wed ... with a dot on days that have appointments */}
          <View style={styles.weekRow}>
            {weekDays.map((day) => {
              const key = toDateKey(day);
              const isSelected = key === selectedKey;
              const isToday = key === toDateKey(today);
              return (
                <Pressable
                  key={key}
                  onPress={() => goToDate(day)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={prettyDate(day)}
                  style={[styles.weekDay, isSelected && styles.weekDaySelected]}
                >
                  <Text style={[styles.weekDayName, isSelected && styles.weekDayTextSelected]}>
                    {DAY_NAMES[day.getDay()].slice(0, 3)}
                  </Text>
                  <Text style={[styles.weekDayNumber, isSelected && styles.weekDayTextSelected, isToday && !isSelected && { color: colors.primary }]}>
                    {day.getDate()}
                  </Text>
                  <View
                    style={[
                      styles.weekDot,
                      { backgroundColor: datesWithAppointments.has(key) ? (isSelected ? colors.onPrimary : colors.primary) : 'transparent' },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>

          {/* Jump back to today */}
          {selectedKey !== toDateKey(today) && (
            <Pressable onPress={() => goToDate(today)} accessibilityRole="button" style={styles.todayButton}>
              <Ionicons name="today-outline" size={fs(16)} color={colors.primary} />
              <Text style={styles.todayButtonText}>Go to today</Text>
            </Pressable>
          )}
        </View>

        {/* ---------- Summary numbers ---------- */}
        <View style={styles.summaryRow}>
          <SummaryBox styles={styles} number={countByStatus('booked')} label="Booked" color={colors.muted} />
          <SummaryBox styles={styles} number={countByStatus('checkedIn')} label="Waiting" color={colors.warning} />
          <SummaryBox styles={styles} number={countByStatus('inProgress')} label="In progress" color={colors.primary} />
          <SummaryBox styles={styles} number={countByStatus('completed')} label="Done" color={colors.success} />
        </View>

        {/* ---------- Search and filter ---------- */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={fs(18)} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search patient name"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            accessibilityLabel="Search patient name"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={fs(20)} color={colors.muted} />
            </Pressable>
          )}
        </View>

        <View style={styles.filterRow}>
          {TYPE_FILTERS.map((filter) => {
            const active = typeFilter === filter.value;
            return (
              <Pressable
                key={filter.value}
                onPress={() => setTypeFilter(filter.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {filter.label} ({filterCounts[filter.value]})
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ---------- The appointment list ---------- */}
        {visibleAppointments.length === 0 ? (
          <View style={[styles.card, styles.emptyCard]}>
            <Ionicons name="calendar-clear-outline" size={fs(32)} color={colors.muted} />
            <Text style={styles.emptyTitle}>
              {dayAppointments.length === 0 ? 'No appointments on this day' : 'No patients match'}
            </Text>
            <Text style={styles.emptyText}>
              {dayAppointments.length === 0
                ? 'Use the arrows to check another date.'
                : 'Try a different search or filter.'}
            </Text>
          </View>
        ) : (
          visibleAppointments.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              canEdit={canEdit}
              colors={colors}
              fs={fs}
              styles={styles}
              onAdvance={() => advance(appointment)}
              onUndo={() => undo(appointment)}
              onMissed={() => markMissed(appointment)}
            />
          ))
        )}
      </ScrollView>

      <AppDialog dialog={dialog} onClose={close} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// One patient's card
// ---------------------------------------------------------------------------
function AppointmentCard({ appointment, canEdit, colors, fs, styles, onAdvance, onUndo, onMissed }) {
  const info = STATUS_INFO[appointment.status];
  const tone = toneColors(colors, info.tone);
  const stepNumber = STATUS_FLOW.indexOf(appointment.status); // -1 if missed

  return (
    <View style={styles.apptCard}>
      <View style={styles.apptTop}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={styles.apptTime}>{appointment.time}</Text>
          <Text style={styles.apptPatient}>{appointment.patient}</Text>
          <Text style={styles.apptPurpose}>{appointment.purpose}</Text>
          <View style={[styles.typeTag, { backgroundColor: appointment.type === 'chronic' ? colors.primarySoft : colors.bg }]}>
            <Text style={[styles.typeTagText, { color: appointment.type === 'chronic' ? colors.primary : colors.muted }]}>
              {appointment.type === 'chronic' ? 'Chronic review' : 'Routine check-up'}
            </Text>
          </View>
        </View>

        {/* Coloured status badge */}
        <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
          <Ionicons name={info.icon} size={fs(14)} color={tone.fg} />
          <Text style={[styles.statusBadgeText, { color: tone.fg }]}>{info.label}</Text>
        </View>
      </View>

      {/* Progress bar: 4 little bars that fill in as the visit moves along */}
      <View style={styles.progressRow} accessibilityLabel={`Visit step ${Math.max(stepNumber + 1, 0)} of 4`}>
        {STATUS_FLOW.map((step, index) => (
          <View
            key={step}
            style={[
              styles.progressBar,
              { backgroundColor: index <= stepNumber ? tone.fg : colors.border },
              appointment.status === 'missed' && { backgroundColor: colors.dangerSoft },
            ]}
          />
        ))}
      </View>

      {/* Buttons (doctors only) */}
      {canEdit && (
        <View style={styles.actionsRow}>
          {info.nextLabel && (
            <Pressable onPress={onAdvance} accessibilityRole="button" style={[styles.actionButton, styles.actionPrimary]}>
              <Text style={styles.actionPrimaryText}>{info.nextLabel}</Text>
            </Pressable>
          )}
          {appointment.status !== 'booked' && (
            <Pressable onPress={onUndo} accessibilityRole="button" style={[styles.actionButton, styles.actionGhost]}>
              <Ionicons name="arrow-undo-outline" size={fs(15)} color={colors.text} />
              <Text style={styles.actionGhostText}>Undo</Text>
            </Pressable>
          )}
          {(appointment.status === 'booked' || appointment.status === 'checkedIn') && (
            <Pressable onPress={onMissed} accessibilityRole="button" style={[styles.actionButton, styles.actionDanger]}>
              <Text style={styles.actionDangerText}>Missed</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

// One of the 4 number boxes at the top
function SummaryBox({ styles, number, label, color }) {
  return (
    <View style={styles.summaryBox}>
      <Text style={[styles.summaryNumber, { color }]}>{number}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

// Picks the text colour and background colour for a status
function toneColors(colors, tone) {
  switch (tone) {
    case 'warning':
      return { fg: colors.warning, bg: colors.warningSoft };
    case 'primary':
      return { fg: colors.primary, bg: colors.primarySoft };
    case 'success':
      return { fg: colors.success, bg: colors.successSoft };
    case 'danger':
      return { fg: colors.danger, bg: colors.dangerSoft };
    default:
      return { fg: colors.muted, bg: colors.bg };
  }
}

// ---------------------------------------------------------------------------
// Styles. This is a function so the colours and text size can change live.
// ---------------------------------------------------------------------------
const makeStyles = (c, fs) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    centered: { alignItems: 'center', justifyContent: 'center', padding: 32 },
    content: { padding: 16, paddingBottom: 48, width: '100%', maxWidth: 640, alignSelf: 'center' },
    title: { fontSize: fs(30), fontWeight: '800', color: c.text, marginTop: 8 },
    subtitle: { fontSize: fs(14), color: c.muted, marginTop: 4, marginBottom: 16 },

    blockedTitle: { fontSize: fs(20), fontWeight: '700', color: c.text, marginTop: 12 },
    blockedText: { fontSize: fs(15), color: c.muted, textAlign: 'center', marginTop: 6 },

    dutyBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.warningSoft,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
    },
    dutyText: { flex: 1, fontSize: fs(13), color: c.warning, lineHeight: fs(18) },

    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16 },

    // Date navigation
    dateRow: { flexDirection: 'row', alignItems: 'center' },
    arrowButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
    dateTitle: { fontSize: fs(17), fontWeight: '700', color: c.text, textAlign: 'center' },
    dateRelative: { fontSize: fs(13), fontWeight: '600', color: c.primary, marginTop: 2 },
    weekRow: { flexDirection: 'row', gap: 4, marginTop: 14 },
    weekDay: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, minHeight: 64 },
    weekDaySelected: { backgroundColor: c.primary },
    weekDayName: { fontSize: fs(11), fontWeight: '600', color: c.muted },
    weekDayNumber: { fontSize: fs(16), fontWeight: '700', color: c.text, marginTop: 2 },
    weekDayTextSelected: { color: c.onPrimary },
    weekDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
    todayButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, minHeight: 40 },
    todayButtonText: { fontSize: fs(14), fontWeight: '700', color: c.primary },

    // Summary
    summaryRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
    summaryBox: { flex: 1, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, alignItems: 'center', paddingVertical: 12 },
    summaryNumber: { fontSize: fs(22), fontWeight: '800' },
    summaryLabel: { fontSize: fs(11), color: c.muted, marginTop: 2, fontWeight: '600' },

    // Search and filters
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      minHeight: 48,
      marginTop: 16,
    },
    searchInput: { flex: 1, fontSize: fs(15), color: c.text, paddingVertical: 10 },
    filterRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 16 },
    filterChip: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    filterChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    filterText: { fontSize: fs(13), fontWeight: '600', color: c.muted },
    filterTextActive: { color: c.onPrimary },

    // Empty state
    emptyCard: { alignItems: 'center', paddingVertical: 32 },
    emptyTitle: { fontSize: fs(16), fontWeight: '700', color: c.text, marginTop: 10 },
    emptyText: { fontSize: fs(14), color: c.muted, marginTop: 4, textAlign: 'center' },

    // Appointment cards
    apptCard: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 12 },
    apptTop: { flexDirection: 'row', alignItems: 'flex-start' },
    apptTime: { fontSize: fs(13), fontWeight: '700', color: c.primary },
    apptPatient: { fontSize: fs(17), fontWeight: '700', color: c.text, marginTop: 2 },
    apptPurpose: { fontSize: fs(13), color: c.muted, marginTop: 2, lineHeight: fs(18) },
    typeTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 8 },
    typeTagText: { fontSize: fs(11), fontWeight: '700' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    statusBadgeText: { fontSize: fs(12), fontWeight: '700' },

    progressRow: { flexDirection: 'row', gap: 4, marginTop: 14 },
    progressBar: { flex: 1, height: 5, borderRadius: 3 },

    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    actionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 12 },
    actionPrimary: { flexGrow: 1, backgroundColor: c.primary },
    actionPrimaryText: { color: c.onPrimary, fontSize: fs(14), fontWeight: '700' },
    actionGhost: { backgroundColor: c.bg },
    actionGhostText: { color: c.text, fontSize: fs(14), fontWeight: '600' },
    actionDanger: { backgroundColor: c.dangerSoft },
    actionDangerText: { color: c.danger, fontSize: fs(14), fontWeight: '700' },
  });