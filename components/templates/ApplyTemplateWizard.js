import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { X, Calendar, Users, Play } from 'lucide-react';
import { colors } from '../../theme/colors';
import { applyTemplate } from '../../lib/services/templatesClient';
import { useToast } from '../Toast';
import { getWeekStart } from '../../lib/apiClient';

export default function ApplyTemplateWizard({ 
  isOpen, 
  onClose, 
  template, 
  children = [],
  familyId,
  onSuccess
}) {
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [startDate, setStartDate] = useState(() => {
    // Default to next Monday
    const today = new Date();
    const monday = getWeekStart(today);
    return monday.toISOString().split('T')[0];
  });
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  React.useEffect(() => {
    if (isOpen && children.length > 0) {
      // Pre-select first child
      setSelectedChildIds([children[0].id]);
    }
  }, [isOpen, children]);

  const handleSubmit = async () => {
    if (selectedChildIds.length === 0) {
      toast.push('Please select at least one child', 'error');
      return;
    }

    if (!startDate) {
      toast.push('Please select a start date', 'error');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await applyTemplate({
        templateId: template.id,
        childIds: selectedChildIds,
        startDate,
        familyId,
      });

      if (error) throw error;

      toast.push(`Template applied! ${data.events_created} events added to your planner.`, 'success');
      
      if (onSuccess) {
        onSuccess(data);
      }
      
      onClose();
    } catch (error) {
      toast.push('Failed to apply template', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleChild = (childId) => {
    if (selectedChildIds.includes(childId)) {
      setSelectedChildIds(selectedChildIds.filter(id => id !== childId));
    } else {
      setSelectedChildIds([...selectedChildIds, childId]);
    }
  };

  if (!isOpen || !template) return null;

  return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Play size={20} color={colors.accent} />
              <View style={styles.headerText}>
                <Text style={styles.title}>Apply Template</Text>
                <Text style={styles.subtitle}>{template.template_name}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* Who is this for? */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Users size={18} color={colors.accent} />
                <Text style={styles.sectionTitle}>Who is this for?</Text>
              </View>
              <View style={styles.chipContainer}>
                {children.map(child => (
                  <TouchableOpacity
                    key={child.id}
                    style={[
                      styles.chip,
                      selectedChildIds.includes(child.id) && styles.chipSelected
                    ]}
                    onPress={() => toggleChild(child.id)}
                  >
                    <Text style={[
                      styles.chipText,
                      selectedChildIds.includes(child.id) && styles.chipTextSelected
                    ]}>
                      {child.first_name || child.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* When should it start? */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Calendar size={18} color={colors.accent} />
                <Text style={styles.sectionTitle}>When should it start?</Text>
              </View>
              <Text style={styles.hint}>
                Events will be placed starting from this date, maintaining the same relative schedule.
              </Text>
              <View style={styles.dateInputContainer}>
                <Text style={styles.dateLabel}>Start Date</Text>
                {typeof window !== 'undefined' && window.document ? (
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={styles.dateInput}
                  />
                ) : (
                  <TextInput
                    style={styles.dateInput}
                    value={startDate}
                    onChangeText={setStartDate}
                    placeholder="YYYY-MM-DD"
                  />
                )}
              </View>
              <TouchableOpacity
                style={styles.quickDateButton}
                onPress={() => {
                  const monday = getWeekStart(new Date());
                  setStartDate(monday.toISOString().split('T')[0]);
                }}
              >
                <Text style={styles.quickDateText}>Start on next Monday</Text>
              </TouchableOpacity>
            </View>

            {/* Placement Mode */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Placement Mode</Text>
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  Simple copy: Events will be placed with the same relative offsets from the start date.
                </Text>
              </View>
            </View>

            {/* Template Summary */}
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>Template Summary</Text>
              <Text style={styles.summaryText}>
                {template.template_data?.events?.length || 0} events over {template.template_data?.duration_days || 0} days
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyButton, loading && styles.applyButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Play size={16} color="#ffffff" />
                  <Text style={styles.applyButtonText}>Apply Template</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
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
    padding: 20,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
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
  headerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
    maxHeight: 500,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  hint: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
    lineHeight: 18,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipSelected: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  chipText: {
    fontSize: 14,
    color: '#374151',
  },
  chipTextSelected: {
    color: '#1e40af',
    fontWeight: '600',
  },
  dateInputContainer: {
    marginBottom: 12,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  dateInput: {
    width: '100%',
    padding: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    fontSize: 14,
    color: '#111827',
  },
  quickDateButton: {
    paddingVertical: 8,
  },
  quickDateText: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '500',
  },
  infoBox: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  infoText: {
    fontSize: 13,
    color: '#0369a1',
    lineHeight: 18,
  },
  summaryBox: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 13,
    color: '#6b7280',
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
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  applyButtonDisabled: {
    opacity: 0.6,
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

