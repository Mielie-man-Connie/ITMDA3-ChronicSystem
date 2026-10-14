import React from "react";
import {
    View, TouchableOpacity, StyleSheet,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "./themes";

const HOTBAR_CONFIG = {
    patient: [
        {
            key: "profile",
            icon: "person-circle-outline",
            screen: "Profile",
            route: "/settings",
        },
        {
            key: "calendar",
            icon: "calendar-outline",
            screen: "Calendar",
            route: "/calendar",
        },
        {
            key: "qr",
            icon: "qr-code-outline",
            screen: "QR",
            route: "/qrscanner",
        },
        {
            key: "contact",
            icon: "call-outline",
            screen: "Contact",
            route: "/emergency",
        },
    ],

    doctor: [
    {
      key: "calendar",
      icon: "calendar-outline",
      screen: "Calendar",
      route: "/calendar",
    },
    {
      key: "scan",
      icon: "scan-outline",
      screen: "Scanner",
      route: "/qrscanner",
    },
  ],

  receptionist: [
    {
      key: "scan",
      icon: "scan-outline",
      screen: "Scanner",
      route: "/qrscanner",
    },
  ],
};

export default function BottomHotbar({
    role, navigation, activeItem,
}) {
    // Accept both Firestore role codes and their longer display names.
    const roleName = {
        p: "patient",
        d: "doctor",
        r: "receptionist",
    }[role] || role;
    const items = HOTBAR_CONFIG[roleName] || [];

    return (
        <View style={styles.container}>
            <View style={styles.hotbar}>
                {items.map((item) => {
                    const isActive = activeItem === item.key;

                    return (
                        <TouchableOpacity
                            key={item.key}
                            style={[
                                styles.button,
                                isActive && styles.activeButton,
                            ]}
                            onPress={() => router.push(item.route)}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name={item.icon}
                                size={27}
                                color={isActive ? theme.colors.primary : theme.colors.dark}
                            />
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        height: 62,
        borderTopWidth: 1,
        borderTopColor: theme.colors.light,
        justifyContent: "center",
        backgroundColor: theme.colors.white,
    },

    hotbar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    width: "100%",
  },

  button: {
    width: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 25,
  },

  activeButton: {
    backgroundColor: theme.colors.background,
  },
});