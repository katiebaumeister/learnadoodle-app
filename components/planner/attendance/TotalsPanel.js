import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function TotalsPanel({ title = 'This Year', childTotals = [] }) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {childTotals.map((c) => (
        <View key={c.childId} style={styles.card}>
          <Text style={styles.childName}>{c.childName}</Text>
          <View style={styles.stats}>
            <Text style={styles.stat}>{c.daysAttended} days attended</Text>
            {c.hoursLogged != null && (
              <Text style={styles.stat}>{c.hoursLogged} hours logged</Text>
            )}
            {c.requiredDays != null && (
              <Text style={styles.statMuted}>{c.requiredDays} required days</Text>
            )}
            {c.requiredHours != null && (
              <Text style={styles.statMuted}>{c.requiredHours} required hours</Text>
            )}
          </View>
          {c.projectedCompletion && (
            <Text style={[styles.projected, c.atRisk && styles.projectedAtRisk]}>
              Projected completion: {c.projectedCompletion}
              {c.atRisk ? ' (at risk)' : ''}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 },
  card: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  childName: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 8 },
  stats: { gap: 4 },
  stat: { fontSize: 13, color: '#374151' },
  statMuted: { fontSize: 13, color: '#6B7280' },
  projected: { fontSize: 12, color: '#059669', marginTop: 8 },
  projectedAtRisk: { color: '#DC2626' },
});
