import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';

const SubjectGoalsManager = ({ visible, onClose, childId, familyId }) => {
  const [goals, setGoals] = useState([]);
  const [backlog, setBacklog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showAddBacklog, setShowAddBacklog] = useState(false);
  const [newGoal, setNewGoal] = useState({
    subject_id: '',
    minutes_per_week: 60,
    priority: 100,
  });
  const [newBacklogItem, setNewBacklogItem] = useState({
    subject_id: '',
    title: '',
    description: '',
    est_minutes: 30,
    priority: 100,
  });

  useEffect(() => {
    if (visible && childId) {
      loadGoals();
      loadBacklog();
    }
  }, [visible, childId]);

  const loadGoals = async () => {
    try {
      const { data, error } = await supabase
        .from('subject_goals')
        .select('*')
        .eq('child_id', childId)
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (error) throw error;
      setGoals(data || []);
    } catch (error) {
      console.error('Error loading goals:', error);
    }
  };

  const loadBacklog = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('child_id', childId)
        .eq('status', 'backlog')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBacklog(data || []);
    } catch (error) {
      console.error('Error loading backlog:', error);
    }
  };

  const saveGoal = async () => {
    if (!newGoal.subject_id || newGoal.minutes_per_week <= 0) {
      showAlert('Validation Error', 'Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('subject_goals')
        .insert({
          ...newGoal,
          child_id: childId,
          cadence: { type: 'weekly', days: [1, 2, 3, 4, 5] },
        });

      if (error) throw error;

      setNewGoal({ subject_id: '', minutes_per_week: 60, priority: 100 });
      setShowAddGoal(false);
      loadGoals();
      showAlert('Success', 'Goal added successfully');
    } catch (error) {
      console.error('Error saving goal:', error);
      showAlert('Error', 'Failed to save goal');
    } finally {
      setLoading(false);
    }
  };

  const saveBacklogItem = async () => {
    if (!newBacklogItem.subject_id || !newBacklogItem.title || newBacklogItem.est_minutes <= 0) {
      showAlert('Validation Error', 'Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('events')
        .insert({
          child_id: childId,
          subject_id: newBacklogItem.subject_id,
          title: newBacklogItem.title,
          description: newBacklogItem.description,
          estimate_minutes: newBacklogItem.est_minutes,
          status: 'backlog',
          source: 'backlog',
        });

      if (error) throw error;

      setNewBacklogItem({ subject_id: '', title: '', description: '', est_minutes: 30, priority: 100 });
      setShowAddBacklog(false);
      loadBacklog();
      showAlert('Success', 'Backlog item added successfully');
    } catch (error) {
      console.error('Error saving backlog item:', error);
      showAlert('Error', 'Failed to save backlog item');
    } finally {
      setLoading(false);
    }
  };

  const deleteGoal = async (goalId) => {
    try {
      const { error } = await supabase
        .from('subject_goals')
        .update({ is_active: false })
        .eq('id', goalId);

      if (error) throw error;
      loadGoals();
      showAlert('Success', 'Goal deleted successfully');
    } catch (error) {
      console.error('Error deleting goal:', error);
      showAlert('Error', 'Failed to delete goal');
    }
  };

  const deleteBacklogItem = async (itemId) => {
    try {
      const { error } = await supabase
        .from('events')
        .update({ status: 'cancelled' })
        .eq('id', itemId);

      if (error) throw error;
      loadBacklog();
      showAlert('Success', 'Backlog item deleted successfully');
    } catch (error) {
      console.error('Error deleting backlog item:', error);
      showAlert('Error', 'Failed to delete backlog item');
    }
  };

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const renderGoalCard = (goal) => (
    <View key={goal.id} style={styles.goalCard}>
      <View style={styles.goalHeader}>
        <Text style={styles.goalTitle}>{goal.subject_id}</Text>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => deleteGoal(goal.id)}
        >
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.goalDetails}>
        {goal.minutes_per_week} minutes per week
      </Text>
      <Text style={styles.goalDetails}>
        Priority: {goal.priority}
      </Text>
    </View>
  );

  const renderBacklogCard = (item) => (
    <View key={item.id} style={styles.backlogCard}>
      <View style={styles.backlogHeader}>
        <Text style={styles.backlogTitle}>{item.title}</Text>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => deleteBacklogItem(item.id)}
        >
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.backlogSubject}>{item.subject_id}</Text>
      <Text style={styles.backlogDescription}>{item.description}</Text>
      <Text style={styles.backlogDetails}>
        {item.est_minutes} minutes • Priority: {item.priority}
      </Text>
    </View>
  );

  const renderAddGoalForm = () => (
    <View style={styles.addForm}>
      <Text style={styles.formTitle}>Add New Goal</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Subject</Text>
        <TouchableOpacity
          style={styles.textInput}
          onPress={() => showAlert('Subject Picker', 'Subject picker would open here')}
        >
          <Text style={styles.textInputText}>
            {newGoal.subject_id || 'Select subject...'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Minutes per Week</Text>
        <TouchableOpacity
          style={styles.textInput}
          onPress={() => showAlert('Number Input', 'Minutes input would open here')}
        >
          <Text style={styles.textInputText}>{newGoal.minutes_per_week}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Priority (1-1000)</Text>
        <TouchableOpacity
          style={styles.textInput}
          onPress={() => showAlert('Number Input', 'Priority input would open here')}
        >
          <Text style={styles.textInputText}>{newGoal.priority}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formActions}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => setShowAddGoal(false)}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={saveGoal}
          disabled={loading}
        >
          <Text style={styles.saveButtonText}>
            {loading ? 'Saving...' : 'Save Goal'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAddBacklogForm = () => (
    <View style={styles.addForm}>
      <Text style={styles.formTitle}>Add Backlog Item</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Subject</Text>
        <TouchableOpacity
          style={styles.textInput}
          onPress={() => showAlert('Subject Picker', 'Subject picker would open here')}
        >
          <Text style={styles.textInputText}>
            {newBacklogItem.subject_id || 'Select subject...'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Title</Text>
        <TouchableOpacity
          style={styles.textInput}
          onPress={() => showAlert('Text Input', 'Title input would open here')}
        >
          <Text style={styles.textInputText}>
            {newBacklogItem.title || 'Enter title...'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Description</Text>
        <TouchableOpacity
          style={styles.textInput}
          onPress={() => showAlert('Text Input', 'Description input would open here')}
        >
          <Text style={styles.textInputText}>
            {newBacklogItem.description || 'Enter description...'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Estimated Minutes</Text>
        <TouchableOpacity
          style={styles.textInput}
          onPress={() => showAlert('Number Input', 'Minutes input would open here')}
        >
          <Text style={styles.textInputText}>{newBacklogItem.est_minutes}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Priority (1-1000)</Text>
        <TouchableOpacity
          style={styles.textInput}
          onPress={() => showAlert('Number Input', 'Priority input would open here')}
        >
          <Text style={styles.textInputText}>{newBacklogItem.priority}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formActions}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => setShowAddBacklog(false)}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={saveBacklogItem}
          disabled={loading}
        >
          <Text style={styles.saveButtonText}>
            {loading ? 'Saving...' : 'Save Item'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Subject Goals & Backlog</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Goals Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Weekly Goals</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddGoal(true)}
              >
                <Text style={styles.addButtonText}>+ Add Goal</Text>
              </TouchableOpacity>
            </View>

            {showAddGoal ? (
              renderAddGoalForm()
            ) : (
              <View style={styles.cardsContainer}>
                {goals.length === 0 ? (
                  <Text style={styles.emptyState}>No goals set yet</Text>
                ) : (
                  goals.map(renderGoalCard)
                )}
              </View>
            )}
          </View>

          {/* Backlog Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Learning Backlog</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddBacklog(true)}
              >
                <Text style={styles.addButtonText}>+ Add Item</Text>
              </TouchableOpacity>
            </View>

            {showAddBacklog ? (
              renderAddBacklogForm()
            ) : (
              <View style={styles.cardsContainer}>
                {backlog.length === 0 ? (
                  <Text style={styles.emptyState}>No backlog items yet</Text>
                ) : (
                  backlog.map(renderBacklogCard)
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6b7280',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  addButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  cardsContainer: {
    gap: 12,
  },
  goalCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  goalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  goalDetails: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  backlogCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  backlogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backlogTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  backlogSubject: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3b82f6',
    marginBottom: 4,
  },
  backlogDescription: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
  },
  backlogDetails: {
    fontSize: 12,
    color: '#6b7280',
  },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ef4444',
    borderRadius: 6,
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  addForm: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  textInputText: {
    fontSize: 16,
    color: '#111827',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
  },
  emptyState: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
});

export default SubjectGoalsManager;
