import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Modal, TextInput, Alert } from 'react-native';
import { Plus, Calendar, Clock, MapPin, X, Save, Edit, Trash2 } from 'lucide-react';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../../theme/pastelDesignTokens';
import { designTokens } from '../../theme/designTokens';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import GeistCard from '../GeistCard';

export default function VolunteerHours({ childId, familyId }) {
  const { mode } = useSensoryMode();
  const { user } = useAuth();
  const tokens = getModeTokens(mode);
  const [entries, setEntries] = useState([]);
  const [totalHours, setTotalHours] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [formData, setFormData] = useState({
    organization: '',
    date: '',
    hours: '',
    location: '',
    description: '',
  });

  useEffect(() => {
    loadVolunteerHours();
  }, [childId]);

  const loadVolunteerHours = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('college_readiness')
        .select('readiness_data')
        .eq('child_id', childId)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.warn('Error loading volunteer hours:', error);
      }
      
      const volunteerHours = data?.readiness_data?.extracurriculars?.volunteer_hours || 0;
      const entriesList = data?.readiness_data?.extracurriculars?.volunteer_entries || [];
      
      setTotalHours(volunteerHours);
      setEntries(Array.isArray(entriesList) ? entriesList : []);
    } catch (error) {
      console.error('Error loading volunteer hours:', error);
      setEntries([]);
      setTotalHours(0);
    } finally {
      setLoading(false);
    }
  };

  const saveEntry = async () => {
    if (!formData.organization.trim() || !formData.date || !formData.hours) {
      Alert.alert('Error', 'Please fill in organization, date, and hours');
      return;
    }

    try {
      const hours = parseFloat(formData.hours);
      if (isNaN(hours) || hours <= 0) {
        Alert.alert('Error', 'Please enter a valid number of hours');
        return;
      }

      const entryData = {
        id: editingEntry?.id || `entry-${Date.now()}`,
        organization: formData.organization.trim(),
        date: formData.date,
        hours: hours,
        location: formData.location.trim() || null,
        description: formData.description.trim() || null,
      };

      const { data: existing } = await supabase
        .from('college_readiness')
        .select('readiness_data')
        .eq('child_id', childId)
        .single();

      const readinessData = existing?.readiness_data || {};
      const extracurriculars = readinessData.extracurriculars || {};
      const entriesList = Array.isArray(extracurriculars.volunteer_entries) 
        ? [...extracurriculars.volunteer_entries] 
        : [];

      if (editingEntry) {
        const index = entriesList.findIndex(e => e.id === editingEntry.id);
        if (index >= 0) {
          entriesList[index] = entryData;
        }
      } else {
        entriesList.push(entryData);
      }

      // Calculate total hours
      const newTotal = entriesList.reduce((sum, e) => sum + (e.hours || 0), 0);

      const updatedData = {
        ...readinessData,
        extracurriculars: {
          ...extracurriculars,
          volunteer_hours: newTotal,
          volunteer_entries: entriesList,
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

      await loadVolunteerHours();
      setShowModal(false);
      setEditingEntry(null);
      setFormData({ organization: '', date: '', hours: '', location: '', description: '' });
    } catch (error) {
      console.error('Error saving volunteer entry:', error);
      Alert.alert('Error', 'Failed to save volunteer entry. Please try again.');
    }
  };

  const deleteEntry = async (entryId) => {
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this volunteer entry?',
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
              const entriesList = Array.isArray(extracurriculars.volunteer_entries) 
                ? extracurriculars.volunteer_entries.filter(e => e.id !== entryId)
                : [];

              const newTotal = entriesList.reduce((sum, e) => sum + (e.hours || 0), 0);

              const updatedData = {
                ...readinessData,
                extracurriculars: {
                  ...extracurriculars,
                  volunteer_hours: newTotal,
                  volunteer_entries: entriesList,
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

              await loadVolunteerHours();
            } catch (error) {
              console.error('Error deleting entry:', error);
              Alert.alert('Error', 'Failed to delete entry.');
            }
          },
        },
      ]
    );
  };

  const openEditModal = (entry) => {
    setEditingEntry(entry);
    setFormData({
      organization: entry.organization || '',
      date: entry.date || '',
      hours: entry.hours?.toString() || '',
      location: entry.location || '',
      description: entry.description || '',
    });
    setShowModal(true);
  };

  const openAddModal = () => {
    setEditingEntry(null);
    const today = new Date().toISOString().split('T')[0];
    setFormData({ organization: '', date: today, hours: '', location: '', description: '' });
    setShowModal(true);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateString;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: tokens.text }]}>Volunteer Hours</Text>
          <Text style={[styles.subtitle, { color: tokens.textSecondary }]}>
            Track community service and volunteer work
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: tokens.accent }]}
          onPress={openAddModal}
        >
          <Plus size={16} color={tokens.surface} />
          <Text style={[styles.addButtonText, { color: tokens.surface }]}>Add Entry</Text>
        </TouchableOpacity>
      </View>

      {/* Total Hours Summary */}
      <GeistCard variant="medium" style={styles.summaryCard}>
        <View style={styles.summary}>
          <Clock size={32} color={tokens.accent} />
          <View style={styles.summaryInfo}>
            <Text style={[styles.totalLabel, { color: tokens.textSecondary }]}>Total Hours</Text>
            <Text style={[styles.totalValue, { color: tokens.text }]}>{totalHours.toFixed(1)}</Text>
          </View>
        </View>
      </GeistCard>

      {loading ? (
        <Text style={[styles.loading, { color: tokens.textSecondary }]}>Loading...</Text>
      ) : entries.length === 0 ? (
        <GeistCard variant="small">
          <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>
            No volunteer hours recorded yet. Click "Add Entry" to get started.
          </Text>
        </GeistCard>
      ) : (
        <GeistCard variant="medium" style={styles.tableCard}>
          {/* Table Header */}
          <View style={[styles.tableHeader, { borderBottomColor: tokens.border }]}>
            <Text style={[styles.tableHeaderText, { color: tokens.text, flex: 2 }]}>Organization</Text>
            <Text style={[styles.tableHeaderText, { color: tokens.text, flex: 1.5 }]}>Date</Text>
            <Text style={[styles.tableHeaderText, { color: tokens.text, flex: 1 }]}>Hours</Text>
            <Text style={[styles.tableHeaderText, { color: tokens.text, flex: 1.5 }]}>Location</Text>
            <Text style={[styles.tableHeaderText, { color: tokens.text, flex: 1 }]}>Actions</Text>
          </View>

          {/* Table Rows */}
          <ScrollView style={styles.tableBody}>
            {entries.map((entry, idx) => (
              <View 
                key={entry.id || idx} 
                style={[
                  styles.tableRow, 
                  { borderBottomColor: tokens.border },
                  idx === entries.length - 1 && styles.tableRowLast
                ]}
              >
                <Text style={[styles.tableCell, { color: tokens.text, flex: 2 }]}>
                  {entry.organization}
                </Text>
                <Text style={[styles.tableCell, { color: tokens.textSecondary, flex: 1.5 }]}>
                  {formatDate(entry.date)}
                </Text>
                <Text style={[styles.tableCell, { color: tokens.text, flex: 1, fontWeight: '600' }]}>
                  {entry.hours?.toFixed(1) || '0'}
                </Text>
                <Text style={[styles.tableCell, { color: tokens.textSecondary, flex: 1.5 }]}>
                  {entry.location || '-'}
                </Text>
                <View style={[styles.tableCell, { flex: 1, flexDirection: 'row', gap: spacing.xs }]}>
                  <TouchableOpacity onPress={() => openEditModal(entry)}>
                    <Edit size={16} color={tokens.iconMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteEntry(entry.id)}>
                    <Trash2 size={16} color={tokens.iconMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </GeistCard>
      )}

      {/* Add/Edit Modal */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowModal(false);
          setEditingEntry(null);
          setFormData({ organization: '', date: '', hours: '', location: '', description: '' });
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: tokens.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: tokens.text }]}>
                {editingEntry ? 'Edit Volunteer Entry' : 'Add Volunteer Entry'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowModal(false);
                  setEditingEntry(null);
                  setFormData({ organization: '', date: '', hours: '', location: '', description: '' });
                }}
              >
                <X size={20} color={tokens.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>Organization *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                  placeholder="e.g., Local Food Bank, Animal Shelter"
                  value={formData.organization}
                  onChangeText={(text) => setFormData({ ...formData, organization: text })}
                />
              </View>

              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: tokens.text }]}>Date *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                    placeholder="YYYY-MM-DD"
                    value={formData.date}
                    onChangeText={(text) => setFormData({ ...formData, date: text })}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: tokens.text }]}>Hours *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                    placeholder="e.g., 2.5"
                    keyboardType="numeric"
                    value={formData.hours}
                    onChangeText={(text) => setFormData({ ...formData, hours: text })}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>Location</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                  placeholder="e.g., Community Center, Online"
                  value={formData.location}
                  onChangeText={(text) => setFormData({ ...formData, location: text })}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>Description</Text>
                <TextInput
                  style={[styles.textArea, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                  placeholder="What did you do? What did you learn?"
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
                  setEditingEntry(null);
                  setFormData({ organization: '', date: '', hours: '', location: '', description: '' });
                }}
              >
                <Text style={[styles.cancelButtonText, { color: tokens.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: tokens.accent }]}
                onPress={saveEntry}
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
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: designTokens.fonts.display,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: designTokens.fonts.sans,
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
    fontFamily: designTokens.fonts.sans,
  },
  summaryCard: {
    marginBottom: spacing.md,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryInfo: {
    flex: 1,
  },
  totalLabel: {
    fontSize: 14,
    fontFamily: designTokens.fonts.sans,
    marginBottom: spacing.xs,
  },
  totalValue: {
    fontSize: 32,
    fontWeight: '700',
    fontFamily: designTokens.fonts.display,
  },
  loading: {
    textAlign: 'center',
    padding: spacing.xl,
    fontFamily: designTokens.fonts.sans,
  },
  emptyText: {
    textAlign: 'center',
    padding: spacing.xl,
    fontFamily: designTokens.fonts.sans,
  },
  tableCard: {
    padding: 0,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    padding: spacing.md,
    borderBottomWidth: 2,
    backgroundColor: '#F9FAFB',
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: designTokens.fonts.sans,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableBody: {
    maxHeight: 400,
  },
  tableRow: {
    flexDirection: 'row',
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableCell: {
    fontSize: 14,
    fontFamily: designTokens.fonts.sans,
    paddingRight: spacing.sm,
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
    fontFamily: designTokens.fonts.display,
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
    fontFamily: designTokens.fonts.sans,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    fontFamily: designTokens.fonts.sans,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    fontFamily: designTokens.fonts.sans,
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
    fontFamily: designTokens.fonts.sans,
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
    fontFamily: designTokens.fonts.sans,
  },
});
