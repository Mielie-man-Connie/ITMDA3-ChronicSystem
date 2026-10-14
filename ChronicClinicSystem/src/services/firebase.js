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
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';

// cache.js handles all AsyncStorage (offline/local storage) operations.
// bookAppointment imports cacheAppointment from here to store the token
// locally after writing it to Firestore.
import { cacheAppointment } from './cache';


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
 * @param {object} additionalData - Must include: name (string), phoneNumber (string)
 *                                  Optional: role (string) — defaults to 'p' (patient)
 * @returns {object} Firebase Auth user object containing uid, email, etc.
 * @throws If name or phoneNumber are missing, or if the email is already registered
 *
 * Usage example:
 *   const user = await registerUser('jan@email.com', 'pass123', {
 *     name: 'Jan Botha',
 *     phoneNumber: '0821234567',
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

  // Create the Firebase Auth account — handles password hashing and session
  const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const user = userCredential.user;
  const timestamp = new Date().toISOString();

  // Write the user profile to Firestore so screens can read name, role, etc.
  await setDoc(doc(db, 'users', user.uid), {
    email: user.email,
    name: additionalData.name.trim(),
    phoneNumber: additionalData.phoneNumber.trim(),
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
 * @returns {object} Profile object with id, name, email, phoneNumber, role,
 *                   accountVerified, createdAt, updatedAt
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

/** getCurrentUserProfile
 * Loads the Firestore profile for whoever is currently signed in.
 *
 * Use this in screens that need the logged-in user's data without having
 * to pass the uid around. HomeScreen and ProfileScreen both use this.
 *
 * @returns {object} Same shape as getUserById — includes id, name, role, etc.
 * @throws If no user is signed in
 *
 * Usage example:
 *   const user = await getCurrentUserProfile();
 *   console.log(user.role); // 'p', 'd', or 'r'
 */
export async function getCurrentUserProfile() {
  const user = auth.currentUser;
  if (!user) throw new Error('No user is signed in.');
  return getUserById(user.uid);
}

/** updateUserProfile
 * Updates one or more editable fields on a user's Firestore profile.
 *
 * Call this from the Profile/Settings screen when the user saves changes.
 * Only name, phoneNumber, and role can be changed through this function.
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
  const allowedFields = ['name', 'phoneNumber', 'role'];
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
  const { appointmentDate, appointmentType, clinicId, timeSlot } = appointmentDetails;
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
    status: 'booked',
    createdAt: new Date().toISOString(),
    appointmentDate: parsedDate.toISOString(),
    appointmentType,
    clinicId,
    timeSlot,
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
      tokenCode,
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
  const querySnapshot = await getDocs(q);
  const appointments = [];
  querySnapshot.forEach((document) => {
    appointments.push({ id: document.id, ...document.data() });
  });
  return appointments;
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

/** getAllAppointments
 * Returns every appointment in Firestore, sorted by date ascending.
 *
 * Used by the doctor and receptionist home screens to show a full schedule.
 * Patients should use getPatientAppointments() instead.
 *
 * @returns {Array} All appointment objects sorted by appointmentDate
 */
export async function getAllAppointments() {
  const snapshot = await getDocs(collection(db, 'appointments'));
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
 * @returns {Array} List of patient profile objects
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
  const querySnapshot = await getDocs(q);
  const patients = [];
  querySnapshot.forEach((document) => {
    patients.push({ id: document.id, ...document.data() });
  });
  return patients;
}

/** searchUsersByName
 * Finds users whose names contain the search text (case-insensitive).
 *
 * Used by the doctor's patient search bar. Fetches all users and filters
 * client-side since Firestore does not support native case-insensitive search.
 *
 * @param {string} searchText - The text to search for in user names
 * @returns {Array} Matching user profiles sorted alphabetically by name
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
    .filter((user) => (user.name || '').toLowerCase().includes(search))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — CLINIC AND ADMIN MANAGEMENT
// Functions for creating clinics, emergency numbers, and notifications.
// ─────────────────────────────────────────────────────────────────────────────

/** createClinic
 * Saves a new clinic document to the clinics collection.
 *
 * @param {{ address: string, dailySlotCapacity: number, name: string, province: string }}
 * @returns {string} The new Firestore document ID
 */
export async function createClinic({ address, dailySlotCapacity, name, province }) {
  if (!address?.trim() || !name?.trim() || !province?.trim()) {
    throw new Error('Address, clinic name, and province are required.');
  }
  const capacity = Number(dailySlotCapacity);
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error('Daily slot capacity must be a positive whole number.');
  }
  const reference = await addDoc(collection(db, 'clinics'), {
    address: address.trim(),
    dailySlotCapacity: capacity,
    name: name.trim(),
    province: province.trim(),
  });
  return reference.id;
}

/** createEmergencyNumber
 * Saves an emergency contact number linked to a clinic.
 *
 * @param {{ clinicId: string, number: string }}
 * @returns {string} The new Firestore document ID
 */
export async function createEmergencyNumber({ clinicId, number }) {
  if (!clinicId?.trim() || !number?.trim()) {
    throw new Error('Clinic ID and emergency number are required.');
  }
  const reference = await addDoc(collection(db, 'numbers'), {
    clinicId: clinicId.trim(),
    number: number.trim(),
  });
  return reference.id;
}

/** createNotification
 * Creates a notification document for a patient.
 * New notifications start with deliveryStatus 'pending'.
 *
 * @param {{ deliveryStatus?: string, message: string, patientId: string }}
 * @returns {string} The new Firestore document ID
 */
export async function createNotification({ deliveryStatus = 'pending', message, patientId }) {
  if (!message?.trim() || !patientId?.trim() || !deliveryStatus?.trim()) {
    throw new Error('Delivery status, message, and patient ID are required.');
  }
  const reference = await addDoc(collection(db, 'notifications'), {
    deliveryStatus: deliveryStatus.trim(),
    message: message.trim(),
    patientId: patientId.trim(),
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
  const names = ['appointments', 'clinics', 'notifications', 'numbers', 'queue', 'tokens', 'users'];
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