import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Platform, Animated } from 'react-native';
import { Check, BookOpen, Calculator, FlaskConical, Palette, Music, Dumbbell, Code, Globe, Pencil, Sparkles, AlertTriangle } from 'lucide-react';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import CompletionRing from './CompletionRing';
import { detectConflicts } from '../../lib/utils/conflictDetection';

export default function EventChip({ ev, compact = false, fullWidth = false, onPress, onRightClick, onComplete, showCheckmark = true, hideTime = false, children = [], alignDotsNearTime = false, titleFontSize = 12, timeFontSize = 10, showDate = false, hideDoneStyling = false, disableTouchable = false, allDayEvents = [] }) {
  // Holidays should not be clickable, movable, or show time
  const isHoliday = ev?.type === 'holiday' || ev?.event_type === 'holiday';
  const effectiveHideTime = hideTime || isHoliday;
  const effectiveOnPress = isHoliday ? undefined : onPress;
  const effectiveDisableTouchable = disableTouchable || isHoliday;
  
  // Get color based on event type, fallback to ev.color, then default to gray
  const getEventTypeColor = () => {
    const eventType = ev.event_type || ev.type || '';
    const eventTypeLower = eventType.toLowerCase();
    
    // Map event types to color names
    if (eventTypeLower === 'lesson') return 'lesson';
    if (eventTypeLower === 'activity') return 'activity';
    if (eventTypeLower === 'assignment') return 'assignment';
    if (eventTypeLower === 'schedule block' || eventTypeLower === 'scheduled class day') return 'schedule_block';
    if (eventTypeLower === 'appointment') return 'appointment';
    if (eventTypeLower === 'project') return 'project';
    if (eventTypeLower === 'exam' || eventTypeLower === 'assessment') return 'exam';
    if (eventTypeLower === 'holiday') return 'holiday';
    
    // Fallback to ev.color if set, otherwise default to appointment (gray)
    return ev.color ?? 'appointment';
  };
  
  const color = getEventTypeColor();
  
  // Get participating child IDs - memoized to prevent infinite loops
  const participatingChildIds = useMemo(() => {
    const childIds = [];
    if (ev?.child_id) {
      childIds.push(ev.child_id);
    }
    if (ev?.child_ids && Array.isArray(ev.child_ids)) {
      childIds.push(...ev.child_ids);
    }
    // Remove duplicates
    return [...new Set(childIds)];
  }, [ev?.child_id, ev?.child_ids]);
  
  // Get child colors for dots
  const getChildDotColor = (childId) => {
    const child = children.find(c => c.id === childId);
    if (!child || !child.avatar) {
      return '#9CA3AF'; // Default gray
    }
    return getChildColorFromAvatar(child.avatar);
  };

  // Get background color based on event type (soft contrast fill)
  const getBackgroundColor = () => {
    switch (color) {
      case 'lesson':
        return '#E3F0FF'; // Soft Blue
      case 'activity':
        return '#EDE6FF'; // Lavender
      case 'assignment':
        return '#DFF7E3'; // Soft Green
      case 'schedule_block':
        return '#FFE8D1'; // Soft Orange / Peach
      case 'appointment':
        return '#F2F4F7'; // Warm Gray
      case 'project':
        return '#D6F0ED'; // Soft Teal
      case 'exam':
        return '#FCE7F3'; // Soft Pink
      case 'holiday':
        return 'transparent'; // No fill; text uses Learnadoodle blue
      default:
        return '#F2F4F7'; // Default Warm Gray
    }
  };

  // Get hover background color (more saturated version of event type color)
  const getHoverBackgroundColor = () => {
    switch (color) {
      case 'lesson':
        return '#C7E1FF'; // More saturated Soft Blue
      case 'activity':
        return '#DDD0FF'; // More saturated Lavender
      case 'assignment':
        return '#C5F0D1'; // More saturated Soft Green
      case 'schedule_block':
        return '#FFD9B3'; // More saturated Soft Orange / Peach
      case 'appointment':
        return '#E5E7EB'; // More saturated Warm Gray
      case 'project':
        return '#B8E6E0'; // More saturated Soft Teal
      case 'exam':
        return '#F9D5E8'; // More saturated Soft Pink
      case 'holiday':
        return 'transparent';
      default:
        return '#E5E7EB'; // Default more saturated Warm Gray
    }
  };

  // Get text color based on event type (using accent colors for emphasis)
  const getTextColor = (currentColor) => {
    switch (currentColor) {
      case 'lesson':
        return '#4C7ED9'; // Soft Blue accent
      case 'activity':
        return '#7A5CD6'; // Lavender accent
      case 'assignment':
        return '#4FAF75'; // Soft Green accent
      case 'schedule_block':
        return '#E08A3C'; // Soft Orange / Peach accent
      case 'appointment':
        return '#6B7280'; // Warm Gray accent
      case 'project':
        return '#0D9488'; // Teal accent
      case 'exam':
        return '#BE185D'; // Pink accent
      case 'holiday':
        return '#6BB3E8'; // Learnadoodle blue
      default:
        return '#111827'; // Default dark text
    }
  };

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
    const sameChildEvents = allDayEvents.filter(otherEvent => {
      if (!otherEvent || otherEvent.id === ev.id) return false; // Don't count self
      
      const otherChildIds = [];
      if (otherEvent.child_id) otherChildIds.push(otherEvent.child_id);
      if (otherEvent.child_ids && Array.isArray(otherEvent.child_ids)) {
        otherChildIds.push(...otherEvent.child_ids);
      }
      
      // Check if there's any overlap in child IDs
      return eventChildIds.some(cid => otherChildIds.includes(cid));
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

  // Handle conflict indicator click
  const handleConflictClick = (e) => {
    if (Platform.OS === 'web' && e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    // Open Quick Reschedule with this event, skip to preview
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openQuickReschedule', {
        detail: {
          event: ev,
          skipToPreview: true,
        }
      }));
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
    const style = {
      ...baseStyle,
      ...(Platform.OS === 'web' && {
        cursor: (effectiveOnPress || onRightClick) && !effectiveDisableTouchable ? 'pointer' : 'default',
        outline: 'none',
        borderWidth: baseStyle.borderWidth !== undefined ? baseStyle.borderWidth : 0,
        borderColor: 'transparent',
        borderStyle: 'solid',
        boxShadow: 'none',
      }),
    };

    if ((effectiveOnPress || onRightClick) && !effectiveDisableTouchable) {
      return (
        <TouchableOpacity 
          {...(Platform.OS === 'web' && webProps)}
          style={style} 
          activeOpacity={0.85} 
          onPress={effectiveOnPress}
          {...(Platform.OS === 'web' && {
            onMouseEnter: (e) => {
              setIsHovered(true);
              if (e.currentTarget && e.currentTarget.style) {
                e.currentTarget.style.backgroundColor = getHoverBackgroundColor();
                e.currentTarget.style.outline = 'none';
                e.currentTarget.style.border = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }
            },
            onMouseLeave: (e) => {
              setIsHovered(false);
              if (e.currentTarget && e.currentTarget.style) {
                e.currentTarget.style.backgroundColor = getBackgroundColor();
                e.currentTarget.style.outline = 'none';
                e.currentTarget.style.border = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }
            },
            onFocus: (e) => {
              if (e.currentTarget && e.currentTarget.style) {
                e.currentTarget.style.outline = 'none';
                e.currentTarget.style.border = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }
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
        {...(Platform.OS === 'web' && webProps)}
        style={style}
        {...(Platform.OS === 'web' && {
          onMouseEnter: (e) => {
            setIsHovered(true);
            if (e.currentTarget && e.currentTarget.style) {
              e.currentTarget.style.backgroundColor = getHoverBackgroundColor();
            }
          },
          onMouseLeave: (e) => {
            setIsHovered(false);
            if (e.currentTarget && e.currentTarget.style) {
              e.currentTarget.style.backgroundColor = getBackgroundColor();
            }
          },
        })}
      >
        {children}
      </View>
    );
  };

  const isDone = ev.status === 'done';
  const shouldShowDoneStyling = isDone && !hideDoneStyling;
  // Always show lighter text for completed events, but only strikethrough when hideDoneStyling is false
  const shouldShowLighterText = isDone;
  // Lesson that does not count toward 180-day/hour requirement (show muted + tooltip)
  const isExcludedFromPlan = ((ev?.event_type || ev?.type || '').toLowerCase() === 'lesson') && ev?.counts_toward_plan === false;

  // Get accent color values for styling (used for borders, text accents, etc.)
  const getAccentColor = (colorName) => {
    switch (colorName) {
      case 'lesson':
        return '#4C7ED9'; // Soft Blue accent
      case 'activity':
        return '#7A5CD6'; // Lavender accent
      case 'assignment':
        return '#4FAF75'; // Soft Green accent
      case 'schedule_block':
        return '#E08A3C'; // Soft Orange / Peach accent
      case 'appointment':
        return '#6B7280'; // Warm Gray accent
      case 'project':
        return '#0D9488'; // Teal accent
      case 'exam':
        return '#BE185D'; // Pink accent
      default:
        return '#6B7280'; // Default Warm Gray accent
    }
  };

  if (compact && fullWidth) {
    const baseStyle = {
      borderRadius: 6,
      borderWidth: 0,
      backgroundColor: getBackgroundColor(),
      paddingHorizontal: 4,
      paddingVertical: 4,
      width: '100%',
      opacity: isExcludedFromPlan ? 0.78 : (shouldShowLighterText ? 0.5 : 1),
      ...(Platform.OS === 'web' && {
        cursor: 'pointer',
      }),
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
      {...(Platform.OS === 'web' && {
        onMouseEnter: (e) => {
          if (e.currentTarget && e.currentTarget.style) {
            e.currentTarget.style.backgroundColor = getHoverBackgroundColor();
          }
        },
        onMouseLeave: (e) => {
          if (e.currentTarget && e.currentTarget.style) {
            e.currentTarget.style.backgroundColor = getBackgroundColor();
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
        {showCheckmark && onComplete && (ev.event_type?.toLowerCase() !== 'holiday') && (ev.type?.toLowerCase() !== 'holiday') && (
          <View
            {...(Platform.OS === 'web' && typeof window !== 'undefined' && {
              onClick: (e) => {
                e.stopPropagation();
                e.preventDefault();
                onComplete(ev);
              },
              onMouseDown: (e) => {
                e.stopPropagation();
              },
            })}
            style={{ 
              flexShrink: 0,
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
                onComplete(ev);
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
        {alignDotsNearTime ? (
          // Layout for day view: dots right after time
          <View style={{ flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: titleFontSize,
                    lineHeight: titleFontSize + 4,
                    color: isPlaceholder ? '#6B7280' : '#111827',
                    fontWeight: '500',
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
                  {ev.title || 'Untitled Event'}
                </Text>
                {isExcludedFromPlan && (
                  <View style={{ width: 6, height: 6, borderRadius: 3, borderWidth: 1.5, borderColor: '#9CA3AF', marginLeft: 4 }} />
                )}
                {displayTime && !hideTime && !isHoliday && (
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
                  }}>· {displayTime}</Text>
                )}
              </View>
              {/* Child participation dots - right after time */}
              {participatingChildIds.length > 0 && (
                <View style={{ 
                  flexDirection: 'row', 
                  gap: 3,
                  alignItems: 'center', 
                  flexShrink: 0,
                  marginLeft: 6,
                }}>
                  {participatingChildIds.slice(0, 3).map((childId) => (
                    <View
                      key={childId}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 3.5,
                        backgroundColor: getChildDotColor(childId),
                        opacity: 1,
                      }}
                    />
                  ))}
                  {participatingChildIds.length > 3 && (
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: 'rgba(156, 163, 175, 0.4)',
                      }}
                    />
                  )}
                </View>
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
                    color: '#111827', // High contrast black
                    fontWeight: '500', // Medium weight - less bold than before
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
                  {ev.title || 'Untitled Event'}
                </Text>
                {isExcludedFromPlan && (
                  <View style={{ width: 6, height: 6, borderRadius: 3, borderWidth: 1.5, borderColor: '#9CA3AF', marginLeft: 4 }} />
                )}
                {displayTime && !hideTime && !isHoliday && (
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
                  }}>· {displayTime}</Text>
                )}
              </View>
              {/* Child participation dots - Right-aligned */}
              {participatingChildIds.length > 0 && (
                <View style={{ 
                  flexDirection: 'row', 
                  gap: 3, // Reduced gap
                  alignItems: 'center', 
                  flexShrink: 0,
                  marginLeft: 'auto', // Right-align the cluster
                }}>
                  {participatingChildIds.slice(0, 3).map((childId) => (
                    <View
                      key={childId}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 3.5,
                        backgroundColor: getChildDotColor(childId),
                        opacity: 1,
                      }}
                    />
                  ))}
                  {participatingChildIds.length > 3 && (
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: 'rgba(156, 163, 175, 0.4)', // Soft grey continuation dot
                      }}
                    />
                  )}
                </View>
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

    return renderWrapper(baseStyle, content, (Platform.OS === 'web' && isExcludedFromPlan) ? { title: 'Excluded from instructional requirement' } : {});
  }

  if (compact) {
    const baseStyle = {
      borderRadius: 6,
      borderWidth: 0,
      backgroundColor: getBackgroundColor(),
      paddingHorizontal: 6,
      paddingVertical: 3,
      maxWidth: '100%',
      opacity: isExcludedFromPlan ? 0.78 : (shouldShowLighterText ? 0.5 : 1),
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
      {...(Platform.OS === 'web' && {
        onMouseEnter: (e) => {
          if (e.currentTarget && e.currentTarget.style) {
            e.currentTarget.style.backgroundColor = getHoverBackgroundColor();
          }
        },
        onMouseLeave: (e) => {
          if (e.currentTarget && e.currentTarget.style) {
            e.currentTarget.style.backgroundColor = getBackgroundColor();
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
        {showCheckmark && onComplete && (ev.event_type?.toLowerCase() !== 'holiday') && (ev.type?.toLowerCase() !== 'holiday') && (
          <View
            {...(Platform.OS === 'web' && typeof window !== 'undefined' && {
              onClick: (e) => {
                e.stopPropagation();
                e.preventDefault();
                onComplete(ev);
              },
              onMouseDown: (e) => {
                e.stopPropagation();
              },
            })}
            style={{ 
              flexShrink: 0,
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
                onComplete(ev);
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
              color: isPlaceholder ? '#6B7280' : '#111827',
              fontWeight: '600',
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
            {ev.title || 'Untitled Event'}
          </Text>
          {isExcludedFromPlan && (
            <View style={{ width: 6, height: 6, borderRadius: 3, borderWidth: 1.5, borderColor: '#9CA3AF', marginLeft: 4 }} />
          )}
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
            }}>· {displayTime}</Text>
          )}
        </View>
        {/* Child participation dots - Cluster Glyph */}
        {participatingChildIds.length > 0 && (
          <View style={{ 
            flexDirection: 'row', 
            gap: 3, // Reduced gap
            alignItems: 'center', 
            flexShrink: 0,
            marginLeft: alignDotsNearTime ? 4 : 'auto', // Position near time or right-align
          }}>
            {participatingChildIds.slice(0, 3).map((childId) => (
              <View
                key={childId}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3, // Smaller dots
                  backgroundColor: getChildDotColor(childId),
                  opacity: 0.8,
                }}
              />
            ))}
            {participatingChildIds.length > 3 && (
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: 'rgba(156, 163, 175, 0.4)', // Soft grey continuation dot
                }}
              />
            )}
          </View>
        )}
      </View>
    );

    return (
      <>
        {renderWrapper(baseStyle, content, (Platform.OS === 'web' && isExcludedFromPlan) ? { title: 'Excluded from instructional requirement' } : {})}
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
    opacity: isExcludedFromPlan ? 0.78 : (shouldShowLighterText ? 0.5 : 1),
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
      {showCheckmark && onComplete && (ev.event_type?.toLowerCase() !== 'holiday') && (ev.type?.toLowerCase() !== 'holiday') && (
        <View
          {...(Platform.OS === 'web' && typeof window !== 'undefined' && {
            onClick: (e) => {
              e.stopPropagation();
              e.preventDefault();
              onComplete(ev);
            },
            onMouseDown: (e) => {
              e.stopPropagation();
            },
          })}
          style={{ 
            flexShrink: 0,
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
              onComplete(ev);
            }}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            style={{ 
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isDone ? (
              // Filled pastel pill/circle when present
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)', // Pastel green
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Check size={6} color="#10B981" strokeWidth={2.5} />
              </View>
            ) : (
              // Soft outline circle when absent
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  borderWidth: 1.5,
                  borderColor: 'rgba(156, 163, 175, 0.4)', // Soft gray outline
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
            color: isPlaceholder ? '#6B7280' : '#111827',
            fontWeight: '600',
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
          {ev.title || 'Untitled Event'}
        </Text>
        {isExcludedFromPlan && (
          <View style={{ width: 6, height: 6, borderRadius: 3, borderWidth: 1.5, borderColor: '#9CA3AF', marginLeft: 4 }} />
        )}
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
            }}>· {displayTime}</Text>
        )}
      </View>
      {/* Child participation dots - Cluster Glyph */}
      {participatingChildIds.length > 0 && (
        <View style={{ 
          flexDirection: 'row', 
          gap: 4, 
          alignItems: 'center', 
          flexShrink: 0,
          marginLeft: alignDotsNearTime ? 4 : 'auto', // Position near time or right-align
        }}>
          {participatingChildIds.slice(0, 3).map((childId) => (
            <View
              key={childId}
              style={{
                width: 5,
                height: 5,
                borderRadius: 2.5, // Minimal dots
                backgroundColor: '#9CA3AF', // Monochrome until hover
                opacity: 0.6,
              }}
              {...(Platform.OS === 'web' && {
                onMouseEnter: (e) => {
                  if (e.currentTarget && e.currentTarget.style) {
                    e.currentTarget.style.backgroundColor = getChildDotColor(childId);
                    e.currentTarget.style.opacity = '1';
                  }
                },
                onMouseLeave: (e) => {
                  if (e.currentTarget && e.currentTarget.style) {
                    e.currentTarget.style.backgroundColor = '#9CA3AF';
                    e.currentTarget.style.opacity = '0.6';
                  }
                },
              })}
            />
          ))}
          {participatingChildIds.length > 3 && (
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: '#9CA3AF', // Monochrome continuation dot
                opacity: 0.6,
              }}
            />
          )}
        </View>
      )}
    </View>
  );

  return (
    <>
      {renderWrapper(baseStyle, content, (Platform.OS === 'web' && isExcludedFromPlan) ? { title: 'Excluded from instructional requirement' } : {})}
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
