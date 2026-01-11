/**
 * Pack Week Modal
 * Part of Phase 2 - AI Parent Assistant
 * Shows suggested event placement for a week
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
  Modal,
} from 'react-native';
import { X, Package, Calendar, Info } from 'lucide-react';
import { colors } from '../../theme/colors';
import { packWeek } from '../../lib/services/aiClient';

export default function PackWeekModal({
  visible,
  familyId,
  children = [],
  onClose,
  onComplete, // Optional callback with proposedChanges
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [weekStart, setWeekStart] = useState('');
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (visible) {
      // Default to next Monday
      const nextMonday = new Date();
      const dayOfWeek = nextMonday.getDay();
      const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
      nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
      
      setWeekStart(nextMonday.toISOString().split('T')[0]);
      setResult(null);
      setSelectedChildIds([]);
      setHasStarted(false);
      setLoading(false);
    }
  }, [visible]);

  const toggleChild = (childId) => {
    setSelectedChildIds(prev => {
      if (prev.includes(childId)) {
        return prev.filter(id => id !== childId);
      } else {
        return [...prev, childId];
      }
    });
  };

  const handlePack = async () => {
    if (!weekStart) {
      if (Platform.OS === 'web') {
        alert('Please select a week start date');
      }
      return;
    }

    setLoading(true);
    const startTime = Date.now();
    
    try {
      const { data, error } = await packWeek(
        weekStart,
        selectedChildIds.length > 0 ? selectedChildIds : null
      );
      
      const duration = Date.now() - startTime;

      if (error) {
        if (Platform.OS === 'web') {
          alert(`Failed to pack week: ${error.message || error}`);
        }
        return;
      }

      if (data) {
        setResult(data);
        
        // Extract proposedChanges from response
        // Backend may return: { events: [...], proposed_changes: [...] } or { changes: [...] }
        const proposedChanges = data.proposed_changes || data.changes || 
          (data.events ? data.events.map((evt, idx) => ({
            id: `pack-${idx}`,
            kind: 'add',
            label: evt.title || 'New Event',
            when: evt.start ? new Date(evt.start).toLocaleString() : undefined,
            child: children.find(c => c.id === evt.child_id)?.first_name || evt.child_id,
            subject: evt.subject_id,
          })) : []);
        
        // Call onComplete with proposedChanges if provided
        if (onComplete && proposedChanges.length > 0) {
          onComplete({ proposedChanges, result: data });
        }
        
        // Refresh calendar after successful pack
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshCalendar'));
        }
      } else {
      }
    } catch (err) {
      const duration = Date.now() - startTime;

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
              <View style={styles.iconCircleMint}>
                <Package size={20} color="#10B981" />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>Pack your week</Text>
                <Text style={styles.subtitle}>
                  We'll fill your open time slots with tasks from your backlog.
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
                  <View style={styles.explanationCardMint}>
                    <Text style={styles.explanationCardTitle}>What will change</Text>
                    <Text style={styles.explanationCardItem}>Open slots filled from backlog</Text>
                    <Text style={styles.explanationCardItem}>Tasks scheduled strategically</Text>
                    <Text style={styles.explanationCardItem}>Week optimized for productivity</Text>
                  </View>

                  <View style={styles.inputCard}>
                    <Text style={styles.inputCardLabel}>Week start</Text>
                    <TextInput
                      style={styles.dateInput}
                      value={weekStart}
                      onChangeText={setWeekStart}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.muted}
                    />
                  </View>

                  {children.length > 0 && (
                    <View style={styles.inputCard}>
                      <Text style={styles.inputCardLabel}>Children</Text>
                      <Text style={styles.inputCardHint}>Optional - leave empty for all</Text>
                      <View style={styles.childrenList}>
                        {children.map(child => (
                          <TouchableOpacity
                            key={child.id}
                            style={[
                              styles.childChip,
                              selectedChildIds.includes(child.id) && styles.childChipSelected
                            ]}
                            onPress={() => toggleChild(child.id)}
                          >
                            <Text style={[
                              styles.childChipText,
                              selectedChildIds.includes(child.id) && styles.childChipTextSelected
                            ]}>
                              {child.first_name || child.name || 'Unknown'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

              </>
            )}

            {!hasStarted && !loading && (
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.startButton, styles.startButtonMint]}
                  onPress={() => {
                    setHasStarted(true);
                    handlePack();
                  }}
                  disabled={loading}
                >
                  <Text style={styles.startButtonText}>Pack week</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={onClose}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.loadingText}>📦 Packing Your Week...</Text>
                <Text style={styles.loadingSubtext}>Finding the perfect fit for everything!</Text>
                <View style={styles.loadingSteps}>
                  <Text style={styles.loadingStep}>✓ Analyzing backlog items</Text>
                  <Text style={styles.loadingStep}>✓ Mapping out available time</Text>
                  <Text style={styles.loadingStep}>⏳ Matching tasks to time slots</Text>
                  <Text style={styles.loadingStep}>⏳ Balancing subjects throughout the week</Text>
                  <Text style={styles.loadingStep}>⏳ Making sure it all fits just right...</Text>
                </View>
              </View>
            )}

            {result && (
              <View style={styles.resultContainer}>
                <Text style={styles.resultTitle}>Result</Text>
                {result.notes && (
                  <Text style={styles.resultNotes}>{result.notes}</Text>
                )}
                {result.events && result.events.length > 0 ? (
                  <View style={styles.eventsList}>
                    {result.events.map((event, idx) => (
                      <View key={idx} style={styles.eventItem}>
                        <Text style={styles.eventTitle}>{event.title || 'Event'}</Text>
                        <Text style={styles.eventDetails}>
                          {event.start ? new Date(event.start).toLocaleString() : 'TBD'}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noEventsText}>No events suggested yet. This feature is coming soon!</Text>
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
  iconCircleMint: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 0,
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
  dateInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: '#ffffff',
  },
  childrenList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  childChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  childChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  childChipText: {
    fontSize: 13,
    color: colors.text,
  },
  childChipTextSelected: {
    color: colors.accentContrast,
    fontWeight: '600',
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
  startButtonMint: {
    backgroundColor: '#10B981',
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
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 15,
    fontWeight: '500',
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
  eventsList: {
    gap: 8,
  },
  eventItem: {
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  eventDetails: {
    fontSize: 12,
    color: colors.muted,
  },
  noEventsText: {
    fontSize: 14,
    color: colors.muted,
    fontStyle: 'italic',
  },
  startSection: {
    padding: 20,
    paddingTop: 0,
    gap: 14,
  },
  explanationCardMint: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 16,
  },
  explanationCardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  explanationCardItem: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 6,
  },
  inputCard: {
    backgroundColor: '#F7F8FC',
    borderRadius: 16,
    padding: 16,
  },
  inputCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  inputCardHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 10,
  },
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    marginBottom: 16,
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
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  startButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    color: colors.accentContrast,
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
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
});

