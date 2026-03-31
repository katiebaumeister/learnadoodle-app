/**
 * DragDropConflictBanner
 * Non-blocking banner that appears after drag-and-drop when conflicts are detected
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';
import { AlertCircle, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  LearnerPill,
  resolveLearnerChild,
  formatConflictMetaFromEvent,
  parseConflictMessageString,
  mapChildrenForConflict,
  sharedConflictBannerStyles as cb,
} from './conflictBannerShared';

export default function DragDropConflictBanner({
  visible,
  conflictCount,
  eventTitle,
  conflictMessage, // Optional: formatted message like "Soccer Practice (Fri Jan 2, 4-5:30 PM)"
  eventId, // ID of the moved event
  conflictEvent, // The conflicting event object (optional, will be fetched if not provided)
  movedEvent, // Moved event (for learner avatar + pill)
  children = [], // Family children rows { id, first_name, name, avatar, avatar_url }
  familyId, // Family ID for fetching events
  onQuickReschedule,
  onDismiss,
  onSuggestionAccepted, // Callback when suggestion is accepted: (newStart, newEnd) => void
  onSuggestionComputed,
}) {
  const [suggestedChange, setSuggestedChange] = useState(null);
  const [changeAccepted, setChangeAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const bannerRef = useRef(null);
  const enterOpacity = useRef(new Animated.Value(0)).current;
  const enterY = useRef(new Animated.Value(6)).current;
  
  useEffect(() => {
    if (visible && Platform.OS === 'web' && typeof document !== 'undefined') {
      // Check if element is actually in DOM using ref
      setTimeout(() => {
        if (bannerRef.current) {
          // Try to get the DOM node from React Native Web
          const domNode = bannerRef.current._nativeNode || bannerRef.current;
          if (domNode && domNode.getBoundingClientRect) {
            const rect = domNode.getBoundingClientRect();
            const styles = window.getComputedStyle(domNode);
            const isVisibleOnScreen = rect.width > 0 && rect.height > 0 && 
                                     rect.top >= 0 && rect.left >= 0 &&
                                     styles.display !== 'none' && 
                                     styles.opacity !== '0' &&
                                     styles.visibility !== 'hidden';
            
            if (!isVisibleOnScreen) {
              console.warn('[DragDropConflictBanner] Banner rendered but not visible on screen:', {
                width: rect.width,
                height: rect.height,
                top: rect.top,
                left: rect.left,
                display: styles.display,
                opacity: styles.opacity,
                visibility: styles.visibility,
                zIndex: styles.zIndex,
              });
            }
          }
        }
      }, 100);
    }
  }, [visible]);

  // Find next available slot on the same day for inline reschedule suggestion
  const findNextAvailableSlot = async (conflictEvent, currentStart, currentEnd, existingEvents, childIds) => {
    try {
      const duration = (currentEnd - currentStart) / (1000 * 60); // Duration in minutes
      const conflictEnd = new Date(conflictEvent.end_ts || conflictEvent.start_ts);
      
      // Start looking from the end of the conflicting event
      let candidateStart = new Date(conflictEnd);
      const dayEnd = new Date(candidateStart);
      dayEnd.setHours(23, 59, 0, 0);
      
      // Try slots in 15-minute increments up to end of day
      while (candidateStart < dayEnd) {
        const candidateEnd = new Date(candidateStart.getTime() + duration * 60 * 1000);
        
        // Check if this slot conflicts with any existing events
        let hasConflict = false;
        for (const event of existingEvents || []) {
          if (event.id === conflictEvent.id) continue; // Skip the conflicting event itself
          
          const eventStart = new Date(event.start_ts);
          const eventEnd = new Date(event.end_ts || event.start_ts);
          
          // Check if candidate overlaps with this event
          if (candidateStart < eventEnd && eventStart < candidateEnd) {
            // Check if it's for the same child
            const eventChildIds = event.child_id ? [event.child_id] : (event.child_ids || []);
            if (childIds.some(id => eventChildIds.includes(id))) {
              hasConflict = true;
              break;
            }
          }
        }
        
        if (!hasConflict && candidateEnd <= dayEnd) {
          // Found an available slot!
          return {
            newStart: candidateStart,
            newEnd: candidateEnd,
          };
        }
        
        // Move to next 15-minute slot
        candidateStart = new Date(candidateStart.getTime() + 15 * 60 * 1000);
      }
      
      // No slot found on same day
      return null;
    } catch (err) {
      console.error('[DragDropConflictBanner] Error finding available slot:', err);
      return null;
    }
  };

  const handleAdjustAutomatically = async (e) => {
    if (Platform.OS === 'web' && e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (suggestedChange) {
      handleAcceptChange();
      return;
    }

    if (!familyId || !conflictEvent) {
      // Fallback to Quick Reschedule if we don't have required data
      onQuickReschedule();
      return;
    }

    setLoading(true);
    try {
      const movedEventForSuggestion = movedEvent || null;
      if (!movedEventForSuggestion?.start_ts) {
        onQuickReschedule();
        return;
      }

      const currentStart = new Date(movedEventForSuggestion.start_ts);
      const currentEnd = new Date(movedEventForSuggestion.end_ts || movedEventForSuggestion.start_ts);

      // Get child IDs
      const childIds = movedEventForSuggestion.child_id
        ? [movedEventForSuggestion.child_id]
        : (movedEventForSuggestion.child_ids || []);

      // Fetch existing events for the day
      const dateKey = currentStart.toISOString().split('T')[0];
      const localYear = currentStart.getFullYear();
      const localMonth = currentStart.getMonth();
      const localDay = currentStart.getDate();
      const localStartOfDay = new Date(localYear, localMonth, localDay, 0, 0, 0, 0);
      const localEndOfDay = new Date(localYear, localMonth, localDay, 23, 59, 59, 999);
      const startOfDay = localStartOfDay.toISOString();
      const endOfDay = localEndOfDay.toISOString();

      const { data: existingEvents, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .eq('family_id', familyId)
        .gte('start_ts', startOfDay)
        .lte('start_ts', endOfDay)
        .neq('status', 'canceled')
        .is('canceled_at', null)
        .is('deleted_at', null);

      if (fetchError) {
        console.error('[DragDropConflictBanner] Error fetching events for suggestion:', fetchError);
        onQuickReschedule();
        return;
      }

      // Calculate suggestion
      const slot = await findNextAvailableSlot(
        conflictEvent,
        currentStart,
        currentEnd,
        existingEvents || [],
        childIds
      );

      if (slot) {
        // Format the suggestion message
        const formatTime = (date) => {
          let hours = date.getHours();
          const minutes = date.getMinutes();
          const period = hours >= 12 ? 'PM' : 'AM';
          if (hours > 12) hours -= 12;
          else if (hours === 0) hours = 12;
          return minutes === 0 
            ? `${hours} ${period}` 
            : `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
        };

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const slotDate = new Date(slot.newStart);
        const dayName = dayNames[slotDate.getDay()];
        const monthName = monthNames[slotDate.getMonth()];
        const day = slotDate.getDate();

        const startTimeStr = formatTime(slot.newStart);
        const endTimeStr = formatTime(slot.newEnd);
        const startTimeOnly = startTimeStr.replace(/\s*(AM|PM)$/i, '');
        const endTimeOnly = endTimeStr.replace(/\s*(AM|PM)$/i, '');
        const period = startTimeStr.includes('PM') ? 'PM' : 'AM';
        const timeRange = `${startTimeOnly}–${endTimeOnly} ${period}`;

        const suggestionMessage = `${dayName} ${monthName} ${day}, ${timeRange}`;

        const nextSuggestion = {
          newStart: slot.newStart,
          newEnd: slot.newEnd,
          message: suggestionMessage,
        };
        setSuggestedChange(nextSuggestion);
        onSuggestionComputed?.(nextSuggestion);
      } else {
        // No slot found - escalate to Quick Reschedule
        onQuickReschedule();
      }
    } catch (err) {
      console.error('[DragDropConflictBanner] Error calculating suggestion:', err);
      onQuickReschedule();
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptChange = async () => {
    if (!suggestedChange || !onSuggestionAccepted) return;

    try {
      // Call the callback to apply the change
      await onSuggestionAccepted(suggestedChange.newStart, suggestedChange.newEnd);
      setChangeAccepted(true);
    } catch (err) {
      console.error('[DragDropConflictBanner] Error accepting suggestion:', err);
    }
  };

  const handleUndo = () => {
    setSuggestedChange(null);
    setChangeAccepted(false);
  };

  // Reset state when banner becomes invisible
  useEffect(() => {
    if (!visible) {
      setSuggestedChange(null);
      setChangeAccepted(false);
      setLoading(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || suggestedChange || loading || !eventId || !familyId || !conflictEvent) return;
    handleAdjustAutomatically();
  }, [visible, suggestedChange, loading, eventId, familyId, conflictEvent]);

  const richCopy = useMemo(() => {
    const fallback =
      conflictMessage ||
      `This move conflicts with ${conflictCount} other ${conflictCount === 1 ? 'event' : 'events'}`;
    const learner = resolveLearnerChild(movedEvent, mapChildrenForConflict(children));
    if (conflictEvent && conflictEvent.title) {
      return {
        kind: 'rich',
        learner,
        conflictingTitle: conflictEvent.title,
        metaLine: formatConflictMetaFromEvent(conflictEvent),
        nameFallback: learner ? null : parseConflictMessageString(conflictMessage)?.learnerName,
      };
    }
    const parsed = parseConflictMessageString(conflictMessage);
    if (parsed) {
      return {
        kind: 'rich',
        learner,
        conflictingTitle: parsed.conflictingTitle,
        metaLine: parsed.metaLine,
        nameFallback: parsed.learnerName,
      };
    }
    return { kind: 'plain', text: fallback };
  }, [movedEvent, children, conflictEvent, conflictMessage, conflictCount]);

  useEffect(() => {
    if (!visible) return;
    enterOpacity.setValue(0);
    enterY.setValue(6);
    const useNativeDriver = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(enterOpacity, { toValue: 1, duration: 240, useNativeDriver }),
      Animated.timing(enterY, { toValue: 0, duration: 240, useNativeDriver }),
    ]).start();
  }, [visible, suggestedChange]);

  if (!visible) {
    return null;
  }

  // Show conflict warning UI (compact, family-style learner pill)
  return (
    <Animated.View
      ref={bannerRef}
      style={[cb.banner, { opacity: enterOpacity, transform: [{ translateY: enterY }] }]}
      data-testid="drag-drop-conflict-banner"
    >
      <View style={cb.bannerContentCompact}>
        <View style={cb.bannerIconWrapSm} accessibilityRole="image" accessibilityLabel="Scheduling note">
          <AlertCircle size={14} color="#5B8FC7" />
        </View>
        <View style={cb.bannerTextGrow}>
          {richCopy.kind === 'rich' ? (
            <>
              <View style={cb.conflictLine}>
                <Text style={cb.kicker}>Conflict with </Text>
                <LearnerPill
                  child={richCopy.learner}
                  nameFallback={richCopy.nameFallback || undefined}
                />
                <Text style={cb.conflictTitle} numberOfLines={1}>
                  {' '}
                  — {richCopy.conflictingTitle}
                </Text>
                {richCopy.metaLine ? (
                  <Text style={cb.metaInline} numberOfLines={1}>
                    {' '}
                    · {richCopy.metaLine}
                  </Text>
                ) : null}
              </View>
              {suggestedChange?.message ? (
                <Text style={[cb.metaInline, { marginTop: 4 }]} numberOfLines={2}>
                  Suggested change: {suggestedChange.message}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={cb.bannerMessagePlain} numberOfLines={2}>
                {richCopy.text}
              </Text>
              {suggestedChange?.message ? (
                <Text style={[cb.metaInline, { marginTop: 4 }]} numberOfLines={2}>
                  Suggested change: {suggestedChange.message}
                </Text>
              ) : null}
            </>
          )}
        </View>
        <View style={cb.bannerActionsRow}>
          <TouchableOpacity
            {...(Platform.OS === 'web' && { type: 'button' })}
            style={cb.primaryButton}
            onPress={handleAdjustAutomatically}
            disabled={loading}
          >
            <Text style={cb.primaryButtonText}>
              {loading ? 'Calculating...' : 'Adjust automatically'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            {...(Platform.OS === 'web' && { type: 'button' })}
            style={cb.ghostButton}
            onPress={(e) => {
              if (Platform.OS === 'web' && e) {
                e.preventDefault();
                e.stopPropagation();
              }
              onDismiss();
            }}
          >
            <Text style={cb.ghostButtonText}>Save anyway</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  suggestedBanner: {
    backgroundColor: '#F4FAF7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(91, 163, 122, 0.2)',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
      zIndex: 10000,
      position: 'relative',
      display: 'flex',
      visibility: 'visible',
      opacity: 1,
    } : {
      shadowColor: '#101828',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    }),
  },
  suggestedIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(91, 163, 122, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  suggestedTitle: {
    fontSize: 11,
    color: '#3D5A4A',
    fontWeight: '500',
    marginBottom: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestedMessage: {
    fontSize: 12,
    color: '#3D5A4A',
    fontWeight: '600',
    marginBottom: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestedSubtext: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  acceptButton: {
    flexShrink: 0,
    backgroundColor: '#7CB89A',
    borderWidth: 1,
    borderColor: 'rgba(91, 163, 122, 0.55)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

