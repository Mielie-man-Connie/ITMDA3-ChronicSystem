import { useEffect } from 'react';
import { Stack, router, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';
import {
  getCurrentUserProfile,
  subscribeToAccountDeletionRequests,
  subscribeToAppointments,
} from '../services/firebase';
import {
  cancelLocalAppointmentRemindersForUser,
  cancelLocalNotificationsForUser,
  loadNotificationPreferences,
  notifyAdminOfDeletionRequests,
  subscribeToNotificationPreferenceChanges,
  syncLocalAppointmentReminders,
} from '../services/notifications';
import { ThemeProvider, useAppTheme } from '@/components/theme-provider';

type ReminderRole = 'patient' | 'doctor';
type ReminderPreferences = { enabled: boolean; reminderTime: 'day' | 'hours' };
type ReminderAppointment = {
  id: string;
  patientId?: string;
  doctorId?: string;
  status?: string;
  appointmentDate?: string | Date | { toDate: () => Date };
};

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { scheme, theme } = useAppTheme();

  useEffect(() => {
    let activeUserId: string | undefined;
    let unsubscribeAppointments: (() => void) | undefined;
    let unsubscribeDeletionRequests: (() => void) | undefined;
    let active = true;
    let appointmentSync = Promise.resolve();
    let deletionSync = Promise.resolve();
    let currentPreferences: ReminderPreferences | undefined;
    let currentAppointments: ReminderAppointment[] | undefined;
    let currentRole: ReminderRole | undefined;

    const syncCurrentAppointments = (userId: string) => {
      if (!currentPreferences || !currentAppointments || !currentRole) return;
      appointmentSync = appointmentSync
        .then(() => {
          if (auth.currentUser?.uid !== userId) return;
          return syncLocalAppointmentReminders({
            userId,
            role: currentRole,
            appointments: currentAppointments,
            ...currentPreferences,
          });
        })
        .catch((error) => {
          console.error('Could not sync local appointment reminders.', error);
        });
    };
    const unsubscribePreferenceChanges = subscribeToNotificationPreferenceChanges((preferences: ReminderPreferences) => {
      currentPreferences = preferences;
      if (activeUserId) syncCurrentAppointments(activeUserId);
    });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribeAppointments?.();
      unsubscribeDeletionRequests?.();
      unsubscribeAppointments = undefined;
      unsubscribeDeletionRequests = undefined;

      if (activeUserId && activeUserId !== user?.uid) {
        try {
          await cancelLocalNotificationsForUser(activeUserId);
        } catch (error) {
          console.error('Could not clear notifications for the previous account.', error);
        }
      }
      activeUserId = user?.uid;
      currentPreferences = undefined;
      currentAppointments = undefined;
      currentRole = undefined;
      router.replace(user ? ('/home' as Href) : ('/login' as Href));
      if (!user) return;

      try {
        const profile = await getCurrentUserProfile();
        if (!active || auth.currentUser?.uid !== user.uid) return;
        const role = profile.role;

        if (role === 'p' || role === 'patient' || role === 'd' || role === 'doctor') {
          currentPreferences = await loadNotificationPreferences();
          currentRole = role === 'p' || role === 'patient' ? 'patient' : 'doctor';
          if (!active || auth.currentUser?.uid !== user.uid) return;
          unsubscribeAppointments = subscribeToAppointments(
            (appointments: ReminderAppointment[]) => {
              currentAppointments = appointments;
              syncCurrentAppointments(user.uid);
            },
            (error: Error) => console.error('Could not load appointments for reminders.', error),
            role === 'p' || role === 'patient' ? user.uid : undefined,
          );
        } else if (role === 'a' || role === 'admin') {
          try {
            await cancelLocalAppointmentRemindersForUser(user.uid);
          } catch (error) {
            console.error('Could not clear appointment reminders for the administrator.', error);
          }
          unsubscribeDeletionRequests = subscribeToAccountDeletionRequests(
            (requests: { id: string; accountDeletionRequestedAt: string }[]) => {
              deletionSync = deletionSync
                .then(() => {
                  if (auth.currentUser?.uid !== user.uid) return;
                  return notifyAdminOfDeletionRequests({
                    adminId: user.uid,
                    requests,
                  });
                })
                .catch((error) => {
                  console.error('Could not notify the administrator about deletion requests.', error);
                });
            },
            (error: Error) => console.error('Could not monitor account-deletion requests.', error),
          );
        } else {
          await cancelLocalNotificationsForUser(user.uid);
        }
      } catch (error) {
        console.error('Could not initialize local notifications.', error);
      }
    });
    return () => {
      active = false;
      unsubscribe();
      unsubscribePreferenceChanges();
      unsubscribeAppointments?.();
      unsubscribeDeletionRequests?.();
    };
  }, []);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: theme.colors.background,
          },
        }}
      >
        <Stack.Screen name="patient" options={{ headerShown: false }} />
        <Stack.Screen name="qrgenerator" options={{ headerShown: false }} />
        <Stack.Screen name="doctor" options={{ headerShown: true, title: 'Your patients' }} />
        <Stack.Screen name="doctor/patient-info" options={{ headerShown: false }} />
        <Stack.Screen name="patient-data-modifier" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
