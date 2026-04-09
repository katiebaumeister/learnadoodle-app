/**
 * Plan Year Modal
 * Academic year planning with constraint solver and holiday management
 * 
 * Two paths:
 * 1. Non-homeschool fast path: Defaults + typical holidays
 * 2. Homeschool constraint solver: Pick 3 vars, compute 4th
 */

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
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
  Alert,
} from 'react-native';

const TARGET_INSTRUCTIONAL_DAYS_DEFAULT = 180;
import { 
  X, 
  Calendar, 
  ChevronDown, 
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Plus, 
  Trash2, 
  Save,
  FileText,
  Clock,
  Target,
  Check,
  CircleCheck,
  Info,
  LayoutGrid,
  Upload,
  List,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Paperclip,
  Edit,
  MoreVertical,
  Pencil,
  RotateCcw,
  GripVertical,
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import ConfirmDialog from '../ConfirmDialog';
import AddMaterialModal from '../materials/AddMaterialModal';
import { useToast } from '../Toast';
import {
  createDefaultAcademicYear,
  recalculateAcademicYear,
  saveAcademicYear,
  applyToCalendar,
  clearPlaceholders,
  getAcademicYear,
  getAcademicYearPlanEvents,
  getPlanHealth,
  invalidatePlanHealthCache,
  computeSchedulePotential,
  getPublicHolidaysForRange,
} from '../../lib/services/academicYearClient';
import { getPlanDefaultsFromSettings, getAcademicYearExclusions, getFamilyPlannerSettings, addExclusion, saveExcludedPublicHolidayDates, saveFamilyPlannerSettings } from '../../lib/services/plannerSettingsClient';
import { supabase } from '../../lib/supabase';
import { deleteEvent as deletePlannerEventSoft, restoreEventFromTrash } from '../../lib/services/plannerClientWithOffline';
import { t, s, STRINGS } from '../../lib/i18n/strings';
import { buildCurriculum, commitCurriculum, previewPacing, parsePlainTextStream, generateCurriculumDraftStream, commitManualDraft, commitParsedDraft, commitGeneratedDraft, getManualCommitValidationError, fetchSubjectCurriculumEventsStructure } from '../../lib/services/curriculumClient';
import { buildHumanPreviewFromPartialJson, buildImportStreamPreviewDisplay } from '../../lib/parseStreamHumanPreview';
import { getMaterials } from '../../lib/services/materialsClient';
import {
  PLAN_MY_YEAR_LOGISTICS_FIRST,
  PLAN_MY_YEAR_MULTI_SUBJECT_CADENCE,
  PLAN_STEP_KEYS,
  getInitialPlanStep,
  getSourceNextStep,
  getAfterUnitStructureContinue,
  getPreviewBackStep,
  showMultiSubjectCadenceHint,
} from './planYearFlowConfig';
import {
  analyzePlanCadenceConflicts,
  applyCadenceFixForConflict,
  applyCadenceTimeShiftsUntilStable,
  conflictCounterpartyLabel,
  conflictCounterpartyTimeLabel,
  findConflictsForPreviewLine,
  getNextCadenceTimeShift,
  getSuggestedTimeForConflict,
} from '../../lib/utils/planCadenceConflicts';
import {
  getAcademicYearsPickerCache,
  setAcademicYearsPickerCache,
  getPlanEditListTimesForPlans,
  mergePlanEditListTimesCache,
  mergePlanYearFullDataCache,
  getPlanYearFullDataFromCache,
  dropPlanYearFullDataCacheEntry,
  dropPlanEditListTimesCacheEntry,
  formatTimeRange,
  getPlanBlocksTimesSummary,
} from '../../lib/planEditListCache';
import { formatSubjectPlanHeading } from '../../lib/formatSubjectPlanHeading';
import { prefetchPlanEditListForFamily } from '../../lib/services/plannerPrefetch';

// Constants for curriculum building
const SOURCE_TYPES = [
  { value: 'auto_detect', labelKey: 'sourceTypeAuto' },
  { value: 'syllabus', labelKey: 'sourceTypeSyllabus' },
  { value: 'lesson_list', labelKey: 'sourceTypeLessonList' },
  { value: 'pacing_guide', labelKey: 'sourceTypePacingGuide' },
  { value: 'weekly_plan', labelKey: 'sourceTypeWeeklyPlan' },
  { value: 'course_outline', labelKey: 'sourceTypeCourseOutline' },
];

const PARSE_MODES = [
  { value: 'auto_detect', labelKey: 'parseModeAuto' },
  { value: 'unit_based', labelKey: 'parseModeUnitBased' },
  { value: 'lesson_based', labelKey: 'parseModeLessonBased' },
  { value: 'week_based', labelKey: 'parseModeWeekBased' },
  { value: 'date_based', labelKey: 'parseModeDateBased' },
];

const LESSON_TYPES = ['lesson', 'project', 'exam', 'assignment', 'activity'];

/** Unscheduled manual curriculum rows use DB placeholder start_ts; hide that in UI. */
function curriculumEventDisplayDate(event) {
  const meta = event?.curriculum_metadata || {};
  if (meta.unscheduled_placeholder) return null;
  const ts = event?.start_ts;
  if (!ts) return null;
  return typeof ts === 'string' ? ts.slice(0, 10) : new Date(ts).toISOString().split('T')[0];
}

function mapStoredLessonTypeToManualBuilder(t) {
  const lt = String(t || 'lesson').toLowerCase();
  if (lt === 'assessment' || lt === 'quiz') return 'exam';
  if (LESSON_TYPES.includes(lt)) return lt;
  return 'lesson';
}

/** Empty manual builder: one unit, no lessons (skip “Start building” tap). */
function createInitialManualDraft() {
  return {
    title: null,
    units: [
      {
        temp_id: `temp-${Date.now()}`,
        title: 'Unit 1',
        sequence_index: 1,
        description: null,
        lessons: [],
      },
    ],
  };
}

/** Keep `sequence_index` aligned after unit/lesson structural edits. */
function resequenceDraftUnits(units) {
  return (units || []).map((unit, ui) => ({
    ...unit,
    sequence_index: ui + 1,
    lessons: (unit.lessons || []).map((le, li) => ({
      ...le,
      sequence_index: li + 1,
    })),
  }));
}

const DRAFT_LESSON_DRAG_MIME = 'application/json';

function readDraftLessonDragPayload(e) {
  if (Platform.OS !== 'web') return null;
  const dt = e?.nativeEvent?.dataTransfer ?? e?.dataTransfer;
  if (!dt?.getData) return null;
  try {
    const raw = dt.getData(DRAFT_LESSON_DRAG_MIME);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p.fromUnit !== 'number' || typeof p.fromLesson !== 'number') return null;
    return p;
  } catch (_) {
    return null;
  }
}

const PLAN_YEAR_IMPORT_DRAFT_STORAGE_PREFIX = 'ld:planYearImportDraft:v1:';

function planYearImportDraftStorageKey(familyId, subjectId, planSource) {
  const fid = familyId != null && String(familyId).trim() !== '' ? String(familyId) : 'none';
  const sid = subjectId != null && String(subjectId).trim() !== '' ? String(subjectId) : 'none';
  const src = planSource === 'upload' ? 'upload' : 'paste_plain';
  return `${PLAN_YEAR_IMPORT_DRAFT_STORAGE_PREFIX}${fid}:${sid}:${src}`;
}

function readPlanYearImportDraft(familyId, subjectId, planSource) {
  if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(planYearImportDraftStorageKey(familyId, subjectId, planSource));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function writePlanYearImportDraft(familyId, subjectId, planSource, payload) {
  if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(planYearImportDraftStorageKey(familyId, subjectId, planSource), JSON.stringify(payload));
  } catch (_) {}
}

function clearPlanYearImportDraft(familyId, subjectId, planSource) {
  if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(planYearImportDraftStorageKey(familyId, subjectId, planSource));
  } catch (_) {}
}

/** Map events.source from GET subject-events-structure to cadence row method keys. */
function mapEventSourceToCadenceMethod(source) {
  if (!source || typeof source !== 'string') return null;
  const v = source.trim().toLowerCase();
  if (v === 'manual') return 'paste';
  if (v === 'plain_text_parsed') return 'paste_plain';
  return null;
}

function manualDraftFromUnitStructureData(struct) {
  const units = struct?.units;
  if (!units?.length) return null;
  const uid = Date.now();
  return {
    title: null,
    units: units.map((u, ui) => ({
      temp_id: `loaded-${uid}-${ui}`,
      title: u.title || `Unit ${ui + 1}`,
      sequence_index: ui + 1,
      description: null,
      inferred: false,
      lessons: (u.lessons || []).map((le, li) => ({
        temp_id: le.id ? `evt-${le.id}` : `temp-l-${uid}-${ui}-${li}`,
        title: le.title || `Lesson ${li + 1}`,
        lesson_type: mapStoredLessonTypeToManualBuilder(le.type),
        sequence_index: li + 1,
        minutes_est: typeof le.minutes === 'number' && !Number.isNaN(le.minutes) ? le.minutes : 60,
        reference_date: le.date || null,
      })),
    })),
  };
}

const BG = '#ffffff';
const FG = '#111827';
const SUB = '#6b7280';
const BORDER = '#e5e7eb';
const CARD_BORDER = '#E6EAF2';
const MUTED = '#9ca3af';
const ACCENT = '#6BB3E8';
const ACCENT_LIGHT = 'rgba(133,196,242,0.2)';
const HIGHLIGHT_BG = 'rgba(107,179,232,0.15)';
const HIGHLIGHT_BORDER = '#6BB3E8';
const ERROR = '#ef4444';
const SUCCESS = '#10b981';
const WARNING = '#d97706';
const PRIMARY_BTN = '#85C4F2';
const CHIP_SELECTED_BG = 'rgba(133,196,242,0.2)';
const CHIP_SELECTED_BORDER = '#6BB3E8';
const CHIP_SELECTED_TEXT = '#6BB3E8';
const CHIP_BG_OPAQUE = '#d0e8f7'; // same hue as chip blue, lighter opaque tone
const ELIGIBILITY_CARD_BG = '#F7FBFF';
const ELIGIBILITY_CARD_BORDER = '#DDEAF5';
const ACCENT_BAR = '#81C1E1';
const SECONDARY_BTN_BORDER = '#CFE3F4';
const CARD_PADDING = 20;
const SECTION_SPACING = 20;
// Design tokens for Plan My Year step 1 (3-zone, depth, cards)
const SURFACE_ELEVATED = '#f8fafc';
const SURFACE_SUBTLE = '#f1f5f9';
const BORDER_SUBTLE = '#e2e8f0';
const BORDER_STRONG = '#cbd5e1';
const BRAND_500 = '#6BB3E8';
const BRAND_600 = '#5A9FD6';
const TEXT_SECONDARY = '#64748b';
/** Event details modal primary action (matches EventDetails createButton). */
const EVENT_DETAILS_PRIMARY_BG = '#85C4F2';
const EDIT_UNITS_PRIMARY_BUTTON_TEXT = {
  fontSize: 16,
  fontWeight: '500',
  color: '#FFFFFF',
  ...(Platform.OS === 'web' && {
    fontFamily: '"League Spartan", sans-serif',
  }),
};
const SECTION_GAP = 28;
const OPTION_GAP = 16;
const LABEL_INPUT_GAP = 6;
const INPUT_GAP = 12;
/** Logistics-first unit-structure overlay: stacked footer + dark primary (matches help-response modal pattern). */
const UNIT_STRUCTURE_OVERLAY_PRIMARY_BG = '#0f172a';

/** Align raw web `<input type="date">` with modal labels / `styles.input` (Cooper Hewitt + FG). */
const WEB_INPUT_FONT_FAMILY = '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const WEB_REF_DATE_INPUT_CLASS = 'plan-year-ref-date-input';

if (typeof document !== 'undefined' && Platform.OS === 'web') {
  const sid = 'plan-year-ref-date-input-font';
  if (!document.getElementById(sid)) {
    const el = document.createElement('style');
    el.id = sid;
    el.textContent = `
.${WEB_REF_DATE_INPUT_CLASS} {
  font-family: ${WEB_INPUT_FONT_FAMILY};
  font-size: 12px;
  font-weight: 500;
  color: ${FG};
}
.${WEB_REF_DATE_INPUT_CLASS}::-webkit-datetime-edit,
.${WEB_REF_DATE_INPUT_CLASS}::-webkit-datetime-edit-fields-wrapper,
.${WEB_REF_DATE_INPUT_CLASS}::-webkit-datetime-edit-text,
.${WEB_REF_DATE_INPUT_CLASS}::-webkit-datetime-edit-month-field,
.${WEB_REF_DATE_INPUT_CLASS}::-webkit-datetime-edit-day-field,
.${WEB_REF_DATE_INPUT_CLASS}::-webkit-datetime-edit-year-field {
  color: ${FG};
}
`;
    document.head.appendChild(el);
  }
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NUMBERS = [0, 1, 2, 3, 4, 5, 6];

function dateStringToDate(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return new Date();
  return new Date(ymd + 'T12:00:00');
}

function formatDateDisplay(ymd) {
  if (!ymd) return '';
  const d = dateStringToDate(ymd);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Short date for dense preview rows (no year). */
function formatDateShort(ymd) {
  if (!ymd) return '';
  const d = dateStringToDate(ymd);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "09:00–10:00" → "9–10"; keeps half-hours as "9:30–10:30". */
function compressSuggestedTimeForChip(label) {
  if (!label || typeof label !== 'string') return '';
  const normalized = label.replace(/\s+/g, '');
  const parts = normalized.split(/[–-]/);
  if (parts.length !== 2) return label;
  const strip = (s) => {
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return s;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (min === 0) return String(h);
    return `${h}:${String(min).padStart(2, '0')}`;
  };
  return `${strip(parts[0])}–${strip(parts[1])}`;
}

/** Flatten manual/upload draft units into ordered lessons for schedule preview (1-based index). */
function flattenUnitLessonsForPreview(units) {
  if (!Array.isArray(units)) return [];
  const out = [];
  let n = 0;
  for (const u of units) {
    const unitTitleRaw = u && u.title != null ? String(u.title).trim() : '';
    const unitTitle = unitTitleRaw || '';
    for (const l of u.lessons || []) {
      n += 1;
      const raw = l && l.title != null ? String(l.title).trim() : '';
      out.push({
        title: raw || `Lesson ${n}`,
        index: n,
        unitTitle: unitTitle || null,
      });
    }
  }
  return out;
}

/**
 * Zip cadence slot lines with curriculum lessons for one subject (same order as apply: chronological slots).
 */
function buildLessonSchedulePreviewRows(previewSlotLines, flatLessons, curriculumSubjectId, availableSlotLabel) {
  const sid =
    curriculumSubjectId != null && String(curriculumSubjectId).trim() !== ''
      ? String(curriculumSubjectId)
      : '';
  if (!sid || !flatLessons.length || !previewSlotLines.length) {
    return {
      rows: previewSlotLines.map((line) => ({ line, detailLine: null })),
      overflowCount: 0,
      hasCurriculumMapping: false,
      curriculumSubjectId: null,
    };
  }
  const q = flatLessons.map((l) => ({ ...l }));
  const rows = previewSlotLines.map((line) => {
    if (String(line.subjectId || '') !== sid) {
      return { line, detailLine: null };
    }
    if (q.length > 0) {
      const lesson = q.shift();
      const unitPart = lesson.unitTitle && String(lesson.unitTitle).trim() ? String(lesson.unitTitle).trim() : '';
      const detailLine = unitPart
        ? `${line.subjectName} · ${unitPart} · ${lesson.title}`.replace(/\s+/g, ' ').trim()
        : `${line.subjectName} · ${lesson.title}`.replace(/\s+/g, ' ').trim();
      return { line, detailLine };
    }
    return { line, detailLine: availableSlotLabel };
  });
  return { rows, overflowCount: q.length, hasCurriculumMapping: true, curriculumSubjectId: sid };
}

const CADENCE_PREVIEW_ROW_PAD_V = 8;
const CADENCE_PREVIEW_ROW_GAP = 5;
/** Dusty rose for conflict copy — soft, parent-friendly (not alert red). */
const CADENCE_CONFLICT_COPY = '#B89696';
const CADENCE_ROW_PAD_H = 8;

/** Dense year-view row: same padding/type for all states; conflict = ⚠ + soft rose text + accent link only (no bars/fills). */
function CadencePreviewSlotRow({
  line,
  detailLine,
  conflictDetail,
  showResolvedTint: _showResolvedTint,
  isLast = false,
  onMoveRowPress,
}) {
  const subjLine =
    detailLine ??
    (line.assigneeShortLabel
      ? `${line.subjectName} · ${line.assigneeShortLabel}`
      : line.childNames
        ? `${line.subjectName} · ${line.childNames}`
        : line.subjectName);

  const hasConflict = !!conflictDetail;
  const dateShort = formatDateShort(line.date);
  const timePart = line.timeLabel || '';
  const chipTime = conflictDetail?.suggestedTimeLabel
    ? compressSuggestedTimeForChip(conflictDetail.suggestedTimeLabel)
    : '';

  const rowShell = {
    paddingVertical: CADENCE_PREVIEW_ROW_PAD_V,
    marginBottom: isLast ? 0 : CADENCE_PREVIEW_ROW_GAP,
    paddingHorizontal: CADENCE_ROW_PAD_H,
  };

  const moveLink = chipTime && onMoveRowPress && (
    <TouchableOpacity
      onPress={onMoveRowPress}
      activeOpacity={0.75}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
    >
      <Text style={{ fontSize: 11, lineHeight: 15, fontWeight: '600', color: ACCENT }}>
        {t('planMyYear.cadenceConflicts.moveToChip', { time: chipTime })}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={rowShell}>
      <Text style={{ fontSize: 13, lineHeight: 18 }} numberOfLines={1} ellipsizeMode="tail">
        <Text style={{ fontWeight: '500', color: FG }}>{dateShort}</Text>
        <Text style={{ fontWeight: '500', color: FG }}>{` · ${timePart}`}</Text>
        <Text style={{ color: TEXT_SECONDARY, fontWeight: '400' }}>{` — ${subjLine}`}</Text>
      </Text>
      {hasConflict ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
          <Text style={{ fontSize: 11, lineHeight: 15, color: CADENCE_CONFLICT_COPY, fontWeight: '500' }}>
            ⚠ {t('planMyYear.cadenceConflicts.conflictsWithNamed', { name: conflictDetail.counterpartyLabel || '—' })}
            {conflictDetail.counterpartyTimeLabel ? ` ${conflictDetail.counterpartyTimeLabel}` : ''}
            {chipTime ? ' · ' : ''}
          </Text>
          {chipTime && onMoveRowPress ? (
            moveLink
          ) : chipTime ? (
            <Text style={{ fontSize: 11, lineHeight: 15, color: CADENCE_CONFLICT_COPY }}>
              {t('planMyYear.cadenceConflicts.moveToChip', { time: chipTime })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Light bulk action (footer / above CTA): not an alert — title, suggested window, outline button. */
function CadencePreviewConflictBulkBar({ conflictCount, suggestedTimeLabel, canMoveAll, onMoveAll }) {
  if (!conflictCount || !canMoveAll) return null;
  const title =
    conflictCount === 1
      ? t('planMyYear.cadenceConflicts.conflictsFoundOne')
      : t('planMyYear.cadenceConflicts.conflictsFoundMany', { count: conflictCount });
  const moveLabel = suggestedTimeLabel
    ? t('planMyYear.cadenceConflicts.moveAllToTime', { time: suggestedTimeLabel })
    : t('planMyYear.cadenceConflicts.moveAllFallback');

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        width: '100%',
        marginBottom: 12,
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: BORDER_SUBTLE,
      }}
    >
      <View style={{ flex: 1, minWidth: 160 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: FG, lineHeight: 20 }}>{title}</Text>
        {suggestedTimeLabel ? (
          <Text style={{ fontSize: 13, color: TEXT_SECONDARY, marginTop: 3, lineHeight: 18 }}>
            {t('planMyYear.cadenceConflicts.suggestionInline', { time: suggestedTimeLabel })}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity
        onPress={onMoveAll}
        disabled={!canMoveAll}
        accessibilityRole="button"
        accessibilityLabel={t('planMyYear.cadenceConflicts.acceptAllSuggestedA11y')}
        activeOpacity={0.88}
        style={{
          paddingVertical: 9,
          paddingHorizontal: 16,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: PRIMARY_BTN,
          backgroundColor: BG,
          ...(Platform.OS === 'web' && { cursor: 'pointer' }),
        }}
        {...(Platform.OS === 'web' && {
          onMouseEnter: (e) => {
            if (e?.currentTarget?.style) e.currentTarget.style.backgroundColor = ACCENT_LIGHT;
          },
          onMouseLeave: (e) => {
            if (e?.currentTarget?.style) e.currentTarget.style.backgroundColor = BG;
          },
        })}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: ACCENT }}>{moveLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function CadenceConflictsResolvedLine({ visible }) {
  if (!visible) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 }}>
      <CircleCheck size={15} color="#58B08C" strokeWidth={2} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#58B08C', letterSpacing: 0.2 }}>
        {t('planMyYear.cadenceConflicts.conflictsResolved')}
      </Text>
    </View>
  );
}

/** Slot time labels in lesson order (matches `flattenUnitLessonsForPreview` + `buildLessonSchedulePreviewRows`). */
function buildFlatLessonSlotTimes(previewPlan, availableSlotLabel) {
  if (!previewPlan?.hasCurriculumMapping) return [];
  const sid = String(previewPlan.curriculumSubjectId || '');
  const out = [];
  for (const { line, detailLine } of previewPlan.rows) {
    if (String(line.subjectId || '') !== sid) continue;
    if (detailLine && detailLine !== availableSlotLabel) {
      out.push({ dateLabel: line.dateLabel, timeLabel: line.timeLabel });
    }
  }
  return out;
}

/**
 * Apply instructional-slot dates from the plan preview onto lessons before commit so rows persist in-range
 * (not 2099 placeholders) and show on the calendar / plan year summaries.
 * Does not override a lesson that already has reference_date / cadence_metadata.reference_date.
 */
function mergeManualDraftWithInstructionalSlotDates(manualDraft, previewPlan, availableSlotLabel) {
  if (!manualDraft?.units?.length) return manualDraft;
  if (!previewPlan?.hasCurriculumMapping) return manualDraft;
  const sid = String(previewPlan.curriculumSubjectId || '');
  const slotDates = [];
  for (const { line, detailLine } of previewPlan.rows) {
    if (String(line.subjectId || '') !== sid) continue;
    if (detailLine && detailLine !== availableSlotLabel && line.date) {
      slotDates.push(line.date);
    }
  }
  if (slotDates.length === 0) return manualDraft;
  let idx = 0;
  const units = manualDraft.units.map((u) => ({
    ...u,
    lessons: (u.lessons || []).map((le) => {
      const ymd = slotDates[idx];
      idx += 1;
      if (!ymd) return le;
      const refTop = le.reference_date != null ? String(le.reference_date).trim() : '';
      const refCad =
        le.cadence_metadata && typeof le.cadence_metadata === 'object' && le.cadence_metadata.reference_date != null
          ? String(le.cadence_metadata.reference_date).trim()
          : '';
      const hasUserDate =
        /^\d{4}-\d{2}-\d{2}$/.test(refTop) ||
        /^\d{4}-\d{2}-\d{2}T/.test(refTop) ||
        /^\d{4}-\d{2}-\d{2}$/.test(refCad) ||
        /^\d{4}-\d{2}-\d{2}T/.test(refCad);
      if (hasUserDate) return le;
      const prevCad =
        le.cadence_metadata && typeof le.cadence_metadata === 'object' && !Array.isArray(le.cadence_metadata)
          ? { ...le.cadence_metadata }
          : {};
      return {
        ...le,
        reference_date: ymd,
        cadence_metadata: { ...prevCad, reference_date: ymd },
      };
    }),
  }));
  return { ...manualDraft, units };
}

/**
 * Heuristic structure label after paste (client-only).
 * @returns {'lessonBased'|'unitBased'|'weekBased'|'dateBased'|'outline'|null}
 */
function detectPastedStructureHintKey(text) {
  if (!text || !String(text).trim()) return null;
  const t = String(text);
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t) || (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}/i.test(t) && /\d{4}/.test(t))) {
    return 'dateBased';
  }
  if (/^week\s*\d+/im.test(t)) return 'weekBased';
  if (/^unit\s*\d+/im.test(t)) return 'unitBased';
  if (/^lesson\s*\d+/im.test(t) || /^\d+[.)]\s+\S/m.test(t)) return 'lessonBased';
  return 'outline';
}

function importParseHintLabelFromKey(key) {
  if (!key) return null;
  const map = {
    lessonBased: 'planMyYear.multiSubjectUnits.importParseHintLessonBased',
    unitBased: 'planMyYear.multiSubjectUnits.importParseHintUnitBased',
    weekBased: 'planMyYear.multiSubjectUnits.importParseHintWeekBased',
    dateBased: 'planMyYear.multiSubjectUnits.importParseHintDateBased',
    outline: 'planMyYear.multiSubjectUnits.importParseHintOutline',
  };
  const path = map[key];
  return path ? s(path) : null;
}

function estimateImportReviewFlagCount(rawText) {
  const lines = String(rawText || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 4) return 0;
  return lines.filter((line) => {
    if (line.length >= 14) return false;
    if (/^(unit|lesson|week)\s*\d+/i.test(line)) return false;
    if (/^\d+[.)]\s*\S/.test(line)) return false;
    return true;
  }).length;
}

/** Parse year_name into card lines; if " · " separated use as scope / subjects / date, else title + date. */
function parsePlanCardLines(ay) {
  const name = ay.year_name || 'Academic year';
  const dateRange = ay.start_date && ay.end_date
    ? `${formatDateDisplay(ay.start_date)} – ${formatDateDisplay(ay.end_date)}`
    : '';
  const parts = name.split(' · ').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return { line1: parts[0], line2: parts[1], line3: parts[2] };
  if (parts.length === 2) return { line1: parts[0], line2: null, line3: parts[1] };
  return { line1: name, line2: null, line3: dateRange };
}

/** Sort key for Edit plan list: subject title when present, else first line / year name. */
function editPlanListSortKey(ay) {
  const lines = parsePlanCardLines(ay);
  if (lines.line2) return lines.line2;
  return lines.line1 || ay?.year_name || '';
}

function extractPlanSubjectNamesFromYearName(ay) {
  const name = ay?.year_name || '';
  const parts = name.split(' · ').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return [];
  return parts[1]
    .split(',')
    .map((s) => s.replace(/\s*\+\d+\s*$/, '').trim())
    .filter(Boolean);
}

/**
 * True when at least one scheduling block references a subject id that still exists (e.g. after subject delete + recreate
 * with the same name, old block UUIDs are orphaned — subject page shows "Build plan" and slot lines show "Subject").
 */
function planBlocksReferenceAnyActiveSubject(planData, subjectList) {
  const ids = new Set(
    (Array.isArray(subjectList) ? subjectList : [])
      .filter((s) => s && s.id != null)
      .map((s) => String(s.id)),
  );
  const blocks = planData?.plan?.blocks;
  if (!Array.isArray(blocks) || blocks.length === 0) return true;
  const withSid = blocks.filter((b) => b.subject_id != null && String(b.subject_id).trim() !== '');
  if (withSid.length === 0) return true;
  return withSid.some((b) => ids.has(String(b.subject_id)));
}

/**
 * Hide Edit plan rows whose subject label no longer matches any family subject (e.g. subject removed on Subjects page).
 * Matches buildPlanYearName: segment is parts[1] when year_name uses " · "; multi-subject labels use commas and optional "+N".
 * When full plan is cached, also hide rows whose blocks only reference deleted subject ids (name can still match recreated subjects).
 */
function planRowSubjectsStillExist(ay, subjectList, familyId) {
  const subs = Array.isArray(subjectList) ? subjectList : [];
  const active = new Set(
    subs.map((s) => (s && s.name ? String(s.name).trim().toLowerCase() : '')).filter(Boolean),
  );
  const name = ay?.year_name || '';
  const parts = name.split(' · ').map((p) => p.trim()).filter(Boolean);
  let nameOk = true;
  if (parts.length >= 3) {
    const subjectPart = parts[1];
    if (!subjectPart) {
      nameOk = true;
    } else {
      const segments = subjectPart
        .split(',')
        .map((s) => s.replace(/\s*\+\d+\s*$/, '').trim())
        .filter(Boolean);
      if (segments.length === 0) nameOk = true;
      else nameOk = segments.every((seg) => active.has(seg.toLowerCase()));
    }
    if (!nameOk) return false;
  }
  if (!familyId || !ay?.id) return true;
  const cached = getPlanYearFullDataFromCache(familyId, ay.id);
  if (!cached?.plan?.blocks) return true;
  if (!planBlocksReferenceAnyActiveSubject(cached, subjectList)) return false;
  return true;
}

/** Dedupe and stable-sort children for Edit plan / subject-style dot clusters */
function uniqueChildrenForPlanDots(childList) {
  const list = Array.isArray(childList) ? childList : [];
  const seen = new Set();
  const out = [];
  list.forEach((c) => {
    if (!c || c.id == null) return;
    const k = String(c.id);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  });
  out.sort((a, b) =>
    String(a.first_name || a.name || '').localeCompare(String(b.first_name || b.name || ''), undefined, {
      sensitivity: 'base',
    })
  );
  return out;
}

/**
 * Child rows for Edit plan list dots — same prof1–10 colors as subject cards (via getChildColorFromAvatar).
 * - Multiple block child_ids → one dot per child (overlapping).
 * - Whole family (label or blocks with no child_ids) → dot for every family child.
 * - Otherwise matches line1 ("Enzo", "Enzo, Max") to children.
 */
function getPlanListRowChildrenForDots(cachedYearData, familyChildren, line1Label) {
  const childList = Array.isArray(familyChildren) ? familyChildren : [];
  const blocks = cachedYearData?.plan?.blocks;
  const idSet = new Set();
  if (Array.isArray(blocks)) {
    blocks.forEach((b) => {
      (b.child_ids || []).forEach((cid) => {
        if (cid) idSet.add(String(cid));
      });
    });
  }

  // Same rule as buildPlanYearName: blocks exist but none pin child_ids → whole family
  if (Array.isArray(blocks) && blocks.length > 0 && idSet.size === 0) {
    return uniqueChildrenForPlanDots(childList);
  }

  const byId = Array.from(idSet)
    .map((id) => childList.find((c) => c && String(c.id) === String(id)))
    .filter(Boolean);
  const deduped = [];
  const seen = new Set();
  byId.forEach((c) => {
    const k = String(c.id);
    if (seen.has(k)) return;
    seen.add(k);
    deduped.push(c);
  });
  if (deduped.length > 0) {
    deduped.sort((a, b) =>
      String(a.first_name || a.name || '').localeCompare(String(b.first_name || b.name || ''), undefined, {
        sensitivity: 'base',
      })
    );
    return deduped;
  }

  const label = (line1Label || '').trim();
  if (!label) return [];

  if (/^whole family$/i.test(label)) {
    return uniqueChildrenForPlanDots(childList);
  }

  const lower = (s) => String(s || '').toLowerCase();
  const parts = label.split(',').map((s) => s.trim()).filter(Boolean);
  const matched = [];
  parts.forEach((namePart) => {
    const c = childList.find(
      (ch) =>
        lower(ch?.first_name) === lower(namePart) ||
        lower(ch?.name) === lower(namePart)
    );
    if (c && !matched.some((m) => String(m.id) === String(c.id))) matched.push(c);
  });
  return matched;
}

/** Build display name for plan: "Student Name · Subject Name · Date range" */
function buildPlanYearName(options) {
  const {
    children = [],
    subjects = [],
    blocks = [],
    selectedSubjectIds = [],
    startDate,
    endDate,
  } = options;
  const childList = (children || []);
  const childIdSet = new Set();
  (blocks || []).forEach((b) => {
    (b.child_ids || []).forEach((cid) => {
      if (cid) childIdSet.add(String(cid));
    });
  });
  const distinctChildIds = Array.from(childIdSet);
  const studentName =
    distinctChildIds.length === 0
      ? 'Whole family'
      : distinctChildIds
          .map((id) => childList.find((c) => String(c.id) === String(id))?.first_name || childList.find((c) => String(c.id) === String(id))?.name || 'Child')
          .filter(Boolean)
          .join(', ') || 'Whole family';
  const subjectIds =
    blocks.length > 0
      ? [...new Set(blocks.map((b) => b.subject_id).filter(Boolean))]
      : selectedSubjectIds;
  const subjectNames = (subjects || []);
  const names = subjectIds
    .map((id) => subjectNames.find((s) => String(s.id) === String(id))?.name)
    .filter(Boolean);
  const subjectLabel =
    subjectIds.length === 0
      ? 'No subject'
      : names.length > 2
        ? names.slice(0, 2).join(', ') + ` +${names.length - 2}`
        : names.join(', ') || 'Subject';
  const dateRange =
    startDate && endDate ? `${formatDateDisplay(startDate)} – ${formatDateDisplay(endDate)}` : '';
  return [studentName, subjectLabel || 'Subjects', dateRange].filter(Boolean).join(' · ');
}

function toLocalYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Build plan logistics date range: survives unmount; avoids empty dates while prefilling from Supabase. */
let planBuildLogisticsDatesCache = { familyId: null, startDate: '', endDate: '' };

function getPlanBuildLogisticsDatesCache(familyId) {
  if (!familyId || planBuildLogisticsDatesCache.familyId !== familyId) return null;
  const { startDate, endDate } = planBuildLogisticsDatesCache;
  if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return null;
  }
  return { startDate, endDate };
}

function setPlanBuildLogisticsDatesCache(familyId, startDate, endDate) {
  if (!familyId || !startDate || !endDate) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return;
  planBuildLogisticsDatesCache = { familyId, startDate, endDate };
}

function defaultBuildPlanLogisticsDates() {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 23);
  return { startDate: toLocalYYYYMMDD(start), endDate: toLocalYYYYMMDD(end) };
}

function initialBuildPlanLogisticsDates(familyId, initialAcademicYearId) {
  if (initialAcademicYearId) return { startDate: '', endDate: '' };
  const c = familyId ? getPlanBuildLogisticsDatesCache(familyId) : null;
  if (c) return c;
  return defaultBuildPlanLogisticsDates();
}

/** Client-side parse of pasted plain text: one topic per line, optional unit/section headers. No backend call. */
function parsePastedListToCurriculum(pastedText, studentIds, startDateISO) {
  const lines = pastedText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  let currentUnitTitle = null;
  const lessons = [];
  const unitHeaderRe = /^Unit\s+\d+\s*:/i;
  const topicsIncludeRe = /^Topics?\s+may\s+include\s*:/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const looksLikeUnitHeader =
      unitHeaderRe.test(line) ||
      topicsIncludeRe.test(line) ||
      (line.endsWith(':') && line.length < 80);
    if (looksLikeUnitHeader) {
      currentUnitTitle = line.replace(/:$/, '').trim() || line;
    } else {
      lessons.push({
        title: line,
        sequence_index: lessons.length + 1,
        unit_topic: currentUnitTitle || undefined,
        minutes_est: 60,
      });
    }
  }
  if (lessons.length === 0) return null;
  const firstUnitTitle = lines.find((l) => unitHeaderRe.test(l) || topicsIncludeRe.test(l));
  const unitTitle = (firstUnitTitle && firstUnitTitle.replace(/:$/, '').trim()) || 'Pasted list';
  const schedule_map = lessons.map((_, i) => ({
    sequence_index: i + 1,
    recommended_day_offset: i,
  }));
  return {
    unit: {
      title: unitTitle,
      student_ids: studentIds,
      source_type: 'topic',
      total_minutes_est: lessons.length * 60,
      weeks_est: Math.max(1, Math.ceil(lessons.length / 5)),
    },
    lessons,
    pacing: {
      start_date: startDateISO,
      strategy: 'fit_openings',
      schedule_map,
    },
  };
}

/** JS getDay(): 0=Sun, 1=Mon, …, 6=Sat. Block weekdays use same convention. */
function getBlockOccurrenceDates(block, startDateYmd, endDateYmd, exclusionRanges) {
  if (!startDateYmd || !endDateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(startDateYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(endDateYmd)) return [];
  const weekdays = (block.weekdays || []).map((w) => (w != null ? parseInt(w, 10) : null)).filter((w) => Number.isInteger(w));
  if (weekdays.length === 0) return [];
  const start = dateStringToDate(startDateYmd);
  const end = dateStringToDate(endDateYmd);
  const out = [];
  const cur = new Date(start);
  while (cur <= end) {
    const ymd = toLocalYYYYMMDD(cur);
    const dayOfWeek = cur.getDay();
    if (!weekdays.includes(dayOfWeek)) {
      cur.setDate(cur.getDate() + 1);
      continue;
    }
    const inExclusion = (exclusionRanges || []).some(([s, e]) => ymd >= s && ymd <= e);
    if (!inExclusion) out.push(ymd);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function expandBreaksToHolidayDates(breaks) {
  const out = [];
  for (const b of breaks || []) {
    let d = new Date(b.start + 'T12:00:00Z');
    const end = new Date(b.end + 'T12:00:00Z');
    while (d <= end) {
      out.push({ date: d.toISOString().slice(0, 10), name: b.name || 'Break', type: 'BREAK' });
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return out;
}

/** Child ids this subject applies to: whole family if unset; else semicolon-separated ids on subject, intersected with family children. */
function getChildIdsForSubject(subject, children) {
  const familyIds = (children || []).map((c) => c?.id).filter(Boolean);
  if (familyIds.length === 0) return [];
  if (!subject) return [...familyIds];
  const cid = subject.child_id;
  if (cid == null || cid === '') return [...familyIds];
  const parsed = String(cid)
    .split(';')
    .map((id) => id.trim())
    .filter(Boolean);
  const matched = parsed.filter((id) => familyIds.some((fid) => String(fid) === String(id)));
  return matched.length > 0 ? matched : [...familyIds];
}

/** Same rules as logistics `previewSlotLines` — used to project instructional slots when extending the plan end date. */
function buildPreviewSlotLinesForPlanYear({
  startDate,
  endDate,
  blocks,
  customHolidays,
  customBreaks,
  baseSubjectList,
  children,
  allFamilyChildIds,
}) {
  if (!startDate || !endDate || blocks.length === 0) return [];
  const exclusionRanges = [
    ...(customHolidays || []).map((h) => [h.date, h.date]),
    ...(customBreaks || []).map((b) => [b.start || b.startDate, b.end || b.endDate].filter(Boolean)).filter((r) => r.length === 2),
  ];
  const lines = [];
  const childList = children || [];
  blocks.forEach((block) => {
    const subj = (baseSubjectList || []).find((s) => String(s.id) === String(block.subject_id));
    const subjectName = subj?.name || 'Subject';
    const timeLabel = block.all_day ? 'All day' : formatTimeRange(block.start_time, block.end_time);
    const blockChildIds =
      Array.isArray(block.child_ids) && block.child_ids.length > 0
        ? block.child_ids
        : block.subject_id
          ? getChildIdsForSubject(subj, childList)
          : allFamilyChildIds;
    const childNames = blockChildIds.length > 0
      ? blockChildIds.map((cid) => childList.find((c) => String(c.id) === String(cid))?.first_name || childList.find((c) => String(c.id) === String(cid))?.name || 'Child').join(', ')
      : 'Whole family';
    const assigneeShortLabel =
      blockChildIds.length === 1
        ? (
            String(
              childList.find((c) => String(c.id) === String(blockChildIds[0]))?.first_name ||
                childList.find((c) => String(c.id) === String(blockChildIds[0]))?.name ||
                'Child',
            ).trim() || 'Child'
          )
        : childNames;
    const dates = getBlockOccurrenceDates(block, startDate, endDate, exclusionRanges);
    dates.forEach((ymd) => {
      lines.push({
        date: ymd,
        dateLabel: formatDateDisplay(ymd),
        timeLabel,
        subjectName,
        subjectId: block.subject_id ?? null,
        blockId: block.block_id ?? null,
        childNames,
        assigneeShortLabel,
      });
    });
  });
  lines.sort((a, b) => a.date.localeCompare(b.date) || (a.timeLabel || '').localeCompare(b.timeLabel || ''));
  return lines;
}

function countPreviewSlotsForSubject(previewLines, curriculumSubjectId) {
  if (!curriculumSubjectId) return 0;
  const sid = String(curriculumSubjectId);
  return previewLines.filter((l) => String(l.subjectId || '') === sid).length;
}

/** Context for AI generate: dates, slot count, students, cadence — paired with free-form user notes. */
function buildPlanYearGeneratePlanningContext({
  startDate,
  endDate,
  previewSlotLines,
  subject,
  children,
  blocks,
}) {
  if (!subject?.id) return '';
  const sid = String(subject.id);
  const slotCount = countPreviewSlotsForSubject(previewSlotLines, sid);
  const childIds = getChildIdsForSubject(subject, children);
  const childLines = childIds.map((id) => {
    const c = (children || []).find((x) => String(x.id) === String(id));
    const name = (c?.first_name || c?.name || 'Student').trim();
    const grade = c?.grade_level ?? c?.grade;
    const g = grade != null && String(grade).trim() !== '' ? String(grade).trim() : null;
    return g ? `${name} (grade ${g})` : name;
  });
  const blockForSubject = (blocks || []).find((b) => String(b.subject_id) === sid);
  const subjectGrade =
    subject?.grade_level ??
    subject?.grade ??
    subject?.gradeLevel ??
    subject?.level ??
    null;
  const normalizedSubjectGrade =
    subjectGrade != null && String(subjectGrade).trim() !== '' ? String(subjectGrade).trim() : null;
  const lines = [
    `Subject: ${subject.name || 'Subject'}.`,
    `Plan date range: ${startDate || '(not set)'} through ${endDate || '(not set)'}.`,
    `Approximate instructional class sessions in this range for "${subject.name || 'this subject'}": ${slotCount} (from your plan calendar, weekdays, class times, and exclusions).`,
    'Aim for a total lesson count in the same ballpark as this slot count unless the user explicitly asks for a different scope.',
  ];
  if (normalizedSubjectGrade) {
    lines.push(`Subject grade level: ${normalizedSubjectGrade}.`);
  }
  lines.push(
    childLines.length
      ? `Children attached to this subject: ${childLines.join('; ')}.`
      : 'Children attached to this subject: none listed on the subject.'
  );
  if (childLines.length) {
    lines.push(`Students: ${childLines.join('; ')}.`);
  }
  if (blockForSubject) {
    const wd = (blockForSubject.weekdays || []).filter(Boolean);
    const daysLabel = wd.length ? wd.join(', ') : 'scheduled weekdays';
    const timeLabel = blockForSubject.all_day
      ? 'all day'
      : formatTimeRange(blockForSubject.start_time, blockForSubject.end_time);
    lines.push(`Typical cadence for this subject: ${daysLabel}; session window: ${timeLabel}.`);
  }
  return lines.join('\n');
}

function curriculumStructureCacheKey(subjectId, academicYearId = null) {
  return `${String(subjectId || '')}::${String(academicYearId || 'none')}`;
}

/** Minimum end date (YYYY-MM-DD) so this subject gains `overflowCount` more instructional slots vs current `endDate`. */
function findExtendedEndDateForLessonOverflow({
  startDate,
  endDate,
  overflowCount,
  curriculumSubjectId,
  blocks,
  customHolidays,
  customBreaks,
  baseSubjectList,
  children,
  allFamilyChildIds,
}) {
  if (
    !overflowCount ||
    overflowCount <= 0 ||
    !curriculumSubjectId ||
    !startDate ||
    !endDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
  ) {
    return null;
  }
  const linesThroughCurrent = buildPreviewSlotLinesForPlanYear({
    startDate,
    endDate,
    blocks,
    customHolidays,
    customBreaks,
    baseSubjectList,
    children,
    allFamilyChildIds,
  });
  const currentSlots = countPreviewSlotsForSubject(linesThroughCurrent, curriculumSubjectId);
  const targetSlots = currentSlots + overflowCount;
  let probe = dateStringToDate(endDate);
  const maxDays = 800;
  for (let i = 0; i < maxDays; i++) {
    const ymd = toLocalYYYYMMDD(probe);
    const lines = buildPreviewSlotLinesForPlanYear({
      startDate,
      endDate: ymd,
      blocks,
      customHolidays,
      customBreaks,
      baseSubjectList,
      children,
      allFamilyChildIds,
    });
    if (countPreviewSlotsForSubject(lines, curriculumSubjectId) >= targetSlots) {
      return ymd;
    }
    probe.setDate(probe.getDate() + 1);
  }
  return null;
}

function normalizeCadenceTime(t) {
  if (!t || typeof t !== 'string') return '09:00';
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(t);
  const h = Math.min(23, parseInt(m[1], 10));
  const min = Math.min(59, parseInt(m[2], 10));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Stable snapshot of weekday/time cadence per block (for dirty detection). */
function serializeCadenceSnapshot(blockList) {
  if (!Array.isArray(blockList) || blockList.length === 0) return '';
  const rows = blockList.map((b) => ({
    block_id: String(b.block_id ?? ''),
    weekdays: [...(b.weekdays || [])].sort((a, c) => a - c),
    start_time: normalizeCadenceTime(b.start_time || '09:00'),
    end_time: normalizeCadenceTime(b.end_time || '10:00'),
    all_day: !!b.all_day,
  }));
  rows.sort((a, b) => a.block_id.localeCompare(b.block_id));
  return JSON.stringify(rows);
}

function parseTimeToMinutesForBlock(s) {
  if (!s || typeof s !== 'string') return 0;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  const h = Math.min(23, parseInt(m[1], 10));
  const min = Math.min(59, parseInt(m[2], 10));
  return h * 60 + min;
}

/** Minutes per class session for a block (aligns with backend blocks_calculator). */
function blockMinutesForPlanYearBlock(block) {
  if (!block) return 0;
  if (block.all_day) return 6 * 60;
  const startMin = parseTimeToMinutesForBlock(block.start_time || '09:00');
  let endMin = parseTimeToMinutesForBlock(block.end_time || '10:00');
  if (endMin <= startMin) endMin += 24 * 60;
  return Math.max(0, endMin - startMin);
}

function LessonOverflowFollowUp({
  textStyle,
  overflowCount,
  extendEndYmd,
  curriculumSubjectId,
  hasCurriculumMapping,
  onApplyExtend,
  t,
}) {
  if (!overflowCount || overflowCount <= 0) return null;
  const showExtend = Boolean(hasCurriculumMapping && extendEndYmd && curriculumSubjectId);
  return (
    <View style={{ marginTop: 4 }}>
      <Text style={textStyle}>
        {t('planMyYear.multiSubjectUnits.lessonsOverflowPastRange', { count: overflowCount })}
      </Text>
      {showExtend ? (
        <>
          <Text style={[textStyle, { marginTop: 6, lineHeight: 16 }]}>
            {t('planMyYear.multiSubjectUnits.lessonsOverflowExtendSuggestion', {
              extraDays: overflowCount,
              endDate: formatDateDisplay(extendEndYmd),
            })}
          </Text>
          <TouchableOpacity
            onPress={() => onApplyExtend(extendEndYmd)}
            style={{ marginTop: 8, alignSelf: 'flex-start' }}
            activeOpacity={0.7}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={{ fontSize: 12, color: ACCENT, fontWeight: '600', textDecorationLine: 'underline' }}>
              {t('planMyYear.multiSubjectUnits.lessonsOverflowExtendCta', { endDate: formatDateDisplay(extendEndYmd) })}
            </Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

export default function PlanYearModal({
  visible,
  renderInline = false,
  familyId,
  children = [],
  subjects = [],
  fullSubjects = [],
  onClose,
  onComplete,
  onOpenBuildCurriculum = null,
  onOpenRebalance = null,
  onOpenPlannerSettings = null,
  /** Prefer this over window events so native / tests can open ManualCurriculumBuilderModal without DOM APIs. */
  onOpenManualCurriculumBuilder = null,
  initialAcademicYearId = null,
  initialPlanSummaryData = null,
  openForNewPlan = false,
  openToEditPlanList = false,
  openDirectlyToScope = false,
  fromSubjectDetail = false,
  /** When true (e.g. Subject "Edit plan"), skip the plan-summary screen and open logistics/editing directly. */
  skipInitialPlanSummary = false,
  highlightFromPlanHealth = false,
  initialSubjectId = null,
  initialMaterialId = null,
  initialUnitStructureMethod = null,
}) {
  const toast = useToast();
  const initialPlanSourceForDirectUnitOpen =
    initialUnitStructureMethod === 'manual'
      ? 'paste'
      : initialUnitStructureMethod === 'paste_plain'
        ? 'paste_plain'
        : initialUnitStructureMethod === 'upload'
          ? 'upload'
          : initialUnitStructureMethod === 'generate'
            ? 'generate'
            : 'placeholders';
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [planCreatedAt, setPlanCreatedAt] = useState(null);
  const [planUpdatedAt, setPlanUpdatedAt] = useState(null);
  const [isHomeschool, setIsHomeschool] = useState(false);
  
  // Fast path state
  const [fastPathYearId, setFastPathYearId] = useState(null);
  const [followGlobalHolidays, setFollowGlobalHolidays] = useState(true);
  const [countryCode, setCountryCode] = useState('US');
  const [regionCode, setRegionCode] = useState(null);
  
  // Constraint solver state
  const [mode, setMode] = useState('FIXED_END'); // FIXED_END | TARGET_DAYS | TARGET_HOURS
  const [startDate, setStartDate] = useState(() =>
    initialBuildPlanLogisticsDates(familyId, initialAcademicYearId).startDate
  );
  const [endDate, setEndDate] = useState(() =>
    initialBuildPlanLogisticsDates(familyId, initialAcademicYearId).endDate
  );
  const [targetDays, setTargetDays] = useState('');
  const [targetHours, setTargetHours] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState('');
  const [customHolidays, setCustomHolidays] = useState([]);
  const [customBreaks, setCustomBreaks] = useState([]); // Phase 3: { start, end, name }[]
  const [newBreakStart, setNewBreakStart] = useState('');
  const [newBreakEnd, setNewBreakEnd] = useState('');
  const [newBreakName, setNewBreakName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [academicYearId, setAcademicYearId] = useState(initialAcademicYearId || null);
  const [focusedInput, setFocusedInput] = useState(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [startDateCalendarMonth, setStartDateCalendarMonth] = useState(() => new Date());
  const [endDateCalendarMonth, setEndDateCalendarMonth] = useState(() => new Date());
  const [showNewHolidayDatePicker, setShowNewHolidayDatePicker] = useState(false);
  const [showNewBreakStartPicker, setShowNewBreakStartPicker] = useState(false);
  const [showNewBreakEndPicker, setShowNewBreakEndPicker] = useState(false);
  const [newHolidayDateCalendarMonth, setNewHolidayDateCalendarMonth] = useState(() => new Date());
  const [newBreakStartCalendarMonth, setNewBreakStartCalendarMonth] = useState(() => new Date());
  const [newBreakEndCalendarMonth, setNewBreakEndCalendarMonth] = useState(() => new Date());

  // Modal can stay mounted with visible=false; reset clears dates — restore cache or a local default before paint (no empty date range).
  useLayoutEffect(() => {
    if (!visible) return;
    if (initialAcademicYearId) return;
    if (academicYearId) return;
    if (startDate && endDate) return;
    const c = familyId ? getPlanBuildLogisticsDatesCache(familyId) : null;
    if (c?.startDate && c?.endDate) {
      setStartDate(c.startDate);
      setEndDate(c.endDate);
      return;
    }
    const d = defaultBuildPlanLogisticsDates();
    setStartDate(d.startDate);
    setEndDate(d.endDate);
  }, [visible, familyId, initialAcademicYearId, academicYearId, startDate, endDate]);
  
  // Calculated results
  const [calculatedResult, setCalculatedResult] = useState(null);
  const [recalculating, setRecalculating] = useState(false);
  
  // Phase 2: Which subjects / replace prompt (assignees removed — child_ids come from each subject on submit)
  const [selectedSubjectIds, setSelectedSubjectIds] = useState([]); // one or more subject ids (multi-subject cadence)
  /** When set (e.g. from cadence row), method → unit pipeline uses this subject even if multiple subjects are selected. */
  const [unitFocusSubjectId, setUnitFocusSubjectId] = useState(null);
  /** Set when curriculum is committed from unit structure (shown on Review). */
  const [lastSavedUnitSubjectId, setLastSavedUnitSubjectId] = useState(null);
  const [existingPlaceholdersCount, setExistingPlaceholdersCount] = useState(0);
  /** Calendar events in plan date range — cadence overlap vs existing schedule. */
  const [calendarEventsForConflicts, setCalendarEventsForConflicts] = useState([]);
  const [loadingCalendarEventsForConflicts, setLoadingCalendarEventsForConflicts] = useState(false);
  /** When true, conflict summary + Move all are hidden; user can reopen via amber dot on a row. */
  /** Brief success line after user accepts suggested times and overlaps clear. */
  const [cadenceConflictsResolvedFeedback, setCadenceConflictsResolvedFeedback] = useState(false);
  const pendingCadenceResolveAckRef = useRef(false);
  const [replacePlaceholders, setReplacePlaceholders] = useState(true);
  const [applyFromMode, setApplyFromMode] = useState('entire'); // 'entire' | 'today' | 'date'
  const [applyFromDate, setApplyFromDate] = useState(null); // YYYY-MM-DD when applyFromMode === 'date'
  const [showApplyFromDatePicker, setShowApplyFromDatePicker] = useState(false);
  const [applyFromDateCalendarMonth, setApplyFromDateCalendarMonth] = useState(() => new Date());
  const [showDeletePlanConfirm, setShowDeletePlanConfirm] = useState(false);
  const [deletingPlan, setDeletingPlan] = useState(false);
  const [planListContextMenu, setPlanListContextMenu] = useState(null); // { x, y, planId }
  const [suggestionAccepted, setSuggestionAccepted] = useState(false);

  // Phase 3: constraint mode + target (I need X days | X hours)
  const [planConstraintMode, setPlanConstraintMode] = useState('none');
  const [planTargetDays, setPlanTargetDays] = useState('180');
  const [planTargetHours, setPlanTargetHours] = useState('1000');

  // Blocks (Phase 1: schedule potential from blocks)
  const [blocks, setBlocks] = useState([]);
  /** Serialized cadence (weekdays + times) last saved / loaded — inline "Apply to plan" only when this differs. */
  const [cadenceBaselineKey, setCadenceBaselineKey] = useState(null);
  const [schedulePotential, setSchedulePotential] = useState(null);
  const [computingPotential, setComputingPotential] = useState(false);
  const schedulePotentialTimeoutRef = useRef(null);
  const schedulePotentialSnapshotCacheRef = useRef(new Map()); // yearId -> { key, data } — stable revisit in edit mode
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const academicYearIdRef = useRef(academicYearId);
  academicYearIdRef.current = academicYearId;

  // Plan health (includes manual counted events for "Manual instructional events counted" panel)
  const [planHealth, setPlanHealth] = useState(null);
  const [holidaysCollapsed, setHolidaysCollapsed] = useState(true);
  const [showAddExclusionForm, setShowAddExclusionForm] = useState(false);
  const [complianceCollapsed, setComplianceCollapsed] = useState(true);
  const [progressBreakdownExpanded, setProgressBreakdownExpanded] = useState(false);
  const [excludedPublicHolidayDates, setExcludedPublicHolidayDates] = useState([]); // dates (YYYY-MM-DD) to exclude from US public holidays
  const [showPublicHolidaysPicker, setShowPublicHolidaysPicker] = useState(false);
  const [publicHolidaysList, setPublicHolidaysList] = useState([]);
  const [publicHolidaysLoading, setPublicHolidaysLoading] = useState(false);
  const [planningScope, setPlanningScope] = useState(null); // null | 'full_year' | 'one_subject' | 'placeholders_only' | 'build_from_material'
  const [planSource, setPlanSource] = useState(initialPlanSourceForDirectUnitOpen); // 'placeholders' | 'upload' | 'link' | 'paste' | 'paste_plain' | 'generate'
  const [sourceUrl, setSourceUrl] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [materials, setMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const [materialDropdownPosition, setMaterialDropdownPosition] = useState({ top: 0, left: 0, width: 200, maxHeight: 300 });
  const materialButtonRef = useRef(null);
  const [showAddMaterialForUpload, setShowAddMaterialForUpload] = useState(false);
  const [sectionSourceExpanded, setSectionSourceExpanded] = useState(true);
  const [sectionWhoExpanded, setSectionWhoExpanded] = useState(false);
  const [sectionScheduleExpanded, setSectionScheduleExpanded] = useState(false);
  const [sectionDatesExpanded, setSectionDatesExpanded] = useState(false);
  // 'source' | 'unit_structure' | 'logistics' | 'preview' (scope removed). Entry step from getInitialPlanStep.
  const [planStep, setPlanStep] = useState(() =>
    initialUnitStructureMethod ? 'unit_structure' : getInitialPlanStep(PLAN_MY_YEAR_LOGISTICS_FIRST)
  );
  const [showPlanManagerView, setShowPlanManagerView] = useState(() => !!openToEditPlanList); // when true and pickerOnly, show Edit plan list; when false and pickerOnly, show entry choice (Plan Manager / Create New Plan)
  const [planSummaryYearId, setPlanSummaryYearId] = useState(null); // when set, show plan summary view (like event summary) before editing
  const [editingFromSummary, setEditingFromSummary] = useState(false); // true when we opened logistics from "Edit Plan" on plan summary (header = Edit > Review, Back = to summary)
  const [planSummaryData, setPlanSummaryData] = useState(null);
  const [planSummaryError, setPlanSummaryError] = useState(null);
  /** Slot keys (date|subject|start) struck through after delete; row stays visible until restored */
  const [planSummaryStrikeKeys, setPlanSummaryStrikeKeys] = useState([]);
  const planSummaryGhostLinesRef = useRef(new Map());
  const planSummaryCalendarRefreshTimerRef = useRef(null);
  const [planSummaryCurriculumBySubjectId, setPlanSummaryCurriculumBySubjectId] = useState({});
  const [planSummaryActualEvents, setPlanSummaryActualEvents] = useState([]);
  const curriculumStructureCacheRef = useRef(new Map());
  const [showPreviewScreen, setShowPreviewScreen] = useState(false);
  const [parsedContent, setParsedContent] = useState(null); // { unit, lessons, pacing } from buildCurriculum for upload/link/paste
  const [parsingContent, setParsingContent] = useState(false);
  const [parseContentError, setParseContentError] = useState(null);
  const [pacingPreview, setPacingPreview] = useState(null); // Phase 2: lesson-to-slot mapping before commit
  const [pacingPreviewLoading, setPacingPreviewLoading] = useState(false);
  const [pacingPreviewError, setPacingPreviewError] = useState(null);
  /** No-op state: draft pacing API preview was removed (client-side preview only). Keeping this setter defined prevents ReferenceError when React Fast Refresh leaves a stale effect/cleanup that still calls `setDraftUnitPacingPreview`. */
  const [, setDraftUnitPacingPreview] = useState(null);
  const [addContentCadenceInlineHint, setAddContentCadenceInlineHint] = useState(false);
  const [hoverSourceKey, setHoverSourceKey] = useState(null); // for step 1 option hover (web)
  const [hoverScopeKey, setHoverScopeKey] = useState(null); // for scope step option hover (web)
  const [entryChoiceHoverKey, setEntryChoiceHoverKey] = useState(null); // 'edit' | 'create' for arrow on hover
  const [footerCancelHover, setFooterCancelHover] = useState(false);
  const [highlightBlockIndex, setHighlightBlockIndex] = useState(null);
  /** Block row indices to outline when Apply fails: missing weekday chips for that subject/block. */
  const [cadenceWeekdayHighlightIndices, setCadenceWeekdayHighlightIndices] = useState([]);

  // Plan-level subject targets (editable in scope step; saved with plan)
  const [planSubjectTargetsOverride, setPlanSubjectTargetsOverride] = useState({}); // { subjectId: { mode, days, hours } }
  /** Snapshot of cadence per subject id (synced from `blocks` when multi-subject flag is on). */
  const [perSubjectCadenceDraft, setPerSubjectCadenceDraft] = useState({});
  const [targetScopeFromSettings, setTargetScopeFromSettings] = useState('overall'); // 'overall' | 'per_subject' from family_planner_settings
  const [planningDefaultsData, setPlanningDefaultsData] = useState(null); // { settings, exclusions } for Planning defaults summary
  const [planningDefaultsLoading, setPlanningDefaultsLoading] = useState(false);
  const [loadedPlanCurriculumSubjectIds, setLoadedPlanCurriculumSubjectIds] = useState([]);
  
  // Unit Structure step state
  const [unitStructureData, setUnitStructureData] = useState(null); // { units: [{ title, lessons: [...] }] }
  const [loadingUnitStructure, setLoadingUnitStructure] = useState(false);
  const [expandedUnits, setExpandedUnits] = useState(new Set()); // Set of unit indices
  const [editingItemId, setEditingItemId] = useState(null); // ID of item being edited inline
  const [editingItemText, setEditingItemText] = useState('');
  
  // Upload/Paste/Generate mode state
  const [unitStructureStep, setUnitStructureStep] = useState('input'); // 'input' | 'draft' | 'saving'
  const [rawText, setRawText] = useState(''); // For paste mode
  // selectedMaterialId already declared above (line 421)
  const [parsing, setParsing] = useState(false);
  /** Readable live lines while import parse streams (not raw JSON). */
  const [importParseStreamPreview, setImportParseStreamPreview] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateStreamStatus, setGenerateStreamStatus] = useState('');
  const [generateStreamPreview, setGenerateStreamPreview] = useState('');
  const [unitStructureError, setUnitStructureError] = useState(null);
  /** From GET /subject-events-structure: events.source (manual | plain_text_parsed | …) for cadence UX */
  const [savedContentSource, setSavedContentSource] = useState(null);
  /** When opening a different method than saved, show banner in unit-structure overlay */
  const [cadenceDifferentMethodNotice, setCadenceDifferentMethodNotice] = useState(null);
  const [draftData, setDraftData] = useState(null); // Parsed/generated draft before saving
  
  // Generate mode: single free-form field (schedule/students/slots sent as planning_context)
  const [generationScope, setGenerationScope] = useState('');
  
  // Import & Extract mode form state (for upload)
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceType, setSourceType] = useState('auto_detect');
  const [parseMode, setParseMode] = useState('auto_detect');
  const [detectDates, setDetectDates] = useState(true);
  const [preserveHeadings, setPreserveHeadings] = useState(true);
  const [ignorePolicyText, setIgnorePolicyText] = useState(true);
  const [extractAssignments, setExtractAssignments] = useState(true);
  const [extractAssessments, setExtractAssessments] = useState(true);
  const [specialInstructionsParse, setSpecialInstructionsParse] = useState('');
  const [pasteTextFlash, setPasteTextFlash] = useState(false);
  const prevRawTextLenRef = useRef(0);
  
  // Manual builder state (for paste)
  const [expandedUnitIndexManual, setExpandedUnitIndexManual] = useState(0);
  
  // Manual mode state (for paste/manual)
  const [manualDraft, setManualDraft] = useState(null);
  /** After user clears manual draft while staying on unit structure, do not immediately re-hydrate from unitStructureData. */
  const suppressManualCurriculumHydrateRef = useRef(false);
  /** Logistics-first: `cadenceYieldsInstructionalSlots` — read at tap time so unit-structure entry stays in sync. */
  const cadenceReadyForUnitStructureRef = useRef(false);
  /** Draft unit-structure modal: which lesson rows show date + extra type chips (`${unitIdx}-${lessonIdx}`). */
  const [expandedDraftLessonDetailKeys, setExpandedDraftLessonDetailKeys] = useState(() => new Set());
  /** `${unitIdx}-${lessonIdx}` — lesson row kebab in draft builder */
  const [draftBuilderLessonMenuKey, setDraftBuilderLessonMenuKey] = useState(null);
  const [draftBuilderUnitMenuKey, setDraftBuilderUnitMenuKey] = useState(null);
  /** When set, lesson menu shows “Move to…” target list for this key */
  const [draftBuilderMovePickKey, setDraftBuilderMovePickKey] = useState(null);
  /** Web: fixed-position anchors for draft builder menus (avoid ScrollView/stacking + hit-testing under TextInputs). */
  const [webDraftLessonMenuLayout, setWebDraftLessonMenuLayout] = useState(null);
  const [webDraftUnitMenuLayout, setWebDraftUnitMenuLayout] = useState(null);

  useEffect(() => {
    if (draftBuilderLessonMenuKey == null) setWebDraftLessonMenuLayout(null);
  }, [draftBuilderLessonMenuKey]);

  useEffect(() => {
    if (draftBuilderUnitMenuKey === null) setWebDraftUnitMenuLayout(null);
  }, [draftBuilderUnitMenuKey]);

  // Helper functions for draft editing (matching original modals)
  const updateDraftUnit = useCallback((unitIndex, field, value) => {
    if (draftData) {
      setDraftData((prev) => {
        if (!prev?.units) return prev;
        const units = [...prev.units];
        if (!units[unitIndex]) return prev;
        units[unitIndex] = { ...units[unitIndex], [field]: value };
        return { ...prev, units };
      });
    } else if (manualDraft) {
      setManualDraft((prev) => {
        if (!prev?.units) return prev;
        const units = [...prev.units];
        if (!units[unitIndex]) return prev;
        units[unitIndex] = { ...units[unitIndex], [field]: value };
        return { ...prev, units };
      });
    }
  }, [draftData, manualDraft]);
  
  const updateDraftLesson = useCallback((unitIndex, lessonIndex, field, value) => {
    if (draftData) {
      setDraftData((prev) => {
        if (!prev?.units) return prev;
        const units = [...prev.units];
        const u = units[unitIndex];
        if (!u?.lessons) return prev;
        const lessons = [...u.lessons];
        if (!lessons[lessonIndex]) return prev;
        lessons[lessonIndex] = { ...lessons[lessonIndex], [field]: value };
        units[unitIndex] = { ...u, lessons };
        return { ...prev, units };
      });
    } else if (manualDraft) {
      setManualDraft((prev) => {
        if (!prev?.units) return prev;
        const units = [...prev.units];
        const u = units[unitIndex];
        if (!u?.lessons) return prev;
        const lessons = [...u.lessons];
        if (!lessons[lessonIndex]) return prev;
        lessons[lessonIndex] = { ...lessons[lessonIndex], [field]: value };
        units[unitIndex] = { ...u, lessons };
        return { ...prev, units };
      });
    }
  }, [draftData, manualDraft]);
  
  const deleteDraftLesson = useCallback((unitIndex, lessonIndex) => {
    if (draftData) {
      setDraftData((prev) => {
        if (!prev?.units) return prev;
        const units = [...prev.units];
        const u = units[unitIndex];
        if (!u?.lessons) return prev;
        const lessons = u.lessons.filter((_, i) => i !== lessonIndex);
        units[unitIndex] = { ...u, lessons };
        return { ...prev, units };
      });
    } else if (manualDraft) {
      setManualDraft((prev) => {
        if (!prev?.units) return prev;
        const units = [...prev.units];
        const u = units[unitIndex];
        if (!u?.lessons) return prev;
        const lessons = u.lessons.filter((_, i) => i !== lessonIndex);
        units[unitIndex] = { ...u, lessons };
        return { ...prev, units };
      });
    }
  }, [draftData, manualDraft]);
  
  const addDraftLesson = useCallback((unitIndex) => {
    if (draftData) {
      setDraftData((prev) => {
        if (!prev?.units) return prev;
        const units = [...prev.units];
        const u = units[unitIndex];
        if (!u) return prev;
        const lessons = [...(u.lessons || [])];
        const seq = lessons.length + 1;
        lessons.push({
          temp_id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          title: `Lesson ${seq}`,
          lesson_type: 'lesson',
          sequence_index: seq,
          minutes_est: 60,
        });
        units[unitIndex] = { ...u, lessons };
        return { ...prev, units };
      });
    } else if (manualDraft) {
      setManualDraft((prev) => {
        if (!prev?.units) return prev;
        const units = [...prev.units];
        const u = units[unitIndex];
        if (!u) return prev;
        const lessons = [...(u.lessons || [])];
        const seq = lessons.length + 1;
        lessons.push({
          temp_id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          title: `Lesson ${seq}`,
          lesson_type: 'lesson',
          sequence_index: seq,
          minutes_est: 60,
        });
        units[unitIndex] = { ...u, lessons };
        return { ...prev, units };
      });
    }
  }, [draftData, manualDraft]);
  
  const deleteDraftUnit = useCallback((unitIndex) => {
    if (draftData) {
      setDraftData((prev) => {
        if (!prev?.units || prev.units.length <= 1) return prev;
        const units = prev.units.filter((_, i) => i !== unitIndex);
        return { ...prev, units };
      });
      setExpandedUnits((prev) => {
        const newSet = new Set(prev);
        newSet.delete(unitIndex);
        // Adjust indices for units after the deleted one
        const adjusted = new Set();
        newSet.forEach((idx) => {
          if (idx > unitIndex) adjusted.add(idx - 1);
          else adjusted.add(idx);
        });
        return adjusted;
      });
    } else if (manualDraft) {
      setManualDraft((prev) => {
        if (!prev?.units || prev.units.length <= 1) return prev;
        const units = prev.units.filter((_, i) => i !== unitIndex);
        return { ...prev, units };
      });
      setExpandedUnits((prev) => {
        const newSet = new Set(prev);
        newSet.delete(unitIndex);
        const adjusted = new Set();
        newSet.forEach((idx) => {
          if (idx > unitIndex) adjusted.add(idx - 1);
          else adjusted.add(idx);
        });
        return adjusted;
      });
    }
  }, [draftData, manualDraft]);
  
  const moveDraftLesson = useCallback((unitIndex, lessonIndex, direction) => {
    const currentDraft = draftData || manualDraft;
    if (!currentDraft?.units) return;
    
    const units = [...currentDraft.units];
    const u = units[unitIndex];
    if (!u?.lessons) return;
    
    const lessons = [...u.lessons];
    const newIndex = lessonIndex + direction;
    if (newIndex < 0 || newIndex >= lessons.length) return;
    
    [lessons[lessonIndex], lessons[newIndex]] = [lessons[newIndex], lessons[lessonIndex]];
    lessons.forEach((le, i) => { le.sequence_index = i + 1; });
    units[unitIndex] = { ...u, lessons };
    
    if (draftData) {
      setDraftData({ ...draftData, units });
    } else if (manualDraft) {
      setManualDraft({ ...manualDraft, units });
    }
  }, [draftData, manualDraft]);

  const insertUnitBreakAboveLesson = useCallback((unitIndex, lessonIndex) => {
    setDraftBuilderLessonMenuKey(null);
    setDraftBuilderMovePickKey(null);
    const updater = (prev) => {
      if (!prev?.units?.[unitIndex]?.lessons) return prev;
      const units = prev.units.map((u) => ({ ...u, lessons: [...(u.lessons || [])] }));
      const lessons = units[unitIndex].lessons;
      if (lessonIndex < 0 || lessonIndex > lessons.length) return prev;
      if (lessonIndex === 0) {
        const emptyUnit = {
          temp_id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          title: `Unit ${unitIndex + 1}`,
          sequence_index: unitIndex + 1,
          description: null,
          lessons: [],
        };
        units.splice(unitIndex, 0, emptyUnit);
        return { ...prev, units: resequenceDraftUnits(units) };
      }
      const head = lessons.slice(0, lessonIndex);
      const tail = lessons.slice(lessonIndex);
      units[unitIndex] = { ...units[unitIndex], lessons: head };
      const newUnit = {
        temp_id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: `Unit ${unitIndex + 2}`,
        sequence_index: unitIndex + 2,
        description: null,
        lessons: tail,
      };
      units.splice(unitIndex + 1, 0, newUnit);
      return { ...prev, units: resequenceDraftUnits(units) };
    };
    if (draftData) setDraftData(updater);
    else if (manualDraft) setManualDraft(updater);
    setExpandedUnits((prev) => {
      const next = new Set();
      prev.forEach((idx) => {
        if (idx > unitIndex) next.add(idx + 1);
        else next.add(idx);
      });
      next.add(unitIndex);
      next.add(unitIndex + 1);
      return next;
    });
  }, [draftData, manualDraft]);

  const moveDraftLessonToNewUnit = useCallback((unitIndex, lessonIndex) => {
    setDraftBuilderLessonMenuKey(null);
    setDraftBuilderMovePickKey(null);
    const updater = (prev) => {
      if (!prev?.units?.[unitIndex]?.lessons) return prev;
      const lessons = prev.units[unitIndex].lessons;
      if (lessonIndex < 0 || lessonIndex >= lessons.length) return prev;
      const units = prev.units.map((u) => ({ ...u, lessons: [...(u.lessons || [])] }));
      const from = [...units[unitIndex].lessons];
      const [removed] = from.splice(lessonIndex, 1);
      units[unitIndex] = { ...units[unitIndex], lessons: from };
      const newUnit = {
        temp_id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: `Unit ${unitIndex + 2}`,
        sequence_index: unitIndex + 2,
        description: null,
        lessons: [removed],
      };
      units.splice(unitIndex + 1, 0, newUnit);
      return { ...prev, units: resequenceDraftUnits(units) };
    };
    if (draftData) setDraftData(updater);
    else if (manualDraft) setManualDraft(updater);
    setExpandedUnits((prev) => {
      const next = new Set();
      prev.forEach((idx) => {
        if (idx > unitIndex) next.add(idx + 1);
        else next.add(idx);
      });
      next.add(unitIndex);
      next.add(unitIndex + 1);
      return next;
    });
  }, [draftData, manualDraft]);

  /**
   * Move a lesson to another unit (or reorder within unit).
   * `insertBeforeLessonIndex`: insert before this index; null = append to end.
   */
  const moveDraftLessonToUnit = useCallback((fromUnitIndex, lessonIndex, toUnitIndex, insertBeforeLessonIndex) => {
    setDraftBuilderLessonMenuKey(null);
    setDraftBuilderMovePickKey(null);
    const updater = (prev) => {
      if (!prev?.units) return prev;
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
      if (fromUnitIndex === toUnitIndex) {
        if (lessonIndex < insertAt) insertAt -= 1;
      }
      toArr.splice(insertAt, 0, moved);
      units[toUnitIndex] = { ...units[toUnitIndex], lessons: toArr };
      return { ...prev, units: resequenceDraftUnits(units) };
    };
    if (draftData) setDraftData(updater);
    else if (manualDraft) setManualDraft(updater);
  }, [draftData, manualDraft]);

  const mergeDraftUnitWithAdjacent = useCallback((unitIndex, direction) => {
    setDraftBuilderUnitMenuKey(null);
    const updater = (prev) => {
      if (!prev?.units || prev.units.length < 2) return prev;
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
    };
    if (draftData) setDraftData(updater);
    else if (manualDraft) setManualDraft(updater);
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
      return next;
    });
  }, [draftData, manualDraft]);

  const addDraftUnitBelowIndex = useCallback((unitIndex) => {
    setDraftBuilderUnitMenuKey(null);
    const updater = (prev) => {
      if (!prev?.units) return prev;
      const units = prev.units.map((u) => ({ ...u, lessons: [...(u.lessons || [])] }));
      const newUnit = {
        temp_id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: `Unit ${unitIndex + 2}`,
        sequence_index: unitIndex + 2,
        description: null,
        lessons: [],
      };
      units.splice(unitIndex + 1, 0, newUnit);
      return { ...prev, units: resequenceDraftUnits(units) };
    };
    if (draftData) setDraftData(updater);
    else if (manualDraft) setManualDraft(updater);
    setExpandedUnits((prev) => {
      const next = new Set();
      prev.forEach((idx) => {
        if (idx > unitIndex) next.add(idx + 1);
        else next.add(idx);
      });
      next.add(unitIndex + 1);
      return next;
    });
  }, [draftData, manualDraft]);

  const recalculateTimeoutRef = useRef(null);
  const scrollRef = useRef(null);
  const scheduleSectionYRef = useRef(0);
  const datesSectionYRef = useRef(0);
  const schedulePotentialFetchedRef = useRef(false);
  const planSummaryCacheRef = useRef(new Map()); // yearId -> full academic year data for instant summary display
  const summaryFetchInFlightRef = useRef(new Set());
  const subjectPlanResolvedRef = useRef(false); // when from subject details, avoid re-running plan-for-subject search
  const planPrefsSnapRef = useRef({
    planConstraintMode: 'none',
    planTargetDays: '180',
    planTargetHours: '1000',
    hoursPerDay: '5',
  });
  const planPrefsFamilySaveTimerRef = useRef(null);
  const planPrefsSubjectTimersRef = useRef({});

  const baseSubjectList = Array.isArray(fullSubjects) && fullSubjects.length > 0 ? fullSubjects : subjects;
  /** All family subjects; plan slots attach to children via each subject's `child_id` (see getChildIdsForSubject). */
  const subjectsForCurrentSelection = baseSubjectList;
  const allFamilyChildIds = useMemo(
    () => (children || []).map((c) => c?.id).filter(Boolean),
    [children],
  );

  /** Which subjects / placeholders / children — excludes weekdays & times so cadence edits do not re-trigger schedule potential. */
  const schedulePotentialBlocksStructureKey = useMemo(
    () =>
      JSON.stringify(
        (blocks || []).map((b) => ({
          block_id: b.block_id,
          subject_id: b.subject_id ?? null,
          child_ids: [...(b.child_ids || [])].map(String).sort(),
          placeholder_label: b.placeholder_label ?? null,
        })),
      ),
    [blocks],
  );

  /**
   * `empty` → `primed` when the user picks the first weekday(s) so the card can move off 0; after that,
   * changing which days/times keeps `primed` and does not re-fetch.
   */
  const schedulePotentialCadencePrimedKey = useMemo(
    () => ((blocks || []).some((b) => (b.weekdays || []).length > 0) ? 'primed' : 'empty'),
    [blocks],
  );

  const effectiveSubjectIds = selectedSubjectIds.filter((id) =>
    subjectsForCurrentSelection.some((s) => s.id === id)
  );
  const unitPipelineSubjectId =
    initialSubjectId ||
    unitFocusSubjectId ||
    (effectiveSubjectIds.length === 1 ? effectiveSubjectIds[0] : null);

  /** When scope picker is ambiguous but cadence has exactly one real subject, use it for curriculum fetch + preview zip. */
  const singleBlockSubjectId = useMemo(() => {
    const ids = (blocks || []).map((b) => b.subject_id).filter(Boolean);
    const uniq = [...new Set(ids.map(String))];
    return uniq.length === 1 ? uniq[0] : null;
  }, [blocks]);

  const curriculumFetchSubjectId = unitPipelineSubjectId || singleBlockSubjectId;

  /** Multi-subject plans must scope units to one subject before opening unit structure (cadence row link or picker below). */
  const ensureUnitSubjectForUnitStructure = useCallback((candidateSubjectId) => {
    const resolvedSubject =
      initialSubjectId ||
      unitFocusSubjectId ||
      (candidateSubjectId != null && String(candidateSubjectId).trim() !== '');
    if (effectiveSubjectIds.length > 1 && !resolvedSubject) {
      toast.push(
        t('planMyYear.multiSubjectUnits.toastPickSubjectFirst'),
        'error',
      );
      return false;
    }
    return true;
  }, [effectiveSubjectIds.length, initialSubjectId, unitFocusSubjectId, toast]);

  /** Restore paste_plain / upload WIP from sessionStorage (web). */
  const hydrateImportDraftFromStorage = useCallback(
    (subjectIdForKey, { requireSource } = {}) => {
      if (!familyId || Platform.OS !== 'web') return false;
      const sid =
        subjectIdForKey != null && String(subjectIdForKey).trim() !== '' ? String(subjectIdForKey) : 'none';
      if (requireSource !== 'paste_plain' && requireSource !== 'upload') return false;
      const st = readPlanYearImportDraft(familyId, sid, requireSource);
      if (!st || st.v !== 1) return false;
      if (st.planSource !== 'paste_plain' && st.planSource !== 'upload') return false;
      if (requireSource && st.planSource !== requireSource) return false;
      const hasContent =
        (st.rawText && String(st.rawText).trim() !== '') ||
        (st.draftData && Array.isArray(st.draftData.units) && st.draftData.units.length > 0);
      if (!hasContent) return false;

      setPlanSource(st.planSource);
      setRawText(st.rawText ?? '');
      setDraftData(st.draftData ?? null);
      let step = st.unitStructureStep || 'input';
      if (step === 'saving') step = 'draft';
      if (step !== 'input' && step !== 'draft' && step !== 'paste_input') step = 'input';
      if (st.planSource === 'upload' && step === 'paste_input') step = 'input';
      setUnitStructureStep(step);
      if (st.sourceTitle != null) setSourceTitle(String(st.sourceTitle));
      if (st.sourceType) setSourceType(st.sourceType);
      if (st.parseMode) setParseMode(st.parseMode);
      if (typeof st.detectDates === 'boolean') setDetectDates(st.detectDates);
      if (typeof st.preserveHeadings === 'boolean') setPreserveHeadings(st.preserveHeadings);
      if (typeof st.ignorePolicyText === 'boolean') setIgnorePolicyText(st.ignorePolicyText);
      if (typeof st.extractAssignments === 'boolean') setExtractAssignments(st.extractAssignments);
      if (typeof st.extractAssessments === 'boolean') setExtractAssessments(st.extractAssessments);
      if (st.specialInstructionsParse != null) setSpecialInstructionsParse(String(st.specialInstructionsParse));
      const ex = Array.isArray(st.expandedUnitIndices)
        ? st.expandedUnitIndices.map(Number).filter((n) => !Number.isNaN(n))
        : [];
      setExpandedUnits(new Set(ex.length > 0 ? ex : [0]));
      if (st.planSource === 'upload' && st.selectedMaterialId != null) {
        setSelectedMaterialId(st.selectedMaterialId);
      }
      return true;
    },
    [familyId],
  );

  const importDraftPersistDepsRef = useRef({});
  const importDraftFlushRef = useRef(() => {});
  const importDraftPersistTimerRef = useRef(null);

  importDraftPersistDepsRef.current = {
    familyId,
    unitPipelineSubjectId,
    planSource,
    rawText,
    draftData,
    unitStructureStep,
    sourceTitle,
    sourceType,
    parseMode,
    detectDates,
    preserveHeadings,
    ignorePolicyText,
    extractAssignments,
    extractAssessments,
    specialInstructionsParse,
    expandedUnits,
    selectedMaterialId,
  };

  importDraftFlushRef.current = () => {
    if (Platform.OS !== 'web') return;
    const d = importDraftPersistDepsRef.current;
    if (!d.familyId) return;
    if (d.planSource !== 'paste_plain' && d.planSource !== 'upload') return;
    const sid =
      d.unitPipelineSubjectId != null && String(d.unitPipelineSubjectId).trim() !== ''
        ? String(d.unitPipelineSubjectId)
        : 'none';
    const hasContent =
      (d.rawText && String(d.rawText).trim() !== '') ||
      (d.draftData && Array.isArray(d.draftData.units) && d.draftData.units.length > 0);
    if (!hasContent) {
      clearPlanYearImportDraft(d.familyId, sid, d.planSource);
      return;
    }
    let step = d.unitStructureStep === 'saving' ? 'draft' : d.unitStructureStep;
    if (step !== 'input' && step !== 'draft' && step !== 'paste_input') step = 'input';
    if (d.planSource === 'upload' && step === 'paste_input') step = 'input';
    const ex = d.expandedUnits instanceof Set ? [...d.expandedUnits] : [];
    writePlanYearImportDraft(d.familyId, sid, d.planSource, {
      v: 1,
      planSource: d.planSource,
      rawText: d.rawText ?? '',
      draftData: d.draftData,
      unitStructureStep: step,
      sourceTitle: d.sourceTitle ?? '',
      sourceType: d.sourceType,
      parseMode: d.parseMode,
      detectDates: d.detectDates,
      preserveHeadings: d.preserveHeadings,
      ignorePolicyText: d.ignorePolicyText,
      extractAssignments: d.extractAssignments,
      extractAssessments: d.extractAssessments,
      specialInstructionsParse: d.specialInstructionsParse ?? '',
      expandedUnitIndices: ex,
      selectedMaterialId: d.planSource === 'upload' ? d.selectedMaterialId : null,
    });
  };

  useEffect(() => {
    return () => {
      importDraftFlushRef.current();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (importDraftPersistTimerRef.current) {
      clearTimeout(importDraftPersistTimerRef.current);
      importDraftPersistTimerRef.current = null;
    }
    importDraftPersistTimerRef.current = setTimeout(() => {
      importDraftPersistTimerRef.current = null;
      importDraftFlushRef.current();
    }, 400);
    return () => {
      if (importDraftPersistTimerRef.current) {
        clearTimeout(importDraftPersistTimerRef.current);
        importDraftPersistTimerRef.current = null;
      }
    };
  }, [
    familyId,
    unitPipelineSubjectId,
    planSource,
    rawText,
    draftData,
    unitStructureStep,
    sourceTitle,
    sourceType,
    parseMode,
    detectDates,
    preserveHeadings,
    ignorePolicyText,
    extractAssignments,
    extractAssessments,
    specialInstructionsParse,
    expandedUnits,
    selectedMaterialId,
  ]);

  /** Logistics-first: open unit-structure modal with the same init as the Method step tiles (per subject row). */
  const openCadenceUnitMethod = useCallback(
    (subjectId, method) => {
      if (!ensureUnitSubjectForUnitStructure(subjectId)) return;
      if (PLAN_MY_YEAR_LOGISTICS_FIRST && !cadenceReadyForUnitStructureRef.current) return;
      setUnitFocusSubjectId(subjectId);
      setParsedContent(null);
      setParseContentError(null);
      setParsingContent(false);

      const hasUnits = (unitStructureData?.units || []).some((u) => (u.lessons || []).length > 0);
      const savedMethod = mapEventSourceToCadenceMethod(savedContentSource);
      const sameMethod = Boolean(savedMethod && savedMethod === method);
      const shouldOpenEmptyDifferentMethod = hasUnits && savedMethod && !sameMethod;

      if (shouldOpenEmptyDifferentMethod) {
        let prevLabel = '';
        if (savedMethod === 'paste') prevLabel = s('planMyYear.sections.useASource.options.paste.label');
        else if (savedMethod === 'paste_plain') prevLabel = s('planMyYear.sections.useASource.options.pastePlain.label');
        else if (savedMethod === 'upload') prevLabel = s('planMyYear.sections.useASource.options.upload.label');
        else if (savedMethod === 'generate') prevLabel = s('planMyYear.multiSubjectUnits.cadenceGenerateLabel');
        setCadenceDifferentMethodNotice({
          previousMethodLabel: prevLabel || s('planMyYear.multiSubjectUnits.savedUnitsUnknownMethod'),
        });
        suppressManualCurriculumHydrateRef.current = true;
      } else {
        setCadenceDifferentMethodNotice(null);
        suppressManualCurriculumHydrateRef.current = false;
      }

      if (method === 'paste') {
        setPlanSource('paste');
        setDraftData(null);
        setRawText('');
        setUnitStructureStep('input');
        if (shouldOpenEmptyDifferentMethod) {
          setManualDraft(createInitialManualDraft());
          setExpandedUnitIndexManual(0);
          setExpandedUnits(new Set([0]));
        } else {
          setManualDraft(null);
          setExpandedUnitIndexManual(0);
          setExpandedUnits(new Set());
        }
      } else if (method === 'paste_plain') {
        setManualDraft(null);
        if (shouldOpenEmptyDifferentMethod) {
          setPlanSource('paste_plain');
          setDraftData(null);
          setUnitStructureStep('input');
          setRawText('');
          setExpandedUnits(new Set());
          setExpandedUnitIndexManual(0);
        } else if (!hydrateImportDraftFromStorage(subjectId, { requireSource: 'paste_plain' })) {
          setPlanSource('paste_plain');
          setDraftData(null);
          setUnitStructureStep('input');
          setRawText('');
          setExpandedUnits(new Set());
          setExpandedUnitIndexManual(0);
        }
      } else if (method === 'upload') {
        setManualDraft(null);
        if (shouldOpenEmptyDifferentMethod) {
          setPlanSource('upload');
          setDraftData(null);
          setUnitStructureStep('input');
          setRawText('');
        } else if (!hydrateImportDraftFromStorage(subjectId, { requireSource: 'upload' })) {
          setPlanSource('upload');
          setDraftData(null);
          setUnitStructureStep('input');
          setRawText('');
        }
      } else if (method === 'generate') {
        setPlanSource('generate');
        setManualDraft(null);
        setDraftData(null);
        setUnitStructureStep('input');
        setRawText('');
      }
      setPlanStep('unit_structure');
    },
    [
      ensureUnitSubjectForUnitStructure,
      hydrateImportDraftFromStorage,
      savedContentSource,
      unitStructureData,
      s,
    ],
  );

  // Merge: planSubjectTargetsOverride (user edits) > plan > subject defaults
  // When target_scope === 'overall': use plan-level target only, subject_targets = undefined
  // When target_scope === 'per_subject': use subject defaults per subject
  const effectiveSubjectTargets = useMemo(() => {
    if (targetScopeFromSettings === 'overall') {
      // Overall mode: only include planSubjectTargetsOverride (user edits in "Target for this plan")
      const fromOverride = {};
      Object.entries(planSubjectTargetsOverride).forEach(([sid, t]) => {
        if (t.mode === 'none') return;
        if (t.mode === 'days') {
          const d = t.days?.trim() ? parseInt(t.days, 10) : null;
          if (d != null) fromOverride[sid] = { target_days: d, target_hours: undefined };
        } else if (t.mode === 'hours') {
          const h = t.hours?.trim() ? parseFloat(t.hours) : null;
          if (h != null) fromOverride[sid] = { target_days: undefined, target_hours: h };
        }
      });
      return Object.keys(fromOverride).length > 0 ? fromOverride : undefined;
    }
    // Per-subject mode: plan > subject defaults > override
    const fromPlan = planHealth?.subject_targets && typeof planHealth.subject_targets === 'object' ? { ...planHealth.subject_targets } : {};
    const subjectIdsToConsider = [...new Set([...effectiveSubjectIds, ...blocks.map((b) => b.subject_id).filter(Boolean)])];
    subjectIdsToConsider.forEach((sid) => {
      if (fromPlan[sid]) return;
      const subj = baseSubjectList.find((s) => String(s.id) === String(sid));
      if (!subj || (subj.default_target_days == null && subj.default_target_hours == null)) return;
      fromPlan[sid] = {
        target_days: subj.default_target_days ?? undefined,
        target_hours: subj.default_target_hours != null ? subj.default_target_hours : undefined,
      };
    });
    Object.entries(planSubjectTargetsOverride).forEach(([sid, t]) => {
      if (t.mode === 'none') delete fromPlan[sid];
      else if (t.mode === 'days') {
        const d = t.days?.trim() ? parseInt(t.days, 10) : null;
        fromPlan[sid] = { ...(fromPlan[sid] || {}), target_days: d ?? undefined, target_hours: undefined };
      } else if (t.mode === 'hours') {
        const h = t.hours?.trim() ? parseFloat(t.hours) : null;
        fromPlan[sid] = { ...(fromPlan[sid] || {}), target_days: undefined, target_hours: h ?? undefined };
      }
    });
    return Object.keys(fromPlan).length > 0 ? fromPlan : undefined;
  }, [targetScopeFromSettings, planHealth?.subject_targets, baseSubjectList, effectiveSubjectIds, blocks, planSubjectTargetsOverride]);

  // Effective plan target for apply/schedule: always from local state (prefilled from settings when new, or from plan when editing)
  const effectivePlanTarget = useMemo(() => ({
    constraint_mode: planConstraintMode,
    target_days: planConstraintMode === 'days' ? (parseInt(planTargetDays, 10) || null) : null,
    target_hours: planConstraintMode === 'hours' ? (parseFloat(planTargetHours) || null) : null,
  }), [planConstraintMode, planTargetDays, planTargetHours]);

  /** True when Planning Preferences includes a real day/hour target (overall or per subject). */
  const hasPlanningPreferenceTargets = useMemo(() => {
    if (targetScopeFromSettings === 'overall') {
      if (planConstraintMode === 'none') return false;
      if (planConstraintMode === 'days') {
        const n = parseInt(String(planTargetDays || '').replace(/[^\d]/g, ''), 10);
        return Number.isFinite(n) && n > 0;
      }
      if (planConstraintMode === 'hours') {
        const th = parseFloat(planTargetHours);
        const hd = parseFloat(hoursPerDay);
        return Number.isFinite(th) && th > 0 && Number.isFinite(hd) && hd > 0;
      }
      return false;
    }
    if (targetScopeFromSettings === 'per_subject') {
      for (const subjectId of effectiveSubjectIds) {
        const subj = baseSubjectList.find((s) => String(s.id) === String(subjectId));
        const o = planSubjectTargetsOverride[subjectId];
        const rowMode =
          o?.mode ??
          (subj?.default_constraint_mode ||
            (subj?.default_target_days != null ? 'days' : subj?.default_target_hours != null ? 'hours' : 'none'));
        if (rowMode === 'none') continue;
        if (rowMode === 'days') {
          const daysStr = o?.days ?? (subj?.default_target_days != null ? String(subj.default_target_days) : '');
          const n = parseInt(String(daysStr).replace(/[^\d]/g, ''), 10);
          if (Number.isFinite(n) && n > 0) return true;
        }
        if (rowMode === 'hours') {
          const hoursStr = o?.hours ?? (subj?.default_target_hours != null ? String(subj.default_target_hours) : '');
          const h = parseFloat(String(hoursStr));
          if (Number.isFinite(h) && h > 0) return true;
        }
      }
      return false;
    }
    return false;
  }, [
    targetScopeFromSettings,
    planConstraintMode,
    planTargetDays,
    planTargetHours,
    hoursPerDay,
    effectiveSubjectIds,
    planSubjectTargetsOverride,
    baseSubjectList,
  ]);

  /** Projected instructional hours per subject (for per-subject hour targets). */
  const projectedHoursBySubjectId = useMemo(() => {
    if (!startDate || !endDate || !blocks.length) return {};
    const exclusionRanges = [
      ...(customHolidays || []).map((h) => [h.date, h.date]),
      ...(customBreaks || [])
        .map((b) => [b.start || b.startDate, b.end || b.endDate].filter(Boolean))
        .filter((r) => r.length === 2),
    ];
    const map = {};
    blocks.forEach((block) => {
      if (!block.subject_id) return;
      const sid = String(block.subject_id);
      const dates = getBlockOccurrenceDates(block, startDate, endDate, exclusionRanges);
      const mins = blockMinutesForPlanYearBlock(block);
      const h = (dates.length * mins) / 60;
      map[sid] = (map[sid] || 0) + h;
    });
    return map;
  }, [blocks, startDate, endDate, customHolidays, customBreaks]);

  // Effective subject targets for apply: always use merged result (plan override + subject defaults)
  const effectiveSubjectTargetsForApply = effectiveSubjectTargets;

  /** Per-subject lines for inline target vs plan (per_subject scope). */
  const planningTargetPerSubjectLines = useMemo(() => {
    if (targetScopeFromSettings !== 'per_subject' || !effectiveSubjectTargetsForApply) return [];
    const sp = schedulePotential;
    if (!sp) return [];
    const out = [];
    Object.entries(effectiveSubjectTargetsForApply).forEach(([sid, tgt]) => {
      const name = baseSubjectList.find((s) => String(s.id) === String(sid))?.name || 'Subject';
      const pk = String(sid);
      if (tgt.target_days != null) {
        const proj = sp.per_subject?.[pk]?.projected_days ?? 0;
        out.push({ key: `${pk}-d`, name, kind: 'days', projected: proj, target: tgt.target_days });
      } else if (tgt.target_hours != null) {
        const proj = projectedHoursBySubjectId[pk] ?? 0;
        out.push({
          key: `${pk}-h`,
          name,
          kind: 'hours',
          projected: Math.round(proj * 10) / 10,
          target: tgt.target_hours,
        });
      }
    });
    return out;
  }, [
    targetScopeFromSettings,
    effectiveSubjectTargetsForApply,
    schedulePotential,
    baseSubjectList,
    projectedHoursBySubjectId,
  ]);

  /** Matches schedule_potential request inputs so we can reuse a snapshot when re-opening edit logistics. */
  const schedulePotentialRequestKey = useMemo(
    () =>
      JSON.stringify({
        sd: startDate,
        ed: endDate,
        bk: schedulePotentialBlocksStructureKey,
        ck: schedulePotentialCadencePrimedKey,
        ch: customHolidays,
        cb: customBreaks,
        fph: followGlobalHolidays,
        cc: countryCode,
        rc: regionCode,
        cm: effectivePlanTarget.constraint_mode,
        td: effectivePlanTarget.target_days,
        th: effectivePlanTarget.target_hours,
        st: effectiveSubjectTargetsForApply,
        acIds: allFamilyChildIds,
        fid: familyId,
      }),
    [
      startDate,
      endDate,
      schedulePotentialBlocksStructureKey,
      schedulePotentialCadencePrimedKey,
      customHolidays,
      customBreaks,
      followGlobalHolidays,
      countryCode,
      regionCode,
      effectivePlanTarget,
      effectiveSubjectTargetsForApply,
      allFamilyChildIds,
      familyId,
    ],
  );
  const schedulePotentialRequestKeyRef = useRef('');
  schedulePotentialRequestKeyRef.current = schedulePotentialRequestKey;

  // Holidays/breaks: from settings vs plan-only (for UI separation)
  const exclusionsFromSettings = useMemo(() => {
    const ex = planningDefaultsData?.exclusions || [];
    return {
      holidays: ex.filter((e) => e.exclusion_type === 'holiday').map((e) => ({
        date: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
        name: e.label || '',
      })),
      breaks: ex.filter((e) => e.exclusion_type === 'break').map((e) => ({
        start: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
        end: typeof e.end_date === 'string' ? e.end_date.slice(0, 10) : (e.end_date?.isoformat?.() || String(e.end_date || '').slice(0, 10)),
        name: e.label || '',
      })),
    };
  }, [planningDefaultsData]);
  const planOnlyExclusions = useMemo(() => {
    const matchH = (h) => exclusionsFromSettings.holidays.some((s) => s.date === (h.date || h.startDate) && (s.name || '').trim() === (h.name || '').trim());
    const matchB = (b) => exclusionsFromSettings.breaks.some((s) => s.start === (b.start || b.startDate) && s.end === (b.end || b.endDate) && (s.name || '').trim() === (b.name || '').trim());
    return {
      holidays: (customHolidays || []).filter((h) => !matchH(h)),
      breaks: (customBreaks || []).filter((b) => !matchB(b)),
    };
  }, [customHolidays, customBreaks, exclusionsFromSettings]);

  // Preview: exact dates and times that will get slots (for display under "X eligible days" and on preview screen)
  const previewSlotLines = useMemo(
    () =>
      buildPreviewSlotLinesForPlanYear({
        startDate,
        endDate,
        blocks,
        customHolidays,
        customBreaks,
        baseSubjectList,
        children,
        allFamilyChildIds,
      }),
    [blocks, startDate, endDate, customHolidays, customBreaks, baseSubjectList, children, allFamilyChildIds],
  );

  const cadenceConflictContext = useMemo(
    () => ({
      startDate,
      endDate,
      customHolidays,
      customBreaks,
      baseSubjectList,
      children,
      allFamilyChildIds,
      existingEvents: calendarEventsForConflicts,
      academicYearId,
    }),
    [
      startDate,
      endDate,
      customHolidays,
      customBreaks,
      baseSubjectList,
      children,
      allFamilyChildIds,
      calendarEventsForConflicts,
      academicYearId,
    ],
  );

  const cadenceConflictReport = useMemo(() => {
    if (!isHomeschool || !startDate || !endDate || !blocks.length) return null;
    return analyzePlanCadenceConflicts({
      blocks,
      startDate,
      endDate,
      customHolidays,
      customBreaks,
      baseSubjectList,
      children,
      allFamilyChildIds,
      existingEvents: calendarEventsForConflicts,
      academicYearId,
    });
  }, [
    isHomeschool,
    blocks,
    startDate,
    endDate,
    customHolidays,
    customBreaks,
    baseSubjectList,
    children,
    allFamilyChildIds,
    calendarEventsForConflicts,
    academicYearId,
  ]);

  const hasCadenceConflicts =
    !!cadenceConflictReport &&
    (cadenceConflictReport.internal.length > 0 || cadenceConflictReport.external.length > 0);

  useEffect(() => {
    if (hasCadenceConflicts) {
      setCadenceConflictsResolvedFeedback(false);
      if (pendingCadenceResolveAckRef.current) pendingCadenceResolveAckRef.current = false;
      return;
    }
    if (!pendingCadenceResolveAckRef.current) return;
    pendingCadenceResolveAckRef.current = false;
    setCadenceConflictsResolvedFeedback(true);
    const id = setTimeout(() => setCadenceConflictsResolvedFeedback(false), 5000);
    return () => clearTimeout(id);
  }, [hasCadenceConflicts]);

  const cadenceConflictDates = cadenceConflictReport?.conflictDates ?? new Set();
  const cadenceConflictDayCount = cadenceConflictDates.size;
  const cadenceConflictEntryCount =
    (cadenceConflictReport?.internal?.length ?? 0) + (cadenceConflictReport?.external?.length ?? 0);

  /** Suggested window for “Move all” — matches bulk fix algorithm. */
  const cadenceBulkSuggestedTimeLabel = useMemo(() => {
    if (!hasCadenceConflicts || !blocks?.length) return null;
    const shift = getNextCadenceTimeShift(blocks, cadenceConflictContext);
    if (!shift?.start_time || !shift?.end_time) return null;
    const a = String(shift.start_time).slice(0, 5);
    const b = String(shift.end_time).slice(0, 5);
    return `${a}–${b}`;
  }, [hasCadenceConflicts, blocks, cadenceConflictContext]);

  const canMoveAllCadenceFix = useMemo(() => {
    if (!hasCadenceConflicts || !blocks?.length) return false;
    return getNextCadenceTimeShift(blocks, cadenceConflictContext) != null;
  }, [hasCadenceConflicts, blocks, cadenceConflictContext]);

  /** `${date}|${blockId}` for preview rows that should show the conflict icon. */
  const previewLineConflictKeySet = useMemo(() => {
    const s = new Set();
    if (!cadenceConflictReport) return s;
    for (const c of cadenceConflictReport.external || []) {
      s.add(`${c.date}|${String(c.blockId)}`);
    }
    for (const c of cadenceConflictReport.internal || []) {
      s.add(`${c.date}|${String(c.blockIdA)}`);
      s.add(`${c.date}|${String(c.blockIdB)}`);
    }
    return s;
  }, [cadenceConflictReport]);

  /** True when date range + cadence produce at least one class occurrence (instructional slot preview). */
  const cadenceYieldsInstructionalSlots = previewSlotLines.length > 0;
  cadenceReadyForUnitStructureRef.current = cadenceYieldsInstructionalSlots;
  const unitStructureBlockedByCadence =
    PLAN_MY_YEAR_LOGISTICS_FIRST && !cadenceYieldsInstructionalSlots;

  const dispatchContentFirstUnitsFlow = useCallback(() => {
    const sid =
      initialSubjectId != null && String(initialSubjectId).trim() !== ''
        ? initialSubjectId
        : unitPipelineSubjectId ??
          (Array.isArray(effectiveSubjectIds) && effectiveSubjectIds.length > 0
            ? effectiveSubjectIds[0]
            : null);
    const subj = (baseSubjectList || []).find((s) => String(s.id) === String(sid));
    const childIds = (children || []).map((c) => c?.id).filter(Boolean);
    const detail = {
      subjectId: sid ?? null,
      subjectName: (subj?.name || '').trim() || 'Subject',
      familyId,
      childIds,
    };
    if (typeof onOpenManualCurriculumBuilder === 'function') {
      onOpenManualCurriculumBuilder(detail);
      onClose?.();
      return;
    }
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(
        new CustomEvent('openPlanYearModal', {
          detail: {
            ...detail,
            from: 'subject_detail',
            openAsModal: true,
            skipPlanSummary: true,
            openDirectlyToScope: true,
            initialUnitStructureMethod: 'manual',
          },
        })
      );
      onClose?.();
    }
  }, [
    onOpenManualCurriculumBuilder,
    familyId,
    children,
    initialSubjectId,
    unitPipelineSubjectId,
    effectiveSubjectIds,
    baseSubjectList,
    onClose,
  ]);

  /** Intelligence Hub → Plan the Year AI (WebLayout listens for openYearWizard). */
  const openQuickStartWithAI = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('openYearWizard'));
    }
    onClose?.();
  }, [onClose]);

  /** Client-side lesson → slot lines (matches apply order; no DB placeholders required). */
  const lessonSchedulePreviewPlan = useMemo(() => {
    const flatDraft = flattenUnitLessonsForPreview((manualDraft || draftData)?.units);
    const flatSaved = flattenUnitLessonsForPreview(unitStructureData?.units);
    const curriculumSubjectId =
      flatDraft.length > 0
        ? unitPipelineSubjectId || singleBlockSubjectId
        : lastSavedUnitSubjectId || unitPipelineSubjectId || singleBlockSubjectId;
    const canUseSavedCurriculum =
      flatDraft.length === 0 &&
      flatSaved.length > 0 &&
      curriculumSubjectId != null &&
      loadedPlanCurriculumSubjectIds.includes(String(curriculumSubjectId));
    const lessons = flatDraft.length > 0 ? flatDraft : canUseSavedCurriculum ? flatSaved : [];
    const built = buildLessonSchedulePreviewRows(
      previewSlotLines,
      lessons,
      curriculumSubjectId,
      s('planMyYear.multiSubjectUnits.availableInstructionalSlot'),
    );
    return {
      ...built,
      curriculumSubjectId: built.curriculumSubjectId || curriculumSubjectId || null,
    };
  }, [
    previewSlotLines,
    manualDraft,
    draftData,
    unitStructureData,
    unitPipelineSubjectId,
    singleBlockSubjectId,
    lastSavedUnitSubjectId,
    loadedPlanCurriculumSubjectIds,
  ]);

  /** Per preview row: counterparty + suggested shift for inline conflict copy. */
  const previewLineConflictDetailsByKey = useMemo(() => {
    const map = new Map();
    if (!cadenceConflictReport || !lessonSchedulePreviewPlan?.rows?.length) return map;
    for (const { line } of lessonSchedulePreviewPlan.rows) {
      if (!line?.blockId || !line?.date) continue;
      const key = `${line.date}|${String(line.blockId)}`;
      if (!previewLineConflictKeySet.has(key)) continue;
      const { internal, external } = findConflictsForPreviewLine(line, cadenceConflictReport);
      const first = external[0] || internal[0];
      if (!first) continue;
      const counterpartyLabel = conflictCounterpartyLabel(line, first);
      const counterpartyTimeLabel = conflictCounterpartyTimeLabel(line, first) || null;
      const sug = getSuggestedTimeForConflict(first, blocks, cadenceConflictContext);
      const suggestedTimeLabel =
        sug?.start_time && sug?.end_time
          ? `${String(sug.start_time).slice(0, 5)}–${String(sug.end_time).slice(0, 5)}`
          : null;
      map.set(key, { counterpartyLabel, counterpartyTimeLabel, suggestedTimeLabel });
    }
    return map;
  }, [
    cadenceConflictReport,
    lessonSchedulePreviewPlan.rows,
    previewLineConflictKeySet,
    blocks,
    cadenceConflictContext,
  ]);

  const lessonOverflowExtendEndDate = useMemo(
    () =>
      findExtendedEndDateForLessonOverflow({
        startDate,
        endDate,
        overflowCount: lessonSchedulePreviewPlan.overflowCount,
        curriculumSubjectId: lessonSchedulePreviewPlan.curriculumSubjectId,
        blocks,
        customHolidays,
        customBreaks,
        baseSubjectList,
        children,
        allFamilyChildIds,
      }),
    [
      startDate,
      endDate,
      lessonSchedulePreviewPlan.overflowCount,
      lessonSchedulePreviewPlan.curriculumSubjectId,
      blocks,
      customHolidays,
      customBreaks,
      baseSubjectList,
      children,
      allFamilyChildIds,
    ],
  );

  const applyExtendedPlanEndDate = useCallback(
    (extYmd) => {
      if (!extYmd || !/^\d{4}-\d{2}-\d{2}$/.test(extYmd)) return;
      setEndDate(extYmd);
      if (familyId && startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        setPlanBuildLogisticsDatesCache(familyId, startDate, extYmd);
      }
    },
    [familyId, startDate],
  );

  /** YYYY-MM-DD sent to apply_to_calendar when applying partial updates; null = full range. */
  const resolvedApplyFromDateForPayload = useMemo(() => {
    if (applyFromMode === 'entire') return null;
    if (applyFromMode === 'today') {
      const t = toLocalYYYYMMDD(new Date());
      if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && t < startDate) return startDate;
      if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && t > endDate) return endDate;
      return t;
    }
    if (applyFromMode === 'date') return applyFromDate || null;
    return null;
  }, [applyFromMode, applyFromDate, startDate, endDate]);

  /** Per block subject: whether saved curriculum has lessons (for Step 2 “Add units” vs “Change units”). */
  const subjectIdsKeyForCadenceFetch = useMemo(() => {
    const ids = (blocks || []).map((b) => b.subject_id).filter(Boolean);
    return [...new Set(ids.map(String))].sort().join(',');
  }, [blocks]);

  const [savedCurriculumHasLessonsBySubjectId, setSavedCurriculumHasLessonsBySubjectId] = useState({});

  useEffect(() => {
    if (!PLAN_MY_YEAR_LOGISTICS_FIRST || planStep !== 'logistics') return;
    if (!familyId) return;
    if (openForNewPlan) {
      setSavedCurriculumHasLessonsBySubjectId({});
      return;
    }
    if (!initialAcademicYearId && !academicYearId) {
      setSavedCurriculumHasLessonsBySubjectId({});
      return;
    }
    const subjectIds = subjectIdsKeyForCadenceFetch.split(',').filter(Boolean);
    if (subjectIds.length === 0) {
      setSavedCurriculumHasLessonsBySubjectId({});
      return;
    }
    let cancelled = false;
    (async () => {
      const next = {};
      await Promise.all(
        subjectIds.map(async (sid) => {
          try {
            const effectiveYearId = academicYearId || initialAcademicYearId || null;
            const { data, error } = await fetchSubjectCurriculumEventsStructure(
              familyId,
              sid,
              effectiveYearId
            );
            if (cancelled) return;
            if (error) {
              next[sid] = false;
              return;
            }
            const units = Array.isArray(data?.units) ? data.units : [];
            next[sid] = units.some((u) => (u.lessons || []).length > 0);
          } catch (_) {
            if (!cancelled) next[sid] = false;
          }
        }),
      );
      if (!cancelled) {
        setSavedCurriculumHasLessonsBySubjectId((prev) => {
          const merged = { ...prev };
          Object.keys(next).forEach((k) => {
            merged[k] = next[k];
          });
          return merged;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    PLAN_MY_YEAR_LOGISTICS_FIRST,
    planStep,
    familyId,
    openForNewPlan,
    initialAcademicYearId,
    academicYearId,
    subjectIdsKeyForCadenceFetch,
  ]);

  useEffect(() => {
    if (!lastSavedUnitSubjectId) return;
    setSavedCurriculumHasLessonsBySubjectId((prev) => ({
      ...prev,
      [String(lastSavedUnitSubjectId)]: true,
    }));
  }, [lastSavedUnitSubjectId]);

  const cadenceShowChangeUnitsForSubject = useCallback(
    (subjectId) => {
      if (!subjectId) return false;
      if (openForNewPlan) return false;
      if (!initialAcademicYearId && !academicYearId) return false;
      return savedCurriculumHasLessonsBySubjectId[String(subjectId)] === true;
    },
    [openForNewPlan, initialAcademicYearId, academicYearId, savedCurriculumHasLessonsBySubjectId],
  );

  const hasAnySavedCurriculumUnits = useMemo(
    () => Object.values(savedCurriculumHasLessonsBySubjectId || {}).some((value) => value === true),
    [savedCurriculumHasLessonsBySubjectId],
  );

  const flatLessonSlotTimes = useMemo(
    () =>
      buildFlatLessonSlotTimes(
        lessonSchedulePreviewPlan,
        s('planMyYear.multiSubjectUnits.availableInstructionalSlot'),
      ),
    [lessonSchedulePreviewPlan],
  );

  const handleOpenCadenceUnitMethod = useCallback(
    (subjectId, method) => {
      if (!cadenceYieldsInstructionalSlots) {
        setAddContentCadenceInlineHint(true);
      }
      openCadenceUnitMethod(subjectId, method);
    },
    [cadenceYieldsInstructionalSlots, openCadenceUnitMethod],
  );

  useEffect(() => {
    if (cadenceYieldsInstructionalSlots) setAddContentCadenceInlineHint(false);
  }, [cadenceYieldsInstructionalSlots]);

  // When modal opens (without an explicit academic year id), load latest academic year so "Apply again" replaces instead of duplicating — unless openForNewPlan (header button: create new)
  useEffect(() => {
    if (!visible || !familyId || openForNewPlan) return;
    if (academicYearId || initialAcademicYearId) return;
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase
        .from('academic_years')
        .select('id')
        .eq('family_id', familyId)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (!cancelled && rows?.length > 0) setAcademicYearId(rows[0].id);
    })();
    return () => { cancelled = true; };
  }, [visible, familyId, openForNewPlan]);

  // When opening for "new plan" (header button), clear academic year so form starts empty
  useEffect(() => {
    if (visible && openForNewPlan && !initialAcademicYearId) {
      setAcademicYearId(null);
      setLoadError(null);
      loadedYearIdRef.current = null;
      setUnitStructureData(null);
      setLastSavedUnitSubjectId(null);
      setLoadedPlanCurriculumSubjectIds([]);
      setPlanSummaryCurriculumBySubjectId({});
    }
  }, [visible, openForNewPlan, initialAcademicYearId]);

  // When opening from banner (Edit plan), sync passed academic year id and clear stale form fields before cache/network hydrate
  useEffect(() => {
    if (visible && initialAcademicYearId) {
      setAcademicYearId(initialAcademicYearId);
      setStartDate('');
      setEndDate('');
      setBlocks([]);
      setUnitStructureData(null);
      setLastSavedUnitSubjectId(null);
      setLoadedPlanCurriculumSubjectIds([]);
      setPlanSummaryCurriculumBySubjectId({});
    }
  }, [visible, initialAcademicYearId]);

  // When true, user chose "Create new plan" from picker — show full form even with no plan selected
  // When opening for new plan with no year, go straight to METHOD (screen 1); no entry/loading flash
  // When openToEditPlanList, keep false so we show YOUR PLANS (existing plans), not the create flow
  const [startCreatingNew, setStartCreatingNew] = useState(() => !!(openForNewPlan && !initialAcademicYearId && !openToEditPlanList));

  // Fetch all academic years for this family for "Edit plan" picker (show every plan/year ever created, not only those with a plan row)
  const [previousPlans, setPreviousPlans] = useState(() => {
    const c = familyId ? getAcademicYearsPickerCache(familyId) : null;
    return c !== null ? c : [];
  });
  /** True once we have a definitive picker row list (module cache or first fetch done). Never drives a spinner. */
  const [previousPlansListFetched, setPreviousPlansListFetched] = useState(() => {
    if (!familyId) return false;
    return getAcademicYearsPickerCache(familyId) !== null;
  });
  const [planListRowTimesById, setPlanListRowTimesById] = useState(() => {
    const rows = familyId ? getAcademicYearsPickerCache(familyId) : null;
    return getPlanEditListTimesForPlans(familyId, rows !== null ? rows : []);
  });

  useEffect(() => {
    if (!familyId) return;
    const cachedRows = getAcademicYearsPickerCache(familyId);
    if (cachedRows !== null) {
      setPreviousPlans(cachedRows);
      setPreviousPlansListFetched(true);
      const times = getPlanEditListTimesForPlans(familyId, cachedRows);
      if (Object.keys(times).length > 0) {
        setPlanListRowTimesById((prev) => ({ ...times, ...prev }));
      }
    }
  }, [familyId]);

  const editPlanListRows = useMemo(() => {
    const rows = (Array.isArray(previousPlans) ? previousPlans : []).filter((ay) =>
      planRowSubjectsStillExist(ay, baseSubjectList, familyId),
    );
    return [...rows].sort((a, b) =>
      editPlanListSortKey(a).localeCompare(editPlanListSortKey(b), undefined, {
        sensitivity: 'base',
        numeric: true,
      }),
    );
  }, [previousPlans, baseSubjectList, familyId]);

  const existingPlansForSelectedSubjects = useMemo(() => {
    const selectedIds = (selectedSubjectIds || []).map(String).filter(Boolean);
    if (!familyId || selectedIds.length === 0) return [];
    const selectedNameById = new Map(
      (baseSubjectList || [])
        .filter((s) => s?.id != null && s?.name)
        .map((s) => [String(s.id), String(s.name).trim().toLowerCase()]),
    );
    const selectedNames = new Set(
      selectedIds
        .map((id) => selectedNameById.get(id))
        .filter(Boolean),
    );
    return editPlanListRows
      .map((ay) => {
        const cached =
          planSummaryCacheRef.current.get(ay.id) ||
          getPlanYearFullDataFromCache(familyId, ay.id);
        const planSubjectIds = [
          ...new Set(
            (cached?.plan?.blocks || [])
              .map((b) => b?.subject_id)
              .filter(Boolean)
              .map(String),
          ),
        ];
        const matchedSubjectIds = planSubjectIds.filter((id) => selectedIds.includes(String(id)));
        const matchedSubjectNames =
          matchedSubjectIds.length > 0
            ? matchedSubjectIds
                .map((id) => baseSubjectList.find((s) => String(s.id) === String(id))?.name)
                .filter(Boolean)
            : extractPlanSubjectNamesFromYearName(ay).filter((name) => selectedNames.has(String(name).toLowerCase()));
        if (matchedSubjectIds.length === 0 && matchedSubjectNames.length === 0) return null;
        return {
          id: ay.id,
          yearName: ay.year_name || 'Plan',
          matchedSubjectNames: [...new Set(matchedSubjectNames)],
          cached,
        };
      })
      .filter(Boolean);
  }, [familyId, selectedSubjectIds, baseSubjectList, editPlanListRows]);

  const prefetchYearSummaryForEditList = useCallback((yearId, cancelledRef) => {
    if (!familyId || !yearId) return;
    const fromModule = getPlanYearFullDataFromCache(familyId, yearId);
    if (fromModule) {
      planSummaryCacheRef.current.set(yearId, fromModule);
      const s0 = getPlanBlocksTimesSummary(fromModule);
      if (s0) {
        mergePlanEditListTimesCache(familyId, { [yearId]: s0 });
        setPlanListRowTimesById((prev) => ({ ...prev, [yearId]: s0 }));
      }
    }
    if (planSummaryCacheRef.current.has(yearId) || summaryFetchInFlightRef.current.has(yearId)) return;
    summaryFetchInFlightRef.current.add(yearId);
    getAcademicYear(yearId)
      .then(({ data }) => {
        summaryFetchInFlightRef.current.delete(yearId);
        if (cancelledRef?.current) return;
        if (data) {
          mergePlanYearFullDataCache(familyId, yearId, data);
          planSummaryCacheRef.current.set(yearId, data);
        }
        const s = getPlanBlocksTimesSummary(data);
        if (s) {
          mergePlanEditListTimesCache(familyId, { [yearId]: s });
          setPlanListRowTimesById((prev) => ({ ...prev, [yearId]: s }));
        }
      })
      .catch(() => {
        summaryFetchInFlightRef.current.delete(yearId);
      });
  }, [familyId]);

  /** Refetch academic year rows for YOUR PLANS / Edit plan list (keeps module cache in sync after create or apply). */
  const refreshPreviousPlansList = useCallback(async () => {
    if (!familyId) return;
    const { data: rows, error: err } = await supabase
      .from('academic_years')
      .select('id, year_name, start_date, end_date, updated_at')
      .eq('family_id', familyId)
      .order('start_date', { ascending: false });
    if (err) return;
    const next = Array.isArray(rows) ? rows : [];
    setAcademicYearsPickerCache(familyId, next);
    setPreviousPlans(next);
    setPreviousPlansListFetched(true);
    const cancelledRef = { get current() { return false; } };
    next
      .map((r) => r.id)
      .filter(Boolean)
      .forEach((id) => prefetchYearSummaryForEditList(id, cancelledRef));
  }, [familyId, prefetchYearSummaryForEditList]);

  /** After plan slots, dates, or curriculum change: drop stale caches, refresh calendar (incl. home), plan health, open summary. */
  const bumpPlanSurfacesAfterMutation = useCallback(
    (yearIdOverride) => {
      if (!familyId) return;
      const yid =
        yearIdOverride != null && String(yearIdOverride).trim() !== ''
          ? String(yearIdOverride)
          : null;
      if (yid) {
        dropPlanYearFullDataCacheEntry(familyId, yid);
        dropPlanEditListTimesCacheEntry(familyId, yid);
        planSummaryCacheRef.current.delete(yid);
        summaryFetchInFlightRef.current.delete(yid);
        const cancelledRef = { get current() { return false; } };
        prefetchYearSummaryForEditList(yid, cancelledRef);
      }
      invalidatePlanHealthCache();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
        const startYmd = startDate && String(startDate).trim();
        const endYmd = endDate && String(endDate).trim();
        const dispatchMonths = [];
        if (
          startYmd &&
          endYmd &&
          /^\d{4}-\d{2}-\d{2}$/.test(startYmd) &&
          /^\d{4}-\d{2}-\d{2}$/.test(endYmd)
        ) {
          const [startYear, startMonth] = startYmd.split('-').map(Number);
          const [endYear, endMonth] = endYmd.split('-').map(Number);
          let year = startYear;
          let month = startMonth - 1;
          const lastKey = `${endYear}-${endMonth - 1}`;
          const seen = new Set();
          while (true) {
            const key = `${year}-${month}`;
            if (!seen.has(key)) {
              seen.add(key);
              dispatchMonths.push({ targetYear: year, targetMonth: month });
            }
            if (key === lastKey) break;
            month += 1;
            if (month > 11) {
              month = 0;
              year += 1;
            }
          }
        }

        if (dispatchMonths.length === 0) {
          dispatchMonths.push({
            targetYear: plannerDate?.getFullYear?.() ?? new Date().getFullYear(),
            targetMonth: plannerDate?.getMonth?.() ?? new Date().getMonth(),
          });
        }

        dispatchMonths.forEach((monthDetail, index) => {
          window.dispatchEvent(
            new CustomEvent('refreshCalendar', {
              detail: {
                forceInvalidate: true,
                skipHomeRefresh: index > 0,
                ...monthDetail,
              },
            }),
          );
        });

        window.dispatchEvent(new CustomEvent('planAppliedToCalendar'));
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('refreshCalendar', {
              detail: {
                forceInvalidate: true,
                skipHomeRefresh: true,
              },
            }),
          );
        }, 250);
      }
      if (yid && planSummaryYearId && String(planSummaryYearId) === String(yid)) {
        getAcademicYear(yid).then(({ data: fresh, error }) => {
          if (!error && fresh) {
            mergePlanYearFullDataCache(familyId, yid, fresh);
            planSummaryCacheRef.current.set(yid, fresh);
            setPlanSummaryData(fresh);
          }
        });
      }
    },
    [familyId, startDate, planSummaryYearId, prefetchYearSummaryForEditList],
  );

  const applyExtendedPlanEndDateFromSummary = useCallback(
    async (extYmd) => {
      if (!extYmd || !/^\d{4}-\d{2}-\d{2}$/.test(extYmd)) return;
      if (!familyId || !planSummaryYearId || !planSummaryData?.plan) {
        applyExtendedPlanEndDate(extYmd);
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const holidaySettings = planSummaryData.holiday_settings || {};
        const holidayRegion =
          holidaySettings.holiday_region ||
          (holidaySettings.holiday_country_code
            ? `${holidaySettings.holiday_country_code}${holidaySettings.holiday_region ? `:${holidaySettings.holiday_region}` : ''}`
            : 'US');
        const customHolidays = Array.isArray(planSummaryData.holidays)
          ? planSummaryData.holidays
              .filter((h) => (h.type || 'CUSTOM_HOLIDAY') === 'CUSTOM_HOLIDAY')
              .map((h) => ({
                date: typeof h.date === 'string' ? h.date.slice(0, 10) : String(h.date || '').slice(0, 10),
                name: h.name || '',
                type: h.type || 'CUSTOM_HOLIDAY',
              }))
          : [];
        const { data: exclusions } = await getAcademicYearExclusions(planSummaryYearId);
        const customBreaksForApply = Array.isArray(exclusions)
          ? exclusions
              .filter((e) => e?.exclusion_type === 'break')
              .map((e) => ({
                start: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : String(e.start_date || '').slice(0, 10),
                end: typeof e.end_date === 'string' ? e.end_date.slice(0, 10) : String(e.end_date || '').slice(0, 10),
                name: e.label || 'Break',
              }))
          : [];
        const blocksForApply = (planSummaryData.plan.blocks || []).map((b) => ({
          block_id: b.block_id,
          subject_id: b.subject_id ?? null,
          placeholder_label: b.placeholder_label || undefined,
          child_ids: Array.isArray(b.child_ids) ? b.child_ids : [],
          weekdays: Array.isArray(b.weekdays) ? b.weekdays : [],
          start_time: b.start_time || '09:00',
          end_time: b.end_time || '10:00',
          all_day: !!b.all_day,
        }));
        const payload = {
          academic_year_id: planSummaryYearId,
          family_id: familyId,
          start_date: planSummaryData.plan.start_date || planSummaryData.start_date || '',
          end_date: extYmd,
          follow_public_holidays: holidaySettings.follow_global_holidays !== false,
          holiday_region: holidayRegion,
          excluded_holiday_dates: holidaySettings.excluded_holiday_dates || [],
          custom_holidays: customHolidays,
          custom_breaks: customBreaksForApply,
          target_instructional_days:
            (planSummaryData.plan.constraint_mode === 'days' ? planSummaryData.plan.target_days : null) ??
            TARGET_INSTRUCTIONAL_DAYS_DEFAULT,
          subjects: [...new Set(blocksForApply.map((b) => b.subject_id).filter(Boolean))],
          constraint_mode: planSummaryData.plan.constraint_mode || 'none',
          target_days: planSummaryData.plan.target_days ?? null,
          target_hours: planSummaryData.plan.target_hours ?? null,
          child_id: null,
          replace_placeholders: true,
        create_calendar_events: true,
          blocks: blocksForApply,
          year_name: planSummaryData.year_name || undefined,
          timezone: (function getClientTimezone() {
            try {
              if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
                const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (tz && typeof tz === 'string') return tz.trim();
              }
            } catch (_) {}
            return 'America/New_York';
          })(),
        };
        const { data, error } = await applyToCalendar(payload);
        if (error) throw error;
        setEndDate(extYmd);
        if (familyId && payload.start_date) {
          setPlanBuildLogisticsDatesCache(familyId, payload.start_date, extYmd);
        }
        const optimisticSlotLines = buildPreviewSlotLinesForPlanYear({
          startDate: payload.start_date,
          endDate: extYmd,
          blocks: blocksForApply,
          customHolidays,
          customBreaks: customBreaksForApply,
          baseSubjectList,
          children,
          allFamilyChildIds,
        });
        if (typeof window !== 'undefined' && data?.academic_year_id) {
          const subjectIds = [...new Set(blocksForApply.map((b) => b?.subject_id).filter(Boolean).map(String))];
          window.dispatchEvent(
            new CustomEvent('planSlotsCreated', {
              detail: {
                academicYearId: data.academic_year_id,
                subjectIds,
                slots: optimisticSlotLines.map((line) => ({
                  id: `optimistic-plan-slot-${data.academic_year_id}-${line.blockId || 'slot'}-${line.date}`,
                  academic_year_id: data.academic_year_id,
                  title: line.subjectName || 'Lesson',
                  subject_id: line.subjectId ?? null,
                  start_local: line.timeLabel === 'All day' ? '09:00' : (String(line.timeLabel || '').split('–')[0] || '09:00').trim(),
                  end_local: line.timeLabel === 'All day' ? '15:00' : (String(line.timeLabel || '').split('–')[1] || '10:00').trim(),
                  date_local: line.date,
                  child_id: null,
                  generated_by: 'plan_year',
                  is_flexible: true,
                })),
              },
            }),
          );
          window.dispatchEvent(
            new CustomEvent('planSlotsUpdated', {
              detail: {
                academicYearId: data.academic_year_id,
                subjectIds,
                slots: optimisticSlotLines.map((line) => ({
                  date_local: line.date,
                  subject_id: line.subjectId ?? null,
                  title: line.subjectName || 'Lesson',
                  start_local: line.timeLabel === 'All day' ? '09:00' : (String(line.timeLabel || '').split('–')[0] || '09:00').trim(),
                  end_local: line.timeLabel === 'All day' ? '15:00' : (String(line.timeLabel || '').split('–')[1] || '10:00').trim(),
                })),
              },
            }),
          );
        }
        bumpPlanSurfacesAfterMutation(data?.academic_year_id ?? planSummaryYearId);
        toast.push(
          t('planMyYear.multiSubjectUnits.lessonsOverflowExtendCta', { endDate: formatDateDisplay(extYmd) }),
          'success',
        );
      } catch (err) {
        const errMsg = err?.message || 'Failed to extend plan end date.';
        setError(errMsg);
        toast.push(errMsg, 'error');
      } finally {
        setSaving(false);
      }
    },
    [
      familyId,
      planSummaryYearId,
      planSummaryData,
      applyExtendedPlanEndDate,
      baseSubjectList,
      children,
      allFamilyChildIds,
      bumpPlanSurfacesAfterMutation,
      t,
      toast,
    ],
  );

  useEffect(() => {
    if (!visible || !familyId) return;
    const cachedRows = getAcademicYearsPickerCache(familyId);
    if (cachedRows !== null) {
      setPreviousPlans(cachedRows);
      setPreviousPlansListFetched(true);
      const fromModule = getPlanEditListTimesForPlans(familyId, cachedRows);
      if (Object.keys(fromModule).length > 0) {
        setPlanListRowTimesById((prev) => ({ ...fromModule, ...prev }));
      }
      let stale = false;
      const cancelledRef = { get current() { return stale; } };
      cachedRows
        .map((r) => r.id)
        .filter(Boolean)
        .forEach((id) => prefetchYearSummaryForEditList(id, cancelledRef));
      return () => {
        stale = true;
      };
    }
    let cancelled = false;
    const cancelledRef = { get current() { return cancelled; } };
    setPreviousPlansListFetched(false);
    (async () => {
      await prefetchPlanEditListForFamily(familyId);
      if (cancelled) return;
      const next = getAcademicYearsPickerCache(familyId) || [];
      setPreviousPlansListFetched(true);
      setPreviousPlans(next);
      next
        .map((r) => r.id)
        .filter(Boolean)
        .forEach((id) => prefetchYearSummaryForEditList(id, cancelledRef));
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, familyId, prefetchYearSummaryForEditList]);

  useEffect(() => {
    if (!familyId || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const onPrefetch = (ev) => {
      if (ev?.detail?.familyId !== familyId) return;
      const rows = getAcademicYearsPickerCache(familyId);
      if (rows == null) return;
      setPreviousPlans(rows);
      setPreviousPlansListFetched(true);
      const times = getPlanEditListTimesForPlans(familyId, rows);
      if (Object.keys(times).length > 0) {
        setPlanListRowTimesById((prev) => ({ ...times, ...prev }));
      }
      rows.forEach((r) => {
        const yid = r?.id;
        if (!yid) return;
        const full = getPlanYearFullDataFromCache(familyId, yid);
        if (full) planSummaryCacheRef.current.set(yid, full);
      });
    };
    window.addEventListener('planEditListPrefetchComplete', onPrefetch);
    return () => window.removeEventListener('planEditListPrefetchComplete', onPrefetch);
  }, [familyId]);

  // Fill time sublines from module cache when plans appear; fetch any missing summaries (deduped with list prefetch).
  useEffect(() => {
    if (!familyId || !editPlanListRows.length || !previousPlansListFetched) return;
    let stale = false;
    const cancelledRef = { get current() { return stale; } };
    const fromModule = getPlanEditListTimesForPlans(familyId, editPlanListRows);
    if (Object.keys(fromModule).length > 0) {
      setPlanListRowTimesById((prev) => ({ ...fromModule, ...prev }));
    }
    editPlanListRows
      .map((ay) => ay.id)
      .filter(Boolean)
      .forEach((id) => prefetchYearSummaryForEditList(id, cancelledRef));
    return () => {
      stale = true;
    };
  }, [familyId, editPlanListRows, previousPlansListFetched, prefetchYearSummaryForEditList]);

  // When modal closes, defer clearing plan summary state until after close animation so we don't flash YOUR PLANS list
  useEffect(() => {
    if (!visible) {
      setEditingFromSummary(false);
      subjectPlanResolvedRef.current = false;
      const t = setTimeout(() => {
        setPlanSummaryYearId(null);
        setPlanSummaryData(null);
        setPlanSummaryError(null);
        setPlanListRowTimesById({});
      }, 320);
      return () => clearTimeout(t);
    }
  }, [visible]);

  // When opening from subject details or "Edit plan" in toolbar, show YOUR PLANS list directly (skip "Editing or creating?" choice)
  useEffect(() => {
    if (visible && (fromSubjectDetail || openToEditPlanList) && !skipInitialPlanSummary) {
      setShowPlanManagerView(true);
    }
  }, [visible, fromSubjectDetail, openToEditPlanList, skipInitialPlanSummary]);

  // When opening from subject details and no plan exists, default to first step with one-subject preselected
  useEffect(() => {
    if (visible && fromSubjectDetail && previousPlansListFetched && previousPlans.length === 0) {
      setStartCreatingNew(true);
      setPlanStep(getInitialPlanStep(PLAN_MY_YEAR_LOGISTICS_FIRST));
      setPlanningScope('one_subject');
    }
  }, [visible, fromSubjectDetail, previousPlansListFetched, previousPlans]);

  // When opened from subject details with a subject, find a plan that includes this subject and open its summary if any
  useEffect(() => {
    if (skipInitialPlanSummary) {
      subjectPlanResolvedRef.current = true;
      return;
    }
    if (!visible || !fromSubjectDetail || !initialSubjectId || !familyId) return;
    if (!previousPlansListFetched) return;
    if (editPlanListRows.length === 0) {
      subjectPlanResolvedRef.current = true;
      return;
    }
    if (subjectPlanResolvedRef.current) return;
    subjectPlanResolvedRef.current = true;
    let cancelled = false;
    (async () => {
      const subjectId = String(initialSubjectId);
      for (const ay of editPlanListRows) {
        if (!ay?.id || cancelled) break;
        let cached = planSummaryCacheRef.current.get(ay.id);
        if (!cached) {
          const fromMod = getPlanYearFullDataFromCache(familyId, ay.id);
          if (fromMod) {
            planSummaryCacheRef.current.set(ay.id, fromMod);
            cached = fromMod;
          }
        }
        if (cached?.plan?.blocks?.some((b) => String(b?.subject_id) === subjectId)) {
          if (!cancelled) {
            planSummaryCacheRef.current.set(ay.id, cached);
            setPlanSummaryData(cached);
            setPlanSummaryError(null);
            setPlanSummaryYearId(ay.id);
          }
          return;
        }
        const { data } = await getAcademicYear(ay.id);
        if (cancelled) return;
        if (data?.plan?.blocks?.some((b) => String(b?.subject_id) === subjectId)) {
          if (data) {
            mergePlanYearFullDataCache(familyId, ay.id, data);
            planSummaryCacheRef.current.set(ay.id, data);
          }
          setPlanSummaryData(data || null);
          setPlanSummaryError(null);
          setPlanSummaryYearId(ay.id);
          return;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [visible, fromSubjectDetail, initialSubjectId, familyId, editPlanListRows, previousPlansListFetched, skipInitialPlanSummary]);

  // When opening from event details (Edit Plan) or plan health with a specific plan, go straight to plan summary view
  const openedToPlanSummaryRef = useRef(false);
  useEffect(() => {
    if (!visible) {
      openedToPlanSummaryRef.current = false;
      return;
    }
    if (initialAcademicYearId && !openForNewPlan && !openedToPlanSummaryRef.current && !skipInitialPlanSummary) {
      openedToPlanSummaryRef.current = true;
      const cached =
        (familyId ? getPlanYearFullDataFromCache(familyId, initialAcademicYearId) : null) ||
        planSummaryCacheRef.current.get(initialAcademicYearId) ||
        null;
      if (cached) planSummaryCacheRef.current.set(initialAcademicYearId, cached);
      setPlanSummaryData(cached);
      setPlanSummaryError(null);
      setPlanSummaryYearId(initialAcademicYearId);
    }
  }, [visible, initialAcademicYearId, openForNewPlan, skipInitialPlanSummary, familyId]);

  // When user selects a plan from the list, show summary from cache (ref or app-warmed module cache), then refresh in background
  useEffect(() => {
    if (!planSummaryYearId || !familyId) {
      setPlanSummaryData(null);
      setPlanSummaryError(null);
      return;
    }
    const fromRef = planSummaryCacheRef.current.get(planSummaryYearId);
    const fromModule = getPlanYearFullDataFromCache(familyId, planSummaryYearId);
    const cached = fromRef || fromModule;
    if (fromModule && !fromRef) planSummaryCacheRef.current.set(planSummaryYearId, fromModule);
    if (cached) {
      setPlanSummaryData(cached);
      setPlanSummaryError(null);
    } else {
      setPlanSummaryData(null);
      setPlanSummaryError(null);
    }
    let cancelled = false;
    getAcademicYear(planSummaryYearId).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        if (!cached) {
          setPlanSummaryData(null);
          setPlanSummaryError(error.message || 'Failed to load plan.');
        }
      } else {
        if (data) {
          mergePlanYearFullDataCache(familyId, planSummaryYearId, data);
          planSummaryCacheRef.current.set(planSummaryYearId, data);
        }
        setPlanSummaryData(data || null);
        setPlanSummaryError(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [planSummaryYearId, familyId]);

  // When an event is deleted and plan summary is open, refetch so "Dates with events" updates immediately
  useEffect(() => {
    if (typeof window === 'undefined' || !planSummaryYearId || !familyId) return;
    const handler = () => {
      planSummaryCacheRef.current.delete(planSummaryYearId);
      getAcademicYear(planSummaryYearId).then(({ data, error }) => {
        if (!error && data) {
          planSummaryCacheRef.current.set(planSummaryYearId, data);
          setPlanSummaryData(data);
        }
      });
      getAcademicYearPlanEvents(familyId, planSummaryYearId).then(({ data, error }) => {
        if (!error) {
          setPlanSummaryActualEvents(Array.isArray(data?.events) ? data.events : []);
        }
      });
    };
    window.addEventListener('eventDeleted', handler);
    return () => window.removeEventListener('eventDeleted', handler);
  }, [planSummaryYearId, familyId]);

  useEffect(() => {
    if (!planSummaryYearId) {
      setPlanSummaryStrikeKeys([]);
      planSummaryGhostLinesRef.current = new Map();
      setPlanSummaryCurriculumBySubjectId({});
      setPlanSummaryActualEvents([]);
    }
  }, [planSummaryYearId]);

  useEffect(() => {
    if (!planSummaryYearId || !familyId) {
      setPlanSummaryActualEvents([]);
      return;
    }
    let cancelled = false;
    getAcademicYearPlanEvents(familyId, planSummaryYearId).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setPlanSummaryActualEvents([]);
        return;
      }
      setPlanSummaryActualEvents(Array.isArray(data?.events) ? data.events : []);
    });
    return () => {
      cancelled = true;
    };
  }, [planSummaryYearId, familyId]);

  useEffect(() => {
    if (!planSummaryData || !familyId || !planSummaryYearId) return;
    const blocks = Array.isArray(planSummaryData?.plan?.blocks) ? planSummaryData.plan.blocks : [];
    const planSlotLabels = Array.isArray(planSummaryData?.plan?.plan_slot_labels) ? planSummaryData.plan.plan_slot_labels : [];
    const subjectIds = [
      ...new Set(
        planSlotLabels
          .filter((label) => !label?.open_plan_slot && ((label?.unit || '').trim() || (label?.lesson || '').trim()))
          .map((label) => label?.subject_id)
          .filter(Boolean)
          .map(String),
      ),
    ];
    if (subjectIds.length === 0) {
      setPlanSummaryCurriculumBySubjectId({});
      return;
    }
    const cachedEntries = subjectIds
      .map((subjectId) => [
        subjectId,
        curriculumStructureCacheRef.current.get(
          curriculumStructureCacheKey(subjectId, planSummaryYearId)
        ) || null,
      ])
      .filter(([, value]) => value);
    if (cachedEntries.length > 0) {
      setPlanSummaryCurriculumBySubjectId((prev) => ({
        ...prev,
        ...Object.fromEntries(cachedEntries),
      }));
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        subjectIds.map(async (subjectId) => {
          const cacheKey = curriculumStructureCacheKey(subjectId, planSummaryYearId);
          const cached = curriculumStructureCacheRef.current.get(cacheKey);
          if (cached) return [subjectId, cached];
          try {
            const { data, error } = await fetchSubjectCurriculumEventsStructure(familyId, subjectId, planSummaryYearId);
            if (error || !data) return [subjectId, null];
            curriculumStructureCacheRef.current.set(cacheKey, data);
            return [subjectId, data];
          } catch (_) {
            return [subjectId, null];
          }
        }),
      );
      if (!cancelled) {
        setPlanSummaryCurriculumBySubjectId(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planSummaryData, familyId, planSummaryYearId]);

  // After event save/edit elsewhere, refresh plan summary so titles and slot lines stay in sync
  useEffect(() => {
    if (typeof window === 'undefined' || !planSummaryYearId || !familyId) return;
    const refetchSummary = () => {
      planSummaryCacheRef.current.delete(planSummaryYearId);
      getAcademicYear(planSummaryYearId).then(({ data, error }) => {
        if (!error && data) {
          planSummaryCacheRef.current.set(planSummaryYearId, data);
          setPlanSummaryData({ ...data });
        }
      });
      getAcademicYearPlanEvents(familyId, planSummaryYearId).then(({ data, error }) => {
        if (!error) {
          setPlanSummaryActualEvents(Array.isArray(data?.events) ? data.events : []);
        }
      });
    };
    const handler = () => {
      clearTimeout(planSummaryCalendarRefreshTimerRef.current);
      planSummaryCalendarRefreshTimerRef.current = setTimeout(refetchSummary, 450);
    };
    window.addEventListener('refreshCalendar', handler);
    return () => {
      window.removeEventListener('refreshCalendar', handler);
      clearTimeout(planSummaryCalendarRefreshTimerRef.current);
    };
  }, [planSummaryYearId, familyId]);

  const goBackPlanSummaryToList = useCallback(() => {
    setPlanSummaryYearId(null);
    setPlanSummaryData(null);
    setPlanSummaryError(null);
    setAcademicYearId(null);
    setEditingFromSummary(false);
    setPlanSummaryStrikeKeys([]);
    planSummaryGhostLinesRef.current = new Map();
  }, []);

  // Toolbar "Build plan": drop plan-summary / edit drill-down so the structured build wizard shows (not the prior plan).
  useEffect(() => {
    if (!visible || !openDirectlyToScope) return;
    if (renderInline && openForNewPlan) {
      goBackPlanSummaryToList();
      setShowPlanManagerView(false);
    }
    setStartCreatingNew(true);
    // Keep direct "Add units" routes on the unit-structure step.
    // Without this guard, openDirectlyToScope can reset the entry step
    // back to the generic planning flow and bypass manual/paste/generate entry.
    if (initialUnitStructureMethod) {
      setPlanStep('unit_structure');
    } else {
      setPlanStep(getInitialPlanStep(PLAN_MY_YEAR_LOGISTICS_FIRST));
    }
  }, [
    visible,
    openDirectlyToScope,
    renderInline,
    openForNewPlan,
    goBackPlanSummaryToList,
    initialUnitStructureMethod,
  ]);

  /** Right toolbar "Edit plan" while drilled into a plan summary or logistics: show YOUR PLANS list again. */
  const resetInlineEditPlanDrillDown = useCallback(() => {
    if (!renderInline) return;
    goBackPlanSummaryToList();
    setShowPlanManagerView(true);
    setPlanStep(getInitialPlanStep(PLAN_MY_YEAR_LOGISTICS_FIRST));
    setStartCreatingNew(false);
  }, [renderInline, goBackPlanSummaryToList]);

  useEffect(() => {
    if (typeof window === 'undefined' || Platform.OS !== 'web' || !renderInline) return;
    const handler = () => {
      if (!visible) return;
      resetInlineEditPlanDrillDown();
    };
    window.addEventListener('planYearReturnToEditPlanList', handler);
    return () => window.removeEventListener('planYearReturnToEditPlanList', handler);
  }, [visible, renderInline, resetInlineEditPlanDrillDown]);

  const goBackFromLogisticsToPlanList = useCallback(() => {
    if (!academicYearId) return;
    if (openForNewPlan) {
      setPlanSummaryYearId(academicYearId);
      setPlanSummaryData(planSummaryCacheRef.current.get(academicYearId) || null);
      setShowPlanManagerView(true);
      setEditingFromSummary(false);
    } else {
      onClose();
    }
  }, [academicYearId, openForNewPlan, onClose]);

  const handlePlanSummaryRowDelete = useCallback(
    async (line, slotKey) => {
      planSummaryGhostLinesRef.current.set(slotKey, { ...line });
      setPlanSummaryStrikeKeys((prev) => [...new Set([...prev, slotKey])]);
      if (line.eventId && familyId) {
        const { error } = await deletePlannerEventSoft(line.eventId, familyId);
        if (error) {
          toast.push(error.message || 'Could not remove this event.', 'error');
          setPlanSummaryStrikeKeys((prev) => prev.filter((k) => k !== slotKey));
          planSummaryGhostLinesRef.current.delete(slotKey);
          return;
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipHomeRefresh: true } }));
          window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { eventId: line.eventId } }));
        }
      }
    },
    [familyId, toast]
  );

  const handlePlanSummaryRowRestore = useCallback(
    async (line, slotKey) => {
      if (line.eventId && familyId) {
        const { error } = await restoreEventFromTrash(line.eventId, familyId);
        if (error) {
          toast.push(error.message || 'Could not restore this event.', 'error');
          return;
        }
      }
      setPlanSummaryStrikeKeys((prev) => prev.filter((k) => k !== slotKey));
      planSummaryGhostLinesRef.current.delete(slotKey);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipHomeRefresh: true } }));
      }
    },
    [familyId, toast]
  );

  // When we have academicYearId, load full year + plan to populate form (for "Edit plan" from banner)
  const loadedYearIdRef = useRef(null);
  const invalidYearIdRef = useRef(new Set());
  const savedTargetsAppliedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCloseRef.current = onClose;
    onCompleteRef.current = onComplete;
  }, [onClose, onComplete]);
  useEffect(() => {
    const yearIdToLoad = initialAcademicYearId || academicYearId;
    if (!visible || !yearIdToLoad || !familyId) return;
    if (invalidYearIdRef.current.has(String(yearIdToLoad))) return;
    if (loadedYearIdRef.current === yearIdToLoad) return;
    setCadenceBaselineKey(null);
    let cancelled = false;

    const applyYearPayload = (data) => {
      if (!data) return;
      setLoadError(null);
      loadedYearIdRef.current = yearIdToLoad;
      setAcademicYearId(yearIdToLoad);
      const created = data.plan?.created_at || data.created_at;
      const updated = data.plan?.updated_at || data.updated_at;
      setPlanCreatedAt(created || null);
      setPlanUpdatedAt(updated || null);
      setStartDate(data.start_date || '');
      setEndDate(data.end_date || '');
      setMode(data.mode || 'FIXED_END');
      if (data.holiday_settings) {
        setFollowGlobalHolidays(data.holiday_settings.follow_global_holidays !== false);
        setCountryCode(data.holiday_settings.holiday_country_code || 'US');
        setRegionCode(data.holiday_settings.holiday_region || null);
        setExcludedPublicHolidayDates(Array.isArray(data.holiday_settings.excluded_holiday_dates) ? data.holiday_settings.excluded_holiday_dates : []);
      }
      if (data.plan) {
        const p = data.plan;
        setStartDate(p.start_date || data.start_date || '');
        setEndDate(p.end_date || data.end_date || '');
        setPlanConstraintMode(p.constraint_mode === 'hours' ? 'hours' : p.constraint_mode === 'days' ? 'days' : 'none');
        setPlanTargetDays(p.target_days != null ? String(p.target_days) : '180');
        setPlanTargetHours(p.target_hours != null ? String(p.target_hours) : '1000');
        if (p.subject_targets && typeof p.subject_targets === 'object' && Object.keys(p.subject_targets).length > 0) {
          const overrides = {};
          Object.entries(p.subject_targets).forEach(([sid, st]) => {
            if (st && (st.target_days != null || st.target_hours != null)) {
              overrides[sid] = {
                mode: st.target_days != null ? 'days' : 'hours',
                days: st.target_days != null ? String(st.target_days) : '',
                hours: st.target_hours != null ? String(st.target_hours) : '',
              };
            }
          });
          setPlanSubjectTargetsOverride(overrides);
        }
        const planBlocks = Array.isArray(p.blocks) ? p.blocks : [];
        const planCurriculumSubjectIds = [
          ...new Set(
            (Array.isArray(p.plan_slot_labels) ? p.plan_slot_labels : [])
              .filter((label) => !label?.open_plan_slot && ((label?.unit || '').trim() || (label?.lesson || '').trim()))
              .map((label) => label?.subject_id)
              .filter(Boolean)
              .map(String),
          ),
        ];
        setLoadedPlanCurriculumSubjectIds(planCurriculumSubjectIds);
        if (planBlocks.length > 0) {
          const subjectIdsFromPlan = Array.from(
            new Set(
              planBlocks
                .map((b) => b.subject_id)
                .filter(Boolean)
            )
          );
          if (subjectIdsFromPlan.length > 0) {
            setSelectedSubjectIds(subjectIdsFromPlan);
          }
        }
        if (planBlocks.length > 0) {
          const mappedBlocks = planBlocks.map((b) => ({
            block_id: b.block_id || (crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}-${b.subject_id}`),
            subject_id: b.subject_id,
            child_ids: Array.isArray(b.child_ids) ? b.child_ids : [],
            weekdays: Array.isArray(b.weekdays) ? b.weekdays : [],
            start_time: b.start_time || '09:00',
            end_time: b.end_time || '10:00',
            all_day: !!b.all_day,
          }));
          setBlocks(mappedBlocks);
          setCadenceBaselineKey(serializeCadenceSnapshot(mappedBlocks));
        }
      }
      const customHols = Array.isArray(data.holidays)
        ? data.holidays
            .filter((h) => (h.type || 'CUSTOM_HOLIDAY') === 'CUSTOM_HOLIDAY')
            .map((h) => ({
              date: typeof h.date === 'string' ? h.date.slice(0, 10) : (h.date?.isoformat?.() || String(h.date || '').slice(0, 10)),
              name: h.name || '',
              type: 'CUSTOM_HOLIDAY',
            }))
        : [];
      setCustomHolidays(customHols);
    };

    const loadExclusions = async () => {
      const { data: exclusions } = await getAcademicYearExclusions(yearIdToLoad);
      if (cancelled) return;
      if (exclusions && exclusions.length > 0) {
        const breaks = exclusions.filter((e) => e.exclusion_type === 'break').map((e) => ({
          start: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
          end: typeof e.end_date === 'string' ? e.end_date.slice(0, 10) : (e.end_date?.isoformat?.() || String(e.end_date || '').slice(0, 10)),
          name: e.label || '',
        }));
        setCustomBreaks(breaks);
      } else {
        setCustomBreaks([]);
      }
    };

    (async () => {
      const cachedLocal =
        planSummaryCacheRef.current.get(yearIdToLoad) || getPlanYearFullDataFromCache(familyId, yearIdToLoad);

      if (cachedLocal) {
        planSummaryCacheRef.current.set(yearIdToLoad, cachedLocal);
        mergePlanYearFullDataCache(familyId, yearIdToLoad, cachedLocal);
        applyYearPayload(cachedLocal);
      }

      const { data, error } = await getAcademicYear(yearIdToLoad);
      if (cancelled) return;
      if (error) {
        const errorMsg = String(error.message || '').toLowerCase();
        const missingYear =
          error.status === 404 ||
          error.status === 500 ||
          /no academic year|academic year.*not found|not found/.test(errorMsg);
        if (missingYear) {
          invalidYearIdRef.current.add(String(yearIdToLoad));
          loadedYearIdRef.current = null;
          setAcademicYearId(null);
          setLoadError(null);
          setPlanSummaryYearId((prev) => (String(prev || '') === String(yearIdToLoad) ? null : prev));
          setPlanSummaryData(null);
          setPlanSummaryError(null);
          setShowPlanManagerView(true);
          setStartCreatingNew(false);
          setPreviousPlans((prev) => {
            const next = (Array.isArray(prev) ? prev : []).filter(
              (row) => String(row?.id || '') !== String(yearIdToLoad),
            );
            if (familyId) setAcademicYearsPickerCache(familyId, next);
            return next;
          });
          await refreshPreviousPlansList();
          return;
        }
        if (!cachedLocal) {
          const isAuth = error.status === 401 || (error.message && /token|auth|login/i.test(error.message));
          if (isAuth) {
            setLoadError('Please log in to view this plan. If you’re already logged in, try refreshing the page.');
          } else if (error.message && /invalid response format/i.test(error.message)) {
            const preview = error.preview ? ` Response: "${String(error.preview).slice(0, 100)}${String(error.preview).length > 100 ? '…' : ''}"` : '';
            setLoadError(`Could not load plan (server returned invalid data).${preview} Restart the backend and try again.`);
          } else {
            setLoadError(error.message || 'Failed to load plan.');
          }
        } else {
          planSummaryCacheRef.current.set(yearIdToLoad, cachedLocal);
          mergePlanYearFullDataCache(familyId, yearIdToLoad, cachedLocal);
          applyYearPayload(cachedLocal);
          await loadExclusions();
        }
        return;
      }
      if (!data) {
        if (cachedLocal) {
          planSummaryCacheRef.current.set(yearIdToLoad, cachedLocal);
          mergePlanYearFullDataCache(familyId, yearIdToLoad, cachedLocal);
          applyYearPayload(cachedLocal);
          await loadExclusions();
        }
        return;
      }
      planSummaryCacheRef.current.set(yearIdToLoad, data);
      mergePlanYearFullDataCache(familyId, yearIdToLoad, data);
      applyYearPayload(data);
      await loadExclusions();
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, initialAcademicYearId, academicYearId, familyId, refreshPreviousPlansList]);
  useEffect(() => {
    if (!visible) {
      loadedYearIdRef.current = null;
      invalidYearIdRef.current.clear();
      savedTargetsAppliedRef.current = false;
      setCadenceBaselineKey(null);
      setLoadError(null);
      setPlanCreatedAt(null);
      setPlanUpdatedAt(null);
      // Defer so we don't flash "Create new plan" first screen during close animation
      const t = setTimeout(() => {
        setStartCreatingNew(false);
      }, 350);
      return () => clearTimeout(t);
    }
  }, [visible]);

  // Fetch target_scope from family_planner_settings for plan resolution (overall vs per_subject)
  useEffect(() => {
    if (!visible || !familyId) return;
    getFamilyPlannerSettings(familyId).then(({ data }) => {
      if (data?.target_scope) setTargetScopeFromSettings(data.target_scope);
      else setTargetScopeFromSettings('overall');
    });
  }, [visible, familyId]);

  // While open, pick up Learning goals / target changes saved from Family → Planning Preferences or Edit subject.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!visible || !familyId) return;
    const onRefresh = () => {
      getFamilyPlannerSettings(familyId).then(({ data }) => {
        if (data?.target_scope) setTargetScopeFromSettings(data.target_scope);
        else setTargetScopeFromSettings('overall');
      });
    };
    window.addEventListener('refreshPlanDefaults', onRefresh);
    return () => window.removeEventListener('refreshPlanDefaults', onRefresh);
  }, [visible, familyId]);

  // Keep per-subject cadence draft in sync with instructional blocks (for future API / validation).
  useEffect(() => {
    if (!PLAN_MY_YEAR_MULTI_SUBJECT_CADENCE) return;
    if (!blocks?.length) {
      setPerSubjectCadenceDraft({});
      return;
    }
    const next = {};
    blocks.forEach((b) => {
      if (b?.subject_id) {
        next[String(b.subject_id)] = {
          weekdays: b.weekdays || [],
          start_time: b.start_time,
          end_time: b.end_time,
          all_day: !!b.all_day,
        };
      }
    });
    setPerSubjectCadenceDraft((prev) => {
      try {
        if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
      } catch (_) {
        /* ignore */
      }
      return next;
    });
  }, [blocks]);

  // Load planning defaults for the summary card when Logistics step is shown
  useEffect(() => {
    if (!visible || !familyId || planStep !== 'logistics') return;
    let cancelled = false;
    setPlanningDefaultsLoading(true);
    getPlanDefaultsFromSettings(familyId).then(({ settings, exclusions, excluded_holiday_dates, error }) => {
      if (cancelled) return;
      setPlanningDefaultsLoading(false);
      if (!error) setPlanningDefaultsData({ settings, exclusions: exclusions || [], excluded_holiday_dates: excluded_holiday_dates || [] });
      else setPlanningDefaultsData(null);
    });
    return () => { cancelled = true; };
  }, [visible, familyId, planStep]);

  // When opening for a new plan (no existing plan loaded), pre-fill from family_planner_settings + planner_exclusions, then fallback to latest academic_year
  useEffect(() => {
    if (!visible || !familyId || academicYearId || initialAcademicYearId || savedTargetsAppliedRef.current) return;
    let cancelled = false;
    (async () => {
      const { settings, exclusions, excluded_holiday_dates, error: settingsErr } = await getPlanDefaultsFromSettings(familyId);
      if (cancelled) return;
      if (!settingsErr && settings) {
        const hasConstraint = settings.default_constraint_mode && settings.default_constraint_mode !== 'none';
        const hasTargetDays = settings.default_target_days != null;
        const hasTargetHours = settings.default_target_hours != null;
        const hasExclusions = exclusions && exclusions.length > 0;
        const hasExcludedDates = excluded_holiday_dates && excluded_holiday_dates.length > 0;
        if (hasConstraint || hasTargetDays || hasTargetHours || hasExclusions || hasExcludedDates) {
          savedTargetsAppliedRef.current = true;
          setFollowGlobalHolidays(settings.follow_public_holidays !== false);
          if (settings.holiday_country) setCountryCode(settings.holiday_country);
          if (settings.holiday_region != null) setRegionCode(settings.holiday_region);
          if (hasExcludedDates) setExcludedPublicHolidayDates(excluded_holiday_dates);
          if (hasTargetDays) {
            setPlanConstraintMode('days');
            setPlanTargetDays(String(settings.default_target_days ?? 180));
          } else if (hasTargetHours) {
            setPlanConstraintMode('hours');
            setPlanTargetHours(String(settings.default_target_hours ?? 1000));
            if (settings.default_planned_hours_per_day != null) setHoursPerDay(String(settings.default_planned_hours_per_day));
          } else if (hasConstraint) {
            setPlanConstraintMode(settings.default_constraint_mode || 'none');
            if (settings.default_constraint_mode === 'days') setPlanTargetDays(String(settings.default_target_days ?? 180));
            if (settings.default_constraint_mode === 'hours') {
              setPlanTargetHours(String(settings.default_target_hours ?? 1000));
              if (settings.default_planned_hours_per_day != null) setHoursPerDay(String(settings.default_planned_hours_per_day));
            }
          }
          if (hasExclusions) {
            const holidays = exclusions.filter((e) => e.exclusion_type === 'holiday').map((e) => ({
              date: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
              name: e.label || '',
              type: 'CUSTOM_HOLIDAY',
            }));
            const breaks = exclusions.filter((e) => e.exclusion_type === 'break').map((e) => ({
              start: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
              end: typeof e.end_date === 'string' ? e.end_date.slice(0, 10) : (e.end_date?.isoformat?.() || String(e.end_date || '').slice(0, 10)),
              name: e.label || '',
            }));
            setCustomHolidays(holidays);
            setCustomBreaks(breaks);
          }
        }
      }
      if (!savedTargetsAppliedRef.current) {
        const { data: ay, error } = await supabase
          .from('academic_years')
          .select('id, start_date, end_date, target_instructional_days, target_instructional_hours')
          .eq('family_id', familyId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled || error || !ay) return;
        const hasDates = ay.start_date || ay.end_date;
        const hasTargetDays = ay.target_instructional_days != null;
        const hasTargetHours = ay.target_instructional_hours != null;
        if (!hasDates && !hasTargetDays && !hasTargetHours) return;
        if (cancelled) return;
        savedTargetsAppliedRef.current = true;
        if (ay.start_date) setStartDate(ay.start_date);
        if (ay.end_date) setEndDate(ay.end_date);
        if (ay.start_date && ay.end_date) setPlanBuildLogisticsDatesCache(familyId, ay.start_date, ay.end_date);
        if (hasTargetDays) {
          setPlanConstraintMode('days');
          setPlanTargetDays(String(ay.target_instructional_days));
        } else if (hasTargetHours) {
          setPlanConstraintMode('hours');
          setPlanTargetHours(String(ay.target_instructional_hours));
        }
      } else {
        const { data: ay } = await supabase
          .from('academic_years')
          .select('start_date, end_date')
          .eq('family_id', familyId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled && ay && (ay.start_date || ay.end_date)) {
          if (ay.start_date) setStartDate(ay.start_date);
          if (ay.end_date) setEndDate(ay.end_date);
          if (ay.start_date && ay.end_date) setPlanBuildLogisticsDatesCache(familyId, ay.start_date, ay.end_date);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [visible, familyId, academicYearId, initialAcademicYearId]);

  // When opening with initial subject (e.g. from "Generate curriculum"), scope to that subject
  useEffect(() => {
    if (!visible || !initialSubjectId) return;
    const subjectExists = baseSubjectList.some((s) => String(s.id) === String(initialSubjectId));
    if (subjectExists) {
      setSelectedSubjectIds([initialSubjectId]);
    }
  }, [visible, initialSubjectId, baseSubjectList]);

  // When opening with initial material (e.g. from Library "Build curriculum from this"), start in upload mode with that material
  useEffect(() => {
    if (!visible || !initialMaterialId) return;
    setPlanSource('upload');
    setSelectedMaterialId(initialMaterialId);
  }, [visible, initialMaterialId]);

  useEffect(() => {
    if (!visible || !initialUnitStructureMethod || !initialSubjectId) return;
    const subjectExists = baseSubjectList.some((s) => String(s.id) === String(initialSubjectId));
    if (!subjectExists) return;
    const method = String(initialUnitStructureMethod);
    setSelectedSubjectIds([initialSubjectId]);
    setUnitFocusSubjectId(initialSubjectId);
    setParsedContent(null);
    setParseContentError(null);
    setParsingContent(false);
    setCadenceDifferentMethodNotice(null);
    suppressManualCurriculumHydrateRef.current = false;
    if (method === 'manual') {
      setPlanSource('paste');
      setDraftData(null);
      setRawText('');
      setUnitStructureStep('input');
      setManualDraft(createInitialManualDraft());
      setExpandedUnitIndexManual(0);
      setExpandedUnits(new Set([0]));
    } else if (method === 'paste_plain') {
      setPlanSource('paste_plain');
      setManualDraft(null);
      setDraftData(null);
      setUnitStructureStep('input');
      setRawText('');
      setExpandedUnits(new Set());
      setExpandedUnitIndexManual(0);
    } else if (method === 'upload') {
      setPlanSource('upload');
      setManualDraft(null);
      setDraftData(null);
      setUnitStructureStep('input');
      setRawText('');
    } else if (method === 'generate') {
      setPlanSource('generate');
      setManualDraft(null);
      setDraftData(null);
      setUnitStructureStep('input');
      setRawText('');
    } else {
      return;
    }
    setPlanStep('unit_structure');
    setStartCreatingNew(true);
  }, [visible, initialUnitStructureMethod, initialSubjectId, baseSubjectList]);

  // When modal opens for new plan (no existing plan): no selection until the user picks, unless there is exactly one subject.
  const prevVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !prevVisibleRef.current && !initialAcademicYearId) {
      if (baseSubjectList.length > 0 && !initialSubjectId) {
        if (baseSubjectList.length === 1) {
          setSelectedSubjectIds([baseSubjectList[0].id]);
        } else {
          setSelectedSubjectIds([]);
        }
      }
    }
    if (visible && !prevVisibleRef.current) {
      const isEditPlanMode = !!initialAcademicYearId;
      setSectionWhoExpanded(!isEditPlanMode);
      // Edit Plan: expand sections 2 (Scheduled Class Days) and 3 (Dates & Requirements); new plan: expand all
      setSectionScheduleExpanded(true);
      setSectionDatesExpanded(true);
    }
    if (!visible) {
      // Defer view resets so we don't flash "Plan Manager / Create New Plan" during close animation
      const t = setTimeout(() => {
        setSuggestionAccepted(false);
        setHighlightBlockIndex(null);
        setUnitFocusSubjectId(null);
        setLastSavedUnitSubjectId(null);
        setPlanStep(getInitialPlanStep(PLAN_MY_YEAR_LOGISTICS_FIRST));
        setPlanningScope(null);
        setShowPlanManagerView(false);
        setShowPreviewScreen(false);
        setShowMaterialDropdown(false);
        setParsedContent(null);
        setParsingContent(false);
        setParseContentError(null);
      }, 350);
      return () => clearTimeout(t);
    }
    prevVisibleRef.current = visible;
  }, [visible, baseSubjectList, initialAcademicYearId]);

  const singleSubjectDefaultId = baseSubjectList.length === 1 ? baseSubjectList[0].id : null;
  useEffect(() => {
    if (!visible || initialAcademicYearId || initialSubjectId) return;
    if (singleSubjectDefaultId == null) return;
    setSelectedSubjectIds((prev) => {
      if (prev.length > 0) return prev;
      return [singleSubjectDefaultId];
    });
  }, [visible, initialAcademicYearId, initialSubjectId, singleSubjectDefaultId]);

  // Prune selectedSubjectIds if subject list shrinks (e.g. data reload)
  useEffect(() => {
    if (subjectsForCurrentSelection.length === 0) return;
    const validIds = new Set(subjectsForCurrentSelection.map((s) => s.id));
    setSelectedSubjectIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev;
      return next;
    });
  }, [subjectsForCurrentSelection]);
  

  // Clear parsed content when source or input changes so user re-parses
  useEffect(() => {
    if (planSource === 'upload' || planSource === 'link' || planSource === 'paste' || planSource === 'paste_plain') {
      setParsedContent(null);
      setParseContentError(null);
    }
  }, [planSource, sourceUrl, pastedText, selectedMaterialId]);
  
  // Load materials when entering upload mode
  useEffect(() => {
    if (planStep === 'unit_structure' && planSource === 'upload' && familyId && materials.length === 0 && !loadingMaterials) {
      const loadMaterials = async () => {
        setLoadingMaterials(true);
        try {
          const data = await getMaterials(familyId, {});
          setMaterials(data || []);
        } catch (err) {
          console.error('Failed to load materials:', err);
          setMaterials([]);
        } finally {
          setLoadingMaterials(false);
        }
      };
      loadMaterials();
    }
  }, [planStep, planSource, familyId, materials.length, loadingMaterials]);
  
  // Load unit structure when opening unit builder, or on logistics (preview) so slot↔lesson mapping includes units
  useEffect(() => {
    const loadOnLogistics = PLAN_MY_YEAR_LOGISTICS_FIRST && planStep === 'logistics';
    if (
      (planStep === 'unit_structure' || loadOnLogistics) &&
      curriculumFetchSubjectId &&
      familyId &&
      !unitStructureData &&
      !loadingUnitStructure &&
      !draftData &&
      !manualDraft
    ) {
      const loadUnitStructure = async () => {
        setLoadingUnitStructure(true);
        try {
          const subjectId = curriculumFetchSubjectId;
          const effectiveYearId = academicYearId || initialAcademicYearId || null;
          const cacheKey = curriculumStructureCacheKey(subjectId, effectiveYearId);
          const cached = curriculumStructureCacheRef.current.get(cacheKey);
          const { data, error } = cached
            ? { data: cached, error: null }
            : await fetchSubjectCurriculumEventsStructure(familyId, subjectId, effectiveYearId);
          if (error) throw error;
          const units = Array.isArray(data?.units) ? data.units : [];
          if (data) {
            curriculumStructureCacheRef.current.set(cacheKey, data);
          }
          setSavedContentSource(data?.saved_content_source ?? null);
          setUnitStructureData({ units });
          if (units.some((u) => (u.lessons || []).length > 0)) {
            setLastSavedUnitSubjectId(subjectId);
          }
          if (units.length > 0 && planStep === 'unit_structure') {
            setExpandedUnits(new Set([0]));
          }
        } catch (err) {
          console.error('Error loading unit structure:', err);
        } finally {
          setLoadingUnitStructure(false);
        }
      };
      loadUnitStructure();
    }
  }, [planStep, curriculumFetchSubjectId, familyId, unitStructureData, loadingUnitStructure, draftData, manualDraft, academicYearId, initialAcademicYearId]);

  // Keep saved curriculum source in sync on logistics (even when unitStructureData was already loaded)
  useEffect(() => {
    if (!PLAN_MY_YEAR_LOGISTICS_FIRST || planStep !== 'logistics') return;
    if (!familyId || !curriculumFetchSubjectId) return;
    let cancelled = false;
    (async () => {
      try {
        const effectiveYearId = academicYearId || initialAcademicYearId || null;
        const cacheKey = curriculumStructureCacheKey(curriculumFetchSubjectId, effectiveYearId);
        const cached = curriculumStructureCacheRef.current.get(cacheKey);
        const { data, error } = cached
          ? { data: cached, error: null }
          : await fetchSubjectCurriculumEventsStructure(familyId, curriculumFetchSubjectId, effectiveYearId);
        if (cancelled || error) return;
        if (data) {
          curriculumStructureCacheRef.current.set(cacheKey, data);
        }
        setSavedContentSource(data?.saved_content_source ?? null);
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
    };
  }, [planStep, familyId, curriculumFetchSubjectId, academicYearId, initialAcademicYearId]);

  // Load materials when upload is selected (for inline select)
  const loadMaterialsForUpload = useCallback(async () => {
    if (!familyId) return;
    setLoadingMaterials(true);
    try {
      const data = await getMaterials(familyId, {});
      setMaterials(data || []);
    } catch (err) {
      console.error('[PlanYearModal] Error loading materials:', err);
      setMaterials([]);
    } finally {
      setLoadingMaterials(false);
    }
  }, [familyId]);

  useEffect(() => {
    if (visible && planSource === 'upload' && familyId) {
      loadMaterialsForUpload();
    }
  }, [visible, planSource, familyId, loadMaterialsForUpload]);

  // Refetch materials when library updates (Add Material modal dispatches refreshMaterials; keeps picker in sync with Materials page)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (e) => {
      const fid = e?.detail?.familyId;
      if (fid && fid !== familyId) return;
      if (planSource === 'upload' && familyId) loadMaterialsForUpload();
    };
    window.addEventListener('refreshMaterials', handler);
    return () => window.removeEventListener('refreshMaterials', handler);
  }, [planSource, familyId, loadMaterialsForUpload]);

  /** Stream-parse selected library material into curriculum draft (upload path — no paste step). */
  const runUploadMaterialParse = useCallback(async () => {
    const availableSubjectId = unitPipelineSubjectId;
    const availableSubject = availableSubjectId
      ? baseSubjectList.find((s) => String(s.id) === String(availableSubjectId))
      : null;
    if (!availableSubject || !familyId || !selectedMaterialId) {
      setUnitStructureError(availableSubject ? 'Select a material from your library.' : 'Subject not found.');
      return;
    }
    const mat = materials.find((m) => m.id === selectedMaterialId);
    setParsing(true);
    setUnitStructureError(null);
    setImportParseStreamPreview('');
    let streamed = '';
    try {
      const { data, error: err } = await parsePlainTextStream(
        {
          subject_id: availableSubject.id,
          family_id: familyId,
          subject_name: availableSubject.name || '',
          raw_text: '',
          material_id: selectedMaterialId,
          source_title: (mat?.title || mat?.provider_name || '').trim() || null,
          source_type: sourceType === 'auto_detect' ? null : sourceType,
          parse_mode: parseMode === 'auto_detect' ? null : parseMode,
          detect_dates: detectDates,
          preserve_source_headings: preserveHeadings,
          ignore_policy_text: ignorePolicyText,
          extract_assignments: extractAssignments,
          extract_assessments: extractAssessments,
          special_instructions: specialInstructionsParse.trim() || null,
        },
        {
          onDelta: (chunk) => {
            streamed += chunk;
            setImportParseStreamPreview(buildImportStreamPreviewDisplay(streamed));
          },
        },
      );
      if (err || !data) {
        setUnitStructureError(err?.message || 'Failed to parse document');
        return;
      }
      setRawText(data.raw_text || '');
      setDraftData(data);
      setUnitStructureStep('draft');
      if (data.units && data.units.length > 0) {
        setExpandedUnits(new Set([0]));
      }
    } catch (err) {
      setUnitStructureError(err.message || 'Failed to parse document');
    } finally {
      setImportParseStreamPreview('');
      setParsing(false);
    }
  }, [
    unitPipelineSubjectId,
    baseSubjectList,
    familyId,
    selectedMaterialId,
    materials,
    sourceType,
    parseMode,
    detectDates,
    preserveHeadings,
    ignorePolicyText,
    extractAssignments,
    extractAssessments,
    specialInstructionsParse,
  ]);

  const runGenerateCurriculumDraft = useCallback(async () => {
    const availableSubjectId = unitPipelineSubjectId;
    const availableSubject = availableSubjectId
      ? baseSubjectList.find((s) => String(s.id) === String(availableSubjectId))
      : null;
    if (!availableSubject || !familyId) {
      setUnitStructureError(availableSubject ? 'Missing family.' : 'Subject not found.');
      return;
    }
    const planningContext = buildPlanYearGeneratePlanningContext({
      startDate,
      endDate,
      previewSlotLines,
      subject: availableSubject,
      children,
      blocks,
    });
    const slotCount = countPreviewSlotsForSubject(previewSlotLines, String(availableSubject.id));
    setGenerating(true);
    setUnitStructureError(null);
    setGenerateStreamStatus('Preparing subject and plan context...');
    setGenerateStreamPreview('');
    try {
      let streamed = '';
      const { data, error: err } = await generateCurriculumDraftStream({
        subject_id: availableSubject.id,
        family_id: familyId,
        subject_name: availableSubject.name || '',
        child_ids: getChildIdsForSubject(availableSubject, children),
        generation_scope: generationScope.trim() || '(No additional free-form notes.)',
        planning_context: planningContext || undefined,
        duration_mode: 'multi_unit_course',
        lesson_count_target: slotCount > 0 ? slotCount : null,
        typical_lesson_minutes: 45,
        include_assessments: true,
        include_projects: true,
        include_materials: true,
        include_pacing: true,
      }, {
        onStatus: (text) => {
          setGenerateStreamStatus(text || '');
        },
        onDelta: (chunk) => {
          streamed += chunk;
          setGenerateStreamPreview(buildHumanPreviewFromPartialJson(streamed));
        },
      });
      if (err || !data) {
        setUnitStructureError(err?.message || 'Failed to generate curriculum');
        return;
      }
      setDraftData(data);
      setUnitStructureStep('draft');
      if (data.units && data.units.length > 0) {
        setExpandedUnits(new Set([0]));
      }
    } catch (err) {
      setUnitStructureError(err.message || 'Failed to generate curriculum');
    } finally {
      setGenerating(false);
    }
  }, [
    unitPipelineSubjectId,
    baseSubjectList,
    familyId,
    startDate,
    endDate,
    previewSlotLines,
    children,
    blocks,
    generationScope,
  ]);

  /** Parse content for upload/link/paste so the next screen can use it to plan events. */
  const handleParseContent = useCallback(async () => {
    if (planSource === 'upload' && !selectedMaterialId) {
      setParseContentError('Please select a material.');
      return;
    }
    if (planSource === 'link' && !sourceUrl.trim()) {
      setParseContentError('Please enter a source URL.');
      return;
    }
    if (planSource === 'paste' && !pastedText.trim()) {
      setParseContentError('Please paste your list of dates and events.');
      return;
    }
    const studentIds = allFamilyChildIds;
    if (!studentIds.length) {
      setParseContentError('Add at least one child in your family to continue.');
      return;
    }
    setParsingContent(true);
    setParseContentError(null);
    try {
      const startDateObj = startDate ? new Date(startDate + 'T12:00:00') : new Date();
      const startDateISO = startDateObj.toISOString().split('T')[0];

      if (planSource === 'paste') {
        const preview = parsePastedListToCurriculum(pastedText.trim(), studentIds, startDateISO);
        if (!preview?.unit || !preview?.lessons?.length) {
          setParseContentError('No lines found. Paste a list of topics, one per line.');
        } else {
          setParsedContent(preview);
        }
        setParsingContent(false);
        return;
      }

      let weeks = 1;
      if (startDate && endDate) {
        const end = new Date(endDate + 'T12:00:00');
        const start = new Date(startDate + 'T12:00:00');
        weeks = Math.max(1, Math.ceil((end - start) / (7 * 24 * 60 * 60 * 1000)));
      }
      const buildPayload = {
        mode: planSource === 'link' ? 'link' : 'material',
        topic: null,
        source_url: planSource === 'link' ? sourceUrl.trim() : null,
        material_id: planSource === 'upload' ? selectedMaterialId : null,
        student_ids: studentIds,
        constraints: {
          weeks,
          minutes_per_day: 60,
          weekdays_only: true,
          difficulty: 'standard',
          start_date: startDateISO,
        },
      };
      const { data: preview, error: buildError } = await buildCurriculum(buildPayload);
      if (buildError) {
        throw new Error(buildError.message || buildError.detail || 'Failed to parse content');
      }
      if (!preview?.unit || !preview?.lessons?.length) {
        throw new Error('No lessons were generated. Try adjusting your content.');
      }
      setParsedContent(preview);
    } catch (err) {
      setParseContentError(err?.message || 'Failed to parse content');
    } finally {
      setParsingContent(false);
    }
  }, [planSource, sourceUrl, pastedText, selectedMaterialId, allFamilyChildIds, startDate, endDate]);

  // When user selects a content source (paste/link/upload), auto-fill dates if empty and expand Who & subjects + Dates so they see what will be used
  const prevPlanSourceRef = useRef(planSource);
  useEffect(() => {
    const isContentSource = planSource === 'paste' || planSource === 'paste_plain' || planSource === 'link' || planSource === 'upload';
    if (!isContentSource) {
      prevPlanSourceRef.current = planSource;
      return;
    }
    prevPlanSourceRef.current = planSource;
    setSectionWhoExpanded(true);
    setSectionDatesExpanded(true);

    // Default dates when empty: start = today, end = 2 months from now
    let defaultStart = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null;
    if (!defaultStart) {
      const today = new Date();
      defaultStart = toLocalYYYYMMDD(today);
      setStartDate(defaultStart);
    }
    const needEnd = !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate);
    if (needEnd) {
      const startObj = new Date((defaultStart || startDate) + 'T12:00:00');
      const endObj = new Date(startObj);
      endObj.setMonth(endObj.getMonth() + 2);
      setEndDate(toLocalYYYYMMDD(endObj));
    }
  }, [planSource, startDate, endDate]);

  // Phase 2: Fetch lesson-to-slot mapping preview when we have parsed content + dates (no commit yet)
  useEffect(() => {
    const isContentPath = planSource === 'link' || planSource === 'paste' || planSource === 'upload';
    if (!isContentPath || !parsedContent?.lessons?.length || !startDate || !endDate || !familyId) {
      setPacingPreview(null);
      setPacingPreviewError(null);
      return;
    }
    const studentIds = allFamilyChildIds;
    if (!studentIds.length) {
      setPacingPreview(null);
      return;
    }
    let cancelled = false;
    setPacingPreviewLoading(true);
    setPacingPreviewError(null);
    const lessonsForPacing = parsedContent.lessons.map((l) => ({
      title: l.title,
      sequence_index: l.sequence_index,
      minutes_est: l.minutes_est ?? 60,
    }));
    previewPacing({
      family_id: familyId,
      subject_id: effectiveSubjectIds?.[0] ?? null,
      student_ids: studentIds,
      start_date: startDate,
      end_date: endDate,
      academic_year_id: academicYearId || undefined,
      lessons: lessonsForPacing,
    })
      .then(({ data, error }) => {
        if (cancelled) return;
        setPacingPreviewLoading(false);
        if (error) {
          setPacingPreviewError(error?.message || 'Could not load placement preview');
          setPacingPreview(null);
          return;
        }
        setPacingPreview(data || null);
        setPacingPreviewError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setPacingPreviewLoading(false);
          setPacingPreviewError('Could not load placement preview');
          setPacingPreview(null);
        }
      });
    return () => { cancelled = true; };
  }, [planSource, parsedContent, startDate, endDate, familyId, allFamilyChildIds, effectiveSubjectIds, academicYearId]);

  const hasOnlyGenericBlocks = blocks.length > 0 && blocks.every((b) => !b.subject_id);
  const isPlaceholderOnlyScope = planningScope === 'placeholders_only' || (planningScope === 'full_year' && planSource === 'placeholders') || hasOnlyGenericBlocks;

  // Auto-sync blocks to required subjects: one block per effective subject (require all). Skip when placeholder-only scope — user adds generic blocks manually.
  const effectiveSubjectIdsKey = effectiveSubjectIds.slice().sort().join(',');
  const syncBlocksFromEffectiveSubjects = useCallback(() => {
    if (isPlaceholderOnlyScope) return; // do not replace blocks with subject-based blocks
    if (effectiveSubjectIds.length === 0) {
      setBlocks([]);
      return;
    }
    setBlocks((prevBlocks) => {
      const bySubject = new Map(prevBlocks.map((b) => [b.subject_id, b]));
      return effectiveSubjectIds.map((subjectId) => {
        const subj = baseSubjectList.find((s) => String(s.id) === String(subjectId));
        const resolvedChildIds = getChildIdsForSubject(subj, children);
        const existing = bySubject.get(subjectId);
        if (existing) {
          return { ...existing, child_ids: resolvedChildIds };
        }
        return {
          block_id: crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}-${subjectId}`,
          subject_id: subjectId,
          child_ids: resolvedChildIds,
          weekdays: [],
          start_time: '09:00',
          end_time: '10:00',
          all_day: false,
        };
      });
    });
  }, [effectiveSubjectIdsKey, effectiveSubjectIds.length, isPlaceholderOnlyScope, baseSubjectList, children]);

  useEffect(() => {
    syncBlocksFromEffectiveSubjects();
  }, [syncBlocksFromEffectiveSubjects]);

  // When modal opens for new plan, re-sync blocks after a short delay so we pick up children/subjects that may arrive after first render (fixes "whole family + all subjects" not showing in card 2 until user toggles)
  useEffect(() => {
    if (!visible || academicYearId) return;
    const t = setTimeout(() => {
      syncBlocksFromEffectiveSubjects();
    }, 50);
    return () => clearTimeout(t);
  }, [visible, academicYearId, syncBlocksFromEffectiveSubjects]);

  const isEditingExistingPlanFlow = useMemo(
    () =>
      editingFromSummary ||
      !!initialAcademicYearId ||
      (!openForNewPlan && !!academicYearId),
    [editingFromSummary, initialAcademicYearId, openForNewPlan, academicYearId],
  );

  const hideStructuredClassPlansIntro = isEditingExistingPlanFlow;

  const showPlanEditingModeBanner =
    PLAN_MY_YEAR_LOGISTICS_FIRST && hideStructuredClassPlansIntro && planStep === 'logistics';

  /** Subject page opens planning as overlay (not inline planner): use rounded card + explicit close. */
  const subjectDetailOverlayChrome = fromSubjectDetail && !renderInline;

  const cadenceDirty = useMemo(() => {
    if (cadenceBaselineKey == null || cadenceBaselineKey === '') return false;
    return serializeCadenceSnapshot(blocks) !== cadenceBaselineKey;
  }, [blocks, cadenceBaselineKey]);

  useEffect(() => {
    if (cadenceDirty) return;
    setApplyFromMode('entire');
    setApplyFromDate(null);
  }, [cadenceDirty]);

  /** If plan load did not set blocks in applyYearPayload, establish baseline once blocks appear (e.g. sync). */
  useEffect(() => {
    if (!academicYearId) return;
    if (loadedYearIdRef.current !== academicYearId) return;
    if (blocks.length === 0) return;
    if (cadenceBaselineKey != null && cadenceBaselineKey !== '') return;
    setCadenceBaselineKey(serializeCadenceSnapshot(blocks));
  }, [academicYearId, blocks, cadenceBaselineKey]);

  // Compute schedule potential when block structure / dates / exclusions / targets change — not when only cadence (weekdays, times) changes
  const triggerSchedulePotential = useCallback((immediate = false) => {
    if (schedulePotentialTimeoutRef.current) clearTimeout(schedulePotentialTimeoutRef.current);
    const delay = immediate || !schedulePotentialFetchedRef.current ? 0 : 120;
    schedulePotentialTimeoutRef.current = setTimeout(async () => {
      const blocksNow = blocksRef.current || [];
      if (!familyId || !startDate || !endDate || blocksNow.length === 0) {
        setSchedulePotential(null);
        setComputingPotential(false);
        return;
      }
      // Backend returns 400 if start_date > end_date; skip request to avoid calendar error
      const ymd = /^\d{4}-\d{2}-\d{2}$/;
      if (ymd.test(startDate) && ymd.test(endDate) && startDate > endDate) {
        setSchedulePotential(null);
        setComputingPotential(false);
        return;
      }
      const yearId = academicYearIdRef.current;
      const reqKey = schedulePotentialRequestKeyRef.current;
      if (isEditingExistingPlanFlow && yearId) {
        const cached = schedulePotentialSnapshotCacheRef.current.get(yearId);
        if (cached && cached.key === reqKey) {
          setSchedulePotential(cached.data);
          schedulePotentialFetchedRef.current = true;
          setComputingPotential(false);
          return;
        }
      }
      setComputingPotential(true);
      try {
        const planChildrenIds = allFamilyChildIds;
        const { data, error } = await computeSchedulePotential({
          family_id: familyId,
          start_date: startDate,
          end_date: endDate,
          blocks: blocksNow.map((b) => ({
            block_id: b.block_id,
            subject_id: b.subject_id,
            child_ids: b.child_ids || [],
            weekdays: b.weekdays || [],
            start_time: b.start_time || '09:00',
            end_time: b.end_time || '10:00',
            all_day: b.all_day || false,
          })),
          custom_holidays: customHolidays.map((h) => ({ date: h.date, name: h.name, type: h.type || 'CUSTOM_HOLIDAY' })),
          custom_breaks: (customBreaks || []).map((b) => ({ start: b.start, end: b.end, name: b.name || 'Break' })),
          follow_public_holidays: followGlobalHolidays ?? false,
          holiday_region: regionCode ? `${countryCode}:${regionCode}` : countryCode,
          target_days: effectivePlanTarget.target_days ?? null,
          target_hours: effectivePlanTarget.target_hours ?? null,
          plan_children_ids: planChildrenIds.length > 0 ? planChildrenIds : undefined,
          subject_targets: effectiveSubjectTargetsForApply ?? effectiveSubjectTargets ?? undefined,
        });
        if (!error && data) {
          setSchedulePotential(data);
          schedulePotentialFetchedRef.current = true;
          const yid = academicYearIdRef.current;
          if (yid) {
            schedulePotentialSnapshotCacheRef.current.set(yid, {
              key: schedulePotentialRequestKeyRef.current,
              data,
            });
          }
        } else {
          setSchedulePotential(null);
        }
      } catch {
        setSchedulePotential(null);
      } finally {
        setComputingPotential(false);
      }
    }, delay);
  }, [
    familyId,
    startDate,
    endDate,
    schedulePotentialBlocksStructureKey,
    schedulePotentialCadencePrimedKey,
    customHolidays,
    customBreaks,
    followGlobalHolidays,
    countryCode,
    regionCode,
    effectivePlanTarget,
    allFamilyChildIds,
    effectiveSubjectTargets,
    effectiveSubjectTargetsForApply,
    isEditingExistingPlanFlow,
  ]);

  useEffect(() => {
    if (!visible) {
      schedulePotentialFetchedRef.current = false;
    }
    if (visible && blocks.length > 0 && startDate && endDate) {
      triggerSchedulePotential(!schedulePotentialFetchedRef.current);
    } else {
      setSchedulePotential(null);
    }
    return () => {
      if (schedulePotentialTimeoutRef.current) clearTimeout(schedulePotentialTimeoutRef.current);
    };
  }, [visible, blocks.length, schedulePotentialBlocksStructureKey, schedulePotentialCadencePrimedKey, startDate, endDate, customHolidays, customBreaks, triggerSchedulePotential]);

  // Apply cached schedule_potential before paint when re-entering edit logistics (avoids empty/loading flash).
  useLayoutEffect(() => {
    if (!visible || !isEditingExistingPlanFlow || !academicYearId) return;
    if (!startDate || !endDate || blocks.length === 0) return;
    const cached = schedulePotentialSnapshotCacheRef.current.get(academicYearId);
    if (!cached || cached.key !== schedulePotentialRequestKey) return;
    setSchedulePotential(cached.data);
    schedulePotentialFetchedRef.current = true;
  }, [
    visible,
    isEditingExistingPlanFlow,
    academicYearId,
    startDate,
    endDate,
    blocks.length,
    schedulePotentialRequestKey,
  ]);

  // Plan id for health: use state or initial prop so we scope correctly on first render (before sync effect)
  const planIdForHealth = academicYearId ?? initialAcademicYearId ?? undefined;

  // Fetch plan health when modal is open (scoped to current plan when editing)
  useEffect(() => {
    if (!visible || !familyId) {
      setPlanHealth(null);
      return;
    }
    // When editing a specific plan, invalidate cache so we don't show another plan's cached health
    if (planIdForHealth) invalidatePlanHealthCache();
    let cancelled = false;
    (async () => {
      const { data, error } = await getPlanHealth(familyId, planIdForHealth);
      if (cancelled) return;
      if (!error && data) setPlanHealth(data);
      else setPlanHealth(null);
    })();
    return () => { cancelled = true; };
  }, [visible, familyId, planIdForHealth]);

  // Fetch existing placeholder count when we have an academic year id
  useEffect(() => {
    if (!visible || !academicYearId || !familyId) {
      setExistingPlaceholdersCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const { count, error } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('family_id', familyId)
        .eq('academic_year_id', academicYearId)
        .eq('generated_by', 'plan_year')
        .is('deleted_at', null);
      if (!cancelled && !error) setExistingPlaceholdersCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [visible, academicYearId, familyId]);

  // Plan My Year is the homeschool planning flow; always use full planning UI (no async gate).
  useEffect(() => {
    if (visible && familyId) setIsHomeschool(true);
  }, [visible, familyId]);

  const createDefaultYear = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await createDefaultAcademicYear(familyId);
      
      if (error) throw error;
      
      if (data?.academic_year_id) {
        setFastPathYearId(data.academic_year_id);
        // Load the created year to show details
        const { data: yearData } = await getAcademicYear(data.academic_year_id);
        if (yearData) {
          setFollowGlobalHolidays(yearData.holiday_settings?.follow_global_holidays || true);
          setCountryCode(yearData.holiday_settings?.holiday_country_code || 'US');
          setRegionCode(yearData.holiday_settings?.holiday_region || null);
          setExcludedPublicHolidayDates(Array.isArray(yearData.holiday_settings?.excluded_holiday_dates) ? yearData.holiday_settings.excluded_holiday_dates : []);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to create default academic year');
    } finally {
      setLoading(false);
    }
  };

  // Debounced recalculation
  const triggerRecalculation = useCallback(() => {
    if (recalculateTimeoutRef.current) {
      clearTimeout(recalculateTimeoutRef.current);
    }
    
    recalculateTimeoutRef.current = setTimeout(async () => {
      await performRecalculation();
    }, 500);
  }, [mode, startDate, endDate, targetDays, targetHours, hoursPerDay, customHolidays, customBreaks, followGlobalHolidays, countryCode]);

  // Recalculate when inputs change (including country/region)
  useEffect(() => {
    if (isHomeschool && startDate && (endDate || targetDays || targetHours)) {
      triggerRecalculation();
    }
  }, [mode, startDate, endDate, targetDays, targetHours, hoursPerDay, customHolidays, customBreaks, followGlobalHolidays, countryCode, regionCode, isHomeschool, triggerRecalculation]);

  const performRecalculation = async () => {
    if (!startDate) return;
    
    setRecalculating(true);
    setError(null);
    
    try {
      const input = {
        academic_year_id: academicYearId,
        mode,
        start_date: startDate,
        end_date: mode === 'FIXED_END' ? endDate : undefined,
        target_instructional_days: mode === 'TARGET_DAYS' ? parseInt(targetDays) : undefined,
        target_instructional_hours: mode === 'TARGET_HOURS' ? parseInt(targetHours) : undefined,
        planned_hours_per_day: mode === 'TARGET_HOURS' ? parseFloat(hoursPerDay) : undefined,
        holiday_settings: {
          follow_global_holidays: followGlobalHolidays,
          holiday_country_code: countryCode,
          holiday_region: regionCode,
          provider: 'NAGER_DATE',
          excluded_holiday_dates: excludedPublicHolidayDates || [],
        },
        custom_holidays: [
          ...customHolidays.map(h => ({ date: h.date, name: h.name, type: h.type || 'CUSTOM_HOLIDAY' })),
          ...expandBreaksToHolidayDates(customBreaks),
        ],
      };

      const { data, error } = await recalculateAcademicYear(input);
      
      if (error) throw error;
      
      setCalculatedResult(data);
    } catch (err) {
      console.error('Recalculation error:', err);
      setError(err.message || 'Failed to recalculate');
    } finally {
      setRecalculating(false);
    }
  };

  const childrenCount = Array.isArray(children) ? children.length : 0;
  const subjectsCount = subjectsForCurrentSelection.length;
  const selectedCount = selectedSubjectIds.length;
  const preconditionsMet = childrenCount > 0 && (
    isPlaceholderOnlyScope
      ? blocks.length > 0
      : subjectsCount > 0 && (selectedSubjectIds.length >= 1 || blocks.length > 0)
  );

  const eligibleCount = calculatedResult?.instructional_days ?? 0;
  const excludedCount = calculatedResult?.non_instructional_days ?? 0;
  const targetDaysNum = effectivePlanTarget.constraint_mode === 'days'
    ? (effectivePlanTarget.target_days ?? TARGET_INSTRUCTIONAL_DAYS_DEFAULT)
    : TARGET_INSTRUCTIONAL_DAYS_DEFAULT;
  const hasAnyWeekdayInBlocks = blocks.some((b) => (b.weekdays || []).length > 0);
  /** Generate stays disabled until every selected subject has ≥1 weekday, or (placeholder-only) every block does. */
  const cadenceWeekdaysSatisfied =
    blocks.length > 0 &&
    (effectiveSubjectIds.length === 0
      ? isPlaceholderOnlyScope && blocks.every((b) => (b.weekdays || []).length > 0)
      : effectiveSubjectIds.every((subjectId) =>
          blocks.some(
            (b) =>
              b.subject_id != null &&
              String(b.subject_id) === String(subjectId) &&
              (b.weekdays || []).length > 0
          )
        ));
  const feasible = blocks.length > 0
    ? cadenceWeekdaysSatisfied &&
      (effectivePlanTarget.constraint_mode === 'none'
        ? !!(startDate && endDate)
        : hasAnyWeekdayInBlocks && schedulePotential
          ? schedulePotential.projected_days > 0
          : false)
    : eligibleCount >= targetDaysNum;

  planPrefsSnapRef.current = {
    planConstraintMode,
    planTargetDays,
    planTargetHours,
    hoursPerDay: hoursPerDay || '5',
  };

  const normalizeSlotTimeTo24h = useCallback((raw, fallback) => {
    const txt = String(raw || '').trim().toLowerCase();
    if (!txt) return fallback;
    const compact = txt.replace(/\s+/g, '');
    const ampm = compact.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/i);
    if (ampm) {
      let h = Number(ampm[1]);
      const m = Number(ampm[2] || '0');
      const ap = String(ampm[3]).toLowerCase();
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }
    const twentyFour = compact.match(/^(\d{1,2}):(\d{2})$/);
    if (twentyFour) {
      const h = Number(twentyFour[1]);
      const m = Number(twentyFour[2]);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }
    return fallback;
  }, []);

  const backfillPlanEventsIfMissing = useCallback(async ({ yearId, slotLines, blocksForApply }) => {
    if (!familyId || !yearId || !Array.isArray(slotLines) || slotLines.length === 0) return;
    const dates = slotLines.map((l) => String(l.date || '').slice(0, 10)).filter(Boolean).sort();
    if (dates.length === 0) return;
    const startYmd = dates[0];
    const endYmd = dates[dates.length - 1];
    const minIso = `${startYmd}T00:00:00`;
    const maxIso = `${endYmd}T23:59:59`;
    const { data: existingRows, error: existingErr } = await supabase
      .from('events')
      .select('id, start_ts, subject_id, academic_year_id, generated_by')
      .eq('family_id', familyId)
      .eq('academic_year_id', yearId)
      .gte('start_ts', minIso)
      .lte('start_ts', maxIso)
      .is('deleted_at', null);
    if (existingErr) {
      console.warn('[PlanYearModal] Backfill check failed:', existingErr);
      return;
    }
    if ((existingRows || []).length > 0) return;

    const blockById = new Map((blocksForApply || []).map((b) => [String(b?.block_id || ''), b]));
    const rowsToInsert = slotLines.map((line) => {
      const block = blockById.get(String(line.blockId || '')) || null;
      const subjectId = line.subjectId ?? block?.subject_id ?? null;
      const startLocalRaw = line.timeLabel === 'All day' ? '09:00' : (String(line.timeLabel || '').split('–')[0] || '09:00');
      const endLocalRaw = line.timeLabel === 'All day' ? '15:00' : (String(line.timeLabel || '').split('–')[1] || '10:00');
      const startLocal = normalizeSlotTimeTo24h(startLocalRaw, '09:00');
      const endLocal = normalizeSlotTimeTo24h(endLocalRaw, '10:00');
      const startTs = new Date(`${line.date}T${startLocal}:00`);
      const endTs = new Date(`${line.date}T${endLocal}:00`);
      const candidateChildIds = Array.isArray(block?.child_ids) && block.child_ids.length > 0
        ? block.child_ids
        : (subjectId
          ? getChildIdsForSubject(
              baseSubjectList.find((s) => String(s.id) === String(subjectId)),
              children,
            )
          : allFamilyChildIds);
      const normalizedChildIds = (candidateChildIds || []).filter(Boolean).map(String);
      return {
        family_id: familyId,
        academic_year_id: yearId,
        title: line.subjectName || 'Lesson',
        subject_id: subjectId,
        // For overlap-safe plan slots, store assignees in child_ids (same strategy as TaskCreate overlap fallback).
        child_id: null,
        child_ids: normalizedChildIds,
        start_ts: Number.isNaN(startTs.getTime()) ? `${line.date}T09:00:00` : startTs.toISOString(),
        end_ts: Number.isNaN(endTs.getTime()) ? `${line.date}T10:00:00` : endTs.toISOString(),
        status: 'scheduled',
        event_type: 'Lesson',
        generated_by: 'plan_year',
        source: 'plan_year',
        is_flexible: true,
        counts_toward_plan: true,
      };
    });
    if (rowsToInsert.length === 0) return;
    const { error: insertErr } = await supabase.from('events').insert(rowsToInsert);
    if (!insertErr) {
      console.log('[PlanYearModal] Backfilled plan events:', rowsToInsert.length);
      return;
    }
    const msg = String(insertErr?.message || '').toLowerCase();
    const isOverlap = msg.includes('overlap') || msg.includes('exclusion');
    if (!isOverlap) {
      console.warn('[PlanYearModal] Backfill insert failed:', insertErr);
      return;
    }
    // Last-resort fallback: persist as family-level slots (no child assignment) so planner still shows the plan.
    const familyLevelRows = rowsToInsert.map((row) => ({
      ...row,
      child_id: null,
      child_ids: null,
      is_flexible: true,
    }));
    const { error: familyInsertErr } = await supabase.from('events').insert(familyLevelRows);
    if (familyInsertErr) {
      console.warn('[PlanYearModal] Backfill family-level insert failed:', familyInsertErr);
      return;
    }
    console.log('[PlanYearModal] Backfilled plan events as family-level slots:', familyLevelRows.length);
  }, [familyId, normalizeSlotTimeTo24h, baseSubjectList, children, allFamilyChildIds]);

  const runApplyToCalendar = async (replacePlaceholdersChoice) => {
    setSaving(true);
    setError(null);
    try {
      const effectiveEndDate = mode === 'FIXED_END' ? endDate : (calculatedResult?.end_date || endDate);
      const effectiveTargetInstructionalDays = effectivePlanTarget.constraint_mode === 'days'
        ? (effectivePlanTarget.target_days ?? TARGET_INSTRUCTIONAL_DAYS_DEFAULT)
        : TARGET_INSTRUCTIONAL_DAYS_DEFAULT;
      const year_name = buildPlanYearName({
        children,
        subjects: baseSubjectList,
        blocks,
        selectedSubjectIds,
        startDate,
        endDate: effectiveEndDate,
      });
      const payload = {
        academic_year_id: academicYearId || undefined,
        family_id: familyId,
        start_date: startDate,
        end_date: effectiveEndDate,
        follow_public_holidays: followGlobalHolidays,
        holiday_region: regionCode ? `${countryCode}:${regionCode}` : countryCode,
        excluded_holiday_dates: excludedPublicHolidayDates?.length ? excludedPublicHolidayDates : undefined,
        custom_holidays: customHolidays.map(h => ({ date: h.date, name: h.name, type: h.type || 'CUSTOM_HOLIDAY' })),
        custom_breaks: (customBreaks || []).map(b => ({ start: b.start, end: b.end, name: b.name || 'Break' })),
        target_instructional_days: effectiveTargetInstructionalDays,
        subjects: selectedSubjectIds,
        constraint_mode: effectivePlanTarget.constraint_mode,
        target_days: effectivePlanTarget.target_days ?? null,
        target_hours: effectivePlanTarget.target_hours ?? null,
        child_id: null,
        replace_placeholders: replacePlaceholdersChoice,
        create_calendar_events: true,
        blocks: blocks.length > 0 ? blocks.map((b) => {
          const subj = b.subject_id ? baseSubjectList.find((s) => String(s.id) === String(b.subject_id)) : null;
          const resolvedChildIds = b.subject_id
            ? getChildIdsForSubject(subj, children)
            : Array.isArray(b.child_ids) && b.child_ids.length > 0
              ? b.child_ids
              : allFamilyChildIds;
          return {
            block_id: b.block_id,
            subject_id: b.subject_id ?? null,
            placeholder_label: b.placeholder_label || (b.subject_id ? undefined : (STRINGS.planMyYear?.sections?.blocks?.genericSlotLabel ?? 'Learning block')),
            child_ids: resolvedChildIds,
            weekdays: b.weekdays || [],
            start_time: b.start_time || '09:00',
            end_time: b.end_time || '10:00',
            all_day: b.all_day || false,
          };
        }) : [],
        subject_targets: effectiveSubjectTargetsForApply ?? effectiveSubjectTargets ?? undefined,
        year_name,
        ...(cadenceDirty && resolvedApplyFromDateForPayload
          ? { apply_from_date: resolvedApplyFromDateForPayload }
          : {}),
        // When user chose "Create new plan" from picker, always create a new academic year so it appears in the list
        force_new_plan: startCreatingNew,
        // Always send timezone so plan times (e.g. 9 AM) are stored correctly; never fall back to UTC
        timezone: (function getClientTimezone() {
          try {
            if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
              const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
              if (tz && typeof tz === 'string') return tz.trim();
            }
          } catch (e) { /* ignore */ }
          return 'America/New_York';
        })(),
      };

      const { data, error: applyError } = await applyToCalendar(payload);
      if (applyError) throw applyError;
      console.log('[PlanYearModal] applyToCalendar result:', {
        academicYearId: data?.academic_year_id || academicYearId || null,
        created: data?.created ?? null,
        totals: data?.totals ?? null,
        eventsCreated: data?.events_created ?? null,
        slotsUsed: data?.slots_used ?? null,
      });
      console.log(
        '[PlanYearModal] applyToCalendar result json:',
        JSON.stringify({
          academicYearId: data?.academic_year_id || academicYearId || null,
          created: data?.created ?? null,
          totals: data?.totals ?? null,
          eventsCreated: data?.events_created ?? null,
          slotsUsed: data?.slots_used ?? null,
        }),
      );

      if (data?.academic_year_id) {
        setAcademicYearId(data.academic_year_id);
      }
      if (typeof window !== 'undefined' && data?.academic_year_id) {
        const optimisticSlotLines = buildPreviewSlotLinesForPlanYear({
          startDate,
          endDate: effectiveEndDate,
          blocks,
          customHolidays,
          customBreaks,
          baseSubjectList,
          children,
          allFamilyChildIds,
        });
        window.dispatchEvent(
          new CustomEvent('planSlotsCreated', {
            detail: {
              academicYearId: data.academic_year_id,
              subjectIds: [...new Set((blocks || []).map((b) => b?.subject_id).filter(Boolean).map(String))],
              slots: optimisticSlotLines.map((line) => ({
                id: `optimistic-plan-slot-${data.academic_year_id}-${line.blockId || 'slot'}-${line.date}`,
                academic_year_id: data.academic_year_id,
                title: line.subjectName || 'Lesson',
                subject_id: line.subjectId ?? null,
                start_local: line.timeLabel === 'All day' ? '09:00' : (String(line.timeLabel || '').split('–')[0] || '09:00').trim(),
                end_local: line.timeLabel === 'All day' ? '15:00' : (String(line.timeLabel || '').split('–')[1] || '10:00').trim(),
                date_local: line.date,
                child_id: null,
                generated_by: 'plan_year',
                is_flexible: true,
              })),
            },
          }),
        );
        window.dispatchEvent(
          new CustomEvent('planSlotsUpdated', {
            detail: {
              academicYearId: data.academic_year_id,
              subjectIds: [...new Set((blocks || []).map((b) => b?.subject_id).filter(Boolean).map(String))],
              slots: optimisticSlotLines.map((line) => ({
                date_local: line.date,
                subject_id: line.subjectId ?? null,
                title: line.subjectName || 'Lesson',
                start_local: line.timeLabel === 'All day' ? '09:00' : (String(line.timeLabel || '').split('–')[0] || '09:00').trim(),
                end_local: line.timeLabel === 'All day' ? '15:00' : (String(line.timeLabel || '').split('–')[1] || '10:00').trim(),
              })),
            },
          }),
        );
        await backfillPlanEventsIfMissing({
          yearId: data.academic_year_id,
          slotLines: optimisticSlotLines,
          blocksForApply: payload.blocks,
        });
      }
      await refreshPreviousPlansList();

      const effectiveYearIdForBump = data?.academic_year_id ?? academicYearId ?? null;
      bumpPlanSurfacesAfterMutation(effectiveYearIdForBump);

      const { data: healthData } = await getPlanHealth(
        familyId,
        effectiveYearIdForBump ?? undefined,
      );
      if (healthData) setPlanHealth(healthData);

      const totals = data?.totals;
      let applyToastMessage;
      if (totals && typeof totals === 'object') {
        const u = Number(totals.updated) || 0;
        const i = Number(totals.inserted) || 0;
        const d = Number(totals.deleted) || 0;
        if (u === 0 && i === 0 && d === 0) {
          applyToastMessage = t('planMyYear.toasts.generated');
        } else if (i === 0 && d === 0 && u > 0) {
          applyToastMessage =
            u === 1 ? t('planMyYear.toasts.updated') : t('planMyYear.toasts.slotsUpdatedCount', { count: u });
        } else if (u === 0 && d === 0 && i > 0) {
          applyToastMessage =
            i === 1 ? t('planMyYear.toasts.slotAddedOne') : t('planMyYear.toasts.slotsAddedCount', { count: i });
        } else if (u === 0 && i === 0 && d > 0) {
          applyToastMessage =
            d === 1 ? t('planMyYear.toasts.slotRemovedOne') : t('planMyYear.toasts.slotsRemovedCount', { count: d });
        } else {
          const bits = [];
          if (u > 0) bits.push(t('planMyYear.toasts.applyPartUpdated', { count: u }));
          if (i > 0) bits.push(t('planMyYear.toasts.applyPartInserted', { count: i }));
          if (d > 0) bits.push(t('planMyYear.toasts.applyPartRemoved', { count: d }));
          applyToastMessage = bits.length ? `${bits.join(', ')}.` : t('planMyYear.toasts.generated');
        }
      } else {
        const created = Number(data?.created) || 0;
        applyToastMessage =
          created === 1
            ? t('planMyYear.toasts.slotAddedOne')
            : t('planMyYear.toasts.slotsAddedCount', { count: created });
      }
      loadedYearIdRef.current = null;
      setCadenceBaselineKey(serializeCadenceSnapshot(blocksRef.current || []));
      toast.push(applyToastMessage, 'success');
      // Refetch placeholder count for eligibility / health copy if user stays in modal
      const yearIdForCount = data?.academic_year_id ?? academicYearId;
      if (yearIdForCount && familyId) {
        const { count, error: countErr } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('family_id', familyId)
          .eq('academic_year_id', yearIdForCount)
          .eq('generated_by', 'plan_year')
          .is('deleted_at', null);
        if (!countErr && count != null) setExistingPlaceholdersCount(count);
      }
      setTimeout(() => {
        onCompleteRef.current?.();
        onCloseRef.current?.();
      }, 50);
    } catch (err) {
      const errMsg = err?.message || err?.detail || 'Failed to apply to calendar';
      setError(errMsg);
      loadedYearIdRef.current = null;
      toast.push(errMsg, 'error');
      setTimeout(() => onCloseRef.current?.(), 50);
    } finally {
      setSaving(false);
    }
  };

  const onApplyFromModePress = useCallback((mode) => {
    setApplyFromMode(mode);
    if (mode !== 'date') {
      setApplyFromDate(null);
    } else {
      setShowApplyFromDatePicker(true);
    }
  }, []);

  /** Dot-separated links under cadence (same pattern as Step 2 add content). */
  const renderApplyFromScopeCadenceInline = useCallback(() => {
    if (!academicYearId) return null;
    const links = [
      { mode: 'entire', label: t('planMyYear.applyFrom.linkFullPlanScope') },
      { mode: 'today', label: t('planMyYear.applyFrom.linkTodayGoingForward') },
      {
        mode: 'date',
        label:
          applyFromMode === 'date' && applyFromDate
            ? formatDateDisplay(applyFromDate).replace(/,?\s*\d{4}$/, '').trim()
            : t('planMyYear.applyFrom.linkSpecificRange'),
      },
    ];
    return (
      <View
        style={{
          marginTop: 12,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          alignSelf: 'flex-start',
          maxWidth: '100%',
        }}
      >
        <Text style={{ fontSize: 12, color: MUTED, marginRight: 6, marginBottom: 4 }}>
          {t('planMyYear.applyFrom.applyToPlanLabel')}
        </Text>
        {links.map((opt, optIdx) => {
          const selected = applyFromMode === opt.mode;
          const color = selected ? ACCENT : MUTED;
          return (
            <React.Fragment key={opt.mode}>
              {optIdx > 0 ? (
                <Text style={{ fontSize: 12, color: MUTED, marginHorizontal: 6, marginBottom: 4 }}>·</Text>
              ) : null}
              <TouchableOpacity
                onPress={() => onApplyFromModePress(opt.mode)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{ marginBottom: 4, paddingVertical: 2 }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color,
                    textDecorationLine: 'underline',
                    fontWeight: selected ? '700' : '400',
                  }}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </View>
    );
  }, [academicYearId, applyFromMode, applyFromDate, onApplyFromModePress, t]);

  /** When editing an existing plan, scope calendar regeneration (backend already supports apply_from_date). */
  const renderApplyFromScopeCard = useCallback(() => {
    if (!academicYearId) return null;
    const optionRow = (mode, label, sublabel) => {
      const selected = applyFromMode === mode;
      return (
        <TouchableOpacity
          key={mode}
          onPress={() => onApplyFromModePress(mode)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 8,
            marginBottom: 6,
            borderWidth: 1,
            borderColor: selected ? ACCENT : BORDER_SUBTLE,
            backgroundColor: selected ? ACCENT_LIGHT : 'transparent',
          }}
          activeOpacity={0.85}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          {selected ? <Check size={16} color={ACCENT} style={{ marginRight: 8 }} /> : <View style={{ width: 24 }} />}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: FG }}>{label}</Text>
            {sublabel ? (
              <Text style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 }}>{sublabel}</Text>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    };
    return (
      <View
        style={{
          marginTop: 20,
          marginBottom: 16,
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: BORDER_SUBTLE,
          backgroundColor: ELIGIBILITY_CARD_BG,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: FG, marginBottom: 6 }}>{t('planMyYear.applyFrom.title')}</Text>
        <Text style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 10, lineHeight: 17 }}>
          {t('planMyYear.applyFrom.hint')}
        </Text>
        {optionRow('entire', t('planMyYear.applyFrom.entirePlan'), null)}
        {optionRow('today', t('planMyYear.applyFrom.fromToday'), null)}
        {optionRow(
          'date',
          t('planMyYear.applyFrom.fromDate'),
          applyFromDate ? formatDateDisplay(applyFromDate) : null,
        )}
        {applyFromMode === 'date' && applyFromDate ? (
          <TouchableOpacity
            onPress={() => setShowApplyFromDatePicker(true)}
            style={{ alignSelf: 'flex-start', marginTop: 2, marginLeft: 32 }}
            activeOpacity={0.85}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={{ fontSize: 12, color: ACCENT, fontWeight: '600', textDecorationLine: 'underline' }}>
              {t('planMyYear.applyFrom.changeDate')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }, [academicYearId, applyFromMode, applyFromDate, onApplyFromModePress, t]);

  const scrollToDatesSection = useCallback(() => {
    setSectionDatesExpanded(true);
    setTimeout(() => {
      const y = datesSectionYRef.current;
      if (typeof y === 'number' && scrollRef.current) {
        scrollRef.current.scrollTo({ y: Math.max(0, y - 24), animated: true });
      }
    }, 150);
  }, []);

  const scrollToCadenceSection = useCallback(() => {
    setTimeout(() => {
      const y = scheduleSectionYRef.current;
      if (typeof y === 'number' && scrollRef.current) {
        scrollRef.current.scrollTo({ y: Math.max(0, y - 24), animated: true });
      }
    }, 150);
  }, []);

  /** Keep Family settings, subject modals, and subject detail in sync after planner saves. */
  const dispatchPlanningPrefsSynced = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
    window.dispatchEvent(new CustomEvent('refreshSubjects'));
  }, []);

  const persistFamilyPlannerTargetsDebounced = useCallback(() => {
    if (!familyId) return;
    if (planPrefsFamilySaveTimerRef.current) clearTimeout(planPrefsFamilySaveTimerRef.current);
    planPrefsFamilySaveTimerRef.current = setTimeout(async () => {
      planPrefsFamilySaveTimerRef.current = null;
      const snap = planPrefsSnapRef.current;
      try {
        const { error } = await saveFamilyPlannerSettings(familyId, {
          default_constraint_mode: snap.planConstraintMode,
          default_target_days: snap.planConstraintMode === 'days' ? (parseInt(snap.planTargetDays, 10) || null) : null,
          default_target_hours: snap.planConstraintMode === 'hours' ? (parseFloat(snap.planTargetHours) || null) : null,
          default_planned_hours_per_day:
            snap.planConstraintMode === 'hours' ? (parseFloat(snap.hoursPerDay) || null) : null,
        });
        if (error) throw error;
        dispatchPlanningPrefsSynced();
      } catch (e) {
        toast?.push?.(e?.message || 'Failed to save planning preferences', 'error');
      }
    }, 400);
  }, [familyId, toast, dispatchPlanningPrefsSynced]);

  const handlePlanningPrefsTargetScopeChange = useCallback(
    async (scope) => {
      setTargetScopeFromSettings(scope);
      if (!familyId) return;
      try {
        const { error } = await saveFamilyPlannerSettings(familyId, { target_scope: scope });
        if (error) throw error;
        dispatchPlanningPrefsSynced();
      } catch (e) {
        toast?.push?.(e?.message || 'Failed to save', 'error');
      }
    },
    [familyId, toast, dispatchPlanningPrefsSynced],
  );

  const schedulePersistSubjectPlanningTarget = useCallback(
    (subjectId, row) => {
      const timers = planPrefsSubjectTimersRef.current;
      if (timers[subjectId]) clearTimeout(timers[subjectId]);
      timers[subjectId] = setTimeout(async () => {
        delete timers[subjectId];
        const mode = row.mode || 'none';
        const days = mode === 'days' && row.days?.trim() ? parseInt(row.days, 10) : null;
        const hours = mode === 'hours' && row.hours?.trim() ? parseFloat(row.hours) : null;
        try {
          const { error } = await supabase
            .from('subject')
            .update({
              default_constraint_mode: mode,
              default_target_days: days,
              default_target_hours: hours,
            })
            .eq('id', subjectId);
          if (error) throw error;
          dispatchPlanningPrefsSynced();
        } catch (e) {
          toast?.push?.(e?.message || 'Failed to save subject target', 'error');
        }
      }, 450);
    },
    [toast, dispatchPlanningPrefsSynced],
  );

  useEffect(() => {
    return () => {
      if (planPrefsFamilySaveTimerRef.current) clearTimeout(planPrefsFamilySaveTimerRef.current);
      Object.keys(planPrefsSubjectTimersRef.current).forEach((k) => {
        const t = planPrefsSubjectTimersRef.current[k];
        if (t) clearTimeout(t);
      });
      planPrefsSubjectTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      if (planPrefsFamilySaveTimerRef.current) {
        clearTimeout(planPrefsFamilySaveTimerRef.current);
        planPrefsFamilySaveTimerRef.current = null;
      }
      Object.keys(planPrefsSubjectTimersRef.current).forEach((k) => {
        const t = planPrefsSubjectTimersRef.current[k];
        if (t) clearTimeout(t);
        delete planPrefsSubjectTimersRef.current[k];
      });
    }
  }, [visible]);

  const handleApplyToCalendar = async () => {
    setCadenceWeekdayHighlightIndices([]);
    if (!preconditionsMet) {
      setError(isPlaceholderOnlyScope ? 'Add at least 1 child and at least one learning block.' : 'Add at least 1 child and 1 subject to generate a year plan.');
      return;
    }
    if (isHomeschool && !startDate) {
      setError('Please select a start date in the Dates & Requirements section.');
      scrollToDatesSection();
      return;
    }
    if (isHomeschool && mode === 'FIXED_END' && !endDate) {
      setError('Please select an end date. With "End date" selected as your planning goal, an end date is required.');
      scrollToDatesSection();
      return;
    }
    if (isHomeschool && mode === 'TARGET_DAYS' && !targetDays) {
      setError('Please enter the number of target instructional days in the Dates & Requirements section.');
      scrollToDatesSection();
      return;
    }
    if (isHomeschool && mode === 'TARGET_HOURS' && (!targetHours || !hoursPerDay)) {
      setError('Please enter both target instructional hours and hours per instructional day.');
      scrollToDatesSection();
      return;
    }
    if (blocks.length === 0 && isHomeschool && !feasible) {
      setError('Not enough instructional days. Add more weekdays in Scheduled Class Days or extend your end date.');
      return;
    }
    if (blocks.length === 0 && !isPlaceholderOnlyScope && selectedSubjectIds.length === 0) {
      setError('Select at least one subject, or add scheduled class days.');
      return;
    }
    if (blocks.length > 0 && !isPlaceholderOnlyScope && blocks.some((b) => !b.subject_id)) {
      setError('Each scheduled class day needs a subject. Remove or fix any empty rows in Scheduled Class Days.');
      return;
    }
    if (blocks.length > 0 && !cadenceWeekdaysSatisfied) {
      const indicesToHighlight = [];
      if (effectiveSubjectIds.length > 0) {
        const unsatisfiedSubjectIds = effectiveSubjectIds.filter((subjectId) =>
          !blocks.some(
            (b) =>
              b.subject_id != null &&
              String(b.subject_id) === String(subjectId) &&
              (b.weekdays || []).length > 0
          )
        );
        const unsatisfiedSet = new Set(unsatisfiedSubjectIds.map(String));
        blocks.forEach((b, idx) => {
          if (!b.subject_id || (b.weekdays || []).length > 0) return;
          if (unsatisfiedSet.has(String(b.subject_id))) {
            indicesToHighlight.push(idx);
          }
        });
      } else if (isPlaceholderOnlyScope) {
        blocks.forEach((b, idx) => {
          if ((b.weekdays || []).length === 0) indicesToHighlight.push(idx);
        });
      } else {
        blocks.forEach((b, idx) => {
          if ((b.weekdays || []).length === 0) indicesToHighlight.push(idx);
        });
      }
      setCadenceWeekdayHighlightIndices(indicesToHighlight);
      setError('Select a day of week chip to continue.');
      scrollToCadenceSection();
      return;
    }
    if (academicYearId && applyFromMode === 'date' && !applyFromDate) {
      setError(t('planMyYear.applyFrom.dateRequired'));
      return;
    }
    if (existingPlaceholdersCount > 0) {
      await runApplyToCalendar(true);
      return;
    }

    await runApplyToCalendar(replacePlaceholders);
  };

  /** Phase 3: Inline build + commit for link/paste (no modal). Upload still opens Build Curriculum modal. */
  const handleCreateUnitAndSchedule = async () => {
    if (planSource === 'upload') {
      if (!selectedMaterialId) {
        setError('Please select a material from your uploads, or add one with "Upload or add material".');
        return;
      }
      const firstSubjectId = effectiveSubjectIds?.[0] ?? null;
      const firstSubject = baseSubjectList?.find((s) => s.id === firstSubjectId);
      onOpenBuildCurriculum?.({
        initialInputMode: 'material',
        initialMaterialId: selectedMaterialId,
        initialSubjectId: firstSubjectId ?? undefined,
        initialSubjectName: firstSubject?.name ?? undefined,
        initialStartDate: startDate || undefined,
        initialEndDate: endDate || undefined,
      });
      return;
    }
    if (planSource === 'link' && !sourceUrl.trim()) {
      setError('Please enter a source URL.');
      return;
    }
    if (planSource === 'paste' && !pastedText.trim()) {
      setError('Please paste your list of dates and events.');
      return;
    }
    const studentIds = allFamilyChildIds;
    if (!studentIds.length) {
      setError('Add at least one child to your family to continue.');
      return;
    }
    const firstSubjectId = effectiveSubjectIds?.[0] ?? null;
    const firstSubject = baseSubjectList?.find((s) => s.id === firstSubjectId);

    setLoading(true);
    setError(null);

    try {
      let filteredPreview = null;
      if ((planSource === 'link' || planSource === 'paste') && parsedContent?.unit && parsedContent?.lessons?.length) {
        filteredPreview = { ...parsedContent, lessons: parsedContent.lessons };
      }
      if (!filteredPreview) {
        const startDateObj = startDate ? new Date(startDate + 'T12:00:00') : new Date();
        const startDateISO = startDateObj.toISOString().split('T')[0];
        let weeks = 1;
        if (startDate && endDate) {
          const end = new Date(endDate + 'T12:00:00');
          const start = new Date(startDate + 'T12:00:00');
          weeks = Math.max(1, Math.ceil((end - start) / (7 * 24 * 60 * 60 * 1000)));
        }
        const buildPayload = {
          mode: planSource === 'link' ? 'link' : 'topic',
          topic: planSource === 'paste' ? pastedText.trim() : null,
          source_url: planSource === 'link' ? sourceUrl.trim() : null,
          student_ids: studentIds,
          constraints: {
            weeks,
            minutes_per_day: 60,
            weekdays_only: true,
            difficulty: 'standard',
            start_date: startDateISO,
          },
        };
        const { data: preview, error: buildError } = await buildCurriculum(buildPayload);
        if (buildError) {
          throw new Error(buildError.message || buildError.detail || 'Failed to build curriculum');
        }
        if (!preview?.unit || !preview?.lessons?.length) {
          throw new Error('No lessons were generated. Try adjusting your link or pasted text.');
        }
        filteredPreview = { ...preview, lessons: preview.lessons };
      }
      if (firstSubject?.name && filteredPreview?.unit) {
        filteredPreview.unit = {
          ...filteredPreview.unit,
          subject_tags: [firstSubject.name],
        };
      }

      const { data: commitData, error: commitError } = await commitCurriculum({
        preview: filteredPreview,
        create_calendar_events: true,
        add_to_backlog: false,
        lesson_backlog_map: {},
        prefer_placeholder_slots: true,
        placement: {
          strategy: 'fit_openings',
          prefer_mornings: false,
          prefer_afternoons: false,
          prefer_evenings: false,
          prefer_weekdays: [],
        },
      });

      if (commitError) {
        throw new Error(commitError.message || commitError.detail || 'Failed to schedule lessons');
      }
      if (!commitData) {
        throw new Error('Server did not return commit result.');
      }

      bumpPlanSurfacesAfterMutation(academicYearId ?? null);

      const slotsUsed = commitData?.slots_used ?? 0;
      const eventsCreated = commitData?.events_created ?? 0;
      const hasEvents = (commitData?.event_ids?.length ?? 0) > 0;
      if (hasEvents && (slotsUsed > 0 || eventsCreated > 0)) {
        if (slotsUsed > 0 && eventsCreated > 0) {
          toast.push(t('buildCurriculum.notices.usedSlotsAndFallback', { used: slotsUsed, fallback: eventsCreated }), 'success');
        } else if (slotsUsed > 0) {
          toast.push(t('buildCurriculum.notices.usedSlots', { used: slotsUsed }), 'success');
        } else {
          toast.push(STRINGS.buildCurriculum?.notices?.noSlotsFound ?? 'Lessons scheduled.', 'success');
        }
      } else {
        toast.push(STRINGS.buildCurriculum?.notices?.noSlotsFound ?? 'Lessons created.', 'success');
      }

      onComplete?.();
    } catch (err) {
      const message = err?.message || 'Failed to create unit and schedule';
      setError(message);
      toast.push(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (isDraft = false) => {
    if (isHomeschool && !startDate) {
      setError('Please select a start date in the Dates & Requirements section.');
      scrollToDatesSection();
      return;
    }
    if (isHomeschool && mode === 'FIXED_END' && !endDate) {
      setError('Please select an end date. With "End date" selected as your planning goal, an end date is required.');
      scrollToDatesSection();
      return;
    }
    if (isHomeschool && mode === 'TARGET_DAYS' && !targetDays) {
      setError('Please enter the number of target instructional days in the Dates & Requirements section.');
      scrollToDatesSection();
      return;
    }
    if (isHomeschool && mode === 'TARGET_HOURS' && (!targetHours || !hoursPerDay)) {
      setError('Please enter both target instructional hours and hours per instructional day.');
      scrollToDatesSection();
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      let saveReturnedYearId;
      if (!isHomeschool) {
        if (fastPathYearId) {
          const input = {
            academic_year_id: fastPathYearId,
            mode: 'FIXED_END',
            start_date: '',
            end_date: '',
            holiday_settings: {
              follow_global_holidays: followGlobalHolidays,
              holiday_country_code: countryCode,
              holiday_region: regionCode,
              provider: 'NAGER_DATE',
              excluded_holiday_dates: excludedPublicHolidayDates || [],
            },
            custom_holidays: [],
          };
          const { error: saveErr } = await saveAcademicYear(input);
          if (saveErr) throw saveErr;
        }
      } else {
        const effectiveEnd = mode === 'FIXED_END' ? endDate : calculatedResult?.end_date;
        const year_name = buildPlanYearName({
          children,
          subjects: baseSubjectList,
          blocks,
          selectedSubjectIds,
          startDate,
          endDate: effectiveEnd,
        });
        const input = {
          academic_year_id: academicYearId,
          mode,
          start_date: startDate,
          end_date: effectiveEnd,
          target_instructional_days: mode === 'TARGET_DAYS' ? parseInt(targetDays) : undefined,
          target_instructional_hours: mode === 'TARGET_HOURS' ? parseInt(targetHours) : undefined,
          planned_hours_per_day: mode === 'TARGET_HOURS' ? parseFloat(hoursPerDay) : undefined,
          holiday_settings: {
            follow_global_holidays: followGlobalHolidays,
            holiday_country_code: countryCode,
            holiday_region: regionCode,
            provider: 'NAGER_DATE',
            excluded_holiday_dates: excludedPublicHolidayDates || [],
          },
          custom_holidays: customHolidays.map(h => ({
            date: h.date,
            name: h.name,
            type: h.type || 'CUSTOM_HOLIDAY',
          })),
          year_name,
        };
        const { data, error: saveErr } = await saveAcademicYear(input);
        if (saveErr) throw saveErr;
        if (data?.academic_year_id) {
          setAcademicYearId(data.academic_year_id);
          saveReturnedYearId = data.academic_year_id;
        }
      }
      await refreshPreviousPlansList();
      const healthYearId = saveReturnedYearId ?? academicYearId ?? (!isHomeschool ? fastPathYearId : undefined) ?? undefined;
      bumpPlanSurfacesAfterMutation(healthYearId ?? null);
      const { data: healthData } = await getPlanHealth(familyId, healthYearId);
      if (healthData) setPlanHealth(healthData);
      Alert.alert('Success', 'Academic year saved successfully', [
        { text: 'OK', onPress: () => { onComplete?.(); onClose(); }},
      ]);
    } catch (err) {
      setError(err.message || 'Failed to save academic year');
    } finally {
      setSaving(false);
    }
  };

  const addCustomHoliday = () => {
    if (!newHolidayDate || !newHolidayName) {
      setError('Please enter both a date and a name for the custom holiday.');
      return;
    }
    
    setCustomHolidays([...customHolidays, {
      date: newHolidayDate,
      name: newHolidayName,
      type: 'CUSTOM_HOLIDAY',
    }]);
    
    setNewHolidayDate('');
    setNewHolidayName('');
  };

  const removeCustomHoliday = (index) => {
    setCustomHolidays(customHolidays.filter((_, i) => i !== index));
  };

  const addCustomBreak = () => {
    if (!newBreakStart || !newBreakEnd || !newBreakName) {
      setError('Please enter start date, end date, and a name for the break.');
      return;
    }
    if (newBreakStart > newBreakEnd) {
      setError('Break end date must be on or after the start date.');
      return;
    }
    setCustomBreaks([...customBreaks, { start: newBreakStart, end: newBreakEnd, name: newBreakName }]);
    setNewBreakStart('');
    setNewBreakEnd('');
    setNewBreakName('');
  };

  const removeCustomBreak = (index) => {
    setCustomBreaks(customBreaks.filter((_, i) => i !== index));
  };

  const addBlock = () => {
    const genericLabel = STRINGS.planMyYear?.sections?.blocks?.genericSlotLabel ?? 'Learning block';
    if (isPlaceholderOnlyScope) {
      const block = {
        block_id: crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}`,
        subject_id: null,
        placeholder_label: genericLabel,
        child_ids: [...allFamilyChildIds],
        weekdays: [],
        start_time: '09:00',
        end_time: '10:00',
        all_day: false,
      };
      setBlocks([...blocks, block]);
      return;
    }
    const subj = subjectsForCurrentSelection?.find((s) => selectedSubjectIds.includes(s.id)) || subjectsForCurrentSelection?.[0];
    const block = {
      block_id: crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}`,
      subject_id: subj?.id || '',
      child_ids: getChildIdsForSubject(subj, children),
      weekdays: [],
      start_time: '09:00',
      end_time: '10:00',
      all_day: false,
    };
    setBlocks([...blocks, block]);
  };

  const addBlocksFromSubjects = () => {
    const ids = selectedSubjectIds?.length ? selectedSubjectIds : (subjectsForCurrentSelection?.[0] ? [subjectsForCurrentSelection[0].id] : []);
    const newBlocks = ids.slice(0, 10).map((subjectId) => {
      const subj = baseSubjectList.find((s) => String(s.id) === String(subjectId));
      return {
        block_id: crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}-${subjectId}`,
        subject_id: subjectId,
        child_ids: getChildIdsForSubject(subj, children),
        weekdays: [],
        start_time: '09:00',
        end_time: '10:00',
        all_day: false,
      };
    });
    setBlocks([...blocks, ...newBlocks]);
  };

  const cycleBlockSubject = (idx) => {
    const block = blocks[idx];
    const ids = selectedSubjectIds?.length ? selectedSubjectIds : (subjectsForCurrentSelection?.map((s) => s.id) || []);
    if (ids.length === 0) return;
    const i = ids.indexOf(block.subject_id);
    const next = ids[(i + 1) % ids.length];
    const nextSubj = baseSubjectList.find((s) => String(s.id) === String(next));
    updateBlock(idx, { subject_id: next, child_ids: getChildIdsForSubject(nextSubj, children) });
  };

  const removeBlock = (index) => {
    setBlocks(blocks.filter((_, i) => i !== index));
  };

  const updateBlock = (index, updates) => {
    if (updates.weekdays !== undefined) {
      setCadenceWeekdayHighlightIndices([]);
      setError(null);
    }
    setBlocks(blocks.map((b, i) => (i === index ? { ...b, ...updates } : b)));
  };

  const handleFixAllCadenceConflicts = useCallback(() => {
    pendingCadenceResolveAckRef.current = true;
    setBlocks((prev) => {
      const next = applyCadenceTimeShiftsUntilStable(prev, cadenceConflictContext, 40);
      return next !== prev ? next : prev;
    });
  }, [cadenceConflictContext]);

  const handleApplyCadenceRowFix = useCallback(
    (line) => {
      if (!cadenceConflictReport || !line?.date || line.blockId == null) return;
      const { internal, external } = findConflictsForPreviewLine(line, cadenceConflictReport);
      const first = external[0] || internal[0];
      if (!first) return;
      const patch = applyCadenceFixForConflict(first, blocks, cadenceConflictContext);
      if (!patch) return;
      pendingCadenceResolveAckRef.current = true;
      setBlocks((prev) =>
        prev.map((b, i) =>
          i === patch.blockIndex ? { ...b, start_time: patch.start_time, end_time: patch.end_time } : b,
        ),
      );
    },
    [cadenceConflictReport, blocks, cadenceConflictContext],
  );

  // Reset state when modal closes (so reopening doesn't show stale conflicts/plan data after e.g. removing placeholders)
  useEffect(() => {
    if (!visible) {
      setError(null);
      setCustomHolidays([]);
      setCustomBreaks([]);
      setPlanConstraintMode('none');
      setPlanTargetDays('180');
      setPlanTargetHours('1000');
      setNewBreakStart('');
      setNewBreakEnd('');
      setNewBreakName('');
      setNewHolidayDate('');
      setNewHolidayName('');
      setCalculatedResult(null);
      setFastPathYearId(null);
      setAcademicYearId(null);
      setSelectedSubjectIds([]);
      setBlocks([]);
      setSchedulePotential(null);
      setStartDate('');
      setEndDate('');
      setPlanSubjectTargetsOverride({});
      setTargetScopeFromSettings('overall');
      setSavedCurriculumHasLessonsBySubjectId({});
      setApplyFromMode('entire');
      setApplyFromDate(null);
      setShowApplyFromDatePicker(false);
      setCalendarEventsForConflicts([]);
      setCadenceConflictsResolvedFeedback(false);
      pendingCadenceResolveAckRef.current = false;
      setCadenceWeekdayHighlightIndices([]);
    }
  }, [visible]);

  // Load calendar events in range so cadence can be checked against existing schedule.
  useEffect(() => {
    if (!visible || !familyId || !startDate || !endDate || !isHomeschool) {
      setCalendarEventsForConflicts([]);
      setLoadingCalendarEventsForConflicts(false);
      return;
    }
    let cancelled = false;
    setLoadingCalendarEventsForConflicts(true);
    (async () => {
      const { data, error } = await supabase
        .from('events')
        .select(
          'id, title, start_ts, end_ts, child_id, child_ids, status, deleted_at, is_backlog, is_flexible, recurrence_rule, generated_by, academic_year_id',
        )
        .eq('family_id', familyId)
        .gte('start_ts', `${startDate}T00:00:00`)
        .lte('start_ts', `${endDate}T23:59:59`)
        .is('deleted_at', null)
        .limit(2500);
      if (cancelled) return;
      if (error) {
        setCalendarEventsForConflicts([]);
        setLoadingCalendarEventsForConflicts(false);
        return;
      }
      setCalendarEventsForConflicts(data || []);
      setLoadingCalendarEventsForConflicts(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, familyId, startDate, endDate, isHomeschool]);

  // Clear validation error when user fixes the missing field (e.g. selects end date)
  useEffect(() => {
    if (!error) return;
    const dateRequirementMet = startDate && (mode !== 'FIXED_END' || endDate);
    const targetDaysMet = mode !== 'TARGET_DAYS' || !!targetDays;
    const targetHoursMet = mode !== 'TARGET_HOURS' || (!!targetHours && !!hoursPerDay);
    if (dateRequirementMet && targetDaysMet && targetHoursMet) {
      setError(null);
    }
  }, [error, startDate, endDate, mode, targetDays, targetHours, hoursPerDay]);

  const yearIdForHeaderLoad = initialAcademicYearId || academicYearId;
  const editPlanLoading =
    isHomeschool &&
    yearIdForHeaderLoad &&
    loadedYearIdRef.current !== yearIdForHeaderLoad &&
    !getPlanYearFullDataFromCache(familyId, yearIdForHeaderLoad);
  const headerMetaRaw = editPlanLoading
    ? null
    : [startDate && endDate ? `${formatDateDisplay(startDate)} – ${formatDateDisplay(endDate)}` : null, (() => {
        const idSet = new Set();
        (blocks || []).forEach((b) => (b.child_ids || []).forEach((cid) => { if (cid) idSet.add(String(cid)); }));
        const ids = Array.from(idSet);
        return ids.length > 0
          ? ids.map((id) => (children || []).find((c) => String(c.id) === String(id))?.first_name || (children || []).find((c) => String(c.id) === String(id))?.name).filter(Boolean).join(', ')
          : null;
      })(), effectiveSubjectIds?.length ? (baseSubjectList || []).filter((s) => effectiveSubjectIds.includes(s.id)).map((s) => s.name).slice(0, 3).join(', ') + (effectiveSubjectIds.length > 3 ? '…' : '') : null].filter(Boolean).join(' • ');
  const headerMeta = (headerMetaRaw && headerMetaRaw.trim() && headerMetaRaw.trim() !== '.') ? headerMetaRaw : null;
  const unitFocusSubjectNameForHeader = unitPipelineSubjectId
    ? (baseSubjectList || []).find((s) => String(s.id) === String(unitPipelineSubjectId))?.name
    : null;
  const unitHeaderSubtitle =
    unitFocusSubjectNameForHeader && effectiveSubjectIds.length > 1 && (planStep === 'source' || planStep === 'unit_structure')
      ? t('planMyYear.multiSubjectUnits.headerUnitsFor', { subjectName: unitFocusSubjectNameForHeader })
      : null;
  const unitStructureSaveDraftLabel = PLAN_MY_YEAR_LOGISTICS_FIRST
    ? t('planMyYear.multiSubjectUnits.footerSaveDraftLogisticsFirst')
    : t('planMyYear.multiSubjectUnits.footerSaveDraftClassic');
  const unitStructureSkipDraftLabel = PLAN_MY_YEAR_LOGISTICS_FIRST
    ? t('planMyYear.multiSubjectUnits.footerSkipLogisticsFirst')
    : t('planMyYear.multiSubjectUnits.footerSkipClassic');
  const hideFooterSkipForPasteImportInput =
    planSource === 'paste_plain' && unitStructureStep === 'input' && !draftData && !manualDraft;
  const showUploadMaterialPreviewFooter =
    planSource === 'upload' && unitStructureStep === 'input' && !draftData && !manualDraft;
  const showGenerateCurriculumFooter =
    planSource === 'generate' && unitStructureStep === 'input' && !draftData && !manualDraft;

  /** Clear parsed draft UI but keep pasted source text so users can edit or re-run Preview structure (paste_plain / upload). */
  const leaveParsedDraftForTextEditor = useCallback(() => {
    if (planSource === 'upload') {
      setUnitStructureStep('input');
    } else if (planSource === 'paste_plain') {
      setUnitStructureStep('input');
    } else {
      setUnitStructureStep('input');
      setRawText('');
    }
  }, [planSource]);

  const hasPersistedManualCurriculum = useMemo(
    () =>
      planSource === 'paste' &&
      Boolean(unitPipelineSubjectId) &&
      (unitStructureData?.units || []).some((u) => (u.lessons || []).length > 0),
    [planSource, unitPipelineSubjectId, unitStructureData],
  );

  // Manual input: open straight into the builder when there is no saved curriculum (no “Start building” step).
  useEffect(() => {
    if (!visible) return;
    if (planStep !== 'unit_structure') return;
    if (planSource !== 'paste') return;
    if (unitStructureStep !== 'input') return;
    if (draftData) return;
    if (manualDraft) return;
    if (!unitPipelineSubjectId || !familyId) return;
    if (loadingUnitStructure) return;
    if (suppressManualCurriculumHydrateRef.current) return;
    const persisted = (unitStructureData?.units || []).some((u) => (u.lessons || []).length > 0);
    if (persisted) {
      const loaded = manualDraftFromUnitStructureData(unitStructureData);
      if (loaded) {
        setManualDraft(loaded);
        setExpandedUnitIndexManual(0);
        setExpandedUnits(new Set([0]));
      }
      return;
    }
    setManualDraft(createInitialManualDraft());
    setExpandedUnitIndexManual(0);
    setExpandedUnits(new Set([0]));
  }, [
    visible,
    planStep,
    planSource,
    unitStructureStep,
    draftData,
    manualDraft,
    unitPipelineSubjectId,
    familyId,
    loadingUnitStructure,
    unitStructureData,
  ]);

  const unitStructureSaveManualChangesLabel = t('planMyYear.multiSubjectUnits.footerSaveManualChanges');

  const stepScopeComplete = !!planningScope;
  const stepSourceComplete = true; // Choose method always has a selection (default: placeholders)
  const step0Complete = preconditionsMet;
  const step1Complete = isPlaceholderOnlyScope
    ? blocks.length >= 1
    : effectiveSubjectIds.length > 0 && blocks.length >= effectiveSubjectIds.length;
  const step2Complete = !!startDate && (mode !== 'FIXED_END' || !!endDate);
  const step3Complete = false; // Breaks optional, always "future" until we're on it
  const completed = [stepScopeComplete, stepSourceComplete, step0Complete, step1Complete, step2Complete, step3Complete];
  const currentStepIndex = completed.findIndex((c) => !c);
  const currentStep = currentStepIndex >= 0 ? currentStepIndex : 5;
  const sectionStepLabels = [
    STRINGS.planMyYear?.sections?.planningScope?.title ?? 'Scope',
    STRINGS.planMyYear?.sections?.useASource?.title ?? 'Choose method',
    'Subjects',
    STRINGS.planMyYear.sections.blocks.title,
    STRINGS.planMyYear.sections.dates.title,
    STRINGS.planMyYear.sections.breaks.title,
  ];

  const pickerOnly = openForNewPlan && !academicYearId && !startCreatingNew;
  /** YOUR PLANS list: picker idle state OR user chose "Edit plan" from toolbar while mid–build (startCreatingNew would make pickerOnly false). */
  const showYourPlansList =
    showPlanManagerView &&
    openForNewPlan &&
    !academicYearId &&
    (pickerOnly || openToEditPlanList);
  /** Entry: create vs edit — hide when jumping straight to YOUR PLANS (e.g. Edit plan from toolbar). */
  const showEntryChoice =
    openForNewPlan &&
    !academicYearId &&
    !startCreatingNew &&
    !showPlanManagerView &&
    !openToEditPlanList;

  const closeWebDraftLessonMenu = useCallback(() => {
    setDraftBuilderLessonMenuKey(null);
    setDraftBuilderMovePickKey(null);
    setWebDraftLessonMenuLayout(null);
  }, []);

  const closeWebDraftUnitMenu = useCallback(() => {
    setDraftBuilderUnitMenuKey(null);
    setWebDraftUnitMenuLayout(null);
  }, []);

  const openPlanInEditMode = useCallback((yearId) => {
    if (!yearId) return;
    setAcademicYearId(yearId);
    setPlanSummaryYearId(null);
    setPlanSummaryData(null);
    setPlanSummaryError(null);
    setShowPlanManagerView(false);
    setPlanStep('logistics');
    setEditingFromSummary(true);
    setStartCreatingNew(false);
    setPlanListContextMenu(null);
  }, []);

  const openPlanDeleteConfirm = useCallback((yearId) => {
    if (!yearId) return;
    setPlanSummaryYearId(yearId);
    setShowDeletePlanConfirm(true);
    setPlanListContextMenu(null);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !planListContextMenu) return;
    const close = () => setPlanListContextMenu(null);
    const onKeyDown = (e) => {
      if (e?.key === 'Escape') close();
    };
    // Defer listener registration so the opening right-click event finishes propagation
    // before we start listening — otherwise capture fires on the same event and closes immediately.
    const timer = setTimeout(() => {
      window.addEventListener('resize', close);
      window.addEventListener('scroll', close, true);
      document.addEventListener('mousedown', close, true);
      document.addEventListener('contextmenu', close, true);
      document.addEventListener('keydown', onKeyDown, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('contextmenu', close, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [planListContextMenu]);

  const renderWebDraftLessonMenuPortal = () => {
    if (Platform.OS !== 'web' || draftBuilderLessonMenuKey == null || !webDraftLessonMenuLayout) return null;
    const currentUnits = (draftData || manualDraft)?.units;
    if (!currentUnits?.length) return null;
    const keyStr = String(draftBuilderLessonMenuKey);
    const dashIdx = keyStr.indexOf('-');
    if (dashIdx < 0) return null;
    const unitIdx = parseInt(keyStr.slice(0, dashIdx), 10);
    const lessonIdx = parseInt(keyStr.slice(dashIdx + 1), 10);
    if (Number.isNaN(unitIdx) || Number.isNaN(lessonIdx)) return null;
    const lessonMenuKey = keyStr;
    let ReactDOM;
    try {
      ReactDOM = require('react-dom');
    } catch (_) {
      return null;
    }
    if (!ReactDOM?.createPortal || typeof document === 'undefined' || !document.body) return null;

    const menuPanel = (
      <>
        {draftBuilderMovePickKey === lessonMenuKey ? (
          <>
            <TouchableOpacity
              onPress={() => setDraftBuilderMovePickKey(null)}
              style={{ paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: BORDER }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: ACCENT }}>
                {s('planMyYear.multiSubjectUnits.draftMoveLessonBack')}
              </Text>
            </TouchableOpacity>
            {currentUnits.map((uOpt, oi) =>
              oi !== unitIdx ? (
                <TouchableOpacity
                  key={uOpt.temp_id || `portal-u-${oi}`}
                  onPress={() => moveDraftLessonToUnit(unitIdx, lessonIdx, oi, null)}
                  style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={{ fontSize: 14, color: FG }} numberOfLines={2}>
                    {uOpt.title?.trim() || `Unit ${oi + 1}`}
                  </Text>
                </TouchableOpacity>
              ) : null,
            )}
          </>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => insertUnitBreakAboveLesson(unitIdx, lessonIdx)}
              style={{ paddingVertical: 10, paddingHorizontal: 12 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={{ fontSize: 14, color: FG }}>{s('planMyYear.multiSubjectUnits.draftInsertUnitBreakAbove')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => moveDraftLessonToNewUnit(unitIdx, lessonIdx)}
              style={{ paddingVertical: 10, paddingHorizontal: 12 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={{ fontSize: 14, color: FG }}>{s('planMyYear.multiSubjectUnits.draftMoveLessonToNewUnit')}</Text>
            </TouchableOpacity>
            {currentUnits.length > 1 ? (
              <TouchableOpacity
                onPress={() => setDraftBuilderMovePickKey(lessonMenuKey)}
                style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={{ fontSize: 14, color: FG }}>{s('planMyYear.multiSubjectUnits.draftMoveLessonToUnit')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => {
                deleteDraftLesson(unitIdx, lessonIdx);
                closeWebDraftLessonMenu();
              }}
              style={{ paddingVertical: 10, paddingHorizontal: 12 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={{ fontSize: 14, color: ERROR }}>{s('planMyYear.multiSubjectUnits.draftDeleteLesson')}</Text>
            </TouchableOpacity>
          </>
        )}
      </>
    );

    return ReactDOM.createPortal(
      <>
        <TouchableOpacity
          activeOpacity={1}
          onPress={closeWebDraftLessonMenu}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100000,
          }}
          {...(Platform.OS === 'web' && { cursor: 'default' })}
        />
        <View
          style={{
            position: 'fixed',
            top: webDraftLessonMenuLayout.top,
            right: webDraftLessonMenuLayout.right,
            minWidth: 220,
            maxWidth: 320,
            backgroundColor: '#ffffff',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: BORDER,
            paddingVertical: 4,
            zIndex: 100001,
            ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(15,23,42,0.16)' } : {}),
          }}
        >
          {menuPanel}
        </View>
      </>,
      document.body,
    );
  };

  const renderPlanListContextMenuPortal = () => {
    if (Platform.OS !== 'web' || !planListContextMenu) return null;
    let ReactDOM;
    try {
      ReactDOM = require('react-dom');
    } catch (_) {
      return null;
    }
    if (!ReactDOM?.createPortal || typeof document === 'undefined' || !document.body) return null;
    const menuW = 210;
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const left = Math.max(8, Math.min(planListContextMenu.x, viewportW - menuW - 8));
    const top = Math.max(8, Math.min(planListContextMenu.y, viewportH - 120));
    return ReactDOM.createPortal(
      <View
        style={{
          position: 'fixed',
          top,
          left,
          width: menuW,
          backgroundColor: '#FFFFFF',
          borderRadius: 14,
          borderWidth: 1,
          borderColor: '#E5E7EB',
          boxShadow: '0 14px 28px rgba(15, 23, 42, 0.16)',
          zIndex: 2147483647,
          overflow: 'hidden',
        }}
      >
        <TouchableOpacity
          onPress={() => openPlanInEditMode(planListContextMenu.planId)}
          activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 }}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Pencil size={16} color="#374151" strokeWidth={2} />
          <Text style={{ fontSize: 14, color: '#111827', fontWeight: '600' }}>Edit plan</Text>
        </TouchableOpacity>
        <View style={{ height: 1, backgroundColor: '#F3F4F6' }} />
        <TouchableOpacity
          onPress={() => openPlanDeleteConfirm(planListContextMenu.planId)}
          activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 }}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Trash2 size={16} color="#B91C1C" strokeWidth={2} />
          <Text style={{ fontSize: 14, color: '#B91C1C', fontWeight: '600' }}>Delete plan</Text>
        </TouchableOpacity>
      </View>,
      document.body,
    );
  };

  const renderWebDraftUnitMenuPortal = () => {
    if (Platform.OS !== 'web' || draftBuilderUnitMenuKey === null || !webDraftUnitMenuLayout) return null;
    const currentUnits = (draftData || manualDraft)?.units;
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
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100000,
          }}
          {...(Platform.OS === 'web' && { cursor: 'default' })}
        />
        <View
          style={{
            position: 'fixed',
            top: webDraftUnitMenuLayout.top,
            right: webDraftUnitMenuLayout.right,
            minWidth: 216,
            maxWidth: 320,
            backgroundColor: '#ffffff',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: BORDER,
            paddingVertical: 4,
            zIndex: 100001,
            ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(15,23,42,0.16)' } : {}),
          }}
        >
          {unitIdx > 0 ? (
            <TouchableOpacity
              onPress={() => mergeDraftUnitWithAdjacent(unitIdx, 'prev')}
              style={{ paddingVertical: 10, paddingHorizontal: 12 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={{ fontSize: 14, color: FG }}>{s('planMyYear.multiSubjectUnits.draftUnitMergeWithPrevious')}</Text>
            </TouchableOpacity>
          ) : null}
          {unitIdx < currentUnits.length - 1 ? (
            <TouchableOpacity
              onPress={() => mergeDraftUnitWithAdjacent(unitIdx, 'next')}
              style={{ paddingVertical: 10, paddingHorizontal: 12 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={{ fontSize: 14, color: FG }}>{s('planMyYear.multiSubjectUnits.draftUnitMergeWithNext')}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => {
              addDraftLesson(unitIdx);
              closeWebDraftUnitMenu();
            }}
            style={{ paddingVertical: 10, paddingHorizontal: 12 }}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={{ fontSize: 14, color: FG }}>{s('planMyYear.multiSubjectUnits.draftUnitAddLesson')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => addDraftUnitBelowIndex(unitIdx)}
            style={{ paddingVertical: 10, paddingHorizontal: 12 }}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={{ fontSize: 14, color: FG }}>{s('planMyYear.multiSubjectUnits.draftUnitAddUnitBelow')}</Text>
          </TouchableOpacity>
        </View>
      </>,
      document.body,
    );
  };

  const renderPlanYearUnitStructureScroll = (overlayCompactHeader = false) => (
    <>
            <ScrollView
              style={styles.content}
              contentContainerStyle={
                overlayCompactHeader
                  ? [styles.contentContainer, styles.contentContainerUnitStructureOverlay]
                  : styles.contentContainer
              }
              showsVerticalScrollIndicator={false}
            >
              {(() => {
                const availableSubjectId = unitPipelineSubjectId;
                const availableSubject = availableSubjectId ? baseSubjectList.find((s) => String(s.id) === String(availableSubjectId)) : null;

                if (!availableSubject) {
                  return (
                    <View style={{ paddingVertical: 24, paddingHorizontal: 4 }}>
                      <Text style={[styles.unitStructureModalTitle, { marginBottom: 8 }]}>{s('planMyYear.multiSubjectUnits.chooseSubjectEmptyTitle')}</Text>
                      <Text style={[styles.mutedText, { marginBottom: 20, lineHeight: 20 }]}>
                        {s('planMyYear.multiSubjectUnits.chooseSubjectEmptyBody')}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                        <TouchableOpacity
                          onPress={() => setPlanStep(PLAN_STEP_KEYS.SOURCE)}
                          style={[styles.primaryButton, { alignSelf: 'flex-start' }]}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={styles.primaryButtonText}>{s('planMyYear.multiSubjectUnits.backToMethod')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setPlanStep(PLAN_STEP_KEYS.LOGISTICS)}
                          style={[styles.cancelButton, { alignSelf: 'flex-start' }]}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={styles.cancelText}>{s('planMyYear.multiSubjectUnits.backToLogistics')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }

                // Don’t block paste / upload / generate / manual entry UIs on structure fetch — avoids a flash before “Import from text”, etc.
                const unitStructureContentEntryIdle =
                  !draftData &&
                  !manualDraft &&
                  ((planSource === 'paste_plain' && unitStructureStep === 'input') ||
                    (planSource === 'generate' && unitStructureStep === 'input') ||
                    (planSource === 'paste' && unitStructureStep === 'input') ||
                    (planSource === 'upload' && unitStructureStep === 'input'));
                if (loadingUnitStructure && !unitStructureContentEntryIdle) {
                  return (
                    <View style={{ paddingVertical: 40, alignItems: 'center', paddingHorizontal: 16 }}>
                      <ActivityIndicator size="small" color={ACCENT} />
                      <Text style={[styles.mutedText, { marginTop: 12, textAlign: 'center' }]}>
                        {s('planMyYear.multiSubjectUnits.loadingCurriculum')}
                      </Text>
                    </View>
                  );
                }

                const unitSubjectBanner =
                  effectiveSubjectIds.length > 1 ? (
                    <View
                      style={{
                        marginBottom: 16,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        backgroundColor: ACCENT_LIGHT,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: 'rgba(15,23,42,0.08)',
                      }}
                    >
                      <Text style={{ fontSize: 13, color: FG, lineHeight: 18 }}>
                        <Text style={{ fontWeight: '600' }}>{s('planMyYear.multiSubjectUnits.subjectBannerPrefix')} </Text>
                        {availableSubject.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 16 }}>
                        {s('planMyYear.multiSubjectUnits.subjectBannerHint')}
                      </Text>
                    </View>
                  ) : null;

                const cadenceDifferentMethodBannerEl =
                  cadenceDifferentMethodNotice && PLAN_MY_YEAR_LOGISTICS_FIRST ? (
                    <View
                      style={{
                        marginBottom: 14,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        backgroundColor: 'rgba(59, 130, 246, 0.08)',
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: 'rgba(59, 130, 246, 0.22)',
                      }}
                    >
                      <Text style={{ fontSize: 13, color: FG, lineHeight: 19 }}>
                        {t('planMyYear.multiSubjectUnits.cadenceDifferentMethodBanner', {
                          method: cadenceDifferentMethodNotice.previousMethodLabel,
                        })}
                      </Text>
                    </View>
                  ) : null;

                // If we have draft data (after parsing/generating), show the structure editor
                const currentDraft = draftData || manualDraft;
                if (currentDraft && currentDraft.units && currentDraft.units.length > 0) {
                  const units = currentDraft.units || [];
                  const totalLessons = units.reduce((sum, u) => sum + (u.lessons || []).length, 0);
                  const totalAssessments = units.reduce((sum, u) => sum + (u.lessons || []).filter(l => (l.lesson_type === 'assessment' || l.lesson_type === 'exam')).length, 0);
                  const DRAFT_EXTRA_TYPES = ['project', 'assessment', 'exam', 'activity'];
                  const unitCardTint = 'rgba(241, 246, 255, 0.85)';
                  const unitInnerBg = 'rgba(255, 255, 255, 0.65)';
                  const timelineColor = '#bfdbfe';
                  const isParsedFromTextDraft =
                    Boolean(draftData) && !manualDraft && (planSource === 'paste_plain' || planSource === 'upload');
                  const flatLessonsForParsedPreview = flattenUnitLessonsForPreview(units);
                  const reviewFlagCount =
                    isParsedFromTextDraft && rawText.trim().length >= 14
                      ? estimateImportReviewFlagCount(rawText)
                      : 0;
                  const parsedHintLabel = isParsedFromTextDraft
                    ? importParseHintLabelFromKey(detectPastedStructureHintKey(rawText))
                    : null;
                  const sidPreview = String(lessonSchedulePreviewPlan.curriculumSubjectId || '');
                  const subjectSlotRowsForPreview = lessonSchedulePreviewPlan.rows.filter(
                    (r) => String(r.line.subjectId || '') === sidPreview,
                  );
                  const availSlotLblParsed = s('planMyYear.multiSubjectUnits.availableInstructionalSlot');

                  return (
                    <>
                      {unitSubjectBanner}
                      {cadenceDifferentMethodBannerEl}
                      {PLAN_MY_YEAR_LOGISTICS_FIRST && !cadenceYieldsInstructionalSlots && (
                        <View
                          style={{
                            marginBottom: 16,
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: 'rgba(245, 158, 11, 0.32)',
                          }}
                        >
                          <Text style={{ fontSize: 13, color: FG, lineHeight: 19 }}>
                            {s('planMyYear.multiSubjectUnits.unitModalNoScheduleBanner')}
                          </Text>
                        </View>
                      )}
                      {isParsedFromTextDraft ? (
                        <>
                          <View style={{ marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                            <Text style={[styles.unitStructureModalTitle, { fontSize: 18, marginBottom: 6, lineHeight: 24 }]}>
                              {s('planMyYear.multiSubjectUnits.parsedPreviewTitle')}
                            </Text>
                            <Text style={[styles.mutedText, { marginBottom: 10, lineHeight: 20 }]}>
                              {s('planMyYear.multiSubjectUnits.parsedPreviewSubtitle')}
                            </Text>
                            {parsedHintLabel ? (
                              <Text style={{ fontSize: 13, color: TEXT_SECONDARY, marginBottom: 6, lineHeight: 18 }}>
                                ✓ {s('planMyYear.multiSubjectUnits.pasteDetectedPrefix')} {parsedHintLabel}
                              </Text>
                            ) : null}
                            {reviewFlagCount >= 2 ? (
                              <Text style={{ fontSize: 13, color: '#b45309', marginBottom: 8, lineHeight: 18 }}>
                                ⚠{' '}
                                {t('planMyYear.multiSubjectUnits.parsedPreviewMayNeedReview', {
                                  count: reviewFlagCount,
                                })}
                              </Text>
                            ) : null}
                            <Text style={{ fontSize: 14, fontWeight: '600', color: FG, lineHeight: 20 }}>
                              {units.length} {units.length === 1 ? 'unit' : 'units'} · {totalLessons}{' '}
                              {totalLessons === 1 ? 'lesson' : 'lessons'}
                            </Text>
                          </View>
                          {PLAN_MY_YEAR_LOGISTICS_FIRST && cadenceYieldsInstructionalSlots && totalLessons > 0 ? (
                            <View
                              style={{
                                marginBottom: 14,
                                paddingVertical: 10,
                                paddingHorizontal: 12,
                                backgroundColor: ELIGIBILITY_CARD_BG,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: ELIGIBILITY_CARD_BORDER,
                              }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: '600', color: FG, marginBottom: 10 }}>
                                {s('planMyYear.multiSubjectUnits.parsedSchedulePreviewTitle')}
                              </Text>
                              {cadenceConflictDayCount > 0 ? (
                                <Text style={{ fontSize: 12, color: '#b45309', marginBottom: 10, lineHeight: 18 }}>
                                  {cadenceConflictDayCount === 1
                                    ? t('planMyYear.cadenceConflicts.previewConflictSummaryOne')
                                    : t('planMyYear.cadenceConflicts.previewConflictSummaryMany', {
                                        count: cadenceConflictDayCount,
                                      })}
                                </Text>
                              ) : null}
                              {lessonSchedulePreviewPlan.hasCurriculumMapping ? (
                                <ScrollView
                                  style={{ maxHeight: 240 }}
                                  nestedScrollEnabled
                                  showsVerticalScrollIndicator
                                >
                                  {(() => {
                                    const nMax = Math.max(
                                      flatLessonsForParsedPreview.length,
                                      subjectSlotRowsForPreview.length,
                                    );
                                    const lines = [];
                                    for (let i = 0; i < nMax; i++) {
                                      const slotLine = subjectSlotRowsForPreview[i]?.line;
                                      const les = flatLessonsForParsedPreview[i];
                                      const lineNo = i + 1;
                                      const timePart = slotLine ? `${slotLine.dateLabel}, ${slotLine.timeLabel}` : null;
                                      if (les && timePart) {
                                        lines.push(
                                          <View key={`parsed-slot-${i}`} style={{ marginBottom: 8 }}>
                                            <Text style={{ fontSize: 12, color: FG, lineHeight: 20 }}>
                                              {`${lineNo}. ${timePart}  →  Lesson ${les.index}: ${les.title}`}
                                            </Text>
                                            {slotLine && cadenceConflictDates.has(slotLine.date) ? (
                                              <Text style={{ fontSize: 11, color: '#b45309', marginTop: 4, lineHeight: 16 }}>
                                                {t('planMyYear.cadenceConflicts.previewRowFlag')}
                                              </Text>
                                            ) : null}
                                          </View>,
                                        );
                                      } else if (!les && timePart) {
                                        lines.push(
                                          <View key={`parsed-slot-${i}`} style={{ marginBottom: 8 }}>
                                            <Text style={{ fontSize: 12, color: MUTED, lineHeight: 20 }}>
                                              {`${lineNo}. ${timePart}  →  ${availSlotLblParsed}`}
                                            </Text>
                                            {slotLine && cadenceConflictDates.has(slotLine.date) ? (
                                              <Text style={{ fontSize: 11, color: '#b45309', marginTop: 4, lineHeight: 16 }}>
                                                {t('planMyYear.cadenceConflicts.previewRowFlag')}
                                              </Text>
                                            ) : null}
                                          </View>,
                                        );
                                      } else if (les && !timePart) {
                                        lines.push(
                                          <Text
                                            key={`parsed-slot-${i}`}
                                            style={{ fontSize: 12, color: FG, lineHeight: 20, marginBottom: 8 }}
                                          >
                                            {`${lineNo}. ${t('planMyYear.multiSubjectUnits.draftLessonUnscheduled')}  →  Lesson ${les.index}: ${les.title}`}
                                          </Text>,
                                        );
                                      }
                                    }
                                    return lines;
                                  })()}
                                  <LessonOverflowFollowUp
                                    textStyle={{ fontSize: 11, color: TEXT_SECONDARY }}
                                    overflowCount={lessonSchedulePreviewPlan.overflowCount}
                                    extendEndYmd={lessonOverflowExtendEndDate}
                                    curriculumSubjectId={lessonSchedulePreviewPlan.curriculumSubjectId}
                                    hasCurriculumMapping={lessonSchedulePreviewPlan.hasCurriculumMapping}
                                    onApplyExtend={applyExtendedPlanEndDate}
                                    t={t}
                                  />
                                </ScrollView>
                              ) : (
                                <Text style={{ fontSize: 12, color: MUTED, lineHeight: 18 }}>
                                  {s('planMyYear.multiSubjectUnits.draftLessonSlotMapIntro')}
                                </Text>
                              )}
                            </View>
                          ) : null}
                          <Text style={[styles.mutedText, { fontSize: 12, lineHeight: 18, marginBottom: 12 }]}>
                            {s('planMyYear.multiSubjectUnits.parsedPreviewEditTip')}
                          </Text>
                        </>
                      ) : (
                        <>
                          <View style={{ marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                            {manualDraft && !draftData ? (
                              <Text style={[styles.unitStructureModalTitle, { marginBottom: 10 }]}>
                                {s('planMyYear.multiSubjectUnits.unitInputModalTitle')}
                              </Text>
                            ) : null}
                            <Text
                              style={[
                                styles.unitStructureModalTitle,
                                { fontSize: 16, marginBottom: 0, lineHeight: 22, textTransform: 'none', letterSpacing: 0 },
                              ]}
                            >
                              {units.length} {units.length === 1 ? 'unit' : 'units'} · {totalLessons}{' '}
                              {totalLessons === 1 ? 'lesson' : 'lessons'}
                              {totalAssessments > 0
                                ? ` · ${totalAssessments} ${totalAssessments === 1 ? 'assessment' : 'assessments'}`
                                : ''}{' '}
                              built
                            </Text>
                            {PLAN_MY_YEAR_LOGISTICS_FIRST && cadenceYieldsInstructionalSlots && (
                              <Text style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 8, lineHeight: 18 }}>
                                {previewSlotLines.length === 1
                                  ? s('planMyYear.multiSubjectUnits.instructionalSlotsAvailableOne')
                                  : t('planMyYear.multiSubjectUnits.instructionalSlotsAvailableMany', {
                                      count: previewSlotLines.length,
                                    })}
                              </Text>
                            )}
                          </View>
                          {PLAN_MY_YEAR_LOGISTICS_FIRST && cadenceYieldsInstructionalSlots && totalLessons > 0 && (
                            <View
                              style={{
                                marginBottom: 14,
                                paddingVertical: 10,
                                paddingHorizontal: 12,
                                backgroundColor: ELIGIBILITY_CARD_BG,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: ELIGIBILITY_CARD_BORDER,
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '600', color: FG, marginBottom: 8 }}>
                                {lessonSchedulePreviewPlan.hasCurriculumMapping
                                  ? s('planMyYear.multiSubjectUnits.lessonSchedulePreviewHeading')
                                  : s('planMyYear.multiSubjectUnits.draftLessonSlotMapIntro')}
                              </Text>
                              {cadenceConflictDayCount > 0 ? (
                                <Text style={{ fontSize: 12, color: '#b45309', marginBottom: 10, lineHeight: 18 }}>
                                  {cadenceConflictDayCount === 1
                                    ? t('planMyYear.cadenceConflicts.previewConflictSummaryOne')
                                    : t('planMyYear.cadenceConflicts.previewConflictSummaryMany', {
                                        count: cadenceConflictDayCount,
                                      })}
                                </Text>
                              ) : null}
                              {lessonSchedulePreviewPlan.hasCurriculumMapping ? (
                                <ScrollView
                                  style={{ maxHeight: 220 }}
                                  nestedScrollEnabled
                                  showsVerticalScrollIndicator
                                >
                                  {lessonSchedulePreviewPlan.rows
                                    .filter(
                                      ({ line }) =>
                                        String(line.subjectId || '') ===
                                        String(lessonSchedulePreviewPlan.curriculumSubjectId || ''),
                                    )
                                    .map(({ line, detailLine }, idx) => (
                                      <View
                                        key={`unit-overlay-slot-${line.date}-${idx}`}
                                        style={{
                                          marginBottom: 10,
                                          paddingBottom: 8,
                                          borderBottomWidth: 1,
                                          borderBottomColor: BORDER,
                                        }}
                                      >
                                        <Text style={{ fontSize: 12, fontWeight: '600', color: FG }}>
                                          {line.dateLabel}, {line.timeLabel}
                                        </Text>
                                        <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                                          {detailLine ??
                                            `${line.subjectName}${line.childNames ? ` · ${line.childNames}` : ''}`}
                                        </Text>
                                        {cadenceConflictDates.has(line.date) ? (
                                          <Text style={{ fontSize: 11, color: '#b45309', marginTop: 6, lineHeight: 16 }}>
                                            {t('planMyYear.cadenceConflicts.previewRowFlag')}
                                          </Text>
                                        ) : null}
                                      </View>
                                    ))}
                                  <LessonOverflowFollowUp
                                    textStyle={{ fontSize: 11, color: TEXT_SECONDARY }}
                                    overflowCount={lessonSchedulePreviewPlan.overflowCount}
                                    extendEndYmd={lessonOverflowExtendEndDate}
                                    curriculumSubjectId={lessonSchedulePreviewPlan.curriculumSubjectId}
                                    hasCurriculumMapping={lessonSchedulePreviewPlan.hasCurriculumMapping}
                                    onApplyExtend={applyExtendedPlanEndDate}
                                    t={t}
                                  />
                                </ScrollView>
                              ) : (
                                <Text style={{ fontSize: 12, color: MUTED, lineHeight: 18 }}>
                                  {s('planMyYear.multiSubjectUnits.draftLessonSlotMapIntro')}
                                </Text>
                              )}
                            </View>
                          )}
                        </>
                      )}

                      {/* Units list */}
                      <View style={{ gap: 14 }}>
                        {(() => {
                          let lessonGlobalIdx = 0;
                          return units.map((unit, unitIdx) => {
                          const isExpanded = expandedUnits.has(unitIdx);
                          const lessons = unit.lessons || [];
                          const lessonCount = lessons.filter(l => l.lesson_type === 'lesson' || l.lesson_type === 'project' || l.lesson_type === 'activity').length;
                          const assessmentCount = lessons.filter(l => l.lesson_type === 'assessment' || l.lesson_type === 'exam').length;

                          return (
                            <View
                              key={unit.temp_id || unitIdx}
                              style={{
                                borderWidth: 1,
                                borderColor: BORDER,
                                borderRadius: 12,
                                backgroundColor: unitCardTint,
                                overflow: Platform.OS === 'web' ? 'visible' : 'hidden',
                                ...(Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(15,23,42,0.06)' } : {}),
                              }}
                            >
                              {/* Unit header (container) */}
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  paddingVertical: 12,
                                  paddingHorizontal: 14,
                                  gap: 8,
                                  ...(Platform.OS !== 'web' && draftBuilderUnitMenuKey === unitIdx
                                    ? { zIndex: 80, elevation: 24 }
                                    : {}),
                                }}
                              >
                                <TouchableOpacity
                                  onPress={() => {
                                    const newExpanded = new Set(expandedUnits);
                                    if (isExpanded) {
                                      newExpanded.delete(unitIdx);
                                    } else {
                                      newExpanded.add(unitIdx);
                                    }
                                    setExpandedUnits(newExpanded);
                                  }}
                                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                  style={{ padding: 4 }}
                                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                >
                                  {isExpanded ? <ChevronUp size={18} color={MUTED} /> : <ChevronDown size={18} color={MUTED} />}
                                </TouchableOpacity>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <TextInput
                                    style={[styles.input, { fontSize: 15, fontWeight: '700', paddingVertical: 4, paddingHorizontal: 4, marginBottom: 2, backgroundColor: 'transparent' }]}
                                    value={unit.title || ''}
                                    onChangeText={(v) => updateDraftUnit(unitIdx, 'title', v)}
                                    placeholder={`Unit ${unitIdx + 1}`}
                                    placeholderTextColor={MUTED}
                                    {...(Platform.OS === 'web' && { cursor: 'text' })}
                                  />
                                  <Text style={[styles.mutedText, { fontSize: 12 }]}>
                                    {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}
                                    {assessmentCount > 0 && ` · ${assessmentCount} ${assessmentCount === 1 ? 'assessment' : 'assessments'}`}
                                  </Text>
                                </View>
                                <View style={{ position: 'relative', zIndex: 20 }}>
                                  <TouchableOpacity
                                    onPress={(e) => {
                                      setDraftBuilderLessonMenuKey(null);
                                      setDraftBuilderMovePickKey(null);
                                      if (Platform.OS === 'web') {
                                        const prev = draftBuilderUnitMenuKey;
                                        const closing = prev === unitIdx;
                                        if (closing) {
                                          setWebDraftUnitMenuLayout(null);
                                          setDraftBuilderUnitMenuKey(null);
                                          return;
                                        }
                                        const el =
                                          e?.currentTarget ||
                                          e?.nativeEvent?.currentTarget ||
                                          e?.nativeEvent?.target;
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
                                    }}
                                    style={{ padding: 6 }}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    accessibilityLabel={s('planMyYear.multiSubjectUnits.draftLessonMore')}
                                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                  >
                                    <MoreVertical size={18} color={MUTED} />
                                  </TouchableOpacity>
                                  {draftBuilderUnitMenuKey === unitIdx && Platform.OS !== 'web' ? (
                                    <View
                                      style={{
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
                                      }}
                                    >
                                      {unitIdx > 0 ? (
                                        <TouchableOpacity
                                          onPress={() => mergeDraftUnitWithAdjacent(unitIdx, 'prev')}
                                          style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                        >
                                          <Text style={{ fontSize: 14, color: FG }}>{s('planMyYear.multiSubjectUnits.draftUnitMergeWithPrevious')}</Text>
                                        </TouchableOpacity>
                                      ) : null}
                                      {unitIdx < units.length - 1 ? (
                                        <TouchableOpacity
                                          onPress={() => mergeDraftUnitWithAdjacent(unitIdx, 'next')}
                                          style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                        >
                                          <Text style={{ fontSize: 14, color: FG }}>{s('planMyYear.multiSubjectUnits.draftUnitMergeWithNext')}</Text>
                                        </TouchableOpacity>
                                      ) : null}
                                      <TouchableOpacity
                                        onPress={() => {
                                          addDraftLesson(unitIdx);
                                          setDraftBuilderUnitMenuKey(null);
                                        }}
                                        style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                      >
                                        <Text style={{ fontSize: 14, color: FG }}>{s('planMyYear.multiSubjectUnits.draftUnitAddLesson')}</Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        onPress={() => addDraftUnitBelowIndex(unitIdx)}
                                        style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                      >
                                        <Text style={{ fontSize: 14, color: FG }}>{s('planMyYear.multiSubjectUnits.draftUnitAddUnitBelow')}</Text>
                                      </TouchableOpacity>
                                    </View>
                                  ) : null}
                                </View>
                                <TouchableOpacity
                                  onPress={() => deleteDraftUnit(unitIdx)}
                                  style={{ padding: 4 }}
                                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                >
                                  <Trash2 size={16} color={ERROR} />
                                </TouchableOpacity>
                              </View>

                              {/* Lessons — timeline list inside unit */}
                              {isExpanded && (
                                <View style={{ borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: unitInnerBg, paddingBottom: 8 }}>
                                  <View style={{ marginLeft: 12, marginRight: 10, marginTop: 8, paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: timelineColor, gap: 4 }}>
                                    {lessons.map((lesson, lessonIdx) => {
                                      const detailKey = `${unitIdx}-${lessonIdx}`;
                                      const currentType = lesson.lesson_type || 'lesson';
                                      const refDate = lesson.cadence_metadata?.reference_date || lesson.reference_date || lesson.suggested_date || lesson.date_text || null;
                                      const detailsOpen = expandedDraftLessonDetailKeys.has(detailKey);
                                      const patchCadence = (partial) => {
                                        const curL = (draftData || manualDraft)?.units?.[unitIdx]?.lessons?.[lessonIdx];
                                        if (!curL) return;
                                        const cur = curL.cadence_metadata || {};
                                        updateDraftLesson(unitIdx, lessonIdx, 'cadence_metadata', { ...cur, ...partial });
                                      };

                                      const lessonMenuKey = detailKey;
                                      const lessonMenuOpen = draftBuilderLessonMenuKey === lessonMenuKey;
                                      const rowPrefixPad = Platform.OS === 'web' ? 40 : 52;

                                      return (
                                        <View
                                          key={lesson.temp_id || lessonIdx}
                                          style={{
                                            paddingVertical: 4,
                                            paddingRight: 4,
                                            borderTopWidth: lessonIdx > 0 ? 1 : 0,
                                            borderTopColor: 'rgba(15,23,42,0.06)',
                                            paddingTop: lessonIdx > 0 ? 8 : 0,
                                            ...(Platform.OS !== 'web' && lessonMenuOpen
                                              ? { zIndex: 60, elevation: 20 }
                                              : {}),
                                          }}
                                          {...(Platform.OS === 'web'
                                            ? {
                                                onDragOver: (ev) => {
                                                  ev?.preventDefault?.();
                                                },
                                                onDrop: (ev) => {
                                                  ev?.preventDefault?.();
                                                  const p = readDraftLessonDragPayload(ev);
                                                  if (!p) return;
                                                  if (p.fromUnit === unitIdx && p.fromLesson === lessonIdx) return;
                                                  moveDraftLessonToUnit(p.fromUnit, p.fromLesson, unitIdx, lessonIdx);
                                                },
                                              }
                                            : {})}
                                        >
                                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            {Platform.OS === 'web' ? (
                                              <View
                                                draggable
                                                onDragStart={(ev) => {
                                                  try {
                                                    const dt = ev?.nativeEvent?.dataTransfer ?? ev?.dataTransfer;
                                                    if (dt?.setData) {
                                                      dt.setData(
                                                        DRAFT_LESSON_DRAG_MIME,
                                                        JSON.stringify({ fromUnit: unitIdx, fromLesson: lessonIdx }),
                                                      );
                                                      dt.effectAllowed = 'move';
                                                    }
                                                  } catch (_) {}
                                                }}
                                                style={{
                                                  paddingVertical: 6,
                                                  paddingHorizontal: 2,
                                                  justifyContent: 'center',
                                                  ...(Platform.OS === 'web' ? { cursor: 'grab' } : {}),
                                                }}
                                                accessibilityLabel={s('planMyYear.multiSubjectUnits.draftDragLessonA11y')}
                                              >
                                                <GripVertical size={16} color={MUTED} />
                                              </View>
                                            ) : (
                                              <View style={{ alignItems: 'center', justifyContent: 'center', gap: 0, paddingRight: 2 }}>
                                                <TouchableOpacity
                                                  onPress={() => moveDraftLesson(unitIdx, lessonIdx, -1)}
                                                  disabled={lessonIdx === 0}
                                                  style={{ padding: 2 }}
                                                  accessibilityLabel={s('planMyYear.multiSubjectUnits.draftReorderA11y')}
                                                  {...(Platform.OS === 'web' && { cursor: lessonIdx === 0 ? 'default' : 'pointer', title: 'Move up' })}
                                                >
                                                  <ChevronUp size={14} color={lessonIdx === 0 ? '#e5e7eb' : MUTED} />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                  onPress={() => moveDraftLesson(unitIdx, lessonIdx, 1)}
                                                  disabled={lessonIdx === lessons.length - 1}
                                                  style={{ padding: 2 }}
                                                  accessibilityLabel={s('planMyYear.multiSubjectUnits.draftReorderA11y')}
                                                  {...(Platform.OS === 'web' && { cursor: lessonIdx === lessons.length - 1 ? 'default' : 'pointer', title: 'Move down' })}
                                                >
                                                  <ChevronDown size={14} color={lessonIdx === lessons.length - 1 ? '#e5e7eb' : MUTED} />
                                                </TouchableOpacity>
                                              </View>
                                            )}
                                            <Text style={{ color: MUTED, fontSize: 14, fontWeight: '700', width: 12, textAlign: 'center', marginRight: 2 }}>•</Text>
                                            <TextInput
                                              style={[styles.input, { flex: 1, fontSize: 14, paddingVertical: 6, paddingHorizontal: 8, minWidth: 0 }]}
                                              value={lesson.title || ''}
                                              onChangeText={(v) => updateDraftLesson(unitIdx, lessonIdx, 'title', v)}
                                              placeholder="Lesson title"
                                              placeholderTextColor={MUTED}
                                              onFocus={() => {
                                                setExpandedDraftLessonDetailKeys((prev) => {
                                                  const n = new Set(prev);
                                                  n.add(detailKey);
                                                  return n;
                                                });
                                              }}
                                              {...(Platform.OS === 'web' && { cursor: 'text' })}
                                            />
                                            <TouchableOpacity
                                              onPress={() => {
                                                setExpandedDraftLessonDetailKeys((prev) => {
                                                  const n = new Set(prev);
                                                  if (n.has(detailKey)) n.delete(detailKey);
                                                  else n.add(detailKey);
                                                  return n;
                                                });
                                              }}
                                              style={{ padding: 4 }}
                                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                              accessibilityLabel={detailsOpen ? 'Hide lesson details' : 'Show lesson details'}
                                              {...(Platform.OS === 'web' && { cursor: 'pointer', title: detailsOpen ? 'Hide details' : 'Type and date' })}
                                            >
                                              {detailsOpen ? <ChevronUp size={18} color={MUTED} /> : <ChevronDown size={18} color={MUTED} />}
                                            </TouchableOpacity>
                                            <View style={{ position: 'relative', zIndex: 15 }}>
                                              <TouchableOpacity
                                                onPress={(e) => {
                                                  setDraftBuilderUnitMenuKey(null);
                                                  if (Platform.OS === 'web') {
                                                    const prevKey = draftBuilderLessonMenuKey;
                                                    const closing = prevKey === lessonMenuKey;
                                                    if (closing) {
                                                      setWebDraftLessonMenuLayout(null);
                                                      setDraftBuilderMovePickKey(null);
                                                      setDraftBuilderLessonMenuKey(null);
                                                      return;
                                                    }
                                                    setDraftBuilderMovePickKey(null);
                                                    const el =
                                                      e?.currentTarget ||
                                                      e?.nativeEvent?.currentTarget ||
                                                      e?.nativeEvent?.target;
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
                                                }}
                                                style={{ padding: 4 }}
                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                accessibilityLabel={s('planMyYear.multiSubjectUnits.draftLessonMore')}
                                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                              >
                                                <MoreVertical size={16} color={MUTED} />
                                              </TouchableOpacity>
                                              {lessonMenuOpen && Platform.OS !== 'web' ? (
                                                <View
                                                  style={{
                                                    position: 'absolute',
                                                    right: 0,
                                                    top: '100%',
                                                    marginTop: 4,
                                                    minWidth: 220,
                                                    backgroundColor: BG,
                                                    borderRadius: 10,
                                                    borderWidth: 1,
                                                    borderColor: BORDER,
                                                    paddingVertical: 4,
                                                    zIndex: 2000,
                                                    ...(Platform.OS === 'web'
                                                      ? { boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }
                                                      : { elevation: 8 }),
                                                  }}
                                                >
                                                  {draftBuilderMovePickKey === lessonMenuKey ? (
                                                    <>
                                                      <TouchableOpacity
                                                        onPress={() => setDraftBuilderMovePickKey(null)}
                                                        style={{ paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: BORDER }}
                                                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                                      >
                                                        <Text style={{ fontSize: 13, fontWeight: '600', color: ACCENT }}>
                                                          {s('planMyYear.multiSubjectUnits.draftMoveLessonBack')}
                                                        </Text>
                                                      </TouchableOpacity>
                                                      {units.map((uOpt, oi) =>
                                                        oi !== unitIdx ? (
                                                          <TouchableOpacity
                                                            key={uOpt.temp_id || `u-${oi}`}
                                                            onPress={() => moveDraftLessonToUnit(unitIdx, lessonIdx, oi, null)}
                                                            style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                                                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                                          >
                                                            <Text style={{ fontSize: 14, color: FG }} numberOfLines={2}>
                                                              {uOpt.title?.trim() || `Unit ${oi + 1}`}
                                                            </Text>
                                                          </TouchableOpacity>
                                                        ) : null,
                                                      )}
                                                    </>
                                                  ) : (
                                                    <>
                                                      <TouchableOpacity
                                                        onPress={() => insertUnitBreakAboveLesson(unitIdx, lessonIdx)}
                                                        style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                                                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                                      >
                                                        <Text style={{ fontSize: 14, color: FG }}>{s('planMyYear.multiSubjectUnits.draftInsertUnitBreakAbove')}</Text>
                                                      </TouchableOpacity>
                                                      <TouchableOpacity
                                                        onPress={() => moveDraftLessonToNewUnit(unitIdx, lessonIdx)}
                                                        style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                                                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                                      >
                                                        <Text style={{ fontSize: 14, color: FG }}>{s('planMyYear.multiSubjectUnits.draftMoveLessonToNewUnit')}</Text>
                                                      </TouchableOpacity>
                                                      {units.length > 1 ? (
                                                        <TouchableOpacity
                                                          onPress={() => setDraftBuilderMovePickKey(lessonMenuKey)}
                                                          style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                                                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                                        >
                                                          <Text style={{ fontSize: 14, color: FG }}>{s('planMyYear.multiSubjectUnits.draftMoveLessonToUnit')}</Text>
                                                        </TouchableOpacity>
                                                      ) : null}
                                                      <TouchableOpacity
                                                        onPress={() => {
                                                          deleteDraftLesson(unitIdx, lessonIdx);
                                                          setDraftBuilderLessonMenuKey(null);
                                                          setDraftBuilderMovePickKey(null);
                                                        }}
                                                        style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                                                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                                      >
                                                        <Text style={{ fontSize: 14, color: ERROR }}>{s('planMyYear.multiSubjectUnits.draftDeleteLesson')}</Text>
                                                      </TouchableOpacity>
                                                    </>
                                                  )}
                                                </View>
                                              ) : null}
                                            </View>
                                          </View>
                                          {isParsedFromTextDraft ? (() => {
                                            const si = lessonGlobalIdx;
                                            lessonGlobalIdx += 1;
                                            if (!cadenceYieldsInstructionalSlots || !lessonSchedulePreviewPlan.hasCurriculumMapping) {
                                              return null;
                                            }
                                            const slotAt = flatLessonSlotTimes[si];
                                            const label = slotAt
                                              ? `→ ${slotAt.dateLabel}, ${slotAt.timeLabel}`
                                              : `→ ${availSlotLblParsed}`;
                                            return (
                                              <Text style={{ marginLeft: rowPrefixPad, marginTop: 4, fontSize: 12, color: MUTED, lineHeight: 18 }}>{label}</Text>
                                            );
                                          })() : null}
                                          {detailsOpen && (
                                            <View style={{ marginTop: 8, marginLeft: rowPrefixPad, gap: 8 }}>
                                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                                {['lesson', ...DRAFT_EXTRA_TYPES].map((type) => (
                                                  <TouchableOpacity
                                                    key={type}
                                                    onPress={() => updateDraftLesson(unitIdx, lessonIdx, 'lesson_type', type)}
                                                    style={{
                                                      paddingHorizontal: 10,
                                                      paddingVertical: 5,
                                                      borderRadius: 8,
                                                      backgroundColor: currentType === type ? ACCENT_LIGHT : BG,
                                                      borderWidth: 1,
                                                      borderColor: currentType === type ? ACCENT : BORDER,
                                                    }}
                                                    accessibilityRole="button"
                                                    accessibilityState={{ selected: currentType === type }}
                                                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                                  >
                                                    <Text
                                                      style={{
                                                        fontSize: 12,
                                                        fontWeight: '600',
                                                        color: currentType === type ? ACCENT : MUTED,
                                                        ...(type !== 'lesson' ? { textTransform: 'capitalize' } : {}),
                                                      }}
                                                    >
                                                      {type === 'lesson' ? s('terminology.lesson') : type}
                                                    </Text>
                                                  </TouchableOpacity>
                                                ))}
                                              </View>
                                              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                                <Text style={[styles.smallLabel, { fontSize: 12, color: FG, minWidth: 88 }]}>{s('planMyYear.multiSubjectUnits.draftLessonReferenceDate')}</Text>
                                                {Platform.OS === 'web' ? (
                                                  <input
                                                    type="date"
                                                    className={WEB_REF_DATE_INPUT_CLASS}
                                                    value={refDate || ''}
                                                    onChange={(e) => {
                                                      const dateValue = e.target.value || null;
                                                      patchCadence({ reference_date: dateValue });
                                                    }}
                                                    style={{
                                                      padding: '6px 8px',
                                                      borderRadius: '6px',
                                                      border: '1px solid #d1d5db',
                                                      fontSize: 12,
                                                      fontWeight: '500',
                                                      color: FG,
                                                      backgroundColor: '#fff',
                                                      fontFamily: WEB_INPUT_FONT_FAMILY,
                                                    }}
                                                  />
                                                ) : (
                                                  <TextInput
                                                    style={[
                                                      styles.input,
                                                      {
                                                        width: 130,
                                                        paddingVertical: 6,
                                                        fontSize: 12,
                                                        fontWeight: '500',
                                                        color: FG,
                                                      },
                                                    ]}
                                                    value={refDate || ''}
                                                    onChangeText={(v) => patchCadence({ reference_date: v || null })}
                                                    placeholder="YYYY-MM-DD"
                                                    placeholderTextColor={MUTED}
                                                  />
                                                )}
                                              </View>
                                            </View>
                                          )}
                                        </View>
                                      );
                                    })}
                                    {Platform.OS === 'web' ? (
                                      <View
                                        style={{
                                          minHeight: 14,
                                          marginTop: 6,
                                          marginBottom: 4,
                                          borderRadius: 6,
                                          backgroundColor: 'rgba(15,23,42,0.04)',
                                        }}
                                        onDragOver={(ev) => ev?.preventDefault?.()}
                                        onDrop={(ev) => {
                                          ev?.preventDefault?.();
                                          const p = readDraftLessonDragPayload(ev);
                                          if (!p) return;
                                          moveDraftLessonToUnit(p.fromUnit, p.fromLesson, unitIdx, null);
                                        }}
                                      />
                                    ) : null}
                                    <TouchableOpacity
                                      onPress={() => addDraftLesson(unitIdx)}
                                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingTop: 10, gap: 6 }}
                                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                    >
                                      <Plus size={16} color={ACCENT} />
                                      <Text style={{ fontSize: 14, fontWeight: '600', color: ACCENT }}>{s('planMyYear.multiSubjectUnits.addLessonLink')}</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              )}
                            </View>
                          );
                        });
                        })()}
                      </View>

                      {/* Add unit — inline, same family as Add lesson */}
                      <TouchableOpacity
                        onPress={() => {
                          const currentD = draftData || manualDraft;
                          const newUnits = [...(currentD?.units || [])];
                          const newUnit = {
                            temp_id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                            title: `Unit ${newUnits.length + 1}`,
                            sequence_index: newUnits.length + 1,
                            lessons: [],
                          };
                          newUnits.push(newUnit);
                          if (draftData) {
                            setDraftData({ ...draftData, units: newUnits });
                          } else if (manualDraft) {
                            setManualDraft({ ...manualDraft, units: newUnits });
                          }
                          setExpandedUnits(new Set([...expandedUnits, newUnits.length - 1]));
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, marginTop: 12, gap: 6 }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Plus size={16} color={ACCENT} />
                        <Text style={{ fontSize: 14, fontWeight: '600', color: ACCENT }}>{s('planMyYear.multiSubjectUnits.addUnitLink')}</Text>
                      </TouchableOpacity>
                    </>
                  );
                }
                
                // Input mode based on planSource
                if (planSource === 'upload' && unitStructureStep === 'input') {
                  if (parsing) {
                    return (
                      <View>
                        {unitSubjectBanner}
                        <Text style={[styles.unitStructureModalTitle, { marginBottom: 8 }]}>Upload material</Text>
                        <Text style={[styles.mutedText, { marginBottom: 16 }]}>
                          {t('planMyYear.multiSubjectUnits.uploadParsingSubtitle')}
                        </Text>
                        <View
                          style={{
                            borderRadius: 10,
                            padding: 14,
                            minHeight: 280,
                            backgroundColor: '#f8fafc',
                            borderWidth: 1,
                            borderColor: '#e2e8f0',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '600', color: TEXT_SECONDARY, marginBottom: 8 }}>
                            {t('planMyYear.multiSubjectUnits.importStreamAssistantLabel')}
                          </Text>
                          <ScrollView
                            style={{ flexGrow: 0, maxHeight: 232 }}
                            contentContainerStyle={{ paddingBottom: 4 }}
                            keyboardShouldPersistTaps="handled"
                          >
                            <Text style={{ fontSize: 15, lineHeight: 22, color: '#0f172a' }}>
                              {importParseStreamPreview
                                ? importParseStreamPreview
                                : t('planMyYear.multiSubjectUnits.importStreamWaiting')}
                            </Text>
                          </ScrollView>
                        </View>
                        {unitStructureError ? (
                          <View style={{ marginTop: 12, padding: 12, backgroundColor: '#fee2e2', borderRadius: 8 }}>
                            <Text style={{ fontSize: 14, color: ERROR }}>{unitStructureError}</Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  }
                  return (
                    <View>
                      {unitSubjectBanner}
                      <Text style={[styles.unitStructureModalTitle, { marginBottom: 8 }]}>Upload material</Text>
                      <Text style={[styles.mutedText, { marginBottom: 16 }]}>Select a material to parse into curriculum structure.</Text>
                      {loadingMaterials ? (
                        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                          <ActivityIndicator size="small" color={ACCENT} />
                          <Text style={[styles.mutedText, { marginTop: 8 }]}>Loading materials...</Text>
                        </View>
                      ) : (
                        <View>
                          <Text style={[styles.label, { marginBottom: 8 }]}>Select material</Text>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              width: '100%',
                              marginBottom: 0,
                            }}
                          >
                          <TouchableOpacity
                            ref={materialButtonRef}
                            {...(Platform.OS === 'web' && { 'data-plan-year-upload-material': 'true' })}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              borderWidth: 1,
                              borderColor: BORDER,
                              borderRadius: 8,
                              backgroundColor: BG,
                              minHeight: 40,
                            }}
                            onPress={() => {
                              const willShow = !showMaterialDropdown;
                              if (willShow && Platform.OS === 'web') {
                                const calculatePosition = () => {
                                  let node = materialButtonRef.current?._nativeNode || materialButtonRef.current;
                                  if (!node?.getBoundingClientRect) {
                                    const sel = typeof document !== 'undefined' && document.querySelector?.('[data-plan-year-upload-material="true"]');
                                    if (sel) node = sel;
                                  }
                                  if (node?.getBoundingClientRect) {
                                    const rect = node.getBoundingClientRect();
                                    const maxH = 300;
                                    const spaceBelow = (typeof window !== 'undefined' ? window.innerHeight : 0) - rect.bottom;
                                    const spaceAbove = rect.top;
                                    if (spaceBelow < 200 && spaceAbove > spaceBelow) {
                                      setMaterialDropdownPosition({ top: rect.top - Math.min(maxH, spaceAbove - 10), left: rect.left, width: Math.max(rect.width, 200), maxHeight: Math.min(maxH, spaceAbove - 10) });
                                    } else {
                                      setMaterialDropdownPosition({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 200), maxHeight: Math.min(maxH, spaceBelow - 10) });
                                    }
                                    return true;
                                  }
                                  return false;
                                };
                                if (!calculatePosition()) setTimeout(calculatePosition, 10);
                              }
                              setShowMaterialDropdown(willShow);
                            }}
                            disabled={loadingMaterials}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text style={[styles.radioLabel, !selectedMaterialId && { color: MUTED }]} numberOfLines={1}>
                              {selectedMaterialId
                                ? (materials.find(m => m.id === selectedMaterialId)?.title || materials.find(m => m.id === selectedMaterialId)?.provider_name || 'Select material...')
                                : 'Select material...'}
                            </Text>
                            <ChevronDown size={16} color={MUTED} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setShowAddMaterialForUpload(true)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: ACCENT,
                            }}
                            disabled={loadingMaterials}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Plus size={14} color={ACCENT} />
                            <Text
                              style={{
                                fontSize: 13,
                                color: ACCENT,
                                fontWeight: '500',
                                ...(Platform.OS === 'web' && {
                                  fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                }),
                              }}
                            >
                              Add New
                            </Text>
                          </TouchableOpacity>
                          </View>
                          {showMaterialDropdown && Platform.OS === 'web' && materialDropdownPosition.top > 0 && (() => {
                            let ReactDOM;
                            try { ReactDOM = require('react-dom'); } catch (_) {}
                            const dropdownContent = (
                              <View
                                style={{
                                  position: 'fixed',
                                  top: materialDropdownPosition.top,
                                  left: materialDropdownPosition.left,
                                  width: materialDropdownPosition.width || 200,
                                  backgroundColor: '#FFFFFF',
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  borderColor: 'rgba(15,23,42,0.08)',
                                  padding: 4,
                                  maxHeight: materialDropdownPosition.maxHeight || 300,
                                  zIndex: 99999,
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                }}
                              >
                                <ScrollView
                                  style={{ maxHeight: (materialDropdownPosition.maxHeight || 300) - 8 }}
                                  nestedScrollEnabled
                                  showsVerticalScrollIndicator={true}
                                >
                                  {materials.length === 0 ? (
                                    <Text style={[styles.mutedText, { padding: 12, fontSize: 13 }]}>No materials yet.</Text>
                                  ) : (
                                    materials.map((material) => (
                                      <TouchableOpacity
                                        key={material.id}
                                        style={{
                                          paddingVertical: 8,
                                          paddingHorizontal: 10,
                                          borderRadius: 4,
                                          backgroundColor: selectedMaterialId === material.id ? ACCENT_LIGHT : 'transparent',
                                        }}
                                        onPress={() => {
                                          setSelectedMaterialId(material.id);
                                          setShowMaterialDropdown(false);
                                        }}
                                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                      >
                                        <Text style={[styles.radioLabel, selectedMaterialId === material.id && { color: ACCENT, fontWeight: '600' }]}>
                                          {material.title || material.provider_name || 'Untitled Material'}
                                        </Text>
                                      </TouchableOpacity>
                                    ))
                                  )}
                                </ScrollView>
                              </View>
                            );
                            if (ReactDOM && typeof document !== 'undefined' && document.body) {
                              return ReactDOM.createPortal(dropdownContent, document.body);
                            }
                            return dropdownContent;
                          })()}
                        </View>
                      )}
                    </View>
                  );
                }
                
                // Paste plain text: Import & Extract interface
                if (planSource === 'paste_plain' && unitStructureStep === 'input') {
                  const runParsePlainTextPreview = async () => {
                    if (!availableSubject || !familyId || !rawText.trim()) {
                      setUnitStructureError(availableSubject ? 'Please paste some content to parse.' : 'Subject not found.');
                      return;
                    }
                    const pastedSnapshot = rawText;
                    setParsing(true);
                    setUnitStructureError(null);
                    setImportParseStreamPreview('');
                    let streamed = '';
                    try {
                      const { data, error: err } = await parsePlainTextStream(
                        {
                          subject_id: availableSubject?.id,
                          family_id: familyId,
                          subject_name: availableSubject?.name || '',
                          raw_text: pastedSnapshot.trim(),
                          source_title: sourceTitle.trim() || null,
                          source_type: sourceType === 'auto_detect' ? null : sourceType,
                          parse_mode: parseMode === 'auto_detect' ? null : parseMode,
                          detect_dates: detectDates,
                          preserve_source_headings: preserveHeadings,
                          ignore_policy_text: ignorePolicyText,
                          extract_assignments: extractAssignments,
                          extract_assessments: extractAssessments,
                          special_instructions: specialInstructionsParse.trim() || null,
                        },
                        {
                          onDelta: (chunk) => {
                            streamed += chunk;
                            setImportParseStreamPreview(buildImportStreamPreviewDisplay(streamed));
                          },
                        }
                      );
                      if (err || !data) {
                        setUnitStructureError(err?.message || 'Failed to parse content');
                        return;
                      }
                      setRawText(data.raw_text || pastedSnapshot);
                      setDraftData(data);
                      setUnitStructureStep('draft');
                      if (data.units && data.units.length > 0) {
                        setExpandedUnits(new Set([0]));
                      }
                    } catch (err) {
                      setUnitStructureError(err.message || 'Failed to parse content');
                    } finally {
                      setImportParseStreamPreview('');
                      setParsing(false);
                    }
                  };
                  const pasteHintLabel = importParseHintLabelFromKey(detectPastedStructureHintKey(rawText));
                  return (
                    <View>
                      {unitSubjectBanner}
                      {cadenceDifferentMethodBannerEl}
                      <Text style={[styles.unitStructureModalTitle, { marginBottom: 6 }]}>
                        {s('planMyYear.multiSubjectUnits.importFromTextTitle')}
                      </Text>
                      <Text style={[styles.mutedText, { marginBottom: 6, lineHeight: 20 }]}>
                        {s('planMyYear.multiSubjectUnits.importFromTextIntro')}
                      </Text>

                      <View style={{ gap: 14 }}>
                        <View style={{ paddingBottom: 2 }}>
                          <Text style={[styles.mutedText, { fontSize: 12, fontWeight: '600', marginBottom: 6 }]}>
                            {s('planMyYear.multiSubjectUnits.importPasteTipTitle')}
                          </Text>
                          <Text style={[styles.mutedText, { fontSize: 12, lineHeight: 18 }]}>
                            {`• ${s('planMyYear.multiSubjectUnits.importPasteTipBulletUnit')}\n• ${s('planMyYear.multiSubjectUnits.importPasteTipBulletLesson')}\n• ${s('planMyYear.multiSubjectUnits.importPasteTipBulletSchedule')}`}
                          </Text>
                        </View>

                        {!parsing ? (
                          <View
                            style={{
                              borderRadius: 10,
                              padding: pasteTextFlash ? 2 : 0,
                              backgroundColor: pasteTextFlash ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                            }}
                          >
                            <TextInput
                              style={[styles.input, { minHeight: 280, textAlignVertical: 'top', fontSize: 15, lineHeight: 22 }]}
                              placeholder={
                                'Week 1: Fractions\nLesson 1: Intro to fractions\nLesson 2: Equivalent fractions\n\nWeek 2:\nLesson 3: Fractions on a number line'
                              }
                              placeholderTextColor={MUTED}
                              value={rawText}
                              onChangeText={(v) => {
                                if (Platform.OS === 'web' && v.length - prevRawTextLenRef.current > 35) {
                                  setPasteTextFlash(true);
                                  setTimeout(() => setPasteTextFlash(false), 480);
                                }
                                prevRawTextLenRef.current = v.length;
                                setRawText(v);
                              }}
                              multiline
                              numberOfLines={14}
                              editable
                              {...(Platform.OS === 'web' && { cursor: 'text' })}
                            />
                          </View>
                        ) : (
                          <View
                            style={{
                              borderRadius: 10,
                              padding: 14,
                              minHeight: 280,
                              backgroundColor: '#f8fafc',
                              borderWidth: 1,
                              borderColor: '#e2e8f0',
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '600', color: TEXT_SECONDARY, marginBottom: 8 }}>
                              {t('planMyYear.multiSubjectUnits.importStreamAssistantLabel')}
                            </Text>
                            <ScrollView
                              style={{ flexGrow: 0, maxHeight: 232 }}
                              contentContainerStyle={{ paddingBottom: 4 }}
                              keyboardShouldPersistTaps="handled"
                            >
                              <Text style={{ fontSize: 15, lineHeight: 22, color: '#0f172a' }}>
                                {importParseStreamPreview
                                  ? importParseStreamPreview
                                  : t('planMyYear.multiSubjectUnits.importStreamWaiting')}
                              </Text>
                            </ScrollView>
                          </View>
                        )}

                        {!parsing && rawText.trim().length >= 14 && pasteHintLabel ? (
                          <Text style={{ fontSize: 13, color: TEXT_SECONDARY, lineHeight: 18 }}>
                            {s('planMyYear.multiSubjectUnits.pasteDetectedPrefix')} {pasteHintLabel}
                          </Text>
                        ) : null}

                        {unitStructureError && (
                          <View style={{ padding: 12, backgroundColor: '#fee2e2', borderRadius: 8 }}>
                            <Text style={{ fontSize: 14, color: ERROR }}>{unitStructureError}</Text>
                          </View>
                        )}

                        <TouchableOpacity
                          onPress={runParsePlainTextPreview}
                          style={[styles.primaryButton, { width: '100%', alignSelf: 'stretch', marginTop: 4 }]}
                          disabled={parsing || !rawText.trim()}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          {parsing ? (
                            <>
                              <ActivityIndicator size="small" color={BG} style={{ marginRight: 8 }} />
                              <Text style={styles.primaryButtonText}>
                                {t('planMyYear.multiSubjectUnits.importPreviewStructureLoading')}
                              </Text>
                            </>
                          ) : (
                            <Text style={styles.primaryButtonText}>{t('planMyYear.multiSubjectUnits.importPreviewStructure')}</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }
                
                // Generate mode: free-form notes + planning context (schedule, students, slots) sent to API
                if (planSource === 'generate' && unitStructureStep === 'input') {
                  return (
                    <View>
                      {unitSubjectBanner}
                      {cadenceDifferentMethodBannerEl}
                      <Text style={[styles.unitStructureModalTitle, { marginBottom: 8 }]}>Generate curriculum</Text>
                      <Text style={[styles.mutedText, { marginBottom: 14, lineHeight: 20 }]}>
                        {t('planMyYear.multiSubjectUnits.generateCurriculumIntro')}
                      </Text>
                      <TextInput
                        style={[styles.input, { minHeight: 320, textAlignVertical: 'top', fontSize: 15, lineHeight: 22 }]}
                        placeholder={t('planMyYear.multiSubjectUnits.generateCurriculumFreeFormPlaceholder')}
                        placeholderTextColor={MUTED}
                        value={generationScope}
                        onChangeText={setGenerationScope}
                        multiline
                        numberOfLines={16}
                        editable={!generating}
                        {...(Platform.OS === 'web' && { cursor: 'text' })}
                      />
                      {generating || generateStreamStatus || generateStreamPreview ? (
                        <View
                          style={{
                            marginTop: 12,
                            padding: 12,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: '#E2E8F0',
                            backgroundColor: '#F8FAFC',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: FG, marginBottom: 6 }}>
                            Generation progress
                          </Text>
                          <Text style={{ fontSize: 13, color: TEXT_SECONDARY, lineHeight: 19 }}>
                            {generateStreamStatus || 'Drafting curriculum...'}
                          </Text>
                          {generateStreamPreview ? (
                            <Text style={{ marginTop: 8, fontSize: 13, color: FG, lineHeight: 20 }}>
                              {generateStreamPreview}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                      {unitStructureError && (
                        <View style={{ marginTop: 12, padding: 12, backgroundColor: '#fee2e2', borderRadius: 8 }}>
                          <Text style={{ fontSize: 14, color: ERROR }}>{unitStructureError}</Text>
                        </View>
                      )}
                    </View>
                  );
                }
                
                // Paste mode: Full Manual Builder (useEffect hydrates manualDraft from saved unitStructureData when present).
                if (planSource === 'paste' && unitStructureStep === 'input' && !draftData) {
                  if (!manualDraft) {
                    return (
                      <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                        <ActivityIndicator size="small" color={ACCENT} />
                        <Text style={[styles.mutedText, { marginTop: 12, textAlign: 'center' }]}>
                          {s('planMyYear.multiSubjectUnits.loadingCurriculum')}
                        </Text>
                      </View>
                    );
                  }

                  return (
                    <View>
                      {unitSubjectBanner}
                      {cadenceDifferentMethodBannerEl}
                      <Text style={[styles.unitStructureModalTitle, { marginBottom: 8 }]}>Add unit manually</Text>
                      
                      {/* Tip banner */}
                      <View style={{ padding: 12, backgroundColor: '#f0f9ff', borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#bae6fd' }}>
                        <Text style={{ fontSize: 12, color: '#0369a1', lineHeight: 16 }}>
                          <Text style={{ fontWeight: '600' }}>Tip:</Text> Add optional reference dates from your syllabus to see how units correlate to your planner.
                        </Text>
                      </View>
                      
                      {/* Units list */}
                      {(manualDraft.units || []).map((unit, uIdx) => (
                        <View key={unit.temp_id || uIdx} style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 8, backgroundColor: BG, marginBottom: 16, overflow: 'hidden' }}>
                          {/* Unit header */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: expandedUnitIndexManual === uIdx ? 1 : 0, borderBottomColor: BORDER }}>
                            <TouchableOpacity
                              onPress={() => setExpandedUnitIndexManual(expandedUnitIndexManual === uIdx ? -1 : uIdx)}
                              style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}
                              activeOpacity={0.7}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              {expandedUnitIndexManual === uIdx ? <ChevronUp size={18} color={MUTED} /> : <ChevronDown size={18} color={MUTED} />}
                              <Text
                                style={[styles.unitStructureModalTitle, { fontSize: 15, textTransform: 'none', letterSpacing: 0 }]}
                              >
                                {unit.title || `Unit ${uIdx + 1}`}
                              </Text>
                              <Text style={[styles.mutedText, { fontSize: 13 }]}>({(unit.lessons || []).length})</Text>
                            </TouchableOpacity>
                            {manualDraft.units.length > 1 && (
                              <TouchableOpacity
                                onPress={() => deleteDraftUnit(uIdx)}
                                style={{ padding: 4 }}
                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                              >
                                <Trash2 size={18} color={ERROR} />
                              </TouchableOpacity>
                            )}
                          </View>
                          
                          {/* Expanded unit body */}
                          {expandedUnitIndexManual === uIdx && (
                            <View style={{ padding: 16, gap: 16 }}>
                              <View>
                                <Text style={[styles.label, { marginBottom: 8 }]}>Unit title</Text>
                                <TextInput
                                  style={styles.input}
                                  value={unit.title || ''}
                                  onChangeText={(v) => updateDraftUnit(uIdx, 'title', v)}
                                  placeholder={`Unit ${uIdx + 1}`}
                                  placeholderTextColor={MUTED}
                                  {...(Platform.OS === 'web' && { cursor: 'text' })}
                                />
                              </View>
                              
                              <View>
                                <Text style={[styles.label, { marginBottom: 8 }]}>Description (optional)</Text>
                                <TextInput
                                  style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                                  value={unit.description || ''}
                                  onChangeText={(v) => updateDraftUnit(uIdx, 'description', v)}
                                  placeholder="Optional unit description..."
                                  placeholderTextColor={MUTED}
                                  multiline
                                  numberOfLines={2}
                                  {...(Platform.OS === 'web' && { cursor: 'text' })}
                                />
                              </View>
                              
                              <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}
                                onPress={() => addDraftLesson(uIdx)}
                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                              >
                                <Plus size={16} color={ACCENT} />
                                <Text style={{ fontSize: 14, fontWeight: '600', color: ACCENT }}>{s('planMyYear.multiSubjectUnits.addLessonLink')}</Text>
                              </TouchableOpacity>
                              
                              {/* Lessons */}
                              {(unit.lessons || []).map((lesson, lIdx) => (
                                <View key={lesson.temp_id || lIdx} style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 12, gap: 12 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                                    <View style={{ flex: 1, gap: 12 }}>
                                      <TextInput
                                        style={styles.input}
                                        value={lesson.title || ''}
                                        onChangeText={(v) => updateDraftLesson(uIdx, lIdx, 'title', v)}
                                        placeholder="Lesson title"
                                        placeholderTextColor={MUTED}
                                        {...(Platform.OS === 'web' && { cursor: 'text' })}
                                      />
                                      
                                      <View style={{ flexDirection: 'row', gap: 16 }}>
                                        <View>
                                          <Text style={[styles.smallLabel, { marginBottom: 4 }]}>Duration (min)</Text>
                                          <TextInput
                                            style={[styles.input, { width: 70 }]}
                                            value={String(lesson.minutes_est ?? 60)}
                                            onChangeText={(v) => updateDraftLesson(uIdx, lIdx, 'minutes_est', v ? parseInt(v, 10) : null)}
                                            keyboardType="number-pad"
                                            placeholder="60"
                                            placeholderTextColor={MUTED}
                                            {...(Platform.OS === 'web' && { cursor: 'text' })}
                                          />
                                        </View>
                                        
                                        <View>
                                          <Text style={[styles.smallLabel, { marginBottom: 4 }]}>Reference date (optional)</Text>
                                          {Platform.OS === 'web' ? (
                                            <input
                                              type="date"
                                              className={WEB_REF_DATE_INPUT_CLASS}
                                              value={lesson.reference_date || ''}
                                              onChange={(e) => updateDraftLesson(uIdx, lIdx, 'reference_date', e.target.value || null)}
                                              style={{
                                                width: 120,
                                                padding: '8px',
                                                borderRadius: '8px',
                                                border: '1px solid #d1d5db',
                                                fontSize: 12,
                                                fontWeight: '500',
                                                color: FG,
                                                backgroundColor: '#fff',
                                                fontFamily: WEB_INPUT_FONT_FAMILY,
                                              }}
                                            />
                                          ) : (
                                            <TextInput
                                              style={[styles.input, { width: 120 }]}
                                              value={lesson.reference_date || ''}
                                              onChangeText={(v) => updateDraftLesson(uIdx, lIdx, 'reference_date', v || null)}
                                              placeholder="YYYY-MM-DD"
                                              placeholderTextColor={MUTED}
                                            />
                                          )}
                                          <Text style={[styles.smallLabel, { fontSize: 10, color: MUTED, marginTop: 2 }]}>From syllabus; connects to planner</Text>
                                        </View>
                                      </View>
                                      
                                      <View>
                                        <Text style={[styles.smallLabel, { marginBottom: 8 }]}>Type</Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                          <View style={{ flexDirection: 'row', gap: 8 }}>
                                            {LESSON_TYPES.map((t) => (
                                              <TouchableOpacity
                                                key={t}
                                                style={[
                                                  {
                                                    paddingHorizontal: 12,
                                                    paddingVertical: 6,
                                                    borderRadius: 16,
                                                    borderWidth: 1,
                                                    borderColor: (lesson.lesson_type || 'lesson') === t ? ACCENT : BORDER,
                                                    backgroundColor: (lesson.lesson_type || 'lesson') === t ? ACCENT_LIGHT : BG,
                                                  },
                                                ]}
                                                onPress={() => updateDraftLesson(uIdx, lIdx, 'lesson_type', t)}
                                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                              >
                                                <Text style={[styles.radioLabel, { fontSize: 12, color: (lesson.lesson_type || 'lesson') === t ? ACCENT : MUTED, textTransform: 'capitalize' }]}>
                                                  {t}
                                                </Text>
                                              </TouchableOpacity>
                                            ))}
                                          </View>
                                        </ScrollView>
                                      </View>
                                    </View>
                                    
                                    <View style={{ gap: 8, alignItems: 'center' }}>
                                      <TouchableOpacity
                                        onPress={() => moveDraftLesson(uIdx, lIdx, -1)}
                                        disabled={lIdx === 0}
                                        style={{ padding: 4 }}
                                        {...(Platform.OS === 'web' && { cursor: lIdx === 0 ? 'not-allowed' : 'pointer' })}
                                      >
                                        <ChevronUp size={18} color={lIdx === 0 ? '#ccc' : MUTED} />
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        onPress={() => moveDraftLesson(uIdx, lIdx, 1)}
                                        disabled={lIdx === (unit.lessons || []).length - 1}
                                        style={{ padding: 4 }}
                                        {...(Platform.OS === 'web' && { cursor: lIdx === (unit.lessons || []).length - 1 ? 'not-allowed' : 'pointer' })}
                                      >
                                        <ChevronDown size={18} color={lIdx === (unit.lessons || []).length - 1 ? '#ccc' : MUTED} />
                                      </TouchableOpacity>
                                      {(unit.lessons || []).length > 1 && (
                                        <TouchableOpacity
                                          onPress={() => deleteDraftLesson(uIdx, lIdx)}
                                          style={{ padding: 4 }}
                                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                        >
                                          <Trash2 size={16} color={ERROR} />
                                        </TouchableOpacity>
                                      )}
                                    </View>
                                  </View>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      ))}
                      
                      {/* Add unit — inline, same as Add lesson */}
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, marginTop: 8, gap: 6 }}
                        onPress={() => {
                          const newUnits = [...(manualDraft.units || [])];
                          const newUnit = {
                            temp_id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                            title: `Unit ${newUnits.length + 1}`,
                            sequence_index: newUnits.length + 1,
                            description: null,
                            lessons: [],
                          };
                          newUnits.push(newUnit);
                          setManualDraft({ ...manualDraft, units: newUnits });
                          setExpandedUnitIndexManual(newUnits.length - 1);
                        }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Plus size={16} color={ACCENT} />
                        <Text style={{ fontSize: 14, fontWeight: '600', color: ACCENT }}>{s('planMyYear.multiSubjectUnits.addUnitLink')}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }
                
                // If placeholders or no data, show empty state
                return (
                  <View style={{ paddingVertical: 48, paddingHorizontal: 8, alignItems: 'stretch' }}>
                    {unitSubjectBanner}
                    {cadenceDifferentMethodBannerEl}
                    <Text style={[styles.mutedText, { fontSize: 14, textAlign: 'center' }]}>
                      {planSource === 'placeholders' 
                        ? 'No unit structure needed for cadence-only plans.'
                        : 'Select a method in step 1 to build curriculum structure.'}
                    </Text>
                  </View>
                );
              })()}
            </ScrollView>
      {renderWebDraftLessonMenuPortal()}
      {renderWebDraftUnitMenuPortal()}
    </>
  );

  /** Subject-detail links (Manual input, Paste, etc.) should show unit structure full-screen, not logistics behind a nested modal. */
  const inlineUnitStructureFromSubjectDetail = Boolean(fromSubjectDetail && initialUnitStructureMethod);

  /** Flush/square corners only when embedded in the planner (`renderInline`). Overlay modals (Library, toolbar, etc.) keep `styles.modal` rounding. */
  const useModalFlatLf =
    renderInline &&
    ((PLAN_MY_YEAR_LOGISTICS_FIRST && !pickerOnly) || showYourPlansList) &&
    !subjectDetailOverlayChrome;

  const modalContent = (
    <TouchableOpacity
      style={[
        styles.modal,
        useModalFlatLf ? styles.modalFlatLf : null,
        (renderInline && { flex: 1, minHeight: 0, width: '100%', maxWidth: '100%', alignSelf: 'stretch' }) || {},
        /* Inline YOUR PLANS: full width of planner column — do not apply pickerModal (maxWidth 640). */
        pickerOnly && !(renderInline && showYourPlansList) && styles.pickerModal,
        showYourPlansList && styles.pickerModalPlanSummary,
        (pickerOnly || showYourPlansList) &&
          !(renderInline && showYourPlansList) &&
          (Platform.OS === 'web' ? { boxShadow: '0 10px 25px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.05)' } : { shadowOpacity: 0.08, elevation: 4 }),
        planSummaryYearId && renderInline && showYourPlansList && styles.modalPlanSummaryColumn,
      ]}
      activeOpacity={1}
      onPress={() => {}}
    >
          {subjectDetailOverlayChrome && PLAN_MY_YEAR_LOGISTICS_FIRST && !showPlanEditingModeBanner ? (
            <View style={styles.subjectDetailPlanCloseBar} accessibilityRole="toolbar">
              <TouchableOpacity
                onPress={(e) => {
                  if (Platform.OS === 'web' && e?.stopPropagation) e.stopPropagation();
                  onClose();
                }}
                style={styles.subjectDetailPlanCloseCircle}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Close"
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <X size={16} color="#0f172a" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          ) : null}
          {!pickerOnly && !PLAN_MY_YEAR_LOGISTICS_FIRST ? (
          <View style={styles.modalHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
            {PLAN_MY_YEAR_LOGISTICS_FIRST ? null : (
            <View style={styles.breadcrumbRow}>
              {editingFromSummary ? (
                <>
                  <Text style={[styles.breadcrumbStep, planStep === 'logistics' && styles.breadcrumbStepCurrent]}>Edit</Text>
                  <Text style={[styles.breadcrumbSeparator]}>{'  -->  '}</Text>
                  <Text style={[styles.breadcrumbStep, planStep === 'preview' && styles.breadcrumbStepCurrent]}>Review</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.breadcrumbStep, planStep === 'source' && styles.breadcrumbStepCurrent]}>1. Method</Text>
                  <Text style={[styles.breadcrumbSeparator]}>{'  ·  '}</Text>
                  <Text style={[styles.breadcrumbStep, planStep === 'unit_structure' && styles.breadcrumbStepCurrent]}>2. Unit Structure</Text>
                  <Text style={[styles.breadcrumbSeparator]}>{'  ·  '}</Text>
                  <Text style={[styles.breadcrumbStep, planStep === 'logistics' && styles.breadcrumbStepCurrent]}>3. Logistics</Text>
                  <Text style={[styles.breadcrumbSeparator]}>{'  ·  '}</Text>
                  <Text style={[styles.breadcrumbStep, planStep === 'preview' && styles.breadcrumbStepCurrent]}>4. Review</Text>
                </>
              )}
            </View>
            )}
            {unitHeaderSubtitle ? (
              <Text style={[styles.modalHeaderMeta, { marginTop: 6 }]} numberOfLines={2}>
                {unitHeaderSubtitle}
              </Text>
            ) : null}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButtonHeader} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
              <X size={22} color={FG} />
            </TouchableOpacity>
          </View>
          ) : null}
          {planSummaryYearId ? (
            <ScrollView
              style={[styles.content, renderInline && showYourPlansList && styles.planSummaryScrollFlex]}
              contentContainerStyle={[
                styles.planSummaryContentContainer,
                renderInline && showYourPlansList && styles.planSummaryContentGrow,
              ]}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.pickerBody}>
                {planSummaryError ? (
                  <>
                    <View style={[styles.pickerHeader, styles.planSummaryHeaderRow, styles.planSummaryPadded]}>
                      <Text style={styles.planSummaryModalTitle}>Plan summary</Text>
                    </View>
                    <View style={styles.planSummaryDividerFullWrap}>
                      <View style={styles.planSummaryDividerFull} />
                    </View>
                    <View style={[styles.errorBox, styles.planSummaryPadded]}>
                      <Text style={styles.errorText}>{planSummaryError}</Text>
                      <TouchableOpacity onPress={goBackPlanSummaryToList} style={{ marginTop: 12 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                        <Text style={{ fontSize: 14, color: ACCENT, fontWeight: '600' }}>Back to list</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : planSummaryData ? (() => {
                  const data = planSummaryData;
                  const planStart = data.plan?.start_date || data.start_date || '';
                  const planEnd = data.plan?.end_date || data.end_date || '';
                  const blocks = Array.isArray(data.plan?.blocks) ? data.plan.blocks : [];
                  const childIds = Array.from(new Set(blocks.flatMap((b) => b.child_ids || []).filter(Boolean)));
                  const subjectIds = Array.from(new Set(blocks.map((b) => b.subject_id).filter(Boolean)));
                  const assigneeNames = childIds.length > 0
                    ? childIds.map((id) => children.find((c) => String(c.id) === String(id))?.first_name || children.find((c) => String(c.id) === String(id))?.name || 'Child').filter(Boolean)
                    : (blocks.length > 0 ? ['Whole family'] : []);
                  const subjectNames = subjectIds.map((id) => baseSubjectList.find((s) => String(s.id) === String(id))?.name).filter(Boolean);
                  const planSlotLabelsForTitle = Array.isArray(data.plan?.plan_slot_labels) ? data.plan.plan_slot_labels : [];
                  const actualEvents = Array.isArray(planSummaryActualEvents) ? planSummaryActualEvents : [];
                  const actualEventUnitTopics = actualEvents
                    .map((ev) => String(ev?.unit || ev?.curriculum_unit_title || '').trim())
                    .filter(Boolean);
                  const unitTopics = [...new Set([
                    ...planSlotLabelsForTitle.map((l) => (l.unit || '').trim()).filter(Boolean),
                    ...actualEventUnitTopics,
                  ])];
                  const summaryTitleParts = [
                    assigneeNames.length ? assigneeNames.join(', ') : 'Whole family',
                    subjectNames.length ? subjectNames.join(', ') : 'No subject',
                    unitTopics.length ? unitTopics.join(', ') : null,
                    planStart && planEnd ? `${formatDateDisplay(planStart)} – ${formatDateDisplay(planEnd)}` : '',
                  ].filter(Boolean);
                  const summaryTitle = data.year_name || (summaryTitleParts.length > 0
                    ? summaryTitleParts.join(' · ')
                    : 'Academic year');
                  const p = data.plan || {};
                  const constraintMode = p.constraint_mode === 'hours' ? 'hours' : p.constraint_mode === 'days' ? 'days' : 'none';
                  const targetDays = p.target_days != null ? p.target_days : null;
                  const targetHours = p.target_hours != null ? p.target_hours : null;
                  const holidaySettings = data.holiday_settings || {};
                  const followPublic = holidaySettings.follow_global_holidays !== false;
                  const holidayCountry = holidaySettings.holiday_country_code || 'US';
                  const hasHolidays = !!data.holiday_settings;
                  const targetLabel = constraintMode === 'days' && targetDays != null ? `${targetDays} days` : constraintMode === 'hours' && targetHours != null ? `${targetHours} hours` : null;
                  const holidaysLabel = hasHolidays ? (followPublic ? `Public holidays: On (${holidayCountry})` : 'Public holidays: Off') : null;
                  const fieldWrap = { marginRight: 12, marginBottom: 12 };
                  const planSlotLabels = Array.isArray(data.plan?.plan_slot_labels) ? data.plan.plan_slot_labels : [];
                  const planEventDates = Array.isArray(data.plan?.plan_event_dates) ? data.plan.plan_event_dates : (Array.isArray(data.plan?.plan_slot_dates) ? data.plan.plan_slot_dates : []);
                  const eventExistsKey = (ymd, subjectId, startLocal) => {
                    const s = startLocal == null ? '' : String(startLocal).trim().replace(/^(\d):/, '0$1:');
                    return `${ymd}|${String(subjectId)}|${s}`;
                  };
                  const actualEventsByKey = new Map();
                  actualEvents.forEach((ev) => {
                    const sid = ev?.subject_id;
                    const startTs = ev?.start_ts;
                    if (!sid || !startTs) return;
                    const dt = new Date(startTs);
                    if (Number.isNaN(dt.getTime())) return;
                    const ymd = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
                    const startLocal = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
                    actualEventsByKey.set(eventExistsKey(ymd, sid, startLocal), ev);
                  });
                  const existingEventKeys = actualEventsByKey.size > 0
                    ? new Set(actualEventsByKey.keys())
                    : new Set(planEventDates.map((e) => eventExistsKey(e.date_ymd, e.subject_id, e.start_local || '')));
                  const summarySlotLines = (() => {
                    if (!planStart || !planEnd || blocks.length === 0) return [];
                    const exclusionRanges = [];
                    const lines = [];
                    blocks.forEach((block) => {
                      const subjectName = (baseSubjectList || []).find((s) => String(s.id) === String(block.subject_id))?.name || 'Subject';
                      const timeLabel = block.all_day ? 'All day' : formatTimeRange(block.start_time, block.end_time);
                      const startLocal = block.all_day ? null : (block.start_time || '09:00');
                      const dates = getBlockOccurrenceDates(block, planStart, planEnd, exclusionRanges);
                      dates.forEach((ymd) => {
                        const key = eventExistsKey(ymd, block.subject_id, startLocal);
                        if (existingEventKeys.size > 0 && !existingEventKeys.has(key)) return;
                        const line = {
                          date: ymd,
                          dateLabel: formatDateDisplay(ymd),
                          timeLabel,
                          subjectName,
                          subjectId: block.subject_id,
                          startLocal,
                          academicYearId: planSummaryYearId,
                        };
                        const actualEvent = actualEventsByKey.get(key);
                        if (actualEvent) {
                          const actualUnit = String(actualEvent.unit || actualEvent.curriculum_unit_title || '').trim();
                          const actualLesson = String(
                            actualEvent.lesson ||
                            actualEvent.curriculum_metadata?.lesson_label ||
                            actualEvent.title ||
                            ''
                          ).trim();
                          if (actualUnit) line.unitTopic = actualUnit;
                          if (actualEvent.is_placeholder) {
                            line.lessonTitle = s('planMyYear.multiSubjectUnits.availableInstructionalSlot');
                          } else if (actualLesson) {
                            line.lessonTitle = actualLesson;
                          }
                          if (actualEvent.id) line.eventId = actualEvent.id;
                        } else {
                          const label = planSlotLabels.find(
                            (l) => l.date_ymd === ymd && String(l.subject_id) === String(block.subject_id) && (startLocal == null ? l.start_local == null : (l.start_local === startLocal || (l.start_local && startLocal && l.start_local.replace(/^0/, '') === startLocal.replace(/^0/, ''))))
                          );
                          if (label) {
                            if ((label.unit || '').trim()) line.unitTopic = (label.unit || '').trim();
                            if ((label.lesson || '').trim()) line.lessonTitle = (label.lesson || '').trim();
                            if (label.open_plan_slot) {
                              line.lessonTitle = s('planMyYear.multiSubjectUnits.availableInstructionalSlot');
                            }
                          }
                          const matchingEvent = planEventDates.find((e) => eventExistsKey(e.date_ymd, e.subject_id, e.start_local) === key);
                          if (matchingEvent && matchingEvent.has_attachment) line.hasAttachment = true;
                          const evId = matchingEvent?.event_id ?? matchingEvent?.id;
                          if (evId) line.eventId = evId;
                        }
                        lines.push(line);
                      });
                    });
                    lines.sort((a, b) => a.date.localeCompare(b.date) || (a.timeLabel || '').localeCompare(b.timeLabel || ''));
                    return lines;
                  })();
                  const strikeSet = new Set(planSummaryStrikeKeys);
                  const ghostMap = planSummaryGhostLinesRef.current;
                  const mergedSlotLines = (() => {
                    const mergedMap = new Map();
                    for (const l of summarySlotLines) {
                      const k = eventExistsKey(l.date, l.subjectId, l.startLocal);
                      mergedMap.set(k, { ...l, _struck: strikeSet.has(k) });
                    }
                    for (const k of strikeSet) {
                      if (!mergedMap.has(k)) {
                        const g = ghostMap.get(k);
                        if (g) mergedMap.set(k, { ...g, _struck: true });
                      }
                    }
                    const out = Array.from(mergedMap.values());
                    out.sort((a, b) => a.date.localeCompare(b.date) || (a.timeLabel || '').localeCompare(b.timeLabel || ''));
                    return out;
                  })();
                  const summaryOverflowItems = subjectIds
                    .map((subjectId) => {
                      const curriculumData = planSummaryCurriculumBySubjectId[String(subjectId)];
                      const flatLessons = flattenUnitLessonsForPreview(curriculumData?.units || []);
                      if (!flatLessons.length) return null;
                      const preview = buildLessonSchedulePreviewRows(
                        mergedSlotLines,
                        flatLessons,
                        String(subjectId),
                        s('planMyYear.multiSubjectUnits.availableInstructionalSlot'),
                      );
                      if (!preview?.overflowCount) return null;
                      const extendEndYmd = findExtendedEndDateForLessonOverflow({
                        startDate: planStart,
                        endDate: planEnd,
                        overflowCount: preview.overflowCount,
                        curriculumSubjectId: String(subjectId),
                        blocks,
                        customHolidays: Array.isArray(data.holidays)
                          ? data.holidays
                              .filter((h) => (h.type || 'CUSTOM_HOLIDAY') === 'CUSTOM_HOLIDAY')
                              .map((h) => ({
                                date: typeof h.date === 'string' ? h.date.slice(0, 10) : String(h.date || '').slice(0, 10),
                                name: h.name || '',
                                type: 'CUSTOM_HOLIDAY',
                              }))
                          : [],
                        customBreaks: [],
                        baseSubjectList,
                        children,
                        allFamilyChildIds,
                      });
                      return {
                        subjectId: String(subjectId),
                        subjectName:
                          baseSubjectList.find((s) => String(s.id) === String(subjectId))?.name || 'Subject',
                        overflowCount: preview.overflowCount,
                        extendEndYmd,
                      };
                    })
                    .filter(Boolean);
                  return (
                    <>
                      <View style={[styles.planSummaryHeaderOuter, styles.planSummaryPadded]}>
                        <View style={styles.planSummaryTopRow}>
                        <TouchableOpacity
                          onPress={goBackPlanSummaryToList}
                          style={styles.planSummaryBackButton}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          accessibilityLabel="Back to plan list"
                        >
                          <ArrowLeft size={22} color={FG} strokeWidth={2.25} />
                        </TouchableOpacity>
                        <Text style={[styles.planSummaryModalTitle, styles.planSummaryTitleInRow]} numberOfLines={2}>
                          {summaryTitle}
                        </Text>
                        <View style={styles.planSummaryTopBarRight}>
                          <TouchableOpacity
                            onPress={() => {
                              setAcademicYearId(planSummaryYearId);
                              setPlanSummaryYearId(null);
                              setPlanSummaryData(null);
                              setPlanSummaryError(null);
                              setShowPlanManagerView(false);
                              setPlanStep('logistics');
                              setEditingFromSummary(true);
                            }}
                            style={styles.planSummaryPlainButton}
                            activeOpacity={0.85}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Pencil size={18} color="#6B7280" strokeWidth={2} />
                            <Text style={styles.planSummaryPlainButtonText}>Edit Plan</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setShowDeletePlanConfirm(true)}
                            disabled={deletingPlan}
                            style={[styles.planSummaryPlainButton, deletingPlan && styles.planSummaryPlainButtonDisabled]}
                            activeOpacity={0.85}
                            {...(Platform.OS === 'web' && { cursor: deletingPlan ? 'default' : 'pointer' })}
                          >
                            <Trash2 size={18} color="#6B7280" strokeWidth={2} />
                            <Text style={styles.planSummaryPlainButtonText}>Delete Plan</Text>
                          </TouchableOpacity>
                        </View>
                        </View>
                      </View>
                      <View style={styles.planSummaryDividerFullWrap}>
                        <View style={styles.planSummaryDividerFull} />
                      </View>
                      {summaryOverflowItems.length > 0 ? (
                        <View style={[styles.planSummaryPadded, { marginTop: 8, marginBottom: 6 }]}>
                          {summaryOverflowItems.map((item) => (
                            <View
                              key={`summary-overflow-${item.subjectId}`}
                              style={{
                                marginBottom: 8,
                                paddingVertical: 8,
                                paddingHorizontal: 12,
                                backgroundColor: ELIGIBILITY_CARD_BG,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: ELIGIBILITY_CARD_BORDER,
                              }}
                            >
                              <Text style={{ fontSize: 12, color: TEXT_SECONDARY, lineHeight: 17 }}>
                                <Text style={{ fontWeight: '600', color: FG }}>{item.subjectName}</Text>
                                <Text style={{ color: TEXT_SECONDARY }}>
                                  {` - ${t('planMyYear.multiSubjectUnits.lessonsOverflowPastRange', {
                                    count: item.overflowCount,
                                  })}`}
                                </Text>
                                {item.extendEndYmd ? (
                                  <Text style={{ color: TEXT_SECONDARY }}>
                                    {' '}
                                  </Text>
                                ) : null}
                                {item.extendEndYmd ? (
                                  <Text
                                    onPress={() => applyExtendedPlanEndDateFromSummary(item.extendEndYmd)}
                                    style={{ color: ACCENT, fontWeight: '600', textDecorationLine: 'underline' }}
                                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                  >
                                    {t('planMyYear.multiSubjectUnits.lessonsOverflowExtendCta', { endDate: formatDateDisplay(item.extendEndYmd) })}
                                  </Text>
                                ) : null}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      {mergedSlotLines.length > 0 ? (
                        <>
                          <View style={[styles.planSummaryPadded, { marginTop: 4, marginBottom: 8 }]}>
                            <Text style={styles.planSummaryDatesSectionLabel}>
                              {formatSubjectPlanHeading(assigneeNames, subjectNames)}
                            </Text>
                          </View>
                          <View style={styles.planSummaryDatesList}>
                            {mergedSlotLines.map((line) => {
                              const slotKey = eventExistsKey(line.date, line.subjectId, line.startLocal);
                              const struck = !!line._struck;
                              const dispatchOpenSlot = () => {
                                if (struck) return;
                                if (typeof window !== 'undefined') {
                                  const detail = {
                                    dateYmd: line.date,
                                    startLocal: line.startLocal,
                                    subjectId: line.subjectId,
                                    academicYearId: line.academicYearId,
                                    subjectName: line.subjectName,
                                  };
                                  if (__DEV__) console.log('[PlanYearModal] Dispatching openEventForPlanSlot', detail);
                                  window.dispatchEvent(new CustomEvent('openEventForPlanSlot', { detail }));
                                }
                              };
                              return (
                                <View key={slotKey} style={styles.planSummaryDateRow}>
                                  <View style={styles.planSummaryDateRowInner}>
                                    <TouchableOpacity
                                      style={styles.planSummaryDateRowTextWrap}
                                      onPress={dispatchOpenSlot}
                                      disabled={struck}
                                      activeOpacity={0.7}
                                      {...(Platform.OS === 'web' && {
                                        cursor: struck ? 'default' : 'pointer',
                                      })}
                                    >
                                      <Text
                                        style={[
                                          styles.planSummaryDateRowText,
                                          struck && styles.planSummaryDateRowTextStruck,
                                        ]}
                                        numberOfLines={2}
                                      >
                                        {line.dateLabel}
                                        {line.timeLabel ? ` · ${line.timeLabel}` : ''}
                                        {line.subjectName ? ` · ${line.subjectName}` : ''}
                                        {line.unitTopic ? ` · ${line.unitTopic}` : ''}
                                        {line.lessonTitle ? ` · ${line.lessonTitle}` : ''}
                                      </Text>
                                    </TouchableOpacity>
                                    <View style={styles.planSummaryDateRowActions}>
                                      {line.hasAttachment ? (
                                        <View style={styles.planSummaryDateRowAttachment}>
                                          <Paperclip size={14} color={struck ? PICKER_OR_COLOR : MUTED} strokeWidth={2} />
                                        </View>
                                      ) : null}
                                      {!struck ? (
                                        <>
                                          <TouchableOpacity
                                            style={styles.planSummaryRowActionBtn}
                                            onPress={(e) => {
                                              e?.stopPropagation?.();
                                              dispatchOpenSlot();
                                            }}
                                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                            {...(Platform.OS === 'web' && {
                                              cursor: 'pointer',
                                              onClick: (ev) => {
                                                ev.stopPropagation();
                                                ev.preventDefault();
                                                dispatchOpenSlot();
                                              },
                                            })}
                                            accessibilityLabel="Edit event"
                                          >
                                            <Pencil size={16} color="#475569" strokeWidth={2} />
                                          </TouchableOpacity>
                                          <TouchableOpacity
                                            style={styles.planSummaryRowActionBtn}
                                            onPress={(e) => {
                                              e?.stopPropagation?.();
                                              handlePlanSummaryRowDelete(line, slotKey);
                                            }}
                                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                            {...(Platform.OS === 'web' && {
                                              cursor: 'pointer',
                                              onClick: (ev) => {
                                                ev.stopPropagation();
                                                ev.preventDefault();
                                                handlePlanSummaryRowDelete(line, slotKey);
                                              },
                                            })}
                                            accessibilityLabel="Remove from calendar"
                                          >
                                            <Trash2 size={16} color="#475569" strokeWidth={2} />
                                          </TouchableOpacity>
                                        </>
                                      ) : (
                                        <TouchableOpacity
                                          style={styles.planSummaryRowActionBtn}
                                          onPress={(e) => {
                                            e?.stopPropagation?.();
                                            handlePlanSummaryRowRestore(line, slotKey);
                                          }}
                                          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                          {...(Platform.OS === 'web' && {
                                            cursor: 'pointer',
                                            onClick: (ev) => {
                                              ev.stopPropagation();
                                              ev.preventDefault();
                                              handlePlanSummaryRowRestore(line, slotKey);
                                            },
                                          })}
                                          accessibilityLabel="Restore event"
                                        >
                                          <RotateCcw size={16} color="#64748B" strokeWidth={2} />
                                        </TouchableOpacity>
                                      )}
                                    </View>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        </>
                      ) : null}
                    </>
                  );
                })() : null}
              </View>
            </ScrollView>
          ) : planStep === 'preview' && !(PLAN_MY_YEAR_LOGISTICS_FIRST && isHomeschool) ? (
            <View style={{ flex: 1, minHeight: 0 }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={true}>
                <View style={{ marginTop: 8, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: '700',
                      color: FG,
                      marginBottom: 6,
                      lineHeight: 22,
                      ...(Platform.OS === 'web' && {
                        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }),
                    }}
                  >
                    {t('planMyYear.cadenceConflicts.previewDominantTitle')}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: TEXT_SECONDARY,
                      marginBottom: lessonSchedulePreviewPlan.hasCurriculumMapping ? 4 : 12,
                      lineHeight: 18,
                    }}
                  >
                    {previewSlotLines.length} slot{previewSlotLines.length !== 1 ? 's' : ''} based on your date range and holidays & breaks.
                  </Text>
                  {lessonSchedulePreviewPlan.hasCurriculumMapping ? (
                    <Text style={{ fontSize: 12, color: MUTED, marginBottom: 10, lineHeight: 16 }}>
                      {s('planMyYear.multiSubjectUnits.lessonSchedulePreviewHeading')}
                    </Text>
                  ) : null}
                  <CadenceConflictsResolvedLine visible={cadenceConflictsResolvedFeedback} />
                  {lessonSchedulePreviewPlan.rows.map(({ line, detailLine }, idx) => {
                    const rowKey =
                      line.blockId && line.date ? `${line.date}|${String(line.blockId)}` : '';
                    const conflictDetail = rowKey ? previewLineConflictDetailsByKey.get(rowKey) ?? null : null;
                    return (
                      <CadencePreviewSlotRow
                        key={`ls-classic-${line.date}-${line.subjectId}-${idx}`}
                        line={line}
                        detailLine={detailLine}
                        conflictDetail={conflictDetail}
                        showResolvedTint={cadenceConflictsResolvedFeedback && !conflictDetail}
                        isLast={idx === lessonSchedulePreviewPlan.rows.length - 1}
                        onMoveRowPress={
                          conflictDetail?.suggestedTimeLabel
                            ? () => handleApplyCadenceRowFix(line)
                            : undefined
                        }
                      />
                    );
                  })}
                </View>
                <LessonOverflowFollowUp
                  textStyle={[styles.mutedText, { fontSize: 12, color: TEXT_SECONDARY }]}
                  overflowCount={lessonSchedulePreviewPlan.overflowCount}
                  extendEndYmd={lessonOverflowExtendEndDate}
                  curriculumSubjectId={lessonSchedulePreviewPlan.curriculumSubjectId}
                  hasCurriculumMapping={lessonSchedulePreviewPlan.hasCurriculumMapping}
                  onApplyExtend={applyExtendedPlanEndDate}
                  t={t}
                />
              </ScrollView>
            </View>
          ) : showEntryChoice ? (
            <View style={styles.entryChoiceBody}>
              <View style={styles.entryChoiceHeaderRow}>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={onClose} style={styles.closeButtonHeader} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                  <X size={22} color={FG} />
                </TouchableOpacity>
              </View>
              <Text style={styles.entryChoiceSubtitle}>Editing an existing plan or creating a new one?</Text>
              <TouchableOpacity
                onPress={() => setShowPlanManagerView(true)}
                style={styles.entryChoiceButtonSecondary}
                activeOpacity={0.85}
                {...(Platform.OS === 'web' && {
                  cursor: 'pointer',
                  onMouseEnter: () => setEntryChoiceHoverKey('edit'),
                  onMouseLeave: () => setEntryChoiceHoverKey(null),
                })}
              >
                <View style={styles.entryChoiceButtonInner}>
                  <Calendar size={20} color={SUB} style={styles.entryChoiceIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryChoiceButtonText}>Edit Existing Plan</Text>
                    <Text style={styles.entryChoiceButtonSubtext}>View and edit existing plans</Text>
                  </View>
                  {Platform.OS === 'web' && entryChoiceHoverKey === 'edit' && (
                    <ArrowRight size={18} color={SUB} style={{ marginLeft: 8 }} />
                  )}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setStartCreatingNew(true)}
                style={styles.entryChoiceButtonPrimary}
                activeOpacity={0.85}
                {...(Platform.OS === 'web' && {
                  cursor: 'pointer',
                  onMouseEnter: () => setEntryChoiceHoverKey('create'),
                  onMouseLeave: () => setEntryChoiceHoverKey(null),
                })}
              >
                <View style={styles.entryChoiceButtonInner}>
                  <Sparkles size={20} color="#FFFFFF" style={styles.entryChoiceIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryChoiceButtonTextPrimary}>Create New Plan</Text>
                    <Text style={styles.entryChoiceButtonSubtextPrimary}>Start with scope, then method and logistics</Text>
                  </View>
                  {Platform.OS === 'web' && entryChoiceHoverKey === 'create' && (
                    <ArrowRight size={18} color="rgba(255,255,255,0.9)" style={{ marginLeft: 8 }} />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          ) : showYourPlansList ? (
            <ScrollView
              style={[styles.content, renderInline && styles.planListScrollInline]}
              contentContainerStyle={[
                styles.planListContentContainer,
                renderInline && styles.planListContentContainerInline,
                editPlanListRows.length === 0 && styles.planListContentContainerEmpty,
              ]}
              showsVerticalScrollIndicator={false}
            >
              {previousPlansListFetched ? (
                <View style={styles.planYearGlanceHeaderWrap}>
                  <Text style={styles.planYearGlanceTitle}>{t('planMyYear.modal.editPlanTitle')}</Text>
                  <Text style={styles.planYearGlanceHelp}>{t('planMyYear.modal.editPlanListHelp')}</Text>
                </View>
              ) : null}
              {loadError && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{loadError}</Text>
                </View>
              )}
              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
              <View style={styles.pickerBody}>
                {!previousPlansListFetched && previousPlans.length === 0 ? (
                  <View style={{ minHeight: 80 }} />
                ) : editPlanListRows.length > 0 ? (
                  <>
                    <ScrollView
                      style={{ maxHeight: 320 }}
                      contentContainerStyle={{ paddingRight: 4, paddingBottom: 8 }}
                      showsVerticalScrollIndicator={true}
                      keyboardShouldPersistTaps="handled"
                    >
                      <View style={{ gap: 20 }}>
                      {editPlanListRows.map((ay) => {
                        const lines = parsePlanCardLines(ay);
                        const isSelected = planSummaryYearId === ay.id;
                        const timesLine = planListRowTimesById[ay.id] || '';
                        const cachedPlan = planSummaryCacheRef.current.get(ay.id);
                        const dotChildren = getPlanListRowChildrenForDots(cachedPlan, children, lines.line1);
                        return (
                          <TouchableOpacity
                            key={ay.id}
                            onPress={() => {
                              setPlanListContextMenu(null);
                              setPlanSummaryYearId(ay.id);
                            }}
                            style={[styles.planListItem, isSelected && styles.planListItemSelected]}
                            activeOpacity={0.85}
                            {...(Platform.OS === 'web' && {
                              cursor: 'pointer',
                              onContextMenu: (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const native = e.nativeEvent || e;
                                setPlanListContextMenu({
                                  x: native?.clientX ?? 0,
                                  y: native?.clientY ?? 0,
                                  planId: ay.id,
                                });
                              },
                            })}
                          >
                            <View style={styles.planListItemMainRow}>
                              <View style={styles.planListItemLeft}>
                                {lines.line2 ? <Text style={styles.planCardTitle} numberOfLines={1}>{lines.line2}</Text> : null}
                                {lines.line1 ? (
                                  <View style={[styles.planCardChildRow, lines.line2 ? { marginTop: 6 } : null]}>
                                    {dotChildren.length > 0 ? (
                                      <View style={styles.planCardChildrenDotsCluster}>
                                        {dotChildren.map((child, index) => (
                                          <View
                                            key={String(child.id)}
                                            style={[
                                              styles.planCardChildDot,
                                              {
                                                backgroundColor: getChildColorFromAvatar(child.avatar),
                                                marginLeft: index > 0 ? -4 : 0,
                                                zIndex: dotChildren.length - index,
                                              },
                                            ]}
                                          />
                                        ))}
                                      </View>
                                    ) : (
                                      <View
                                        style={[
                                          styles.planCardChildDot,
                                          { backgroundColor: getChildColorFromAvatar(null) },
                                        ]}
                                      />
                                    )}
                                    <Text style={styles.planCardOwner} numberOfLines={1}>{lines.line1}</Text>
                                  </View>
                                ) : null}
                              </View>
                              {(lines.line3 || timesLine) ? (
                                <View style={styles.planListItemRight}>
                                  {lines.line3 ? (
                                    <Text style={styles.planCardDateRight} numberOfLines={2}>{lines.line3}</Text>
                                  ) : null}
                                  {timesLine ? (
                                    <Text style={styles.planCardTimesSubline} numberOfLines={2}>{timesLine}</Text>
                                  ) : null}
                                </View>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                      </View>
                    </ScrollView>
                  </>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <Text style={styles.planYearGlanceHelp}>
                      {t('planMyYear.modal.emptyPlanListZeroRowsHint')}{' '}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setShowPlanManagerView(false);
                        setStartCreatingNew(true);
                        setPlanStep(getInitialPlanStep(PLAN_MY_YEAR_LOGISTICS_FIRST));
                      }}
                      accessibilityRole="link"
                      accessibilityLabel={t('planMyYear.modal.emptyPlanListStartBuildingLink')}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      activeOpacity={0.7}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text
                        style={[
                          styles.planYearGlanceHelp,
                          { color: ACCENT, fontWeight: '600', textDecorationLine: 'underline' },
                        ]}
                      >
                        {t('planMyYear.modal.emptyPlanListStartBuildingLink')}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.planYearGlanceHelp}>.</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          ) : planStep === 'source' ? (
            <ScrollView style={styles.content} contentContainerStyle={[styles.contentContainer, styles.sourceStepContent]} showsVerticalScrollIndicator={false}>
              <View>
                {PLAN_MY_YEAR_LOGISTICS_FIRST && unitStructureBlockedByCadence ? (
                  <View
                    style={{
                      marginBottom: 18,
                      paddingVertical: 14,
                      paddingHorizontal: 14,
                      backgroundColor: 'rgba(245, 158, 11, 0.1)',
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: 'rgba(245, 158, 11, 0.32)',
                    }}
                  >
                    <Text style={{ fontSize: 14, color: FG, lineHeight: 20, fontWeight: '600' }}>
                      Set days & times to unlock this step.
                    </Text>
                    <Text style={{ fontSize: 13, color: MUTED, marginTop: 6, lineHeight: 18 }}>
                      Add your weekly pattern under Logistics first, then you can attach units to those slots here.
                    </Text>
                    <TouchableOpacity
                      onPress={dispatchContentFirstUnitsFlow}
                      style={{ marginTop: 12, alignSelf: 'flex-start' }}
                      activeOpacity={0.75}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text style={{ fontSize: 13, color: ACCENT, fontWeight: '600', textDecorationLine: 'underline' }}>
                        Skip scheduling and build units only →
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {PLAN_MY_YEAR_LOGISTICS_FIRST && effectiveSubjectIds.length > 1 && !initialSubjectId && (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={[styles.label, { marginBottom: 6 }]}>{s('planMyYear.multiSubjectUnits.subjectPickerTitle')}</Text>
                    <Text style={[styles.mutedText, { marginBottom: 10, fontSize: 13, lineHeight: 18 }]}>
                      {s('planMyYear.multiSubjectUnits.subjectPickerHint')}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {effectiveSubjectIds.map((sid) => {
                        const subj = baseSubjectList.find((s) => String(s.id) === String(sid));
                        const name = subj?.name ?? 'Subject';
                        const selected = String(unitFocusSubjectId) === String(sid);
                        return (
                          <TouchableOpacity
                            key={String(sid)}
                            onPress={() => setUnitFocusSubjectId(sid)}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={t('planMyYear.multiSubjectUnits.a11ySelectSubjectChip', { subjectName: name })}
                            style={{
                              paddingHorizontal: 14,
                              paddingVertical: 8,
                              borderRadius: 20,
                              borderWidth: 1,
                              borderColor: selected ? ACCENT : BORDER,
                              backgroundColor: selected ? ACCENT_LIGHT : BG,
                            }}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text style={{ fontSize: 14, fontWeight: selected ? '600' : '500', color: selected ? ACCENT : FG }}>
                              {name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
                {/* Set unit structure - method options */}
                <View style={{ gap: OPTION_GAP }}>
                  {/* Manual input */}
                  {(() => {
                    const key = 'paste';
                    const opt = STRINGS.planMyYear?.sections?.useASource?.options?.[key];
                    const label = opt?.label ?? 'Manual input';
                    const description = opt?.description ?? '';
                    const isSelected = planSource === key;
                    const isHover = Platform.OS === 'web' && hoverSourceKey === `unit-${key}` && !isSelected;
                    return (
                      <TouchableOpacity
                        onPress={() => {
                          if (unitStructureBlockedByCadence) return;
                          if (!ensureUnitSubjectForUnitStructure()) return;
                          suppressManualCurriculumHydrateRef.current = false;
                          setPlanSource('paste');
                          setDraftData(null);
                          setRawText('');
                          setUnitStructureStep('input');
                          setManualDraft(null);
                          setExpandedUnitIndexManual(0);
                          setExpandedUnits(new Set());
                          setPlanStep('unit_structure');
                        }}
                        activeOpacity={0.9}
                        style={[
                          styles.sourceOptionTile,
                          isSelected && styles.sourceOptionTileSelected,
                          isHover && styles.sourceOptionTileHover,
                          unitStructureBlockedByCadence && { opacity: 0.45 },
                        ]}
                        onMouseEnter={Platform.OS === 'web' ? () => setHoverSourceKey(`unit-${key}`) : undefined}
                        onMouseLeave={Platform.OS === 'web' ? () => setHoverSourceKey(null) : undefined}
                        {...(Platform.OS === 'web' && {
                          cursor: unitStructureBlockedByCadence ? 'not-allowed' : 'pointer',
                        })}
                      >
                        <View style={styles.sourceOptionIconWrap}>
                          <List size={18} color={MUTED} />
                        </View>
                        <View style={styles.sourceOptionBody}>
                          <Text style={styles.sourceOptionTitle}>{label}</Text>
                          {description ? (
                            <Text style={styles.sourceOptionDescription}>{description}</Text>
                          ) : null}
                        </View>
                        {isSelected && (
                          <View style={styles.sourceOptionCheckWrap}>
                            <Check size={18} color={BRAND_500} strokeWidth={2.5} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })()}
                  
                  {/* Paste plain text (import & extract — same description as manual input) */}
                  {(() => {
                    const key = 'pastePlain';
                    const opt = STRINGS.planMyYear?.sections?.useASource?.options?.[key];
                    const label = opt?.label ?? 'Paste plain text';
                    const description = opt?.description ?? STRINGS.planMyYear?.sections?.useASource?.options?.paste?.description ?? '';
                    const isSelected = planSource === 'paste_plain';
                    const isHover = Platform.OS === 'web' && hoverSourceKey === 'unit-paste_plain' && !isSelected;
                    return (
                      <TouchableOpacity
                        onPress={() => {
                          if (unitStructureBlockedByCadence) return;
                          if (!ensureUnitSubjectForUnitStructure()) return;
                          setManualDraft(null);
                          if (!hydrateImportDraftFromStorage(unitPipelineSubjectId, { requireSource: 'paste_plain' })) {
                            setPlanSource('paste_plain');
                            setDraftData(null);
                            setUnitStructureStep('input');
                            setRawText('');
                            setExpandedUnits(new Set());
                            setExpandedUnitIndexManual(0);
                          }
                          setPlanStep('unit_structure');
                        }}
                        activeOpacity={0.9}
                        style={[
                          styles.sourceOptionTile,
                          isSelected && styles.sourceOptionTileSelected,
                          isHover && styles.sourceOptionTileHover,
                          unitStructureBlockedByCadence && { opacity: 0.45 },
                        ]}
                        onMouseEnter={Platform.OS === 'web' ? () => setHoverSourceKey('unit-paste_plain') : undefined}
                        onMouseLeave={Platform.OS === 'web' ? () => setHoverSourceKey(null) : undefined}
                        {...(Platform.OS === 'web' && {
                          cursor: unitStructureBlockedByCadence ? 'not-allowed' : 'pointer',
                        })}
                      >
                        <View style={styles.sourceOptionIconWrap}>
                          <FileText size={18} color={MUTED} />
                        </View>
                        <View style={styles.sourceOptionBody}>
                          <Text style={styles.sourceOptionTitle}>{label}</Text>
                          {description ? (
                            <Text style={styles.sourceOptionDescription}>{description}</Text>
                          ) : null}
                        </View>
                        {isSelected && (
                          <View style={styles.sourceOptionCheckWrap}>
                            <Check size={18} color={BRAND_500} strokeWidth={2.5} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })()}
                  
                  {/* Upload material */}
                  {(() => {
                    const key = 'upload';
                    const opt = STRINGS.planMyYear?.sections?.useASource?.options?.[key];
                    const label = opt?.label ?? 'Upload material';
                    const description = opt?.description ?? '';
                    const isSelected = planSource === key;
                    const isHover = Platform.OS === 'web' && hoverSourceKey === `unit-${key}` && !isSelected;
                    return (
                      <TouchableOpacity
                        onPress={() => {
                          if (unitStructureBlockedByCadence) return;
                          if (!ensureUnitSubjectForUnitStructure()) return;
                          setManualDraft(null);
                          if (!hydrateImportDraftFromStorage(unitPipelineSubjectId, { requireSource: 'upload' })) {
                            setPlanSource('upload');
                            setDraftData(null);
                            setUnitStructureStep('input');
                            setRawText('');
                          }
                          setPlanStep('unit_structure');
                        }}
                        activeOpacity={0.9}
                        style={[
                          styles.sourceOptionTile,
                          isSelected && styles.sourceOptionTileSelected,
                          isHover && styles.sourceOptionTileHover,
                          unitStructureBlockedByCadence && { opacity: 0.45 },
                        ]}
                        onMouseEnter={Platform.OS === 'web' ? () => setHoverSourceKey(`unit-${key}`) : undefined}
                        onMouseLeave={Platform.OS === 'web' ? () => setHoverSourceKey(null) : undefined}
                        {...(Platform.OS === 'web' && {
                          cursor: unitStructureBlockedByCadence ? 'not-allowed' : 'pointer',
                        })}
                      >
                        <View style={styles.sourceOptionIconWrap}>
                          <Upload size={18} color={MUTED} />
                        </View>
                        <View style={styles.sourceOptionBody}>
                          <Text style={styles.sourceOptionTitle}>{label}</Text>
                          {description ? (
                            <Text style={styles.sourceOptionDescription}>{description}</Text>
                          ) : null}
                        </View>
                        {isSelected && (
                          <View style={styles.sourceOptionCheckWrap}>
                            <Check size={18} color={BRAND_500} strokeWidth={2.5} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })()}
                  
                  {/* Generate curriculum */}
                  {(() => {
                    const key = 'generate';
                    const label = 'Generate curriculum';
                    const description = 'AI will create structured units and lessons with objectives, materials, and pacing suggestions based on your subject and preferences.';
                    const isSelected = planSource === key;
                    const isHover = Platform.OS === 'web' && hoverSourceKey === `unit-${key}` && !isSelected;
                    return (
                      <TouchableOpacity
                        onPress={() => {
                          if (unitStructureBlockedByCadence) return;
                          if (!ensureUnitSubjectForUnitStructure()) return;
                          setPlanSource('generate');
                          setDraftData(null);
                          setManualDraft(null);
                          setUnitStructureStep('input');
                          setRawText('');
                          setPlanStep('unit_structure');
                        }}
                        activeOpacity={0.9}
                        style={[
                          styles.sourceOptionTile,
                          isSelected && styles.sourceOptionTileSelected,
                          isHover && styles.sourceOptionTileHover,
                          unitStructureBlockedByCadence && { opacity: 0.45 },
                        ]}
                        onMouseEnter={Platform.OS === 'web' ? () => setHoverSourceKey(`unit-${key}`) : undefined}
                        onMouseLeave={Platform.OS === 'web' ? () => setHoverSourceKey(null) : undefined}
                        {...(Platform.OS === 'web' && {
                          cursor: unitStructureBlockedByCadence ? 'not-allowed' : 'pointer',
                        })}
                      >
                        <View style={styles.sourceOptionIconWrap}>
                          <Sparkles size={18} color={MUTED} />
                        </View>
                        <View style={styles.sourceOptionBody}>
                          <Text style={styles.sourceOptionTitle}>{label}</Text>
                          <Text style={styles.sourceOptionDescription}>{description}</Text>
                        </View>
                        {isSelected && (
                          <View style={styles.sourceOptionCheckWrap}>
                            <Check size={18} color={BRAND_500} strokeWidth={2.5} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })()}
                  
                  {/* Skip to cadence link */}
                  <TouchableOpacity
                    onPress={() => {
                      setPlanSource('placeholders');
                      setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                    }}
                    style={{ marginTop: 8, paddingVertical: 8, alignItems: 'center' }}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={{ fontSize: 14, color: ACCENT, textDecorationLine: 'underline' }}>
                      Skip to just build a cadence
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          ) : planStep === 'unit_structure' &&
            (!PLAN_MY_YEAR_LOGISTICS_FIRST || inlineUnitStructureFromSubjectDetail) ? (
            renderPlanYearUnitStructureScroll()
          ) : (
            <>
          <ScrollView ref={scrollRef} style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
            {loadError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{loadError}</Text>
              </View>
            )}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            {showPlanEditingModeBanner && (
              <View style={styles.planEditingModeBanner}>
                <View style={styles.planEditingModeBannerInner}>
                  <View style={styles.planEditingModeBannerLeft}>
                    {academicYearId ? (
                      <TouchableOpacity
                        onPress={goBackFromLogisticsToPlanList}
                        activeOpacity={0.85}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={styles.planEditingModeBannerLink}>
                          {openForNewPlan ? '← Back to plan list' : '← Back'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View />
                    )}
                  </View>
                  <View style={styles.planEditingModeBannerCenter} pointerEvents="none">
                    <Text style={styles.planEditingModeBannerLabel}>Editing mode</Text>
                  </View>
                  <View style={styles.planEditingModeBannerRight}>
                    {subjectDetailOverlayChrome ? (
                      <TouchableOpacity
                        onPress={(e) => {
                          if (Platform.OS === 'web' && e?.stopPropagation) e.stopPropagation();
                          onClose();
                        }}
                        style={styles.subjectDetailPlanCloseCircle}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="Close"
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <X size={16} color="#0f172a" strokeWidth={2.5} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            )}
            {PLAN_MY_YEAR_LOGISTICS_FIRST && !hideStructuredClassPlansIntro && (
              <View style={styles.planYearGlanceHeaderWrap}>
                <Text style={styles.planYearGlanceTitle}>{t('planMyYear.modal.structuredClassPlansTitle')}</Text>
                <Text style={styles.planYearGlanceHelp}>{t('planMyYear.modal.structuredClassPlansHelp')}</Text>
              </View>
            )}
            {PLAN_MY_YEAR_LOGISTICS_FIRST && unitHeaderSubtitle ? (
              <Text style={[styles.modalHeaderMeta, { marginBottom: 12 }]} numberOfLines={2}>
                {unitHeaderSubtitle}
              </Text>
            ) : null}

            {/* Logistics step: always show form (no full-page blocking; plan summary shows loading inside card) */}
            {!isHomeschool ? (
              // Fast Path: Non-Homeschool
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Here's your year</Text>
                <Text style={styles.description}>
                  We've set up a default academic year (August 15 - June 15) with typical holidays.
                </Text>

                <TouchableOpacity style={styles.editButton}>
                  <Text style={styles.editButtonText}>Edit dates</Text>
                </TouchableOpacity>

                <View style={styles.settingRowInline}>
                    <Text style={styles.settingText}>Follow public holidays</Text>
                  <TouchableOpacity
                    style={[styles.customToggleTrack, followGlobalHolidays && styles.customToggleTrackOn]}
                    onPress={() => setFollowGlobalHolidays(!followGlobalHolidays)}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={[styles.customToggleThumb, followGlobalHolidays && styles.customToggleThumbOn]} />
                  </TouchableOpacity>
                </View>

              </View>
            ) : (
              // Homeschool Constraint Solver
              <View>
                <View style={{ marginBottom: 10 }}>
                <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                  <Text style={[styles.logisticsLabel]}>Subjects <Text style={{ color: ERROR }}>*</Text></Text>
                  {subjectsForCurrentSelection?.length === 0 && (
                    <Text style={{ fontSize: 13, color: MUTED, marginTop: 8 }}>No subjects yet — add subjects in your family settings.</Text>
                  )}
                  {subjectsForCurrentSelection?.length > 0 && (
                      <View style={[styles.childChips, styles.subjectsChipsRow, { marginTop: 8 }]}>
                        {subjectsForCurrentSelection.map((s) => {
                          const isSelected = selectedSubjectIds.includes(s.id);
                          const childIdsForDots =
                            Array.isArray(s.assignedChildren) && s.assignedChildren.length > 0
                              ? s.assignedChildren
                              : getChildIdsForSubject(s, children);
                          const childDots = childIdsForDots
                            .map((id) => children.find((c) => c && String(c.id) === String(id)))
                            .filter(Boolean);
                          return (
                            <TouchableOpacity
                              key={s.id}
                              style={[styles.childChip, isSelected && styles.childChipActive]}
                              onPress={() => {
                                if (isSelected) {
                                  setSelectedSubjectIds(selectedSubjectIds.filter((id) => id !== s.id));
                                } else {
                                  setSelectedSubjectIds([...selectedSubjectIds, s.id]);
                                }
                              }}
                            >
                              <View style={styles.subjectChipInnerRow}>
                                {childDots.length > 0 ? (
                                  <View style={styles.subjectChipDotsCluster} accessibilityLabel="Assigned students">
                                    {childDots.map((child, index) => {
                                      const childColor = getChildColorFromAvatar(child.avatar);
                                      return (
                                        <View
                                          key={String(child.id)}
                                          style={[
                                            styles.subjectChipChildDot,
                                            {
                                              backgroundColor: childColor,
                                              marginLeft: index > 0 ? -4 : 0,
                                              zIndex: childDots.length - index,
                                            },
                                          ]}
                                        />
                                      );
                                    })}
                                  </View>
                                ) : null}
                                <Text
                                  style={[styles.childChipText, isSelected && styles.childChipTextActive, styles.subjectChipLabelText]}
                                  numberOfLines={1}
                                >
                                  {s.name}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                  )}
                  {openForNewPlan && !academicYearId && existingPlansForSelectedSubjects.length > 0 ? (
                    <View
                      style={{
                        marginTop: 10,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        backgroundColor: ELIGIBILITY_CARD_BG,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: ELIGIBILITY_CARD_BORDER,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: FG, lineHeight: 18 }}>
                        {existingPlansForSelectedSubjects.length === 1
                          ? `A plan already exists for ${existingPlansForSelectedSubjects[0].matchedSubjectNames.join(', ')}. `
                          : `Plans already exist for ${existingPlansForSelectedSubjects
                              .flatMap((p) => p.matchedSubjectNames)
                              .filter(Boolean)
                              .slice(0, 3)
                              .join(', ')}. `}
                        <Text
                          onPress={() => {
                            const existingPlan = existingPlansForSelectedSubjects[0];
                            if (!existingPlan) return;
                            setStartCreatingNew(false);
                            setShowPlanManagerView(true);
                            setPlanSummaryData(existingPlan.cached || planSummaryCacheRef.current.get(existingPlan.id) || null);
                            setPlanSummaryError(null);
                            setPlanSummaryYearId(existingPlan.id);
                          }}
                          style={{ color: ACCENT, fontWeight: '600', textDecorationLine: 'underline' }}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          Open it in Edit Plan.
                        </Text>
                        <Text style={{ color: TEXT_SECONDARY }}> You can still continue building a new one.</Text>
                      </Text>
                    </View>
                  ) : null}
                </View>
                </View>

                <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                  <Text style={[styles.logisticsLabel]}>Date range <Text style={{ color: ERROR }}>*</Text></Text>
                  <View style={styles.dateRangeCard} onLayout={(e) => { datesSectionYRef.current = e.nativeEvent.layout.y; }}>
                  <View style={styles.dateRangeRow}>
                    <View style={styles.dateRangeSide}>
                      <TouchableOpacity onPress={() => { if (!startDate) return; const d = new Date(startDate + 'T12:00:00'); d.setDate(d.getDate() - 1); setStartDate(toLocalYYYYMMDD(d)); }} style={styles.dateRangeArrow} disabled={!startDate} {...(Platform.OS === 'web' && { cursor: startDate ? 'pointer' : 'default' })}>
                        <ChevronLeft size={20} color={startDate ? FG : MUTED} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.dateRangeDateWrap} onPress={() => { setStartDateCalendarMonth(startDate ? dateStringToDate(startDate) : new Date()); setShowStartDatePicker(true); }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                        <Text style={styles.dateRangeDate}>{startDate ? formatDateDisplay(startDate) : 'Select date'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { if (!startDate) return; const d = new Date(startDate + 'T12:00:00'); d.setDate(d.getDate() + 1); setStartDate(toLocalYYYYMMDD(d)); }} style={styles.dateRangeArrow} disabled={!startDate} {...(Platform.OS === 'web' && { cursor: startDate ? 'pointer' : 'default' })}>
                        <ChevronRight size={20} color={startDate ? FG : MUTED} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.dateRangeArrowLabel}>→</Text>
                    {mode === 'FIXED_END' ? (
                      <View style={styles.dateRangeSide}>
                        <TouchableOpacity onPress={() => { if (!endDate) return; const d = new Date(endDate + 'T12:00:00'); d.setDate(d.getDate() - 1); setEndDate(toLocalYYYYMMDD(d)); }} style={styles.dateRangeArrow} disabled={!endDate} {...(Platform.OS === 'web' && { cursor: endDate ? 'pointer' : 'default' })}>
                          <ChevronLeft size={20} color={endDate ? FG : MUTED} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.dateRangeDateWrap} onPress={() => { setEndDateCalendarMonth(endDate ? dateStringToDate(endDate) : new Date()); setShowEndDatePicker(true); }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Text style={styles.dateRangeDate}>{endDate ? formatDateDisplay(endDate) : 'Select date'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { if (!endDate) return; const d = new Date(endDate + 'T12:00:00'); d.setDate(d.getDate() + 1); setEndDate(toLocalYYYYMMDD(d)); }} style={styles.dateRangeArrow} disabled={!endDate} {...(Platform.OS === 'web' && { cursor: endDate ? 'pointer' : 'default' })}>
                          <ChevronRight size={20} color={endDate ? FG : MUTED} />
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                  </View>
                </View>

                {/* Target Days (TARGET_DAYS mode) */}
                {mode === 'TARGET_DAYS' && (
                  <View style={styles.inputGroup}>
                    <Text style={[styles.logisticsLabel]}>Target Instructional Days</Text>
                    <TextInput
                      style={[styles.input, focusedInput === 'targetDays' && styles.inputFocused]}
                      value={targetDays}
                      onChangeText={setTargetDays}
                      placeholder="180"
                      keyboardType="numeric"
                      placeholderTextColor={MUTED}
                      onFocus={() => setFocusedInput('targetDays')}
                      onBlur={() => setFocusedInput(null)}
                    />
                  </View>
                )}

                {/* Target Hours (TARGET_HOURS mode) */}
                {mode === 'TARGET_HOURS' && (
                  <>
                    <View style={styles.inputGroup}>
                      <Text style={[styles.logisticsLabel]}>Target Instructional Hours</Text>
                      <TextInput
                        style={[styles.input, focusedInput === 'targetHours' && styles.inputFocused]}
                        value={targetHours}
                        onChangeText={setTargetHours}
                        placeholder="1080"
                        keyboardType="numeric"
                        placeholderTextColor={MUTED}
                        onFocus={() => setFocusedInput('targetHours')}
                        onBlur={() => setFocusedInput(null)}
                      />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={[styles.logisticsLabel]}>Hours per Instructional Day</Text>
                      <TextInput
                        style={[styles.input, focusedInput === 'hoursPerDay' && styles.inputFocused]}
                        value={hoursPerDay}
                        onChangeText={setHoursPerDay}
                        placeholder="6.0"
                        keyboardType="decimal-pad"
                        placeholderTextColor={MUTED}
                        onFocus={() => setFocusedInput('hoursPerDay')}
                        onBlur={() => setFocusedInput(null)}
                      />
                    </View>
                  </>
                )}

                {/* Card 3: Planning Preferences — holidays/breaks summary-first, from settings vs added for this plan */}
                <View style={[styles.fieldSection, { marginTop: 8, marginBottom: 0 }]}>
                  <TouchableOpacity
                    style={styles.collapsibleSectionHeader}
                    onPress={() => setHolidaysCollapsed(!holidaysCollapsed)}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={[styles.fieldSectionLabel, { marginBottom: 0, fontSize: 12 }]}>{STRINGS.planMyYear?.sections?.breaks?.title ?? 'Planning Preferences'}</Text>
                    {holidaysCollapsed ? <ChevronDown size={20} color={MUTED} /> : <ChevronUp size={20} color={MUTED} />}
                  </TouchableOpacity>
                  {!holidaysCollapsed && (
                  <>
                  <View style={{ marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER_SUBTLE }}>
                    <Text style={[styles.logisticsLabel, { fontSize: 12, marginBottom: 6 }]}>Learning goals</Text>
                    <View style={[styles.radioRow, { flexWrap: 'wrap', marginBottom: 12 }]}>
                      <TouchableOpacity
                        style={[styles.radioOption, targetScopeFromSettings === 'overall' && styles.radioOptionActive]}
                        onPress={() => handlePlanningPrefsTargetScopeChange('overall')}
                        activeOpacity={0.85}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={[styles.radioLabel, targetScopeFromSettings === 'overall' && styles.radioLabelActive]}>Overall</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.radioOption, targetScopeFromSettings === 'per_subject' && styles.radioOptionActive]}
                        onPress={() => handlePlanningPrefsTargetScopeChange('per_subject')}
                        activeOpacity={0.85}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={[styles.radioLabel, targetScopeFromSettings === 'per_subject' && styles.radioLabelActive]}>Per subject</Text>
                      </TouchableOpacity>
                    </View>
                    {targetScopeFromSettings === 'overall' && (
                      <View>
                        <Text style={[styles.logisticsLabel, { fontSize: 12, marginBottom: 6 }]}>Target</Text>
                        <View style={[styles.radioRow, { flexWrap: 'wrap', alignItems: 'center', gap: 8 }]}>
                          <TouchableOpacity
                            style={[styles.radioOption, planConstraintMode === 'none' && styles.radioOptionActive]}
                            onPress={() => {
                              setPlanConstraintMode('none');
                              persistFamilyPlannerTargetsDebounced();
                            }}
                            activeOpacity={0.85}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text style={[styles.radioLabel, planConstraintMode === 'none' && styles.radioLabelActive]}>None</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.radioOption, planConstraintMode === 'days' && styles.radioOptionActive]}
                            onPress={() => {
                              setPlanConstraintMode('days');
                              persistFamilyPlannerTargetsDebounced();
                            }}
                            activeOpacity={0.85}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text style={[styles.radioLabel, planConstraintMode === 'days' && styles.radioLabelActive]}>
                              {STRINGS.planMyYear?.sections?.targets?.fields?.days ?? 'Days'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.radioOption, planConstraintMode === 'hours' && styles.radioOptionActive]}
                            onPress={() => {
                              setPlanConstraintMode('hours');
                              persistFamilyPlannerTargetsDebounced();
                            }}
                            activeOpacity={0.85}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text style={[styles.radioLabel, planConstraintMode === 'hours' && styles.radioLabelActive]}>
                              {STRINGS.planMyYear?.sections?.targets?.fields?.hours ?? 'Hours'}
                            </Text>
                          </TouchableOpacity>
                          {planConstraintMode === 'days' && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                              <TextInput
                                style={[styles.input, { width: 64, paddingVertical: 8, marginBottom: 0 }]}
                                value={planTargetDays}
                                onChangeText={(v) => {
                                  setPlanTargetDays(v);
                                  persistFamilyPlannerTargetsDebounced();
                                }}
                                keyboardType="number-pad"
                                placeholder="180"
                                placeholderTextColor={MUTED}
                              />
                              <Text style={{ fontSize: 12, color: MUTED }}>instructional days</Text>
                            </View>
                          )}
                          {planConstraintMode === 'hours' && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                              <TextInput
                                style={[styles.input, { width: 64, paddingVertical: 8, marginBottom: 0 }]}
                                value={planTargetHours}
                                onChangeText={(v) => {
                                  setPlanTargetHours(v);
                                  persistFamilyPlannerTargetsDebounced();
                                }}
                                keyboardType="decimal-pad"
                                placeholder="1000"
                                placeholderTextColor={MUTED}
                              />
                              <Text style={{ fontSize: 12, color: MUTED }}>hours</Text>
                              <Text style={{ fontSize: 12, color: MUTED }}>·</Text>
                              <TextInput
                                style={[styles.input, { width: 52, paddingVertical: 8, marginBottom: 0 }]}
                                value={hoursPerDay}
                                onChangeText={(v) => {
                                  setHoursPerDay(v);
                                  persistFamilyPlannerTargetsDebounced();
                                }}
                                keyboardType="decimal-pad"
                                placeholder="5"
                                placeholderTextColor={MUTED}
                              />
                              <Text style={{ fontSize: 12, color: MUTED }}>/ day</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    )}
                    {targetScopeFromSettings === 'per_subject' && (
                      <View style={{ marginTop: 4 }}>
                        <Text style={[styles.logisticsLabel, { fontSize: 12, marginBottom: 6 }]}>Subject targets</Text>
                        {effectiveSubjectIds.length === 0 ? (
                          <Text style={[styles.mutedText, { fontSize: 12, lineHeight: 18 }]}>
                            Select one or more subjects above to set targets per subject.
                          </Text>
                        ) : (
                          effectiveSubjectIds.map((subjectId) => {
                            const subj = baseSubjectList.find((s) => String(s.id) === String(subjectId));
                            const o = planSubjectTargetsOverride[subjectId];
                            const rowMode =
                              o?.mode ??
                              (subj?.default_constraint_mode ||
                                (subj?.default_target_days != null ? 'days' : subj?.default_target_hours != null ? 'hours' : 'none'));
                            const daysStr = o?.days ?? (subj?.default_target_days != null ? String(subj.default_target_days) : '');
                            const hoursStr = o?.hours ?? (subj?.default_target_hours != null ? String(subj.default_target_hours) : '');
                            const name = subj?.name || 'Subject';
                            const setRow = (merged) => {
                              setPlanSubjectTargetsOverride((p) => ({ ...p, [subjectId]: merged }));
                              schedulePersistSubjectPlanningTarget(subjectId, merged);
                            };
                            return (
                              <View
                                key={String(subjectId)}
                                style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}
                              >
                                <Text style={{ fontSize: 13, fontWeight: '600', color: FG, minWidth: 88 }} numberOfLines={1}>
                                  {name}
                                </Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <TouchableOpacity
                                    style={[styles.weekdayChipSmall, rowMode === 'none' && styles.weekdayChipSmallActive]}
                                    onPress={() => setRow({ mode: 'none', days: '', hours: '' })}
                                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                  >
                                    <Text style={[styles.weekdayChipSmallText, rowMode === 'none' && styles.weekdayChipSmallTextActive]}>None</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[styles.weekdayChipSmall, rowMode === 'days' && styles.weekdayChipSmallActive]}
                                    onPress={() => setRow({ mode: 'days', days: daysStr || '90', hours: '' })}
                                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                  >
                                    <Text style={[styles.weekdayChipSmallText, rowMode === 'days' && styles.weekdayChipSmallTextActive]}>Days</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[styles.weekdayChipSmall, rowMode === 'hours' && styles.weekdayChipSmallActive]}
                                    onPress={() => setRow({ mode: 'hours', days: '', hours: hoursStr || '120' })}
                                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                  >
                                    <Text style={[styles.weekdayChipSmallText, rowMode === 'hours' && styles.weekdayChipSmallTextActive]}>Hours</Text>
                                  </TouchableOpacity>
                                </View>
                                {rowMode === 'days' && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <TextInput
                                      style={[styles.input, { width: 56, paddingVertical: 6, marginBottom: 0 }]}
                                      value={daysStr}
                                      onChangeText={(v) => setRow({ mode: 'days', days: v, hours: '' })}
                                      keyboardType="number-pad"
                                      placeholder="90"
                                      placeholderTextColor={MUTED}
                                    />
                                    <Text style={{ fontSize: 12, color: MUTED }}>days</Text>
                                  </View>
                                )}
                                {rowMode === 'hours' && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <TextInput
                                      style={[styles.input, { width: 64, paddingVertical: 6, marginBottom: 0 }]}
                                      value={hoursStr}
                                      onChangeText={(v) => setRow({ mode: 'hours', days: '', hours: v })}
                                      keyboardType="decimal-pad"
                                      placeholder="120"
                                      placeholderTextColor={MUTED}
                                    />
                                    <Text style={{ fontSize: 12, color: MUTED }}>hours</Text>
                                  </View>
                                )}
                              </View>
                            );
                          })
                        )}
                      </View>
                    )}
                  </View>
                  <View style={[styles.settingRowInline, { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 10, flexWrap: 'wrap', gap: 10 }]}>
                    <TouchableOpacity
                      style={[styles.customToggleTrack, followGlobalHolidays && styles.customToggleTrackOn]}
                      onPress={() => setFollowGlobalHolidays(!followGlobalHolidays)}
                      activeOpacity={0.8}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <View style={[styles.customToggleThumb, followGlobalHolidays && styles.customToggleThumbOn]} />
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Text style={[styles.logisticsLabel, { marginBottom: 0, marginRight: 4, fontSize: 12 }]}>Follow </Text>
                      <TouchableOpacity
                        onPress={() => {
                          if (followGlobalHolidays) {
                            setShowPublicHolidaysPicker(true);
                            const start = startDate || new Date().toISOString().slice(0, 10);
                            let end = endDate;
                            if (!end) {
                              const e = new Date(start);
                              e.setFullYear(e.getFullYear() + 1);
                              end = e.toISOString().slice(0, 10);
                            }
                            setPublicHolidaysLoading(true);
                            getPublicHolidaysForRange(countryCode || 'US', start, end).then(({ data: res }) => {
                              setPublicHolidaysList(res?.holidays || []);
                              setPublicHolidaysLoading(false);
                            });
                          }
                        }}
                        activeOpacity={0.7}
                        style={{ flexDirection: 'row', alignItems: 'center' }}
                        {...(Platform.OS === 'web' && { cursor: followGlobalHolidays ? 'pointer' : 'default' })}
                      >
                        <Text style={[styles.logisticsLabel, { marginBottom: 0, fontSize: 12, color: followGlobalHolidays ? ACCENT : SUB, textDecorationLine: followGlobalHolidays ? 'underline' : 'none' }]}>U.S. public holidays</Text>
                      </TouchableOpacity>
                      <Text style={[styles.logisticsLabel, { marginBottom: 0, marginLeft: 4, fontSize: 12 }]}>?</Text>
                    </View>
                  </View>
                  {(exclusionsFromSettings.holidays.length + exclusionsFromSettings.breaks.length) > 0 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.logisticsLabel, { fontSize: 12, color: MUTED, marginBottom: 6 }]}>From Planning Preferences</Text>
                      {exclusionsFromSettings.holidays.map((h, i) => (
                        <View key={`s-h-${i}`} style={[styles.holidayItem, { backgroundColor: 'transparent' }]}>
                          <Text style={[styles.holidayDate, { fontSize: 12 }]}>{h.date}</Text>
                          <Text style={[styles.holidayName, { fontSize: 12 }]}>{h.name || 'Holiday'}</Text>
                        </View>
                      ))}
                      {exclusionsFromSettings.breaks.map((b, i) => (
                        <View key={`s-b-${i}`} style={[styles.holidayItem, { backgroundColor: 'transparent' }]}>
                          <Text style={[styles.holidayDate, { fontSize: 12 }]}>{b.start} – {b.end}</Text>
                          <Text style={[styles.holidayName, { fontSize: 12 }]}>{b.name || 'Break'}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {(planOnlyExclusions.holidays.length + planOnlyExclusions.breaks.length) > 0 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.logisticsLabel, { fontSize: 12, color: MUTED, marginBottom: 6 }]}>Added for this plan</Text>
                      {planOnlyExclusions.holidays.map((h, i) => {
                        const idx = customHolidays.findIndex((ch) => ch.date === (h.date || h.startDate) && (ch.name || '') === (h.name || ''));
                        return (
                          <View key={`p-h-${i}`} style={styles.holidayItem}>
                            <Text style={[styles.holidayDate, { fontSize: 12 }]}>{h.date}</Text>
                            <Text style={[styles.holidayName, { fontSize: 12 }]}>{h.name}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <TouchableOpacity onPress={async () => { try { await addExclusion({ family_id: familyId, scope_type: 'family_default', exclusion_type: 'holiday', start_date: h.date, end_date: h.date, label: h.name || '' }); const { settings, exclusions } = await getPlanDefaultsFromSettings(familyId); setPlanningDefaultsData({ settings, exclusions: exclusions || [] }); toast?.push?.('Saved to Planning Preferences', 'success'); } catch (e) { toast?.push?.(e?.message || 'Failed to save', 'error'); } }} style={{ padding: 4 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                                <Text style={{ fontSize: 12, color: ACCENT }}>Save to settings</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => idx >= 0 && removeCustomHoliday(idx)} style={styles.deleteButton}>
                                <Trash2 size={16} color={ERROR} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                      {planOnlyExclusions.breaks.map((b, i) => {
                        const idx = customBreaks.findIndex((cb) => (cb.start || cb.startDate) === b.start && (cb.end || cb.endDate) === b.end && (cb.name || '') === (b.name || ''));
                        return (
                          <View key={`p-b-${i}`} style={styles.holidayItem}>
                            <Text style={[styles.holidayDate, { fontSize: 12 }]}>{b.start} – {b.end}</Text>
                            <Text style={[styles.holidayName, { fontSize: 12 }]}>{b.name}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <TouchableOpacity onPress={async () => { try { await addExclusion({ family_id: familyId, scope_type: 'family_default', exclusion_type: 'break', start_date: b.start, end_date: b.end, label: b.name || '' }); const { settings, exclusions } = await getPlanDefaultsFromSettings(familyId); setPlanningDefaultsData({ settings, exclusions: exclusions || [] }); toast?.push?.('Saved to Planning Preferences', 'success'); } catch (e) { toast?.push?.(e?.message || 'Failed to save', 'error'); } }} style={{ padding: 4 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                                <Text style={{ fontSize: 12, color: ACCENT }}>Save to settings</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => idx >= 0 && removeCustomBreak(idx)} style={styles.deleteButton}>
                                <Trash2 size={16} color={ERROR} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                  <TouchableOpacity onPress={() => setShowAddExclusionForm(!showAddExclusionForm)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: showAddExclusionForm ? 8 : 0, gap: 6 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                    <Text style={[styles.logisticsLabel, { marginBottom: 0, fontSize: 12 }]}>Add custom breaks</Text>
                    {showAddExclusionForm ? <ChevronUp size={18} color={MUTED} /> : <ChevronDown size={18} color={MUTED} />}
                  </TouchableOpacity>
                  {showAddExclusionForm && (
                    <View style={{ marginTop: 8 }}>
                      <View style={[styles.inputGroup, { marginBottom: 10 }]}>
                        <Text style={[styles.mutedText, { marginBottom: 6, fontSize: 12 }]}>Day</Text>
                        <View style={styles.holidayInputRow}>
                          <TouchableOpacity style={[styles.datePickerTrigger, { flex: 1, marginRight: 8 }]} onPress={() => { setNewHolidayDateCalendarMonth(newHolidayDate ? dateStringToDate(newHolidayDate) : new Date()); setShowNewHolidayDatePicker(true); }}>
                            <Text style={[styles.datePickerTriggerText, !newHolidayDate && styles.datePickerPlaceholder]}>{newHolidayDate ? formatDateDisplay(newHolidayDate) : 'Date'}</Text>
                            <ChevronDown size={18} color={SUB} />
                          </TouchableOpacity>
                          <TextInput style={[styles.input, { flex: 2, marginRight: 8 }, focusedInput === 'newHolidayName' && styles.inputFocused]} value={newHolidayName} onChangeText={setNewHolidayName} placeholder="Holiday name" placeholderTextColor={MUTED} onFocus={() => setFocusedInput('newHolidayName')} onBlur={() => setFocusedInput(null)} />
                          <TouchableOpacity style={styles.holidayAddButton} onPress={() => { if (newHolidayDate && newHolidayName) { addCustomHoliday(); setShowAddExclusionForm(false); } else { addCustomHoliday(); } }}>
                            <Plus size={18} color="#ffffff" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                        <Text style={[styles.mutedText, { marginBottom: 6, fontSize: 12 }]}>Range</Text>
                        <View style={styles.holidayInputRow}>
                          <TouchableOpacity style={[styles.datePickerTrigger, { flex: 1, marginRight: 6 }]} onPress={() => { setNewBreakStartCalendarMonth(newBreakStart ? dateStringToDate(newBreakStart) : new Date()); setShowNewBreakStartPicker(true); }}>
                            <Text style={[styles.datePickerTriggerText, !newBreakStart && styles.datePickerPlaceholder]}>{newBreakStart ? formatDateDisplay(newBreakStart) : 'Start'}</Text>
                            <ChevronDown size={18} color={SUB} />
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.datePickerTrigger, { flex: 1, marginRight: 6 }]} onPress={() => { setNewBreakEndCalendarMonth(newBreakEnd ? dateStringToDate(newBreakEnd) : new Date()); setShowNewBreakEndPicker(true); }}>
                            <Text style={[styles.datePickerTriggerText, !newBreakEnd && styles.datePickerPlaceholder]}>{newBreakEnd ? formatDateDisplay(newBreakEnd) : 'End'}</Text>
                            <ChevronDown size={18} color={SUB} />
                          </TouchableOpacity>
                          <TextInput style={[styles.input, { flex: 1, marginRight: 8 }, focusedInput === 'newBreakName' && styles.inputFocused]} value={newBreakName} onChangeText={setNewBreakName} placeholder="Break name" placeholderTextColor={MUTED} onFocus={() => setFocusedInput('newBreakName')} onBlur={() => setFocusedInput(null)} />
                          <TouchableOpacity style={styles.holidayAddButton} onPress={() => { if (newBreakStart && newBreakEnd && newBreakName) { addCustomBreak(); setShowAddExclusionForm(false); } else { addCustomBreak(); } }}>
                            <Plus size={18} color="#ffffff" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )}
                  </>
                  )}
                </View>

                {PLAN_MY_YEAR_LOGISTICS_FIRST &&
                  planStep === 'logistics' &&
                  hasPlanningPreferenceTargets &&
                  startDate &&
                  endDate && (
                    <View
                      style={{
                        marginTop: 12,
                        marginBottom: 4,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: BORDER_SUBTLE,
                        backgroundColor: ELIGIBILITY_CARD_BG,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          letterSpacing: 0.6,
                          color: TEXT_SECONDARY,
                          textTransform: 'uppercase',
                          marginBottom: 6,
                        }}
                      >
                        {t('planMyYear.planningTargetProgress.title')}
                      </Text>
                      <Text style={{ fontSize: 12, color: MUTED, marginBottom: 10, lineHeight: 17 }}>
                        {t('planMyYear.planningTargetProgress.subtitle')}
                      </Text>
                      {computingPotential ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <ActivityIndicator size="small" color={ACCENT} />
                          <Text style={{ fontSize: 13, color: MUTED, marginLeft: 10 }}>
                            {t('planMyYear.planningTargetProgress.loading')}
                          </Text>
                        </View>
                      ) : !schedulePotential ? (
                        <Text style={{ fontSize: 13, color: MUTED, lineHeight: 18 }}>
                          {t('planMyYear.planningTargetProgress.needCadence')}
                        </Text>
                      ) : targetScopeFromSettings === 'overall' ? (
                        <View>
                          {planConstraintMode === 'days' && effectivePlanTarget.target_days != null ? (
                            <>
                              <Text style={{ fontSize: 13, color: FG, marginBottom: 4, lineHeight: 19 }}>
                                {t('planMyYear.planningTargetProgress.overallDaysLead', {
                                  projected: schedulePotential.projected_days,
                                })}
                              </Text>
                              <Text style={{ fontSize: 13, color: FG, marginBottom: 4, lineHeight: 19 }}>
                                {t('planMyYear.planningTargetProgress.overallDaysTarget', {
                                  target: effectivePlanTarget.target_days,
                                })}
                              </Text>
                              {schedulePotential.delta_days != null && (
                                <Text
                                  style={{
                                    fontSize: 13,
                                    marginBottom: 6,
                                    lineHeight: 19,
                                    color:
                                      schedulePotential.delta_days === 0
                                        ? ACCENT
                                        : schedulePotential.delta_days > 0
                                          ? FG
                                          : ERROR,
                                  }}
                                >
                                  {schedulePotential.delta_days > 0
                                    ? t('planMyYear.planningTargetProgress.deltaOverDays', {
                                        n: schedulePotential.delta_days,
                                      })
                                    : schedulePotential.delta_days < 0
                                      ? t('planMyYear.planningTargetProgress.deltaUnderDays', {
                                          n: Math.abs(schedulePotential.delta_days),
                                        })
                                      : t('planMyYear.planningTargetProgress.deltaMetDays')}
                                </Text>
                              )}
                              {schedulePotential.suggested_end_date ? (
                                <Text style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 4, lineHeight: 17 }}>
                                  {t('planMyYear.planningTargetProgress.suggestedEnd', {
                                    date: formatDateDisplay(schedulePotential.suggested_end_date),
                                  })}
                                </Text>
                              ) : null}
                              {followGlobalHolidays &&
                              schedulePotential.days_excluded_holidays != null &&
                              schedulePotential.days_excluded_holidays > 0 ? (
                                <Text style={{ fontSize: 12, color: MUTED, marginBottom: 4, lineHeight: 17 }}>
                                  {t('planMyYear.planningTargetProgress.excludedPublicHolidays', {
                                    count: schedulePotential.days_excluded_holidays,
                                  })}
                                </Text>
                              ) : null}
                              {schedulePotential.cadence_suggestion?.message ? (
                                <Text style={{ fontSize: 12, color: MUTED, lineHeight: 17 }}>
                                  {t('planMyYear.planningTargetProgress.cadenceHint', {
                                    message: schedulePotential.cadence_suggestion.message,
                                  })}
                                </Text>
                              ) : null}
                            </>
                          ) : planConstraintMode === 'hours' && effectivePlanTarget.target_hours != null ? (
                            <>
                              <Text style={{ fontSize: 13, color: FG, marginBottom: 4, lineHeight: 19 }}>
                                {t('planMyYear.planningTargetProgress.overallHoursLead', {
                                  projected: schedulePotential.projected_hours,
                                })}
                              </Text>
                              <Text style={{ fontSize: 13, color: FG, marginBottom: 4, lineHeight: 19 }}>
                                {t('planMyYear.planningTargetProgress.overallHoursTarget', {
                                  target: effectivePlanTarget.target_hours,
                                })}
                              </Text>
                              {schedulePotential.delta_hours != null && (
                                <Text
                                  style={{
                                    fontSize: 13,
                                    marginBottom: 4,
                                    lineHeight: 19,
                                    color:
                                      schedulePotential.delta_hours === 0
                                        ? ACCENT
                                        : schedulePotential.delta_hours > 0
                                          ? FG
                                          : ERROR,
                                  }}
                                >
                                  {schedulePotential.delta_hours > 0
                                    ? t('planMyYear.planningTargetProgress.deltaOverHours', {
                                        n: Math.round(schedulePotential.delta_hours * 10) / 10,
                                      })
                                    : schedulePotential.delta_hours < 0
                                      ? t('planMyYear.planningTargetProgress.deltaUnderHours', {
                                          n: Math.round(Math.abs(schedulePotential.delta_hours) * 10) / 10,
                                        })
                                      : t('planMyYear.planningTargetProgress.deltaMetHours')}
                                </Text>
                              )}
                            </>
                          ) : null}
                        </View>
                      ) : (
                        <View>
                          {planningTargetPerSubjectLines.length === 0 ? (
                            <Text style={{ fontSize: 13, color: MUTED, lineHeight: 18 }}>
                              {t('planMyYear.planningTargetProgress.needCadence')}
                            </Text>
                          ) : (
                            planningTargetPerSubjectLines.map((row) => (
                              <Text
                                key={row.key}
                                style={{ fontSize: 13, color: FG, marginBottom: 6, lineHeight: 19 }}
                              >
                                {row.kind === 'days'
                                  ? t('planMyYear.planningTargetProgress.subjectRowDays', {
                                      name: row.name,
                                      projected: row.projected,
                                      target: row.target,
                                    })
                                  : t('planMyYear.planningTargetProgress.subjectRowHours', {
                                      name: row.name,
                                      projected: row.projected,
                                      target: row.target,
                                    })}
                              </Text>
                            ))
                          )}
                        </View>
                      )}
                    </View>
                  )}

                {/* Scheduled class days / cadence — show when subjects selected OR placeholder-only scope */}
                {(effectiveSubjectIds.length > 0 || isPlaceholderOnlyScope) && (
                  <View style={[styles.fieldSection, { marginTop: 16, marginBottom: 8 }]} onLayout={(e) => { scheduleSectionYRef.current = e.nativeEvent.layout.y; }}>
                      <View style={styles.scheduleBlocksInner}>
                      {PLAN_MY_YEAR_LOGISTICS_FIRST && (
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '700',
                            letterSpacing: 0.6,
                            color: TEXT_SECONDARY,
                            textTransform: 'uppercase',
                            marginBottom: 6,
                          }}
                        >
                          {s('planMyYear.multiSubjectUnits.step1SetSchedule')}
                        </Text>
                      )}
                      <Text style={[styles.logisticsLabel, { fontSize: 12, marginBottom: 8 }]}>Cadence <Text style={{ color: ERROR }}>*</Text></Text>
                      {PLAN_MY_YEAR_MULTI_SUBJECT_CADENCE &&
                        showMultiSubjectCadenceHint(PLAN_MY_YEAR_LOGISTICS_FIRST, effectiveSubjectIds.length) && (
                          <Text style={[styles.mutedText, { marginBottom: 10, fontSize: 12, lineHeight: 18 }]}>
                            {s('planMyYear.multiSubjectUnits.cadenceRowHint')}
                          </Text>
                        )}
                      {loadingCalendarEventsForConflicts ? (
                        <Text style={[styles.mutedText, { marginBottom: 10, fontSize: 12 }]}>
                          {t('planMyYear.cadenceConflicts.loadingCalendar')}
                        </Text>
                      ) : null}
                      {blocks.map((block, idx) => {
                      const subj = block.subject_id ? baseSubjectList.find((s) => s.id === block.subject_id) : null;
                      const blockSubjectLabel = subj?.name ?? (block.placeholder_label || (STRINGS.planMyYear?.sections?.blocks?.genericSlotLabel ?? 'Learning block'));
                      const weekdays = block.weekdays || [];
                      const isHighlighted = highlightBlockIndex === idx;
                      const cadenceWeekdayHighlight = cadenceWeekdayHighlightIndices.includes(idx);
                      return (
                        <View
                          key={block.block_id}
                          style={[
                            styles.blockRow,
                            blocks.length === 1 && styles.blockRowNoDivider,
                            isHighlighted && { backgroundColor: 'rgba(66, 133, 244, 0.08)', borderRadius: 8, padding: 12, marginBottom: 12 },
                            cadenceWeekdayHighlight && {
                              borderWidth: 2,
                              borderColor: ERROR,
                              borderRadius: 10,
                              padding: 10,
                              marginBottom: 8,
                              backgroundColor: 'rgba(239, 68, 68, 0.06)',
                            },
                          ]}
                        >
                          <Text style={styles.blockRowSubject}>{blockSubjectLabel}</Text>
                          <View style={styles.blockRowLine}>
                            <View style={styles.weekdayChipsRow}>
                              {WEEKDAY_NUMBERS.map((dayNum, dayIdx) => {
                                const isActive = weekdays.includes(dayNum);
                                return (
                                  <TouchableOpacity
                                    key={dayNum}
                                    style={[styles.weekdayChipSmall, isActive && styles.weekdayChipSmallActive]}
                                    onPress={() => {
                                      const next = isActive ? weekdays.filter((w) => w !== dayNum) : [...weekdays, dayNum].sort((a, b) => a - b);
                                      updateBlock(idx, { weekdays: next });
                                    }}
                                  >
                                    <Text style={[styles.weekdayChipSmallText, isActive && styles.weekdayChipSmallTextActive]}>
                                      {WEEKDAY_LABELS[dayIdx]}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          {!block.all_day && (
                            <View style={styles.blockTimeInline}>
                              <View style={styles.blockTimeField}>
                                <Text style={styles.blockTimeLabel}>Start</Text>
                                <View style={styles.blockTimeInputWrap}>
                                  {Platform.OS === 'web' ? (
                                    <input
                                      type="time"
                                      value={block.start_time || '09:00'}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        if (v) updateBlock(idx, { start_time: v });
                                      }}
                                      style={{
                                        backgroundColor: '#fff',
                                        border: `1px solid ${BORDER}`,
                                        borderRadius: 10,
                                        padding: '10px 12px',
                                        fontSize: 14,
                                        color: FG,
                                        width: '100%',
                                        maxWidth: 100,
                                        height: 44,
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                      }}
                                    />
                                  ) : (
                                    <TextInput
                                      placeholder="09:00"
                                      placeholderTextColor={MUTED}
                                      value={block.start_time || '09:00'}
                                      onChangeText={(text) => {
                                        const cleaned = text.replace(/[^0-9:]/g, '');
                                        const match = cleaned.match(/^(\d{0,2}):?(\d{0,2})/);
                                        if (!match) return;
                                        let h = match[1] ? parseInt(match[1], 10) : 0;
                                        let m = match[2] ? parseInt(match[2], 10) : 0;
                                        if (cleaned.length <= 2) {
                                          if (h > 23) h = 23;
                                          updateBlock(idx, { start_time: `${String(h).padStart(2, '0')}:00` });
                                          return;
                                        }
                                        if (h > 23) h = 23;
                                        if (m > 59) m = 59;
                                        updateBlock(idx, { start_time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` });
                                      }}
                                      style={[styles.input, { width: 90, height: 44 }]}
                                    />
                                  )}
                                </View>
                              </View>
                              <View style={styles.blockTimeField}>
                                <Text style={styles.blockTimeLabel}>End</Text>
                                <View style={styles.blockTimeInputWrap}>
                                  {Platform.OS === 'web' ? (
                                    <input
                                      type="time"
                                      value={block.end_time || '10:00'}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        if (v) updateBlock(idx, { end_time: v });
                                      }}
                                      style={{
                                        backgroundColor: '#fff',
                                        border: `1px solid ${BORDER}`,
                                        borderRadius: 10,
                                        padding: '10px 12px',
                                        fontSize: 14,
                                        color: FG,
                                        width: '100%',
                                        maxWidth: 100,
                                        height: 44,
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                      }}
                                    />
                                  ) : (
                                  <TextInput
                                    placeholder="10:00"
                                    placeholderTextColor={MUTED}
                                    value={block.end_time || '10:00'}
                                    onChangeText={(text) => {
                                      const cleaned = text.replace(/[^0-9:]/g, '');
                                      const match = cleaned.match(/^(\d{0,2}):?(\d{0,2})/);
                                      if (!match) return;
                                      let h = match[1] ? parseInt(match[1], 10) : 0;
                                      let m = match[2] ? parseInt(match[2], 10) : 0;
                                      if (cleaned.length <= 2) {
                                        if (h > 23) h = 23;
                                        updateBlock(idx, { end_time: `${String(h).padStart(2, '0')}:00` });
                                        return;
                                      }
                                      if (h > 23) h = 23;
                                      if (m > 59) m = 59;
                                      updateBlock(idx, { end_time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` });
                                    }}
                                    style={[styles.input, { width: 90, height: 44 }]}
                                  />
                                )}
                                </View>
                              </View>
                            </View>
                          )}
                          </View>
                          {cadenceWeekdayHighlight ? (
                            <Text style={{ fontSize: 12, color: ERROR, marginTop: 8, fontWeight: '500' }}>
                              Select a day of week chip to continue.
                            </Text>
                          ) : null}
                        </View>
                      );
                    })}
                    {showPlanEditingModeBanner && academicYearId && blocks.length > 0 && cadenceDirty
                      ? renderApplyFromScopeCadenceInline()
                      : null}
                    </View>
                    {isPlaceholderOnlyScope && (
                      <TouchableOpacity
                        onPress={addBlock}
                        style={[styles.editButton, { marginTop: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center' }]}
                        activeOpacity={0.8}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Plus size={16} color={ACCENT} style={{ marginRight: 6 }} />
                        <Text style={styles.editButtonText}>Add learning block</Text>
                      </TouchableOpacity>
                    )}
                    {PLAN_MY_YEAR_LOGISTICS_FIRST && (
                      <View
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: BORDER_SUBTLE,
                          paddingTop: 16,
                          marginTop: 12,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '700',
                            letterSpacing: 0.6,
                            color: TEXT_SECONDARY,
                            textTransform: 'uppercase',
                            marginBottom: 6,
                          }}
                        >
                          {s('planMyYear.multiSubjectUnits.step2AddContent')}
                        </Text>
                        {blocks
                          .filter((b) => b.subject_id)
                          .map((block) => {
                            const subj = baseSubjectList.find((s) => s.id === block.subject_id);
                            const blockSubjectLabel = subj?.name ?? (block.placeholder_label || (STRINGS.planMyYear?.sections?.blocks?.genericSlotLabel ?? 'Learning block'));
                            const linkColor = cadenceYieldsInstructionalSlots ? ACCENT : MUTED;
                            return (
                              <View
                                key={`step2-add-${block.block_id}`}
                                style={{
                                  marginBottom: 10,
                                  flexDirection: 'row',
                                  flexWrap: 'wrap',
                                  alignItems: 'center',
                                  alignSelf: 'flex-start',
                                  maxWidth: '100%',
                                }}
                              >
                                {blocks.filter((b) => b.subject_id).length > 1 ? (
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: FG, marginRight: 6, marginBottom: 4 }}>{blockSubjectLabel}</Text>
                                ) : null}
                                <Text style={{ fontSize: 12, color: MUTED, marginRight: 6, marginBottom: 4 }}>
                                  {cadenceShowChangeUnitsForSubject(block.subject_id)
                                    ? s('planMyYear.multiSubjectUnits.cadenceChangeUnitsInlinePrompt')
                                    : s('planMyYear.multiSubjectUnits.cadenceAddUnitsInlinePrompt')}
                                </Text>
                                {[
                                  { method: 'paste', label: s('planMyYear.sections.useASource.options.paste.label') },
                                  { method: 'paste_plain', label: s('planMyYear.sections.useASource.options.pastePlain.label') },
                                  { method: 'upload', label: s('planMyYear.sections.useASource.options.upload.label') },
                                  { method: 'generate', label: s('planMyYear.multiSubjectUnits.cadenceGenerateLabel') },
                                ].map((opt, optIdx) => (
                                  <React.Fragment key={`${block.block_id}-${opt.method}`}>
                                    {optIdx > 0 ? (
                                      <Text style={{ fontSize: 12, color: MUTED, marginHorizontal: 6, marginBottom: 4 }}>
                                        ·
                                      </Text>
                                    ) : null}
                                    <TouchableOpacity
                                      onPress={() => handleOpenCadenceUnitMethod(block.subject_id, opt.method)}
                                      activeOpacity={0.7}
                                      accessibilityRole="button"
                                      accessibilityLabel={t('planMyYear.multiSubjectUnits.a11yCadenceAddUnitsMethod', {
                                        methodLabel: opt.label,
                                        subjectName: blockSubjectLabel,
                                      })}
                                      style={{ marginBottom: 4, paddingVertical: 2 }}
                                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                    >
                                      <Text style={{ fontSize: 13, color: linkColor, textDecorationLine: 'underline' }}>{opt.label}</Text>
                                    </TouchableOpacity>
                                  </React.Fragment>
                                ))}
                              </View>
                            );
                          })}
                        {addContentCadenceInlineHint && !cadenceYieldsInstructionalSlots && (
                          <View
                            style={{
                              marginTop: 4,
                              marginBottom: 0,
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              borderRadius: 8,
                              backgroundColor: 'rgba(217, 119, 6, 0.08)',
                              borderWidth: 1,
                              borderColor: 'rgba(217, 119, 6, 0.25)',
                            }}
                          >
                            <Text style={{ fontSize: 12, color: FG, lineHeight: 18 }}>
                              {s('planMyYear.multiSubjectUnits.addContentBeforeCadenceInline')}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}


                {/* Phase 2: Lesson placement preview — map lessons to slots before commit */}
                {(planSource === 'link' || planSource === 'paste' || planSource === 'upload') && parsedContent?.lessons?.length > 0 && startDate && endDate && (
                  <View style={[styles.eligibilityCard, { marginTop: 12 }]}>
                    <View style={styles.eligibilityCardFilled}>
                      <Text style={[styles.eligibilityCardTitle, { marginBottom: 4 }]}>Lesson placement preview</Text>
                      <Text style={[styles.eligibilityCardSecondary, { marginBottom: 8 }]}>
                        How your parsed lessons will map onto your plan slots when you click "Create unit & schedule".
                      </Text>
                      {pacingPreviewLoading ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
                          <ActivityIndicator size="small" color={ACCENT} />
                          <Text style={[styles.mutedText, { marginLeft: 8 }]}>Loading placement…</Text>
                        </View>
                      ) : pacingPreviewError ? (
                        <Text style={[styles.mutedText, { color: ERROR }]}>{pacingPreviewError}</Text>
                      ) : pacingPreview ? (
                        <>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Check size={16} color={ACCENT} strokeWidth={2.5} />
                            <Text style={[styles.eligibilityCardSecondary, { marginLeft: 6 }]}>
                              {pacingPreview.slots_used} of {pacingPreview.total_lessons} lessons will fill plan slots
                              {pacingPreview.total_slots_available > 0 ? ` (${pacingPreview.total_slots_available} empty slots in range)` : ''}.
                              {pacingPreview.unmapped_lesson_count > 0
                                ? ` ${pacingPreview.unmapped_lesson_count} will get new events.`
                                : ''}
                            </Text>
                          </View>
                          {pacingPreview.mapping?.length > 0 && (
                            <View style={{ maxHeight: 200 }}>
                              <ScrollView showsVerticalScrollIndicator={true} nestedScrollEnabled>
                                {pacingPreview.mapping.slice(0, 15).map((row) => {
                                  const dateLabel = row.date_ymd ? formatDateDisplay(row.date_ymd) : '';
                                  const timeStr = row.start_ts
                                    ? new Date(row.start_ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                                    : '';
                                  return (
                                    <Text key={row.lesson_index} style={[styles.eligibilityCardSecondary, { marginBottom: 4 }]}>
                                      {row.lesson_index + 1}. {row.lesson_title || 'Lesson'} → {dateLabel}{timeStr ? ` ${timeStr}` : ''}
                                    </Text>
                                  );
                                })}
                                {(pacingPreview.mapping?.length ?? 0) > 15 && (
                                  <Text style={[styles.eligibilityCardSecondary, { marginTop: 4 }]}>
                                    … and {(pacingPreview.mapping?.length ?? 0) - 15} more
                                  </Text>
                                )}
                              </ScrollView>
                            </View>
                          )}
                        </>
                      ) : null}
                    </View>
                  </View>
                )}

                {PLAN_MY_YEAR_LOGISTICS_FIRST && (
                  <View style={{ marginTop: 8 }}>
                    {cadenceYieldsInstructionalSlots && (
                      <>
                        <View style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
                          <Text
                            style={{
                              fontSize: 17,
                              fontWeight: '700',
                              color: FG,
                              marginBottom: 6,
                              lineHeight: 22,
                              ...(Platform.OS === 'web' && {
                                fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                              }),
                            }}
                          >
                            {t('planMyYear.cadenceConflicts.previewDominantTitle')}
                          </Text>
                          <Text
                            style={{
                              fontSize: 13,
                              color: TEXT_SECONDARY,
                              marginBottom: lessonSchedulePreviewPlan.hasCurriculumMapping ? 4 : 12,
                              lineHeight: 18,
                            }}
                          >
                            {previewSlotLines.length} slot{previewSlotLines.length !== 1 ? 's' : ''} based on your date range and holidays & breaks.
                          </Text>
                          {lessonSchedulePreviewPlan.hasCurriculumMapping ? (
                            <Text style={{ fontSize: 12, color: MUTED, marginBottom: 10, lineHeight: 16 }}>
                              {s('planMyYear.multiSubjectUnits.lessonSchedulePreviewHeading')}
                            </Text>
                          ) : null}
                          <CadenceConflictsResolvedLine visible={cadenceConflictsResolvedFeedback} />
                          {lessonSchedulePreviewPlan.rows.map(({ line, detailLine }, idx) => {
                            const rowKey =
                              line.blockId && line.date ? `${line.date}|${String(line.blockId)}` : '';
                            const conflictDetail = rowKey ? previewLineConflictDetailsByKey.get(rowKey) ?? null : null;
                            return (
                              <CadencePreviewSlotRow
                                key={`ls-inline-${line.date}-${line.subjectId}-${idx}`}
                                line={line}
                                detailLine={detailLine}
                                conflictDetail={conflictDetail}
                                showResolvedTint={cadenceConflictsResolvedFeedback && !conflictDetail}
                                isLast={idx === lessonSchedulePreviewPlan.rows.length - 1}
                                onMoveRowPress={
                                  conflictDetail?.suggestedTimeLabel
                                    ? () => handleApplyCadenceRowFix(line)
                                    : undefined
                                }
                              />
                            );
                          })}
                        </View>
                        <LessonOverflowFollowUp
                          textStyle={[styles.mutedText, { fontSize: 12, color: TEXT_SECONDARY }]}
                          overflowCount={lessonSchedulePreviewPlan.overflowCount}
                          extendEndYmd={lessonOverflowExtendEndDate}
                          curriculumSubjectId={lessonSchedulePreviewPlan.curriculumSubjectId}
                          hasCurriculumMapping={lessonSchedulePreviewPlan.hasCurriculumMapping}
                          onApplyExtend={applyExtendedPlanEndDate}
                          t={t}
                        />
                      </>
                    )}
                    {academicYearId && !showPlanEditingModeBanner && cadenceDirty ? renderApplyFromScopeCard() : null}
                    {hasCadenceConflicts && canMoveAllCadenceFix ? (
                      <View style={{ paddingHorizontal: 14, marginTop: 8 }}>
                        <CadencePreviewConflictBulkBar
                          conflictCount={cadenceConflictEntryCount}
                          suggestedTimeLabel={cadenceBulkSuggestedTimeLabel}
                          canMoveAll={canMoveAllCadenceFix}
                          onMoveAll={handleFixAllCadenceConflicts}
                        />
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        styles.planYearGenerateCta,
                        cadenceYieldsInstructionalSlots && { marginTop: 20 },
                        (saving || loading) && styles.buttonDisabled,
                      ]}
                      onPress={handleApplyToCalendar}
                      disabled={saving || loading}
                      {...(Platform.OS === 'web' && {
                        cursor: saving || loading ? 'wait' : 'pointer',
                      })}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color={BG} />
                      ) : (
                        <Text style={[styles.primaryButtonText, styles.primaryButtonTextAllCaps]}>
                          {academicYearId
                            ? STRINGS.planMyYear.primaryActions.updateSlots
                            : STRINGS.planMyYear.primaryActions.generateSlots}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
          {PLAN_MY_YEAR_LOGISTICS_FIRST &&
            planStep === 'unit_structure' &&
            !inlineUnitStructureFromSubjectDetail && (
            <Modal
              animationType="fade"
              transparent
              visible
              onRequestClose={() => {
                setCadenceDifferentMethodNotice(null);
                suppressManualCurriculumHydrateRef.current = false;
                if (planSource === 'paste' && (draftData || manualDraft)) {
                  setDraftData(null);
                  setManualDraft(null);
                  setUnitStructureStep('input');
                  setRawText('');
                  setExpandedUnits(new Set());
                  setExpandedUnitIndexManual(0);
                  setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                  setUnitFocusSubjectId(null);
                  return;
                }
                if (draftData || manualDraft) {
                  if (Platform.OS === 'web' && (planSource === 'paste_plain' || planSource === 'upload')) {
                    importDraftFlushRef.current();
                  }
                  suppressManualCurriculumHydrateRef.current = true;
                  setDraftData(null);
                  if (planSource === 'paste' && !hasPersistedManualCurriculum) {
                    setManualDraft(createInitialManualDraft());
                    setExpandedUnitIndexManual(0);
                    setExpandedUnits(new Set([0]));
                  } else {
                    setManualDraft(null);
                    setExpandedUnits(new Set());
                    setExpandedUnitIndexManual(0);
                  }
                  leaveParsedDraftForTextEditor();
                  setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                  setUnitFocusSubjectId(null);
                } else {
                  setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                  setUnitFocusSubjectId(null);
                }
              }}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(15,23,42,0.5)',
                  justifyContent: 'center',
                  padding: Platform.OS === 'web' ? 24 : 12,
                }}
              >
                <View
                  style={{
                    maxHeight: Platform.OS === 'web' ? '92%' : '100%',
                    width: '100%',
                    maxWidth: 875,
                    alignSelf: 'center',
                    backgroundColor: BG,
                    borderRadius: 22,
                    overflow: 'hidden',
                    flex: Platform.OS === 'web' ? undefined : 1,
                    position: 'relative',
                    ...(Platform.OS === 'web' ? { boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' } : {}),
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      setCadenceDifferentMethodNotice(null);
                      suppressManualCurriculumHydrateRef.current = false;
                      if (planSource === 'paste' && (draftData || manualDraft)) {
                        setDraftData(null);
                        setManualDraft(null);
                        setUnitStructureStep('input');
                        setRawText('');
                        setExpandedUnits(new Set());
                        setExpandedUnitIndexManual(0);
                        setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                        setUnitFocusSubjectId(null);
                        return;
                      }
                      if (draftData || manualDraft) {
                        if (Platform.OS === 'web' && (planSource === 'paste_plain' || planSource === 'upload')) {
                          importDraftFlushRef.current();
                        }
                        suppressManualCurriculumHydrateRef.current = true;
                        setDraftData(null);
                        if (planSource === 'paste' && !hasPersistedManualCurriculum) {
                          setManualDraft(createInitialManualDraft());
                          setExpandedUnitIndexManual(0);
                          setExpandedUnits(new Set([0]));
                        } else {
                          setManualDraft(null);
                          setExpandedUnits(new Set());
                          setExpandedUnitIndexManual(0);
                        }
                        leaveParsedDraftForTextEditor();
                        setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                        setUnitFocusSubjectId(null);
                      } else {
                        setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                        setUnitFocusSubjectId(null);
                      }
                    }}
                    style={{
                      position: 'absolute',
                      top: 14,
                      right: 14,
                      zIndex: 20,
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(255,255,255,0.96)',
                      borderWidth: 1,
                      borderColor: BORDER,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={STRINGS.global.actions.close}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <X size={20} color={FG} />
                  </TouchableOpacity>
                  <View style={{ flex: 1, minHeight: 0, paddingTop: 28 }}>
                    {renderPlanYearUnitStructureScroll(true)}
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 24,
                      paddingTop: 0,
                      paddingBottom: Platform.OS === 'web' ? 20 : 18,
                      backgroundColor: BG,
                    }}
                  >
                    {unitStructureError ? (
                      <View style={{ marginBottom: 12, padding: 10, backgroundColor: '#fee2e2', borderRadius: 8 }}>
                        <Text style={{ fontSize: 13, color: ERROR }}>{unitStructureError}</Text>
                      </View>
                    ) : null}
                    {(draftData || manualDraft) ? (
                      <View style={{ width: '100%' }}>
                      <TouchableOpacity
                        onPress={async () => {
                          const availableSubjectId = unitPipelineSubjectId;
                          const availableSubject = availableSubjectId ? baseSubjectList.find((s) => String(s.id) === String(availableSubjectId)) : null;
                          if (!availableSubject || !familyId) {
                            setUnitStructureError('Subject not found.');
                            return;
                          }
                          setUnitStructureStep('saving');
                          setUnitStructureError(null);
                          try {
                            if (manualDraft) {
                              const availSlot =
                                s('planMyYear.multiSubjectUnits.availableInstructionalSlot') || 'Available slot';
                              const draftForCommit = mergeManualDraftWithInstructionalSlotDates(
                                JSON.parse(JSON.stringify(manualDraft)),
                                lessonSchedulePreviewPlan,
                                availSlot,
                              );
                              const { data, error: err } = await commitManualDraft({
                                subject_id: availableSubject?.id,
                                family_id: familyId,
                                subject_name: availableSubject?.name || '',
                                draft: draftForCommit,
                                builder_mode: 'rich_units',
                                replace_existing: true,
                                academic_year_id: academicYearId || undefined,
                                student_ids: allFamilyChildIds.map((id) => String(id)).filter(Boolean),
                              });
                              if (err || !data) {
                                setUnitStructureError(
                                  err?.message || err?.detail || (typeof err === 'string' ? err : null) || 'Failed to save curriculum',
                                );
                                setUnitStructureStep('draft');
                                return;
                              }
                            } else if ((planSource === 'upload' || planSource === 'paste_plain') && draftData) {
                              const { data, error: err } = await commitParsedDraft({
                                subject_id: availableSubject?.id,
                                family_id: familyId,
                                subject_name: availableSubject?.name || '',
                                draft: draftData,
                                academic_year_id: academicYearId || undefined,
                                student_ids: allFamilyChildIds.map((id) => String(id)).filter(Boolean),
                              });
                              if (err || !data) {
                                setUnitStructureError(err?.message || 'Failed to save curriculum');
                                setUnitStructureStep('draft');
                                return;
                              }
                              clearPlanYearImportDraft(
                                familyId,
                                availableSubjectId != null && String(availableSubjectId).trim() !== ''
                                  ? String(availableSubjectId)
                                  : 'none',
                                planSource,
                              );
                            } else if (planSource === 'generate' && draftData) {
                              const { data, error: err } = await commitGeneratedDraft({
                                subject_id: availableSubject?.id,
                                family_id: familyId,
                                subject_name: availableSubject?.name || '',
                                draft: draftData,
                              });
                              if (err || !data) {
                                setUnitStructureError(err?.message || 'Failed to save curriculum');
                                setUnitStructureStep('draft');
                                return;
                              }
                            } else {
                              setUnitStructureError('Nothing to save. Add content or pick Manual / Upload / Generate.');
                              setUnitStructureStep('draft');
                              return;
                            }
                            if (unitPipelineSubjectId) {
                              setLastSavedUnitSubjectId(unitPipelineSubjectId);
                            }
                            setDraftData(null);
                            setManualDraft(null);
                            setUnitStructureStep('input');
                            setPlanStep(getAfterUnitStructureContinue(PLAN_MY_YEAR_LOGISTICS_FIRST));
                            setUnitFocusSubjectId(null);
                            if (unitPipelineSubjectId) {
                              setLoadingUnitStructure(true);
                              const subjectId = unitPipelineSubjectId;
                              try {
                                const { data: structureData, error: structureErr } =
                                  await fetchSubjectCurriculumEventsStructure(
                                    familyId,
                                    subjectId,
                                    academicYearId || initialAcademicYearId || null
                                  );
                                if (!structureErr && Array.isArray(structureData?.units)) {
                                  setSavedContentSource(structureData?.saved_content_source ?? null);
                                  setUnitStructureData({ units: structureData.units });
                                }
                              } finally {
                                setLoadingUnitStructure(false);
                              }
                            }
                            setCadenceDifferentMethodNotice(null);
                            suppressManualCurriculumHydrateRef.current = false;
                            bumpPlanSurfacesAfterMutation(academicYearId ?? null);
                          } catch (err) {
                            setUnitStructureError(err.message || 'Failed to save curriculum');
                            setUnitStructureStep('draft');
                          }
                        }}
                        style={{
                          width: '100%',
                          backgroundColor: UNIT_STRUCTURE_OVERLAY_PRIMARY_BG,
                          paddingVertical: 14,
                          paddingHorizontal: 16,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity:
                            unitStructureStep === 'saving' ||
                            (manualDraft && getManualCommitValidationError(manualDraft))
                              ? 0.65
                              : 1,
                        }}
                        disabled={
                          unitStructureStep === 'saving' ||
                          Boolean(manualDraft && getManualCommitValidationError(manualDraft))
                        }
                        {...(Platform.OS === 'web' && {
                          cursor:
                            unitStructureStep === 'saving' ||
                            (manualDraft && getManualCommitValidationError(manualDraft))
                              ? 'not-allowed'
                              : 'pointer',
                        })}
                      >
                        {unitStructureStep === 'saving' ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text
                            style={[styles.primaryButtonText, { textAlign: 'center', lineHeight: 22 }]}
                            numberOfLines={2}
                          >
                            {manualDraft && hasPersistedManualCurriculum
                              ? unitStructureSaveManualChangesLabel
                              : unitStructureSaveDraftLabel}
                          </Text>
                        )}
                      </TouchableOpacity>
                      </View>
                    ) : hasPersistedManualCurriculum ? (
                      <View
                        style={{
                          marginHorizontal: -24,
                          borderTopWidth: 1,
                          borderTopColor: BORDER,
                          paddingHorizontal: 20,
                          paddingTop: 12,
                          paddingBottom: 4,
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          backgroundColor: BG,
                        }}
                      >
                        <TouchableOpacity
                          onPress={() => {
                            if (planSource === 'paste' && (draftData || manualDraft)) {
                              setDraftData(null);
                              setManualDraft(null);
                              setUnitStructureStep('input');
                              setRawText('');
                              setExpandedUnits(new Set());
                              setExpandedUnitIndexManual(0);
                              setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                              setUnitFocusSubjectId(null);
                              return;
                            }
                            if (draftData || manualDraft) {
                              if (Platform.OS === 'web' && (planSource === 'paste_plain' || planSource === 'upload')) {
                                importDraftFlushRef.current();
                              }
                              suppressManualCurriculumHydrateRef.current = true;
                              setDraftData(null);
                              if (planSource === 'paste' && !hasPersistedManualCurriculum) {
                                setManualDraft(createInitialManualDraft());
                                setExpandedUnitIndexManual(0);
                                setExpandedUnits(new Set([0]));
                              } else {
                                setManualDraft(null);
                                setExpandedUnits(new Set());
                                setExpandedUnitIndexManual(0);
                              }
                              leaveParsedDraftForTextEditor();
                              setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                              setUnitFocusSubjectId(null);
                            } else {
                              setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                              setUnitFocusSubjectId(null);
                            }
                          }}
                          style={{ paddingVertical: 10, paddingHorizontal: 4 }}
                          {...(Platform.OS === 'web' && { type: 'button', cursor: 'pointer' })}
                        >
                          <Text style={{ fontSize: 15, fontWeight: '500', color: SUB }}>{s('global.actions.cancel')}</Text>
                        </TouchableOpacity>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <TouchableOpacity
                            onPress={() => {
                              setPlanStep(getAfterUnitStructureContinue(PLAN_MY_YEAR_LOGISTICS_FIRST));
                              setUnitFocusSubjectId(null);
                            }}
                            style={{ paddingVertical: 10, paddingHorizontal: 8 }}
                            {...(Platform.OS === 'web' && { type: 'button', cursor: 'pointer' })}
                          >
                            <Text style={{ fontSize: 15, fontWeight: '600', color: SUB }}>
                              {t('planMyYear.multiSubjectUnits.savedManualCurriculumFooterBackToBuilder')}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              suppressManualCurriculumHydrateRef.current = false;
                              const next = manualDraftFromUnitStructureData(unitStructureData);
                              if (next) {
                                setManualDraft(next);
                                setExpandedUnitIndexManual(0);
                                setExpandedUnits(new Set([0]));
                              }
                            }}
                            style={{
                              backgroundColor: EVENT_DETAILS_PRIMARY_BG,
                              paddingVertical: 12,
                              paddingHorizontal: 20,
                              borderRadius: 10,
                              alignItems: 'center',
                              justifyContent: 'center',
                              ...(Platform.OS === 'web' && { boxShadow: '0 2px 6px rgba(133,196,242,0.3)' }),
                            }}
                            activeOpacity={0.9}
                            {...(Platform.OS === 'web' && { type: 'button', cursor: 'pointer' })}
                          >
                            <Text style={EDIT_UNITS_PRIMARY_BUTTON_TEXT}>
                              {t('planMyYear.multiSubjectUnits.savedManualCurriculumFooterEditUnits')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : showGenerateCurriculumFooter ? (
                      <TouchableOpacity
                        onPress={runGenerateCurriculumDraft}
                        disabled={generating}
                        style={{
                          width: '100%',
                          backgroundColor: UNIT_STRUCTURE_OVERLAY_PRIMARY_BG,
                          paddingVertical: 14,
                          paddingHorizontal: 16,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexDirection: 'row',
                          gap: 8,
                          opacity: generating ? 0.65 : 1,
                        }}
                        {...(Platform.OS === 'web' && {
                          cursor: generating ? 'not-allowed' : 'pointer',
                        })}
                      >
                        {generating ? (
                          <>
                            <ActivityIndicator size="small" color="#ffffff" />
                            <Text style={[styles.primaryButtonText, { textAlign: 'center' }]}>
                              {t('planMyYear.multiSubjectUnits.generateAndPreviewLoading')}
                            </Text>
                          </>
                        ) : (
                          <Text style={[styles.primaryButtonText, { textAlign: 'center' }]}>
                            {t('planMyYear.multiSubjectUnits.generateAndPreview')}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ) : showUploadMaterialPreviewFooter ? (
                      <TouchableOpacity
                        onPress={runUploadMaterialParse}
                        disabled={parsing || !selectedMaterialId}
                        style={{
                          width: '100%',
                          backgroundColor: UNIT_STRUCTURE_OVERLAY_PRIMARY_BG,
                          paddingVertical: 14,
                          paddingHorizontal: 16,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexDirection: 'row',
                          gap: 8,
                          opacity: parsing || !selectedMaterialId ? 0.55 : 1,
                        }}
                        {...(Platform.OS === 'web' && {
                          cursor: parsing || !selectedMaterialId ? 'not-allowed' : 'pointer',
                        })}
                      >
                        {parsing ? (
                          <>
                            <ActivityIndicator size="small" color="#ffffff" />
                            <Text style={[styles.primaryButtonText, { textAlign: 'center' }]}>
                              {t('planMyYear.multiSubjectUnits.importPreviewStructureLoading')}
                            </Text>
                          </>
                        ) : (
                          <Text style={[styles.primaryButtonText, { textAlign: 'center' }]}>
                            {t('planMyYear.multiSubjectUnits.importPreviewStructure')}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ) : hideFooterSkipForPasteImportInput ? null : (
                      <TouchableOpacity
                        onPress={() => {
                          setPlanStep(getAfterUnitStructureContinue(PLAN_MY_YEAR_LOGISTICS_FIRST));
                          setUnitFocusSubjectId(null);
                        }}
                        style={{
                          width: '100%',
                          backgroundColor: UNIT_STRUCTURE_OVERLAY_PRIMARY_BG,
                          paddingVertical: 14,
                          paddingHorizontal: 16,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={[styles.primaryButtonText, { textAlign: 'center' }]}>{unitStructureSkipDraftLabel}</Text>
                      </TouchableOpacity>
                    )}
                    {!(hasPersistedManualCurriculum && !draftData && !manualDraft) ? (
                      <TouchableOpacity
                        onPress={() => {
                          if (planSource === 'paste' && (draftData || manualDraft)) {
                            setDraftData(null);
                            setManualDraft(null);
                            setUnitStructureStep('input');
                            setRawText('');
                            setExpandedUnits(new Set());
                            setExpandedUnitIndexManual(0);
                            setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                            setUnitFocusSubjectId(null);
                            return;
                          }
                          if (draftData || manualDraft) {
                            if (Platform.OS === 'web' && (planSource === 'paste_plain' || planSource === 'upload')) {
                              importDraftFlushRef.current();
                            }
                            suppressManualCurriculumHydrateRef.current = true;
                            setDraftData(null);
                            if (planSource === 'paste' && !hasPersistedManualCurriculum) {
                              setManualDraft(createInitialManualDraft());
                              setExpandedUnitIndexManual(0);
                              setExpandedUnits(new Set([0]));
                            } else {
                              setManualDraft(null);
                              setExpandedUnits(new Set());
                              setExpandedUnitIndexManual(0);
                            }
                            leaveParsedDraftForTextEditor();
                            setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                            setUnitFocusSubjectId(null);
                          } else {
                            setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                            setUnitFocusSubjectId(null);
                          }
                        }}
                        style={{ alignSelf: 'center', marginTop: 6, paddingVertical: 6, paddingHorizontal: 12 }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={{ fontSize: 15, fontWeight: '500', color: TEXT_SECONDARY }}>{s('global.actions.cancel')}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            </Modal>
          )}
            </>
          )}

          {/* Start Date Calendar Picker (same as Add Event modal) */}
          {showStartDatePicker && (
            <Modal
              animationType="fade"
              transparent
              visible={showStartDatePicker}
              onRequestClose={() => setShowStartDatePicker(false)}
            >
              <TouchableOpacity
                style={styles.calendarOverlay}
                activeOpacity={1}
                onPress={() => setShowStartDatePicker(false)}
              >
                <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.calendarModal}>
                  <View style={styles.calendarNavRow}>
                    <TouchableOpacity
                      onPress={() => {
                        const d = new Date(startDateCalendarMonth);
                        d.setMonth(d.getMonth() - 1);
                        setStartDateCalendarMonth(d);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <ChevronLeft size={20} color={FG} />
                    </TouchableOpacity>
                    <Text style={styles.calendarMonthTitle}>
                      {startDateCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        const d = new Date(startDateCalendarMonth);
                        d.setMonth(d.getMonth() + 1);
                        setStartDateCalendarMonth(d);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <ChevronRight size={20} color={FG} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.calendarYearRow}>
                    <TouchableOpacity
                      onPress={() => {
                        const d = new Date(startDateCalendarMonth);
                        d.setFullYear(d.getFullYear() - 1);
                        setStartDateCalendarMonth(d);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <Text style={styles.calendarYearLink}>← Year</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const today = new Date();
                        setStartDateCalendarMonth(today);
                        setStartDate(toLocalYYYYMMDD(today));
                        setShowStartDatePicker(false);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <Text style={[styles.calendarYearLink, { textDecorationLine: 'underline' }]}>Today</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const d = new Date(startDateCalendarMonth);
                        d.setFullYear(d.getFullYear() + 1);
                        setStartDateCalendarMonth(d);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <Text style={styles.calendarYearLink}>Year →</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.calendarDayHeaders}>
                    {WEEKDAY_LABELS.map((day) => (
                      <View key={day} style={styles.calendarDayHeader}>
                        <Text style={styles.calendarDayHeaderText}>{day}</Text>
                      </View>
                    ))}
                  </View>
                  {(() => {
                    const year = startDateCalendarMonth.getFullYear();
                    const month = startDateCalendarMonth.getMonth();
                    const firstDay = new Date(year, month, 1);
                    const startDateGrid = new Date(firstDay);
                    startDateGrid.setDate(startDateGrid.getDate() - startDateGrid.getDay());
                    const days = [];
                    const current = new Date(startDateGrid);
                    for (let i = 0; i < 42; i++) {
                      days.push(new Date(current));
                      current.setDate(current.getDate() + 1);
                    }
                    return (
                      <View>
                        {[0, 1, 2, 3, 4, 5].map((week) => (
                          <View key={week} style={styles.calendarWeekRow}>
                            {days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                              const isCurrentMonth = day.getMonth() === month;
                              const ymd = toLocalYYYYMMDD(day);
                              const isSelected = startDate === ymd;
                              const isToday = ymd === toLocalYYYYMMDD(new Date());
                              return (
                                <TouchableOpacity
                                  key={idx}
                                  onPress={() => {
                                    setStartDate(ymd);
                                    setShowStartDatePicker(false);
                                  }}
                                  style={[
                                    styles.calendarDayCell,
                                    isSelected && styles.calendarDayCellSelected,
                                    isToday && !isSelected && styles.calendarDayCellToday,
                                  ]}
                                >
                                  <Text style={[
                                    styles.calendarDayText,
                                    isSelected && styles.calendarDayTextSelected,
                                    !isCurrentMonth && styles.calendarDayTextMuted,
                                  ]}>
                                    {day.getDate()}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}

          {/* End Date Calendar Picker (same as Add Event modal) */}
          {showEndDatePicker && (
            <Modal
              animationType="fade"
              transparent
              visible={showEndDatePicker}
              onRequestClose={() => setShowEndDatePicker(false)}
            >
              <TouchableOpacity
                style={styles.calendarOverlay}
                activeOpacity={1}
                onPress={() => setShowEndDatePicker(false)}
              >
                <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.calendarModal}>
                  <View style={styles.calendarNavRow}>
                    <TouchableOpacity
                      onPress={() => {
                        const d = new Date(endDateCalendarMonth);
                        d.setMonth(d.getMonth() - 1);
                        setEndDateCalendarMonth(d);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <ChevronLeft size={20} color={FG} />
                    </TouchableOpacity>
                    <Text style={styles.calendarMonthTitle}>
                      {endDateCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        const d = new Date(endDateCalendarMonth);
                        d.setMonth(d.getMonth() + 1);
                        setEndDateCalendarMonth(d);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <ChevronRight size={20} color={FG} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.calendarYearRow}>
                    <TouchableOpacity
                      onPress={() => {
                        const d = new Date(endDateCalendarMonth);
                        d.setFullYear(d.getFullYear() - 1);
                        setEndDateCalendarMonth(d);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <Text style={styles.calendarYearLink}>← Year</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const today = new Date();
                        setEndDateCalendarMonth(today);
                        setEndDate(toLocalYYYYMMDD(today));
                        setShowEndDatePicker(false);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <Text style={[styles.calendarYearLink, { textDecorationLine: 'underline' }]}>Today</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const d = new Date(endDateCalendarMonth);
                        d.setFullYear(d.getFullYear() + 1);
                        setEndDateCalendarMonth(d);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <Text style={styles.calendarYearLink}>Year →</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.calendarDayHeaders}>
                    {WEEKDAY_LABELS.map((day) => (
                      <View key={day} style={styles.calendarDayHeader}>
                        <Text style={styles.calendarDayHeaderText}>{day}</Text>
                      </View>
                    ))}
                  </View>
                  {(() => {
                    const year = endDateCalendarMonth.getFullYear();
                    const month = endDateCalendarMonth.getMonth();
                    const firstDay = new Date(year, month, 1);
                    const startDateGrid = new Date(firstDay);
                    startDateGrid.setDate(startDateGrid.getDate() - startDateGrid.getDay());
                    const days = [];
                    const current = new Date(startDateGrid);
                    for (let i = 0; i < 42; i++) {
                      days.push(new Date(current));
                      current.setDate(current.getDate() + 1);
                    }
                    return (
                      <View>
                        {[0, 1, 2, 3, 4, 5].map((week) => (
                          <View key={week} style={styles.calendarWeekRow}>
                            {days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                              const isCurrentMonth = day.getMonth() === month;
                              const ymd = toLocalYYYYMMDD(day);
                              const isSelected = endDate === ymd;
                              const isToday = ymd === toLocalYYYYMMDD(new Date());
                              return (
                                <TouchableOpacity
                                  key={idx}
                                  onPress={() => {
                                    setEndDate(ymd);
                                    setShowEndDatePicker(false);
                                  }}
                                  style={[
                                    styles.calendarDayCell,
                                    isSelected && styles.calendarDayCellSelected,
                                    isToday && !isSelected && styles.calendarDayCellToday,
                                  ]}
                                >
                                  <Text style={[
                                    styles.calendarDayText,
                                    isSelected && styles.calendarDayTextSelected,
                                    !isCurrentMonth && styles.calendarDayTextMuted,
                                  ]}>
                                    {day.getDate()}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}

          {/* Custom Holiday Date Calendar Picker */}
          {showNewHolidayDatePicker && (
            <Modal animationType="fade" transparent visible={showNewHolidayDatePicker} onRequestClose={() => setShowNewHolidayDatePicker(false)}>
              <TouchableOpacity style={styles.calendarOverlay} activeOpacity={1} onPress={() => setShowNewHolidayDatePicker(false)}>
                <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.calendarModal}>
                  <View style={styles.calendarNavRow}>
                    <TouchableOpacity onPress={() => { const d = new Date(newHolidayDateCalendarMonth); d.setMonth(d.getMonth() - 1); setNewHolidayDateCalendarMonth(d); }} style={styles.calendarNavButton}>
                      <ChevronLeft size={20} color={FG} />
                    </TouchableOpacity>
                    <Text style={styles.calendarMonthTitle}>{newHolidayDateCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                    <TouchableOpacity onPress={() => { const d = new Date(newHolidayDateCalendarMonth); d.setMonth(d.getMonth() + 1); setNewHolidayDateCalendarMonth(d); }} style={styles.calendarNavButton}>
                      <ChevronRight size={20} color={FG} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.calendarYearRow}>
                    <TouchableOpacity onPress={() => { const d = new Date(newHolidayDateCalendarMonth); d.setFullYear(d.getFullYear() - 1); setNewHolidayDateCalendarMonth(d); }} style={styles.calendarNavButton}><Text style={styles.calendarYearLink}>← Year</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { const today = new Date(); setNewHolidayDateCalendarMonth(today); setNewHolidayDate(toLocalYYYYMMDD(today)); setShowNewHolidayDatePicker(false); }} style={styles.calendarNavButton}><Text style={[styles.calendarYearLink, { textDecorationLine: 'underline' }]}>Today</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { const d = new Date(newHolidayDateCalendarMonth); d.setFullYear(d.getFullYear() + 1); setNewHolidayDateCalendarMonth(d); }} style={styles.calendarNavButton}><Text style={styles.calendarYearLink}>Year →</Text></TouchableOpacity>
                  </View>
                  <View style={styles.calendarDayHeaders}>{WEEKDAY_LABELS.map((day) => (<View key={day} style={styles.calendarDayHeader}><Text style={styles.calendarDayHeaderText}>{day}</Text></View>))}</View>
                  {(() => {
                    const year = newHolidayDateCalendarMonth.getFullYear(); const month = newHolidayDateCalendarMonth.getMonth();
                    const firstDay = new Date(year, month, 1); const startDateGrid = new Date(firstDay); startDateGrid.setDate(startDateGrid.getDate() - startDateGrid.getDay());
                    const days = []; const current = new Date(startDateGrid); for (let i = 0; i < 42; i++) { days.push(new Date(current)); current.setDate(current.getDate() + 1); }
                    return (<View>{[0, 1, 2, 3, 4, 5].map((week) => (<View key={week} style={styles.calendarWeekRow}>{days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                      const isCurrentMonth = day.getMonth() === month; const ymd = toLocalYYYYMMDD(day); const isSelected = newHolidayDate === ymd; const isToday = ymd === toLocalYYYYMMDD(new Date());
                      return (<TouchableOpacity key={idx} onPress={() => { setNewHolidayDate(ymd); setShowNewHolidayDatePicker(false); }} style={[styles.calendarDayCell, isSelected && styles.calendarDayCellSelected, isToday && !isSelected && styles.calendarDayCellToday]}>
                        <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, !isCurrentMonth && styles.calendarDayTextMuted]}>{day.getDate()}</Text>
                      </TouchableOpacity>); })}</View>))}</View>);
                  })()}
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}

          {/* U.S. public holidays picker: choose which holidays to include */}
          {showPublicHolidaysPicker && (
            <Modal animationType="fade" transparent visible={showPublicHolidaysPicker} onRequestClose={() => setShowPublicHolidaysPicker(false)}>
              <TouchableOpacity style={styles.calendarOverlay} activeOpacity={1} onPress={() => setShowPublicHolidaysPicker(false)}>
                <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={[styles.calendarModal, { maxWidth: 420, maxHeight: '80%' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>U.S. public holidays</Text>
                    <TouchableOpacity onPress={() => setShowPublicHolidaysPicker(false)} hitSlop={12}>
                      <X size={22} color={SUB} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.mutedText, { marginBottom: 12 }]}>Uncheck any holiday you don't want to include (they will be treated as regular instructional days).</Text>
                  {publicHolidaysLoading ? (
                    <View style={{ padding: 24, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={ACCENT} />
                    </View>
                  ) : (
                    <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator>
                      {publicHolidaysList.map((h) => {
                        const dateStr = (h.date || '').slice(0, 10);
                        const isIncluded = !excludedPublicHolidayDates.includes(dateStr);
                        return (
                          <TouchableOpacity
                            key={`${dateStr}-${h.name}`}
                            onPress={() => {
                              if (isIncluded) {
                                setExcludedPublicHolidayDates((prev) => [...prev, dateStr]);
                              } else {
                                setExcludedPublicHolidayDates((prev) => prev.filter((d) => d !== dateStr));
                              }
                            }}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingRight: 8, borderBottomWidth: 1, borderBottomColor: BORDER }}
                            activeOpacity={0.7}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: isIncluded ? ACCENT : BORDER, backgroundColor: isIncluded ? ACCENT : 'transparent', marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                              {isIncluded ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
                            </View>
                            <Text style={[styles.label, { flex: 1, fontSize: 14 }]}>{h.name}</Text>
                            <Text style={[styles.mutedText, { fontSize: 13 }]}>{dateStr}</Text>
                          </TouchableOpacity>
                        );
                      })}
                      {publicHolidaysList.length === 0 && !publicHolidaysLoading && (
                        <Text style={[styles.mutedText, { padding: 16 }]}>No holidays in this date range. Extend range or add custom holiday.</Text>
                      )}
                    </ScrollView>
                  )}
                  <TouchableOpacity
                    onPress={async () => {
                      const datesWithNames = excludedPublicHolidayDates.map((d) => {
                        const h = publicHolidaysList.find((x) => (x.date || '').slice(0, 10) === d);
                        return { date: d, name: h?.name || 'Holiday' };
                      });
                      await saveExcludedPublicHolidayDates(familyId, datesWithNames);
                      dispatchPlanningPrefsSynced();
                      setShowPublicHolidaysPicker(false);
                    }}
                    style={[styles.primaryButton, { marginTop: 16 }]}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.primaryButtonText}>Done</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}

          {/* Custom Break Start Date Calendar Picker */}
          {showNewBreakStartPicker && (
            <Modal animationType="fade" transparent visible={showNewBreakStartPicker} onRequestClose={() => setShowNewBreakStartPicker(false)}>
              <TouchableOpacity style={styles.calendarOverlay} activeOpacity={1} onPress={() => setShowNewBreakStartPicker(false)}>
                <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.calendarModal}>
                  <View style={styles.calendarNavRow}>
                    <TouchableOpacity onPress={() => { const d = new Date(newBreakStartCalendarMonth); d.setMonth(d.getMonth() - 1); setNewBreakStartCalendarMonth(d); }} style={styles.calendarNavButton}><ChevronLeft size={20} color={FG} /></TouchableOpacity>
                    <Text style={styles.calendarMonthTitle}>{newBreakStartCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                    <TouchableOpacity onPress={() => { const d = new Date(newBreakStartCalendarMonth); d.setMonth(d.getMonth() + 1); setNewBreakStartCalendarMonth(d); }} style={styles.calendarNavButton}><ChevronRight size={20} color={FG} /></TouchableOpacity>
                  </View>
                  <View style={styles.calendarYearRow}>
                    <TouchableOpacity onPress={() => { const d = new Date(newBreakStartCalendarMonth); d.setFullYear(d.getFullYear() - 1); setNewBreakStartCalendarMonth(d); }} style={styles.calendarNavButton}><Text style={styles.calendarYearLink}>← Year</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { const today = new Date(); setNewBreakStartCalendarMonth(today); setNewBreakStart(toLocalYYYYMMDD(today)); setShowNewBreakStartPicker(false); }} style={styles.calendarNavButton}><Text style={[styles.calendarYearLink, { textDecorationLine: 'underline' }]}>Today</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { const d = new Date(newBreakStartCalendarMonth); d.setFullYear(d.getFullYear() + 1); setNewBreakStartCalendarMonth(d); }} style={styles.calendarNavButton}><Text style={styles.calendarYearLink}>Year →</Text></TouchableOpacity>
                  </View>
                  <View style={styles.calendarDayHeaders}>{WEEKDAY_LABELS.map((day) => (<View key={day} style={styles.calendarDayHeader}><Text style={styles.calendarDayHeaderText}>{day}</Text></View>))}</View>
                  {(() => {
                    const year = newBreakStartCalendarMonth.getFullYear(); const month = newBreakStartCalendarMonth.getMonth();
                    const firstDay = new Date(year, month, 1); const startDateGrid = new Date(firstDay); startDateGrid.setDate(startDateGrid.getDate() - startDateGrid.getDay());
                    const days = []; const current = new Date(startDateGrid); for (let i = 0; i < 42; i++) { days.push(new Date(current)); current.setDate(current.getDate() + 1); }
                    return (<View>{[0, 1, 2, 3, 4, 5].map((week) => (<View key={week} style={styles.calendarWeekRow}>{days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                      const isCurrentMonth = day.getMonth() === month; const ymd = toLocalYYYYMMDD(day); const isSelected = newBreakStart === ymd; const isToday = ymd === toLocalYYYYMMDD(new Date());
                      return (<TouchableOpacity key={idx} onPress={() => { setNewBreakStart(ymd); setShowNewBreakStartPicker(false); }} style={[styles.calendarDayCell, isSelected && styles.calendarDayCellSelected, isToday && !isSelected && styles.calendarDayCellToday]}>
                        <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, !isCurrentMonth && styles.calendarDayTextMuted]}>{day.getDate()}</Text>
                      </TouchableOpacity>); })}</View>))}</View>);
                  })()}
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}

          {/* Custom Break End Date Calendar Picker */}
          {showNewBreakEndPicker && (
            <Modal animationType="fade" transparent visible={showNewBreakEndPicker} onRequestClose={() => setShowNewBreakEndPicker(false)}>
              <TouchableOpacity style={styles.calendarOverlay} activeOpacity={1} onPress={() => setShowNewBreakEndPicker(false)}>
                <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.calendarModal}>
                  <View style={styles.calendarNavRow}>
                    <TouchableOpacity onPress={() => { const d = new Date(newBreakEndCalendarMonth); d.setMonth(d.getMonth() - 1); setNewBreakEndCalendarMonth(d); }} style={styles.calendarNavButton}><ChevronLeft size={20} color={FG} /></TouchableOpacity>
                    <Text style={styles.calendarMonthTitle}>{newBreakEndCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                    <TouchableOpacity onPress={() => { const d = new Date(newBreakEndCalendarMonth); d.setMonth(d.getMonth() + 1); setNewBreakEndCalendarMonth(d); }} style={styles.calendarNavButton}><ChevronRight size={20} color={FG} /></TouchableOpacity>
                  </View>
                  <View style={styles.calendarYearRow}>
                    <TouchableOpacity onPress={() => { const d = new Date(newBreakEndCalendarMonth); d.setFullYear(d.getFullYear() - 1); setNewBreakEndCalendarMonth(d); }} style={styles.calendarNavButton}><Text style={styles.calendarYearLink}>← Year</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { const today = new Date(); setNewBreakEndCalendarMonth(today); setNewBreakEnd(toLocalYYYYMMDD(today)); setShowNewBreakEndPicker(false); }} style={styles.calendarNavButton}><Text style={[styles.calendarYearLink, { textDecorationLine: 'underline' }]}>Today</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { const d = new Date(newBreakEndCalendarMonth); d.setFullYear(d.getFullYear() + 1); setNewBreakEndCalendarMonth(d); }} style={styles.calendarNavButton}><Text style={styles.calendarYearLink}>Year →</Text></TouchableOpacity>
                  </View>
                  <View style={styles.calendarDayHeaders}>{WEEKDAY_LABELS.map((day) => (<View key={day} style={styles.calendarDayHeader}><Text style={styles.calendarDayHeaderText}>{day}</Text></View>))}</View>
                  {(() => {
                    const year = newBreakEndCalendarMonth.getFullYear(); const month = newBreakEndCalendarMonth.getMonth();
                    const firstDay = new Date(year, month, 1); const startDateGrid = new Date(firstDay); startDateGrid.setDate(startDateGrid.getDate() - startDateGrid.getDay());
                    const days = []; const current = new Date(startDateGrid); for (let i = 0; i < 42; i++) { days.push(new Date(current)); current.setDate(current.getDate() + 1); }
                    return (<View>{[0, 1, 2, 3, 4, 5].map((week) => (<View key={week} style={styles.calendarWeekRow}>{days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                      const isCurrentMonth = day.getMonth() === month; const ymd = toLocalYYYYMMDD(day); const isSelected = newBreakEnd === ymd; const isToday = ymd === toLocalYYYYMMDD(new Date());
                      return (<TouchableOpacity key={idx} onPress={() => { setNewBreakEnd(ymd); setShowNewBreakEndPicker(false); }} style={[styles.calendarDayCell, isSelected && styles.calendarDayCellSelected, isToday && !isSelected && styles.calendarDayCellToday]}>
                        <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, !isCurrentMonth && styles.calendarDayTextMuted]}>{day.getDate()}</Text>
                      </TouchableOpacity>); })}</View>))}</View>);
                  })()}
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}

          {/* Apply from date calendar picker (edit plan: apply block changes from this date forward) */}
          {showApplyFromDatePicker && startDate && endDate && (
            <Modal animationType="fade" transparent visible={showApplyFromDatePicker} onRequestClose={() => setShowApplyFromDatePicker(false)}>
              <TouchableOpacity style={styles.calendarOverlay} activeOpacity={1} onPress={() => setShowApplyFromDatePicker(false)}>
                <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.calendarModal}>
                  <Text style={[styles.eligibilityCardTitle, { marginBottom: 12 }]}>{STRINGS.planMyYear.applyFrom?.fromDate ?? 'Apply from date forward'}</Text>
                  <View style={styles.calendarNavRow}>
                    <TouchableOpacity onPress={() => { const d = new Date(applyFromDateCalendarMonth); d.setMonth(d.getMonth() - 1); setApplyFromDateCalendarMonth(d); }} style={styles.calendarNavButton}><ChevronLeft size={20} color={FG} /></TouchableOpacity>
                    <Text style={styles.calendarMonthTitle}>{applyFromDateCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                    <TouchableOpacity onPress={() => { const d = new Date(applyFromDateCalendarMonth); d.setMonth(d.getMonth() + 1); setApplyFromDateCalendarMonth(d); }} style={styles.calendarNavButton}><ChevronRight size={20} color={FG} /></TouchableOpacity>
                  </View>
                  <View style={styles.calendarYearRow}>
                    <TouchableOpacity onPress={() => { const d = new Date(applyFromDateCalendarMonth); d.setFullYear(d.getFullYear() - 1); setApplyFromDateCalendarMonth(d); }} style={styles.calendarNavButton}><Text style={styles.calendarYearLink}>← Year</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { const today = new Date(); setApplyFromDateCalendarMonth(today); setApplyFromDate(toLocalYYYYMMDD(today)); setApplyFromMode('date'); setShowApplyFromDatePicker(false); }} style={styles.calendarNavButton}><Text style={[styles.calendarYearLink, { textDecorationLine: 'underline' }]}>Today</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { const d = new Date(applyFromDateCalendarMonth); d.setFullYear(d.getFullYear() + 1); setApplyFromDateCalendarMonth(d); }} style={styles.calendarNavButton}><Text style={styles.calendarYearLink}>Year →</Text></TouchableOpacity>
                  </View>
                  <View style={styles.calendarDayHeaders}>{WEEKDAY_LABELS.map((day) => (<View key={day} style={styles.calendarDayHeader}><Text style={styles.calendarDayHeaderText}>{day}</Text></View>))}</View>
                  {(() => {
                    const year = applyFromDateCalendarMonth.getFullYear(); const month = applyFromDateCalendarMonth.getMonth();
                    const firstDay = new Date(year, month, 1); const startDateGrid = new Date(firstDay); startDateGrid.setDate(startDateGrid.getDate() - startDateGrid.getDay());
                    const days = []; const current = new Date(startDateGrid); for (let i = 0; i < 42; i++) { days.push(new Date(current)); current.setDate(current.getDate() + 1); }
                    const planStart = new Date(startDate + 'T12:00:00'); const planEnd = new Date(endDate + 'T12:00:00');
                    return (<View>{[0, 1, 2, 3, 4, 5].map((week) => (<View key={week} style={styles.calendarWeekRow}>{days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                      const isCurrentMonth = day.getMonth() === month; const ymd = toLocalYYYYMMDD(day); const isSelected = applyFromDate === ymd; const isToday = ymd === toLocalYYYYMMDD(new Date());
                      const dayTime = day.getTime(); const inRange = dayTime >= planStart.getTime() && dayTime <= planEnd.getTime();
                      return (<TouchableOpacity key={idx} onPress={() => { if (inRange) { setApplyFromDate(ymd); setApplyFromMode('date'); setShowApplyFromDatePicker(false); } }} style={[styles.calendarDayCell, isSelected && styles.calendarDayCellSelected, isToday && !isSelected && styles.calendarDayCellToday, !inRange && { opacity: 0.4 }]} disabled={!inRange}>
                        <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, !isCurrentMonth && styles.calendarDayTextMuted]}>{day.getDate()}</Text>
                      </TouchableOpacity>); })}</View>))}</View>);
                  })()}
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}

          {/* Footer - Build Curriculum style: Cancel + rounded primary, no icons. Hidden on entry choice and when showing plan summary. */}
          {!showEntryChoice &&
            !planSummaryYearId &&
            !(PLAN_MY_YEAR_LOGISTICS_FIRST && planStep === 'unit_structure' && !inlineUnitStructureFromSubjectDetail) &&
            !(PLAN_MY_YEAR_LOGISTICS_FIRST && planStep === 'logistics' && isHomeschool) && (
          <View style={[styles.footer, pickerOnly && styles.pickerFooter]}>
            {planStep === 'preview' ? (
              <View style={{ width: '100%' }}>
                {cadenceDirty ? renderApplyFromScopeCard() : null}
                {hasCadenceConflicts && canMoveAllCadenceFix ? (
                  <CadencePreviewConflictBulkBar
                    conflictCount={cadenceConflictEntryCount}
                    suggestedTimeLabel={cadenceBulkSuggestedTimeLabel}
                    canMoveAll={canMoveAllCadenceFix}
                    onMoveAll={handleFixAllCadenceConflicts}
                  />
                ) : null}
                <View style={styles.planYearPreviewFooterRow}>
                  <View style={[styles.planYearPreviewFooterSide, { alignItems: 'flex-start' }]}>
                    <TouchableOpacity
                      onPress={() =>
                        setPlanStep(
                          getPreviewBackStep(
                            PLAN_MY_YEAR_LOGISTICS_FIRST,
                            Boolean(unitStructureData?.units?.length) || Boolean(draftData || manualDraft),
                          ),
                        )
                      }
                      style={styles.cancelButton}
                    >
                      <Text style={styles.cancelText}>Back</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      styles.planYearGenerateCtaFooter,
                      (saving || loading) && styles.buttonDisabled,
                    ]}
                    onPress={handleApplyToCalendar}
                    disabled={saving || loading}
                    {...(Platform.OS === 'web' && {
                      cursor: saving || loading ? 'wait' : 'pointer',
                    })}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={BG} />
                    ) : (
                      <Text style={[styles.primaryButtonText, styles.primaryButtonTextAllCaps]}>
                        {academicYearId
                          ? STRINGS.planMyYear.primaryActions.updateSlots
                          : STRINGS.planMyYear.primaryActions.generateSlots}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <View style={styles.planYearPreviewFooterSide} />
                </View>
              </View>
            ) : pickerOnly ? (
              <>
                <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
                  <Text style={[styles.cancelText, styles.pickerCancelText]}>Cancel</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  onPress={() => setStartCreatingNew(true)}
                  style={styles.pickerCreateButton}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.pickerCreateButtonText}>Create new plan</Text>
                </TouchableOpacity>
              </>
            ) : planStep === 'source' && !PLAN_MY_YEAR_LOGISTICS_FIRST ? (
              <>
                <TouchableOpacity
                  onPress={() => {
                    if (PLAN_MY_YEAR_LOGISTICS_FIRST) {
                      setUnitFocusSubjectId(null);
                      setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                    } else {
                      onClose();
                    }
                  }}
                  style={styles.cancelButton}
                  onMouseEnter={Platform.OS === 'web' ? () => setFooterCancelHover(true) : undefined}
                  onMouseLeave={Platform.OS === 'web' ? () => setFooterCancelHover(false) : undefined}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={[styles.cancelText, footerCancelHover && Platform.OS === 'web' && { textDecorationLine: 'underline' }]}>
                    {PLAN_MY_YEAR_LOGISTICS_FIRST ? 'Back' : STRINGS.global.actions.cancel}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (planSource === 'placeholders' || (planSource === 'link' && !sourceUrl.trim())) ? styles.primaryButtonDisabled : undefined,
                  ]}
                  onPress={() => {
                    setPlanStep(
                      getSourceNextStep(PLAN_MY_YEAR_LOGISTICS_FIRST, Boolean(unitPipelineSubjectId)),
                    );
                  }}
                  disabled={planSource === 'placeholders' || (planSource === 'link' && !sourceUrl.trim())}
                >
                  <Text style={styles.primaryButtonText}>Next</Text>
                </TouchableOpacity>
              </>
            ) : planStep === 'unit_structure' &&
              (!PLAN_MY_YEAR_LOGISTICS_FIRST || inlineUnitStructureFromSubjectDetail) ? (
              <>
                <TouchableOpacity
                  onPress={() => {
                    // Manual input: Back from in-progress draft returns to logistics/method (not the builder).
                    if (planSource === 'paste' && (draftData || manualDraft)) {
                      setDraftData(null);
                      setManualDraft(null);
                      setUnitStructureStep('input');
                      setRawText('');
                      setExpandedUnits(new Set());
                      setExpandedUnitIndexManual(0);
                      setPlanStep(PLAN_MY_YEAR_LOGISTICS_FIRST ? PLAN_STEP_KEYS.LOGISTICS : 'source');
                      return;
                    }
                    if (draftData || manualDraft) {
                      if (Platform.OS === 'web' && (planSource === 'paste_plain' || planSource === 'upload')) {
                        importDraftFlushRef.current();
                      }
                      suppressManualCurriculumHydrateRef.current = true;
                      setDraftData(null);
                      if (planSource === 'paste' && !hasPersistedManualCurriculum) {
                        setManualDraft(createInitialManualDraft());
                        setExpandedUnitIndexManual(0);
                        setExpandedUnits(new Set([0]));
                      } else {
                        setManualDraft(null);
                        setExpandedUnits(new Set());
                        setExpandedUnitIndexManual(0);
                      }
                      leaveParsedDraftForTextEditor();
                      setPlanStep(PLAN_MY_YEAR_LOGISTICS_FIRST ? PLAN_STEP_KEYS.LOGISTICS : 'source');
                      setUnitFocusSubjectId(null);
                    } else {
                      setPlanStep(PLAN_MY_YEAR_LOGISTICS_FIRST ? PLAN_STEP_KEYS.LOGISTICS : 'source');
                    }
                  }}
                  style={styles.cancelButton}
                  onMouseEnter={Platform.OS === 'web' ? () => setFooterCancelHover(true) : undefined}
                  onMouseLeave={Platform.OS === 'web' ? () => setFooterCancelHover(false) : undefined}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={[styles.cancelText, footerCancelHover && Platform.OS === 'web' && { textDecorationLine: 'underline' }]}>
                    {s('global.actions.cancel')}
                  </Text>
                </TouchableOpacity>
                {(draftData || manualDraft) ? (
                  <View style={{ alignItems: 'stretch', flex: 1, minWidth: 0 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      const availableSubjectId = unitPipelineSubjectId;
                      const availableSubject = availableSubjectId ? baseSubjectList.find((s) => String(s.id) === String(availableSubjectId)) : null;
                      if (!availableSubject || !familyId) {
                        setUnitStructureError('Subject not found.');
                        return;
                      }
                      
                      setUnitStructureStep('saving');
                      setUnitStructureError(null);
                      try {
                        if (manualDraft) {
                          const availSlot =
                            s('planMyYear.multiSubjectUnits.availableInstructionalSlot') || 'Available slot';
                          const draftForCommit = mergeManualDraftWithInstructionalSlotDates(
                            JSON.parse(JSON.stringify(manualDraft)),
                            lessonSchedulePreviewPlan,
                            availSlot,
                          );
                          const { data, error: err } = await commitManualDraft({
                            subject_id: availableSubject?.id,
                            family_id: familyId,
                            subject_name: availableSubject?.name || '',
                            draft: draftForCommit,
                            builder_mode: 'rich_units',
                            replace_existing: true,
                            academic_year_id: academicYearId || undefined,
                            student_ids: allFamilyChildIds.map((id) => String(id)).filter(Boolean),
                          });
                          if (err || !data) {
                            setUnitStructureError(
                              err?.message || err?.detail || (typeof err === 'string' ? err : null) || 'Failed to save curriculum',
                            );
                            setUnitStructureStep('draft');
                            return;
                          }
                        } else if ((planSource === 'upload' || planSource === 'paste_plain') && draftData) {
                          // Save parsed / extracted draft (not manual `paste` path)
                          const { data, error: err } = await commitParsedDraft({
                            subject_id: availableSubject?.id,
                            family_id: familyId,
                            subject_name: availableSubject?.name || '',
                            draft: draftData,
                            academic_year_id: academicYearId || undefined,
                            student_ids: allFamilyChildIds.map((id) => String(id)).filter(Boolean),
                          });
                          if (err || !data) {
                            setUnitStructureError(err?.message || 'Failed to save curriculum');
                            setUnitStructureStep('draft');
                            return;
                          }
                          clearPlanYearImportDraft(
                            familyId,
                            availableSubjectId != null && String(availableSubjectId).trim() !== ''
                              ? String(availableSubjectId)
                              : 'none',
                            planSource,
                          );
                        } else if (planSource === 'generate' && draftData) {
                          const { data, error: err } = await commitGeneratedDraft({
                            subject_id: availableSubject?.id,
                            family_id: familyId,
                            subject_name: availableSubject?.name || '',
                            draft: draftData,
                          });
                          if (err || !data) {
                            setUnitStructureError(err?.message || 'Failed to save curriculum');
                            setUnitStructureStep('draft');
                            return;
                          }
                        } else {
                          setUnitStructureError('Nothing to save. Add content or pick Manual / Upload / Generate.');
                          setUnitStructureStep('draft');
                          return;
                        }

                        if (unitPipelineSubjectId) {
                          setLastSavedUnitSubjectId(unitPipelineSubjectId);
                        }
                        
                        // Clear draft and move to schedule step (logistics in classic flow, preview when logistics-first)
                        setDraftData(null);
                        setManualDraft(null);
                        setUnitStructureStep('input');
                        setPlanStep(getAfterUnitStructureContinue(PLAN_MY_YEAR_LOGISTICS_FIRST));
                        // Refresh unit structure data
                        if (unitPipelineSubjectId) {
                          setLoadingUnitStructure(true);
                          const subjectId = unitPipelineSubjectId;
                          try {
                            const { data: structureData, error: structureErr } =
                              await fetchSubjectCurriculumEventsStructure(
                                familyId,
                                subjectId,
                                academicYearId || initialAcademicYearId || null
                              );
                            if (!structureErr && Array.isArray(structureData?.units)) {
                              setSavedContentSource(structureData?.saved_content_source ?? null);
                              setUnitStructureData({ units: structureData.units });
                            }
                          } finally {
                            setLoadingUnitStructure(false);
                          }
                        }
                        setCadenceDifferentMethodNotice(null);
                        suppressManualCurriculumHydrateRef.current = false;
                        bumpPlanSurfacesAfterMutation(academicYearId ?? null);
                      } catch (err) {
                        setUnitStructureError(err.message || 'Failed to save curriculum');
                        setUnitStructureStep('draft');
                      }
                    }}
                    style={[
                      styles.primaryButton,
                      (unitStructureStep === 'saving' ||
                        (manualDraft && getManualCommitValidationError(manualDraft))) &&
                        styles.primaryButtonDisabled,
                    ]}
                    disabled={
                      unitStructureStep === 'saving' ||
                      Boolean(manualDraft && getManualCommitValidationError(manualDraft))
                    }
                    {...(Platform.OS === 'web' && {
                      cursor:
                        unitStructureStep === 'saving' ||
                        (manualDraft && getManualCommitValidationError(manualDraft))
                          ? 'not-allowed'
                          : 'pointer',
                    })}
                  >
                    {unitStructureStep === 'saving' ? (
                      <>
                        <ActivityIndicator size="small" color={BG} style={{ marginRight: 8 }} />
                        <Text style={styles.primaryButtonText}>{s('global.status.saving')}</Text>
                      </>
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {manualDraft && hasPersistedManualCurriculum
                          ? unitStructureSaveManualChangesLabel
                          : unitStructureSaveDraftLabel}
                      </Text>
                    )}
                  </TouchableOpacity>
                  </View>
                ) : hasPersistedManualCurriculum ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <TouchableOpacity
                      onPress={() => {
                        setPlanStep(getAfterUnitStructureContinue(PLAN_MY_YEAR_LOGISTICS_FIRST));
                      }}
                      style={{ paddingVertical: 10, paddingHorizontal: 8 }}
                      {...(Platform.OS === 'web' && { type: 'button', cursor: 'pointer' })}
                    >
                      <Text style={{ fontSize: 15, fontWeight: '600', color: SUB }}>
                        {t('planMyYear.multiSubjectUnits.savedManualCurriculumFooterBackToBuilder')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        suppressManualCurriculumHydrateRef.current = false;
                        const next = manualDraftFromUnitStructureData(unitStructureData);
                        if (next) {
                          setManualDraft(next);
                          setExpandedUnitIndexManual(0);
                          setExpandedUnits(new Set([0]));
                        }
                      }}
                      style={{
                        backgroundColor: EVENT_DETAILS_PRIMARY_BG,
                        paddingVertical: 12,
                        paddingHorizontal: 20,
                        borderRadius: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        ...(Platform.OS === 'web' && { boxShadow: '0 2px 6px rgba(133,196,242,0.3)' }),
                      }}
                      activeOpacity={0.9}
                      {...(Platform.OS === 'web' && { type: 'button', cursor: 'pointer' })}
                    >
                      <Text style={EDIT_UNITS_PRIMARY_BUTTON_TEXT}>
                        {t('planMyYear.multiSubjectUnits.savedManualCurriculumFooterEditUnits')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : showGenerateCurriculumFooter ? (
                  <TouchableOpacity
                    onPress={runGenerateCurriculumDraft}
                    disabled={generating}
                    style={[styles.primaryButton, generating && styles.primaryButtonDisabled]}
                    {...(Platform.OS === 'web' && {
                      cursor: generating ? 'not-allowed' : 'pointer',
                    })}
                  >
                    {generating ? (
                      <>
                        <ActivityIndicator size="small" color={BG} style={{ marginRight: 8 }} />
                        <Text style={styles.primaryButtonText}>
                          {t('planMyYear.multiSubjectUnits.generateAndPreviewLoading')}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {t('planMyYear.multiSubjectUnits.generateAndPreview')}
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : showUploadMaterialPreviewFooter ? (
                  <TouchableOpacity
                    onPress={runUploadMaterialParse}
                    disabled={parsing || !selectedMaterialId}
                    style={[
                      styles.primaryButton,
                      (parsing || !selectedMaterialId) && styles.primaryButtonDisabled,
                    ]}
                    {...(Platform.OS === 'web' && {
                      cursor: parsing || !selectedMaterialId ? 'not-allowed' : 'pointer',
                    })}
                  >
                    {parsing ? (
                      <>
                        <ActivityIndicator size="small" color={BG} style={{ marginRight: 8 }} />
                        <Text style={styles.primaryButtonText}>
                          {t('planMyYear.multiSubjectUnits.importPreviewStructureLoading')}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {t('planMyYear.multiSubjectUnits.importPreviewStructure')}
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : hideFooterSkipForPasteImportInput ? null : (
                  <TouchableOpacity
                    onPress={() => setPlanStep(getAfterUnitStructureContinue(PLAN_MY_YEAR_LOGISTICS_FIRST))}
                    style={styles.primaryButton}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={styles.primaryButtonText}>
                      {unitStructureSkipDraftLabel}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
            <TouchableOpacity
              onPress={() => {
                if (editingFromSummary) {
                  setPlanSummaryYearId(academicYearId);
                  setPlanSummaryData(planSummaryCacheRef.current.get(academicYearId) || null);
                  setShowPlanManagerView(true);
                  setEditingFromSummary(false);
                } else if (PLAN_MY_YEAR_LOGISTICS_FIRST) {
                  onClose();
                } else {
                  // Go back to unit_structure if we have curriculum data, otherwise to source
                  if (unitStructureData && unitStructureData.units && unitStructureData.units.length > 0) {
                    setPlanStep('unit_structure');
                  } else {
                    setPlanStep('source');
                  }
                }
              }}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>Back</Text>
            </TouchableOpacity>
            {isHomeschool ? (
              (planSource === 'upload' && onOpenBuildCurriculum) || planSource === 'link' || planSource === 'paste' ? (
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (saving || loading || (planSource === 'upload' && !selectedMaterialId) || (planSource === 'link' && !sourceUrl.trim()) || (planSource === 'paste' && !pastedText.trim())) && styles.buttonDisabled,
                  ]}
                  onPress={handleCreateUnitAndSchedule}
                  disabled={saving || loading || (planSource === 'upload' && !selectedMaterialId) || (planSource === 'link' && !sourceUrl.trim()) || (planSource === 'paste' && !pastedText.trim())}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={BG} />
                  ) : (
                    <Text style={styles.primaryButtonText}>{STRINGS.buildCurriculum?.actions?.createUnitAndSchedule ?? 'Create unit & schedule'}</Text>
                  )}
                </TouchableOpacity>
              ) : PLAN_MY_YEAR_LOGISTICS_FIRST ? (
                <TouchableOpacity
                  style={[styles.primaryButton, !preconditionsMet && styles.buttonDisabled]}
                  onPress={() => setPlanStep(PLAN_STEP_KEYS.PREVIEW)}
                  disabled={!preconditionsMet}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.primaryButtonText}>{t('planMyYear.multiSubjectUnits.nextContinueToReview')}</Text>
                </TouchableOpacity>
              ) : (
            <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (saving || loading || !preconditionsMet || !feasible) && styles.buttonDisabled,
                ]}
                onPress={() => setPlanStep('preview')}
                disabled={saving || loading || !preconditionsMet || !feasible}
              >
                <Text style={styles.primaryButtonText}>Preview selected days/times</Text>
              </TouchableOpacity>
              )
            ) : PLAN_MY_YEAR_LOGISTICS_FIRST ? (
              <TouchableOpacity
                style={[styles.primaryButton, !preconditionsMet && styles.buttonDisabled]}
                onPress={() => setPlanStep(PLAN_STEP_KEYS.PREVIEW)}
                disabled={!preconditionsMet}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.primaryButtonText}>{t('planMyYear.multiSubjectUnits.nextContinueToReview')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.primaryButton, saving && styles.buttonDisabled]}
              onPress={() => handleSave(false)}
              disabled={saving || loading}
            >
              {saving ? (
                <ActivityIndicator size="small" color={BG} />
              ) : (
                  <Text style={styles.primaryButtonText}>Save</Text>
              )}
            </TouchableOpacity>
            )}
              </>
            )
          }
          </View>
          )}
        </TouchableOpacity>
  );

  const uploadAddMaterialModalEl = familyId ? (
    <AddMaterialModal
      visible={showAddMaterialForUpload}
      onClose={() => setShowAddMaterialForUpload(false)}
      onSaved={(saved) => {
        loadMaterialsForUpload();
        if (saved?.id) setSelectedMaterialId(saved.id);
      }}
      familyId={familyId}
      children={children}
      allSubjects={baseSubjectList}
      defaultSubjectId={unitPipelineSubjectId || null}
      defaultSubjectName={
        unitPipelineSubjectId
          ? baseSubjectList.find((s) => String(s.id) === String(unitPipelineSubjectId))?.name
          : null
      }
    />
  ) : null;

  if (renderInline) {
    return (
      <View style={{ flex: 1, minHeight: 0, width: '100%', minWidth: 0 }}>
        {modalContent}
      {renderPlanListContextMenuPortal()}
      <ConfirmDialog
        visible={showDeletePlanConfirm}
        title="Delete plan?"
        message="This will permanently remove this plan and its instructional slots from the calendar. You cannot undo this."
        confirmLabel="Delete plan"
        cancelLabel={STRINGS.global.actions.cancel}
        destructive={true}
        onConfirm={async () => {
          setShowDeletePlanConfirm(false);
          if (!planSummaryYearId || !familyId) return;
          setDeletingPlan(true);
          try {
            const { data, error } = await clearPlaceholders(familyId, planSummaryYearId, { deletePlan: true });
            if (error) {
              toast.push(error.message || 'Failed to delete plan.', 'error');
              return;
            }
            if (data?.plan_deleted) {
              planSummaryCacheRef.current.delete(planSummaryYearId);
              summaryFetchInFlightRef.current.delete(planSummaryYearId);
              dropPlanEditListTimesCacheEntry(familyId, planSummaryYearId);
              setPlanListRowTimesById((prev) => {
                const next = { ...prev };
                delete next[planSummaryYearId];
                return next;
              });
              setPreviousPlans((prev) => {
                const next = prev.filter((p) => String(p.id) !== String(planSummaryYearId));
                if (familyId) setAcademicYearsPickerCache(familyId, next);
                return next;
              });
              setPlanSummaryYearId(null);
              setPlanSummaryData(null);
              setPlanSummaryError(null);
              toast.push('Plan deleted.', 'success');
              if (typeof window !== 'undefined') {
                invalidatePlanHealthCache();
                window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
                window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { academicYearId: planSummaryYearId } }));
                window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
                setTimeout(() => window.dispatchEvent(new CustomEvent('refreshCalendar')), 150);
              }
              onClose?.();
            }
          } finally {
            setDeletingPlan(false);
          }
        }}
        onCancel={() => setShowDeletePlanConfirm(false)}
      />
      {uploadAddMaterialModalEl}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        {modalContent}
      </TouchableOpacity>
      {renderPlanListContextMenuPortal()}
      <ConfirmDialog
        visible={showDeletePlanConfirm}
        title="Delete plan?"
        message="This will permanently remove this plan and its instructional slots from the calendar. You cannot undo this."
        confirmLabel="Delete plan"
        cancelLabel={STRINGS.global.actions.cancel}
        destructive={true}
        onConfirm={async () => {
          setShowDeletePlanConfirm(false);
          if (!planSummaryYearId || !familyId) return;
          setDeletingPlan(true);
          try {
            const { data, error } = await clearPlaceholders(familyId, planSummaryYearId, { deletePlan: true });
            if (error) {
              toast.push(error.message || 'Failed to delete plan.', 'error');
              return;
            }
            if (data?.plan_deleted) {
              planSummaryCacheRef.current.delete(planSummaryYearId);
              summaryFetchInFlightRef.current.delete(planSummaryYearId);
              dropPlanEditListTimesCacheEntry(familyId, planSummaryYearId);
              setPlanListRowTimesById((prev) => {
                const next = { ...prev };
                delete next[planSummaryYearId];
                return next;
              });
              setPreviousPlans((prev) => {
                const next = prev.filter((p) => String(p.id) !== String(planSummaryYearId));
                if (familyId) setAcademicYearsPickerCache(familyId, next);
                return next;
              });
              setPlanSummaryYearId(null);
              setPlanSummaryData(null);
              setPlanSummaryError(null);
              toast.push('Plan deleted.', 'success');
              if (typeof window !== 'undefined') {
                invalidatePlanHealthCache();
                window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
                window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { academicYearId: planSummaryYearId } }));
                window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
                setTimeout(() => window.dispatchEvent(new CustomEvent('refreshCalendar')), 150);
              }
              onClose?.();
            }
          } finally {
            setDeletingPlan(false);
          }
        }}
        onCancel={() => setShowDeletePlanConfirm(false)}
      />
      {uploadAddMaterialModalEl}
    </Modal>
  );
}

const PICKER_CARD_BG = '#F8FBFF';
const PICKER_CARD_BORDER = '#E3EEF8';
const PICKER_OR_COLOR = '#94A3B8';
const PICKER_CREATE_BG = '#81C1E1';
const PICKER_CREATE_HOVER = '#6FB4D8';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  // Removed overlayBlur: app shell/sidebar use .glass (backdrop-filter), so modal blur stacked = double blur. Use dim only.
  pickerOverlay: {
    // Reserved for picker-specific overlay tweaks if needed
  },
  pickerModal: {
    maxWidth: 640,
    width: '100%',
    paddingHorizontal: 40,
    paddingTop: 20,
    paddingBottom: 36,
    borderRadius: 28,
  },
  pickerModalPlanSummary: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  pickerHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
    backgroundColor: SURFACE_ELEVATED,
  },
  entryChoiceBody: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 14,
  },
  entryChoiceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  entryChoiceSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: MUTED,
    textAlign: 'center',
    marginBottom: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  entryChoiceButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  entryChoiceIcon: {
    marginRight: 12,
  },
  entryChoiceButtonSecondary: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    backgroundColor: SURFACE_ELEVATED,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  entryChoiceButtonPrimary: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 0,
    backgroundColor: PRIMARY_BTN,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      backgroundImage: `linear-gradient(135deg, ${PRIMARY_BTN}, #9DD1F7)`,
    }),
  },
  entryChoiceButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: FG,
    marginBottom: 2,
  },
  entryChoiceButtonSubtext: {
    fontSize: 13,
    color: TEXT_SECONDARY,
  },
  entryChoiceButtonTextPrimary: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  entryChoiceButtonSubtextPrimary: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.92)',
  },
  pickerBody: {
    flex: 1,
    minHeight: 0,
  },
  pickerLoading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  pickerHeaderTextBlock: {
    flex: 1,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: FG,
    marginBottom: 2,
  },
  pickerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: MUTED,
  },
  pickerDivider: {
    height: 1,
    backgroundColor: CARD_BORDER,
    marginBottom: 16,
  },
  planCard: {
    backgroundColor: PICKER_CARD_BG,
    borderWidth: 1,
    borderColor: PICKER_CARD_BORDER,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 20,
    ...(Platform.OS === 'web' && {
      transition: 'border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease',
    }),
  },
  planCardSelected: {
    backgroundColor: 'rgba(79,140,255,0.08)',
    borderColor: 'rgba(79,140,255,0.4)',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 8px 20px rgba(0,0,0,0.05)',
    }),
    ...(Platform.OS !== 'web' && {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 4,
    }),
  },
  planListItem: {
    paddingVertical: 18,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
  },
  planListItemSelected: {
    backgroundColor: 'rgba(79,140,255,0.06)',
  },
  planListItemMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    minWidth: 0,
  },
  planListItemLeft: {
    flex: 1,
    minWidth: 0,
  },
  planListItemRight: {
    alignItems: 'flex-end',
    flexShrink: 0,
    maxWidth: '46%',
  },
  planCardDateRight: {
    fontSize: 13,
    fontWeight: '400',
    color: MUTED,
    textAlign: 'right',
  },
  planCardTimesSubline: {
    fontSize: 12,
    fontWeight: '500',
    color: MUTED,
    textAlign: 'right',
    marginTop: 4,
    lineHeight: 16,
  },
  planCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    minWidth: 0,
  },
  planCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: FG,
    flex: 1,
    minWidth: 0,
  },
  planCardDateInline: {
    fontSize: 13,
    fontWeight: '400',
    color: MUTED,
    flexShrink: 0,
  },
  planCardChildRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  planCardChildrenDotsCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  planCardChildDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    flexShrink: 0,
  },
  planCardOwner: {
    fontSize: 13,
    fontWeight: '500',
    color: MUTED,
    flex: 1,
    minWidth: 0,
  },
  planCardDate: {
    fontSize: 13,
    color: MUTED,
  },
  planSummaryHeaderRow: {
    paddingVertical: 16,
    paddingHorizontal: 0,
    marginBottom: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planSummaryModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: FG,
    flex: 1,
    marginRight: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  planSummaryDivider: {
    height: 1,
    backgroundColor: CARD_BORDER,
    marginBottom: 16,
    marginHorizontal: -20,
    alignSelf: 'stretch',
  },
  planSummaryContentContainer: {
    paddingTop: 4,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  modalPlanSummaryColumn: {
    flex: 1,
    flexDirection: 'column',
    minHeight: 0,
    ...(Platform.OS === 'web' && { display: 'flex' }),
  },
  planSummaryScrollFlex: {
    flex: 1,
    minHeight: 0,
  },
  planSummaryContentGrow: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  planSummaryHeaderOuter: {
    paddingTop: 12,
    paddingBottom: 12,
    alignSelf: 'stretch',
  },
  /** Back + title + actions on one row (no stacked gap under the arrow) */
  planSummaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  planSummaryBackButton: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    marginRight: 2,
    borderRadius: 8,
    flexShrink: 0,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  planSummaryTitleInRow: {
    flex: 1,
    minWidth: 0,
    marginRight: 0,
  },
  planSummaryTopBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    flexShrink: 0,
    justifyContent: 'flex-end',
  },
  /** Match subject empty-state pills (Add Lesson / Plan my year) */
  planSummaryPlainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#F9FAFB',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  planSummaryPlainButtonDisabled: {
    opacity: 0.5,
  },
  planSummaryPlainButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  planSummaryDateRowTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  planSummaryDateRowTextStruck: {
    opacity: 0.52,
    color: MUTED,
    textDecorationLine: 'line-through',
    ...(Platform.OS === 'web' && {
      textDecorationThickness: '0.08em',
      textDecorationColor: 'rgba(100,116,139,0.85)',
    }),
  },
  planSummaryDateRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    flexShrink: 0,
  },
  planSummaryRowActionBtn: {
    padding: 6,
    borderRadius: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  planSummaryPadded: {
    paddingHorizontal: 40,
  },
  planSummaryDividerFullWrap: {
    marginBottom: 12,
    alignSelf: 'stretch',
  },
  planSummaryDividerFull: {
    height: 1,
    backgroundColor: CARD_BORDER,
    width: '100%',
  },
  planSummaryDatesSectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: MUTED,
    marginBottom: 4,
  },
  planSummaryDatesList: {
    paddingHorizontal: 40,
    paddingBottom: 24,
    flexGrow: 1,
  },
  planSummaryDateRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
  },
  planSummaryDateRowInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  planSummaryDateRowText: {
    flex: 1,
    fontSize: 14,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  planSummaryDateRowAttachment: {
    flexShrink: 0,
    paddingLeft: 4,
  },
  planSummaryFooterStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: SURFACE_ELEVATED,
    borderTopWidth: 1,
    borderTopColor: BORDER_SUBTLE,
    marginTop: 12,
  },
  planSummaryFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planSummaryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 12,
    minHeight: 0,
  },
  planSummaryFooterButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: PRIMARY_BTN,
    ...(Platform.OS === 'web' && {
      backgroundImage: `linear-gradient(135deg, ${PRIMARY_BTN}, #9DD1F7)`,
      boxShadow: '0 12px 30px rgba(133,196,242,0.35)',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      cursor: 'pointer',
    }),
  },
  planSummaryFooterButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  planSummaryFooterBack: {
    paddingVertical: 10,
    paddingHorizontal: 0,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  planSummaryField: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 10,
    minWidth: 0,
  },
  planSummaryFieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: MUTED,
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  planSummaryFieldValue: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#e0f2fe',
    alignSelf: 'flex-start',
  },
  planSummaryFieldValueText: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  planCardLine1: {
    fontSize: 13,
    fontWeight: '500',
    color: MUTED,
    marginBottom: 2,
  },
  planCardLine2: {
    fontSize: 16,
    fontWeight: '600',
    color: FG,
    marginBottom: 2,
  },
  planCardLine3: {
    fontSize: 13,
    color: MUTED,
  },
  pickerOr: {
    fontSize: 12,
    color: PICKER_OR_COLOR,
    letterSpacing: 0.04,
    textTransform: 'uppercase',
    fontWeight: '500',
    textAlign: 'center',
  },
  pickerCreateButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: PRIMARY_BTN,
    ...(Platform.OS === 'web' && {
      backgroundImage: `linear-gradient(135deg, ${PRIMARY_BTN}, #9DD1F7)`,
      boxShadow: '0 12px 30px rgba(133,196,242,0.35)',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    }),
  },
  pickerCreateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pickerFooter: {
    borderTopWidth: 1,
    borderTopColor: BORDER_SUBTLE,
    paddingVertical: 16,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: SURFACE_ELEVATED,
    gap: 12,
  },
  pickerCancelText: {
    color: PICKER_OR_COLOR,
    fontWeight: '500',
  },
  modal: {
    width: Platform.OS === 'web' ? 760 : '100%',
    maxWidth: '100%',
    width: 760,
    maxWidth: '100%',
    maxHeight: Platform.OS === 'web' ? '90vh' : '90%',
    backgroundColor: BG,
    borderRadius: 24,
    ...Platform.select({
      web: {
        boxShadow: '0 30px 60px rgba(0, 0, 0, 0.12), 0 10px 30px rgba(0, 0, 0, 0.08)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
        elevation: 12,
      },
    }),
    overflow: 'hidden',
  },
  /** Logistics-first main form: flush edges, no card shadow (sits flat in layout). */
  modalFlatLf: {
    borderRadius: 0,
    ...Platform.select({
      web: {
        boxShadow: 'none',
      },
      default: {
        elevation: 0,
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
    backgroundColor: SURFACE_ELEVATED,
  },
  modalHeaderLeft: { flex: 1, minWidth: 0 },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalHeaderIconWrap: {
    marginRight: 2,
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: FG,
    marginBottom: 2,
  },
  modalHeaderMeta: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    lineHeight: 20,
  },
  closeButtonHeader: { padding: 6, marginRight: -6 },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
    minWidth: 0,
  },
  breadcrumbStep: {
    fontSize: 17,
    fontWeight: '700',
    color: MUTED,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  breadcrumbStepCurrent: {
    color: BRAND_500,
    fontWeight: '700',
  },
  breadcrumbSeparator: {
    fontSize: 17,
    color: BORDER_STRONG,
    fontWeight: '400',
  },
  sectionProgress: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: CARD_PADDING,
    paddingVertical: 10,
    backgroundColor: BG,
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
  },
  sectionProgressStep: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '500',
  },
  sectionProgressStepCompleted: {
    color: FG,
    fontWeight: '600',
  },
  sectionProgressStepCurrent: {
    color: CHIP_SELECTED_TEXT,
    fontWeight: '600',
  },
  sectionProgressStepFuture: {
    color: MUTED,
    opacity: 0.7,
  },
  card: {
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    paddingTop: CARD_PADDING,
    paddingHorizontal: CARD_PADDING,
    paddingBottom: 12,
    marginBottom: SECTION_SPACING,
    ...(Platform.OS === 'web' && { boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }),
    ...(Platform.OS !== 'web' && { elevation: 2 }),
  },
  cardFlat: {
    paddingTop: CARD_PADDING,
    paddingHorizontal: CARD_PADDING,
    paddingBottom: 12,
    marginBottom: SECTION_SPACING,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryLabel: { fontSize: 13, color: SUB, marginBottom: 6 },
  summaryValue: { fontSize: 13, fontWeight: '600', color: FG },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  twoColumnHalf: {
    flex: 1,
    minWidth: 200,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: LABEL_INPUT_GAP,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    height: 36,
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    backgroundColor: BG,
  },
  chipSelected: {
    backgroundColor: CHIP_SELECTED_BG,
    borderColor: CHIP_SELECTED_BORDER,
    ...(Platform.OS === 'web' && { boxShadow: '0 1px 2px rgba(107,179,232,0.2)' }),
  },
  chipText: { fontSize: 13, color: SUB, fontWeight: '500' },
  chipTextSelected: { color: CHIP_SELECTED_TEXT, fontWeight: '700' },
  content: {
    flex: 1,
  },
  /** Match planner AttendanceView inner inset (attendance/constants TOKENS.contentPadX / contentPadY + bottom breathing room). */
  contentContainer: {
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 48,
  },
  /** Logistics-first unit overlay: align summary row with top-right close control (FAB top 14, h 40). */
  contentContainerUnitStructureOverlay: {
    paddingTop: 18,
    /** Tight bottom so in-scroll primary CTA (e.g. Preview structure) sits closer to footer Cancel. */
    paddingBottom: 12,
  },
  /** Match attendance YearHeatmapGrid “Year at a glance” title + help (TOKENS.sectionTitle / sectionHelp). */
  planYearGlanceHeaderWrap: {
    marginBottom: 20,
  },
  planYearGlanceTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(15, 23, 42, 0.92)',
    marginBottom: 8,
  },
  planYearGlanceHelp: {
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.62)',
    lineHeight: 18,
  },
  planEditingModeBanner: {
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: ELIGIBILITY_CARD_BG,
    borderWidth: 1,
    borderColor: ELIGIBILITY_CARD_BORDER,
  },
  planEditingModeBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 24,
    position: 'relative',
  },
  planEditingModeBannerLeft: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 1,
  },
  planEditingModeBannerCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planEditingModeBannerRight: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  subjectDetailPlanCloseBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: BG,
  },
  subjectDetailPlanCloseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#B8D7F9',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planEditingModeBannerLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: FG,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  planEditingModeBannerLink: {
    fontSize: 14,
    fontWeight: '600',
    color: ACCENT,
  },
  planListContentContainer: {
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 32,
  },
  /** Inline edit-plan list: same horizontal/top inset as build plan (contentContainer). */
  planListContentContainerInline: {
    paddingHorizontal: 32,
    paddingTop: 24,
    flexGrow: 1,
    width: '100%',
  },
  /** Empty "your plans" list: header + zero-row hint (no onboarding cards). */
  planListContentContainerEmpty: {
    flexGrow: 1,
    ...(Platform.OS === 'web' ? { minHeight: 240 } : {}),
  },
  planListScrollInline: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: FG,
    marginBottom: 4,
    marginTop: 0,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  /** Unit structure overlay / in-flow: headings only (League Spartan + all caps on web). */
  unitStructureModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: FG,
    marginBottom: 4,
    marginTop: 0,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  description: {
    fontSize: 13,
    color: SUB,
    marginBottom: 20,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  editButton: {
    padding: 12,
    backgroundColor: ACCENT_LIGHT,
    borderRadius: 8,
    marginBottom: 20,
  },
  editButtonText: {
    fontSize: 13,
    color: ACCENT,
    fontWeight: '500',
    textAlign: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  settingText: {
    fontSize: 13,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  customToggleTrack: {
    width: 52,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#d1d5db',
    paddingHorizontal: 2,
    paddingVertical: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  customToggleTrackOn: {
    backgroundColor: '#AECBFA',
  },
  customToggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#94A3B8',
    ...(Platform.OS === 'web' && {
      transition: 'transform 0.2s ease',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    }),
    ...(Platform.OS !== 'web' && {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
      elevation: 3,
    }),
  },
  customToggleThumbOn: {
    transform: [{ translateX: 24 }],
    backgroundColor: '#0D9488',
  },
  holidaySettingsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  modeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  modeButton: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    height: 36,
    minHeight: 36,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    backgroundColor: BG,
  },
  modeButtonActive: {
    backgroundColor: CHIP_SELECTED_BG,
    borderColor: CHIP_SELECTED_BORDER,
    ...(Platform.OS === 'web' && { boxShadow: '0 1px 2px rgba(107,179,232,0.2)' }),
  },
  modeButtonText: {
    fontSize: 13,
    color: SUB,
    fontWeight: '500',
  },
  modeButtonTextActive: {
    color: CHIP_SELECTED_TEXT,
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: 24,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  inputGroupFlex: {
    flex: 1,
    marginBottom: 0,
  },
  /** Add Event–style container: rounded gray block for related fields (e.g. Compliance, Holidays) */
  fieldSection: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#f9fafb',
  },
  fieldSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: FG,
    marginBottom: 10,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  /** Scope section: smaller, more subtle labels */
  logisticsLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: MUTED,
    marginBottom: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: FG,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: FG,
    backgroundColor: '#fafbfc',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  inputFocused: {
    borderColor: ACCENT,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  datePickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fafbfc',
  },
  datePickerTriggerText: {
    fontSize: 14,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  datePickerPlaceholder: {
    fontSize: 14,
    color: MUTED,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dateRangeCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    marginTop: 8,
    marginBottom: 4,
  },
  dateRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  dateRangeSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateRangeArrow: {
    padding: 4,
  },
  dateRangeDateWrap: {
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateRangeDate: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dateRangeArrowLabel: {
    fontSize: 14,
    color: MUTED,
    fontWeight: '500',
  },
  dateRangeTodayWrap: {
    marginTop: 6,
    alignSelf: 'center',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  dateNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },
  dateNavBarLabel: {
    fontSize: 12,
    color: MUTED,
    marginRight: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dateNavBarArrow: {
    padding: 4,
  },
  dateNavBarDateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateNavBarDate: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dateNavBarTodayWrap: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  dateNavBarToday: {
    fontSize: 12,
    color: MUTED,
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  selectContainer: {
    position: 'relative',
    zIndex: 1000,
    marginTop: 8,
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fafbfc',
    minHeight: 44,
  },
  selectTriggerText: {
    color: FG,
    fontSize: 14,
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  selectTriggerPlaceholder: {
    color: MUTED,
  },
  selectOptions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    maxHeight: 220,
    zIndex: 10001,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    }),
    ...(Platform.OS !== 'web' && { elevation: 10000 }),
  },
  selectOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  selectOptionActive: {
    backgroundColor: ACCENT_LIGHT,
  },
  selectOptionText: {
    color: FG,
    fontSize: 14,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  selectOptionTextActive: {
    fontWeight: '600',
    color: ACCENT,
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarModal: {
    backgroundColor: BG,
    borderRadius: 12,
    padding: 16,
    width: Platform.OS === 'web' ? 320 : '90%',
    maxWidth: 320,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' }
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 8,
        }),
  },
  calendarNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calendarNavButton: {
    padding: 4,
  },
  calendarMonthTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  calendarYearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  calendarYearLink: {
    fontSize: 12,
    color: SUB,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  calendarDayHeaders: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  calendarDayHeader: {
    flex: 1,
    alignItems: 'center',
  },
  calendarDayHeaderText: {
    fontSize: 12,
    color: SUB,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  calendarWeekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calendarDayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  calendarDayCellSelected: {
    backgroundColor: ACCENT,
  },
  calendarDayCellToday: {
    borderWidth: 2,
    borderColor: ACCENT,
  },
  calendarDayText: {
    fontSize: 13,
    color: FG,
  },
  calendarDayTextSelected: {
    color: BG,
    fontWeight: '600',
  },
  calendarDayTextMuted: {
    color: MUTED,
  },
  holidayInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  holidayAddButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#85C4F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonWithLabel: {
    width: undefined,
    height: undefined,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    flexShrink: 0,
  },
  scheduleBlocksContainer: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  scheduleBlocksInner: {
    marginTop: 0,
  },
  blockRow: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingBottom: 12,
    marginBottom: 12,
  },
  blockRowNoDivider: {
    borderBottomWidth: 0,
    marginBottom: 0,
    paddingBottom: 4,
  },
  blockRowSubject: {
    fontSize: 12,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  blockRowLine: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 10,
  },
  blockTimeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  collapsibleSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  holidayItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    marginBottom: 8,
  },
  weekdayChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  weekdayChipSmall: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: 20,
    backgroundColor: SURFACE_SUBTLE,
  },
  weekdayChipSmallActive: {
    borderColor: CHIP_SELECTED_BORDER,
    backgroundColor: CHIP_SELECTED_BG,
    ...(Platform.OS === 'web' && { boxShadow: '0 1px 2px rgba(107,179,232,0.2)' }),
  },
  weekdayChipSmallText: {
    fontSize: 12,
    color: SUB,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  weekdayChipSmallTextActive: {
    color: CHIP_SELECTED_TEXT,
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  blockTimeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  blockTimeField: {
    flex: 1,
    maxWidth: 100,
    minWidth: 90,
  },
  blockTimeLabel: {
    color: SUB,
    fontSize: 12,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  blockTimeInputWrap: {
    minHeight: 44,
    justifyContent: 'center',
  },
  holidayDate: {
    fontSize: 13,
    color: SUB,
    marginRight: 12,
    minWidth: 100,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  holidayName: {
    flex: 1,
    fontSize: 13,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  deleteButton: {
    padding: 4,
  },
  preconditionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  preconditionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: '#fafbfc',
  },
  preconditionLabel: {
    fontSize: 13,
    color: FG,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  preconditionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  preconditionButtonText: {
    fontSize: 13,
    color: ACCENT,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  preconditionWarning: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    marginBottom: 16,
  },
  preconditionWarningText: {
    fontSize: 13,
    color: ERROR,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  previewRow: {
    padding: 16,
    backgroundColor: ACCENT_LIGHT,
    borderRadius: 8,
    marginTop: 20,
  },
  previewSummary: {
    fontSize: 13,
    fontWeight: '600',
    color: FG,
    marginBottom: 6,
  },
  previewText: {
    fontSize: 13,
    color: FG,
    marginLeft: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  previewFeasibilityError: {
    fontSize: 13,
    color: ERROR,
  },
  previewFeasibilityOk: {
    fontSize: 13,
    color: SUCCESS,
  },
  radioRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  /** Match weekdayChipSmall — compact chips for Planning Preferences & shared patterns */
  radioOption: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: 20,
    backgroundColor: SURFACE_SUBTLE,
  },
  radioOptionActive: {
    backgroundColor: CHIP_SELECTED_BG,
    borderColor: CHIP_SELECTED_BORDER,
    ...(Platform.OS === 'web' && { boxShadow: '0 1px 2px rgba(107,179,232,0.2)' }),
  },
  /** Choose method option: no fixed height so label + description can wrap fully */
  sourceOptionCard: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: BG,
    minHeight: 56,
  },
  /** Flat variant for step 1 (no border) - legacy */
  sourceOptionCardFlat: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    alignSelf: 'stretch',
    backgroundColor: BG,
    minHeight: 56,
  },
  /** Step 1: content zone padding (horizontal matches AttendanceView) */
  sourceStepContent: {
    paddingHorizontal: 32,
    paddingTop: SECTION_GAP,
    paddingBottom: 24,
  },
  sourceSectionDivider: {
    height: 1,
    backgroundColor: BORDER_SUBTLE,
    marginBottom: 8,
  },
  sourceSectionLabel: {
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: MUTED,
    marginBottom: 8,
    fontWeight: '600',
  },
  sourceSectionDescription: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginBottom: 28,
    lineHeight: 20,
  },
  /** Selectable option tile - unselected */
  sourceOptionTile: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER_STRONG,
    backgroundColor: SURFACE_SUBTLE,
    minHeight: 56,
    position: 'relative',
    ...(Platform.OS === 'web' && {
      transition: 'border 0.12s ease, background-color 0.12s ease, box-shadow 0.12s ease, transform 0.12s ease',
      cursor: 'pointer',
    }),
  },
  sourceOptionTileSelected: {
    backgroundColor: BG,
    borderWidth: 2,
    borderColor: BRAND_500,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
    }),
    ...(Platform.OS !== 'web' && { elevation: 2 }),
  },
  sourceOptionTileHover: {
    ...(Platform.OS === 'web' && {
      backgroundColor: BG,
      borderColor: BORDER_STRONG,
    }),
    ...(Platform.OS === 'web' && { transform: [{ translateY: -1 }] }),
  },
  sourceOptionRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: BORDER_STRONG,
    marginRight: 12,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sourceOptionRadioSelected: {
    borderColor: BRAND_500,
    backgroundColor: BRAND_500,
  },
  sourceOptionRadioInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BG,
  },
  sourceOptionIconWrap: {
    marginRight: 12,
    marginTop: 2,
  },
  sourceOptionBody: { flex: 1, minWidth: 0 },
  sourceOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: FG,
  },
  sourceOptionBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#fef3c7',
  },
  sourceOptionBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#b45309',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sourceOptionDescription: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 20,
  },
  sourceOptionCheckWrap: {
    position: 'absolute',
    top: 18,
    right: 20,
  },
  radioLabel: {
    fontSize: 12,
    color: SUB,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  radioLabelActive: {
    color: CHIP_SELECTED_TEXT,
    fontWeight: '700',
  },
  childSelectRow: {
    marginTop: 12,
  },
  subjectSelectRow: {
    marginTop: 12,
  },
  childChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  subjectsChipsRow: {
    marginTop: 10,
  },
  childChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  subjectChipInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    flexShrink: 1,
  },
  subjectChipDotsCluster: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subjectChipChildDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  subjectChipLabelText: {
    flexShrink: 1,
    minWidth: 0,
  },
  childChipActive: {
    backgroundColor: CHIP_SELECTED_BG,
    borderColor: CHIP_SELECTED_BORDER,
    ...(Platform.OS === 'web' && { boxShadow: '0 1px 2px rgba(107,179,232,0.2)' }),
  },
  childChipText: {
    fontSize: 12,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childChipTextActive: { color: CHIP_SELECTED_TEXT, fontWeight: '700' },
  subjectChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: LABEL_INPUT_GAP,
  },
  subjectChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    height: 36,
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    backgroundColor: BG,
  },
  subjectChipActive: {
    backgroundColor: CHIP_SELECTED_BG,
    borderColor: CHIP_SELECTED_BORDER,
    ...(Platform.OS === 'web' && { boxShadow: '0 1px 2px rgba(107,179,232,0.2)' }),
  },
  subjectChipText: {
    fontSize: 13,
    color: SUB,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectChipTextActive: { color: CHIP_SELECTED_TEXT, fontWeight: '700' },
  mutedText: {
    fontSize: 13,
    color: MUTED,
    marginTop: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  resultBox: {
    padding: 16,
    backgroundColor: ACCENT_LIGHT,
    borderRadius: 8,
    marginTop: 20,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: FG,
    marginBottom: 8,
  },
  resultText: {
    fontSize: 13,
    color: FG,
    marginBottom: 4,
  },
  errorBox: {
    padding: 12,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: ERROR,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER_SUBTLE,
  },
  cancelButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cancelText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      textDecorationLine: 'none',
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  primaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    minHeight: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: PRIMARY_BTN,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 12px rgba(133, 196, 242, 0.35)',
      cursor: 'pointer',
    }),
    ...(Platform.OS !== 'web' && { elevation: 2 }),
  },
  primaryButtonDisabled: {
    opacity: 0.4,
    ...(Platform.OS === 'web' && { boxShadow: 'none' }),
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  /** Generate / Update slots — uppercase label, intrinsic width (not full-bleed). */
  primaryButtonTextAllCaps: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  planYearGenerateCta: {
    alignSelf: 'center',
    marginTop: 20,
  },
  /** Preview footer: left Back + centered primary (equal flex sides). */
  planYearPreviewFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  planYearPreviewFooterSide: {
    flex: 1,
  },
  planYearGenerateCtaFooter: {
    alignSelf: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.8,
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
  },
  eligibilityCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    backgroundColor: '#f9fafb',
  },
  eligibilityCardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    width: '100%',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eligibilityCardSecondary: {
    fontSize: 13,
    color: MUTED,
    marginTop: 2,
    width: '100%',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eligibilityCardFilled: {
    gap: 8,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: SUB,
  },
});
