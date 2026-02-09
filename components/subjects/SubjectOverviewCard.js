import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Clock, AlertTriangle, ChevronRight, Plus, Package, ClipboardList, GraduationCap, TrendingUp, Calendar } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getChildColorFromAvatar } from '../../utils/avatarColors';

export default function SubjectOverviewCard({
  subject,
  children = [],
  selectedChildFilter = null, // Optional: filter to show only this child's dot (filtering happens at page level)
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
  const [hoveredButton, setHoveredButton] = useState(null);

  const getChildName = (childId) => {
    const child = children.find(c => String(c.id) === String(childId));
    return child?.name || child?.first_name || 'Unknown';
  };
  
  const getChildById = (childId) => {
    return children.find(c => String(c.id) === String(childId));
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

  // Get assigned children names and objects (moved up for use in handlers)
  const assignedChildren = subject.assignedChildren || [];
  
  // Always show all assigned children's dots, even when filtering
  // The filtering is handled at the subject level in SubjectsPage, not at the dot level
  // This allows users to see which subjects are shared across multiple children
  const childrenNames = assignedChildren.map(id => getChildName(id)).filter(Boolean);
  
  // Get child objects - ensure we find children by ID
  // Use the same matching logic as getChildName to ensure consistency
  // Always show all assigned children, not just the filtered one
  const assignedChildrenObjects = assignedChildren
    .map(id => {
      const child = getChildById(id);
      return child || null;
    })
    .filter(Boolean);
  
  // Get assigned child IDs for defaulting in modals (use original assignedChildren, not filtered)
  // We keep the full array so multi-child subjects can default all related children.
  const assignedChildIdsForModals = Array.isArray(assignedChildren) ? assignedChildren : [];
  const firstAssignedChildId = assignedChildIdsForModals.length > 0 ? assignedChildIdsForModals[0] : null;

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
        detail: { 
          subjectId: subject.id,
          subjectName: subject.name,
          childIds: assignedChildIdsForModals,
          // Keep single childId for backwards compatibility in any older handlers
          childId: firstAssignedChildId,
        }
      }));
    }
  };

  const handleAddAssignment = (e) => {
    e.stopPropagation();
    if (onAddAssignment) {
      onAddAssignment(subject);
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Dispatch openTaskModal event (handled by both WebContent and WebLayout)
      window.dispatchEvent(new CustomEvent('openTaskModal', {
        detail: { 
          subjectId: subject.id, 
          eventType: 'Assignment', 
          date: new Date(),
          childIds: assignedChildIdsForModals,
          // Keep single childId for backwards compatibility
          childId: firstAssignedChildId,
        }
      }));
    } else if (onAddEvent) {
      // Native/mobile fallback
      onAddEvent(subject);
    }
  };

  const handleAddLesson = (e) => {
    e.stopPropagation();
    if (onAddLesson) {
      onAddLesson(subject);
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Dispatch openTaskModal event (handled by both WebContent and WebLayout)
      window.dispatchEvent(new CustomEvent('openTaskModal', {
        detail: { 
          subjectId: subject.id, 
          eventType: 'Lesson', 
          date: new Date(),
          childIds: assignedChildIdsForModals,
          // Keep single childId for backwards compatibility
          childId: firstAssignedChildId,
        }
      }));
    } else if (onAddEvent) {
      // Native/mobile fallback
      onAddEvent(subject);
    }
  };

  // Get subject intent (only if summary exists)
  const subjectIntent = subject.summary && subject.summary.trim()
    ? subject.summary.trim()
    : null;

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
            {assignedChildrenObjects.length > 0 ? (
              <View style={styles.childrenDotsContainer}>
                {assignedChildrenObjects.map((child, index) => {
                  if (!child) return null;
                  
                  const childColor = getChildColorFromAvatar(child.avatar);
                  
                  return (
                    <View
                      key={child.id}
                      style={[
                        styles.childDot,
                        { 
                          backgroundColor: childColor,
                          marginLeft: index > 0 ? -4 : 0,
                          zIndex: assignedChildrenObjects.length - index,
                        }
                      ]}
                    />
                  );
                })}
              </View>
            ) : (
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
            )}
          </View>
          {subjectIntent && (
            <Text style={styles.subjectIntent}>{subjectIntent}</Text>
          )}
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
          style={[
            styles.actionButtonPill,
            hoveredButton === 'lesson' && styles.actionButtonPillHovered
          ]}
          onPress={handleAddLesson}
          onMouseEnter={() => Platform.OS === 'web' && setHoveredButton('lesson')}
          onMouseLeave={() => Platform.OS === 'web' && setHoveredButton(null)}
        >
          <GraduationCap size={16} color="#6B7280" />
          <Text style={[
            styles.actionButtonPillText,
            hoveredButton === 'lesson' && styles.actionButtonPillTextHovered
          ]}>Add Lesson</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.actionButtonPill,
            hoveredButton === 'material' && styles.actionButtonPillHovered
          ]}
          onPress={handleAddMaterial}
          onMouseEnter={() => Platform.OS === 'web' && setHoveredButton('material')}
          onMouseLeave={() => Platform.OS === 'web' && setHoveredButton(null)}
        >
          <Package size={16} color="#6B7280" />
          <Text style={[
            styles.actionButtonPillText,
            hoveredButton === 'material' && styles.actionButtonPillTextHovered
          ]}>Add Material</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.actionButtonPill,
            hoveredButton === 'assignment' && styles.actionButtonPillHovered
          ]}
          onPress={handleAddAssignment}
          onMouseEnter={() => Platform.OS === 'web' && setHoveredButton('assignment')}
          onMouseLeave={() => Platform.OS === 'web' && setHoveredButton(null)}
        >
          <ClipboardList size={16} color="#6B7280" />
          <Text style={[
            styles.actionButtonPillText,
            hoveredButton === 'assignment' && styles.actionButtonPillTextHovered
          ]}>Add Assignment</Text>
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
    fontSize: 12,
    fontWeight: '400',
    color: '#374151',
    marginRight: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  studentsList: {
    fontSize: 12,
    fontWeight: '400',
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
    // Neutral bar with subtle neutral purple fill (reserve rainbow for detail view)
    backgroundColor: Platform.OS === 'web' ? '#9CA3AF' : '#9CA3AF', // Neutral muted gray-purple
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
  actionButtonPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
    }),
  },
  actionButtonPillHovered: {
    backgroundColor: '#EFF6FF',
  },
  actionButtonPillText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      transition: 'font-weight 0.2s ease',
    }),
  },
  actionButtonPillTextHovered: {
    fontWeight: '600',
  },
  childrenDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  childDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});