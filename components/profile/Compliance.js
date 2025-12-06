import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, Platform } from 'react-native';
import { Shield, CheckCircle2, XCircle, Clock, Edit, Plus, Save, X } from 'lucide-react';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../../theme/pastelDesignTokens';
import { supabase } from '../../lib/supabase';
import GeistCard from '../GeistCard';

const STATUS_COLORS = {
  completed: '#10B981',
  in_progress: '#3B82F6',
  pending: '#F59E0B',
  not_applicable: '#6B7280',
};

export default function Compliance({ childId, familyId }) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState(null);
  const [formData, setFormData] = useState({
    status: 'pending',
    notes: '',
  });

  useEffect(() => {
    loadCompliance();
  }, [childId]);

  const loadCompliance = async () => {
    try {
      setLoading(true);
      // Load compliance checklist for this child
      const { data, error } = await supabase
        .from('family_compliance_checklist')
        .select(`
          *,
          requirement:requirement_id (id, title, description, requirement_type)
        `)
        .eq('child_id', childId)
        .order('created_at', { ascending: false });

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      setRequirements(data || []);
    } catch (error) {
      console.error('Error loading compliance:', error);
      setRequirements([]);
    } finally {
      setLoading(false);
    }
  };

  const updateRequirement = async () => {
    if (!editingRequirement) return;

    try {
      const { error } = await supabase
        .from('family_compliance_checklist')
        .update({
          status: formData.status,
          notes: formData.notes.trim() || null,
          updated_at: new Date().toISOString(),
          completed_at: formData.status === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', editingRequirement.id);

      if (error) throw error;

      await loadCompliance();
      setShowModal(false);
      setEditingRequirement(null);
      setFormData({ status: 'pending', notes: '' });
    } catch (error) {
      console.error('Error updating requirement:', error);
      Alert.alert('Error', 'Failed to update requirement.');
    }
  };

  const openEditModal = (requirement) => {
    setEditingRequirement(requirement);
    setFormData({
      status: requirement.status || 'pending',
      notes: requirement.notes || '',
    });
    setShowModal(true);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 size={20} color={STATUS_COLORS.completed} />;
      case 'in_progress':
        return <Clock size={20} color={STATUS_COLORS.in_progress} />;
      case 'not_applicable':
        return <XCircle size={20} color={STATUS_COLORS.not_applicable} />;
      default:
        return <Clock size={20} color={STATUS_COLORS.pending} />;
    }
  };

  const getStatusCounts = () => {
    return {
      completed: requirements.filter(r => r.status === 'completed').length,
      in_progress: requirements.filter(r => r.status === 'in_progress').length,
      pending: requirements.filter(r => r.status === 'pending').length,
      not_applicable: requirements.filter(r => r.status === 'not_applicable').length,
      total: requirements.length,
    };
  };

  const counts = getStatusCounts();
  const completionRate = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: tokens.text }]}>Compliance</Text>
          <Text style={[styles.subtitle, { color: tokens.textSecondary }]}>
            Track state requirements and compliance status
          </Text>
        </View>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryGrid}>
        <GeistCard variant="small" style={styles.summaryCard}>
          <View style={styles.summaryContent}>
            <Shield size={24} color={tokens.accent} />
            <View style={styles.summaryInfo}>
              <Text style={[styles.summaryValue, { color: tokens.text }]}>
                {completionRate}%
              </Text>
              <Text style={[styles.summaryLabel, { color: tokens.textSecondary }]}>Complete</Text>
            </View>
          </View>
        </GeistCard>

        <GeistCard variant="small" style={styles.summaryCard}>
          <View style={styles.summaryContent}>
            <CheckCircle2 size={24} color={STATUS_COLORS.completed} />
            <View style={styles.summaryInfo}>
              <Text style={[styles.summaryValue, { color: tokens.text }]}>
                {counts.completed}
              </Text>
              <Text style={[styles.summaryLabel, { color: tokens.textSecondary }]}>Completed</Text>
            </View>
          </View>
        </GeistCard>

        <GeistCard variant="small" style={styles.summaryCard}>
          <View style={styles.summaryContent}>
            <Clock size={24} color={STATUS_COLORS.in_progress} />
            <View style={styles.summaryInfo}>
              <Text style={[styles.summaryValue, { color: tokens.text }]}>
                {counts.in_progress}
              </Text>
              <Text style={[styles.summaryLabel, { color: tokens.textSecondary }]}>In Progress</Text>
            </View>
          </View>
        </GeistCard>

        <GeistCard variant="small" style={styles.summaryCard}>
          <View style={styles.summaryContent}>
            <Clock size={24} color={STATUS_COLORS.pending} />
            <View style={styles.summaryInfo}>
              <Text style={[styles.summaryValue, { color: tokens.text }]}>
                {counts.pending}
              </Text>
              <Text style={[styles.summaryLabel, { color: tokens.textSecondary }]}>Pending</Text>
            </View>
          </View>
        </GeistCard>
      </View>

      {/* Requirements List */}
      {loading ? (
        <Text style={[styles.loading, { color: tokens.textSecondary }]}>Loading compliance data...</Text>
      ) : requirements.length === 0 ? (
        <GeistCard variant="medium">
          <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>
            No compliance requirements found. Requirements will appear here when state requirements are configured.
          </Text>
        </GeistCard>
      ) : (
        <ScrollView style={styles.requirementsList}>
          {requirements.map((req) => (
            <GeistCard key={req.id} variant="medium" hoverable style={styles.requirementCard}>
              <View style={styles.requirementContent}>
                <View style={styles.requirementHeader}>
                  {getStatusIcon(req.status)}
                  <View style={styles.requirementInfo}>
                    <Text style={[styles.requirementTitle, { color: tokens.text }]}>
                      {req.requirement?.title || 'Compliance Requirement'}
                    </Text>
                    {req.requirement?.description && (
                      <Text style={[styles.requirementDescription, { color: tokens.textSecondary }]}>
                        {req.requirement.description}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => openEditModal(req)}>
                    <Edit size={16} color={tokens.iconMuted} />
                  </TouchableOpacity>
                </View>

                <View style={styles.requirementMeta}>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: STATUS_COLORS[req.status] + '20' }
                  ]}>
                    <Text style={[
                      styles.statusText,
                      { color: STATUS_COLORS[req.status] }
                    ]}>
                      {req.status.replace('_', ' ').toUpperCase()}
                    </Text>
                  </View>
                  {req.completed_at && (
                    <Text style={[styles.completedDate, { color: tokens.textSecondary }]}>
                      Completed: {new Date(req.completed_at).toLocaleDateString()}
                    </Text>
                  )}
                </View>

                {req.notes && (
                  <View style={styles.notesContainer}>
                    <Text style={[styles.notesLabel, { color: tokens.textSecondary }]}>Notes:</Text>
                    <Text style={[styles.notesText, { color: tokens.text }]}>{req.notes}</Text>
                  </View>
                )}
              </View>
            </GeistCard>
          ))}
        </ScrollView>
      )}

      {/* Edit Modal */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowModal(false);
          setEditingRequirement(null);
          setFormData({ status: 'pending', notes: '' });
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: tokens.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: tokens.text }]}>
                Update Compliance Status
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowModal(false);
                  setEditingRequirement(null);
                  setFormData({ status: 'pending', notes: '' });
                }}
              >
                <X size={20} color={tokens.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {editingRequirement && (
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: tokens.text }]}>Requirement</Text>
                  <Text style={[styles.readonlyText, { color: tokens.text }]}>
                    {editingRequirement.requirement?.title || 'Compliance Requirement'}
                  </Text>
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>Status *</Text>
                <View style={styles.statusButtons}>
                  {['pending', 'in_progress', 'completed', 'not_applicable'].map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.statusButton,
                        {
                          backgroundColor: formData.status === status ? STATUS_COLORS[status] : tokens.bg,
                          borderColor: tokens.border,
                        }
                      ]}
                      onPress={() => setFormData({ ...formData, status })}
                    >
                      <Text style={[
                        styles.statusButtonText,
                        { color: formData.status === status ? '#FFFFFF' : tokens.text }
                      ]}>
                        {status.replace('_', ' ').toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>Notes</Text>
                <TextInput
                  style={[styles.textArea, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                  placeholder="Add notes about this requirement..."
                  multiline
                  numberOfLines={4}
                  value={formData.notes}
                  onChangeText={(text) => setFormData({ ...formData, notes: text })}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: tokens.border }]}
                onPress={() => {
                  setShowModal(false);
                  setEditingRequirement(null);
                  setFormData({ status: 'pending', notes: '' });
                }}
              >
                <Text style={[styles.cancelButtonText, { color: tokens.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: tokens.accent }]}
                onPress={updateRequirement}
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
    gap: spacing.xs,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  summaryCard: {
    flex: 1,
    minWidth: 150,
  },
  summaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryInfo: {
    flex: 1,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 12,
  },
  loading: {
    textAlign: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    textAlign: 'center',
    padding: spacing.xl,
  },
  requirementsList: {
    flex: 1,
  },
  requirementCard: {
    marginBottom: spacing.md,
  },
  requirementContent: {
    gap: spacing.md,
  },
  requirementHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  requirementInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  requirementTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  requirementDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  requirementMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  completedDate: {
    fontSize: 12,
  },
  notesContainer: {
    marginTop: spacing.xs,
    padding: spacing.md,
    backgroundColor: '#F9FAFB',
    borderRadius: radius.md,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
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
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  readonlyText: {
    fontSize: 14,
    padding: spacing.md,
    backgroundColor: '#F9FAFB',
    borderRadius: radius.md,
  },
  statusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statusButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 120,
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
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
