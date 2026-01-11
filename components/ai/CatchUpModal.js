/**
 * Catch Up Modal
 * Part of Phase 2 - AI Parent Assistant
 * Shows rescheduled events for missed work
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
import { X, RotateCcw, AlertCircle, Info, TrendingUp, Calendar, Package } from 'lucide-react';
import { colors } from '../../theme/colors';
import { catchUp } from '../../lib/services/aiClient';
import { proposeReschedule } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';

export default function CatchUpModal({
  visible,
  familyId,
  onClose,
  onComplete, // Optional callback with proposedChanges
  onOpenScheduleRules, // Optional callback to open schedule rules
  title = "Catch Up",
  description = "Analyze gaps between subjects' required minutes and actual scheduled time, then generate catch-up sessions to meet requirements.",
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [missedEvents, setMissedEvents] = useState([]);
  const [selectedEventIds, setSelectedEventIds] = useState([]);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (visible && familyId) {
      loadMissedEvents();
      setResult(null);
      setSelectedEventIds([]);
      setHasStarted(false);
      setLoading(false);
    }
  }, [visible, familyId]);

  const loadMissedEvents = async () => {
    try {
      // Get events from last 30 days that are missed or overdue
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data, error } = await supabase
        .from('events')
        .select('id, title, start_ts, child_id, subject_id')
        .eq('family_id', familyId)
        .in('status', ['missed', 'overdue'])
        .gte('start_ts', thirtyDaysAgo.toISOString())
        .order('start_ts', { ascending: false })
        .limit(50);

      if (error) {
        return;
      }

      setMissedEvents(data || []);
    } catch (err) {
    }
  };

  const toggleEvent = (eventId) => {
    setSelectedEventIds(prev => {
      if (prev.includes(eventId)) {
        return prev.filter(id => id !== eventId);
      } else {
        return [...prev, eventId];
      }
    });
  };

  const handleCatchUp = async () => {
    if (title === "Reschedule Missed Work" && selectedEventIds.length === 0) {
      if (Platform.OS === 'web') {
        alert('Please select at least one missed event');
      }
      return;
    }

    setLoading(true);
    try {
      let data, error;
      
      if (title === "Reschedule Missed Work") {
        // Use catchUp API for rescheduling specific missed events
        const result = await catchUp(selectedEventIds);
        data = result.data;
        error = result.error;
      } else if (title === "Catch Up" || title === "Plan My Week" || title === "Plan Next 2 Weeks") {
        // Use proposeReschedule for catch-up analysis and planning
        const { data: childrenData } = await supabase
          .from('children')
          .select('id')
          .eq('family_id', familyId);
        
        const childIds = (childrenData || []).map(c => c.id);
        
        if (childIds.length === 0) {
          throw new Error('No children available for scheduling');
        }
        
        const result = await proposeReschedule({
          familyId,
          weekStart: new Date(),
          childIds: childIds,
          horizonWeeks: title === "Plan Next 2 Weeks" ? 2 : 1,
          reason: title === "Catch Up" ? 'catch_up' : 'pack_week',
        });
        
        data = result.data;
        error = result.error;
      }
      
      if (error) {
        if (Platform.OS === 'web') {
          alert(`Failed: ${error.message || error}`);
        }
        return;
      }

      if (data) {
        // Check if schedule rules are needed
        if (data.needsScheduleRules) {
          if (onOpenScheduleRules) {
            // Close this modal and open schedule rules
            onClose();
            // Small delay to ensure modal closes first
            setTimeout(() => {
              onOpenScheduleRules();
            }, 100);
            return;
          } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
            // Fallback: dispatch event for WebLayout to handle
            onClose();
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('openScheduleRules'));
            }, 100);
            return;
          }
        }
        
        // Check for user message (helpful clarity when no changes)
        if (data.userMessage && (!data.changes || data.changes.length === 0)) {
          // Don't show alert if we're routing to schedule rules
          if (!data.needsScheduleRules && Platform.OS === 'web') {
            alert(data.userMessage);
          }
          // Still set result so modal shows the message
        }
        
        setResult(data);
        
        // For proposeReschedule responses, transform changes into a displayable format
        if (data.changes && Array.isArray(data.changes)) {
          // Transform changes for display
          const transformedChanges = data.changes.map((change, idx) => {
            const payload = change.payload || {};
            if (change.change_type === 'add') {
              return {
                id: change.id || `add-${idx}`,
                title: payload.title || 'New Event',
                start: payload.start || payload.start_ts,
                end: payload.end || payload.end_ts,
                child_id: payload.child_id,
                change_type: 'add',
              };
            } else if (change.change_type === 'move') {
              return {
                id: change.id || `move-${idx}`,
                title: 'Moved Event',
                from_start: payload.from_start,
                to_start: payload.to_start || payload.toStart,
                change_type: 'move',
              };
            }
            return change;
          });
          data.transformedChanges = transformedChanges;
        }
        
        // Extract proposedChanges from response
        const proposedChanges = data.proposed_changes || data.changes ||
          (data.rescheduled ? data.rescheduled.map((evt, idx) => ({
            id: `catchup-${idx}`,
            kind: 'move',
            label: evt.title || 'Rescheduled Event',
            before: evt.original_start ? new Date(evt.original_start).toLocaleString() : 'Missed',
            after: evt.new_start ? new Date(evt.new_start).toLocaleString() : undefined,
            when: evt.new_start ? new Date(evt.new_start).toLocaleString() : undefined,
            child: evt.child_id,
          })) : []);
        
        // Call onComplete with proposedChanges if provided
        if (onComplete && proposedChanges.length > 0) {
          onComplete({ proposedChanges, result: data });
        }
      }
    } catch (err) {
      if (Platform.OS === 'web') {
        alert(`Error: ${err.message || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
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
              <View style={[
                styles.iconCircle,
                title === "Catch Up" && styles.iconCirclePeach,
                title === "Reschedule Missed Work" && styles.iconCircleBlue,
                (title === "Plan My Week" || title === "Plan Next 2 Weeks") && styles.iconCircleBlue,
              ]}>
                {title === "Catch Up" ? (
                  <TrendingUp size={20} color="#F97316" />
                ) : title === "Reschedule Missed Work" ? (
                  <RotateCcw size={20} color="#3B82F6" />
                ) : (
                  <Calendar size={20} color="#3B82F6" />
                )}
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>
                  {title === "Catch Up" ? "Catch up on requirements" 
                   : title === "Reschedule Missed Work" ? "Reschedule missed work"
                   : title === "Plan My Week" ? "Plan your week"
                   : "Plan next 2 weeks"}
                </Text>
                <Text style={styles.subtitle}>
                  {title === "Catch Up" 
                    ? "We'll add sessions to meet state standards and fill gaps in your schedule."
                    : title === "Reschedule Missed Work"
                    ? "Select missed events and we'll find new time slots for them."
                    : "We'll fill your open time with activities from your backlog."}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {!hasStarted && !loading && (
              <>
                <View style={styles.startSection}>
                  {title === "Catch Up" && (
                    <View style={[styles.explanationCard, styles.explanationCardPeach]}>
                      <Text style={styles.explanationCardTitle}>What will change</Text>
                      <Text style={styles.explanationCardItem}>New sessions added for gaps</Text>
                      <Text style={styles.explanationCardItem}>State requirements met</Text>
                      <Text style={styles.explanationCardItem}>Schedule balanced across subjects</Text>
                    </View>
                  )}

                  {title === "Reschedule Missed Work" && (
                    <View style={[styles.explanationCard, styles.explanationCardBlue]}>
                      <Text style={styles.explanationCardTitle}>How it works</Text>
                      <Text style={styles.explanationCardItem}>Pick missed events to move</Text>
                      <Text style={styles.explanationCardItem}>We find available time slots</Text>
                      <Text style={styles.explanationCardItem}>Events rescheduled automatically</Text>
                    </View>
                  )}

                  {(title === "Plan My Week" || title === "Plan Next 2 Weeks") && (
                    <View style={[styles.explanationCard, styles.explanationCardBlue]}>
                      <Text style={styles.explanationCardTitle}>What will change</Text>
                      <Text style={styles.explanationCardItem}>Open slots filled from backlog</Text>
                      <Text style={styles.explanationCardItem}>Complete weekly plan created</Text>
                      <Text style={styles.explanationCardItem}>Activities scheduled strategically</Text>
                    </View>
                  )}

                  {title === "Catch Up" && (
                    <View style={[styles.explanationCard, styles.explanationCardPeach]}>
                      <Text style={styles.explanationCardTitle}>We'll look at</Text>
                      <Text style={styles.explanationCardItem}>State-required minutes per subject</Text>
                      <Text style={styles.explanationCardItem}>Your actual scheduled time</Text>
                      <Text style={styles.explanationCardItem}>Gaps that need catch-up sessions</Text>
                    </View>
                  )}
                </View>

                {title === "Reschedule Missed Work" && (
                  <>
                    <View style={styles.infoSection}>
                      <Text style={styles.infoLabel}>Looking back: Last 30 days</Text>
                      <Text style={styles.infoValue}>Found: {missedEvents.length} missed events</Text>
                    </View>

                    {missedEvents.length === 0 ? (
                      <View style={styles.emptyState}>
                        <AlertCircle size={32} color={colors.muted} />
                        <Text style={styles.emptyStateText}>No missed events found</Text>
                        <Text style={styles.emptyStateSubtext}>
                          All events are up to date!
                        </Text>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.sectionTitle}>Select events to reschedule:</Text>
                        <View style={styles.eventsList}>
                          {missedEvents.slice(0, 6).map(event => {
                            const isSelected = selectedEventIds.includes(event.id);
                            const eventDate = event.start_ts ? new Date(event.start_ts) : null;
                            const dateStr = eventDate ? eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD';
                            return (
                              <TouchableOpacity
                                key={event.id}
                                style={[
                                  styles.eventItem,
                                  isSelected && styles.eventItemSelected
                                ]}
                                onPress={() => toggleEvent(event.id)}
                              >
                                <View style={styles.eventCheckbox}>
                                  {isSelected && <Text style={styles.checkmarkText}>✓</Text>}
                                </View>
                                <View style={styles.eventContent}>
                                  <Text style={styles.eventTitle}>{dateStr} - {event.title || 'Untitled Event'}</Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                          {missedEvents.length > 6 && (
                            <Text style={styles.showMoreText}>Show {missedEvents.length - 6} more...</Text>
                          )}
                        </View>

                        <View style={styles.buttonRow}>
                          <TouchableOpacity
                            style={[
                              styles.startButton,
                              styles.startButtonBlue,
                              selectedEventIds.length === 0 && styles.startButtonDisabled
                            ]}
                            onPress={() => {
                              if (selectedEventIds.length > 0) {
                                setHasStarted(true);
                                handleCatchUp();
                              }
                            }}
                            disabled={selectedEventIds.length === 0}
                          >
                            <Text style={styles.startButtonText}>Find new times</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={onClose}
                          >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </>
                )}

                {title === "Catch Up" && (
                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.startButton, styles.startButtonPeach]}
                      onPress={() => setHasStarted(true)}
                    >
                      <Text style={styles.startButtonText}>Catch up</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={onClose}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {(title === "Plan My Week" || title === "Plan Next 2 Weeks") && (
                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.startButton, styles.startButtonBlue]}
                      onPress={() => {
                        setHasStarted(true);
                        handleCatchUp();
                      }}
                    >
                      <Text style={styles.startButtonText}>
                        {title === "Plan My Week" ? "Plan week" : "Plan 2 weeks"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={onClose}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {hasStarted && !loading && title === "Catch Up" && (
              <View style={styles.inputSection}>
                <Text style={styles.sectionTitle}>Analyze this period:</Text>
                <View style={styles.dateRow}>
                  <TextInput
                    style={styles.dateInput}
                    placeholder="Start date"
                    value=""
                  />
                  <Text style={styles.dateTo}>through</Text>
                  <TextInput
                    style={styles.dateInput}
                    placeholder="End date"
                    value=""
                  />
                </View>
                <Text style={styles.sectionTitle}>Plan catch-up for:</Text>
                <View style={styles.dateRow}>
                  <TextInput
                    style={styles.dateInput}
                    placeholder="Start date"
                    value=""
                  />
                  <Text style={styles.dateTo}>through</Text>
                  <TextInput
                    style={styles.dateInput}
                    placeholder="End date"
                    value=""
                  />
                </View>
                <View style={styles.optionsSection}>
                  <Text style={styles.optionsTitle}>Options:</Text>
                  <View style={styles.optionRow}>
                    <Text style={styles.optionText}>☑️ Prioritize subjects most behind on requirements</Text>
                  </View>
                  <View style={styles.optionRow}>
                    <Text style={styles.optionText}>☑️ Include review sessions where needed</Text>
                  </View>
                  <View style={styles.optionRow}>
                    <Text style={styles.optionText}>☑️ Respect daily time limits (6h max)</Text>
                  </View>
                </View>
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.startButton}
                    onPress={handleCatchUp}
                  >
                    <Text style={styles.startButtonText}>Catch Me Up! 🚀</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => setHasStarted(false)}
                  >
                    <Text style={styles.cancelButtonText}>Back</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.loadingText}>
                  {title === "Catch Up" ? "🎯 Crunching the Numbers..." : title === "Reschedule Missed Work" ? "📅 Finding Perfect Times..." : "⏳ Planning Your Week..."}
                </Text>
                <Text style={styles.loadingSubtext}>
                  {title === "Catch Up" ? "This'll take about 30 seconds. Worth the wait!" : "This may take 20-30 seconds"}
                </Text>
                {title === "Catch Up" && (
                  <View style={styles.loadingSteps}>
                    <Text style={styles.loadingStep}>✓ Loading state standards and required minutes</Text>
                    <Text style={styles.loadingStep}>✓ Calculating weekly requirements per subject</Text>
                    <Text style={styles.loadingStep}>⏳ Comparing scheduled vs. required time</Text>
                    <Text style={styles.loadingStep}>⏳ Finding perfect catch-up time slots</Text>
                    <Text style={styles.loadingStep}>⏳ Building your personalized plan...</Text>
                  </View>
                )}
                {title === "Reschedule Missed Work" && (
                  <View style={styles.loadingSteps}>
                    <Text style={styles.loadingStep}>✓ Checking available slots</Text>
                    <Text style={styles.loadingStep}>⏳ Making sure nothing conflicts...</Text>
                  </View>
                )}
              </View>
            )}

            {result && !loading && (
              <View style={styles.resultContainer}>
                {title === "Catch Up" && (
                  <>
                    <Text style={styles.resultTitle}>🎉 You're All Caught Up!</Text>
                    <Text style={styles.resultSubtitle}>State requirements: CHECK! ✓</Text>
                    {result.changes && result.changes.length > 0 && (
                      <View style={styles.changesList}>
                        <Text style={styles.changesTitle}>Added {result.changes.length} catch-up sessions:</Text>
                        {result.changes.slice(0, 5).map((change, idx) => (
                          <View key={idx} style={styles.changeItem}>
                            <Text style={styles.changeText}>
                              • {change.payload?.title || 'Catch-up session'} - {change.payload?.start ? new Date(change.payload.start).toLocaleDateString() : 'TBD'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                    <View style={styles.buttonRow}>
                      <TouchableOpacity
                        style={styles.successButton}
                        onPress={onClose}
                      >
                        <Text style={styles.successButtonText}>Awesome! 🎯</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
                {title === "Reschedule Missed Work" && (
                  <>
                    <Text style={styles.resultTitle}>Result</Text>
                    {result.notes && (
                      <Text style={styles.resultNotes}>{result.notes}</Text>
                    )}
                    {result.rescheduled && result.rescheduled.length > 0 ? (
                      <View style={styles.rescheduledList}>
                        {result.rescheduled.map((item, idx) => (
                          <View key={idx} style={styles.rescheduledItem}>
                            <Text style={styles.rescheduledTitle}>{item.title || 'Event'}</Text>
                            <Text style={styles.rescheduledDetails}>
                              Rescheduled to: {item.start ? new Date(item.start).toLocaleString() : 'TBD'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.noRescheduledText}>
                        No rescheduling suggestions yet. This feature is coming soon!
                      </Text>
                    )}
                  </>
                )}
                {(title === "Plan My Week" || title === "Plan Next 2 Weeks") && result && (
                  <>
                    {result.changes && result.changes.filter(c => c.change_type === 'add').length > 0 ? (
                      <>
                        <Text style={styles.resultTitle}>✨ Your Week is Planned!</Text>
                        <Text style={styles.resultSubtitle}>
                          Added {result.changes.filter(c => c.change_type === 'add').length} new events to your schedule
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.resultTitle}>📋 Planning Complete</Text>
                        <Text style={styles.resultSubtitle}>
                          {result.userMessage || "No new events were added. Your schedule appears to be full, or there are no backlog items available to schedule."}
                        </Text>
                        {result.needsScheduleRules && onOpenScheduleRules ? (
                          <View style={styles.infoBox}>
                            <Text style={styles.infoText}>
                              ⚠️ Schedule rules need to be set up first.{'\n\n'}
                              This will open the schedule rules editor where you can define when teaching time is available.
                            </Text>
                          </View>
                        ) : !result.userMessage ? (
                          <View style={styles.infoBox}>
                            <Text style={styles.infoText}>
                              💡 To schedule more events:{'\n'}
                              • Add items to your backlog{'\n'}
                              • Check your schedule rules{'\n'}
                              • Review blackout periods
                            </Text>
                          </View>
                        ) : null}
                      </>
                    )}
                    <View style={styles.buttonRow}>
                      {result.needsScheduleRules ? (
                        <TouchableOpacity
                          style={styles.successButton}
                          onPress={() => {
                            if (onOpenScheduleRules) {
                              onClose();
                              setTimeout(() => {
                                onOpenScheduleRules();
                              }, 100);
                            } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
                              onClose();
                              setTimeout(() => {
                                window.dispatchEvent(new CustomEvent('openScheduleRules'));
                              }, 100);
                            } else {
                              onClose();
                            }
                          }}
                          {...(Platform.OS === 'web' ? { className: 'btnPrimary' } : {})}
                        >
                          <Text style={styles.successButtonText}>Set Up Schedule Rules →</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.successButton}
                          onPress={onClose}
                        >
                          <Text style={styles.successButtonText}>Sweet! 📚</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                )}
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
    backgroundColor: colors.card,
    borderRadius: 16,
    width: Platform.OS === 'web' ? 600 : '90%',
    maxHeight: '85%',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
      },
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
  iconCirclePeach: {
    backgroundColor: '#FFF4ED',
  },
  iconCircleBlue: {
    backgroundColor: '#EFF6FF',
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 16,
  },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.bgSubtle,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 12,
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  eventsList: {
    gap: 8,
    marginBottom: 16,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.bg,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
  },
  eventItemSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.bgSubtle,
  },
  eventContent: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 12,
    color: colors.muted,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    color: colors.accentContrast,
    fontSize: 14,
    fontWeight: 'bold',
  },
  catchUpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  catchUpButtonDisabled: {
    opacity: 0.6,
  },
  catchUpButtonText: {
    color: colors.accentContrast,
    fontSize: 14,
    fontWeight: '600',
  },
  resultContainer: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  resultNotes: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 12,
  },
  rescheduledList: {
    gap: 8,
  },
  rescheduledItem: {
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rescheduledTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  rescheduledDetails: {
    fontSize: 12,
    color: colors.muted,
  },
  noRescheduledText: {
    fontSize: 14,
    color: colors.muted,
    fontStyle: 'italic',
  },
  startSection: {
    padding: 24,
    paddingTop: 0,
    gap: 16,
  },
  explanationCard: {
    backgroundColor: '#F7F8FC',
    borderRadius: 16,
    padding: 20,
  },
  explanationCardPeach: {
    backgroundColor: '#FFF9F5',
  },
  explanationCardBlue: {
    backgroundColor: '#F0F7FF',
  },
  explanationCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  explanationCardItem: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 6,
  },
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 16,
  },
  eventCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  showMoreText: {
    fontSize: 13,
    color: colors.accent,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  startButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonPeach: {
    backgroundColor: '#F97316',
  },
  startButtonBlue: {
    backgroundColor: '#3B82F6',
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 15,
    fontWeight: '500',
  },
  inputSection: {
    padding: 20,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  dateTo: {
    fontSize: 14,
    color: colors.muted,
  },
  optionsSection: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
    marginBottom: 20,
  },
  optionsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  optionRow: {
    marginBottom: 8,
  },
  optionText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 8,
  },
  loadingSubtext: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 16,
  },
  loadingSteps: {
    alignSelf: 'stretch',
    marginTop: 16,
  },
  loadingStep: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 24,
    marginBottom: 4,
  },
  resultSubtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  changesList: {
    marginTop: 16,
    marginBottom: 20,
  },
  changesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  changeItem: {
    marginBottom: 8,
  },
  changeText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  successButton: {
    flex: 1,
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

