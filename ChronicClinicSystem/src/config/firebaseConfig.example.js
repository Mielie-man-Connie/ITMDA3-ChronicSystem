import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase project configuration
// Get these values from Firebase Console > Project Settings > Your Apps
const firebaseConfig = {
  apiKey: "PASTE_YOUR_VALUE_HERE",
  authDomain: "PASTE_YOUR_VALUE_HERE",
  projectId: "PASTE_YOUR_VALUE_HERE",
  storageBucket: "PASTE_YOUR_VALUE_HERE",
  messagingSenderId: "PASTE_YOUR_VALUE_HERE",
  appId: "PASTE_YOUR_VALUE_HERE"
};

// Initialise Firebase app
const app = initializeApp(firebaseConfig);

// Export auth and database instances for use throughout the app
export const auth = getAuth(app);
export const db = getFirestore(app);