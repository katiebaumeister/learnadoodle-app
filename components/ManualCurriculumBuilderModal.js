/**
 * Manual curriculum builder for subject detail (Add units).
 * Canonical draft editor — inline unit titles, ellipsis reorder menus, one-line lessons.
 * Do not fork this UI; extend via EditSubjectUnitsModal / SubjectCurriculumImportModal only.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {
  X,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  MoreVertical,
  GripVertical,
} from 'lucide-react';
import { STRINGS } from '../lib/i18n/strings';
import { WebDragHandle, WebDropView, writeWebDragPayload } from './ui/webDragDrop';
import {
  commitManualDraft,
  fetchSubjectCurriculumEventsStructure,
  getManualCommitValidationError,
} from '../lib/services/curriculumClient';
import { draftFromCurriculumStructure } from '../lib/subjectUnitsEditorDraft';
import { useToast } from './Toast';
import { useModalStackElevation } from './hooks/useModalStackElevation';

const s = (path) => {
  const parts = path.split('.');
  let v = STRINGS;
  for (const p of parts) v = v?.[p];
  return typeof v === 'string' ? v : path;
};

const ACCENT = '#9ECFFB';
const FG = '#111827';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const BG = '#FFFFFF';
const ERROR = '#ef4444';
const DRAFT_LESSON_DRAG_MIME = 'application/x-learnadoodle-draft-lesson';

function tempId() {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function resequenceDraftUnits(units) {
  return units.map((u, i) => ({
    ...u,
    sequence_index: i + 1,
    lessons: (u.lessons || []).map((le, j) => ({ ...le, sequence_index: j + 1 })),
  }));
}

const emptyUnit = (seq = 1) => ({
  temp_id: tempId(),
  title: `Unit ${seq}`,
  description: null,
  sequence_index: seq,
  inferred: false,
  lessons: [],
});

const emptyLesson = (seq = 1) => ({
  temp_id: tempId(),
  title: `Lesson ${seq}`,
  objective: null,
  notes: null,
  sequence_index: seq,
  minutes_est: 60,
  modality: null,
  lesson_type: 'lesson',
  materials: null,
  is_placeholder: false,
  cadence_metadata: null,
  reference_date: null,
});

function buildCommitDraft(draft) {
  return {
    title: draft.title,
    units: draft.units.map((u, i) => ({
      temp_id: u.temp_id,
      title: (u.title || '').trim() || `Unit ${i + 1}`,
      description: null,
      sequence_index: i + 1,
      inferred: !!u.inferred,
      lessons: (u.lessons || []).map((le, j) => ({
        temp_id: le.temp_id,
        title: (le.title || '').trim() || `Lesson ${j + 1}`,
        objective: (le.objective || '').trim() || null,
        notes: (le.notes || '').trim() || null,
        sequence_index: j + 1,
        minutes_est: le.minutes_est ?? 60,
        modality: le.modality || null,
        lesson_type: (le.lesson_type === 'exam' ? 'assessment' : le.lesson_type) || 'lesson',
        materials: le.materials || null,
        is_placeholder: !!le.is_placeholder,
        cadence_metadata: le.cadence_metadata || null,
      })),
    })),
  };
}

function lessonIdFromDraftTempId(tempId) {
  const match = String(tempId || '').match(/^existing-l-(.+)$/);
  return match ? match[1] : null;
}

function readDraftLessonDragPayload(ev) {
  try {
    const dt = ev?.nativeEvent?.dataTransfer ?? ev?.dataTransfer;
    const raw = dt?.getData?.(DRAFT_LESSON_DRAG_MIME) || dt?.getData?.('text/plain');
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p.fromUnit !== 'number' || typeof p.fromLesson !== 'number') return null;
    return p;
  } catch (_) {
    return null;
  }
}

function normalizeImportedDraft(source) {
  if (!source?.units?.length) {
    return { title: source?.title ?? null, units: [emptyUnit(1)] };
  }
  return {
    title: source?.title ?? null,
    units: source.units.map((u, ui) => ({
      temp_id: u.temp_id || tempId(),
      title: u.title || `Unit ${ui + 1}`,
      description: null,
      sequence_index: ui + 1,
      inferred: !!u.inferred,
      lessons: (u.lessons || []).map((le, li) => ({
        temp_id: le.temp_id || tempId(),
        title: le.title || `Lesson ${li + 1}`,
        objective: le.objective ?? null,
        notes: le.notes ?? null,
        sequence_index: li + 1,
        minutes_est: le.minutes_est ?? 60,
        modality: le.modality ?? null,
        lesson_type: le.lesson_type || 'lesson',
        materials: le.materials ?? null,
        is_placeholder: !!le.is_placeholder,
        cadence_metadata: le.cadence_metadata ?? null,
        reference_date: le.reference_date ?? null,
      })),
    })),
  };
}

export default function ManualCurriculumBuilderModal({
  visible,
  onClose,
  subjectId,
  subjectName,
  familyId,
  onSaved,
  loadExisting = false,
  initialDraft = null,
  academicYearId = null,
  replaceExisting = false,
  createCalendarEvents = false,
  headerTitle = null,
  embedded = false,
  autoSave = false,
  renderAfterUnitLessons = null,
  renderAfterLesson = null,
  getLessonScheduleLabel = null,
  getUnitDropWebProps = null,
}) {
  const toast = useToast();
  const overlayRef = useRef(null);
  useModalStackElevation(overlayRef, visible && !embedded, 10002);

  const [draft, setDraft] = useState({ title: null, units: [emptyUnit(1)] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [expandedUnits, setExpandedUnits] = useState(() => new Set([0]));
  const [loadedExisting, setLoadedExisting] = useState(false);
  const didHydrateRef = useRef(false);

  const [draftBuilderUnitMenuKey, setDraftBuilderUnitMenuKey] = useState(null);
  const [draftBuilderLessonMenuKey, setDraftBuilderLessonMenuKey] = useState(null);
  const [draftBuilderMovePickKey, setDraftBuilderMovePickKey] = useState(null);
  const [webDraftUnitMenuLayout, setWebDraftUnitMenuLayout] = useState(null);
  const [webDraftLessonMenuLayout, setWebDraftLessonMenuLayout] = useState(null);

  const closeWebDraftUnitMenu = useCallback(() => {
    setWebDraftUnitMenuLayout(null);
    setDraftBuilderUnitMenuKey(null);
  }, []);

  const closeWebDraftLessonMenu = useCallback(() => {
    setWebDraftLessonMenuLayout(null);
    setDraftBuilderLessonMenuKey(null);
    setDraftBuilderMovePickKey(null);
  }, []);

  const resetDraft = useCallback(() => {
    setDraft({ title: null, units: [emptyUnit(1)] });
    setError(null);
    setExpandedUnits(new Set([0]));
    setLoadedExisting(false);
    closeWebDraftUnitMenu();
    closeWebDraftLessonMenu();
  }, [closeWebDraftUnitMenu, closeWebDraftLessonMenu]);

  useEffect(() => {
    if (!embedded) {
      if (!visible) {
        didHydrateRef.current = false;
        return undefined;
      }
      if (didHydrateRef.current) return undefined;
      didHydrateRef.current = true;
    } else {
      if (!visible) return undefined;
      if (dirty) return undefined;
    }

    if (initialDraft?.units?.length) {
      const normalized = normalizeImportedDraft(initialDraft);
      setDraft(normalized);
      setExpandedUnits(new Set(normalized.units.map((_, i) => i)));
      setLoadedExisting(true);
      setError(null);
      setDirty(false);
      if (embedded) didHydrateRef.current = true;
      return undefined;
    }
    if (embedded) {
      if (!loadExisting) {
        resetDraft();
      }
      return undefined;
    }
    if (!loadExisting || !familyId || !subjectId) {
      resetDraft();
      return undefined;
    }
    resetDraft();
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const { data, error: fetchError } = await fetchSubjectCurriculumEventsStructure(
          familyId,
          subjectId,
          academicYearId,
        );
        if (cancelled) return;
        if (fetchError) return;
        const mapped = draftFromCurriculumStructure(data);
        if (mapped?.units?.length) {
          setDraft(mapped);
          setExpandedUnits(new Set([0]));
          setLoadedExisting(true);
          setDirty(false);
        }
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, embedded, initialDraft, loadExisting, familyId, subjectId, academicYearId, resetDraft, dirty]);

  const handleClose = useCallback(() => {
    resetDraft();
    onClose?.();
  }, [onClose, resetDraft]);

  const patchDraft = useCallback((updater) => {
    setDraft((prev) => {
      const next = updater(prev);
      if (next !== prev) setDirty(true);
      return next === prev ? prev : next;
    });
  }, []);

  const addUnit = useCallback(() => {
    patchDraft((prev) => ({
      ...prev,
      units: [...prev.units, emptyUnit(prev.units.length + 1)],
    }));
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      next.add(draft.units.length);
      return next;
    });
  }, [patchDraft, draft.units.length]);

  const updateUnit = useCallback((unitIndex, field, value) => {
    patchDraft((prev) => {
      const units = [...prev.units];
      if (!units[unitIndex]) return prev;
      units[unitIndex] = { ...units[unitIndex], [field]: value };
      return { ...prev, units };
    });
  }, [patchDraft]);

  const deleteUnit = useCallback((unitIndex) => {
    patchDraft((prev) => {
      if (prev.units.length <= 1) return prev;
      const units = resequenceDraftUnits(prev.units.filter((_, i) => i !== unitIndex));
      return { ...prev, units };
    });
    setExpandedUnits((prev) => {
      const next = new Set();
      prev.forEach((idx) => {
        if (idx === unitIndex) return;
        if (idx > unitIndex) next.add(idx - 1);
        else next.add(idx);
      });
      if (next.size === 0) next.add(0);
      return next;
    });
    closeWebDraftUnitMenu();
  }, [patchDraft, closeWebDraftUnitMenu]);

  const moveUnitFixed = useCallback((unitIndex, direction) => {
    const j = unitIndex + direction;
    patchDraft((prev) => {
      const units = [...prev.units];
      if (j < 0 || j >= units.length) return prev;
      [units[unitIndex], units[j]] = [units[j], units[unitIndex]];
      return { ...prev, units: resequenceDraftUnits(units) };
    });
    setExpandedUnits((prev) => {
      const next = new Set();
      prev.forEach((idx) => {
        if (idx === unitIndex) next.add(j);
        else if (idx === j) next.add(unitIndex);
        else next.add(idx);
      });
      return next;
    });
    closeWebDraftUnitMenu();
  }, [patchDraft, closeWebDraftUnitMenu]);

  const addLesson = useCallback((unitIndex) => {
    patchDraft((prev) => {
      const units = [...prev.units];
      const u = units[unitIndex];
      if (!u) return prev;
      const lessons = [...(u.lessons || [])];
      lessons.push(emptyLesson(lessons.length + 1));
      units[unitIndex] = { ...u, lessons };
      return { ...prev, units };
    });
    closeWebDraftUnitMenu();
  }, [patchDraft, closeWebDraftUnitMenu]);

  const updateLesson = useCallback((unitIndex, lessonIndex, field, value) => {
    patchDraft((prev) => {
      const units = [...prev.units];
      const u = units[unitIndex];
      if (!u?.lessons) return prev;
      const lessons = [...u.lessons];
      if (!lessons[lessonIndex]) return prev;
      lessons[lessonIndex] = { ...lessons[lessonIndex], [field]: value };
      units[unitIndex] = { ...u, lessons };
      return { ...prev, units };
    });
  }, [patchDraft]);

  const deleteLesson = useCallback((unitIndex, lessonIndex) => {
    patchDraft((prev) => {
      const units = [...prev.units];
      const u = units[unitIndex];
      if (!u?.lessons) return prev;
      const lessons = u.lessons.filter((_, i) => i !== lessonIndex);
      units[unitIndex] = { ...u, lessons: resequenceDraftUnits([{ ...u, lessons }])[0].lessons };
      return { ...prev, units };
    });
    closeWebDraftLessonMenu();
  }, [patchDraft, closeWebDraftLessonMenu]);

  const moveLesson = useCallback((unitIndex, lessonIndex, direction) => {
    patchDraft((prev) => {
      const units = [...prev.units];
      const u = units[unitIndex];
      if (!u?.lessons) return prev;
      const lessons = [...u.lessons];
      const j = lessonIndex + direction;
      if (j < 0 || j >= lessons.length) return prev;
      [lessons[lessonIndex], lessons[j]] = [lessons[j], lessons[lessonIndex]];
      units[unitIndex] = { ...u, lessons: resequenceDraftUnits([{ ...u, lessons }])[0].lessons };
      return { ...prev, units };
    });
    closeWebDraftLessonMenu();
  }, [patchDraft, closeWebDraftLessonMenu]);

  const addDraftUnitBelowIndex = useCallback((unitIndex) => {
    patchDraft((prev) => {
      const units = prev.units.map((u) => ({ ...u, lessons: [...(u.lessons || [])] }));
      const newUnit = emptyUnit(unitIndex + 2);
      units.splice(unitIndex + 1, 0, newUnit);
      return { ...prev, units: resequenceDraftUnits(units) };
    });
    setExpandedUnits((prev) => {
      const next = new Set();
      prev.forEach((idx) => {
        if (idx > unitIndex) next.add(idx + 1);
        else next.add(idx);
      });
      next.add(unitIndex + 1);
      return next;
    });
    closeWebDraftUnitMenu();
  }, [patchDraft, closeWebDraftUnitMenu]);

  const mergeDraftUnitWithAdjacent = useCallback((unitIndex, direction) => {
    patchDraft((prev) => {
      if (!prev.units || prev.units.length < 2) return prev;
      const units = prev.units.map((u) => ({ ...u, lessons: [...(u.lessons || [])] }));
      if (direction === 'prev') {
        if (unitIndex <= 0) return prev;
        units[unitIndex - 1].lessons = [...units[unitIndex - 1].lessons, ...units[unitIndex].lessons];
        units.splice(unitIndex, 1);
      } else {
        if (unitIndex >= units.length - 1) return prev;
        units[unitIndex].lessons = [...units[unitIndex].lessons, ...units[unitIndex + 1].lessons];
        units.splice(unitIndex + 1, 1);
      }
      return { ...prev, units: resequenceDraftUnits(units) };
    });
    setExpandedUnits((prev) => {
      const next = new Set();
      if (direction === 'prev') {
        prev.forEach((idx) => {
          if (idx === unitIndex) return;
          if (idx > unitIndex) next.add(idx - 1);
          else next.add(idx);
        });
        if (unitIndex > 0) next.add(unitIndex - 1);
      } else {
        prev.forEach((idx) => {
          if (idx === unitIndex + 1) return;
          if (idx > unitIndex + 1) next.add(idx - 1);
          else next.add(idx);
        });
        next.add(unitIndex);
      }
      return next.size ? next : new Set([0]);
    });
    closeWebDraftUnitMenu();
  }, [patchDraft, closeWebDraftUnitMenu]);

  const moveDraftLessonToUnit = useCallback((fromUnitIndex, lessonIndex, toUnitIndex, insertBeforeLessonIndex) => {
    patchDraft((prev) => {
      const units = prev.units.map((u) => ({ ...u, lessons: [...(u.lessons || [])] }));
      const fromArr = units[fromUnitIndex]?.lessons;
      if (!fromArr || lessonIndex < 0 || lessonIndex >= fromArr.length) return prev;
      if (toUnitIndex < 0 || toUnitIndex >= units.length) return prev;
      const [moved] = fromArr.splice(lessonIndex, 1);
      units[fromUnitIndex] = { ...units[fromUnitIndex], lessons: fromArr };
      const toArr = [...units[toUnitIndex].lessons];
      let insertAt =
        insertBeforeLessonIndex === null || insertBeforeLessonIndex === undefined
          ? toArr.length
          : insertBeforeLessonIndex;
      if (insertAt < 0) insertAt = 0;
      if (insertAt > toArr.length) insertAt = toArr.length;
      if (fromUnitIndex === toUnitIndex && lessonIndex < insertAt) insertAt -= 1;
      toArr.splice(insertAt, 0, moved);
      units[toUnitIndex] = { ...units[toUnitIndex], lessons: toArr };
      return { ...prev, units: resequenceDraftUnits(units) };
    });
    closeWebDraftLessonMenu();
  }, [patchDraft, closeWebDraftLessonMenu]);

  const moveDraftLessonToNewUnit = useCallback((unitIndex, lessonIndex) => {
    patchDraft((prev) => {
      const lessons = prev.units[unitIndex]?.lessons;
      if (!lessons || lessonIndex < 0 || lessonIndex >= lessons.length) return prev;
      const units = prev.units.map((u) => ({ ...u, lessons: [...(u.lessons || [])] }));
      const from = [...units[unitIndex].lessons];
      const [removed] = from.splice(lessonIndex, 1);
      units[unitIndex] = { ...units[unitIndex], lessons: from };
      const newUnit = emptyUnit(unitIndex + 2);
      newUnit.lessons = [removed];
      units.splice(unitIndex + 1, 0, newUnit);
      return { ...prev, units: resequenceDraftUnits(units) };
    });
    setExpandedUnits((prev) => {
      const next = new Set();
      prev.forEach((idx) => {
        if (idx > unitIndex) next.add(idx + 1);
        else next.add(idx);
      });
      next.add(unitIndex + 1);
      return next;
    });
    closeWebDraftLessonMenu();
  }, [patchDraft, closeWebDraftLessonMenu]);

  const validationError = useMemo(() => getManualCommitValidationError(draft), [draft]);
  const blockingError = useMemo(() => {
    if (!validationError) return null;
    if (/lesson/i.test(String(validationError))) return null;
    return validationError;
  }, [validationError]);

  const handleSave = useCallback(async ({ closeOnSuccess = true } = {}) => {
    if (!subjectId || !familyId || !subjectName) return;
    if (blockingError) {
      setError(blockingError);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        subject_id: subjectId,
        family_id: familyId,
        subject_name: subjectName,
        builder_mode: 'rich_units',
        draft: buildCommitDraft(draft),
        replace_existing: replaceExisting || loadedExisting,
        create_calendar_events: createCalendarEvents,
      };
      if (academicYearId) payload.academic_year_id = academicYearId;
      const { data, err } = await commitManualDraft(payload);
      if (err || !data) {
        setError(err?.message || s('courseStructure.manualBuilder.errorSave'));
        return;
      }
      if (!autoSave) {
        toast?.push(s('courseStructure.manualBuilder.saveSuccess'), 'success');
      }
      setDirty(false);
      onSaved?.();
      if (closeOnSuccess && !embedded) {
        handleClose();
      }
    } catch (e) {
      setError(e?.message || s('courseStructure.manualBuilder.errorSave'));
    } finally {
      setSaving(false);
    }
  }, [
    draft,
    subjectId,
    familyId,
    subjectName,
    onSaved,
    toast,
    handleClose,
    replaceExisting,
    loadedExisting,
    createCalendarEvents,
    academicYearId,
    blockingError,
    embedded,
    autoSave,
  ]);

  useEffect(() => {
    if (!embedded || !autoSave || !dirty || saving || !subjectId || !familyId) return undefined;
    const timer = setTimeout(() => {
      handleSave({ closeOnSuccess: false });
    }, 900);
    return () => clearTimeout(timer);
  }, [embedded, autoSave, dirty, saving, subjectId, familyId, draft, handleSave]);

  const renderWebDraftUnitMenuPortal = () => {
    if (Platform.OS !== 'web' || draftBuilderUnitMenuKey === null || !webDraftUnitMenuLayout) return null;
    const currentUnits = draft?.units;
    if (!currentUnits?.length) return null;
    const unitIdx = draftBuilderUnitMenuKey;
    if (unitIdx < 0 || unitIdx >= currentUnits.length) return null;
    let ReactDOM;
    try {
      ReactDOM = require('react-dom');
    } catch (_) {
      return null;
    }
    if (!ReactDOM?.createPortal || typeof document === 'undefined' || !document.body) return null;

    return ReactDOM.createPortal(
      <>
        <TouchableOpacity
          activeOpacity={1}
          onPress={closeWebDraftUnitMenu}
          style={styles.menuBackdrop}
          {...(Platform.OS === 'web' && { cursor: 'default' })}
        />
        <View style={[styles.menuPanel, { top: webDraftUnitMenuLayout.top, right: webDraftUnitMenuLayout.right }]}>
          {unitIdx > 0 ? (
            <TouchableOpacity
              onPress={() => moveUnitFixed(unitIdx, -1)}
              style={styles.menuItem}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.menuItemText}>{s('courseStructure.manualBuilder.moveUp')}</Text>
            </TouchableOpacity>
          ) : null}
          {unitIdx < currentUnits.length - 1 ? (
            <TouchableOpacity
              onPress={() => moveUnitFixed(unitIdx, 1)}
              style={styles.menuItem}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.menuItemText}>{s('courseStructure.manualBuilder.moveDown')}</Text>
            </TouchableOpacity>
          ) : null}
          {unitIdx > 0 ? (
            <TouchableOpacity
              onPress={() => mergeDraftUnitWithAdjacent(unitIdx, 'prev')}
              style={styles.menuItem}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.menuItemText}>{s('planMyYear.multiSubjectUnits.draftUnitMergeWithPrevious')}</Text>
            </TouchableOpacity>
          ) : null}
          {unitIdx < currentUnits.length - 1 ? (
            <TouchableOpacity
              onPress={() => mergeDraftUnitWithAdjacent(unitIdx, 'next')}
              style={styles.menuItem}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.menuItemText}>{s('planMyYear.multiSubjectUnits.draftUnitMergeWithNext')}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => addLesson(unitIdx)}
            style={styles.menuItem}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.menuItemText}>{s('planMyYear.multiSubjectUnits.draftUnitAddLesson')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => addDraftUnitBelowIndex(unitIdx)}
            style={styles.menuItem}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.menuItemText}>{s('planMyYear.multiSubjectUnits.draftUnitAddUnitBelow')}</Text>
          </TouchableOpacity>
        </View>
      </>,
      document.body,
    );
  };

  const renderWebDraftLessonMenuPortal = () => {
    if (Platform.OS !== 'web' || draftBuilderLessonMenuKey == null || !webDraftLessonMenuLayout) return null;
    const currentUnits = draft?.units;
    if (!currentUnits?.length) return null;
    const keyStr = String(draftBuilderLessonMenuKey);
    const dashIdx = keyStr.indexOf('-');
    if (dashIdx < 0) return null;
    const unitIdx = parseInt(keyStr.slice(0, dashIdx), 10);
    const lessonIdx = parseInt(keyStr.slice(dashIdx + 1), 10);
    if (Number.isNaN(unitIdx) || Number.isNaN(lessonIdx)) return null;
    const lessonMenuKey = keyStr;
    const lessons = currentUnits[unitIdx]?.lessons || [];
    let ReactDOM;
    try {
      ReactDOM = require('react-dom');
    } catch (_) {
      return null;
    }
    if (!ReactDOM?.createPortal || typeof document === 'undefined' || !document.body) return null;

    return ReactDOM.createPortal(
      <>
        <TouchableOpacity
          activeOpacity={1}
          onPress={closeWebDraftLessonMenu}
          style={styles.menuBackdrop}
          {...(Platform.OS === 'web' && { cursor: 'default' })}
        />
        <View style={[styles.menuPanel, { top: webDraftLessonMenuLayout.top, right: webDraftLessonMenuLayout.right, minWidth: 220 }]}>
          {draftBuilderMovePickKey === lessonMenuKey ? (
            <>
              <TouchableOpacity
                onPress={() => setDraftBuilderMovePickKey(null)}
                style={[styles.menuItem, styles.menuItemBack]}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.menuItemBackText}>{s('planMyYear.multiSubjectUnits.draftMoveLessonBack')}</Text>
              </TouchableOpacity>
              {currentUnits.map((uOpt, oi) =>
                oi !== unitIdx ? (
                  <TouchableOpacity
                    key={uOpt.temp_id || `portal-u-${oi}`}
                    onPress={() => moveDraftLessonToUnit(unitIdx, lessonIdx, oi, null)}
                    style={styles.menuItem}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={styles.menuItemText} numberOfLines={2}>
                      {uOpt.title?.trim() || `Unit ${oi + 1}`}
                    </Text>
                  </TouchableOpacity>
                ) : null,
              )}
            </>
          ) : (
            <>
              {lessonIdx > 0 ? (
                <TouchableOpacity
                  onPress={() => moveLesson(unitIdx, lessonIdx, -1)}
                  style={styles.menuItem}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.menuItemText}>{s('courseStructure.manualBuilder.moveUp')}</Text>
                </TouchableOpacity>
              ) : null}
              {lessonIdx < lessons.length - 1 ? (
                <TouchableOpacity
                  onPress={() => moveLesson(unitIdx, lessonIdx, 1)}
                  style={styles.menuItem}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.menuItemText}>{s('courseStructure.manualBuilder.moveDown')}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => moveDraftLessonToNewUnit(unitIdx, lessonIdx)}
                style={styles.menuItem}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.menuItemText}>{s('planMyYear.multiSubjectUnits.draftMoveLessonToNewUnit')}</Text>
              </TouchableOpacity>
              {currentUnits.length > 1 ? (
                <TouchableOpacity
                  onPress={() => setDraftBuilderMovePickKey(lessonMenuKey)}
                  style={styles.menuItem}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.menuItemText}>{s('planMyYear.multiSubjectUnits.draftMoveLessonToUnit')}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => deleteLesson(unitIdx, lessonIdx)}
                style={styles.menuItem}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={[styles.menuItemText, { color: ERROR }]}>{s('planMyYear.multiSubjectUnits.draftDeleteLesson')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </>,
      document.body,
    );
  };

  const openUnitMenu = useCallback((unitIdx, e) => {
    setDraftBuilderLessonMenuKey(null);
    setDraftBuilderMovePickKey(null);
    if (Platform.OS === 'web') {
      const prev = draftBuilderUnitMenuKey;
      if (prev === unitIdx) {
        closeWebDraftUnitMenu();
        return;
      }
      const el = e?.currentTarget || e?.nativeEvent?.currentTarget || e?.nativeEvent?.target;
      const r = el?.getBoundingClientRect?.();
      if (r) {
        setWebDraftUnitMenuLayout({
          top: r.bottom + 4,
          right: typeof window !== 'undefined' ? window.innerWidth - r.right : 0,
        });
        setDraftBuilderUnitMenuKey(unitIdx);
      }
      return;
    }
    setDraftBuilderUnitMenuKey((k) => (k === unitIdx ? null : unitIdx));
  }, [draftBuilderUnitMenuKey, closeWebDraftUnitMenu]);

  const openLessonMenu = useCallback((unitIdx, lessonIdx, e) => {
    setDraftBuilderUnitMenuKey(null);
    const lessonMenuKey = `${unitIdx}-${lessonIdx}`;
    if (Platform.OS === 'web') {
      const prevKey = draftBuilderLessonMenuKey;
      if (prevKey === lessonMenuKey) {
        closeWebDraftLessonMenu();
        return;
      }
      setDraftBuilderMovePickKey(null);
      const el = e?.currentTarget || e?.nativeEvent?.currentTarget || e?.nativeEvent?.target;
      const r = el?.getBoundingClientRect?.();
      if (r) {
        setWebDraftLessonMenuLayout({
          top: r.bottom + 4,
          right: typeof window !== 'undefined' ? window.innerWidth - r.right : 0,
        });
        setDraftBuilderLessonMenuKey(lessonMenuKey);
      }
      return;
    }
    setDraftBuilderMovePickKey(null);
    setDraftBuilderLessonMenuKey((k) => (k === lessonMenuKey ? null : lessonMenuKey));
  }, [draftBuilderLessonMenuKey, closeWebDraftLessonMenu]);

  const displayTitle = headerTitle
    || (loadedExisting ? `Edit units — ${subjectName || 'Subject'}` : 'Add units');

  if (!visible && !embedded) return null;

  const units = draft.units || [];

  const editorBody = (
    <>
      <ScrollView
        style={[styles.scroll, embedded && styles.embeddedScroll]}
        contentContainerStyle={[styles.scrollContent, embedded && styles.embeddedScrollContent]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={{ gap: 14 }}>
          {units.map((unit, unitIdx) => {
            const isExpanded = expandedUnits.has(unitIdx);
            const lessons = unit.lessons || [];
            const lessonCount = lessons.length;
            const unitDropProps = typeof getUnitDropWebProps === 'function'
              ? getUnitDropWebProps(unitIdx)
              : {};
            const {
              style: unitDropStyle,
              onDrop: onAssignmentUnitDrop,
              onDragOver: onAssignmentDragOver,
              onDragEnter: onAssignmentDragEnter,
              onDragLeave: onAssignmentDragLeave,
              ...restUnitDropProps
            } = unitDropProps;

            const handleAssignmentDropOnUnit = (ev) => {
              onAssignmentUnitDrop?.(ev);
            };

            const handleLessonRowDrop = (ev, lessonIdx) => {
              const p = readDraftLessonDragPayload(ev);
              if (p) {
                if (p.fromUnit === unitIdx && p.fromLesson === lessonIdx) return;
                moveDraftLessonToUnit(p.fromUnit, p.fromLesson, unitIdx, lessonIdx);
                return;
              }
              handleAssignmentDropOnUnit(ev);
            };

            const handleUnitEndDrop = (ev) => {
              const p = readDraftLessonDragPayload(ev);
              if (p) {
                moveDraftLessonToUnit(p.fromUnit, p.fromLesson, unitIdx, null);
                return;
              }
              handleAssignmentDropOnUnit(ev);
            };

            const handleUnitCardDragOver = (ev) => {
              if (ev?.dataTransfer) ev.dataTransfer.dropEffect = 'move';
              onAssignmentDragOver?.(ev);
            };

            return (
              <View key={unit.temp_id || unitIdx} style={styles.sectionBlock}>
                <WebDropView
                  style={[styles.unitCard, unitDropStyle]}
                  onDragOver={Platform.OS === 'web' ? handleUnitCardDragOver : undefined}
                  onDragEnter={onAssignmentDragEnter}
                  onDragLeave={onAssignmentDragLeave}
                  onDrop={Platform.OS === 'web' ? handleUnitEndDrop : undefined}
                  {...restUnitDropProps}
                >
                      <View style={styles.unitHeaderRow}>
                        <TouchableOpacity
                          onPress={() => {
                            setExpandedUnits((prev) => {
                              const next = new Set(prev);
                              if (next.has(unitIdx)) next.delete(unitIdx);
                              else next.add(unitIdx);
                              return next;
                            });
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                          style={{ padding: 4 }}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          {isExpanded ? <ChevronUp size={18} color={MUTED} /> : <ChevronDown size={18} color={MUTED} />}
                        </TouchableOpacity>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <TextInput
                            style={styles.unitTitleInput}
                            value={unit.title || ''}
                            onChangeText={(v) => updateUnit(unitIdx, 'title', v)}
                            placeholder={`Unit ${unitIdx + 1}`}
                            placeholderTextColor={MUTED}
                            {...(Platform.OS === 'web' && { cursor: 'text' })}
                          />
                          <Text style={styles.unitSubtitle}>
                            {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}
                          </Text>
                        </View>
                        <View style={{ position: 'relative', zIndex: 20 }}>
                          <TouchableOpacity
                            onPress={(e) => openUnitMenu(unitIdx, e)}
                            style={{ padding: 6 }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel={s('planMyYear.multiSubjectUnits.draftLessonMore')}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <MoreVertical size={18} color={MUTED} />
                          </TouchableOpacity>
                          {draftBuilderUnitMenuKey === unitIdx && Platform.OS !== 'web' ? (
                            <View style={styles.inlineMenu}>
                              {unitIdx > 0 ? (
                                <TouchableOpacity onPress={() => moveUnitFixed(unitIdx, -1)} style={styles.menuItem}>
                                  <Text style={styles.menuItemText}>{s('courseStructure.manualBuilder.moveUp')}</Text>
                                </TouchableOpacity>
                              ) : null}
                              {unitIdx < units.length - 1 ? (
                                <TouchableOpacity onPress={() => moveUnitFixed(unitIdx, 1)} style={styles.menuItem}>
                                  <Text style={styles.menuItemText}>{s('courseStructure.manualBuilder.moveDown')}</Text>
                                </TouchableOpacity>
                              ) : null}
                              <TouchableOpacity onPress={() => addLesson(unitIdx)} style={styles.menuItem}>
                                <Text style={styles.menuItemText}>{s('planMyYear.multiSubjectUnits.draftUnitAddLesson')}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => addDraftUnitBelowIndex(unitIdx)} style={styles.menuItem}>
                                <Text style={styles.menuItemText}>{s('planMyYear.multiSubjectUnits.draftUnitAddUnitBelow')}</Text>
                              </TouchableOpacity>
                            </View>
                          ) : null}
                        </View>
                        {units.length > 1 ? (
                          <TouchableOpacity
                            onPress={() => deleteUnit(unitIdx)}
                            style={{ padding: 4 }}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Trash2 size={16} color={ERROR} />
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      {isExpanded ? (
                        <View style={styles.unitLessonsWrap}>
                          <View style={styles.timelineList}>
                            {lessons.map((lesson, lessonIdx) => {
                              const lessonMenuKey = `${unitIdx}-${lessonIdx}`;
                              const lessonMenuOpen = draftBuilderLessonMenuKey === lessonMenuKey;

                              return (
                                <View key={lesson.temp_id || lessonIdx} style={styles.lessonBlock}>
                                <WebDropView
                                  style={[
                                    styles.lessonRow,
                                    lessonIdx > 0 && styles.lessonRowBorder,
                                    Platform.OS !== 'web' && lessonMenuOpen && { zIndex: 60, elevation: 20 },
                                  ]}
                                  onDragOver={Platform.OS === 'web' ? (ev) => {
                                    if (ev?.dataTransfer) ev.dataTransfer.dropEffect = 'move';
                                  } : undefined}
                                  onDrop={Platform.OS === 'web' ? (ev) => handleLessonRowDrop(ev, lessonIdx) : undefined}
                                >
                                  <View style={styles.lessonRowInner}>
                                    {Platform.OS === 'web' ? (
                                      <WebDragHandle
                                        enabled
                                        onDragStart={(ev) => {
                                          writeWebDragPayload(ev, DRAFT_LESSON_DRAG_MIME, {
                                            fromUnit: unitIdx,
                                            fromLesson: lessonIdx,
                                          });
                                        }}
                                        style={styles.gripHandle}
                                        accessibilityLabel={s('planMyYear.multiSubjectUnits.draftDragLessonA11y')}
                                      >
                                        <GripVertical size={16} color={MUTED} />
                                      </WebDragHandle>
                                    ) : (
                                      <View style={styles.mobileReorder}>
                                        <TouchableOpacity
                                          onPress={() => moveLesson(unitIdx, lessonIdx, -1)}
                                          disabled={lessonIdx === 0}
                                          style={{ padding: 2 }}
                                          {...(Platform.OS === 'web' && { cursor: lessonIdx === 0 ? 'default' : 'pointer' })}
                                        >
                                          <ChevronUp size={14} color={lessonIdx === 0 ? '#e5e7eb' : MUTED} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          onPress={() => moveLesson(unitIdx, lessonIdx, 1)}
                                          disabled={lessonIdx === lessons.length - 1}
                                          style={{ padding: 2 }}
                                          {...(Platform.OS === 'web' && {
                                            cursor: lessonIdx === lessons.length - 1 ? 'default' : 'pointer',
                                          })}
                                        >
                                          <ChevronDown
                                            size={14}
                                            color={lessonIdx === lessons.length - 1 ? '#e5e7eb' : MUTED}
                                          />
                                        </TouchableOpacity>
                                      </View>
                                    )}
                                    <Text style={styles.lessonBullet}>•</Text>
                                    <View style={styles.lessonTitleFieldWrap}>
                                      <TextInput
                                        style={styles.lessonTitleInput}
                                        value={lesson.title || ''}
                                        onChangeText={(v) => updateLesson(unitIdx, lessonIdx, 'title', v)}
                                        placeholder="Lesson title"
                                        placeholderTextColor={MUTED}
                                        {...(Platform.OS === 'web' && { cursor: 'text' })}
                                      />
                                      {embedded && typeof getLessonScheduleLabel === 'function' ? (
                                        <Text style={styles.lessonScheduleMeta} numberOfLines={1}>
                                          {getLessonScheduleLabel(lessonIdFromDraftTempId(lesson.temp_id)) || 'Not scheduled'}
                                        </Text>
                                      ) : null}
                                    </View>
                                    <View style={{ position: 'relative', zIndex: 15 }}>
                                      <TouchableOpacity
                                        onPress={(e) => openLessonMenu(unitIdx, lessonIdx, e)}
                                        style={{ padding: 4 }}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        accessibilityLabel={s('planMyYear.multiSubjectUnits.draftLessonMore')}
                                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                      >
                                        <MoreVertical size={16} color={MUTED} />
                                      </TouchableOpacity>
                                      {lessonMenuOpen && Platform.OS !== 'web' ? (
                                        <View style={[styles.inlineMenu, { minWidth: 200 }]}>
                                          {lessonIdx > 0 ? (
                                            <TouchableOpacity onPress={() => moveLesson(unitIdx, lessonIdx, -1)} style={styles.menuItem}>
                                              <Text style={styles.menuItemText}>{s('courseStructure.manualBuilder.moveUp')}</Text>
                                            </TouchableOpacity>
                                          ) : null}
                                          {lessonIdx < lessons.length - 1 ? (
                                            <TouchableOpacity onPress={() => moveLesson(unitIdx, lessonIdx, 1)} style={styles.menuItem}>
                                              <Text style={styles.menuItemText}>{s('courseStructure.manualBuilder.moveDown')}</Text>
                                            </TouchableOpacity>
                                          ) : null}
                                          <TouchableOpacity
                                            onPress={() => deleteLesson(unitIdx, lessonIdx)}
                                            style={styles.menuItem}
                                          >
                                            <Text style={[styles.menuItemText, { color: ERROR }]}>
                                              {s('planMyYear.multiSubjectUnits.draftDeleteLesson')}
                                            </Text>
                                          </TouchableOpacity>
                                        </View>
                                      ) : null}
                                    </View>
                                  </View>
                                </WebDropView>
                                  {typeof renderAfterLesson === 'function'
                                    ? renderAfterLesson(unitIdx, lessonIdx, lesson)
                                    : null}
                                </View>
                              );
                            })}
                            {Platform.OS === 'web' && lessonCount > 0 ? (
                              <WebDropView
                                style={styles.dropZone}
                                onDragOver={(ev) => {
                                  if (ev?.dataTransfer) ev.dataTransfer.dropEffect = 'move';
                                }}
                                onDrop={handleUnitEndDrop}
                              />
                            ) : null}
                            <TouchableOpacity
                              onPress={() => addLesson(unitIdx)}
                              style={styles.addLessonLink}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <Plus size={16} color={ACCENT} />
                              <Text style={styles.addLessonLinkText}>{s('planMyYear.multiSubjectUnits.addLessonLink')}</Text>
                            </TouchableOpacity>
                            {typeof renderAfterUnitLessons === 'function'
                              ? renderAfterUnitLessons(unitIdx)
                              : null}
                          </View>
                        </View>
                      ) : null}
                </WebDropView>
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.addUnitLink}
          onPress={addUnit}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Plus size={16} color={ACCENT} />
          <Text style={styles.addLessonLinkText}>{s('planMyYear.multiSubjectUnits.addUnitLink')}</Text>
        </TouchableOpacity>
      </ScrollView>

      {embedded ? (
        autoSave && (saving || dirty) ? (
          <View style={styles.embeddedStatusRow}>
            <Text style={styles.embeddedStatusText}>
              {saving ? 'Saving changes…' : 'Saving soon…'}
            </Text>
          </View>
        ) : null
      ) : (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleClose}
            disabled={saving}
            {...(Platform.OS === 'web' && { cursor: saving ? 'not-allowed' : 'pointer' })}
          >
            <Text style={styles.cancelText}>{s('global.actions.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, (saving || blockingError) && styles.saveButtonDisabled]}
            onPress={() => handleSave({ closeOnSuccess: true })}
            disabled={saving || Boolean(blockingError)}
            {...(Platform.OS === 'web' && { cursor: saving || blockingError ? 'not-allowed' : 'pointer' })}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <View style={styles.saveInner}>
                <Sparkles size={14} color="#FFFFFF" />
                <Text style={styles.saveText}>Save</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  if (embedded) {
    return (
      <View style={styles.embeddedRoot}>
        {editorBody}
        {renderWebDraftUnitMenuPortal()}
        {renderWebDraftLessonMenuPortal()}
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View ref={overlayRef} style={styles.overlay} collapsable={false}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        <View style={styles.shell}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{displayTitle}</Text>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeCircle}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <X size={20} color={MUTED} />
            </TouchableOpacity>
          </View>
          {editorBody}
        </View>
      </View>
      {renderWebDraftUnitMenuPortal()}
      {renderWebDraftLessonMenuPortal()}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...(Platform.OS === 'web' && { zIndex: 10002 }),
  },
  shell: {
    width: '100%',
    maxWidth: 860,
    maxHeight: Platform.OS === 'web' ? '90vh' : '90%',
    backgroundColor: BG,
    borderRadius: 24,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 30px 60px rgba(0, 0, 0, 0.12), 0 10px 30px rgba(0, 0, 0, 0.08)',
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    paddingTop: 36,
    paddingBottom: 16,
    backgroundColor: BG,
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: FG,
    paddingRight: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5EAF1',
    backgroundColor: BG,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 36,
    paddingBottom: 20,
  },
  embeddedRoot: {
    width: '100%',
    overflow: 'visible',
    minHeight: 120,
  },
  embeddedScroll: {
    flexGrow: 1,
    width: '100%',
  },
  embeddedScrollContent: {
    paddingHorizontal: 0,
    paddingBottom: 8,
  },
  embeddedStatusRow: {
    paddingTop: 4,
    paddingBottom: 2,
    alignItems: 'flex-end',
  },
  embeddedStatusText: {
    fontSize: 12,
    color: MUTED,
  },
  lessonTitleFieldWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  lessonScheduleMeta: {
    fontSize: 12,
    color: MUTED,
    paddingHorizontal: 8,
    paddingBottom: 2,
  },
  errorBanner: {
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
  errorText: { fontSize: 13, color: '#b91c1c' },
  sectionBlock: {
    gap: 8,
    overflow: 'visible',
  },
  unitCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: '#fafbfc',
    overflow: Platform.OS === 'web' ? 'visible' : 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(15,23,42,0.06)' } : {}),
  },
  unitHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  unitTitleInput: {
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginBottom: 2,
    color: FG,
    backgroundColor: 'transparent',
    borderWidth: 0,
    ...(Platform.OS === 'web' && {
      outlineStyle: 'none',
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  unitSubtitle: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  unitLessonsWrap: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: '#f8fafc',
    paddingBottom: 8,
  },
  timelineList: {
    marginHorizontal: 10,
    marginTop: 8,
    paddingHorizontal: 4,
    gap: 4,
  },
  lessonBlock: {
    gap: 4,
  },
  lessonRow: {
    paddingVertical: 4,
    paddingRight: 4,
  },
  lessonRowBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
    paddingTop: 8,
  },
  lessonRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gripHandle: {
    paddingVertical: 6,
    paddingHorizontal: 2,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? {
      cursor: 'grab',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      touchAction: 'none',
    } : {}),
  },
  mobileReorder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 2,
  },
  lessonBullet: {
    color: MUTED,
    fontSize: 14,
    fontWeight: '700',
    width: 12,
    textAlign: 'center',
    marginRight: 2,
  },
  lessonTitleInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 0,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    color: FG,
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  dropZone: {
    minHeight: 14,
    marginTop: 6,
    marginBottom: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(15,23,42,0.04)',
  },
  addLessonLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingTop: 10,
    gap: 6,
  },
  addLessonLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: ACCENT,
  },
  addUnitLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
  },
  menuBackdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100000,
  },
  menuPanel: {
    position: 'fixed',
    minWidth: 216,
    maxWidth: 320,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 4,
    zIndex: 100001,
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(15,23,42,0.16)' } : {}),
  },
  inlineMenu: {
    position: 'absolute',
    right: 0,
    top: '100%',
    marginTop: 4,
    minWidth: 216,
    backgroundColor: BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 4,
    zIndex: 2000,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }
      : { elevation: 8 }),
  },
  menuItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  menuItemBack: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  menuItemBackText: {
    fontSize: 13,
    fontWeight: '600',
    color: ACCENT,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'web' ? 24 : 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: BG,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  saveButton: {
    minHeight: 50,
    minWidth: 120,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.65 },
  saveInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
