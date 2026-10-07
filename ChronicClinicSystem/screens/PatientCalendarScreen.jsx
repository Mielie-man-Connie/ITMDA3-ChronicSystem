import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { Calendar } from 'react-native-calendars';

export default function PatientCalendarScreen() {
  const [selectedDate, setSelectedDate] = useState('2026-10-07');

  // Sample schedule/appointments for chronic medication pickups and check-ups
  const markedDates = {
    '2026-10-07': { selected: true, marked: true, selectedColor: '#007AFF', dotColor: '#ffffff' },
    '2026-10-15': { marked: true, dotColor: '#34C759', activeOpacity: 0.5 },
    '2026-10-22': { marked: true, dotColor: '#FF9500', activeOpacity: 0.5 },
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.headerTitle}>Patient Schedule & Calendar</Text>
      <Text style={styles.subtitle}>Track your clinic visits and medication collection dates.</Text>

      <View style={styles.calendarContainer}>
        <Calendar
          current={'2026-10-07'}
          onDayPress={(day) => setSelectedDate(day.dateString)}
          markedDates={{
            ...markedDates,
            [selectedDate]: { ...markedDates[selectedDate], selected: true, selectedColor: '#007AFF' }
          }}
          theme={{
            backgroundColor: '#ffffff',
            calendarBackground: '#ffffff',
            textSectionTitleColor: '#b6c1cd',
            selectedDayBackgroundColor: '#007AFF',
            selectedDayTextColor: '#ffffff',
            todayTextColor: '#007AFF',
            dayTextColor: '#2d4150',
            arrowColor: '#007AFF',
            monthTextColor: '#2d4150',
            textMonthFontWeight: 'bold',
            textDayFontSize: 16,
            textMonthFontSize: 18,
            textDayHeaderFontSize: 14
          }}
        />
      </View>

      <View style={styles.detailsContainer}>
        <Text style={styles.detailsTitle}>Events for {selectedDate}</Text>
        <View style={styles.eventCard}>
          <Text style={styles.eventTime}>09:00 AM - 10:00 AM</Text>
          <Text style={styles.eventTitle}>Chronic Medication Refill Collection</Text>
          <Text style={styles.eventLocation}>Hatfield Public Clinic (Counter 3)</Text>
        </View>
        <View style={styles.eventCard}>
          <Text style={styles.eventTime}>02:00 PM - 02:30 PM</Text>
          <Text style={styles.eventTitle}>Vitals Check-up</Text>
          <Text style={styles.eventLocation}>Consultation Room 12</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6C757D',
    marginBottom: 16,
  },
  calendarContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginBottom: 20,
  },
  detailsContainer: {
    marginBottom: 30,
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#3A3A3C',
    marginBottom: 12,
  },
  eventCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 10,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  eventTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 4,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  eventLocation: {
    fontSize: 14,
    color: '#6C757D',
  },
});