import React, { useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet, ScrollView } from 'react-native';
import { Check } from 'lucide-react';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';
import {
  formatEventTypeLabel,
  formatTimeRangeLabel,
  formatChildNamesCommaLine,
  resolveChildIdsForEvent,
  getPlannerEventTypeColors,
} from '../planner/plannerListTableUtils';
import {
  getGradeColumnLabel,
  getWorkStatusLabel,
  isWorkProducingEventType,
  primaryAssignmentForEvent,
  resolveSubmissionColumnDisplay,
  SUBMISSION_COLUMN_STATES,
} from '../../lib/workEventHelpers';
import SubmissionColumnCell from '../planner/SubmissionColumnCell';
const ALL_EVENTS_MAX_VISIBLE_ROWS = 5;
const ALL_EVENTS_ROW_GAP = 8;
const ALL_EVENTS_ROW_HEIGHT = 56;
const WEB_HEADING_FONT = Platform.OS === 'web'
  ? { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};
const WEB_BODY_FONT = Platform.OS === 'web'
  ? { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

function resolveEventDateValue(ev) {
  if (!ev) return null;
  const direct = ev.start || ev.start_ts || ev.start_local || ev.due_ts;
  if (direct) return direct;
  const ymd = String(ev.date_local || ev.date || '').slice(0, 10);
  if (!ymd) return null;
  return `${ymd}T12:00:00.000Z`;
}

function isDoneStatus(statusValue) {
  const normalized = String(statusValue || '').trim().toLowerCase();
  return normalized === 'done' || normalized === 'completed';
}

function formatRowDate(event) {
  const dateValue = resolveEventDateValue(event);
  const ymd = String(event?.date_local || '').slice(0, 10) || String(dateValue || '').slice(0, 10);
  if (!ymd) return '—';
  const ymdMatch = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const monthIdx = Number(ymdMatch[2]) - 1;
    const day = Number(ymdMatch[3]);
    const year = Number(ymdMatch[1]);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (monthIdx >= 0 && monthIdx <= 11 && Number.isFinite(day) && Number.isFinite(year)) {
      return `${monthNames[monthIdx]} ${day}, ${year}`;
    }
  }
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}


function getEventUnitLessonLabel(event) {
  const unitTitle = String(event?.curriculum_unit_title || event?.unit || '').trim();
  const meta = event?.curriculum_metadata && typeof event.curriculum_metadata === 'object'
    ? event.curriculum_metadata
    : {};
  const lessonTitle = String(meta?.lesson_label || event?.lesson || '').trim();
  if (unitTitle && lessonTitle) return `${unitTitle} · ${lessonTitle}`;
  if (lessonTitle) return lessonTitle;
  if (unitTitle) return unitTitle;
  return '';
}

function resolveMaterialDisplayLabel(material, materialId, event) {
  const title = String(material?.title || '').trim();
  if (title) return title;
  const providerName = String(material?.provider_name || '').trim();
  if (providerName) return providerName;
  const primaryId = String(event?.material_id || '').trim();
  if (primaryId && primaryId === String(materialId || '')) {
    const eventTitle = String(event?.material_title || event?.attachment_title || '').trim();
    if (eventTitle) return eventTitle;
  }
  const storagePath = String(material?.storage_path || '').trim();
  if (storagePath) {
    const base = storagePath.split('/').pop();
    if (base) {
      try {
        return decodeURIComponent(base);
      } catch {
        return base;
      }
    }
  }
  return 'Attachment';
}

function getEventMaterialIds(event) {
  const ids = [];
  const attachmentIds = Array.isArray(event?.materials_attachment_ids)
    ? event.materials_attachment_ids
    : [];
  attachmentIds.forEach((id) => {
    const normalized = String(id || '').trim();
    if (normalized) ids.push(normalized);
  });
  const primaryId = String(event?.material_id || '').trim();
  if (primaryId && !ids.includes(primaryId)) ids.unshift(primaryId);
  return ids;
}

function formatEventGradeLabel(gradeInfo) {
  if (!gradeInfo) return '';
  if (gradeInfo.score != null && gradeInfo.possible != null && Number(gradeInfo.possible) > 0) {
    const percent = Math.round((Number(gradeInfo.score) / Number(gradeInfo.possible)) * 100);
    return `${gradeInfo.score}/${gradeInfo.possible} (${percent}%)`;
  }
  if (gradeInfo.score != null && gradeInfo.score !== '') {
    return String(gradeInfo.score);
  }
  if (gradeInfo.grade) return String(gradeInfo.grade);
  return '';
}

function TableHeader({ reviewCenterMode = false }) {
  if (reviewCenterMode) {
    return (
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, styles.colReviewEvent]}>Event</Text>
        <Text style={[styles.tableHeaderCell, styles.colReviewStatus]}>Status</Text>
        <Text style={[styles.tableHeaderCell, styles.colReviewSubmission]}>Submission</Text>
        <Text style={[styles.tableHeaderCell, styles.colReviewGrade]}>Grade</Text>
      </View>
    );
  }
  return (
    <View style={styles.tableHeaderRow}>
      <Text style={[styles.tableHeaderCell, styles.colLeadingSpacer]}>Attendance</Text>
      <Text style={[styles.tableHeaderCell, styles.colDetails]}>Event Details</Text>
      <Text style={[styles.tableHeaderCell, styles.colUnits]}>Units</Text>
      <Text style={[styles.tableHeaderCell, styles.colSubmission]}>Submission</Text>
      <Text style={[styles.tableHeaderCell, styles.colGrade]}>Grade</Text>
      <Text style={[styles.tableHeaderCell, styles.colAttachments]}>Attachments</Text>
    </View>
  );
}

export default function SubjectAllEventsSection({
  events = [],
  eventOutcomes = [],
  materials = [],
  eventAttachmentMaterials = [],
  children = [],
  assignmentsByEventId = {},
  reviewCenterMode = false,
  onAssignmentPress = null,
  onEventPress,
  onEventRightClick,
  onEventComplete,
  onToggleEventAttendance = null,
  resolveEventAttendanceState = null,
  onAttachmentPress,
  canManageEvents = true,
}) {
  const materialById = useMemo(() => {
    const map = new Map();
    [...(materials || []), ...(eventAttachmentMaterials || [])].forEach((material) => {
      const id = String(material?.id || '').trim();
      if (!id) return;
      map.set(id, material);
    });
    return map;
  }, [materials, eventAttachmentMaterials]);

  const gradeByEventId = useMemo(() => {
    const map = new Map();
    (eventOutcomes || []).forEach((outcome) => {
      const eventId = String(outcome?.event_id || '').trim();
      if (!eventId || outcome?.grade == null || outcome?.grade === '') return;
      map.set(eventId, { grade: outcome.grade, score: null, possible: null });
    });
    (events || []).forEach((event) => {
      const eventId = String(event?.id || '').trim();
      if (!eventId || map.has(eventId)) return;
      const hasGrade = event?.grade != null && event?.grade !== '';
      const hasScore = event?.score != null && event?.score !== '';
      if (!hasGrade && !hasScore) return;
      map.set(eventId, {
        grade: event.grade || null,
        score: event.score ?? null,
        possible: event.possible ?? null,
      });
    });
    return map;
  }, [eventOutcomes, events]);

  const filteredEvents = useMemo(() => {
    const rows = (events || []).filter((event) => {
      if (!event) return false;
      if (event.is_backlog === true) return false;
      if (event.deleted || event.deleted_at) return false;
      if (String(event?.status || '').toLowerCase() === 'canceled') return false;
      if (!resolveEventDateValue(event)) return false;
      if (reviewCenterMode && !isWorkProducingEventType(event.event_type)) return false;
      return true;
    });
    return rows.sort((a, b) => {
      const aDate = new Date(resolveEventDateValue(a) || 0).getTime();
      const bDate = new Date(resolveEventDateValue(b) || 0).getTime();
      return aDate - bDate;
    });
  }, [events, reviewCenterMode]);

  const renderReviewRow = useCallback((event) => {
    const eventId = String(event?.id || '');
    const assignment = primaryAssignmentForEvent(assignmentsByEventId, eventId);
    const workSpec = event?.work_spec || {};
    const submissionDisplay = resolveSubmissionColumnDisplay({ event, assignment });
    const statusLabel = getWorkStatusLabel(assignment);
    const gradeLabel = getGradeColumnLabel(assignment, workSpec);
    const typeLabel = formatEventTypeLabel(event);
    const { chipBg, chipText } = getPlannerEventTypeColors(event);
    const handlePress = () => {
      if (assignment && typeof onAssignmentPress === 'function') {
        onAssignmentPress(assignment, event);
        return;
      }
      onEventPress?.(event);
    };

    return (
      <TouchableOpacity
        key={eventId || Math.random()}
        style={styles.reviewCardRow}
        onPress={handlePress}
        activeOpacity={0.75}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <View style={[styles.tableCell, styles.colReviewEvent]}>
          <Text style={styles.eventTitle} numberOfLines={1}>
            {String(event?.title || 'Untitled')}
          </Text>
          <View style={styles.eventSublineRow}>
            <View style={[styles.eventTypeChip, { backgroundColor: chipBg }]}>
              <Text style={[styles.eventTypeChipText, { color: chipText }]} numberOfLines={1}>
                {typeLabel}
              </Text>
            </View>
            <Text style={styles.eventSublineMeta} numberOfLines={1}>
              {formatRowDate(event)}
            </Text>
          </View>
        </View>
        <View style={[styles.tableCell, styles.colReviewStatus]}>
          <Text style={styles.cellText} numberOfLines={1}>{statusLabel}</Text>
        </View>
        <View style={[styles.tableCell, styles.colReviewSubmission]}>
          <SubmissionColumnCell display={submissionDisplay} />
        </View>
        <View style={[styles.tableCell, styles.colReviewGrade]}>
          <Text style={[styles.cellText, styles.gradeText]} numberOfLines={1}>
            {gradeLabel}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [assignmentsByEventId, onAssignmentPress, onEventPress]);

  const cappedListHeight = useMemo(() => {
    const rowCount = Math.min(
      Math.max(filteredEvents.length, 0),
      ALL_EVENTS_MAX_VISIBLE_ROWS
    );
    if (rowCount <= 0) return 0;
    return rowCount * ALL_EVENTS_ROW_HEIGHT + (rowCount - 1) * ALL_EVENTS_ROW_GAP;
  }, [filteredEvents.length]);
  const shouldScrollEvents = filteredEvents.length > ALL_EVENTS_MAX_VISIBLE_ROWS;

  const renderAttachmentLinks = useCallback((event) => {
    const materialIds = getEventMaterialIds(event);
    if (materialIds.length === 0) {
      return <Text style={styles.emptyCellText}>—</Text>;
    }
    return (
      <View style={styles.attachmentLinksWrap}>
        {materialIds.map((materialId) => {
          const material = materialById.get(materialId);
          const label = resolveMaterialDisplayLabel(material, materialId, event);
          return (
            <TouchableOpacity
              key={materialId}
              style={styles.attachmentLinkButton}
              onPress={() => onAttachmentPress?.(material || { id: materialId, title: label }, event)}
              activeOpacity={0.7}
              {...(Platform.OS === 'web' && {
                cursor: onAttachmentPress ? 'pointer' : 'default',
                title: label,
              })}
            >
              <Text
                style={[styles.attachmentLinkText, styles.ellipsisText]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }, [materialById, onAttachmentPress]);

  const renderEventRow = useCallback((event) => {
    const status = String(event?.status || '').toLowerCase();
    const isDone = isDoneStatus(status);
    const useAttendanceSync = typeof onToggleEventAttendance === 'function'
      && typeof resolveEventAttendanceState === 'function';
    const attendanceState = useAttendanceSync ? (resolveEventAttendanceState(event) || {}) : null;
    const isAttended = useAttendanceSync
      ? attendanceState?.isAttended === true
      : isDone;
    const canToggleAttendance = useAttendanceSync
      ? attendanceState?.canToggle !== false && !!String(event?.id || '').trim()
      : !!onEventComplete;
    const unitLessonLabel = getEventUnitLessonLabel(event);
    const gradeLabel = formatEventGradeLabel(gradeByEventId.get(String(event?.id || '')));
    const typeLabel = formatEventTypeLabel(event);
    const timeLabel = formatTimeRangeLabel(event);
    const eventChildIds = resolveChildIdsForEvent(event);
    const childLabel = eventChildIds.length > 0
      ? formatChildNamesCommaLine(eventChildIds, children)
      : '';
    const { chipBg, chipText } = getPlannerEventTypeColors(event);
    const eventId = String(event?.id || '');
    const assignment = primaryAssignmentForEvent(assignmentsByEventId, eventId, eventChildIds);
    const submissionDisplay = resolveSubmissionColumnDisplay({ event, assignment });
    const handleSubmissionReview = () => {
      if (assignment && typeof onAssignmentPress === 'function') {
        onAssignmentPress(assignment, event);
        return;
      }
      onEventPress?.(event);
    };
    const handleRowContextMenu = (nativeEvent) => {
      if (Platform.OS !== 'web' || typeof window === 'undefined' || !onEventRightClick) return;
      nativeEvent?.preventDefault?.();
      nativeEvent?.stopPropagation?.();
      onEventRightClick(event, nativeEvent);
    };

    return (
      <View
        key={eventId || Math.random()}
        style={[styles.eventCardRow, !useAttendanceSync && isDone && styles.eventCardRowDone]}
        {...(Platform.OS === 'web' && {
          'data-event-id': eventId,
          onMouseDown: (e) => {
            const button = e?.button ?? e?.nativeEvent?.button;
            if (button !== 2) return;
            handleRowContextMenu(e?.nativeEvent || e);
          },
          onContextMenu: (e) => {
            handleRowContextMenu(e?.nativeEvent || e);
          },
        })}
      >
        <View style={styles.eventCardLeading}>
          {canManageEvents && (useAttendanceSync ? onToggleEventAttendance : onEventComplete) ? (
            <TouchableOpacity
              style={[
                styles.attendanceToggleCircle,
                isAttended && styles.attendanceToggleCircleDone,
              ]}
              onPress={() => {
                if (useAttendanceSync) {
                  onToggleEventAttendance?.(event);
                  return;
                }
                onEventComplete?.(event);
              }}
              activeOpacity={0.82}
              hitSlop={8}
              disabled={!canToggleAttendance}
              accessibilityRole="button"
              accessibilityLabel={isAttended ? 'Mark attendance as unattended' : 'Mark attendance as attended'}
              {...(Platform.OS === 'web' && { cursor: canToggleAttendance ? 'pointer' : 'default' })}
            >
              {isAttended ? <Check size={14} color="#16a34a" strokeWidth={2.5} /> : null}
            </TouchableOpacity>
          ) : (
            <View style={styles.attendancePlaceholder} />
          )}
          <Text style={styles.eventCardDate}>{formatRowDate(event)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.tableCell, styles.colDetails, styles.detailsCell]}
          onPress={() => onEventPress?.(event)}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text
            style={[styles.eventTitle, !useAttendanceSync && isDone && styles.eventTitleDone]}
            numberOfLines={1}
          >
            {String(event?.title || 'Untitled')}
          </Text>
          <View style={styles.eventSublineRow}>
            <View style={[styles.eventTypeChip, { backgroundColor: chipBg }]}>
              <Text style={[styles.eventTypeChipText, { color: chipText }]} numberOfLines={1}>
                {typeLabel}
              </Text>
            </View>
            {timeLabel ? (
              <Text style={[styles.eventSublineMeta, !useAttendanceSync && isDone && styles.mutedText]} numberOfLines={1}>
                {timeLabel}
              </Text>
            ) : null}
            {eventChildIds.length > 0 ? (
              <View style={styles.eventChildLabel}>
                <ChildAvatarCluster
                  childIds={eventChildIds}
                  familyChildren={children}
                  size={20}
                  overlap={-6}
                />
                {childLabel ? (
                  <Text style={[styles.eventSublineMeta, !useAttendanceSync && isDone && styles.mutedText]} numberOfLines={1}>
                    {childLabel}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        <View style={[styles.tableCell, styles.colUnits]}>
          {unitLessonLabel ? (
            <Text style={[styles.cellText, !useAttendanceSync && isDone && styles.mutedText]} numberOfLines={1} ellipsizeMode="tail">
              {unitLessonLabel}
            </Text>
          ) : (
            <Text style={styles.emptyCellText}>—</Text>
          )}
        </View>

        <View style={[styles.tableCell, styles.colSubmission]}>
          <SubmissionColumnCell
            display={submissionDisplay}
            muted={!useAttendanceSync && isDone}
            onSubLabelPress={
              submissionDisplay.state === SUBMISSION_COLUMN_STATES.SUBMITTED
                ? handleSubmissionReview
                : null
            }
          />
        </View>

        <View style={[styles.tableCell, styles.colGrade]}>
          {gradeLabel ? (
            <Text style={[styles.cellText, styles.gradeText, isDone && styles.mutedText]} numberOfLines={1} ellipsizeMode="tail">
              {gradeLabel}
            </Text>
          ) : (
            <Text style={styles.emptyCellText}>—</Text>
          )}
        </View>

        <View style={[styles.tableCell, styles.colAttachments]}>
          {renderAttachmentLinks(event)}
        </View>
      </View>
    );
  }, [
    assignmentsByEventId,
    canManageEvents,
    children,
    gradeByEventId,
    onEventComplete,
    onToggleEventAttendance,
    resolveEventAttendanceState,
    onEventPress,
    onEventRightClick,
    onAssignmentPress,
    renderAttachmentLinks,
  ]);

  if (filteredEvents.length === 0) {
    return (
      <View style={styles.emptyStateBox}>
        <Text style={styles.emptyStateText}>
          {reviewCenterMode
            ? 'No assignments, projects, or exams assigned or submitted yet.'
            : 'Nothing to see here! Add some events to get started'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tableScrollWrap}>
        <TableHeader reviewCenterMode={reviewCenterMode} />
        <ScrollView
          style={[
            styles.eventListScroll,
            cappedListHeight > 0 && { height: cappedListHeight },
          ]}
          contentContainerStyle={[
            styles.eventList,
            reviewCenterMode && styles.reviewEventList,
          ]}
          scrollEnabled={shouldScrollEvents}
          showsVerticalScrollIndicator={shouldScrollEvents}
          nestedScrollEnabled
          {...(Platform.OS === 'web' && {
            tabIndex: 0,
          })}
        >
          {reviewCenterMode
            ? filteredEvents.map((event) => renderReviewRow(event))
            : filteredEvents.map((event) => renderEventRow(event))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  emptyStateBox: {
    width: '100%',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    ...WEB_BODY_FONT,
  },
  tableScrollWrap: {
    width: '100%',
    ...(Platform.OS === 'web' && {
      overflowX: 'auto',
    }),
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    minWidth: 1060,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...WEB_HEADING_FONT,
  },
  eventListScroll: {
    width: '100%',
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
      overflowX: 'hidden',
    }),
  },
  eventList: {
    gap: ALL_EVENTS_ROW_GAP,
    minWidth: 1060,
  },
  eventCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 1060,
    minHeight: ALL_EVENTS_ROW_HEIGHT,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    overflow: 'hidden',
  },
  eventCardRowDone: {
    opacity: 0.72,
  },
  eventCardLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: 152,
    flexShrink: 0,
  },
  attendanceToggleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.14)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendanceToggleCircleDone: {
    borderColor: 'rgba(34,197,94,0.35)',
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  eventCardDate: {
    fontSize: 12,
    color: '#6B7280',
    width: 80,
    ...WEB_BODY_FONT,
  },
  tableCell: {
    justifyContent: 'center',
    paddingRight: 8,
    minWidth: 0,
    overflow: 'hidden',
  },
  colLeadingSpacer: {
    width: 152,
    flexShrink: 0,
  },
  colDetails: {
    flex: 1.8,
    minWidth: 0,
  },
  colUnits: {
    flex: 1.2,
    minWidth: 0,
  },
  colSubmission: {
    flex: 0.9,
    minWidth: 0,
  },
  colGrade: {
    flex: 0.8,
    minWidth: 0,
  },
  colAttachments: {
    flex: 1.1,
    minWidth: 0,
    paddingRight: 0,
  },
  colReviewEvent: {
    flex: 2,
    minWidth: 0,
  },
  colReviewStatus: {
    flex: 1,
    minWidth: 0,
  },
  colReviewSubmission: {
    flex: 1,
    minWidth: 0,
  },
  colReviewGrade: {
    flex: 0.8,
    minWidth: 0,
    paddingRight: 0,
  },
  reviewEventList: {
    minWidth: 720,
  },
  reviewCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 720,
    minHeight: ALL_EVENTS_ROW_HEIGHT,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    overflow: 'hidden',
  },
  attendancePlaceholder: {
    width: 24,
    height: 24,
  },
  detailsCell: {
    alignItems: 'flex-start',
    width: '100%',
    gap: 2,
  },
  ellipsisText: {
    ...(Platform.OS === 'web' && {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      display: 'block',
      maxWidth: '100%',
    }),
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    width: '100%',
    ...WEB_HEADING_FONT,
    ...(Platform.OS === 'web' && {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
  },
  eventTitleDone: {
    textDecorationLine: 'line-through',
  },
  eventSublineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
    marginTop: 2,
  },
  eventTypeChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  eventTypeChipText: {
    fontSize: 11,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eventSublineMeta: {
    fontSize: 12,
    color: '#64748B',
    ...WEB_BODY_FONT,
    ...(Platform.OS === 'web' && {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
  },
  eventChildLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  cellText: {
    fontSize: 13,
    color: '#374151',
    width: '100%',
    ...WEB_BODY_FONT,
    ...(Platform.OS === 'web' && {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
  },
  gradeText: {
    fontWeight: '600',
    color: '#374151',
  },
  submissionText: {
    fontWeight: '500',
    color: '#475569',
  },
  emptyCellText: {
    fontSize: 13,
    color: '#CBD5E1',
    ...WEB_BODY_FONT,
  },
  mutedText: {
    opacity: 0.65,
  },
  attachmentLinksWrap: {
    gap: 4,
    width: '100%',
    minWidth: 0,
    overflow: 'hidden',
  },
  attachmentLinkButton: {
    width: '100%',
    minWidth: 0,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  attachmentLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
    textDecorationLine: 'underline',
    ...WEB_BODY_FONT,
  },
  actionLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
    ...WEB_BODY_FONT,
    ...(Platform.OS === 'web' && {
      textDecorationLine: 'underline',
      cursor: 'pointer',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
  },
  submittalWrap: {
    gap: 2,
    width: '100%',
    minWidth: 0,
    overflow: 'hidden',
  },
  submittalPendingText: {
    color: '#B45309',
    fontWeight: '600',
  },
  submittalDoneText: {
    color: '#047857',
    fontWeight: '600',
  },
});
