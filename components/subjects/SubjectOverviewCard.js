import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Clock, AlertTriangle, ChevronRight, Plus, Package, ClipboardList, GraduationCap, TrendingUp, Calendar } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import { useSession } from '../../contexts/SessionContext';
import { getMaterialFileTypeLabel } from '../materials/MaterialDocViewerModal';
import { deriveRoleFromTags, roleLabel } from '../../lib/docs/roles';

export default function SubjectOverviewCard({
  subject,
  children = [],
  selectedChildFilter = null, // Optional: filter to show only this child's dot (filtering happens at page level)
  onCardClick,
  /** Parent: jump to subject detail scrolled to “Needs help” when student has asked for help. */
  onNeedsHelpPress,
  onNavigateToPlanner,
  onAddMaterial,
  onAddAssignment,
  onAddLesson,
  onAddSyllabus,
  onAddEvent,
  recentlyViewedMaterials = [],
  searchPreviewSectionId = null,
  searchPreviewData = null,
  searchPreviewTokens = [],
  onSearchPreviewMaterialPress,
  isSearchResultCompact = false,
}) {
  const session = useSession();
  const [showStatusTooltip, setShowStatusTooltip] = useState(false);
  const [needsHelpHovered, setNeedsHelpHovered] = useState(false);
  const [hoveredButton, setHoveredButton] = useState(null);

  const getChildName = (childId) => {
    const child = children.find(c => String(c.id) === String(childId));
    return child?.name || child?.first_name || 'Unknown';
  };
  
  const getChildById = (childId) => {
    return children.find(c => String(c.id) === String(childId));
  };

  /** Weekday + time for "Up next" row, e.g. "Tue 9:00 AM–10:00 AM" */
  const formatNextUpWhenLine = (item) => {
    if (!item) return '';
    const anchor = item.startTs || item.dueDate;
    if (!anchor) return '';
    const weekday = new Date(anchor).toLocaleDateString(undefined, { weekday: 'short' });
    const tOpts = { hour: 'numeric', minute: '2-digit' };
    let timeStr = '';
    if (item.startTs && item.endTs) {
      const s = new Date(item.startTs);
      const e = new Date(item.endTs);
      if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
        timeStr =
          s.getTime() !== e.getTime()
            ? `${s.toLocaleTimeString(undefined, tOpts)}–${e.toLocaleTimeString(undefined, tOpts)}`
            : s.toLocaleTimeString(undefined, tOpts);
      }
    }
    if (!timeStr) {
      const d = new Date(item.dueDate || item.startTs);
      timeStr = Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, tOpts);
    }
    return timeStr ? `${weekday} ${timeStr}` : weekday;
  };

  const formatDaysAgo = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now - date;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
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
    if (e && e.stopPropagation) e.stopPropagation();
    if (e && e.preventDefault) e.preventDefault();
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

  // Subject blurb: prefer notes, then legacy summary
  const subjectIntent = subject.notes?.trim() || subject.summary?.trim() || null;

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

  const isParentViewer =
    session?.role_flags?.isParent === true && session?.role_flags?.isChild !== true;
  const parentAssignmentAttentionCount = subject.parentAssignmentAttentionCount || 0;
  const parentNeedHelpCount = subject.parentNeedHelpCount || 0;

  const openHomeReviewList = (e) => {
    if (e?.stopPropagation) e.stopPropagation();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('openParentHomeReviewInbox', {
          detail: { section: 'help_requests' },
        })
      );
    }
  };

  const gradesPreviewRows = useMemo(() => {
    if (searchPreviewSectionId !== 'grades-section') return [];
    const gradeRows = (searchPreviewData?.grades || []).map((g) => {
      const possible = g?.possible != null && Number(g.possible) > 0 ? Number(g.possible) : null;
      const score = g?.score != null ? Number(g.score) : null;
      const percent =
        possible != null && score != null && Number.isFinite(score)
          ? Math.round((score / possible) * 100)
          : null;
      const date = g?.created_at || g?.day_date || null;
      return {
        id: g?.id || `${g?.created_at || ''}-${g?.grade || ''}-${g?.score || ''}`,
        label:
          g?.grade != null && String(g.grade).trim().length > 0
            ? String(g.grade)
            : score != null && possible != null
              ? `${score}/${possible}${percent != null ? ` (${percent}%)` : ''}`
              : 'Graded item',
        date,
      };
    });

    const outcomeRows = (searchPreviewData?.eventOutcomes || [])
      .filter((o) => o?.grade != null)
      .map((o) => ({
        id: o?.id || `${o?.created_at || ''}-${o?.grade || ''}`,
        label: String(o.grade),
        date: o?.created_at || null,
      }));

    return [...gradeRows, ...outcomeRows]
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 3);
  }, [searchPreviewSectionId, searchPreviewData]);

  const materialsPreviewRows = useMemo(() => {
    if (searchPreviewSectionId !== 'materials-section') return [];
    const rows = (searchPreviewData?.materials || []).map((material) => {
      const title = material?.title || material?.provider_name || 'Material';
      const roleTag = roleLabel(deriveRoleFromTags(material?.tags));
      const typeLabel = getMaterialFileTypeLabel(material);
      const date = material?.created_at || material?.updated_at || null;
      const haystack = [
        title,
        roleTag,
        typeLabel,
        Array.isArray(material?.tags) ? material.tags.join(' ') : '',
        material?.type,
        material?.mime_type,
        material?.content_type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return {
        id: material?.id || `${title}-${date || ''}`,
        materialId: material?.id || null,
        title,
        roleTag,
        typeLabel,
        date,
        haystack,
      };
    });

    const normalizedTokens = (searchPreviewTokens || [])
      .map((t) => String(t || '').toLowerCase().trim())
      .filter(Boolean);
    const matched =
      normalizedTokens.length > 0
        ? rows.filter((row) => normalizedTokens.some((token) => row.haystack.includes(token)))
        : rows;
    const finalRows = matched.length > 0 ? matched : rows;
    return finalRows.slice(0, 3);
  }, [searchPreviewSectionId, searchPreviewData, searchPreviewTokens]);

  const searchPreviewContent = (
    <>
      {searchPreviewSectionId === 'grades-section' ? (
        <View style={styles.searchPreviewSection}>
          <Text style={styles.searchPreviewTitle}>Grades</Text>
          {gradesPreviewRows.length > 0 ? (
            <View style={styles.searchPreviewList}>
              {gradesPreviewRows.map((row, idx) => (
                <View
                  key={row.id || `${idx}`}
                  style={[styles.searchPreviewRow, idx === gradesPreviewRows.length - 1 && styles.searchPreviewRowLast]}
                >
                  <Text style={styles.searchPreviewRowLabel} numberOfLines={1}>
                    {row.label}
                  </Text>
                  <Text style={styles.searchPreviewRowDate}>
                    {row.date
                      ? new Date(row.date).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : '—'}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.searchPreviewEmptyBox}>
              <Text style={styles.searchPreviewEmptyText}>
                Grades appear once you add grades to assignments or assessments for this subject.
              </Text>
            </View>
          )}
        </View>
      ) : null}
      {searchPreviewSectionId === 'materials-section' ? (
        <View style={styles.searchPreviewSection}>
          <Text style={styles.searchPreviewTitle}>Materials</Text>
          {materialsPreviewRows.length > 0 ? (
            <View style={styles.searchPreviewList}>
              {materialsPreviewRows.map((row, idx) => (
                <TouchableOpacity
                  key={row.id || `${idx}`}
                  style={[styles.searchPreviewMaterialRow, idx === materialsPreviewRows.length - 1 && styles.searchPreviewRowLast]}
                  onPress={(e) => {
                    if (e?.stopPropagation) e.stopPropagation();
                    if (row.materialId && typeof onSearchPreviewMaterialPress === 'function') {
                      onSearchPreviewMaterialPress(subject, row.materialId);
                    } else {
                      onCardClick?.(subject);
                    }
                  }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Open material ${row.title}`}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <View style={styles.searchPreviewMaterialTextWrap}>
                    <Text style={styles.searchPreviewRowLabel} numberOfLines={1}>
                      {row.title}
                    </Text>
                    {(row.roleTag || row.typeLabel) ? (
                      <View style={styles.searchPreviewTagsRow}>
                        {row.roleTag ? (
                          <View style={styles.searchPreviewTag}>
                            <Text style={styles.searchPreviewTagText}>{row.roleTag}</Text>
                          </View>
                        ) : null}
                        {row.typeLabel ? (
                          <View style={styles.searchPreviewTag}>
                            <Text style={styles.searchPreviewTagText}>{row.typeLabel}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.searchPreviewRowDate}>
                    {row.date
                      ? new Date(row.date).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : '—'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.searchPreviewEmptyBox}>
              <Text style={styles.searchPreviewEmptyText}>
                No materials match this search yet.
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </>
  );

  if (isSearchResultCompact) {
    return (
      <TouchableOpacity
        style={[styles.card, styles.cardCompactSearch]}
        onPress={() => onCardClick?.(subject)}
        activeOpacity={0.7}
      >
        <View style={styles.searchCompactHeader}>
          <Text style={styles.searchCompactSubjectName} numberOfLines={2}>
            {subject.name}
          </Text>
        </View>
        {searchPreviewContent}
      </TouchableOpacity>
    );
  }

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
            <View style={styles.subjectTitleWithBadge}>
              <Text style={styles.subjectName} numberOfLines={2}>
                {subject.name}
              </Text>
              {isParentViewer && parentNeedHelpCount > 0 && typeof onNeedsHelpPress === 'function' ? (
                <View
                  style={styles.needsHelpMarkWrap}
                  {...(Platform.OS === 'web'
                    ? {
                        onMouseEnter: () => setNeedsHelpHovered(true),
                        onMouseLeave: () => setNeedsHelpHovered(false),
                      }
                    : {})}
                >
                  <TouchableOpacity
                    onPress={(e) => {
                      if (e?.stopPropagation) e.stopPropagation();
                      onNeedsHelpPress(subject);
                    }}
                    style={styles.needsHelpMark}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Needs help — open subject"
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={styles.needsHelpMarkText}>!</Text>
                  </TouchableOpacity>
                  {Platform.OS === 'web' && needsHelpHovered ? (
                    <View style={styles.needsHelpTooltip} pointerEvents="none">
                      <Text style={styles.needsHelpTooltipText}>Needs help</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
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
          {isParentViewer && parentAssignmentAttentionCount > 0 ? (
            <View style={styles.parentAttentionBanner}>
              <Text style={styles.parentAttentionText}>
                *{' '}
                {parentAssignmentAttentionCount === 1
                  ? 'One linked assignment needs a response'
                  : `${parentAssignmentAttentionCount} linked assignments need a response`}
                . Open this subject for details, or use the review list on Home.
              </Text>
              {Platform.OS === 'web' ? (
                <TouchableOpacity
                  onPress={openHomeReviewList}
                  activeOpacity={0.7}
                  style={styles.parentAttentionLinkWrap}
                  accessibilityRole="button"
                  accessibilityLabel="Go to Home review list"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.parentAttentionLink}>Go to Home → review list</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
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
            <Text style={styles.decisionRowText} numberOfLines={2}>
              Next: {nextItem.title} - {formatNextUpWhenLine(nextItem)}
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
            <Clock size={16} color={colors.muted || '#6B7280'} />
            <Text style={styles.decisionRowEmptyTitle}>Nothing coming up</Text>
          </View>
        )}
      </View>

      {/* Action bar - stop propagation on web so card's onPress doesn't swallow button clicks */}
      <View
        style={styles.actionBar}
        {...(Platform.OS === 'web' && {
          onClick: (e) => e.stopPropagation(),
          onMouseDown: (e) => e.stopPropagation(),
        })}
      >
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
      </View>
      {searchPreviewContent}
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
  cardCompactSearch: {
    padding: 14,
  },
  searchCompactHeader: {
    marginBottom: 4,
  },
  searchCompactSubjectName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  subjectTitleWithBadge: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 4,
  },
  subjectName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  needsHelpMarkWrap: {
    position: 'relative',
    marginTop: 2,
  },
  needsHelpMark: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(220, 38, 38, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  needsHelpMarkText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#dc2626',
    lineHeight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  needsHelpTooltip: {
    position: 'absolute',
    left: '50%',
    top: '100%',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    zIndex: 2000,
    ...(Platform.OS === 'web' && {
      transform: [{ translateX: '-50%' }],
      boxShadow: '0 8px 20px rgba(15, 23, 42, 0.2)',
    }),
  },
  needsHelpTooltipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
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
  parentAttentionBanner: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  parentAttentionText: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  parentAttentionLinkWrap: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  parentAttentionLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
    textDecorationLine: 'underline',
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
    backgroundColor: Platform.OS === 'web' ? 'transparent' : (colors.accent || '#4F46E5'), // Fallback for native
    borderRadius: 2,
    ...(Platform.OS === 'web' && {
      backgroundImage: 'linear-gradient(90deg, #f4b4f8 0%, #c4b5fd 20%, #93c5fd 40%, #a5f3fc 60%, #bbf7d0 80%, #facc15 100%)',
    }),
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  decisionRowEmptyTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
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
  searchPreviewSection: {
    marginTop: 14,
  },
  searchPreviewTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  searchPreviewList: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    borderRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  searchPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.14)',
  },
  searchPreviewRowLast: {
    borderBottomWidth: 0,
  },
  searchPreviewRowLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  searchPreviewRowDate: {
    fontSize: 12,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  searchPreviewMaterialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.14)',
  },
  searchPreviewMaterialTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  searchPreviewTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  searchPreviewTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
  },
  searchPreviewTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  searchPreviewEmptyBox: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  searchPreviewEmptyText: {
    fontSize: 13,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});