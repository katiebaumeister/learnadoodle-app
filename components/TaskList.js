import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import TaskCard from './TaskCard';

export default function TaskList({ tasks = [], emptyText = 'No tasks found' }) {
  const groupedTasks = useMemo(() => {
    const groups = {};
    const unscheduled = [];

    tasks.forEach((task) => {
      if (!task.start) {
        unscheduled.push(task);
        return;
      }

      try {
        const date = new Date(task.start);
        const dateKey = date.toISOString().split('T')[0];
        if (!groups[dateKey]) {
          groups[dateKey] = [];
        }
        groups[dateKey].push(task);
      } catch {
        unscheduled.push(task);
      }
    });

    // Sort groups by date
    const sortedGroups = Object.keys(groups)
      .sort()
      .map((dateKey) => ({
        dateKey,
        date: new Date(dateKey),
        tasks: groups[dateKey].sort((a, b) => {
          const aTime = a.start ? new Date(a.start).getTime() : 0;
          const bTime = b.start ? new Date(b.start).getTime() : 0;
          return aTime - bTime;
        }),
      }));

    return { scheduled: sortedGroups, unscheduled };
  }, [tasks]);

  const formatDayHeader = (date) => {
    try {
      const d = new Date(date);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
      const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${dayName}, ${monthDay}`;
    } catch {
      return date;
    }
  };

  if (tasks.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Scheduled Tasks */}
      {groupedTasks.scheduled.map((group) => (
        <View key={group.dateKey} style={styles.group}>
          <View style={styles.header}>
            <Text style={styles.headerText}>{formatDayHeader(group.date)}</Text>
          </View>
          {group.tasks.map((task, idx) => (
            <TaskCard key={task.id || idx} task={task} />
          ))}
        </View>
      ))}

      {/* Unscheduled Tasks */}
      {groupedTasks.unscheduled.length > 0 && (
        <View style={styles.group}>
          <View style={styles.header}>
            <Text style={styles.headerText}>Unscheduled</Text>
          </View>
          {groupedTasks.unscheduled.map((task, idx) => (
            <TaskCard key={task.id || idx} task={task} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 16,
  },
  group: {
    marginBottom: 24,
  },
  header: {
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 10,
      backgroundColor: '#ffffff',
    }),
    paddingVertical: 8,
    paddingHorizontal: 0,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});

