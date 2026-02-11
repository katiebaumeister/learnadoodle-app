import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

export default function WeeklyPulseCard({ weeklyPulse = [] }) {
  const [isHovered, setIsHovered] = useState(false);

  if (!weeklyPulse || weeklyPulse.length === 0) {
    return null;
  }

  return (
    <View 
      style={[
        styles.container,
        Platform.OS === 'web' && isHovered && styles.containerHovered
      ]}
      {...(Platform.OS === 'web' && {
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
      })}
    >
      <Text style={styles.title}>This week</Text>
      <View style={styles.pulseList}>
        {weeklyPulse.slice(0, 5).map((pulse, index) => (
          <View key={index} style={styles.pulseRow}>
            <Text style={styles.subjectName}>{pulse.subjectName}</Text>
            <View style={styles.statusContainer}>
              {pulse.sessions > 0 && (
                <Text style={styles.statusText}>{pulse.sessions} sessions</Text>
              )}
              {pulse.overdue > 0 && (
                <Text style={[styles.statusText, styles.overdueText]}>
                  {pulse.overdue} overdue
                </Text>
              )}
              {pulse.sessions === 0 && pulse.overdue === 0 && (
                <Text style={styles.statusText}>On track</Text>
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      transition: 'all 0.2s ease',
    } : {
      elevation: 2,
    }),
  },
  containerHovered: {
    ...(Platform.OS === 'web' && {
      transform: [{ translateY: -1 }],
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
    }),
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pulseList: {
    gap: 12,
  },
  pulseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  subjectName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0f172a',
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  statusContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  overdueText: {
    color: '#F87171',
  },
});
