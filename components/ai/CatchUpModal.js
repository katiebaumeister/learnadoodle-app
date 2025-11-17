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
} from 'react-native';
import { X, RotateCcw, AlertCircle, Info } from 'lucide-react';
import { colors } from '../../theme/colors';
import { catchUp } from '../../lib/services/aiClient';
import { supabase } from '../../lib/supabase';

export default function CatchUpModal({
  visible,
  familyId,
  onClose,
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [missedEvents, setMissedEvents] = useState([]);
  const [selectedEventIds, setSelectedEventIds] = useState([]);

  useEffect(() => {
    if (visible && familyId) {
      loadMissedEvents();
      setResult(null);
      setSelectedEventIds([]);
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
        console.error('[CatchUpModal] Error loading missed events:', error);
        return;
      }

      setMissedEvents(data || []);
    } catch (err) {
      console.error('[CatchUpModal] Exception loading missed events:', err);
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
    if (selectedEventIds.length === 0) {
      if (Platform.OS === 'web') {
        alert('Please select at least one missed event');
      }
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await catchUp(selectedEventIds);
      
      if (error) {
        console.error('[CatchUpModal] Error:', error);
        if (Platform.OS === 'web') {
          alert(`Failed to catch up: ${error.message || error}`);
        }
        return;
      }

      if (data) {
        setResult(data);
      }
    } catch (err) {
      console.error('[CatchUpModal] Exception:', err);
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
            <View style={styles.headerLeft}>
              <RotateCcw size={20} color={colors.accent} />
              <Text style={styles.title}>Catch Up</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            <View style={styles.infoBox}>
              <Info size={16} color={colors.accent} />
              <Text style={styles.infoText}>
                Select missed events to reschedule. AI will find optimal time slots to catch up on missed work.
              </Text>
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
                <View style={styles.eventsList}>
                  {missedEvents.map(event => {
                    const isSelected = selectedEventIds.includes(event.id);
                    return (
                      <TouchableOpacity
                        key={event.id}
                        style={[
                          styles.eventItem,
                          isSelected && styles.eventItemSelected
                        ]}
                        onPress={() => toggleEvent(event.id)}
                      >
                        <View style={styles.eventContent}>
                          <Text style={styles.eventTitle}>{event.title || 'Untitled Event'}</Text>
                          <Text style={styles.eventDate}>
                            {event.start_ts ? new Date(event.start_ts).toLocaleDateString() : 'Date TBD'}
                          </Text>
                        </View>
                        {isSelected && (
                          <View style={styles.checkmark}>
                            <Text style={styles.checkmarkText}>✓</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={[
                    styles.catchUpButton,
                    (loading || selectedEventIds.length === 0) && styles.catchUpButtonDisabled
                  ]}
                  onPress={handleCatchUp}
                  disabled={loading || selectedEventIds.length === 0}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.accentContrast} />
                  ) : (
                    <>
                      <RotateCcw size={16} color={colors.accentContrast} />
                      <Text style={styles.catchUpButtonText}>
                        Catch Up ({selectedEventIds.length} selected)
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            {result && (
              <View style={styles.resultContainer}>
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
    borderRadius: 12,
    width: Platform.OS === 'web' ? 600 : '90%',
    maxHeight: '80%',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
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
    padding: 32,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 12,
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: colors.muted,
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
});

