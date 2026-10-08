import React from "react";
import HomeScreen from "../screens/HomeScreen";

export default function App() {

  // Temporary dummy signed-in user.
  //
  // Later this will come from Firebase Authentication
  // and/or your Firestore user document.
  const currentUser = {
    id: "user001",
    name: "John Doe",
    role: "patient",
  };

  return (
    <HomeScreen user={currentUser} />
  );
}