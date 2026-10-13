import React from "react";
import {
    View, TouchableOpacity, StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const HOTBAR_CONFIG = {
    patient: [
        {
            key: "profile",
            icon: "person-circle-outline",
            screen: "Profile",
        },
        {
            key: "calendar",
            icon: "calendar-outline",
            screen: "Calendar",
        },
        {
            key: "qr",
            icon: "qr-code-outline",
            screen: "QR",
        },
        {
            key: "contact",
            icon: "call-outline",
            screen: "Contact",
        },
    ],

    doctor: [
    {
      key: "calendar",
      icon: "calendar-outline",
      screen: "Calendar",
    },
    {
      key: "scan",
      icon: "scan-outline",
      screen: "Scanner",
    },
  ],

  receptionist: [
    {
      key: "scan",
      icon: "scan-outline",
      screen: "Scanner",
    },
  ],
};

export default function BottomHotbar({
    role, navigation, activeItem,
}) {
    const items = HOTBAR_CONFIG[role] || [];

    const handleHotBarPress = (item) => {
        navigation.navigate(item.screen);
    }

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
                            onPress={() => onItemPress?.(item.key)}
                            activeOpacity={0.7}
                        >
                            <Ionicons name={item.icon} size={27} color="#111" />
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
        borderTopColor: '#999',
        justifyContent: "center",
        backgroundColor: '#fff',
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
    backgroundColor: '#eeeeee',
  },
});