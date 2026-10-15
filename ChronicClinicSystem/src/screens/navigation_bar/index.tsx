import { View } from 'react-native';
import { useAppTheme } from '@/components/theme-provider';

export default function NavigationBarScreen() {
  const { theme } = useAppTheme();
  return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
}
