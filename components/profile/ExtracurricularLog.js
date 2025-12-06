import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Modal, TextInput, Alert } from 'react-native';
import { Plus, Edit, Trash2, Calendar, Clock, X, Save } from 'lucide-react';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../../theme/pastelDesignTokens';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import GeistCard from '../GeistCard';

export default function ExtracurricularLog({ childId, familyId }) {
  const { mode } = useSensoryMode();
  const { user } = useAuth();
  const tokens = getModeTokens(mode);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    hoursPerWeek: '',
    description: '',
  });

  useEffect(() => {
    loadActivities();
  }, [childId]);

  const loadActivities = async () => {
    try {
      setLoading(true);
      // Try to load from a dedicated table, or use college_readiness as fallback
      const { data, error } = await supabase
        .from('college_readiness')
        .select('readiness_data')
        .eq('child_id', childId)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.warn('Error loading from college_readiness:', error);
      }
      
      if (data?.readiness_data?.extracurriculars?.activities) {
        const activitiesList = Array.isArray(data.readiness_data.extracurriculars.activities)
          ? data.readiness_data.extracurriculars.activities
          : [data.readiness_data.extracurriculars.activities];
        setActivities(activitiesList.map((act, idx) => ({
          id: `temp-${idx}`,
          name: typeof act === 'string' ? act : act.name || '',
          startDate: typeof act === 'object' ? act.startDate : null,
          endDate: typeof act === 'object' ? act.endDate : null,
          hoursPerWeek: typeof act === 'object' ? act.hoursPerWeek : null,
          description: typeof act === 'object' ? act.description : '',
        })));
      } else {
        setActivities([]);
      }
    } catch (error) {
      console.error('Error loading activities:', error);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  };

  const saveActivity = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Please enter an activity name');
      return;
    }

    try {
      const activityData = {
        name: formData.name.trim(),
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
        hoursPerWeek: formData.hoursPerWeek ? parseFloat(formData.hoursPerWeek) : null,
        description: formData.description.trim() || null,
      };

      // Load existing data
      const { data: existing } = await supabase
        .from('college_readiness')
        .select('readiness_data')
        .eq('child_id', childId)
        .single();

      const readinessData = existing?.readiness_data || {};
      const extracurriculars = readinessData.extracurriculars || {};
      const activitiesList = Array.isArray(extracurriculars.activities) 
        ? [...extracurriculars.activities] 
        : [];

      if (editingActivity) {
        // Update existing
        const index = activities.findIndex(a => a.id === editingActivity.id);
        if (index >= 0) {
          activitiesList[index] = activityData;
        }
      } else {
        // Add new
        activitiesList.push(activityData);
      }

      const updatedData = {
        ...readinessData,
        extracurriculars: {
          ...extracurriculars,
          activities: activitiesList,
        },
      };

      const { error } = await supabase
        .from('college_readiness')
        .upsert({
          child_id: childId,
          family_id: familyId,
          readiness_data: updatedData,
        }, {
          onConflict: 'child_id',
        });

      if (error) throw error;

      await loadActivities();
      setShowModal(false);
      setEditingActivity(null);
      setFormData({ name: '', startDate: '', endDate: '', hoursPerWeek: '', description: '' });
    } catch (error) {
      console.error('Error saving activity:', error);
      Alert.alert('Error', 'Failed to save activity. Please try again.');
    }
  };

  const deleteActivity = async (activityId) => {
    Alert.alert(
      'Delete Activity',
      'Are you sure you want to delete this activity?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: existing } = await supabase
                .from('college_readiness')
                .select('readiness_data')
                .eq('child_id', childId)
                .single();

              const readinessData = existing?.readiness_data || {};
              const extracurriculars = readinessData.extracurriculars || {};
              const activitiesList = Array.isArray(extracurriculars.activities) 
                ? extracurriculars.activities.filter((_, idx) => {
                    const act = activities[idx];
                    return act && act.id !== activityId;
                  })
                : [];

              const updatedData = {
                ...readinessData,
                extracurriculars: {
                  ...extracurriculars,
                  activities: activitiesList,
                },
              };

              await supabase
                .from('college_readiness')
                .upsert({
                  child_id: childId,
                  family_id: familyId,
                  readiness_data: updatedData,
                }, {
                  onConflict: 'child_id',
                });

              await loadActivities();
            } catch (error) {
              console.error('Error deleting activity:', error);
              Alert.alert('Error', 'Failed to delete activity.');
            }
          },
        },
      ]
    );
  };

  const openEditModal = (activity) => {
    setEditingActivity(activity);
    setFormData({
      name: activity.name || '',
      startDate: activity.startDate || '',
      endDate: activity.endDate || '',
      hoursPerWeek: activity.hoursPerWeek?.toString() || '',
      description: activity.description || '',
    });
    setShowModal(true);
  };

  const openAddModal = () => {
    setEditingActivity(null);
    setFormData({ name: '', startDate: '', endDate: '', hoursPerWeek: '', description: '' });
    setShowModal(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: tokens.text }]}>Extracurricular Activities</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: tokens.accent }]}
          onPress={openAddModal}
        >
          <Plus size={16} color={tokens.surface} />
          <Text style={[styles.addButtonText, { color: tokens.surface }]}>Add Activity</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <Text style={[styles.loading, { color: tokens.textSecondary }]}>Loading...</Text>
      ) : activities.length === 0 ? (
        <GeistCard variant="small">
          <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>
            No extracurricular activities recorded yet. Click "Add Activity" to get started.
          </Text>
        </GeistCard>
      ) : (
        <ScrollView style={styles.list}>
          {activities.map((activity, idx) => (
            <GeistCard key={activity.id || idx} variant="small" hoverable style={styles.activityCard}>
              <View style={styles.activityContent}>
                <View style={styles.activityInfo}>
                  <Text style={[styles.activityName, { color: tokens.text }]}>
                    {activity.name}
                  </Text>
                  <View style={styles.activityMeta}>
                    {activity.hoursPerWeek && (
                      <View style={styles.metaItem}>
                        <Clock size={14} color={tokens.iconMuted} />
                        <Text style={[styles.metaText, { color: tokens.textSecondary }]}>
                          {activity.hoursPerWeek} hrs/week
                        </Text>
                      </View>
                    )}
                    {(activity.startDate || activity.endDate) && (
                      <View style={styles.metaItem}>
                        <Calendar size={14} color={tokens.iconMuted} />
                        <Text style={[styles.metaText, { color: tokens.textSecondary }]}>
                          {activity.startDate || 'Start'} - {activity.endDate || 'Ongoing'}
                        </Text>
                      </View>
                    )}
                  </View>
                  {activity.description && (
                    <Text style={[styles.activityDescription, { color: tokens.textSecondary }]}>
                      {activity.description}
                    </Text>
                  )}
                </View>
                <View style={styles.activityActions}>
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={() => openEditModal(activity)}
                  >
                    <Edit size={16} color={tokens.iconMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={() => deleteActivity(activity.id)}
                  >
                    <Trash2 size={16} color={tokens.iconMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            </GeistCard>
          ))}
        </ScrollView>
      )}

      {/* Add/Edit Modal */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowModal(false);
          setEditingActivity(null);
          setFormData({ name: '', startDate: '', endDate: '', hoursPerWeek: '', description: '' });
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: tokens.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: tokens.text }]}>
                {editingActivity ? 'Edit Activity' : 'Add Activity'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowModal(false);
                  setEditingActivity(null);
                  setFormData({ name: '', startDate: '', endDate: '', hoursPerWeek: '', description: '' });
                }}
              >
                <X size={20} color={tokens.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>Activity Name *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                  placeholder="e.g., Soccer, Piano Lessons, Debate Club"
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                />
              </View>

              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: tokens.text }]}>Start Date</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                    placeholder="YYYY-MM-DD"
                    value={formData.startDate}
                    onChangeText={(text) => setFormData({ ...formData, startDate: text })}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: tokens.text }]}>End Date</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                    placeholder="YYYY-MM-DD or leave blank"
                    value={formData.endDate}
                    onChangeText={(text) => setFormData({ ...formData, endDate: text })}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>Hours per Week</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                  placeholder="e.g., 5"
                  keyboardType="numeric"
                  value={formData.hoursPerWeek}
                  onChangeText={(text) => setFormData({ ...formData, hoursPerWeek: text })}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>Description</Text>
                <TextInput
                  style={[styles.textArea, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                  placeholder="Additional notes about this activity..."
                  multiline
                  numberOfLines={4}
                  value={formData.description}
                  onChangeText={(text) => setFormData({ ...formData, description: text })}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: tokens.border }]}
                onPress={() => {
                  setShowModal(false);
                  setEditingActivity(null);
                  setFormData({ name: '', startDate: '', endDate: '', hoursPerWeek: '', description: '' });
                }}
              >
                <Text style={[styles.cancelButtonText, { color: tokens.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: tokens.accent }]}
                onPress={saveActivity}
              >
                <Save size={16} color={tokens.surface} />
                <Text style={[styles.saveButtonText, { color: tokens.surface }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  loading: {
    textAlign: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    textAlign: 'center',
    padding: spacing.xl,
  },
  list: {
    flex: 1,
  },
  activityCard: {
    marginBottom: spacing.md,
  },
  activityContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  activityInfo: {
    flex: 1,
  },
  activityName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  activityMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: 13,
  },
  activityDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  activityActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    padding: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '80%',
    borderRadius: radius.lg,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  modalBody: {
    flex: 1,
    padding: spacing.lg,
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  formRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
