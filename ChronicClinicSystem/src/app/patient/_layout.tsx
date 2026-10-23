import { Pressable, Text } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/clinic-theme';

// Bottom tab bar for the patient. Big icons and always-visible labels, because
// many patients are elderly and not used to icon-only navigation.
export default function PatientTabs() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        tabBarStyle: { height: 72, paddingTop: 6, paddingBottom: 10 },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.bg },
        // DEV: way back to the development menu. Remove once login sends users to their screens.
        headerLeft: () => (
          <Pressable
            onPress={() => router.replace('/')}
            accessibilityRole="button"
            accessibilityLabel="Back to menu"
            style={{ paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primary }}>Menu</Text>
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size + 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size + 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="qr"
        options={{
          title: 'QR code',
          headerShown: false,
          header: () => null,
          tabBarIcon: ({ color, size }) => <Ionicons name="qr-code" size={size + 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size + 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="emergency"
        options={{
          title: 'Emergency',
          tabBarIcon: ({ color, size }) => <Ionicons name="call" size={size + 2} color={color} />,
        }}
      />
    </Tabs>
  );
}
