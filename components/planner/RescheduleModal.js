import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, ActivityIndicator, Alert, TextInput } from 'react-native';
import { X, Plus, ArrowRight, Trash2, Check, Clock, Calendar } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { approvePlan as approvePlanAPI } from '../../lib/apiClient';
import { formatDate } from '../../lib/apiClient';

export default function RescheduleModal({
  visible,
  onClose,
  planId,
  changes,
  summary,
  onApplied,
  open,
  plan,
}) {
  const effectiveVisible = typeof visible === 'boolean' ? visible : !!open;
  const resolvedPlanId = planId ?? plan?.planId ?? plan?.id ?? plan?.plan_id ?? null;
  const resolvedChanges = Array.isArray(changes) ? changes : Array.isArray(plan?.changes) ? plan.changes : [];
  const resolvedSummary = summary && Object.keys(summary).length > 0
    ? summary
    : plan?.summary || {
        adds: resolvedChanges.filter(c => c.change_type === 'add').length,
        moves: resolvedChanges.filter(c => c.change_type === 'move').length,
        deletes: resolvedChanges.filter(c => c.change_type === 'delete').length,
      };

  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'adds' | 'moves' | 'deletes'
  const [approvals, setApprovals] = useState({});
  const [edits, setEdits] = useState({});
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (effectiveVisible && resolvedChanges.length > 0) {
      // Initialize approvals - all true by default
      const initialApprovals = {};
      resolvedChanges.forEach(change => {
        initialApprovals[change.id] = true;
      });
      setApprovals(initialApprovals);
      setEdits({});
    } else if (!effectiveVisible) {
      setApprovals({});
      setEdits({});
    }
  }, [effectiveVisible, resolvedChanges]);

  const filteredChanges = React.useMemo(() => {
    if (activeTab === 'all') return resolvedChanges;
    // Map tab names (plural) to change_type values (singular)
    const typeMap = {
      'adds': 'add',
      'moves': 'move',
      'deletes': 'delete',
    };
    const changeType = typeMap[activeTab];
    return resolvedChanges.filter(c => c.change_type === changeType);
  }, [activeTab, resolvedChanges]);

  const handleToggleApproval = (changeId) => {
    setApprovals(prev => ({
      ...prev,
      [changeId]: !prev[changeId],
    }));
  };

  const handleEditTime = (changeId, field, value) => {
    setEdits(prev => ({
      ...prev,
      [changeId]: {
        ...prev[changeId],
        [field]: value,
      },
    }));
  };

  const handleApply = async () => {
    if (!resolvedPlanId) {
      Alert.alert('Error', 'Missing plan identifier. Please close and retry.');
      return;
    }

    const approvedChanges = Object.entries(approvals)
      .filter(([_, approved]) => approved)
      .map(([changeId, _]) => {
        const change = resolvedChanges.find(c => c.id === changeId);
        const edit = edits[changeId];
        return {
          changeId,
          approved: true,
          edits: edit ? {
            startTs: edit.startTs || change.payload.start,
            endTs: edit.endTs || change.payload.end,
            minutes: edit.minutes || change.payload.minutes,
          } : undefined,
        };
      });

    if (approvedChanges.length === 0) {
      Alert.alert('No Changes Selected', 'Please approve at least one change to apply');
      return;
    }

    setApplying(true);
    try {
      const { data, error } = await approvePlanAPI({
        planId: resolvedPlanId,
        approvals: approvedChanges,
      });

      if (error) throw error;

      Alert.alert(
        'Success',
        `Applied ${data.counts.adds} adds, ${data.counts.moves} moves, ${data.counts.deletes} deletes`
      );

      onApplied?.(data);
      onClose();
    } catch (err) {
      console.error('Error applying plan:', err);
      Alert.alert('Error', err.message || 'Failed to apply plan');
    } finally {
      setApplying(false);
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
      minute: '2-digit',
    });
  };

  const getChangeIcon = (type) => {
    switch (type) {
      case 'add': return Plus;
      case 'move': return ArrowRight;
      case 'delete': return Trash2;
      default: return Check;
    }
  };

  const getChangeColor = (type) => {
    switch (type) {
      case 'add': return colors.greenBold;
      case 'move': return colors.blueBold;
      case 'delete': return colors.redBold;
      default: return colors.text;
    }
  };

  const approvedCount = Object.values(approvals).filter(Boolean).length;
  const totalCount = resolvedChanges.length;

  if (!effectiveVisible) return null;

  return (
    <Modal
      visible={effectiveVisible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Review Reschedule Plan</Text>
              <Text style={styles.subtitle}>
                {resolvedSummary.adds || 0} adds · {resolvedSummary.moves || 0} moves · {resolvedSummary.deletes || 0} deletes
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'all' && styles.tabActive]}
              onPress={() => setActiveTab('all')}
            >
              <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
                All ({totalCount})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'adds' && styles.tabActive]}
              onPress={() => setActiveTab('adds')}
            >
              <Text style={[styles.tabText, activeTab === 'adds' && styles.tabTextActive]}>
                Adds ({summary.adds || 0})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'moves' && styles.tabActive]}
              onPress={() => setActiveTab('moves')}
            >
              <Text style={[styles.tabText, activeTab === 'moves' && styles.tabTextActive]}>
                Moves ({summary.moves || 0})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'deletes' && styles.tabActive]}
              onPress={() => setActiveTab('deletes')}
            >
              <Text style={[styles.tabText, activeTab === 'deletes' && styles.tabTextActive]}>
                Deletes ({summary.deletes || 0})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Changes List */}
          <ScrollView style={styles.list} showsVerticalScrollIndicator={true}>
            {filteredChanges.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No {activeTab === 'all' ? '' : activeTab} changes</Text>
              </View>
            ) : (
              filteredChanges.map((change) => {
                const Icon = getChangeIcon(change.change_type);
                const iconColor = getChangeColor(change.change_type);
                const isApproved = approvals[change.id] !== false;
                const edit = edits[change.id];

                return (
                  <View key={change.id} style={styles.changeCard}>
                    {/* Header */}
                    <View style={styles.changeHeader}>
                      <View style={styles.changeOp}>
                        <Icon size={16} color={iconColor} />
                        <Text style={[styles.changeOpText, { color: iconColor }]}>
                          {change.change_type.toUpperCase()}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.approveToggle, isApproved && styles.approveToggleActive]}
                        onPress={() => handleToggleApproval(change.id)}
                      >
                        <Check size={14} color={isApproved ? colors.white : colors.muted} />
                      </TouchableOpacity>
                    </View>

                    {/* Content */}
                    {change.change_type === 'add' && (
                      <View style={styles.changeContent}>
                        <Text style={styles.changeTitle}>
                          {change.payload.title || change.payload.subjectName || 'New Event'}
                        </Text>
                        <View style={styles.changeMeta}>
                          <Clock size={12} color={colors.muted} />
                          <Text style={styles.changeMetaText}>
                            {formatTime(edit?.startTs || change.payload.start)} - {formatTime(edit?.endTs || change.payload.end)}
                          </Text>
                        </View>
                        <View style={styles.changeMeta}>
                          <Calendar size={12} color={colors.muted} />
                          <Text style={styles.changeMetaText}>
                            {change.payload.minutes || edit?.minutes || 30}m
                          </Text>
                        </View>
                        {/* Quick time editor */}
                        <View style={styles.editRow}>
                          <TextInput
                            style={styles.editInput}
                            placeholder="Start time (ISO)"
                            value={edit?.startTs || ''}
                            onChangeText={(value) => handleEditTime(change.id, 'startTs', value)}
                            placeholderTextColor={colors.muted}
                          />
                          <TextInput
                            style={styles.editInput}
                            placeholder="Minutes"
                            keyboardType="numeric"
                            value={edit?.minutes?.toString() || ''}
                            onChangeText={(value) => handleEditTime(change.id, 'minutes', parseInt(value) || 0)}
                            placeholderTextColor={colors.muted}
                          />
                        </View>
                      </View>
                    )}

                    {change.change_type === 'move' && (
                      <View style={styles.changeContent}>
                        <Text style={styles.changeTitle}>
                          Event #{change.event_id?.slice(0, 8) || 'Unknown'}
                        </Text>
                        <View style={styles.changeMove}>
                          <Text style={styles.changeTimeOld}>
                            {formatTime(change.payload.from_start)}
                          </Text>
                          <ArrowRight size={14} color={colors.muted} />
                          <Text style={styles.changeTimeNew}>
                            {formatTime(edit?.startTs || change.payload.to_start)}
                          </Text>
                        </View>
                        <TextInput
                          style={styles.editInput}
                          placeholder="New start time (ISO)"
                          value={edit?.startTs || ''}
                          onChangeText={(value) => handleEditTime(change.id, 'startTs', value)}
                          placeholderTextColor={colors.muted}
                        />
                      </View>
                    )}

                    {change.change_type === 'delete' && (
                      <View style={styles.changeContent}>
                        <Text style={styles.changeTitle}>
                          Event #{change.event_id?.slice(0, 8) || 'Unknown'}
                        </Text>
                        <Text style={styles.changeReason}>
                          {change.payload.reason || 'Delete'}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {approvedCount} of {totalCount} approved
            </Text>
            <View style={styles.footerActions}>
              <TouchableOpacity
                onPress={onClose}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleApply}
                style={[styles.applyButton, applying && styles.applyButtonDisabled]}
                disabled={applying || approvedCount === 0}
              >
                {applying ? (
                  <ActivityIndicator size="small" color={colors.accentContrast} />
                ) : (
                  <>
                    <Check size={16} color={colors.accentContrast} />
                    <Text style={styles.applyButtonText}>
                      Apply {approvedCount} Changes
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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
    maxWidth: 720,
    maxHeight: '90%',
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
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.accent,
  },
  tabText: {
    fontSize: 14,
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.accent,
    fontWeight: '500',
  },
  list: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
  },
  changeCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  changeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  changeOp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  changeOpText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  approveToggle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveToggleActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  changeContent: {
    gap: 8,
  },
  changeTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  changeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  changeMetaText: {
    fontSize: 13,
    color: colors.muted,
  },
  changeMove: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  changeTimeOld: {
    fontSize: 13,
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  changeTimeNew: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  changeReason: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: 'italic',
  },
  editRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  editInput: {
    flex: 1,
    padding: 8,
    borderRadius: colors.radiusSm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    fontSize: 12,
    color: colors.text,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  footerText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
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

