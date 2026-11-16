// HomeScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Home screen — shows different content depending on the signed-in user's role.
//
// HOW DATA LOADING WORKS (unchanged):
//   1. getCurrentUserProfile() fetches the signed-in user's Firestore document
//   2. Based on their role, the relevant Firebase functions are called
//   3. Loading and error states are shown while data is fetching
//
// ROLE CODES (from firebase.js):
//   'p' = patient, 'd' = doctor, 'r' = receptionist, 'a' = admin
//
// NOTE: only the layout and styling of this screen changed. All Firebase calls,
// listeners and filtering logic are the same as before.
// ─────────────────────────────────────────────────────────────────────────────

const Ionicons: React.ComponentType<{
  name: string;
  size?: number;
  color?: string;
  style?: any;
}> = ((require('@expo/vector-icons') as { Ionicons?: React.ComponentType<any> })?.Ionicons ??
  (() => null));

declare module '../../services/firebase' {
  export function getAllAppointments(...args: any[]): any;
  export function getClinicDoctors(...args: any[]): any;
  export function getClinicPatients(...args: any[]): any;
  export function getCurrentUserProfile(...args: any[]): Promise<{
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
  }>;
  export function getPatientAppointments(...args: any[]): any;
  export function subscribeToAppointments(...args: any[]): any;
}

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Firebase service functions — never call Firebase directly from this file
import { Link, useFocusEffect, type Href } from 'expo-router';
import {
  getAllAppointments,
  getClinicDoctors,
  getClinicPatients,
  getCurrentUserProfile,
  getPatientAppointments,
  subscribeToAppointments,
} from '../../services/firebase';

// Update this import path to wherever your BottomHotbar component lives
import { AccountVerificationIcon } from '@/components/account-verification-icon';
import { useAppTheme } from '@/components/theme-provider';
import BottomHotbar from '../../components/BottomHotbar';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Converts Firestore date values (Timestamp, ISO string, or Date)
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

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Whole days between today and the given date (0 = today, 1 = tomorrow, -1 = yesterday)
function daysFromToday(date: Date): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(new Date()).getTime()) / 86400000);
}

function relativeDayLabel(date: Date): string {
  const diff = daysFromToday(date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return date.toLocaleDateString('en-ZA', { weekday: 'long' });
  return date.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
}

function countdownLabel(date: Date): string {
  const diff = daysFromToday(date);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `In ${diff} days`;
}

// Groups an already-sorted list of appointments by calendar day.
function groupByDay(items: Appointment[]): { key: string; label: string; items: Appointment[] }[] {
  const groups: { key: string; label: string; items: Appointment[] }[] = [];
  items.forEach((appointment) => {
    const date = getAppointmentDate(appointment.appointmentDate);
    if (!date) return;
    const key = toDateKey(date);
    let group = groups.find((entry) => entry.key === key);
    if (!group) {
      const suffix = daysFromToday(date) < 7
        ? ` · ${date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`
        : '';
      group = { key, label: `${relativeDayLabel(date)}${suffix}`, items: [] };
      groups.push(group);
    }
    group.items.push(appointment);
  });
  return groups;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Doctors become "Dr Zwane", everyone else gets their first name.
function getDisplayName(fullName: string, roleCode: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((part) => part && !/^(dr\.?|doctor|mr\.?|mrs\.?|ms\.?|miss)$/i.test(part));
  if (parts.length === 0) return '';
  if (roleCode === 'd') return `Dr ${parts[parts.length - 1]}`;
  return parts[0];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type Appointment = {
  id: string;
  appointmentDate?: string | Date | { toDate: () => Date };
  appointmentType?: string;
  timeSlot?: string;
  patientId?: string;
  doctorId?: string;
  doctorName?: string;
  clinicId?: string;
  status?: string;
};

type Patient = {
  id: string;
  name?: string;
  accountVerified?: boolean;
  accountStatus?: string;
};

type Doctor = { id: string; name?: string };

function isAccountActive(patient: Patient): boolean {
  return patient.accountVerified === true || patient.accountStatus === 'active';
}

type HomeStyles = ReturnType<typeof createStyles>;

// ─────────────────────────────────────────────────────────────────────────────
// Main HomeScreen component
// Loads user profile on focus, then fetches the right data for their role.
// ─────────────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [role, setRole] = useState('');
  const [userName, setUserName] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentClinicId, setCurrentClinicId] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
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
        const roleCode = user.role === 'patient'
          ? 'p'
          : user.role === 'doctor'
            ? 'd'
            : user.role === 'receptionist'
              ? 'r'
              : user.role === 'admin'
                ? 'a'
                : user.role || '';
        setRole(roleCode);
        setCurrentUserId(user.id);
        setCurrentClinicId(user.clinicId || '');

        // Read-only: pick whichever name field the profile has.
        const profile = user as unknown as {
          name?: string;
          fullName?: string;
          displayName?: string;
        };
        setUserName(profile.name || profile.fullName || profile.displayName || '');

        if (roleCode === 'p') {
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
        } else if (roleCode === 'd' || roleCode === 'r') {
          const [allAppointments, clinicPatients, clinicDoctors] = await Promise.all([
            getAllAppointments(),
            getClinicPatients(),
            getClinicDoctors(),
          ]);
          if (!isActive) return;
          setAppointments(allAppointments);
          setPatients(clinicPatients);
          setDoctors(clinicDoctors);
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

  const knownRole = role === 'p' || role === 'd' || role === 'r' || role === 'a';

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome header */}
        {!loading && !error && knownRole && (
          <HomeHeader role={role} userName={userName} styles={styles} />
        )}

        <View style={styles.body}>
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

          {/* Role-based content */}
          {!loading && !error && role === 'p' && (
            <PatientHome appointments={appointments} styles={styles} />
          )}

          {!loading && !error && (role === 'd' || role === 'r') && (
            <DoctorHome
              appointments={appointments}
              patients={patients}
              doctors={doctors}
              currentUserId={currentUserId}
              currentClinicId={currentClinicId}
              role={role === 'd' ? 'doctor' : 'receptionist'}
              styles={styles}
            />
          )}

          {!loading && !error && role === 'a' && (
            <View style={styles.adminCard}>
              <View style={styles.adminIcon}>
                <Ionicons name="shield-checkmark-outline" size={24} color={theme.colors.primary} />
              </View>
              <Text style={styles.adminTitle}>Administrator</Text>
              <Text style={styles.adminText}>
                Manage clinic database records and test QR workflows from the admin console.
              </Text>
              <Link href={'/admin' as Href} asChild>
                <Pressable accessibilityRole="button" style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Open admin console</Text>
                </Pressable>
              </Link>
            </View>
          )}

          {/* Fallback for unknown roles */}
          {!loading && !error && !knownRole && (
            <Text style={styles.messageText}>
              No home screen is available for this account role.
            </Text>
          )}
        </View>
      </ScrollView>

      <BottomHotbar
        role={role}
        activeItem={null}
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Welcome header — greeting, name and today's date
// ─────────────────────────────────────────────────────────────────────────────
function HomeHeader({
  role,
  userName,
  styles,
}: {
  role: string;
  userName: string;
  styles: HomeStyles;
}) {
  const { theme } = useAppTheme();
  const displayName = getDisplayName(userName, role);
  const dateLabel = new Date().toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const subtitle: Record<string, string> = {
    p: 'Your upcoming appointments at a glance.',
    d: 'Here is your schedule for the next 10 days.',
    r: 'Clinic activity for the next 10 days.',
    a: 'Manage your clinic from the admin console.',
  };
  const icon: Record<string, IconName> = {
    p: 'heart-outline',
    d: 'medical-outline',
    r: 'people-outline',
    a: 'shield-checkmark-outline',
  };

  return (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerDate}>{dateLabel}</Text>
            <Text style={styles.headerGreeting}>{getGreeting()},</Text>
            <Text style={styles.headerName} numberOfLines={1}>
              {displayName || 'Welcome'}
            </Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name={icon[role] ?? 'person-outline'} size={26} color={theme.colors.onPrimary} />
          </View>
        </View>
        <Text style={styles.headerSubtitle}>{subtitle[role] ?? ''}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable pieces
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  styles,
}: {
  icon: IconName;
  label: string;
  value: string;
  styles: HomeStyles;
}) {
  const { theme } = useAppTheme();
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>
        <Ionicons name={icon} size={18} color={theme.colors.primary} />
      </View>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function SectionHeader({
  title,
  count,
  styles,
}: {
  title: string;
  count?: number;
  styles: HomeStyles;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {count !== undefined && (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

function EmptyState({
  icon,
  text,
  styles,
}: {
  icon: IconName;
  text: string;
  styles: HomeStyles;
}) {
  const { theme } = useAppTheme();
  return (
    <View style={styles.emptyCard}>
      <Ionicons name={icon} size={28} color={theme.colors.secondary} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

// Highlighted card for the next appointment
function NextUpCard({
  label,
  appointment,
  title,
  extraLine,
  styles,
}: {
  label: string;
  appointment: Appointment;
  title: string;
  extraLine?: string;
  styles: HomeStyles;
}) {
  const { theme } = useAppTheme();
  const date = getAppointmentDate(appointment.appointmentDate);
  const dateLabel = date
    ? date.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'Date not set';

  return (
    <View style={styles.heroCard}>
      {date ? (
        <View style={styles.heroPill}>
          <Text style={styles.heroPillText}>{countdownLabel(date)}</Text>
        </View>
      ) : null}
      <Text style={styles.heroLabel}>{label}</Text>
      <Text style={styles.heroTitle} numberOfLines={2}>{title}</Text>
      <View style={styles.heroMetaRow}>
        <View style={styles.heroMeta}>
          <Ionicons name="calendar-outline" size={16} color={theme.colors.onPrimary} />
          <Text style={styles.heroMetaText}>{dateLabel}</Text>
        </View>
        {appointment.timeSlot ? (
          <View style={styles.heroMeta}>
            <Ionicons name="time-outline" size={16} color={theme.colors.onPrimary} />
            <Text style={styles.heroMetaText}>{appointment.timeSlot}</Text>
          </View>
        ) : null}
      </View>
      {extraLine ? <Text style={styles.heroExtra}>{extraLine}</Text> : null}
    </View>
  );
}

// Seven-day bar chart showing how busy each day is
function WeekStrip({
  appointments,
  styles,
}: {
  appointments: Appointment[];
  styles: HomeStyles;
}) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setDate(day.getDate() + index);
    return day;
  });
  const counts = days.map((day) =>
    appointments.filter((appointment) => {
      const date = getAppointmentDate(appointment.appointmentDate);
      return date !== null && toDateKey(date) === toDateKey(day);
    }).length,
  );
  const max = Math.max(1, ...counts);
  const total = counts.reduce((sum, count) => sum + count, 0);

  return (
    <View style={styles.weekCard}>
      <View style={styles.weekHeader}>
        <Text style={styles.weekTitle}>This week</Text>
        <Text style={styles.weekTotal}>
          {total} appointment{total === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={styles.weekBars}>
        {days.map((day, index) => (
          <View key={toDateKey(day)} style={styles.weekCol}>
            <Text style={styles.weekCount}>{counts[index] > 0 ? counts[index] : ''}</Text>
            <View style={styles.weekBarTrack}>
              <View
                style={[
                  styles.weekBar,
                  counts[index] === 0 && styles.weekBarEmpty,
                  index === 0 && counts[index] > 0 && styles.weekBarToday,
                  { height: counts[index] > 0 ? 14 + (counts[index] / max) * 50 : 6 },
                ]}
              />
            </View>
            <Text style={[styles.weekDay, index === 0 && styles.weekDayToday]}>
              {day.toLocaleDateString('en-ZA', { weekday: 'short' })}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function AppointmentCard({
  appointment,
  title,
  extraLine,
  styles,
}: {
  appointment: Appointment;
  title: string;
  extraLine?: string;
  styles: HomeStyles;
}) {
  const date = getAppointmentDate(appointment.appointmentDate);
  const isToday = date !== null && toDateKey(date) === toDateKey(new Date());
  const timeLabel = appointment.timeSlot || '';
  const dateLabel = date
    ? date.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })
    : 'Date not set';
  const status = appointment.status && appointment.status !== 'scheduled'
    ? capitalise(appointment.status)
    : '';

  return (
    <View style={styles.appointmentCard}>
      <View style={[styles.dateBlock, isToday && styles.dateBlockToday]}>
        <Text style={[styles.dateDay, isToday && styles.dateTextToday]}>
          {date ? date.getDate() : '–'}
        </Text>
        <Text style={[styles.dateMonth, isToday && styles.dateTextToday]}>
          {date ? date.toLocaleDateString('en-ZA', { month: 'short' }) : ''}
        </Text>
      </View>
      <View style={styles.appointmentInfo}>
        <Text style={styles.appointmentTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.appointmentDetails}>
          {dateLabel}{timeLabel ? ` • ${timeLabel}` : ''}
        </Text>
        {extraLine ? <Text style={styles.appointmentDetails}>{extraLine}</Text> : null}
      </View>
      {isToday && !status ? (
        <View style={styles.chip}><Text style={styles.chipText}>Today</Text></View>
      ) : null}
      {status ? (
        <View style={styles.chip}><Text style={styles.chipText}>{status}</Text></View>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Patient Home
// Shows the patient's next appointment, upcoming and recent visits.
// appointments: array fetched from getPatientAppointments() in firebase.js
// ─────────────────────────────────────────────────────────────────────────────
function PatientHome({ appointments, styles }: { appointments: Appointment[]; styles: HomeStyles }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twoMonthsAhead = new Date(
    today.getFullYear(),
    today.getMonth() + 2,
    1,
  );
  const lastDayOfTargetMonth = new Date(
    twoMonthsAhead.getFullYear(),
    twoMonthsAhead.getMonth() + 1,
    0,
  ).getDate();
  twoMonthsAhead.setDate(Math.min(today.getDate(), lastDayOfTargetMonth));
  twoMonthsAhead.setHours(23, 59, 59, 999);
  const upcomingAppointments = appointments
    .filter((appointment) => {
      const date = getAppointmentDate(appointment.appointmentDate);
      return date !== null && date >= today && date <= twoMonthsAhead;
    })
    .sort((a, b) => {
      const dateA = getAppointmentDate(a.appointmentDate)?.getTime() ?? 0;
      const dateB = getAppointmentDate(b.appointmentDate)?.getTime() ?? 0;
      return dateA - dateB;
    });

  const pastAppointments = appointments
    .filter((appointment) => {
      const date = getAppointmentDate(appointment.appointmentDate);
      return date !== null && date < today && appointment.status !== 'cancelled';
    })
    .sort((a, b) => {
      const dateA = getAppointmentDate(a.appointmentDate)?.getTime() ?? 0;
      const dateB = getAppointmentDate(b.appointmentDate)?.getTime() ?? 0;
      return dateB - dateA;
    });

  const nextAppointment = upcomingAppointments[0];
  const laterAppointments = upcomingAppointments.slice(1);
  const nextDate = nextAppointment
    ? getAppointmentDate(nextAppointment.appointmentDate)
    : null;
  const nextLabel = nextDate
    ? nextDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
    : '—';

  return (
    <View>
      <View style={styles.statsRow}>
        <StatCard
          icon="calendar-outline"
          label="Upcoming"
          value={String(upcomingAppointments.length)}
          styles={styles}
        />
        <StatCard
          icon="checkmark-done-outline"
          label="Past visits"
          value={String(pastAppointments.length)}
          styles={styles}
        />
        <StatCard icon="time-outline" label="Next visit" value={nextLabel} styles={styles} />
      </View>

      {nextAppointment ? (
        <NextUpCard
          label="Your next appointment"
          appointment={nextAppointment}
          title={nextAppointment.appointmentType || 'Appointment'}
          extraLine={nextAppointment.doctorName ? `with ${nextAppointment.doctorName}` : undefined}
          styles={styles}
        />
      ) : (
        <View style={{ marginTop: 16 }}>
          <EmptyState icon="calendar-clear-outline" text="No upcoming appointments." styles={styles} />
        </View>
      )}

      {laterAppointments.length > 0 && (
        <>
          <SectionHeader title="Later appointments" count={laterAppointments.length} styles={styles} />
          {laterAppointments.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              title={appointment.appointmentType || 'Appointment'}
              extraLine={appointment.doctorName ? `Doctor: ${appointment.doctorName}` : undefined}
              styles={styles}
            />
          ))}
        </>
      )}

      {pastAppointments.length > 0 && (
        <>
          <SectionHeader title="Recent visits" styles={styles} />
          {pastAppointments.slice(0, 3).map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              title={appointment.appointmentType || 'Appointment'}
              extraLine={appointment.doctorName ? `Doctor: ${appointment.doctorName}` : undefined}
              styles={styles}
            />
          ))}
        </>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Doctor / Receptionist Home
// Shows the appointment schedule for the next 10 days and the booked patients.
// appointments: fetched from getAllAppointments() in firebase.js
// patients:     fetched from getClinicPatients() in firebase.js
// ─────────────────────────────────────────────────────────────────────────────
function DoctorHome({
  appointments,
  patients,
  doctors,
  currentUserId,
  currentClinicId,
  role,
  styles,
}: {
  appointments: Appointment[];
  patients: Patient[];
  doctors: Doctor[];
  currentUserId: string;
  currentClinicId: string;
  role: 'doctor' | 'receptionist';
  styles: HomeStyles;
}) {
  const today = new Date();
  const todayKey = toDateKey(today);
  const tenDayLimit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10);
  const tenDayLimitKey = toDateKey(tenDayLimit);
  const upcomingAppointments = appointments.filter((appointment) => {
    const date = getAppointmentDate(appointment.appointmentDate);
    if (!date || appointment.status === 'cancelled') return false;
    if (role === 'doctor' && appointment.doctorId !== currentUserId) return false;
    if (role === 'receptionist' && currentClinicId && appointment.clinicId && appointment.clinicId !== currentClinicId) return false;
    const appointmentKey = toDateKey(date);
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
  const scheduledPatients = patients.filter((patient) => bookedPatientIds.has(patient.id));
  const doctorNames = new Map(doctors.map((doctor) => [doctor.id, doctor.name || 'Doctor']));
  const todayCount = upcomingAppointments.filter((appointment) => {
    const date = getAppointmentDate(appointment.appointmentDate);
    return date !== null && toDateKey(date) === todayKey;
  }).length;

  const describe = (appointment: Appointment) => {
    const patient = scheduledPatients.find((p) => p.id === appointment.patientId);
    const doctorName = appointment.doctorName || (appointment.doctorId ? doctorNames.get(appointment.doctorId) : undefined);
    return {
      title: patient?.name || appointment.appointmentType || 'Appointment',
      extraLine:
        role === 'receptionist'
          ? `Doctor: ${doctorName || 'Not assigned'}`
          : appointment.appointmentType,
    };
  };

  const nextAppointment = upcomingAppointments[0];
  const nextDetails = nextAppointment ? describe(nextAppointment) : null;
  const nextDate = nextAppointment ? getAppointmentDate(nextAppointment.appointmentDate) : null;
  const nextIsToday = nextDate !== null && toDateKey(nextDate) === todayKey;
  const groups = groupByDay(upcomingAppointments);

  return (
    <View>
      <View style={styles.statsRow}>
        <StatCard icon="today-outline" label="Today" value={String(todayCount)} styles={styles} />
        <StatCard
          icon="calendar-outline"
          label="Next 10 days"
          value={String(upcomingAppointments.length)}
          styles={styles}
        />
        <StatCard
          icon="people-outline"
          label="Patients"
          value={String(scheduledPatients.length)}
          styles={styles}
        />
      </View>

      {nextAppointment && nextDetails ? (
        <NextUpCard
          label={nextIsToday ? 'Up next today' : 'Next appointment'}
          appointment={nextAppointment}
          title={nextDetails.title}
          extraLine={nextDetails.extraLine}
          styles={styles}
        />
      ) : null}

      <WeekStrip appointments={upcomingAppointments} styles={styles} />

      <SectionHeader title="Schedule" count={upcomingAppointments.length} styles={styles} />

      {groups.length > 0 ? (
        groups.map((group) => (
          <View key={group.key}>
            <Text style={styles.dayLabel}>{group.label}</Text>
            {group.items.map((appointment) => {
              const details = describe(appointment);
              return (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  title={details.title}
                  extraLine={details.extraLine}
                  styles={styles}
                />
              );
            })}
          </View>
        ))
      ) : (
        <EmptyState icon="calendar-clear-outline" text="No appointments found." styles={styles} />
      )}

      <SectionHeader title="Patient list" count={scheduledPatients.length} styles={styles} />

      {scheduledPatients.length > 0 ? (
        <View style={styles.listCard}>
          {scheduledPatients.map((patient, index) => (
            <View
              key={patient.id}
              style={[styles.patientRow, index < scheduledPatients.length - 1 && styles.patientRowDivider]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(patient.name || '')}</Text>
              </View>
              <Text style={styles.patientName} numberOfLines={1}>
                {patient.name || 'Unnamed patient'}
              </Text>
              <AccountVerificationIcon verified={isAccountActive(patient)} size={18} />
            </View>
          ))}
        </View>
      ) : (
        <EmptyState icon="people-outline" text="No patients found." styles={styles} />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — every colour and font size comes from the app theme, so changing the
// palette in the theme provider restyles this screen automatically.
// ─────────────────────────────────────────────────────────────────────────────
function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
  const shadow = {
    shadowColor: '#0F2E38',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  };

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.primary,
    },
    content: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    contentContainer: {
      paddingBottom: 32,
    },
    // Content is kept in a centred column so it stays tidy on tablets and web
    body: {
      width: '100%',
      maxWidth: 800,
      alignSelf: 'center',
      paddingHorizontal: 18,
    },

    // Header (full-width colour band, centred content)
    header: {
      backgroundColor: theme.colors.primary,
      paddingTop: 14,
      paddingBottom: 48,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    headerInner: {
      width: '100%',
      maxWidth: 800,
      alignSelf: 'center',
      paddingHorizontal: 18,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerTextBlock: {
      flex: 1,
      paddingRight: 12,
    },
    headerDate: {
      color: theme.colors.onPrimary,
      opacity: 0.8,
      fontSize: theme.fontSizes.small - 1,
      marginBottom: 10,
    },
    headerGreeting: {
      color: theme.colors.onPrimary,
      opacity: 0.9,
      fontSize: theme.fontSizes.body,
    },
    headerName: {
      color: theme.colors.onPrimary,
      fontSize: theme.fontSizes.body + 12,
      fontWeight: '700',
      marginTop: 2,
    },
    headerIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerSubtitle: {
      color: theme.colors.onPrimary,
      opacity: 0.85,
      fontSize: theme.fontSizes.small,
      marginTop: 12,
    },

    // States
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

    // Stats
    statsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: -28,
      marginBottom: 6,
    },
    statCard: {
      flex: 1,
      backgroundColor: theme.colors.secondarySurface,
      borderWidth: 1,
      borderColor: theme.colors.secondaryBorder,
      borderRadius: 14,
      padding: 12,
      ...shadow,
    },
    statIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: theme.colors.secondaryBorder,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    statValue: {
      fontSize: theme.fontSizes.body + 6,
      fontWeight: '700',
      color: theme.colors.darkest,
    },
    statLabel: {
      fontSize: theme.fontSizes.small - 1,
      color: theme.colors.secondary,
      marginTop: 2,
    },

    // Next appointment highlight
    heroCard: {
      marginTop: 16,
      backgroundColor: theme.colors.primary,
      borderRadius: 18,
      padding: 18,
      ...shadow,
    },
    heroPill: {
      position: 'absolute',
      top: 16,
      right: 16,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.22)',
    },
    heroPillText: {
      color: theme.colors.onPrimary,
      fontSize: theme.fontSizes.small - 1,
      fontWeight: '700',
    },
    heroLabel: {
      color: theme.colors.onPrimary,
      opacity: 0.85,
      fontSize: theme.fontSizes.small - 1,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 8,
      paddingRight: 90,
    },
    heroTitle: {
      color: theme.colors.onPrimary,
      fontSize: theme.fontSizes.body + 8,
      fontWeight: '700',
    },
    heroMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 16,
      marginTop: 14,
    },
    heroMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    heroMetaText: {
      color: theme.colors.onPrimary,
      fontSize: theme.fontSizes.small,
    },
    heroExtra: {
      color: theme.colors.onPrimary,
      opacity: 0.85,
      fontSize: theme.fontSizes.small,
      marginTop: 10,
    },

    // Week strip
    weekCard: {
      marginTop: 16,
      backgroundColor: theme.colors.secondarySurface,
      borderWidth: 1,
      borderColor: theme.colors.secondaryBorder,
      borderRadius: 14,
      padding: 16,
      ...shadow,
    },
    weekHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    weekTitle: {
      fontSize: theme.fontSizes.body,
      fontWeight: '700',
      color: theme.colors.darkest,
    },
    weekTotal: {
      fontSize: theme.fontSizes.small,
      color: theme.colors.secondary,
    },
    weekBars: {
      flexDirection: 'row',
      gap: 8,
    },
    weekCol: {
      flex: 1,
      alignItems: 'center',
    },
    weekCount: {
      height: 18,
      fontSize: theme.fontSizes.small - 1,
      fontWeight: '600',
      color: theme.colors.darkest,
    },
    weekBarTrack: {
      height: 64,
      width: '100%',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    weekBar: {
      width: '70%',
      maxWidth: 36,
      borderRadius: 8,
      backgroundColor: theme.colors.primarylight,
    },
    weekBarEmpty: {
      backgroundColor: theme.colors.secondaryBorder,
    },
    weekBarToday: {
      backgroundColor: theme.colors.primary,
    },
    weekDay: {
      marginTop: 6,
      fontSize: theme.fontSizes.small - 1,
      color: theme.colors.secondary,
    },
    weekDayToday: {
      color: theme.colors.darkest,
      fontWeight: '700',
    },

    // Section headers
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 22,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: theme.fontSizes.body + 2,
      fontWeight: '700',
      color: theme.colors.darkest,
    },
    countBadge: {
      marginLeft: 8,
      minWidth: 24,
      paddingHorizontal: 8,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.colors.secondaryBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countBadgeText: {
      fontSize: theme.fontSizes.small - 1,
      fontWeight: '600',
      color: theme.colors.darkest,
    },
    dayLabel: {
      fontSize: theme.fontSizes.small,
      fontWeight: '600',
      color: theme.colors.secondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: 4,
      marginBottom: 8,
    },

    // Appointments
    appointmentCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.secondarySurface,
      borderWidth: 1,
      borderColor: theme.colors.secondaryBorder,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
      ...shadow,
    },
    dateBlock: {
      width: 54,
      height: 54,
      borderRadius: 12,
      backgroundColor: theme.colors.secondaryBorder,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    dateBlockToday: {
      backgroundColor: theme.colors.primary,
    },
    dateDay: {
      fontSize: theme.fontSizes.body + 4,
      fontWeight: '700',
      color: theme.colors.darkest,
      lineHeight: theme.fontSizes.body + 6,
    },
    dateMonth: {
      fontSize: theme.fontSizes.small - 2,
      fontWeight: '600',
      color: theme.colors.darkest,
      textTransform: 'uppercase',
    },
    dateTextToday: {
      color: theme.colors.onPrimary,
    },
    appointmentInfo: {
      flex: 1,
    },
    appointmentTitle: {
      fontSize: theme.fontSizes.body,
      fontWeight: '600',
      color: theme.colors.darkest,
    },
    appointmentDetails: {
      fontSize: theme.fontSizes.small - 1,
      color: theme.colors.secondary,
      marginTop: 2,
    },
    chip: {
      marginLeft: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: theme.colors.secondaryBorder,
    },
    chipText: {
      fontSize: theme.fontSizes.small - 2,
      fontWeight: '600',
      color: theme.colors.darkest,
    },

    // Empty state
    emptyCard: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 24,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.secondaryBorder,
      backgroundColor: theme.colors.secondarySurface,
    },
    emptyText: {
      color: theme.colors.secondary,
      fontSize: theme.fontSizes.small + 1,
      textAlign: 'center',
    },

    // Patient list
    listCard: {
      backgroundColor: theme.colors.secondarySurface,
      borderWidth: 1,
      borderColor: theme.colors.secondaryBorder,
      borderRadius: 14,
      paddingHorizontal: 14,
      ...shadow,
    },
    patientRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
    },
    patientRowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.secondaryBorder,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    avatarText: {
      color: theme.colors.onPrimary,
      fontSize: theme.fontSizes.small - 1,
      fontWeight: '700',
    },
    patientName: {
      flex: 1,
      marginRight: 8,
      fontSize: theme.fontSizes.body,
      color: theme.colors.darkest,
    },

    // Admin
    adminCard: {
      marginTop: 20,
      backgroundColor: theme.colors.secondarySurface,
      borderWidth: 1,
      borderColor: theme.colors.secondaryBorder,
      borderRadius: 14,
      padding: 20,
      ...shadow,
    },
    adminIcon: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: theme.colors.secondaryBorder,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    adminTitle: {
      fontSize: theme.fontSizes.body + 4,
      fontWeight: '700',
      color: theme.colors.darkest,
    },
    adminText: {
      marginTop: 6,
      fontSize: theme.fontSizes.body,
      color: theme.colors.secondary,
    },
    primaryButton: {
      marginTop: 16,
      minHeight: 48,
      borderRadius: 10,
      backgroundColor: theme.colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    primaryButtonText: {
      color: theme.colors.onPrimary,
      fontWeight: '700',
      fontSize: theme.fontSizes.body,
    },
  });
}