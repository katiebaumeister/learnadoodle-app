import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, ActivityIndicator, Alert } from 'react-native';
import { X, Check, Clock, Calendar, AlertCircle } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

export default function BulkRescheduleModal({
  visible,
  onClose,
  familyId,
  weekStart,
  weekEnd,
  childIds = [],
  onApplied,
}) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [applying, setApplying] = useState(false);
  const [scope, setScope] = useState('this-week'); // 'today', 'this-afternoon', 'this-week'
  const [maxMoves, setMaxMoves] = useState(10);
  const [keepSameDay, setKeepSameDay] = useState(false);

  useEffect(() => {
    if (visible) {
      setPreview(null);
      setScope('this-week');
      setMaxMoves(10);
      setKeepSameDay(false);
    }
  }, [visible]);

  const getScopeDates = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (scope) {
      case 'today':
        return {
          from: new Date(today),
          to: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        };
      case 'this-afternoon':
        const afternoon = new Date(today);
        afternoon.setHours(12, 0, 0, 0);
        return {
          from: afternoon,
          to: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        };
      case 'this-week':
      default:
        return {
          from: weekStart || today,
          to: weekEnd || new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
        };
    }
  };

  const handlePreview = async () => {
    if (!familyId) {
      Alert.alert('Error', 'Family ID is required');
      return;
    }

    setLoading(true);
    try {
      const dates = getScopeDates();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Error', 'Please sign in to continue');
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE}/api/schedule/reschedule_preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          family_id: familyId,
          from_ts: dates.from.toISOString(),
          to_ts: dates.to.toISOString(),
          child_ids: childIds.length > 0 ? childIds : null,
          max_moves,
          increment_minutes: 15,
          keep_same_day: keepSameDay,
          minimize_disruption: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to preview reschedule');
      }

      const data = await response.json();
      setPreview(data);
    } catch (error) {
      console.error('Preview error:', error);
      Alert.alert('Error', error.message || 'Failed to preview reschedule');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview || !preview.moves || preview.moves.length === 0) {
      Alert.alert('Error', 'No moves to apply');
      return;
    }

    setApplying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Error', 'Please sign in to continue');
        setApplying(false);
        return;
      }

      const response = await fetch(`${API_BASE}/api/schedule/reschedule_apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          family_id: familyId,
          moves: preview.moves,
          action_type: 'bulk_reschedule',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to apply reschedule');
      }

      const data = await response.json();
      Alert.alert('Success', `Applied ${data.applied} of ${preview.moves.length} moves`);
      
      if (onApplied) {
        onApplied();
      }
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar'));
      }
      
      onClose();
    } catch (error) {
      console.error('Apply error:', error);
      Alert.alert('Error', error.message || 'Failed to apply reschedule');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Reschedule Events</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* Scope Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Scope</Text>
              <View style={styles.chipRow}>
                {[
                  { key: 'today', label: 'Today' },
                  { key: 'this-afternoon', label: 'This Afternoon' },
                  { key: 'this-week', label: 'This Week' },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    onPress={() => setScope(option.key)}
                    style={[
                      styles.chip,
                      scope === option.key && styles.chipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        scope === option.key && styles.chipTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Options */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Options</Text>
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>Max Moves:</Text>
                <View style={styles.numberInput}>
                  <TouchableOpacity
                    onPress={() => setMaxMoves(Math.max(1, maxMoves - 1))}
                    style={styles.numberButton}
                  >
                    <Text style={styles.numberButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.numberValue}>{maxMoves}</Text>
                  <TouchableOpacity
                    onPress={() => setMaxMoves(Math.min(20, maxMoves + 1))}
                    style={styles.numberButton}
                  >
                    <Text style={styles.numberButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setKeepSameDay(!keepSameDay)}
                style={styles.checkboxRow}
              >
                <View style={[styles.checkbox, keepSameDay && styles.checkboxChecked]}>
                  {keepSameDay && <Check size={16} color={colors.white} />}
                </View>
                <Text style={styles.checkboxLabel}>Keep same day</Text>
              </TouchableOpacity>
            </View>

            {/* Preview Button */}
            <TouchableOpacity
              onPress={handlePreview}
              disabled={loading}
              style={[styles.button, styles.previewButton, loading && styles.buttonDisabled]}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Calendar size={16} color={colors.white} />
                  <Text style={styles.buttonText}>Preview Changes</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Preview Results */}
            {preview && (
              <View style={styles.previewSection}>
                <Text style={styles.previewTitle}>Preview</Text>
                {preview.rationale && (
                  <Text style={styles.rationale}>{preview.rationale}</Text>
                )}
                
                {preview.moves && preview.moves.length > 0 && (
                  <View style={styles.movesList}>
                    <Text style={styles.movesHeader}>
                      {preview.moves.length} Move{preview.moves.length !== 1 ? 's' : ''}
                    </Text>
                    {preview.moves.slice(0, 10).map((move, idx) => (
                      <View key={idx} style={styles.moveItem}>
                        <View style={styles.moveTime}>
                          <Clock size={14} color={colors.textSecondary} />
                          <Text style={styles.moveTimeText}>
                            {format(new Date(move.from_start), 'h:mm a')} → {format(new Date(move.to_start), 'h:mm a')}
                          </Text>
                        </View>
                        {move.explanation && (
                          <Text style={styles.moveExplanation}>{move.explanation}</Text>
                        )}
                      </View>
                    ))}
                    {preview.moves.length > 10 && (
                      <Text style={styles.moreText}>+{preview.moves.length - 10} more</Text>
                    )}
                  </View>
                )}

                {preview.skipped && preview.skipped.length > 0 && (
                  <View style={styles.skippedList}>
                    <Text style={styles.skippedHeader}>
                      {preview.skipped.length} Skipped
                    </Text>
                    {preview.skipped.slice(0, 5).map((skip, idx) => (
                      <View key={idx} style={styles.skippedItem}>
                        <AlertCircle size={14} color={colors.warning} />
                        <Text style={styles.skippedText}>{skip.reason}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  onPress={handleApply}
                  disabled={applying || !preview.moves || preview.moves.length === 0}
                  style={[
                    styles.button,
                    styles.applyButton,
                    (applying || !preview.moves || preview.moves.length === 0) && styles.buttonDisabled,
                  ]}
                >
                  {applying ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <>
                      <Check size={16} color={colors.white} />
                      <Text style={styles.buttonText}>
                        Apply {preview.moves?.length || 0} Move{preview.moves?.length !== 1 ? 's' : ''}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
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
  modal: {
    width: '90%',
    maxWidth: 600,
    maxHeight: '80%',
    backgroundColor: colors.white,
    borderRadius: 16,
    ...shadows.large,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  optionLabel: {
    fontSize: 14,
    color: colors.text,
  },
  numberInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  numberButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bgSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  numberValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    minWidth: 40,
    textAlign: 'center',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkboxLabel: {
    fontSize: 14,
    color: colors.text,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 16,
  },
  previewButton: {
    backgroundColor: colors.accent,
  },
  applyButton: {
    backgroundColor: colors.success,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  previewSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  rationale: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  movesList: {
    marginBottom: 16,
  },
  movesHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  moveItem: {
    padding: 12,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    marginBottom: 8,
  },
  moveTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  moveTimeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  moveExplanation: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 22,
  },
  moreText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  skippedList: {
    marginTop: 16,
  },
  skippedHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.warning,
    marginBottom: 8,
  },
  skippedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  skippedText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
