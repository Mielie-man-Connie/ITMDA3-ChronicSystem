import React from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
} from "react-native";

import BottomHotbar from "../components/BottomHotbar";

import {
    dummyCalendarData,
    dummyPatients,
    dummyAppointments,
} from "../data/dummyData";

export default function HomeScreen({ user }) {
    const role = user.role;

    return (
        <View style={styles.screen}>
            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
            >
                {role === "patient" && (
                    <PatientHome />
                )}

                {role === "doctor" && (
                    <DoctorHome />
                )}

                {role === "receptionist" && (
                    <ReceptionistHome />
                )}
            </ScrollView>

            <BottomHotbar
                role={role}
                navigation={navigation}
                activeItem={null}
            />
        </View>
    );
}

//Patient Home

function PatientHome() {
    const appointments = dummyCalendarData.patient;

    return (
    <View>
      <Text style={styles.sectionTitle}>
        Calendar Summary
      </Text>

      <View style={styles.calendarCard}>
        {appointments.map((appointment) => (
          <View
            key={appointment.id}
            style={styles.calendarItem}
          >
            <View style={styles.calendarLine} />

            <View>
              <Text style={styles.appointmentTitle}>
                {appointment.title}
              </Text>

              <Text style={styles.appointmentDetails}>
                {appointment.date} • {appointment.time}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

//Doctor Home

function DoctorHome() {
  const appointments = dummyCalendarData.doctor;

  return (
    <View>
      <Text style={styles.sectionTitle}>
        Calendar Summary
      </Text>

      <View style={styles.calendarCard}>
        {appointments.map((appointment) => (
          <View
            key={appointment.id}
            style={styles.calendarItem}
          >
            <View style={styles.calendarLine} />

            <View>
              <Text style={styles.appointmentTitle}>
                {appointment.title}
              </Text>

              <Text style={styles.appointmentDetails}>
                {appointment.date} • {appointment.time}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>
        Patient List
      </Text>

      <View style={styles.patientList}>
        {dummyPatients.map((patient) => (
          <View
            key={patient.id}
            style={styles.patientRow}
          >
            <View style={styles.patientNameContainer}>
              <View style={styles.patientLine} />

              <Text style={styles.patientName}>
                {patient.name}
              </Text>
            </View>

            <View style={styles.patientActions}>
              <TouchableOpacity
                style={styles.smallButton}
                onPress={() =>
                  console.log("Edit", patient.id)
                }
              >
                <Text style={styles.smallButtonText}>
                  Edit
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.smallButton}
                onPress={() =>
                  console.log("Delete", patient.id)
                }
              >
                <Text style={styles.smallButtonText}>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.addPatientButton}
        onPress={() => console.log("Add patient")}
      >
        <Text style={styles.addPatientText}>
          Add patient
        </Text>
      </TouchableOpacity>
    </View>
  );
}

//Receptionist Home

function ReceptionistHome() {
  return (
    <View>
      <Text style={styles.sectionTitle}>
        Today's appointments
      </Text>

      <View style={styles.calendarCard}>
        {dummyAppointments.map((appointment) => (
          <View
            key={appointment.id}
            style={styles.calendarItem}
          >
            <View style={styles.calendarLine} />

            <View>
              <Text style={styles.appointmentTitle}>
                {appointment.patient}
              </Text>

              <Text style={styles.appointmentDetails}>
                {appointment.time}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

//Styles

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#fff',
    },

    content: {
    flex: 1,
    },

    contentContainer: {
        padding: 18,
        paddingBottom: 30,
    },

    sectionTitle: {
        fontSize: 15,
        fontWeight: "500",
        textAlign: "center",
        marginBottom: 18,
        marginTop: 10,
    },

    calendarCard: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 14,
    padding: 15,
    marginBottom: 30,
    },

    calendarItem: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
    },

    calendarLine: {
        height: 7,
        width: "30%",
        backgroundColor: "#111",
        marginRight: 15,
    },

    appointmentTitle: {
        fontSize: 13,
        fontWeight: "500",
    },

    appointmentDetails: {
        fontSize: 11,
        color: "#666",
        marginTop: 2,
    },

    patientList: {
        marginBottom: 15,
    },

    patientRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 15,
    },

    patientNameContainer: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
    },

    patientLine: {
        height: 7,
        width: 55,
        backgroundColor: "#111",
        marginRight: 12,
    },

    patientName: {
        fontSize: 12,
    },

    patientActions: {
        flexDirection: "row",
        gap: 8,
    },

    smallButton: {
        borderWidth: 1,
        borderColor: "#777",
        borderRadius: 3,
        paddingVertical: 4,
        paddingHorizontal: 9,
        backgroundColor: "#fff",
    },

    smallButtonText: {
        fontSize: 9,
    },

    addPatientButton: {
        alignSelf: "center",
        borderWidth: 1,
        borderColor: "#777",
        borderRadius: 3,
        paddingVertical: 6,
        paddingHorizontal: 12,
        marginTop: 5,
    },

    addPatientText: {
        fontSize: 10,
    },
});