import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Clock, AlertTriangle, ChevronRight, Plus, Package, ClipboardList, GraduationCap, TrendingUp, Calendar } from 'lucide-react';
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
  const [showStatusTooltip, setShowStatusTooltip] = useState(false);

  const getChildName = (childId) => {
    const child = children.find(c => c.id === childId);
    return child?.name || child?.first_name || 'Unknown';
  };

  const formatDayOfWeek = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
  };

  const formatDaysAgo = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now - date;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
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

  // Handler functions
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

  // Get subject intent (from summary or default template)
  const subjectIntent = subject.summary && subject.summary.trim()
    ? subject.summary.trim()
    : `A steady path through ${subject.name}—built lesson by lesson.`;

  // Get assigned children names
  const assignedChildren = subject.assignedChildren || [];
  const childrenNames = assignedChildren.map(id => getChildName(id)).filter(Boolean);

  // Get status info
  const status = subject.status || 'not_started';
  const statusConfig = {
    not_started: { color: '#9CA3AF', label: 'Not started', emoji: '⚪' },
    needs_attention: { color: '#F59E0B', label: 'Needs attention', emoji: '🟡' },
    on_track: { color: '#10B981', label: 'On track', emoji: '🟢' },
  };
  const statusInfo = statusConfig[status] || statusConfig.not_started;

  // Format metrics
  const progressPercent = subject.progressPercent !== null && subject.progressPercent !== undefined
    ? subject.progressPercent
    : null;
  const thisWeekMinutes = subject.thisWeekMinutes || 0;
  const lastActivity = subject.lastActivity
    ? formatDaysAgo(subject.lastActivity)
    : null;

  // Get next item or overdue count
  const nextItem = subject.nextItem;
  const overdueCount = subject.overdueCount || 0;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onCardClick?.(subject)}
      activeOpacity={0.7}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.subjectName}>{subject.name}</Text>
            <View
              style={[styles.statusDot, { backgroundColor: statusInfo.color }]}
              onMouseEnter={() => setShowStatusTooltip(true)}
              onMouseLeave={() => setShowStatusTooltip(false)}
            >
              {showStatusTooltip && Platform.OS === 'web' && (
                <View style={styles.statusTooltip}>
                  <Text style={styles.statusTooltipText}>
                    {statusInfo.label}
                  </Text>
                  <Text style={styles.statusTooltipSubtext}>
                    Based on recent activity, pacing, and scheduled work.
                  </Text>
                </View>
              )}
            </View>
          </View>
          <Text style={styles.subjectIntent}>{subjectIntent}</Text>
          {childrenNames.length > 0 && (
            <View style={styles.studentsRow}>
              <Text style={styles.studentsLabel}>Students:</Text>
              <Text style={styles.studentsList}>{childrenNames.join(', ')}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Micro-metrics row */}
      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <TrendingUp size={14} color={colors.muted || '#6B7280'} />
          <Text style={styles.metricText}>
            Progress: {progressPercent !== null ? `${progressPercent}%` : '—'}
          </Text>
        </View>
        <View style={styles.metricItem}>
          <Clock size={14} color={colors.muted || '#6B7280'} />
          <Text style={styles.metricText}>
            This week: {thisWeekMinutes} min
          </Text>
        </View>
        <View style={styles.metricItem}>
          <Calendar size={14} color={colors.muted || '#6B7280'} />
          <Text style={styles.metricText}>
            Last activity: {lastActivity || 'Not started'}
          </Text>
        </View>
      </View>

      {/* Compact progress bar */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarBackground}>
          <View 
            style={[
              styles.progressBarFill, 
              { width: `${progressPercent !== null ? progressPercent : 0}%` }
            ]} 
          />
        </View>
        {progressPercent === null && (
          <Text style={styles.progressBarLabel}>Not started</Text>
        )}
      </View>

      {/* What's next decision row */}
      <View style={styles.whatsNextSection}>
        {nextItem ? (
          <TouchableOpacity
            style={styles.decisionRow}
            onPress={(e) => handleNavigateToPlanner(nextItem, e)}
          >
            <Clock size={16} color={colors.accent || '#4F46E5'} />
            <Text style={styles.decisionRowText}>
              Next: {nextItem.title} — {formatDayOfWeek(nextItem.dueDate)}
            </Text>
            <ChevronRight size={16} color={colors.muted || '#6B7280'} />
          </TouchableOpacity>
        ) : overdueCount > 0 ? (
          <TouchableOpacity
            style={styles.decisionRow}
            onPress={(e) => {
              if (subject.overdueItems && subject.overdueItems.length > 0) {
                handleNavigateToPlanner(subject.overdueItems[0], e);
              }
            }}
          >
            <AlertTriangle size={16} color={colors.redBold || '#EF4444'} />
            <Text style={styles.decisionRowText}>
              {overdueCount} {overdueCount === 1 ? 'item' : 'items'} overdue
            </Text>
            <ChevronRight size={16} color={colors.muted || '#6B7280'} />
          </TouchableOpacity>
        ) : (
          <View style={styles.decisionRowEmpty}>
            <Text style={styles.decisionRowEmptyTitle}>Nothing scheduled yet</Text>
            <Text style={styles.decisionRowEmptyBody}>Add your first lesson</Text>
            <TouchableOpacity
              style={styles.addFirstButton}
              onPress={handleAddLesson}
            >
              <Plus size={14} color={colors.accent || '#4F46E5'} />
              <Text style={styles.addFirstButtonText}>Add first lesson</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Action bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.actionButtonPrimary}
          onPress={handleAddLesson}
        >
          <GraduationCap size={16} color="#FFFFFF" />
          <Text style={styles.actionButtonPrimaryText}>Add Lesson</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButtonSecondary}
          onPress={handleAddMaterial}
        >
          <Package size={16} color={colors.accent || '#4F46E5'} />
          <Text style={styles.actionButtonSecondaryText}>Add Material</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButtonSecondary}
          onPress={handleAddAssignment}
        >
          <ClipboardList size={16} color={colors.accent || '#4F46E5'} />
          <Text style={styles.actionButtonSecondaryText}>Add Assignment</Text>
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
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  subjectName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    position: 'relative',
  },
  statusTooltip: {
    position: 'absolute',
    top: 18,
    right: 0,
    backgroundColor: '#1F2937',
    padding: 8,
    borderRadius: 6,
    minWidth: 200,
    zIndex: 1000,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    }),
  },
  statusTooltipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  statusTooltipSubtext: {
    color: '#D1D5DB',
    fontSize: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectIntent: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  studentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  studentsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginRight: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  studentsList: {
    fontSize: 13,
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.12)',
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricText: {
    fontSize: 12,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  progressBarContainer: {
    marginBottom: 16,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accent || '#4F46E5',
    borderRadius: 2,
  },
  progressBarLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  whatsNextSection: {
    marginBottom: 16,
  },
  decisionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
    }),
  },
  decisionRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  decisionRowEmpty: {
    paddingVertical: 12,
  },
  decisionRowEmptyTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  decisionRowEmptyBody: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  addFirstButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border || '#E5E7EB',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  addFirstButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.accent || '#4F46E5',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actionBar: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.12)',
  },
  actionButtonPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.accent || '#4F46E5',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  actionButtonPrimaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actionButtonSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  actionButtonSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent || '#4F46E5',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
