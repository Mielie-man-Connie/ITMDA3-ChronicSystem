# ITMDA3-ChronicSystem

A mobile application and web service developed as part of the **ITMDA3-34 Mobile Application and Web Services** module at Eduvos, Faculty of Information Technology.

---

## Project Overview

South African public primary healthcare clinics operate under severe daily strain. Chronically ill patients — including elderly individuals and those in rural communities — routinely spend several hours in overcrowded waiting rooms to complete routine check-ups or collect repeat prescriptions, often waiting alongside acute emergency cases in a first-come, first-served queue. This system offers no priority treatment for patients with ongoing conditions and places an unnecessary burden on both patients and clinic staff.

This application addresses that problem by providing a dedicated **Express Lane** for verified chronic patients. Patients register once, get verified by a clinic doctor, and can then book appointments in advance and check in digitally using a QR code — bypassing the standard queue entirely. Clinic staff manage a real-time dashboard showing checked-in chronic patients separately from walk-in acute cases.

---

## Key Features

- **Patient self-registration** — patients create an account with name, email, phone number, valid ZA ID, and location of residency
- **Doctor-controlled account activation** — a doctor verifies the patient at the clinic by generating an activation QR code containing the patient's chronic illness profile
- **Offline QR check-in** — Identification QR codes are cached on the patient's device and work without an internet connection at the clinic
- **Real-time queue dashboard** — clinic staff see a live list of checked-in chronic patients that updates automatically as patients arrive
- **Role-based access** — a single app serves four user types (patient, doctor, receptionist, and administrators) with role-based navigation and Firestore security rules
- **Local health data storage** — chronic illness data is stored as ICD10 codes on the patient's device only and is never transmitted to the cloud
- **Appointment management** — patients can call in via the provided numbers to book appointments, of which said appointments can be viewed and canceled from the calendar screen
- **Emergency number / Receptionist number** — Screen with province and clinic name filters that can be used to book appointments or to be used as an emergency line

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React Native (Expo SDK 56) |
| Language | TypeScript / JavaScript |
| Navigation | Expo Router |
| Backend | Firebase Cloud Functions (serverless) |
| Database | Firebase Firestore |
| Authentication | Firebase Authentication (email and password) |
| Local storage | AsyncStorage (React Native) |
| QR generation | react-native-qrcode-svg |
| QR scanning | expo-barcode-scanner |
| Push notifications | Expo Notifications + Firebase Cloud Messaging |
| Styling | Custom theme system (themes.js) |

---

## Project Structure

```
ChronicClinicSystem/
├── package.json                Expo app dependencies and scripts
└── src/
    ├── app/                    Expo Router routes and layouts
    │   ├── _layout.tsx
    │   ├── index.tsx
    │   ├── admin/index.tsx
    │   ├── calendar/index.tsx
    │   ├── doctor/
    │   │   ├── index.tsx
    │   │   └── patient-info.tsx
    │   ├── emergency/index.tsx
    │   ├── fbtest/index.tsx
    │   ├── home/index.tsx
    │   ├── login/index.tsx
    │   ├── patient/
    │   │   ├── _layout.tsx
    │   │   └── qr.tsx
    │   ├── patient-data-modifier/index.tsx
    │   ├── qrgenerator/index.tsx
    │   ├── qrscanner/index.tsx
    │   ├── scanner.tsx
    │   ├── settings/index.tsx
    │   ├── signup/index.tsx
    │   └── Senswesihle's screens/
    │       ├── calendar.tsx
    │       ├── explore.tsx
    │       └── settings.tsx
    ├── screens/                Screen implementations grouped by feature
    │   ├── admin/
    │   ├── calendar/
    │   ├── emergency/
    │   ├── fbtest/
    │   ├── home/
    │   ├── login/
    │   ├── navigation_bar/
    │   ├── patient_data_modifier/
    │   ├── qrgenerator/
    │   ├── qrscanner/
    │   ├── settings/
    │   ├── signup/
    │   └── HomeScreen.js
    ├── components/             Shared UI and theme components
    ├── config/
    │   └── firebaseConfig.js   Firebase app, Authentication, and Firestore setup
    ├── constants/              App and clinic theme constants
    ├── hooks/
    │   └── use-theme.ts
    ├── services/
    │   ├── cache.ts            AsyncStorage and offline cache operations
    │   └── firebase.js         Firebase Authentication and Firestore operations
    ├── utils/
    │   └── qrPayload.ts        QR payload helpers
    └── global.css
```

---

## Firestore Collections

| Collection | Purpose |
|---|---|
| `users` | Account profiles for patients, doctors, receptionists, and administrators, keyed by Firebase Authentication UID |
| `clinics` | Clinic directory records, including names, addresses, provinces, capacity, and contact numbers |
| `appointments` | Patient appointment bookings, including recurring-series and status information |
| `tokens` | Appointment check-in QR tokens, associated with a patient and appointment and tracked when redeemed |
| `queue` | Clinic queue entries created when a patient checks in, with a status that staff can update |
| `chronic-illnesses` | ICD-10 condition reference catalogue used when selecting chronic conditions; patient-specific health details are kept in local device storage, not in this collection |
| `notifications` | Patient notification records, including message and delivery status |

Clinic contact numbers are stored as part of clinic records; there is no separate `numbers` collection. The application also uses AsyncStorage for offline data and local health details; those are not Firestore collections.

---

## Role Codes

| Code | Role |
|---|---|
| `p` | Patient |
| `d` | Doctor |
| `r` | Receptionist |
| `a` | Administrator |

---

## Getting Started

### Prerequisites

- Node.js 18 or later
- Expo Go app installed on your Android device (from the Play Store)
- Internet access for Firebase-backed features; the app's Firebase configuration is already provided in `ChronicClinicSystem/src/config/firebaseConfig.js`

### Installation

```bash
# Clone the repository
git clone https://github.com/Mielie-man-Connie/ITMDA3-ChronicSystem.git
cd ITMDA3-ChronicSystem

# Move into the Expo app directory and install the locked dependencies
cd ChronicClinicSystem
npm ci

# Start the development server
npx expo start
```

Open the QR code using Expo Go on a compatible device, or press `a` to launch an Android emulator. Keep the device and computer on the same network when using Expo Go. If a native module used by the app is unavailable in Expo Go, run it with an Expo development build instead.

---

## Branch Structure

The branches currently on GitHub (`origin`) are:

| Branch | Purpose / status |
|---|---|
| `main` | Current integrated branch. Includes the merge of `feature/screen_connections`. |
| `feature/screen_connections` | Integrated app work, including Firebase-backed screens, home/navigation, settings, calendar, QR flows, and offline caching. Its changes are merged into `main`. |
| `firebase_implementation` | Firebase authentication and service foundation. |
| `home-and-nav` | Home screen and navigation work. |
| `feature/settings-screen` | Settings and calendar screen work. |
| `feature/calendar-screen` | Calendar-related work based on the settings branch. |
| `QR-scanner-code-and-patient/doctor-semi-screen` | QR scanner and patient/doctor screen work. |

The local `firebase_setup` branch is not currently published on GitHub. There is no `dev` branch or separate `feature/auth`, `feature/patient-screens`, `feature/doctor-screens`, or `feature/receptionist-screens` branch in the current repository.

---

## Group Members

| Name | Student Number | Contribution |
|---|---|---|
| Conrad Strauss | eduv4953568 | Login/Signup and Admin screens, Backend, Firebase services, authentication |
| Erenst Wepener | eduv4947438 | Home and Numbers screens, and Navigation bar |
| Mahlatsi Nkadimeng | eduv4971358 | QR Code Scanning and Generation screens |
| Senzwesihle Nkosimayibongwe Zwane | eduv4995919 | Settings and Calendar screens |

---

## Academic Context

**Institution:** Eduvos  
**Faculty:** Information Technology  
**Module:** ITMDA3-34 — Mobile Application and Web Services  
**Year:** 2026  
**Lecturer:** Tatenda Tagutanaz  

This project was developed across six graded deliverables covering introduction, literature review, system modelling, implementation, testing, and a final presentation and demonstration.

---

## License

This project is licensed under the Academic Project Restricted Use License. See [LICENSE.md](LICENSE.md) for full terms.

In summary: you may view and clone this repository for personal study and academic reference. You may not redistribute, commercially exploit, or present this work as your own.











