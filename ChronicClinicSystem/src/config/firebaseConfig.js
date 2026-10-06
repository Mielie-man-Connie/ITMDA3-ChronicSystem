import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyBDx834KNvP9Y_hoOM8ntHk5BWxP42_kCk",
  authDomain: "itmda3-chronicsystem.firebaseapp.com",
  projectId: "itmda3-chronicsystem",

  //itmda3-chronicsystem.firebasestorage.app (or .appspot.com)
  storageBucket: "itmda3-chronicsystem.firebasestorage.app",
  messagingSenderId: "347980505457",
  appId: "1:347980505457:web:224a17312f94e60dee96d0"
};

// Initialise Firebase app
const app = initializeApp(firebaseConfig);

// Export auth and database instances for use throughout the app
export const auth = getAuth(app);
export const db = getFirestore(app);