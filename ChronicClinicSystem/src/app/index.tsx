import React from 'react';
import { StyleSheet, View } from 'react-native';
import SettingsScreen from '../../screens/SettingsScreen'; // Point to your settings screen

export default function Page() {
  return (
    <View style={styles.container}>
      <SettingsScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});