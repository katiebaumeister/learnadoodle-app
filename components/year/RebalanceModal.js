/**
 * Rebalance Modal Component
 * Part of Phase 1 - Year-Round Intelligence Core (Chunk F)
 * Allows users to preview and apply rebalance moves for events
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { X, RefreshCw, Check, Clock, Edit2, XCircle } from 'lucide-react';
import { colors } from '../../theme/colors';
import { previewRebalance, applyRebalanceMoves, checkFeatureFlags } from '../../lib/services/yearClient';
import { supabase } from '../../lib/supabase';

export default function RebalanceModal({
  visible,
  event,
  yearPlanId,
  familyId,
  onClose,
  onSuccess,
}) {
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [moves, setMoves] = useState([]);
  const [applying, setApplying] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);
  const [newStartDate, setNewStartDate] = useState('');
  const [newStartTime, setNewStartTime] = useState('');
  const [rebalanceEnabled, setRebalanceEnabled] = useState(false);
  const [skippedMoves, setSkippedMoves] = useState(new Set()); // Track skipped move IDs
  const [editedMoves, setEditedMoves] = useState({}); // Track edited move times {eventId: {date, time}}
  const [editingMoveId, setEditingMoveId] = useState(null); // Currently editing move ID
  const [conflictErrors, setConflictErrors] = useState({}); // Track conflicts {eventId: errorMessage}

  React.useEffect(() => {
    checkFeatureFlags().then(flags => {
      setRebalanceEnabled(flags.rebalance);
    }).catch(() => {
      // Default to true if feature flag check fails (for development)
      setRebalanceEnabled(true);
    });
  }, []);

  React.useEffect(() => {
    if (visible && event) {
      // Pre-fill date/time from event - handle multiple possible formats
      let eventStart;
      if (event.start_ts) {
        eventStart = new Date(event.start_ts);
      } else if (event.start_at) {
        eventStart = new Date(event.start_at);
      } else if (event.start) {
        eventStart = new Date(event.start);
      } else if (event.data?.start_ts) {
        eventStart = new Date(event.data.start_ts);
      } else {
        console.error('[RebalanceModal] No valid start time found in event:', event);
        Alert.alert('Error', 'Event start time not found');
        return;
      }
      
      // Validate date
      if (isNaN(eventStart.getTime())) {
        console.error('[RebalanceModal] Invalid date:', event.start_ts || event.start_at || event.start);
        Alert.alert('Error', 'Invalid event date');
        return;
      }
      
      setNewStartDate(eventStart.toISOString().split('T')[0]);
      setNewStartTime(eventStart.toTimeString().slice(0, 5)); // HH:MM
      setMoves([]);
      setAppliedCount(0);
      setSkippedMoves(new Set());
      setEditedMoves({});
      setEditingMoveId(null);
      setConflictErrors({});
    }
  }, [visible, event]);

  // Check for conflicts with existing events
  const checkConflict = async (eventId, childId, newStart, newEnd) => {
    try {
      if (!childId) {
        console.warn('[RebalanceModal] No childId provided for conflict check');
        return null;
      }
      
      // Query events that might overlap (within a wider time range)
      // We'll check actual overlaps in JavaScript since Supabase doesn't support complex overlap queries easily
      const newStartDate = new Date(newStart);
      const newEndDate = new Date(newEnd);
      
      // Query events in a wider range (1 day before to 1 day after) to catch overlaps
      const queryStart = new Date(newStartDate.getTime() - 24 * 60 * 60 * 1000);
      const queryEnd = new Date(newEndDate.getTime() + 24 * 60 * 60 * 1000);
      
      const { data: existingEvents, error } = await supabase
        .from('events')
        .select('id, title, start_ts, end_ts')
        .eq('child_id', childId)
        .in('status', ['scheduled', 'done'])
        .neq('id', eventId) // Exclude the event being moved
        .gte('start_ts', queryStart.toISOString())
        .lte('end_ts', queryEnd.toISOString());
      
      if (error) {
        console.error('[RebalanceModal] Error checking conflicts:', error);
        return null; // Don't block on error, but log it
      }
      
      // Check for actual overlaps: start < other_end AND end > other_start
      if (existingEvents && existingEvents.length > 0) {
        for (const existingEvent of existingEvents) {
          const existingStart = new Date(existingEvent.start_ts);
          const existingEnd = new Date(existingEvent.end_ts);
          
          // Overlap condition: newStart < existingEnd AND newEnd > existingStart
          if (newStartDate < existingEnd && newEndDate > existingStart) {
            const conflictStart = existingStart;
            return `Conflicts with "${existingEvent.title}" at ${conflictStart.toLocaleDateString()} ${conflictStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
          }
        }
      }
      
      return null; // No conflict
    } catch (err) {
      console.error('[RebalanceModal] Exception checking conflicts:', err);
      return null;
    }
  };

  const handlePreview = async () => {
    if (!event || !yearPlanId || !newStartDate || !newStartTime) {
      Alert.alert('Error', 'Please select a new date and time');
      return;
    }

    setPreviewing(true);
    setMoves([]);

    try {
      const newStart = new Date(`${newStartDate}T${newStartTime}:00`);
      console.log('[RebalanceModal] Preview request:', {
        yearPlanId,
        eventId: event.id,
        newStart: newStart.toISOString()
      });
      
      const { data, error } = await previewRebalance(
        yearPlanId,
        event.id,
        newStart.toISOString()
      );

      console.log('[RebalanceModal] Preview response:', { data, error });

      if (error) {
        console.error('[RebalanceModal] Preview error:', error);
        throw error;
      }

      if (data && data.ok) {
        console.log('[RebalanceModal] Setting moves:', data.moves);
        setMoves(data.moves || []);
        // Reset skip/edit state when new preview is loaded
        setSkippedMoves(new Set());
        setEditedMoves({});
        setEditingMoveId(null);
        setConflictErrors({});
        if (!data.moves || data.moves.length === 0) {
          Alert.alert('No moves', 'No future events found to rebalance for this subject.');
        }
      } else {
        console.error('[RebalanceModal] Preview failed:', data);
        Alert.alert('Error', data?.error || 'Failed to preview rebalance');
      }
    } catch (err) {
      console.error('[RebalanceModal] Preview error:', err);
      Alert.alert('Error', err.message || 'Failed to preview rebalance moves');
    } finally {
      setPreviewing(false);
    }
  };

  const handleApply = async () => {
    if (moves.length === 0) {
      Alert.alert('No moves', 'No moves to apply. Please preview first.');
      return;
    }

    // Use window.confirm for web, Alert.alert for native
    let confirmed;
    if (Platform.OS === 'web') {
      confirmed = window.confirm(`Apply Rebalance\n\nThis will update ${moves.length} event(s). Continue?`);
    } else {
      confirmed = await new Promise((resolve) => {
        Alert.alert(
          'Apply Rebalance',
          `This will update ${moves.length} event(s). Continue?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Apply', onPress: () => resolve(true) },
          ]
        );
      });
    }

    if (!confirmed) {
      console.log('[RebalanceModal] User cancelled apply');
      return;
    }
    
    console.log('[RebalanceModal] User confirmed apply');

    setApplying(true);
    setAppliedCount(0);

    try {
      // Filter out skipped moves and apply edited times
      const movesToApply = moves
        .filter(move => !skippedMoves.has(move.eventId))
        .map(move => {
          // If move was edited, use edited time
          if (editedMoves[move.eventId]) {
            const edited = editedMoves[move.eventId];
            const editedStart = new Date(`${edited.date}T${edited.time}:00`);
            return {
              ...move,
              proposedStart: editedStart.toISOString()
            };
          }
          return move;
        });
      
      // Check all moves for conflicts before applying
      const conflicts = [];
      for (const move of movesToApply) {
        const moveStart = new Date(move.proposedStart);
        
        // Get event duration from database
        const { data: eventData } = await supabase
          .from('events')
          .select('start_ts, end_ts')
          .eq('id', move.eventId)
          .single();
        
        const durationMs = eventData 
          ? new Date(eventData.end_ts) - new Date(eventData.start_ts)
          : 60 * 60 * 1000; // Default to 1 hour if not found
        
        const moveEnd = new Date(moveStart.getTime() + durationMs);
        
        // All moves are for the same child (from rebalance RPC)
        const conflict = await checkConflict(
          move.eventId,
          event?.child_id,
          moveStart.toISOString(),
          moveEnd.toISOString()
        );
        
        if (conflict) {
          conflicts.push({ eventId: move.eventId, message: conflict });
        }
      }
      
      if (conflicts.length > 0) {
        const conflictMessages = conflicts.map(c => `• ${c.message}`).join('\n');
        Alert.alert(
          'Conflicts Detected',
          `Cannot apply moves due to conflicts:\n\n${conflictMessages}\n\nPlease edit or skip conflicting moves.`
        );
        // Mark conflicts in UI
        const newErrors = {};
        conflicts.forEach(c => {
          newErrors[c.eventId] = c.message;
        });
        setConflictErrors(newErrors);
        setApplying(false);
        return;
      }
      
      console.log('[RebalanceModal] Starting apply with', movesToApply.length, 'moves (skipped', skippedMoves.size, ')');
      
      // Progress callback to update UI in real-time
      const onProgress = (applied, total) => {
        console.log('[RebalanceModal] Progress update:', applied, '/', total);
        setAppliedCount(applied);
      };
      
      const result = await applyRebalanceMoves(movesToApply, onProgress);
      
      console.log('[RebalanceModal] Apply result:', result);
      
      if (result.error) {
        console.error('[RebalanceModal] Apply returned error:', result.error);
        throw result.error;
      }

      const successCount = result.data?.applied || 0;
      const skippedCount = result.data?.skipped || 0;

      console.log('[RebalanceModal] Apply complete - applied:', successCount, 'skipped:', skippedCount);

      setAppliedCount(successCount);

      if (successCount > 0) {
        // Use window.alert for web, Alert.alert for native
        if (Platform.OS === 'web') {
          window.alert(`Success!\n\nApplied ${successCount} move(s)${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}.`);
        } else {
          Alert.alert(
            'Success',
            `Applied ${successCount} move(s)${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}.`,
            [{ text: 'OK' }]
          );
        }
        
        // Refresh calendar after applying moves
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshCalendar'));
        }
        onSuccess?.();
        handleClose();
      } else {
        const errorMsg = `All moves were skipped. ${result.data?.errors?.length > 0 ? result.data.errors.join(', ') : 'Check console for details.'}`;
        if (Platform.OS === 'web') {
          window.alert(`No moves applied\n\n${errorMsg}`);
        } else {
          Alert.alert('No moves applied', errorMsg);
        }
      }
    } catch (err) {
      console.error('[RebalanceModal] Apply error:', err);
      Alert.alert(
        'Error',
        `Failed to apply moves: ${err.message || 'Unknown error'}. ${appliedCount > 0 ? `${appliedCount} move(s) were applied before the error.` : ''}`
      );
    } finally {
      setApplying(false);
    }
  };

  const handleClose = () => {
    setMoves([]);
    setAppliedCount(0);
    setNewStartDate('');
    setNewStartTime('');
    onClose();
  };

  if (!visible) return null;
  
  // Note: rebalanceEnabled check removed - allow modal to show even if flag is off
  // The backend will handle authorization

  const eventTitle = event?.title || 'Event';
  let eventDate = '';
  if (event) {
    const startTime = event.start_ts || event.start_at || event.start || event.data?.start_ts;
    if (startTime) {
      const date = new Date(startTime);
      if (!isNaN(date.getTime())) {
        eventDate = date.toLocaleDateString();
      }
    }
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <RefreshCw size={20} color={colors.accent} />
            <Text style={styles.title}>Rebalance Subject</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <X size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.description}>
            Move "{eventTitle}" and shift all future events for this subject proportionally.
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>New Start Time</Text>
            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Date</Text>
                {Platform.OS === 'web' ? (
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    style={styles.dateInput}
                  />
                ) : (
                  <TextInput
                    style={styles.dateInput}
                    value={newStartDate}
                    onChangeText={setNewStartDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.muted}
                  />
                )}
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Time</Text>
                {Platform.OS === 'web' ? (
                  <input
                    type="time"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    style={styles.timeInput}
                  />
                ) : (
                  <TextInput
                    style={styles.timeInput}
                    value={newStartTime}
                    onChangeText={setNewStartTime}
                    placeholder="HH:MM"
                    placeholderTextColor={colors.muted}
                  />
                )}
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, styles.previewButton, (previewing || !newStartDate || !newStartTime) && styles.buttonDisabled]}
            onPress={handlePreview}
            disabled={previewing || !newStartDate || !newStartTime}
          >
            {previewing ? (
              <>
                <ActivityIndicator size="small" color={colors.accentContrast} />
                <Text style={styles.buttonText}>Previewing...</Text>
              </>
            ) : (
              <>
                <Clock size={16} color={colors.accentContrast} />
                <Text style={styles.buttonText}>Preview Moves</Text>
              </>
            )}
          </TouchableOpacity>

          {moves.length > 0 && (
            <View style={styles.movesSection}>
              <Text style={styles.sectionTitle}>
                Proposed Moves ({moves.length - skippedMoves.size} of {moves.length} will be applied)
              </Text>
              <ScrollView style={styles.movesList}>
                {moves.map((move, index) => {
                  const isSkipped = skippedMoves.has(move.eventId);
                  const isEditing = editingMoveId === move.eventId;
                  const edited = editedMoves[move.eventId];
                  
                  const currentDate = new Date(move.currentStart);
                  const proposedDate = edited 
                    ? new Date(`${edited.date}T${edited.time}:00`)
                    : new Date(move.proposedStart);
                  
                  const editDate = edited?.date || proposedDate.toISOString().split('T')[0];
                  const editTime = edited?.time || proposedDate.toTimeString().slice(0, 5);
                  
                  return (
                    <View key={move.eventId || index} style={[styles.moveItem, isSkipped && styles.moveItemSkipped]}>
                      <View style={styles.moveHeader}>
                        <View style={styles.moveHeaderLeft}>
                          <Text style={styles.moveIndex}>#{index + 1}</Text>
                          <Text style={styles.moveReason}>{move.reason || 'Schedule shift'}</Text>
                          {isSkipped && <Text style={styles.skippedBadge}>Skipped</Text>}
                        </View>
                        <View style={styles.moveActions}>
                          {!isSkipped && (
                            <TouchableOpacity
                              onPress={async () => {
                                if (isEditing) {
                                  // Validate and save edit
                                  const editedStart = new Date(`${editDate}T${editTime}:00`);
                                  
                                  // Get event duration from database
                                  const { data: eventData } = await supabase
                                    .from('events')
                                    .select('start_ts, end_ts')
                                    .eq('id', move.eventId)
                                    .single();
                                  
                                  const durationMs = eventData 
                                    ? new Date(eventData.end_ts) - new Date(eventData.start_ts)
                                    : 60 * 60 * 1000; // Default to 1 hour if not found
                                  
                                  const editedEnd = new Date(editedStart.getTime() + durationMs);
                                  
                                  // Check for conflicts (all moves are for the same child)
                                  const conflict = await checkConflict(
                                    move.eventId,
                                    event?.child_id,
                                    editedStart.toISOString(),
                                    editedEnd.toISOString()
                                  );
                                  
                                  if (conflict) {
                                    setConflictErrors({
                                      ...conflictErrors,
                                      [move.eventId]: conflict
                                    });
                                    Alert.alert('Conflict Detected', conflict);
                                    return; // Don't save if conflict
                                  }
                                  
                                  // Clear conflict error if resolved
                                  const newErrors = { ...conflictErrors };
                                  delete newErrors[move.eventId];
                                  setConflictErrors(newErrors);
                                  
                                  // Save edit
                                  setEditedMoves({
                                    ...editedMoves,
                                    [move.eventId]: { date: editDate, time: editTime }
                                  });
                                  setEditingMoveId(null);
                                } else {
                                  // Start editing
                                  setEditingMoveId(move.eventId);
                                  // Clear any previous conflict error
                                  const newErrors = { ...conflictErrors };
                                  delete newErrors[move.eventId];
                                  setConflictErrors(newErrors);
                                }
                              }}
                              style={styles.editButton}
                            >
                              <Edit2 size={14} color={colors.accent} />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            onPress={() => {
                              const newSkipped = new Set(skippedMoves);
                              if (isSkipped) {
                                newSkipped.delete(move.eventId);
                              } else {
                                newSkipped.add(move.eventId);
                                // Clear edit if skipping
                                const newEdited = { ...editedMoves };
                                delete newEdited[move.eventId];
                                setEditedMoves(newEdited);
                                setEditingMoveId(null);
                              }
                              setSkippedMoves(newSkipped);
                            }}
                            style={styles.skipButton}
                          >
                            <XCircle size={14} color={isSkipped ? colors.success : colors.error} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={styles.moveTimes}>
                        <View style={styles.timeChange}>
                          <Text style={styles.timeLabel}>From:</Text>
                          <Text style={styles.timeValue}>
                            {currentDate.toLocaleDateString()} {currentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        <Text style={styles.arrow}>→</Text>
                        {isEditing ? (
                          <View style={styles.editInputs}>
                            <input
                              type="date"
                              value={editDate}
                              onChange={(e) => {
                                setEditedMoves({
                                  ...editedMoves,
                                  [move.eventId]: { date: e.target.value, time: editTime }
                                });
                              }}
                              style={styles.editDateInput}
                            />
                            <input
                              type="time"
                              value={editTime}
                              onChange={(e) => {
                                setEditedMoves({
                                  ...editedMoves,
                                  [move.eventId]: { date: editDate, time: e.target.value }
                                });
                              }}
                              style={styles.editTimeInput}
                            />
                          </View>
                        ) : (
                          <View style={styles.timeChange}>
                            <Text style={styles.timeLabel}>To:</Text>
                            <Text style={[styles.timeValue, styles.proposedTime, isSkipped && styles.timeValueSkipped]}>
                              {proposedDate.toLocaleDateString()} {proposedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                            {conflictErrors[move.eventId] && (
                              <Text style={styles.conflictError}>
                                ⚠️ {conflictErrors[move.eventId]}
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={[styles.button, styles.applyButton, applying && styles.buttonDisabled]}
                onPress={handleApply}
                disabled={applying}
              >
                {applying ? (
                  <>
                    <ActivityIndicator size="small" color={colors.accentContrast} />
                    <Text style={styles.buttonText}>
                      Applying... ({appliedCount}/{moves.length - skippedMoves.size})
                    </Text>
                  </>
                ) : (
                  <>
                    <Check size={16} color={colors.accentContrast} />
                    <Text style={styles.buttonText}>Apply Moves</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
  },
  modal: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    width: '90%',
    maxWidth: 600,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
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
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  description: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroup: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  dateInput: {
    width: '100%',
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    fontSize: 14,
    backgroundColor: colors.bg,
  },
  timeInput: {
    width: '100%',
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    fontSize: 14,
    backgroundColor: colors.bg,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  previewButton: {
    backgroundColor: colors.accent,
  },
  applyButton: {
    backgroundColor: colors.greenBold || '#10b981',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.accentContrast,
    fontSize: 14,
    fontWeight: '500',
  },
  movesSection: {
    marginTop: 8,
  },
  movesList: {
    maxHeight: 300,
    marginBottom: 16,
  },
  moveItem: {
    padding: 12,
    backgroundColor: colors.bgSecondary || '#f9fafb',
    borderRadius: 8,
    marginBottom: 8,
  },
  moveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  moveHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  moveActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    padding: 4,
  },
  skipButton: {
    padding: 4,
  },
  skippedBadge: {
    fontSize: 11,
    color: colors.muted,
    marginLeft: 8,
    fontStyle: 'italic',
  },
  moveItemSkipped: {
    opacity: 0.5,
  },
  editInputs: {
    flexDirection: 'row',
    gap: 8,
  },
  editDateInput: {
    padding: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    fontSize: 14,
  },
  editTimeInput: {
    padding: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    fontSize: 14,
  },
  timeValueSkipped: {
    textDecorationLine: 'line-through',
  },
  conflictError: {
    fontSize: 11,
    color: colors.error || '#ef4444',
    marginTop: 4,
    fontStyle: 'italic',
  },
  moveIndex: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  moveReason: {
    fontSize: 12,
    color: colors.muted,
    flex: 1,
  },
  moveTimes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeChange: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 2,
  },
  timeValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  proposedTime: {
    color: colors.greenBold || '#10b981',
  },
  arrow: {
    fontSize: 16,
    color: colors.muted,
    marginTop: 12,
  },
});

