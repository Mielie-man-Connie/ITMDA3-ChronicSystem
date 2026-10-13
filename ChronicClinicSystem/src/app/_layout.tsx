import { Stack } from 'expo-router';
import { colors } from '../constants/clinic-theme';

// Every file in src/app becomes a screen in this stack.
export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {/* The patient section has its own tab bar and headers. */}
      <Stack.Screen name="patient" options={{ headerShown: false }} />
    </Stack>
  );
}
