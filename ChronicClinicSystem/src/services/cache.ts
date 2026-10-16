// cache.js — Local device storage for offline support
// ─────────────────────────────────────────────────────────────────────────────
// This file handles everything that lives on the patient's device only.
// It is separate from firebase.js because AsyncStorage and Firebase are
// completely different systems — keeping them in one file makes both harder
// to understand, test, and maintain.
//
// HOW TO USE:
//   Import only the functions you need in each screen.
//   import { cacheAppointment, getNextCachedAppointment } from '../../services/cache';
//
// WHAT LIVES HERE (and why it does NOT go to Firebase):
//   - Appointment tokens — cached at booking time so the QR screen works offline
//   - ICD-10 codes and update metadata — stored by patient ID on this device
//     and shared with clinic staff only through QR codes
//
// SETUP:
//   Install AsyncStorage if you have not already:
//     npx expo install @react-native-async-storage/async-storage
//
// STORAGE KEYS:
//   All keys are defined as constants at the top of this file.
//   Never hardcode a key string directly in a screen — always import the function.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Storage key constants ────────────────────────────────────────────────────
// Defined once here so a typo in one place does not silently create a second key.
const CACHED_APPOINTMENTS_KEY = 'kwezi_cached_appointments';
const HEALTH_DATA_KEY = 'kwezi_health_data';


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — APPOINTMENT TOKEN CACHE
//
// When a patient books an appointment, bookAppointment() in firebase.js creates
// a token document in Firestore. That token code is then passed here to be
// stored locally. At the clinic, the QR screen reads the token from here and
// generates the QR code entirely on-device — no internet needed.
// ─────────────────────────────────────────────────────────────────────────────

/** cacheAppointment
 * Saves a new appointment and its token code to local device storage.
 *
 * Call this immediately after bookAppointment() in firebase.js returns.
 * The tokenCode field is what gets turned into a QR code at the clinic.
 *
 * @param {object} appointment - Must include:
 *   appointmentId (string)   - Firestore document ID of the appointment
 *   tokenCode     (string)   - The unique check-in code for this appointment
 *   appointmentDate (string) - ISO date string
 *   timeSlot      (string)   - e.g. '09:00-09:15'
 *   clinicId      (string)   - Firestore ID of the clinic
 *   status        (string)   - Should be 'booked' when first cached
 * Optional:
 *   clinicName      (string)
 *   appointmentType (string)
 *
 * Usage example:
 *   const { appointmentId, tokenCode } = await bookAppointment(uid, details);
 *   await cacheAppointment({ appointmentId, tokenCode, ...details, status: 'booked' });
 */
export async function cacheAppointment(appointment) {
  if (!appointment.appointmentId || !appointment.tokenCode) {
    throw new Error('appointmentId and tokenCode are required to cache an appointment.');
  }

  try {
    const existing = await AsyncStorage.getItem(CACHED_APPOINTMENTS_KEY);
    const appointments = existing ? JSON.parse(existing) : [];

    // Replace the appointment if it was already cached (e.g. status update),
    // otherwise add it as a new entry.
    const existingIndex = appointments.findIndex(
      (a) => a.appointmentId === appointment.appointmentId
    );
    if (existingIndex >= 0) {
      appointments[existingIndex] = appointment;
    } else {
      appointments.push(appointment);
    }

    await AsyncStorage.setItem(CACHED_APPOINTMENTS_KEY, JSON.stringify(appointments));
  } catch (error) {
    console.error('[Cache] cacheAppointment failed:', error);
    throw new Error('Could not save appointment to device. Please try again.');
  }
}

/** getCachedAppointments
 * Returns all appointments stored on this device.
 *
 * Works completely offline — reads only from AsyncStorage.
 * Returns an empty array if nothing has been cached yet.
 *
 * Usage example:
 *   const cached = await getCachedAppointments();
 *   cached.forEach(a => console.log(a.tokenCode));
 */
export async function getCachedAppointments() {
  try {
    const data = await AsyncStorage.getItem(CACHED_APPOINTMENTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('[Cache] getCachedAppointments failed:', error);
    return [];
  }
}

/** getNextCachedAppointment
 * Returns the soonest upcoming appointment that has status 'booked'.
 *
 * This is the appointment shown on the QR screen. Returns null if the patient
 * has no upcoming booked appointments cached on the device.
 *
 * Works completely offline.
 *
 * Usage example:
 *   const next = await getNextCachedAppointment();
 *   if (next) {
 *     // next.tokenCode is what you pass to the QRCode component
 *   }
 */
export async function getNextCachedAppointment() {
  try {
    const appointments = await getCachedAppointments();
    const now = new Date();

    return appointments
      .filter(
        (a) => a.status === 'booked' && new Date(a.appointmentDate) > now
      )
      .sort(
        (a, b) =>
          new Date(a.appointmentDate).getTime() -
          new Date(b.appointmentDate).getTime()
      )[0] ?? null;
  } catch (error) {
    console.error('[Cache] getNextCachedAppointment failed:', error);
    return null;
  }
}

/** updateCachedAppointmentStatus
 * Updates the status of one cached appointment on the device.
 *
 * Call this after cancelAppointment() in firebase.js so the QR screen does not
 * show a QR code for a cancelled visit.
 *
 * Common status values: 'booked', 'checked-in', 'cancelled'
 *
 * @param {string} appointmentId - The appointment to update
 * @param {string} newStatus     - The new status to set
 *
 * Usage example:
 *   await cancelAppointment(appointmentId);           // updates Firestore
 *   await updateCachedAppointmentStatus(appointmentId, 'cancelled'); // updates device
 */
export async function updateCachedAppointmentStatus(appointmentId, newStatus) {
  if (!appointmentId || !newStatus) {
    throw new Error('appointmentId and newStatus are required.');
  }

  try {
    const existing = await AsyncStorage.getItem(CACHED_APPOINTMENTS_KEY);
    if (!existing) return; // nothing cached, nothing to update

    const appointments = JSON.parse(existing);
    const updated = appointments.map((a) =>
      a.appointmentId === appointmentId ? { ...a, status: newStatus } : a
    );
    await AsyncStorage.setItem(CACHED_APPOINTMENTS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('[Cache] updateCachedAppointmentStatus failed:', error);
  }
}

/** clearCachedAppointments
 * Removes all cached appointments from the device.
 *
 * Call this on logout so a different patient logging in on the same device
 * does not see the previous patient's appointments.
 *
 * Usage example:
 *   await logoutUser();           // signs out of Firebase
 *   await clearCachedAppointments(); // clears local data
 */
export async function clearCachedAppointments() {
  try {
    await AsyncStorage.removeItem(CACHED_APPOINTMENTS_KEY);
  } catch (error) {
    console.error('[Cache] clearCachedAppointments failed:', error);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — LOCAL HEALTH DATA
//
// ICD-10 data and its update metadata are stored on-device only and never sent
// to Firestore. The patient QR generator reads this record for offline use.
//
// ICD-10 codes remain in patient-scoped local storage. When the patient chooses
// to show their appointment QR, the codes are carried to clinic staff in that QR;
// they are not written to Firestore.
// ─────────────────────────────────────────────────────────────────────────────

/** Legacy storage for older free-text condition and medication data.
 *
 * The current QR flow stores ICD-10 codes with saveLocalIcd10Record instead.
 *
 * This legacy data is not included in the current QR flow.
 *
 * @param {string[]} chronicConditions - e.g. ['Hypertension', 'Diabetes']
 * @param {string[]} medicationList    - e.g. ['Metformin 500mg', 'Amlodipine 5mg']
 *
 * Usage example:
 *   const qrData = JSON.parse(scannedQRString);
 *   await saveLocalHealthData(qrData.chronicConditions, qrData.medicationList);
 */
export async function saveLocalHealthData(chronicConditions, medicationList) {
  if (!Array.isArray(chronicConditions) || !Array.isArray(medicationList)) {
    throw new Error('chronicConditions and medicationList must both be arrays.');
  }

  try {
    await AsyncStorage.setItem(
      HEALTH_DATA_KEY,
      JSON.stringify({
        chronicConditions,
        medicationList,
        isChronicVerified: true,
        savedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error('[Cache] saveLocalHealthData failed:', error);
    throw new Error('Could not save health data to device. Please try again.');
  }
}

/** getLocalHealthData
 * Returns legacy free-text health data stored on this device.
 *
 * Works completely offline.
 * Returns safe default values if nothing has been saved yet.
 *
 * Usage example:
 *   const health = await getLocalHealthData();
 *   if (health.isChronicVerified) {
 *     console.log(health.chronicConditions); // ['Hypertension']
 *   }
 */
export async function getLocalHealthData() {
  try {
    const data = await AsyncStorage.getItem(HEALTH_DATA_KEY);
    if (data) return JSON.parse(data);
    // Return safe defaults if no health data has been saved yet
    return {
      chronicConditions: [],
      medicationList: [],
      isChronicVerified: false,
      savedAt: null,
    };
  } catch (error) {
    console.error('[Cache] getLocalHealthData failed:', error);
    return {
      chronicConditions: [],
      medicationList: [],
      isChronicVerified: false,
      savedAt: null,
    };
  }
}

/** clearLocalHealthData
 * Removes all health data from the device.
 *
 * Call this on logout so a different patient logging in on the same device
 * does not see the previous patient's health data.
 *
 * Usage example:
 *   await logoutUser();
 *   await clearLocalHealthData();
 */
export async function clearLocalHealthData() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const healthKeys = keys.filter(
      (key) => key === HEALTH_DATA_KEY || key.startsWith(`${HEALTH_DATA_KEY}:`),
    );
    if (healthKeys.length > 0) await AsyncStorage.multiRemove(healthKeys);
  } catch (error) {
    console.error('[Cache] clearLocalHealthData failed:', error);
  }
}

export type LocalIcd10Record = {
  localId: string;
  icd10Codes: string[];
  lastUpdatedAt: string;
  lastUpdatedByDoctorId: string;
};

function makeLocalId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Replaces the ICD-10 record stored locally for the patient. */
export async function saveLocalIcd10Record(
  patientId: string,
  record: Omit<LocalIcd10Record, 'localId'> & { localId?: string },
) {
  if (typeof patientId !== 'string' || !patientId.trim()) {
    throw new Error('A patient ID is required to save local ICD-10 codes.');
  }
  const { icd10Codes, lastUpdatedAt, lastUpdatedByDoctorId } = record;
  if (
    !Array.isArray(icd10Codes) ||
    icd10Codes.length > 10 ||
    !icd10Codes.every((code: unknown) => typeof code === 'string' && code.trim())
  ) {
    throw new Error('ICD-10 codes must be a list of up to 10 non-empty code strings.');
  }
  if (Number.isNaN(Date.parse(lastUpdatedAt)) || typeof lastUpdatedByDoctorId !== 'string') {
    throw new Error('A valid ICD-10 update time and doctor ID are required.');
  }

  const normalizedCodes = [...new Set(icd10Codes.map((code) => code.trim().toUpperCase()))];
  try {
    const storageKey = `${HEALTH_DATA_KEY}:${patientId}`;
    const stored = await AsyncStorage.getItem(storageKey);
    const existing = stored ? JSON.parse(stored) : {};
    await AsyncStorage.setItem(
      storageKey,
      JSON.stringify({
        ...(typeof existing === 'object' && existing !== null ? existing : {}),
        icd10Codes: normalizedCodes,
        localId:
          typeof record.localId === 'string' && record.localId.trim()
            ? record.localId
            : typeof existing?.localId === 'string' && existing.localId.trim()
              ? existing.localId
              : makeLocalId(),
        lastUpdatedAt,
        lastUpdatedByDoctorId,
      }),
    );
  } catch (error) {
    console.error('[Cache] saveLocalIcd10Record failed:', error);
    throw new Error('Could not save ICD-10 codes to this device. Please try again.');
  }
}

/** Reads (and initializes) the complete ICD-10 record stored on this device. */
export async function getLocalIcd10Record(patientId: string): Promise<LocalIcd10Record> {
  if (typeof patientId !== 'string' || !patientId.trim()) {
    throw new Error('A patient ID is required to read local ICD-10 codes.');
  }
  try {
    const storageKey = `${HEALTH_DATA_KEY}:${patientId}`;
    const stored = await AsyncStorage.getItem(storageKey);
    const data = stored ? JSON.parse(stored) : {};
    if (typeof data !== 'object' || data === null) {
      throw new Error('Stored ICD-10 data has an invalid format.');
    }
    const codes: unknown[] = Array.isArray(data.icd10Codes) ? data.icd10Codes : [];
    if (codes.length > 10) {
      throw new Error('Stored ICD-10 data exceeds the 10-code limit.');
    }
    const validCodes = codes.filter(
      (code: unknown): code is string => typeof code === 'string' && code.trim().length > 0,
    );
    if (validCodes.length !== codes.length) {
      throw new Error('Stored ICD-10 data has an invalid format.');
    }
    const record: LocalIcd10Record = {
      localId:
        typeof data.localId === 'string' && data.localId.trim() ? data.localId : makeLocalId(),
      icd10Codes: [...new Set(validCodes.map((code) => code.trim().toUpperCase()))],
      lastUpdatedAt:
        typeof data.lastUpdatedAt === 'string' && !Number.isNaN(Date.parse(data.lastUpdatedAt))
          ? data.lastUpdatedAt
          : '',
      lastUpdatedByDoctorId:
        typeof data.lastUpdatedByDoctorId === 'string' ? data.lastUpdatedByDoctorId : '',
    };
    await AsyncStorage.setItem(storageKey, JSON.stringify(record));
    return record;
  } catch (error) {
    console.error('[Cache] getLocalIcd10Record failed:', error);
    throw new Error('Could not read the ICD-10 codes stored on this device.');
  }
}

/** clearAllLocalData
 * Convenience function — clears both appointments and health data in one call.
 *
 * Call this on logout to fully reset the local state for the next user.
 *
 * Usage example:
 *   await logoutUser();
 *   await clearAllLocalData();
 */
export async function clearAllLocalData() {
  await Promise.all([
    clearCachedAppointments(),
    clearLocalHealthData(),
  ]);
}