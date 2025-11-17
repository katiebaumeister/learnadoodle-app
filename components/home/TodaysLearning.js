import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BookOpen, Clock, CheckCircle, Plus, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

const subjectColors = [
  { bg: colors.blueSoft, text: colors.blueBold },
  { bg: colors.violetSoft, text: colors.violetBold },
  { bg: colors.greenSoft, text: colors.greenBold },
  { bg: colors.orangeSoft, text: colors.orangeBold },
  { bg: colors.redSoft, text: colors.redBold },
];

export default function TodaysLearning({ 
  children = [], 
  learning = [], 
  availability = [],
  onAddLesson,
  onAIPlanDay,
  currentDate = new Date(),
  onDateChange
}) {
  const getChildColor = (index) => subjectColors[index % subjectColors.length];
  
  const getChildStatus = (childId) => {
    const childAvail = availability.find(a => a.child_id === childId);
    if (!childAvail) return { 
      status: 'unknown', 
      text: 'Unknown',
      scheduled_min: 0,
      available_min: 0
    };
    
    // Handle explicit day_status values
    if (childAvail.day_status === 'off') {
      return { 
        status: 'off', 
        text: 'Off today',
        scheduled_min: childAvail.scheduled_min || 0,
        available_min: childAvail.available_min || 0
      };
    } else if (childAvail.day_status === 'teach') {
      return { 
        status: 'teach', 
        text: `${childAvail.first_block_start} – ${childAvail.last_block_end}`,
        scheduled_min: childAvail.scheduled_min || 0,
        available_min: childAvail.available_min || 0
      };
    } else if (childAvail.day_status === 'partial') {
      return { 
        status: 'partial', 
        text: 'Partial day',
        scheduled_min: childAvail.scheduled_min || 0,
        available_min: childAvail.available_min || 0
      };
    }
    
    // If day_status is null/undefined, default to 'teach' (normal availability)
    // This happens when cache hasn't been generated yet or no rules apply
    return { 
      status: 'teach', 
      text: childAvail.first_block_start && childAvail.last_block_end 
        ? `${childAvail.first_block_start} – ${childAvail.last_block_end}`
        : 'Available',
      scheduled_min: childAvail.scheduled_min || 0,
      available_min: childAvail.available_min || 0
    };
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <BookOpen size={16} color={colors.text} />
          <Text style={styles.title}>Today's Learning</Text>
        </View>
        <View style={styles.dateToggle}>
          <TouchableOpacity 
            style={styles.dateButton}
            onPress={() => onDateChange?.(new Date(currentDate.getTime() - 24 * 60 * 60 * 1000))}
          >
            <ChevronLeft size={14} color={colors.muted} />
          </TouchableOpacity>
          <Text style={styles.subtitle}>
            {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </Text>
          <TouchableOpacity 
            style={styles.dateButton}
            onPress={() => onDateChange?.(new Date(currentDate.getTime() + 24 * 60 * 60 * 1000))}
          >
            <ChevronRight size={14} color={colors.muted} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.childrenGrid}>
        {children.map((child, index) => {
          const childLearning = learning.filter(l => l.child_id === child.id);
          const status = getChildStatus(child.id);
          const colorScheme = getChildColor(index);
          
          return (
            <View key={child.id} style={styles.childCard}>
              <View style={styles.childHeader}>
                <View style={[styles.avatar, { backgroundColor: colorScheme.bg }]}>
                  <Text style={[styles.avatarText, { color: colorScheme.text }]}>
                    {child.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.childInfo}>
                  <Text style={styles.childName}>{child.name}</Text>
                  {/* Minutes counter */}
                  <Text style={styles.minutesCounter}>
                    {Math.round(status.scheduled_min || 0)} / {Math.round(status.available_min || 0)} min
                  </Text>
                </View>
              </View>

              {childLearning.length > 0 ? (
                <View style={styles.lessonsList}>
                  {childLearning.map((lesson) => (
                    <View key={lesson.id} style={styles.lessonItem}>
                      <View style={styles.lessonTime}>
                        <Text style={styles.lessonTimeText}>{lesson.start}</Text>
                      </View>
                      <View style={styles.lessonContent}>
                        <Text style={styles.lessonSubject}>{lesson.subject}</Text>
                        {lesson.topic && lesson.topic !== lesson.subject && (
                          <Text style={styles.lessonTopic} numberOfLines={1}>
                            {lesson.topic}
                          </Text>
                        )}
                      </View>
                      {lesson.status === 'done' && (
                        <CheckCircle size={14} color={colors.greenBold} />
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    {status.status === 'off' ? 'Enjoy your day off!' : 'No lessons scheduled'}
                  </Text>
                  {status.status === 'off' ? (
                    <View style={styles.emptyActions}>
                      <TouchableOpacity 
                        style={styles.actionButton}
                        onPress={() => onAddLesson?.(child.id)}
                      >
                        <Plus size={12} color={colors.accent} />
                        <Text style={styles.actionButtonText}>Add override → Extra block</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.emptyActions}>
                      <TouchableOpacity 
                        style={styles.actionButton}
                        onPress={() => onAddLesson?.(child.id)}
                      >
                        <Plus size={12} color={colors.accent} />
                        <Text style={styles.actionButtonText}>Add lesson</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.actionButton}
                        onPress={() => onAIPlanDay?.(child.id)}
                      >
                        <Sparkles size={12} color={colors.accent} />
                        <Text style={styles.actionButtonText}>AI plan day</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {children.length === 0 && (
        <View style={styles.emptyStateMain}>
          <Text style={styles.emptyTitle}>No children added yet</Text>
          <Text style={styles.emptySubtitle}>Add your first child to start planning</Text>
          <TouchableOpacity style={styles.addButton}>
            <Text style={styles.addButtonText}>+ Add Child</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(225, 238, 255, 0.25)', // blueSoft with 25% opacity
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginHorizontal: -16,
    marginTop: -16,
    borderTopLeftRadius: colors.radiusLg,
    borderTopRightRadius: colors.radiusLg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.muted,
  },
  dateToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateButton: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.bgSubtle,
  },
  childrenGrid: {
    gap: 16,
  },
  childCard: {
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    backgroundColor: colors.bgSubtle,
  },
  childHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  minutesCounter: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  lessonsList: {
    gap: 8,
  },
  lessonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  lessonTime: {
    width: 50,
  },
  lessonTimeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  lessonContent: {
    flex: 1,
  },
  lessonSubject: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
  },
  lessonTopic: {
    fontSize: 12,
    color: colors.muted,
  },
  emptyState: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    fontSize: 11,
    color: colors.accent,
    fontWeight: '500',
  },
  emptyStateMain: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 16,
  },
  addButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentContrast,
  },
});

