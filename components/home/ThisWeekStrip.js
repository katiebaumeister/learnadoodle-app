import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

export default function ThisWeekStrip({ weeklyPulse = [] }) {
  // Show top 3 subjects
  const displayItems = weeklyPulse.slice(0, 3);

  if (!weeklyPulse || weeklyPulse.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>This week:</Text>
      <View style={styles.list}>
        {displayItems.map((pulse, index) => (
          <View key={index} style={styles.row}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.subjectName}>{pulse.subjectName}:</Text>
            <Text style={styles.status}>
              {pulse.sessions > 0 
                ? `${pulse.sessions} session${pulse.sessions !== 1 ? 's' : ''}`
                : pulse.overdue > 0
                ? `${pulse.overdue} pending`
                : 'On track'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
    } : {
      elevation: 1,
    }),
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  list: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bullet: {
    fontSize: 12,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0f172a',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  status: {
    fontSize: 13,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
