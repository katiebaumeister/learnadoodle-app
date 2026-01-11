/**
 * Reminder Manager Component
 * Create and manage reminders for assignments and tasks
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { X, Plus, Clock, Bell, Trash2, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import { getReminders, createReminder, updateReminderStatus, deleteReminder, createAssignmentReminder } from '../../lib/services/remindersClient';

export default function ReminderManager({ visible, childId, familyId, assignment = null, onClose }) {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  // Create form state
  const [reminderType, setReminderType] = useState('assignment_due');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  useEffect(() => {
    if (visible) {
      loadReminders();
      if (assignment) {
        // Pre-fill form for assignment reminder
        setReminderType('assignment_due');
        setTitle(`Assignment Due: ${assignment.title}`);
        setMessage(`Time to finish: ${assignment.title}`);
        if (assignment.due_date) {
          const dueDate = new Date(assignment.due_date);
          setScheduledFor(dueDate.toISOString().split('T')[0]);
          setScheduledTime('09:00'); // Default to 9 AM
        }
      }
    }
  }, [visible, childId, familyId, assignment]);

  const loadReminders = async () => {
    if (!familyId) return;

    setLoading(true);
    try {
      const { data, error } = await getReminders(childId, familyId, 'pending');

      if (error) {
        setReminders([]);
      } else {
        setReminders(data || []);
      }
    } catch (error) {
      setReminders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReminder = async () => {
    if (!title.trim() || !scheduledFor) {
      Alert.alert('Validation Error', 'Please fill in title and scheduled date.');
      return;
    }

    setCreating(true);
    try {
      // Combine date and time
      const scheduledDateTime = scheduledTime
        ? `${scheduledFor}T${scheduledTime}:00`
        : `${scheduledFor}T09:00:00`;

      let reminderData;
      if (assignment && reminderType === 'assignment_due') {
        // Use assignment reminder helper
        const { data, error } = await createAssignmentReminder(
          assignment.id,
          childId,
          familyId,
          scheduledDateTime,
          message || undefined
        );

        if (error) throw error;
        reminderData = data;
      } else {
        // Create generic reminder
        reminderData = {
          family_id: familyId,
          child_id: childId,
          reminder_type: reminderType,
          title: title.trim(),
          message: message.trim() || null,
          scheduled_for: scheduledDateTime,
          linked_assignment_id: assignment?.id || null,
          status: 'pending',
        };

        const { data, error } = await createReminder(reminderData);
        if (error) throw error;
        reminderData = data;
      }

      // Reset form
      setTitle('');
      setMessage('');
      setScheduledFor('');
      setScheduledTime('');
      setShowCreateForm(false);

      // Reload reminders
      await loadReminders();

      Alert.alert('Success', 'Reminder created successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to create reminder. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleDismiss = async (reminderId) => {
    try {
      const { error } = await updateReminderStatus(reminderId, 'dismissed');
      if (error) throw error;
      await loadReminders();
    } catch (error) {
      Alert.alert('Error', 'Failed to dismiss reminder.');
    }
  };

  const handleDelete = async (reminderId) => {
    Alert.alert(
      'Delete Reminder',
      'Are you sure you want to delete this reminder?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await deleteReminder(reminderId);
              if (error) throw error;
              await loadReminders();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete reminder.');
            }
          },
        },
      ]
    );
  };

  const formatScheduledTime = (scheduledFor) => {
    try {
      const date = new Date(scheduledFor);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return scheduledFor;
    }
  };

  const getReminderTypeLabel = (type) => {
    switch (type) {
      case 'assignment_due':
        return 'Assignment Due';
      case 'daily_task':
        return 'Daily Task';
      case 'review_needed':
        return 'Review Needed';
      case 'practice_time':
        return 'Practice Time';
      default:
        return 'Custom';
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Bell size={20} color={colors.indigo} />
              <Text style={styles.title}>Reminders</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Create Button */}
          {!showCreateForm && (
            <View style={styles.createSection}>
              <TouchableOpacity
                style={styles.createButton}
                onPress={() => setShowCreateForm(true)}
              >
                <Plus size={18} color={colors.white} />
                <Text style={styles.createButtonText}>Create Reminder</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Create Form */}
          {showCreateForm && (
            <View style={styles.createForm}>
              <Text style={styles.formTitle}>New Reminder</Text>

              <View style={styles.field}>
                <Text style={styles.label}>Type</Text>
                <View style={styles.typeButtons}>
                  {['assignment_due', 'daily_task', 'review_needed', 'practice_time', 'custom'].map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeButton,
                        reminderType === type && styles.typeButtonActive,
                      ]}
                      onPress={() => setReminderType(type)}
                    >
                      <Text
                        style={[
                          styles.typeButtonText,
                          reminderType === type && styles.typeButtonTextActive,
                        ]}
                      >
                        {getReminderTypeLabel(type)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Title *</Text>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Reminder title"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Message</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={message}
                  onChangeText={setMessage}
                  placeholder="e.g., Time to finish math"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Date *</Text>
                <TextInput
                  style={styles.input}
                  value={scheduledFor}
                  onChangeText={setScheduledFor}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Time</Text>
                <TextInput
                  style={styles.input}
                  value={scheduledTime}
                  onChangeText={setScheduledTime}
                  placeholder="HH:MM (e.g., 09:00)"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelFormButton}
                  onPress={() => {
                    setShowCreateForm(false);
                    setTitle('');
                    setMessage('');
                    setScheduledFor('');
                    setScheduledTime('');
                  }}
                >
                  <Text style={styles.cancelFormButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveFormButton, creating && styles.buttonDisabled]}
                  onPress={handleCreateReminder}
                  disabled={creating}
                >
                  {creating ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.saveFormButtonText}>Create</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Reminders List */}
          <ScrollView style={styles.remindersList} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.indigo} />
              </View>
            ) : reminders.length === 0 ? (
              <View style={styles.emptyState}>
                <Bell size={48} color={colors.textSecondary} />
                <Text style={styles.emptyText}>No reminders</Text>
                <Text style={styles.emptySubtext}>Create reminders to get notified about assignments and tasks</Text>
              </View>
            ) : (
              reminders.map((reminder) => (
                <View key={reminder.id} style={styles.reminderCard}>
                  <View style={styles.reminderHeader}>
                    <View style={styles.reminderLeft}>
                      <Clock size={16} color={colors.textSecondary} />
                      <View style={styles.reminderInfo}>
                        <Text style={styles.reminderTitle}>{reminder.title}</Text>
                        <Text style={styles.reminderTime}>
                          {formatScheduledTime(reminder.scheduled_for)}
                        </Text>
                        {reminder.message && (
                          <Text style={styles.reminderMessage}>{reminder.message}</Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.reminderTypeBadge}>
                      <Text style={styles.reminderTypeText}>
                        {getReminderTypeLabel(reminder.reminder_type)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.reminderActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleDismiss(reminder.id)}
                    >
                      <CheckCircle size={16} color={colors.greenBold} />
                      <Text style={styles.actionButtonText}>Dismiss</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleDelete(reminder.id)}
                    >
                      <Trash2 size={16} color={colors.redBold} />
                      <Text style={[styles.actionButtonText, { color: colors.redBold }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 20,
    width: '90%',
    maxWidth: 500,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  createSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.indigo,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  createForm: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.panel,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
  },
  textArea: {
    minHeight: 60,
  },
  typeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  typeButtonActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  typeButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  typeButtonTextActive: {
    color: colors.white,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelFormButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelFormButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  saveFormButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: colors.indigo,
  },
  saveFormButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  remindersList: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  reminderCard: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reminderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  reminderLeft: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
  },
  reminderInfo: {
    flex: 1,
    gap: 4,
  },
  reminderTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  reminderTime: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  reminderMessage: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  reminderTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.blueSoft,
    borderRadius: 4,
  },
  reminderTypeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.blueBold,
    textTransform: 'uppercase',
  },
  reminderActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

