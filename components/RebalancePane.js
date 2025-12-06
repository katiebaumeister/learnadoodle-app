import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { 
  X, RefreshCw, Check, Sparkles, TrendingUp, Wand2, Clock, ArrowRight,
  Calendar, ChevronRight, RotateCcw
} from 'lucide-react';
import { getSubjectAccent } from '../theme/designTokens';
import { useToast } from './Toast';

const MICRO_STEPS = [
  'Reviewing session timings…',
  'Detecting overloaded days…',
  'Suggesting optimized structure…',
];

export default function RebalancePane({
  familyId,
  children = [],
  activeChildIds = [],
  onClose,
  runRebalance,
  onAcceptSuggestion,
  onAcceptAll,
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);
  const [microStepIndex, setMicroStepIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);
  const [acceptedIds, setAcceptedIds] = useState(new Set());
  const toast = useToast();

  // Cycle through micro-steps every 3-4 seconds while loading
  useEffect(() => {
    if (!loading) {
      setMicroStepIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setMicroStepIndex((prev) => (prev + 1) % MICRO_STEPS.length);
    }, 3500);

    return () => clearInterval(interval);
  }, [loading]);

  const handleRunRebalance = useCallback(async () => {
    if (!runRebalance || loading) return;

    setLoading(true);
    setError(null);
    setSuggestions([]);
    setCompleted(false);
    setAppliedCount(0);
    setAcceptedIds(new Set());

    try {
      const results = await runRebalance();
      setSuggestions(results || []);
      setLoading(false);
      
      if (results && results.length > 0) {
        toast.push(`${results.length} suggestions ready`, 'success');
      } else {
        toast.push('No changes needed', 'info');
      }
    } catch (err) {
      console.error('Rebalance error:', err);
      setError(err.message || 'Failed to rebalance schedule');
      setLoading(false);
      toast.push('Rebalance failed', 'error');
    }
  }, [runRebalance, loading, toast]);

  const handleAccept = useCallback(async (suggestion) => {
    if (!onAcceptSuggestion || acceptedIds.has(suggestion.id)) return;

    try {
      await onAcceptSuggestion(suggestion);
      setAcceptedIds((prev) => new Set([...prev, suggestion.id]));
      setAppliedCount((prev) => prev + 1);
      toast.push('Applied to calendar', 'success');
    } catch (err) {
      console.error('Accept error:', err);
      toast.push('Failed to apply', 'error');
    }
  }, [onAcceptSuggestion, acceptedIds, toast]);

  const handleAcceptAll = useCallback(async () => {
    if (suggestions.length === 0) return;

    try {
      const unaccepted = suggestions.filter(s => !acceptedIds.has(s.id));
      let successCount = 0;
      
      // Accept each suggestion individually
      for (const suggestion of unaccepted) {
        try {
          if (onAcceptSuggestion) {
            await onAcceptSuggestion(suggestion);
            successCount++;
          }
        } catch (err) {
          console.error('Error accepting suggestion:', err);
        }
      }
      
      // Mark all as accepted
      setAcceptedIds(new Set(suggestions.map(s => s.id)));
      setAppliedCount(suggestions.length);
      setCompleted(true);
      
      if (successCount > 0) {
        toast.push(`Applied ${successCount} changes`, 'success');
      } else {
        toast.push('All changes already applied', 'info');
      }
    } catch (err) {
      console.error('Accept all error:', err);
      toast.push('Failed to apply some changes', 'error');
    }
  }, [onAcceptSuggestion, suggestions, acceptedIds, toast]);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const time = date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      return { dayName, time };
    } catch {
      return null;
    }
  };

  const getSubjectFromSuggestion = (suggestion) => {
    // Try to extract subject from title, notes, or change data
    const title = suggestion.title || '';
    const notes = suggestion.notes || '';
    const text = `${title} ${notes}`.toLowerCase();
    
    const subjects = ['math', 'reading', 'science', 'art', 'history', 'language'];
    for (const subject of subjects) {
      if (text.includes(subject)) {
        return subject;
      }
    }
    return null;
  };

  return (
    <View style={styles.container}>
      {/* Pastel gradient accent */}
      <View style={styles.gradientAccent} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Rebalance Schedule</Text>
            <Text style={styles.headerSubtitle}>
              AI will analyze your schedule and rebalance sessions to create a smoother workload.
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={20} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {/* Soft divider */}
        <View style={styles.divider} />
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.contentContainer}
      >
        {/* PRE-REBALANCE STATE */}
        {!loading && !error && suggestions.length === 0 && !completed && (
          <View style={styles.preRebalanceCard}>
            <View style={styles.processSummary}>
              <View style={styles.processHeader}>
                <Sparkles size={18} color="#7c8cff" />
                <Text style={styles.processTitle}>What AI will do</Text>
              </View>
              
              <View style={styles.processSteps}>
                <View style={styles.processStep}>
                  <View style={styles.processIconPill}>
                    <TrendingUp size={14} color="#7c8cff" />
                  </View>
                  <Text style={styles.processStepText}>
                    Review how sessions are currently distributed
                  </Text>
                </View>
                
                <View style={styles.processStep}>
                  <View style={styles.processIconPill}>
                    <TrendingUp size={14} color="#7c8cff" />
                  </View>
                  <Text style={styles.processStepText}>
                    Detect days or subjects that are overloaded
                  </Text>
                </View>
                
                <View style={styles.processStep}>
                  <View style={styles.processIconPill}>
                    <Wand2 size={14} color="#7c8cff" />
                  </View>
                  <Text style={styles.processStepText}>
                    Propose evenly-paced improvements
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.runButton}
              onPress={handleRunRebalance}
              disabled={loading}
            >
              <RefreshCw size={16} color="#ffffff" />
              <Text style={styles.runButtonText}>Run Rebalance</Text>
            </TouchableOpacity>

            <Text style={styles.estimatedTime}>Takes ~20–30 seconds</Text>
          </View>
        )}

        {/* LOADING STATE */}
        {loading && (
          <View style={styles.loadingContainer}>
            <View style={styles.progressCard}>
              <View style={styles.progressLoader}>
                <ActivityIndicator size="small" color="#7c8cff" />
              </View>
              <View style={styles.progressText}>
                <Text style={styles.progressTitle}>Rebalancing your schedule…</Text>
                <Text style={styles.progressSubtitle}>{MICRO_STEPS[microStepIndex]}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ERROR STATE */}
        {error && !loading && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRunRebalance}
            >
              <RefreshCw size={16} color="#ffffff" />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* RESULTS STATE */}
        {!loading && !error && suggestions.length > 0 && !completed && (
          <>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>
                AI found {suggestions.length} suggested improvement{suggestions.length !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.resultsSubtitle}>
                You can accept them individually or apply all at once.
              </Text>
              
              {suggestions.length > 1 && (
                <TouchableOpacity
                  style={styles.acceptAllButton}
                  onPress={handleAcceptAll}
                >
                  <Check size={16} color="#ffffff" />
                  <Text style={styles.acceptAllButtonText}>Accept All</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.suggestionsList}>
              {suggestions.map((suggestion, idx) => {
                const subject = getSubjectFromSuggestion(suggestion);
                const subjectAccent = subject ? getSubjectAccent(subject) : null;
                const subjectColor = subjectAccent?.bold || '#6b7280';
                const isAccepted = acceptedIds.has(suggestion.id);

                const fromTime = suggestion.fromStart ? formatDateTime(suggestion.fromStart) : null;
                const toTime = suggestion.proposedStart ? formatDateTime(suggestion.proposedStart) : null;

                return (
                  <View 
                    key={suggestion.id || idx} 
                    style={[
                      styles.suggestionCard,
                      isAccepted && styles.suggestionCardAccepted
                    ]}
                  >
                    {/* Subject stripe */}
                    {subject && (
                      <View style={[styles.subjectStripe, { backgroundColor: subjectColor }]} />
                    )}

                    <View style={styles.suggestionContent}>
                      <View style={styles.suggestionHeader}>
                        <Text style={styles.suggestionSubject}>
                          {subject || 'Event'}
                        </Text>
                        {suggestion.title && (
                          <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                        )}
                      </View>

                      {/* Before → After */}
                      {(fromTime || toTime) && (
                        <View style={styles.timeChange}>
                          {fromTime && (
                            <View style={styles.timeInfo}>
                              <Text style={styles.timeLabel}>Was:</Text>
                              <Text style={styles.timeValue}>
                                {fromTime.dayName} {fromTime.time}
                              </Text>
                            </View>
                          )}
                          {fromTime && toTime && (
                            <ArrowRight size={14} color="#9ca3af" style={styles.arrowIcon} />
                          )}
                          {toTime && (
                            <View style={styles.timeInfo}>
                              <Text style={styles.timeLabel}>Now:</Text>
                              <Text style={[styles.timeValue, styles.timeValueNew]}>
                                {toTime.dayName} {toTime.time} <Text style={styles.aiBadge}>(AI balanced)</Text>
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Change type indicator */}
                      {suggestion.changeType && (
                        <View style={styles.changeTypeBadge}>
                          <Text style={styles.changeTypeText}>
                            {suggestion.changeType === 'move' ? 'Rescheduled' : 
                             suggestion.changeType === 'add' ? 'New event' : 
                             suggestion.changeType === 'delete' ? 'Removed' : 'Change'}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Action buttons */}
                    <View style={styles.suggestionActions}>
                      {isAccepted ? (
                        <View style={styles.acceptedBadge}>
                          <Check size={14} color="#10b981" />
                          <Text style={styles.acceptedText}>Applied</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.acceptButton}
                          onPress={() => handleAccept(suggestion)}
                        >
                          <Check size={14} color="#ffffff" />
                          <Text style={styles.acceptButtonText}>Accept</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* COMPLETION STATE */}
        {completed && suggestions.length > 0 && (
          <View style={styles.completionCard}>
            <View style={styles.completionIcon}>
              <Check size={32} color="#10b981" />
            </View>
            <Text style={styles.completionTitle}>Rebalance Complete</Text>
            <Text style={styles.completionSubtitle}>
              Your schedule is now more evenly distributed.
            </Text>
            
            <View style={styles.completionActions}>
              <TouchableOpacity
                style={styles.completionButton}
                onPress={() => {
                  // Navigate to calendar view
                  toast.push('Viewing calendar...', 'info');
                }}
              >
                <Calendar size={16} color="#ffffff" />
                <Text style={styles.completionButtonText}>View changes on calendar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.completionButtonSecondary}
                onPress={() => {
                  setCompleted(false);
                  setSuggestions([]);
                  setAcceptedIds(new Set());
                  setAppliedCount(0);
                }}
              >
                <RotateCcw size={16} color="#7c8cff" />
                <Text style={styles.completionButtonSecondaryText}>Re-run AI</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* EMPTY STATE (no suggestions) */}
        {!loading && !error && suggestions.length === 0 && completed && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No changes needed</Text>
            <Text style={styles.emptyStateHint}>
              Your schedule is already well-balanced.
            </Text>
            <TouchableOpacity
              style={styles.runButton}
              onPress={handleRunRebalance}
            >
              <RefreshCw size={16} color="#ffffff" />
              <Text style={styles.runButtonText}>Run Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(229, 231, 235, 0.6)',
    ...(Platform.OS === 'web' && {
      boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.04)',
    }),
  },
  gradientAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(124, 140, 255, 0.04)',
    zIndex: 1,
  },
  header: {
    paddingTop: 4,
    paddingBottom: 12,
    paddingHorizontal: 20,
    backgroundColor: '#fafafa',
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }),
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    maxWidth: 400,
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(243, 244, 246, 0.7)',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  // Pre-rebalance card
  preRebalanceCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
    }),
  },
  processSummary: {
    marginBottom: 20,
  },
  processHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  processTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  processSteps: {
    gap: 12,
  },
  processStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  processIconPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(124, 140, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  processStepText: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
    flex: 1,
  },
  runButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7c8cff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
      cursor: 'pointer',
      ':hover': {
        backgroundColor: '#6c7bf3',
      },
    }),
  },
  runButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  estimatedTime: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
  },
  // Loading state
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
    opacity: 1,
  },
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
    }),
  },
  progressLoader: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: {
    flex: 1,
  },
  progressTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  progressSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  // Error state
  errorCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    marginBottom: 12,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#7c8cff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  // Results state
  resultsHeader: {
    marginBottom: 16,
  },
  resultsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  resultsSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
  },
  acceptAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#7c8cff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  acceptAllButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  suggestionsList: {
    gap: 12,
  },
  suggestionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    position: 'relative',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
      ':hover': {
        borderColor: '#d1d5db',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
      },
    }),
  },
  suggestionCardAccepted: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  subjectStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  suggestionContent: {
    padding: 14,
    paddingLeft: 18,
  },
  suggestionHeader: {
    marginBottom: 10,
  },
  suggestionSubject: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  suggestionTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  timeChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  timeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeLabel: {
    fontSize: 12,
    color: '#9ca3af',
  },
  timeValue: {
    fontSize: 13,
    color: '#4b5563',
    fontWeight: '500',
  },
  timeValueNew: {
    color: '#111827',
  },
  arrowIcon: {
    marginHorizontal: 4,
  },
  aiBadge: {
    fontSize: 11,
    color: '#7c8cff',
    fontWeight: '500',
  },
  changeTypeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
  },
  changeTypeText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },
  suggestionActions: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingLeft: 18,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#7c8cff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  acceptButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  acceptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  acceptedText: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '500',
  },
  // Completion state
  completionCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
    }),
  },
  completionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#d1fae5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  completionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  completionSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  completionActions: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  completionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7c8cff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  completionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  completionButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  completionButtonSecondaryText: {
    color: '#7c8cff',
    fontSize: 14,
    fontWeight: '500',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    padding: 40,
    minHeight: 200,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 8,
  },
  emptyStateHint: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 24,
  },
});
