import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { X, Plus, ArrowRight, XCircle, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors, shadows } from '../../theme/colors';

export default function RescheduleReportModal({ 
  open, 
  onClose, 
  proposals = [],
  explanation = '',
  onApply
}) {
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    setApplying(true);
    try {
      await onApply?.();
      onClose();
    } catch (error) {
      console.error('Error applying proposals:', error);
      alert('Failed to apply changes');
    } finally {
      setApplying(false);
    }
  };

  const getOpIcon = (op) => {
    switch (op) {
      case 'create': return Plus;
      case 'move': return ArrowRight;
      case 'cancel': return XCircle;
      default: return Check;
    }
  };

  const getOpColor = (op) => {
    switch (op) {
      case 'create': return colors.greenBold;
      case 'move': return colors.blueBold;
      case 'cancel': return colors.redBold;
      default: return colors.text;
    }
  };

  const getOpLabel = (op) => {
    switch (op) {
      case 'create': return 'Create';
      case 'move': return 'Move';
      case 'cancel': return 'Cancel';
      default: return 'Update';
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit' 
    });
  };

  const createdCount = proposals.filter(p => p.op === 'create').length;
  const movedCount = proposals.filter(p => p.op === 'move').length;
  const canceledCount = proposals.filter(p => p.op === 'cancel').length;

  if (!open) return null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Reschedule Report</Text>
              <Text style={styles.subtitle}>
                {createdCount} created · {movedCount} moved · {canceledCount} canceled
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Explanation */}
          {explanation && (
            <View style={styles.explanation}>
              <Text style={styles.explanationText}>{explanation}</Text>
            </View>
          )}

          {/* Proposals List */}
          <ScrollView style={styles.list} showsVerticalScrollIndicator={true}>
            {proposals.map((proposal, index) => {
              const Icon = getOpIcon(proposal.op);
              const opColor = getOpColor(proposal.op);
              const opLabel = getOpLabel(proposal.op);

              return (
                <View key={index} style={styles.proposalCard}>
                  <View style={styles.proposalHeader}>
                    <View style={styles.proposalOp}>
                      <Icon size={16} color={opColor} />
                      <Text style={[styles.proposalOpText, { color: opColor }]}>
                        {opLabel}
                      </Text>
                    </View>
                  </View>

                  {proposal.op === 'create' && (
                    <View style={styles.proposalContent}>
                      <Text style={styles.proposalTitle}>
                        {proposal.title || 'New Event'}
                      </Text>
                      <Text style={styles.proposalTime}>
                        {formatTime(proposal.start_ts)} · {proposal.planned_minutes}m
                      </Text>
                    </View>
                  )}

                  {proposal.op === 'move' && (
                    <View style={styles.proposalContent}>
                      <Text style={styles.proposalTitle}>
                        Event #{proposal.event_id?.slice(0, 8)}
                      </Text>
                      <View style={styles.proposalMove}>
                        <Text style={styles.proposalTimeOld}>
                          {formatTime(proposal.old_start_ts)}
                        </Text>
                        <ArrowRight size={14} color={colors.muted} />
                        <Text style={styles.proposalTimeNew}>
                          {formatTime(proposal.new_start_ts)}
                        </Text>
                      </View>
                    </View>
                  )}

                  {proposal.op === 'cancel' && (
                    <View style={styles.proposalContent}>
                      <Text style={styles.proposalTitle}>
                        Event #{proposal.event_id?.slice(0, 8)}
                      </Text>
                      <Text style={styles.proposalReason}>
                        {proposal.reason || 'Canceled'}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.cancelButton}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleApply}
              style={[styles.applyButton, applying && styles.applyButtonDisabled]}
              disabled={applying}
              activeOpacity={0.7}
            >
              {applying ? (
                <ActivityIndicator size="small" color={colors.accentContrast} />
              ) : (
                <>
                  <Check size={16} color={colors.accentContrast} />
                  <Text style={styles.applyButtonText}>Apply {proposals.length} Changes</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '80%',
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    overflow: 'hidden',
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
  },
  closeButton: {
    padding: 4,
  },
  explanation: {
    padding: 16,
    backgroundColor: colors.blueSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  explanationText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  list: {
    flex: 1,
    padding: 16,
  },
  proposalCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  proposalHeader: {
    marginBottom: 8,
  },
  proposalOp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  proposalOpText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  proposalContent: {
    gap: 6,
  },
  proposalTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  proposalTime: {
    fontSize: 13,
    color: colors.muted,
  },
  proposalMove: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  proposalTimeOld: {
    fontSize: 13,
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  proposalTimeNew: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  proposalReason: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  cancelButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.accent,
  },
  applyButtonDisabled: {
    opacity: 0.6,
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accentContrast,
  },
});

