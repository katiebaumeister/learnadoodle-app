import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, Animated, Easing, ScrollView, StyleSheet, Modal, Switch } from 'react-native';
import { X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, AlertCircle, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import AddSubjectModal from './AddSubjectModal';
import { logAddEvent } from '../app/services/plannerInstrumentation';
import { getMaterials } from '../lib/services/materialsClient';
import { useSession } from '../contexts/SessionContext';
import AddMaterialModal from './materials/AddMaterialModal';
import { apiRequest } from '../lib/apiClient';
import { defaultRequiresSubmissionHomeForEventType } from '../lib/eventRequiresSubmissionHome';
import { Search } from 'lucide-react';
import {
  LearnerPill,
  formatConflictMetaFromEvent,
  mapChildrenForConflict,
  parseConflictMessageString,
  resolveLearnerChild,
  sharedConflictBannerStyles as cb,
} from './planner/conflictBannerShared';

const BG = '#ffffff';
const FG = '#111827';
const SUB = '#6b7280';
const BORDER = '#e5e7eb';
const MUTED = '#9ca3af';
const ACCENT = '#d4a256';
const CHIP_BG = '#f3f4f6';
const CHIP_BORDER = '#e5e7eb';

const DEFAULT_START_TIME = '9:00 AM';
const DEFAULT_DURATION_MINUTES = 30;
let createTaskEventAllowOverlapsSupported = true;

const EVENT_TYPES = [
  'Lesson',
  'Project',
  'Exam',
  'Assignment',
  'Activity',
  'Appointment',
];

const MODE_OPTIONS = ['home', 'online', 'outside', 'travel'];

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
}) {
  const [title, setTitle] = useState('');
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
  const initialAssigneeIds =
    Array.isArray(defaultChildIds) && defaultChildIds?.length
      ? defaultChildIds
      : (defaultChildId ? [defaultChildId] : []);

  const [assigneeIds, setAssigneeIds] = useState(initialAssigneeIds);
  const [notes, setNotes] = useState('');
  const [showAcademicDetails, setShowAcademicDetails] = useState(false); // Collapsed by default
  const [showNotesSection, setShowNotesSection] = useState(false); // Collapsed by default (match Add Subject)
  const [showLogisticDetails, setShowLogisticDetails] = useState(false); // Collapsed by default
  const [submitting, setSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
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
    }
  }, [visible, defaultPlacement]);
  
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState('');
  
  // New academic and metadata fields
  const [eventType, setEventType] = useState('Lesson'); // Default to "Lesson" and require selection
  const [subjectId, setSubjectId] = useState(null);
  const [unit, setUnit] = useState('');
  const [grade, setGrade] = useState('');
  const [percentOfTotalGrade, setPercentOfTotalGrade] = useState('');
  const [location, setLocation] = useState('');
  const [mode, setMode] = useState('');
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
  const [subjectDropdownPosition, setSubjectDropdownPosition] = useState({ top: 0, left: 0, width: 200 });
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
  
  // Standards state
  const [attachedStandards, setAttachedStandards] = useState([]);
  const [showStandardsModal, setShowStandardsModal] = useState(false);

  // Counts toward year plan (instructional accounting)
  const [countsTowardPlan, setCountsTowardPlan] = useState(true); // default true for Lesson
  const [showRequiresSubmissionHome, setShowRequiresSubmissionHome] = useState(false);
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState(null);
  const [instructionalMinutesOverride, setInstructionalMinutesOverride] = useState('');
  const [loadingAcademicYears, setLoadingAcademicYears] = useState(false);
  
  // Handle standards selection from modal
  const handleStandardsSelect = useCallback((selectedStandards) => {
    setAttachedStandards(selectedStandards);
  }, []);

  // Grade percentage validation state
  const [percentValidationError, setPercentValidationError] = useState(null);
  const [percentValidationData, setPercentValidationData] = useState(null);
  const [checkingPercent, setCheckingPercent] = useState(false);
  const [createButtonHovered, setCreateButtonHovered] = useState(false);

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

  // Load academic years when modal opens (for "Counts toward year plan" dropdown)
  useEffect(() => {
    if (!visible || !familyId) {
      setAcademicYears([]);
      setSelectedAcademicYearId(null);
      return;
    }
    let cancelled = false;
    setLoadingAcademicYears(true);
    (async () => {
      const { data, error } = await supabase
        .from('academic_years')
        .select('id, start_date, end_date, year_name')
        .eq('family_id', familyId)
        .order('updated_at', { ascending: false })
        .limit(10);
      if (cancelled) return;
      setLoadingAcademicYears(false);
      if (error) {
        setAcademicYears([]);
        return;
      }
      // One chip per plan: dedupe by date range so we never show both "Max · Cats · ..." and "2026-2026" for the same plan
      const seen = new Set();
      const list = (data || []).filter((ay) => {
        const start = (ay.start_date && String(ay.start_date).slice(0, 10)) || '';
        const end = (ay.end_date && String(ay.end_date).slice(0, 10)) || '';
        const key = `${start}_${end}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setAcademicYears(list);
      // Default to "No plan" (null); do not auto-select first plan
    })();
    return () => { cancelled = true; };
  }, [visible, familyId]);

  // Detect conflicts when date/time/child changes
  useEffect(() => {
    if (!visible || placement !== 'calendar' || allDay || !startTime || assigneeIds.length === 0 || !dueDate) {
      setConflictWarning(null);
      return;
    }

    const checkConflicts = async () => {
      console.log('[TaskCreateModal] Checking for conflicts...', {
        visible,
        placement,
        allDay,
        startTime,
        assigneeIds: assigneeIds.length,
        dueDate: dueDate?.toISOString(),
        familyId,
      });
      try {
        // Parse start and end times
        const baseDate = new Date(dueDate);
        baseDate.setHours(0, 0, 0, 0);
        
        const resolvedStart = applyTimeToDate(baseDate, startTime);
        if (!resolvedStart) {
          setConflictWarning(null);
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
          resolvedEnd = endTime.trim() 
            ? applyTimeToDate(baseDate, endTime)
            : new Date(resolvedStart.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
        }
        
        if (!resolvedEnd || resolvedEnd <= resolvedStart) {
          setConflictWarning(null);
          return;
        }

        let existingEvents = [];
        try {
          existingEvents = await fetchPotentialConflictingEvents(resolvedStart, resolvedEnd, assigneeIds);
        } catch (error) {
          console.error('[TaskCreateModal] Error fetching events for conflict detection:', error);
          setConflictWarning(null);
          return;
        }

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
          setConflictWarning({
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
          setConflictWarning(null);
          // Don't clear suggestedChange if the change was already accepted
          if (!changeAccepted) {
            setSuggestedChange(null);
          }
        }
      } catch (err) {
        console.error('[TaskCreateModal] Error in conflict detection:', err);
        setConflictWarning(null);
      }
    };

    // Debounce conflict detection
    const timeoutId = setTimeout(checkConflicts, 300);
    return () => clearTimeout(timeoutId);
  }, [visible, placement, allDay, startTime, endTime, assigneeIds, dueDate, eventEndDate, eventType, familyId, changeAccepted]);
  
  // Recurring event state
  const [isRecurring, setIsRecurring] = useState(false);
  const [showRecurringSection, setShowRecurringSection] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState('daily'); // 'daily', 'weekly', 'monthly'
  const [recurrenceInterval, setRecurrenceInterval] = useState(null); // Every N days/weeks/months
  const [recurrenceIntervalText, setRecurrenceIntervalText] = useState(''); // Local text state for input
  const [recurrenceEndType, setRecurrenceEndType] = useState('never'); // 'never', 'after', 'on'
  const [recurrenceEndAfter, setRecurrenceEndAfter] = useState(null); // Number of occurrences
  const [recurrenceEndAfterText, setRecurrenceEndAfterText] = useState(''); // Local text state for input
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(null); // End date
  const [recurrenceExcludeWeekends, setRecurrenceExcludeWeekends] = useState(false); // For daily: only weekdays
  
  const toast = useToast();
  const session = useSession();

  // Sync calendar view month when due date changes externally
  useEffect(() => {
    if (!showCalendarPicker) {
      setCalendarViewMonth(dueDate);
    }
  }, [dueDate, showCalendarPicker]);

  // Sync end date calendar view month when recurrence end date changes externally
  useEffect(() => {
    if (!showEndDateCalendarPicker && recurrenceEndDate) {
      setEndDateCalendarViewMonth(new Date(recurrenceEndDate));
    }
  }, [recurrenceEndDate, showEndDateCalendarPicker]);

  // Sync event end date calendar view month when event end date changes externally
  useEffect(() => {
    if (!showEventEndDatePicker && eventEndDate) {
      setEventEndDateCalendarViewMonth(eventEndDate);
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
          setMaterialDropdownPosition(newPosition);
          setMaterialDropdownPositionReady(true);
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
            const newPosition = {
              top: rect.bottom + 4,
              left: rect.left,
              width: Math.max(rect.width, 200),
            };
            setSubjectDropdownPosition(newPosition);
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
    setLoadingMaterials(true);
    try {
      // Load all materials (includes both purchased materials and uploaded files)
      const materialsData = await getMaterials(familyId, {}, session);
      console.log('[TaskCreateModal] Loaded materials:', materialsData?.length || 0);
      
      setMaterials(materialsData || []);
      if (materialsData.length === 0) {
        console.warn('[TaskCreateModal] No materials found for familyId:', familyId);
      }
    } catch (error) {
      console.error('[TaskCreateModal] Failed to load materials:', error);
      toast.push('Failed to load materials from library', 'error');
      setMaterials([]);
    } finally {
      setLoadingMaterials(false);
    }
  }, [familyId, session, toast]);

  // Fetch subjects and subject goals when modal opens (intentionally omit fetchSubjects/loadMaterials from deps to avoid infinite loop)
  useEffect(() => {
    if (visible && familyId) {
      fetchSubjects();
      loadMaterials();
      if (assigneeIds.length > 0) {
        fetchSubjectGoals(assigneeIds[0]); // Fetch goals for first selected child
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, familyId, assigneeIds]);

  // New library items (e.g. syllabus from Edit Subject) should appear in attachment picker while modal is open
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !familyId || !visible) return;
    const onMaterialsRefresh = (e) => {
      const fid = e?.detail?.familyId;
      if (fid && fid !== familyId) return;
      loadMaterials();
    };
    window.addEventListener('refreshMaterials', onMaterialsRefresh);
    return () => window.removeEventListener('refreshMaterials', onMaterialsRefresh);
  }, [familyId, visible, loadMaterials]);

  useEffect(() => {
    if (visible) {
      setTitle(defaultTitle && String(defaultTitle).trim() ? defaultTitle : '');
      setDueDate(defaultDate ?? new Date());
      setEventEndDate(null);
      const resetAssigneeIds =
        Array.isArray(defaultChildIds) && defaultChildIds?.length
          ? defaultChildIds
          : (defaultChildId ? [defaultChildId] : []);
      setAssigneeIds(resetAssigneeIds);
      setNotes('');
      // Labels removed - no longer used
      setPlacement(defaultPlacement || 'calendar'); // Use the prop instead of hardcoded 'calendar'
      setAllDay(false);
      setStartTime(defaultStartTime && String(defaultStartTime).trim() ? defaultStartTime : DEFAULT_START_TIME);
      setEndTime('');
      // Reset new fields
      const initialEventType = defaultEventType === 'Schedule Block' ? 'Scheduled Class Day' : (defaultEventType || 'Lesson');
      setEventType(initialEventType);
      setCountsTowardPlan(['Lesson', 'Project', 'Exam', 'Assignment', 'Activity'].includes(initialEventType));
      setShowRequiresSubmissionHome(
        defaultRequiresSubmissionHomeForEventType(initialEventType === 'Scheduled Class Day' ? 'Lesson' : initialEventType)
      );
      setSelectedMaterialId(null);
      setAttachedMaterialIds([]);
      setAttachedStandards([]);
      setShowStandardsModal(false);
      setSubjectId(defaultSubjectId || null);
      // Expand academic details if defaultSubjectId is provided
      if (defaultSubjectId) {
        setShowAcademicDetails(true);
      }
      setUnit('');
      setGrade('');
      setPercentOfTotalGrade('');
      setLocation('');
      setMode('');
      setInstructor('');
      setGoalLink(null);
      setShowMaterialDropdown(false);
      setSelectedMaterialId(null);
      setShowSubjectDropdown(false);
      setShowGoalDropdown(false);
      // Reset recurring fields
      setIsRecurring(false);
      setShowRecurringSection(false);
      setRecurrenceType('daily');
      setRecurrenceInterval(null);
      setRecurrenceIntervalText('');
      setRecurrenceEndType('never');
      setRecurrenceEndAfter(null);
      setRecurrenceEndAfterText('');
      setRecurrenceEndDate(null);
      // Reset conflict detection state
      setConflictWarning(null);
      setShouldAutoAdjust(false);
      setSuggestedChange(null);
      setChangeAccepted(false);
    }
  }, [visible, defaultDate, defaultChildId, defaultChildIds, defaultPlacement, defaultSubjectId, defaultEventType, defaultStartTime, defaultTitle]);

  const fetchSubjects = async () => {
    if (!familyId) return;
    setLoadingSubjects(true);
    try {
      // If no assignees selected, show no subjects (user must select assignee first)
      if (assigneeIds.length === 0) {
        setSubjects([]);
        setLoadingSubjects(false);
        return;
      }
      
      // First, fetch all subjects to see what we have
      const { data: allSubjects, error: allError } = await supabase
        .from('subject')
        .select('id, name, child_id')
        .eq('family_id', familyId);
      
      if (allError) {
        console.error('Error fetching all subjects:', allError);
        throw allError;
      }
      
      console.log('All subjects for family:', allSubjects);
      console.log('Filtering for assignees:', assigneeIds);
      
      // Filter in JavaScript: Show both family-wide subjects AND child-specific subjects
      // Family-wide subjects (child_id: null) show for all children
      // Child-specific subjects only show for the assigned child
      // Deduplicate by name - if same name exists as both family-wide and child-specific, prefer child-specific
      const subjectMap = new Map();
      
      (allSubjects || []).forEach(subject => {
        const isFamilyWide = subject.child_id === null;
        const isForSelectedChild = subject.child_id !== null && assigneeIds.includes(subject.child_id);
        // Always include the subject matching defaultSubjectId, even if filters would exclude it
        const isDefaultSubject = !!defaultSubjectId && subject.id === defaultSubjectId;
        const shouldInclude = isFamilyWide || isForSelectedChild || isDefaultSubject;
        
        if (shouldInclude) {
          const existing = subjectMap.get(subject.name);
          
          // If no existing entry, add this one
          if (!existing) {
            subjectMap.set(subject.name, subject);
            console.log(`Including subject "${subject.name}" - child_id: ${subject.child_id === null ? 'null (family-wide)' : subject.child_id}`);
          } 
          // If existing is family-wide and this is child-specific, replace it (prefer child-specific)
          else if (existing.child_id === null && subject.child_id !== null) {
            subjectMap.set(subject.name, subject);
            console.log(`Replacing family-wide "${subject.name}" with child-specific version for child ${subject.child_id}`);
          }
          // If existing is child-specific and this is also child-specific, keep existing (already preferred)
          else if (existing.child_id !== null && subject.child_id !== null) {
            // If both are child-specific, prefer:
            // 1) The one matching defaultSubjectId if present
            // 2) Otherwise the one matching the first selected assignee
            const existingIsDefault = !!defaultSubjectId && existing.id === defaultSubjectId;
            const currentIsDefault = !!defaultSubjectId && subject.id === defaultSubjectId;
            
            if (currentIsDefault && !existingIsDefault) {
              subjectMap.set(subject.name, subject);
            } else if (!existingIsDefault && subject.child_id === assigneeIds[0] && existing.child_id !== assigneeIds[0]) {
              subjectMap.set(subject.name, subject);
            } else {
              console.log(`Skipping duplicate child-specific "${subject.name}" for child ${subject.child_id}`);
            }
          }
          // If both are family-wide, keep the first one (already added)
          else if (existing.child_id === null && subject.child_id === null) {
            console.log(`Skipping duplicate family-wide "${subject.name}"`);
          }
        } else {
          console.log(`Excluding subject "${subject.name}" - child_id: ${subject.child_id}, not for selected children`);
        }
      });
      
      const fetchedSubjects = Array.from(subjectMap.values())
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      
      console.log('Filtered and deduplicated subjects:', fetchedSubjects.map(s => `${s.name} (child_id: ${s.child_id === null ? 'null (family-wide)' : s.child_id})`));
      
      console.log('Filtered subjects:', fetchedSubjects, 'for assignees:', assigneeIds);
      setSubjects(fetchedSubjects);
      
      // Clear selected subject if it's no longer valid
      if (subjectId && !fetchedSubjects.find(s => s.id === subjectId)) {
        setSubjectId(null);
      }
    } catch (error) {
      console.error('Error in fetchSubjects:', error);
      setSubjects([]);
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

  // Format time input to enforce "00:00 AM/PM" format in real-time
  const formatTimeInput = (text, previousValue = '') => {
    if (!text) return '';
    
    // Remove all non-numeric characters except colon, space, and A/P/M
    let cleaned = text.replace(/[^0-9:APM\s]/gi, '');
    
    // Check for AM/PM in the original text (case insensitive) - preserve it
    const upperText = text.toUpperCase();
    const hasAM = upperText.includes('AM');
    const hasPM = upperText.includes('PM');
    
    // Extract numbers only
    const numbers = cleaned.replace(/[^0-9]/g, '');
    
    // If empty, return empty (allow clearing)
    if (numbers.length === 0) {
      return '';
    }
    
    // Limit to 4 digits (HHMM)
    const digits = numbers.slice(0, 4);
    
    // Format based on length
    let formatted = '';
    if (digits.length === 1) {
      // Single digit: "1" -> "1"
      formatted = digits;
    } else if (digits.length === 2) {
      // Two digits: "10" -> "10" (hours)
      const num = parseInt(digits, 10);
      if (num > 12) {
        // If > 12, treat as ":10" (minutes)
        formatted = `:${digits}`;
      } else {
        formatted = digits;
      }
    } else if (digits.length === 3) {
      // Three digits: "103" -> "10:3"
      const hours = digits.slice(0, 2);
      const minDigit = digits.slice(2);
      const hoursNum = parseInt(hours, 10);
      if (hoursNum > 12) {
        // Invalid hours, use first digit as hour
        formatted = `${digits[0]}:${digits.slice(1)}`;
      } else {
        formatted = `${hours}:${minDigit}`;
      }
    } else if (digits.length >= 4) {
      // Four digits: "1030" -> "10:30"
      const hours = digits.slice(0, 2);
      const minutes = digits.slice(2, 4);
      const hoursNum = parseInt(hours, 10);
      const minutesNum = parseInt(minutes, 10);
      
      // Validate hours (1-12)
      let validHours = hours;
      if (hoursNum > 12) {
        // Use first digit as hour if second makes it > 12
        validHours = hours[0];
        formatted = `${validHours}:${minutes}`;
      } else if (hoursNum === 0) {
        validHours = '12';
        formatted = `${validHours}:${minutes}`;
      } else {
        // Validate minutes (0-59)
        const validMinutes = minutesNum > 59 ? '59' : minutes;
        formatted = `${validHours}:${validMinutes}`;
      }
    }
    
    // Add AM/PM - always add when we have a complete time
    let period = '';
    if (hasPM) {
      period = ' PM';
    } else if (hasAM) {
      period = ' AM';
    } else if (formatted.includes(':') && formatted.length >= 4) {
      // Auto-add AM/PM when we have complete time format (HH:MM)
      const parts = formatted.split(':');
      if (parts.length === 2 && parts[1].length === 2) {
        // Complete time format, default to AM
        period = ' AM';
      }
    }
    
    return formatted + period;
  };

  const parseTimeString = (timeStr) => {
    if (!timeStr) return null;
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();

    if (hours === 0 || hours > 12 || minutes < 0 || minutes > 59) {
      return null;
    }

    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

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
    async ({ title, startDate, endDate, childIds, eventType, minutes, recurrenceRule }) => {
      const insertPayload = {
        family_id: familyId,
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
        event_type: (eventType === 'Scheduled Class Day' ? 'Schedule Block' : eventType) || 'Lesson',
        subject_id: subjectId || null,
        unit: unit.trim() || null,
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
    [attachedMaterialIds, familyId, goalLink, grade, instructor, location, mode, notes, subjectId, unit]
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

  // Validation function
  const validateFields = () => {
    const errors = {};
    
    if (!title.trim()) {
      errors.title = 'Title is required';
    }
    
    if (!dueDate) {
      errors.date = 'Date is required';
    }
    
    // End date is required for multi-day event types (Project, Trip, Holiday, Other)
    const isMultiDayEventType = eventType && ['Project', 'Trip', 'Holiday', 'Other'].includes(eventType);
    if (isMultiDayEventType && placement === 'calendar' && !eventEndDate) {
      errors.endDate = 'End date is required for ' + eventType + ' events';
    }
    if (isMultiDayEventType && eventEndDate && dueDate) {
      // Compare dates only (ignore time)
      const startDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      const endDateOnly = new Date(eventEndDate.getFullYear(), eventEndDate.getMonth(), eventEndDate.getDate());
      if (endDateOnly < startDateOnly) {
        errors.endDate = 'End date must be on or after start date';
      }
    }
    
    // Time is required if calendar placement and not all day
    if (placement === 'calendar' && !allDay && !startTime.trim()) {
      errors.time = 'Start time is required';
    }
    
    if (!eventType) {
      errors.eventType = 'Event type is required';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Check if form is valid (for button disabled state)
  const isFormValid = () => {
    if (!title.trim()) return false;
    if (assigneeIds.length === 0) return false;
    if (!dueDate) return false;
    if (placement === 'calendar' && !allDay && !startTime.trim()) return false;
    if (!eventType) return false;
    return true;
  };

  const handleCreate = async (skipConflictValidation = false, allowOverlaps = false) => {
    // Always validate required fields, but skip conflict validation if skipConflictValidation is true
    // (since we're showing a conflict warning and user explicitly chose to proceed)
    if (!skipConflictValidation && !validateFields()) {
      toast.push('Please fill in all required fields', 'error');
      return;
    }
    
    // Still check basic required fields even when skipping conflict validation
    if (!title.trim() || !dueDate || assigneeIds.length === 0 || !eventType) {
      toast.push('Please fill in all required fields', 'error');
      return;
    }

    // Only require one assignee when attaching to a specific plan; "No plan" allows multiple children.
    if (countsTowardPlan && selectedAcademicYearId != null && assigneeIds.length > 1) {
      toast.push('Choose one child when adding this event to a plan.', 'error');
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
      const isMultiDayEventType = eventType && ['Project', 'Trip', 'Holiday', 'Other'].includes(eventType);

      // Parse list_id to extract child_id if it's a child list
      const childIds = assigneeIds.length > 0 ? assigneeIds : null;
      const childId = assigneeIds.length > 0 ? assigneeIds[0] : null; // For backward compatibility

      let data;
      let error;

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
          _event_type: (eventType === 'Scheduled Class Day' ? 'Schedule Block' : eventType) || 'Lesson', // Default to "Lesson" if somehow empty
          _subject_id: subjectId || null,
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
        const eventEndDateToUse = isMultiDayEventType && eventEndDate ? eventEndDate : dueDate;

        // Calculate start_ts and end_ts from due date and selected time
        const baseDate = new Date(dueDate);
        baseDate.setHours(0, 0, 0, 0);

        let startDate;
        let endDate;

        if (allDay) {
          startDate = new Date(baseDate);
          endDate = new Date(baseDate);
          endDate.setHours(23, 59, 0, 0);
        } else {
          const resolvedStart = applyTimeToDate(baseDate, startTime);
          if (!resolvedStart) {
            toast.push('Enter a valid start time, e.g. 9:00 AM', 'error');
            setSubmitting(false);
            return;
          }
          startDate = resolvedStart;

          // For multi-day event types with an end date, use the end date
          if (isMultiDayEventType && eventEndDate) {
            // Set end date to end of the selected day (23:59:59.999)
            const endDateYear = eventEndDate.getFullYear();
            const endDateMonth = eventEndDate.getMonth();
            const endDateDay = eventEndDate.getDate();
            endDate = new Date(endDateYear, endDateMonth, endDateDay, 23, 59, 59, 999);
            console.log('[TaskCreateModal] Multi-day event with end date:', {
              eventType,
              eventEndDate: eventEndDate.toISOString(),
              endDate: endDate.toISOString(),
              startDate: startDate.toISOString()
            });
          } else if (endTime.trim()) {
            let resolvedEnd = applyTimeToDate(baseDate, endTime);
            if (!resolvedEnd) {
              toast.push('Enter a valid end time, e.g. 10:00 AM', 'error');
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

        // Calculate minutes from duration
        const minutes = calculateMinutes(startDate, endDate);

        // Build recurrence rule if recurring
        let recurrenceRule = null;
        if (isRecurring && placement === 'calendar') {
          // Use interval of 1 if not specified
          const interval = recurrenceInterval || 1;
          
          const rule = {
            frequency: recurrenceType.toUpperCase(), // DAILY, WEEKLY, MONTHLY
            interval: interval,
          };
          if (recurrenceType === 'daily' && recurrenceExcludeWeekends) {
            rule.exclude_weekends = true;
          }
          if (recurrenceEndType === 'after') {
            // Parse from text if state is null (user might not have blurred the field)
            const countValue = recurrenceEndAfter || (recurrenceEndAfterText ? parseInt(recurrenceEndAfterText, 10) : null);
            if (countValue && !isNaN(countValue) && countValue > 0) {
              rule.count = countValue;
            }
          } else if (recurrenceEndType === 'on' && recurrenceEndDate) {
            rule.until = recurrenceEndDate.toISOString().split('T')[0]; // YYYY-MM-DD
          }
          // If 'never', no end condition
          
          recurrenceRule = rule;
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
              const resolvedStart = applyTimeToDate(dayStart, startTime);
              if (resolvedStart) {
                dayStart.setTime(resolvedStart.getTime());
              }
            }

            const dayEnd = new Date(currentDay);
            if (allDay) {
              dayEnd.setHours(23, 59, 0, 0);
            } else {
              if (endTime.trim()) {
                const resolvedEnd = applyTimeToDate(dayEnd, endTime);
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
              _is_flexible: allDay,
              _event_type: (eventType === 'Scheduled Class Day' ? 'Schedule Block' : eventType) || 'Lesson',
              _subject_id: subjectId || null,
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
          // Use RPC function to bypass RLS issues
          const rpcParams = {
            _family_id: userFamilyId,
            _child_id: childId,
            _child_ids: childIds,
            _title: title.trim(),
            _start_ts: startDate.toISOString(),
            _description: notes.trim() || null,
            _end_ts: endDate?.toISOString(),
            _status: 'scheduled',
            _source: 'manual',
            _tags: null,
            _is_flexible: allDay,
            _event_type: (eventType === 'Scheduled Class Day' ? 'Schedule Block' : eventType) || 'Lesson', // Default to "Lesson" if somehow empty
            _subject_id: subjectId || null,
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
            _recurrence_rule: recurrenceRule ? JSON.stringify(recurrenceRule) : null,
          };
          
          // Only include _allow_overlaps if we need to allow overlaps (backward compatibility)
          if (shouldAllowOverlaps && createTaskEventAllowOverlapsSupported) {
            rpcParams._allow_overlaps = true;
            console.log('[TaskCreateModal] Allowing overlaps - _allow_overlaps=true, shouldAllowOverlaps=', shouldAllowOverlaps);
          }
          
          console.log('[TaskCreateModal] Calling create_task_event with params:', { ...rpcParams, _tags: rpcParams._tags?.length || 0 });
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
            }
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
              let resolvedStart = applyTimeToDate(baseDate, startTime) || baseDate;
              
              let resolvedEnd;
              if (isMultiDayEventType && eventEndDate) {
                const endDateYear = eventEndDate.getFullYear();
                const endDateMonth = eventEndDate.getMonth();
                const endDateDay = eventEndDate.getDate();
                resolvedEnd = new Date(endDateYear, endDateMonth, endDateDay, 23, 59, 59, 999);
              } else if (endTime.trim()) {
                resolvedEnd = applyTimeToDate(baseDate, endTime) || new Date(resolvedStart.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
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
          let resolvedStart = applyTimeToDate(baseDate, startTime) || baseDate;
          
          let resolvedEnd;
          if (isMultiDayEventType && eventEndDate) {
            const endDateYear = eventEndDate.getFullYear();
            const endDateMonth = eventEndDate.getMonth();
            const endDateDay = eventEndDate.getDate();
            resolvedEnd = new Date(endDateYear, endDateMonth, endDateDay, 23, 59, 59, 999);
          } else if (endTime.trim()) {
            resolvedEnd = applyTimeToDate(baseDate, endTime) || new Date(resolvedStart.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
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

      // Persist instructional fields and/or requires_submission_home after create (RPC may omit some columns)
      if (data?.id) {
        const mins = instructionalMinutesOverride.trim() ? parseInt(instructionalMinutesOverride.trim(), 10) : null;
        const updatePayload = {
          requires_submission_home: showRequiresSubmissionHome,
        };
        if (countsTowardPlan && placement === 'calendar') {
          updatePayload.academic_year_id = selectedAcademicYearId || null;
          updatePayload.counts_toward_plan = true;
          updatePayload.instructional_status = 'MANUAL_COUNTS';
          updatePayload.instructional_minutes = (mins != null && !Number.isNaN(mins)) ? mins : null;
        }
        await supabase
          .from('events')
          .update(updatePayload)
          .eq('id', data.id)
          .then(({ error: updateErr }) => {
            if (updateErr) {
              console.warn('[TaskCreateModal] Failed to patch event after create:', updateErr);
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
            subjectId
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

      toast.push(placement === 'backlog' ? 'Backlog task created' : 'Task created successfully', 'success');
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
        if (subjectId) {
          window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId } }));
        }
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: refreshDetail }));
      }
      
      // If "Adjust automatically" was selected, open Quick Reschedule after closing modal
      if (shouldAutoAdjust && data?.id && conflictWarning) {
      onClose();
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
        onClose();
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
      onRequestClose={onClose}
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
              onClose();
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
          onStartShouldSetResponder={() => true}
          onResponderGrant={() => {
            // Prevent clicks inside modal from closing it
          }}
        >
          {/* Title input */}
          <View style={styles.header}>
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.fieldLabel}>
                Name <Text style={{ color: '#ef4444' }}>*</Text>
              </Text>
            </View>
            <TextInput
              placeholder="Event name"
              placeholderTextColor={MUTED}
              value={title}
              onChangeText={(text) => {
                setTitle(text);
                if (validationErrors.title) {
                  setValidationErrors({ ...validationErrors, title: null });
                }
              }}
              style={[
                styles.titleInput,
                validationErrors.title && styles.inputError,
              ]}
              autoFocus
            />
            {validationErrors.title && (
              <Text style={styles.errorText}>{validationErrors.title}</Text>
            )}
          </View>

          {/* Scrollable Content */}
          <ScrollView 
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
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
          {/* Event Type - at top above Schedule on calendar/backlog */}
          <SafeFieldRow style={[styles.fieldRow, { marginTop: 20, marginBottom: 12 }]}>
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
                      setEventType(type);
                      setCountsTowardPlan(['Lesson', 'Project', 'Exam', 'Assignment', 'Activity'].includes(type));
                      setShowRequiresSubmissionHome(defaultRequiresSubmissionHomeForEventType(type));
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

          {/* Placement toggle */}
          <View style={styles.modeToggle}>
            {[
              { key: 'calendar', label: 'Schedule on calendar' },
              { key: 'backlog', label: 'Add to backlog' },
            ].map((option) => (
              <TouchableOpacity
                key={option.key}
                onPress={() => {
                  setPlacement(option.key);
                  // Clear time validation error when switching to backlog (time not required)
                  if (option.key === 'backlog' && validationErrors.time) {
                    setValidationErrors({ ...validationErrors, time: null });
                  }
                }}
                style={[
                  styles.modeOption,
                  placement === option.key && styles.modeOptionActive,
                ]}
              >
                <Text
                  style={[
                    styles.modeOptionText,
                    placement === option.key && styles.modeOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {placement === 'backlog' && (
            <View style={styles.modeInfo}>
              <Text style={styles.modeInfoText}>
                Backlog tasks stay off the calendar until you schedule them.
              </Text>
            </View>
          )}

          {/* Chip Row */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            style={{ marginBottom: 0 }}
          >
            {/* Date picker - single date or date range based on event type */}
            {placement === 'calendar' && (() => {
              const isMultiDayEvent = false; // No multi-day events in new system
              
              if (isMultiDayEvent) {
                // Start date picker for multi-day events
                return (
                  <View style={styles.chip}>
                    <Text style={[styles.chipLabel, { marginRight: 8 }]}>Start:</Text>
                    <TouchableOpacity onPress={() => setDueDate(addDays(dueDate, -1))}>
                      <ChevronLeft size={16} color={FG} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => {
                        setCalendarViewMonth(dueDate);
                        setShowCalendarPicker(true);
                      }}
                      style={{ flex: 1, paddingHorizontal: 8 }}
                    >
                      <Text style={styles.chipText}>{fmt(dueDate)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDueDate(addDays(dueDate, +1))}>
                      <ChevronRight size={16} color={FG} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDueDate(new Date())} style={styles.todayButton}>
                      <Text style={styles.todayText}>Today</Text>
                    </TouchableOpacity>
                  </View>
                );
              } else {
                // Single date picker for regular events
                return (
                  <View style={styles.chip}>
                    {eventType === 'Project' && (
                      <Text style={[styles.chipLabel, { marginRight: 8 }]}>Start:</Text>
                    )}
                    <TouchableOpacity 
                      onPress={() => setDueDate(addDays(dueDate, -1))}
                      style={eventType === 'Project' ? { marginLeft: 4 } : {}}
                    >
                      <ChevronLeft size={16} color={FG} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => {
                        setCalendarViewMonth(dueDate);
                        setShowCalendarPicker(true);
                      }}
                      style={{ flex: 1, paddingHorizontal: 8 }}
                    >
                      <Text style={styles.chipText}>{fmt(dueDate)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDueDate(addDays(dueDate, +1))}>
                      <ChevronRight size={16} color={FG} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDueDate(new Date())} style={styles.todayButton}>
                      <Text style={styles.todayText}>Today</Text>
                    </TouchableOpacity>
                  </View>
                );
              }
            })()}

            {/* Assignee chip */}
            {familyMembers.length > 0 && (
              <View style={styles.chip}>
                <View>
                  <Text style={styles.chipLabel}>Assignee <Text style={{ color: '#ef4444' }}>*</Text></Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  {familyMembers.map((m) => {
                    const isSelected = assigneeIds.includes(m.id);
                    return (
                      <TouchableOpacity
                        key={m.id}
                        onPress={() => {
                          if (isSelected) {
                            setAssigneeIds(assigneeIds.filter(id => id !== m.id));
                          } else {
                            setAssigneeIds([...assigneeIds, m.id]);
                          }
                        }}
                        style={[
                          styles.chipOption,
                          isSelected && styles.chipOptionActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipOptionText,
                            isSelected && styles.chipOptionTextActive,
                          ]}
                        >
                          {m.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Labels chip */}
            {/* Labels section removed - no longer used */}
          </ScrollView>

          {/* End date picker - shown below start date for multi-day events */}
          {placement === 'calendar' && ['Trip', 'Holiday', 'Project', 'Other'].includes(eventType) && (
            <View style={{ marginTop: 8, marginBottom: 8, paddingHorizontal: 0 }}>
              <View style={[styles.chip, { alignSelf: 'flex-start', marginRight: 0 }]}>
                <Text style={[styles.chipLabel, { marginRight: 8 }]}>End:</Text>
                <TouchableOpacity 
                  onPress={() => eventEndDate && setEventEndDate(addDays(eventEndDate, -1))}
                  style={{ marginLeft: 8 }}
                >
                  <ChevronLeft size={16} color={FG} />
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => {
                    if (eventEndDate) {
                      setEventEndDateCalendarViewMonth(eventEndDate);
                    } else {
                      const defaultEnd = new Date(dueDate);
                      defaultEnd.setDate(defaultEnd.getDate() + 1);
                      setEventEndDateCalendarViewMonth(defaultEnd);
                    }
                    setShowEventEndDatePicker(true);
                    if (validationErrors.endDate) {
                      setValidationErrors({ ...validationErrors, endDate: null });
                    }
                  }}
                  style={[
                    { flex: 1, paddingHorizontal: 8 },
                    validationErrors.endDate && { borderColor: '#ef4444', borderWidth: 1, borderRadius: 4 }
                  ]}
                >
                  <Text style={[
                    styles.chipText,
                    validationErrors.endDate && { color: '#ef4444' }
                  ]}>
                    {eventEndDate ? fmt(eventEndDate) : 'Select end date'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => eventEndDate && setEventEndDate(addDays(eventEndDate, +1))}>
                  <ChevronRight size={16} color={FG} />
                </TouchableOpacity>
                {eventType === 'Project' ? (
                  <TouchableOpacity 
                    onPress={() => {
                      const today = new Date();
                      setEventEndDate(today);
                    }} 
                    style={styles.todayButton}
                  >
                    <Text style={styles.todayText}>Today</Text>
                  </TouchableOpacity>
                ) : (
                  eventEndDate && (
                    <TouchableOpacity onPress={() => {
                      const defaultEnd = new Date(dueDate);
                      defaultEnd.setDate(defaultEnd.getDate() + 1);
                      setEventEndDate(defaultEnd);
                    }} style={styles.todayButton}>
                      <Text style={styles.todayText}>+1 day</Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
              {validationErrors.endDate && (
                <Text style={styles.errorTextSmall}>{validationErrors.endDate}</Text>
              )}
            </View>
          )}

          <SafeView>
            {placement === 'calendar' && (
              <View style={styles.timeSection}>
                <View style={styles.timeToggleRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.sectionLabel}>Schedule time <Text style={{ color: '#ef4444' }}>*</Text></Text>
                  </View>
                  <View style={styles.timeToggleControls}>
                    <View style={styles.allDayControl}>
                      <Text style={styles.allDayLabel}>All day</Text>
                      <Switch
                        value={allDay}
                        onValueChange={(value) => {
                          setAllDay(value);
                          if (value) {
                            setStartTime('');
                            setEndTime('');
                            // Clear time validation error when switching to all day
                            if (validationErrors.time) {
                              setValidationErrors({ ...validationErrors, time: null });
                            }
                          } else {
                            setStartTime(DEFAULT_START_TIME);
                            setEndTime('');
                          }
                        }}
                        trackColor={{ false: BORDER, true: '#AECBFA' }}
                        thumbColor={allDay ? '#45A29E' : '#f9fafb'}
                      />
                    </View>
                    <View style={styles.allDayControl}>
                      <Text style={styles.allDayLabel}>Recurring</Text>
                      <Switch
                        value={isRecurring}
                        onValueChange={(value) => {
                          setIsRecurring(value);
                        }}
                        trackColor={{ false: BORDER, true: '#AECBFA' }}
                        thumbColor={isRecurring ? '#45A29E' : '#f9fafb'}
                      />
                    </View>
                  </View>
                </View>
                {!allDay && (
                  <View style={styles.timeInputsRow}>
                    <View style={styles.timeField}>
                      <Text style={styles.timeLabel}>Start</Text>
                      {Platform.OS === 'web' ? (
                        <input
                          type="time"
                          value={startTime ? (() => {
                            // Convert "9:00 AM" to "09:00" format
                            const parts = parseTimeString(startTime);
                            if (parts) {
                              return `${parts.hours.toString().padStart(2, '0')}:${parts.minutes.toString().padStart(2, '0')}`;
                            }
                            return '';
                          })() : ''}
                          onChange={(e) => {
                            // Convert "09:00" to "9:00 AM" format
                            const [hours, minutes] = e.target.value.split(':').map(Number);
                            if (!isNaN(hours) && !isNaN(minutes)) {
                              const hour12 = hours % 12 || 12;
                              const period = hours >= 12 ? 'PM' : 'AM';
                              const formatted = `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
                              setStartTime(formatted);
                              if (validationErrors.time) {
                                setValidationErrors({ ...validationErrors, time: null });
                              }
                            }
                          }}
                          style={{
                            backgroundColor: '#ffffff',
                            borderRadius: 10,
                            paddingTop: 10,
                            paddingBottom: 10,
                            paddingLeft: 12,
                            paddingRight: 12,
                            borderWidth: 1,
                            borderColor: validationErrors.time ? '#ef4444' : BORDER,
                            borderStyle: 'solid',
                            fontSize: 14,
                            color: FG,
                            width: '100%',
                            maxWidth: 100,
                            height: 'auto',
                            outline: 'none',
                            ...(validationErrors.time && {
                              borderColor: '#ef4444',
                            }),
                          }}
                        />
                      ) : (
                        <TextInput
                          placeholder="e.g. 9:00 AM"
                          placeholderTextColor={MUTED}
                          value={startTime}
                          onChangeText={(text) => {
                            const formatted = formatTimeInput(text, startTime);
                            setStartTime(formatted);
                            if (validationErrors.time) {
                              setValidationErrors({ ...validationErrors, time: null });
                            }
                          }}
                          style={[
                            styles.timeInput,
                            validationErrors.time && styles.inputError,
                          ]}
                          autoCapitalize="characters"
                        />
                      )}
                      {validationErrors.time && (
                        <Text style={styles.errorTextSmall}>{validationErrors.time}</Text>
                      )}
                    </View>
                    <View style={styles.timeField}>
                      <Text style={styles.timeLabel}>End</Text>
                      {Platform.OS === 'web' ? (
                        <input
                          type="time"
                          value={endTime ? (() => {
                            // Convert "10:00 AM" to "10:00" format
                            const parts = parseTimeString(endTime);
                            if (parts) {
                              return `${parts.hours.toString().padStart(2, '0')}:${parts.minutes.toString().padStart(2, '0')}`;
                            }
                            return '';
                          })() : ''}
                          onChange={(e) => {
                            // Convert "10:00" to "10:00 AM" format
                            const [hours, minutes] = e.target.value.split(':').map(Number);
                            if (!isNaN(hours) && !isNaN(minutes)) {
                              const hour12 = hours % 12 || 12;
                              const period = hours >= 12 ? 'PM' : 'AM';
                              const formatted = `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
                              setEndTime(formatted);
                            }
                          }}
                          style={{
                            backgroundColor: '#ffffff',
                            borderRadius: 10,
                            paddingTop: 10,
                            paddingBottom: 10,
                            paddingLeft: 12,
                            paddingRight: 12,
                            borderWidth: 1,
                            borderColor: BORDER,
                            borderStyle: 'solid',
                            fontSize: 14,
                            color: FG,
                            width: '100%',
                            maxWidth: 100,
                            height: 'auto',
                            outline: 'none',
                          }}
                        />
                      ) : (
                        <TextInput
                          placeholder="Optional"
                          placeholderTextColor={MUTED}
                          value={endTime}
                          onChangeText={(text) => {
                            const formatted = formatTimeInput(text, endTime);
                            setEndTime(formatted);
                          }}
                          style={styles.timeInput}
                          autoCapitalize="characters"
                        />
                      )}
                    </View>
                  </View>
                )}
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
                                const resolvedStart = applyTimeToDate(baseDate, startTime);
                                const resolvedEnd = endTime.trim() 
                                  ? applyTimeToDate(baseDate, endTime)
                                  : new Date(resolvedStart.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
                                
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
                              handleCreate(true, true); // Skip validation AND allow overlaps - user explicitly wants to save despite conflict
                            }}
                            style={cb.ghostButton}
                          >
                            <Text style={cb.ghostButtonText}>Save anyway</Text>
                          </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ) : null}
                {isRecurring && (
                  <View style={styles.recurringSectionContent}>
                    {/* Repeat and Every in one row */}
                    <View style={{ marginBottom: 16, flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fieldLabel, { marginBottom: 8, fontSize: 13 }]}>Repeat</Text>
                        <ChipRow style={styles.dropdownRow}>
                          {['daily', 'weekly', 'monthly'].map((type) => (
                            <TouchableOpacity
                              key={type}
                              onPress={() => setRecurrenceType(type)}
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
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fieldLabel, { marginBottom: 8, fontSize: 13 }]}>Every</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <TextInput
                            style={[styles.input, { width: 60, textAlign: 'center', marginBottom: 0, paddingVertical: 6, paddingHorizontal: 12, height: 'auto' }]}
                            value={recurrenceIntervalText}
                            onChangeText={(text) => {
                              // Allow any numeric input for free editing
                              if (text === '' || /^\d+$/.test(text)) {
                                setRecurrenceIntervalText(text);
                                const num = parseInt(text, 10);
                                if (!isNaN(num) && num > 0) {
                                  setRecurrenceInterval(num);
                                }
                              }
                              // If invalid (like "0" or non-numeric), don't update state
                              // This allows user to clear and type new number
                            }}
                            onBlur={() => {
                              // Validate on blur - clear if invalid, otherwise set the value
                              const num = parseInt(recurrenceIntervalText, 10);
                              if (isNaN(num) || num <= 0) {
                                setRecurrenceIntervalText('');
                                setRecurrenceInterval(null);
                              } else {
                                setRecurrenceIntervalText(num.toString());
                                setRecurrenceInterval(num);
                              }
                            }}
                            keyboardType="numeric"
                          />
                          <Text style={{ color: SUB, fontSize: 13 }}>
                            {recurrenceType === 'daily' ? 'day(s)' : recurrenceType === 'weekly' ? 'week(s)' : 'month(s)'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    
                    {/* Ends and Number of occurrences/End date in one row */}
                    <View style={{ marginBottom: 16, flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fieldLabel, { marginBottom: 8, fontSize: 13 }]}>Ends</Text>
                        <ChipRow style={styles.dropdownRow}>
                          {['never', 'after', 'on'].map((endType) => (
                            <TouchableOpacity
                              key={endType}
                              onPress={() => setRecurrenceEndType(endType)}
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
                                {endType === 'never' ? 'Never' : endType === 'after' ? 'After' : 'On date'}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ChipRow>
                      </View>
                      {recurrenceEndType === 'after' && (
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.fieldLabel, { marginBottom: 8, fontSize: 13 }]}>Number of occurrences</Text>
                          <TextInput
                            style={[styles.input, { width: 100, marginBottom: 0, paddingVertical: 6, paddingHorizontal: 12, height: 'auto' }]}
                            value={recurrenceEndAfterText}
                            onChangeText={(text) => {
                              // Allow any numeric input for free editing
                              if (text === '' || /^\d+$/.test(text)) {
                                setRecurrenceEndAfterText(text);
                                const num = parseInt(text, 10);
                                if (!isNaN(num) && num > 0) {
                                  setRecurrenceEndAfter(num);
                                }
                              }
                            }}
                            onBlur={() => {
                              // Validate on blur - clear if invalid, otherwise set the value
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
                          />
                        </View>
                      )}
                      {recurrenceEndType === 'on' && (
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.fieldLabel, { marginBottom: 8, fontSize: 13 }]}>End date</Text>
                          <TouchableOpacity
                            style={[styles.input, { marginBottom: 0, paddingVertical: 6, paddingHorizontal: 12, height: 'auto' }]}
                            onPress={() => {
                              // Initialize calendar view month to current end date or 30 days from start
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
                            <Text style={{ color: recurrenceEndDate ? FG : MUTED }}>
                              {recurrenceEndDate ? fmt(recurrenceEndDate) : 'Select end date'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    {recurrenceType === 'daily' && (
                      <View style={{ marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <TouchableOpacity
                          onPress={() => setRecurrenceExcludeWeekends((v) => !v)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                        >
                          <View style={[styles.checkbox, recurrenceExcludeWeekends && styles.checkboxChecked]}>
                            {recurrenceExcludeWeekends ? <Check size={14} color="#fff" /> : null}
                          </View>
                          <Text style={{ fontSize: 14, color: FG }}>Exclude weekends</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}
          </SafeView>

            {/* Logistic Details Section */}
            <SafeView style={styles.academicSection}>
              <TouchableOpacity
                onPress={() => setShowLogisticDetails(!showLogisticDetails)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 4,
                }}
              >
                <Text style={styles.sectionLabel}>Logistical details</Text>
                {showLogisticDetails ? (
                  <ChevronUp size={20} color={MUTED} />
                ) : (
                  <ChevronDown size={20} color={MUTED} />
                )}
              </TouchableOpacity>
              {showLogisticDetails && (
                <>
                  <SafeFieldRow style={styles.fieldRow}>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Location (optional)</Text>
                      <TextInput
                        placeholder="e.g. Library, Park, etc."
                        placeholderTextColor={MUTED}
                        value={location}
                        onChangeText={setLocation}
                        style={styles.input}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Mode (optional)</Text>
                      <SafeView style={styles.dropdownContainer}>
                        <ChipRow style={styles.dropdownRow}>{MODE_OPTIONS.map((m) => (
                            <TouchableOpacity
                              key={m}
                              onPress={() => setMode(mode === m ? '' : m)}
                              style={[
                                styles.dropdownOption,
                                mode === m && styles.dropdownOptionActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.dropdownOptionText,
                                  mode === m && styles.dropdownOptionTextActive,
                                ]}
                              >
                                {m.charAt(0).toUpperCase() + m.slice(1)}
                              </Text>
                            </TouchableOpacity>
                          ))}</ChipRow>
                      </SafeView>
                    </View>
                  </SafeFieldRow>
                  <SafeFieldRow style={styles.fieldRow}>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Instructor / Host (optional)</Text>
                      <TextInput
                        placeholder="e.g. Elisa"
                        placeholderTextColor={MUTED}
                        value={instructor}
                        onChangeText={setInstructor}
                        style={styles.input}
                      />
                    </View>
                  </SafeFieldRow>
                </>
            )}
          </SafeView>

            {/* Academic Details Section - after Schedule time */}
            <SafeView style={styles.academicSection}>
              <TouchableOpacity
                onPress={() => setShowAcademicDetails(!showAcademicDetails)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 4,
                }}
              >
                <Text style={styles.sectionLabel}>Academic Details</Text>
                {showAcademicDetails ? (
                  <ChevronUp size={20} color={MUTED} />
                ) : (
                  <ChevronDown size={20} color={MUTED} />
                )}
              </TouchableOpacity>
              {showAcademicDetails && (
                <>
              {/* Count this as instructional time + plan (was below Event Type; lives in Academic Details) */}
              {placement === 'calendar' &&
                ['Lesson', 'Project', 'Exam', 'Assignment', 'Activity', 'Appointment'].includes(eventType) && (
                <View style={[styles.inputGroup, { marginTop: 0, marginBottom: 12 }]}>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 12,
                      marginBottom: 8,
                    }}
                  >
                    {['Lesson', 'Project', 'Exam', 'Assignment', 'Activity'].includes(eventType) && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexGrow: 1, flexShrink: 1, minWidth: 220 }}>
                        <Text style={{ fontSize: 14, color: SUB, marginRight: 8, flexShrink: 1 }}>Count this as instructional time</Text>
                        <Switch
                          value={countsTowardPlan}
                          onValueChange={setCountsTowardPlan}
                          trackColor={{ false: BORDER, true: '#AECBFA' }}
                          thumbColor={countsTowardPlan ? '#45A29E' : '#f9fafb'}
                        />
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexGrow: 1, flexShrink: 1, minWidth: 220 }}>
                      <Text style={{ fontSize: 14, color: SUB, marginRight: 8, flexShrink: 1 }} numberOfLines={2}>
                        Show in student home as &apos;Requires Submission&apos;
                      </Text>
                      <Switch
                        value={showRequiresSubmissionHome}
                        onValueChange={setShowRequiresSubmissionHome}
                        trackColor={{ false: BORDER, true: '#AECBFA' }}
                        thumbColor={showRequiresSubmissionHome ? '#45A29E' : '#f9fafb'}
                      />
                    </View>
                  </View>
                  {countsTowardPlan && (
                    <>
                      {loadingAcademicYears ? (
                        <Text style={{ fontSize: 13, color: MUTED }}>Loading plans…</Text>
                      ) : (
                        <>
                          <Text style={[styles.fieldLabel, { marginTop: 4, fontSize: 14, color: SUB, fontWeight: '400' }]}>Add to plan? (optional)</Text>
                          <Text
                            style={{
                              fontSize: 12,
                              color: MUTED,
                              marginTop: 2,
                              marginBottom: 6,
                              lineHeight: 17,
                              ...(Platform.OS === 'web' && { fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
                            }}
                          >
                            New plans can be added from Build plan in the right toolbar.
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                            <TouchableOpacity
                              onPress={() => setSelectedAcademicYearId(null)}
                              style={[
                                styles.chipOption,
                                selectedAcademicYearId === null && styles.chipOptionActive,
                              ]}
                            >
                              <Text style={[styles.chipOptionText, selectedAcademicYearId === null && styles.chipOptionTextActive]}>
                                No plan
                              </Text>
                            </TouchableOpacity>
                            {(() => {
                              const baseLabels = academicYears.map((ay) => {
                                const start = ay.start_date ? ay.start_date.slice(0, 10) : '';
                                const end = ay.end_date ? ay.end_date.slice(0, 10) : '';
                                if (ay.year_name && String(ay.year_name).trim()) {
                                  return String(ay.year_name).trim();
                                }
                                return start && end ? `${start.slice(0, 4)}–${end.slice(2, 4)}` : ay.id?.slice(0, 8) || 'Plan';
                              });
                              const labelCounts = {};
                              baseLabels.forEach((l) => { labelCounts[l] = (labelCounts[l] || 0) + 1; });
                              return academicYears.map((ay, idx) => {
                                const start = ay.start_date ? ay.start_date.slice(0, 10) : '';
                                const end = ay.end_date ? ay.end_date.slice(0, 10) : '';
                                let base = ay.year_name && String(ay.year_name).trim()
                                  ? String(ay.year_name).trim()
                                  : (start && end ? `${start.slice(0, 4)}–${end.slice(2, 4)}` : ay.id?.slice(0, 8) || 'Plan');
                                const needsDisambiguator = labelCounts[base] > 1;
                                const monthRange = start && end
                                  ? `${parseInt(start.slice(5, 7), 10)}/${start.slice(2, 4)}–${parseInt(end.slice(5, 7), 10)}/${end.slice(2, 4)}`
                                  : '';
                                const label = needsDisambiguator && monthRange ? `${base} (${monthRange})` : base;
                                const isSelected = selectedAcademicYearId === ay.id;
                                return (
                                  <TouchableOpacity
                                    key={ay.id}
                                    onPress={() => setSelectedAcademicYearId(ay.id)}
                                    style={[
                                      styles.chipOption,
                                      isSelected && styles.chipOptionActive,
                                    ]}
                                  >
                                    <Text style={[styles.chipOptionText, isSelected && styles.chipOptionTextActive]}>
                                      {label}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              });
                            })()}
                          </View>
                        </>
                      )}
                    </>
                  )}
                </View>
              )}
              {/* Subject, Unit, Grade - always visible */}
              <SafeFieldRow style={styles.fieldRow}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Subject (optional)</Text>
                  <View style={styles.selectContainer}>
                    <TouchableOpacity
                      ref={subjectButtonRef}
                      style={[styles.select, assigneeIds.length === 0 && { opacity: 0.6 }]}
                      onPress={() => {
                        if (assigneeIds.length > 0) {
                          setShowSubjectDropdown(!showSubjectDropdown);
                        }
                      }}
                      disabled={assigneeIds.length === 0}
                    >
                      <Text style={[styles.selectText, (!subjectId || assigneeIds.length === 0) && styles.selectPlaceholder]}>
                        {assigneeIds.length === 0 
                          ? 'Select Assignee first' 
                          : subjectId 
                            ? subjects.find(s => s.id === subjectId)?.name || 'Select...' 
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
                            marginTop: 4,
                            maxHeight: 200,
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
                              maxHeight: 196,
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
                                    setSubjectId(null);
                                    setShowSubjectDropdown(false);
                                  }}
                                  style={[styles.selectOption, !subjectId && styles.selectOptionActive]}
                                >
                                  <Text style={[styles.selectOptionText, !subjectId && styles.selectOptionTextActive]}>
                                    None
                                  </Text>
                                </TouchableOpacity>
                                {subjects.map((subj) => (
                                  <TouchableOpacity
                                    key={subj.id}
                                    onPress={() => {
                                      setSubjectId(subj.id);
                                      setShowSubjectDropdown(false);
                                    }}
                                    style={[styles.selectOption, subjectId === subj.id && styles.selectOptionActive]}
                                  >
                                    <Text style={[styles.selectOptionText, subjectId === subj.id && styles.selectOptionTextActive]}>
                                      {subj.name}{subj.child_id === null ? ' (family-wide)' : ''}
                                    </Text>
                                  </TouchableOpacity>
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
                            setSubjectId(null);
                            setShowSubjectDropdown(false);
                          }}
                          style={[styles.selectOption, !subjectId && styles.selectOptionActive]}
                        >
                          <Text style={[styles.selectOptionText, !subjectId && styles.selectOptionTextActive]}>
                            None
                          </Text>
                        </TouchableOpacity>
                        {subjects.map((subj) => (
                          <TouchableOpacity
                            key={subj.id}
                            onPress={() => {
                              setSubjectId(subj.id);
                              setShowSubjectDropdown(false);
                            }}
                            style={[styles.selectOption, subjectId === subj.id && styles.selectOptionActive]}
                          >
                            <Text style={[styles.selectOptionText, subjectId === subj.id && styles.selectOptionTextActive]}>
                              {subj.name}{subj.child_id === null ? ' (family-wide)' : ''}
                            </Text>
                          </TouchableOpacity>
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
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Unit (optional)</Text>
                  <TextInput
                    placeholder="e.g. Algebra I – Linear Equations"
                    placeholderTextColor={MUTED}
                    value={unit}
                    onChangeText={setUnit}
                    style={styles.input}
                  />
                </View>
              </SafeFieldRow>

              <SafeFieldRow style={styles.fieldRow}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Grade (optional)</Text>
                  <TextInput
                    placeholder="e.g. B+ or 88%"
                    placeholderTextColor={MUTED}
                    value={grade}
                    onChangeText={setGrade}
                    style={styles.input}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>% of Total Grade (optional)</Text>
                  <TextInput
                    placeholder="e.g. 25"
                    placeholderTextColor={MUTED}
                    value={percentOfTotalGrade}
                    onChangeText={setPercentOfTotalGrade}
                    style={[
                      styles.input,
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
              </SafeFieldRow>
                </>
              )}
            </SafeView>

            {/* Additional notes — collapsible, same pattern as Add Subject modal */}
            <SafeView style={styles.academicSection}>
              <TouchableOpacity
                onPress={() => setShowNotesSection(!showNotesSection)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 4,
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.sectionLabel}>Additional notes</Text>
                {showNotesSection ? (
                  <ChevronUp size={20} color={MUTED} />
                ) : (
                  <ChevronDown size={20} color={MUTED} />
                )}
              </TouchableOpacity>
              {showNotesSection && (
                <View style={{ marginTop: 12, paddingTop: 8 }}>
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
              )}
            </SafeView>

            {/* Labels removed - no longer used */}

            {/* Material Selector - always visible */}
            {familyId && (
              <SafeFieldRow style={[styles.fieldRow, { marginTop: 8 }]}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Attachments (optional)</Text>
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
                      <Plus size={14} color={ACCENT} />
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

          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity 
              onPress={onClose}
              style={{ paddingVertical: 10, paddingHorizontal: 20 }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCreate}
              disabled={submitting || !isFormValid()}
              style={[
                styles.createButton,
                (submitting || !isFormValid()) && styles.createButtonDisabled,
                Platform.OS === 'web' && isFormValid() && !submitting && createButtonHovered && styles.createButtonHovered,
              ]}
              onMouseEnter={Platform.OS === 'web' ? () => setCreateButtonHovered(true) : undefined}
              onMouseLeave={Platform.OS === 'web' ? () => setCreateButtonHovered(false) : undefined}
              activeOpacity={0.9}
            >
              <Text style={[
                styles.createButtonText,
                (submitting || !isFormValid()) && styles.createButtonTextDisabled,
              ]}>
                {submitting ? 'Adding…' : 'Add Event'}
              </Text>
            </TouchableOpacity>
          </View>
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
      <AddSubjectModal
        visible={showAddSubjectModal}
        onClose={() => setShowAddSubjectModal(false)}
        onSubjectAdded={(newSubject) => {
          // Refresh subjects list
          fetchSubjects();
          // Select the newly added subject
          if (newSubject?.id) {
            setSubjectId(newSubject.id);
          }
        }}
        familyId={familyId}
        defaultChildId={assigneeIds.length > 0 ? assigneeIds[0] : null}
        children={familyMembers}
      />

      <AddMaterialModal
        visible={showAddMaterialModal}
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
    width: 720,
    maxWidth: '100%',
    maxHeight: Platform.OS === 'web' ? '90vh' : '90%',
    backgroundColor: BG,
    borderRadius: 24,
    flexDirection: 'column',
    ...Platform.select({
      web: {
        boxShadow: '0 10px 20px rgba(0, 0, 0, 0.15)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: 6,
      },
    }),
    overflow: 'hidden',
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
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipRow: {
    paddingHorizontal: 0,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
    alignItems: 'center',
    flexDirection: 'row',
  },
  modeToggle: {
    flexDirection: 'row',
    paddingHorizontal: 0,
    paddingTop: 12,
    paddingBottom: 8,
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
    maxHeight: Platform.OS === 'web' ? 'calc(100vh - 200px)' : undefined,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 8,
  },
  timeSection: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#f9fafb',
  },
  timeToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
  timeInputsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timeField: {
    flex: 1,
  },
  timeLabel: {
    color: SUB,
    fontSize: 12,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timeInput: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: FG,
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
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
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
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
  field: {
    flex: 1,
    alignItems: 'flex-start',
    overflow: 'visible',
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
  selectContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
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
    borderRadius: 10,
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
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: ACCENT,
  },
  addMaterialText: {
    fontSize: 13,
    color: ACCENT,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
});

