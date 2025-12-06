import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { CheckSquare, Square, Plus, ClipboardList, List } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function TasksToday({ tasks = [], onAddTask, onToggleTask, onGenerateTasks, backlogCount = 0, onAddFromBacklog, onViewPlanner }) {
  const [completedTasks, setCompletedTasks] = useState(new Set());

  const handleToggle = (taskId) => {
    setCompletedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
    onToggleTask?.(taskId);
  };

  const incompleteTasks = tasks.filter(t => !completedTasks.has(t.id));
  const completedTasksList = tasks.filter(t => completedTasks.has(t.id));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onViewPlanner ? (
            <TouchableOpacity
              onPress={onViewPlanner}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <CheckSquare size={16} color={colors.text} />
              <Text style={styles.title}>Tasks for today</Text>
            </TouchableOpacity>
          ) : (
            <>
          <CheckSquare size={16} color={colors.text} />
          <Text style={styles.title}>Tasks for today</Text>
            </>
          )}
        </View>
        {tasks.length === 0 && (
          <TouchableOpacity 
            style={styles.addButton}
            onPress={onAddTask}
          >
            <Plus size={14} color={colors.text} />
            <Text style={styles.addButtonText}>Log a task</Text>
          </TouchableOpacity>
        )}
      </View>

      {tasks.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <ClipboardList size={24} color={colors.muted} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyText}>No tasks scheduled</Text>
          <Text style={styles.emptyHelperText}>
            You can quickly seed today with suggestions based on your subjects.
          </Text>
          <View style={styles.emptyActions}>
            {backlogCount > 0 && onAddFromBacklog && (
              <TouchableOpacity 
                style={styles.addFromBacklogButton}
                onPress={onAddFromBacklog}
                activeOpacity={0.7}
              >
                <List size={14} color={colors.text} />
                <Text style={styles.addFromBacklogText}>
                  Add from backlog ({backlogCount} available)
                </Text>
              </TouchableOpacity>
            )}
          <TouchableOpacity 
            style={styles.generateTasksButton}
            onPress={onGenerateTasks}
              activeOpacity={0.7}
          >
              <Plus size={14} color={colors.text} />
              <Text style={styles.generateTasksText}>Generate suggested tasks</Text>
          </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.tasksList}>
          {/* Incomplete tasks */}
          {incompleteTasks.map((task) => (
            <View key={task.id} style={styles.taskItem}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => handleToggle(task.id)}
              >
                <Square size={16} color={colors.border} />
              </TouchableOpacity>
              <View style={styles.taskContent}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                {task.description && (
                  <Text style={styles.taskDescription}>{task.description}</Text>
                )}
                {task.due_time && (
                  <Text style={styles.taskDue}>Due {task.due_time}</Text>
                )}
              </View>
            </View>
          ))}

          {/* Completed tasks (with strikethrough) */}
          {completedTasksList.map((task) => (
            <View key={task.id} style={[styles.taskItem, styles.completedTask]}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => handleToggle(task.id)}
              >
                <CheckSquare size={16} color={colors.greenBold} />
              </TouchableOpacity>
              <View style={styles.taskContent}>
                <Text style={[styles.taskTitle, styles.completedText]}>{task.title}</Text>
                {task.description && (
                  <Text style={[styles.taskDescription, styles.completedText]}>{task.description}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(228, 245, 231, 0.25)', // greenSoft with 25% opacity
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginHorizontal: -16,
    marginTop: -16,
    borderTopLeftRadius: colors.radiusLg,
    borderTopRightRadius: colors.radiusLg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  emptyState: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  emptyHelperText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  emptyActions: {
    gap: 8,
    width: '100%',
    alignItems: 'center',
  },
  addFromBacklogButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  addFromBacklogText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
  },
  generateTasksButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  generateTasksText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
  },
  tasksList: {
    gap: 8,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
  },
  completedTask: {
    opacity: 0.6,
  },
  checkbox: {
    marginTop: 2,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: colors.muted,
  },
  taskDescription: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 2,
  },
  taskDue: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: 'italic',
  },
});
