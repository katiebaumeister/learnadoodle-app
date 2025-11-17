import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function TaskCard({ task }) {
  const formatTime = (dateStr) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch {
      return null;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return null;
    }
  };

  const startTime = formatTime(task.start);
  const endTime = formatTime(task.end);
  const date = formatDate(task.start);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{task.title || 'Untitled Task'}</Text>
        {task.labels && task.labels.length > 0 && (
          <View style={styles.labels}>
            {task.labels.map((label, idx) => (
              <View key={idx} style={styles.label}>
                <Text style={styles.labelText}>#{label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      
      {(startTime || task.plannedMinutes || task.actualMinutes) && (
        <View style={styles.footer}>
          {startTime && endTime && (
            <Text style={styles.time}>
              {date} {startTime} - {endTime}
            </Text>
          )}
          {task.plannedMinutes && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {task.plannedMinutes}m
                {task.actualMinutes ? ` / ${task.actualMinutes}m` : ''}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  labels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  label: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  labelText: {
    fontSize: 10,
    color: '#6b7280',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  time: {
    fontSize: 12,
    color: '#6b7280',
  },
  badge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    color: '#1e40af',
    fontWeight: '500',
  },
});

