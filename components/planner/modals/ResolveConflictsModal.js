/**
 * Resolve Conflicts Modal
 * Detects and resolves scheduling conflicts
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
  Switch,
} from 'react-native';
import { X, AlertTriangle, Check, Clock, GitMerge, Info } from 'lucide-react';
import { colors } from '../../../theme/colors';
import { detectConflicts } from '../../../lib/scheduling/conflicts';
import { proposeResolutions } from '../../../lib/scheduling/resolve';
import { previewResolveConflicts, applyResolveConflicts } from '../../../lib/services/plannerConflictsClient';
import { supabase } from '../../../lib/supabase';

export default function ResolveConflictsModal({
  visible,
  familyId,
  children = [],
  selectedChildIds = null,
  dateRange = null, // {start: 'YYYY-MM-DD', end: 'YYYY-MM-DD'}
  events = [], // Current calendar events
  onClose,
  onComplete, // Callback when conflicts are resolved
}) {
  const [step, setStep] = useState('scan'); // 'scan' | 'proposals' | 'applying'
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [resolutionPlan, setResolutionPlan] = useState(null);
  const [selectedProposals, setSelectedProposals] = useState(new Set());
  const [allowSpillover, setAllowSpillover] = useState(false);
  const [allowSplitting, setAllowSplitting] = useState(true);
  const [error, setError] = useState(null);
  const [loadedEvents, setLoadedEvents] = useState([]);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setStep('scan');
      setConflicts([]);
      setResolutionPlan(null);
      setSelectedProposals(new Set());
      setAllowSpillover(false);
      setAllowSplitting(true);
      setError(null);
      setLoading(false);
      setLoadedEvents([]);
      loadEvents();
    }
  }, [visible]);

  // Load events when modal opens
  const loadEvents = async () => {
    if (!familyId) return;

    try {
      // Determine date range
      let range = dateRange;
      if (!range) {
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6); // Sunday
        
        range = {
          start: weekStart.toISOString(),
          end: weekEnd.toISOString(),
        };
      }

      // Determine child IDs
      const childIds = selectedChildIds || (children.length > 0 ? children.map(c => c.id) : null);

      // Fetch events from Supabase
      let query = supabase
        .from('events')
        .select('*')
        .eq('family_id', familyId)
        .gte('start_ts', range.start)
        .lte('start_ts', range.end)
        .neq('status', 'canceled')
        .is('canceled_at', null)
        .is('deleted_at', null)
        .order('start_ts', { ascending: true });

      if (childIds && childIds.length > 0) {
        query = query.in('child_id', childIds);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        throw fetchError;
      }

      setLoadedEvents(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load events');
    }
  };

  // Auto-scan for conflicts when events are loaded
  useEffect(() => {
    if (visible && step === 'scan' && loadedEvents.length >= 0 && !loading) {
      // Use a small delay to ensure state is set
      const timer = setTimeout(() => {
        if (loadedEvents.length > 0 || events.length > 0) {
          handleScan();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [visible, step, loadedEvents.length]);

  const handleScan = async () => {
    setLoading(true);
    setError(null);

    try {
      // Determine date range
      let range = dateRange;
      if (!range) {
        // Default to current week
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6); // Sunday
        
        range = {
          start: weekStart.toISOString().split('T')[0],
          end: weekEnd.toISOString().split('T')[0],
        };
      }

      // Determine child IDs
      const childIds = selectedChildIds || (children.length > 0 ? children.map(c => c.id) : null);

      // Use loaded events or passed events
      const eventsToUse = loadedEvents.length > 0 ? loadedEvents : events;

      // Detect conflicts locally
      const detectedConflicts = detectConflicts(eventsToUse, {
        childIds,
        rangeStart: range.start,
        rangeEnd: range.end,
      });

      setConflicts(detectedConflicts);

      if (detectedConflicts.length === 0) {
        // No conflicts found
        setStep('scan');
      } else {
        // Generate proposals
        const plan = proposeResolutions(detectedConflicts, eventsToUse, {
          allowSpillover,
          allowSplitting,
          schoolHoursStart: '08:00',
          schoolHoursEnd: '16:00',
        });

        setResolutionPlan(plan);
        
        // Auto-select all non-flag proposals
        const proposalIds = plan.proposals
          .filter(p => p.type !== 'flag')
          .map((_, idx) => idx);
        setSelectedProposals(new Set(proposalIds));
        
        setStep('proposals');
      }
    } catch (err) {
      setError(err.message || 'Failed to scan for conflicts');
    } finally {
      setLoading(false);
    }
  };

  const toggleProposal = (index) => {
    setSelectedProposals(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleApply = async () => {
    if (!resolutionPlan || selectedProposals.size === 0) {
      return;
    }

    setStep('applying');
    setLoading(true);
    setError(null);

    try {
      // Get selected proposals
      const proposalsToApply = Array.from(selectedProposals)
        .map(idx => resolutionPlan.proposals[idx])
        .filter(p => p.type !== 'flag');

      if (proposalsToApply.length === 0) {
        setError('No proposals selected');
        setStep('proposals');
        setLoading(false);
        return;
      }

      // Determine date range and child IDs
      let range = dateRange;
      if (!range && conflicts.length > 0) {
        const dates = conflicts.map(c => c.date).sort();
        range = {
          start: dates[0],
          end: dates[dates.length - 1],
        };
      }

      const childIds = selectedChildIds || (children.length > 0 ? children.map(c => c.id) : null);

      // Call backend API
      const { data, error: apiError } = await applyResolveConflicts({
        family_id: familyId,
        child_ids: childIds,
        range: range,
        constraints: {
          hard_blocks: true,
          keep_fixed: true,
        },
        proposed_changes: proposalsToApply,
      });

      if (apiError) {
        throw new Error(apiError.message || 'Failed to apply changes');
      }

      // Success - refresh calendar and close
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar'));
      }

      if (onComplete) {
        onComplete({
          applied: true,
          changesCount: proposalsToApply.length,
        });
      }

      onClose();
    } catch (err) {
      setError(err.message || 'Failed to apply changes');
      setStep('proposals');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
                <AlertTriangle size={20} color="#F59E0B" />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>Resolve Conflicts</Text>
                <Text style={styles.subtitle}>
                  {step === 'scan' && 'Scanning for scheduling conflicts...'}
                  {step === 'proposals' && `Found ${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''}`}
                  {step === 'applying' && 'Applying changes...'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} disabled={step === 'applying'}>
              <X size={20} color={step === 'applying' ? colors.muted : colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {error && (
              <View style={styles.errorBox}>
                <AlertTriangle size={16} color="#E2556A" />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => setError(null)} style={styles.errorDismiss}>
                  <X size={14} color="#E2556A" />
                </TouchableOpacity>
              </View>
            )}

            {step === 'scan' && (
              <View style={styles.scanStep}>
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={styles.loadingText}>Scanning for conflicts...</Text>
                  </View>
                ) : conflicts.length === 0 ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIconCircle}>
                      <Check size={24} color="#10B981" />
                    </View>
                    <Text style={styles.emptyTitle}>No conflicts found</Text>
                    <Text style={styles.emptySubtext}>
                      Your schedule looks good! All events are properly spaced.
                    </Text>
                    <TouchableOpacity style={styles.emptyButton} onPress={onClose}>
                      <Text style={styles.emptyButtonText}>Close</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            )}

            {step === 'proposals' && resolutionPlan && (
              <View style={styles.proposalsStep}>
                {/* Options */}
                <View style={styles.optionsBox}>
                  <View style={styles.optionRow}>
                    <View style={styles.optionLabel}>
                      <Info size={14} color={colors.muted} />
                      <Text style={styles.optionText}>Allow spillover to next day</Text>
                    </View>
                    <Switch
                      value={allowSpillover}
                      onValueChange={(value) => {
                        setAllowSpillover(value);
                        // Regenerate proposals
                        const eventsToUse = loadedEvents.length > 0 ? loadedEvents : events;
                        const plan = proposeResolutions(conflicts, eventsToUse, {
                          allowSpillover: value,
                          allowSplitting,
                          schoolHoursStart: '08:00',
                          schoolHoursEnd: '16:00',
                        });
                        setResolutionPlan(plan);
                        // Reset selection
                        const proposalIds = plan.proposals
                          .filter(p => p.type !== 'flag')
                          .map((_, idx) => idx);
                        setSelectedProposals(new Set(proposalIds));
                      }}
                      trackColor={{ false: '#E5E7EB', true: colors.accent }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                  <View style={styles.optionRow}>
                    <View style={styles.optionLabel}>
                      <Info size={14} color={colors.muted} />
                      <Text style={styles.optionText}>Allow splitting flexible blocks</Text>
                    </View>
                    <Switch
                      value={allowSplitting}
                      onValueChange={(value) => {
                        setAllowSplitting(value);
                        // Regenerate proposals
                        const eventsToUse = loadedEvents.length > 0 ? loadedEvents : events;
                        const plan = proposeResolutions(conflicts, eventsToUse, {
                          allowSpillover,
                          allowSplitting: value,
                          schoolHoursStart: '08:00',
                          schoolHoursEnd: '16:00',
                        });
                        setResolutionPlan(plan);
                        // Reset selection
                        const proposalIds = plan.proposals
                          .filter(p => p.type !== 'flag')
                          .map((_, idx) => idx);
                        setSelectedProposals(new Set(proposalIds));
                      }}
                      trackColor={{ false: '#E5E7EB', true: colors.accent }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </View>

                {/* Conflicts Summary */}
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryTitle}>Conflicts Found</Text>
                  <View style={styles.summaryStats}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{conflicts.length}</Text>
                      <Text style={styles.statLabel}>Total</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{conflicts.filter(c => c.severity === 'high').length}</Text>
                      <Text style={styles.statLabel}>High</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{resolutionPlan.stats.moved_count}</Text>
                      <Text style={styles.statLabel}>Moves</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{resolutionPlan.stats.split_count}</Text>
                      <Text style={styles.statLabel}>Splits</Text>
                    </View>
                  </View>
                </View>

                {/* Proposals List */}
                <View style={styles.proposalsList}>
                  <Text style={styles.proposalsTitle}>Proposed Changes</Text>
                  {resolutionPlan.proposals.map((proposal, index) => {
                    const isSelected = selectedProposals.has(index);
                    const eventsToUse = loadedEvents.length > 0 ? loadedEvents : events;
                    const event = eventsToUse.find(e => (e.id || e.data?.id) === proposal.event_id);

                    return (
                      <TouchableOpacity
                        key={index}
                        style={[styles.proposalCard, isSelected && styles.proposalCardSelected]}
                        onPress={() => toggleProposal(index)}
                        disabled={proposal.type === 'flag'}
                      >
                        <View style={styles.proposalHeader}>
                          <View style={styles.proposalIcon}>
                            {proposal.type === 'move' && <Clock size={16} color={colors.accent} />}
                            {proposal.type === 'split' && <GitMerge size={16} color={colors.accent} />}
                            {proposal.type === 'flag' && <AlertTriangle size={16} color="#E2556A" />}
                          </View>
                          <View style={styles.proposalContent}>
                            <Text style={styles.proposalTitle}>
                              {proposal.type === 'move' && `Move "${event?.title || proposal.event_id}"`}
                              {proposal.type === 'split' && `Split "${event?.title || proposal.event_id}"`}
                              {proposal.type === 'flag' && 'Cannot resolve'}
                            </Text>
                            <Text style={styles.proposalRationale}>{proposal.rationale || proposal.message}</Text>
                            {proposal.type === 'move' && proposal.from && proposal.to && (
                              <Text style={styles.proposalDetails}>
                                {formatDate(proposal.from.start_at.split('T')[0])} {formatTime(proposal.from.start_at)} → {formatTime(proposal.to.start_at)}
                              </Text>
                            )}
                            {proposal.type === 'split' && proposal.parts && (
                              <Text style={styles.proposalDetails}>
                                Split into {proposal.parts.length} parts
                              </Text>
                            )}
                          </View>
                          {proposal.type !== 'flag' && (
                            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                              {isSelected && <Check size={14} color="#FFFFFF" />}
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {step === 'applying' && (
              <View style={styles.applyingStep}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.applyingText}>Applying changes to your calendar...</Text>
              </View>
            )}
          </ScrollView>

          {step === 'proposals' && (
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {selectedProposals.size} of {resolutionPlan?.proposals.filter(p => p.type !== 'flag').length || 0} selected
              </Text>
              <View style={styles.footerActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.applyButton, (loading || selectedProposals.size === 0) && styles.applyButtonDisabled]}
                  onPress={handleApply}
                  disabled={loading || selectedProposals.size === 0}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Check size={16} color="#FFFFFF" />
                      <Text style={styles.applyButtonText}>
                        Apply {selectedProposals.size} Changes
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
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
    maxWidth: 600,
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
    backgroundColor: '#FEF3C7',
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
  scanStep: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  proposalsStep: {
    gap: 16,
  },
  optionsBox: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 8,
    gap: 12,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  optionText: {
    fontSize: 14,
    color: colors.text,
  },
  summaryBox: {
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 8,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  summaryStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.accent,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  proposalsList: {
    gap: 12,
  },
  proposalsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  proposalCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 16,
  },
  proposalCardSelected: {
    borderColor: colors.accent,
    backgroundColor: '#F5F3FF',
  },
  proposalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  proposalIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F3FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  proposalContent: {
    flex: 1,
  },
  proposalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  proposalRationale: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 4,
  },
  proposalDetails: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: 'monospace',
  },
  checkbox: {
    width: 20,
    height: 20,
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
  applyingStep: {
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  applyingText: {
    fontSize: 14,
    color: colors.muted,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  footerText: {
    fontSize: 14,
    color: colors.muted,
  },
  footerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
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

