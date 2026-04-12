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
import { X, Check, Clock } from 'lucide-react';
import { colors } from '../../theme/colors';
import { previewRebalance, previewRebalanceRhythm, applyRebalanceMoves, checkFeatureFlags } from '../../lib/services/yearClient';
import { supabase } from '../../lib/supabase';
import { t } from '../../lib/i18n/strings';

/** Prefer `child_id`; else first `child_ids` entry (overlaps / flexible assignees). */
function effectiveChildIdFromEventRow(row) {
  if (!row) return null;
  if (row.child_id) return String(row.child_id);
  const ids = row.child_ids;
  if (Array.isArray(ids) && ids.length > 0) return String(ids[0]);
  return null;
}

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
  const [rhythmInsights, setRhythmInsights] = useState(null);
  /** 'sug:<uuid>' | 'bl:<uuid>' while a one-click schedule is in flight */
  const [schedulingId, setSchedulingId] = useState(null);
  const [howWorksOpen, setHowWorksOpen] = useState(false);
  const [closeHovered, setCloseHovered] = useState(false);
  const autoRhythmPreviewRanRef = React.useRef(false);

  React.useEffect(() => {
    if (!visible) setCloseHovered(false);
  }, [visible]);

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
        Alert.alert('Error', 'Event start time not found');
        return;
      }
      
      // Validate date
      if (isNaN(eventStart.getTime())) {
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

  // Check for conflicts with existing events (same child via child_id OR child_ids[])
  const checkConflict = async (eventId, childId, newStart, newEnd) => {
    try {
      if (!childId) {
        return null;
      }

      const newStartDate = new Date(newStart);
      const newEndDate = new Date(newEnd);
      const queryStart = new Date(newStartDate.getTime() - 24 * 60 * 60 * 1000);
      const queryEnd = new Date(newEndDate.getTime() + 24 * 60 * 60 * 1000);
      const rangeStart = queryStart.toISOString();
      const rangeEnd = queryEnd.toISOString();

      const selectCols = 'id, title, start_ts, end_ts';
      const base = () =>
        supabase
          .from('events')
          .select(selectCols)
          .in('status', ['scheduled', 'done'])
          .neq('id', eventId)
          .gte('start_ts', rangeStart)
          .lte('end_ts', rangeEnd);

      const { data: byChildId, error: err1 } = await base().eq('child_id', childId);
      if (err1) {
        return null;
      }

      let byChildIdsArr = [];
      const res2 = await base().contains('child_ids', [childId]);
      if (!res2.error && res2.data) {
        byChildIdsArr = res2.data;
      }

      const merged = new Map();
      (byChildId || []).forEach((row) => merged.set(row.id, row));
      (byChildIdsArr || []).forEach((row) => merged.set(row.id, row));
      const existingEvents = [...merged.values()];

      for (const existingEvent of existingEvents) {
        const existingStart = new Date(existingEvent.start_ts);
        const existingEnd = new Date(existingEvent.end_ts);
        if (newStartDate < existingEnd && newEndDate > existingStart) {
          const conflictStart = existingStart;
          return `Conflicts with "${existingEvent.title}" at ${conflictStart.toLocaleDateString()} ${conflictStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
      }

      return null;
    } catch (err) {
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

      const { data, error } = await previewRebalance(
        yearPlanId,
        event.id,
        newStart.toISOString()
      );

      if (error) {
        throw error;
      }

      if (data && data.ok) {
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
        Alert.alert('Error', data?.error || 'Failed to preview rebalance');
      }
    } catch (err) {
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

    const selectedCount = moves.filter((m) => !skippedMoves.has(m.eventId)).length;
    if (selectedCount === 0) {
      Alert.alert('No moves selected', 'Include at least one move or un-skip a row.');
      return;
    }

    // Use window.confirm for web, Alert.alert for native
    let confirmed;
    if (Platform.OS === 'web') {
      confirmed = window.confirm(`Apply Rebalance\n\nThis will update ${selectedCount} event(s). Continue?`);
    } else {
      confirmed = await new Promise((resolve) => {
        Alert.alert(
          'Apply Rebalance',
          `This will update ${selectedCount} event(s). Continue?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Apply', onPress: () => resolve(true) },
          ]
        );
      });
    }

    if (!confirmed) {
      return;
    }

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
          .select('start_ts, end_ts, child_id, child_ids')
          .eq('id', move.eventId)
          .single();

        const durationMs = eventData
          ? new Date(eventData.end_ts) - new Date(eventData.start_ts)
          : 60 * 60 * 1000; // Default to 1 hour if not found

        const moveEnd = new Date(moveStart.getTime() + durationMs);

        const childId = effectiveChildIdFromEventRow({
          child_id: event?.child_id || eventData?.child_id,
          child_ids: eventData?.child_ids,
        });
        const conflict = await checkConflict(
          move.eventId,
          childId,
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

      // Progress callback to update UI in real-time
      const onProgress = (applied, total) => {
        setAppliedCount(applied);
      };
      
      const result = await applyRebalanceMoves(movesToApply, onProgress);

      if (result.error) {
        throw result.error;
      }

      const successCount = result.data?.applied || 0;
      const skippedCount = result.data?.skipped || 0;

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
    setRhythmInsights(null);
    setSchedulingId(null);
    setHowWorksOpen(false);
    onClose();
  };

  const refreshRhythmInsights = async () => {
    if (!familyId) return;
    const { data, error } = await previewRebalanceRhythm({
      familyId,
      horizonWeeks: 4,
    });
    if (!error && data?.ok) {
      setRhythmInsights(data.insights || null);
      setMoves(data.moves || []);
      setSkippedMoves(new Set());
      setEditedMoves({});
      setEditingMoveId(null);
      setConflictErrors({});
    }
  };

  const handleScheduleBacklogEvent = async (row, weekStartYmd) => {
    const eid = row?.id;
    if (!eid) return;
    setSchedulingId(`bl:${eid}`);
    try {
      const dayYmd = weekStartYmd ? String(weekStartYmd).slice(0, 10) : new Date().toISOString().slice(0, 10);
      const { data: evRow, error: fetchErr } = await supabase
        .from('events')
        .select('estimated_minutes, instructional_minutes')
        .eq('id', eid)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      const mins = Number(evRow?.estimated_minutes || evRow?.instructional_minutes || 60);
      const startMs = new Date(`${dayYmd}T09:00:00`).getTime();
      if (Number.isNaN(startMs)) throw new Error('Invalid date');
      const startTs = new Date(startMs).toISOString();
      const endTs = new Date(startMs + mins * 60000).toISOString();
      const { error: upErr } = await supabase
        .from('events')
        .update({
          start_ts: startTs,
          end_ts: endTs,
          is_backlog: false,
          status: 'scheduled',
        })
        .eq('id', eid);
      if (upErr) throw upErr;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar'));
      }
      onSuccess?.();
      await refreshRhythmInsights();
    } catch (err) {
      Alert.alert('Could not schedule', err.message || 'Try again from Tasks.');
    } finally {
      setSchedulingId(null);
    }
  };

  const handleRhythmPreview = React.useCallback(async () => {
    if (!familyId) {
      Alert.alert('Error', 'Family is required to analyze the schedule.');
      return;
    }
    setPreviewing(true);
    setMoves([]);
    setRhythmInsights(null);
    setSkippedMoves(new Set());
    setEditedMoves({});
    setEditingMoveId(null);
    setConflictErrors({});
    try {
      const { data, error } = await previewRebalanceRhythm({
        familyId,
        horizonWeeks: 4,
      });
      if (error) {
        throw error;
      }
      if (data && data.ok) {
        setMoves(data.moves || []);
        setRhythmInsights(data.insights || null);
      } else {
        Alert.alert('Error', data?.error || 'Failed to preview rhythm rebalance');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to preview rhythm rebalance');
    } finally {
      setPreviewing(false);
    }
  }, [familyId]);
  React.useEffect(() => {
    if (!visible) {
      autoRhythmPreviewRanRef.current = false;
      return;
    }
    const inSubjectShiftMode = !!(event?.id && yearPlanId);
    if (inSubjectShiftMode || !familyId || autoRhythmPreviewRanRef.current) return;
    autoRhythmPreviewRanRef.current = true;
    handleRhythmPreview();
  }, [visible, event, yearPlanId, familyId, handleRhythmPreview]);
  const handleOpenPlanningPreferencesFromRhythm = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      handleClose();
      setTimeout(() => {
        if (typeof window.__ldSearchNavigate === 'function') {
          window.__ldSearchNavigate('settings', 'planner-settings');
        }
      }, 40);
      return;
    }
    handleClose();
  };
  const handleOpenBacklogFromRhythm = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      handleClose();
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'tasks' }));
        window.dispatchEvent(new CustomEvent('plannerTasksViewChange', { detail: { section: 'backlog' } }));
      }, 40);
      return;
    }
    handleClose();
  };
  const handleOpenMonthFromRhythm = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      handleClose();
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'month' }));
      }, 40);
      return;
    }
    handleClose();
  };

  if (!visible) return null;
  
  // Note: rebalanceEnabled check removed - allow modal to show even if flag is off
  // The backend will handle authorization

  const hasRebalanceContext = !!(event?.id && yearPlanId);
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

  const plannerSynopsis = rhythmInsights?.plannerSynopsis;
  const applicableMoveCount = moves.filter((m) => !skippedMoves.has(m.eventId)).length;
  const showRecommendedActions =
    !!rhythmInsights &&
    (moves.length > 0 ||
      (rhythmInsights.backlogHints || []).length > 0 ||
      (rhythmInsights.backlogCount || 0) > 0);
  const noActiveTargetInWindow = !!rhythmInsights && plannerSynopsis?.hasActiveTargets === false;
  const noOpenItemsInWindow = !!rhythmInsights && (rhythmInsights.backlogCount || 0) === 0;
  const noMovablePatternInWindow =
    !!rhythmInsights &&
    moves.length === 0 &&
    Number(plannerSynopsis?.scheduledHrsHorizon || 0) < 4;
  const hasMissingRhythmInputs = noActiveTargetInWindow || noOpenItemsInWindow || noMovablePatternInWindow;
  const showCombinedMissingInputsCard = hasMissingRhythmInputs;
  const plannerLoadBalanceSentence = noMovablePatternInWindow
    ? "You don't have enough scheduled lessons in this window to compare workload across weekdays."
    : "Your workload looks fairly balanced across weekdays in this window.";
  const plannerOpenItemsSentence = noOpenItemsInWindow
    ? "There are no backlog items to add at this time either."
    : "There are backlog items available to schedule from recommended actions.";
  const horizonWeeks = rhythmInsights?.horizonWeeks || 4;
  const scheduledPerWeek = plannerSynopsis?.scheduledHrsPerWeek ?? 0;
  const weekdaySkewLine = plannerSynopsis?.heavyWeekday
    ? `${plannerSynopsis.heavyWeekday} is heavier in this window.`
    : 'No strong weekday skew in this window.';
  const rhythmSingleLineSummary = `Next ${horizonWeeks} weeks: ${scheduledPerWeek} hrs/wk scheduled. ${weekdaySkewLine}`;
  const paceBadgePalette = {
    on_track: styles.paceBadgeOnTrack,
    light: styles.paceBadgeLight,
    behind: styles.paceBadgeBehind,
    overloaded: styles.paceBadgeOverloaded,
    no_targets: styles.paceBadgeNeutral,
  };

  const renderMovesBlock = (forSubject, nestInRecommended = false) => {
    if (!moves.length) return null;
    return (
      <View style={[styles.movesSection, nestInRecommended && styles.movesSectionInRecommended]}>
        <View style={styles.movesSectionHeader}>
          <Text style={styles.movesSectionTitle}>
            {forSubject ? 'Preview shifts for this subject' : 'Move existing lessons'}
          </Text>
          <Text style={styles.sectionTitleMuted}>
            {applicableMoveCount} of {moves.length} selected to apply
          </Text>
        </View>
        {!forSubject && (
          <Text style={styles.movesSectionIntro}>
            Spread load from busy days to lighter ones. Edit a proposed time, skip a row, or leave it included for apply.
          </Text>
        )}
        <View style={styles.movesListFlat}>
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
                    <Text style={styles.moveIndex}>Move {index + 1}</Text>
                    {isSkipped && <Text style={styles.skippedBadge}>Skipped</Text>}
                  </View>
                  <View style={styles.moveActions}>
                    {isSkipped ? (
                      <TouchableOpacity
                        onPress={() => {
                          const newSkipped = new Set(skippedMoves);
                          newSkipped.delete(move.eventId);
                          setSkippedMoves(newSkipped);
                        }}
                        style={styles.moveTextBtn}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={styles.moveTextBtnLabel}>Include</Text>
                      </TouchableOpacity>
                    ) : null}
                    {!isSkipped && (
                      <TouchableOpacity
                        onPress={async () => {
                          if (isEditing) {
                            const editedStart = new Date(`${editDate}T${editTime}:00`);

                            const { data: eventData } = await supabase
                              .from('events')
                              .select('start_ts, end_ts, child_id, child_ids')
                              .eq('id', move.eventId)
                              .single();

                            const durationMs = eventData
                              ? new Date(eventData.end_ts) - new Date(eventData.start_ts)
                              : 60 * 60 * 1000;

                            const editedEnd = new Date(editedStart.getTime() + durationMs);

                            const childId = effectiveChildIdFromEventRow({
                              child_id: event?.child_id || eventData?.child_id,
                              child_ids: eventData?.child_ids,
                            });
                            const conflict = await checkConflict(
                              move.eventId,
                              childId,
                              editedStart.toISOString(),
                              editedEnd.toISOString()
                            );

                            if (conflict) {
                              setConflictErrors({
                                ...conflictErrors,
                                [move.eventId]: conflict,
                              });
                              Alert.alert('Conflict Detected', conflict);
                              return;
                            }

                            const newErrors = { ...conflictErrors };
                            delete newErrors[move.eventId];
                            setConflictErrors(newErrors);

                            setEditedMoves({
                              ...editedMoves,
                              [move.eventId]: { date: editDate, time: editTime },
                            });
                            setEditingMoveId(null);
                          } else {
                            setEditingMoveId(move.eventId);
                            const newErrors = { ...conflictErrors };
                            delete newErrors[move.eventId];
                            setConflictErrors(newErrors);
                          }
                        }}
                        style={styles.moveTextBtn}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={styles.moveTextBtnLabel}>{isEditing ? 'Save' : 'Edit'}</Text>
                      </TouchableOpacity>
                    )}
                    {!isSkipped && (
                      <TouchableOpacity
                        onPress={() => {
                          const newSkipped = new Set(skippedMoves);
                          newSkipped.add(move.eventId);
                          const newEdited = { ...editedMoves };
                          delete newEdited[move.eventId];
                          setEditedMoves(newEdited);
                          setEditingMoveId(null);
                          setSkippedMoves(newSkipped);
                        }}
                        style={styles.moveTextBtn}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={[styles.moveTextBtnLabel, { color: colors.muted }]}>Skip</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <Text style={styles.moveReason}>{move.reason || 'Schedule shift'}</Text>
                <View style={styles.moveTimesColumn}>
                  <View style={styles.moveTimeRow}>
                    <Text style={styles.timeLabel}>From</Text>
                    <Text style={styles.timeValue}>
                      {currentDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                      {currentDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                  </View>
                  {isEditing ? (
                    <View style={styles.editInputsColumn}>
                      <Text style={styles.timeLabel}>To</Text>
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => {
                          setEditedMoves({
                            ...editedMoves,
                            [move.eventId]: { date: e.target.value, time: editTime },
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
                            [move.eventId]: { date: editDate, time: e.target.value },
                          });
                        }}
                        style={styles.editTimeInput}
                      />
                    </View>
                  ) : (
                    <View style={styles.moveTimeRow}>
                      <Text style={styles.timeLabel}>To</Text>
                      <Text style={[styles.timeValue, styles.proposedTime, isSkipped && styles.timeValueSkipped]}>
                        {proposedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                        {proposedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </Text>
                      {conflictErrors[move.eventId] && (
                        <Text style={styles.conflictError}>⚠️ {conflictErrors[move.eventId]}</Text>
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {forSubject ? (
          <TouchableOpacity
            style={[styles.button, styles.applyButton, (applying || applicableMoveCount === 0) && styles.buttonDisabled]}
            onPress={handleApply}
            disabled={applying || applicableMoveCount === 0}
          >
            {applying ? (
              <>
                <ActivityIndicator size="small" color={colors.accentContrast} />
                <Text style={styles.buttonText}>
                  Applying... ({appliedCount}/{applicableMoveCount})
                </Text>
              </>
            ) : (
              <>
                <Check size={16} color={colors.accentContrast} />
                <Text style={styles.buttonText}>Apply subject shifts</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.overlayBackdrop} activeOpacity={1} onPress={handleClose} />
      <View style={styles.modalColumn}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerTextBlock}>
              <Text style={styles.title}>
                {hasRebalanceContext ? 'Shift subject series' : 'Rebalance'}
              </Text>
              {!hasRebalanceContext ? (
                <View style={styles.rhythmMetaChip}>
                  <Text style={styles.rhythmMetaChipText}>Family · Next 4 weeks</Text>
                </View>
              ) : null}
            </View>
          </View>
          <TouchableOpacity
            onPress={handleClose}
            style={[styles.closeButton, closeHovered && styles.closeButtonHovered]}
            activeOpacity={0.72}
            {...(Platform.OS === 'web' && {
              onMouseEnter: () => setCloseHovered(true),
              onMouseLeave: () => setCloseHovered(false),
            })}
          >
            <X size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {hasRebalanceContext ? (
            <View style={styles.subjectIntro}>
              <View style={styles.modeTag}>
                <Text style={styles.modeTagText}>Subject</Text>
              </View>
              <Text style={styles.description}>
                Choose a new date and time for "{eventTitle}". We preview shifting this lesson and later same-subject
                lessons in your year plan so the series stays aligned.
              </Text>
              {!!eventDate && (
                <Text style={styles.captionLine}>Current start: {eventDate}</Text>
              )}
            </View>
          ) : (
            <>
              <View style={styles.emptyState}>
                <Text style={styles.oneLineSummary}>{previewing ? 'Analyzing…' : rhythmSingleLineSummary}</Text>
                {!familyId && (
                  <Text style={styles.description}>Sign in with a family account to run schedule rhythm.</Text>
                )}

                {rhythmInsights && (
                  <>
                    <View style={styles.paceVsPlanCard}>
                      <Text style={styles.recommendedSectionTitle}>Pace vs plan</Text>
                      {plannerSynopsis ? (
                        <>
                          <Text style={styles.paceSummaryParagraph}>
                            {`Scheduled ${plannerSynopsis.scheduledHrsHorizon} hrs across next ${rhythmInsights.horizonWeeks || 4} weeks. `}
                            {plannerSynopsis.hasActiveTargets && plannerSynopsis.targetHrsHorizon != null
                              ? `Target is ${plannerSynopsis.targetHrsHorizon} hrs in this window. `
                              : 'No weekly target detected. '}
                            {plannerSynopsis.hasActiveTargets && plannerSynopsis.projectedGapHrsHorizon != null
                              ? plannerSynopsis.projectedGapHrsHorizon > 0
                                ? `Projected pace is behind by ${plannerSynopsis.projectedGapHrsHorizon} hrs.`
                                : plannerSynopsis.projectedGapHrsHorizon < 0
                                  ? `Projected pace is ahead by ${Math.abs(plannerSynopsis.projectedGapHrsHorizon)} hrs.`
                                  : 'Projected pace is aligned with target.'
                              : plannerSynopsis.paceDetailSentence || plannerSynopsis.summarySentence}
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.insightsLine}>Refresh analysis for a full pace summary.</Text>
                      )}
                    </View>

                    <View style={styles.plannerSynopsisCard}>
                      <Text style={styles.recommendedSectionTitle}>Planner synopsis</Text>
                      <Text style={styles.paceSummaryParagraph}>
                        {`${plannerLoadBalanceSentence} ${plannerOpenItemsSentence}`}
                      </Text>
                    </View>
                    {showCombinedMissingInputsCard && (
                      <View style={styles.missingInputsCard}>
                        <Text style={styles.recommendedSectionTitle}>
                          {t('rebalance.rhythm.emptyState.requirementsTitle')}
                        </Text>
                        {noActiveTargetInWindow && (
                          <Text style={styles.missingInputLine}>
                            • {t('rebalance.rhythm.emptyState.missingActiveTarget')}
                          </Text>
                        )}
                        {noOpenItemsInWindow && (
                          <Text style={styles.missingInputLine}>
                            • {t('rebalance.rhythm.emptyState.missingSchedulableWork')}
                          </Text>
                        )}
                        {noMovablePatternInWindow && (
                          <Text style={styles.missingInputLine}>
                            • {t('rebalance.rhythm.emptyState.missingMovablePattern')}
                          </Text>
                        )}
                        <View style={styles.missingInputActionsRow}>
                          {noActiveTargetInWindow && (
                            <TouchableOpacity
                              style={styles.emptyActionHintBtn}
                              onPress={handleOpenPlanningPreferencesFromRhythm}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <Text style={styles.emptyActionHintBtnText}>{t('rebalance.rhythm.emptyState.openPlanningPreferences')}</Text>
                            </TouchableOpacity>
                          )}
                          {noOpenItemsInWindow && (
                            <TouchableOpacity
                              style={styles.emptyActionHintBtn}
                              onPress={handleOpenBacklogFromRhythm}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <Text style={styles.emptyActionHintBtnText}>{t('rebalance.rhythm.emptyState.openBacklog')}</Text>
                            </TouchableOpacity>
                          )}
                          {noMovablePatternInWindow && (
                            <TouchableOpacity
                              style={styles.emptyActionHintBtn}
                              onPress={handleOpenMonthFromRhythm}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <Text style={styles.emptyActionHintBtnText}>{t('rebalance.rhythm.emptyState.openMonthView')}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    )}

                    <TouchableOpacity
                      onPress={() => setHowWorksOpen(!howWorksOpen)}
                      style={styles.howWorksToggle}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text style={styles.howWorksToggleText}>
                        How we calculate this {howWorksOpen ? '▲' : '▼'}
                      </Text>
                    </TouchableOpacity>
                    {howWorksOpen && (
                      <View style={styles.howWorksBody}>
                        <Text style={styles.insightsLine}>
                          We compare saved year or subject targets to actual scheduled events to show an analysis of
                          courseload and pacing. We also analyze backlog and current items for skew based on fuller
                          days versus free spaces within the same week.
                        </Text>
                        {rhythmInsights.weeklyFamilyTargetMinutes > 0 && (
                          <Text style={[styles.insightsLine, { marginTop: 8 }]}>
                            Active targets: about {Math.round(rhythmInsights.weeklyFamilyTargetMinutes)} family
                            instructional minutes per week in this window (derived from your plan).
                          </Text>
                        )}
                      </View>
                    )}

                    {(plannerSynopsis?.sparseWeeksCount > 0 ||
                      (rhythmInsights.backlogCount || 0) > 0) && (
                      <View style={styles.planningNotesCard}>
                        <Text style={styles.recommendedSectionTitle}>Planning notes</Text>
                        {plannerSynopsis?.sparseWeeksCount > 0 && (
                          <Text style={styles.insightsLine}>
                            {plannerSynopsis.sparseWeeksCount} week(s) look light vs target — consider filling them.
                          </Text>
                        )}
                        {(rhythmInsights.backlogCount || 0) > 0 && (
                          <Text style={styles.insightsLine}>
                            {rhythmInsights.backlogCount} calendar backlog item(s) can be scheduled.
                          </Text>
                        )}
                      </View>
                    )}
                  </>
                )}
              </View>

              {showRecommendedActions && (
                <View style={styles.recommendedActionsWrap}>
                  <Text style={styles.recommendedActionsHeading}>Recommended actions</Text>
                  {renderMovesBlock(false, true)}
                  {(rhythmInsights.backlogHints || []).length > 0 && (
                <View style={styles.recommendedSubBlock}>
                  <Text style={styles.recommendedSectionTitle}>Fill light weeks</Text>
                  <Text style={styles.scheduleHint}>
                    These weeks have less scheduled time than your plan goal suggests.
                  </Text>
                  {(rhythmInsights.backlogHints || []).slice(0, 5).map((h, idx) => (
                    <View key={idx} style={styles.sparseWeekBlock}>
                      <Text style={styles.sparseWeekTitle}>Week of {h.weekStart}</Text>
                      <Text style={styles.insightsLine}>{h.message}</Text>
                      {(h.sampleBacklog || []).length > 0 && (
                        <>
                          <Text style={[styles.insightsLine, { fontWeight: '600', marginTop: 4 }]}>
                            Calendar backlog
                          </Text>
                          <Text style={styles.scheduleHint}>
                            Places at 9:00 on the first day of this week — adjust in the planner if you prefer another
                            slot.
                          </Text>
                          {(h.sampleBacklog || []).map((b) => (
                            <View key={b.id} style={styles.suggestionRow}>
                              <Text style={[styles.insightsLine, styles.suggestionRowText]}>• {b.title}</Text>
                              <TouchableOpacity
                                style={[styles.scheduleBtn, schedulingId && styles.scheduleBtnDisabled]}
                                disabled={!!schedulingId}
                                onPress={() => handleScheduleBacklogEvent(b, h.weekStart)}
                                {...(Platform.OS === 'web' && { cursor: schedulingId ? 'default' : 'pointer' })}
                              >
                                <Text style={styles.scheduleBtnText}>
                                  {schedulingId === `bl:${b.id}` ? '…' : 'Schedule'}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          ))}
                        </>
                      )}
                    </View>
                  ))}
                </View>
                  )}

                  <View style={styles.recommendedSubBlock}>
                  <Text style={styles.recommendedSectionTitle}>Backlog</Text>
                  {(rhythmInsights.backlogCount || 0) > 0 && (
                    <>
                      <Text style={[styles.subsectionLabel, { marginTop: 12 }]}>From calendar backlog</Text>
                      <Text style={styles.insightsLine}>
                        {rhythmInsights.backlogCount} item(s) in backlog — use quick schedule in light weeks above when
                        listed, or open Tasks.
                      </Text>
                    </>
                  )}
                  {(rhythmInsights.backlogCount || 0) === 0 && (
                    <Text style={styles.insightsLine}>No backlog items on file.</Text>
                  )}
                </View>
                </View>
              )}
            </>
          )}

          {hasRebalanceContext ? (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>New time for this lesson</Text>
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
                    <Text style={styles.buttonText}>Preview subject shifts</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : null}

          {hasRebalanceContext && renderMovesBlock(true)}
        </ScrollView>

        {!hasRebalanceContext && rhythmInsights && (
          <View style={styles.rhythmStickyFooter}>
            <View style={styles.footerActionsRow}>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.footerSecondaryBtn}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.footerSecondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <View style={styles.footerPrimaryStack}>
                <TouchableOpacity
                  style={[
                    styles.footerPrimaryBtn,
                    (applying || applicableMoveCount === 0) && styles.buttonDisabled,
                  ]}
                  onPress={handleApply}
                  disabled={applying || applicableMoveCount === 0}
                  {...(Platform.OS === 'web' && { cursor: applicableMoveCount === 0 ? 'default' : 'pointer' })}
                >
                  {applying ? (
                    <>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.footerPrimaryBtnText}>
                        Applying… ({appliedCount}/{applicableMoveCount})
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.footerPrimaryBtnText}>Apply selected changes</Text>
                  )}
                </TouchableOpacity>
                {applicableMoveCount === 0 ? (
                  <Text style={styles.footerHelper}>No suggested changes to apply.</Text>
                ) : null}
              </View>
            </View>
          </View>
        )}
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
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 10000,
  },
  overlayBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  modalColumn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 740,
    maxHeight: '88%',
    flexDirection: 'column',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 40,
    elevation: 20,
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 24px 56px rgba(15, 23, 42, 0.18)',
        }
      : {}),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 0,
    paddingHorizontal: 28,
  },
  headerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.14)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  headerTextBlock: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.52)',
    marginTop: 2,
    lineHeight: 16,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  closeButtonHovered: {
    backgroundColor: 'rgba(241, 245, 249, 0.7)',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 28,
    paddingTop: 10,
    paddingBottom: 28,
  },
  oneLineSummary: {
    fontSize: 14,
    color: 'rgba(15, 23, 42, 0.62)',
    lineHeight: 20,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  synopsisStrip: {
    marginBottom: 14,
    padding: 12,
    backgroundColor: colors.bgSecondary || '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  paceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  paceBadgeOnTrack: {
    backgroundColor: colors.greenSoft,
  },
  paceBadgeLight: {
    backgroundColor: colors.blueSoft,
  },
  paceBadgeBehind: {
    backgroundColor: colors.orangeSoft,
  },
  paceBadgeOverloaded: {
    backgroundColor: colors.redSoft,
  },
  paceBadgeNeutral: {
    backgroundColor: colors.bgSubtle,
  },
  synopsisLine: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 20,
    fontWeight: '500',
  },
  synopsisPressure: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 17,
  },
  paceVsPlanCard: {
    marginTop: 8,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  plannerSynopsisCard: {
    marginTop: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planningNotesCard: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.bg || '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  missingInputsCard: {
    marginTop: 12,
    padding: 16,
    backgroundColor: colors.bg || '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  missingInputLine: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  missingInputActionsRow: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  paceRow: {
    marginBottom: 10,
  },
  paceRowLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  paceRowValue: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  paceSubline: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  paceSummaryParagraph: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyActionHintWrap: {
    marginTop: 4,
    marginBottom: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.bg || '#fff',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyActionHintText: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  emptyActionHintBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 3,
  },
  emptyActionHintBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
    textDecorationLine: 'underline',
  },
  synopsisBullet: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 8,
  },
  synopsisBulletKey: {
    fontWeight: '600',
    color: colors.text,
  },
  howWorksToggle: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  howWorksToggleText: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '600',
  },
  howWorksBody: {
    marginTop: 8,
    padding: 12,
    backgroundColor: colors.bgSecondary || '#f1f5f9',
    borderRadius: 8,
  },
  recommendedBlock: {
    marginTop: 20,
    paddingTop: 4,
  },
  recommendedActionsWrap: {
    marginTop: 16,
    paddingTop: 4,
    paddingHorizontal: 0,
  },
  recommendedActionsHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  recommendedSubBlock: {
    marginTop: 18,
    paddingTop: 4,
  },
  movesSectionInRecommended: {
    marginTop: 4,
  },
  recommendedSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subsectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  movesListFlat: {
    marginBottom: 4,
  },
  moveTimesColumn: {
    marginTop: 8,
    gap: 6,
  },
  moveTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  editInputsColumn: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  moveTextBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  moveTextBtnLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  rhythmStickyFooter: {
    paddingHorizontal: 28,
    paddingTop: 10,
    paddingBottom: 22,
    backgroundColor: '#FFFFFF',
  },
  footerActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    gap: 12,
  },
  footerPrimaryStack: {
    alignItems: 'center',
  },
  footerSecondaryBtn: {
    minWidth: 120,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerSecondaryBtnText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footerPrimaryBtn: {
    minWidth: 176,
    backgroundColor: '#9ECFFB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  footerPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footerHelper: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 17,
    maxWidth: 220,
  },
  footerCancelWrap: {
    marginTop: 12,
    alignItems: 'center',
  },
  footerCancel: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
  },
  description: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 16,
    lineHeight: 20,
  },
  subjectIntro: {
    marginBottom: 4,
  },
  captionLine: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
    marginBottom: 8,
  },
  modeTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bgSecondary || '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  bulletLine: {
    fontSize: 13,
    color: colors.text,
    marginBottom: 8,
    paddingLeft: 2,
    lineHeight: 19,
  },
  emptyState: {
    paddingVertical: 4,
  },
  rhythmMetaChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginTop: 8,
    marginBottom: 6,
    backgroundColor: 'rgba(99, 102, 241, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.1)',
  },
  rhythmMetaChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(15, 23, 42, 0.45)',
    letterSpacing: 0.2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  rhythmCtaWrap: {
    alignSelf: 'stretch',
    marginTop: 0,
    marginBottom: 0,
  },
  rhythmAnalysisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: 'rgba(99, 102, 241, 0.11)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 6px 20px rgba(99, 102, 241, 0.12)',
        }
      : {}),
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  rhythmAnalysisButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 10,
  },
  insightsBox: {
    marginTop: 18,
    padding: 14,
    backgroundColor: colors.bgSecondary || '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  insightsKicker: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(79, 70, 229, 0.88)',
    letterSpacing: 0.15,
    marginBottom: 8,
  },
  insightsIntro: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
    marginBottom: 14,
  },
  insightsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  insightsLine: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 4,
    lineHeight: 18,
  },
  scheduleHint: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: 'italic',
    marginBottom: 8,
    lineHeight: 16,
  },
  sparseWeekBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sparseWeekTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  suggestionRowText: {
    flex: 1,
    minWidth: 120,
    marginBottom: 0,
  },
  scheduleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.accent,
    borderRadius: 6,
  },
  scheduleBtnDisabled: {
    opacity: 0.55,
  },
  scheduleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accentContrast,
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
  movesSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 0,
    flex: 1,
  },
  sectionTitleMuted: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.muted,
  },
  movesSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  movesSectionIntro: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 10,
    lineHeight: 17,
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
    backgroundColor: '#D1D5DB',
    opacity: 1,
  },
  buttonText: {
    color: colors.accentContrast,
    fontSize: 14,
    fontWeight: '500',
  },
  movesSection: {
    marginTop: 20,
    paddingTop: 4,
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

