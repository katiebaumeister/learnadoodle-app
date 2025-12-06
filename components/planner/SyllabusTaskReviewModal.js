/**
 * Syllabus Task Review Modal
 * Shows extracted tasks/assignments for review before creating backlog items
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Checkbox } from 'react-native';
import { X, CheckCircle, Circle, BookOpen, FileText } from 'lucide-react';
import { colors } from '../../theme/colors';

export default function SyllabusTaskReviewModal({
  visible,
  onClose,
  pendingTasks = [],
  onApprove,
  syllabusId
}) {
  const [selectedTasks, setSelectedTasks] = useState(new Set(pendingTasks.map((_, idx) => idx)));
  const [isCreating, setIsCreating] = useState(false);

  if (!visible) return null;

  const handleToggleTask = (index) => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTasks(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedTasks.size === pendingTasks.length) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(pendingTasks.map((_, idx) => idx)));
    }
  };

  const handleApprove = async () => {
    const tasksToCreate = pendingTasks.filter((_, idx) => selectedTasks.has(idx));
    if (tasksToCreate.length === 0) {
      return;
    }

    setIsCreating(true);
    try {
      if (onApprove) {
        await onApprove(tasksToCreate);
      }
      onClose();
    } catch (error) {
      console.error('Error creating tasks:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const assignments = pendingTasks.filter(t => t.section_type === 'assignment');
  const lessons = pendingTasks.filter(t => t.section_type === 'lesson');

  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <BookOpen size={20} color={colors.accent} />
            <Text style={styles.title}>Review Extracted Tasks</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={20} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView style={styles.content}>
          <Text style={styles.summary}>
            Found {pendingTasks.length} tasks from syllabus. Select which ones to add to your planner.
          </Text>

          <TouchableOpacity onPress={handleSelectAll} style={styles.selectAllButton}>
            <Text style={styles.selectAllText}>
              {selectedTasks.size === pendingTasks.length ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>

          {/* Assignments */}
          {assignments.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                <FileText size={16} color={colors.accent} /> Assignments ({assignments.length})
              </Text>
              {assignments.map((task, idx) => {
                const originalIdx = pendingTasks.indexOf(task);
                const isSelected = selectedTasks.has(originalIdx);
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.taskItem, isSelected && styles.taskItemSelected]}
                    onPress={() => handleToggleTask(originalIdx)}
                  >
                    {isSelected ? (
                      <CheckCircle size={20} color={colors.accent} />
                    ) : (
                      <Circle size={20} color={colors.muted} />
                    )}
                    <View style={styles.taskContent}>
                      <Text style={styles.taskTitle}>{task.title}</Text>
                      <Text style={styles.taskDetails}>
                        {task.estimated_minutes} min • {task.due_ts ? new Date(task.due_ts).toLocaleDateString() : 'No due date'}
                      </Text>
                      {task.notes && (
                        <Text style={styles.taskNotes} numberOfLines={2}>{task.notes}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Lessons */}
          {lessons.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                <BookOpen size={16} color={colors.accent} /> Lessons ({lessons.length})
              </Text>
              {lessons.map((task, idx) => {
                const originalIdx = pendingTasks.indexOf(task);
                const isSelected = selectedTasks.has(originalIdx);
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.taskItem, isSelected && styles.taskItemSelected]}
                    onPress={() => handleToggleTask(originalIdx)}
                  >
                    {isSelected ? (
                      <CheckCircle size={20} color={colors.accent} />
                    ) : (
                      <Circle size={20} color={colors.muted} />
                    )}
                    <View style={styles.taskContent}>
                      <Text style={styles.taskTitle}>{task.title}</Text>
                      <Text style={styles.taskDetails}>
                        {task.estimated_minutes} min • {task.due_ts ? new Date(task.due_ts).toLocaleDateString() : 'No due date'}
                      </Text>
                      {task.notes && (
                        <Text style={styles.taskNotes} numberOfLines={2}>{task.notes}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleApprove}
            style={[styles.approveButton, selectedTasks.size === 0 && styles.approveButtonDisabled]}
            disabled={selectedTasks.size === 0 || isCreating}
          >
            <Text style={styles.approveText}>
              {isCreating ? 'Creating...' : `Create ${selectedTasks.size} Task${selectedTasks.size !== 1 ? 's' : ''}`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: '90%',
    maxWidth: 600,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  summary: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  selectAllButton: {
    alignSelf: 'flex-end',
    padding: 8,
    marginBottom: 16,
  },
  selectAllText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  taskItemSelected: {
    borderColor: colors.accent,
    backgroundColor: '#eff6ff',
  },
  taskContent: {
    flex: 1,
    marginLeft: 12,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  taskDetails: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  taskNotes: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  approveButton: {
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  approveButtonDisabled: {
    backgroundColor: '#d1d5db',
  },
  approveText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
});

