import React from "react";
import {
    View, TouchableOpacity, StyleSheet,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "./theme-provider";

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
      key: "scan",
      icon: "scan-outline",
      screen: "Scanner",
      route: "/qrscanner",
    },
  ],

  receptionist: [
    {
      key: "profile",
      icon: "person-circle-outline",
      screen: "Profile",
      route: "/settings",
    },
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
    const { theme } = useAppTheme();
    // Accept both Firestore role codes and their longer display names.
    const roleName = {
        p: "patient",
        d: "doctor",
        r: "receptionist",
    }[role] || role;
    const items = HOTBAR_CONFIG[roleName] || [];

    return (
        <View style={[styles.container, {
            borderTopColor: theme.colors.secondaryBorder,
            backgroundColor: theme.colors.secondarySurface,
        }]}>
            <View style={styles.hotbar}>
                {items.map((item) => {
                    const isActive = activeItem === item.key;

                    return (
                        <TouchableOpacity
                            key={item.key}
                            style={[
                                styles.button,
                                isActive && { backgroundColor: theme.colors.backgroundSelected },
                            ]}
                            onPress={() => router.push(item.route)}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name={item.icon}
                                size={27}
                                color={isActive ? theme.colors.secondary : theme.colors.darkest}
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
        justifyContent: "center",
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

});