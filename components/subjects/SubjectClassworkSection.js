import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  GripVertical,
  MoreVertical,
  Plus,
} from 'lucide-react';
import {
  buildSubjectClassworkModel,
  buildUnitPeerItems,
  buildNoUnitPeerItems,
  resolveAssignmentLearningDay,
} from '../../lib/subjectClassworkModel';
import {
  autoAssignLessonsToUnlinkedEvents,
  buildLessonSchedulePreview,
  formatLessonSchedulePreviewLine,
} from '../../lib/subjectLessonLinking';
import { formatDueShort } from '../tutor/tutorHelpUtils';
import { updateAssignmentPlacement } from '../../lib/services/assignmentPlacementClient';
import {
  deleteAssignmentAndEvent,
  resolveLinkedEventIdFromAssignment,
} from '../../lib/create/assignmentEditHelpers';
import {
  deleteLessonFromSubjectCurriculum,
  moveLessonInSubjectCurriculum,
} from '../../lib/subjectClassworkLessonActions';
import {
  curriculumStructureHasContent,
  draftFromCurriculumStructure,
} from '../../lib/subjectUnitsEditorDraft';
import ManualCurriculumBuilderModal from '../ManualCurriculumBuilderModal';
import { useToast } from '../Toast';
import Dropdown, { DropdownItem } from '../ui/Dropdown';
import { WebDragHandle, WebDropView, readWebDragPayload, writeWebDragPayload } from '../ui/webDragDrop';
import ClassworkPlanningModal from './ClassworkPlanningModal';
import ScheduleLessonModal from './ScheduleLessonModal';
import { dispatchOpenLearningDayModal } from '../../lib/planner/learningDayModalNavigation';
import { OPEN_SUBJECT_CLASSWORK_SCHEDULE_ALL } from '../../lib/subjectClassworkActions';
import {
  CLASSWORK_FG,
  CLASSWORK_MUTED,
  CLASSWORK_BORDER,
  CLASSWORK_BG,
  CLASSWORK_LINK,
  CLASSWORK_LEAGUE_FONT,
  CLASSWORK_BODY_FONT,
} from '../../lib/classworkPanelTheme';

const ASSIGNMENT_PLACEMENT_DRAG_MIME = 'application/x-learnadoodle-assignment-placement';
const CLASSWORK_LESSON_DRAG_MIME = 'application/x-learnadoodle-classwork-lesson-placement';

function readAssignmentDragPayload(ev) {
  return readWebDragPayload(
    ev,
    ASSIGNMENT_PLACEMENT_DRAG_MIME,
    (payload) => !!payload?.assignmentId,
  );
}

function readLessonDragPayload(ev) {
  return readWebDragPayload(
    ev,
    CLASSWORK_LESSON_DRAG_MIME,
    (payload) => !!payload?.lessonId,
  );
}

function dropTargetWebProps({ onDrop }) {
  if (!onDrop) return {};
  return {
    onDragOver: (ev) => {
      if (ev?.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    },
    onDrop: (ev) => {
      const payload = readAssignmentDragPayload(ev);
      if (payload) onDrop(payload);
    },
  };
}

function lessonDropTargetWebProps({ onDrop, onDragEnter, onDragLeave }) {
  if (!onDrop) return {};
  return {
    onDragOver: (ev) => {
      if (ev?.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    },
    onDragEnter,
    onDragLeave,
    onDrop: (ev) => {
      const payload = readLessonDragPayload(ev);
      if (payload) onDrop(payload);
    },
  };
}

function ClassworkUnitCard({
  title,
  lessonCount = null,
  subtitle = null,
  expanded = true,
  onToggleExpand = null,
  children,
  dropActive = false,
  dropWebProps = {},
}) {
  const showChevron = !!onToggleExpand;
  const countLabel = subtitle ?? (
    lessonCount == null
      ? null
      : `${lessonCount} ${lessonCount === 1 ? 'lesson' : 'lessons'}`
  );
  const { style: dropStyle, onDragOver, onDragEnter, onDragLeave, onDrop, ...restDropWebProps } = dropWebProps;

  return (
    <View style={styles.sectionBlock}>
      <WebDropView
        style={[
          styles.unitCard,
          dropActive && styles.unitCardDropActive,
          dropStyle,
        ]}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        {...restDropWebProps}
      >
        <View style={styles.unitHeaderRow}>
          {showChevron ? (
            <TouchableOpacity
              onPress={onToggleExpand}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              style={styles.chevronBtn}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              {expanded ? (
                <ChevronUp size={18} color={CLASSWORK_MUTED} />
              ) : (
                <ChevronDown size={18} color={CLASSWORK_MUTED} />
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.chevronSpacer} />
          )}
          <View style={styles.unitHeaderBody}>
            <Text style={styles.unitTitleText} numberOfLines={2}>
              {title}
            </Text>
            {countLabel ? (
              <Text style={styles.unitSubtitle}>{countLabel}</Text>
            ) : null}
          </View>
        </View>
        {expanded ? (
          <View style={styles.unitLessonsWrap}>
            {children}
          </View>
        ) : null}
      </WebDropView>
    </View>
  );
}

function LessonPeerRow({
  lesson,
  unit,
  isParentViewer,
  onEditLesson,
  onDeleteLesson,
  onScheduleLesson,
  highlighted = false,
  rowRef,
  isFirst = true,
  dragging = false,
  dropActive = false,
  onDragEnterLesson,
  onDragLeaveLesson,
  onDragStartLesson,
  onLessonDrop,
}) {
  const menuBtnRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const showLessonMenu = isParentViewer && lesson.lessonId;
  const canDrag = isParentViewer && Platform.OS === 'web' && lesson.lessonId;
  const lessonDropHandlers = lessonDropTargetWebProps({
    onDrop: onLessonDrop,
    onDragEnter: onDragEnterLesson,
    onDragLeave: onDragLeaveLesson,
  });
  const handleLessonDragStart = useCallback((ev) => {
    onDragStartLesson?.(lesson.lessonId);
    writeWebDragPayload(ev, CLASSWORK_LESSON_DRAG_MIME, {
      lessonId: String(lesson.lessonId),
      fromUnitId: unit?.unitId ?? null,
    });
  }, [lesson.lessonId, unit?.unitId, onDragStartLesson]);

  return (
    <WebDropView
      ref={rowRef}
      style={[
        styles.lessonRow,
        !isFirst && styles.lessonRowBorder,
        highlighted && styles.lessonRowHighlight,
        dropActive && styles.lessonRowDropActive,
        menuOpen && Platform.OS === 'web' && styles.lessonRowMenuOpen,
      ]}
      onDragOver={lessonDropHandlers.onDragOver}
      onDragEnter={lessonDropHandlers.onDragEnter}
      onDragLeave={lessonDropHandlers.onDragLeave}
      onDrop={lessonDropHandlers.onDrop}
    >
      <View style={[styles.lessonRowInner, dragging && styles.lessonRowDragging]}>
        {canDrag ? (
          <WebDragHandle
            enabled={canDrag}
            onDragStart={handleLessonDragStart}
            style={styles.gripHandle}
            accessibilityLabel="Drag lesson to another unit"
          >
            <GripVertical size={16} color={CLASSWORK_MUTED} />
          </WebDragHandle>
        ) : (
          <View style={styles.gripSpacer} />
        )}
        <Text style={styles.lessonBullet}>•</Text>
        <View style={styles.lessonTitleField}>
          <Text style={styles.lessonTitleText} numberOfLines={2}>
            {lesson.title || 'Lesson'}
          </Text>
          {lesson.schedule?.dateLabel ? (
            <Text style={styles.rowMeta} numberOfLines={1}>
              {lesson.schedule.dateLabel}
            </Text>
          ) : isParentViewer && onScheduleLesson ? (
            <TouchableOpacity
              onPress={() => onScheduleLesson?.({ lesson, unit })}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Schedule ${lesson.title || 'lesson'}`}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={[styles.rowMetaMuted, styles.lessonScheduleLink]} numberOfLines={1}>
                Not scheduled
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.rowMetaMuted} numberOfLines={1}>
              Not scheduled
            </Text>
          )}
        </View>
        {showLessonMenu ? (
          <View style={styles.menuAnchor}>
            <TouchableOpacity
              ref={menuBtnRef}
              onPress={() => setMenuOpen((open) => !open)}
              style={styles.iconBtn}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <MoreVertical size={16} color={CLASSWORK_MUTED} />
            </TouchableOpacity>
            <Dropdown
              visible={menuOpen}
              triggerRef={menuBtnRef}
              onClose={() => setMenuOpen(false)}
              placement="bottom-end"
              width={240}
              offset={6}
              variant="context"
            >
              <DropdownItem
                label="Edit"
                variant="context"
                onPress={() => {
                  setMenuOpen(false);
                  onEditLesson?.({ lesson, unit });
                }}
              />
              <DropdownItem
                label="Delete"
                variant="context"
                danger
                onPress={() => {
                  setMenuOpen(false);
                  onDeleteLesson?.({ lesson, unit });
                }}
              />
            </Dropdown>
          </View>
        ) : null}
      </View>
    </WebDropView>
  );
}

function AssignmentPeerRow({
  assignment,
  attachedLessonTitle,
  learningDay = null,
  isParentViewer,
  onOpen,
  onMoveToUnit,
  onDeleteAssignment,
  unitOptions = [],
  highlighted = false,
  rowRef,
  isFirst = true,
  fromUnitId = null,
  fromLessonId = null,
  dragging = false,
  onDragStartAssignment,
}) {
  const menuBtnRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const dueLine = formatDueShort(assignment.due_date);
  const scheduleLine = dueLine
    || (learningDay?.dateLabel ? `Scheduled ${learningDay.dateLabel}` : null);
  const subtitleLine = scheduleLine
    || (isParentViewer ? 'Set due date in edit' : 'No date');
  const canDrag = isParentViewer && Platform.OS === 'web';
  const showAssignmentMenu = isParentViewer && assignment?.id;

  const moveTargets = useMemo(() => {
    const targets = [];
    if (fromUnitId != null && String(fromUnitId).trim()) {
      targets.push({ id: null, title: 'No unit' });
    }
    (unitOptions || []).forEach((unit) => {
      if (String(unit.id) !== String(fromUnitId || '')) {
        targets.push(unit);
      }
    });
    return targets;
  }, [fromUnitId, unitOptions]);

  const handleAssignmentDragStart = useCallback((ev) => {
    if (!assignment?.id) return;
    onDragStartAssignment?.(assignment.id);
    writeWebDragPayload(ev, ASSIGNMENT_PLACEMENT_DRAG_MIME, {
      assignmentId: String(assignment.id),
      fromUnitId,
      fromLessonId,
    });
  }, [assignment?.id, fromUnitId, fromLessonId, onDragStartAssignment]);

  return (
    <View
      ref={rowRef}
      style={[
        styles.lessonRow,
        !isFirst && styles.lessonRowBorder,
        highlighted && styles.lessonRowHighlight,
        menuOpen && Platform.OS === 'web' && styles.lessonRowMenuOpen,
      ]}
    >
      <View style={[styles.lessonRowInner, styles.lessonRowInnerTop, dragging && styles.lessonRowDragging]}>
        {canDrag && assignment?.id ? (
          <WebDragHandle
            enabled={canDrag}
            onDragStart={handleAssignmentDragStart}
            style={styles.gripHandle}
            accessibilityLabel="Drag assignment to another unit"
          >
            <GripVertical size={16} color={CLASSWORK_MUTED} />
          </WebDragHandle>
        ) : (
          <View style={styles.gripSpacer} />
        )}
        <View style={styles.assignmentIconWrap}>
          <FileText size={14} color="#5F6368" />
        </View>
        <View style={styles.lessonTitleField}>
          <Text style={styles.lessonTitleText} numberOfLines={2}>
            {assignment.title || 'Assignment'}
          </Text>
          <Text
            style={scheduleLine ? styles.rowMeta : styles.rowMetaMuted}
            numberOfLines={1}
          >
            {subtitleLine}
          </Text>
          {isParentViewer ? (
            <TouchableOpacity
              onPress={() => onOpen?.(assignment)}
              hitSlop={6}
              accessibilityRole="link"
              accessibilityLabel={`Open assignment ${assignment.title || ''}`}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.peerAction}>Open assignment</Text>
            </TouchableOpacity>
          ) : null}
          {attachedLessonTitle ? (
            <Text style={styles.rowMetaMuted} numberOfLines={1}>
              {attachedLessonTitle}
            </Text>
          ) : null}
        </View>
        {showAssignmentMenu ? (
          <View style={styles.menuAnchor}>
              <TouchableOpacity
                ref={menuBtnRef}
                onPress={() => setMenuOpen((open) => !open)}
                style={styles.iconBtn}
                accessibilityLabel="Assignment actions"
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <MoreVertical size={16} color={CLASSWORK_MUTED} />
              </TouchableOpacity>
              <Dropdown
                visible={menuOpen}
                triggerRef={menuBtnRef}
                onClose={() => setMenuOpen(false)}
                placement="bottom-end"
                width={240}
                offset={6}
                variant="context"
              >
                {moveTargets.map((unit) => (
                  <DropdownItem
                    key={unit.id != null ? String(unit.id) : 'no-unit'}
                    label={unit.id != null ? `Move to ${unit.title}` : 'Move to no unit'}
                    variant="context"
                    onPress={() => {
                      setMenuOpen(false);
                      onMoveToUnit?.({
                        assignment,
                        unitId: unit.id,
                        unitTitle: unit.title,
                      });
                    }}
                  />
                ))}
                <DropdownItem
                  label="Delete assignment"
                  variant="context"
                  danger
                  onPress={() => {
                    setMenuOpen(false);
                    onDeleteAssignment?.(assignment);
                  }}
                />
              </Dropdown>
            </View>
        ) : null}
      </View>
    </View>
  );
}

function ScheduledClassDaysBucket({ days = [], onOpenDay }) {
  const [expanded, setExpanded] = useState(false);
  if (!days.length) return null;

  const sessionLabel = `${days.length} ${days.length === 1 ? 'session' : 'sessions'}`;

  return (
    <View style={styles.sectionBlock}>
      <View style={styles.unitCard}>
        <View style={styles.unitHeaderRow}>
          <TouchableOpacity
            onPress={() => setExpanded((value) => !value)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            style={styles.chevronBtn}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={`Scheduled class days, ${sessionLabel}`}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            {expanded ? (
              <ChevronUp size={18} color={CLASSWORK_MUTED} />
            ) : (
              <ChevronDown size={18} color={CLASSWORK_MUTED} />
            )}
          </TouchableOpacity>
          <View style={styles.unitHeaderBody}>
            <Text style={styles.unitTitleText} numberOfLines={2}>
              Scheduled class days
            </Text>
            <Text style={styles.unitSubtitle}>{sessionLabel}</Text>
          </View>
        </View>
        {expanded ? (
          <View style={styles.unitLessonsWrap}>
            <View style={styles.timelineList}>
              {days.map((row, index) => (
                <TouchableOpacity
                  key={String(row.eventId || index)}
                  style={[styles.lessonRow, index > 0 && styles.lessonRowBorder]}
                  onPress={() => onOpenDay?.(row.event)}
                  accessibilityLabel={`Open learning day ${row.dateLabel || ''}`}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <View style={styles.lessonRowInner}>
                    <Text style={styles.lessonBullet}>•</Text>
                    <View style={styles.lessonTitleField}>
                      <Text style={styles.lessonTitleText} numberOfLines={2}>
                        {row.dateLabel || 'Upcoming session'}
                      </Text>
                      <Text style={styles.rowMetaMuted} numberOfLines={1}>
                        No lesson planned
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ClassworkPanelHeader({
  actionLabel,
  onAction,
  showAction = false,
  secondaryActionLabel,
  onSecondaryAction,
  showSecondaryAction = false,
}) {
  return (
    <View style={styles.panelToolbar}>
      <Text style={styles.panelTitle}>Classwork</Text>
      {(showAction || showSecondaryAction) ? (
        <View style={styles.panelActions}>
          {showAction ? (
            <TouchableOpacity
              style={styles.panelActionBtn}
              onPress={onAction}
              accessibilityLabel={actionLabel}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Plus size={18} color="#334155" strokeWidth={2.25} />
              <Text style={styles.panelActionBtnText}>{actionLabel}</Text>
            </TouchableOpacity>
          ) : null}
          {showSecondaryAction ? (
            <TouchableOpacity
              style={styles.panelActionBtn}
              onPress={onSecondaryAction}
              accessibilityLabel={secondaryActionLabel}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Plus size={18} color="#334155" strokeWidth={2.25} />
              <Text style={styles.panelActionBtnText}>{secondaryActionLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function EmptyClassworkState({ isParentViewer }) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyHeading}>No classwork yet</Text>
      <Text style={styles.emptySubtext}>
        {isParentViewer
          ? 'Add units and lessons, or create an assignment to get started.'
          : 'Assignments and lessons will appear here.'}
      </Text>
    </View>
  );
}

function EmptyUnitsState({ onAddUnit }) {
  return (
    <View style={styles.emptyUnitsWrap}>
      <Text style={styles.emptyHeading}>No units yet</Text>
      <Text style={styles.emptySubtext}>
        Add units to organize lessons and assignments for this subject.
      </Text>
      <TouchableOpacity
        style={styles.emptyUnitsButton}
        onPress={onAddUnit}
        accessibilityLabel="Add unit"
        activeOpacity={0.85}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <Plus size={18} color="#334155" strokeWidth={2.25} />
        <Text style={styles.actionPillBtnText}>Add unit</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function SubjectClassworkSection({
  units = [],
  assignments = [],
  events = [],
  familyId,
  subjectId,
  subjectName,
  isParentViewer = true,
  onOpenAssignment,
  onManageUnits,
  unitsActionLabel = 'Add units',
  onCreateAssignment = null,
  onPlacementChanged,
  highlightLessonId = null,
  highlightAssignmentId = null,
  onSchedulingAllChange = null,
  inlineUnitsEditing = false,
}) {
  const toast = useToast();
  const model = useMemo(
    () => buildSubjectClassworkModel({ units, assignments, events }),
    [units, assignments, events],
  );
  const totalLessonCount = useMemo(
    () => (units || []).reduce(
      (sum, unit) => sum + (unit?.lessons || []).filter((lesson) => lesson?.id != null).length,
      0,
    ),
    [units],
  );
  const [schedulingAll, setSchedulingAll] = useState(false);

  useEffect(() => {
    onSchedulingAllChange?.(schedulingAll);
  }, [schedulingAll, onSchedulingAllChange]);
  const [draggingAssignmentId, setDraggingAssignmentId] = useState(null);
  const [draggingLessonId, setDraggingLessonId] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [dragOverLessonTarget, setDragOverLessonTarget] = useState(null);
  const [movingPlacement, setMovingPlacement] = useState(false);
  const [movingLesson, setMovingLesson] = useState(false);
  const [expandedUnits, setExpandedUnits] = useState(() => new Set());
  const [scheduleModal, setScheduleModal] = useState({
    visible: false,
    title: 'Schedule all lessons',
    message: '',
    scheduleLines: [],
    showConfirm: false,
    confirmLabel: 'Schedule lessons',
    cancelLabel: 'Close',
    working: false,
    mode: 'info',
  });
  const [scheduleLessonModal, setScheduleLessonModal] = useState({
    visible: false,
    lesson: null,
    unitTitle: '',
  });
  const lessonRowRefs = useRef({});
  const assignmentRowRefs = useRef({});
  const hasUnitsContent = useMemo(
    () => curriculumStructureHasContent({ units }),
    [units],
  );
  const [inlineUnitsStarted, setInlineUnitsStarted] = useState(hasUnitsContent);

  useEffect(() => {
    if (hasUnitsContent) setInlineUnitsStarted(true);
  }, [hasUnitsContent]);

  const useInlineUnitsEditor = inlineUnitsEditing && isParentViewer;
  const showEmbeddedUnitsEditor = useInlineUnitsEditor && inlineUnitsStarted;

  const startInlineUnitsEditing = useCallback(() => {
    setInlineUnitsStarted(true);
  }, []);

  const handleOpenLearningDay = useCallback((event) => {
    if (!event?.id) return;
    dispatchOpenLearningDayModal({ event, eventId: event.id });
  }, []);

  const handleScheduleLesson = useCallback(({ lesson, unit }) => {
    if (!lesson?.lessonId) return;
    setScheduleLessonModal({
      visible: true,
      lesson,
      unitTitle: unit?.title || unit?.unitTitle || '',
    });
  }, []);

  const closeScheduleLessonModal = useCallback(() => {
    setScheduleLessonModal({ visible: false, lesson: null, unitTitle: '' });
  }, []);

  const unitIdsKey = useMemo(
    () => model.units.map((unit) => String(unit.unitId)).join('|'),
    [model.units],
  );

  useEffect(() => {
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      model.units.forEach((unit) => next.add(String(unit.unitId)));
      if (model.noUnitAssignments.length > 0) next.add('no-unit');
      return next;
    });
  }, [unitIdsKey, model.units, model.noUnitAssignments.length]);

  const closeScheduleModal = useCallback(() => {
    if (schedulingAll) return;
    setScheduleModal({
      visible: false,
      title: 'Schedule all lessons',
      message: '',
      scheduleLines: [],
      showConfirm: false,
      confirmLabel: 'Schedule lessons',
      cancelLabel: 'Close',
      working: false,
      mode: 'info',
    });
  }, [schedulingAll]);

  const openScheduleAllModal = useCallback(() => {
    if (!familyId || !subjectId || schedulingAll) return;
    const count = model.unscheduledLessonCount;
    if (count <= 0) {
      if (totalLessonCount <= 0) {
        setScheduleModal({
          visible: true,
          title: 'Schedule all lessons',
          message: 'Add units and lessons first. This will place each lesson on the next open learning day on your planner.',
          scheduleLines: [],
          showConfirm: false,
          confirmLabel: 'OK',
          cancelLabel: 'Close',
          working: false,
          mode: 'info',
        });
      } else {
        setScheduleModal({
          visible: true,
          title: 'Schedule all lessons',
          message: 'All curriculum lessons are already linked to learning days on your planner.',
          scheduleLines: [],
          showConfirm: false,
          confirmLabel: 'OK',
          cancelLabel: 'Close',
          working: false,
          mode: 'info',
        });
      }
      return;
    }
    const previewLimit = Math.max(model.unscheduledLessonCount, 20);
    const preview = buildLessonSchedulePreview({
      subjectEvents: events,
      units,
      limit: previewLimit,
    });
    const scheduleLines = preview.map((row) => formatLessonSchedulePreviewLine(row));
    const messageParts = [
      `${count} lesson${count === 1 ? '' : 's'} ${count === 1 ? 'is' : 'are'} not scheduled yet.`,
      '',
      'Each lesson will be linked to the next open learning day for this subject, in unit order.',
    ];
    if (scheduleLines.length < count) {
      messageParts.push(
        '',
        `Only ${scheduleLines.length} open learning day${scheduleLines.length === 1 ? '' : 's'} ${scheduleLines.length === 1 ? 'is' : 'are'} available. Any remaining lessons will stay unscheduled until you add more sessions.`,
      );
    }
    if (scheduleLines.length === 0) {
      setScheduleModal({
        visible: true,
        title: 'Schedule all lessons',
        message: 'No open learning days are available for this subject. Use Gap analysis to add sessions or extend your school year.',
        scheduleLines: [],
        showConfirm: false,
        confirmLabel: 'OK',
        cancelLabel: 'Close',
        working: false,
        mode: 'info',
      });
      return;
    }
    setScheduleModal({
      visible: true,
      title: 'Schedule all lessons',
      message: messageParts.join('\n'),
      scheduleLines,
      showConfirm: true,
      confirmLabel: 'Schedule lessons',
      cancelLabel: 'Cancel',
      working: false,
      mode: 'schedule',
    });
  }, [familyId, subjectId, schedulingAll, model.unscheduledLessonCount, totalLessonCount, events, units]);

  const confirmScheduleAllModal = useCallback(async () => {
    if (scheduleModal.mode === 'done' || scheduleModal.mode === 'info' || !scheduleModal.showConfirm) {
      closeScheduleModal();
      return;
    }
    setScheduleModal((prev) => ({ ...prev, working: true }));
    setSchedulingAll(true);
    try {
      const { assigned, scheduled = [] } = await autoAssignLessonsToUnlinkedEvents({
        familyId,
        subjectId,
        subjectEvents: events,
        units,
        limit: Math.max(model.unscheduledLessonCount, 20),
      });
      if (assigned > 0) {
        onPlacementChanged?.();
        const scheduleLines = scheduled.map((row) => formatLessonSchedulePreviewLine(row));
        setScheduleModal({
          visible: true,
          title: 'Lessons scheduled',
          message: `Scheduled ${assigned} lesson${assigned === 1 ? '' : 's'} on upcoming learning days.`,
          scheduleLines,
          showConfirm: true,
          confirmLabel: 'Done',
          cancelLabel: 'Close',
          working: false,
          mode: 'done',
        });
      } else {
        setScheduleModal({
          visible: true,
          title: 'Schedule all lessons',
          message: 'No open learning days are available for this subject. Use Gap analysis to add sessions or extend your school year.',
          scheduleLines: [],
          showConfirm: false,
          confirmLabel: 'OK',
          cancelLabel: 'Close',
          working: false,
          mode: 'info',
        });
      }
    } catch (err) {
      setScheduleModal({
        visible: true,
        title: 'Could not schedule lessons',
        message: err?.message || 'Something went wrong.',
        scheduleLines: [],
        showConfirm: false,
        confirmLabel: 'OK',
        cancelLabel: 'Close',
        working: false,
        mode: 'info',
      });
    } finally {
      setSchedulingAll(false);
    }
  }, [
    scheduleModal.mode,
    scheduleModal.showConfirm,
    familyId,
    subjectId,
    events,
    units,
    model.unscheduledLessonCount,
    closeScheduleModal,
    onPlacementChanged,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !subjectId) return undefined;
    const handler = (event) => {
      const detail = event.detail || {};
      if (String(detail.subjectId || '') !== String(subjectId)) return;
      openScheduleAllModal();
    };
    window.addEventListener(OPEN_SUBJECT_CLASSWORK_SCHEDULE_ALL, handler);
    return () => window.removeEventListener(OPEN_SUBJECT_CLASSWORK_SCHEDULE_ALL, handler);
  }, [subjectId, openScheduleAllModal]);

  const handleEditLesson = useCallback(() => {
    onManageUnits?.();
  }, [onManageUnits]);

  const handleDeleteLesson = useCallback(({ lesson }) => {
    if (!lesson?.lessonId || !familyId || !subjectId) return;
    const lessonTitle = lesson.title || 'this lesson';
    const runDelete = async () => {
      try {
        await deleteLessonFromSubjectCurriculum({
          familyId,
          subjectId,
          subjectName: subjectName || 'Subject',
          units,
          lessonId: lesson.lessonId,
        });
        toast.push('Lesson deleted', 'success');
        onPlacementChanged?.();
      } catch (err) {
        toast.push(err?.message || 'Could not delete lesson', 'error');
      }
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm(`Delete "${lessonTitle}"? This cannot be undone.`);
      if (confirmed) runDelete();
      return;
    }
    Alert.alert(
      'Delete lesson',
      `Delete "${lessonTitle}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: runDelete },
      ],
    );
  }, [familyId, subjectId, subjectName, units, toast, onPlacementChanged]);

  const unitMoveOptions = useMemo(
    () => (units || [])
      .map((unit) => ({
        id: unit?.unitId || unit?.id || null,
        title: unit?.title || unit?.unitTitle || 'Unit',
      }))
      .filter((unit) => unit.id),
    [units],
  );

  const findAssignmentById = useCallback((assignmentId) => {
    return (assignments || []).find((a) => String(a?.id) === String(assignmentId)) || null;
  }, [assignments]);

  const moveAssignmentPlacement = useCallback(async ({
    assignmentId,
    unitId = null,
    lessonId = null,
    lessonTitle = null,
    unitTitle = null,
  }) => {
    const assignment = findAssignmentById(assignmentId);
    if (!assignment?.id || movingPlacement) return;
    setMovingPlacement(true);
    try {
      await updateAssignmentPlacement({
        assignmentId: assignment.id,
        familyId,
        unitId,
        lessonId,
        lessonTitle,
        unitTitle,
        linkedEventIds: assignment.linked_event_ids,
      });
      toast.push('Assignment moved', 'success');
      onPlacementChanged?.();
    } catch (err) {
      toast.push(err?.message || 'Could not move assignment', 'error');
    } finally {
      setMovingPlacement(false);
      setDraggingAssignmentId(null);
      setDragOverTarget(null);
    }
  }, [findAssignmentById, movingPlacement, familyId, toast, onPlacementChanged]);

  const handleMoveAssignmentToUnit = useCallback(({ assignment, unitId, unitTitle }) => {
    if (!assignment?.id) return;
    moveAssignmentPlacement({
      assignmentId: assignment.id,
      unitId,
      unitTitle,
      lessonId: null,
      lessonTitle: null,
    });
  }, [moveAssignmentPlacement]);

  const handleDeleteAssignment = useCallback((assignment) => {
    if (!assignment?.id || !familyId) return;
    const eventId = resolveLinkedEventIdFromAssignment(assignment);
    if (!eventId) {
      toast.push('Could not delete assignment', 'error');
      return;
    }
    const assignmentTitle = assignment.title || 'this assignment';
    const runDelete = async () => {
      try {
        await deleteAssignmentAndEvent({ eventId, familyId, subjectId });
        toast.push('Assignment deleted', 'success');
        onPlacementChanged?.();
      } catch (err) {
        toast.push(err?.message || 'Could not delete assignment', 'error');
      }
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm(`Delete "${assignmentTitle}"? This cannot be undone.`);
      if (confirmed) runDelete();
      return;
    }
    Alert.alert(
      'Delete assignment',
      `Delete "${assignmentTitle}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: runDelete },
      ],
    );
  }, [familyId, subjectId, toast, onPlacementChanged]);

  const handleUnitDrop = useCallback((unitId, unitTitle) => (payload) => {
    if (!payload?.assignmentId) return;
    const fromUnitId = payload.fromUnitId != null ? String(payload.fromUnitId) : null;
    const targetUnitId = unitId != null ? String(unitId) : null;
    if (fromUnitId === targetUnitId && !payload.fromLessonId) return;
    moveAssignmentPlacement({
      assignmentId: payload.assignmentId,
      unitId: targetUnitId,
      lessonId: null,
      unitTitle,
    });
  }, [moveAssignmentPlacement]);

  const handleAssignmentDragStart = useCallback((assignmentId) => {
    setDraggingAssignmentId(String(assignmentId));
  }, []);

  const handleLessonDragStart = useCallback((lessonId) => {
    setDraggingLessonId(String(lessonId));
  }, []);

  const moveLessonPlacement = useCallback(async ({
    lessonId,
    toUnitId,
    beforeLessonId = null,
  }) => {
    if (!lessonId || toUnitId == null || movingLesson) return;
    const fromLoc = (units || []).flatMap((unit, unitIndex) => (
      (unit?.lessons || []).map((lesson) => ({
        lessonId: lesson?.id,
        unitId: unit?.id != null ? String(unit.id) : `idx-${unitIndex}`,
      }))
    )).find((row) => String(row.lessonId) === String(lessonId));
    if (
      fromLoc
      && String(fromLoc.unitId) === String(toUnitId)
      && (beforeLessonId == null || String(fromLoc.lessonId) === String(beforeLessonId))
    ) {
      return;
    }
    setMovingLesson(true);
    try {
      await moveLessonInSubjectCurriculum({
        familyId,
        subjectId,
        subjectName: subjectName || 'Subject',
        units,
        lessonId,
        toUnitId,
        beforeLessonId,
      });
      toast.push('Lesson moved', 'success');
      onPlacementChanged?.();
    } catch (err) {
      toast.push(err?.message || 'Could not move lesson', 'error');
    } finally {
      setMovingLesson(false);
      setDraggingLessonId(null);
      setDragOverLessonTarget(null);
    }
  }, [
    familyId,
    subjectId,
    subjectName,
    units,
    movingLesson,
    toast,
    onPlacementChanged,
  ]);

  const handleLessonDropOnRow = useCallback((unit, beforeLessonId) => (payload) => {
    if (!payload?.lessonId) return;
    if (beforeLessonId != null && String(payload.lessonId) === String(beforeLessonId)) return;
    moveLessonPlacement({
      lessonId: payload.lessonId,
      toUnitId: unit?.unitId,
      beforeLessonId,
    });
  }, [moveLessonPlacement]);

  const handleLessonDropEnd = useCallback((unit) => (payload) => {
    if (!payload?.lessonId) return;
    moveLessonPlacement({
      lessonId: payload.lessonId,
      toUnitId: unit?.unitId,
      beforeLessonId: null,
    });
  }, [moveLessonPlacement]);

  const toggleUnitExpanded = useCallback((unitId) => {
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      const key = String(unitId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const clearDrag = () => {
      setDraggingAssignmentId(null);
      setDraggingLessonId(null);
      setDragOverTarget(null);
      setDragOverLessonTarget(null);
    };
    window.addEventListener('dragend', clearDrag);
    return () => window.removeEventListener('dragend', clearDrag);
  }, []);

  useEffect(() => {
    if (!highlightLessonId && !highlightAssignmentId) return undefined;
    const t = setTimeout(() => {
      const lessonRef = highlightLessonId ? lessonRowRefs.current[highlightLessonId] : null;
      const assignmentRef = highlightAssignmentId ? assignmentRowRefs.current[highlightAssignmentId] : null;
      const node = lessonRef || assignmentRef;
      if (node && typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 280);
    return () => clearTimeout(t);
  }, [highlightLessonId, highlightAssignmentId, model]);

  const noUnitItems = useMemo(
    () => buildNoUnitPeerItems(model.noUnitAssignments, model.eventById),
    [model.noUnitAssignments, model.eventById],
  );

  const unitsDraft = useMemo(
    () => draftFromCurriculumStructure({ units }),
    [units],
  );

  const lessonScheduleByLessonId = useMemo(() => {
    const map = {};
    (model.units || []).forEach((unit) => {
      (unit?.lessons || []).forEach((lesson) => {
        if (lesson?.lessonId) {
          map[String(lesson.lessonId)] = lesson.schedule?.dateLabel || null;
        }
      });
    });
    return map;
  }, [model.units]);

  const getLessonScheduleLabel = useCallback((lessonId) => {
    if (!lessonId) return null;
    return lessonScheduleByLessonId[String(lessonId)] || null;
  }, [lessonScheduleByLessonId]);

  const getUnitDropWebProps = useCallback((unitIdx) => {
    const unit = model.units?.[unitIdx];
    if (!unit) return {};
    const dropKey = `unit-${unit.unitId}`;
    return {
      ...dropTargetWebProps({
        onDrop: handleUnitDrop(unit.unitId, unit.title),
        isActive: dragOverTarget === dropKey,
      }),
      ...(Platform.OS === 'web' ? {
        onDragEnter: () => setDragOverTarget(dropKey),
        onDragLeave: (ev) => {
          if (!ev?.currentTarget?.contains?.(ev?.relatedTarget)) {
            setDragOverTarget((prev) => (prev === dropKey ? null : prev));
          }
        },
        ...(dragOverTarget === dropKey ? { style: styles.unitCardDropActive } : {}),
      } : {}),
    };
  }, [model.units, dragOverTarget, handleUnitDrop]);

  const renderAssignmentRows = useCallback((assignmentItems, unit, { fromLessonId = null } = {}) => {
    if (!assignmentItems.length) return null;
    return assignmentItems.map((item, index) => (
      <AssignmentPeerRow
        key={item.assignment.id}
        assignment={item.assignment}
        attachedLessonTitle={item.attachedLessonTitle}
        learningDay={item.learningDay}
        isParentViewer={isParentViewer}
        onOpen={onOpenAssignment}
        onMoveToUnit={handleMoveAssignmentToUnit}
        onDeleteAssignment={handleDeleteAssignment}
        unitOptions={unitMoveOptions}
        highlighted={String(highlightAssignmentId || '') === String(item.assignment.id)}
        isFirst={index === 0}
        fromUnitId={unit?.unitId}
        fromLessonId={fromLessonId ?? item.attachedLessonId}
        dragging={String(draggingAssignmentId || '') === String(item.assignment.id)}
        onDragStartAssignment={handleAssignmentDragStart}
        rowRef={(node) => {
          if (node && item.assignment?.id) {
            assignmentRowRefs.current[String(item.assignment.id)] = node;
          }
        }}
      />
    ));
  }, [
    isParentViewer,
    onOpenAssignment,
    handleMoveAssignmentToUnit,
    handleDeleteAssignment,
    unitMoveOptions,
    highlightAssignmentId,
    draggingAssignmentId,
    handleAssignmentDragStart,
  ]);

  const renderLessonAssignments = useCallback((unitIdx, lessonIdx) => {
    const unit = model.units?.[unitIdx];
    const lesson = unit?.lessons?.[lessonIdx];
    if (!lesson?.assignments?.length) return null;
    const items = lesson.assignments.map((assignment) => ({
      assignment,
      attachedLessonTitle: lesson.title,
      attachedLessonId: lesson.lessonId,
      learningDay: resolveAssignmentLearningDay(assignment, model.eventById),
    }));
    return (
      <View style={styles.lessonAssignmentsWrap}>
        {renderAssignmentRows(items, unit, { fromLessonId: lesson.lessonId })}
      </View>
    );
  }, [model.units, model.eventById, renderAssignmentRows]);

  const renderUnitLevelAssignments = useCallback((unitIdx) => {
    const unit = model.units?.[unitIdx];
    if (!unit?.unitAssignments?.length) return null;
    const items = unit.unitAssignments.map((assignment) => ({
      assignment,
      attachedLessonTitle: null,
      attachedLessonId: null,
      learningDay: resolveAssignmentLearningDay(assignment, model.eventById),
    }));
    return (
      <View style={styles.unitAssignmentsWrap}>
        {renderAssignmentRows(items, unit)}
      </View>
    );
  }, [model.units, model.eventById, renderAssignmentRows]);

  const hasNoUnitAssignments = model.noUnitAssignments.length > 0;
  const hasScheduledEmptyDays = (model.unlinkedLearningDays || []).length > 0;
  const hasVisibleContent = hasNoUnitAssignments
    || hasUnitsContent
    || showEmbeddedUnitsEditor
    || hasScheduledEmptyDays;

  if (!hasVisibleContent) {
    return (
      <View style={[styles.root, styles.rootExpanded]}>
        <ClassworkPanelHeader
          showAction={isParentViewer && !!onManageUnits}
          actionLabel={unitsActionLabel}
          onAction={onManageUnits}
          showSecondaryAction={isParentViewer && !!onCreateAssignment}
          secondaryActionLabel="Add assignment"
          onSecondaryAction={onCreateAssignment}
        />
        <ScrollView
          style={styles.panelScroll}
          contentContainerStyle={styles.wrap}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {hasScheduledEmptyDays ? (
            <ScheduledClassDaysBucket
              days={model.unlinkedLearningDays}
              onOpenDay={handleOpenLearningDay}
            />
          ) : null}
          {isParentViewer ? (
            <EmptyUnitsState onAddUnit={startInlineUnitsEditing} />
          ) : (
            <EmptyClassworkState isParentViewer={isParentViewer} />
          )}
        </ScrollView>
        <ClassworkPlanningModal
          visible={scheduleModal.visible}
          title={scheduleModal.title}
          message={scheduleModal.message}
          scheduleLines={scheduleModal.scheduleLines}
          scheduleLinesHeading={scheduleModal.mode === 'done' ? 'Scheduled on' : 'Learning days'}
          working={scheduleModal.working}
          showConfirm={scheduleModal.showConfirm}
          confirmLabel={scheduleModal.confirmLabel}
          cancelLabel={scheduleModal.cancelLabel}
          onConfirm={confirmScheduleAllModal}
          onCancel={closeScheduleModal}
        />
        <ScheduleLessonModal
          visible={scheduleLessonModal.visible}
          onClose={closeScheduleLessonModal}
          lesson={scheduleLessonModal.lesson}
          unitTitle={scheduleLessonModal.unitTitle}
          subjectName={subjectName}
          familyId={familyId}
          subjectId={subjectId}
          events={events}
          onScheduled={() => {
            closeScheduleLessonModal();
            onPlacementChanged?.();
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, styles.rootExpanded]}>
      <ClassworkPanelHeader
        showAction={isParentViewer && !!onManageUnits}
        actionLabel={unitsActionLabel}
        onAction={onManageUnits}
        showSecondaryAction={isParentViewer && !!onCreateAssignment}
        secondaryActionLabel="Add assignment"
        onSecondaryAction={onCreateAssignment}
      />
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.wrap}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
      {model.unlinkedLearningDays?.length > 0 ? (
        <ScheduledClassDaysBucket
          days={model.unlinkedLearningDays}
          onOpenDay={handleOpenLearningDay}
        />
      ) : null}
      {noUnitItems.length > 0 ? (
        <ClassworkUnitCard
          title="No unit"
          subtitle={`${noUnitItems.length} ${noUnitItems.length === 1 ? 'assignment' : 'assignments'}`}
          expanded={expandedUnits.has('no-unit')}
          onToggleExpand={() => toggleUnitExpanded('no-unit')}
          dropActive={dragOverTarget === 'no-unit'}
          dropWebProps={{
            ...dropTargetWebProps({
              onDrop: handleUnitDrop(null, null),
              isActive: dragOverTarget === 'no-unit',
            }),
            ...(Platform.OS === 'web' ? {
              onDragEnter: () => setDragOverTarget('no-unit'),
              onDragLeave: (ev) => {
                if (!ev?.currentTarget?.contains?.(ev?.relatedTarget)) {
                  setDragOverTarget((prev) => (prev === 'no-unit' ? null : prev));
                }
              },
            } : {}),
          }}
        >
          <View style={styles.timelineList}>
            {noUnitItems.map((item, index) => (
              <AssignmentPeerRow
                key={item.assignment.id}
                assignment={item.assignment}
                attachedLessonTitle={null}
                learningDay={item.learningDay}
                isParentViewer={isParentViewer}
                onOpen={onOpenAssignment}
                onMoveToUnit={handleMoveAssignmentToUnit}
                onDeleteAssignment={handleDeleteAssignment}
                unitOptions={unitMoveOptions}
                highlighted={String(highlightAssignmentId || '') === String(item.assignment.id)}
                isFirst={index === 0}
                fromUnitId={null}
                fromLessonId={null}
                dragging={String(draggingAssignmentId || '') === String(item.assignment.id)}
                onDragStartAssignment={handleAssignmentDragStart}
                rowRef={(node) => {
                  if (node && item.assignment?.id) {
                    assignmentRowRefs.current[String(item.assignment.id)] = node;
                  }
                }}
              />
            ))}
          </View>
        </ClassworkUnitCard>
      ) : null}

      {showEmbeddedUnitsEditor ? (
        <ManualCurriculumBuilderModal
          embedded
          visible
          autoSave
          familyId={familyId}
          subjectId={subjectId}
          subjectName={subjectName || 'Subject'}
          initialDraft={unitsDraft}
          loadExisting={false}
          replaceExisting={hasUnitsContent}
          createCalendarEvents={false}
          onSaved={onPlacementChanged}
          getLessonScheduleLabel={getLessonScheduleLabel}
          renderAfterLesson={renderLessonAssignments}
          renderAfterUnitLessons={renderUnitLevelAssignments}
          getUnitDropWebProps={getUnitDropWebProps}
        />
      ) : !hasUnitsContent && isParentViewer ? (
        <EmptyUnitsState onAddUnit={startInlineUnitsEditing} />
      ) : model.units.map((unit) => {
        const peerItems = buildUnitPeerItems(unit, model.eventById);
        if (peerItems.length === 0) return null;
        const dropKey = `unit-${unit.unitId}`;
        const lessonCount = (unit?.lessons || []).length;
        const isExpanded = expandedUnits.has(String(unit.unitId));
        let rowIndex = 0;
        return (
          <ClassworkUnitCard
            key={unit.unitId}
            title={unit.title}
            lessonCount={lessonCount}
            expanded={isExpanded}
            onToggleExpand={() => toggleUnitExpanded(unit.unitId)}
            dropActive={dragOverTarget === dropKey}
            dropWebProps={{
              ...dropTargetWebProps({
                onDrop: handleUnitDrop(unit.unitId, unit.title),
                isActive: dragOverTarget === dropKey,
              }),
              ...(Platform.OS === 'web' ? {
                onDragEnter: () => setDragOverTarget(dropKey),
                onDragLeave: (ev) => {
                  if (!ev?.currentTarget?.contains?.(ev?.relatedTarget)) {
                    setDragOverTarget((prev) => (prev === dropKey ? null : prev));
                  }
                },
              } : {}),
            }}
          >
            <View style={styles.timelineList}>
              {peerItems.map((item) => {
                const isFirst = rowIndex === 0;
                rowIndex += 1;
                if (item.kind === 'lesson') {
                  const lessonDropKey = `lesson-${unit.unitId}-${item.lesson.lessonId}`;
                  return (
                    <LessonPeerRow
                      key={`lesson-${item.lesson.lessonId || item.lesson.title}`}
                      lesson={item.lesson}
                      unit={unit}
                      isParentViewer={isParentViewer}
                      onEditLesson={handleEditLesson}
                      onDeleteLesson={handleDeleteLesson}
                      onScheduleLesson={handleScheduleLesson}
                      highlighted={String(highlightLessonId || '') === String(item.lesson.lessonId)}
                      isFirst={isFirst}
                      dragging={String(draggingLessonId || '') === String(item.lesson.lessonId)}
                      dropActive={dragOverLessonTarget === lessonDropKey}
                      onDragEnterLesson={() => setDragOverLessonTarget(lessonDropKey)}
                      onDragLeaveLesson={(ev) => {
                        if (!ev?.currentTarget?.contains?.(ev?.relatedTarget)) {
                          setDragOverLessonTarget((prev) => (
                            prev === lessonDropKey ? null : prev
                          ));
                        }
                      }}
                      onDragStartLesson={handleLessonDragStart}
                      onLessonDrop={handleLessonDropOnRow(unit, item.lesson.lessonId)}
                      rowRef={(node) => {
                        if (node && item.lesson?.lessonId) {
                          lessonRowRefs.current[String(item.lesson.lessonId)] = node;
                        }
                      }}
                    />
                  );
                }
                return (
                  <AssignmentPeerRow
                    key={item.assignment.id}
                    assignment={item.assignment}
                    attachedLessonTitle={item.attachedLessonTitle}
                    learningDay={item.learningDay}
                    isParentViewer={isParentViewer}
                    onOpen={onOpenAssignment}
                    onMoveToUnit={handleMoveAssignmentToUnit}
                    onDeleteAssignment={handleDeleteAssignment}
                    unitOptions={unitMoveOptions}
                    highlighted={String(highlightAssignmentId || '') === String(item.assignment.id)}
                    isFirst={isFirst}
                    fromUnitId={unit.unitId}
                    fromLessonId={item.attachedLessonId}
                    dragging={String(draggingAssignmentId || '') === String(item.assignment.id)}
                    onDragStartAssignment={handleAssignmentDragStart}
                    rowRef={(node) => {
                      if (node && item.assignment?.id) {
                        assignmentRowRefs.current[String(item.assignment.id)] = node;
                      }
                    }}
                  />
                );
              })}
            </View>
            {Platform.OS === 'web' && lessonCount > 0 ? (
              <WebDropView
                style={[
                  styles.dropZone,
                  dragOverLessonTarget === `lesson-end-${unit.unitId}` && styles.lessonRowDropActive,
                ]}
                onDragOver={lessonDropTargetWebProps({ onDrop: handleLessonDropEnd(unit) }).onDragOver}
                onDragEnter={() => setDragOverLessonTarget(`lesson-end-${unit.unitId}`)}
                onDragLeave={(ev) => {
                  if (!ev?.currentTarget?.contains?.(ev?.relatedTarget)) {
                    setDragOverLessonTarget((prev) => (
                      prev === `lesson-end-${unit.unitId}` ? null : prev
                    ));
                  }
                }}
                onDrop={lessonDropTargetWebProps({ onDrop: handleLessonDropEnd(unit) }).onDrop}
              />
            ) : null}
          </ClassworkUnitCard>
        );
      })}

      </ScrollView>

      <ClassworkPlanningModal
        visible={scheduleModal.visible}
        title={scheduleModal.title}
        message={scheduleModal.message}
        scheduleLines={scheduleModal.scheduleLines}
        scheduleLinesHeading={scheduleModal.mode === 'done' ? 'Scheduled on' : 'Learning days'}
        working={scheduleModal.working}
        showConfirm={scheduleModal.showConfirm}
        confirmLabel={scheduleModal.confirmLabel}
        cancelLabel={scheduleModal.cancelLabel}
        onConfirm={confirmScheduleAllModal}
        onCancel={closeScheduleModal}
      />
      <ScheduleLessonModal
        visible={scheduleLessonModal.visible}
        onClose={closeScheduleLessonModal}
        lesson={scheduleLessonModal.lesson}
        unitTitle={scheduleLessonModal.unitTitle}
        subjectName={subjectName}
        familyId={familyId}
        subjectId={subjectId}
        events={events}
        onScheduled={() => {
          closeScheduleLessonModal();
          onPlacementChanged?.();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  rootExpanded: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      overflow: 'hidden',
      maxHeight: '100%',
    }),
  },
  panelToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    flexShrink: 0,
    gap: 12,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: -0.2,
    flex: 1,
    minWidth: 0,
    ...CLASSWORK_LEAGUE_FONT,
  },
  panelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  panelActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E6EBF2',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  panelActionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(15,23,42,0.85)',
    ...CLASSWORK_LEAGUE_FONT,
  },
  panelScroll: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
    }),
  },
  actionPillBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(15,23,42,0.85)',
    ...CLASSWORK_LEAGUE_FONT,
  },
  wrap: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 20,
  },
  sectionBlock: {
    gap: 8,
    overflow: 'visible',
  },
  unitCard: {
    borderWidth: 1,
    borderColor: CLASSWORK_BORDER,
    borderRadius: 12,
    backgroundColor: '#fafbfc',
    overflow: Platform.OS === 'web' ? 'visible' : 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
    }),
  },
  unitCardDropActive: {
    borderColor: '#93C5FD',
    backgroundColor: '#F8FBFF',
  },
  unitHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  chevronBtn: {
    padding: 4,
    flexShrink: 0,
  },
  chevronSpacer: {
    width: 26,
    flexShrink: 0,
  },
  unitHeaderBody: {
    flex: 1,
    minWidth: 0,
  },
  unitTitleText: {
    fontSize: 15,
    fontWeight: '600',
    color: CLASSWORK_FG,
    lineHeight: 20,
    ...CLASSWORK_LEAGUE_FONT,
  },
  unitSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: CLASSWORK_MUTED,
    marginTop: 2,
    lineHeight: 18,
    ...CLASSWORK_BODY_FONT,
  },
  unitLessonsWrap: {
    borderTopWidth: 1,
    borderTopColor: CLASSWORK_BORDER,
    backgroundColor: '#f8fafc',
    paddingBottom: 8,
  },
  timelineList: {
    marginHorizontal: 10,
    marginTop: 8,
    paddingHorizontal: 4,
    gap: 4,
  },
  lessonRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    paddingRight: 4,
  },
  lessonRowBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
    paddingTop: 8,
  },
  lessonRowInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  lessonRowInnerTop: {
    alignItems: 'flex-start',
  },
  lessonRowHighlight: {
    backgroundColor: '#FEF9C3',
    borderRadius: 6,
    paddingHorizontal: 4,
  },
  lessonRowDragging: {
    opacity: 0.45,
  },
  lessonRowDropActive: {
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    ...(Platform.OS === 'web' && {
      outlineWidth: 2,
      outlineStyle: 'dashed',
      outlineColor: '#93C5FD',
    }),
  },
  lessonRowMenuOpen: {
    zIndex: 60,
  },
  gripHandle: {
    paddingVertical: 6,
    paddingHorizontal: 2,
    justifyContent: 'center',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      cursor: 'grab',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      touchAction: 'none',
    }),
  },
  gripSpacer: {
    width: 20,
    flexShrink: 0,
  },
  lessonBullet: {
    color: CLASSWORK_MUTED,
    fontSize: 14,
    fontWeight: '700',
    width: 12,
    textAlign: 'center',
    marginRight: 2,
    flexShrink: 0,
  },
  lessonTitleField: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 2,
    gap: 3,
  },
  lessonTitleText: {
    fontSize: 15,
    fontWeight: '500',
    color: CLASSWORK_FG,
    lineHeight: 20,
    ...CLASSWORK_LEAGUE_FONT,
  },
  rowMeta: {
    fontSize: 13,
    fontWeight: '400',
    color: CLASSWORK_MUTED,
    lineHeight: 18,
    ...CLASSWORK_BODY_FONT,
  },
  rowMetaMuted: {
    fontSize: 13,
    fontWeight: '400',
    color: CLASSWORK_MUTED,
    lineHeight: 18,
    ...CLASSWORK_BODY_FONT,
  },
  lessonScheduleLink: {
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' ? { textDecorationStyle: 'dotted' } : {}),
  },
  dropZone: {
    minHeight: 14,
    marginTop: 6,
    marginBottom: 4,
    marginHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(15,23,42,0.04)',
  },
  unitAssignmentsWrap: {
    marginTop: 8,
    marginHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
    gap: 4,
  },
  lessonAssignmentsWrap: {
    marginHorizontal: 4,
    gap: 4,
    paddingBottom: 2,
  },
  assignmentIconWrap: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  peerAction: {
    fontSize: 13,
    fontWeight: '600',
    color: CLASSWORK_LINK,
    marginTop: 1,
    ...CLASSWORK_LEAGUE_FONT,
  },
  iconBtn: {
    padding: 4,
    flexShrink: 0,
  },
  menuAnchor: {
    position: 'relative',
    zIndex: 10,
    flexShrink: 0,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
    gap: 10,
    minHeight: 280,
  },
  emptyHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: CLASSWORK_FG,
    letterSpacing: -0.2,
    textAlign: 'center',
    ...CLASSWORK_LEAGUE_FONT,
  },
  emptySubtext: {
    fontSize: 14,
    lineHeight: 20,
    color: CLASSWORK_MUTED,
    maxWidth: 360,
    textAlign: 'center',
    marginBottom: 8,
    ...CLASSWORK_BODY_FONT,
  },
  emptyUnitsWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
    gap: 10,
    minHeight: 220,
    borderWidth: 1,
    borderColor: CLASSWORK_BORDER,
    borderRadius: 12,
    backgroundColor: CLASSWORK_BG,
  },
  emptyUnitsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E6EBF2',
    marginTop: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  attachOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  attachCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '60%',
    backgroundColor: CLASSWORK_BG,
    borderRadius: 16,
    overflow: 'hidden',
  },
  attachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: CLASSWORK_BORDER,
  },
  attachTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: CLASSWORK_FG,
    flex: 1,
    paddingRight: 12,
  },
  attachEmpty: {
    fontSize: 14,
    color: CLASSWORK_MUTED,
    padding: 16,
  },
  attachList: {
    padding: 8,
  },
  attachOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  attachOptionText: {
    fontSize: 15,
    color: '#334155',
  },
});
