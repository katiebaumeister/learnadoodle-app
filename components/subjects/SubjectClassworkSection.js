import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import {
  FileText,
  GripVertical,
  MoreVertical,
  Plus,
  X,
} from 'lucide-react';
import {
  buildSubjectClassworkModel,
  buildUnitPeerItems,
  buildNoUnitPeerItems,
} from '../../lib/subjectClassworkModel';
import { autoAssignLessonsToUnlinkedEvents } from '../../lib/subjectLessonLinking';
import {
  dispatchNavigateToPlanner,
  plannerDateParamFromEvent,
} from '../../lib/subjectClassworkNavigation';
import { getWorkStatusLabel } from '../../lib/workEventHelpers';
import { formatDueShort } from '../tutor/tutorHelpUtils';
import { updateAssignmentPlacement } from '../../lib/services/assignmentPlacementClient';
import { useToast } from '../Toast';
import AssignPlacementModal from './AssignPlacementModal';
import ScheduleLessonModal from './ScheduleLessonModal';
import ClassworkPlanningModal from './ClassworkPlanningModal';
import {
  CLASSWORK_FG,
  CLASSWORK_MUTED,
  CLASSWORK_BORDER,
  CLASSWORK_BG,
} from '../../lib/classworkPanelTheme';

const ASSIGNMENT_PLACEMENT_DRAG_MIME = 'application/x-learnadoodle-assignment-placement';

function readAssignmentDragPayload(ev) {
  try {
    const dt = ev?.nativeEvent?.dataTransfer ?? ev?.dataTransfer;
    const raw = dt?.getData?.(ASSIGNMENT_PLACEMENT_DRAG_MIME);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload?.assignmentId) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function assignmentDragWebProps({
  assignmentId,
  fromUnitId = null,
  fromLessonId = null,
  enabled = true,
  onDragStart,
}) {
  if (Platform.OS !== 'web' || !enabled || !assignmentId) return {};
  return {
    draggable: true,
    onDragStart: (ev) => {
      onDragStart?.(assignmentId);
      try {
        const dt = ev?.nativeEvent?.dataTransfer ?? ev?.dataTransfer;
        if (dt?.setData) {
          dt.setData(
            ASSIGNMENT_PLACEMENT_DRAG_MIME,
            JSON.stringify({ assignmentId: String(assignmentId), fromUnitId, fromLessonId }),
          );
          dt.effectAllowed = 'move';
        }
      } catch (_) {}
    },
  };
}

function dropTargetWebProps({ onDrop, isActive = false }) {
  if (Platform.OS !== 'web' || !onDrop) return {};
  return {
    onDragOver: (ev) => {
      ev?.preventDefault?.();
      if (ev?.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    },
    onDragEnter: (ev) => {
      ev?.preventDefault?.();
    },
    onDrop: (ev) => {
      ev?.preventDefault?.();
      const payload = readAssignmentDragPayload(ev);
      if (payload) onDrop(payload);
    },
    ...(isActive ? { 'data-drop-active': 'true' } : {}),
  };
}

function MenuPanel({ items = [], onClose }) {
  if (!items.length) return null;
  return (
    <View style={styles.inlineMenu}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.key}
          onPress={() => {
            onClose();
            item.onPress?.();
          }}
          style={styles.menuItem}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={[styles.menuItemText, item.destructive && styles.menuItemDestructive]}>
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function SectionHeader({ title, count = null }) {
  return (
    <View style={styles.topicHeader}>
      <Text style={styles.topicHeaderText}>{title}</Text>
      {count != null ? (
        <Text style={styles.topicHeaderCount}>{count}</Text>
      ) : null}
    </View>
  );
}

function UnitTopicSection({
  title,
  count,
  children,
  dropActive = false,
  dropWebProps = {},
}) {
  return (
    <View style={styles.sectionBlock}>
      <SectionHeader title={title} count={count} />
      <View
        style={[styles.topicCard, dropActive && styles.topicCardDropActive]}
        {...dropWebProps}
      >
        {children}
      </View>
    </View>
  );
}

function LessonPeerRow({
  lesson,
  unit,
  isParentViewer,
  onSchedule,
  onAttach,
  onViewOnPlanner,
  hasUnattachedAssignments,
  menuState,
  setMenuState,
  closeMenu,
  highlighted = false,
  rowRef,
  isLast = false,
  lessonDropActive = false,
  onLessonDrop,
  onLessonDragEnter,
}) {
  const menuKey = `lesson-${unit.unitId}-${lesson.lessonId}`;
  const menuOpen = menuState?.key === menuKey;
  const menuItems = [];
  if (isParentViewer && lesson.lessonId) {
    menuItems.push({
      key: 'schedule',
      label: lesson.schedule ? 'Change schedule' : 'Schedule lesson',
      onPress: () => onSchedule({ ...lesson, unitTitle: unit.title, unitId: unit.unitId }),
    });
    if (hasUnattachedAssignments) {
      menuItems.push({
        key: 'attach',
        label: 'Attach assignment',
        onPress: () => onAttach({
          lessonId: lesson.lessonId,
          lessonTitle: lesson.title,
          unitId: unit.unitId,
          unitTitle: unit.title,
          label: lesson.title,
        }),
      });
    }
    if (lesson.schedule?.event) {
      menuItems.push({
        key: 'planner',
        label: 'View on planner',
        onPress: () => onViewOnPlanner?.(lesson),
      });
    }
  }

  const lessonDropProps = dropTargetWebProps({
    onDrop: onLessonDrop,
    isActive: lessonDropActive,
  });
  const lessonDragEnterProps = Platform.OS === 'web' && onLessonDragEnter
    ? { onDragEnter: onLessonDragEnter }
    : {};

  return (
    <View
      ref={rowRef}
      style={[
        styles.peerRow,
        !isLast && styles.peerRowBorder,
        menuOpen && Platform.OS === 'web' && styles.peerRowMenuOpen,
        highlighted && styles.peerRowHighlight,
        lessonDropActive && styles.peerRowDropActive,
      ]}
      {...lessonDropProps}
      {...lessonDragEnterProps}
    >
      <View style={styles.lessonIconWrap}>
        <View style={styles.lessonDot} />
      </View>
      <View style={styles.peerBody}>
        <Text style={styles.peerTitle}>{lesson.title || 'Lesson'}</Text>
        <View style={styles.peerMetaRow}>
          {lesson.schedule?.dateLabel ? (
            <Text style={styles.peerMetaScheduled}>
              {lesson.schedule.dateLabel}
            </Text>
          ) : (
            <Text style={styles.peerMetaMuted}>Not scheduled</Text>
          )}
          {lesson.schedule?.dateLabel && isParentViewer ? (
            <TouchableOpacity
              onPress={() => onViewOnPlanner?.(lesson)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.peerAction}>View on planner</Text>
            </TouchableOpacity>
          ) : isParentViewer && lesson.lessonId && !lesson.schedule?.dateLabel ? (
            <TouchableOpacity
              onPress={() => onSchedule({ ...lesson, unitTitle: unit.title, unitId: unit.unitId })}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.peerAction}>Schedule</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <View style={styles.peerTrailing}>
        {lesson.schedule?.dateLabel ? (
          <Text style={styles.peerDateRight}>{lesson.schedule.dateLabel}</Text>
        ) : null}
      </View>
      {isParentViewer && menuItems.length > 0 ? (
        <View style={styles.menuAnchor}>
          <TouchableOpacity
            onPress={() => setMenuState(menuOpen ? null : { key: menuKey, items: menuItems })}
            style={styles.iconBtn}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <MoreVertical size={16} color={CLASSWORK_MUTED} />
          </TouchableOpacity>
          {menuOpen ? <MenuPanel items={menuItems} onClose={closeMenu} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function AssignmentPeerRow({
  assignment,
  attachedLessonTitle,
  learningDay = null,
  isParentViewer,
  onPress,
  onMenu,
  onViewOnPlanner,
  highlighted = false,
  rowRef,
  isLast = false,
  fromUnitId = null,
  fromLessonId = null,
  dragging = false,
  onDragStartAssignment,
}) {
  const status = getWorkStatusLabel(assignment);
  const dueLine = formatDueShort(assignment.due_date);
  const attachmentLine = attachedLessonTitle
    ? attachedLessonTitle
    : null;
  const rightDateLine = dueLine || (learningDay?.dateLabel ? `Learning day ${learningDay.dateLabel}` : null);
  const canDrag = isParentViewer && Platform.OS === 'web';

  const rowContent = (
    <>
      {canDrag ? (
        <View
          style={styles.gripHandle}
          {...assignmentDragWebProps({
            assignmentId: assignment.id,
            fromUnitId,
            fromLessonId,
            enabled: canDrag,
            onDragStart: onDragStartAssignment,
          })}
          accessibilityLabel="Drag assignment to another unit"
        >
          <GripVertical size={16} color={CLASSWORK_MUTED} />
        </View>
      ) : (
        <View style={styles.gripSpacer} />
      )}
      <View style={styles.assignmentIconWrap}>
        <FileText size={18} color="#5F6368" />
      </View>
      <View style={styles.peerBody}>
        <Text style={styles.peerTitle}>{assignment.title || 'Assignment'}</Text>
        {attachmentLine ? (
          <Text style={styles.peerMetaLine} numberOfLines={1}>{attachmentLine}</Text>
        ) : (
          <Text style={styles.peerMetaMuted}>No lesson</Text>
        )}
        {learningDay?.event && isParentViewer ? (
          <TouchableOpacity
            onPress={() => onViewOnPlanner?.(learningDay.event)}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.peerAction}>View on planner</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.peerTrailing}>
        {rightDateLine ? (
          <Text style={styles.peerDateRight}>{rightDateLine}</Text>
        ) : status ? (
          <Text style={styles.peerStatusRight}>{status}</Text>
        ) : null}
      </View>
      {isParentViewer ? (
        <TouchableOpacity
          onPress={(e) => {
            if (Platform.OS === 'web' && e?.stopPropagation) e.stopPropagation();
            onMenu?.(assignment);
          }}
          hitSlop={8}
          style={styles.iconBtn}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <MoreVertical size={16} color={CLASSWORK_MUTED} />
        </TouchableOpacity>
      ) : null}
    </>
  );

  return (
    <TouchableOpacity
      ref={rowRef}
      style={[
        styles.peerRow,
        !isLast && styles.peerRowBorder,
        highlighted && styles.peerRowHighlight,
        dragging && styles.peerRowDragging,
      ]}
      onPress={() => onPress?.(assignment)}
      activeOpacity={0.75}
      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
    >
      {rowContent}
    </TouchableOpacity>
  );
}

function AttachAssignmentModal({
  visible,
  onClose,
  lessonLabel,
  assignments = [],
  onSelect,
}) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.attachOverlay}>
        <View style={styles.attachCard}>
          <View style={styles.attachHeader}>
            <Text style={styles.attachTitle}>Attach to {lessonLabel}</Text>
            <TouchableOpacity onPress={onClose} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <X size={20} color={CLASSWORK_MUTED} />
            </TouchableOpacity>
          </View>
          {assignments.length === 0 ? (
            <Text style={styles.attachEmpty}>No unassigned work. Create an assignment first.</Text>
          ) : (
            <ScrollView style={styles.attachList}>
              {assignments.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={styles.attachOption}
                  onPress={() => onSelect?.(a)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.attachOptionText}>{a.title || 'Assignment'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ClassworkActionSet({
  onManageUnits,
  onCreateAssignment,
  onGapAnalysis,
  showGapAnalysis = false,
  gapAnalysisWorking = false,
  onScheduleAllLessons,
  showScheduleAllLessons = false,
  schedulingAll = false,
  unitsActionLabel = 'Add unit',
}) {
  const showUnits = !!onManageUnits;
  const showAssignment = !!onCreateAssignment;
  if (!showUnits && !showAssignment && !showScheduleAllLessons && !showGapAnalysis) return null;

  return (
    <View style={styles.actionSet}>
      {showGapAnalysis ? (
        <TouchableOpacity
          style={[styles.actionPillBtn, gapAnalysisWorking && styles.actionPillBtnDisabled]}
          onPress={onGapAnalysis}
          disabled={gapAnalysisWorking}
          accessibilityLabel="Gap analysis"
          {...(Platform.OS === 'web' && { cursor: gapAnalysisWorking ? 'default' : 'pointer' })}
        >
          <Text style={styles.actionPillBtnText}>
            {gapAnalysisWorking ? 'Working…' : 'Gap analysis'}
          </Text>
        </TouchableOpacity>
      ) : null}
      {showScheduleAllLessons ? (
        <TouchableOpacity
          style={[styles.actionPillBtn, schedulingAll && styles.actionPillBtnDisabled]}
          onPress={onScheduleAllLessons}
          disabled={schedulingAll}
          accessibilityLabel="Schedule all lessons"
          {...(Platform.OS === 'web' && { cursor: schedulingAll ? 'default' : 'pointer' })}
        >
          <Text style={styles.actionPillBtnText}>
            {schedulingAll ? 'Scheduling…' : 'Schedule all lessons'}
          </Text>
        </TouchableOpacity>
      ) : null}
      {showUnits ? (
        <TouchableOpacity
          style={styles.actionPillBtn}
          onPress={onManageUnits}
          accessibilityLabel={unitsActionLabel}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Plus size={18} color="#334155" strokeWidth={2.25} />
          <Text style={styles.actionPillBtnText}>{unitsActionLabel}</Text>
        </TouchableOpacity>
      ) : null}
      {showAssignment ? (
        <TouchableOpacity
          style={styles.actionPillBtn}
          onPress={onCreateAssignment}
          accessibilityLabel="Add assignment"
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Plus size={18} color="#334155" strokeWidth={2.25} />
          <Text style={styles.actionPillBtnText}>Add assignment</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function ClassworkToolbar({ children }) {
  return (
    <View style={styles.toolbar}>
      <View style={styles.toolbarSpacer} />
      {children}
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

export default function SubjectClassworkSection({
  units = [],
  assignments = [],
  events = [],
  familyId,
  subjectId,
  subjectName,
  isParentViewer = true,
  onOpenAssignment,
  onCreateAssignment,
  onManageUnits,
  unitsActionLabel = 'Add units',
  onPlacementChanged,
  highlightLessonId = null,
  highlightAssignmentId = null,
  onGapAnalysis = null,
  gapAnalysisWorking = false,
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
  const [placementAssignment, setPlacementAssignment] = useState(null);
  const [scheduleLesson, setScheduleLesson] = useState(null);
  const [attachTarget, setAttachTarget] = useState(null);
  const [menuState, setMenuState] = useState(null);
  const [schedulingAll, setSchedulingAll] = useState(false);
  const [draggingAssignmentId, setDraggingAssignmentId] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [movingPlacement, setMovingPlacement] = useState(false);
  const [scheduleModal, setScheduleModal] = useState({
    visible: false,
    title: 'Schedule all lessons',
    message: '',
    showConfirm: false,
    confirmLabel: 'Schedule lessons',
    cancelLabel: 'Close',
    working: false,
    mode: 'info',
  });
  const lessonRowRefs = useRef({});
  const assignmentRowRefs = useRef({});

  const closeMenu = useCallback(() => setMenuState(null), []);

  const closeScheduleModal = useCallback(() => {
    if (schedulingAll) return;
    setScheduleModal({
      visible: false,
      title: 'Schedule all lessons',
      message: '',
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
          showConfirm: false,
          confirmLabel: 'OK',
          cancelLabel: 'Close',
          working: false,
          mode: 'info',
        });
      }
      return;
    }
    setScheduleModal({
      visible: true,
      title: 'Schedule all lessons',
      message: [
        `${count} lesson${count === 1 ? '' : 's'} ${count === 1 ? 'is' : 'are'} not scheduled yet.`,
        '',
        'We will link each lesson to the next open learning day for this subject, in unit order.',
      ].join('\n'),
      showConfirm: true,
      confirmLabel: 'Schedule lessons',
      cancelLabel: 'Cancel',
      working: false,
      mode: 'schedule',
    });
  }, [familyId, subjectId, schedulingAll, model.unscheduledLessonCount, totalLessonCount]);

  const confirmScheduleAllModal = useCallback(async () => {
    if (scheduleModal.mode === 'done' || scheduleModal.mode === 'info' || !scheduleModal.showConfirm) {
      closeScheduleModal();
      return;
    }
    setScheduleModal((prev) => ({ ...prev, working: true }));
    setSchedulingAll(true);
    try {
      const { assigned } = await autoAssignLessonsToUnlinkedEvents({
        familyId,
        subjectId,
        subjectEvents: events,
        units,
        limit: Math.max(model.unscheduledLessonCount, 20),
      });
      if (assigned > 0) {
        onPlacementChanged?.();
        setScheduleModal({
          visible: true,
          title: 'Lessons scheduled',
          message: `Scheduled ${assigned} lesson${assigned === 1 ? '' : 's'} on upcoming learning days.`,
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

  const handleViewOnPlanner = useCallback((lesson) => {
    const event = lesson?.schedule?.event;
    if (!event) return;
    dispatchNavigateToPlanner({
      subjectId,
      date: plannerDateParamFromEvent(event),
      eventId: lesson?.schedule?.eventId || event?.id,
      view: 'month',
    });
  }, [subjectId]);

  const handleViewEventOnPlanner = useCallback((event) => {
    if (!event) return;
    dispatchNavigateToPlanner({
      subjectId,
      date: plannerDateParamFromEvent(event),
      eventId: event?.id,
      view: 'month',
    });
  }, [subjectId]);

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

  const handleLessonDragEnter = useCallback((lessonDropKey) => () => {
    setDragOverTarget(lessonDropKey);
  }, []);

  const handleAssignmentDragStart = useCallback((assignmentId) => {
    setDraggingAssignmentId(String(assignmentId));
  }, []);

  const handleLessonDrop = useCallback((unit, lesson) => (payload) => {
    if (!payload?.assignmentId || !lesson?.lessonId) return;
    const fromUnitId = payload.fromUnitId != null ? String(payload.fromUnitId) : null;
    const fromLessonId = payload.fromLessonId != null ? String(payload.fromLessonId) : null;
    if (fromUnitId === String(unit.unitId) && fromLessonId === String(lesson.lessonId)) return;
    moveAssignmentPlacement({
      assignmentId: payload.assignmentId,
      unitId: String(unit.unitId),
      lessonId: String(lesson.lessonId),
      lessonTitle: lesson.title,
      unitTitle: unit.title,
    });
  }, [moveAssignmentPlacement]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const clearDrag = () => {
      setDraggingAssignmentId(null);
      setDragOverTarget(null);
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

  const handleAttachAssignment = async (assignment) => {
    if (!attachTarget?.lessonId || !assignment?.id) return;
    try {
      await updateAssignmentPlacement({
        assignmentId: assignment.id,
        familyId,
        unitId: attachTarget.unitId,
        lessonId: attachTarget.lessonId,
        lessonTitle: attachTarget.lessonTitle,
        unitTitle: attachTarget.unitTitle,
        linkedEventIds: assignment.linked_event_ids,
      });
      toast.push('Assignment attached', 'success');
      setAttachTarget(null);
      onPlacementChanged?.();
    } catch (err) {
      toast.push(err?.message || 'Could not attach assignment', 'error');
    }
  };

  const noUnitItems = useMemo(
    () => buildNoUnitPeerItems(model.noUnitAssignments, model.eventById),
    [model.noUnitAssignments, model.eventById],
  );

  const hasContent = model.units.length > 0 || model.noUnitAssignments.length > 0;

  if (!hasContent) {
    return (
      <View style={styles.root}>
        {isParentViewer ? (
          <ClassworkToolbar>
            <ClassworkActionSet
              onManageUnits={onManageUnits}
              onCreateAssignment={onCreateAssignment}
              onGapAnalysis={onGapAnalysis}
              showGapAnalysis={!!onGapAnalysis}
              gapAnalysisWorking={gapAnalysisWorking}
              onScheduleAllLessons={openScheduleAllModal}
              showScheduleAllLessons={isParentViewer}
              schedulingAll={schedulingAll}
              unitsActionLabel={unitsActionLabel}
            />
          </ClassworkToolbar>
        ) : null}
        <EmptyClassworkState isParentViewer={isParentViewer} />
        <ClassworkPlanningModal
          visible={scheduleModal.visible}
          title={scheduleModal.title}
          message={scheduleModal.message}
          working={scheduleModal.working}
          showConfirm={scheduleModal.showConfirm}
          confirmLabel={scheduleModal.confirmLabel}
          cancelLabel={scheduleModal.cancelLabel}
          onConfirm={confirmScheduleAllModal}
          onCancel={closeScheduleModal}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {isParentViewer ? (
        <ClassworkToolbar>
          <ClassworkActionSet
            onManageUnits={onManageUnits}
            onCreateAssignment={onCreateAssignment}
            onGapAnalysis={onGapAnalysis}
            showGapAnalysis={!!onGapAnalysis}
            gapAnalysisWorking={gapAnalysisWorking}
            onScheduleAllLessons={openScheduleAllModal}
            showScheduleAllLessons={isParentViewer}
            schedulingAll={schedulingAll}
            unitsActionLabel={unitsActionLabel}
          />
        </ClassworkToolbar>
      ) : null}
      <View style={styles.wrap}>
      {noUnitItems.length > 0 ? (
        <UnitTopicSection
          title="No unit"
          count={noUnitItems.length}
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
          {noUnitItems.map((item, index) => (
            <AssignmentPeerRow
              key={item.assignment.id}
              assignment={item.assignment}
              attachedLessonTitle={null}
              learningDay={item.learningDay}
              isParentViewer={isParentViewer}
              onPress={onOpenAssignment}
              onMenu={setPlacementAssignment}
              onViewOnPlanner={handleViewEventOnPlanner}
              highlighted={String(highlightAssignmentId || '') === String(item.assignment.id)}
              isLast={index === noUnitItems.length - 1}
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
        </UnitTopicSection>
      ) : null}

      {model.units.map((unit) => {
        const peerItems = buildUnitPeerItems(unit, model.eventById);
        if (peerItems.length === 0) return null;
        const dropKey = `unit-${unit.unitId}`;
        return (
          <UnitTopicSection
            key={unit.unitId}
            title={unit.title}
            count={peerItems.length}
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
            {peerItems.map((item, index) => {
              const isLast = index === peerItems.length - 1;
              if (item.kind === 'lesson') {
                const lessonDropKey = `lesson-${unit.unitId}-${item.lesson.lessonId}`;
                return (
                  <LessonPeerRow
                    key={`lesson-${item.lesson.lessonId || item.lesson.title}`}
                    lesson={item.lesson}
                    unit={unit}
                    isParentViewer={isParentViewer}
                    onSchedule={setScheduleLesson}
                    onAttach={setAttachTarget}
                    onViewOnPlanner={handleViewOnPlanner}
                    hasUnattachedAssignments={model.noUnitAssignments.length > 0}
                    menuState={menuState}
                    setMenuState={setMenuState}
                    closeMenu={closeMenu}
                    highlighted={String(highlightLessonId || '') === String(item.lesson.lessonId)}
                    isLast={isLast}
                    lessonDropActive={dragOverTarget === lessonDropKey}
                    onLessonDrop={handleLessonDrop(unit, item.lesson)}
                    onLessonDragEnter={handleLessonDragEnter(lessonDropKey)}
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
                  onPress={onOpenAssignment}
                  onMenu={setPlacementAssignment}
                  onViewOnPlanner={handleViewEventOnPlanner}
                  highlighted={String(highlightAssignmentId || '') === String(item.assignment.id)}
                  isLast={isLast}
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
          </UnitTopicSection>
        );
      })}

      </View>

      <AssignPlacementModal
        visible={!!placementAssignment}
        onClose={() => setPlacementAssignment(null)}
        assignment={placementAssignment}
        units={units}
        familyId={familyId}
        onSaved={() => {
          setPlacementAssignment(null);
          onPlacementChanged?.();
        }}
      />

      <ScheduleLessonModal
        visible={!!scheduleLesson}
        onClose={() => setScheduleLesson(null)}
        lesson={scheduleLesson}
        unitTitle={scheduleLesson?.unitTitle}
        familyId={familyId}
        subjectId={subjectId}
        subjectName={subjectName}
        events={events}
        onScheduled={() => {
          setScheduleLesson(null);
          onPlacementChanged?.();
        }}
      />

      <AttachAssignmentModal
        visible={!!attachTarget}
        onClose={() => setAttachTarget(null)}
        lessonLabel={attachTarget?.label || 'lesson'}
        assignments={model.noUnitAssignments}
        onSelect={handleAttachAssignment}
      />

      <ClassworkPlanningModal
        visible={scheduleModal.visible}
        title={scheduleModal.title}
        message={scheduleModal.message}
        working={scheduleModal.working}
        showConfirm={scheduleModal.showConfirm}
        confirmLabel={scheduleModal.confirmLabel}
        cancelLabel={scheduleModal.cancelLabel}
        onConfirm={confirmScheduleAllModal}
        onCancel={closeScheduleModal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    flexShrink: 0,
    gap: 12,
  },
  toolbarSpacer: {
    flex: 1,
  },
  actionSet: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    flexShrink: 0,
  },
  actionPillBtn: {
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
  actionPillBtnDisabled: {
    opacity: 0.6,
  },
  actionPillBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(15,23,42,0.85)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  wrap: {
    paddingHorizontal: 14,
    paddingBottom: 28,
    gap: 20,
  },
  sectionBlock: {
    gap: 8,
  },
  topicHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  topicHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: CLASSWORK_FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  topicHeaderCount: {
    fontSize: 12,
    fontWeight: '500',
    color: CLASSWORK_MUTED,
  },
  topicCard: {
    backgroundColor: CLASSWORK_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CLASSWORK_BORDER,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    }),
  },
  topicCardDropActive: {
    borderColor: '#93C5FD',
    backgroundColor: '#F8FBFF',
  },
  peerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 56,
    backgroundColor: CLASSWORK_BG,
  },
  peerRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  peerRowHighlight: {
    backgroundColor: '#FEF9C3',
    borderLeftWidth: 3,
    borderLeftColor: '#FACC15',
    paddingLeft: 9,
  },
  peerRowDragging: {
    opacity: 0.45,
  },
  peerRowDropActive: {
    backgroundColor: '#EFF6FF',
    outlineWidth: Platform.OS === 'web' ? 2 : 0,
    outlineStyle: Platform.OS === 'web' ? 'dashed' : undefined,
    outlineColor: Platform.OS === 'web' ? '#93C5FD' : undefined,
  },
  peerRowMenuOpen: {
    zIndex: 60,
  },
  gripHandle: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...(Platform.OS === 'web' && { cursor: 'grab' }),
  },
  gripSpacer: {
    width: 20,
    flexShrink: 0,
  },
  lessonIconWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  assignmentIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  lessonDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#94A3B8',
    flexShrink: 0,
  },
  peerBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  peerTrailing: {
    minWidth: 88,
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
    paddingRight: 2,
  },
  peerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: CLASSWORK_FG,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  peerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  peerMetaScheduled: {
    fontSize: 13,
    color: '#475569',
  },
  peerMetaMuted: {
    fontSize: 13,
    color: CLASSWORK_MUTED,
  },
  peerMetaLine: {
    fontSize: 13,
    color: '#64748B',
  },
  peerDateRight: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'right',
  },
  peerStatusRight: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366F1',
    textAlign: 'right',
  },
  peerAction: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  iconBtn: {
    padding: 4,
    flexShrink: 0,
  },
  menuAnchor: {
    position: 'relative',
    zIndex: 10,
  },
  inlineMenu: {
    position: 'absolute',
    right: 0,
    top: '100%',
    marginTop: 4,
    minWidth: 200,
    backgroundColor: CLASSWORK_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CLASSWORK_BORDER,
    paddingVertical: 4,
    zIndex: 100,
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(15,23,42,0.16)' } : {}),
  },
  menuItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  menuItemText: {
    fontSize: 14,
    color: CLASSWORK_FG,
  },
  menuItemDestructive: {
    color: '#ef4444',
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
    fontSize: 18,
    fontWeight: '700',
    color: CLASSWORK_FG,
    letterSpacing: -0.2,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptySubtext: {
    fontSize: 14,
    lineHeight: 21,
    color: CLASSWORK_MUTED,
    maxWidth: 360,
    textAlign: 'center',
    marginBottom: 8,
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
