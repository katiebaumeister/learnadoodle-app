import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Plus, ClipboardList, List } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function TasksToday({ tasks = [], onAddTask, onToggleTask, backlogCount = 0, onAddFromBacklog, onViewPlanner, onTaskClick }) {

  const handleContainerPress = () => {
    if (onViewPlanner) {
      onViewPlanner();
    }
  };

  const handleTaskPress = (task, e) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
    }
    if (onTaskClick) {
      onTaskClick(task);
    } else if (onViewPlanner) {
      onViewPlanner();
    }
  };

  const content = (
    <>
      {onViewPlanner ? (
        <TouchableOpacity
          style={styles.header}
          onPress={(e) => {
            if (e && e.stopPropagation) {
              e.stopPropagation();
            }
            if (onViewPlanner) {
              onViewPlanner();
            }
          }}
          activeOpacity={0.7}
        >
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Backlog Tasks</Text>
          </View>
          {tasks.length === 0 && (
            <TouchableOpacity 
              style={styles.addButton}
              onPress={(e) => {
                if (e && e.stopPropagation) {
                  e.stopPropagation();
                }
                if (onAddTask) {
                  onAddTask();
                }
              }}
            >
              <Plus size={14} color={colors.text} />
              <Text style={styles.addButtonText}>Log a task</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      ) : (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Backlog Tasks</Text>
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
      )}

      {tasks.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <ClipboardList size={24} color={colors.muted} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyText}>No backlog tasks</Text>
          <Text style={styles.emptyHelperText}>
            Backlog tasks are unscheduled items that need to be planned. Add tasks from your subjects or create new ones.
          </Text>
          <View style={styles.emptyActions}>
            {backlogCount > 0 && onAddFromBacklog && (
              <TouchableOpacity 
                style={styles.addFromBacklogButton}
                onPress={(e) => {
                  if (e && e.stopPropagation) {
                    e.stopPropagation();
                  }
                  if (onAddFromBacklog) {
                    onAddFromBacklog();
                  }
                }}
                activeOpacity={0.7}
              >
                <List size={14} color={colors.text} />
                <Text style={styles.addFromBacklogText}>
                  Add from backlog ({backlogCount} available)
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.tasksList}>
          {tasks.map((task) => (
            <TouchableOpacity
              key={task.id}
              style={styles.taskItem}
              onPress={(e) => handleTaskPress(task, e)}
              activeOpacity={0.7}
            >
              <Text style={styles.bullet}>•</Text>
              <View style={styles.taskContent}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                {task.description && (
                  <Text style={styles.taskDescription}>{task.description}</Text>
                )}
                {task.due_time && (
                  <Text style={styles.taskDue}>Due {task.due_time}</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );

  if (onViewPlanner && tasks.length > 0) {
    return (
      <TouchableOpacity 
        style={styles.container}
        onPress={handleContainerPress}
        activeOpacity={0.95}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {content}
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
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      whiteSpace: 'nowrap',
    }),
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
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyHelperText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tasksList: {
    gap: 8,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  bullet: {
    fontSize: 20,
    color: colors.text,
    marginRight: 4,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }),
  },
  completedTask: {
    opacity: 0.6,
  },
  checkbox: {
    marginTop: 2,
  },
  taskContent: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: colors.muted,
  },
  taskDescription: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  taskDue: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: 'italic',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
