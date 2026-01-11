/**
 * DragDropConflictBanner
 * Non-blocking banner that appears after drag-and-drop when conflicts are detected
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { AlertCircle, Check } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';

export default function DragDropConflictBanner({
  visible,
  conflictCount,
  eventTitle,
  conflictMessage, // Optional: formatted message like "Soccer Practice (Fri Jan 2, 4-5:30 PM)"
  eventId, // ID of the moved event
  conflictEvent, // The conflicting event object (optional, will be fetched if not provided)
  familyId, // Family ID for fetching events
  onQuickReschedule,
  onDismiss,
  onSuggestionAccepted, // Callback when suggestion is accepted: (newStart, newEnd) => void
}) {
  const [suggestedChange, setSuggestedChange] = useState(null);
  const [changeAccepted, setChangeAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const bannerRef = useRef(null);
  
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

    if (!eventId || !familyId || !conflictEvent) {
      // Fallback to Quick Reschedule if we don't have required data
      onQuickReschedule();
      return;
    }

    setLoading(true);
    try {
      // Fetch the moved event
      const { data: movedEvent, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .eq('family_id', familyId)
        .maybeSingle();

      if (eventError || !movedEvent) {
        console.error('[DragDropConflictBanner] Error fetching moved event:', eventError);
        onQuickReschedule();
        return;
      }

      const currentStart = new Date(movedEvent.start_ts);
      const currentEnd = new Date(movedEvent.end_ts || movedEvent.start_ts);

      // Get child IDs
      const childIds = movedEvent.child_id ? [movedEvent.child_id] : (movedEvent.child_ids || []);

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

        setSuggestedChange({
          newStart: slot.newStart,
          newEnd: slot.newEnd,
          message: suggestionMessage,
        });
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

  if (!visible) {
    return null;
  }

  // Format conflict message - use provided message or fallback to generic
  const displayMessage = conflictMessage || 
    `This move conflicts with ${conflictCount} other ${conflictCount === 1 ? 'event' : 'events'}`;

  // Show suggested change UI if available
  if (suggestedChange) {
    return (
      <View ref={bannerRef} style={styles.suggestedBanner} data-testid="drag-drop-conflict-banner">
        <View style={styles.bannerContent}>
          <Check size={18} color="#16A34A" style={{ marginTop: 2, flexShrink: 0 }} />
          <View style={styles.bannerText}>
            {changeAccepted ? (
              <>
                <Text style={styles.suggestedMessage}>
                  Successfully changed to recommended time
                </Text>
                <Text style={styles.suggestedSubtext}>
                  The event has been moved to {suggestedChange.message}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.suggestedTitle}>
                  Suggested adjustment
                </Text>
                <Text style={styles.suggestedMessage}>
                  Move this event to {suggestedChange.message}
                </Text>
                <Text style={styles.suggestedSubtext}>
                  Keeps other events unchanged
                </Text>
              </>
            )}
          </View>
          {!changeAccepted && (
            <View style={styles.bannerActions}>
              <TouchableOpacity
                {...(Platform.OS === 'web' && { type: 'button' })}
                style={styles.acceptButton}
                onPress={handleAcceptChange}
                disabled={loading}
              >
                <Text style={styles.acceptButtonText}>Accept change</Text>
              </TouchableOpacity>
              <TouchableOpacity
                {...(Platform.OS === 'web' && { type: 'button' })}
                style={styles.undoButton}
                onPress={handleUndo}
              >
                <Text style={styles.undoButtonText}>Undo</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  }

  // Show conflict warning UI
  return (
    <View ref={bannerRef} style={styles.banner} data-testid="drag-drop-conflict-banner">
      <View style={styles.bannerContent}>
        <AlertCircle size={18} color="#EF4444" style={{ marginTop: 2, flexShrink: 0 }} />
        <View style={styles.bannerText}>
          <Text style={styles.bannerMessage}>
            Conflicts with {displayMessage}
          </Text>
        </View>
        <View style={styles.bannerActions}>
          <TouchableOpacity
            {...(Platform.OS === 'web' && { type: 'button' })}
            style={styles.adjustButton}
            onPress={handleAdjustAutomatically}
            disabled={loading}
          >
            <Text style={styles.adjustButtonText}>
              {loading ? 'Calculating...' : 'Adjust automatically'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            {...(Platform.OS === 'web' && { type: 'button' })}
            style={styles.saveAnywayButton}
            onPress={(e) => {
              if (Platform.OS === 'web' && e) {
                e.preventDefault();
                e.stopPropagation();
              }
              onDismiss();
            }}
          >
            <Text style={styles.saveAnywayButtonText}>Save anyway</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFF5F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      zIndex: 10000, // Very high z-index to ensure it's above calendar grid and other elements
      position: 'relative',
      display: 'flex', // Ensure it's displayed
      visibility: 'visible', // Ensure it's visible
      opacity: 1, // Ensure it's not transparent
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  bannerText: {
    flex: 1,
  },
  bannerMessage: {
    fontSize: 13,
    color: '#9A3412',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  bannerActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexShrink: 0,
  },
  adjustButton: {
    flexShrink: 0,
    backgroundColor: '#DC2626',
    borderWidth: 1,
    borderColor: '#991B1B',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  adjustButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  saveAnywayButton: {
    flexShrink: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  saveAnywayButtonText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestedBanner: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      zIndex: 10000,
      position: 'relative',
      display: 'flex',
      visibility: 'visible',
      opacity: 1,
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  suggestedTitle: {
    fontSize: 13,
    color: '#166534',
    fontWeight: '500',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestedMessage: {
    fontSize: 13,
    color: '#166534',
    fontWeight: '600',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestedSubtext: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '400',
    opacity: 0.8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  acceptButton: {
    flexShrink: 0,
    backgroundColor: '#16A34A',
    borderWidth: 1,
    borderColor: '#15803D',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  undoButton: {
    flexShrink: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  undoButtonText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

