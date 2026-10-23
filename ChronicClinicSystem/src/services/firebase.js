// firebase.js — Central Firebase service layer
// ─────────────────────────────────────────────────────────────────────────────
// HOW TO USE THIS FILE:
//   Import only the functions you need in each screen.
//   NEVER call Firebase directly from a screen file
//   — always go through these functions instead.
//   This keeps all Firebase logic in one place and makes it easy to update.
//
// EXAMPLE IMPORT:
//   import { loginUser, getPatientAppointments } from '../../services/firebase';
//
// ROLE CODES USED THROUGHOUT:
//   'p' = patient
//   'd' = doctor
//   'r' = receptionist
//
// LOCAL STORAGE / OFFLINE SUPPORT:
//   AsyncStorage functions have been moved to cache.js.
//   Import from there for anything that lives on the device:
//   import { cacheAppointment, getLocalHealthData } from '../../services/cache';
// ─────────────────────────────────────────────────────────────────────────────

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  getDocsFromServer,
  orderBy,
  onSnapshot,
  writeBatch,
  runTransaction,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';

// cache.js handles all AsyncStorage (offline/local storage) operations.
// bookAppointment imports cacheAppointment from here to store the token
// locally after writing it to Firestore.
import {
  cacheAppointment,
  getCachedClinicUsers,
  getCachedClinics,
  getCachedProfile,
  getCachedSchedule,
  saveCachedClinicUsers,
  saveCachedClinics,
  saveCachedProfile,
  saveCachedSchedule,
} from './cache';

async function fetchWithLocalCache(fetchRemote, readCache, writeCache, label) {
  let value;
  try {
    value = await fetchRemote();
  } catch (remoteError) {
    try {
      const cachedValue = await readCache();
      if (cachedValue !== null) return cachedValue;
    } catch (cacheError) {
      console.warn(`[${label}] Could not read local cache:`, cacheError);
    }
    throw remoteError;
  }

  try {
    await writeCache(value);
  } catch (cacheError) {
    console.warn(`[${label}] Could not save local cache:`, cacheError);
  }
  return value;
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — USER AUTHENTICATION
// Functions for creating accounts, signing in, and signing out.
// These are the first functions called when a user opens the app.
// ─────────────────────────────────────────────────────────────────────────────

/** registerUser
 * Creates a new Firebase Auth account and a matching Firestore profile document.
 *
 * Call this on the Sign Up screen when the user submits the registration form.
 * The Firestore document is stored under users/{uid} and contains all profile
 * data. The Firebase Auth account only stores the email and password.
 *
 * @param {string} email          - The user's email address
 * @param {string} password       - The user's password (min 6 characters)
 * @param {object} additionalData - Must include name, phoneNumber, idNumber, and homeAddress
 *                                  Optional: role (string) — defaults to 'p' (patient)
 * @returns {object} Firebase Auth user object containing uid, email, etc.
 * @throws If a required profile field is missing, or if the email is already registered
 *
 * Usage example:
 *   const user = await registerUser('jan@email.com', 'pass123', {
 *     name: 'Jan Botha',
 *     phoneNumber: '0821234567',
 *     idNumber: '1234567890123',
 *     homeAddress: '1 Example Street, Cape Town',
 *   });
 *   console.log(user.uid);
 */
export async function registerUser(email, password, additionalData = {}) {
  if (typeof email !== 'string' || !email.trim()) {
    throw new Error('Email is required to register a user.');
  }
  if (typeof password !== 'string' || !password) {
    throw new Error('Password is required to register a user.');
  }
  if (typeof additionalData.name !== 'string' || !additionalData.name.trim()) {
    throw new Error('Name is required to register a user.');
  }
  if (typeof additionalData.phoneNumber !== 'string' || !additionalData.phoneNumber.trim()) {
    throw new Error('Phone number is required to register a user.');
  }
  if (typeof additionalData.idNumber !== 'string' || !additionalData.idNumber.trim()) {
    throw new Error('ID number is required to register a user.');
  }
  if (typeof additionalData.homeAddress !== 'string' || !additionalData.homeAddress.trim()) {
    throw new Error('Home address is required to register a user.');
  }

  // Create the Firebase Auth account — handles password hashing and session
  const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const user = userCredential.user;
  const timestamp = new Date().toISOString();

  // Write the user profile to Firestore so screens can read name, role, etc.
  await setDoc(doc(db, 'users', user.uid), {
    email: user.email,
    name: additionalData.name.trim(),
    phoneNumber: additionalData.phoneNumber.trim(),
    idNumber: additionalData.idNumber.trim(),
    homeAddress: additionalData.homeAddress.trim(),
    createdAt: timestamp,
    role: additionalData.role || 'p',
    updatedAt: timestamp,
    accountVerified: false,
  });

  return user;
}

/** loginUser
 * Signs an existing user in with their email and password.
 *
 * Call this on the Login screen. On success, Firebase Auth stores the session
 * automatically — the user stays logged in until logoutUser() is called.
 * The auth listener in _layout.tsx detects this and redirects to /home.
 *
 * @param {string} email    - The user's registered email address
 * @param {string} password - The user's password
 * @returns {object} Firebase Auth user object
 * @throws If the email is not registered or the password is wrong
 *
 * Usage example:
 *   const user = await loginUser('jan@email.com', 'pass123');
 */
export async function loginUser(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

/** logoutUser
 * Signs the current user out and clears their Firebase Auth session.
 *
 * Call this from the Settings or TopNavBar logout button.
 * The auth listener in _layout.tsx detects the sign-out and redirects to /login.
 *
 * NOTE: Also call clearAllLocalData() from cache.js after this to wipe
 * the patient's locally stored appointments and health data from the device.
 *
 * Usage example:
 *   await logoutUser();
 *   await clearAllLocalData(); // imported from cache.js
 */
export async function logoutUser() {
  await signOut(auth);
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — USER PROFILE MANAGEMENT
// Functions for reading and updating Firestore profile documents.
// Use these whenever a screen needs to display or change user information.
// ─────────────────────────────────────────────────────────────────────────────

/** getUserById
 * Fetches a user's full profile document from Firestore by their UID.
 *
 * Use this when you have a specific user's UID and need their profile.
 * For the currently signed-in user, use getCurrentUserProfile() instead.
 *
 * @param {string} uid - The Firebase Auth user ID
 * @returns {Promise<{id: string, name?: string, email?: string, phoneNumber?: string, idNumber?: string, homeAddress?: string, role?: string, clinicId?: string, accountVerified?: boolean, accountStatus?: string}>}
 * @throws If no document exists for that UID
 *
 * Usage example:
 *   const profile = await getUserById('abc123');
 *   console.log(profile.name);  // 'Jan Botha'
 *   console.log(profile.role);  // 'p'
 */
export async function getUserById(uid) {
  const docRef = doc(db, 'users', uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  throw new Error('User profile not found');
}

/** Loads ICD-10 definitions from the chronic-illnesses Firestore collection. */
export async function getChronicIllnesses() {
  const snapshot = await getDocs(collection(db, 'chronic-illnesses'));
  return snapshot.docs
    .map((illnessDocument) => {
      const illness = illnessDocument.data();
      const fields = Object.fromEntries(
        Object.entries(illness).map(([key, value]) => [key.toLocaleLowerCase().replace(/[^a-z0-9]/g, ''), value]),
      );
      const code =
        fields.icd10code ??
        fields.icd10 ??
        fields.icd10diagnosis ??
        fields.conditioncode ??
        fields.diagnosiscode ??
        fields.code ??
        fields.codevalue ??
        illnessDocument.id;
      const name =
        fields.conditionname ??
        fields.illnessname ??
        fields.chronicillnessname ??
        fields.icd10name ??
        fields.icd10description ??
        fields.name ??
        fields.condition ??
        fields.chronicillness ??
        fields.illnessdescription ??
        fields.description ??
        fields.label;
      const normalizedCode =
        typeof code === 'string' || typeof code === 'number' ? String(code).trim().toUpperCase() : '';
      if (
        !normalizedCode ||
        typeof name !== 'string' ||
        !name.trim()
      ) {
        return null;
      }
      return { id: illnessDocument.id, code: normalizedCode, name: name.trim() };
    })
    .filter((illness) => illness !== null)
    .sort((left, right) => left.code.localeCompare(right.code));
}

/** Sets patient account activation without storing medical details on the server. */
export async function setPatientAccountActivation(uid, active) {
  if (typeof uid !== 'string' || !uid.trim() || typeof active !== 'boolean') {
    throw new Error('A patient ID and activation value are required.');
  }
  await updateDoc(doc(db, 'users', uid), {
    accountVerified: active,
    accountStatus: active ? 'active' : 'inactive',
    updatedAt: new Date().toISOString(),
  });
}

/** getCurrentUserProfile
 * Loads the Firestore profile for whoever is currently signed in.
 *
 * Use this in screens that need the logged-in user's data without having
 * to pass the uid around. HomeScreen and ProfileScreen both use this.
 *
 * @returns {Promise<{id: string, name?: string, email?: string, phoneNumber?: string, idNumber?: string, homeAddress?: string, role?: string, clinicId?: string, accountVerified?: boolean, accountStatus?: string}>}
 * @throws If no user is signed in
 *
 * Usage example:
 *   const user = await getCurrentUserProfile();
 *   console.log(user.role); // 'p', 'd', or 'r'
 */
export async function getCurrentUserProfile() {
  const user = auth.currentUser;
  if (!user) throw new Error('No user is signed in.');
  return fetchWithLocalCache(
    () => getUserById(user.uid),
    () => getCachedProfile(user.uid),
    (profile) => saveCachedProfile(profile),
    'getCurrentUserProfile',
  );
}

/** updateUserProfile
 * Updates one or more editable fields on a user's Firestore profile.
 *
 * Call this from the Profile/Settings screen when the user saves changes.
 * Only name, phoneNumber, idNumber, homeAddress, and role can be changed through this function.
 * Email and accountVerified have their own dedicated functions.
 *
 * @param {string} uid           - The Firebase Auth UID of the user to update
 * @param {object} updatedFields - Key-value pairs of fields to change
 * @throws If no valid fields are provided or any value is empty
 *
 * Usage example:
 *   await updateUserProfile('abc123', { name: 'Jan van Botha' });
 *   await updateUserProfile('abc123', { name: 'Jan', phoneNumber: '0829999999' });
 */
export async function updateUserProfile(uid, updatedFields) {
  const allowedFields = ['name', 'phoneNumber', 'idNumber', 'homeAddress', 'role'];
  const updates = Object.entries(updatedFields);
  if (
    updates.length === 0 ||
    updates.some(([field, value]) => !allowedFields.includes(field) || !value)
  ) {
    throw new Error('Provide one or more valid user profile fields to update.');
  }
  const docRef = doc(db, 'users', uid);
  await updateDoc(docRef, {
    ...Object.fromEntries(updates),
    updatedAt: new Date().toISOString()
  });
}

/** Updates a user profile from the administrator console. */
export async function updateAdminUserProfile(uid, updatedFields) {
  await requireAdminProfile();
  if (typeof uid !== 'string' || !uid.trim() || !updatedFields || typeof updatedFields !== 'object' || Array.isArray(updatedFields)) {
    throw new Error('A user ID and profile fields are required.');
  }
  const allowedFields = [
    'name',
    'email',
    'phoneNumber',
    'idNumber',
    'homeAddress',
    'role',
    'clinicId',
    'accountVerified',
    'accountStatus',
  ];
  const updates = Object.entries(updatedFields);
  if (!updates.length || updates.some(([field]) => field === 'id' || field === 'updatedAt')) {
    throw new Error('The admin profile update is empty or contains a reserved field.');
  }
  for (const [field, value] of updates) {
    if (field === 'accountVerified') {
      if (typeof value !== 'boolean') throw new Error(`${field} must be true or false.`);
    } else if (allowedFields.includes(field) && typeof value !== 'string') {
      throw new Error(`${field} must be text.`);
    }
  }
  if (updates.some(([field, value]) =>
    ['name', 'email', 'phoneNumber', 'idNumber', 'role'].includes(field) &&
    typeof value === 'string' &&
    !value.trim()
  )) {
    throw new Error('Name, email, phone number, ID number, and role cannot be blank.');
  }
  const nextRole = updatedFields.role;
  if (nextRole !== undefined && !['p', 'd', 'r', 'a'].includes(nextRole)) {
    throw new Error('Role must be p (patient), d (doctor), r (receptionist), or a (admin).');
  }
  if (uid.trim() === auth.currentUser?.uid && nextRole !== undefined && nextRole !== 'a') {
    throw new Error('You cannot remove administrator access from your own profile.');
  }
  await updateDoc(doc(db, 'users', uid.trim()), {
    ...updatedFields,
    updatedAt: new Date().toISOString(),
  });
}

/** Sends a Firebase password-reset email to the signed-in user. */
export async function sendCurrentUserPasswordReset() {
  const user = auth.currentUser;
  if (!user?.email) throw new Error('No signed-in user email is available.');
  await sendPasswordResetEmail(auth, user.email);
}

/** Records an account-deletion request for the signed-in user. */
export async function requestAccountDeletion() {
  const user = auth.currentUser;
  if (!user) throw new Error('No user is signed in.');
  await updateDoc(doc(db, 'users', user.uid), {
    accountDeletionRequestedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/** activatePatientAccount
 * Marks a patient's account as verified after the doctor issues an activation QR.
 *
 * Call this from the QR scanner screen after the patient scans the doctor's
 * activation QR code. This unlocks appointment booking for the patient.
 * Also call saveLocalHealthData() from cache.js to store the chronic data
 * from the QR on the device.
 *
 * @param {string} uid - The UID of the patient being activated
 *
 * Usage example:
 *   await activatePatientAccount('abc123');
 *   await saveLocalHealthData(conditions, medications); // from cache.js
 */
export async function activatePatientAccount(uid) {
  if (typeof uid !== 'string' || !uid.trim()) {
    throw new Error('A user UID is required to verify an account.');
  }
  const docRef = doc(db, 'users', uid);
  await updateDoc(docRef, {
    accountVerified: true,
    updatedAt: new Date().toISOString()
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — APPOINTMENT MANAGEMENT
// Functions for booking, reading, and cancelling appointments.
// Used by the Calendar and Booking screens on the patient side.
// ─────────────────────────────────────────────────────────────────────────────

/** bookAppointment
 * Creates a new appointment document and a matching token in Firestore,
 * then caches the token locally on the device for offline QR display.
 *
 * Call this from the BookingScreen when the patient confirms their booking.
 * The returned tokenCode is what gets drawn as a QR code on the QR screen.
 * The local cache write means the QR screen works without internet at the clinic.
 *
 * @param {string} patientId           - UID of the patient making the booking
 * @param {object} appointmentDetails  - Must include all of the following:
 *   @param {string} appointmentDate   - ISO date string e.g. '2026-10-15T09:00:00.000Z'
 *   @param {string} appointmentType   - e.g. 'chronic check-up' or 'medication collection'
 *   @param {string} clinicId          - Firestore ID of the clinic document
 *   @param {string} timeSlot          - e.g. '09:00-09:15'
 * @returns {{ appointmentId: string, tokenCode: string }}
 * @throws If any required field is missing or appointmentDate is invalid
 *
 * Usage example:
 *   const { appointmentId, tokenCode } = await bookAppointment('abc123', {
 *     clinicId: 'clinic456',
 *     appointmentDate: '2026-10-15T09:00:00.000Z',
 *     timeSlot: '09:00-09:15',
 *     appointmentType: 'chronic check-up',
 *   });
 *   // tokenCode is now cached locally — QR screen can show it without internet
 */
export async function bookAppointment(patientId, appointmentDetails) {
  const {
    appointmentDate,
    appointmentType,
    clinicId,
    timeSlot,
    doctorId,
    patientName,
    clinicName,
    recurringSeriesId,
    status = 'booked',
  } = appointmentDetails;
  if (!patientId || !appointmentDate || !appointmentType || !clinicId || !timeSlot) {
    throw new Error('Patient, clinic, date, time slot, and appointment type are required.');
  }
  const parsedDate = new Date(appointmentDate);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('Appointment date must be a valid date/time.');
  }

  // Write the appointment to Firestore
  const appointmentRef = await addDoc(collection(db, 'appointments'), {
    patientId,
    status,
    createdAt: new Date().toISOString(),
    appointmentDate: parsedDate.toISOString(),
    appointmentType,
    clinicId,
    timeSlot,
    ...(doctorId ? { doctorId } : {}),
    ...(patientName ? { patientName } : {}),
    ...(clinicName ? { clinicName } : {}),
    ...(recurringSeriesId ? { recurringSeriesId } : {}),
  });

  // Generate a unique token code — this string is what the QR encodes
  // Combines timestamp base-36 + random suffix for uniqueness
  const tokenCode = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .substring(2, 8)}`.toUpperCase();

  // Token expires at 23:59:59 on the appointment day
  const expiry = new Date(parsedDate);
  expiry.setHours(23, 59, 59, 999);

  // Write the token to Firestore — receptionist validates against this
  await addDoc(collection(db, 'tokens'), {
    appointmentId: appointmentRef.id,
    patientId,
    tokenCode,
    expiresAt: expiry.toISOString(),
    isUsed: false,
    usedAt: null,
    createdAt: new Date().toISOString(),
  });

  // Cache the appointment and tokenCode locally on the device.
  // This is what makes the QR screen work offline at the clinic.
  // If caching fails, the booking still succeeded — the patient can refresh
  // later when they have internet to re-download their token.
  try {
    await cacheAppointment({
      appointmentId: appointmentRef.id,
      patientId,
      tokenCode,
      expiresAt: expiry.toISOString(),
      appointmentDate: parsedDate.toISOString(),
      timeSlot,
      clinicId,
      clinicName: appointmentDetails.clinicName || '',
      appointmentType,
      status: 'booked',
    });
  } catch (cacheError) {
    // Log but do not throw — the Firestore write succeeded, which is what matters
    console.warn('[bookAppointment] Local cache write failed:', cacheError);
  }

  return { appointmentId: appointmentRef.id, tokenCode };
}

/** getPatientAppointments
 * Fetches all appointments belonging to a specific patient, newest first.
 *
 * Call this from CalendarScreen and HomeScreen to show the patient's schedule.
 * Returns an empty array if none exist.
 *
 * @param {string} patientId - UID of the patient whose appointments to fetch
 * @returns {Array} List of appointment objects with id and all Firestore fields
 *
 * Usage example:
 *   const appointments = await getPatientAppointments('abc123');
 *   appointments.forEach(appt => console.log(appt.timeSlot, appt.status));
 */
export async function getPatientAppointments(patientId) {
  const q = query(
    collection(db, 'appointments'),
    where('patientId', '==', patientId),
    orderBy('createdAt', 'desc')
  );
  return fetchWithLocalCache(
    async () => {
      const querySnapshot = await getDocsFromServer(q);
      return querySnapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }));
    },
    () => getCachedSchedule(patientId),
    (appointments) => saveCachedSchedule(patientId, appointments),
    'getPatientAppointments',
  );
}

/** Fetches this patient's upcoming booked appointments with their unused tokens. */
export async function getPatientCheckInAppointments(patientId) {
  if (typeof patientId !== 'string' || !patientId.trim()) {
    throw new Error('A patient ID is required to load check-in codes.');
  }

  const [appointmentSnapshot, tokenSnapshot] = await Promise.all([
    getDocs(query(collection(db, 'appointments'), where('patientId', '==', patientId))),
    getDocs(query(collection(db, 'tokens'), where('patientId', '==', patientId))),
  ]);

  const now = Date.now();
  const tokensByAppointment = new Map();
  tokenSnapshot.forEach((tokenDocument) => {
    const token = tokenDocument.data();
    const expiration = token.expiresAt?.toDate
      ? token.expiresAt.toDate()
      : new Date(token.expiresAt);
    if (
      token.appointmentId &&
      token.tokenCode &&
      token.isUsed === false &&
      !Number.isNaN(expiration.getTime()) &&
      expiration.getTime() >= now
    ) {
      tokensByAppointment.set(token.appointmentId, token);
    }
  });

  return appointmentSnapshot.docs
    .map((appointmentDocument) => {
      const appointment = appointmentDocument.data();
      const token = tokensByAppointment.get(appointmentDocument.id);
      const appointmentDate = appointment.appointmentDate?.toDate
        ? appointment.appointmentDate.toDate().toISOString()
        : appointment.appointmentDate;
      return {
        appointmentId: appointmentDocument.id,
        patientId,
        tokenCode: token?.tokenCode || '',
        expiresAt: token?.expiresAt,
        appointmentDate,
        timeSlot: appointment.timeSlot || '',
        clinicId: appointment.clinicId || '',
        clinicName: appointment.clinicName || '',
        appointmentType: appointment.appointmentType || '',
        status: appointment.status || '',
      };
    })
    .filter(
      (appointment) =>
        appointment.status === 'booked' &&
        Boolean(appointment.tokenCode) &&
        appointment.appointmentDate &&
        new Date(appointment.appointmentDate).getTime() >= new Date().setHours(0, 0, 0, 0),
    )
    .sort(
      (left, right) =>
        new Date(left.appointmentDate).getTime() - new Date(right.appointmentDate).getTime(),
    );
}

/** cancelAppointment
 * Changes an appointment's status to 'cancelled' in Firestore.
 *
 * Call this when the patient taps Cancel on the AppointmentDetailScreen.
 * The appointment document remains in Firestore for record-keeping.
 *
 * IMPORTANT: Also call updateCachedAppointmentStatus() from cache.js so the
 * local copy on the device is updated and the QR screen does not show a QR
 * for a cancelled appointment.
 *
 * @param {string} appointmentId - Firestore document ID of the appointment
 *
 * Usage example:
 *   await cancelAppointment('appt789');
 *   await updateCachedAppointmentStatus('appt789', 'cancelled'); // from cache.js
 */
export async function cancelAppointment(appointmentId) {
  const docRef = doc(db, 'appointments', appointmentId);
  await updateDoc(docRef, {
    status: 'cancelled'
  });
}

/** Updates supported operational fields on an appointment document. */
export async function updateAppointment(appointmentId, updatedFields) {
  const allowedFields = ['status', 'priorityLevel', 'checkInTime', 'doctorId'];
  const updates = Object.entries(updatedFields);
  if (
    typeof appointmentId !== 'string' ||
    !appointmentId.trim() ||
    updates.length === 0 ||
    updates.some(([field, value]) => !allowedFields.includes(field) || value === undefined)
  ) {
    throw new Error('Provide an appointment ID and valid fields to update.');
  }
  await updateDoc(doc(db, 'appointments', appointmentId), {
    ...Object.fromEntries(updates),
    updatedAt: new Date().toISOString(),
  });
}

/** Updates every appointment in a recurring series atomically. */
export async function updateAppointmentSeries(seriesId, updatedFields) {
  const updates = Object.entries(updatedFields);
  const allowedFields = ['status', 'doctorId'];
  if (
    typeof seriesId !== 'string' ||
    !seriesId.trim() ||
    updates.length === 0 ||
    updates.some(([field, value]) => !allowedFields.includes(field) || value === undefined)
  ) {
    throw new Error('Provide a recurring series ID and valid fields to update.');
  }
  const snapshot = await getDocs(
    query(collection(db, 'appointments'), where('recurringSeriesId', '==', seriesId))
  );
  if (snapshot.empty) throw new Error('No appointments were found for this recurring series.');
  const batch = writeBatch(db);
  snapshot.docs.forEach((appointmentDoc) => {
    batch.update(appointmentDoc.ref, {
      ...Object.fromEntries(updates),
      updatedAt: new Date().toISOString(),
    });
  });
  await batch.commit();
  return snapshot.docs.map((appointmentDoc) => appointmentDoc.id);
}

/** Subscribes to live appointment changes. Pass a patient ID to scope the feed. */
export function subscribeToAppointments(onUpdate, onError, patientId, onServerUpdate) {
  const cacheId = patientId || auth.currentUser?.uid;
  let serverSnapshotReceived = false;
  const appointmentsQuery = patientId
    ? query(collection(db, 'appointments'), where('patientId', '==', patientId))
    : collection(db, 'appointments');
  const unsubscribe = onSnapshot(
    appointmentsQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache) return;
      serverSnapshotReceived = true;
      onServerUpdate?.(new Date());
      const appointments = snapshot.docs
        .map((document) => ({ id: document.id, ...document.data() }))
        .sort((a, b) => {
          const aDate = a.appointmentDate?.toDate
            ? a.appointmentDate.toDate().getTime()
            : new Date(a.appointmentDate || 0).getTime();
          const bDate = b.appointmentDate?.toDate
            ? b.appointmentDate.toDate().getTime()
            : new Date(b.appointmentDate || 0).getTime();
          return aDate - bDate;
        });
      onUpdate(appointments);
      if (cacheId) {
        void saveCachedSchedule(cacheId, appointments).catch((cacheError) => {
          console.warn('[subscribeToAppointments] Could not save local schedule:', cacheError);
        });
      }
    },
    (firestoreError) => {
      if (!cacheId) {
        onError(firestoreError);
        return;
      }
      void getCachedSchedule(cacheId)
        .then((appointments) => {
          if (appointments !== null) onUpdate(appointments);
          else onError(firestoreError);
        })
        .catch((cacheError) => {
          console.warn('[subscribeToAppointments] Could not read local schedule:', cacheError);
          onError(firestoreError);
        });
    }
  );
  if (cacheId) {
    void getCachedSchedule(cacheId)
      .then((appointments) => {
        if (appointments !== null && !serverSnapshotReceived) onUpdate(appointments);
      })
      .catch((cacheError) => {
        console.warn('[subscribeToAppointments] Could not read local schedule:', cacheError);
      });
  }
  return unsubscribe;
}

/** Subscribes administrators to user profiles with pending account-deletion requests. */
export function subscribeToAccountDeletionRequests(onUpdate, onError) {
  let unsubscribe;
  let cancelled = false;

  void requireAdminProfile()
    .then(() => {
      if (cancelled) return;
      unsubscribe = onSnapshot(
        query(collection(db, 'users'), where('accountDeletionRequestedAt', '!=', null)),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (snapshot.metadata.fromCache) return;
          const requests = snapshot.docs
            .map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }))
            .filter((user) => typeof user.accountDeletionRequestedAt === 'string')
            .map((user) => ({
              id: user.id,
              accountDeletionRequestedAt: user.accountDeletionRequestedAt,
            }));
          onUpdate(requests);
        },
        onError,
      );
    })
    .catch(onError);

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

/** getAllAppointments
 * Returns every appointment in Firestore, sorted by date ascending.
 *
 * Used by the doctor and receptionist home screens to show a full schedule.
 * Patients should use getPatientAppointments() instead.
 *
 * @returns {Array} All appointment objects sorted by appointmentDate
 */
export async function getAllAppointments() {
  const cacheId = auth.currentUser?.uid;
  return fetchWithLocalCache(
    async () => {
      const snapshot = await getDocsFromServer(collection(db, 'appointments'));
      return snapshot.docs
        .map((document) => ({ id: document.id, ...document.data() }))
        .sort((a, b) => {
        const aDate = a.appointmentDate?.toDate
          ? a.appointmentDate.toDate().getTime()
          : new Date(a.appointmentDate || 0).getTime();
        const bDate = b.appointmentDate?.toDate
          ? b.appointmentDate.toDate().getTime()
          : new Date(b.appointmentDate || 0).getTime();
        return aDate - bDate;
        });
    },
    () => (cacheId ? getCachedSchedule(cacheId) : Promise.resolve(null)),
    (appointments) =>
      cacheId ? saveCachedSchedule(cacheId, appointments) : Promise.resolve(),
    'getAllAppointments',
  );
}

/** getAppointmentsForDate
 * Returns appointments on a specific calendar day, optionally for one patient.
 *
 * Used by the CalendarScreen to show appointments when the user taps a date.
 *
 * @param {Date}   date      - The calendar day to look up
 * @param {string} patientId - Optional. If provided, filters to one patient's appointments.
 *                             If omitted, returns all appointments on that day.
 * @returns {Array} Appointments whose appointmentDate falls on the given day
 *
 * Usage example:
 *   const appointments = await getAppointmentsForDate(new Date(), 'abc123');
 */
export async function getAppointmentsForDate(date, patientId) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('A valid Date object is required.');
  }
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;

  const all = patientId
    ? await getPatientAppointments(patientId)
    : await getAllAppointments();

  return all.filter((appointment) => {
    const d = appointment.appointmentDate?.toDate
      ? appointment.appointmentDate.toDate()
      : new Date(appointment.appointmentDate);
    const t = d.getTime();
    return !Number.isNaN(t) && t >= start && t < end;
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — QUEUE AND CHECK-IN MANAGEMENT
// Functions for the receptionist's queue dashboard and patient check-in.
// ─────────────────────────────────────────────────────────────────────────────

/** validateCheckInToken
 * Checks whether a scanned token code exists and has not been used yet.
 *
 * Call this from ScannerScreen after the receptionist scans a patient's QR code.
 * Returns { isValid: true, data, id } if valid, { isValid: false } if not.
 * Does NOT mark the token as used — call updateDoc separately if needed.
 *
 * @param {string} token - The raw token code string scanned from the patient's QR
 * @returns {{ isValid: boolean, data?: object, id?: string }}
 *
 * Usage example:
 *   const result = await validateCheckInToken('ABC12345');
 *   if (result.isValid) {
 *     console.log('Patient can check in:', result.data.patientId);
 *   } else {
 *     Alert.alert('Invalid or already used token');
 *   }
 */
export async function validateCheckInToken(token) {
  const q = query(
    collection(db, 'tokens'),
    where('tokenCode', '==', token)
  );
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    const tokenDoc = querySnapshot.docs[0];
    const data = tokenDoc.data();
    return { isValid: data.isUsed === false, data, id: tokenDoc.id };
  }
  return { isValid: false };
}

/**
 * Atomically validates a check-in token, marks it used, and adds its patient
 * to the clinic queue so the same code cannot be redeemed more than once.
 */
export async function redeemCheckInToken(token, expectedPatientId, expectedAppointmentId) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('A check-in token is required.');
  }
  if (typeof expectedPatientId !== 'string' || !expectedPatientId.trim()) {
    throw new Error('The QR code does not include a patient ID.');
  }
  if (typeof expectedAppointmentId !== 'string' || !expectedAppointmentId.trim()) {
    throw new Error('The QR code does not include an appointment ID.');
  }

  const tokenQuery = query(collection(db, 'tokens'), where('tokenCode', '==', token.trim()));
  const matchingTokens = await getDocs(tokenQuery);
  if (matchingTokens.empty) {
    return { ok: false, message: 'This appointment code is not valid.' };
  }
  const tokenReference = matchingTokens.docs[0].ref;

  return runTransaction(db, async (transaction) => {
    const tokenDocument = await transaction.get(tokenReference);
    if (!tokenDocument.exists()) {
      return { ok: false, message: 'This appointment code is not valid.' };
    }
    const tokenData = tokenDocument.data();
    if (tokenData.isUsed !== false) {
      return { ok: false, message: 'This appointment code has already been used.' };
    }
    if (tokenData.patientId !== expectedPatientId.trim()) {
      return { ok: false, message: 'This code does not match the patient ID in its QR.' };
    }
    if (tokenData.appointmentId !== expectedAppointmentId.trim()) {
      return { ok: false, message: 'This code does not match the appointment in its QR.' };
    }
    if (!tokenData.appointmentId || !tokenData.patientId) {
      return { ok: false, message: 'This appointment code is missing its patient or booking.' };
    }

    const expiration = tokenData.expiresAt?.toDate
      ? tokenData.expiresAt.toDate()
      : new Date(tokenData.expiresAt);
    if (Number.isNaN(expiration.getTime()) || expiration.getTime() < Date.now()) {
      return { ok: false, message: 'This appointment code has expired.' };
    }

    const patientReference = doc(db, 'users', tokenData.patientId);
    const appointmentReference = doc(db, 'appointments', tokenData.appointmentId);
    const [patientSnapshot, appointmentSnapshot] = await Promise.all([
      transaction.get(patientReference),
      transaction.get(appointmentReference),
    ]);
    if (!patientSnapshot.exists() || !appointmentSnapshot.exists()) {
      return { ok: false, message: 'The patient account for this code could not be found.' };
    }

    const patient = patientSnapshot.data();
    const patientRole = patient.role;
    if (patientRole !== 'p' && patientRole !== 'patient') {
      return { ok: false, message: 'The code does not belong to a patient account.' };
    }

    const queueReference = doc(collection(db, 'queue'));
    transaction.update(tokenReference, {
      isUsed: true,
      usedAt: new Date().toISOString(),
    });
    transaction.update(appointmentReference, {
      status: 'checked-in',
      checkInTime: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    transaction.set(queueReference, {
      appointmentId: tokenData.appointmentId,
      patientId: tokenData.patientId,
      patientName: patient.name || 'Patient',
      status: 'waiting',
      createdAt: new Date().toISOString(),
    });

    return {
      ok: true,
      appointmentId: tokenData.appointmentId,
      patientId: tokenData.patientId,
      patientName: patient.name || 'Patient',
      phoneNumber: patient.phoneNumber || '',
      email: patient.email || '',
      accountVerified: patient.accountVerified === true || patient.accountStatus === 'active',
    };
  });
}

/** subscribeToQueue
 * Subscribes to the queue collection and calls the callback whenever it changes.
 *
 * Call this from QueueDashboardScreen inside a useEffect. The callback fires
 * immediately with current data and again on every change. Always call the
 * returned unsubscribe function in the useEffect cleanup to prevent memory leaks.
 *
 * @param {function} callback - Called with an array of queue entry objects
 * @returns {function} unsubscribe — call this in the useEffect cleanup
 *
 * Usage example:
 *   useEffect(() => {
 *     const unsubscribe = subscribeToQueue((entries) => {
 *       setQueueEntries(entries);
 *     });
 *     return () => unsubscribe(); // prevents memory leaks
 *   }, []);
 */
export function subscribeToQueue(callback) {
  const q = query(collection(db, 'queue'));
  return onSnapshot(q, (snapshot) => {
    const entries = [];
    snapshot.forEach((document) => {
      entries.push({ id: document.id, ...document.data() });
    });
    callback(entries);
  });
}

/** updateQueueStatus
 * Updates the status of one entry in the queue collection.
 *
 * Call this when the receptionist taps Mark as Seen or another status button.
 * Common values: 'waiting', 'called', 'seen', 'missed'.
 *
 * @param {string} entryId   - Firestore document ID of the queue entry
 * @param {string} newStatus - The new status string
 *
 * Usage example:
 *   await updateQueueStatus('queueEntry001', 'seen');
 */
export async function updateQueueStatus(entryId, newStatus) {
  const docRef = doc(db, 'queue', entryId);
  await updateDoc(docRef, { status: newStatus });
}

/** addPatientToQueue
 * Adds a patient to the root queue collection after a successful check-in.
 *
 * Call this from ScannerScreen after validateCheckInToken() returns isValid: true.
 *
 * @param {{ appointmentId: string, patientId: string, patientName: string }}
 * @returns {string} The new Firestore document ID for the queue entry
 *
 * Usage example:
 *   const queueId = await addPatientToQueue({
 *     appointmentId: 'appt123',
 *     patientId: 'uid456',
 *     patientName: 'Jan Botha',
 *   });
 */
export async function addPatientToQueue({ appointmentId, patientId, patientName }) {
  if (!appointmentId?.trim() || !patientId?.trim() || !patientName?.trim()) {
    throw new Error('Appointment ID, patient ID, and patient name are required.');
  }
  const reference = await addDoc(collection(db, 'queue'), {
    appointmentId: appointmentId.trim(),
    patientId: patientId.trim(),
    patientName: patientName.trim(),
    status: 'waiting',
  });
  return reference.id;
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — USER AND PATIENT QUERIES
// Utility queries used by doctor and admin screens.
// ─────────────────────────────────────────────────────────────────────────────

/** getClinicPatients
 * Fetches all users with role 'p' (patient) from Firestore.
 *
 * Call this from PatientManagementScreen and the doctor's HomeScreen.
 * Returns an empty array if no patients are registered.
 *
 * @returns {Promise<Array<{id: string, name?: string, phoneNumber?: string, role?: string, clinicId?: string}>>}
 *
 * Usage example:
 *   const patients = await getClinicPatients();
 *   patients.forEach(p => console.log(p.name));
 */
export async function getClinicPatients() {
  const q = query(
    collection(db, 'users'),
    where('role', '==', 'p')
  );
  const cacheId = auth.currentUser?.uid;
  return fetchWithLocalCache(
    async () => {
      const querySnapshot = await getDocsFromServer(q);
      return querySnapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }));
    },
    () => (cacheId ? getCachedClinicUsers(cacheId, 'patients') : Promise.resolve(null)),
    (patients) =>
      cacheId
        ? saveCachedClinicUsers(
            cacheId,
            'patients',
            patients.map(({ id, name, accountVerified, accountStatus }) => ({
              id,
              name,
              accountVerified,
              accountStatus,
            })),
          )
        : Promise.resolve(),
    'getClinicPatients',
  );
}

/** @returns {Promise<Array<{id: string, name?: string, clinicId?: string, role?: string}>>} */
export async function getClinicDoctors() {
  const q = query(collection(db, 'users'), where('role', 'in', ['d', 'doctor']));
  const cacheId = auth.currentUser?.uid;
  return fetchWithLocalCache(
    async () => {
      const snapshot = await getDocsFromServer(q);
      return snapshot.docs.map((doctorDoc) => ({ id: doctorDoc.id, ...doctorDoc.data() }));
    },
    () => (cacheId ? getCachedClinicUsers(cacheId, 'doctors') : Promise.resolve(null)),
    (doctors) =>
      cacheId
        ? saveCachedClinicUsers(
            cacheId,
            'doctors',
            doctors.map(({ id, name }) => ({ id, name })),
          )
        : Promise.resolve(),
    'getClinicDoctors',
  );
}

function normalizeClinicNumbers(value) {
  if (typeof value === 'string' || typeof value === 'number') {
    const number = String(value).trim();
    return number ? [number] : [];
  }
  if (Array.isArray(value)) return value.flatMap(normalizeClinicNumbers);
  if (value && typeof value === 'object') {
    const directNumbers = [value.number, value.phoneNumber, value.phone]
      .flatMap(normalizeClinicNumbers);
    if (directNumbers.length) return directNumbers;
    return Object.values(value).flatMap(normalizeClinicNumbers);
  }
  return [];
}

/** @returns {Promise<Array<{id: string, name?: string, numbers: string[], dailySlotCapacity?: number}>>} */
export async function getClinics() {
  return fetchWithLocalCache(
    async () => {
      const snapshot = await getDocsFromServer(collection(db, 'clinics'));
      return snapshot.docs.map((clinicDoc) => {
        const data = clinicDoc.data();
        const numbers = normalizeClinicNumbers(
          data.numbers ?? data.number ?? data.phoneNumber ?? data.phone ?? data.contactNumber,
        );
        return {
          id: clinicDoc.id,
          ...data,
          numbers,
        };
      });
    },
    getCachedClinics,
    saveCachedClinics,
    'getClinics',
  );
}

/** searchUsersByName
 * Finds users whose names contain the search text (case-insensitive).
 *
 * Used by the doctor's patient search bar. Fetches all users and filters
 * client-side since Firestore does not support native case-insensitive search.
 *
 * @param {string} searchText - The text to search for in user names
 * @returns {Promise<Array<{id: string, name?: string, phoneNumber?: string, role?: string}>>}
 *
 * Usage example:
 *   const matches = await searchUsersByName('jan');
 */
export async function searchUsersByName(searchText) {
  const search = typeof searchText === 'string' ? searchText.trim().toLowerCase() : '';
  if (!search) return [];
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs
    .map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }))
    .filter((user) => user.role === 'p' && (user.name || '').toLowerCase().includes(search))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/** Searches all user profiles by name for the administrator autocomplete. */
export async function searchAdminUsersByName(searchText) {
  await requireAdminProfile();
  const search = typeof searchText === 'string' ? searchText.trim().toLocaleLowerCase() : '';
  if (!search) return [];
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs
    .map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }))
    .filter((user) => typeof user.name === 'string' && user.name.toLocaleLowerCase().includes(search))
    .sort((left, right) => (left.name || '').localeCompare(right.name || ''))
    .slice(0, 20);
}

/** @returns {Promise<Array<{id: string, name?: string, phoneNumber?: string, role?: string}>>} */
export async function searchUsersByPhoneNumber(searchText) {
  const search = typeof searchText === 'string'
    ? searchText.replace(/\D/g, '')
    : '';
  if (!search) return [];
  const snapshot = await getDocs(
    query(collection(db, 'users'), where('role', '==', 'p'))
  );
  return snapshot.docs
    .map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }))
    .filter((user) => String(user.phoneNumber || '').replace(/\D/g, '').includes(search))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — CLINIC AND ADMIN MANAGEMENT
// Functions for creating clinics.
// ─────────────────────────────────────────────────────────────────────────────

/** createClinic
 * Saves a new clinic document to the clinics collection.
 *
 * @param {{ address: string, dailySlotCapacity: number, name: string, numbers?: string[], province: string }}
 * @returns {string} The new Firestore document ID
 */
export async function createClinic({ address, dailySlotCapacity, name, numbers = [], province }) {
  if (!address?.trim() || !name?.trim() || !province?.trim()) {
    throw new Error('Address, clinic name, and province are required.');
  }
  const capacity = Number(dailySlotCapacity);
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error('Daily slot capacity must be a positive whole number.');
  }
  const clinicNumbers = (Array.isArray(numbers) ? numbers : [numbers])
    .filter((number) => typeof number === 'string' && number.trim())
    .map((number) => number.trim());
  const reference = await addDoc(collection(db, 'clinics'), {
    address: address.trim(),
    dailySlotCapacity: capacity,
    name: name.trim(),
    numbers: clinicNumbers,
    province: province.trim(),
  });
  return reference.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — DEVELOPMENT AND ADMIN UTILITIES
// Used by the fbtest screen. Not needed in production screens.
// ─────────────────────────────────────────────────────────────────────────────

/** getFirestoreCollections
 * Reads documents from every main collection.
 * Used by the fbtest screen to inspect the database.
 * Each collection reports its own error so one denied read does not hide others.
 *
 * @returns {Array} Array of { name, documents, error? } objects
 */
export async function getFirestoreCollections() {
  await requireAdminProfile();
  const names = ['appointments', 'chronic-illnesses', 'clinics', 'queue', 'tokens', 'users'];
  return Promise.all(
    names.map(async (name) => {
      try {
        const snapshot = await getDocs(collection(db, name));
        return {
          name,
          documents: snapshot.docs.map((document) => ({
            id: document.id,
            data: document.data(),
          })),
        };
      } catch (error) {
        return {
          name,
          documents: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );
}

const ADMIN_MANAGED_COLLECTIONS = new Set([
  'appointments',
  'chronic-illnesses',
  'clinics',
  'queue',
  'tokens',
  'users',
]);

async function requireAdminProfile() {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in with an administrator account to manage database data.');
  const profile = await getDoc(doc(db, 'users', user.uid));
  const role = profile.exists() ? profile.data().role : undefined;
  if (role !== 'a' && role !== 'admin') {
    throw new Error('Administrator access is required for database management.');
  }
}

function assertAdminCollection(collectionName) {
  if (!ADMIN_MANAGED_COLLECTIONS.has(collectionName)) {
    throw new Error(`The ${collectionName} collection is not available in the admin console.`);
  }
}

/** Reads the collections available in the administrator database console. */
export async function getAdminFirestoreCollections() {
  return getFirestoreCollections();
}

/** Creates a new Firestore document or replaces an existing document by ID. */
export async function saveAdminFirestoreDocument(collectionName, documentId, data) {
  await requireAdminProfile();
  assertAdminCollection(collectionName);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Document data must be a JSON object.');
  }
  if (
    collectionName === 'users' &&
    documentId === auth.currentUser?.uid &&
    data.role !== 'a'
  ) {
    throw new Error('You cannot remove administrator access from your own profile.');
  }

  const hydrate = (value) => {
    if (Array.isArray(value)) return value.map(hydrate);
    if (value && typeof value === 'object') {
      if (
        value.type === 'firestore/timestamp/1.0' &&
        Number.isInteger(value.seconds) &&
        Number.isInteger(value.nanoseconds)
      ) {
        return new Timestamp(value.seconds, value.nanoseconds);
      }
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, hydrate(nested)]));
    }
    return value;
  };
  const documentData = hydrate(data);
  if (typeof documentId === 'string' && documentId.trim()) {
    await setDoc(doc(db, collectionName, documentId.trim()), documentData);
    return documentId.trim();
  }
  const reference = await addDoc(collection(db, collectionName), documentData);
  return reference.id;
}

/** Deletes a Firestore document by collection and document ID. */
export async function deleteAdminFirestoreDocument(collectionName, documentId) {
  await requireAdminProfile();
  assertAdminCollection(collectionName);
  if (typeof documentId !== 'string' || !documentId.trim()) {
    throw new Error('A document ID is required to delete a record.');
  }
  await deleteDoc(doc(db, collectionName, documentId.trim()));
}