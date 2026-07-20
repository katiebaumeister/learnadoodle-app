import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, Platform, Animated } from 'react-native';
import { Check, BookOpen, Calculator, FlaskConical, Palette, Music, Dumbbell, Code, Globe, Pencil, Sparkles, AlertTriangle } from 'lucide-react';
import CompletionRing from './CompletionRing';
import { detectConflicts } from '../../lib/utils/conflictDetection';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';
import { getEventChildIdsForDisplay } from '../../lib/utils/eventChildIds';
import { formatEventScheduleTimeLabel, formatEventChipTimeLabel } from '../planner/plannerListTableUtils';
import {
  getPlannerEventCategory,
  getPlannerCategoryColorKey,
  getPlannerCategoryMeta,
  isPlannerFamilyDayOffEvent,
  isPlannerPublicHolidayEvent,
  PLANNER_CHIP_RADIUS,
} from '../../lib/planner/plannerEventCategories';
import { getPlannerEventChipTitle } from '../../lib/planner/plannerLearningDayChip';

export default function EventChip({ ev, compact = false, fullWidth = false, onPress, onRightClick, onComplete, showCheckmark = true, hideTime = false, children = [], alignDotsNearTime = false, titleFontSize = 12, timeFontSize = 10, showDate = false, hideDoneStyling = false, disableTouchable = false, allDayEvents = [], plannerCalendarChip = false, weekBoardChip = false }) {
  const isDoneStatus = (statusValue) => {
    const normalized = String(statusValue || '').trim().toLowerCase();
    return normalized === 'done' || normalized === 'completed';
  };
  // Prefer snake_case when present (even when null) so "clear holiday" patches
  // correctly override any stale camelCase holidayType field in optimistic state.
  const hasSnakeHolidayType = Object.prototype.hasOwnProperty.call(ev || {}, 'holiday_type');
  const holidayTypeRaw = hasSnakeHolidayType ? ev?.holiday_type : (ev?.holidayType ?? '');
  // US public holidays are not editable events, but remain clickable to open School Year Settings.
  // Family day offs open Edit day off directly.
  const holidayType = String(holidayTypeRaw || '').toUpperCase();
  const isPublicHoliday = isPlannerPublicHolidayEvent(ev) || holidayType === 'GLOBAL_HOLIDAY';
  const isPlannerDayOffOrBreak = isPlannerFamilyDayOffEvent(ev);
  // Only US public holidays stay blank; family day offs get the Day off tint.
  const isBlankHolidayChip = isPublicHoliday;
  const isNonInstructionalChip = isPublicHoliday || isPlannerDayOffOrBreak;
  const shouldHideCompletionControl = isNonInstructionalChip;
  const hideChildDots = isNonInstructionalChip || ev?.hide_child_dots === true;
  const effectiveHideTime = hideTime || isNonInstructionalChip;
  const effectiveOnPress = onPress;
  const effectiveDisableTouchable = disableTouchable;
  
  const getEventTypeColor = () => {
    const category = getPlannerEventCategory(ev);
    return getPlannerCategoryColorKey(category);
  };
  
  const color = getEventTypeColor();
  const categoryMeta = getPlannerCategoryMeta(getPlannerEventCategory(ev));

  const isPlaceholder = Boolean(
    ev?.is_placeholder ||
    ev?.isPlaceholder ||
    ev?.status === 'placeholder' ||
    ev?.placeholder === true
  );
  const chipTitle = getPlannerEventChipTitle(ev);

  // Get participating child IDs (whole-family when none set) — memoized to prevent infinite loops
  const participatingChildIds = useMemo(
    () => getEventChildIdsForDisplay(ev, children),
    [ev?.id, ev?.child_id, ev?.child_ids, children]
  );

  // Get background color based on planner category (US public holidays stay blank)
  const getBackgroundColor = () => {
    if (isBlankHolidayChip) return 'transparent';
    return categoryMeta.color;
  };

  const getHoverBackgroundColor = () => {
    if (isBlankHolidayChip) return 'rgba(0, 0, 0, 0.02)';
    return categoryMeta.hoverColor || categoryMeta.color;
  };

  const getTitleColor = () => {
    if (isPlaceholder) return '#6B7280';
    if (isBlankHolidayChip) return '#111827';
    return categoryMeta.chipText;
  };

  const getTitleWeight = () => '500';

  const getTextColor = () => categoryMeta.chipText;

  // Get subject icon with pastel accent color
  const getSubjectIcon = () => {
    const subject = ev.subject || ev.subject_name || ev.subjectName || '';
    const subjectLower = subject.toLowerCase();
    
    // Determine icon based on subject
    let IconComponent = BookOpen; // default
    let iconColor = '#A78BFA'; // default pastel purple
    
    if (subjectLower.includes('math') || subjectLower.includes('mathematics') || subjectLower.includes('algebra') || subjectLower.includes('geometry') || subjectLower.includes('calculus')) {
      IconComponent = Calculator;
      iconColor = '#A78BFA'; // pastel purple
    } else if (subjectLower.includes('science') || subjectLower.includes('biology') || subjectLower.includes('chemistry') || subjectLower.includes('physics')) {
      IconComponent = FlaskConical;
      iconColor = '#86EFAC'; // pastel green
    } else if (subjectLower.includes('reading') || subjectLower.includes('language') || subjectLower.includes('ela') || subjectLower.includes('english') || subjectLower.includes('literature')) {
      IconComponent = BookOpen;
      iconColor = '#C084FC'; // pastel violet
    } else if (subjectLower.includes('writing') || subjectLower.includes('composition')) {
      IconComponent = Pencil;
      iconColor = '#C084FC'; // pastel violet
    } else if (subjectLower.includes('art') || subjectLower.includes('drawing') || subjectLower.includes('painting') || subjectLower.includes('creative')) {
      IconComponent = Palette;
      iconColor = '#F9A8D4'; // pastel pink
    } else if (subjectLower.includes('music') || subjectLower.includes('band') || subjectLower.includes('choir')) {
      IconComponent = Music;
      iconColor = '#F9A8D4'; // pastel pink
    } else if (subjectLower.includes('physical') || subjectLower.includes('pe') || subjectLower.includes('fitness') || subjectLower.includes('sport') || subjectLower.includes('gym')) {
      IconComponent = Dumbbell;
      iconColor = '#7DD3FC'; // pastel blue
    } else if (subjectLower.includes('technology') || subjectLower.includes('tech') || subjectLower.includes('coding') || subjectLower.includes('computer') || subjectLower.includes('programming')) {
      IconComponent = Code;
      iconColor = '#A78BFA'; // pastel purple
    } else if (subjectLower.includes('history') || subjectLower.includes('social studies') || subjectLower.includes('geography') || subjectLower.includes('government') || subjectLower.includes('economics')) {
      IconComponent = Globe;
      iconColor = '#7DD3FC'; // pastel blue
    }
    
    return { IconComponent, iconColor };
  };

  // Format time so display always matches actual scheduled local time
  const formatTime = () => {
    if (plannerCalendarChip || weekBoardChip) {
      const chipLabel = formatEventChipTimeLabel(ev);
      return chipLabel || null;
    }

    const scheduleLabel = formatEventScheduleTimeLabel(ev);
    if (
      scheduleLabel === 'No time added' ||
      scheduleLabel === 'All Day' ||
      (scheduleLabel && !scheduleLabel.includes('12:00 AM - 11:59'))
    ) {
      return scheduleLabel;
    }

    // Debug logging for the specific event we're tracking
    // if (ev && ev.id === 'fd8afe0d-ffc8-4753-9ea6-32835b52fcb6') {
    //   console.log('[EventChip] formatTime called for fd8afe0d-ffc8-4753-9ea6-32835b52fcb6:', {
    //     start_local: ev.start_local,
    //     start_ts: ev.start_ts,
    //     start: ev.start,
    //     time: ev.time,
    //     data_start_local: ev.data?.start_local,
    //     data_start_ts: ev.data?.start_ts,
    //   });
    // }
    
    // 1) Prefer start_local (time-only or timestamp) as the single source of truth
    if (typeof ev.start_local === 'string') {
      const match = ev.start_local.match(/(\d{1,2})(?::(\d{2}))?(?:\s*(AM|PM))?/i);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = (match[2] ?? '00').padStart(2, '0');
        const periodRaw = match[3];

        if (periodRaw) {
          const period = periodRaw.toUpperCase();
          const result = minutes === '00' ? `${hours} ${period}` : `${hours}:${minutes} ${period}`;
          // if (ev && ev.id === 'fd8afe0d-ffc8-4753-9ea6-32835b52fcb6') {
          //   console.log('[EventChip] formatTime result (with period):', result, 'from start_local:', ev.start_local);
          // }
          return result;
        }

        const derivedPeriod = hours >= 12 ? 'PM' : 'AM';
        if (hours > 12) hours -= 12;
        else if (hours === 0) hours = 12;
        const result = minutes === '00' ? `${hours} ${derivedPeriod}` : `${hours}:${minutes} ${derivedPeriod}`;
        // if (ev && ev.id === 'fd8afe0d-ffc8-4753-9ea6-32835b52fcb6') {
        //   console.log('[EventChip] formatTime result (derived period):', result, 'from start_local:', ev.start_local, 'hours:', parseInt(match[1], 10));
        // }
        return result;
      }
      // Log only if start_local exists but doesn't match expected format (potential issue)
      console.warn('[EventChip] start_local exists but doesn\'t match expected format:', { eventId: ev.id, start_local: ev.start_local });
    }

    // 2) Fallback: derive from full timestamps if start_local is missing
    let startStr = ev.start || ev.start_ts || ev.start_at;
    if (!startStr) {
      // Holiday/synthetic events (e.g. holiday-2026-02-12-...) have no time; don't warn
      if (ev?.type === 'holiday' || ev?.event_type === 'holiday' || (ev?.id && String(ev.id).startsWith('holiday-'))) {
        return null;
      }
      // Use normalized ev.time (set from start_local in month view) if it looks like a time
      if (typeof ev.time === 'string' && ev.time.match(/(\d{1,2})(?::(\d{2}))?(?:\s*(AM|PM))?/i)) {
        const match = ev.time.match(/(\d{1,2})(?::(\d{2}))?(?:\s*(AM|PM))?/i);
        if (match) {
          let hours = parseInt(match[1], 10);
          const minutes = (match[2] ?? '00').padStart(2, '0');
          const periodRaw = match[3];
          const period = periodRaw ? periodRaw.toUpperCase() : (hours >= 12 ? 'PM' : 'AM');
          if (hours > 12 && !periodRaw) hours -= 12;
          else if (hours === 0 && !periodRaw) hours = 12;
          return minutes === '00' ? `${hours} ${period}` : `${hours}:${minutes} ${period}`;
        }
      }
      // Log only if no time source found (potential issue)
      console.warn('[EventChip] No time source found:', { eventId: ev.id, hasStartLocal: !!ev.start_local, start_local: ev.start_local });
      return null;
    }

    const date = new Date(startStr);
    if (Number.isNaN(date.getTime())) {
      console.warn('[EventChip] Invalid date:', { eventId: ev.id, startStr });
      return null;
    }

    let hours = date.getHours(); // getHours() returns LOCAL hours
    const minutes = date.getMinutes().toString().padStart(2, '0');

    const period = hours >= 12 ? 'PM' : 'AM';
    if (hours > 12) hours -= 12;
    else if (hours === 0) hours = 12;

    return minutes === '00' ? `${hours} ${period}` : `${hours}:${minutes} ${period}`;
  };

  const displayTime = formatTime();

  // Format date for display (MM/DD/YYYY)
  const formatDate = () => {
    const dateStr = ev.start || ev.start_ts || ev.start_local || ev.start_at;
    if (!dateStr) return null;
    
    try {
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime())) return null;
      
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    } catch (e) {
      return null;
    }
  };

  const displayDate = formatDate();

  const [isHovered, setIsHovered] = React.useState(false);
  const [showConflictTooltip, setShowConflictTooltip] = React.useState(false);
  const [conflictTooltipPosition, setConflictTooltipPosition] = React.useState({ x: 0, y: 0 });

  /** Survives brief stale `ev.status` after refetch (common cause of checkmark flash). */
  const [completionOverride, setCompletionOverride] = useState(null);
  useEffect(() => {
    setCompletionOverride(null);
  }, [ev?.id]);
  useEffect(() => {
    if (completionOverride === null) return;
    const serverDone = isDoneStatus(ev?.status);
    if (serverDone === completionOverride) {
      setCompletionOverride(null);
    }
  }, [ev?.status, completionOverride]);

  const handleCompletionToggle = useCallback(() => {
    if (!onComplete || !ev) return;
    const serverDone = isDoneStatus(ev.status);
    setCompletionOverride(!serverDone);
    Promise.resolve(onComplete(ev)).catch(() => {
      setCompletionOverride(null);
    });
  }, [onComplete, ev]);

  // Conflict detection
  const [conflictInfo, setConflictInfo] = React.useState(null);
  const [dismissedConflicts, setDismissedConflicts] = React.useState(new Set());

  // Load dismissed conflicts from localStorage on mount
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('dismissedConflicts');
        if (stored) {
          setDismissedConflicts(new Set(JSON.parse(stored)));
        }
      } catch (e) {
        console.error('[EventChip] Error loading dismissed conflicts:', e);
      }
    }
  }, []);

  // Save dismissed conflicts to localStorage
  const saveDismissedConflicts = (newSet) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('dismissedConflicts', JSON.stringify(Array.from(newSet)));
      } catch (e) {
        console.error('[EventChip] Error saving dismissed conflicts:', e);
      }
    }
  };

  // Detect conflicts
  useEffect(() => {
    if (!ev?.id || !allDayEvents || allDayEvents.length === 0) {
      setConflictInfo(null);
      return;
    }

    // Check if this conflict was dismissed
    if (dismissedConflicts.has(ev.id)) {
      setConflictInfo(null);
      return;
    }

    // Filter events to only include those for the same child(ren) as this event
    const eventChildIds = participatingChildIds;
    if (eventChildIds.length === 0) {
      setConflictInfo(null);
      return;
    }

    // Filter allDayEvents to only include events for the same child(ren)
    const sameChildEvents = allDayEvents.filter((otherEvent) => {
      if (!otherEvent || otherEvent.id === ev.id) return false; // Don't count self

      const otherChildIds = getEventChildIdsForDisplay(otherEvent, children);

      const setA = new Set(eventChildIds.map(String));
      return otherChildIds.some((cid) => setA.has(String(cid)));
    });

    // Detect conflicts using the utility function
    const conflictCount = detectConflicts(ev, sameChildEvents);
    
    if (conflictCount > 0) {
      setConflictInfo({
        count: conflictCount,
      });
    } else {
      setConflictInfo(null);
    }
  }, [ev, allDayEvents, dismissedConflicts, participatingChildIds]);

  // Handle conflict indicator click — open event details with conflict banner (not Quick Reschedule)
  const handleConflictClick = (e) => {
    if (Platform.OS === 'web' && e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (typeof window !== 'undefined' && ev?.id) {
      window.dispatchEvent(
        new CustomEvent('openEventModal', {
          detail: {
            eventId: ev.id,
            initialEvent: ev,
            openConflictResolution: true,
          },
        }),
      );
    }
  };

  // Handle conflict indicator dismiss
  const handleConflictDismiss = (e) => {
    if (Platform.OS === 'web' && e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    const newDismissed = new Set(dismissedConflicts);
    newDismissed.add(ev.id);
    setDismissedConflicts(newDismissed);
    saveDismissedConflicts(newDismissed);
    setConflictInfo(null);
  };

  // Handle conflict indicator hover
  const handleConflictHover = (e) => {
    if (Platform.OS === 'web' && e && e.currentTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      setConflictTooltipPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      });
      setShowConflictTooltip(true);
    }
  };

  const handleConflictHoverLeave = () => {
    setShowConflictTooltip(false);
  };

  const renderWrapper = (baseStyle, children, webProps = {}) => {
    const webDataAttrs =
      Platform.OS === 'web' && ev?.id != null
        ? { 'data-event-id': String(ev.id) }
        : {};
    const style = {
      ...baseStyle,
      ...(Platform.OS === 'web' && {
        cursor: (effectiveOnPress || onRightClick) && !effectiveDisableTouchable ? 'pointer' : 'default',
        outline: 'none',
        boxShadow: 'none',
        borderStyle: 'solid',
        borderWidth: baseStyle.borderWidth !== undefined ? baseStyle.borderWidth : 0,
        borderColor: 'transparent',
      }),
    };

    if ((effectiveOnPress || onRightClick) && !effectiveDisableTouchable) {
      return (
        <TouchableOpacity 
          {...(Platform.OS === 'web' && webDataAttrs)}
          {...(Platform.OS === 'web' && webProps)}
          style={style} 
          activeOpacity={0.85} 
          onPress={effectiveOnPress}
          {...(Platform.OS === 'web' && {
            onMouseEnter: (e) => {
              setIsHovered(true);
              applyChipHoverStyles(e.currentTarget, true);
            },
            onMouseLeave: (e) => {
              setIsHovered(false);
              applyChipHoverStyles(e.currentTarget, false);
            },
            onFocus: (e) => {
              applyChipHoverStyles(e.currentTarget, false);
            },
          })}
          {...(typeof window !== 'undefined' && onRightClick && {
            onMouseDown: (e) => {
              if (e.button === 2) {
                e.preventDefault();
                e.stopPropagation();
                onRightClick(ev, e);
              }
            },
            onContextMenu: (e) => {
              e.preventDefault();
              e.stopPropagation();
              onRightClick(ev, e);
            }
          })}
        >
          {children}
        </TouchableOpacity>
      );
    }
    return (
      <View 
        {...(Platform.OS === 'web' && webDataAttrs)}
        {...(Platform.OS === 'web' && webProps)}
        style={style}
        {...(Platform.OS === 'web' && {
          onMouseEnter: (e) => {
            setIsHovered(true);
            applyChipHoverStyles(e.currentTarget, true);
          },
          onMouseLeave: (e) => {
            setIsHovered(false);
            applyChipHoverStyles(e.currentTarget, false);
          },
        })}
      >
        {children}
      </View>
    );
  };

  const isDone = completionOverride !== null ? completionOverride : isDoneStatus(ev?.status);
  const shouldShowDoneStyling = isDone && !hideDoneStyling;
  // Always show lighter text for completed events, but only strikethrough when hideDoneStyling is false
  const shouldShowLighterText = isDone;

  const applyChipHoverStyles = (target, hovering) => {
    if (!target?.style) return;
    target.style.backgroundColor = hovering ? getHoverBackgroundColor() : getBackgroundColor();
    target.style.outline = 'none';
    target.style.boxShadow = 'none';
    target.style.border = 'none';
  };

  if (compact && fullWidth) {
    const baseStyle = {
      borderRadius: PLANNER_CHIP_RADIUS,
      backgroundColor: getBackgroundColor(),
      paddingHorizontal: 6,
      paddingVertical: 4,
      width: '100%',
      opacity: shouldShowLighterText ? 0.5 : 1,
      overflow: 'hidden',
    };

    const content = (
      <View style={{ 
        position: 'relative',
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 6, // Reduced spacing
        flex: 1, 
        minWidth: 0,
        paddingVertical: 2, // Significantly reduced spacing
      }}
      >
        {/* Conflict Indicator */}
        {conflictInfo && (
          <View
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              zIndex: 10,
            }}
            {...(Platform.OS === 'web' && {
              onMouseEnter: handleConflictHover,
              onMouseLeave: handleConflictHoverLeave,
              onClick: handleConflictClick,
              onMouseDown: (e) => {
                e.stopPropagation();
                e.preventDefault();
              },
              onContextMenu: handleConflictDismiss,
            })}
          >
            <TouchableOpacity
              onPress={handleConflictClick}
              onLongPress={handleConflictDismiss}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              style={{
                padding: 2,
              }}
            >
              <AlertTriangle size={12} color="#D97706" fill="#FEF3C7" />
            </TouchableOpacity>
          </View>
        )}
        {/* Attendance Checkmark - Progressive Completion Ring - Hidden for holidays */}
        {showCheckmark && onComplete && !shouldHideCompletionControl && (
          <View
            {...(Platform.OS === 'web' && typeof window !== 'undefined' && {
              onClick: (e) => {
                e.stopPropagation();
                e.preventDefault();
                handleCompletionToggle();
              },
              onMouseDown: (e) => {
                e.stopPropagation();
              },
            })}
            style={{ 
              flexShrink: 0,
              width: 20,
              height: 20,
              alignItems: 'center',
              justifyContent: 'center',
              ...(Platform.OS === 'web' && {
                cursor: 'pointer',
              }),
            }}
          >
            <TouchableOpacity
              onPress={(e) => {
                if (e && e.stopPropagation) {
                  e.stopPropagation();
                }
                if (e && e.preventDefault) {
                  e.preventDefault();
                }
                handleCompletionToggle();
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={{ 
                flexShrink: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CompletionRing isDone={isDone} size={16} />
            </TouchableOpacity>
          </View>
        )}
        {weekBoardChip ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontSize: titleFontSize,
                lineHeight: titleFontSize + 4,
                color: getTitleColor(),
                fontWeight: getTitleWeight(),
                textAlign: 'left',
                textDecorationLine: shouldShowDoneStyling ? 'line-through' : 'none',
                opacity: shouldShowLighterText ? 0.5 : 1,
                flexShrink: 1,
                minWidth: 0,
                ...(Platform.OS === 'web' && {
                  fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  letterSpacing: '-0.006em',
                  ...(shouldShowDoneStyling && {
                    textDecorationThickness: '0.5px',
                    textDecorationColor: 'rgba(17, 24, 39, 0.4)',
                  }),
                }),
              }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {chipTitle}
            </Text>
            {displayTime && !hideTime && !isNonInstructionalChip && (
              <Text style={{
                opacity: 1,
                fontWeight: '400',
                fontSize: timeFontSize,
                color: '#6B7280',
                textDecorationLine: 'none',
                flexShrink: 0,
                ...(Platform.OS === 'web' && {
                  fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '0',
                }),
              }}>{displayTime}</Text>
            )}
          </View>
        ) : alignDotsNearTime ? (
          // Layout for day view: dots right after time
          <View style={{ flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: titleFontSize,
                    lineHeight: titleFontSize + 4,
                    color: getTitleColor(),
                    fontWeight: getTitleWeight(),
                    textAlign: 'left',
                    textDecorationLine: shouldShowDoneStyling ? 'line-through' : 'none',
                    opacity: shouldShowLighterText ? 0.5 : 1,
                    flexShrink: 1,
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      letterSpacing: '-0.006em', // Tighter, more editorial
                      ...(shouldShowDoneStyling && {
                        textDecorationThickness: '0.5px',
                        textDecorationColor: 'rgba(17, 24, 39, 0.4)',
                      }),
                    }),
                  }}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {chipTitle}
                </Text>
                {displayTime && !hideTime && !isNonInstructionalChip && (
                  <Text style={{ 
                    opacity: 1,
                    fontWeight: '400', // Lighter than title
                    fontSize: timeFontSize,
                    color: '#D1D5DB', // Lighter gray for time text
                    textDecorationLine: 'none', // No strikethrough on time
                    marginLeft: 4,
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '0',
                    }),
                  }}>{displayTime}</Text>
                )}
              </View>
              {/* Child participation dots - right after time */}
              {!hideChildDots && participatingChildIds.length > 0 && (
                <ChildAvatarCluster
                  childIds={participatingChildIds}
                  familyChildren={children}
                  size={9}
                  overlap={-3}
                  style={{ marginLeft: 6, flexShrink: 0 }}
                />
              )}
            </View>
            {/* Date display underneath */}
            {showDate && displayDate && (
              <Text style={{
                fontSize: timeFontSize - 1,
                color: '#9CA3AF',
                fontWeight: '400',
                ...(Platform.OS === 'web' && {
                  fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }),
              }}>
                {displayDate}
              </Text>
            )}
          </View>
        ) : (
          // Layout for other views: dots right-aligned
          <View style={{ flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: titleFontSize,
                    lineHeight: titleFontSize + 4,
                    color: getTitleColor(),
                    fontWeight: getTitleWeight(),
                    textAlign: 'left',
                    textDecorationLine: shouldShowDoneStyling ? 'line-through' : 'none',
                    opacity: shouldShowLighterText ? 0.5 : 1,
                    flex: 1,
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      letterSpacing: '-0.006em', // Tighter, more editorial
                      ...(shouldShowDoneStyling && {
                        textDecorationThickness: '0.5px',
                        textDecorationColor: 'rgba(17, 24, 39, 0.4)',
                      }),
                    }),
                  }}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {chipTitle}
                </Text>
                {displayTime && !hideTime && !isNonInstructionalChip && (
                  <Text style={{ 
                    opacity: 1,
                    fontWeight: '400', // Lighter than title
                    fontSize: timeFontSize,
                    color: '#D1D5DB', // Lighter gray for time text
                    textDecorationLine: 'none', // No strikethrough on time
                    marginLeft: 4,
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '0',
                    }),
                  }}>{displayTime}</Text>
                )}
              </View>
              {/* Child avatars — month/week planner chips */}
              {!hideChildDots && participatingChildIds.length > 0 && (
                <ChildAvatarCluster
                  childIds={participatingChildIds}
                  familyChildren={children}
                  size={16}
                  overlap={-7}
                  hideBackground
                  style={{ marginLeft: 'auto', flexShrink: 0, alignSelf: 'center' }}
                />
              )}
            </View>
            {/* Date display underneath */}
            {showDate && displayDate && (
              <Text style={{
                fontSize: timeFontSize - 1,
                color: '#9CA3AF',
                fontWeight: '400',
                ...(Platform.OS === 'web' && {
                  fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }),
              }}>
                {displayDate}
              </Text>
            )}
          </View>
        )}
      </View>
    );

    return renderWrapper(baseStyle, content);
  }

  if (compact) {
    const baseStyle = {
      borderRadius: PLANNER_CHIP_RADIUS,
      backgroundColor: getBackgroundColor(),
      paddingHorizontal: 6,
      paddingVertical: 3,
      maxWidth: '100%',
      opacity: shouldShowLighterText ? 0.5 : 1,
      overflow: 'hidden',
    };

    const { IconComponent: SubjectIcon, iconColor: subjectIconColor } = getSubjectIcon();

    const content = (
      <View style={{ 
        position: 'relative',
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 6, // Reduced spacing
        flex: 1, 
        minWidth: 0,
        paddingVertical: 2, // Significantly reduced spacing
      }}
      >
        {/* Conflict Indicator */}
        {conflictInfo && (
          <View
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              zIndex: 10,
            }}
            {...(Platform.OS === 'web' && {
              onMouseEnter: handleConflictHover,
              onMouseLeave: handleConflictHoverLeave,
              onClick: handleConflictClick,
              onMouseDown: (e) => {
                e.stopPropagation();
                e.preventDefault();
              },
              onContextMenu: handleConflictDismiss,
            })}
          >
            <TouchableOpacity
              onPress={handleConflictClick}
              onLongPress={handleConflictDismiss}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              style={{
                padding: 2,
              }}
            >
              <AlertTriangle size={12} color="#D97706" fill="#FEF3C7" />
            </TouchableOpacity>
          </View>
        )}
        {/* Attendance Checkmark - Progressive Completion Ring - Hidden for holidays */}
        {showCheckmark && onComplete && !shouldHideCompletionControl && (
          <View
            {...(Platform.OS === 'web' && typeof window !== 'undefined' && {
              onClick: (e) => {
                e.stopPropagation();
                e.preventDefault();
                handleCompletionToggle();
              },
              onMouseDown: (e) => {
                e.stopPropagation();
              },
            })}
            style={{ 
              flexShrink: 0,
              width: 20,
              height: 20,
              alignItems: 'center',
              justifyContent: 'center',
              ...(Platform.OS === 'web' && {
                cursor: 'pointer',
              }),
            }}
          >
            <TouchableOpacity
              onPress={(e) => {
                if (e && e.stopPropagation) {
                  e.stopPropagation();
                }
                if (e && e.preventDefault) {
                  e.preventDefault();
                }
                handleCompletionToggle();
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={{ 
                flexShrink: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CompletionRing isDone={isDone} size={16} />
            </TouchableOpacity>
          </View>
        )}
      {/* Subject Icon - removed for editorial style */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 12,
              lineHeight: 16,
              color: getTitleColor(),
              fontWeight: getTitleWeight() === '400' ? '500' : '600',
              textAlign: 'left',
              textDecorationLine: shouldShowDoneStyling ? 'line-through' : 'none',
              opacity: shouldShowDoneStyling ? 0.5 : 1,
              flex: 1,
              ...(Platform.OS === 'web' && {
                fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                letterSpacing: '-0.006em',
                ...(isDone && {
                  textDecorationThickness: '0.5px',
                  textDecorationColor: 'rgba(17, 24, 39, 0.4)',
                }),
              }),
            }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {chipTitle}
          </Text>
          {displayTime && !hideTime && (
            <Text style={{ 
              opacity: 1,
              fontWeight: '500', // Medium weight
              fontSize: 10,
              color: '#9CA3AF', // Tertiary gray
              textDecorationLine: 'none', // No strikethrough on time
              marginLeft: 4,
              ...(Platform.OS === 'web' && {
                fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0',
              }),
            }}>{displayTime}</Text>
          )}
        </View>
        {/* Child participation dots - Cluster Glyph (month compact) */}
        {!hideChildDots && participatingChildIds.length > 0 && (
          <ChildAvatarCluster
            childIds={participatingChildIds}
            familyChildren={children}
            size={8}
            overlap={-3}
            style={{ marginLeft: alignDotsNearTime ? 4 : 'auto', flexShrink: 0 }}
          />
        )}
      </View>
    );

    return (
      <>
        {renderWrapper(baseStyle, content)}
        {/* Conflict Tooltip */}
        {Platform.OS === 'web' && showConflictTooltip && conflictInfo && (() => {
          let ReactDOM;
          try {
            ReactDOM = require('react-dom');
          } catch (e) {
            return null;
          }
          
          const tooltipContent = (
            <View
              style={{
                position: 'fixed',
                left: conflictTooltipPosition.x,
                top: conflictTooltipPosition.y,
                transform: 'translate(-50%, -100%)',
                backgroundColor: '#1F2937',
                borderRadius: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginBottom: 4,
                zIndex: 10001,
                maxWidth: 200,
                ...(Platform.OS === 'web' && {
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                }),
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '500', marginBottom: 4 }}>
                ⚠️ Conflicts with {conflictInfo.count} other {conflictInfo.count === 1 ? 'event' : 'events'}
              </Text>
              <Text style={{ color: '#D1D5DB', fontSize: 11 }}>
                Fix with Quick Reschedule
              </Text>
            </View>
          );
          
          if (ReactDOM && typeof document !== 'undefined' && document.body) {
            return ReactDOM.createPortal(tooltipContent, document.body);
          }
          return tooltipContent;
        })()}
      </>
    );
  }

  const baseStyle = {
    borderRadius: 0, // No rounded corners
    borderWidth: 0,
    backgroundColor: getBackgroundColor(),
    paddingHorizontal: 0,
    paddingVertical: 2, // Significantly reduced spacing
    opacity: shouldShowLighterText ? 0.5 : 1,
  };

  const { IconComponent: SubjectIcon, iconColor: subjectIconColor } = getSubjectIcon();
  
  const content = (
    <View style={{ 
      position: 'relative',
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 6, // Reduced spacing
      flex: 1, 
      minWidth: 0,
      paddingVertical: 2, // Significantly reduced spacing
      ...(Platform.OS === 'web' && {
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
      }),
    }}
    {...(Platform.OS === 'web' && {
      onMouseEnter: (e) => {
        if (e.currentTarget && e.currentTarget.style) {
          e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.01)';
        }
      },
      onMouseLeave: (e) => {
        if (e.currentTarget && e.currentTarget.style) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      },
    })}
    >
      {/* Conflict Indicator */}
      {conflictInfo && (
        <View
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            zIndex: 10,
          }}
          {...(Platform.OS === 'web' && {
            onMouseEnter: handleConflictHover,
            onMouseLeave: handleConflictHoverLeave,
            onClick: handleConflictClick,
            onMouseDown: (e) => {
              e.stopPropagation();
              e.preventDefault();
            },
            onContextMenu: handleConflictDismiss,
          })}
        >
          <TouchableOpacity
            onPress={handleConflictClick}
            onLongPress={handleConflictDismiss}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            style={{
              padding: 2,
            }}
          >
            <AlertTriangle size={12} color="#D97706" fill="#FEF3C7" />
          </TouchableOpacity>
        </View>
      )}
      {/* Attendance Checkmark - Minimal Checkbox - Hidden for holidays */}
      {showCheckmark && onComplete && !shouldHideCompletionControl && (
        <View
          {...(Platform.OS === 'web' && typeof window !== 'undefined' && {
            onClick: (e) => {
              e.stopPropagation();
              e.preventDefault();
              handleCompletionToggle();
            },
            onMouseDown: (e) => {
              e.stopPropagation();
            },
          })}
          style={{ 
            flexShrink: 0,
            width: 20,
            height: 20,
            alignItems: 'center',
            justifyContent: 'center',
            ...(Platform.OS === 'web' && {
              cursor: 'pointer',
            }),
          }}
        >
          <TouchableOpacity
            onPress={(e) => {
              if (e && e.stopPropagation) {
                e.stopPropagation();
              }
              if (e && e.preventDefault) {
                e.preventDefault();
              }
              handleCompletionToggle();
            }}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            style={{ 
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isDone ? (
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Check size={6} color="#10B981" strokeWidth={2.5} />
              </View>
            ) : (
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  borderWidth: 1.5,
                  borderColor: 'rgba(156, 163, 175, 0.4)',
                  backgroundColor: 'transparent',
                }}
              />
            )}
          </TouchableOpacity>
        </View>
      )}
      {/* Subject Icon - removed for editorial style */}
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
        <Text 
          style={{ 
            fontSize: 12,
            lineHeight: 16,
            color: getTitleColor(),
            fontWeight: getTitleWeight() === '400' ? '600' : getTitleWeight(),
            textAlign: 'left',
            textDecorationLine: isDone ? 'line-through' : 'none',
            opacity: shouldShowDoneStyling ? 0.5 : 1,
            flex: 1,
            ...(Platform.OS === 'web' && {
              fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              letterSpacing: '-0.006em',
              ...(isDone && {
                textDecorationThickness: '0.5px',
                textDecorationColor: 'rgba(17, 24, 39, 0.4)',
              }),
            }),
          }} 
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {chipTitle}
        </Text>
        {displayTime && !hideTime && (
            <Text style={{ 
              opacity: 1,
              fontWeight: '500', // Medium weight
              fontSize: 10,
              color: '#9CA3AF', // Tertiary gray
              textDecorationLine: 'none', // No strikethrough on time
              marginLeft: 4,
              ...(Platform.OS === 'web' && {
                fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0',
              }),
            }}>{displayTime}</Text>
        )}
      </View>
      {/* Child participation dots - Cluster Glyph */}
      {!hideChildDots && participatingChildIds.length > 0 && (
        <ChildAvatarCluster
          childIds={participatingChildIds}
          familyChildren={children}
          size={9}
          overlap={-3}
          style={{ marginLeft: alignDotsNearTime ? 4 : 'auto', flexShrink: 0 }}
        />
      )}
    </View>
  );

  return (
    <>
      {renderWrapper(baseStyle, content)}
      {/* Conflict Tooltip */}
      {Platform.OS === 'web' && showConflictTooltip && conflictInfo && (() => {
        let ReactDOM;
        try {
          ReactDOM = require('react-dom');
        } catch (e) {
          return null;
        }
        
        const tooltipContent = (
          <View
            style={{
              position: 'fixed',
              left: conflictTooltipPosition.x,
              top: conflictTooltipPosition.y,
              transform: 'translate(-50%, -100%)',
              backgroundColor: '#1F2937',
              borderRadius: 6,
              paddingHorizontal: 12,
              paddingVertical: 8,
              marginBottom: 4,
              zIndex: 10001,
              maxWidth: 200,
              ...(Platform.OS === 'web' && {
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              }),
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '500', marginBottom: 4 }}>
              ⚠️ Conflicts with {conflictInfo.count} other {conflictInfo.count === 1 ? 'event' : 'events'}
            </Text>
            <Text style={{ color: '#D1D5DB', fontSize: 11 }}>
              Fix with Quick Reschedule
            </Text>
          </View>
        );
        
        if (ReactDOM && typeof document !== 'undefined' && document.body) {
          return ReactDOM.createPortal(tooltipContent, document.body);
        }
        return tooltipContent;
      })()}
    </>
  );
}
