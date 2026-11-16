import { createElement } from 'react';
import { Text, View } from 'react-native';

// Load the theme provider without asking TypeScript to parse its TSX module
// under configurations that do not enable JSX for this file.
declare const require: (moduleName: string) => { useAppTheme: () => { theme: any } };
const { useAppTheme } = require('@/components/theme-provider');

// The magnifier-with-medical-cross symbol, drawn on a 100 x 100 grid.
export function VitaQueueMark({ size = 44 }: { size?: number }) {
  const { theme } = useAppTheme();
  const u = size / 100;
  const color = theme.colors.primary;
  const crossColor = theme.colors.onPrimary;

  return createElement(
    View,
    {
      style: { width: size, height: size },
      accessibilityRole: 'image',
      accessibilityLabel: 'VitaQueue logo',
    },
    createElement(View, {
      style: {
        position: 'absolute',
        left: 56.15 * u,
        top: 71 * u,
        width: 44.7 * u,
        height: 15 * u,
        borderRadius: 7.5 * u,
        backgroundColor: color,
        transform: [{ rotate: '45deg' }],
      },
    }),
    createElement(View, {
      style: {
        position: 'absolute',
        left: 5 * u,
        top: 5 * u,
        width: 74 * u,
        height: 74 * u,
        borderRadius: 37 * u,
        backgroundColor: color,
      },
    }),
    createElement(View, {
      style: {
        position: 'absolute',
        left: 36 * u,
        top: 23 * u,
        width: 12 * u,
        height: 38 * u,
        borderRadius: 3 * u,
        backgroundColor: crossColor,
      },
    }),
    createElement(View, {
      style: {
        position: 'absolute',
        left: 23 * u,
        top: 36 * u,
        width: 38 * u,
        height: 12 * u,
        borderRadius: 3 * u,
        backgroundColor: crossColor,
      },
    }),
  );
}

export function VitaQueueLogo({
  size = 44,
  showTagline = true,
}: {
  size?: number;
  showTagline?: boolean;
}) {
  const { theme } = useAppTheme();

  return createElement(
    View,
    { style: { alignItems: 'center' } },
    createElement(
      View,
      { style: { flexDirection: 'row', alignItems: 'center', gap: size * 0.22 } },
      createElement(VitaQueueMark, { size }),
      createElement(
        Text,
        {
          style: {
            fontSize: size * 0.72,
            fontWeight: '700',
            letterSpacing: -size * 0.02,
            color: theme.colors.darkest,
          },
        },
        'Vita',
        createElement(Text, { style: { color: theme.colors.primary } }, 'Queue'),
      ),
    ),
    showTagline
      ? createElement(
          Text,
          {
            style: {
              marginTop: size * 0.2,
              fontSize: Math.max(9, size * 0.23),
              fontWeight: '500',
              letterSpacing: size * 0.045,
              color: theme.colors.secondary,
            },
          },
          'CLINIC QUEUE MANAGEMENT',
        )
      : null,
  );
}

export default VitaQueueLogo;