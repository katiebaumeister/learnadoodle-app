/**
 * Plan Week Modal
 * Constraint-aware plan based on individual progress or interest
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import { X, Calendar, ChevronDown, ChevronRight, Check, AlertCircle, Sparkles } from 'lucide-react';
import { colors } from '../../../theme/colors';
import { planWeek, applyPlanWeek } from '../../../lib/services/planWeekClient';

const FOCUS_OPTIONS = [
  { id: 'more_math', label: 'More math' },
  { id: 'more_reading', label: 'More reading' },
  { id: 'light_week', label: 'Light week' },
  { id: 'project_week', label: 'Project week' },
  { id: 'catch_up', label: 'Catch up' },
  { id: 'explore', label: 'Explore' },
];

export default function PlanWeekModal({
  visible,
  familyId,
  children = [],
  selectedChildIds = null,
  onClose,
  onComplete,
}) {
  const [step, setStep] = useState('input'); // 'input' | 'generating' | 'preview'
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [progressMessage, setProgressMessage] = useState('');

  // Input state
  const [selectedChildIdsState, setSelectedChildIdsState] = useState([]);
  const [weekStartDate, setWeekStartDate] = useState('');
  const [selectedFocuses, setSelectedFocuses] = useState([]);
  const [showChildDropdown, setShowChildDropdown] = useState(false);
  const [showFocusDropdown, setShowFocusDropdown] = useState(false);

  // Preview state
  const [planSummary, setPlanSummary] = useState(null);
  const [planPatch, setPlanPatch] = useState(null);
  const [planNotes, setPlanNotes] = useState([]);
  const [runId, setRunId] = useState(null);

  // Get current week's Monday
  const getCurrentWeekMonday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().split('T')[0];
  };

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setStep('input');
      const defaultChildIds = selectedChildIds || (children.length > 0 ? children.map(c => c.id) : []);
      setSelectedChildIdsState(defaultChildIds);
      setWeekStartDate(getCurrentWeekMonday());
      setSelectedFocuses([]);
      setPlanSummary(null);
      setPlanPatch(null);
      setPlanNotes([]);
      setRunId(null);
      setError(null);
      setLoading(false);
      setApplying(false);
      setProgressMessage('');
    }
  }, [visible, selectedChildIds, children]);

  const toggleChild = (childId) => {
    setSelectedChildIdsState(prev => {
      if (prev.includes(childId)) {
        return prev.filter(id => id !== childId);
      } else {
        return [...prev, childId];
      }
    });
  };

  const toggleFocus = (focusId) => {
    setSelectedFocuses(prev => {
      if (prev.includes(focusId)) {
        return prev.filter(id => id !== focusId);
      } else {
        return [...prev, focusId];
      }
    });
  };

  const selectAllChildren = () => {
    setSelectedChildIdsState(children.map(c => c.id));
  };

  const validateInput = () => {
    if (selectedChildIdsState.length === 0) {
      setError('Please select at least one child');
      return false;
    }
    if (!weekStartDate) {
      setError('Please select a week start date');
      return false;
    }
    return true;
  };

  const handleGenerate = async () => {
    if (!validateInput()) return;

    setStep('generating');
    setLoading(true);
    setError(null);
    setProgressMessage('Loading constraints and availability...');

    try {
      // Simulate progress updates
      const progressSteps = [
        'Loading constraints and availability...',
        'Analyzing curriculum sequences...',
        'Checking progress estimates...',
        'Generating plan proposal...',
        'Validating schedule...',
        'Resolving conflicts...',
      ];

      let progressIndex = 0;
      const progressInterval = setInterval(() => {
        if (progressIndex < progressSteps.length - 1) {
          progressIndex++;
          setProgressMessage(progressSteps[progressIndex]);
        }
      }, 1000);

      const payload = {
        family_id: familyId,
        week_start: weekStartDate,
        child_ids: selectedChildIdsState,
        options: {
          focus: selectedFocuses,
          intensity: 'normal',
          max_daily_minutes_per_child: 180,
          weekend_mode: 'light',
        },
      };

      const { data, error: apiError } = await planWeek(payload);

      clearInterval(progressInterval);

      if (apiError) {
        throw new Error(apiError.message || 'Failed to generate plan');
      }

      setPlanSummary(data.summary);
      setPlanPatch(data.patch);
      setPlanNotes(data.notes || []);
      setRunId(data.run_id || `plan_${Date.now()}`);
      setStep('preview');
      setProgressMessage('');
    } catch (err) {
      setError(err.message || 'Failed to generate plan');
      setStep('input');
      setProgressMessage('');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!planPatch || !runId) return;

    setApplying(true);
    setError(null);

    try {
      const { data, error: apiError } = await applyPlanWeek({
        family_id: familyId,
        run_id: runId,
        patch: planPatch,
      });

      if (apiError) {
        throw new Error(apiError.message || 'Failed to apply plan');
      }

      // Refresh calendar
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar'));
      }

      if (onComplete) {
        onComplete({
          applied: true,
          newItems: planSummary?.new_items || 0,
          movedItems: planSummary?.moved_items || 0,
        });
      }

      onClose();
    } catch (err) {
      setError(err.message || 'Failed to apply plan');
    } finally {
      setApplying(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View style={styles.iconCircle}>
                <Calendar size={20} color="#8B5CF6" />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>Plan the Week</Text>
                <Text style={styles.subtitle}>
                  {step === 'input' && 'Generate a constraint-aware weekly plan'}
                  {step === 'generating' && 'Generating your plan...'}
                  {step === 'preview' && 'Review your plan'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} disabled={applying}>
              <X size={20} color={applying ? colors.muted : colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {error && (
              <View style={styles.errorBox}>
                <AlertCircle size={16} color="#E2556A" />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => setError(null)} style={styles.errorDismiss}>
                  <X size={14} color="#E2556A" />
                </TouchableOpacity>
              </View>
            )}

            {/* Input Step */}
            {step === 'input' && (
              <View style={styles.stepContent}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Children</Text>
                  <View style={styles.childSelector}>
                    <TouchableOpacity
                      style={styles.selectAllButton}
                      onPress={selectAllChildren}
                    >
                      <Text style={styles.selectAllText}>Select all</Text>
                    </TouchableOpacity>
                    {children.map((child) => {
                      const isSelected = selectedChildIdsState.includes(child.id);
                      return (
                        <TouchableOpacity
                          key={child.id}
                          style={[styles.childChip, isSelected && styles.childChipSelected]}
                          onPress={() => toggleChild(child.id)}
                        >
                          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                            {isSelected && <Check size={12} color="#FFFFFF" />}
                          </View>
                          <Text style={[styles.childChipText, isSelected && styles.childChipTextSelected]}>
                            {child.first_name || child.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Week start date</Text>
                  <TextInput
                    style={styles.dateInput}
                    value={weekStartDate}
                    onChangeText={setWeekStartDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.muted}
                  />
                  <Text style={styles.dateHint}>
                    {weekStartDate ? formatDate(weekStartDate) : 'Select Monday of the week to plan'}
                  </Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Focus (optional)</Text>
                  <Text style={styles.fieldHint}>Select focus areas for this week</Text>
                  <View style={styles.focusChips}>
                    {FOCUS_OPTIONS.map((focus) => {
                      const isSelected = selectedFocuses.includes(focus.id);
                      return (
                        <TouchableOpacity
                          key={focus.id}
                          style={[styles.focusChip, isSelected && styles.focusChipSelected]}
                          onPress={() => toggleFocus(focus.id)}
                        >
                          <Text style={[styles.focusChipText, isSelected && styles.focusChipTextSelected]}>
                            {focus.label}
                          </Text>
                          {isSelected && <Check size={14} color={colors.accent} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            )}

            {/* Generating Step */}
            {step === 'generating' && (
              <View style={styles.generatingContent}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.progressText}>{progressMessage || 'Generating your plan...'}</Text>
                <Text style={styles.progressHint}>This may take a moment</Text>
              </View>
            )}

            {/* Preview Step */}
            {step === 'preview' && planSummary && (
              <View style={styles.stepContent}>
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryTitle}>Plan Summary</Text>
                  <View style={styles.summaryStats}>
                    <View style={styles.summaryStat}>
                      <Text style={styles.summaryValue}>{planSummary.new_items || 0}</Text>
                      <Text style={styles.summaryLabel}>New items</Text>
                    </View>
                    <View style={styles.summaryStat}>
                      <Text style={styles.summaryValue}>{planSummary.moved_items || 0}</Text>
                      <Text style={styles.summaryLabel}>Moved</Text>
                    </View>
                    <View style={styles.summaryStat}>
                      <Text style={styles.summaryValue}>{planSummary.conflicts_resolved || 0}</Text>
                      <Text style={styles.summaryLabel}>Conflicts resolved</Text>
                    </View>
                  </View>
                </View>

                {planPatch?.create && planPatch.create.length > 0 && (
                  <View style={styles.previewSection}>
                    <Text style={styles.previewSectionTitle}>New items ({planPatch.create.length})</Text>
                    <ScrollView style={styles.previewList} nestedScrollEnabled>
                      {planPatch.create.slice(0, 10).map((item, index) => (
                        <View key={index} style={styles.previewItem}>
                          <View style={styles.previewItemContent}>
                            <Text style={styles.previewItemTitle}>{item.title}</Text>
                            <Text style={styles.previewItemDetails}>
                              {formatDate(item.start?.split('T')[0])} {formatTime(item.start)} - {formatTime(item.end)}
                            </Text>
                            {item.rationale && (
                              <Text style={styles.previewItemRationale}>{item.rationale}</Text>
                            )}
                          </View>
                        </View>
                      ))}
                      {planPatch.create.length > 10 && (
                        <Text style={styles.moreItemsText}>
                          +{planPatch.create.length - 10} more items
                        </Text>
                      )}
                    </ScrollView>
                  </View>
                )}

                {planPatch?.move && planPatch.move.length > 0 && (
                  <View style={styles.previewSection}>
                    <Text style={styles.previewSectionTitle}>Moved items ({planPatch.move.length})</Text>
                    {planPatch.move.slice(0, 5).map((item, index) => (
                      <View key={index} style={styles.previewItem}>
                        <View style={styles.previewItemContent}>
                          <Text style={styles.previewItemTitle}>{item.title}</Text>
                          <Text style={styles.previewItemDetails}>
                            {formatTime(item.old_start)} → {formatTime(item.new_start)}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {planNotes && planNotes.length > 0 && (
                  <View style={styles.notesSection}>
                    <Text style={styles.notesTitle}>Notes</Text>
                    {planNotes.map((note, index) => {
                      const child = children.find(c => c.id === note.child_id);
                      return (
                        <View key={index} style={styles.noteItem}>
                          <Text style={styles.noteText}>
                            {child ? `${child.first_name || child.name}: ` : ''}{note.message}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={applying}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            {step === 'input' && (
              <TouchableOpacity
                style={[styles.generateButton, (loading || selectedChildIdsState.length === 0) && styles.generateButtonDisabled]}
                onPress={handleGenerate}
                disabled={loading || selectedChildIdsState.length === 0}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Sparkles size={16} color="#FFFFFF" />
                    <Text style={styles.generateButtonText}>Generate</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {step === 'preview' && (
              <TouchableOpacity
                style={[styles.applyButton, (applying || !planPatch) && styles.applyButtonDisabled]}
                onPress={handleApply}
                disabled={applying || !planPatch}
              >
                {applying ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Check size={16} color="#FFFFFF" />
                    <Text style={styles.applyButtonText}>Apply Plan</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
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
    width: '100%',
    maxWidth: 700,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F3FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#E2556A',
  },
  errorDismiss: {
    padding: 4,
  },
  stepContent: {
    gap: 24,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  fieldHint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: -4,
  },
  childSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectAllText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '500',
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  childChipSelected: {
    backgroundColor: '#F5F3FF',
    borderColor: colors.accent,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  childChipText: {
    fontSize: 14,
    color: colors.text,
  },
  childChipTextSelected: {
    color: colors.accent,
    fontWeight: '500',
  },
  dateInput: {
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 14,
    color: colors.text,
  },
  dateHint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  focusChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  focusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  focusChipSelected: {
    backgroundColor: '#F5F3FF',
    borderColor: colors.accent,
  },
  focusChipText: {
    fontSize: 14,
    color: colors.text,
  },
  focusChipTextSelected: {
    color: colors.accent,
    fontWeight: '500',
  },
  generatingContent: {
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'center',
  },
  progressHint: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  summaryBox: {
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 8,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryStat: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.accent,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  previewSection: {
    marginBottom: 16,
  },
  previewSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  previewList: {
    maxHeight: 300,
  },
  previewItem: {
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
  },
  previewItemContent: {
    flex: 1,
  },
  previewItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  previewItemDetails: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  previewItemRationale: {
    fontSize: 12,
    color: colors.muted,
    fontStyle: 'italic',
  },
  moreItemsText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    padding: 8,
  },
  notesSection: {
    marginTop: 8,
  },
  notesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  noteItem: {
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    marginBottom: 8,
  },
  noteText: {
    fontSize: 13,
    color: colors.text,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelButtonText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  generateButtonDisabled: {
    opacity: 0.5,
  },
  generateButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  applyButtonDisabled: {
    opacity: 0.5,
  },
  applyButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});





