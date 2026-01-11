import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { X, Check, RefreshCw, BarChart3 } from 'lucide-react';
import { useToast } from './Toast';

export default function AIModal({
  title,
  open,
  onClose,
  run,
  onAccept,
  description,
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);
  const [hasStarted, setHasStarted] = useState(false);
  const toast = useToast();
  const timeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Reset when modal closes
    if (!open) {
      setHasStarted(false);
      setSuggestions([]);
      setError(null);
      setLoading(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }
  }, [open]);
    
  const handleStart = () => {
    if (!run) {
      setError('Run function not available');
      return;
    }
    
    setHasStarted(true);
    setLoading(true);
    setError(null);
    setSuggestions([]);
    
    // Add timeout (60 seconds)
    timeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setError('Request timed out. The AI is taking longer than expected. Please try again.');
        setLoading(false);
        toast.push('Request timed out', 'error');
      }
    }, 60000);
    
    // Execute the run function
    const executeRun = async () => {
      const runStartTime = Date.now();
      try {
        if (!run) {
          throw new Error('Run function is not available');
        }

        const results = await run();
        const runDuration = Date.now() - runStartTime;

        // Clear timeout on success
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        
        if (!isMountedRef.current) {
          return;
        }
        
        const suggestions = results || [];

        // Update state in a single batch to prevent intermediate renders
        setSuggestions(suggestions);
        setLoading(false);

        if (suggestions.length > 0) {
          toast.push('Suggestions ready', 'success');
        }
      } catch (err) {
        const runDuration = Date.now() - runStartTime;

        // Clear timeout on error
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        
        if (!isMountedRef.current) {
          return;
        }
        
        const errorMessage = err.message || 'AI error — try again';
        setError(errorMessage);
        setLoading(false);
        toast.push(errorMessage, 'error');
      }
    };
    
    executeRun();
  };

  // Handle Esc key
  useEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const handleAccept = async (suggestion) => {
    try {
      await onAccept?.(suggestion);
      toast.push('Added to calendar', 'success');
    } catch (err) {
      toast.push('Failed to add to calendar', 'error');
    }
  };

  return (
    <View style={styles.overlay} onTouchEnd={onClose}>
      <View style={styles.modal} onTouchEnd={(e) => e.stopPropagation()}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={[
              styles.iconCircle,
              title === "Rebalance Schedule" && styles.iconCircleLavender,
              title === "What-If Analysis" && styles.iconCircleGrayViolet,
            ]}>
              {title === "Rebalance Schedule" ? (
                <RefreshCw size={20} color="#6366f1" />
              ) : (
                <BarChart3 size={20} color="#9CA3AF" />
              )}
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>
                {title === "Rebalance Schedule" ? "Rebalance your week" : "Preview changes"}
              </Text>
              <Text style={styles.subtitle}>
                {title === "Rebalance Schedule" 
                  ? "We'll smooth out workload and adjust learning time based on recent progress."
                  : "See how schedule changes would affect your plan without making real changes."}
              </Text>
            </View>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <X size={20} color="#6b7280" />
        </TouchableOpacity>
      </View>
      <View style={styles.headerDivider} />

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* STATE A - Action Available: Show before running OR after running with suggestions */}
          {!hasStarted && !loading && (
            <View style={styles.startSection}>
              <View style={[
                styles.explanationCard,
                title === "Rebalance Schedule" && styles.explanationCardLavender,
                title === "What-If Analysis" && styles.explanationCardGrayViolet,
              ]}>
                <View style={[
                  styles.sectionHeaderPill,
                  title === "Rebalance Schedule" && styles.sectionHeaderPillLavender,
                  title === "What-If Analysis" && styles.sectionHeaderPillGrayViolet,
                ]}>
                  <Text style={styles.sectionHeaderPillText}>
                    {title === "Rebalance Schedule" ? "What will change" : "What you'll see"}
                  </Text>
                </View>
                {title === "Rebalance Schedule" && (
                  <>
                    <View style={styles.listItemRow}>
                      <View style={[styles.listItemMarker, styles.listItemMarkerLavender]} />
                      <Text style={styles.explanationCardItem}>Heavy days are evened out</Text>
                    </View>
                    <View style={styles.listItemRow}>
                      <View style={[styles.listItemMarker, styles.listItemMarkerBlue]} />
                      <Text style={styles.explanationCardItem}>Extra time added where needed</Text>
                    </View>
                    <View style={styles.listItemRow}>
                      <View style={[styles.listItemMarker, styles.listItemMarkerGreen]} />
                      <Text style={styles.explanationCardItem}>Strong subjects move faster</Text>
                    </View>
                  </>
                )}
                {title === "What-If Analysis" && (
                  <>
                    <Text style={styles.explanationCardItem}>Test scenario created</Text>
                    <Text style={styles.explanationCardItem}>Impact preview shown</Text>
                    <Text style={styles.explanationCardItem}>No real changes made</Text>
                  </>
                )}
              </View>

              <View style={[
                styles.explanationCard,
                title === "Rebalance Schedule" && styles.explanationCardLavender,
                title === "What-If Analysis" && styles.explanationCardGrayViolet,
              ]}>
                <View style={[
                  styles.sectionHeaderPill,
                  title === "Rebalance Schedule" && styles.sectionHeaderPillLavender,
                  title === "What-If Analysis" && styles.sectionHeaderPillGrayViolet,
                ]}>
                  <Text style={styles.sectionHeaderPillText}>We'll look at</Text>
                </View>
                <Text style={styles.explanationCardItem}>Your current schedule</Text>
                <Text style={styles.explanationCardItem}>Last 30 days of progress</Text>
                <Text style={styles.explanationCardItem}>All students</Text>
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[
                    styles.startButton,
                    title === "Rebalance Schedule" && styles.startButtonLavender,
                    title === "What-If Analysis" && styles.startButtonGrayViolet,
                  ]}
                  onPress={handleStart}
                >
                  <Text style={styles.startButtonText}>
                    {title === "Rebalance Schedule" ? "Apply rebalancing" : "Preview changes"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={onClose}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* STATE B - No Action Needed: Only show after running with no suggestions */}
          {hasStarted && !loading && !error && suggestions.length === 0 && title === "Rebalance Schedule" && (
            <View style={styles.emptyStateCentered}>
              <View style={styles.emptyIconCircle}>
                <Check size={24} color="#10b981" />
              </View>
              <Text style={styles.emptyTitle}>
                You're already well balanced
              </Text>
              <Text style={styles.emptySubtext}>
                Nothing needs adjusting right now. We'll keep watching.
              </Text>
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={onClose}
              >
                <Text style={styles.emptyStateButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}

          {loading && (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.loadingText}>
                {title === "Rebalance Schedule" ? "⚖️ Working My Magic..." : "🔮 Analyzing Scenario..."}
              </Text>
              <Text style={styles.loadingSubtext}>Hang tight! This takes about 20-30 seconds.</Text>
              {title === "Rebalance Schedule" && (
                <View style={styles.loadingSteps}>
                  <Text style={styles.loadingStep}>✓ Found events across days</Text>
                  <Text style={styles.loadingStep}>✓ Analyzing workload distribution</Text>
                  <Text style={styles.loadingStep}>✓ Reviewing performance data (30 days)</Text>
                  <Text style={styles.loadingStep}>⏳ Generating your perfect schedule...</Text>
                </View>
              )}
            </View>
          )}

          {error && (
            <View style={styles.error}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  setError(null);
                  setHasStarted(false);
                  setSuggestions([]);
                }}
              >
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}


          {!loading && !error && suggestions.length > 0 && (
            <View style={styles.suggestions}>
              {suggestions.map((suggestion, idx) => (
                <View key={suggestion.id || idx} style={styles.suggestion}>
                  <View style={styles.suggestionContent}>
                    <Text style={styles.suggestionTitle}>
                      {suggestion.title || 'Untitled'}
                    </Text>
                    {suggestion.notes && (
                      <Text style={styles.suggestionNotes}>{suggestion.notes}</Text>
                    )}
                    {(suggestion.proposedStart || suggestion.proposedEnd) && (
                      <Text style={styles.suggestionTime}>
                        {suggestion.proposedStart && new Date(suggestion.proposedStart).toLocaleString()}
                        {suggestion.proposedEnd && ` - ${new Date(suggestion.proposedEnd).toLocaleString()}`}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.acceptButton}
                    onPress={() => handleAccept(suggestion)}
                  >
                    <Check size={16} color="#ffffff" />
                    <Text style={styles.acceptButtonText}>Accept & Add</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: Platform.OS === 'web' ? 10001 : 10000, // Higher than main modal
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: Platform.OS === 'web' ? '90%' : '100%',
    maxWidth: 600,
    maxHeight: '85%',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 24,
    paddingBottom: 20,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleLavender: {
    backgroundColor: 'rgba(139, 92, 246, 0.08)', // Very light lavender
  },
  iconCircleGrayViolet: {
    backgroundColor: '#F5F5F7',
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a', // Near-black
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#475569', // Increased contrast
    lineHeight: 20,
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#cbd5e1',
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 16,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 0,
    flexGrow: 1,
  },
  startSection: {
    padding: 24,
    paddingTop: 0,
    gap: 16,
  },
  explanationCard: {
    backgroundColor: '#F8F9FB',
    borderRadius: 16,
    padding: 16,
  },
  explanationCardLavender: {
    backgroundColor: '#F8F9FB', // Whiter background
  },
  explanationCardGrayViolet: {
    backgroundColor: '#FAFAFB',
  },
  sectionHeaderPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 12,
  },
  sectionHeaderPillLavender: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)', // Very light lavender
  },
  sectionHeaderPillGrayViolet: {
    backgroundColor: 'rgba(156, 163, 175, 0.15)',
  },
  sectionHeaderPillText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6b7280', // Neutral gray text
    letterSpacing: 0.2,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  listItemMarker: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    marginRight: 10,
  },
  listItemMarkerLavender: {
    backgroundColor: 'rgba(139, 92, 246, 0.7)', // Brighter lavender
  },
  listItemMarkerBlue: {
    backgroundColor: 'rgba(59, 130, 246, 0.7)', // Brighter blue
  },
  listItemMarkerGreen: {
    backgroundColor: 'rgba(34, 197, 94, 0.7)', // Brighter green
  },
  explanationCardItem: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
    flex: 1,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  startButton: {
    flex: 1,
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonLavender: {
    backgroundColor: '#6366f1', // Blueish purple (indigo)
  },
  startButtonGrayViolet: {
    backgroundColor: '#9CA3AF',
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 15,
    fontWeight: '500',
  },
  loading: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    color: '#111827',
    fontWeight: '600',
    marginBottom: 8,
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  loadingSteps: {
    alignSelf: 'stretch',
    marginTop: 16,
  },
  loadingStep: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 24,
    marginBottom: 4,
  },
  error: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
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
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyStateCentered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    minHeight: 400,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    color: '#111827',
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 400,
    marginBottom: 24,
  },
  emptyStateButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: 'transparent',
  },
  emptyStateButtonText: {
    fontSize: 15,
    color: '#6b7280',
    fontWeight: '500',
  },
  suggestions: {
    gap: 12,
  },
  suggestion: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  suggestionContent: {
    marginBottom: 12,
  },
  suggestionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  suggestionNotes: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  suggestionTime: {
    fontSize: 12,
    color: '#9ca3af',
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 6,
  },
  acceptButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
});

