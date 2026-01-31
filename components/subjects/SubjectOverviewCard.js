import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Clock, AlertTriangle, FileText, BookOpen, ChevronRight, Upload, Plus, Package, ClipboardList, GraduationCap, Eye } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getChildColorFromAvatar } from '../../utils/avatarColors';

export default function SubjectOverviewCard({
  subject,
  children = [],
  onCardClick,
  onNavigateToPlanner,
  onAddMaterial,
  onAddAssignment,
  onAddLesson,
  onAddSyllabus,
  onAddEvent,
  recentlyViewedMaterials = [],
}) {

  const getChildDotColor = (childId) => {
    const child = children.find(c => c.id === childId);
    if (!child || !child.avatar) {
      return '#9CA3AF';
    }
    return getChildColorFromAvatar(child.avatar);
  };

  const getChildName = (childId) => {
    const child = children.find(c => c.id === childId);
    return child?.name || 'Unknown';
  };

  const formatDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago`;
    } else if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Tomorrow';
    } else if (diffDays < 7) {
      return `In ${diffDays} days`;
    } else {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  };

  const handleNavigateToPlanner = (item, e) => {
    if (e) {
      e.stopPropagation();
    }
    if (onNavigateToPlanner) {
      onNavigateToPlanner({
        subjectId: subject.id,
        childId: item.childId,
        date: item.dueDate,
        eventId: item.type === 'event' ? item.id.replace('event-', '') : null,
      });
    }
  };

  // Determine status
  const hasOverdue = subject.overdueItems && subject.overdueItems.length > 0;
  const hasUpcoming = subject.upcomingItems && subject.upcomingItems.length > 0;
  const status = hasOverdue 
    ? 'Needs attention'
    : hasUpcoming
      ? 'On track'
      : subject.hasSyllabus || subject.hasGoal
        ? 'Active'
        : 'Needs setup';

  // Handler functions - fallback to old props if new ones not provided
  const handleAddMaterial = (e) => {
    e.stopPropagation();
    if (onAddMaterial) {
      onAddMaterial(subject);
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openAddMaterialModal', {
        detail: { subjectId: subject.id }
      }));
    }
  };

  const handleAddAssignment = (e) => {
    e.stopPropagation();
    if (onAddAssignment) {
      onAddAssignment(subject);
    } else if (onAddEvent) {
      onAddEvent(subject);
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openTaskCreateModal', {
        detail: { subjectId: subject.id, eventType: 'assignment' }
      }));
    }
  };

  const handleAddLesson = (e) => {
    e.stopPropagation();
    if (onAddLesson) {
      onAddLesson(subject);
    } else if (onAddEvent) {
      onAddEvent(subject);
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openTaskCreateModal', {
        detail: { subjectId: subject.id, eventType: 'lesson' }
      }));
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onCardClick?.(subject)}
      activeOpacity={0.7}
    >
      {/* A) Subject Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.subjectName}>{subject.name}</Text>
          {subject.grade && (
            <Text style={styles.grade}>{subject.grade}</Text>
          )}
        </View>
        {subject.assignedChildren && subject.assignedChildren.length > 0 && (
          <View style={styles.childrenChips}>
            {subject.assignedChildren.slice(0, 3).map((childId) => (
              <View
                key={childId}
                style={[
                  styles.childDot,
                  { backgroundColor: getChildDotColor(childId) },
                ]}
                title={getChildName(childId)}
              />
            ))}
            {subject.assignedChildren.length > 3 && (
              <Text style={styles.moreChildren}>+{subject.assignedChildren.length - 3}</Text>
            )}
          </View>
        )}
      </View>

      {/* B) What's Next */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What's next</Text>
        {subject.overdueItems && subject.overdueItems.length > 0 && (
          <View style={styles.nextItems}>
            {subject.overdueItems.slice(0, 2).map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.nextItem}
                onPress={(e) => handleNavigateToPlanner(item, e)}
              >
                <AlertTriangle size={16} color={colors.redBold || '#EF4444'} />
                <View style={styles.nextItemContent}>
                  <Text style={[styles.nextItemTitle, styles.overdueTitle]}>
                    {item.title}
                  </Text>
                  <Text style={styles.nextItemDate}>
                    Overdue {formatDate(item.dueDate)}
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.muted || '#6B7280'} />
              </TouchableOpacity>
            ))}
          </View>
        )}
        {subject.upcomingItems && subject.upcomingItems.length > 0 && (
          <View style={styles.nextItems}>
            {subject.upcomingItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.nextItem}
                onPress={(e) => handleNavigateToPlanner(item, e)}
              >
                {item.eventType === 'project' || item.type === 'backlog' ? (
                  <FileText size={16} color={colors.accent || '#4F46E5'} />
                ) : (
                  <Clock size={16} color={colors.accent || '#4F46E5'} />
                )}
                <View style={styles.nextItemContent}>
                  <Text style={styles.nextItemTitle}>{item.title}</Text>
                  <Text style={styles.nextItemDate}>
                    {formatDate(item.dueDate)}
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.muted || '#6B7280'} />
              </TouchableOpacity>
            ))}
          </View>
        )}
        {(!subject.upcomingItems || subject.upcomingItems.length === 0) &&
         (!subject.overdueItems || subject.overdueItems.length === 0) && (
          <Text style={styles.mutedText}>No upcoming work scheduled yet</Text>
        )}
      </View>

      {/* C) Syllabus & Lesson Plans */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Syllabus & Lesson Plans</Text>
        {subject.hasSyllabus || subject.hasLessonPlan ? (
          <View style={styles.filesContainer}>
            {subject.hasSyllabus && (
              <TouchableOpacity
                style={styles.fileItem}
                onPress={(e) => {
                  e.stopPropagation();
                  // Navigate to syllabus view
                }}
              >
                <Upload size={14} color={colors.accent || '#4F46E5'} />
                <Text style={styles.fileItemText}>Syllabus</Text>
              </TouchableOpacity>
            )}
            {subject.hasLessonPlan && (
              <TouchableOpacity
                style={styles.fileItem}
                onPress={(e) => {
                  e.stopPropagation();
                  // Navigate to lesson plan
                }}
              >
                <GraduationCap size={14} color={colors.accent || '#4F46E5'} />
                <Text style={styles.fileItemText}>Lesson Plan</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Text style={styles.mutedText}>
            Syllabus and lesson plans will appear here once added
          </Text>
        )}
      </View>

      {/* D) Recently Viewed Materials */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recently Viewed</Text>
        {recentlyViewedMaterials && recentlyViewedMaterials.length > 0 ? (
          <View style={styles.recentMaterialsContainer}>
            {recentlyViewedMaterials.slice(0, 3).map((material) => (
              <TouchableOpacity
                key={material.id}
                style={styles.recentMaterialItem}
                onPress={(e) => {
                  e.stopPropagation();
                  // Navigate to material
                }}
              >
                <Eye size={14} color={colors.muted || '#6B7280'} />
                <Text style={styles.recentMaterialText} numberOfLines={1}>
                  {material.title || material.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.mutedText}>
            Recently viewed materials will appear here
          </Text>
        )}
      </View>

      {/* E) Status Footer */}
      <View style={styles.footer}>
        <Text style={[
          styles.statusText,
          hasOverdue && styles.statusTextWarning,
        ]}>
          {status}
        </Text>
      </View>

      {/* F) Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleAddMaterial}
        >
          <Package size={16} color={colors.accent || '#4F46E5'} />
          <Text style={styles.actionButtonText}>Add Material</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleAddAssignment}
        >
          <ClipboardList size={16} color={colors.accent || '#4F46E5'} />
          <Text style={styles.actionButtonText}>Add Assignment</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleAddLesson}
        >
          <GraduationCap size={16} color={colors.accent || '#4F46E5'} />
          <Text style={styles.actionButtonText}>Add Lesson</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
      cursor: 'pointer',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  subjectName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  grade: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  childrenChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 12,
  },
  childDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  moreChildren: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  mutedText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  nextItems: {
    gap: 8,
  },
  nextItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
    }),
  },
  nextItemContent: {
    flex: 1,
  },
  nextItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  overdueTitle: {
    color: colors.redBold || '#EF4444',
  },
  nextItemDate: {
    fontSize: 12,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
    }),
  },
  fileItemText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.accent || '#4F46E5',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  recentMaterialsContainer: {
    gap: 6,
  },
  recentMaterialItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
    }),
  },
  recentMaterialText: {
    fontSize: 13,
    color: '#374151',
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footer: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.24)',
  },
  statusText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  statusTextWarning: {
    color: colors.redBold || '#EF4444',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.24)',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent || '#4F46E5',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
