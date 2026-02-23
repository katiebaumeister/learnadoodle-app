import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Image } from 'react-native';
import { Clock, BookOpen, ArrowRight, CheckCircle, Check, FileText, Plus, Calculator, FlaskConical, Globe, Palette, Music, Dumbbell, Code, Pencil, Circle } from 'lucide-react';
import { colors, shadows, getCategoryColor } from '../../theme/colors';
import { completeEvent, updateEventStatus } from '../../lib/services/attendanceClient';
import { safeImageUri } from '../../lib/safeImageUri';

// Avatar sources
const avatarSources = {
  prof1: require('../../assets/prof1.png'),
  prof2: require('../../assets/prof2.png'),
  prof3: require('../../assets/prof3.png'),
  prof4: require('../../assets/prof4.png'),
  prof5: require('../../assets/prof5.png'),
  prof6: require('../../assets/prof6.png'),
  prof7: require('../../assets/prof7.png'),
  prof8: require('../../assets/prof8.png'),
  prof9: require('../../assets/prof9.png'),
  prof10: require('../../assets/prof10.png'),
};

const resolveAvatarSource = (avatarKey) => {
  if (!avatarKey) return avatarSources.prof1;
  const uri = safeImageUri(avatarKey);
  if (uri) return { uri };
  const normalized = String(avatarKey)
    .toLowerCase()
    .replace(/.*\//, '')
    .replace(/\.(png|jpg|jpeg|webp|gif)$/i, '');
  return avatarSources[normalized] || avatarSources.prof1;
};

// Get subject icon
const getSubjectIcon = (subjectName) => {
  if (!subjectName) return <BookOpen size={14} color={colors.muted} />;
  const name = subjectName.toLowerCase();
  
  if (name.includes('math') || name.includes('mathematics') || name.includes('algebra') || name.includes('geometry') || name.includes('calculus')) {
    return <Calculator size={14} color={colors.muted} />;
  }
  if (name.includes('science') || name.includes('biology') || name.includes('chemistry') || name.includes('physics')) {
    return <FlaskConical size={14} color={colors.muted} />;
  }
  if (name.includes('language') || name.includes('ela') || name.includes('english') || name.includes('reading')) {
    return <BookOpen size={14} color={colors.muted} />;
  }
  if (name.includes('writing')) {
    return <Pencil size={14} color={colors.muted} />;
  }
  if (name.includes('history') || name.includes('social studies') || name.includes('geography')) {
    return <Globe size={14} color={colors.muted} />;
  }
  if (name.includes('art') || name.includes('drawing') || name.includes('painting')) {
    return <Palette size={14} color={colors.muted} />;
  }
  if (name.includes('music') || name.includes('band') || name.includes('choir')) {
    return <Music size={14} color={colors.muted} />;
  }
  if (name.includes('physical') || name.includes('pe') || name.includes('fitness')) {
    return <Dumbbell size={14} color={colors.muted} />;
  }
  if (name.includes('technology') || name.includes('tech') || name.includes('coding')) {
    return <Code size={14} color={colors.muted} />;
  }
  
  return <BookOpen size={14} color={colors.muted} />;
};

// Get category label
const getCategoryLabel = (subjectName) => {
  if (!subjectName) return null;
  const name = subjectName.toLowerCase();
  
  if (name.includes('reading')) return 'Reading';
  if (name.includes('writing')) return 'Writing';
  if (name.includes('math') || name.includes('mathematics')) return 'Math';
  if (name.includes('science')) return 'Science';
  if (name.includes('art') || name.includes('drawing') || name.includes('painting')) return 'Art';
  if (name.includes('music')) return 'Music';
  if (name.includes('exploration') || name.includes('project')) return 'Exploration';
  
  return null;
};

export default function TodaysLearningTimeGrouped({ 
  children = [], 
  learning = [], 
  currentDate = new Date(),
  onViewPlanner,
  onEventComplete,
  onEventClick,
  onAddBlock
}) {
  const [completingEventId, setCompletingEventId] = useState(null);
  const [isQuickAddHovered, setIsQuickAddHovered] = useState(false);
  const [hoveredCardId, setHoveredCardId] = useState(null);

  // Flatten and sort all learning events by time
  const sortedEvents = learning
    .map(event => ({
      ...event,
      childName: children.find(c => c.id === event.child_id)?.first_name || 
                 children.find(c => c.id === event.child_id)?.name || 
                 'Unknown',
      time: event.start_local || event.start || '00:00',
      timeKey: (event.start_local || event.start || '00:00').substring(0, 5),
    }))
    .sort((a, b) => {
      const timeA = a.timeKey || '00:00';
      const timeB = b.timeKey || '00:00';
      return timeA.localeCompare(timeB);
    });

  // Check if event is in the past
  const isPast = (timeStr) => {
    const now = new Date();
    const [hours, minutes] = timeStr.split(':').map(Number);
    const eventTime = new Date(currentDate);
    eventTime.setHours(hours, minutes, 0, 0);
    return eventTime < now;
  };

  // Check if event is currently active
  const isActive = (event) => {
    const now = new Date();
    const start = new Date(event.start_ts || event.start_local);
    const end = new Date(event.end_ts || event.end_local);
    return now >= start && now <= end;
  };

  // Get background color based on event type (matching EventChip colors)
  const getEventTypeBackgroundColor = (event) => {
    const eventType = (event.event_type || event.type || '').toLowerCase();
    switch (eventType) {
      case 'lesson':
        return '#E3F0FF'; // Soft Blue
      case 'activity':
        return '#EDE6FF'; // Lavender
      case 'assignment':
        return '#DFF7E3'; // Soft Green
      case 'schedule_block':
      case 'schedule block':
        return '#FFE8D1'; // Soft Orange / Peach
      case 'appointment':
        return '#F2F4F7'; // Warm Gray
      case 'project':
        return '#D6F0ED'; // Soft Teal
      case 'exam':
      case 'assessment':
        return '#FCE7F3'; // Soft Pink
      default:
        return null; // Use default card background
    }
  };

  const handleToggleDone = async (event) => {
    if (!event.id || completingEventId) return;
    
    const isCurrentlyDone = event.status === 'done';
    const newStatus = isCurrentlyDone ? 'scheduled' : 'done';
    
    // Optimistically update the event status immediately for instant UI feedback
    const updatedEvent = { ...event, status: newStatus };
    
    setCompletingEventId(event.id);
    
    // Call parent callback immediately with updated event for optimistic UI update
    if (onEventComplete) {
      onEventComplete(updatedEvent);
    }
    
    try {
      if (isCurrentlyDone) {
        // Mark as not done (scheduled) using API endpoint
        const result = await updateEventStatus(event.id, 'scheduled');
        if (result.error) {
          throw result.error;
        }
      } else {
        // Mark as done using the attendance client (creates attendance record)
        const result = await completeEvent(event.id);
        if (result.error) {
          throw result.error;
        }
      }
      
      // Dispatch refresh event for other components (skip home refresh since we handle it in parent)
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipHomeRefresh: true } }));
      }
    } catch (error) {
      // Revert optimistic update on error
      if (onEventComplete) {
        onEventComplete(event); // Revert to original event
      }
      if (Platform.OS === 'web') {
        alert(`Failed to ${isCurrentlyDone ? 'unmark' : 'mark'} event as done: ${error.message || error}`);
      }
    } finally {
      setCompletingEventId(null);
    }
  };

  const handleLog = (event) => {
    // Navigate to Intelligence Hub with this event highlighted
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      // Keep any existing params, but ensure we land in Intelligence Hub
      params.set('tab', 'planner-ai');
      params.set('eventId', event.id);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.pushState({}, '', newUrl);
      // Tell WebLayout / WebContent to switch to Intelligence tab
      if (window.__ldSearchNavigate) {
        window.__ldSearchNavigate('intelligence', null, { eventId: event.id });
      } else {
        // Fallback: full navigation via hash or location
        window.location.href = newUrl;
      }
    }
  };

  // Format date for header: "Your schedule today, Friday, January 9"
  const formatHeaderDate = (date) => {
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
    const month = date.toLocaleDateString('en-US', { month: 'long' });
    const day = date.getDate();
    return `Today, ${dayOfWeek}, ${month} ${day}`;
  };

  // If no events, show two cards side-by-side
  if (sortedEvents.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{formatHeaderDate(currentDate)}</Text>
          </View>
        </View>

        {/* Two cards side-by-side */}
        <View style={styles.emptyCardsRow}>
          {/* Card A: Suggested Rhythms */}
          <View style={styles.suggestedRhythmsCard}>
            <Text style={styles.suggestedTitle}>Suggested Rhythms</Text>
            <View style={styles.suggestedList}>
              <View style={styles.suggestedItem}>
                <View style={styles.suggestedTimeContainer}>
                <Text style={styles.suggestedTime}>9:00 AM</Text>
                </View>
                <Text style={styles.suggestedActivity}>Morning math block</Text>
              </View>
              <View style={styles.suggestedItem}>
                <View style={styles.suggestedTimeContainer}>
                <Text style={styles.suggestedTime}>2:00 PM</Text>
                </View>
                <Text style={styles.suggestedActivity}>Afternoon reading & writing</Text>
              </View>
              <View style={styles.suggestedItem}>
                <View style={styles.suggestedTimeContainer}>
                <Text style={styles.suggestedTime}>4:00 PM</Text>
                </View>
                <Text style={styles.suggestedActivity}>Project work or exploration</Text>
              </View>
            </View>
          </View>
          
          {/* Card B: Quick Add */}
              <TouchableOpacity
            style={[
              styles.quickAddCard,
              isQuickAddHovered && styles.quickAddCardHovered,
            ]}
                onPress={() => {
              if (onAddBlock) {
                onAddBlock();
              } else if (onViewPlanner) {
                onViewPlanner();
              }
            }}
            activeOpacity={0.7}
            onMouseEnter={() => Platform.OS === 'web' && setIsQuickAddHovered(true)}
            onMouseLeave={() => Platform.OS === 'web' && setIsQuickAddHovered(false)}
          >
            <View style={styles.quickAddIconContainer}>
              <Plus size={20} color={colors.muted} strokeWidth={1.5} />
            </View>
            <Text style={styles.quickAddTitle}>Add your first block</Text>
            <Text style={styles.quickAddSubtitle}>Try planning your week</Text>
              </TouchableOpacity>
        </View>
      </View>
    );
  }

  // If there are events, show ordered list of session cards
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {onViewPlanner ? (
          <TouchableOpacity
            style={styles.headerLeft}
            onPress={onViewPlanner}
            activeOpacity={0.7}
          >
            <Text style={styles.title}>{formatHeaderDate(currentDate)}</Text>
          </TouchableOpacity>
        ) : (
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{formatHeaderDate(currentDate)}</Text>
        </View>
        )}
      </View>
      
      <View style={styles.sessionsList}>
        {sortedEvents.map((event, index) => {
          const past = isPast(event.timeKey);
          const active = isActive(event);
          const isDone = event.status === 'done';
          const isCompleting = completingEventId === event.id;
          const isHovered = hoveredCardId === event.id;
          const child = children.find(c => c.id === event.child_id);
          const categoryLabel = getCategoryLabel(event.topic || event.title || event.subject);
          const subjectIcon = getSubjectIcon(event.topic || event.title || event.subject);
          const isFirst = index === 0;
          const isLast = index === sortedEvents.length - 1;
          const eventTypeBgColor = getEventTypeBackgroundColor(event);

          return (
            <TouchableOpacity
              key={`${event.id}-${index}`}
              style={[
                styles.sessionCard,
                active && styles.sessionCardActive,
                past && styles.sessionCardPast,
                isDone && styles.sessionCardDone,
                isHovered && styles.sessionCardHovered,
                isFirst && styles.sessionCardFirst,
                isLast && styles.sessionCardLast,
                eventTypeBgColor && { backgroundColor: eventTypeBgColor },
              ]}
              onPress={() => {
                if (onEventClick) {
                  onEventClick(event);
                }
              }}
              onMouseEnter={() => Platform.OS === 'web' && setHoveredCardId(event.id)}
              onMouseLeave={() => Platform.OS === 'web' && setHoveredCardId(null)}
              activeOpacity={0.7}
            >
              {/* Timeline Rail */}
              <View style={styles.timelineRail}>
                <View style={styles.timelineLine} />
                <View style={styles.timelineBubble}>
                  <Text style={[styles.timelineTime, past && styles.timelineTimePast, isDone && styles.timelineTimeDone]}>
                    {event.timeKey}
                </Text>
                </View>
              </View>
              
              <View style={styles.sessionCardContent}>
                <View style={styles.sessionHeader}>
                  <View style={styles.sessionTitleRow}>
                    <Text style={[styles.sessionSubject, isDone && styles.sessionSubjectDone]}>
                      {event.topic || event.title || event.subject || 'Learning session'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      handleToggleDone(event);
                    }}
                    disabled={isCompleting}
                    style={[
                      styles.checkmarkButton,
                      isDone && styles.checkmarkButtonDone,
                    ]}
                  >
                    {isDone ? (
                      <Check size={14} color="#ffffff" strokeWidth={2.5} />
                    ) : (
                      <Circle size={14} color={colors.border} strokeWidth={1.8} />
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.sessionInfo}>
                  <View style={styles.sessionStudentRow}>
                    {child && child.avatar && (
                      <Image
                        source={resolveAvatarSource(child.avatar)}
                        style={styles.childAvatar}
                        resizeMode="contain"
                      />
                    )}
                    <Text style={styles.sessionStudent}>
                      {event.childName}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    ...shadows.md,
    marginBottom: 6,
    marginTop: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(225, 238, 255, 0.25)', // blueSoft with 25% opacity
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: -12,
    marginTop: -12,
    borderTopLeftRadius: colors.radiusLg,
    borderTopRightRadius: colors.radiusLg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtitle: {
    fontSize: 11,
    color: colors.muted,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  plannerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 6,
  },
  plannerLinkText: {
    fontSize: 11,
    color: colors.accent,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sessionsList: {
    gap: 7,
    position: 'relative',
  },
  sessionCard: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 6,
    flexDirection: 'row',
    position: 'relative',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  sessionCardHovered: {
    backgroundColor: colors.bgSubtle,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
    }),
  },
  sessionCardActive: {
    backgroundColor: colors.blueSoft,
  },
  sessionCardPast: {
    // Past events no longer greyed out
  },
  sessionCardDone: {
    backgroundColor: colors.bgSubtle,
  },
  timelineRail: {
    width: 56,
    marginRight: 8,
    position: 'relative',
    alignItems: 'center',
    paddingTop: 2,
  },
  timelineLine: {
    position: 'absolute',
    left: 29,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.border,
  },
  timelineBubble: {
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 1,
    minWidth: 50,
    alignItems: 'center',
  },
  timelineTime: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timelineTimePast: {
    color: colors.muted,
  },
  timelineTimeDone: {
    color: colors.muted,
  },
  sessionCardContent: {
    flex: 1,
    gap: 6,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  checkmarkButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  checkmarkButtonDone: {
    borderColor: colors.greenBold,
    backgroundColor: colors.greenBold,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  subjectIconWrapper: {
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionSubject: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A', // Slightly darker than default text
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sessionSubjectDone: {
    color: colors.muted,
  },
  categoryTag: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: '#E5E7EB',
  },
  categoryTagText: {
    fontSize: 8,
    fontWeight: '500',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    lineHeight: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sessionInfo: {
    gap: 2,
  },
  sessionStudentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  childAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  sessionStudent: {
    fontSize: 13,
    color: colors.muted,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sessionActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  actionButtonLog: {
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonDone: {
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyCardsRow: {
    ...Platform.select({
      web: {
        flexDirection: 'row',
      },
      default: {
        flexDirection: 'column',
      },
    }),
    gap: 16,
  },
  suggestedRhythmsCard: {
    flex: 1,
    padding: 14,
    backgroundColor: colors.blueSoft, // Soft blue pastel for secondary cards
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border, // Light gray for boundaries
    borderStyle: 'solid',
  },
  suggestedTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestedList: {
    gap: 12,
  },
  suggestedItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  suggestedTimeContainer: {
    backgroundColor: colors.bgSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    minWidth: 70,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestedTime: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.3,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestedActivity: {
    fontSize: 13,
    color: colors.text,
    flex: 1,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  quickAddCard: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: colors.radiusMd,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 140,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  quickAddCardHovered: {
    borderColor: colors.border,
    backgroundColor: colors.bgSubtle,
    ...(Platform.OS === 'web' && {
      transform: [{ translateY: -2 }],
    }),
  },
  quickAddIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickAddTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  quickAddSubtitle: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
});

