import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { DeviceEventEmitter, Platform } from 'react-native';

const SETTINGS_KEY = 'appSettings';
const ADMIN_REQUESTS_KEY = 'seenAccountDeletionRequests';
const APPOINTMENT_KIND = 'appointment-reminder';
const DELETION_KIND = 'account-deletion-request';
const MAX_SCHEDULED_APPOINTMENTS = 60;
const PREFERENCE_CHANGE_EVENT = 'localNotificationPreferencesChanged';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureNotificationPermission() {
  if (Platform.OS === 'web') return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('appointments', {
      name: 'Appointment reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.status !== 'granted') {
    permission = await Notifications.requestPermissionsAsync();
  }
  return permission.granted || permission.status === 'granted';
}

function getAppointmentDate(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getReminderDate(appointmentDate, reminderTime) {
  const reminderDate = new Date(appointmentDate);
  reminderDate.setTime(
    reminderDate.getTime() - (reminderTime === 'hours' ? 2 : 24) * 60 * 60 * 1000,
  );
  return reminderDate;
}

async function getScheduledNotifications() {
  return Notifications.getAllScheduledNotificationsAsync();
}

export async function cancelLocalNotificationsForUser(userId) {
  if (!userId || Platform.OS === 'web') return;
  const scheduled = await getScheduledNotifications();
  await Promise.all(
    scheduled
      .filter((item) => item.content.data?.ownerId === userId)
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  );
}

export async function cancelLocalAppointmentRemindersForUser(userId) {
  if (!userId || Platform.OS === 'web') return;
  const scheduled = await getScheduledNotifications();
  await Promise.all(
    scheduled
      .filter(
        (item) =>
          item.content.data?.ownerId === userId &&
          item.content.data?.kind === APPOINTMENT_KIND,
      )
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  );
}

export async function scheduleTestNotification() {
  if (Platform.OS === 'web') {
    throw new Error('Local test notifications are only available on iOS and Android.');
  }
  if (!(await ensureNotificationPermission())) {
    throw new Error('Notification permission is not enabled on this device.');
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Test notification',
      body: 'Local notifications are working on this device.',
      data: { kind: 'admin-test' },
    },
    trigger: null,
  });
}

export async function syncLocalAppointmentReminders({
  userId,
  role,
  appointments,
  enabled = true,
  reminderTime = 'day',
}) {
  if (!userId || Platform.OS === 'web') return;

  const scheduled = await getScheduledNotifications();
  const existing = scheduled.filter(
    (item) =>
      item.content.data?.ownerId === userId &&
      item.content.data?.kind === APPOINTMENT_KIND,
  );

  if (!enabled || (role !== 'patient' && role !== 'doctor')) {
    await Promise.all(
      existing.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
    );
    return;
  }

  const now = Date.now();
  const reminders = appointments
    .filter((appointment) => {
      if (
        !appointment?.id ||
        ['cancelled', 'completed', 'missed'].includes(appointment.status)
      ) {
        return false;
      }
      return role === 'patient'
        ? appointment.patientId === userId
        : appointment.doctorId === userId;
    })
    .map((appointment) => {
      const date = getAppointmentDate(appointment.appointmentDate);
      if (!date) return null;
      const reminderDate = getReminderDate(date, reminderTime);
      if (reminderDate.getTime() <= now) return null;
      return { appointment, reminderDate };
    })
    .filter(Boolean)
    .sort((left, right) => left.reminderDate.getTime() - right.reminderDate.getTime())
    .slice(0, MAX_SCHEDULED_APPOINTMENTS);

  if (reminders.length && !(await ensureNotificationPermission())) {
    await Promise.all(
      existing.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
    );
    return;
  }

  const desiredByKey = new Map(
    reminders.map(({ appointment, reminderDate }) => [
      appointment.id,
      reminderDate.toISOString(),
    ]),
  );

  await Promise.all(
    existing
      .filter((item) => desiredByKey.get(item.content.data?.appointmentId) !== item.content.data?.reminderAt)
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  );

  const currentByAppointment = new Map(
    existing
      .filter((item) => desiredByKey.get(item.content.data?.appointmentId) === item.content.data?.reminderAt)
      .map((item) => [item.content.data.appointmentId, item]),
  );

  for (const { appointment, reminderDate } of reminders) {
    if (currentByAppointment.has(appointment.id)) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Appointment reminder',
        body: role === 'doctor'
          ? 'You have a scheduled appointment coming up. Open the app to view details.'
          : 'You have an appointment coming up. Open the app to view details.',
        data: {
          kind: APPOINTMENT_KIND,
          ownerId: userId,
          appointmentId: appointment.id,
          reminderAt: reminderDate.toISOString(),
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderDate,
        ...(Platform.OS === 'android' ? { channelId: 'appointments' } : {}),
      },
    });
  }
}

export async function notifyAdminOfDeletionRequests({ adminId, requests }) {
  if (!adminId || Platform.OS === 'web') return;
  const adminRequestsKey = `${ADMIN_REQUESTS_KEY}:${adminId}`;

  const currentKeys = requests.map(
    (request) => `${request.id}:${request.accountDeletionRequestedAt}`,
  );
  let previouslySeen = [];
  try {
    const stored = await AsyncStorage.getItem(adminRequestsKey);
    previouslySeen = stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Could not read handled account-deletion notifications.', error);
    throw error;
  }
  if (!Array.isArray(previouslySeen)) {
    throw new Error('Stored account-deletion notification state is invalid.');
  }

  const seen = new Set(previouslySeen);
  const hasNewRequest = requests.some(
    (request) => !seen.has(`${request.id}:${request.accountDeletionRequestedAt}`),
  );
  if (!hasNewRequest) return;
  const permissionGranted = await ensureNotificationPermission();
  if (!permissionGranted) return;

  const scheduled = await getScheduledNotifications();
  const alreadyScheduled = new Set(
    scheduled
      .filter(
        (item) =>
          item.content.data?.ownerId === adminId &&
          item.content.data?.kind === DELETION_KIND,
      )
      .map((item) => item.content.data?.requestKey),
  );

  for (const request of requests) {
    const requestKey = `${request.id}:${request.accountDeletionRequestedAt}`;
    if (seen.has(requestKey) || alreadyScheduled.has(requestKey)) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Account deletion request',
        body: 'A user has requested account deletion. Review the request in the admin console.',
        data: {
          kind: DELETION_KIND,
          ownerId: adminId,
          userId: request.id,
          requestKey,
        },
      },
      trigger: null,
    });
    seen.add(requestKey);
  }

  try {
    await AsyncStorage.setItem(
      adminRequestsKey,
      JSON.stringify(currentKeys.filter((key) => seen.has(key))),
    );
  } catch (error) {
    console.error('Could not save handled account-deletion notifications.', error);
    throw error;
  }
}

/**
 * @returns {Promise<{ enabled: boolean, reminderTime: 'day' | 'hours' }>}
 */
export async function loadNotificationPreferences() {
  const stored = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!stored) return { enabled: true, reminderTime: 'day' };
  const settings = JSON.parse(stored);
  return {
    enabled: settings.pushNotifications !== false,
    reminderTime: settings.reminderTime === 'hours' ? 'hours' : 'day',
  };
}

export function publishNotificationPreferences(preferences) {
  DeviceEventEmitter.emit(PREFERENCE_CHANGE_EVENT, preferences);
}

export function subscribeToNotificationPreferenceChanges(onChange) {
  const subscription = DeviceEventEmitter.addListener(PREFERENCE_CHANGE_EVENT, onChange);
  return () => subscription.remove();
}