import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CheckSquare, Square, Plus } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function TasksToday({ tasks = [], onAddTask, onToggleTask, onGenerateTasks }) {
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
          <CheckSquare size={16} color={colors.text} />
          <Text style={styles.title}>Tasks for today</Text>
        </View>
        {tasks.length === 0 && (
          <TouchableOpacity 
            style={styles.addButton}
            onPress={onAddTask}
          >
            <Plus size={14} color={colors.accent} />
            <Text style={styles.addButtonText}>Log a task</Text>
          </TouchableOpacity>
        )}
      </View>

      {tasks.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No tasks scheduled</Text>
          <TouchableOpacity 
            style={styles.generateTasksButton}
            onPress={onGenerateTasks}
          >
            <Text style={styles.generateTasksText}>Create 3 quick tasks from subjects</Text>
          </TouchableOpacity>
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
    backgroundColor: colors.accent,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accentContrast,
  },
  emptyState: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  generateTasksButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  generateTasksText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '500',
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
