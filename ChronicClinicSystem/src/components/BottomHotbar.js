import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
            screen: "Generate QR",
            route: "/qrgenerator",
        },
        {
            key: "scan",
            icon: "scan-outline",
            screen: "Scanner",
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
};

// Short labels shown under each icon
const LABELS = {
    profile: "Profile",
    calendar: "Calendar",
    qr: "My QR",
    scan: "Scan",
    contact: "Contact",
};

export default function BottomHotbar({
    role, activeItem,
}) {
    const { theme } = useAppTheme();
    const insets = useSafeAreaInsets();
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
            paddingBottom: Math.max(insets.bottom, 8),
        }]}>
            <View style={styles.hotbar}>
                {items.map((item) => {
                    const isActive = activeItem === item.key;
                    const color = isActive ? theme.colors.primary : theme.colors.secondary;
                    // Active tabs use the filled version of the icon
                    const iconName = isActive ? item.icon.replace("-outline", "") : item.icon;

                    return (
                        <TouchableOpacity
                            key={item.key}
                            style={styles.button}
                            onPress={() => router.push(item.route)}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={item.screen}
                            accessibilityState={{ selected: isActive }}
                        >
                            <View style={[
                                styles.iconWrap,
                                isActive && { backgroundColor: theme.colors.backgroundSelected },
                            ]}>
                                <Ionicons name={iconName} size={24} color={color} />
                            </View>
                            <Text
                                numberOfLines={1}
                                style={[
                                    styles.label,
                                    { color },
                                    isActive && styles.labelActive,
                                ]}
                            >
                                {LABELS[item.key] || item.screen}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderTopWidth: 1,
        paddingTop: 8,
        shadowColor: "#0F2E38",
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: -4 },
        elevation: 8,
    },

    hotbar: {
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
        width: "100%",
        maxWidth: 800,
        alignSelf: "center",
    },

    button: {
        flex: 1,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
    },

    iconWrap: {
        width: 56,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
    },

    label: {
        marginTop: 3,
        fontSize: 11,
        fontWeight: "500",
    },

    labelActive: {
        fontWeight: "700",
    },
});