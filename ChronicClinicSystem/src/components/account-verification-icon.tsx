import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/components/theme-provider';

type AccountVerificationIconProps = {
  verified?: boolean;
  size?: number;
};

export function AccountVerificationIcon({
  verified = false,
  size = 18,
}: AccountVerificationIconProps) {
  const { theme } = useAppTheme();

  return verified ? (
    <Ionicons
      name="checkmark-circle"
      size={size}
      color={theme.colors.success}
      accessibilityLabel="Verified account"
    />
  ) : (
    <Ionicons
      name="warning"
      size={size}
      color={theme.colors.error}
      accessibilityLabel="Unverified account"
    />
  );
}
