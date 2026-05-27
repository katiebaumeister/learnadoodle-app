import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, Animated, Easing, ScrollView, StyleSheet, Modal, Switch } from 'react-native';
import { X, ChevronLeft, ChevronRight, ChevronDown, Plus, AlertCircle, Check, Calendar, MapPin, FileText, GraduationCap, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import AddSubjectModal from './AddSubjectModal';
import { logAddEvent } from '../app/services/plannerInstrumentation';
import { getMaterials } from '../lib/services/materialsClient';
import { useSession } from '../contexts/SessionContext';
import AddMaterialModal from './materials/AddMaterialModal';
import { apiRequest, pushEventToGoogleCalendar } from '../lib/apiClient';
import { Search } from 'lucide-react';
import { createAssignment, updateAssignment } from '../lib/services/assignmentsClient';
import { assignmentRowLinksEventId } from '../lib/assignmentLinkedEventUtils';
import { isChildHelpAssignment, isSchoolWorkEventType } from './child/childHomeRailHelpers';
import {
  LearnerPill,
  formatConflictMetaFromEvent,
  mapChildrenForConflict,
  parseConflictMessageString,
  resolveLearnerChild,
  sharedConflictBannerStyles as cb,
} from './planner/conflictBannerShared';
import AppModalShell from './ui/AppModalShell';
import { ModalFooter } from './ui/ModalFooter';
import { ModalSectionCard } from './ui/ModalSectionCard';
import { ATTENDANCE_MODES, getAttendanceMode } from '../lib/attendanceMode';
import { trackEvent } from '../lib/analytics';
import { getFamilyExclusions, getFamilyPlannerSettings } from '../lib/services/plannerSettingsClient';
import { fetchSubjectCurriculumEventsStructure } from '../lib/services/curriculumClient';

const BG = '#ffffff';
const FG = '#111827';
const SUB = '#6b7280';
const BORDER = '#e5e7eb';
const MUTED = '#9ca3af';
const ACCENT = '#d4a256';
const CHIP_BG = '#f3f4f6';
const CHIP_BORDER = '#e5e7eb';

const DEFAULT_DURATION_MINUTES = 30;
let createTaskEventAllowOverlapsSupported = true;
const ENABLE_LIVE_CONFLICT_CHECK = false;
const parseSubjectChildIds = (raw) =>
  String(raw == null ? '' : raw)
    .split(';')
    .map((id) => id.trim())
    .filter(Boolean);

const withSubjectIdsInCurriculumMetadata = (rawMetadata, subjectIds) => {
  const normalizedSubjectIds = Array.from(
    new Set(
      (Array.isArray(subjectIds) ? subjectIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  );
  let base = {};
  if (rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
    base = { ...rawMetadata };
  } else if (typeof rawMetadata === 'string') {
    try {
      const parsed = JSON.parse(rawMetadata);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = { ...parsed };
      }
    } catch (_) {
      base = {};
    }
  }
  if (normalizedSubjectIds.length > 0) {
    base.subject_ids = normalizedSubjectIds;
  } else {
    delete base.subject_ids;
  }
  return Object.keys(base).length > 0 ? base : null;
};

const resolveSchoolYearLabelForDate = (date = new Date()) => {
  const normalizedDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const month = normalizedDate.getMonth() + 1;
  const startYear = month >= 8 ? normalizedDate.getFullYear() : normalizedDate.getFullYear() - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
};

const normalizeSubjectTerm = (term) => {
  const raw = String(term || '').trim().toLowerCase();
  if (raw === 'fall term' || raw === 'fall_term' || raw === 'fall') return 'fall_term';
  if (raw === 'spring term' || raw === 'spring_term' || raw === 'spring') return 'spring_term';
  return 'full_year';
};

const parseSchoolYearLabel = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})\s*\/\s*(\d{2,4})$/);
  if (!match) return null;
  const startYear = Number(match[1]);
  let endYear = Number(match[2]);
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null;
  if (String(match[2]).length === 2) {
    endYear = Math.floor(startYear / 100) * 100 + endYear;
    if (endYear < startYear) endYear += 100;
  }
  if (!Number.isFinite(endYear) || endYear < startYear) return null;
  return { startYear, endYear };
};

const toYmd = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10) || null;
};

const parseYmdDate = (value) => {
  const ymd = toYmd(value);
  if (!ymd) return null;
  const parsed = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildFallbackPlannerDefaultsForDate = (date = new Date()) => {
  const label = resolveSchoolYearLabelForDate(date);
  const parsed = parseSchoolYearLabel(label);
  const startYear = parsed?.startYear;
  const endYear = parsed?.endYear;
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null;
  return {
    school_year_label: label,
    default_school_year: label,
    default_year_start_date: `${startYear}-08-01`,
    default_year_end_date: `${endYear}-05-31`,
    default_fall_term_start_date: `${startYear}-08-01`,
    default_fall_term_end_date: `${startYear}-12-31`,
    default_spring_term_start_date: `${endYear}-01-01`,
    default_spring_term_end_date: `${endYear}-05-01`,
    allowed_weekdays: [1, 2, 3, 4, 5],
    default_day_start_time: '08:00:00',
    default_day_end_time: '15:00:00',
  };
};

const isDateWithin = (candidate, start, end) => {
  if (!candidate || !start || !end) return false;
  const c = candidate.getTime();
  return c >= start.getTime() && c <= end.getTime();
};

const toAmPmTime = (sqlTime) => {
  const raw = String(sqlTime || '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return '';
  let hours = Number(m[1]);
  const minutes = m[2];
  if (!Number.isFinite(hours)) return '';
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${period}`;
};

const EVENT_TYPES = [
  'Lesson',
  'Project',
  'Exam',
  'Assignment',
  'Activity',
  'Appointment',
];
const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sun', rrule: 'SU' },
  { value: 1, label: 'Mon', rrule: 'MO' },
  { value: 2, label: 'Tue', rrule: 'TU' },
  { value: 3, label: 'Wed', rrule: 'WE' },
  { value: 4, label: 'Thu', rrule: 'TH' },
  { value: 5, label: 'Fri', rrule: 'FR' },
  { value: 6, label: 'Sat', rrule: 'SA' },
];
const TIME_SELECT_OPTIONS = (() => {
  const options = [];
  for (let hour24 = 0; hour24 < 24; hour24 += 1) {
    for (const minute of [0, 30]) {
      const period = hour24 >= 12 ? 'PM' : 'AM';
      const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
      const minuteLabel = String(minute).padStart(2, '0');
      options.push(`${hour12}:${minuteLabel} ${period}`);
    }
  }
  return options;
})();

const normalizeEventTypeForPersistence = (type) => {
  if (type === 'Scheduled Class Day') return 'Schedule Block';
  if (type === 'Class Day') return 'ClassDay';
  return type || 'Lesson';
};

const MODE_OPTIONS = ['home', 'online', 'outside', 'travel'];
const CALENDAR_CONNECTION_OPTIONS = [
  { value: 'google', label: 'Google' },
  { value: 'apple', label: 'Apple' },
];

// Safe View wrapper that filters out text nodes
function SafeView({ children, style, ...props }) {
  // Convert to array and filter aggressively
  const childrenArray = React.Children.toArray(children);
  const safeChildren = childrenArray.filter((child, index) => {
    if (typeof child === 'string') {
      const trimmed = child.trim();
      if (trimmed.length === 0) {
        // Empty whitespace - filter it out silently
        return false;
      }
      
      return false;
    }
    if (child == null) return false;
    if (typeof child === 'boolean') return false;
    return true;
  });
  
  // Log if we filtered anything
  if (childrenArray.length !== safeChildren.length) {
  }
  
  return <View style={style} {...props}>{safeChildren}</View>;
}

// Wrapper for fieldRow to catch text nodes
function SafeFieldRow({ children, style }) {
  const safeChildren = React.Children.toArray(children).filter((child, index) => {
    if (typeof child === 'string') {
      return false;
    }
    return child != null;
  });
  return <View style={style}>{safeChildren}</View>;
}

function ChipRow({ children, style }) {
  // Use React.Children.map to process children and filter out any text nodes
  const normalizedChildren = React.Children.map(children, (child, index) => {
    // Filter out strings (including whitespace), null, undefined, booleans
    if (typeof child === 'string') {
      return null;
    }
    if (child == null) {
      return null;
    }
    if (typeof child === 'boolean') {
      return null;
    }
    return child;
  }) || [];
  
  // Additional filter to ensure no strings slip through
  const safeChildren = normalizedChildren.filter((child, index) => {
    if (typeof child === 'string') {
      return false;
    }
    if (child == null) {
      return false;
    }
    return true;
  });

  return <View style={style}>{safeChildren}</View>;
}

function addDays(d, n) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

function fmt(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function resolveDefaultAssigneeIds({ defaultChildIds, defaultChildId, familyMembers }) {
  if (Array.isArray(defaultChildIds) && defaultChildIds.length > 0) return defaultChildIds;
  if (defaultChildId) return [defaultChildId];
  const allChildIds = (Array.isArray(familyMembers) ? familyMembers : [])
    .map((m) => m?.id)
    .filter(Boolean);
  return allChildIds;
}

export default function TaskCreateModal({
  visible,
  onClose,
  defaultDate,
  defaultChildId,
  defaultChildIds = null,
  familyMembers = [],
  familyId,
  onCreated,
  defaultPlacement = 'calendar', // New prop: 'calendar' or 'backlog'
  defaultSubjectId = null, // Default subject ID to set when opening modal
  defaultEventType = null, // Default event type to set when opening modal (e.g., 'Lesson')
  defaultStartTime = null, // Default start time (e.g. '9:00 AM') when opening from plan slot
  defaultTitle = null, // Default title when opening from Doodle (e.g. 'Doctors' for appointment)
  defaultMaterialId = null, // Default material ID to pre-attach
}) {
  const [title, setTitle] = useState('');
  const [isClassDayTitleAutofilled, setIsClassDayTitleAutofilled] = useState(false);
  const [dueDate, setDueDate] = useState(defaultDate ?? new Date());
  const [eventEndDate, setEventEndDate] = useState(null); // End date for multi-day events (Trip, Holiday, Project, Other)
  const [showEventEndDatePicker, setShowEventEndDatePicker] = useState(false);
  const [eventEndDateCalendarViewMonth, setEventEndDateCalendarViewMonth] = useState(() => {
    try {
      const baseDate = defaultDate ?? new Date();
      const endDate = new Date(baseDate);
      endDate.setDate(endDate.getDate() + 1);
      return endDate;
    } catch (e) {
      return new Date();
    }
  });
  const initialAssigneeIds = resolveDefaultAssigneeIds({
    defaultChildIds,
    defaultChildId,
    familyMembers,
  });

  const [assigneeIds, setAssigneeIds] = useState(initialAssigneeIds);
  const assigneeIdsSignature = useMemo(
    () => (Array.isArray(assigneeIds) ? assigneeIds.map((id) => String(id)).sort().join('|') : ''),
    [assigneeIds]
  );
  const [notes, setNotes] = useState('');
  const [showAcademicDetails, setShowAcademicDetails] = useState(false); // Collapsed by default
  const [showNotesSection, setShowNotesSection] = useState(false); // Collapsed by default (match Add Subject)
  const [queueSendToStudentAfterSave, setQueueSendToStudentAfterSave] = useState(false);
  const [queueSendToStudentNote, setQueueSendToStudentNote] = useState('');
  const [showLogisticDetails, setShowLogisticDetails] = useState(false); // Collapsed by default
  const [submitting, setSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [validationBanner, setValidationBanner] = useState('');
  const [placement, setPlacement] = useState(defaultPlacement || 'calendar');
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [calendarViewMonth, setCalendarViewMonth] = useState(defaultDate ?? new Date());
  const [showEndDateCalendarPicker, setShowEndDateCalendarPicker] = useState(false);
  const [endDateCalendarViewMonth, setEndDateCalendarViewMonth] = useState(() => {
    try {
      const baseDate = defaultDate ?? new Date();
      const endDate = new Date(baseDate);
      endDate.setDate(endDate.getDate() + 30);
      return endDate;
    } catch (e) {
      return new Date();
    }
  });
  
  // Update placement when defaultPlacement prop changes or when modal opens
  useEffect(() => {
    if (visible) {
      // Always update placement when modal becomes visible, using defaultPlacement if provided
      const newPlacement = defaultPlacement || 'calendar';
      setPlacement(newPlacement);
      // Sync calendar view month with due date when modal opens
      setCalendarViewMonth(dueDate);
      // Clear validation errors when modal opens
      setValidationErrors({});
      setValidationBanner('');
    }
  }, [visible, defaultPlacement]);
  
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const useTimeDropdownsOnWeb = true;
  const startTimeInputRef = useRef(null);
  const endTimeInputRef = useRef(null);
  const startTimeJustFocusedRef = useRef(false);
  const endTimeJustFocusedRef = useRef(false);

  function normalizeTimeValue(rawValue) {
    const value = String(rawValue || '').replace(/_/g, '').trim();
    if (!value || value === ':') return '';
    return value;
  }

  function shouldSkipConflictEvent(ev) {
    if (!ev) return true;
    if (ev.status === 'canceled' || ev.canceled_at || ev.deleted_at) return true;
    if (ev.is_backlog) return true;
    if (ev.is_flexible === true) return true;
    if (ev.recurrence_rule && String(ev.id || '') === String(ev.parent_event_id || '')) return true;
    const start = new Date(ev.start_ts || ev.start);
    const end = new Date(ev.end_ts || ev.end);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
      if (durationMinutes >= 23 * 60) return true;
    }
    return false;
  }
  
  // New academic and metadata fields
  const [eventType, setEventType] = useState('Lesson'); // Default to "Lesson" for new events
  const [subjectIds, setSubjectIds] = useState(defaultSubjectId ? [defaultSubjectId] : []);
  const [subjectId, setSubjectId] = useState(defaultSubjectId || null);
  const [unit, setUnit] = useState('');
  const [lesson, setLesson] = useState('');
  const [grade, setGrade] = useState('');
  const [percentOfTotalGrade, setPercentOfTotalGrade] = useState('');
  const [location, setLocation] = useState('');
  const [mode, setMode] = useState('');
  const [connectedCalendarTargets, setConnectedCalendarTargets] = useState([]);
  const [instructor, setInstructor] = useState('');
  const [goalLink, setGoalLink] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [subjectGoals, setSubjectGoals] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);
  const [showGoalDropdown, setShowGoalDropdown] = useState(false);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const subjectButtonRef = useRef(null);
  const subjectDropdownRef = useRef(null);
  const [subjectDropdownPosition, setSubjectDropdownPosition] = useState({ top: 0, left: 0, width: 200, maxHeight: 220 });
  const lessonButtonRef = useRef(null);
  const lessonDropdownRef = useRef(null);
  const [showLessonDropdown, setShowLessonDropdown] = useState(false);
  const [showStartTimeDropdown, setShowStartTimeDropdown] = useState(false);
  const [showEndTimeDropdown, setShowEndTimeDropdown] = useState(false);
  const startTimeButtonRef = useRef(null);
  const startTimeDropdownRef = useRef(null);
  const endTimeButtonRef = useRef(null);
  const endTimeDropdownRef = useRef(null);
  const [startTimeDropdownPosition, setStartTimeDropdownPosition] = useState({ top: 0, left: 0, width: 148, maxHeight: 220 });
  const [endTimeDropdownPosition, setEndTimeDropdownPosition] = useState({ top: 0, left: 0, width: 148, maxHeight: 220 });
  const [lessonDropdownPosition, setLessonDropdownPosition] = useState({ top: 0, left: 0, width: 200, maxHeight: 220 });
  const [lessonOptions, setLessonOptions] = useState([]);
  const [loadingLessonOptions, setLoadingLessonOptions] = useState(false);
  const [attachedMaterialIds, setAttachedMaterialIds] = useState([]);
  
  // Material selector state
  const [materials, setMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const materialDropdownRef = useRef(null);
  const materialButtonRef = useRef(null);
  const [materialDropdownPosition, setMaterialDropdownPosition] = useState({ top: 0, left: 0, width: 200 });
  const [materialDropdownPositionReady, setMaterialDropdownPositionReady] = useState(false);
  const wasVisibleRef = useRef(false);
  const lastOpenLoadKeyRef = useRef('');
  const lastMaterialsLoadKeyRef = useRef('');
  
  // Standards state
  const [attachedStandards, setAttachedStandards] = useState([]);
  const [showStandardsModal, setShowStandardsModal] = useState(false);

  const applySubjectSelection = useCallback((nextSubjectIds) => {
    const normalized = Array.from(
      new Set(
        (Array.isArray(nextSubjectIds) ? nextSubjectIds : [])
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      )
    );
    setSubjectIds(normalized);
    setSubjectId(normalized[0] || null);
    setLesson('');
    setUnit('');
    setShowLessonDropdown(false);
  }, []);

  useEffect(() => {
    if (!visible || !familyId) return;
    const selectedSubjectIds = Array.from(
      new Set(
        (Array.isArray(subjectIds) ? subjectIds : [])
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      )
    );
    if (selectedSubjectIds.length === 0) {
      setLessonOptions([]);
      setLoadingLessonOptions(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingLessonOptions(true);
      try {
        const subjectNameById = new Map(
          (Array.isArray(subjects) ? subjects : []).map((s) => [
            String(s?.id || '').trim(),
            String(s?.name || '').trim(),
          ])
        );
        const fetchedBySubject = await Promise.all(
          selectedSubjectIds.map(async (sid) => {
            const { data, error } = await fetchSubjectCurriculumEventsStructure(familyId, sid, null);
            if (error) return [];
            const units = Array.isArray(data?.units) ? data.units : [];
            const subjectName = subjectNameById.get(sid) || '';
            const showSubjectContext = selectedSubjectIds.length > 1;
            const next = [];
            units.forEach((u) => {
              const unitTitle = String(u?.title || '').trim();
              (u?.lessons || []).forEach((l) => {
                const lessonTitle = String(l?.title || '').trim();
                if (!lessonTitle) return;
                const lessonWithUnit = unitTitle ? `${lessonTitle} (${unitTitle})` : lessonTitle;
                next.push({
                  key: `${sid}::${unitTitle}::${lessonTitle}`,
                  lessonTitle,
                  unitTitle,
                  subjectId: sid,
                  label: showSubjectContext && subjectName ? `${lessonWithUnit} - ${subjectName}` : lessonWithUnit,
                });
              });
            });
            return next;
          })
        );
        if (cancelled) return;
        const combined = fetchedBySubject.flat();
        const dedup = Array.from(new Map(combined.map((item) => [item.key, item])).values());
        setLessonOptions(dedup);
      } finally {
        if (!cancelled) setLoadingLessonOptions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, familyId, subjectIds, subjects]);

  const applyEventTypeSelection = useCallback((nextType) => {
    const isSwitchingAwayFromClassDay = eventType === 'Class Day' && nextType !== 'Class Day';
    setEventType(nextType);
    if (nextType === 'Class Day') {
      applySubjectSelection([]);
      setUnit('');
      setLesson('');
      setGrade('');
      setPercentOfTotalGrade('');
      if (!title.trim()) {
        setTitle('Class Day');
        setIsClassDayTitleAutofilled(true);
      } else {
        setIsClassDayTitleAutofilled(false);
      }
      return;
    }
    if (isSwitchingAwayFromClassDay) {
      // When switching away from Class Day, reset recurrence back to neutral defaults.
      setIsRecurring(false);
      setShowRecurringSection(false);
      setRecurrenceType('weekly');
      setRecurrenceInterval(1);
      setRecurrenceIntervalText('1');
      setRecurrenceEndType('never');
      setRecurrenceEndAfter(null);
      setRecurrenceEndAfterText('');
      setRecurrenceEndDate(null);
      setClassDayDefaultsApplied(false);
      // Class Day auto-defaults can seed time fields; switching away should return to optional blank times.
      setStartTime('');
      setEndTime('');
    }
    if (isClassDayTitleAutofilled && title.trim() === 'Class Day') {
      setTitle('');
    }
    setIsClassDayTitleAutofilled(false);
  }, [eventType, isClassDayTitleAutofilled, title, applySubjectSelection]);
  
  // Handle standards selection from modal
  const handleStandardsSelect = useCallback((selectedStandards) => {
    setAttachedStandards(selectedStandards);
  }, []);

  // Grade percentage validation state
  const [percentValidationError, setPercentValidationError] = useState(null);
  const [percentValidationData, setPercentValidationData] = useState(null);
  const [checkingPercent, setCheckingPercent] = useState(false);
  const resolvedAttendanceMode = getAttendanceMode({
    academicYearMode: null,
    fallback: ATTENDANCE_MODES.CLASS_DAY,
  });
  const isClassDayEvent = eventType === 'Class Day';
  const canSendToStudentForEvent = useMemo(() => isSchoolWorkEventType(eventType), [eventType]);
  const academicSectionTitle = 'Learning details';
  // Check grade percentage sum when percentOfTotalGrade or subjectId changes
  useEffect(() => {
    const checkPercentSum = async () => {
      // Only check if we have a subject and a percentage value
      if (!subjectId || !percentOfTotalGrade.trim()) {
        setPercentValidationError(null);
        setPercentValidationData(null);
        return;
      }

      const parsedPercent = parseFloat(percentOfTotalGrade.trim());
      if (isNaN(parsedPercent) || !isFinite(parsedPercent)) {
        setPercentValidationError(null);
        setPercentValidationData(null);
        return;
      }

      setCheckingPercent(true);
      try {
        const { data, error } = await supabase.rpc('get_subject_grade_percentage_sum', {
          p_subject_id: subjectId,
          p_exclude_event_id: null // Creating new event, so no exclusion needed
        });

        if (error) {
          console.error('Error checking grade percentage:', error);
          setPercentValidationError(null);
          setPercentValidationData(null);
          return;
        }

        if (data) {
          const totalPercent = parseFloat(data.total_percent) || 0;
          const remainingPercent = parseFloat(data.remaining_percent) || 100;
          const newTotal = totalPercent + parsedPercent;

          setPercentValidationData({
            totalPercent,
            remainingPercent,
            assignments: data.assignments || [],
            newTotal
          });

          if (newTotal > 100) {
            setPercentValidationError({
              message: `This would exceed 100% for this subject. Current total: ${totalPercent.toFixed(1)}%, remaining: ${remainingPercent.toFixed(1)}%.`,
              suggestedPercent: Math.max(0, remainingPercent),
              newTotal
            });
          } else {
            setPercentValidationError(null);
          }
        }
      } catch (err) {
        console.error('Error checking grade percentage:', err);
        setPercentValidationError(null);
        setPercentValidationData(null);
      } finally {
        setCheckingPercent(false);
      }
    };

    // Debounce the check by 500ms
    const timeoutId = setTimeout(checkPercentSum, 500);
    return () => clearTimeout(timeoutId);
  }, [subjectId, percentOfTotalGrade]);

  // Conflict detection state
  const [conflictWarning, setConflictWarning] = useState(null); // { event: {...}, message: "..." }
  const [shouldAutoAdjust, setShouldAutoAdjust] = useState(false); // Flag for "Adjust automatically"
  const [suggestedChange, setSuggestedChange] = useState(null); // { newStart: Date, newEnd: Date, message: "..." }
  const [changeAccepted, setChangeAccepted] = useState(false); // Track if the suggested change was accepted
  const setConflictWarningSafely = useCallback((nextWarning) => {
    setConflictWarning((prev) => {
      if (!nextWarning) return prev == null ? prev : null;
      const prevSig = prev
        ? `${String(prev?.event?.id || '')}|${String(prev?.message || '')}|${String(prev?.conflictCount || 0)}`
        : '';
      const nextSig = `${String(nextWarning?.event?.id || '')}|${String(nextWarning?.message || '')}|${String(nextWarning?.conflictCount || 0)}`;
      return prevSig === nextSig ? prev : nextWarning;
    });
  }, []);
  const lastConflictCheckKeyRef = useRef('');

  const conflictChildren = mapChildrenForConflict(familyMembers);
  const parsedConflictMessage = conflictWarning?.message ? parseConflictMessageString(conflictWarning.message) : null;
  const resolvedConflictLearner = conflictWarning
    ? resolveLearnerChild(conflictWarning.event, conflictChildren, parsedConflictMessage?.learnerName || null)
    : null;
  const conflictRichCopy = conflictWarning
    ? parsedConflictMessage
      ? {
          kind: 'rich',
          learner: resolvedConflictLearner,
          nameFallback: parsedConflictMessage.learnerName,
          conflictingTitle: parsedConflictMessage.conflictingTitle,
          metaLine: parsedConflictMessage.metaLine || formatConflictMetaFromEvent(conflictWarning.event),
        }
      : resolvedConflictLearner || conflictWarning?.event?.title
        ? {
            kind: 'rich',
            learner: resolvedConflictLearner,
            nameFallback: resolvedConflictLearner ? null : 'Learner',
            conflictingTitle: conflictWarning?.event?.title || 'Existing event',
            metaLine: formatConflictMetaFromEvent(conflictWarning.event),
          }
        : {
            kind: 'plain',
            text: `Conflict with ${conflictWarning.message}`,
          }
    : null;

  // Detect conflicts when date/time/child changes
  useEffect(() => {
    if (!ENABLE_LIVE_CONFLICT_CHECK) {
      setConflictWarningSafely(null);
      return;
    }
    const dueDateMs = dueDate instanceof Date ? dueDate.getTime() : NaN;
    const eventEndDateMs = eventEndDate instanceof Date ? eventEndDate.getTime() : NaN;
    const normalizedStartTime = normalizeTimeValue(startTime);
    const normalizedEndTime = normalizeTimeValue(endTime);
    if (!visible || placement !== 'calendar' || allDay || !normalizedStartTime || assigneeIds.length === 0 || !dueDate) {
      lastConflictCheckKeyRef.current = '';
      setConflictWarningSafely(null);
      return;
    }

    const conflictCheckKey = [
      visible ? '1' : '0',
      placement || '',
      allDay ? '1' : '0',
      String(normalizedStartTime || ''),
      String(normalizedEndTime || ''),
      assigneeIdsSignature,
      Number.isFinite(dueDateMs) ? String(dueDateMs) : '',
      Number.isFinite(eventEndDateMs) ? String(eventEndDateMs) : '',
      String(eventType || ''),
      String(familyId || ''),
      changeAccepted ? '1' : '0',
    ].join('|');
    if (lastConflictCheckKeyRef.current === conflictCheckKey) return;
    lastConflictCheckKeyRef.current = conflictCheckKey;

    let cancelled = false;
    const checkConflicts = async () => {
      console.log('[TaskCreateModal] Checking for conflicts...', {
        visible,
        placement,
        allDay,
        startTime: normalizedStartTime,
        assigneeIds: assigneeIds.length,
        dueDate: dueDate?.toISOString(),
        familyId,
      });
      try {
        // Parse start and end times
        const baseDate = new Date(dueDate);
        baseDate.setHours(0, 0, 0, 0);
        
        const resolvedStart = applyTimeToDate(baseDate, normalizedStartTime);
        if (!resolvedStart) {
          if (cancelled) return;
          setConflictWarningSafely(null);
          return;
        }

        // For multi-day events (Project, Trip, Holiday, Other), use eventEndDate
        const isMultiDayEventType = eventType && ['Project', 'Trip', 'Holiday', 'Other'].includes(eventType);
        let resolvedEnd;
        
        if (isMultiDayEventType && eventEndDate) {
          // Set end date to end of the selected day (23:59:59.999)
          const endDateYear = eventEndDate.getFullYear();
          const endDateMonth = eventEndDate.getMonth();
          const endDateDay = eventEndDate.getDate();
          resolvedEnd = new Date(endDateYear, endDateMonth, endDateDay, 23, 59, 59, 999);
        } else {
          resolvedEnd = normalizedEndTime
            ? applyTimeToDate(baseDate, normalizedEndTime)
            : new Date(resolvedStart.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
        }
        
        if (!resolvedEnd || resolvedEnd <= resolvedStart) {
          if (cancelled) return;
          setConflictWarningSafely(null);
          return;
        }

        let existingEvents = [];
        try {
          existingEvents = await fetchPotentialConflictingEvents(resolvedStart, resolvedEnd, assigneeIds);
        } catch (error) {
          console.error('[TaskCreateModal] Error fetching events for conflict detection:', error);
          if (cancelled) return;
          setConflictWarningSafely(null);
          return;
        }
        if (cancelled) return;

        console.log('[TaskCreateModal] Fetched events for conflict check:', {
          eventCount: existingEvents?.length || 0,
          events: existingEvents?.map(e => ({
            id: e.id,
            title: e.title,
            child_id: e.child_id,
            child_ids: e.child_ids,
            start_ts: e.start_ts,
            end_ts: e.end_ts,
          })) || [],
          resolvedStart: resolvedStart.toISOString(),
          resolvedEnd: resolvedEnd.toISOString(),
        });

        // Check for overlaps
        const conflicts = [];
        for (const event of existingEvents || []) {
          if (shouldSkipConflictEvent(event)) continue;
          const eventStart = new Date(event.start_ts);
          const eventEnd = new Date(event.end_ts || event.start_ts);
          
          console.log('[TaskCreateModal] Checking overlap:', {
            eventTitle: event.title,
            eventStart: eventStart.toISOString(),
            eventEnd: eventEnd.toISOString(),
            newStart: resolvedStart.toISOString(),
            newEnd: resolvedEnd.toISOString(),
            overlap1: resolvedStart < eventEnd,
            overlap2: eventStart < resolvedEnd,
            hasOverlap: resolvedStart < eventEnd && eventStart < resolvedEnd,
          });
          
          // Overlap detection: event1_start < event2_end && event2_start < event1_end
          if (resolvedStart < eventEnd && eventStart < resolvedEnd) {
            // Format conflict message
            const eventDate = new Date(event.start_ts);
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayName = dayNames[eventDate.getDay()];
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthName = monthNames[eventDate.getMonth()];
            const day = eventDate.getDate();
            
            // Format time
            const formatTime = (date) => {
              let hours = date.getHours();
              const minutes = date.getMinutes();
              const period = hours >= 12 ? 'PM' : 'AM';
              if (hours > 12) hours -= 12;
              else if (hours === 0) hours = 12;
              return minutes === 0 ? `${hours} ${period}` : `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
            };
            
            const startTimeStr = formatTime(eventStart);
            const endTimeStr = formatTime(eventEnd);
            
            // Format time range: "4 PM–5 PM" -> "4–5 PM" or "4:30 PM–5 PM" -> "4:30–5 PM"
            const startTimeOnly = startTimeStr.replace(/\s*(AM|PM)$/i, '');
            const endTimeOnly = endTimeStr.replace(/\s*(AM|PM)$/i, '');
            const period = startTimeStr.includes('PM') ? 'PM' : 'AM';
            const timeRange = `${startTimeOnly}–${endTimeOnly} ${period}`;
            
            conflicts.push({
              event,
              message: `${event.title} (${dayName} ${monthName} ${day}, ${timeRange})`
            });
          }
        }

        console.log('[TaskCreateModal] Conflict check complete:', {
          conflictsFound: conflicts.length,
          existingEventsCount: existingEvents?.length || 0,
        });
        
        if (conflicts.length > 0) {
          // Show first conflict with metadata
          console.log('[TaskCreateModal] Setting conflict warning:', conflicts[0]);
          setConflictWarningSafely({
            ...conflicts[0],
            conflictCount: conflicts.length,
            allConflicts: conflicts,
          });
          // Clear any previous suggestion when new conflict is detected (unless change was accepted)
          if (!changeAccepted) {
            setSuggestedChange(null);
          }
        } else {
          console.log('[TaskCreateModal] No conflicts found, clearing warning');
          setConflictWarningSafely(null);
          // Don't clear suggestedChange if the change was already accepted
          if (!changeAccepted) {
            setSuggestedChange(null);
          }
        }
      } catch (err) {
        console.error('[TaskCreateModal] Error in conflict detection:', err);
        if (cancelled) return;
        setConflictWarningSafely(null);
      }
    };

    // Debounce conflict detection
    const timeoutId = setTimeout(checkConflicts, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [
    visible,
    placement,
    allDay,
    startTime,
    endTime,
    assigneeIdsSignature,
    dueDate?.getTime?.(),
    eventEndDate?.getTime?.(),
    eventType,
    familyId,
    changeAccepted,
    setConflictWarningSafely,
  ]);
  
  // Recurring event state
  const [isRecurring, setIsRecurring] = useState(false);
  const [showRecurringSection, setShowRecurringSection] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState('weekly'); // 'weekly' or 'monthly'
  const [recurrenceEndType, setRecurrenceEndType] = useState('never'); // 'never', 'after', 'on'
  const [recurrenceEndAfter, setRecurrenceEndAfter] = useState(null); // Number of occurrences
  const [recurrenceEndAfterText, setRecurrenceEndAfterText] = useState(''); // Local text state for input
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(null); // End date
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState([]);
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceIntervalText, setRecurrenceIntervalText] = useState('1');
  const [respectSavedDaysOff, setRespectSavedDaysOff] = useState(true);
  const [isRecurrenceWeekdayAutofilled, setIsRecurrenceWeekdayAutofilled] = useState(true);
  const [plannerDefaults, setPlannerDefaults] = useState(() =>
    buildFallbackPlannerDefaultsForDate(defaultDate ?? new Date())
  );
  const [plannerDaysOffSet, setPlannerDaysOffSet] = useState(new Set());
  const [classDayDefaultsApplied, setClassDayDefaultsApplied] = useState(false);
  const [plannerDefaultsRefreshKey, setPlannerDefaultsRefreshKey] = useState(0);
  const toast = useToast();
  const session = useSession();
  const effectiveFamilyId = familyId || session?.profile?.family_id || null;

  // Sync calendar view month when due date changes externally
  useEffect(() => {
    if (!showCalendarPicker) {
      setCalendarViewMonth((prev) => {
        const prevTs = prev instanceof Date ? prev.getTime() : NaN;
        const nextTs = dueDate instanceof Date ? dueDate.getTime() : NaN;
        return prevTs === nextTs ? prev : dueDate;
      });
    }
  }, [dueDate, showCalendarPicker]);

  // Sync end date calendar view month when recurrence end date changes externally
  useEffect(() => {
    if (!showEndDateCalendarPicker && recurrenceEndDate) {
      setEndDateCalendarViewMonth((prev) => {
        const next = new Date(recurrenceEndDate);
        const prevTs = prev instanceof Date ? prev.getTime() : NaN;
        const nextTs = next.getTime();
        return prevTs === nextTs ? prev : next;
      });
    }
  }, [recurrenceEndDate, showEndDateCalendarPicker]);

  // Sync event end date calendar view month when event end date changes externally
  useEffect(() => {
    if (!showEventEndDatePicker && eventEndDate) {
      setEventEndDateCalendarViewMonth((prev) => {
        const prevTs = prev instanceof Date ? prev.getTime() : NaN;
        const nextTs = eventEndDate instanceof Date ? eventEndDate.getTime() : NaN;
        return prevTs === nextTs ? prev : eventEndDate;
      });
    }
  }, [eventEndDate, showEventEndDatePicker]);

  // Auto-set end date when multi-day event type is selected
  useEffect(() => {
    const isMultiDayEventType = eventType && ['Project', 'Trip', 'Holiday', 'Other'].includes(eventType);
    if (isMultiDayEventType && placement === 'calendar' && !eventEndDate) {
      // Set end date to one day after start date by default
      const defaultEnd = new Date(dueDate);
      defaultEnd.setDate(defaultEnd.getDate() + 1);
      setEventEndDate(defaultEnd);
    } else if (!isMultiDayEventType && eventEndDate) {
      // Clear end date when switching away from multi-day event types
      setEventEndDate(null);
    }
  }, [eventType, placement, dueDate, eventEndDate]); // Include dueDate and eventEndDate to properly handle changes

  // Calculate dropdown position when it opens
  useEffect(() => {
    if (showMaterialDropdown && Platform.OS === 'web') {
      const updatePosition = () => {
        let node = null;
        
        // Try multiple ways to get the DOM node
        if (materialButtonRef.current) {
          node = materialButtonRef.current._nativeNode || materialButtonRef.current;
        }
        
        // If still no node, try to find it in the DOM
        if (!node || !node.getBoundingClientRect) {
          const selector = document.querySelector('[data-material-selector="true"]');
          if (selector) {
            node = selector;
          }
        }
        
        if (node && typeof node.getBoundingClientRect === 'function') {
          const rect = node.getBoundingClientRect();
          const dropdownMaxHeight = 300;
          
          // Position below the button by default
          const spaceBelow = window.innerHeight - rect.bottom;
          const spaceAbove = rect.top;
          
          let top, maxHeight;
          if (spaceBelow < 200 && spaceAbove > spaceBelow) {
            // Not enough space below, position above
            top = rect.top - Math.min(dropdownMaxHeight, spaceAbove - 10);
            maxHeight = Math.min(dropdownMaxHeight, spaceAbove - 10);
          } else {
            // Position below (default)
            top = rect.bottom + 4;
            maxHeight = Math.min(dropdownMaxHeight, spaceBelow - 10);
          }
          
          const newPosition = {
            top: top,
            left: rect.left,
            width: Math.max(rect.width, 200),
            maxHeight: maxHeight,
          };
          setMaterialDropdownPosition((prev) => {
            if (
              prev?.top === newPosition.top &&
              prev?.left === newPosition.left &&
              prev?.width === newPosition.width &&
              prev?.maxHeight === newPosition.maxHeight
            ) {
              return prev;
            }
            return newPosition;
          });
          setMaterialDropdownPositionReady((prev) => (prev ? prev : true));
        }
      };
      
      // Use setTimeout to ensure DOM is ready after state update (like subject dropdown)
      const timeoutId = setTimeout(() => {
        updatePosition();
      }, 0);
      
      // Update on scroll/resize
      if (typeof window !== 'undefined') {
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        
        return () => {
          clearTimeout(timeoutId);
          window.removeEventListener('scroll', updatePosition, true);
          window.removeEventListener('resize', updatePosition);
        };
      }
      
      return () => clearTimeout(timeoutId);
    }
  }, [showMaterialDropdown]);

  // Calculate subject dropdown position when it opens
  useEffect(() => {
    if (showSubjectDropdown && Platform.OS === 'web' && subjectButtonRef.current) {
      const updatePosition = () => {
        if (subjectButtonRef.current) {
          const node = subjectButtonRef.current._nativeNode || subjectButtonRef.current;
          if (node && typeof node.getBoundingClientRect === 'function') {
            const rect = node.getBoundingClientRect();
            const dropdownMaxHeight = 300;
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            let top;
            let maxHeight;
            if (spaceBelow < 200 && spaceAbove > spaceBelow) {
              top = rect.top - Math.min(dropdownMaxHeight, Math.max(spaceAbove - 10, 140));
              maxHeight = Math.min(dropdownMaxHeight, Math.max(spaceAbove - 10, 140));
            } else {
              top = rect.bottom + 4;
              maxHeight = Math.min(dropdownMaxHeight, Math.max(spaceBelow - 10, 140));
            }
            const newPosition = {
              top,
              left: rect.left,
              width: Math.max(rect.width, 200),
              maxHeight,
            };
            setSubjectDropdownPosition((prev) => {
              if (
                prev?.top === newPosition.top &&
                prev?.left === newPosition.left &&
                prev?.width === newPosition.width &&
                prev?.maxHeight === newPosition.maxHeight
              ) {
                return prev;
              }
              return newPosition;
            });
          }
        }
      };
      
      // Use setTimeout to ensure DOM is ready after state update
      const timeoutId = setTimeout(updatePosition, 0);
      
      // Update on scroll/resize
      if (typeof window !== 'undefined') {
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        
        return () => {
          clearTimeout(timeoutId);
          window.removeEventListener('scroll', updatePosition, true);
          window.removeEventListener('resize', updatePosition);
        };
      }
      
      return () => clearTimeout(timeoutId);
    }
  }, [showSubjectDropdown]);

  // Calculate lesson dropdown position when it opens (web portal rendering)
  useEffect(() => {
    if (showLessonDropdown && Platform.OS === 'web' && lessonButtonRef.current) {
      const updatePosition = () => {
        if (lessonButtonRef.current) {
          const node = lessonButtonRef.current._nativeNode || lessonButtonRef.current;
          if (node && typeof node.getBoundingClientRect === 'function') {
            const rect = node.getBoundingClientRect();
            const dropdownMaxHeight = 300;
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            let top;
            let maxHeight;
            if (spaceBelow < 200 && spaceAbove > spaceBelow) {
              top = rect.top - Math.min(dropdownMaxHeight, Math.max(spaceAbove - 10, 140));
              maxHeight = Math.min(dropdownMaxHeight, Math.max(spaceAbove - 10, 140));
            } else {
              top = rect.bottom + 4;
              maxHeight = Math.min(dropdownMaxHeight, Math.max(spaceBelow - 10, 140));
            }
            const newPosition = {
              top,
              left: rect.left,
              width: Math.max(rect.width, 200),
              maxHeight,
            };
            setLessonDropdownPosition((prev) => {
              if (
                prev?.top === newPosition.top &&
                prev?.left === newPosition.left &&
                prev?.width === newPosition.width &&
                prev?.maxHeight === newPosition.maxHeight
              ) {
                return prev;
              }
              return newPosition;
            });
          }
        }
      };

      const timeoutId = setTimeout(updatePosition, 0);
      if (typeof window !== 'undefined') {
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        return () => {
          clearTimeout(timeoutId);
          window.removeEventListener('scroll', updatePosition, true);
          window.removeEventListener('resize', updatePosition);
        };
      }
      return () => clearTimeout(timeoutId);
    }
  }, [showLessonDropdown]);

  // Close subject dropdown when clicking outside (web only)
  useEffect(() => {
    if (Platform.OS === 'web' && showSubjectDropdown) {
      const handleSubjectClickOutside = (event) => {
        const buttonNode = subjectButtonRef.current?._nativeNode || subjectButtonRef.current;
        const dropdownNode = subjectDropdownRef.current?._nativeNode || subjectDropdownRef.current;
        const target = event?.target;
        if (!buttonNode || !target) return;
        const clickedButton = typeof buttonNode.contains === 'function' && buttonNode.contains(target);
        const clickedDropdown =
          !!dropdownNode &&
          typeof dropdownNode.contains === 'function' &&
          dropdownNode.contains(target);
        if (!clickedButton && !clickedDropdown) {
          setShowSubjectDropdown(false);
        }
      };
      document.addEventListener('mousedown', handleSubjectClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleSubjectClickOutside);
      };
    }
  }, [showSubjectDropdown]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !showLessonDropdown) return;
    const handleLessonClickOutside = (event) => {
      const buttonNode = lessonButtonRef.current?._nativeNode || lessonButtonRef.current;
      const dropdownNode = lessonDropdownRef.current?._nativeNode || lessonDropdownRef.current;
      if (!buttonNode || !dropdownNode || !event?.target) return;
      if (!buttonNode.contains(event.target) && !dropdownNode.contains(event.target)) {
        setShowLessonDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleLessonClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleLessonClickOutside);
    };
  }, [showLessonDropdown]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !showStartTimeDropdown) return;
    const handleStartTimeClickOutside = (event) => {
      const buttonNode = startTimeButtonRef.current?._nativeNode || startTimeButtonRef.current;
      const dropdownNode = startTimeDropdownRef.current?._nativeNode || startTimeDropdownRef.current;
      if (!buttonNode || !dropdownNode || !event?.target) return;
      if (!buttonNode.contains(event.target) && !dropdownNode.contains(event.target)) {
        setShowStartTimeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleStartTimeClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleStartTimeClickOutside);
    };
  }, [showStartTimeDropdown]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !showEndTimeDropdown) return;
    const handleEndTimeClickOutside = (event) => {
      const buttonNode = endTimeButtonRef.current?._nativeNode || endTimeButtonRef.current;
      const dropdownNode = endTimeDropdownRef.current?._nativeNode || endTimeDropdownRef.current;
      if (!buttonNode || !dropdownNode || !event?.target) return;
      if (!buttonNode.contains(event.target) && !dropdownNode.contains(event.target)) {
        setShowEndTimeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleEndTimeClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleEndTimeClickOutside);
    };
  }, [showEndTimeDropdown]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !showStartTimeDropdown || !startTimeButtonRef.current) return;
    const updatePosition = () => {
      const node = startTimeButtonRef.current?._nativeNode || startTimeButtonRef.current;
      if (!node?.getBoundingClientRect) return;
      const rect = node.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
      const dropdownMaxHeight = 220;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      let top = rect.bottom + 4;
      let maxHeight = Math.min(dropdownMaxHeight, Math.max(spaceBelow - 10, 140));
      if (spaceBelow < 140 && spaceAbove > spaceBelow) {
        maxHeight = Math.min(dropdownMaxHeight, Math.max(spaceAbove - 10, 140));
        top = Math.max(8, rect.top - maxHeight - 4);
      }
      setStartTimeDropdownPosition({ top, left: rect.left, width: rect.width, maxHeight });
    };
    updatePosition();
    const timeoutId = setTimeout(updatePosition, 0);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showStartTimeDropdown]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !showEndTimeDropdown || !endTimeButtonRef.current) return;
    const updatePosition = () => {
      const node = endTimeButtonRef.current?._nativeNode || endTimeButtonRef.current;
      if (!node?.getBoundingClientRect) return;
      const rect = node.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
      const dropdownMaxHeight = 220;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      let top = rect.bottom + 4;
      let maxHeight = Math.min(dropdownMaxHeight, Math.max(spaceBelow - 10, 140));
      if (spaceBelow < 140 && spaceAbove > spaceBelow) {
        maxHeight = Math.min(dropdownMaxHeight, Math.max(spaceAbove - 10, 140));
        top = Math.max(8, rect.top - maxHeight - 4);
      }
      setEndTimeDropdownPosition({ top, left: rect.left, width: rect.width, maxHeight });
    };
    updatePosition();
    const timeoutId = setTimeout(updatePosition, 0);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showEndTimeDropdown]);
  
  // Close material dropdown when clicking outside (web only)
  useEffect(() => {
    if (Platform.OS === 'web' && showMaterialDropdown) {
      const handleClickOutside = (event) => {
        if (
          materialButtonRef.current &&
          materialDropdownRef.current
        ) {
          const buttonNode = materialButtonRef.current._nativeNode || materialButtonRef.current;
          const dropdownNode = materialDropdownRef.current._nativeNode || materialDropdownRef.current;
          if (
            buttonNode &&
            dropdownNode &&
            !buttonNode.contains(event.target) &&
            !dropdownNode.contains(event.target)
          ) {
            setShowMaterialDropdown(false);
            setMaterialDropdownPositionReady(false);
          }
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showMaterialDropdown]);

  useEffect(() => {
    if (!visible) {
      setShowStartTimeDropdown(false);
      setShowEndTimeDropdown(false);
    }
  }, [visible]);
  
  // Reset position ready flag when dropdown closes
  useEffect(() => {
    if (!showMaterialDropdown) {
      setMaterialDropdownPositionReady(false);
    }
  }, [showMaterialDropdown]);
  
  // Sync selectedMaterialId with attachedMaterialIds
  useEffect(() => {
    if (selectedMaterialId && !attachedMaterialIds.includes(selectedMaterialId)) {
      setAttachedMaterialIds([selectedMaterialId]);
    } else if (!selectedMaterialId && attachedMaterialIds.length > 0) {
      setAttachedMaterialIds([]);
    }
  }, [selectedMaterialId, attachedMaterialIds]);

  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  // Label input ref removed - labels no longer used

  // Load materials from library (now unified in materials table)
  const loadMaterials = useCallback(async () => {
    if (!familyId) return;
    setLoadingMaterials((prev) => (prev ? prev : true));
    try {
      // Load all materials (includes both purchased materials and uploaded files)
      const materialsData = await getMaterials(familyId, {}, session);
      const nextMaterials = Array.isArray(materialsData) ? materialsData : [];
      setMaterials((prev) => {
        const prevSig = (prev || []).map((m) => String(m?.id || '')).join('|');
        const nextSig = nextMaterials.map((m) => String(m?.id || '')).join('|');
        return prevSig === nextSig ? prev : nextMaterials;
      });
      if (nextMaterials.length === 0) {
        console.warn('[TaskCreateModal] No materials found for familyId:', familyId);
      }
    } catch (error) {
      console.error('[TaskCreateModal] Failed to load materials:', error);
      toast.push('Failed to load materials from library', 'error');
      setMaterials((prev) => (Array.isArray(prev) && prev.length === 0 ? prev : []));
    } finally {
      setLoadingMaterials(false);
    }
  }, [familyId, session, toast]);
  const loadMaterialsRef = useRef(loadMaterials);
  useEffect(() => {
    loadMaterialsRef.current = loadMaterials;
  }, [loadMaterials]);

  // Fetch subject-dependent data while modal is open.
  useEffect(() => {
    if (visible && familyId) {
      const loadKey = `${String(familyId)}:${assigneeIdsSignature}`;
      if (lastOpenLoadKeyRef.current === loadKey) return;
      lastOpenLoadKeyRef.current = loadKey;
      fetchSubjects();
      if (assigneeIds.length > 0) {
        fetchSubjectGoals(assigneeIds[0]); // Fetch goals for first selected child
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, familyId, assigneeIdsSignature]);

  // Load materials once when modal opens.
  useEffect(() => {
    if (visible && familyId) {
      const loadKey = `${String(familyId)}:${visible ? 'open' : 'closed'}`;
      if (lastMaterialsLoadKeyRef.current !== loadKey) {
        lastMaterialsLoadKeyRef.current = loadKey;
        loadMaterialsRef.current?.();
      }
    }
  }, [visible, familyId]);

  // New library items (e.g. syllabus from Edit Subject) should appear in attachment picker while modal is open
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !familyId || !visible) return;
    const onMaterialsRefresh = (e) => {
      const fid = e?.detail?.familyId;
      if (fid && fid !== familyId) return;
      loadMaterialsRef.current?.();
    };
    window.addEventListener('refreshMaterials', onMaterialsRefresh);
    return () => window.removeEventListener('refreshMaterials', onMaterialsRefresh);
  }, [familyId, visible]);

  useEffect(() => {
    if (!visible || !familyId) return;
    let cancelled = false;
    const loadPlannerDefaults = async () => {
      try {
        const schoolYearLabel = resolveSchoolYearLabelForDate(dueDate instanceof Date ? dueDate : new Date());
        const [settingsRes, exclusionsRes] = await Promise.all([
          getFamilyPlannerSettings(familyId, schoolYearLabel),
          getFamilyExclusions(familyId, 'family_default', schoolYearLabel),
        ]);
        if (cancelled) return;
        if (settingsRes?.error) {
          console.warn('[TaskCreateModal] Failed to load planner settings:', settingsRes.error);
          return;
        }
        setPlannerDefaults(settingsRes?.data || null);
        const exclusions = Array.isArray(exclusionsRes?.data) ? exclusionsRes.data : [];
        const dateSet = new Set();
        exclusions.forEach((item) => {
          const type = String(item?.exclusion_type || '');
          const startYmd = toYmd(item?.start_date);
          const endYmd = toYmd(item?.end_date);
          if (!startYmd || (type !== 'holiday' && type !== 'break')) return;
          const start = parseYmdDate(startYmd);
          const end = parseYmdDate(endYmd || startYmd);
          if (!start || !end) return;
          const cursor = new Date(start);
          while (cursor <= end) {
            dateSet.add(toYmd(cursor));
            cursor.setDate(cursor.getDate() + 1);
          }
        });
        setPlannerDaysOffSet(dateSet);
      } catch (err) {
        if (!cancelled) {
          console.warn('[TaskCreateModal] Failed to load planning preferences defaults:', err);
        }
      }
    };
    loadPlannerDefaults();
    return () => {
      cancelled = true;
    };
  }, [visible, familyId, dueDate, plannerDefaultsRefreshKey]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !visible) return;
    const handleRefresh = () => {
      setPlannerDefaultsRefreshKey((prev) => prev + 1);
    };
    window.addEventListener('refreshPlanDefaults', handleRefresh);
    return () => window.removeEventListener('refreshPlanDefaults', handleRefresh);
  }, [visible]);

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      lastOpenLoadKeyRef.current = '';
      lastMaterialsLoadKeyRef.current = '';
      setPlannerDefaults(buildFallbackPlannerDefaultsForDate(defaultDate ?? new Date()));
      setTitle(defaultTitle && String(defaultTitle).trim() ? defaultTitle : '');
      setDueDate(defaultDate ?? new Date());
      setEventEndDate(null);
      const resetAssigneeIds = resolveDefaultAssigneeIds({
        defaultChildIds,
        defaultChildId,
        familyMembers,
      });
      setAssigneeIds(resetAssigneeIds);
      setNotes('');
      // Labels removed - no longer used
      setPlacement(defaultPlacement || 'calendar'); // Use the prop instead of hardcoded 'calendar'
      setAllDay(false);
      setStartTime('');
      setEndTime('');
      // Reset new fields
      const normalizedDefaultType = String(defaultEventType || '').trim();
      const initialEventType =
        normalizedDefaultType === 'Schedule Block' ||
        normalizedDefaultType === 'Class Day' ||
        normalizedDefaultType === 'ClassDay'
          ? 'Lesson'
          : (defaultEventType || 'Lesson');
      setIsClassDayTitleAutofilled(false);
      applyEventTypeSelection(initialEventType);
      const initialMaterialId = defaultMaterialId ? String(defaultMaterialId) : null;
      setSelectedMaterialId(initialMaterialId);
      setAttachedMaterialIds(initialMaterialId ? [initialMaterialId] : []);
      // If user starts from "Create assignment from material", open Notes/attachments by default.
      setShowNotesSection(!!initialMaterialId);
      setAttachedStandards([]);
      setShowStandardsModal(false);
      applySubjectSelection(defaultSubjectId ? [defaultSubjectId] : []);
      // Expand academic details if defaultSubjectId is provided
      if (defaultSubjectId) {
        setShowAcademicDetails(true);
      }
      setUnit('');
      setLesson('');
      setGrade('');
      setPercentOfTotalGrade('');
      setLocation('');
      setMode('');
      setConnectedCalendarTargets([]);
      setInstructor('');
      setGoalLink(null);
      setShowMaterialDropdown(false);
      setShowSubjectDropdown(false);
      setShowGoalDropdown(false);
      // Reset recurring fields
      setIsRecurring(false);
      setShowRecurringSection(false);
      setRecurrenceType('weekly');
      setRecurrenceEndType('never');
      setRecurrenceEndAfter(null);
      setRecurrenceEndAfterText('');
      setRecurrenceEndDate(null);
      setRecurrenceWeekdays([new Date(defaultDate ?? new Date()).getDay()]);
      setRecurrenceInterval(1);
      setRecurrenceIntervalText('1');
      setRespectSavedDaysOff(true);
      setIsRecurrenceWeekdayAutofilled(true);
      setClassDayDefaultsApplied(false);
      setQueueSendToStudentAfterSave(false);
      setQueueSendToStudentNote('');
      // Reset conflict detection state
      setConflictWarning(null);
      setShouldAutoAdjust(false);
      setSuggestedChange(null);
      setChangeAccepted(false);
    }
    if (!visible) {
      lastMaterialsLoadKeyRef.current = '';
    }
    wasVisibleRef.current = visible;
  }, [visible, defaultDate, defaultChildId, defaultChildIds, defaultPlacement, defaultSubjectId, defaultEventType, defaultStartTime, defaultTitle, defaultMaterialId, familyMembers, applyEventTypeSelection, applySubjectSelection]);

  useEffect(() => {
    if (canSendToStudentForEvent && assigneeIds.length > 0) return;
    if (queueSendToStudentAfterSave) setQueueSendToStudentAfterSave(false);
  }, [canSendToStudentForEvent, assigneeIds.length, queueSendToStudentAfterSave]);

  // Keep weekly "On" default aligned with selected date until user manually edits weekday chips.
  useEffect(() => {
    if (!isRecurring || placement !== 'calendar' || recurrenceType !== 'weekly') return;
    if (!isRecurrenceWeekdayAutofilled) return;
    if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) return;
    setRecurrenceWeekdays([dueDate.getDay()]);
  }, [dueDate, isRecurring, placement, recurrenceType, isRecurrenceWeekdayAutofilled]);

  const resolvedClassDayTermEnd = useMemo(() => {
    if (!plannerDefaults || !(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) return null;
    const fallStart = parseYmdDate(plannerDefaults.default_fall_term_start_date);
    const fallEnd = parseYmdDate(plannerDefaults.default_fall_term_end_date);
    const springStart = parseYmdDate(plannerDefaults.default_spring_term_start_date);
    const springEnd = parseYmdDate(plannerDefaults.default_spring_term_end_date);
    const yearEnd = parseYmdDate(plannerDefaults.default_year_end_date);
    if (isDateWithin(dueDate, fallStart, fallEnd)) return fallEnd;
    if (isDateWithin(dueDate, springStart, springEnd)) return springEnd;
    return yearEnd;
  }, [plannerDefaults, dueDate]);

  const recurrenceSavedYearEnd = useMemo(() => {
    return parseYmdDate(plannerDefaults?.default_year_end_date);
  }, [plannerDefaults]);

  const resolveSubjectTermEndDate = useCallback((subject) => {
    if (!subject) return null;
    const term = normalizeSubjectTerm(subject.school_term);
    const parsedYear = parseSchoolYearLabel(subject.school_year);
    const fallbackStartYear = dueDate instanceof Date && !Number.isNaN(dueDate.getTime())
      ? (dueDate.getMonth() + 1 >= 8 ? dueDate.getFullYear() : dueDate.getFullYear() - 1)
      : new Date().getFullYear();
    const fallbackEndYear = fallbackStartYear + 1;
    const startYear = parsedYear?.startYear || fallbackStartYear;
    const endYear = parsedYear?.endYear || fallbackEndYear;

    const defaultFallTermEnd = parseYmdDate(plannerDefaults?.default_fall_term_end_date);
    const defaultSpringTermEnd = parseYmdDate(plannerDefaults?.default_spring_term_end_date);
    const defaultYearEnd = parseYmdDate(plannerDefaults?.default_year_end_date);
    const templateEnd =
      term === 'fall_term'
        ? defaultFallTermEnd
        : (term === 'spring_term' ? defaultSpringTermEnd : defaultYearEnd || defaultSpringTermEnd);
    const fallbackMonthDay =
      term === 'fall_term'
        ? { month: 11, day: 31 }
        : { month: 5, day: 30 };
    const month = templateEnd ? templateEnd.getMonth() : fallbackMonthDay.month;
    const day = templateEnd ? templateEnd.getDate() : fallbackMonthDay.day;
    const year = term === 'fall_term' ? startYear : endYear;
    const resolved = new Date(year, month, day);
    return Number.isNaN(resolved.getTime()) ? null : resolved;
  }, [plannerDefaults, dueDate]);

  useEffect(() => {
    if (!visible) return;
    if (eventType !== 'Class Day') {
      if (classDayDefaultsApplied) setClassDayDefaultsApplied(false);
      return;
    }
    if (classDayDefaultsApplied || !plannerDefaults) return;
    const allowedWeekdays = Array.isArray(plannerDefaults.allowed_weekdays)
      ? plannerDefaults.allowed_weekdays
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6)
      : [];
    if (allowedWeekdays.length > 0) {
      const sorted = Array.from(new Set(allowedWeekdays)).sort((a, b) => a - b);
      setRecurrenceWeekdays(sorted);
      setIsRecurrenceWeekdayAutofilled(false);
    } else if (dueDate instanceof Date && !Number.isNaN(dueDate.getTime())) {
      setRecurrenceWeekdays([dueDate.getDay()]);
      setIsRecurrenceWeekdayAutofilled(true);
    }
    const defaultStart = toAmPmTime(plannerDefaults.default_day_start_time);
    const defaultEnd = toAmPmTime(plannerDefaults.default_day_end_time);
    if (defaultStart) setStartTime(defaultStart);
    if (defaultEnd) setEndTime(defaultEnd);
    // Keep repeat default OFF in create flow for every event type.
    setShowRecurringSection(false);
    setRecurrenceType('weekly');
    setRecurrenceInterval(1);
    setRecurrenceIntervalText('1');
    if (resolvedClassDayTermEnd) {
      setRecurrenceEndType('on');
      setRecurrenceEndDate(new Date(resolvedClassDayTermEnd));
    }
    setRespectSavedDaysOff(true);
    setClassDayDefaultsApplied(true);
  }, [
    visible,
    eventType,
    plannerDefaults,
    dueDate,
    resolvedClassDayTermEnd,
    classDayDefaultsApplied,
  ]);

  useEffect(() => {
    if (!visible || eventType !== 'Class Day' || !subjectId) return;
    const selectedSubject = (subjects || []).find((item) => String(item?.id) === String(subjectId));
    if (!selectedSubject) return;
    const subjectTermEnd = resolveSubjectTermEndDate(selectedSubject);
    if (!subjectTermEnd) return;
    setRecurrenceEndType('on');
    setRecurrenceEndDate((prev) => {
      const prevYmd = toYmd(prev);
      const nextYmd = toYmd(subjectTermEnd);
      if (prevYmd && nextYmd && prevYmd === nextYmd) return prev;
      return new Date(subjectTermEnd);
    });
  }, [visible, eventType, subjectId, subjects, resolveSubjectTermEndDate]);

  const fetchSubjects = async () => {
    if (!familyId) return;
    setLoadingSubjects(true);
    try {
      // If no assignees selected, show no subjects (user must select assignee first)
      if (assigneeIds.length === 0) {
        setSubjects((prev) => (Array.isArray(prev) && prev.length === 0 ? prev : []));
        setLoadingSubjects(false);
        return;
      }
      
      // First, fetch all subjects to see what we have
      const { data: allSubjects, error: allError } = await supabase
        .from('subject')
        .select('id, name, child_id, school_year, school_term')
        .eq('family_id', familyId);
      
      if (allError) {
        console.error('Error fetching all subjects:', allError);
        throw allError;
      }
      
      // Filter in JavaScript: Show both family-wide subjects AND child-specific subjects
      // Family-wide subjects (child_id: null) show for all children
      // Child-specific subjects only show for the assigned child
      // Deduplicate by name - if same name exists as both family-wide and child-specific, prefer child-specific
      const subjectMap = new Map();
      
      (allSubjects || []).forEach(subject => {
        const subjectChildIds = parseSubjectChildIds(subject.child_id);
        const isFamilyWide = subjectChildIds.length === 0;
        const isForSelectedChild = subjectChildIds.some((id) =>
          assigneeIds.some((assigneeId) => String(assigneeId) === String(id))
        );
        // Always include the subject matching defaultSubjectId, even if filters would exclude it
        const isDefaultSubject = !!defaultSubjectId && subject.id === defaultSubjectId;
        const shouldInclude = isFamilyWide || isForSelectedChild || isDefaultSubject;
        
        if (shouldInclude) {
          const existing = subjectMap.get(subject.name);
          const existingChildIds = existing ? parseSubjectChildIds(existing.child_id) : [];
          const existingIsFamilyWide = existingChildIds.length === 0;
          const subjectIsFamilyWide = subjectChildIds.length === 0;
          
          // If no existing entry, add this one
          if (!existing) {
            subjectMap.set(subject.name, subject);
          } 
          // If existing is family-wide and this is child-specific, replace it (prefer child-specific)
          else if (existingIsFamilyWide && !subjectIsFamilyWide) {
            subjectMap.set(subject.name, subject);
          }
          // If existing is child-specific and this is also child-specific, keep existing (already preferred)
          else if (!existingIsFamilyWide && !subjectIsFamilyWide) {
            // If both are child-specific, prefer:
            // 1) The one matching defaultSubjectId if present
            // 2) Otherwise the one matching the first selected assignee
            const existingIsDefault = !!defaultSubjectId && existing.id === defaultSubjectId;
            const currentIsDefault = !!defaultSubjectId && subject.id === defaultSubjectId;
            const firstAssigneeId = assigneeIds[0];
            const currentMatchesFirst = subjectChildIds.some(
              (id) => String(id) === String(firstAssigneeId)
            );
            const existingMatchesFirst = existingChildIds.some(
              (id) => String(id) === String(firstAssigneeId)
            );
            
            if (currentIsDefault && !existingIsDefault) {
              subjectMap.set(subject.name, subject);
            } else if (!existingIsDefault && currentMatchesFirst && !existingMatchesFirst) {
              subjectMap.set(subject.name, subject);
            }
          }
        }
      });
      
      const fetchedSubjects = Array.from(subjectMap.values())
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      
      setSubjects((prev) => {
        const prevSig = (prev || []).map((s) => String(s?.id || '')).join('|');
        const nextSig = (fetchedSubjects || []).map((s) => String(s?.id || '')).join('|');
        return prevSig === nextSig ? prev : fetchedSubjects;
      });
      
      // Drop selected subjects that are no longer valid for current assignees.
      if (subjectIds.length > 0) {
        const allowed = new Set((fetchedSubjects || []).map((s) => String(s.id)));
        const nextSelected = subjectIds.filter((sid) => allowed.has(String(sid)));
        if (nextSelected.length !== subjectIds.length) {
          applySubjectSelection(nextSelected);
        }
      }
    } catch (error) {
      console.error('Error in fetchSubjects:', error);
      setSubjects((prev) => (Array.isArray(prev) && prev.length === 0 ? prev : []));
    } finally {
      setLoadingSubjects(false);
    }
  };

  const fetchSubjectGoals = async (childId) => {
    if (!childId) return;
    try {
      const { data, error } = await supabase
        .from('subject_goals')
        .select('id, subject_id, minutes_per_week')
        .eq('child_id', childId)
        .eq('is_active', true);
      
      if (error) {
        // Silently handle permission errors (403) - RLS policies may restrict access
        if (error.code === 'PGRST301' || error.status === 403 || error.message?.includes('permission')) {
          setSubjectGoals([]);
          return;
        }
        throw error;
      }
      setSubjectGoals(data || []);
    } catch (error) {
      // Subject goals might not exist yet or permission denied, that's okay
      setSubjectGoals([]);
    }
  };

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
          easing: Easing.out(Easing.quad),
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: Platform.OS !== 'web',
          friction: 8,
          tension: 80,
        }),
      ]).start();
    } else {
      fade.setValue(0);
      scale.setValue(0.96);
    }
  }, [visible, fade, scale]);

  // Label functions removed - labels no longer used

  // Format time input as a guided mask while preserving typed intent.
  const formatTimeInput = (text, previousValue = '') => {
    if (!text || !String(text).trim()) return '';
    const raw = String(text);
    const upperText = raw.toUpperCase();
    const condensedUpperText = upperText.replace(/\s+/g, '');
    const hasExplicitAM = /\bAM\b/.test(upperText) || condensedUpperText.endsWith('AM');
    const hasExplicitPM = /\bPM\b/.test(upperText) || condensedUpperText.endsWith('PM');
    const hasPartialAM = !hasExplicitAM && !hasExplicitPM && condensedUpperText.includes('A');
    const hasPartialPM = !hasExplicitAM && !hasExplicitPM && condensedUpperText.includes('P');
    const previousUpper = String(previousValue || '').toUpperCase();
    const previousPeriod = previousUpper.includes('PM')
      ? 'PM'
      : previousUpper.includes('AM')
        ? 'AM'
        : '';
    let period = hasExplicitPM || hasPartialPM
      ? 'PM'
      : hasExplicitAM || hasPartialAM
        ? 'AM'
        : previousPeriod || '__';

    let hourDigits = '';
    let minuteDigits = '';
    if (raw.includes(':')) {
      const colonIndex = raw.indexOf(':');
      hourDigits = raw.slice(0, colonIndex).replace(/\D/g, '').slice(0, 2);
      minuteDigits = raw.slice(colonIndex + 1).replace(/\D/g, '').slice(0, 2);
    } else {
      const digits = raw.replace(/\D/g, '').slice(0, 4);
      if (digits.length <= 2) {
        hourDigits = digits;
      } else {
        hourDigits = digits.slice(0, 2);
        minuteDigits = digits.slice(2);
      }
    }

    if (hourDigits.length === 2) {
      const hourNum = parseInt(hourDigits, 10);
      if (hourNum === 0) {
        hourDigits = '12';
      } else if (hourNum > 12) {
        minuteDigits = `${hourDigits[1]}${minuteDigits}`.slice(0, 2);
        hourDigits = hourDigits[0];
      }
    }

    if (minuteDigits.length === 2) {
      const minuteNum = parseInt(minuteDigits, 10);
      if (minuteNum > 59) {
        minuteDigits = '59';
      }
    }

    const hourMask = `${hourDigits[0] || '_'}${hourDigits[1] || '_'}`;
    const minuteMask = `${minuteDigits[0] || '_'}${minuteDigits[1] || '_'}`;
    const periodMask = `${period[0] || '_'}${period[1] || '_'}`;
    return `${hourMask}:${minuteMask} ${periodMask}`;
  };

  const TIME_MASK = '__:__ __';
  const TIME_TOKEN_INDEXES = [0, 1, 3, 4, 6, 7];
  const DIGIT_TOKEN_INDEXES = [0, 1, 3, 4];
  const setMaskedCaret = (inputEl, pos) => {
    if (Platform.OS !== 'web' || !inputEl) return;
    requestAnimationFrame(() => {
      try {
        inputEl.setSelectionRange(pos, pos);
      } catch (_) {
        // Ignore selection errors in unsupported states.
      }
    });
  };
  const normalizeMask = (value, previousValue = '') => {
    const next = formatTimeInput(value || TIME_MASK, previousValue || '');
    return next || TIME_MASK;
  };
  const nextTokenIndex = (pos, inclusive = true) => {
    for (const idx of TIME_TOKEN_INDEXES) {
      if ((inclusive && idx >= pos) || (!inclusive && idx > pos)) return idx;
    }
    return TIME_TOKEN_INDEXES[TIME_TOKEN_INDEXES.length - 1];
  };
  const prevTokenIndex = (pos, inclusive = true) => {
    for (let i = TIME_TOKEN_INDEXES.length - 1; i >= 0; i -= 1) {
      const idx = TIME_TOKEN_INDEXES[i];
      if ((inclusive && idx <= pos) || (!inclusive && idx < pos)) return idx;
    }
    return TIME_TOKEN_INDEXES[0];
  };
  const clearTokenAt = (chars, idx) => {
    if (!TIME_TOKEN_INDEXES.includes(idx)) return;
    chars[idx] = '_';
    if (idx === 6 || idx === 7) {
      chars[6] = '_';
      chars[7] = '_';
    }
  };
  const snapTimeCaretToToken = (inputEl) => {
    if (Platform.OS !== 'web' || !inputEl) return;
    const caret = typeof inputEl.selectionStart === 'number' ? inputEl.selectionStart : 0;
    if (TIME_TOKEN_INDEXES.includes(caret)) return;
    if (caret <= 2) {
      setMaskedCaret(inputEl, caret <= 1 ? caret : 3);
      return;
    }
    if (caret <= 5) {
      setMaskedCaret(inputEl, caret <= 4 ? caret : 6);
      return;
    }
    setMaskedCaret(inputEl, caret >= 7 ? 7 : 6);
  };
  const handleTimeMaskedWebKeyDown = (e, value, setValue) => {
    if (Platform.OS !== 'web') return;
    const key = String(e.key || '');
    if (key === 'Tab') return;
    const inputEl = e.currentTarget;
    const current = normalizeMask(value, value);
    const chars = current.split('');
    const start = typeof inputEl.selectionStart === 'number' ? inputEl.selectionStart : 0;
    const end = typeof inputEl.selectionEnd === 'number' ? inputEl.selectionEnd : start;
    const hasSelection = end > start;
    const clearSelectionTokens = () => {
      if (!hasSelection) return false;
      for (const idx of TIME_TOKEN_INDEXES) {
        if (idx >= start && idx < end) clearTokenAt(chars, idx);
      }
      return true;
    };

    if (key === 'ArrowLeft') {
      e.preventDefault();
      setMaskedCaret(inputEl, prevTokenIndex(start, false));
      return;
    }
    if (key === 'ArrowRight') {
      e.preventDefault();
      setMaskedCaret(inputEl, nextTokenIndex(start, false));
      return;
    }
    if (key === 'Home') {
      e.preventDefault();
      setMaskedCaret(inputEl, 0);
      return;
    }
    if (key === 'End') {
      e.preventDefault();
      setMaskedCaret(inputEl, 7);
      return;
    }
    if (key === 'Backspace') {
      e.preventDefault();
      if (clearSelectionTokens()) {
        const nextValue = chars.join('');
        setValue(nextValue);
        setMaskedCaret(inputEl, prevTokenIndex(start, true));
        return;
      }
      const target = prevTokenIndex(start, false);
      clearTokenAt(chars, target);
      const nextValue = chars.join('');
      setValue(nextValue);
      setMaskedCaret(inputEl, target);
      return;
    }
    if (key === 'Delete') {
      e.preventDefault();
      if (clearSelectionTokens()) {
        const nextValue = chars.join('');
        setValue(nextValue);
        setMaskedCaret(inputEl, start);
        return;
      }
      const target = nextTokenIndex(start, true);
      clearTokenAt(chars, target);
      const nextValue = chars.join('');
      setValue(nextValue);
      setMaskedCaret(inputEl, target);
      return;
    }

    if (key.length !== 1) return;
    const upper = key.toUpperCase();
    const isDigit = /^[0-9]$/.test(upper);
    const isPeriodKey = upper === 'A' || upper === 'P' || upper === 'M';
    if (!isDigit && !isPeriodKey) {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    clearSelectionTokens();
    let target = nextTokenIndex(start, true);

    if (isDigit) {
      if (!DIGIT_TOKEN_INDEXES.includes(target)) {
        target = nextTokenIndex(0, true);
      }
      if (target === 0 && Number(upper) > 1) {
        chars[0] = '0';
        chars[1] = upper;
        const nextValue = chars.join('');
        setValue(nextValue);
        setMaskedCaret(inputEl, 3);
        return;
      }
      if (target === 1 && chars[0] === '_') {
        chars[0] = '0';
      }
      if (target === 0 && Number(upper) > 1) return;
      if (target === 1) {
        const tens = chars[0];
        if (tens === '1' && Number(upper) > 2) return;
      }
      if (target === 3 && Number(upper) > 5) return;
      chars[target] = upper;
      const nextValue = chars.join('');
      setValue(nextValue);
      setMaskedCaret(inputEl, nextTokenIndex(target, false));
      return;
    }

    // Period editing
    if (upper === 'A' || upper === 'P') {
      chars[6] = upper;
      chars[7] = 'M';
      const nextValue = chars.join('');
      setValue(nextValue);
      setMaskedCaret(inputEl, 7);
      return;
    }
    if (upper === 'M' && (chars[6] === 'A' || chars[6] === 'P')) {
      chars[7] = 'M';
      const nextValue = chars.join('');
      setValue(nextValue);
      setMaskedCaret(inputEl, 7);
    }
  };

  const parseTimeString = (timeStr) => {
    if (!timeStr) return null;
    const normalized = String(timeStr).replace(/_/g, '').trim();
    // Accept masked/manual formats: "6 PM", "6:00 PM", "18:00", "6:00"
    const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const period = match[3] ? match[3].toUpperCase() : null;

    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
      return null;
    }

    if (period) {
      if (hours < 1 || hours > 12) return null;
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
    } else {
      // No AM/PM provided: treat as 24-hour input.
      if (hours < 0 || hours > 23) return null;
    }

    return { hours, minutes };
  };

  const applyTimeToDate = (date, timeStr) => {
    const parts = parseTimeString(timeStr);
    if (!parts) return null;
    const result = new Date(date);
    result.setHours(parts.hours, parts.minutes, 0, 0);
    return result;
  };

  const calculateMinutes = (startDate, endDate) => {
    if (!startDate || !endDate) return null;
    return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
  };

  const normalizeRecurringSeriesTimes = useCallback(
    async ({ eventId, desiredStart, desiredEnd }) => {
      if (!eventId || !desiredStart || !desiredEnd || !effectiveFamilyId) return;
      const desiredDurationMs = Math.max(
        desiredEnd.getTime() - desiredStart.getTime(),
        DEFAULT_DURATION_MINUTES * 60 * 1000
      );
      if (!Number.isFinite(desiredDurationMs) || desiredDurationMs <= 0) return;

      const { data: anchor, error: anchorError } = await supabase
        .from('events')
        .select('id, parent_event_id, recurrence_id')
        .eq('id', eventId)
        .eq('family_id', effectiveFamilyId)
        .maybeSingle();
      if (anchorError || !anchor?.id) {
        if (anchorError) {
          console.warn('[TaskCreateModal] Could not load recurring anchor for time normalization:', anchorError);
        }
        return;
      }

      const seriesKey = String(anchor.recurrence_id || anchor.parent_event_id || anchor.id || '').trim();
      if (!seriesKey) return;

      const { data: seriesRows, error: seriesError } = await supabase
        .from('events')
        .select('id, start_ts, end_ts')
        .eq('family_id', effectiveFamilyId)
        .or(`id.eq.${seriesKey},parent_event_id.eq.${seriesKey},recurrence_id.eq.${seriesKey}`)
        .is('deleted_at', null);
      if (seriesError || !Array.isArray(seriesRows) || seriesRows.length === 0) {
        if (seriesError) {
          console.warn('[TaskCreateModal] Could not load recurring series rows for time normalization:', seriesError);
        }
        return;
      }

      const targetHours = desiredStart.getHours();
      const targetMinutes = desiredStart.getMinutes();
      const targetSeconds = desiredStart.getSeconds();
      const updates = [];
      for (const row of seriesRows) {
        const rowStart = row?.start_ts ? new Date(row.start_ts) : null;
        if (!(rowStart instanceof Date) || Number.isNaN(rowStart.getTime())) continue;
        const normalizedStart = new Date(rowStart);
        normalizedStart.setHours(targetHours, targetMinutes, targetSeconds, 0);
        const normalizedEnd = new Date(normalizedStart.getTime() + desiredDurationMs);

        const previousStartMs = rowStart.getTime();
        const previousEndMs = row?.end_ts ? new Date(row.end_ts).getTime() : NaN;
        const startDiffMs = Math.abs(normalizedStart.getTime() - previousStartMs);
        const endDiffMs = Number.isFinite(previousEndMs)
          ? Math.abs(normalizedEnd.getTime() - previousEndMs)
          : Number.POSITIVE_INFINITY;
        // Ignore tiny second/millisecond drift and only patch real time shifts.
        if (startDiffMs < 30 * 1000 && endDiffMs < 30 * 1000) continue;

        updates.push({
          id: row.id,
          start_ts: normalizedStart.toISOString(),
          end_ts: normalizedEnd.toISOString(),
        });
      }

      if (updates.length === 0) return;
      await Promise.all(
        updates.map((u) =>
          supabase
            .from('events')
            .update({
              start_ts: u.start_ts,
              end_ts: u.end_ts,
              is_flexible: false,
            })
            .eq('family_id', effectiveFamilyId)
            .eq('id', u.id)
        )
      );
      console.log('[TaskCreateModal] Normalized recurring series times after create:', {
        seriesKey,
        count: updates.length,
        time: `${targetHours}:${targetMinutes.toString().padStart(2, '0')}`,
      });
    },
    [effectiveFamilyId]
  );

  const fetchPotentialConflictingEvents = useCallback(
    async (rangeStart, rangeEnd, targetChildIds) => {
      const childIdList = Array.isArray(targetChildIds) ? targetChildIds.filter(Boolean) : [];
      if (!familyId || childIdList.length === 0 || !rangeStart || !rangeEnd) return [];

      const startIso = new Date(rangeStart).toISOString();
      const endIso = new Date(rangeEnd).toISOString();

      const baseFilters = (query) =>
        query
          .eq('family_id', familyId)
          .lt('start_ts', endIso)
          .is('canceled_at', null)
          .is('deleted_at', null);

      const [{ data: directEvents, error: directError }, { data: arrayEvents, error: arrayError }] = await Promise.all([
        baseFilters(supabase.from('events').select('*').in('child_id', childIdList)),
        baseFilters(supabase.from('events').select('*').not('child_ids', 'is', null)),
      ]);

      if (directError) throw directError;
      if (arrayError) throw arrayError;

      const matchesChildIds = (event) => {
        if (childIdList.includes(event?.child_id)) return true;
        return Array.isArray(event?.child_ids) && event.child_ids.some((id) => childIdList.includes(id));
      };

      const overlapsRange = (event) => {
        const eventStart = new Date(event.start_ts);
        const eventEnd = event.end_ts ? new Date(event.end_ts) : null;
        return eventStart < new Date(rangeEnd) && (!eventEnd || eventEnd > new Date(rangeStart));
      };

      const shouldCountAsConflict = (event) => {
        const status = String(event?.status || '').toLowerCase();
        if (status === 'canceled' || status === 'done') return false;
        if (event?.is_backlog === true) return false;
        // Flexible events are intentionally movable and should not block fixed-time scheduling.
        if (event?.is_flexible === true) return false;
        // Recurring "master" rows are hidden templates; only concrete instances should conflict.
        if (event?.recurrence_rule && String(event?.id || '') === String(event?.parent_event_id || '')) return false;
        if (event?.canceled_at || event?.deleted_at) return false;
        return true;
      };

      const deduped = [];
      const seen = new Set();
      [...(directEvents || []), ...(arrayEvents || [])].forEach((event) => {
        if (!event?.id || seen.has(event.id)) return;
        if (!shouldCountAsConflict(event)) return;
        if (!matchesChildIds(event) || !overlapsRange(event)) return;
        seen.add(event.id);
        deduped.push(event);
      });

      return deduped;
    },
    [familyId]
  );

  const createOverlapAllowedEventFallback = useCallback(
    async ({ title, startDate, endDate, childIds, eventType, minutes, recurrenceRule, resolvedFamilyId }) => {
      const insertPayload = {
        family_id: resolvedFamilyId || familyId,
        child_id: null,
        child_ids: childIds && childIds.length > 0 ? childIds : [],
        title: title.trim(),
        start_ts: startDate.toISOString(),
        end_ts: endDate?.toISOString() || null,
        description: notes.trim() || null,
        status: 'scheduled',
        source: 'manual',
        tags: null,
        is_flexible: true,
        is_backlog: false,
        event_type: normalizeEventTypeForPersistence(eventType),
        subject_id: subjectIds[0] || null,
        curriculum_metadata: withSubjectIdsInCurriculumMetadata(
          lesson.trim() ? { lesson_label: lesson.trim() } : null,
          subjectIds
        ),
        unit: unit.trim() || null,
        curriculum_unit_title: unit.trim() || null,
        lesson: lesson.trim() || null,
        grade: grade.trim() || null,
        location: location.trim() || null,
        mode: mode || null,
        instructor: instructor.trim() || null,
        goal_link: goalLink || null,
        minutes,
        materials_attachment_ids: attachedMaterialIds.length > 0 ? attachedMaterialIds : null,
        recurrence_rule: recurrenceRule || null,
      };

      const { data: inserted, error: insertError } = await supabase
        .from('events')
        .insert(insertPayload)
        .select('*')
        .single();

      if (insertError) throw insertError;
      return inserted;
    },
    [attachedMaterialIds, familyId, goalLink, grade, instructor, lesson, location, mode, notes, subjectIds, unit]
  );

  // Handle overlap errors by fetching conflicting events and showing conflict warning
  const handleOverlapError = async (errorMessage, startDate, endDate, assigneeIds, eventTypeParam = null) => {
    const eventTypeToUse = eventTypeParam || eventType;
    try {
      // Check if error is an overlap error
      if (!errorMessage || (!errorMessage.includes('overlap') && !errorMessage.includes('Event overlaps'))) {
        return false;
      }

      console.log('[TaskCreateModal] Detected overlap error, fetching conflicting events...');
      
      // Extract child ID from error message if available
      const childIdMatch = errorMessage.match(/child:\s*([a-f0-9-]+)/i);
      const targetChildIds = childIdMatch ? [childIdMatch[1]] : assigneeIds;

      // Fetch events that might conflict in the date range
      const startOfRange = new Date(startDate);
      startOfRange.setHours(0, 0, 0, 0);
      const endOfRange = new Date(endDate || startDate);
      endOfRange.setHours(23, 59, 59, 999);

      let dedupedEvents = [];
      try {
        dedupedEvents = await fetchPotentialConflictingEvents(startOfRange, endOfRange, targetChildIds);
      } catch (fetchError) {
        console.warn('[TaskCreateModal] Could not fetch conflicting events:', fetchError);
        return false;
      }

      if (dedupedEvents.length === 0) {
        setConflictWarning({
          event: null,
          message: 'another event at this time',
          conflictCount: 1,
          allConflicts: [],
          isGenericConflict: true,
        });
        return true;
      }

      // Check which events actually overlap
      const conflicts = [];
      const resolvedStart = new Date(startDate);
      const resolvedEnd = new Date(endDate || startDate);

      for (const event of dedupedEvents) {
        if (shouldSkipConflictEvent(event)) continue;
        const eventStart = new Date(event.start_ts);
        const eventEnd = new Date(event.end_ts || event.start_ts);

        if (resolvedStart < eventEnd && eventStart < resolvedEnd) {
          // Format conflict message
          const eventDate = new Date(event.start_ts);
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const dayName = dayNames[eventDate.getDay()];
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const monthName = monthNames[eventDate.getMonth()];
          const day = eventDate.getDate();
          
          // Format time
          const formatTime = (date) => {
            let hours = date.getHours();
            const minutes = date.getMinutes();
            const period = hours >= 12 ? 'PM' : 'AM';
            if (hours > 12) hours -= 12;
            else if (hours === 0) hours = 12;
            return minutes === 0 ? `${hours} ${period}` : `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
          };
          
          const startTimeStr = formatTime(eventStart);
          const endTimeStr = formatTime(eventEnd);
          
          // Format time range
          const startTimeOnly = startTimeStr.replace(/\s*(AM|PM)$/i, '');
          const endTimeOnly = endTimeStr.replace(/\s*(AM|PM)$/i, '');
          const period = startTimeStr.includes('PM') ? 'PM' : 'AM';
          const timeRange = `${startTimeOnly}–${endTimeOnly} ${period}`;
          
          conflicts.push({
            event,
            message: `${event.title} (${dayName} ${monthName} ${day}, ${timeRange})`
          });
        }
      }

      if (conflicts.length > 0) {
        console.log('[TaskCreateModal] Setting conflict warning from overlap error:', conflicts[0]);
        setConflictWarning({
          ...conflicts[0],
          conflictCount: conflicts.length,
          allConflicts: conflicts,
        });
        return true;
      }

      return false;
    } catch (err) {
      console.error('[TaskCreateModal] Error handling overlap error:', err);
      return false;
    }
  };

  // Find next available slot on the same day for inline reschedule suggestion
  const findNextAvailableSlot = async (conflictEvent, currentStart, currentEnd, existingEvents, childIds) => {
    try {
      const duration = (currentEnd - currentStart) / (1000 * 60); // Duration in minutes
      const conflictEnd = new Date(conflictEvent.end_ts || conflictEvent.start_ts);
      
      // Start looking from the end of the conflicting event
      let candidateStart = new Date(conflictEnd);
      const dayEnd = new Date(candidateStart);
      dayEnd.setHours(23, 59, 0, 0);
      
      // Try slots in 15-minute increments up to end of day
      while (candidateStart < dayEnd) {
        const candidateEnd = new Date(candidateStart.getTime() + duration * 60 * 1000);
        
        // Check if this slot conflicts with any existing events
        let hasConflict = false;
        for (const event of existingEvents || []) {
          if (event.id === conflictEvent.id) continue; // Skip the conflicting event itself
          
          const eventStart = new Date(event.start_ts);
          const eventEnd = new Date(event.end_ts || event.start_ts);
          
          // Check if candidate overlaps with this event
          if (candidateStart < eventEnd && eventStart < candidateEnd) {
            // Check if it's for the same child
            const eventChildIds = event.child_id ? [event.child_id] : (event.child_ids || []);
            if (childIds.some(id => eventChildIds.includes(id))) {
              hasConflict = true;
              break;
            }
          }
        }
        
        if (!hasConflict && candidateEnd <= dayEnd) {
          // Found an available slot!
          return {
            newStart: candidateStart,
            newEnd: candidateEnd,
          };
        }
        
        // Move to next 15-minute slot
        candidateStart = new Date(candidateStart.getTime() + 15 * 60 * 1000);
      }
      
      // No slot found on same day
      return null;
    } catch (err) {
      console.error('[TaskCreateModal] Error finding available slot:', err);
      return null;
    }
  };

  // Determine if academic fields should be shown
  const showAcademicFields = () => {
    return eventType && ['Live Class', 'Home Lesson', 'Core Class', 'Assessment'].includes(eventType);
  };

  // Determine if location/mode fields should be shown
  const showLocationFields = () => {
    return eventType && ['Appointment', 'Travel', 'Activity', 'Sport'].includes(eventType);
  };

  /** Single source of truth for required-field validation (inline errors + Add button state). */
  const buildValidationBannerMessage = useCallback((errors) => {
    const messagesByKey = {
      title: 'enter an event name',
      eventType: 'select an event type',
      date: 'choose a date',
      assignee: 'select at least one assignee',
      time: 'enter a start time',
      endDate: 'set a valid end date',
      recurrenceWeekdays: 'select at least one weekday',
      recurrenceInterval: 'enter a recurrence interval',
      recurrenceEnd: 'set a valid recurrence end',
    };
    const orderedKeys = [
      'title',
      'eventType',
      'date',
      'assignee',
      'time',
      'endDate',
      'recurrenceWeekdays',
      'recurrenceInterval',
      'recurrenceEnd',
    ];
    const missing = orderedKeys
      .filter((key) => Boolean(errors?.[key]))
      .map((key) => messagesByKey[key])
      .filter(Boolean);
    if (missing.length === 0) return '';
    if (missing.length === 1) return `Please ${missing[0]} before saving.`;
    if (missing.length === 2) return `Please ${missing[0]} and ${missing[1]} before saving.`;
    return `Please ${missing.slice(0, -1).join(', ')}, and ${missing[missing.length - 1]} before saving.`;
  }, []);

  const computeFieldErrors = () => {
    const errors = {};

    if (!title.trim()) {
      errors.title = 'Title is required';
    }

    if (!dueDate) {
      errors.date = 'Date is required';
    }

    if (!eventType) {
      errors.eventType = 'Event type is required';
    }

    if (assigneeIds.length === 0) {
      errors.assignee =
        familyMembers.length === 0
          ? 'Add a child in Family settings to assign this event.'
          : 'Select at least one assignee';
    }

    if (isRecurring && placement === 'calendar') {
      if (recurrenceType === 'weekly' && (!Array.isArray(recurrenceWeekdays) || recurrenceWeekdays.length === 0)) {
        errors.recurrenceWeekdays = 'Select at least one weekday';
      }
      const intervalFromState = Number(recurrenceInterval);
      const intervalFromText = recurrenceIntervalText ? parseInt(recurrenceIntervalText, 10) : NaN;
      const interval =
        Number.isFinite(intervalFromState) && intervalFromState >= 1
          ? intervalFromState
          : intervalFromText;
      if (!Number.isFinite(interval) || interval < 1) {
        errors.recurrenceInterval = 'Enter an interval (1 or more)';
      }
      if (recurrenceEndType === 'after') {
        const fromNum = recurrenceEndAfter != null ? Number(recurrenceEndAfter) : NaN;
        const fromText = recurrenceEndAfterText ? parseInt(recurrenceEndAfterText, 10) : NaN;
        const countValue =
          Number.isFinite(fromNum) && fromNum >= 1 ? fromNum : fromText;
        if (!Number.isFinite(countValue) || countValue < 1) {
          errors.recurrenceEnd = 'Enter a number of occurrences (1 or more)';
        }
      } else if (recurrenceEndType === 'on' && !recurrenceEndDate) {
        errors.recurrenceEnd = 'Select an end date for the series';
      } else if (recurrenceEndType === 'term_end' && !recurrenceSavedYearEnd) {
        errors.recurrenceEnd = 'Set a school-year end date in Planning Preferences first';
      }
    }

    return errors;
  };

  const validateFields = ({ showBanner = false } = {}) => {
    const errors = computeFieldErrors();
    setValidationErrors(errors);
    if (showBanner) {
      setValidationBanner(Object.keys(errors).length > 0 ? buildValidationBannerMessage(errors) : '');
    }
    return Object.keys(errors).length === 0;
  };

  const isFormValid = () => Object.keys(computeFieldErrors()).length === 0;

  useEffect(() => {
    if (!validationBanner) return;
    const currentErrors = computeFieldErrors();
    if (Object.keys(currentErrors).length === 0) {
      setValidationBanner('');
      return;
    }
    setValidationBanner(buildValidationBannerMessage(currentErrors));
  }, [
    validationBanner,
    title,
    dueDate,
    eventEndDate,
    placement,
    allDay,
    startTime,
    eventType,
    assigneeIds,
    isRecurring,
    recurrenceType,
    recurrenceWeekdays,
    recurrenceInterval,
    recurrenceIntervalText,
    recurrenceEndType,
    recurrenceEndAfter,
    recurrenceEndAfterText,
    recurrenceEndDate,
    recurrenceSavedYearEnd,
    buildValidationBannerMessage,
  ]);

  const handleDismiss = useCallback(() => {
    setValidationErrors({});
    setValidationBanner('');
    setPercentValidationError(null);
    onClose?.();
  }, [onClose]);

  const mergeDescriptionWithNote = useCallback((prev, note) => {
    const n = (note || '').trim();
    if (!n) return prev || null;
    const p = (prev || '').trim();
    return p ? `${p}\n\n${n}` : n;
  }, []);

  const queueSendToStudentsAfterSave = useCallback(async ({
    createdEvent,
    familyIdToUse,
    userId,
    note,
  }) => {
    if (!createdEvent?.id || !familyIdToUse || !userId || assigneeIds.length === 0) return false;
    if (!isSchoolWorkEventType(createdEvent?.event_type || eventType)) return false;

    const eventIdStr = String(createdEvent.id);
    const dueTs = createdEvent.due_ts || createdEvent.end_ts || createdEvent.start_ts;
    const dueStr = dueTs ? new Date(dueTs).toISOString().split('T')[0] : null;
    const titleBase = String(createdEvent.title || title || 'Schoolwork').trim().slice(0, 200);
    const noteTrim = String(note || '').trim();

    for (const childId of assigneeIds) {
      const { data: rows, error: findErr } = await supabase
        .from('assignments')
        .select('id, title, description, linked_event_ids, need_help')
        .eq('family_id', familyIdToUse)
        .eq('child_id', childId)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (findErr) throw findErr;

      const linked = (rows || []).find((r) => assignmentRowLinksEventId(r, eventIdStr)) || null;
      if (linked?.id) {
        const updates = {
          assigned_by: userId,
          status: 'not_started',
        };
        if (isChildHelpAssignment(linked)) {
          updates.title = titleBase;
          updates.need_help = false;
        }
        if (noteTrim) {
          updates.description = mergeDescriptionWithNote(linked.description, noteTrim);
        }
        const { error: upErr } = await updateAssignment(linked.id, updates);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await createAssignment({
          family_id: familyIdToUse,
          child_id: childId,
          title: titleBase,
          description: noteTrim || null,
          assigned_by: userId,
          related_subject: subjectIds[0] || null,
          due_date: dueStr,
          status: 'not_started',
          linked_event_ids: [eventIdStr],
          need_help: false,
        });
        if (insErr) throw insErr;
      }
    }
    return true;
  }, [assigneeIds, eventType, mergeDescriptionWithNote, subjectIds, title]);

  const handleCreate = async (skipConflictValidation = false, allowOverlaps = false) => {
    // Always validate required fields (including when continuing from conflict UI). skipConflictValidation
    // only affects overlap handling later, not whether we run field validation.
    if (!validateFields({ showBanner: true })) {
      return;
    }

    // Store allowOverlaps in a variable that will be used in the RPC call
    const shouldAllowOverlaps = allowOverlaps || (skipConflictValidation && conflictWarning !== null);

    setSubmitting(true);
    try {
      // Fetch family_id directly from the authenticated user's profile
      // This ensures we use the exact family_id that RLS expects
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        toast.push('User not authenticated', 'error');
        setSubmitting(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', authUser.id)
        .single();

      if (profileError || !profile?.family_id) {
        toast.push('Failed to fetch family information', 'error');
        setSubmitting(false);
        return;
      }

      const userFamilyId = profile.family_id;
      const isMultiDayEventType = false;

      // Parse list_id to extract child_id if it's a child list
      const childIds = assigneeIds.length > 0 ? assigneeIds : null;
      const childId = assigneeIds.length > 0 ? assigneeIds[0] : null; // For backward compatibility

      let data;
      let error;
      let createdRecurrenceRule = null;
      // Used across create + fallback error handlers (including overlap flows).
      const normalizedStartTime = normalizeTimeValue(startTime);
      const normalizedEndTime = normalizeTimeValue(endTime);

      if (placement === 'backlog') {
        // For backlog items, use is_backlog flag instead of far future dates
        // Use today's date as a placeholder - the is_backlog flag is what matters
        const today = new Date();
        today.setHours(9, 0, 0, 0);
        const todayEnd = new Date(today);
        todayEnd.setMinutes(todayEnd.getMinutes() + 30);
        
        // Use RPC function to bypass RLS issues
        const { data: rpcData, error: rpcError } = await supabase.rpc('create_task_event', {
          _family_id: userFamilyId,
          _child_id: childId,
          _child_ids: childIds,
          _title: title.trim(),
          _start_ts: today.toISOString(),
          _description: notes.trim() || null,
          _end_ts: todayEnd.toISOString(),
          _status: 'scheduled',
          _source: 'manual',
          _tags: null,
          _is_flexible: true,
          _is_backlog: true,
          _event_type: normalizeEventTypeForPersistence(eventType),
          _subject_id: subjectIds[0] || null,
          _unit: unit.trim() || null,
          _grade: grade.trim() || null,
          _percent_of_total_grade: percentOfTotalGrade.trim() ? (() => {
            const parsed = parseFloat(percentOfTotalGrade.trim());
            return !isNaN(parsed) && isFinite(parsed) ? parsed : null;
          })() : null,
          _location: location.trim() || null,
          _mode: mode || null,
          _instructor: instructor.trim() || null,
          _goal_link: goalLink || null,
          _minutes: null,
        });

        if (rpcError || !rpcData?.ok) {
          error = rpcError || { message: rpcData?.error || 'Failed to create task' };
          data = null;
        } else {
          // Fetch the created event to return full data
          const { data: eventData, error: fetchError } = await supabase
            .from('events')
            .select('*')
            .eq('id', rpcData.id)
            .single();
          data = eventData;
          error = fetchError;
        }
      } else {
        // Calculate start_ts and end_ts from due date and selected time
        const baseDate = new Date(dueDate);
        baseDate.setHours(0, 0, 0, 0);
        const eventEndDateToUse = dueDate;
        if (!allDay && !normalizedStartTime && normalizedEndTime) {
          setValidationErrors((prev) => ({
            ...prev,
            time: 'Enter a start time before adding an end time.',
          }));
          setSubmitting(false);
          return;
        }
        const hasExplicitStartTime = Boolean(normalizedStartTime);
        const isFlexibleForSave = allDay || !hasExplicitStartTime;

        let startDate;
        let endDate;

        if (allDay) {
          startDate = new Date(baseDate);
          endDate = new Date(baseDate);
          endDate.setHours(23, 59, 0, 0);
        } else {
          if (!hasExplicitStartTime) {
            // Keep start/end optional by defaulting blank-time events to all-day bounds.
            startDate = new Date(baseDate);
            endDate = new Date(baseDate);
            endDate.setHours(23, 59, 0, 0);
          } else {
            const resolvedStart = applyTimeToDate(baseDate, normalizedStartTime);
            if (!resolvedStart) {
              setValidationErrors((prev) => ({
                ...prev,
                time: 'Enter a valid start time (e.g., 9:00 AM) or leave it blank.',
              }));
              setSubmitting(false);
              return;
            }
            startDate = resolvedStart;

            if (normalizedEndTime) {
              let resolvedEnd = applyTimeToDate(baseDate, normalizedEndTime);
              if (!resolvedEnd) {
                setValidationErrors((prev) => ({
                  ...prev,
                  time: 'Enter a valid end time (e.g., 10:00 AM) or leave it blank.',
                }));
                setSubmitting(false);
                return;
              }
              if (resolvedEnd <= startDate) {
                resolvedEnd = new Date(startDate.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
              }
              endDate = resolvedEnd;
            } else {
              endDate = new Date(startDate.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
            }
          }
        }

        // Calculate minutes from duration
        const minutes = calculateMinutes(startDate, endDate);

        // Build recurrence rule if recurring
        let recurrenceRule = null;
        if (isRecurring && placement === 'calendar') {
          const parsedInterval = recurrenceInterval != null
            ? Number(recurrenceInterval)
            : (recurrenceIntervalText ? parseInt(recurrenceIntervalText, 10) : NaN);
          const safeInterval = Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : 1;
          const rule = {
            frequency: recurrenceType.toUpperCase(), // DAILY, WEEKLY, MONTHLY
            interval: safeInterval,
            respect_saved_days_off: !!respectSavedDaysOff,
          };
          if (respectSavedDaysOff && plannerDaysOffSet.size > 0) {
            rule.excluded_dates = Array.from(plannerDaysOffSet.values()).sort();
          }
          if (recurrenceType === 'weekly') {
            const fallbackWeekday = dueDate instanceof Date ? dueDate.getDay() : new Date().getDay();
            const days = Array.isArray(recurrenceWeekdays) && recurrenceWeekdays.length > 0
              ? recurrenceWeekdays
              : [fallbackWeekday];
            rule.byweekday = days
              .map((d) => WEEKDAY_OPTIONS.find((opt) => opt.value === Number(d))?.rrule)
              .filter(Boolean);
          }
          if (recurrenceEndType === 'after') {
            // Parse from text if state is null (user might not have blurred the field)
            const countValue = recurrenceEndAfter || (recurrenceEndAfterText ? parseInt(recurrenceEndAfterText, 10) : null);
            if (countValue && !isNaN(countValue) && countValue > 0) {
              rule.count = countValue;
            }
          } else if (recurrenceEndType === 'on' && recurrenceEndDate) {
            rule.until = recurrenceEndDate.toISOString().split('T')[0]; // YYYY-MM-DD
          } else if (recurrenceEndType === 'term_end' && recurrenceSavedYearEnd) {
            rule.until = recurrenceSavedYearEnd.toISOString().split('T')[0];
          }
          // If 'never', no end condition
          
          recurrenceRule = rule;
          createdRecurrenceRule = recurrenceRule;
        }

        // For multi-day events, create an event for each day in the range
        // NOTE: This logic creates multiple events (one per day). For Project events, we want a single event with a date range.
        // So we skip this and go to the single event creation below.
        const isMultiDayEventTypeForExpansion = false; // Disable multi-day expansion - use single event with date range instead
        if (isMultiDayEventTypeForExpansion && eventEndDateToUse && eventEndDateToUse > dueDate) {
          const createdEvents = [];
          const currentDay = new Date(dueDate);
          currentDay.setHours(0, 0, 0, 0);
          const finalDay = new Date(eventEndDateToUse);
          finalDay.setHours(23, 59, 59, 999);

          while (currentDay <= finalDay) {
            const dayStart = new Date(currentDay);
            if (allDay) {
              dayStart.setHours(0, 0, 0, 0);
            } else {
              const resolvedStart = applyTimeToDate(dayStart, normalizedStartTime);
              if (resolvedStart) {
                dayStart.setTime(resolvedStart.getTime());
              }
            }

            const dayEnd = new Date(currentDay);
            if (allDay) {
              dayEnd.setHours(23, 59, 0, 0);
            } else {
              if (normalizedEndTime) {
                const resolvedEnd = applyTimeToDate(dayEnd, normalizedEndTime);
                if (resolvedEnd) {
                  dayEnd.setTime(resolvedEnd.getTime());
                } else {
                  dayEnd.setTime(dayStart.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
                }
              } else {
                dayEnd.setTime(dayStart.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
              }
            }

            const dayMinutes = calculateMinutes(dayStart, dayEnd);

            // Use RPC function to bypass RLS issues
            const rpcParams = {
              _family_id: userFamilyId,
              _child_id: childId,
              _child_ids: childIds,
              _title: title.trim(),
              _start_ts: dayStart.toISOString(),
              _description: notes.trim() || null,
              _end_ts: dayEnd.toISOString(),
              _status: 'scheduled',
              _source: 'manual',
              _tags: null,
              _is_flexible: isFlexibleForSave,
              _event_type: normalizeEventTypeForPersistence(eventType),
              _subject_id: subjectIds[0] || null,
              _unit: unit.trim() || null,
              _grade: grade.trim() || null,
              _percent_of_total_grade: percentOfTotalGrade.trim() ? (() => {
            const parsed = parseFloat(percentOfTotalGrade.trim());
            return !isNaN(parsed) && isFinite(parsed) ? parsed : null;
          })() : null,
              _location: location.trim() || null,
              _mode: mode || null,
              _instructor: instructor.trim() || null,
              _goal_link: goalLink || null,
              _minutes: dayMinutes,
              _materials_attachment_ids: attachedMaterialIds.length > 0 ? attachedMaterialIds : null,
              _recurrence_rule: recurrenceRule ? JSON.stringify(recurrenceRule) : null,
            };
            
            // Only include _allow_overlaps if we need to allow overlaps (backward compatibility)
            if (shouldAllowOverlaps && createTaskEventAllowOverlapsSupported) {
              rpcParams._allow_overlaps = true;
            }
            
            let { data: rpcData, error: rpcError } = await supabase.rpc('create_task_event', rpcParams);

            // If function not found error and we're trying to allow overlaps, retry without the parameter
            // This handles the case where the migration hasn't been run yet
            if (rpcError && rpcError.message && rpcError.message.includes('Could not find the function') && shouldAllowOverlaps) {
              createTaskEventAllowOverlapsSupported = false;
              console.warn('[TaskCreateModal] Function does not support _allow_overlaps yet, retrying without it');
              delete rpcParams._allow_overlaps;
              const retryResult = await supabase.rpc('create_task_event', rpcParams);
              rpcData = retryResult.data;
              rpcError = retryResult.error;
              // If it still fails with overlap error, show a message that migration is needed
              if (rpcError && rpcError.message && rpcError.message.includes('overlap')) {
                error = { message: 'Event overlaps with existing event. Please run the database migration to enable "Save anyway" functionality, or use "Adjust automatically" instead.' };
                data = null;
                break;
              }
            }

            if (rpcError || !rpcData?.ok) {
              error = rpcError || { message: rpcData?.error || 'Failed to create task' };
              data = null;
              
              // Check if this is an overlap error and handle it with conflict warning
              const errorMessage = error?.message || rpcData?.error || '';
              if (errorMessage.includes('overlap') || errorMessage.includes('Event overlaps')) {
                // Calculate start and end dates for conflict detection
                const baseDate = new Date(dayStart);
                baseDate.setHours(0, 0, 0, 0);
                let resolvedStart = applyTimeToDate(baseDate, startTime) || dayStart;
                let resolvedEnd = dayEnd;
                
              const handled = await handleOverlapError(errorMessage, resolvedStart, resolvedEnd, assigneeIds, eventType);
              if (handled) {
                // Conflict warning is now shown, don't show toast
                setSubmitting(false);
                return;
              }
            }
            
            break;
            } else {
              // Fetch the created event to return full data
              const { data: eventData, error: fetchError } = await supabase
                .from('events')
                .select('*')
                .eq('id', rpcData.id)
                .single();
              
              if (fetchError) {
                error = fetchError;
                data = null;
                break;
              } else {
                createdEvents.push(eventData);
              }
            }

            // Move to next day
            currentDay.setDate(currentDay.getDate() + 1);
          }

          // Return the first created event as the main data
          if (createdEvents.length > 0) {
            data = createdEvents[0];
            error = null;
          }
        } else {
          // Single day event (original logic)
          const buildRpcParams = (eventStart, eventEnd, ruleOverride = recurrenceRule) => ({
            _family_id: userFamilyId,
            _child_id: childId,
            _child_ids: childIds,
            _title: title.trim(),
            _start_ts: eventStart.toISOString(),
            _description: notes.trim() || null,
            _end_ts: eventEnd?.toISOString(),
            _status: 'scheduled',
            _source: 'manual',
            _tags: null,
            _is_flexible: isFlexibleForSave,
            _event_type: normalizeEventTypeForPersistence(eventType),
            _subject_id: subjectIds[0] || null,
            _unit: unit.trim() || null,
            _grade: grade.trim() || null,
            _percent_of_total_grade: percentOfTotalGrade.trim() ? (() => {
            const parsed = parseFloat(percentOfTotalGrade.trim());
            return !isNaN(parsed) && isFinite(parsed) ? parsed : null;
          })() : null,
            _location: location.trim() || null,
            _mode: mode || null,
            _instructor: instructor.trim() || null,
            _goal_link: goalLink || null,
            _minutes: minutes,
            _materials_attachment_ids: attachedMaterialIds.length > 0 ? attachedMaterialIds : null,
            _recurrence_rule: ruleOverride ? JSON.stringify(ruleOverride) : null,
          });

          const invokeCreateTaskEvent = async (rawParams) => {
            const rpcParams = { ...rawParams };
            // Only include _allow_overlaps if we need to allow overlaps (backward compatibility)
            if (shouldAllowOverlaps && createTaskEventAllowOverlapsSupported) {
              rpcParams._allow_overlaps = true;
            }
            let { data: rpcData, error: rpcError } = await supabase.rpc('create_task_event', rpcParams);

            // If function not found error and we're trying to allow overlaps, retry without the parameter
            // This handles the case where the migration hasn't been run yet
            if (rpcError && rpcError.message && rpcError.message.includes('Could not find the function') && shouldAllowOverlaps) {
              createTaskEventAllowOverlapsSupported = false;
              console.warn('[TaskCreateModal] Function does not support _allow_overlaps yet, retrying without it');
              delete rpcParams._allow_overlaps;
              const retryResult = await supabase.rpc('create_task_event', rpcParams);
              rpcData = retryResult.data;
              rpcError = retryResult.error;
            }

            return { rpcData, rpcError };
          };

          let rpcData;
          let rpcError;

          const selectedWeekdays = recurrenceType === 'weekly'
            ? Array.from(
              new Set(
                (Array.isArray(recurrenceWeekdays) ? recurrenceWeekdays : [])
                  .map((d) => Number(d))
                  .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
              )
            )
            : [];
          const shouldSplitWeeklySeries = !!(
            recurrenceRule
            && recurrenceType === 'weekly'
            && selectedWeekdays.length > 1
          );

          if (shouldSplitWeeklySeries) {
            console.log('[TaskCreateModal] Weekly recurrence has multiple weekdays; creating one recurring series per selected weekday.');
            const durationMs = Math.max((endDate?.getTime?.() || 0) - startDate.getTime(), DEFAULT_DURATION_MINUTES * 60 * 1000);
            const createdSeriesIds = [];
            const normalizedIntervalWeeks = Number.isFinite(Number(recurrenceRule?.interval))
              ? Math.max(1, Number(recurrenceRule.interval))
              : 1;
            const totalCount = Number.isFinite(Number(recurrenceRule?.count))
              ? Math.max(0, Number(recurrenceRule.count))
              : null;
            const countsByWeekday = (() => {
              if (!totalCount || totalCount <= 0) return null;
              const weekdaysSorted = [...selectedWeekdays].sort((a, b) => a - b);
              const nextByWeekday = new Map();
              const result = new Map();
              weekdaysSorted.forEach((weekday) => {
                const firstDate = new Date(startDate);
                const daysUntilWeekday = (weekday - startDate.getDay() + 7) % 7;
                firstDate.setDate(firstDate.getDate() + daysUntilWeekday);
                nextByWeekday.set(weekday, firstDate);
                result.set(weekday, 0);
              });
              let emitted = 0;
              while (emitted < totalCount) {
                let chosenWeekday = null;
                let chosenDate = null;
                weekdaysSorted.forEach((weekday) => {
                  const candidate = nextByWeekday.get(weekday);
                  if (!candidate) return;
                  if (
                    !chosenDate
                    || candidate.getTime() < chosenDate.getTime()
                    || (
                      candidate.getTime() === chosenDate.getTime()
                      && chosenWeekday != null
                      && weekday < chosenWeekday
                    )
                  ) {
                    chosenWeekday = weekday;
                    chosenDate = candidate;
                  }
                });
                if (chosenWeekday == null || !chosenDate) break;
                result.set(chosenWeekday, (result.get(chosenWeekday) || 0) + 1);
                emitted += 1;
                const nextDate = new Date(chosenDate);
                nextDate.setDate(nextDate.getDate() + (7 * normalizedIntervalWeeks));
                nextByWeekday.set(chosenWeekday, nextDate);
              }
              return result;
            })();
            const recurrenceUntilDate = recurrenceRule?.until
              ? new Date(`${String(recurrenceRule.until).slice(0, 10)}T23:59:59`)
              : null;

            for (const weekday of selectedWeekdays) {
              const daysUntilWeekday = (weekday - startDate.getDay() + 7) % 7;
              const seriesStart = new Date(startDate);
              seriesStart.setDate(seriesStart.getDate() + daysUntilWeekday);
              if (
                recurrenceUntilDate instanceof Date
                && !Number.isNaN(recurrenceUntilDate.getTime())
                && seriesStart.getTime() > recurrenceUntilDate.getTime()
              ) {
                continue;
              }
              const seriesEnd = new Date(seriesStart.getTime() + durationMs);
              const weekdayRrule = WEEKDAY_OPTIONS.find((opt) => opt.value === weekday)?.rrule || null;
              const seriesCount = countsByWeekday ? (countsByWeekday.get(weekday) || 0) : null;
              if (countsByWeekday && seriesCount <= 0) {
                continue;
              }
              const seriesRule = {
                ...recurrenceRule,
                byweekday: weekdayRrule ? [weekdayRrule] : undefined,
              };
              if (countsByWeekday) {
                seriesRule.count = seriesCount;
              }
              if (!weekdayRrule) {
                delete seriesRule.byweekday;
              }

              const seriesResult = await invokeCreateTaskEvent(buildRpcParams(seriesStart, seriesEnd, seriesRule));
              rpcData = seriesResult.rpcData;
              rpcError = seriesResult.rpcError;
              if (rpcError || !rpcData?.ok) {
                break;
              }
              if (rpcData?.id) {
                createdSeriesIds.push(rpcData.id);
              }
            }

            if (!rpcError && createdSeriesIds.length > 1) {
              const groupedRecurrenceId = String(createdSeriesIds[0]);
              // Keep split-per-weekday generation, but link all weekday series with one recurrence_id
              // so edit/delete-all can treat them as a single logical weekly series.
              for (const seriesIdRaw of createdSeriesIds) {
                const seriesId = String(seriesIdRaw || '').trim();
                if (!seriesId) continue;
                const { error: linkErr } = await supabase
                  .from('events')
                  .update({ recurrence_id: groupedRecurrenceId })
                  .eq('family_id', userFamilyId)
                  .or(`id.eq.${seriesId},parent_event_id.eq.${seriesId},recurrence_id.eq.${seriesId}`)
                  .is('deleted_at', null);
                if (linkErr) {
                  console.warn('[TaskCreateModal] Failed to link split weekday series recurrence_id:', {
                    groupedRecurrenceId,
                    seriesId,
                    error: linkErr,
                  });
                }
              }
            }

            if (!rpcError && createdSeriesIds.length > 0) {
              // Return the first created series event for downstream patching and callbacks.
              rpcData = { ok: true, id: createdSeriesIds[0] };
            }
          } else {
            const singleResult = await invokeCreateTaskEvent(buildRpcParams(startDate, endDate, recurrenceRule));
            rpcData = singleResult.rpcData;
            rpcError = singleResult.rpcError;
          }

          // If it still fails with overlap error, show a message that migration is needed
          if (rpcError && rpcError.message && rpcError.message.includes('overlap') && shouldAllowOverlaps) {
            error = { message: 'Event overlaps with existing event. Please run the database migration to enable "Save anyway" functionality, or use "Adjust automatically" instead.' };
            data = null;
          }

          if (rpcError || !rpcData?.ok) {
            error = rpcError || { message: rpcData?.error || 'Failed to create task' };
            data = null;
            
            // Check if this is an overlap error and handle it with conflict warning
            const errorMessage = error?.message || rpcData?.error || '';
            if (shouldAllowOverlaps && (errorMessage.includes('overlap') || errorMessage.includes('Event overlaps'))) {
              try {
                data = await createOverlapAllowedEventFallback({
                  title,
                  startDate,
                  endDate,
                  childIds,
                  eventType,
                  minutes,
                  recurrenceRule: recurrenceRule ? recurrenceRule : null,
                  resolvedFamilyId: userFamilyId,
                });
                error = null;
              } catch (fallbackError) {
                error = fallbackError;
                data = null;
              }
            }

            if (!error && data) {
              // created via fallback
            } else if (errorMessage.includes('overlap') || errorMessage.includes('Event overlaps')) {
              // Calculate start and end dates for conflict detection
              const baseDate = new Date(dueDate);
              baseDate.setHours(0, 0, 0, 0);
              let resolvedStart = applyTimeToDate(baseDate, normalizedStartTime) || baseDate;
              
              let resolvedEnd;
              if (isMultiDayEventType && eventEndDate) {
                const endDateYear = eventEndDate.getFullYear();
                const endDateMonth = eventEndDate.getMonth();
                const endDateDay = eventEndDate.getDate();
                resolvedEnd = new Date(endDateYear, endDateMonth, endDateDay, 23, 59, 59, 999);
              } else if (normalizedEndTime) {
                resolvedEnd = applyTimeToDate(baseDate, normalizedEndTime) || new Date(resolvedStart.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
              } else {
                resolvedEnd = new Date(resolvedStart.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
              }
              
              const handled = await handleOverlapError(errorMessage, resolvedStart, resolvedEnd, assigneeIds, eventType);
              if (handled) {
                // Conflict warning is now shown, don't show toast
                setSubmitting(false);
                return;
              }
            }
          } else {
            // Fetch the created event to return full data
            const { data: eventData, error: fetchError } = await supabase
              .from('events')
              .select('*')
              .eq('id', rpcData.id)
              .single();
            data = eventData;
            error = fetchError;
          }
        }
      }

      if (error) {
        // Only show toast if we haven't already handled it as a conflict warning
        const errorMessage = error?.message || '';
        if (!errorMessage.includes('overlap') && !errorMessage.includes('Event overlaps')) {
          toast.push(`Failed to create task: ${errorMessage || 'Unknown error'}`, 'error');
        } else {
          // Try to handle as overlap error one more time
          const baseDate = new Date(dueDate);
          baseDate.setHours(0, 0, 0, 0);
          let resolvedStart = applyTimeToDate(baseDate, normalizedStartTime) || baseDate;
          
          let resolvedEnd;
          if (isMultiDayEventType && eventEndDate) {
            const endDateYear = eventEndDate.getFullYear();
            const endDateMonth = eventEndDate.getMonth();
            const endDateDay = eventEndDate.getDate();
            resolvedEnd = new Date(endDateYear, endDateMonth, endDateDay, 23, 59, 59, 999);
          } else if (normalizedEndTime) {
            resolvedEnd = applyTimeToDate(baseDate, normalizedEndTime) || new Date(resolvedStart.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
          } else {
            resolvedEnd = new Date(resolvedStart.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
          }
          
          const handled = await handleOverlapError(errorMessage, resolvedStart, resolvedEnd, assigneeIds, eventType);
          if (!handled) {
            toast.push(`Failed to create task: ${errorMessage || 'Unknown error'}`, 'error');
          }
        }
        setSubmitting(false);
        return;
      }

      if (data?.id && createdRecurrenceRule && placement === 'calendar' && !allDay && normalizedStartTime) {
        const baseDateForNormalization = new Date(dueDate);
        baseDateForNormalization.setHours(0, 0, 0, 0);
        const desiredStart = applyTimeToDate(baseDateForNormalization, normalizedStartTime);
        const desiredEnd = normalizedEndTime
          ? (applyTimeToDate(baseDateForNormalization, normalizedEndTime) || null)
          : null;
        if (desiredStart) {
          const normalizedDesiredEnd =
            desiredEnd && desiredEnd > desiredStart
              ? desiredEnd
              : new Date(desiredStart.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
          await normalizeRecurringSeriesTimes({
            eventId: data.id,
            desiredStart,
            desiredEnd: normalizedDesiredEnd,
          });
        }
      }

      // Persist fields after create (RPC may omit some columns)
      if (data?.id) {
        const curriculumMetadata = withSubjectIdsInCurriculumMetadata(
          lesson.trim() ? { ...(data?.curriculum_metadata || {}), lesson_label: lesson.trim() } : data?.curriculum_metadata,
          subjectIds
        );
        const updatePayload = {
          requires_submission_home: false,
          subject_id: subjectIds[0] || null,
          curriculum_metadata: curriculumMetadata,
          unit: unit.trim() || null,
          curriculum_unit_title: unit.trim() || null,
          lesson: lesson.trim() || null,
        };
        await supabase
          .from('events')
          .update(updatePayload)
          .eq('id', data.id)
          .then(({ error: updateErr }) => {
            if (updateErr) {
              console.warn('[TaskCreateModal] Failed to patch event after create:', updateErr);
            } else {
              data = {
                ...data,
                ...updatePayload,
              };
            }
          });
        if (typeof window !== 'undefined' && placement === 'calendar') {
          window.dispatchEvent(new CustomEvent('refreshCalendar'));
        }
      }

      // Log event creation action
      if (data?.id && placement !== 'backlog') {
        try {
          const eventDate = data.start_ts ? new Date(data.start_ts).toISOString().split('T')[0] : dueDate?.toISOString().split('T')[0];
          logAddEvent(
            data.id,
            eventDate || new Date().toISOString().split('T')[0],
            assigneeIds.length > 0 ? assigneeIds[0] : null,
            subjectIds[0] || null
          );
        } catch (logError) {
        }
      }

      // Attach standards if any were selected
      if (data?.id && attachedStandards.length > 0) {
        try {
          const { error: attachError } = await apiRequest('/api/standards/attach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lesson_id: data.id,
              standards: attachedStandards.map(s => s.id),
            }),
          });
          
          if (attachError) {
            console.error('[TaskCreateModal] Failed to attach standards:', attachError);
            // Don't fail the whole creation, just log the error
          }
        } catch (attachErr) {
          console.error('[TaskCreateModal] Error attaching standards:', attachErr);
          // Don't fail the whole creation, just log the error
        }
      }

      if (
        data?.id &&
        placement === 'calendar' &&
        Array.isArray(connectedCalendarTargets) &&
        connectedCalendarTargets.includes('google')
      ) {
        const { error: syncError } = await pushEventToGoogleCalendar(data.id);
        if (syncError) {
          toast.push(`Saved, but Google Calendar sync failed: ${syncError.message || 'Unknown error'}`, 'error');
        } else {
          toast.push('Event also added to Google Calendar', 'success');
        }
      }

      let sentToStudentAfterSave = false;
      if (queueSendToStudentAfterSave && data?.id && canSendToStudentForEvent && assigneeIds.length > 0) {
        try {
          sentToStudentAfterSave = await queueSendToStudentsAfterSave({
            createdEvent: data,
            familyIdToUse: userFamilyId,
            userId: authUser.id,
            note: queueSendToStudentNote,
          });
          if (sentToStudentAfterSave && Platform.OS === 'web' && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('childAssignmentsNeedRefresh'));
            window.dispatchEvent(new CustomEvent('parentAssignmentsNeedRefresh'));
          }
        } catch (sendErr) {
          console.error('[TaskCreateModal] queueSendToStudentsAfterSave', sendErr);
          toast.push(sendErr?.message || 'Saved event, but could not send to student.', 'error');
        }
      }

      if (placement === 'backlog') {
        toast.push('Backlog task created', 'success');
      } else if (sentToStudentAfterSave) {
        toast.push('Task created and sent to student', 'success');
      } else {
        toast.push('Task created successfully', 'success');
      }
      trackEvent('manual_event_created', {
        mode: resolvedAttendanceMode,
        event_type: normalizeEventTypeForPersistence(eventType),
      });
      onCreated?.(data);
      
      // Dispatch event for all event creations so home page and other views can refresh
      if (Platform.OS === 'web' && typeof window !== 'undefined' && data?.id) {
        // Determine the month/year of the created event for cache refresh
        let eventDate = null;
        if (data.start_ts) {
          eventDate = new Date(data.start_ts);
        } else if (dueDate) {
          eventDate = new Date(dueDate);
        }
        
        const refreshDetail = {
          eventId: data.id,
          isBacklog: placement === 'backlog',
          event: placement !== 'backlog' ? data : null,
        };
        if (eventDate && !isNaN(eventDate.getTime())) {
          refreshDetail.targetYear = eventDate.getFullYear();
          refreshDetail.targetMonth = eventDate.getMonth();
        }
        window.dispatchEvent(new CustomEvent('eventCreated', { detail: refreshDetail }));
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
        if (subjectIds[0]) {
          window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId: subjectIds[0] } }));
        }
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: refreshDetail }));
        if (createdRecurrenceRule) {
          // Recurring creation can span cached months; force broad cache refresh so future months
          // (e.g. June while creating in May) show immediately without a page reload.
          window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
        }
      }
      
      // If "Adjust automatically" was selected, open Quick Reschedule after closing modal
      if (shouldAutoAdjust && data?.id && conflictWarning) {
      handleDismiss();
        // Open Quick Reschedule modal with the created event
        setTimeout(() => {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('openQuickReschedule', {
              detail: {
                event: data,
                skipToPreview: false, // Start from beginning
              }
            }));
          }
        }, 100);
      } else {
        handleDismiss();
      }
      
      // Reset shouldAutoAdjust flag
      setShouldAutoAdjust(false);
    } catch (error) {
      toast.push(`Failed to create task: ${error.message || 'Unknown error'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={handleDismiss}
    >
      <Animated.View
        style={[
          styles.overlay,
          {
            opacity: fade,
          },
        ]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => {
            if (showSubjectDropdown || showGoalDropdown) {
              setShowSubjectDropdown(false);
              setShowGoalDropdown(false);
            } else {
              handleDismiss();
            }
          }}
        />
        <Animated.View
          style={[
            styles.modal,
            {
              transform: [{ scale }],
            },
          ]}
        >
          <AppModalShell
            mode="add"
            title={title || 'New event'}
            eyebrow="EVENT"
            accent="#9ECFFB"
            accentSoft="#F0F8FF"
            HeroIcon={Calendar}
            onClose={handleDismiss}
            shellStyle={styles.modalShell}
            contentContainerStyle={styles.bodyContent}
            bodyStyle={styles.shellBody}
            disableShellScroll
            footer={(
              <ModalFooter
                mode="add"
                primaryLabel={submitting ? 'Adding…' : 'Add Event'}
                onCancel={handleDismiss}
                onPrimary={handleCreate}
                onBlockedPrimary={() => {
                  validateFields({ showBanner: true });
                }}
                accent="#9ECFFB"
                disabled={submitting}
                visuallyDisabled={!isFormValid()}
                loading={submitting}
              />
            )}
          >
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyScrollContent}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
            {...(Platform.OS === 'web' && {
              style: {
                ...styles.bodyScroll,
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
              },
            })}
          >
          {validationBanner ? (
            <View style={styles.validationBannerContainer}>
              <Text style={styles.validationBannerText}>{validationBanner}</Text>
            </View>
          ) : null}
          <View style={{ marginBottom: 8 }}>
            <Text style={styles.fieldLabel}>
              Name <Text style={{ color: '#ef4444' }}>*</Text>
            </Text>
          </View>
          <View
            style={[
              styles.titleInputRow,
              validationErrors.title && styles.titleInputRowError,
            ]}
          >
            <TextInput
              placeholder="Event name"
              placeholderTextColor={MUTED}
              value={title}
              onChangeText={(text) => {
                setTitle(text);
                if (isClassDayTitleAutofilled && text.trim() !== 'Class Day') {
                  setIsClassDayTitleAutofilled(false);
                }
                if (validationErrors.title) {
                  setValidationErrors({ ...validationErrors, title: null });
                }
              }}
              style={styles.titleInput}
              autoFocus
            />
          </View>
          {validationErrors.title && (
            <Text style={styles.errorText}>{validationErrors.title}</Text>
          )}

          {/* Event Type - at top above Schedule on calendar/backlog */}
          <SafeFieldRow style={[styles.fieldRow, { marginTop: 12, marginBottom: 8 }]}>
            <View style={styles.field}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.fieldLabel}>Event Type <Text style={{ color: '#ef4444' }}>*</Text></Text>
              </View>
              <SafeView style={[
                styles.dropdownContainer,
                validationErrors.eventType && styles.dropdownContainerError,
              ]}>
                <ChipRow style={styles.dropdownRow}>{EVENT_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    onPress={() => {
                      applyEventTypeSelection(type);
                      if (validationErrors.eventType) {
                        setValidationErrors({ ...validationErrors, eventType: null });
                      }
                    }}
                    style={[
                      styles.dropdownOption,
                      eventType === type && styles.dropdownOptionActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        eventType === type && styles.dropdownOptionTextActive,
                      ]}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}</ChipRow>
              </SafeView>
              {validationErrors.eventType && (
                <Text style={styles.errorTextSmall}>{validationErrors.eventType}</Text>
              )}
            </View>
          </SafeFieldRow>

          {/* Placement toggle hidden for now */}

          <SafeFieldRow style={[styles.fieldRow, { marginTop: 0, marginBottom: 8 }]}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Students <Text style={{ color: '#ef4444' }}>*</Text></Text>
              <SafeView style={[
                styles.dropdownContainer,
                validationErrors.assignee && styles.dropdownContainerError,
              ]}>
                <ChipRow style={styles.dropdownRow}>
                  {familyMembers.map((m) => {
                    const isSelected = assigneeIds.some((id) => String(id) === String(m.id));
                    return (
                      <TouchableOpacity
                        key={String(m.id)}
                        onPress={() => {
                          if (validationErrors.assignee) {
                            setValidationErrors((prev) => ({ ...prev, assignee: null }));
                          }
                          if (isSelected) {
                            setAssigneeIds(assigneeIds.filter((id) => String(id) !== String(m.id)));
                          } else {
                            setAssigneeIds([...assigneeIds, m.id]);
                          }
                        }}
                        style={[
                          styles.dropdownOption,
                          styles.assigneePill,
                          isSelected && styles.dropdownOptionActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dropdownOptionText,
                            styles.assigneePillText,
                            isSelected && [styles.assigneePillTextActive, styles.dropdownOptionTextActive],
                          ]}
                        >
                          {m.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ChipRow>
              </SafeView>
              {validationErrors.assignee ? (
                <Text style={[styles.errorTextSmall, { marginTop: 2, marginBottom: 4 }]}>
                  {validationErrors.assignee}
                </Text>
              ) : null}
            </View>
          </SafeFieldRow>

          <SafeView>
            {placement === 'calendar' && (
              <View
                style={[
                  styles.scheduleFieldsWrap,
                  validationErrors.time && styles.scheduleFieldsWrapError,
                  (showStartTimeDropdown || showEndTimeDropdown) && styles.scheduleFieldsWrapOverlay,
                ]}
              >
                <View style={[styles.dateTimeInlineRow, Platform.OS === 'web' && styles.dateTimeInlineRowWeb]}>
                  <View style={[styles.timeField, styles.dateFieldInline]}>
                    <Text style={styles.timeLabel}>Date <Text style={{ color: '#ef4444' }}>*</Text></Text>
                    <View style={[styles.chip, validationErrors.date && styles.chipError, { alignSelf: 'flex-start', marginRight: 0, backgroundColor: '#ffffff' }]}>
                      <TouchableOpacity
                        onPress={() => {
                          setDueDate(addDays(dueDate, -1));
                          if (validationErrors.date) setValidationErrors((prev) => ({ ...prev, date: null }));
                        }}
                      >
                        <ChevronLeft size={16} color={FG} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          if (validationErrors.date) setValidationErrors((prev) => ({ ...prev, date: null }));
                          setCalendarViewMonth(dueDate);
                          setShowCalendarPicker(true);
                        }}
                        style={{ flex: 1, paddingHorizontal: 8 }}
                      >
                        <Text style={styles.chipText}>{fmt(dueDate)}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setDueDate(addDays(dueDate, +1));
                          if (validationErrors.date) setValidationErrors((prev) => ({ ...prev, date: null }));
                        }}
                      >
                        <ChevronRight size={16} color={FG} />
                      </TouchableOpacity>
                    </View>
                    {validationErrors.date ? <Text style={styles.errorTextSmall}>{validationErrors.date}</Text> : null}
                  </View>
                  <View style={[styles.timeInputsRow, Platform.OS === 'web' && styles.timeInputsRowInline]}>
                      <View style={[styles.timeField, styles.timeFieldCompact]}>
                        <Text style={styles.timeLabel}>Start</Text>
                      {Platform.OS === 'web' ? (
                        useTimeDropdownsOnWeb ? (
                          <View style={[styles.selectContainer, styles.timeSelectContainer]}>
                            <TouchableOpacity
                              ref={startTimeButtonRef}
                              style={[
                                styles.select,
                                styles.academicSelect,
                                styles.timeSelectButton,
                                allDay && styles.timeInputDisabled,
                                validationErrors.time && styles.inputError,
                              ]}
                              onPress={() => {
                                if (allDay) return;
                                setShowStartTimeDropdown((prev) => !prev);
                                setShowEndTimeDropdown(false);
                              }}
                              disabled={allDay}
                              {...(Platform.OS === 'web' && { cursor: allDay ? 'not-allowed' : 'pointer' })}
                            >
                              <Text style={[styles.selectText, !startTime && styles.selectPlaceholder]}>
                                {startTime || 'Optional'}
                              </Text>
                              <ChevronDown size={16} color={allDay ? MUTED : SUB} />
                            </TouchableOpacity>
                            {showStartTimeDropdown && (
                              (() => {
                                let ReactDOM;
                                try {
                                  ReactDOM = require('react-dom');
                                } catch (_) {
                                  ReactDOM = null;
                                }
                                const dropdownContent = (
                                  <View
                                    ref={startTimeDropdownRef}
                                    style={[
                                      styles.selectOptions,
                                      styles.timeSelectOptions,
                                      Platform.OS === 'web' && {
                                        position: 'fixed',
                                        top: startTimeDropdownPosition.top,
                                        left: startTimeDropdownPosition.left,
                                        width: startTimeDropdownPosition.width || 148,
                                        maxHeight: startTimeDropdownPosition.maxHeight || 220,
                                        marginTop: 0,
                                        zIndex: 99999,
                                      },
                                    ]}
                                  >
                                    <ScrollView
                                      nestedScrollEnabled
                                      keyboardShouldPersistTaps="handled"
                                      showsVerticalScrollIndicator
                                      style={{ maxHeight: Math.max(140, (startTimeDropdownPosition.maxHeight || 220) - 4) }}
                                    >
                                      <TouchableOpacity
                                        style={[styles.selectOption, !startTime && styles.selectOptionActive]}
                                        onPress={() => {
                                          setStartTime('');
                                          setShowStartTimeDropdown(false);
                                          if (validationErrors.time) {
                                            setValidationErrors({ ...validationErrors, time: null });
                                          }
                                        }}
                                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                      >
                                        <Text style={[styles.selectOptionText, !startTime && styles.selectOptionTextActive]}>
                                          Optional
                                        </Text>
                                      </TouchableOpacity>
                                      {TIME_SELECT_OPTIONS.map((timeOption) => {
                                        const active = startTime === timeOption;
                                        return (
                                          <TouchableOpacity
                                            key={`start-${timeOption}`}
                                            style={[styles.selectOption, active && styles.selectOptionActive]}
                                            onPress={() => {
                                              setStartTime(timeOption);
                                              setShowStartTimeDropdown(false);
                                              if (validationErrors.time) {
                                                setValidationErrors({ ...validationErrors, time: null });
                                              }
                                            }}
                                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                          >
                                            <Text style={[styles.selectOptionText, active && styles.selectOptionTextActive]}>
                                              {timeOption}
                                            </Text>
                                          </TouchableOpacity>
                                        );
                                      })}
                                    </ScrollView>
                                  </View>
                                );
                                if (ReactDOM && typeof document !== 'undefined' && document.body) {
                                  return ReactDOM.createPortal(dropdownContent, document.body);
                                }
                                return dropdownContent;
                              })()
                            )}
                          </View>
                        ) : (
                          <input
                            ref={startTimeInputRef}
                            type="text"
                            placeholder="Optional"
                            value={startTime || ''}
                            onFocus={() => {
                              startTimeJustFocusedRef.current = true;
                              if (!startTime) {
                                setStartTime('__:__ __');
                              }
                              requestAnimationFrame(() => {
                                try {
                                  startTimeInputRef.current?.setSelectionRange(0, 0);
                                } catch (_) {}
                              });
                            }}
                            onBlur={() => {
                              startTimeJustFocusedRef.current = false;
                              setStartTime((prev) => (prev === '__:__ __' ? '' : prev));
                            }}
                            onKeyDown={(e) => handleTimeMaskedWebKeyDown(e, startTime, setStartTime)}
                            onMouseUp={(e) => {
                              if (startTimeJustFocusedRef.current) {
                                startTimeJustFocusedRef.current = false;
                                setMaskedCaret(e.currentTarget, 0);
                                return;
                              }
                              snapTimeCaretToToken(e.currentTarget);
                            }}
                            onChange={(e) => {
                              const rawValue = e.target.value || '';
                              const formatted = formatTimeInput(rawValue, startTime);
                              setStartTime(formatted);
                              if (validationErrors.time) {
                                setValidationErrors({ ...validationErrors, time: null });
                              }
                            }}
                            disabled={allDay}
                            style={{
                              backgroundColor: allDay ? '#F8FAFC' : '#ffffff',
                              borderRadius: 14,
                              paddingTop: 10,
                              paddingBottom: 10,
                              paddingLeft: 12,
                              paddingRight: 12,
                              borderWidth: 1,
                              borderColor: validationErrors.time ? '#ef4444' : BORDER,
                              borderStyle: 'solid',
                              fontSize: 14,
                              color: allDay ? MUTED : FG,
                              width: '100%',
                              maxWidth: 100,
                              height: 'auto',
                              outline: 'none',
                              opacity: allDay ? 0.9 : 1,
                              ...(validationErrors.time && {
                                borderColor: '#ef4444',
                              }),
                            }}
                          />
                        )
                        ) : (
                          <TextInput
                            placeholder="Optional"
                            placeholderTextColor={MUTED}
                            value={startTime}
                            onFocus={() => {
                              if (!startTime) setStartTime('__:__ __');
                            }}
                            onBlur={() => {
                              setStartTime((prev) => (prev === '__:__ __' ? '' : prev));
                            }}
                            onChangeText={(text) => {
                              const formatted = formatTimeInput(text, startTime);
                              setStartTime(formatted);
                              if (validationErrors.time) {
                                setValidationErrors({ ...validationErrors, time: null });
                              }
                            }}
                            style={[
                              styles.timeInput,
                              allDay && styles.timeInputDisabled,
                              validationErrors.time && styles.inputError,
                            ]}
                            editable={!allDay}
                            autoCapitalize="characters"
                          />
                        )}
                        {validationErrors.time && (
                          <Text style={styles.errorTextSmall}>{validationErrors.time}</Text>
                        )}
                      </View>
                      <View style={[styles.timeField, styles.timeFieldCompact]}>
                        <Text style={styles.timeLabel}>End</Text>
                      {Platform.OS === 'web' ? (
                        useTimeDropdownsOnWeb ? (
                          <View style={[styles.selectContainer, styles.timeSelectContainer]}>
                            <TouchableOpacity
                              ref={endTimeButtonRef}
                              style={[
                                styles.select,
                                styles.academicSelect,
                                styles.timeSelectButton,
                                allDay && styles.timeInputDisabled,
                              ]}
                              onPress={() => {
                                if (allDay) return;
                                setShowEndTimeDropdown((prev) => !prev);
                                setShowStartTimeDropdown(false);
                              }}
                              disabled={allDay}
                              {...(Platform.OS === 'web' && { cursor: allDay ? 'not-allowed' : 'pointer' })}
                            >
                              <Text style={[styles.selectText, !endTime && styles.selectPlaceholder]}>
                                {endTime || 'Optional'}
                              </Text>
                              <ChevronDown size={16} color={allDay ? MUTED : SUB} />
                            </TouchableOpacity>
                            {showEndTimeDropdown && (
                              (() => {
                                let ReactDOM;
                                try {
                                  ReactDOM = require('react-dom');
                                } catch (_) {
                                  ReactDOM = null;
                                }
                                const dropdownContent = (
                                  <View
                                    ref={endTimeDropdownRef}
                                    style={[
                                      styles.selectOptions,
                                      styles.timeSelectOptions,
                                      Platform.OS === 'web' && {
                                        position: 'fixed',
                                        top: endTimeDropdownPosition.top,
                                        left: endTimeDropdownPosition.left,
                                        width: endTimeDropdownPosition.width || 148,
                                        maxHeight: endTimeDropdownPosition.maxHeight || 220,
                                        marginTop: 0,
                                        zIndex: 99999,
                                      },
                                    ]}
                                  >
                                    <ScrollView
                                      nestedScrollEnabled
                                      keyboardShouldPersistTaps="handled"
                                      showsVerticalScrollIndicator
                                      style={{ maxHeight: Math.max(140, (endTimeDropdownPosition.maxHeight || 220) - 4) }}
                                    >
                                      <TouchableOpacity
                                        style={[styles.selectOption, !endTime && styles.selectOptionActive]}
                                        onPress={() => {
                                          setEndTime('');
                                          setShowEndTimeDropdown(false);
                                        }}
                                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                      >
                                        <Text style={[styles.selectOptionText, !endTime && styles.selectOptionTextActive]}>
                                          Optional
                                        </Text>
                                      </TouchableOpacity>
                                      {TIME_SELECT_OPTIONS.map((timeOption) => {
                                        const active = endTime === timeOption;
                                        return (
                                          <TouchableOpacity
                                            key={`end-${timeOption}`}
                                            style={[styles.selectOption, active && styles.selectOptionActive]}
                                            onPress={() => {
                                              setEndTime(timeOption);
                                              setShowEndTimeDropdown(false);
                                            }}
                                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                          >
                                            <Text style={[styles.selectOptionText, active && styles.selectOptionTextActive]}>
                                              {timeOption}
                                            </Text>
                                          </TouchableOpacity>
                                        );
                                      })}
                                    </ScrollView>
                                  </View>
                                );
                                if (ReactDOM && typeof document !== 'undefined' && document.body) {
                                  return ReactDOM.createPortal(dropdownContent, document.body);
                                }
                                return dropdownContent;
                              })()
                            )}
                          </View>
                        ) : (
                          <input
                            ref={endTimeInputRef}
                            type="text"
                            placeholder="Optional"
                            value={endTime || ''}
                            onFocus={() => {
                              endTimeJustFocusedRef.current = true;
                              if (!endTime) {
                                setEndTime('__:__ __');
                              }
                              requestAnimationFrame(() => {
                                try {
                                  endTimeInputRef.current?.setSelectionRange(0, 0);
                                } catch (_) {}
                              });
                            }}
                            onBlur={() => {
                              endTimeJustFocusedRef.current = false;
                              setEndTime((prev) => (prev === '__:__ __' ? '' : prev));
                            }}
                            onKeyDown={(e) => handleTimeMaskedWebKeyDown(e, endTime, setEndTime)}
                            onMouseUp={(e) => {
                              if (endTimeJustFocusedRef.current) {
                                endTimeJustFocusedRef.current = false;
                                setMaskedCaret(e.currentTarget, 0);
                                return;
                              }
                              snapTimeCaretToToken(e.currentTarget);
                            }}
                            onChange={(e) => {
                              const rawValue = e.target.value || '';
                              const formatted = formatTimeInput(rawValue, endTime);
                              setEndTime(formatted);
                            }}
                            disabled={allDay}
                            style={{
                              backgroundColor: allDay ? '#F8FAFC' : '#ffffff',
                              borderRadius: 14,
                              paddingTop: 10,
                              paddingBottom: 10,
                              paddingLeft: 12,
                              paddingRight: 12,
                              borderWidth: 1,
                              borderColor: BORDER,
                              borderStyle: 'solid',
                              fontSize: 14,
                              color: allDay ? MUTED : FG,
                              width: '100%',
                              maxWidth: 100,
                              height: 'auto',
                              outline: 'none',
                              opacity: allDay ? 0.9 : 1,
                            }}
                          />
                        )
                        ) : (
                          <TextInput
                            placeholder="Optional"
                            placeholderTextColor={MUTED}
                            value={endTime}
                            onFocus={() => {
                              if (!endTime) setEndTime('__:__ __');
                            }}
                            onBlur={() => {
                              setEndTime((prev) => (prev === '__:__ __' ? '' : prev));
                            }}
                            onChangeText={(text) => {
                              const formatted = formatTimeInput(text, endTime);
                              setEndTime(formatted);
                            }}
                            style={[styles.timeInput, allDay && styles.timeInputDisabled]}
                            editable={!allDay}
                            autoCapitalize="characters"
                          />
                        )}
                      </View>
                      <View style={[styles.inlineSwitchField, styles.inlineSwitchFieldStack]}>
                        <Text style={[styles.timeLabel, styles.inlineSwitchLabel]}>Repeat</Text>
                        <View style={styles.inlineSwitchControlWrap}>
                          <Switch
                            value={isRecurring}
                            onValueChange={(value) => {
                              setIsRecurring(value);
                              setShowRecurringSection(value);
                              if (value) {
                                if (recurrenceType === 'weekly' && (!Array.isArray(recurrenceWeekdays) || recurrenceWeekdays.length === 0)) {
                                  const defaultDay = dueDate instanceof Date ? dueDate.getDay() : new Date().getDay();
                                  setRecurrenceWeekdays([defaultDay]);
                                  setIsRecurrenceWeekdayAutofilled(true);
                                }
                              } else if (validationErrors.recurrenceEnd) {
                                setValidationErrors((prev) => ({ ...prev, recurrenceEnd: null }));
                              }
                            }}
                            trackColor={{ false: BORDER, true: '#AECBFA' }}
                            thumbColor={isRecurring ? '#45A29E' : '#f9fafb'}
                          />
                        </View>
                      </View>
                    </View>
                </View>
                {/* Suggested Change (when inline reschedule is available) */}
                {suggestedChange ? (
                  <View style={{
                    marginTop: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: changeAccepted ? '#F0FDF4' : '#F0FDF4',
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: changeAccepted ? '#86EFAC' : '#BBF7D0',
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <Check size={18} color={changeAccepted ? "#16A34A" : "#16A34A"} style={{ marginTop: 2, flexShrink: 0 }} />
                      <View style={{ flex: 1 }}>
                        {changeAccepted ? (
                          <>
                            <Text style={{ 
                              fontSize: 13, 
                              color: '#166534', 
                              fontWeight: '600', 
                              marginBottom: 4,
                              ...(Platform.OS === 'web' && {
                                fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                              }),
                            }}>
                              Successfully changed to recommended time
                            </Text>
                            <Text style={{ 
                              fontSize: 11, 
                              color: '#15803D', 
                              fontWeight: '400', 
                              opacity: 0.8,
                              ...(Platform.OS === 'web' && {
                                fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                              }),
                            }}>
                              The time has been updated in the form above
                            </Text>
                          </>
                        ) : (
                          <>
                            <Text style={{ 
                              fontSize: 13, 
                              color: '#166534', 
                              fontWeight: '500', 
                              marginBottom: 4,
                              ...(Platform.OS === 'web' && {
                                fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                              }),
                            }}>
                              Suggested adjustment
                            </Text>
                            <Text style={{ 
                              fontSize: 13, 
                              color: '#166534', 
                              fontWeight: '400', 
                              marginBottom: 8,
                              ...(Platform.OS === 'web' && {
                                fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                              }),
                            }}>
                              {suggestedChange.message}
                            </Text>
                            <Text style={{ 
                              fontSize: 11, 
                              color: '#15803D', 
                              fontWeight: '400', 
                              marginBottom: 8,
                              opacity: 0.8,
                              ...(Platform.OS === 'web' && {
                                fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                              }),
                            }}>
                              Keeps other events unchanged
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                              <TouchableOpacity
                                onPress={() => {
                                  // Accept the suggested change - update date and times inline
                                  if (!suggestedChange || !suggestedChange.newStart || !suggestedChange.newEnd) {
                                    console.warn('[TaskCreateModal] Cannot accept change - invalid suggestedChange');
                                    return;
                                  }
                                  
                                  const formatTimeForInput = (date) => {
                                    // Ensure we have a Date object
                                    const dateObj = date instanceof Date ? date : new Date(date);
                                    if (isNaN(dateObj.getTime())) {
                                      console.error('[TaskCreateModal] Invalid date in suggestedChange:', date);
                                      return null;
                                    }
                                    
                                    let hours = dateObj.getHours();
                                    const minutes = dateObj.getMinutes();
                                    const period = hours >= 12 ? 'PM' : 'AM';
                                    if (hours > 12) hours -= 12;
                                    else if (hours === 0) hours = 12;
                                    
                                    // Always include colon and 2-digit minutes to match parseTimeString format
                                    return `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
                                  };
                                  
                                  const nextStartDate = suggestedChange.newStart instanceof Date
                                    ? suggestedChange.newStart
                                    : new Date(suggestedChange.newStart);
                                  const newStartTime = formatTimeForInput(suggestedChange.newStart);
                                  const newEndTime = formatTimeForInput(suggestedChange.newEnd);
                                  
                                  if (isNaN(nextStartDate.getTime()) || !newStartTime || !newEndTime) {
                                    console.error('[TaskCreateModal] Failed to format times from suggestedChange');
                                    return;
                                  }
                                  
                              setDueDate(nextStartDate);
                              setStartTime(newStartTime);
                              setEndTime(newEndTime);
                              
                              // Mark change as accepted to show success message (stays visible)
                              setChangeAccepted(true);
                              
                              // Clear conflict warning after a brief delay to allow conflict detection to re-run
                              // with the new times and confirm there's no conflict
                              setTimeout(() => {
                                setConflictWarning(null);
                              }, 100);
                                }}
                                style={{
                                  flex: 1,
                                  backgroundColor: '#16A34A',
                                  borderWidth: 1,
                                  borderColor: '#15803D',
                                  paddingVertical: 8,
                                  paddingHorizontal: 12,
                                  borderRadius: 6,
                                  alignItems: 'center',
                                }}
                              >
                                <Text style={{ 
                                  color: '#FFFFFF', 
                                  fontSize: 13, 
                                  fontWeight: '600',
                                  ...(Platform.OS === 'web' && {
                                    fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                  }),
                                }}>
                                  Accept change
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => {
                                  // Undo - revert to conflict state
                                  setSuggestedChange(null);
                                  setChangeAccepted(false);
                                }}
                                style={{
                                  flex: 1,
                                  backgroundColor: '#FFFFFF',
                                  borderWidth: 1,
                                  borderColor: '#E5E7EB',
                                  paddingVertical: 8,
                                  paddingHorizontal: 12,
                                  borderRadius: 6,
                                  alignItems: 'center',
                                }}
                              >
                                <Text style={{ 
                                  color: '#374151', 
                                  fontSize: 13, 
                                  fontWeight: '500',
                                  ...(Platform.OS === 'web' && {
                                    fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                  }),
                                }}>
                                  Undo
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                ) : conflictWarning ? (
                  <View
                    style={[
                      cb.banner,
                      {
                        marginHorizontal: 0,
                        marginTop: 12,
                        marginBottom: 0,
                      },
                    ]}
                  >
                    <View style={cb.bannerContentCompact}>
                      <View style={cb.bannerIconWrapSm}>
                        <AlertCircle size={14} color="#5B8FC7" />
                      </View>
                      <View style={cb.bannerTextGrow}>
                        {conflictRichCopy?.kind === 'rich' ? (
                          <>
                            <View style={cb.conflictLine}>
                              <Text style={cb.kicker}>Conflict with </Text>
                              <LearnerPill
                                child={conflictRichCopy.learner}
                                nameFallback={conflictRichCopy.nameFallback || undefined}
                              />
                              <Text style={cb.conflictTitle} numberOfLines={1}>
                                {' '}
                                — {conflictRichCopy.conflictingTitle}
                              </Text>
                              {conflictRichCopy.metaLine ? (
                                <Text style={cb.metaInline} numberOfLines={1}>
                                  {' '}
                                  · {conflictRichCopy.metaLine}
                                </Text>
                              ) : null}
                            </View>
                            {suggestedChange?.message ? (
                              <Text style={[cb.metaInline, { marginTop: 4 }]} numberOfLines={2}>
                                Suggested change: {suggestedChange.message}
                              </Text>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <Text style={cb.bannerMessagePlain} numberOfLines={2}>
                              {conflictRichCopy?.text || 'Conflict with another event at this time'}
                            </Text>
                            {suggestedChange?.message ? (
                              <Text style={[cb.metaInline, { marginTop: 4 }]} numberOfLines={2}>
                                Suggested change: {suggestedChange.message}
                              </Text>
                            ) : null}
                          </>
                        )}
                      </View>
                      <View style={cb.bannerActionsRow}>
                        {!conflictWarning?.isGenericConflict && (
                          <TouchableOpacity
                            {...(Platform.OS === 'web' && { type: 'button' })}
                            onPress={async (e) => {
                              if (Platform.OS === 'web' && e) {
                                e.preventDefault();
                                e.stopPropagation();
                              }
                              
                              
                              try {
                                // Check if we should escalate to Quick Reschedule modal
                                // Only escalate for complex cases: multiple conflicts, multiple children, new event is recurring, or conflicting event is fixed
                                // Note: We DON'T escalate just because the conflicting event is recurring - we can still suggest a simple time change
                                const shouldEscalate = 
                                  (conflictWarning?.conflictCount && conflictWarning.conflictCount > 1) ||
                                  (assigneeIds && assigneeIds.length > 1) ||
                                  isRecurring || // Only escalate if the NEW event being created is recurring
                                  (conflictWarning?.event?.is_fixed === true); // Escalate if conflicting event is fixed (can't be moved)
                                
                                if (shouldEscalate) {
                                  // Open Quick Reschedule modal for complex cases
                                  setShouldAutoAdjust(true);
                                  handleCreate(true, false);
                                  return;
                                }
                                
                                // Simple case - calculate inline suggestion
                            
                                // Try inline reschedule suggestion
                                if (!familyId) {
                                  console.warn('[TaskCreateModal] No familyId available for suggestion');
                                  return;
                                }
                                
                                try {
                                const baseDate = new Date(dueDate);
                                baseDate.setHours(0, 0, 0, 0);
                                const normalizedStart = normalizeTimeValue(startTime);
                                const normalizedEnd = normalizeTimeValue(endTime);
                                const resolvedStart = applyTimeToDate(baseDate, normalizedStart);
                                const resolvedEnd = resolvedStart
                                  ? (normalizedEnd
                                      ? applyTimeToDate(baseDate, normalizedEnd)
                                      : new Date(resolvedStart.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000))
                                  : null;
                                
                                if (!resolvedStart || !resolvedEnd) {
                                  console.warn('[TaskCreateModal] Could not resolve start/end times for suggestion');
                                  return;
                                }
                                
                                // Fetch existing events for the day
                                const dateKey = dueDate.toISOString().split('T')[0];
                                const startOfDay = new Date(dateKey + 'T00:00:00');
                                const endOfDay = new Date(dateKey + 'T23:59:59');
                                
                                const { data: existingEvents, error: fetchError } = await supabase
                                  .from('events')
                                  .select('*')
                                  .eq('family_id', familyId)
                                  .in('child_id', assigneeIds)
                                  .gte('start_ts', startOfDay.toISOString())
                                  .lte('start_ts', endOfDay.toISOString())
                                  .neq('status', 'canceled')
                                  .is('canceled_at', null)
                                  .is('deleted_at', null);
                                
                                if (fetchError) {
                                  console.error('[TaskCreateModal] Error fetching events for suggestion:', fetchError);
                                  // Fallback to Quick Reschedule
                                  setShouldAutoAdjust(true);
                                  handleCreate(true, false);
                                  return;
                                }
                                
                                const slot = await findNextAvailableSlot(
                                  conflictWarning.event,
                                  resolvedStart,
                                  resolvedEnd,
                                  existingEvents,
                                  assigneeIds
                                );
                                
                                if (slot) {
                                  // Format the suggestion message
                                  const formatTime = (date) => {
                                    let hours = date.getHours();
                                    const minutes = date.getMinutes();
                                    const period = hours >= 12 ? 'PM' : 'AM';
                                    if (hours > 12) hours -= 12;
                                    else if (hours === 0) hours = 12;
                                    return minutes === 0 
                                      ? `${hours} ${period}` 
                                      : `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
                                  };
                                  
                                  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                                  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                  const slotDate = new Date(slot.newStart);
                                  const dayName = dayNames[slotDate.getDay()];
                                  const monthName = monthNames[slotDate.getMonth()];
                                  const day = slotDate.getDate();
                                  
                                  const startTimeStr = formatTime(slot.newStart);
                                  const endTimeStr = formatTime(slot.newEnd);
                                  const startTimeOnly = startTimeStr.replace(/\s*(AM|PM)$/i, '');
                                  const endTimeOnly = endTimeStr.replace(/\s*(AM|PM)$/i, '');
                                  const period = startTimeStr.includes('PM') ? 'PM' : 'AM';
                                  const timeRange = `${startTimeOnly}–${endTimeOnly} ${period}`;
                                  
                                  const suggestionMessage = `Move this event to ${dayName} ${monthName} ${day}, ${timeRange}`;
                                  
                                  setSuggestedChange({
                                    newStart: slot.newStart,
                                    newEnd: slot.newEnd,
                                    message: suggestionMessage,
                                  });
                                  
                                  // Don't call handleCreate - just show the suggestion
                                  return;
                                } else {
                                  // No slot found - escalate to Quick Reschedule
                                  setShouldAutoAdjust(true);
                                  handleCreate(true, false);
                                  return;
                                }
                                } catch (err) {
                                  console.error('[TaskCreateModal] Error calculating suggestion:', err);
                                  // Fallback to Quick Reschedule
                                  setShouldAutoAdjust(true);
                                  handleCreate(true, false);
                                }
                              } catch (err) {
                                console.error('[TaskCreateModal] Unhandled error in handler:', err);
                                // Fallback to Quick Reschedule
                                setShouldAutoAdjust(true);
                                handleCreate(true, false);
                              }
                            }}
                            style={cb.primaryButton}
                          >
                            <Text style={cb.primaryButtonText}>Adjust automatically</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            {...(Platform.OS === 'web' && { type: 'button' })}
                            onPress={() => {
                              setShouldAutoAdjust(false);
                              handleCreate(true, true); // Skip overlap re-check; required fields still validated in handleCreate
                            }}
                            style={cb.ghostButton}
                          >
                            <Text style={cb.ghostButtonText}>Save anyway</Text>
                          </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ) : null}
                {isRecurring && showRecurringSection && (
                  <View style={styles.recurringSectionContent}>
                    <View style={styles.repeatGrid}>
                      <View style={[styles.repeatGroup, styles.repeatGroupPattern]}>
                        <Text style={styles.recurrenceGroupLabel}>Repeat pattern</Text>
                        <ChipRow style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' }}>
                          {['daily', 'weekly', 'monthly'].map((type) => (
                            <TouchableOpacity
                              key={type}
                              onPress={() => {
                                setRecurrenceType(type);
                                if (type === 'weekly' && (!Array.isArray(recurrenceWeekdays) || recurrenceWeekdays.length === 0)) {
                                  const defaultDay = dueDate instanceof Date ? dueDate.getDay() : new Date().getDay();
                                  setRecurrenceWeekdays([defaultDay]);
                                  setIsRecurrenceWeekdayAutofilled(true);
                                }
                                if (validationErrors.recurrenceWeekdays) {
                                  setValidationErrors((prev) => ({ ...prev, recurrenceWeekdays: null }));
                                }
                              }}
                              style={[
                                styles.dropdownOption,
                                recurrenceType === type && styles.dropdownOptionActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.dropdownOptionText,
                                  recurrenceType === type && styles.dropdownOptionTextActive,
                                ]}
                              >
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ChipRow>
                      </View>
                      <View style={[styles.repeatGroup, styles.repeatGroupDays]}>
                        <Text style={styles.recurrenceGroupLabel}>Repeats on</Text>
                        {recurrenceType === 'weekly' ? (
                          <>
                            <ChipRow style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' }}>
                              {WEEKDAY_OPTIONS.map((day) => {
                                const isSelected = Array.isArray(recurrenceWeekdays) && recurrenceWeekdays.includes(day.value);
                                return (
                                  <TouchableOpacity
                                    key={day.value}
                                    onPress={() => {
                                      setRecurrenceWeekdays((prev) => {
                                        const prevSafe = Array.isArray(prev) ? prev : [];
                                        if (prevSafe.includes(day.value)) {
                                          return prevSafe.filter((value) => value !== day.value);
                                        }
                                        return [...prevSafe, day.value];
                                      });
                                      setIsRecurrenceWeekdayAutofilled(false);
                                      if (validationErrors.recurrenceWeekdays) {
                                        setValidationErrors((prev) => ({ ...prev, recurrenceWeekdays: null }));
                                      }
                                    }}
                                    style={[
                                      styles.dropdownOption,
                                      isSelected && styles.dropdownOptionActive,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.dropdownOptionText,
                                        isSelected && styles.dropdownOptionTextActive,
                                      ]}
                                    >
                                      {day.label}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </ChipRow>
                            {validationErrors.recurrenceWeekdays ? (
                              <Text style={[styles.errorTextSmall, { marginTop: 8 }]}>{validationErrors.recurrenceWeekdays}</Text>
                            ) : null}
                          </>
                        ) : (
                          <View style={styles.repeatDisabledHintWrap}>
                            <Text style={styles.fieldHelpText}>Used for weekly repeats.</Text>
                          </View>
                        )}
                      </View>
                      <View style={[styles.repeatGroup, styles.repeatGroupEnds]}>
                        <Text style={styles.recurrenceGroupLabel}>Ends</Text>
                        <ChipRow style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' }}>
                          {['never', 'after', 'on', 'term_end'].map((endType) => (
                            <TouchableOpacity
                              key={endType}
                              onPress={() => {
                                setRecurrenceEndType(endType);
                                if (validationErrors.recurrenceEnd) {
                                  setValidationErrors((prev) => ({ ...prev, recurrenceEnd: null }));
                                }
                              }}
                              style={[
                                styles.dropdownOption,
                                recurrenceEndType === endType && styles.dropdownOptionActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.dropdownOptionText,
                                  recurrenceEndType === endType && styles.dropdownOptionTextActive,
                                ]}
                              >
                                {endType === 'never'
                                  ? 'Never'
                                  : endType === 'after'
                                    ? 'After'
                                    : endType === 'on'
                                      ? 'On date'
                                      : 'Term end'}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ChipRow>
                      </View>
                      {recurrenceEndType !== 'never' ? (
                        <View style={[styles.repeatGroup, styles.repeatGroupEndInput]}>
                          <Text style={styles.recurrenceGroupLabel}>
                            {recurrenceEndType === 'after' ? 'Occurrences' : 'End date'}
                          </Text>
                          {recurrenceEndType === 'after' ? (
                            <TextInput
                              style={{
                                borderWidth: validationErrors.recurrenceEnd && recurrenceEndType === 'after' ? 1.5 : 1,
                                borderColor:
                                  validationErrors.recurrenceEnd && recurrenceEndType === 'after' ? '#ef4444' : CHIP_BORDER,
                                borderRadius: 999,
                                width: 116,
                                marginBottom: 0,
                                paddingVertical: 0,
                                paddingHorizontal: 14,
                                height: 36,
                                color: FG,
                                backgroundColor: '#FFFFFF',
                                fontSize: 12,
                              }}
                              value={recurrenceEndAfterText}
                              onChangeText={(text) => {
                                if (validationErrors.recurrenceEnd) {
                                  setValidationErrors((prev) => ({ ...prev, recurrenceEnd: null }));
                                }
                                if (text === '' || /^\d+$/.test(text)) {
                                  setRecurrenceEndAfterText(text);
                                  const num = parseInt(text, 10);
                                  if (!isNaN(num) && num > 0) {
                                    setRecurrenceEndAfter(num);
                                  }
                                }
                              }}
                              onBlur={() => {
                                const num = parseInt(recurrenceEndAfterText, 10);
                                if (isNaN(num) || num <= 0) {
                                  setRecurrenceEndAfterText('');
                                  setRecurrenceEndAfter(null);
                                } else {
                                  setRecurrenceEndAfterText(num.toString());
                                  setRecurrenceEndAfter(num);
                                }
                              }}
                              keyboardType="numeric"
                              placeholder="e.g. 10"
                              placeholderTextColor={MUTED}
                            />
                          ) : recurrenceEndType === 'term_end' ? (
                            <View
                              style={{
                                borderWidth: validationErrors.recurrenceEnd && recurrenceEndType === 'term_end' ? 1.5 : 1,
                                borderColor:
                                  validationErrors.recurrenceEnd && recurrenceEndType === 'term_end' ? '#ef4444' : CHIP_BORDER,
                                borderRadius: 999,
                                marginBottom: 0,
                                paddingVertical: 0,
                                paddingHorizontal: 14,
                                height: 36,
                                justifyContent: 'center',
                                backgroundColor: '#FFFFFF',
                                width: '100%',
                                maxWidth: 220,
                              }}
                            >
                              <Text style={{ color: recurrenceSavedYearEnd ? FG : MUTED, fontSize: 12 }}>
                                {recurrenceSavedYearEnd ? fmt(recurrenceSavedYearEnd) : 'No year end saved'}
                              </Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={{
                                borderWidth: validationErrors.recurrenceEnd && recurrenceEndType === 'on' ? 1.5 : 1,
                                borderColor:
                                  validationErrors.recurrenceEnd && recurrenceEndType === 'on' ? '#ef4444' : CHIP_BORDER,
                                borderRadius: 999,
                                marginBottom: 0,
                                paddingVertical: 0,
                                paddingHorizontal: 14,
                                height: 36,
                                justifyContent: 'center',
                                backgroundColor: '#FFFFFF',
                                width: '100%',
                                maxWidth: 220,
                              }}
                              onPress={() => {
                                if (validationErrors.recurrenceEnd) {
                                  setValidationErrors((prev) => ({ ...prev, recurrenceEnd: null }));
                                }
                                if (recurrenceEndDate) {
                                  setEndDateCalendarViewMonth(new Date(recurrenceEndDate));
                                } else {
                                  const endDate = new Date(dueDate);
                                  endDate.setDate(endDate.getDate() + 30);
                                  setEndDateCalendarViewMonth(endDate);
                                }
                                setShowEndDateCalendarPicker(true);
                              }}
                            >
                              <Text style={{ color: recurrenceEndDate ? FG : MUTED, fontSize: 12 }}>
                                {recurrenceEndDate ? fmt(recurrenceEndDate) : 'Select end date'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      ) : null}
                    </View>
                    {validationErrors.recurrenceEnd ? (
                      <Text style={[styles.errorTextSmall, { marginTop: 8 }]}>{validationErrors.recurrenceEnd}</Text>
                    ) : null}
                  </View>
                )}
              </View>
            )}
          </SafeView>

            {/* Academic Details Section - after Schedule time */}
            <ModalSectionCard
              Icon={GraduationCap}
              title={academicSectionTitle}
              subtitle="Scheduling and grading context"
              expanded={showAcademicDetails}
              onPress={() => setShowAcademicDetails(!showAcademicDetails)}
              accent="#9ECFFB"
            >
                <SafeView>
              <SafeFieldRow style={[styles.fieldRow, styles.learningRow]}>
                <View style={[styles.field, styles.academicFieldSubject]}>
                  <Text style={[styles.fieldLabel, styles.learningRowLabel]}>Subjects</Text>
                  <View style={[styles.selectContainer, styles.academicSelectContainer]}>
                    <TouchableOpacity
                      ref={subjectButtonRef}
                      style={[styles.select, styles.academicSelect, assigneeIds.length === 0 && { opacity: 0.6 }]}
                      onPress={() => {
                        if (assigneeIds.length > 0) {
                          setShowSubjectDropdown(!showSubjectDropdown);
                        }
                      }}
                      disabled={assigneeIds.length === 0}
                    >
                      <Text style={[styles.selectText, (subjectIds.length === 0 || assigneeIds.length === 0) && styles.selectPlaceholder]}>
                        {assigneeIds.length === 0 
                          ? 'Select Assignee first' 
                          : subjectIds.length > 0
                            ? subjects
                                .filter((s) => subjectIds.includes(s.id))
                                .map((s) => s.name)
                                .filter(Boolean)
                                .join(', ') || 'Select...'
                            : 'Select subject'}
                      </Text>
                      <ChevronDown size={16} color={assigneeIds.length === 0 ? MUTED : SUB} />
                    </TouchableOpacity>
                    {showSubjectDropdown && Platform.OS === 'web' && (() => {
                      // Use portal to render outside modal to avoid positioning issues
                      let ReactDOM;
                      try {
                        ReactDOM = require('react-dom');
                      } catch (e) {
                        // ReactDOM not available, fall back to normal rendering
                      }
                      
                      const dropdownContent = (
                        <View
                          ref={subjectDropdownRef}
                          style={{
                            position: 'fixed',
                            top: subjectDropdownPosition.top,
                            left: subjectDropdownPosition.left,
                            width: subjectDropdownPosition.width || 200,
                            backgroundColor: '#fff',
                            borderWidth: 1,
                            borderColor: BORDER,
                            borderRadius: 10,
                        marginTop: 0,
                        maxHeight: subjectDropdownPosition.maxHeight || 220,
                            zIndex: 99999,
                            ...Platform.select({
                              web: {
                                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column',
                              },
                              default: {
                                shadowColor: '#000',
                                shadowOpacity: 0.1,
                                shadowRadius: 8,
                                shadowOffset: { width: 0, height: 4 },
                              },
                            }),
                            elevation: 10000,
                          }}
                        >
                          <ScrollView 
                            style={{ 
                              maxHeight: Math.max(140, (subjectDropdownPosition.maxHeight || 220) - 4),
                              ...(Platform.OS === 'web' && {
                                overflowY: 'auto',
                                overflowX: 'hidden',
                                WebkitOverflowScrolling: 'touch',
                              }),
                            }} 
                            nestedScrollEnabled
                            showsVerticalScrollIndicator={Platform.OS !== 'web'}
                          >
                            {assigneeIds.length === 0 ? (
                              <View style={{ padding: 12 }}>
                                <Text style={{ fontSize: 13, color: MUTED }}>Select Assignee first</Text>
                              </View>
                            ) : subjects.length > 0 ? (
                              <>
                                <TouchableOpacity
                                  onPress={() => {
                                    applySubjectSelection([]);
                                    setShowSubjectDropdown(false);
                                  }}
                                  style={[styles.selectOption, subjectIds.length === 0 && styles.selectOptionActive]}
                                >
                                  <Text style={[styles.selectOptionText, subjectIds.length === 0 && styles.selectOptionTextActive]}>
                                    None
                                  </Text>
                                </TouchableOpacity>
                                {subjects.map((subj) => (
                                  (() => {
                                    const isSelected = subjectIds.includes(subj.id);
                                    return (
                                      <TouchableOpacity
                                        key={subj.id}
                                        onPress={() => {
                                          const nextIds = isSelected
                                            ? subjectIds.filter((id) => id !== subj.id)
                                            : [...subjectIds, subj.id];
                                          applySubjectSelection(nextIds);
                                        }}
                                        style={[styles.selectOption, isSelected && styles.selectOptionActive]}
                                      >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <Text style={[styles.selectOptionText, isSelected && styles.selectOptionTextActive, { flexShrink: 1 }]}>
                                            {subj.name}{subj.child_id === null ? ' (family-wide)' : ''}
                                          </Text>
                                          {isSelected ? <Check size={12} color="#6BB3E8" /> : null}
                                        </View>
                                      </TouchableOpacity>
                                    );
                                  })()
                                ))}
                              </>
                            ) : (
                              <View style={{ padding: 12 }}>
                                <Text style={{ fontSize: 13, color: MUTED }}>No subjects yet</Text>
                              </View>
                            )}
                          </ScrollView>
                        </View>
                      );
                      
                      if (ReactDOM && typeof document !== 'undefined' && document.body) {
                        return ReactDOM.createPortal(dropdownContent, document.body);
                      }
                      
                      return dropdownContent;
                    })()}
                    {showSubjectDropdown && Platform.OS !== 'web' && assigneeIds.length === 0 && (
                      <View style={styles.selectOptions}>
                        <View style={{ padding: 12 }}>
                          <Text style={{ fontSize: 13, color: MUTED }}>Select Assignee first</Text>
                        </View>
                      </View>
                    )}
                    {showSubjectDropdown && Platform.OS !== 'web' && assigneeIds.length > 0 && subjects.length > 0 && (
                      <View style={styles.selectOptions}>
                        <TouchableOpacity
                          onPress={() => {
                            applySubjectSelection([]);
                            setShowSubjectDropdown(false);
                          }}
                          style={[styles.selectOption, subjectIds.length === 0 && styles.selectOptionActive]}
                        >
                          <Text style={[styles.selectOptionText, subjectIds.length === 0 && styles.selectOptionTextActive]}>
                            None
                          </Text>
                        </TouchableOpacity>
                        {subjects.map((subj) => (
                          (() => {
                            const isSelected = subjectIds.includes(subj.id);
                            return (
                              <TouchableOpacity
                                key={subj.id}
                                onPress={() => {
                                  const nextIds = isSelected
                                    ? subjectIds.filter((id) => id !== subj.id)
                                    : [...subjectIds, subj.id];
                                  applySubjectSelection(nextIds);
                                }}
                                style={[styles.selectOption, isSelected && styles.selectOptionActive]}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <Text style={[styles.selectOptionText, isSelected && styles.selectOptionTextActive, { flexShrink: 1 }]}>
                                    {subj.name}{subj.child_id === null ? ' (family-wide)' : ''}
                                  </Text>
                                  {isSelected ? <Check size={12} color="#6BB3E8" /> : null}
                                </View>
                              </TouchableOpacity>
                            );
                          })()
                        ))}
                      </View>
                    )}
                    {showSubjectDropdown && Platform.OS !== 'web' && assigneeIds.length > 0 && subjects.length === 0 && (
                      <View style={styles.selectOptions}>
                        <View style={{ padding: 12 }}>
                          <Text style={{ fontSize: 13, color: MUTED }}>No subjects yet</Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
                <View style={[styles.field, styles.academicFieldUnit]}>
                  <Text style={[styles.fieldLabel, styles.learningRowLabel]}>Lesson</Text>
                  <View style={[styles.selectContainer, styles.academicSelectContainer]}>
                    <TouchableOpacity
                      ref={lessonButtonRef}
                      style={[styles.select, styles.academicSelect, (!subjectIds?.[0] || loadingLessonOptions) && { opacity: 0.6 }]}
                      onPress={() => {
                        if (subjectIds?.[0] && !loadingLessonOptions) {
                          setShowLessonDropdown((prev) => !prev);
                        }
                      }}
                      disabled={!subjectIds?.[0] || loadingLessonOptions}
                    >
                      <Text style={[styles.selectText, (!lesson || !String(lesson).trim()) && styles.selectPlaceholder]}>
                        {!subjectIds?.[0]
                          ? 'Select subject first'
                          : loadingLessonOptions
                            ? 'Loading lessons...'
                            : (lesson || (lessonOptions.length > 0 ? 'Select lesson' : 'No saved lessons'))}
                      </Text>
                      <ChevronDown size={16} color={SUB} />
                    </TouchableOpacity>
                    {showLessonDropdown && Platform.OS === 'web' && (() => {
                      let ReactDOM;
                      try {
                        ReactDOM = require('react-dom');
                      } catch (e) {
                        // ReactDOM not available, fall back to normal rendering
                      }

                      const dropdownContent = (
                        <View
                          ref={lessonDropdownRef}
                          style={{
                            position: 'fixed',
                            top: lessonDropdownPosition.top,
                            left: lessonDropdownPosition.left,
                            width: lessonDropdownPosition.width || 200,
                            backgroundColor: '#fff',
                            borderWidth: 1,
                            borderColor: BORDER,
                            borderRadius: 10,
                            marginTop: 0,
                            maxHeight: lessonDropdownPosition.maxHeight || 220,
                            zIndex: 99999,
                            ...Platform.select({
                              web: {
                                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column',
                              },
                              default: {
                                shadowColor: '#000',
                                shadowOpacity: 0.1,
                                shadowRadius: 8,
                                shadowOffset: { width: 0, height: 4 },
                              },
                            }),
                            elevation: 10000,
                          }}
                        >
                          <ScrollView
                            style={{
                              maxHeight: Math.max(140, (lessonDropdownPosition.maxHeight || 220) - 4),
                              ...(Platform.OS === 'web' && {
                                overflowY: 'auto',
                                overflowX: 'hidden',
                                WebkitOverflowScrolling: 'touch',
                              }),
                            }}
                            nestedScrollEnabled
                            showsVerticalScrollIndicator={Platform.OS !== 'web'}
                          >
                            <TouchableOpacity
                              onPress={() => {
                                setLesson('');
                                setUnit('');
                                setShowLessonDropdown(false);
                              }}
                              style={[styles.selectOption, !lesson && styles.selectOptionActive]}
                            >
                              <Text style={[styles.selectOptionText, !lesson && styles.selectOptionTextActive]}>
                                None
                              </Text>
                            </TouchableOpacity>
                            {lessonOptions.length > 0 ? lessonOptions.map((opt) => {
                              const active = String(lesson || '').trim() === opt.lessonTitle;
                              return (
                                <TouchableOpacity
                                  key={opt.key}
                                  onPress={() => {
                                    setLesson(opt.lessonTitle);
                                    setUnit(opt.unitTitle || '');
                                    setShowLessonDropdown(false);
                                  }}
                                  style={[styles.selectOption, active && styles.selectOptionActive]}
                                >
                                  <Text style={[styles.selectOptionText, active && styles.selectOptionTextActive]}>
                                    {opt.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            }) : (
                              <View style={{ padding: 12 }}>
                                <Text style={{ fontSize: 13, color: MUTED }}>No saved lessons for selected subject(s)</Text>
                              </View>
                            )}
                          </ScrollView>
                        </View>
                      );

                      return ReactDOM?.createPortal
                        ? ReactDOM.createPortal(dropdownContent, document.body)
                        : dropdownContent;
                    })()}
                    {showLessonDropdown && Platform.OS !== 'web' ? (
                      <View ref={lessonDropdownRef} style={styles.selectOptions}>
                        <TouchableOpacity
                          onPress={() => {
                            setLesson('');
                            setUnit('');
                            setShowLessonDropdown(false);
                          }}
                          style={[styles.selectOption, !lesson && styles.selectOptionActive]}
                        >
                          <Text style={[styles.selectOptionText, !lesson && styles.selectOptionTextActive]}>
                            None
                          </Text>
                        </TouchableOpacity>
                        {lessonOptions.length > 0 ? lessonOptions.map((opt) => {
                          const active = String(lesson || '').trim() === opt.lessonTitle;
                          return (
                            <TouchableOpacity
                              key={opt.key}
                              onPress={() => {
                                setLesson(opt.lessonTitle);
                                setUnit(opt.unitTitle || '');
                                setShowLessonDropdown(false);
                              }}
                              style={[styles.selectOption, active && styles.selectOptionActive]}
                            >
                              <Text style={[styles.selectOptionText, active && styles.selectOptionTextActive]}>
                                {opt.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        }) : (
                          <View style={{ padding: 12 }}>
                            <Text style={{ fontSize: 13, color: MUTED }}>No saved lessons for selected subject(s)</Text>
                          </View>
                        )}
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={[styles.field, styles.academicFieldPercent]}>
                  <Text style={[styles.fieldLabel, styles.learningRowLabel]}>% Grade</Text>
                  <TextInput
                    placeholder="e.g. 25"
                    placeholderTextColor={MUTED}
                    value={percentOfTotalGrade}
                    onChangeText={setPercentOfTotalGrade}
                    style={[
                      styles.input,
                      styles.academicInputCompact,
                      percentValidationError && styles.inputError
                    ]}
                    keyboardType="numeric"
                  />
                  {checkingPercent && (
                    <Text style={styles.fieldHelpText}>Checking...</Text>
                  )}
                  {percentValidationError && (
                    <View style={{ marginTop: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                        <AlertCircle size={16} color="#ef4444" style={{ marginTop: 2, marginRight: 6 }} />
                        <Text style={styles.errorText}>
                          {percentValidationError.message}
                        </Text>
                      </View>
                      <View style={{ marginTop: 4, paddingLeft: 22 }}>
                        <Text style={styles.fieldHelpText}>
                          Suggested: Use {percentValidationError.suggestedPercent.toFixed(1)}% to stay within 100%
                        </Text>
                        {percentValidationData && percentValidationData.assignments && percentValidationData.assignments.length > 0 && (
                          <View style={{ marginTop: 8 }}>
                            <Text style={[styles.fieldHelpText, { marginBottom: 4, fontWeight: '600' }]}>
                              Or reduce the weight of other assignments:
                            </Text>
                            {percentValidationData.assignments.slice(0, 3).map((assignment, idx) => (
                              <Text key={idx} style={[styles.fieldHelpText, { marginLeft: 8 }]}>
                                • {assignment.title}: {assignment.percent}%
                              </Text>
                            ))}
                            {percentValidationData.assignments.length > 3 && (
                              <Text style={[styles.fieldHelpText, { marginLeft: 8, fontStyle: 'italic' }]}>
                                and {percentValidationData.assignments.length - 3} more...
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                </View>
                <View style={[styles.field, styles.academicFieldGrade]}>
                  <Text style={[styles.fieldLabel, styles.learningRowLabel]}>Grade</Text>
                  <TextInput
                    placeholder="e.g. A+"
                    placeholderTextColor={MUTED}
                    value={grade}
                    onChangeText={setGrade}
                    style={[styles.input, styles.academicInputCompact]}
                  />
                </View>
              </SafeFieldRow>
              {canSendToStudentForEvent ? (
                <View style={styles.learningDetailsSendSection}>
                  <Text style={[styles.fieldLabel, styles.sendSectionTitle]}>Send to student</Text>
                  {assigneeIds.length === 0 ? (
                    <Text style={styles.fieldHelpText}>Select at least one student to enable sharing.</Text>
                  ) : (
                    <>
                      {queueSendToStudentAfterSave ? (
                        <TextInput
                          placeholder="Optional note for student"
                          placeholderTextColor={MUTED}
                          value={queueSendToStudentNote}
                          onChangeText={setQueueSendToStudentNote}
                          style={[styles.input, styles.notesInput, { minHeight: 72, marginTop: 8, marginBottom: 8 }]}
                          multiline
                          textAlignVertical="top"
                        />
                      ) : null}
                      <View style={styles.workflowHeaderRow}>
                        <TouchableOpacity
                          style={[
                            styles.workflowActionButton,
                            queueSendToStudentAfterSave && styles.workflowActionButtonActive,
                            assigneeIds.length === 0 && styles.workflowActionButtonDisabled,
                          ]}
                          onPress={() => setQueueSendToStudentAfterSave((prev) => !prev)}
                          disabled={assigneeIds.length === 0}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityLabel={queueSendToStudentAfterSave ? 'Turn off send after save' : 'Turn on send after save'}
                          {...(Platform.OS === 'web' && { cursor: assigneeIds.length === 0 ? 'default' : 'pointer' })}
                        >
                          <View style={styles.workflowActionButtonRow}>
                            <View style={[styles.workflowActionIconWrap, queueSendToStudentAfterSave && styles.workflowActionIconWrapActive]}>
                              {queueSendToStudentAfterSave ? (
                                <Check size={12} color="#16A34A" />
                              ) : (
                                <Send size={12} color="#5B6880" />
                              )}
                            </View>
                            <Text style={styles.workflowActionButtonText}>
                              {assigneeIds.length > 1 ? 'Send to students' : 'Send to student'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              ) : null}
                </SafeView>
            </ModalSectionCard>

            {/* Additional notes — collapsible, same pattern as Add Subject modal */}
            <ModalSectionCard
              Icon={FileText}
              title="Notes and attachments"
              subtitle="Anything else to remember"
              expanded={showNotesSection}
              onPress={() => setShowNotesSection(!showNotesSection)}
              accent="#9ECFFB"
            >
                <View style={{ marginTop: 2 }}>
                  <Text style={styles.fieldLabel}>Notes</Text>
                  <TextInput
                    placeholder="Add any additional notes about this event"
                    placeholderTextColor={MUTED}
                    value={notes}
                    onChangeText={setNotes}
                    style={[styles.input, styles.notesInput]}
                    multiline
                    textAlignVertical="top"
                  />
                </View>

            {/* Labels removed - no longer used */}

            {/* Material Selector - always visible */}
            {familyId && (
              <SafeFieldRow style={[styles.fieldRow, { marginTop: 8 }]}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Attachments</Text>
                  <View style={styles.materialSelectorContainer}>
                    <TouchableOpacity
                      ref={materialButtonRef}
                      {...(Platform.OS === 'web' ? { 'data-material-selector': 'true' } : {})}
                      style={styles.materialSelector}
                      onPress={() => {
                        const willShow = !showMaterialDropdown;
                        if (willShow && Platform.OS === 'web') {
                          // Calculate position immediately before showing
                          const calculatePosition = () => {
                            let node = null;
                            
                            if (materialButtonRef.current) {
                              node = materialButtonRef.current._nativeNode || materialButtonRef.current;
                            }
                            
                            if (!node || !node.getBoundingClientRect) {
                              const selector = document.querySelector('[data-material-selector="true"]');
                              if (selector) {
                                node = selector;
                              }
                            }
                            
                            if (node && typeof node.getBoundingClientRect === 'function') {
                              const rect = node.getBoundingClientRect();
                              const dropdownMaxHeight = 300;
                              const spaceBelow = window.innerHeight - rect.bottom;
                              const spaceAbove = rect.top;
                              
                              let top, maxHeight;
                              if (spaceBelow < 200 && spaceAbove > spaceBelow) {
                                top = rect.top - Math.min(dropdownMaxHeight, spaceAbove - 10);
                                maxHeight = Math.min(dropdownMaxHeight, spaceAbove - 10);
                              } else {
                                top = rect.bottom + 4;
                                maxHeight = Math.min(dropdownMaxHeight, spaceBelow - 10);
                              }
                              
                              setMaterialDropdownPosition({
                                top,
                                left: rect.left,
                                width: Math.max(rect.width, 200),
                                maxHeight,
                              });
                              setMaterialDropdownPositionReady(true);
                              return true;
                            }
                            return false;
                          };
                          
                          // Calculate position immediately
                          if (calculatePosition()) {
                            setShowMaterialDropdown(true);
                          } else {
                            // If immediate calculation fails, try with a tiny delay
                            setTimeout(() => {
                              if (calculatePosition()) {
                                setShowMaterialDropdown(true);
                              }
                            }, 0);
                          }
                        } else {
                          setShowMaterialDropdown(willShow);
                          if (!willShow) {
                            setMaterialDropdownPositionReady(false);
                          }
                        }
                      }}
                    >
                      <Text style={[
                        styles.materialSelectorText,
                        !selectedMaterialId && styles.materialSelectorPlaceholder
                      ]}>
                        {selectedMaterialId
                          ? (materials.find(m => m.id === selectedMaterialId)?.title || materials.find(m => m.id === selectedMaterialId)?.provider_name || 'Select attachment...')
                          : 'Select attachment...'}
                      </Text>
                      <ChevronDown size={16} color={MUTED} />
                    </TouchableOpacity>
                    {selectedMaterialId && (
                      <TouchableOpacity
                        style={styles.clearMaterialButton}
                        onPress={() => {
                          setSelectedMaterialId(null);
                          setAttachedMaterialIds([]);
                        }}
                      >
                        <Text style={styles.clearMaterialText}>Clear</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.addMaterialButton}
                      onPress={() => setShowAddMaterialModal(true)}
                    >
                      <Plus size={14} color="#5B6880" />
                      <Text style={styles.addMaterialText}>Add New</Text>
                    </TouchableOpacity>
                  </View>
                  {showMaterialDropdown && Platform.OS === 'web' && materialDropdownPositionReady && (() => {
                    // Use portal to render outside modal to avoid positioning issues
                    let ReactDOM;
                    try {
                      ReactDOM = require('react-dom');
                    } catch (e) {
                      // ReactDOM not available, fall back to normal rendering
                    }
                    
                    const dropdownContent = (
                      <View
                        ref={materialDropdownRef}
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
                          ...(Platform.OS === 'web' && {
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                          }),
                        }}
                      >
                        <ScrollView 
                          style={{ 
                            maxHeight: (materialDropdownPosition.maxHeight || 300) - 8,
                            ...(Platform.OS === 'web' && {
                              overflowY: 'auto',
                              overflowX: 'hidden',
                              WebkitOverflowScrolling: 'touch',
                            }),
                          }} 
                          nestedScrollEnabled
                          showsVerticalScrollIndicator={Platform.OS !== 'web'}
                        >
                          {loadingMaterials ? (
                            <View style={{ padding: 12 }}>
                              <Text style={{ fontSize: 13, color: MUTED }}>Loading...</Text>
                            </View>
                          ) : materials.length === 0 ? (
                            <View style={{ padding: 12 }}>
                              <Text style={{ fontSize: 13, color: MUTED }}>No materials yet</Text>
                            </View>
                          ) : (
                            <>
                              <TouchableOpacity
                                style={{
                                  paddingVertical: 6,
                                  paddingHorizontal: 10,
                                  borderRadius: 4,
                                }}
                                onPress={() => {
                                  setSelectedMaterialId(null);
                                  setAttachedMaterialIds([]);
                                  setShowMaterialDropdown(false);
                                }}
                              >
                                <Text style={{ fontSize: 13, color: FG }}>None</Text>
                              </TouchableOpacity>
                              {materials.map((material) => (
                                <TouchableOpacity
                                  key={material.id}
                                  style={{
                                    paddingVertical: 6,
                                    paddingHorizontal: 10,
                                    borderRadius: 4,
                                    backgroundColor: selectedMaterialId === material.id ? 'rgba(212, 162, 86, 0.1)' : 'transparent',
                                  }}
                                  onPress={() => {
                                    setSelectedMaterialId(material.id);
                                    setAttachedMaterialIds([material.id]);
                                    setShowMaterialDropdown(false);
                                  }}
                                >
                                  <Text style={{
                                    fontSize: 13,
                                    color: selectedMaterialId === material.id ? ACCENT : FG,
                                    fontWeight: selectedMaterialId === material.id ? '600' : '400',
                                  }}>
                                    {material.title || material.provider_name || 'Untitled Material'}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </>
                          )}
                        </ScrollView>
                      </View>
                    );
                    
                    // Render to document.body via portal if available
                    if (ReactDOM && typeof document !== 'undefined' && document.body) {
                      return ReactDOM.createPortal(dropdownContent, document.body);
                    }
                    
                    return dropdownContent;
                  })()}
                </View>
              </SafeFieldRow>
            )}
            </ModalSectionCard>

          </ScrollView>
          </AppModalShell>
        </Animated.View>
      </Animated.View>
      
      {/* Mini Calendar Picker Modal */}
      {showCalendarPicker && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={showCalendarPicker}
          onRequestClose={() => setShowCalendarPicker(false)}
        >
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            activeOpacity={1}
            onPress={() => setShowCalendarPicker(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#FFFFFF',
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
                    }
                ),
              }}
            >
              {/* Month/Year Navigation */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(calendarViewMonth);
                    newMonth.setMonth(newMonth.getMonth() - 1);
                    setCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <ChevronLeft size={20} color={FG} />
                </TouchableOpacity>
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: FG,
                  ...(Platform.OS === 'web' && {
                    fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }),
                }}>
                  {calendarViewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(calendarViewMonth);
                    newMonth.setMonth(newMonth.getMonth() + 1);
                    setCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <ChevronRight size={20} color={FG} />
                </TouchableOpacity>
              </View>

              {/* Year Navigation (for quick jumps) */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 12,
              }}>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(calendarViewMonth);
                    newMonth.setFullYear(newMonth.getFullYear() - 1);
                    setCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    color: SUB,
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>← Year</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setCalendarViewMonth(new Date());
                    setDueDate(new Date());
                    setShowCalendarPicker(false);
                  }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    color: SUB, 
                    textDecorationLine: 'underline',
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(calendarViewMonth);
                    newMonth.setFullYear(newMonth.getFullYear() + 1);
                    setCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    color: SUB,
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>Year →</Text>
                </TouchableOpacity>
              </View>

              {/* Calendar Grid */}
              <View>
                {/* Day Headers */}
                <View style={{
                  flexDirection: 'row',
                  marginBottom: 8,
                }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <View key={day} style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{
                        fontSize: 11,
                        color: SUB,
                        fontWeight: '500',
                      }}>{day}</Text>
                    </View>
                  ))}
                </View>

                {/* Calendar Days */}
                {(() => {
                  const year = calendarViewMonth.getFullYear();
                  const month = calendarViewMonth.getMonth();
                  const firstDay = new Date(year, month, 1);
                  const lastDay = new Date(year, month + 1, 0);
                  const startDate = new Date(firstDay);
                  startDate.setDate(startDate.getDate() - startDate.getDay()); // Start from Sunday
                  
                  const days = [];
                  const currentDate = new Date(startDate);
                  
                  // Generate 6 weeks of days
                  for (let i = 0; i < 42; i++) {
                    days.push(new Date(currentDate));
                    currentDate.setDate(currentDate.getDate() + 1);
                  }

                  return (
                    <View>
                      {[0, 1, 2, 3, 4, 5].map((week) => (
                        <View key={week} style={{ flexDirection: 'row', marginBottom: 4 }}>
                          {days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                            const isCurrentMonth = day.getMonth() === month;
                            const isSelected = day.toDateString() === dueDate.toDateString();
                            const isToday = day.toDateString() === new Date().toDateString();
                            
                            return (
                              <TouchableOpacity
                                key={idx}
                                onPress={() => {
                                  setDueDate(day);
                                  setShowCalendarPicker(false);
                                }}
                                style={{
                                  flex: 1,
                                  aspectRatio: 1,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: 6,
                                  backgroundColor: isSelected ? ACCENT : 'transparent',
                                  borderWidth: isToday ? 2 : 0,
                                  borderColor: isToday ? ACCENT : 'transparent',
                                }}
                              >
                                <Text style={{
                                  fontSize: 13,
                                  color: isSelected 
                                    ? '#FFFFFF' 
                                    : (isCurrentMonth ? FG : MUTED),
                                  fontWeight: isSelected || isToday ? '600' : '400',
                                }}>
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
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* End Date Calendar Picker Modal */}
      {showEndDateCalendarPicker && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={showEndDateCalendarPicker}
          onRequestClose={() => setShowEndDateCalendarPicker(false)}
        >
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            activeOpacity={1}
            onPress={() => setShowEndDateCalendarPicker(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#FFFFFF',
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
                    }
                ),
              }}
            >
              {/* Month/Year Navigation */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(endDateCalendarViewMonth);
                    newMonth.setMonth(newMonth.getMonth() - 1);
                    setEndDateCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <ChevronLeft size={20} color={FG} />
                </TouchableOpacity>
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: FG,
                  ...(Platform.OS === 'web' && {
                    fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }),
                }}>
                  {endDateCalendarViewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(endDateCalendarViewMonth);
                    newMonth.setMonth(newMonth.getMonth() + 1);
                    setEndDateCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <ChevronRight size={20} color={FG} />
                </TouchableOpacity>
              </View>

              {/* Year Navigation (for quick jumps) */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 12,
              }}>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(endDateCalendarViewMonth);
                    newMonth.setFullYear(newMonth.getFullYear() - 1);
                    setEndDateCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    color: SUB,
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>← Year</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const today = new Date();
                    setEndDateCalendarViewMonth(today);
                    setRecurrenceEndDate(today);
                    setShowEndDateCalendarPicker(false);
                    if (validationErrors.recurrenceEnd) {
                      setValidationErrors((prev) => ({ ...prev, recurrenceEnd: null }));
                    }
                  }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    color: SUB, 
                    textDecorationLine: 'underline',
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(endDateCalendarViewMonth);
                    newMonth.setFullYear(newMonth.getFullYear() + 1);
                    setEndDateCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    color: SUB,
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>Year →</Text>
                </TouchableOpacity>
              </View>

              {/* Calendar Grid */}
              <View>
                {/* Day Headers */}
                <View style={{
                  flexDirection: 'row',
                  marginBottom: 8,
                }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <View key={day} style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{
                        fontSize: 11,
                        color: SUB,
                        fontWeight: '500',
                        ...(Platform.OS === 'web' && {
                          fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        }),
                      }}>{day}</Text>
                    </View>
                  ))}
                </View>

                {/* Calendar Days */}
                {(() => {
                  const year = endDateCalendarViewMonth.getFullYear();
                  const month = endDateCalendarViewMonth.getMonth();
                  const firstDay = new Date(year, month, 1);
                  const lastDay = new Date(year, month + 1, 0);
                  const startDate = new Date(firstDay);
                  startDate.setDate(startDate.getDate() - startDate.getDay()); // Start from Sunday
                  
                  const days = [];
                  const currentDate = new Date(startDate);
                  
                  // Generate 6 weeks of days
                  for (let i = 0; i < 42; i++) {
                    days.push(new Date(currentDate));
                    currentDate.setDate(currentDate.getDate() + 1);
                  }

                  return (
                    <View>
                      {[0, 1, 2, 3, 4, 5].map((week) => (
                        <View key={week} style={{ flexDirection: 'row', marginBottom: 4 }}>
                          {days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                            const isCurrentMonth = day.getMonth() === month;
                            const isSelected = recurrenceEndDate ? day.toDateString() === new Date(recurrenceEndDate).toDateString() : false;
                            const isToday = day.toDateString() === new Date().toDateString();
                            
                            return (
                              <TouchableOpacity
                                key={idx}
                                onPress={() => {
                                  setRecurrenceEndDate(day);
                                  setShowEndDateCalendarPicker(false);
                                  if (validationErrors.recurrenceEnd) {
                                    setValidationErrors((prev) => ({ ...prev, recurrenceEnd: null }));
                                  }
                                }}
                                style={{
                                  flex: 1,
                                  aspectRatio: 1,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: 6,
                                  backgroundColor: isSelected ? ACCENT : 'transparent',
                                  borderWidth: isToday ? 2 : 0,
                                  borderColor: isToday ? ACCENT : 'transparent',
                                }}
                              >
                                <Text style={{
                                  fontSize: 13,
                                  color: isSelected 
                                    ? '#FFFFFF' 
                                    : (isCurrentMonth ? FG : MUTED),
                                  fontWeight: isSelected || isToday ? '600' : '400',
                                  ...(Platform.OS === 'web' && {
                                    fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                  }),
                                }}>
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
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Event End Date Calendar Picker Modal */}
      {showEventEndDatePicker && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={showEventEndDatePicker}
          onRequestClose={() => setShowEventEndDatePicker(false)}
        >
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            activeOpacity={1}
            onPress={() => setShowEventEndDatePicker(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                padding: 20,
                width: Platform.OS === 'web' ? 350 : '90%',
                maxWidth: 400,
                ...Platform.select({
                  web: {
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  },
                  default: {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.25,
                    shadowRadius: 3.84,
                    elevation: 5,
                  },
                }),
              }}
            >
              {/* Header */}
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}>
                <Text style={{
                  fontSize: 18,
                  fontWeight: '600',
                  color: FG,
                }}>Select End Date</Text>
                <TouchableOpacity
                  onPress={() => setShowEventEndDatePicker(false)}
                  style={{ padding: 4 }}
                >
                  <X size={20} color={MUTED} />
                </TouchableOpacity>
              </View>

              {/* Month Navigation */}
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(eventEndDateCalendarViewMonth);
                    newMonth.setMonth(newMonth.getMonth() - 1);
                    setEventEndDateCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <ChevronLeft size={20} color={FG} />
                </TouchableOpacity>
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: FG,
                }}>
                  {eventEndDateCalendarViewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(eventEndDateCalendarViewMonth);
                    newMonth.setMonth(newMonth.getMonth() + 1);
                    setEventEndDateCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <ChevronRight size={20} color={FG} />
                </TouchableOpacity>
              </View>

              {/* Year Navigation */}
              <View style={{
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 12,
                gap: 16,
              }}>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(eventEndDateCalendarViewMonth);
                    newMonth.setFullYear(newMonth.getFullYear() - 1);
                    setEventEndDateCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <ChevronLeft size={16} color={MUTED} />
                </TouchableOpacity>
                <Text style={{
                  fontSize: 14,
                  color: MUTED,
                }}>
                  {eventEndDateCalendarViewMonth.getFullYear()}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(eventEndDateCalendarViewMonth);
                    newMonth.setFullYear(newMonth.getFullYear() + 1);
                    setEventEndDateCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <ChevronRight size={16} color={MUTED} />
                </TouchableOpacity>
              </View>

              {/* Calendar Grid */}
              <View>
                {/* Day Headers */}
                <View style={{
                  flexDirection: 'row',
                  marginBottom: 8,
                }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <View key={day} style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{
                        fontSize: 11,
                        color: SUB,
                        fontWeight: '500',
                      }}>{day}</Text>
                    </View>
                  ))}
                </View>

                {/* Calendar Days */}
                {(() => {
                  const year = eventEndDateCalendarViewMonth.getFullYear();
                  const month = eventEndDateCalendarViewMonth.getMonth();
                  const firstDay = new Date(year, month, 1);
                  const lastDay = new Date(year, month + 1, 0);
                  const startDate = new Date(firstDay);
                  startDate.setDate(startDate.getDate() - startDate.getDay()); // Start from Sunday
                  
                  const days = [];
                  const currentDate = new Date(startDate);
                  
                  // Generate 6 weeks of days
                  for (let i = 0; i < 42; i++) {
                    days.push(new Date(currentDate));
                    currentDate.setDate(currentDate.getDate() + 1);
                  }

                  return (
                    <View>
                      {[0, 1, 2, 3, 4, 5].map((week) => (
                        <View key={week} style={{ flexDirection: 'row', marginBottom: 4 }}>
                          {days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                            const isCurrentMonth = day.getMonth() === month;
                            const isSelected = eventEndDate ? day.toDateString() === new Date(eventEndDate).toDateString() : false;
                            const isToday = day.toDateString() === new Date().toDateString();
                            const isInRange = eventEndDate && dueDate && day >= dueDate && day <= eventEndDate;
                            const isBeforeStart = dueDate && day < dueDate;
                            
                            return (
                              <TouchableOpacity
                                key={idx}
                                onPress={() => {
                                  if (!isBeforeStart) {
                                    setEventEndDate(day);
                                    setShowEventEndDatePicker(false);
                                  }
                                }}
                                disabled={isBeforeStart}
                                style={{
                                  flex: 1,
                                  aspectRatio: 1,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: 6,
                                  backgroundColor: isSelected ? ACCENT : (isInRange ? 'rgba(167, 139, 250, 0.1)' : 'transparent'),
                                  borderWidth: isToday ? 2 : 0,
                                  borderColor: isToday ? ACCENT : 'transparent',
                                  opacity: isBeforeStart ? 0.3 : 1,
                                }}
                              >
                                <Text style={{
                                  fontSize: 13,
                                  color: isSelected 
                                    ? '#FFFFFF' 
                                    : (isCurrentMonth ? FG : MUTED),
                                  fontWeight: isSelected || isToday ? '600' : '400',
                                }}>
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
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Add Subject Modal */}
      {showAddSubjectModal ? (
        <AddSubjectModal
          visible
          onClose={() => setShowAddSubjectModal(false)}
          onSubjectAdded={(newSubject) => {
            // Refresh subjects list
            fetchSubjects();
            // Select the newly added subject
            if (newSubject?.id) {
              applySubjectSelection([newSubject.id]);
            }
          }}
          familyId={familyId}
          defaultChildId={assigneeIds.length > 0 ? assigneeIds[0] : null}
          children={familyMembers}
        />
      ) : null}

      {showAddMaterialModal ? (
        <AddMaterialModal
          visible
          onClose={() => setShowAddMaterialModal(false)}
          onSaved={(saved) => {
            loadMaterials();
            const id = saved?.id;
            if (id) {
              setSelectedMaterialId(id);
              setAttachedMaterialIds([id]);
            }
          }}
          familyId={familyId}
          children={familyMembers}
        />
      ) : null}

    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: '100%',
    maxWidth: 860,
    maxHeight: Platform.OS === 'web' ? '78vh' : '84%',
    backgroundColor: 'transparent',
    borderRadius: 0,
    flexDirection: 'column',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    overflow: 'visible',
  },
  modalShell: {
    ...(Platform.OS === 'web'
      ? {
          height: 'auto',
          maxHeight: '78vh',
          minHeight: 0,
        }
      : { height: '84%' }),
  },
  shellBody: {
    flex: 1,
    minHeight: 0,
    paddingTop: 10,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  titleInput: {
    fontSize: 22,
    fontWeight: '700',
    color: FG,
    width: '100%',
    paddingVertical: 2,
    paddingHorizontal: 0,
    ...(Platform.OS === 'web' && {
      outlineStyle: 'none',
      borderWidth: 0,
      backgroundColor: 'transparent',
    }),
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  titleInputRow: {
    width: '100%',
    alignSelf: 'stretch',
    borderBottomWidth: 0,
    paddingBottom: 4,
    marginBottom: 2,
  },
  titleInputRowError: {
    borderBottomWidth: 1,
    borderBottomColor: '#ef4444',
  },
  calendarConnectionOption: {
    minHeight: 30,
  },
  calendarConnectionOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipRow: {
    paddingHorizontal: 0,
    paddingTop: 6,
    paddingBottom: 6,
    gap: 8,
    alignItems: 'center',
    flexDirection: 'row',
  },
  modeToggle: {
    flexDirection: 'row',
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 8,
  },
  modeOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    backgroundColor: '#ffffff',
  },
  modeOptionActive: {
    backgroundColor: '#e2e8f0',
    borderColor: '#cbd5f5',
  },
  modeOptionText: {
    color: FG,
    fontSize: 13,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modeOptionTextActive: {
    color: FG,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modeInfo: {
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 8,
  },
  modeInfoText: {
    color: SUB,
    fontSize: 13,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CHIP_BG,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
    marginRight: 8,
    flexShrink: 0,
    minHeight: 40,
  },
  chipText: {
    color: FG,
    fontWeight: '600',
    marginHorizontal: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipLabel: {
    color: SUB,
    marginRight: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipScroll: {
    gap: 8,
  },
  chipOption: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipOptionActive: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  chipOptionText: {
    color: '#6b7280',
    fontSize: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipOptionTextActive: {
    color: '#6BB3E8',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  todayButton: {
    marginLeft: 10,
  },
  todayText: {
    color: SUB,
    textDecorationLine: 'underline',
    fontSize: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  labelsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    maxWidth: 260,
  },
  labelChip: {
    backgroundColor: '#eef2ff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  labelChipText: {
    color: FG,
    fontSize: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestedTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  suggestedTagChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    backgroundColor: '#fff',
  },
  suggestedTagChipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#bae6fd',
  },
  suggestedTagText: {
    color: FG,
    fontSize: 12,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestedTagTextActive: {
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  bodyScroll: {
    flex: 1,
    minHeight: 0,
    maxHeight: Platform.OS === 'web' ? 'min(60vh, calc(100vh - 300px))' : undefined,
  },
  bodyScrollContent: {
    paddingBottom: 6,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 6,
  },
  scheduleFieldsWrap: {
    marginBottom: 8,
    overflow: 'visible',
  },
  scheduleFieldsWrapOverlay: {
    position: 'relative',
    zIndex: 30000,
  },
  scheduleFieldsWrapError: {
    borderColor: '#ef4444',
  },
  dateTimeInlineRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    marginBottom: 10,
  },
  dateTimeInlineRowWeb: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  dateFieldInline: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 220,
  },
  inlineSwitchField: {
    minWidth: 84,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    ...(Platform.OS === 'web' && {
      marginBottom: 6,
    }),
  },
  inlineSwitchRow: {
    marginTop: 0,
    marginBottom: 0,
  },
  inlineSwitchFieldStack: {
    justifyContent: 'flex-start',
  },
  inlineSwitchLabel: {
    marginBottom: 0,
  },
  inlineSwitchControlWrap: {
    minHeight: 40,
    justifyContent: 'center',
  },
  allDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    marginTop: 2,
  },
  repeatToggleTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    marginBottom: 2,
  },
  repeatToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  repeatToggleLabel: {
    color: SUB,
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timeSection: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 8,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
  },
  timeToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timeToggleControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  allDayControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  allDayLabel: {
    color: SUB,
    fontSize: 13,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  recurringRecommendationCard: {
    marginTop: 8,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
  },
  recurringRecommendationText: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  advancedOptionsHeaderRow: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  advancedToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
  },
  advancedToggleText: {
    color: SUB,
    fontSize: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  advancedOptionsCard: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  daysOffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  smallHintText: {
    color: '#64748b',
    fontSize: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  advancedActionButton: {
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  advancedActionButtonText: {
    color: '#1d4ed8',
    fontSize: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timeInputsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timeInputsRowInline: {
    flex: 1,
    minWidth: 220,
    overflow: 'visible',
  },
  timeField: {
    flex: 1,
    overflow: 'visible',
  },
  timeFieldCompact: {
    ...(Platform.OS === 'web'
      ? {
          flex: 0,
          width: 148,
          maxWidth: 148,
          minWidth: 148,
          flexShrink: 0,
        }
      : {}),
  },
  timeLabel: {
    color: SUB,
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '500',
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timeInput: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: FG,
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timeInputDisabled: {
    backgroundColor: '#F8FAFC',
    color: MUTED,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 10,
    color: FG,
    marginBottom: 8,
    textAlign: 'left',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  cancelText: {
    color: '#666666',
    fontSize: 14,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  createButton: {
    backgroundColor: '#85C4F2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'flex-end',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
      cursor: 'pointer',
    }),
  },
  createButtonHovered: {
    backgroundColor: '#78BCEF',
  },
  createButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.8,
    ...(Platform.OS === 'web' && {
      cursor: 'not-allowed',
    }),
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  createButtonTextDisabled: {
    color: '#FFFFFF',
  },
  inputError: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
  },
  chipError: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
  },
  dropdownContainerError: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 4,
  },
  validationBannerContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  validationBannerText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  errorTextSmall: {
    color: '#ef4444',
    fontSize: 11,
    marginTop: 4,
    marginLeft: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  fieldHelpText: {
    color: MUTED,
    fontSize: 12,
    fontStyle: 'italic',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  recurringSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 8,
  },
  recurringSectionContent: {
    marginTop: 8,
    paddingTop: 0,
  },
  repeatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    alignItems: 'flex-start',
    ...(Platform.OS === 'web' && {
      display: 'grid',
      gridTemplateColumns: '1fr 1.7fr 1fr 1.4fr',
      gap: 24,
      alignItems: 'start',
    }),
  },
  repeatGroup: {
    minWidth: 180,
    marginBottom: 8,
  },
  repeatGroupPattern: {
    flex: 1,
    minWidth: 170,
  },
  repeatGroupDays: {
    flex: 1.7,
    minWidth: 250,
  },
  repeatGroupEnds: {
    flex: 1,
    minWidth: 170,
  },
  repeatGroupEndInput: {
    flex: 0.7,
    minWidth: 110,
    maxWidth: 130,
  },
  repeatDisabledHintWrap: {
    minHeight: 36,
    justifyContent: 'center',
  },
  recurrenceGroupLabel: {
    color: SUB,
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '500',
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  recurrenceTopRow: {
    ...(Platform.OS === 'web' && {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 16,
    }),
  },
  recurrenceTopColumn: {
    ...(Platform.OS === 'web' && {
      flex: 1,
      minWidth: 0,
    }),
  },
  recurrenceEndsRow: {
    ...(Platform.OS === 'web' && {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 16,
    }),
  },
  recurrenceEndsControl: {
    ...(Platform.OS === 'web' && {
      flex: 1,
      minWidth: 0,
    }),
  },
  recurrenceEndsInputWrap: {
    ...(Platform.OS === 'web' && {
      flex: 1,
      minWidth: 0,
      marginLeft: -6,
    }),
  },
  recurringBadge: {
    backgroundColor: ACCENT,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recurringBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  academicSection: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#f9fafb',
    overflow: 'visible',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: FG,
    marginBottom: 8,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    overflow: 'visible',
  },
  learningRow: {
    alignItems: 'stretch',
    ...(Platform.OS === 'web'
      ? {
          display: 'grid',
          gridTemplateColumns: 'minmax(130px, 180px) minmax(220px, 1fr) minmax(82px, 96px) minmax(82px, 96px)',
          gap: 4,
        }
      : {
          flexWrap: 'wrap',
        }),
  },
  field: {
    flex: 1,
    alignItems: 'flex-start',
    overflow: 'visible',
  },
  academicFieldSubject: {
    ...(Platform.OS === 'web'
      ? { minWidth: 0, maxWidth: 180, width: '100%', alignSelf: 'flex-start' }
      : { minWidth: '47%' }),
  },
  academicFieldUnit: {
    ...(Platform.OS === 'web' ? { minWidth: 0 } : { minWidth: '47%' }),
  },
  academicFieldGrade: {
    ...(Platform.OS === 'web' ? { minWidth: 0, maxWidth: 96, width: '100%', alignSelf: 'flex-start' } : { minWidth: '47%' }),
    flex: 0.5,
  },
  academicFieldPercent: {
    ...(Platform.OS === 'web' ? { minWidth: 0, maxWidth: 96, width: '100%', alignSelf: 'flex-start' } : { minWidth: '47%' }),
    flex: 0.4,
  },
  academicFieldGradeStack: {
    flex: 0,
    minWidth: 0,
    maxWidth: 96,
    width: 96,
    alignSelf: 'flex-start',
    gap: 8,
  },
  academicGradeItem: {
    width: '100%',
    maxWidth: 96,
  },
  fieldLabel: {
    color: SUB,
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '500',
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningRowLabel: {
    minHeight: 16,
    marginBottom: 6,
  },
  academicInputCompact: {
    minHeight: 40,
    height: 40,
    borderRadius: 12,
    width: 96,
    maxWidth: 96,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginBottom: 0,
  },
  dropdownContainer: {
    flexDirection: 'row',
    width: '100%',
    flex: 1,
  },
  dropdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: BORDER,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#60a5fa',
    borderColor: '#60a5fa',
  },
  dropdownOption: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  dropdownOptionActive: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  dropdownOptionText: {
    color: '#6b7280',
    fontSize: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dropdownOptionTextActive: {
    color: '#6BB3E8',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assigneePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  assigneePillText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assigneePillTextActive: {
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  selectContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  timeSelectContainer: {
    width: '100%',
    maxWidth: 100,
    zIndex: 32000,
  },
  timeSelectButton: {
    minHeight: 40,
    height: 40,
    borderRadius: 14,
    paddingVertical: 10,
  },
  timeSelectOptions: {
    borderRadius: 14,
    marginTop: 4,
    maxHeight: 220,
    zIndex: 32000,
  },
  academicSelectContainer: {
    width: '100%',
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  academicSelect: {
    minHeight: 40,
    height: 40,
    borderRadius: 12,
    paddingVertical: 8,
  },
  selectText: {
    color: FG,
    fontSize: 14,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  selectPlaceholder: {
    color: MUTED,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  selectOptions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    marginTop: 4,
    maxHeight: 200,
    zIndex: 10000,
    elevation: 10000,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
    }),
    elevation: 4,
  },
  selectOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  selectOptionActive: {
    backgroundColor: '#e8f0fe',
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
    color: '#4285f4',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  selectDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 4,
  },
  selectOptionAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
  },
  selectOptionAddText: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialSelectorContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
    width: '100%',
  },
  materialSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: BG,
    minWidth: 0,
  },
  materialSelectorText: {
    fontSize: 14,
    color: FG,
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialSelectorPlaceholder: {
    color: MUTED,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  clearMaterialButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  clearMaterialText: {
    fontSize: 13,
    color: SUB,
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  addMaterialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  addMaterialText: {
    fontSize: 14,
    color: '#5B6880',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", "Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  standardsSelectorContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  standardsSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: BG,
  },
  standardsSelectorText: {
    fontSize: 14,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  standardsSelectorPlaceholder: {
    color: MUTED,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  clearStandardsButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  clearStandardsText: {
    fontSize: 13,
    color: MUTED,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  standardsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  standardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: CHIP_BG,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    gap: 6,
  },
  standardChipText: {
    fontSize: 12,
    color: FG,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  removeStandardButton: {
    padding: 2,
  },
  learningDetailsSendSection: {
    marginTop: 12,
    paddingTop: 0,
    gap: 4,
  },
  sendSectionTitle: {
    marginBottom: 2,
    minHeight: 0,
  },
  workflowHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: 10,
  },
  workflowActionButton: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  workflowActionButtonActive: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  workflowActionButtonDisabled: {
    opacity: 0.6,
  },
  workflowActionButtonText: {
    color: '#5B6880',
    fontSize: 13,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", "Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  workflowActionButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  workflowActionIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  workflowActionIconWrapActive: {
    backgroundColor: '#DCFCE7',
  },
});

