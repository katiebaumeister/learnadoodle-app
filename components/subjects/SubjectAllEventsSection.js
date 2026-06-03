import React, { useMemo, useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { Check } from 'lucide-react';
import { getAssignmentThreadPreview } from '../../lib/assignmentWorkflowClient';

const EVENTS_LIST_LIMIT = 10;
const SUBLINE_SEPARATOR = ' · ';
const WEB_HEADING_FONT = Platform.OS === 'web'
  ? { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};
const WEB_BODY_FONT = Platform.OS === 'web'
  ? { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

function resolveEventDateValue(ev) {
  if (!ev) return null;
  const direct = ev.start || ev.start_ts || ev.start_local;
  if (direct) return direct;
  const ymd = String(ev.date_local || ev.date || '').slice(0, 10);
  if (!ymd) return null;
  return `${ymd}T12:00:00.000Z`;
}

function isDoneStatus(statusValue) {
  const normalized = String(statusValue || '').trim().toLowerCase();
  return normalized === 'done' || normalized === 'completed';
}

function formatTimeRangeLabel(event) {
  const holidayType = String(event?.holiday_type || event?.holidayType || '').toUpperCase();
  const typeLower = String(event?.event_type || event?.type || '').toLowerCase();
  if (typeLower === 'holiday' || holidayType === 'CUSTOM_HOLIDAY' || holidayType === 'CUSTOM_BREAK' || holidayType === 'GLOBAL_HOLIDAY') {
    return 'All day';
  }
  const startValue = resolveEventDateValue(event);
  const endValue = event?.end_ts || event?.end || event?.end_local;
  const formatTime = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  const startLabel = formatTime(startValue);
  const endLabel = formatTime(endValue);
  if (!startLabel && !endLabel) return '';
  if (startLabel && endLabel) return `${startLabel}${SUBLINE_SEPARATOR}${endLabel}`;
  return startLabel || endLabel || '';
}

function formatEventTypeLabel(event) {
  if (!event) return 'Lesson';
  const holidayType = String(event?.holiday_type || event?.holidayType || '').trim().toUpperCase();
  if (holidayType === 'CUSTOM_BREAK') return 'Break';
  if (holidayType === 'CUSTOM_HOLIDAY' || holidayType === 'GLOBAL_HOLIDAY') return 'Day Off';
  const raw = String(event?.event_type || event?.type || '').trim();
  if (!raw) return 'Lesson';
  const lower = raw.toLowerCase();
  if (lower === 'schedule block' || lower === 'scheduled class day' || lower === 'classday') return 'Class Day';
  if (lower === 'custom_break' || lower === 'break') return 'Break';
  if (lower === 'custom_holiday' || lower === 'global_holiday' || lower === 'holiday' || lower === 'day off' || lower === 'dayoff') return 'Day Off';
  const knownLabels = {
    lesson: 'Lesson',
    assignment: 'Assignment',
    activity: 'Activity',
    project: 'Project',
    exam: 'Exam',
    assessment: 'Assessment',
    appointment: 'Appointment',
    travel: 'Travel',
    'live class': 'Live Class',
    'home lesson': 'Home Lesson',
    'core class': 'Core Class',
    'class day': 'Class Day',
  };
  return knownLabels[lower] || raw;
}

function formatChildNamesSentence(names) {
  const list = (Array.isArray(names) ? names : []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list[0]}, ${list.slice(1, -1).join(', ')}, and ${list[list.length - 1]}`;
}

function resolveChildNamesForEvent(event, children = []) {
  const ids = [];
  if (event?.child_id) ids.push(String(event.child_id));
  if (Array.isArray(event?.child_ids)) {
    event.child_ids.forEach((id) => {
      if (id != null && String(id).trim()) ids.push(String(id));
    });
  }
  const names = [...new Set(ids)]
    .map((id) => {
      const match = (children || []).find((child) => String(child?.id) === id);
      return String(match?.first_name || match?.name || '').trim() || null;
    })
    .filter(Boolean);
  return formatChildNamesSentence(names);
}

function formatEventSubline(event, children = []) {
  const childLabel = resolveChildNamesForEvent(event, children);
  const typeLabel = formatEventTypeLabel(event);
  const timeRange = formatTimeRangeLabel(event);
  const typeWithTime = timeRange ? `${typeLabel}${SUBLINE_SEPARATOR}${timeRange}` : typeLabel;
  return childLabel ? `${childLabel}${SUBLINE_SEPARATOR}${typeWithTime}` : typeWithTime;
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

function resolveChildNameForEvent(event, assignment, children = []) {
  const childId = String(
    assignment?.child_id ||
    event?.child_id ||
    event?.childId ||
    (Array.isArray(event?.child_ids) ? event.child_ids[0] : '') ||
    ''
  ).trim();
  if (!childId) return 'Student';
  const match = (children || []).find((c) => String(c?.id) === childId);
  return String(match?.first_name || match?.name || 'Student').trim() || 'Student';
}

function pickAssignmentForEvent(event, assignments = []) {
  if (!Array.isArray(assignments) || assignments.length === 0) return null;
  const childId = String(
    event?.child_id || event?.childId || (Array.isArray(event?.child_ids) ? event.child_ids[0] : '') || ''
  ).trim();
  if (childId) {
    const match = assignments.find((row) => String(row?.child_id || '') === childId);
    if (match) return match;
  }
  return assignments[0];
}

function getSubmittalPresentation(assignment, { isParentViewer = true } = {}) {
  if (!assignment) {
    return isParentViewer
      ? { label: 'Not requested', actionLabel: 'Request submittal', viewOnly: false, tone: 'muted' }
      : { label: '', actionLabel: null, viewOnly: false, tone: 'empty' };
  }
  const status = String(assignment?.status || '').trim().toLowerCase();
  const reviewStatus = String(assignment?.review_status || '').trim().toLowerCase();
  const isReviewed =
    reviewStatus === 'reviewed' ||
    reviewStatus === 'approved' ||
    status === 'reviewed' ||
    status === 'accepted';
  if (status === 'submitted' && !isReviewed) {
    return {
      label: reviewStatus === 'needs_revision' ? 'Needs revision' : 'Submitted',
      actionLabel: 'Review',
      viewOnly: false,
      tone: 'pending',
    };
  }
  if (isReviewed) {
    return { label: 'Reviewed', actionLabel: 'View', viewOnly: true, tone: 'done' };
  }
  if (status === 'not_started') {
    return {
      label: isParentViewer ? 'Awaiting submittal' : 'Not submitted',
      actionLabel: isParentViewer ? null : 'Submit work',
      viewOnly: false,
      tone: 'muted',
    };
  }
  if (status === 'in_progress') {
    return {
      label: isParentViewer ? 'In progress' : 'In progress',
      actionLabel: isParentViewer ? null : 'Submit work',
      viewOnly: false,
      tone: 'muted',
    };
  }
  return { label: status ? status.replace(/_/g, ' ') : '—', actionLabel: null, viewOnly: false, tone: 'muted' };
}

function TableHeader() {
  return (
    <View style={styles.tableHeaderRow}>
      <Text style={[styles.tableHeaderCell, styles.colLeadingSpacer]} />
      <Text style={[styles.tableHeaderCell, styles.colDetails]}>Event Details</Text>
      <Text style={[styles.tableHeaderCell, styles.colUnits]}>Units</Text>
      <Text style={[styles.tableHeaderCell, styles.colGrade]}>Grade</Text>
      <Text style={[styles.tableHeaderCell, styles.colAttachments]}>Attachments</Text>
      <Text style={[styles.tableHeaderCell, styles.colCommunications]}>Messages</Text>
      <Text style={[styles.tableHeaderCell, styles.colSubmittals]}>Submittals</Text>
    </View>
  );
}

export default function SubjectAllEventsSection({
  events = [],
  eventOutcomes = [],
  materials = [],
  eventAttachmentMaterials = [],
  assignmentsByEventId = {},
  isParentViewer = true,
  children = [],
  onEventPress,
  onEventRightClick,
  onEventComplete,
  onToggleEventAttendance = null,
  resolveEventAttendanceState = null,
  onAttachmentPress,
  onMessageAboutAssignment,
  onSubmittalAction,
  canManageEvents = true,
}) {
  const [expanded, setExpanded] = useState(false);

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
      return !!resolveEventDateValue(event);
    });
    return rows.sort((a, b) => {
      const aDate = new Date(resolveEventDateValue(a) || 0).getTime();
      const bDate = new Date(resolveEventDateValue(b) || 0).getTime();
      return aDate - bDate;
    });
  }, [events]);

  const visibleEvents = useMemo(() => {
    if (expanded) return filteredEvents;
    return filteredEvents.slice(0, EVENTS_LIST_LIMIT);
  }, [expanded, filteredEvents]);

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
    const sublineLabel = formatEventSubline(event, children);
    const eventId = String(event?.id || '');
    const linkedAssignments = assignmentsByEventId?.[eventId] || [];
    const assignment = pickAssignmentForEvent(event, linkedAssignments);
    const submittal = getSubmittalPresentation(assignment, { isParentViewer });
    const childName = resolveChildNameForEvent(event, assignment, children);
    const threadPreview = getAssignmentThreadPreview(assignment, { isParentViewer, childName, children });
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
          {sublineLabel ? (
            <Text style={[styles.eventSubline, !useAttendanceSync && isDone && styles.mutedText]} numberOfLines={2}>
              {sublineLabel}
            </Text>
          ) : null}
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

        <View style={[styles.tableCell, styles.colCommunications]}>
          {onMessageAboutAssignment ? (
            <TouchableOpacity
              onPress={() => onMessageAboutAssignment(event, assignment)}
              activeOpacity={0.7}
              style={styles.messageCellWrap}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text
                style={[
                  styles.actionLinkText,
                  assignment?.need_help && styles.actionLinkWarning,
                ]}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {isParentViewer
                  ? (assignment?.need_help ? 'Message student · help requested' : 'Message student about assignment')
                  : 'Message parent about assignment'}
              </Text>
              {threadPreview.hasActivity && threadPreview.preview ? (
                <Text
                  style={[
                    styles.threadPreviewText,
                    threadPreview.kind === 'help' && styles.threadPreviewHelp,
                    threadPreview.kind === 'submittal' && styles.threadPreviewSubmittal,
                    threadPreview.kind === 'submission' && styles.threadPreviewSubmission,
                  ]}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {threadPreview.preview}
                </Text>
              ) : null}
            </TouchableOpacity>
          ) : (
            <Text style={styles.emptyCellText}>—</Text>
          )}
        </View>

        <View style={[styles.tableCell, styles.colSubmittals]}>
          {submittal.tone === 'empty' && !submittal.actionLabel ? (
            <Text style={styles.emptyCellText}>—</Text>
          ) : (
            <View style={styles.submittalWrap}>
              {submittal.label ? (
                <Text
                  style={[
                    styles.cellText,
                    submittal.tone === 'pending' && styles.submittalPendingText,
                    submittal.tone === 'done' && styles.submittalDoneText,
                    submittal.tone === 'muted' && styles.mutedText,
                    isDone && styles.mutedText,
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {submittal.label}
                </Text>
              ) : null}
              {submittal.actionLabel && onSubmittalAction ? (
                <TouchableOpacity
                  onPress={() => onSubmittalAction(event, assignment, submittal.viewOnly)}
                  activeOpacity={0.7}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.actionLinkText} numberOfLines={1}>{submittal.actionLabel}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </View>
      </View>
    );
  }, [
    assignmentsByEventId,
    canManageEvents,
    children,
    gradeByEventId,
    isParentViewer,
    onEventComplete,
    onToggleEventAttendance,
    resolveEventAttendanceState,
    onEventPress,
    onEventRightClick,
    onMessageAboutAssignment,
    onSubmittalAction,
    renderAttachmentLinks,
  ]);

  if (filteredEvents.length === 0) {
    return (
      <View style={styles.emptyStateBox}>
        <Text style={styles.emptyStateText}>
          Events appear once you add calendar events for this subject.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tableScrollWrap}>
        <TableHeader />
        <View style={styles.eventList}>
          {visibleEvents.map((event) => renderEventRow(event))}
        </View>
      </View>
      {filteredEvents.length > EVENTS_LIST_LIMIT ? (
        <TouchableOpacity
          style={styles.showMoreBtn}
          onPress={() => setExpanded((v) => !v)}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={styles.showMoreText}>
            {expanded
              ? 'Show less'
              : `Show more (${filteredEvents.length - EVENTS_LIST_LIMIT} more)`}
          </Text>
        </TouchableOpacity>
      ) : null}
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
    minWidth: 980,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...WEB_HEADING_FONT,
  },
  eventList: {
    gap: 8,
    minWidth: 980,
  },
  eventCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 980,
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
  colGrade: {
    flex: 0.8,
    minWidth: 0,
  },
  colAttachments: {
    flex: 1.1,
    minWidth: 0,
    paddingRight: 8,
  },
  colCommunications: {
    flex: 1.3,
    minWidth: 0,
  },
  colSubmittals: {
    flex: 1,
    minWidth: 0,
    paddingRight: 0,
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
  eventSubline: {
    fontSize: 12,
    color: '#6B7280',
    width: '100%',
    ...WEB_BODY_FONT,
    ...(Platform.OS === 'web' && {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }),
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
  actionLinkWarning: {
    color: '#B45309',
  },
  messageCellWrap: {
    width: '100%',
    minWidth: 0,
    gap: 3,
  },
  threadPreviewText: {
    fontSize: 11,
    lineHeight: 15,
    color: '#64748B',
    width: '100%',
    ...WEB_BODY_FONT,
    ...(Platform.OS === 'web' && {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
    }),
  },
  threadPreviewHelp: {
    color: '#B45309',
  },
  threadPreviewSubmittal: {
    color: '#0369A1',
  },
  threadPreviewSubmission: {
    color: '#047857',
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
  showMoreBtn: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  showMoreText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4F46E5',
    ...WEB_HEADING_FONT,
  },
});
