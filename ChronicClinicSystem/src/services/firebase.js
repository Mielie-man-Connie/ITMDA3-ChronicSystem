// firebase.js — Central Firebase service
//
// HOW TO USE THIS FILE:
//   Import only the functions you need in each screen.
//   NEVER directly call Firebase directly from a screen file
//     - always go through these functions instead.
//   This is done to keep all Firebase logic in one place.
//
// EXAMPLE IMPORT:
//   import { loginUser, getPatientAppointments } from '../../services/firebase';
//
// ROLE CODES USED THROUGHOUT:
//   'p' = patient
//   'd' = doctor
//   'r' = receptionist


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

// This Initialises Firebase Auth and Firestore instances from the config file.
// auth  - handles login sessions and account creation
// db    - the Firestore database used for all reads and writes
import { auth, db } from '../config/firebaseConfig';


// ─────────────────────────────────────────────────────────────────────────────
// Section 1 - User authentication
// The functions in this section are for creating accounts, signing in, and signing out.
// These are also the first functions called when a user opens the app.


/** registerUser Function
 * Creates a new Firebase Auth account and a matching Firestore profile document.
 * Call this on the Sign Up screen when the user submits the registration form.
 * The Firestore document is stored under users/{uid} and contains all profile data.
 * The Firebase Auth account only stores the email and password.
 *
 * email (string)          - The user's required email address
 * password (string)       - The user's required password
 * additionalData (object) - Must include: name and phoneNumber
 *                                  Optional: role (string), but with otherwise default to 'p' (patient)
 * 
 * returns {Promise<import('firebase/auth').User>} Firebase Auth user object
 * throws If name or phoneNumber are missing, or if the email is already registered
 *
 * EXAMPLE:
 *   const user = await registerUser('jan@email.com', 'pass123', {
 *     name: 'Jan Botha',
 *     phoneNumber: '0821234567',
 *   });
 *   console.log(user.uid); // the new user's unique ID
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

  // Creates the Firebase Auth account — this handles password hashing and session
  const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const user = userCredential.user;

  const timestamp = new Date().toISOString();

  // Write the user profile to Firestore so screens can read display name,
  // phone number, role, and verification status
  await setDoc(doc(db, 'users', user.uid), {
    email: user.email,
    name: additionalData.name.trim(),
    phoneNumber: additionalData.phoneNumber.trim(),
    createdAt: timestamp,
    role: additionalData.role || 'p', // defaults to patient
    updatedAt: timestamp,
    accountVerified: false,
  });

  return user;
}


/** Login Function 
 * Signs an existing user in with their email and password.
 *
 * This will be called on the Login screen.
 * On success, Firebase Auth stores the session automatically
 *   - the user stays logged in until logoutUser() is called.
 * UserContext listens for this change and updates the app navigation.
 *
 * email (string)    - The user's registered email address
 * password (string) - The user's password
 * returns {Promise<import('firebase/auth').User>} Firebase Auth user object
 * throws If the email is not registered or the password is wrong
 *
 * Use Example:
 *   const user = await loginUser('jan@email.com', 'pass123');
 *   console.log(user.uid);
 */
export async function loginUser(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

/** Logout Function
 * Signs the current user out and clears their local session.
 *
 * Call this when the user taps the Logout button (in TopNavBar or Settings).
 * UserContext detects the sign-out and redirects to the Login screen automatically.
 *
 * Use Example:
 *   await logoutUser();
 */
export async function logoutUser() {
  await signOut(auth);
}


// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — User Profile Management
// Functions for reading and updating the Firestore profile documents.
// Use these whenever a screen needs to display or change user information.

/** getUserById Function
 * Fetches a user's full profile document from Firestore by their UID.
 *
 * Use this after login to get the user's name, role, phone number, and
 * verification status. UserContext calls this automatically on login, so most
 * screens can read from UserContext instead of calling this directly.
 *
 * uid (string)     - The Firebase Auth user ID (available as user.uid)
 * @returns {object} The user's Firestore profile including id, name, email,
 *                   phoneNumber, role, accountVerified, createdAt, updatedAt
 * @throws If no document exists for that UID
 *
 * Use Example:
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

// Loads the Firestore profile for whoever is currently signed in.
export async function getCurrentUserProfile() {
  const user = auth.currentUser;
  if (!user) throw new Error('No user is signed in.');
  return getUserById(user.uid);
}

/** updateUserProfile Function
 * Updates one or more editable fields on a user's Firestore profile.
 *
 * This will be called from the Profile/Settings screen when the user saves changes to their name
 * or phone number. Email and accountVerified cannot be changed through this function
 *   — those have their own dedicated functions.
 *
 * Allowed fields: 'name', 'phoneNumber', 'role'
 *
 * @param {string} uid           - The Firebase Auth UID of the user to update
 * @param {object} updatedFields - Key-value pairs of the fields to change
 * @throws If no valid fields are provided or if any value is empty
 *
 * Use Example:
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

/** activatePatientAccount Function
 * Marks the patient's account as verified after the doctor issues an activation QR.
 *
 * Call this from the QR scanner screen after the patient successfully scans the doctor's activation QR code.
 * This is the step that unlocks appointment booking for the patient.
 *
 * @param {string} uid - The UID of the patient being activated
 *
 * Use Example:
 *   await activatePatientAccount('abc123');
 *   // Patient can now book appointments
 */
export async function activatePatientAccount(uid) {
  if (typeof uid !== 'string' || !uid.trim()) {
    throw new Error('A user UID is required to verify an account.');
  }
  const docRef = doc(db, 'users', uid);
  await updateDoc(docRef, {accountVerified: true, updatedAt: new Date().toISOString()});
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — APPOINTMENT MANAGEMENT
// Functions for booking, reading, and cancelling appointments.
// Used by the Calendar and Booking screens on the patient side.

/** bookAppointment Function
 *  Creates a new appointment document in Firestore.
 *
 * Call this from the BookingScreen when the patient confirms their booking.
 * All five fields are required — the function throws if any are missing.
 * The appointment starts with its status as 'booked' and changes to 'checked-in' when the patient scans in at the clinic.
 *
 * @param {string} patientId           - UID of the patient making the booking
 * @param {object} appointmentDetails  - Must include:
 *   @param {string} appointmentDate   - ISO date string e.g. '2026-10-15T09:00:00.000Z'
 *   @param {string} appointmentType   - e.g. 'chronic check-up' or 'medication collection'
 *   @param {string} clinicId          - Firestore ID of the clinic document
 *   @param {string} timeSlot          - e.g. '09:00-09:15'
 * @returns {string} The Firestore document ID of the new appointment
 * @throws If any required field is missing or if the date is not a valid ISO string
 *
 * Use Example:
 *   const appointmentId = await bookAppointment('abc123', {
 *     clinicId: 'clinic456',
 *     appointmentDate: '2026-10-15T09:00:00.000Z',
 *     timeSlot: '09:00-09:15',
 *     appointmentType: 'chronic check-up',
 *   });
 */
export async function bookAppointment(patientId, appointmentDetails) {
  const { appointmentDate, appointmentType, clinicId, timeSlot } = appointmentDetails;
  if (!patientId || !appointmentDate || !appointmentType || !clinicId || !timeSlot) {
    throw new Error('Patient, clinic, date, time slot, and appointment type are required.');
  }
  const parsedAppointmentDate = new Date(appointmentDate);
  if (Number.isNaN(parsedAppointmentDate.getTime())) {
    throw new Error('Appointment date must be a valid date/time.');
  }
  const docRef = await addDoc(collection(db, 'appointments'), {
    patientId,
    status: 'booked',
    createdAt: new Date().toISOString(),
    appointmentDate: parsedAppointmentDate.toISOString(),
    appointmentType,
    clinicId,
    timeSlot,
  });
  return docRef.id;
}

/** getPatientAppointments Function
 * Fetches all appointments belonging to a specific patient, newest first.
 *
 * Call this from the CalendarScreen and HomeScreen to display the patient's upcoming and past appointments.
 * Returns an empty array if none exist.
 *
 * @param {string} patientId - UID of the patient whose appointments to fetch
 * @returns {Array} List of appointment objects, each with id and all Firestore fields
 *
 * Use Example:
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
  querySnapshot.forEach((doc) => {
    appointments.push({ id: doc.id, ...doc.data() });
  });
  return appointments;
}

/** cancelAppointment Function
 * Changes an appointment's status to 'cancelled'.
 *
 * Call this when the patient taps Cancel on the AppointmentDetailScreen.
 * The appointment document remains in Firestore with status 'cancelled'
 * rather than being deleted, so there is a record it existed.
 *
 * @param {string} appointmentId - Firestore document ID of the appointment to cancel
 *
 * Use Example:
 *   await cancelAppointment('appt789');
 */
export async function cancelAppointment(appointmentId) {
  const docRef = doc(db, 'appointments', appointmentId);
  await updateDoc(docRef, {
    status: 'cancelled'
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — Queue & check-in management
// Functions for the receptionist's queue dashboard and patient check-in flow.
// The receptionist screen uses subscribeToQueue for live updates.

/** validateCheckInToken Function
 * Checks whether a scanned token code is valid and has not been used yet.
 *
 * Call this from ScannerScreen after the receptionist scans a patient's QR code.
 * Returns an object with isValid: true/false and the token data if found.
 * Does NOT mark the token as used — call a separate update if you need that.
 *
 * @param {string} token - The raw token code string scanned from the patient's QR
 * @returns {object} { isValid: boolean, data: object|undefined, id: string|undefined }
 *
 * Use Example:
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

/** subscribeToQueue Function
 * Subscribes to the queue collection and fires a callback whenever it changes.
 *
 * This will be called this from QueueDashboardScreen inside a useEffect.
 * The callback fires immediately with the current queue and then again every time a patient checks in or a status changes.
 * IMPORTANT: call the returned unsubscribe function when the screen unmounts, or you will have a memory leak.
 *
 * @param {function} callback - Called with an array of queue entry objects
 *                              whenever the queue changes
 * @returns {import('firebase/firestore').Unsubscribe} unsubscribe — call in effect cleanup
 *  
 * Useage Example:
 *   useEffect(() => {
 *     const unsubscribe = subscribeToQueue((entries) => {
 *       setQueueEntries(entries);
 *     });
 *     return () => unsubscribe(); // ← this line prevents memory leaks
 *   }, []);
 */
export function subscribeToQueue(callback) {
  const q = query(collection(db, 'queue'));
  return onSnapshot(q, (snapshot) => {
    const queueEntries = [];
    snapshot.forEach((doc) => {
      queueEntries.push({ id: doc.id, ...doc.data() });
    });
    callback(queueEntries);
  });
}

/** updateQueueStatus Function
 * This updates the status of a single entry in the queue collection.
 *
 * Call this when the receptionist taps "Mark as Seen" or another status button on the QueueDashboardScreen.
 * Common status values: 'waiting', 'called', 'seen'.
 *
 * @param {string} entryId  - Firestore document ID of the queue entry to update
 * @param {string} newStatus - The new status string to set
 *
 * EXAMPLE:
 *   await updateQueueStatus('queueEntry001', 'seen');
 */
export async function updateQueueStatus(entryId, newStatus) {
  const docRef = doc(db, 'queue', entryId);
  await updateDoc(docRef, {
    status: newStatus
  });
}

/** getClinicPatients Function
 * Fetches all users with role 'p' (patient) from Firestore.
 *
 * Call this from the PatientManagementScreen on the doctor side
 * to show the doctor a list of all registered patients. 
 * Returns an empty array if none exist.
 *
 * @returns {Array} List of patient profile objects, each with id and Firestore fields
 *
 * EXAMPLE:
 *   const patients = await getClinicPatients();
 *   patients.forEach(patient => console.log(patient.name));
 */
export async function getClinicPatients() {
  // Query the users collection for documents where role is 'p' (patient)
  const q = query(
    collection(db, 'users'),
    where('role', '==', 'p')
  );

  const querySnapshot = await getDocs(q);
  const patients = [];
  querySnapshot.forEach((doc) => {
    patients.push({ id: doc.id, ...doc.data() });
  });
  return patients;
}

// This function finds users whose names contain the search text, without case sensitivity.
export async function searchUsersByName(searchText) {
  const search = typeof searchText === 'string' ? searchText.trim().toLowerCase() : '';
  if (!search) return [];

  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs
    .map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }))
    .filter((user) => (user.name || '').toLowerCase().includes(search))
    .sort((first, second) => (first.name || '').localeCompare(second.name || ''));
}

// This function saves a clinic using the fields expected by the clinics collection.
export async function createClinic({ address, dailySlotCapacity, name, province }) 
{
  // Basic input validation: check required fields and ensure dailySlotCapacity is positive / not less than 1.
  if (!address?.trim() || !name?.trim() || !province?.trim()) {
    throw new Error('Address, clinic name, and province are required.');
  }
  const capacity = Number(dailySlotCapacity);
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error('Daily slot capacity must be a positive whole number.');
  }

  // Adds the clinic document to the 'clinics' collection in Firestore.
  const reference = await addDoc(collection(db, 'clinics'), 
  {
    address: address.trim(),
    dailySlotCapacity: capacity,
    name: name.trim(),
    province: province.trim(),
  });
  return reference.id;
}

// This function saves an emergency contact number linked to a clinic.
export async function createEmergencyNumber({ clinicId, number }) 
{
  // Basic validation check
  if (!clinicId?.trim() || !number?.trim()) {
    throw new Error('Clinic ID and emergency number are required.');
  }

  // Adds the emergency number document to the 'numbers' collection in Firestore.
  const reference = await addDoc(collection(db, 'numbers'), {
    clinicId: clinicId.trim(),
    number: number.trim(),
  });
  return reference.id;
}

// This function creates a notification for a patient; new notifications start as pending.
export async function createNotification({ deliveryStatus = 'pending', message, patientId })
{
  // Basic validation check
  if (!message?.trim() || !patientId?.trim() || !deliveryStatus?.trim()) {
    throw new Error('Delivery status, message, and patient ID are required.');
  }

  // Adds the notification document to the 'notifications' collection in Firestore.
  const reference = await addDoc(collection(db, 'notifications'), {
    deliveryStatus: deliveryStatus.trim(),
    message: message.trim(),
    patientId: patientId.trim(),
  });
  return reference.id;
}

// This function adds a patient to the root queue collection using the queue document schema.
export async function addPatientToQueue({ appointmentId, patientId, patientName })
{
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

// Returns every appointment. The screen uses this to build its calendars.
export async function getAllAppointments()
{
  const snapshot = await getDocs(collection(db, 'appointments'));
  return snapshot.docs
    .map((appointmentDoc) => ({ id: appointmentDoc.id, ...appointmentDoc.data() }))
    .sort((first, second) => {
      const firstValue = first.appointmentDate;
      const secondValue = second.appointmentDate;
      const firstDate = firstValue?.toDate
        ? firstValue.toDate().getTime()
        : new Date(firstValue || 0).getTime();
      const secondDate = secondValue?.toDate
        ? secondValue.toDate().getTime()
        : new Date(secondValue || 0).getTime();
      return firstDate - secondDate;
    });
}

// Reads the documents from each main collection for the management screen.
// Each collection reports its own error so one denied read does not hide the others.
export async function getFirestoreCollections() {
  const names = ['appointments', 'clinics', 'notifications', 'numbers', 'queue', 'tokens', 'users'];
  return Promise.all(names.map(async (name) => {
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
  }));
}

// Returns appointments on a selected local calendar day, optionally for one patient.
export async function getAppointmentsForDate(date, patientId) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('A valid date is required.');
  }
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  const appointments = patientId
    ? await getPatientAppointments(patientId)
    : await getAllAppointments();

  return appointments.filter((appointment) => {
    const appointmentDate = appointment.appointmentDate?.toDate
      ? appointment.appointmentDate.toDate()
      : new Date(appointment.appointmentDate);
    const time = appointmentDate.getTime();
    return !Number.isNaN(time) && time >= start && time < end;
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — Local storage and Health data
//
// Chronic illness data (conditions, medications) is deliberately NOT stored in Firestore.
// It lives only on the patient's device.
// This avoids storing sensitive medical data in the cloud
// and reduces POPIA compliance obligations at the server level.
//
// How it would work:
// 1. Doctor enters the patient's chronic data on the PatientManagementScreen
// 2. Doctor generates an activation QR encoding that data as JSON
// 3. Patient scans the QR — data is decoded and saved in AsyncStorage
// 4. Only a boolean 'isChronicVerified' is ever sent to the server



//─────────────────────────────────────────────────────────────────────────
//|     NOTE: AsyncStorage is not yet implemented — these are stubs.      |
//|   When AsyncStorage is added, import it at the top of the page via:   |
//| import AsyncStorage from '@react-native-async-storage/async-storage'; |
//─────────────────────────────────────────────────────────────────────────



/**SaveLocalHealthData Function
 * Saves health data to the patient's local device storage.
 *
 * This will be called from the QR scanner screen after the patient scans the doctor's activation QR.
 * The decoded JSON from the QR becomes the 'data' argument.
 * IMPORTANT: This data will never leave the device.
 *
 * @param {string} key  - Storage key to save under (e.g. 'chronicConditions')
 * @param {any}    data - The data to store (will be serialised to JSON)
 *
 * usage example:
 *   await saveLocalHealthData('chronicConditions', ['Hypertension', 'Diabetes']);
 *   await saveLocalHealthData('medicationList', ['Metformin 500mg']);
 *
 * TODO: Replace the console.log with AsyncStorage.setItem when ready:
 *   await AsyncStorage.setItem(key, JSON.stringify(data));
 */
export async function saveLocalHealthData(key, data) {
  console.log(`[Cache]: Saving health data locally for key: ${key}`);
  // TODO: await AsyncStorage.setItem(key, JSON.stringify(data));
  return true;
}

/** getLocalHealthData Function
 * This will read health data from the patient's local device storage.
 *
 * Call this from the QR display screen or home screen 
 * when you need to show the patient's conditions or check their verification status.
 *
 * @param {string} key - The same key used when saving (e.g. 'chronicConditions')
 * @returns {any} The stored data, or null if nothing has been saved for that key
 *
 * usage example:
 *   const conditions = await getLocalHealthData('chronicConditions');
 *   console.log(conditions); // ['Hypertension', 'Diabetes']
 *
 * TODO: Replace the console.log with AsyncStorage.getItem when ready:
 *   const raw = await AsyncStorage.getItem(key);
 *   return raw ? JSON.parse(raw) : null;
 */
export async function getLocalHealthData(key) {
  console.log(`[Cache]: Reading health data for key: ${key}`);
  // TODO: const raw = await AsyncStorage.getItem(key); return raw ? JSON.parse(raw) : null;
  return null;
}

/** getCachedAppointments Function
 * Reads the locally cached appointments from device storage.
 *
 * Call this from the QR display screen to get the patient's token code without needing an internet connection.
 * Appointments are cached here automatically when bookAppointment() is called
 * (once AsyncStorage is implemented).
 *
 * @returns {Array} List of cached appointment objects, or empty array if none
 *
 * usage example:
 *   const cached = await getCachedAppointments();
 *   const next = cached.find(a => a.status === 'booked');
 *   // Use next.tokenCode to display the QR code offline
 *
 * TODO: Replace the console.log with AsyncStorage.getItem when ready:
 *   const raw = await AsyncStorage.getItem('cachedAppointments');
 *   return raw ? JSON.parse(raw) : [];
 */
export async function getCachedAppointments() {
  console.log('[Cache]: Reading cached appointments from local storage.');
  // TODO: const raw = await AsyncStorage.getItem('cachedAppointments');
  //       return raw ? JSON.parse(raw) : [];
  return [];
}