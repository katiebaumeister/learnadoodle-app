/**
 * Rebalance Modal
 * Analyzes schedule imbalances and suggests moves to balance workload
 */

import React, { useState, useEffect, Fragment } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
import { X, RefreshCw, AlertCircle, Check, Clock, User, BookOpen } from 'lucide-react';
import { colors } from '../../../theme/colors';
import { supabase } from '../../../lib/supabase';
import { rescheduleEvent } from '../../../lib/services/plannerClientWithOffline';

const BG = '#ffffff';
const FG = '#111827';
const SUB = '#6b7280';
const BORDER = '#e5e7eb';
const MUTED = '#9ca3af';
const ACCENT = '#2563eb';
const ACCENT_LIGHT = '#dbeafe';

// Date formatting helper
function fmt(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  const weekStart = new Date(d.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

function getWeekEnd(date = new Date()) {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd;
}

export default function RebalanceModal({
  visible,
  familyId,
  children = [],
  selectedChildIds = null,
  onClose,
  onComplete,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [hasRun, setHasRun] = useState(false);
  const [applying, setApplying] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setSuggestions([]);
      setHasRun(false);
      setError(null);
    }
  }, [visible]);

  const runRebalance = async () => {
    if (!familyId) {
      setError('Family ID is required');
      return;
    }

    setLoading(true);
    setError(null);
    setSuggestions([]);

    try {
      // Get child IDs to analyze
      const childIdsToAnalyze = selectedChildIds && selectedChildIds.length > 0
        ? selectedChildIds
        : children.map(c => c.id).filter(Boolean);

      if (childIdsToAnalyze.length === 0) {
        setError('No children selected');
        setLoading(false);
        return;
      }

      // Calculate date range (current week + 3 future weeks = 4 weeks total)
      const today = new Date();
      const startDate = getWeekStart(today);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 28); // 4 weeks

      // Fetch events for the date range
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, title, start_ts, end_ts, child_id, subject_id, status')
        .eq('family_id', familyId)
        .in('child_id', childIdsToAnalyze)
        .gte('start_ts', startDate.toISOString())
        .lte('start_ts', endDate.toISOString())
        .neq('status', 'canceled')
        .is('canceled_at', null)
        .is('deleted_at', null)
        .order('start_ts', { ascending: true });

      // Fetch subjects separately to get names
      const subjectIds = [...new Set((events || []).map(e => e.subject_id).filter(Boolean))];
      let subjectsMap = {};
      if (subjectIds.length > 0) {
        const { data: subjects, error: subjectsError } = await supabase
          .from('subject')
          .select('id, name')
          .in('id', subjectIds);
        
        if (!subjectsError && subjects) {
          subjectsMap = subjects.reduce((acc, sub) => {
            acc[sub.id] = sub.name;
            return acc;
          }, {});
        }
      }
      
      // Add subject names to events
      const eventsWithSubjects = (events || []).map(event => ({
        ...event,
        subject: event.subject_id ? { id: event.subject_id, name: subjectsMap[event.subject_id] || 'No Subject' } : null,
      }));

      if (eventsError) throw eventsError;

      // Analyze imbalances
      const analysis = analyzeImbalances(eventsWithSubjects || [], childIdsToAnalyze, startDate);
      const suggestions = generateSuggestions(analysis, eventsWithSubjects || []);
      
      setSuggestions(suggestions);
      setHasRun(true);
    } catch (err) {
      console.error('Rebalance error:', err);
      setError(err.message || 'Failed to analyze schedule');
    } finally {
      setLoading(false);
    }
  };

  const analyzeImbalances = (events, childIds, weekStart) => {
    // Group events by week and child
    const weeks = [];
    for (let i = 0; i < 4; i++) {
      const weekStartDate = new Date(weekStart);
      weekStartDate.setDate(weekStartDate.getDate() + (i * 7));
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekEndDate.getDate() + 6);
      
      weeks.push({
        start: weekStartDate,
        end: weekEndDate,
        childEvents: {},
        childMinutes: {},
        subjectEvents: {},
        subjectMinutes: {},
      });
    }

    // Categorize events into weeks
    events.forEach(event => {
      const eventDate = new Date(event.start_ts);
      const eventEnd = new Date(event.end_ts);
      const durationMinutes = (eventEnd - eventDate) / (1000 * 60);

      for (let i = 0; i < weeks.length; i++) {
        const week = weeks[i];
        if (eventDate >= week.start && eventDate <= week.end) {
          const childId = event.child_id;
          const subjectId = event.subject_id || 'none';

          // Count by child
          if (!week.childEvents[childId]) {
            week.childEvents[childId] = [];
            week.childMinutes[childId] = 0;
          }
          week.childEvents[childId].push(event);
          week.childMinutes[childId] += durationMinutes;

          // Count by subject
          if (!week.subjectEvents[subjectId]) {
            week.subjectEvents[subjectId] = [];
            week.subjectMinutes[subjectId] = 0;
          }
          week.subjectEvents[subjectId].push(event);
          week.subjectMinutes[subjectId] += durationMinutes;
          break;
        }
      }
    });

    // Calculate averages and identify imbalances
    const imbalances = {
      childImbalances: [],
      subjectImbalances: [],
    };

    // Analyze child imbalances (compare each child to average)
    weeks.forEach((week, weekIndex) => {
      const childIdsInWeek = Object.keys(week.childMinutes);
      if (childIdsInWeek.length < 2) return; // Need at least 2 children to compare

      const totalMinutes = Object.values(week.childMinutes).reduce((sum, min) => sum + min, 0);
      const avgMinutes = totalMinutes / childIdsInWeek.length;
      const threshold = avgMinutes * 1.5; // 50% above average is imbalanced

      childIdsInWeek.forEach(childId => {
        const minutes = week.childMinutes[childId];
        if (minutes > threshold) {
          imbalances.childImbalances.push({
            weekIndex,
            weekStart: week.start,
            childId,
            minutes,
            avgMinutes,
            events: week.childEvents[childId],
          });
        }
      });
    });

    // Analyze subject imbalances (compare subjects to each other within same week)
    weeks.forEach((week, weekIndex) => {
      const subjectIds = Object.keys(week.subjectMinutes);
      if (subjectIds.length < 2) return;

      const totalMinutes = Object.values(week.subjectMinutes).reduce((sum, min) => sum + min, 0);
      const avgMinutes = totalMinutes / subjectIds.length;
      const threshold = avgMinutes * 1.5;

      subjectIds.forEach(subjectId => {
        const minutes = week.subjectMinutes[subjectId];
        if (minutes > threshold) {
          imbalances.subjectImbalances.push({
            weekIndex,
            weekStart: week.start,
            subjectId,
            subjectName: week.subjectEvents[subjectId][0]?.subject?.name || 'No Subject',
            minutes,
            avgMinutes,
            events: week.subjectEvents[subjectId],
          });
        }
      });
    });

    return imbalances;
  };

  const generateSuggestions = (analysis, allEvents) => {
    const suggestions = [];

    // Generate suggestions for child imbalances
    analysis.childImbalances.forEach(imbalance => {
      const heavyChild = children.find(c => c.id === imbalance.childId);
      if (!heavyChild) return;

      // Find lighter weeks for other children to move events to
      const weekStartDate = imbalance.weekStart;
      const heavyWeekEvents = imbalance.events;
      
      // Sort events by duration (longest first) for easier moving
      const sortedEvents = [...heavyWeekEvents].sort((a, b) => {
        const aDur = (new Date(a.end_ts) - new Date(a.start_ts)) / (1000 * 60);
        const bDur = (new Date(b.end_ts) - new Date(b.start_ts)) / (1000 * 60);
        return bDur - aDur;
      });

      // Suggest moving a few of the longest events to adjacent weeks
      const eventsToMove = sortedEvents.slice(0, Math.min(3, sortedEvents.length));
      
      eventsToMove.forEach(event => {
        // Suggest moving to the week after (forward)
        const eventDate = new Date(event.start_ts);
        const weekAfter = new Date(weekStartDate);
        weekAfter.setDate(weekAfter.getDate() + 7);
        
        // Calculate the day of week offset
        const dayOfWeek = eventDate.getDay();
        const weekStartDayOfWeek = weekStartDate.getDay();
        const dayOffset = dayOfWeek - weekStartDayOfWeek;
        
        const suggestedTime = new Date(weekAfter);
        suggestedTime.setDate(weekAfter.getDate() + dayOffset);
        suggestedTime.setHours(eventDate.getHours(), eventDate.getMinutes(), 0, 0);
        
        suggestions.push({
          type: 'child_imbalance',
          eventId: event.id,
          eventTitle: event.title,
          childId: imbalance.childId,
          childName: heavyChild.first_name || heavyChild.name,
          reason: `Heavy week: ${Math.round(imbalance.minutes)} min vs avg ${Math.round(imbalance.avgMinutes)} min`,
          currentDate: new Date(event.start_ts),
          suggestedDate: suggestedTime,
          subjectName: event.subject?.name || 'No Subject',
        });
      });
    });

    // Generate suggestions for subject imbalances
    analysis.subjectImbalances.forEach(imbalance => {
      const heavyWeekEvents = imbalance.events;
      
      // Sort by duration
      const sortedEvents = [...heavyWeekEvents].sort((a, b) => {
        const aDur = (new Date(a.end_ts) - new Date(a.start_ts)) / (1000 * 60);
        const bDur = (new Date(b.end_ts) - new Date(b.start_ts)) / (1000 * 60);
        return bDur - aDur;
      });

      // Suggest moving events to adjacent weeks
      const eventsToMove = sortedEvents.slice(0, Math.min(3, sortedEvents.length));
      
      eventsToMove.forEach(event => {
        const eventDate = new Date(event.start_ts);
        const weekAfter = new Date(imbalance.weekStart);
        weekAfter.setDate(weekAfter.getDate() + 7);
        
        // Calculate the day of week offset
        const dayOfWeek = eventDate.getDay();
        const weekStartDayOfWeek = imbalance.weekStart.getDay();
        const dayOffset = dayOfWeek - weekStartDayOfWeek;
        
        const suggestedTime = new Date(weekAfter);
        suggestedTime.setDate(weekAfter.getDate() + dayOffset);
        suggestedTime.setHours(eventDate.getHours(), eventDate.getMinutes(), 0, 0);

        const child = children.find(c => c.id === event.child_id);
        
        suggestions.push({
          type: 'subject_imbalance',
          eventId: event.id,
          eventTitle: event.title,
          childId: event.child_id,
          childName: child?.first_name || child?.name || 'Unknown',
          reason: `${imbalance.subjectName} is heavy: ${Math.round(imbalance.minutes)} min vs avg ${Math.round(imbalance.avgMinutes)} min`,
          currentDate: new Date(event.start_ts),
          suggestedDate: suggestedTime,
          subjectName: imbalance.subjectName,
        });
      });
    });

    return suggestions;
  };

  const applyChanges = async () => {
    if (suggestions.length === 0) return;

    setApplying(true);
    setError(null);

    try {
      let successCount = 0;
      let failCount = 0;

      for (const suggestion of suggestions) {
        try {
          // Get event to calculate duration
          const { data: eventData } = await supabase
            .from('events')
            .select('start_ts, end_ts')
            .eq('id', suggestion.eventId)
            .single();

          if (!eventData) {
            failCount++;
            continue;
          }

          const eventStartTime = new Date(eventData.start_ts);
          const eventEndTime = new Date(eventData.end_ts);
          const durationMs = eventEndTime - eventStartTime;
          
          // Use suggested date and preserve time of day
          const newStartTime = new Date(suggestion.suggestedDate);
          newStartTime.setHours(eventStartTime.getHours(), eventStartTime.getMinutes(), 0, 0);
          const newEndTime = new Date(newStartTime.getTime() + durationMs);

          const result = await rescheduleEvent(
            suggestion.eventId,
            newStartTime.toISOString(),
            newEndTime.toISOString(),
            'rebalance',
            'Rebalanced schedule',
            familyId
          );

          if (result.error) {
            console.error('Reschedule error:', result.error);
            failCount++;
          } else {
            successCount++;
          }
        } catch (err) {
          console.error('Failed to apply suggestion:', suggestion.eventId, err);
          failCount++;
        }
      }

      if (failCount > 0) {
        setError(`Applied ${successCount} changes, ${failCount} failed`);
      }

      if (onComplete) {
        onComplete({ successCount, failCount });
      }
      
      onClose();
    } catch (err) {
      console.error('Apply changes error:', err);
      setError(err.message || 'Failed to apply changes');
    } finally {
      setApplying(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity 
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity 
          style={styles.modal}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {error && (
            <View style={styles.errorBanner}>
              <AlertCircle size={16} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {/* Description Section */}
            <View style={styles.section}>
              <Text style={styles.description}>
                Rebalance analyzes your schedule to identify imbalances where one child has too many events in a week, 
                or one subject is disproportionately heavy. It then suggests moving events to adjacent weeks to create 
                a more balanced workload.
              </Text>
            </View>

            {/* Suggestions Section */}
            {hasRun && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Suggested Changes ({suggestions.length})
                </Text>
                {suggestions.length === 0 ? (
                  <Text style={styles.noSuggestionsText}>
                    No imbalances detected. Your schedule is well-balanced!
                  </Text>
                ) : (
                  <View style={styles.suggestionsList}>
                    {suggestions.map((suggestion, index) => (
                      <View key={index} style={styles.suggestionItem}>
                        <View style={styles.suggestionHeader}>
                          <View style={styles.suggestionIcon}>
                            {suggestion.type === 'child_imbalance' ? (
                              <User size={16} color={ACCENT} />
                            ) : (
                              <BookOpen size={16} color={ACCENT} />
                            )}
                          </View>
                          <View style={styles.suggestionContent}>
                            <Text style={styles.suggestionTitle}>{suggestion.eventTitle}</Text>
                            <Text style={styles.suggestionReason}>{suggestion.reason}</Text>
                            <View style={styles.suggestionDetails}>
                              <Text style={styles.suggestionDetail}>
                                {suggestion.childName} • {suggestion.subjectName}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.suggestionMove}>
                          <View style={styles.dateRow}>
                            <Clock size={14} color={SUB} />
                            <Text style={styles.dateText}>
                              {fmt(suggestion.currentDate)} → {fmt(suggestion.suggestedDate)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            {!hasRun ? (
              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                onPress={runRebalance}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Run Rebalance</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.primaryButton, (applying || suggestions.length === 0) && styles.buttonDisabled]}
                onPress={applyChanges}
                disabled={applying || suggestions.length === 0}
              >
                {applying ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Apply Changes</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: 720,
    maxWidth: '100%',
    maxHeight: Platform.OS === 'web' ? '90vh' : '90%',
    backgroundColor: BG,
    borderRadius: 16,
    flexDirection: 'column',
    ...Platform.select({
      web: {
        boxShadow: '0 10px 20px rgba(0, 0, 0, 0.15)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: 6,
      },
    }),
    overflow: 'hidden',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    padding: 12,
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  description: {
    fontSize: 14,
    color: SUB,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: FG,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestionsList: {
    gap: 12,
  },
  suggestionItem: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fafafa',
  },
  suggestionHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  suggestionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ACCENT_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestionReason: {
    fontSize: 12,
    color: SUB,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestionDetails: {
    marginTop: 4,
  },
  suggestionDetail: {
    fontSize: 12,
    color: MUTED,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestionMove: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 12,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 12,
    color: FG,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  noSuggestionsText: {
    fontSize: 14,
    color: SUB,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  cancelText: {
    color: SUB,
    fontSize: 14,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  primaryButton: {
    backgroundColor: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

