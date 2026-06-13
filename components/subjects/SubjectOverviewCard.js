import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Plus, Clock, AlertTriangle, ChevronRight } from 'lucide-react';
import { colors } from '../../theme/colors';
import { useSession } from '../../contexts/SessionContext';
import { getMaterialFileTypeLabel } from '../materials/MaterialDocViewerModal';
import { deriveRoleFromTags, roleLabel } from '../../lib/docs/roles';
import SubjectCardHeader from './SubjectCardHeader';

function formatNaturalList(items = []) {
  const list = (items || []).map((v) => String(v || '').trim()).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

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
  onEditSubject,
  onConfigureSchedule,
  onEditUnits,
  onNewAssignment,
  unitsEditorLabel = 'Edit units',
  recentlyViewedMaterials = [],
  searchPreviewSectionId = null,
  searchPreviewData = null,
  searchPreviewTokens = [],
  onSearchPreviewMaterialPress,
  isSearchResultCompact = false,
}) {
  const session = useSession();
  const [needsHelpHovered, setNeedsHelpHovered] = useState(false);
  const [addAssignmentHovered, setAddAssignmentHovered] = useState(false);

  const getChildName = (childId) => {
    const child = children.find(c => String(c.id) === String(childId));
    return child?.name || child?.first_name || 'Unknown';
  };
  
  const getChildById = (childId) => {
    return children.find(c => String(c.id) === String(childId));
  };

  /** Weekday + optional time for upcoming row, e.g. "Tue 9:00 AM–10:00 AM" */
  const formatNextUpWhenLine = (item) => {
    if (!item) return '';
    const anchor = item.startTs || item.dueDate;
    if (!anchor) return '';
    const weekday = new Date(anchor).toLocaleDateString(undefined, { weekday: 'short' });
    const tOpts = { hour: 'numeric', minute: '2-digit' };
    const eventTypeRaw = String(item?.eventType || item?.event_type || '').trim();
    const isIntrinsicAllDayType = ['Project', 'Trip', 'Holiday', 'Other'].includes(eventTypeRaw);
    const s = item?.startTs ? new Date(item.startTs) : null;
    const e = item?.endTs ? new Date(item.endTs) : null;
    const hasValidStart = !!s && !Number.isNaN(s.getTime());
    const hasValidEnd = !!e && !Number.isNaN(e.getTime());
    const rawStart = String(item?.startTs || '').trim();
    const rawEnd = String(item?.endTs || '').trim();
    const isRawMidnight = (raw) => /T00:00(?::00(?:\.000)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(raw);
    const isRawEndOfDay = (raw) => /T23:59(?::59(?:\.999)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(raw);
    const isRawMidnightBounded =
      !!rawStart &&
      isRawMidnight(rawStart) &&
      (!!rawEnd ? (isRawMidnight(rawEnd) || isRawEndOfDay(rawEnd)) : true);
    const isMidnightBounded =
      hasValidStart &&
      hasValidEnd &&
      s.getHours() === 0 &&
      s.getMinutes() === 0 &&
      ((e.getHours() === 0 && e.getMinutes() === 0) ||
        (e.getHours() === 23 && e.getMinutes() === 59));
    const isTimeless =
      item?.is_flexible === true ||
      item?.isFlexible === true ||
      (!isIntrinsicAllDayType && (isMidnightBounded || isRawMidnightBounded));
    let timeStr = '';
    if (!isTimeless && hasValidStart) {
      timeStr = hasValidEnd && s.getTime() !== e.getTime()
        ? `${s.toLocaleTimeString(undefined, tOpts)}–${e.toLocaleTimeString(undefined, tOpts)}`
        : s.toLocaleTimeString(undefined, tOpts);
    }
    return timeStr ? `${weekday} ${timeStr}` : weekday;
  };

  // Get assigned children names (moved up for use in handlers)
  const assignedChildren = subject.assignedChildren || [];
  
  // Always show all assigned children's dots, even when filtering
  // The filtering is handled at the subject level in SubjectsPage, not at the dot level
  // This allows users to see which subjects are shared across multiple children
  const childrenNames = assignedChildren.map(id => getChildName(id)).filter(Boolean);
  
  // Get assigned child IDs for defaulting in modals (use original assignedChildren, not filtered)
  // We keep the full array so multi-child subjects can default all related children.
  const assignedChildIdsForModals = Array.isArray(assignedChildren) ? assignedChildren : [];
  const firstAssignedChildId = assignedChildIdsForModals.length > 0 ? assignedChildIdsForModals[0] : null;

  const handleNavigateToPlanner = (item, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault?.();
    }
    const rawEventId = item?.eventId ?? item?.event_id ?? item?.id ?? null;
    const shouldOpenEventModal = item?.type === 'event';
    const eventId = shouldOpenEventModal && rawEventId
      ? String(rawEventId).trim().replace(/^event-/, '')
      : null;
    if (shouldOpenEventModal && eventId && Platform.OS === 'web' && typeof window !== 'undefined') {
      const initialEvent = item?.event || item?.initialEvent || {
        id: eventId,
        title: item?.title || 'Lesson',
        start_ts: item?.startTs || item?.dueDate || null,
        end_ts: item?.endTs || null,
        child_id: item?.childId || null,
        subject_id: item?.subjectId || subject?.id || null,
        event_type: item?.eventType || 'Lesson',
      };
      window.dispatchEvent(
        new CustomEvent('openEventModal', {
          detail: { eventId, initialEvent },
        }),
      );
      return;
    }
    if (onNavigateToPlanner) {
      onNavigateToPlanner({
        subjectId: subject.id,
        childId: item?.childId,
        date: item?.dueDate,
        eventId: item?.type === 'event' ? String(item.id || '').replace(/^event-/, '') : null,
      });
      return;
    }
    onCardClick?.(subject);
  };

  const handleEditSubject = () => {
    if (onEditSubject) {
      onEditSubject(subject);
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openAddSubjectModal', {
        detail: { subject },
      }));
    }
  };

  const handleNewAssignment = () => {
    if (onNewAssignment) {
      onNewAssignment(subject);
      return;
    }
    if (onAddAssignment) {
      onAddAssignment(subject);
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openTaskModal', {
        detail: {
          date: new Date(),
          eventType: 'Assignment',
          subjectId: subject.id,
          childIds: assignedChildIdsForModals,
          childId: firstAssignedChildId,
        },
      }));
    }
  };

  const handleAddAssignmentForCard = (e) => {
    e?.stopPropagation?.();
    handleNewAssignment();
  };

  // Subject blurb: prefer notes, then legacy summary
  const subjectIntent = subject.notes?.trim() || subject.summary?.trim() || null;
  const nextItem = subject.nextItem;
  const overdueCount = subject.overdueCount || 0;

  const isParentViewer =
    session?.role_flags?.isParent === true && session?.role_flags?.isChild !== true;
  const parentAssignmentAttentionCount = subject.parentAssignmentAttentionCount || 0;
  const parentNeedHelpCount = subject.parentNeedHelpCount || 0;

  const needsHelpBadge = isParentViewer && parentNeedHelpCount > 0 && typeof onNeedsHelpPress === 'function' ? (
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
  ) : null;

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
    const CompactOuter = Platform.OS === 'web' ? View : TouchableOpacity;
    const compactProps = Platform.OS === 'web'
      ? {
          style: [styles.card, styles.cardCompactSearch],
          ...(onCardClick ? {
            onClick: () => onCardClick(subject),
            cursor: 'pointer',
          } : {}),
        }
      : {
          style: [styles.card, styles.cardCompactSearch],
          onPress: onCardClick ? () => onCardClick(subject) : undefined,
          activeOpacity: 0.7,
        };

    return (
      <CompactOuter {...compactProps}>
        <View style={styles.searchCompactHeader}>
          <Text style={styles.searchCompactSubjectName} numberOfLines={2}>
            {subject.name}
          </Text>
        </View>
        {searchPreviewContent}
      </CompactOuter>
    );
  }

  const CardOuter = Platform.OS === 'web' ? View : TouchableOpacity;
  const cardOuterProps = Platform.OS === 'web'
    ? {
        style: styles.card,
        ...(onCardClick ? {
          onClick: () => onCardClick(subject),
          cursor: 'pointer',
        } : {}),
      }
    : {
        style: styles.card,
        onPress: onCardClick ? () => onCardClick(subject) : undefined,
        activeOpacity: 0.7,
      };

  return (
    <CardOuter {...cardOuterProps}>
      {/* Header */}
      <SubjectCardHeader
        subjectName={subject.name}
        subject={subject}
        assignedChildIds={assignedChildren}
        familyChildren={children}
        isParentViewer={isParentViewer}
        stopPropagationOnMenu
        needsHelpBadge={needsHelpBadge}
        onEditSubject={isParentViewer ? handleEditSubject : null}
      />
      {subjectIntent ? (
        <Text style={styles.subjectIntent}>{subjectIntent}</Text>
      ) : null}
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

      <View style={styles.whatsNextSection}>
        {nextItem ? (
          <TouchableOpacity
            style={styles.decisionRow}
            onPress={(e) => handleNavigateToPlanner(nextItem, e)}
            accessibilityRole="button"
            accessibilityLabel={`Next: ${nextItem.title}`}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
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
              if (subject.overdueItems?.length > 0) {
                handleNavigateToPlanner(subject.overdueItems[0], e);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={`${overdueCount} overdue items`}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
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

      {isParentViewer ? (
      <View
        style={styles.actionBar}
        {...(Platform.OS === 'web' && {
          onClick: (e) => e.stopPropagation(),
          onMouseDown: (e) => e.stopPropagation(),
        })}
      >
        <TouchableOpacity
          style={[
            styles.addEventButton,
            addAssignmentHovered && styles.addEventButtonHovered,
          ]}
          onPress={handleAddAssignmentForCard}
          onMouseEnter={() => Platform.OS === 'web' && setAddAssignmentHovered(true)}
          onMouseLeave={() => Platform.OS === 'web' && setAddAssignmentHovered(false)}
          accessibilityRole="button"
          accessibilityLabel="Add assignment"
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Plus size={16} color="#6B7280" />
          <Text style={[
            styles.addEventButtonText,
            addAssignmentHovered && styles.addEventButtonTextHovered,
          ]}>Add assignment</Text>
        </TouchableOpacity>
      </View>
      ) : null}
      {searchPreviewContent}
    </CardOuter>
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
    marginBottom: 12,
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
  cardMenuWrap: {
    flexShrink: 0,
    position: 'relative',
    zIndex: 2,
    marginTop: 2,
  },
  cardMenuBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  cardMenuBtnActive: {
    backgroundColor: '#F1F5F9',
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
  subjectIntent: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectMetaLine: {
    marginTop: 4,
    fontSize: 12,
    color: '#374151',
    lineHeight: 16,
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectMetaRow: {
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  subjectMetaSeparator: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectAssigneeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subjectAssigneeInline: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subjectStudentInlineName: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '400',
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
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actionBar: {
    paddingTop: 4,
    width: '100%',
  },
  addEventButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: '#F9FAFB',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
      boxSizing: 'border-box',
    }),
  },
  addEventButtonHovered: {
    backgroundColor: '#EFF6FF',
  },
  addEventButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      transition: 'font-weight 0.2s ease',
    }),
  },
  addEventButtonTextHovered: {
    fontWeight: '600',
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