import { StyleSheet, Text, View } from 'react-native';
import { colors, space, type } from '../constants/clinic-theme';

// Temporary content for screens that are not built yet. Delete once each screen is real.
export default function PlaceholderScreen({ title, note }: { title: string; note: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  title: { ...type.title, textAlign: 'center', marginBottom: space.sm },
  note: { ...type.body, color: colors.muted, textAlign: 'center' },
});
