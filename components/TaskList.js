import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { Calendar, ChevronDown } from 'lucide-react';
import TaskCard from './TaskCard';

export default function TaskList({ 
  tasks = [], 
  emptyText = 'No tasks found', 
  isCompleted = false,
  children = [],
  onEditTask,
  onViewTask,
  onMarkComplete,
  hoveredTask,
  onHoverTask,
}) {
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
      {groupedTasks.scheduled.map((group) => {
        // For completed pane, check if tasks are older than 7 days
        const isOldGroup = isCompleted && group.date && (() => {
          try {
            const taskDate = new Date(group.date);
            const daysAgo = (Date.now() - taskDate.getTime()) / (1000 * 60 * 60 * 24);
            return daysAgo > 7;
          } catch {
            return false;
          }
        })();
        
        return (
          <View key={group.dateKey} style={[styles.group, isOldGroup && styles.oldGroup]}>
            {/* Divider BEFORE date header */}
            <View style={styles.dateDivider} />
            
            <View style={styles.header}>
              <Calendar size={14} color="#6b7280" style={{ marginRight: 6 }} />
              <Text style={styles.headerText}>
                {formatDayHeader(group.date)}
              </Text>
              <Text style={styles.headerCount}>
                · {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}
              </Text>
              {isCompleted && (
                <ChevronDown size={14} color="#9ca3af" style={{ marginLeft: 4 }} />
              )}
            </View>
            
            {group.tasks.map((task, idx) => (
              <TaskCard 
                key={task.id || idx} 
                task={task} 
                opacity={isOldGroup ? 0.9 : 1}
                children={children}
                onEditTask={onEditTask}
                onViewTask={onViewTask}
                onMarkComplete={onMarkComplete}
                isHovered={hoveredTask === task.id}
                onHover={onHoverTask}
              />
            ))}
          </View>
        );
      })}

      {/* Unscheduled Tasks */}
      {groupedTasks.unscheduled.length > 0 && (
        <View style={styles.group}>
          <View style={styles.dateDivider} />
          <View style={styles.header}>
            <Text style={styles.headerText}>Unscheduled</Text>
            <Text style={styles.headerCount}>
              · {groupedTasks.unscheduled.length} {groupedTasks.unscheduled.length === 1 ? 'task' : 'tasks'}
            </Text>
          </View>
          {groupedTasks.unscheduled.map((task, idx) => (
            <TaskCard 
              key={task.id || idx} 
              task={task}
              children={children}
              onEditTask={onEditTask}
              onViewTask={onViewTask}
              onMarkComplete={onMarkComplete}
              isHovered={hoveredTask === task.id}
              onHover={onHoverTask}
            />
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
    paddingHorizontal: 20,
  },
  group: {
    marginBottom: 20,
    paddingTop: 8,
  },
  dateDivider: {
    height: 1,
    backgroundColor: 'rgba(243, 244, 246, 0.7)',
    marginBottom: 12,
    marginTop: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 10,
      backgroundColor: 'rgba(250, 250, 250, 0.95)',
      backdropFilter: 'blur(4px)',
    }),
  },
  headerText: {
    fontSize: 14, // Increased from 13
    fontWeight: '600', // Increased font weight
    color: '#374151', // Darker color
  },
  headerCount: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9ca3af',
    marginLeft: 4,
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
  oldGroup: {
    opacity: 0.9,
  },
});
