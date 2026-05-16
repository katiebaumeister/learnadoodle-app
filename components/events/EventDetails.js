import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, TextInput, Switch, Platform, Modal, Animated, ActivityIndicator } from 'react-native';
import {
  LearnerPill,
  resolveLearnerChild,
  formatConflictMetaFromEvent,
  parseConflictMessageString,
  mapChildrenForConflict,
  sharedConflictBannerStyles as cb,
} from '../planner/conflictBannerShared';
import { Clock, UserCircle, BookOpen, Edit2, Plus, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X, Save, Check, Calculator, FlaskConical, ExternalLink, AlertCircle, MapPin, GraduationCap, FileText } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { formatDate, apiRequest, pushEventToGoogleCalendar } from '../../lib/apiClient';
import { getMaterials } from '../../lib/services/materialsClient';
import AddMaterialModal from '../materials/AddMaterialModal';
import { logDeleteEvent } from '../../app/services/plannerInstrumentation';
import StandardsSearchModal from '../standards/StandardsSearchModal';
import MasteryPicker from '../standards/MasteryPicker';
import { useToast } from '../Toast';
import { useSession } from '../../contexts/SessionContext';
import { useAuth } from '../../contexts/AuthContext';
import { createAssignment, updateAssignment } from '../../lib/services/assignmentsClient';
import { isChildHelpAssignment } from '../child/childHomeRailHelpers';
import AddSubjectModal from '../AddSubjectModal';
import { STRINGS } from '../../lib/i18n/strings';
import { getAcademicYear } from '../../lib/services/academicYearClient';
import { dropPlanYearFullDataCacheEntry, dropPlanEditListTimesCacheEntry } from '../../lib/planEditListCache';
import AskParentHelpModal from '../child/AskParentHelpModal';
import StudentHelpHistoryModal from '../child/StudentHelpHistoryModal';
import RespondToHelpRequestModal from '../parent/RespondToHelpRequestModal';
import AssignmentReviewModal from '../assignments/AssignmentReviewModal';
import TutorEventHelpPanel from '../tutor/TutorEventHelpPanel';
import { isSchoolWorkEventType } from '../child/childHomeRailHelpers';
import { assignmentRowLinksEventId } from '../../lib/assignmentLinkedEventUtils';
import { defaultRequiresSubmissionHomeForEventType } from '../../lib/eventRequiresSubmissionHome';
import { ModalSectionCard } from '../ui/ModalSectionCard';
import { LD, shellShadow, fontDisplay } from '../parent/parentModalTheme';
import { findFirstConflictEvent } from '../../lib/utils/conflictDetection';
import {
  isPartOfRecurringSeries,
  isPlanYearBlockSeries,
  isDeletableSeriesGroup,
  cleanPlannerEventId,
  softDeleteEventSeries,
} from '../../lib/utils/recurringEventUtils';

// Session-level guard: if this environment does not expose `lesson_standards`,
// don't keep retrying the same failing request on every EventDetails mount.
let lessonStandardsUnavailableSession = false;

/** Display name for Add to plan? / plan banners from an academic_years row (never "Loading…"). */
function formatAcademicYearPlanLabel(ay) {
  if (!ay) return '';
  if (ay.year_name && String(ay.year_name).trim()) return String(ay.year_name).trim();
  const start = ay.start_date ? String(ay.start_date).slice(0, 10) : '';
  const end = ay.end_date ? String(ay.end_date).slice(0, 10) : '';
  if (start && end) {
    try {
      const s = new Date(`${start}T12:00:00`);
      const e = new Date(`${end}T12:00:00`);
      return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } catch (_) {
      return `${start} – ${end}`;
    }
  }
  return ay.id ? String(ay.id).slice(0, 8) : 'Plan';
}

const STATUS_BASE = ['scheduled', 'in_progress', 'done', 'skipped', 'canceled'];
const STATUS_NORMALIZE = {
  cancelled: 'canceled',
  canceled: 'canceled',
  'in progress': 'in_progress',
};

const normalizeStatus = (value) => {
  if (!value) return 'scheduled';
  const key = value.toLowerCase();
  return STATUS_NORMALIZE[key] || key;
};

/** Cooper Hewitt on web — matches banners and `styles.fieldLabel` / `connectedPlanBannerText`. */
const webCooper = (weight) =>
  Platform.OS === 'web'
    ? {
        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontWeight: String(weight),
      }
    : { fontWeight: String(weight) };

/** Shallow copy of events.curriculum_metadata for reads/writes (lesson_label vs optional DB column). */
const parseCurriculumMetadata = (ev) => {
  const raw = ev?.curriculum_metadata;
  if (raw == null) return {};
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return typeof p === 'object' && p !== null && !Array.isArray(p) ? { ...p } : {};
    } catch (_) {
      return {};
    }
  }
  return {};
};

/** Whether the edit form should show Academic Details expanded on first paint (mirrors hydrate logic). */
function eventHasAcademicDetailsSection(ev) {
  if (!ev) return false;
  const cm = parseCurriculumMetadata(ev);
  return !!(
    ev.subject_id ||
    ((ev.unit || ev.curriculum_unit_title || '') + '').trim() ||
    (ev.lesson && String(ev.lesson).trim()) ||
    (cm.lesson_label && String(cm.lesson_label).trim()) ||
    (ev.curriculum_lesson_id && (ev.title || '').trim()) ||
    ev.grade ||
    ev.percent_of_total_grade != null
  );
}

/** Primary + multi-attach material ids on an event row (for library sync). */
function collectMaterialIdsFromEvent(ev) {
  if (!ev) return [];
  const ids = [];
  if (ev.material_id) ids.push(String(ev.material_id));
  if (Array.isArray(ev.materials_attachment_ids)) {
    ev.materials_attachment_ids.forEach((id) => {
      if (id) ids.push(String(id));
    });
  }
  return [...new Set(ids)];
}

/** When event save changes material links, notify Materials Library / attachment modals (same as refreshMaterials + materialUpdated). */
function emitMaterialLinkageEventsIfChangedWeb(familyId, eventBefore, eventAfter) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !familyId || !eventBefore || !eventAfter) return;
  const beforeP = eventBefore.material_id ? String(eventBefore.material_id) : null;
  const afterP = eventAfter.material_id ? String(eventAfter.material_id) : null;
  const beforeA = JSON.stringify([...(eventBefore.materials_attachment_ids || [])].map(String).sort());
  const afterA = JSON.stringify([...(eventAfter.materials_attachment_ids || [])].map(String).sort());
  if (beforeP === afterP && beforeA === afterA) return;
  const allIds = new Set([
    ...collectMaterialIdsFromEvent(eventBefore),
    ...collectMaterialIdsFromEvent(eventAfter),
  ]);
  window.dispatchEvent(new CustomEvent('refreshMaterials', { detail: { familyId } }));
  allIds.forEach((materialId) => {
    window.dispatchEvent(
      new CustomEvent('materialUpdated', {
        detail: { materialId, familyId, action: 'event_link' },
      })
    );
  });
}

/** Same rules as fetchSubjects — filter family + child-specific subjects for assignees (dedupe by name). */
function filterSubjectsForAssignees(allSubjects, assigneeIds) {
  if (!assigneeIds?.length) return [];
  const parseSubjectChildIds = (raw) =>
    String(raw == null ? '' : raw)
      .split(';')
      .map((id) => id.trim())
      .filter(Boolean);
  const subjectMap = new Map();
  (allSubjects || []).forEach((subject) => {
    const subjectChildIds = parseSubjectChildIds(subject.child_id);
    const isFamilyWide = subjectChildIds.length === 0;
    const isForSelectedChild = subjectChildIds.some((id) =>
      assigneeIds.some((assigneeId) => String(assigneeId) === String(id))
    );
    const shouldInclude = isFamilyWide || isForSelectedChild;
    if (!shouldInclude) return;
    const existing = subjectMap.get(subject.name);
    const existingChildIds = existing ? parseSubjectChildIds(existing.child_id) : [];
    const existingIsFamilyWide = existingChildIds.length === 0;
    const subjectIsFamilyWide = subjectChildIds.length === 0;
    if (!existing) {
      subjectMap.set(subject.name, subject);
    } else if (existingIsFamilyWide && !subjectIsFamilyWide) {
      subjectMap.set(subject.name, subject);
    } else if (!existingIsFamilyWide && !subjectIsFamilyWide) {
      const firstAssigneeId = assigneeIds[0];
      const currentMatchesFirst = subjectChildIds.some(
        (id) => String(id) === String(firstAssigneeId)
      );
      const existingMatchesFirst = existingChildIds.some(
        (id) => String(id) === String(firstAssigneeId)
      );
      if (currentMatchesFirst && !existingMatchesFirst) {
        subjectMap.set(subject.name, subject);
      }
    }
  });
  return Array.from(subjectMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function sameIdList(a = [], b = []) {
  const left = (Array.isArray(a) ? a : []).map((x) => String(x?.id || x)).join('|');
  const right = (Array.isArray(b) ? b : []).map((x) => String(x?.id || x)).join('|');
  return left === right;
}

/** Assignee chips — matches hydrate effect so first paint matches loaded event. */
function initialAssigneeIdsFromEvent(ev) {
  if (!ev) return [];
  const childId =
    ev.child_id ||
    (ev.child_ids && ev.child_ids.length > 0 ? ev.child_ids[0] : null) ||
    ev.childId ||
    ev.child?.id ||
    null;
  return ev.child_ids && ev.child_ids.length > 0 ? ev.child_ids : childId ? [childId] : [];
}

/** Display name(s) for assignees — conflict banner copy. */
function assigneeLabelForConflict(assigneeIds, familyMembers) {
  if (!assigneeIds?.length || !familyMembers?.length) return null;
  const names = assigneeIds.map((id) => {
    const m = familyMembers.find((x) => String(x.id) === String(id));
    const n = (m?.name || m?.first_name || '').trim();
    return n || null;
  }).filter(Boolean);
  if (!names.length) return null;
  return names.length === 1 ? names[0] : names.join(' & ');
}

/** Unit / lesson / grade — matches hydrate effect. */
function initialAcademicStringsFromEvent(ev) {
  if (!ev) return { unit: '', lesson: '', grade: '', percent: '' };
  const unitStr = ((ev.unit || ev.curriculum_unit_title || '') + '').trim();
  const cm = parseCurriculumMetadata(ev);
  let lessonStr =
    (ev.lesson && String(ev.lesson).trim()) ||
    (cm.lesson_label && String(cm.lesson_label).trim()) ||
    '';
  if (!lessonStr && ev.curriculum_lesson_id && ev.title) {
    lessonStr = String(ev.title).trim();
  }
  return {
    unit: unitStr,
    lesson: lessonStr,
    grade: ev.grade || '',
    percent: ev.percent_of_total_grade != null ? String(ev.percent_of_total_grade) : '',
  };
}

const getTimestamp = (event, keys = []) => {
  for (const key of keys) {
    const value = event[key];
    if (value) {
      // If it's a time string like "09:00", return null (not a valid timestamp)
      if (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)) {
        continue; // Skip time strings, look for actual timestamps
      }
      return value;
    }
  }
  return null;
};

const toDateInput = (timestamp) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  // Use local date so the calendar day matches user/family timezone, not UTC
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatTimeForInput = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  if (hours > 12) hours -= 12;
  else if (hours === 0) hours = 12;
  return `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

// Helper function to check if a string is just a UUID (not a valid URL)
const isUUID = (str) => {
  if (!str || typeof str !== 'string') return false;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(str.trim());
};

// Helper function to check if a URL is valid for use as an iframe source
const isValidUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  // Reject if it's just a UUID (not a valid URL)
  if (isUUID(url)) return false;
  // Must start with http:// or https://
  return url.startsWith('http://') || url.startsWith('https://');
};

// Helper function to check if URL is a Supabase storage URL
const isSupabaseStorageUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  // Check if URL contains Supabase storage path patterns
  return url.includes('/storage/v1/object/') || url.includes('supabase.co/storage/');
};

// Web-only PDF iframe component
const PDFIframe = ({ src, title }) => {
  if (Platform.OS !== 'web') return null;
  
  // Use a ref to inject iframe after mount
  const containerRef = useRef(null);
  
  useEffect(() => {
    if (containerRef.current && src && typeof document !== 'undefined') {
      // Validate URL before using it
      if (!isValidUrl(src)) {
        console.warn('[PDFIframe] Invalid URL provided, skipping iframe creation:', src);
        return;
      }

      // In React Native Web, ref.current is the DOM element
      const domElement = containerRef.current;
      
      // Clear any existing content
      if (domElement.innerHTML !== undefined) {
        domElement.innerHTML = '';
      } else if (domElement.removeChild) {
        while (domElement.firstChild) {
          domElement.removeChild(domElement.firstChild);
        }
      }
      
      // Create and inject iframe
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = title || 'PDF Viewer';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.setAttribute('allow', 'fullscreen');
      
      // Add error handler to prevent console errors
      iframe.onerror = (e) => {
        console.warn('[PDFIframe] Error loading PDF:', src);
        e.preventDefault();
        e.stopPropagation();
      };
      
      domElement.appendChild(iframe);
    }
  }, [src, title]);
  
  return (
    <View
      ref={containerRef}
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
      }}
    />
  );
};

const toTimeInput = (timestamp) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  // Use local hours/minutes so display matches user/family timezone (not UTC)
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

// Parse time string from RPC (HH:MM or H:MM 24h) or "9:00 AM" into 12h display string
const timeStringToDisplay = (str) => {
  if (!str || typeof str !== 'string') return '';
  const trimmed = str.trim();
  // Already 12h with AM/PM
  if (/\d{1,2}:\d{2}\s*(AM|PM)/i.test(trimmed)) return trimmed;
  // 24h HH:MM or H:MM
  const m24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    let h = parseInt(m24[1], 10);
    const min = parseInt(m24[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return '';
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h || 12;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} ${ampm}`;
  }
  return '';
};

// Format date input to enforce YYYY-MM-DD
const formatDateInput = (value) => {
  // Remove all non-digits
  const digits = value.replace(/\D/g, '');
  // Format as YYYY-MM-DD
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
};

// Format time input to enforce HH:MM AM/PM with validation
const formatTimeInput = (value) => {
  // Preserve colon and extract AM/PM
  const upper = value.toUpperCase();
  const hasAM = upper.includes('AM');
  const hasPM = upper.includes('PM');
  const hasColon = value.includes(':');
  
  // If there's a colon, split into hour and minute parts
  let hourDigits = '';
  let minuteDigits = '';
  if (hasColon) {
    const colonIndex = value.indexOf(':');
    const beforeColon = value.slice(0, colonIndex);
    const afterColon = value.slice(colonIndex + 1);
    hourDigits = beforeColon.replace(/[^\d]/g, '');
    minuteDigits = afterColon.replace(/[^\d]/g, '');
  } else {
    // No colon - extract all digits
    hourDigits = value.replace(/[^\d]/g, '');
    minuteDigits = '';
  }
  
  const digits = hourDigits + minuteDigits; // For length checks

  if (digits.length === 0) {
    return '';
  }
  
  // Single digit hour - allow 1-9 (valid hours in 12-hour format)
  if (hourDigits.length === 1 && minuteDigits.length === 0) {
    const d = parseInt(hourDigits, 10);
    if (d === 0 || d > 9) {
      return '';
    }
    // Preserve colon if present (user is typing minutes)
    if (hasColon) {
      const ampm = hasPM ? ' PM' : hasAM ? ' AM' : '';
      const result = `${hourDigits}:${minuteDigits}${ampm}`;

      return result;
    }
    // No colon - just preserve AM/PM if present
    const ampm = hasPM ? ' PM' : hasAM ? ' AM' : '';

    return hourDigits + ampm;
  }
  
  // Single digit hour with minutes being typed
  if (hourDigits.length === 1 && minuteDigits.length > 0) {
    const d = parseInt(hourDigits, 10);
    if (d === 0 || d > 9) {
      return '';
    }
    // Limit minutes to 2 digits
    const limitedMinutes = minuteDigits.slice(0, 2);
    // Validate minutes (0-59)
    if (limitedMinutes.length === 2) {
      const mins = parseInt(limitedMinutes, 10);
      if (mins > 59) {
        // Invalid minutes - keep only first digit
        const ampm = hasPM ? ' PM' : hasAM ? ' AM' : '';
        const result = `${hourDigits}:${limitedMinutes[0]}${ampm}`;

        return result;
      }
    }
    const ampm = hasPM ? ' PM' : hasAM ? ' AM' : '';
    const result = `${hourDigits}:${limitedMinutes}${ampm}`;

    return result;
  }
  
  // Two digit hour - validate hours (1-12)
  if (hourDigits.length === 2 && minuteDigits.length === 0) {
    const hours = parseInt(hourDigits, 10);
    if (hours > 12) {
      // Invalid hour like "20" - keep only first digit and add colon for minutes

      return `${hourDigits[0]}:`;
    }
    if (hours === 0) {
      return '';
    }
    // Auto-insert colon after 2 digits if not already present (unless AM/PM is already set)
    const ampm = hasPM ? 'PM' : hasAM ? 'AM' : '';
    if (hasColon) {
      // Already has colon - preserve it
      const result = `${hourDigits}:${minuteDigits}${ampm ? ' ' + ampm : ''}`;

      return result;
    } else if (ampm) {
      // If AM/PM is set, don't auto-add colon yet
      const result = `${hourDigits} ${ampm}`;

      return result;
    } else {
      // Auto-add colon to allow typing minutes
      const result = `${hourDigits}:`;

      return result;
    }
  }
  
  // Two digit hour with minutes being typed
  if (hourDigits.length === 2 && minuteDigits.length > 0) {
    const hours = parseInt(hourDigits, 10);
    if (hours > 12 || hours === 0) {
      return `${hourDigits[0]}:${minuteDigits}`;
    }
    // Limit minutes to 2 digits
    const limitedMinutes = minuteDigits.slice(0, 2);
    // Validate minutes (0-59)
    if (limitedMinutes.length === 2) {
      const mins = parseInt(limitedMinutes, 10);
      if (mins > 59) {
        // Invalid minutes - keep only first digit
        const ampm = hasPM ? ' PM' : hasAM ? ' AM' : '';
        const result = `${hourDigits}:${limitedMinutes[0]}${ampm}`;

        return result;
      }
    }
    const ampm = hasPM ? ' PM' : hasAM ? ' AM' : '';
    const result = `${hourDigits}:${limitedMinutes}${ampm}`;

    return result;
  }
  
  // Handle remaining edge cases - if we get here, something unexpected happened
  // Fallback: try to format based on total digits

  // If we have hour digits but no colon and no minutes, just return what we have
  if (hourDigits.length > 0 && !hasColon && minuteDigits.length === 0) {
    const ampm = hasPM ? ' PM' : hasAM ? ' AM' : '';
    return hourDigits + ampm;
  }
  
  // If we have both hour and minute digits, format them
  if (hourDigits.length > 0 && minuteDigits.length > 0) {
    const limitedMinutes = minuteDigits.slice(0, 2);
    const ampm = hasPM ? ' PM' : hasAM ? ' AM' : '';
    return `${hourDigits}:${limitedMinutes}${ampm}`;
  }

  return '';
};

// Validate and convert time string to 24-hour format for storage
const parseTimeTo24Hour = (timeStr) => {
  if (!timeStr) return null;
  
  // Handle formats: "8 AM", "8:00 AM", "08:00 AM", "8", "8:00"
  // Match: (hours)(optional colon and minutes)(optional AM/PM)
  const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return null;
  
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0; // Default to 0 if no minutes
  const ampm = match[3]?.toUpperCase();
  
  // Validate 12-hour format: hours must be 1-12 when AM/PM is present
  if (ampm && (hours < 1 || hours > 12)) return null;
  
  // Validate minutes
  if (minutes < 0 || minutes > 59) return null;
  
  // Convert to 24-hour format
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  
  // Final validation for 24-hour format
  if (hours < 0 || hours > 23) return null;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

const combineDateTime = (dateStr, timeStr, fallbackMinutes = 0) => {
  if (!dateStr) return null;
  // Convert time string to 24-hour format if needed
  const time24 = parseTimeTo24Hour(timeStr) || '00:00';
  const base = new Date(`${dateStr}T${time24}`);
  if (Number.isNaN(base.getTime())) return null;
  if (!timeStr && fallbackMinutes > 0) {
    base.setMinutes(base.getMinutes() + fallbackMinutes);
  }
  return base;
};

// Helper functions for time/date parsing (matching TaskCreateModal)
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

const formatTime = (timestamp) => {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const SUGGESTED_TAGS = ['math', 'reading', 'science', 'writing', 'review', 'test', 'project', 'practice'];

const EVENT_TYPES = [
  'Lesson',
  'Class Day',
  'Project',
  'Exam',
  'Assignment',
  'Activity',
  'Appointment',
];

const normalizeEventTypeForDisplay = (type) => {
  const raw = String(type || '').trim();
  if (!raw) return 'Lesson';
  if (raw === 'Schedule Block' || raw === 'Scheduled Class Day' || raw === 'ClassDay') {
    return 'Class Day';
  }
  return raw;
};

const normalizeEventTypeForPersistence = (type) => {
  if (type === 'Scheduled Class Day') return 'Schedule Block';
  if (type === 'Class Day') return 'ClassDay';
  return type || 'Lesson';
};

// Tag categories and suggested tags
const TAG_CATEGORIES = {
  domain: ['academic', 'physical', 'creative', 'social', 'emotional'],
};

const MODE_OPTIONS = ['home', 'online', 'outside', 'travel'];
const CALENDAR_CONNECTION_OPTIONS = [
  { value: 'google', label: 'Google' },
  { value: 'apple', label: 'Apple' },
];

const DEFAULT_START_TIME = '9:00 AM';
const DEFAULT_DURATION_MINUTES = 30;

// Color constants matching TaskCreateModal
const BG = '#ffffff';
const FG = '#111827';
const SUB = '#6b7280';
const BORDER = '#e5e7eb';
const MUTED = '#9ca3af';
const ACCENT = '#d4a256';
const CHIP_BG = '#f3f4f6';
const CHIP_BORDER = '#e5e7eb';

// Helper functions
function addDays(d, n) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

function fmt(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatConflictSuggestionMessage(startDate, endDate) {
  if (!startDate || !endDate) return '';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formatTime = (d) => {
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    if (hours > 12) hours -= 12;
    else if (hours === 0) hours = 12;
    return minutes === 0 ? `${hours} ${period}` : `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };
  const dayName = dayNames[startDate.getDay()];
  const monthName = monthNames[startDate.getMonth()];
  const day = startDate.getDate();
  const startTimeStr = formatTime(startDate);
  const endTimeStr = formatTime(endDate);
  const startTimeOnly = startTimeStr.replace(/\s*(AM|PM)$/i, '');
  const endTimeOnly = endTimeStr.replace(/\s*(AM|PM)$/i, '');
  const period = startTimeStr.includes('PM') ? 'PM' : 'AM';
  return `${dayName} ${monthName} ${day} · ${startTimeOnly}–${endTimeOnly} ${period}`;
}

function findNextAvailableConflictSlot(conflictEvent, currentStart, currentEnd, existingEvents, childIds) {
  try {
    const duration = (currentEnd - currentStart) / (1000 * 60);
    const conflictEnd = new Date(conflictEvent.end_ts || conflictEvent.start_ts);
    let candidateStart = new Date(conflictEnd);
    const dayEnd = new Date(candidateStart);
    dayEnd.setHours(23, 59, 0, 0);

    while (candidateStart < dayEnd) {
      const candidateEnd = new Date(candidateStart.getTime() + duration * 60 * 1000);
      let hasConflict = false;
      for (const ev of existingEvents || []) {
        if (!ev || ev.id === conflictEvent.id) continue;
        const evStart = new Date(ev.start_ts);
        const evEnd = new Date(ev.end_ts || ev.start_ts);
        if (candidateStart < evEnd && evStart < candidateEnd) {
          const evChildIds = ev.child_id ? [ev.child_id] : (ev.child_ids || []);
          if (childIds.some((id) => evChildIds.includes(id))) {
            hasConflict = true;
            break;
          }
        }
      }
      if (!hasConflict && candidateEnd <= dayEnd) {
        return { newStart: candidateStart, newEnd: candidateEnd };
      }
      candidateStart = new Date(candidateStart.getTime() + 15 * 60 * 1000);
    }
  } catch (_) {
    return null;
  }
  return null;
}

// Format date range for multi-day events
function fmtDateRange(startDate, endDate) {
  if (!startDate || !endDate) return fmt(startDate || endDate);
  
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  
  // If same day, just show the date
  if (start.getTime() === end.getTime()) {
    return fmt(startDate);
  }
  
  // Same month and year: "Jan 9 - 12, 2026"
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    const startDay = start.getDate();
    const endDay = end.getDate();
    const month = start.toLocaleDateString('en-US', { month: 'short' });
    const year = start.getFullYear();
    return `${month} ${startDay} - ${endDay}, ${year}`;
  }
  
  // Same year, different months: "Jan 9 - Feb 12, 2026"
  if (start.getFullYear() === end.getFullYear()) {
    const startFormatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${startFormatted} - ${endFormatted}, ${start.getFullYear()}`;
  }
  
  // Different years: "Jan 9, 2026 - Feb 12, 2027"
  return `${fmt(startDate)} - ${fmt(endDate)}`;
}

// Safe View wrapper: wrap or drop text nodes so no raw text is a child of View
function SafeView({ children, style, ...props }) {
  const childrenArray = React.Children.toArray(children);
  const safeChildren = childrenArray.map((child, i) => {
    if (typeof child === 'string' && child.length > 0) return <Text key={`sv-${i}`} style={{ fontSize: 14 }}>{child}</Text>;
    if (child == null || typeof child === 'boolean') return null;
    return child;
  }).filter(Boolean);
  return <View style={style} {...props}>{safeChildren}</View>;
}

// Wrapper for fieldRow: wrap string children in Text so no raw text is a child of View
function SafeFieldRow({ children, style }) {
  const safeChildren = React.Children.toArray(children).map((child, i) => {
    if (typeof child === 'string' && child.length > 0) return <Text key={`sfr-${i}`} style={{ fontSize: 14 }}>{child}</Text>;
    return child != null ? child : null;
  }).filter(Boolean);
  return <View style={style}>{safeChildren}</View>;
}

function ChipRow({ children, style }) {
  const safeChildren = (React.Children.map(children, (child, i) => {
    if (typeof child === 'string' && child.length > 0) return <Text key={`cr-${i}`} style={{ fontSize: 14 }}>{child}</Text>;
    if (child == null || typeof child === 'boolean') return null;
    return child;
  }) || []).filter(Boolean);

  return <View style={style}>{safeChildren}</View>;
}

export default function EventDetails({ event, onEventUpdated, onEventDeleted, familyMembers = [], onEventPatched, familyId, onEditingChange, onClose, initialSchedulingMode = false, readOnly = false, preloadedAcademicYears = null, preloadedSubjects = null, preloadedFamilyAssignments = null, viewerRole = null, parentEventFocus = null, onParentEventFocusConsumed, openConflictResolution = false, conflictResolutionContext = null, onOpenConflictResolutionConsumed }) {
  const session = useSession();
  const { user: authUser } = useAuth();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const [showRecurringDeleteModal, setShowRecurringDeleteModal] = useState(false);
  const [editing, setEditing] = useState(initialSchedulingMode); // Start in edit mode if scheduling
  const [saving, setSaving] = useState(false);
  const [schedulingBacklog, setSchedulingBacklog] = useState(initialSchedulingMode); // State for "Add to schedule" mode

  const [draftTitle, setDraftTitle] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [dueDate, setDueDate] = useState(new Date());
  const [eventEndDate, setEventEndDate] = useState(null); // End date for multi-day events
  const [draftStartTime, setDraftStartTime] = useState('');
  const [draftEndTime, setDraftEndTime] = useState('');
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState('');
  const [draftChildId, setDraftChildId] = useState(null);
  const [assigneeIds, setAssigneeIds] = useState(() => initialAssigneeIdsFromEvent(event));
  const [draftAllDay, setDraftAllDay] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [draftNotes, setDraftNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [draftStatus, setDraftStatus] = useState('scheduled');
  const [draftTags, setDraftTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [showAcademicDetails, setShowAcademicDetails] = useState(() => eventHasAcademicDetailsSection(event));
  const [showLogisticDetails, setShowLogisticDetails] = useState(
    () => !!(event?.location || event?.mode || event?.instructor)
  );
  const [showNotesSection, setShowNotesSection] = useState(false); // Collapsed by default (match Add Subject)
  const [draftMaterialId, setDraftMaterialId] = useState(null);
  const [attachedMaterialIds, setAttachedMaterialIds] = useState([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const materialDropdownRef = useRef(null);
  const materialButtonRef = useRef(null);
  const [materialDropdownPosition, setMaterialDropdownPosition] = useState({ top: 0, left: 0, width: 200 });

  // PDF viewer state
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfTitle, setPdfTitle] = useState('');
  
  // Subject dropdown refs and position for portal
  const subjectButtonRef = useRef(null);
  const subjectDropdownRef = useRef(null);
  const [subjectDropdownPosition, setSubjectDropdownPosition] = useState({ top: 0, left: 0, width: 200 });
  
  // Event type and placement
  const [eventType, setEventType] = useState(() =>
    normalizeEventTypeForDisplay(event?.event_type || 'Lesson')
  );
  const [placement, setPlacement] = useState('calendar'); // 'calendar' or 'backlog'
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [calendarViewMonth, setCalendarViewMonth] = useState(new Date());
  const [showEventEndDatePicker, setShowEventEndDatePicker] = useState(false);
  const [eventEndDateCalendarViewMonth, setEventEndDateCalendarViewMonth] = useState(() => {
    try {
      const baseDate = new Date();
      const endDate = new Date(baseDate);
      endDate.setDate(endDate.getDate() + 1);
      return endDate;
    } catch (e) {
      return new Date();
    }
  });
  
  // Academic and location fields
  const [subjectId, setSubjectId] = useState(() => event?.subject_id ?? null);
  const [countsTowardPlan, setCountsTowardPlan] = useState(() => event?.counts_toward_plan !== false);
  const [showRequiresSubmissionHome, setShowRequiresSubmissionHome] = useState(() => {
    if (!event) return false;
    if (typeof event.requires_submission_home === 'boolean') return event.requires_submission_home;
    const loadedType = normalizeEventTypeForDisplay(event.event_type || 'Lesson');
    return defaultRequiresSubmissionHomeForEventType(loadedType === 'Class Day' ? 'Lesson' : loadedType);
  });
  const [academicYearId, setAcademicYearId] = useState(() => event?.academic_year_id ?? null);
  const [academicYears, setAcademicYears] = useState(() =>
    Array.isArray(preloadedAcademicYears) && preloadedAcademicYears.length > 0 ? [...preloadedAcademicYears] : []
  );
  const [instructionalMinutesOverride, setInstructionalMinutesOverride] = useState(() =>
    event?.instructional_minutes != null ? String(event.instructional_minutes) : ''
  );
  const [unit, setUnit] = useState(() => initialAcademicStringsFromEvent(event).unit);
  const [lesson, setLesson] = useState(() => initialAcademicStringsFromEvent(event).lesson);
  const [grade, setGrade] = useState(() => initialAcademicStringsFromEvent(event).grade);
  const [percentOfTotalGrade, setPercentOfTotalGrade] = useState(() => initialAcademicStringsFromEvent(event).percent);
  const [location, setLocation] = useState('');
  const [mode, setMode] = useState('');
  const [connectedCalendarTargets, setConnectedCalendarTargets] = useState([]);
  const [instructor, setInstructor] = useState('');
  const [goalLink, setGoalLink] = useState(null);
  const [subjects, setSubjects] = useState(() => {
    const aids = initialAssigneeIdsFromEvent(event);
    if (Array.isArray(preloadedSubjects) && preloadedSubjects.length > 0 && aids.length > 0) {
      return filterSubjectsForAssignees(preloadedSubjects, aids);
    }
    return [];
  });
  const [subjectGoals, setSubjectGoals] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);
  const [showGoalDropdown, setShowGoalDropdown] = useState(false);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const familyMembersSignature = useMemo(
    () =>
      (familyMembers || [])
        .map((m) => `${String(m?.id || '')}:${String(m?.name || m?.first_name || '')}`)
        .join('|'),
    [familyMembers]
  );
  const assigneeIdsSignature = useMemo(
    () => (assigneeIds || []).map((id) => String(id)).join('|'),
    [assigneeIds]
  );
  const conflictResolutionSignature = useMemo(() => {
    const c = conflictResolutionContext;
    if (!c) return '';
    const ce = c.conflictEvent || {};
    const me = c.movedEvent || {};
    const s = c.suggestedChange || {};
    return [
      String(c.conflictMessage || ''),
      String(ce.id || ''),
      String(ce.start_ts || ''),
      String(ce.end_ts || ''),
      String(me.id || ''),
      String(me.start_ts || ''),
      String(me.end_ts || ''),
      String(s.newStart || s.new_start || ''),
      String(s.newEnd || s.new_end || ''),
    ].join('|');
  }, [conflictResolutionContext]);
  const preloadedSubjectsSignature = useMemo(
    () =>
      Array.isArray(preloadedSubjects)
        ? preloadedSubjects
            .map((s) => `${String(s?.id || '')}:${String(s?.child_id || '')}:${String(s?.name || '')}`)
            .join('|')
        : '',
    [preloadedSubjects]
  );
  const preloadedAcademicYearsSignature = useMemo(
    () =>
      Array.isArray(preloadedAcademicYears)
        ? preloadedAcademicYears
            .map((a) => `${String(a?.id || '')}:${String(a?.start_date || '')}:${String(a?.end_date || '')}`)
            .join('|')
        : '',
    [preloadedAcademicYears]
  );
  
  // Recurring event state
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState('daily');
  const [recurrenceInterval, setRecurrenceInterval] = useState(null);
  const [recurrenceIntervalText, setRecurrenceIntervalText] = useState('');
  const [recurrenceEndType, setRecurrenceEndType] = useState('never');
  const [recurrenceEndAfter, setRecurrenceEndAfter] = useState(null);
  const [recurrenceEndAfterText, setRecurrenceEndAfterText] = useState('');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(null);
  const [showEndDateCalendarPicker, setShowEndDateCalendarPicker] = useState(false);
  const [endDateCalendarViewMonth, setEndDateCalendarViewMonth] = useState(() => {
    try {
      const baseDate = new Date();
      const endDate = new Date(baseDate);
      endDate.setDate(endDate.getDate() + 30);
      return endDate;
    } catch (e) {
      return new Date();
    }
  });
  
  // Standards state
  const [attachedStandards, setAttachedStandards] = useState([]);
  const [showStandardsModal, setShowStandardsModal] = useState(false);

  // Grade percentage validation state
  const [percentValidationError, setPercentValidationError] = useState(null);
  const [percentValidationData, setPercentValidationData] = useState(null);
  const [checkingPercent, setCheckingPercent] = useState(false);
  const [loadingStandards, setLoadingStandards] = useState(false);
  const [standardsMastery, setStandardsMastery] = useState({}); // Map of standard_id -> mastery_level
  const [showAskParentHelpModal, setShowAskParentHelpModal] = useState(false);
  /** Assignment row linked to this event (if any), for child "Asked" / ask-another flow */
  const [eventLinkedHelpAssignment, setEventLinkedHelpAssignment] = useState(null);
  /** False until the first linked-assignment fetch finishes for this event+child (avoids Ask → Asked flash). Refresh keeps prior row until the new fetch completes. */
  const [linkedHelpReady, setLinkedHelpReady] = useState(false);
  const linkedHelpFetchSeq = useRef(0);
  /** When set, modal uses assignment path (follow-up); when null, uses eventContext (first ask) */
  const [askHelpModalAssignment, setAskHelpModalAssignment] = useState(null);
  const [showStudentHelpHistoryModal, setShowStudentHelpHistoryModal] = useState(false);
  const [parentLinkedAssignments, setParentLinkedAssignments] = useState([]);
  const [parentLinkedReady, setParentLinkedReady] = useState(false);
  const parentLinkedFetchSeq = useRef(0);
  const [showParentHelpModal, setShowParentHelpModal] = useState(false);
  const [parentHelpModalAssignment, setParentHelpModalAssignment] = useState(null);
  const [showParentSubmissionModal, setShowParentSubmissionModal] = useState(false);
  const [parentSubmissionModalAssignment, setParentSubmissionModalAssignment] = useState(null);
  const [showSendToStudentModal, setShowSendToStudentModal] = useState(false);
  const [sendToStudentNote, setSendToStudentNote] = useState('');
  const [sendToStudentSubmitting, setSendToStudentSubmitting] = useState(false);
  const [hasInvitedAssignee, setHasInvitedAssignee] = useState(false);

  const isParentView = useMemo(
    () => session?.role_flags?.isParent === true && session?.role_flags?.isChild !== true,
    [session?.role_flags?.isParent, session?.role_flags?.isChild]
  );

  const helpChildId = useMemo(
    () => event?.child_id || (assigneeIds.length > 0 ? assigneeIds[0] : null) || session?.child_id,
    [event?.child_id, assigneeIds, session?.child_id]
  );

  const hasInvitedAssigneeFromMembers = useMemo(() => {
    if (!assigneeIds?.length || !familyMembers?.length) return false;
    const wanted = new Set(assigneeIds.map(String));
    return (familyMembers || []).some((m) => {
      const role = String(m?.member_role || m?.role || '').toLowerCase();
      if (role !== 'child' && role !== 'student') return false;
      if (m?.child_id != null && wanted.has(String(m.child_id))) return true;
      let scope = m?.child_scope;
      if (typeof scope === 'string') {
        try { scope = JSON.parse(scope); } catch (_) { scope = []; }
      }
      if (Array.isArray(scope) && scope.some((id) => wanted.has(String(id)))) return true;
      // Some callsites pass child rows (id + name) instead of family_members rows.
      if (m?.id != null && wanted.has(String(m.id)) && role) return true;
      return false;
    });
  }, [assigneeIds, familyMembers]);

  const sendToStudentTargetLabel = useMemo(() => {
    if (!assigneeIds?.length) return 'No assignees selected';
    const names = assigneeIds
      .map((id) => {
        const member = (familyMembers || []).find((m) => String(m.id) === String(id));
        return (member?.name || member?.first_name || '').trim();
      })
      .filter(Boolean);
    if (names.length === 0) {
      return assigneeIds.length === 1 ? '1 student' : `${assigneeIds.length} students`;
    }
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  }, [assigneeIds, familyMembers]);

  useEffect(() => {
    if (!isParentView || !familyId || assigneeIds.length === 0) {
      setHasInvitedAssignee((prev) => (prev ? false : prev));
      return;
    }
    if (hasInvitedAssigneeFromMembers) {
      setHasInvitedAssignee((prev) => (prev ? prev : true));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('family_members')
          .select('child_id, child_scope, member_role')
          .eq('family_id', familyId)
          .in('member_role', ['child', 'student']);
        if (cancelled || error) {
          if (!cancelled) setHasInvitedAssignee((prev) => (prev ? false : prev));
          return;
        }
        const wanted = new Set(assigneeIds.map(String));
        const hasLinked = (data || []).some((m) => {
          if (m?.child_id != null && wanted.has(String(m.child_id))) return true;
          let scope = m?.child_scope;
          if (typeof scope === 'string') {
            try { scope = JSON.parse(scope); } catch (_) { scope = []; }
          }
          return Array.isArray(scope) && scope.some((id) => wanted.has(String(id)));
        });
        if (!cancelled) setHasInvitedAssignee((prev) => (prev === hasLinked ? prev : hasLinked));
      } catch (_) {
        if (!cancelled) setHasInvitedAssignee((prev) => (prev ? false : prev));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isParentView, familyId, assigneeIds, hasInvitedAssigneeFromMembers]);

  const loadEventLinkedHelpAssignment = useCallback(async () => {
    const et = event?.event_type || eventType;
    if (!familyId || !helpChildId || !event?.id || !session?.role_flags?.isChild) {
      setEventLinkedHelpAssignment((prev) => (prev == null ? prev : null));
      setLinkedHelpReady((prev) => (prev ? prev : true));
      return;
    }
    if (!isSchoolWorkEventType(et)) {
      setEventLinkedHelpAssignment((prev) => (prev == null ? prev : null));
      setLinkedHelpReady((prev) => (prev ? prev : true));
      return;
    }
    const mySeq = linkedHelpFetchSeq.current;
    try {
      const { data: rows, error } = await supabase
        .from('assignments')
        .select('id, need_help, title, description, linked_event_ids, updated_at, help_message_log')
        .eq('family_id', familyId)
        .eq('child_id', helpChildId)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (mySeq !== linkedHelpFetchSeq.current) return;
      if (error) {
        return;
      }
      const match = (rows || []).find((r) => assignmentRowLinksEventId(r, event.id)) || null;
      setEventLinkedHelpAssignment((prev) => {
        const prevId = prev?.id ? String(prev.id) : '';
        const nextId = match?.id ? String(match.id) : '';
        return prevId === nextId ? prev : match;
      });
    } catch {
      if (mySeq !== linkedHelpFetchSeq.current) return;
    } finally {
      if (mySeq === linkedHelpFetchSeq.current) {
        setLinkedHelpReady((prev) => (prev ? prev : true));
      }
    }
  }, [familyId, helpChildId, event?.id, event?.event_type, eventType, session?.role_flags?.isChild]);

  const loadEventLinkedParentAssignments = useCallback(async () => {
    const et = event?.event_type || eventType;
    if (!familyId || !event?.id || !isParentView) {
      setParentLinkedAssignments((prev) => (prev.length === 0 ? prev : []));
      setParentLinkedReady((prev) => (prev ? prev : true));
      return;
    }
    if (!isSchoolWorkEventType(et)) {
      setParentLinkedAssignments((prev) => (prev.length === 0 ? prev : []));
      setParentLinkedReady((prev) => (prev ? prev : true));
      return;
    }
    const mySeq = parentLinkedFetchSeq.current;
    try {
      const { data: rows, error } = await supabase
        .from('assignments')
        .select(
          '*, child:child_id (id, first_name, avatar), subject:related_subject (id, name)'
        )
        .eq('family_id', familyId)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (mySeq !== parentLinkedFetchSeq.current) return;
      if (error) {
        return;
      }
      const matches = (rows || []).filter((r) => assignmentRowLinksEventId(r, event.id));
      setParentLinkedAssignments((prev) => (sameIdList(prev, matches) ? prev : matches));
    } catch {
      if (mySeq !== parentLinkedFetchSeq.current) return;
    } finally {
      if (mySeq === parentLinkedFetchSeq.current) {
        setParentLinkedReady((prev) => (prev ? prev : true));
      }
    }
  }, [familyId, event?.id, event?.event_type, eventType, isParentView]);

  useEffect(() => {
    linkedHelpFetchSeq.current += 1;
    const et = event?.event_type || eventType;
    if (!familyId || !event?.id || !session?.role_flags?.isChild) {
      setEventLinkedHelpAssignment((prev) => (prev == null ? prev : null));
      setLinkedHelpReady((prev) => (prev ? prev : true));
      return;
    }
    if (!helpChildId || !isSchoolWorkEventType(et)) {
      setEventLinkedHelpAssignment((prev) => (prev == null ? prev : null));
      setLinkedHelpReady((prev) => (prev ? prev : true));
      return;
    }
    if (preloadedFamilyAssignments === null) {
      setEventLinkedHelpAssignment((prev) => (prev == null ? prev : null));
      setLinkedHelpReady((prev) => (prev ? false : prev));
      return;
    }
    const match =
      preloadedFamilyAssignments.find(
        (r) => String(r.child_id) === String(helpChildId) && assignmentRowLinksEventId(r, event.id)
      ) || null;
    setEventLinkedHelpAssignment((prev) => {
      const prevId = prev?.id ? String(prev.id) : '';
      const nextId = match?.id ? String(match.id) : '';
      return prevId === nextId ? prev : match;
    });
    setLinkedHelpReady((prev) => (prev ? prev : true));
  }, [event?.id, helpChildId, preloadedFamilyAssignments, session?.role_flags?.isChild, familyId, event?.event_type, eventType]);

  useEffect(() => {
    loadEventLinkedHelpAssignment();
  }, [loadEventLinkedHelpAssignment, preloadedFamilyAssignments]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = () => loadEventLinkedHelpAssignment();
    window.addEventListener('childAssignmentsNeedRefresh', handler);
    return () => window.removeEventListener('childAssignmentsNeedRefresh', handler);
  }, [loadEventLinkedHelpAssignment]);

  useEffect(() => {
    parentLinkedFetchSeq.current += 1;
    const et = event?.event_type || eventType;
    if (!isParentView || !familyId || !event?.id) {
      setParentLinkedAssignments((prev) => (prev.length === 0 ? prev : []));
      setParentLinkedReady((prev) => (prev ? prev : true));
      return;
    }
    if (!isSchoolWorkEventType(et)) {
      setParentLinkedAssignments((prev) => (prev.length === 0 ? prev : []));
      setParentLinkedReady((prev) => (prev ? prev : true));
      return;
    }
    if (preloadedFamilyAssignments === null) {
      setParentLinkedAssignments((prev) => (prev.length === 0 ? prev : []));
      setParentLinkedReady((prev) => (prev ? false : prev));
      return;
    }
    const matches = preloadedFamilyAssignments.filter((r) => assignmentRowLinksEventId(r, event.id));
    setParentLinkedAssignments((prev) => (sameIdList(prev, matches) ? prev : matches));
    setParentLinkedReady((prev) => (prev ? prev : true));
  }, [event?.id, event?.event_type, eventType, preloadedFamilyAssignments, isParentView, familyId]);

  useEffect(() => {
    loadEventLinkedParentAssignments();
  }, [loadEventLinkedParentAssignments, preloadedFamilyAssignments]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = () => loadEventLinkedParentAssignments();
    window.addEventListener('parentAssignmentsNeedRefresh', handler);
    return () => window.removeEventListener('parentAssignmentsNeedRefresh', handler);
  }, [loadEventLinkedParentAssignments]);

  useEffect(() => {
    if (!parentLinkedReady || !parentEventFocus) return;
    const helpA = parentLinkedAssignments.find((a) => a.need_help);
    const subA = parentLinkedAssignments.find(
      (a) =>
        a.status === 'submitted' &&
        (a.review_status == null || a.review_status === 'needs_revision')
    );
    if (parentEventFocus === 'help') {
      if (helpA) {
        setParentHelpModalAssignment(helpA);
        setShowParentHelpModal(true);
      }
      onParentEventFocusConsumed?.();
    } else if (parentEventFocus === 'submission') {
      if (subA) {
        setParentSubmissionModalAssignment(subA);
        setShowParentSubmissionModal(true);
      }
      onParentEventFocusConsumed?.();
    }
  }, [parentLinkedReady, parentEventFocus, parentLinkedAssignments, onParentEventFocusConsumed]);

  // Validation
  const [validationErrors, setValidationErrors] = useState({});
  
  // Conflict warning state
  const [conflictWarning, setConflictWarning] = useState(null); // { event: {...}, message: "..." }
  const [shouldAutoAdjust, setShouldAutoAdjust] = useState(false); // Flag for "Adjust automatically"
  const [shouldAllowOverlaps, setShouldAllowOverlaps] = useState(false); // Flag for "Save anyway"

  /** Planner chip warning → open modal: top banner (not Quick Reschedule directly) */
  const [chipConflictBannerDismissed, setChipConflictBannerDismissed] = useState(false);
  const [chipConflictMessage, setChipConflictMessage] = useState(null);
  const [chipConflictSuggestion, setChipConflictSuggestion] = useState(null);
  const [chipConflictLoading, setChipConflictLoading] = useState(false);
  const onEditingChangeRef = useRef(onEditingChange);
  const lastHydratedEventSignatureRef = useRef(null);
  const lastMaterialsLoadKeyRef = useRef('');
  const lastSubjectsLoadKeyRef = useRef('');
  const lastChipConflictHydrationKeyRef = useRef('');

  const editConflictEnterOp = useRef(new Animated.Value(0)).current;
  const editConflictEnterY = useRef(new Animated.Value(5)).current;
  const chipConflictEnterOp = useRef(new Animated.Value(0)).current;
  const chipConflictEnterY = useRef(new Animated.Value(5)).current;

  useEffect(() => {
    onEditingChangeRef.current = onEditingChange;
  }, [onEditingChange]);

  useEffect(() => {
    setChipConflictBannerDismissed((prev) => (prev ? false : prev));
    setChipConflictMessage((prev) => (prev == null ? prev : null));
    setChipConflictSuggestion((prev) => (prev == null ? prev : null));
    setChipConflictLoading((prev) => (prev ? false : prev));
    lastChipConflictHydrationKeyRef.current = '';
  }, [event?.id, conflictResolutionSignature]);

  useEffect(() => {
    const shouldHydrateFromContext =
      openConflictResolution ||
      !!conflictResolutionContext?.conflictEvent ||
      !!conflictResolutionContext?.conflictMessage;
    if (!shouldHydrateFromContext || chipConflictBannerDismissed || !event?.id) return;

    const hydrationKey = `${String(event.id)}:${conflictResolutionSignature}:${openConflictResolution ? 'open' : 'closed'}`;
    if (lastChipConflictHydrationKeyRef.current === hydrationKey) return;
    lastChipConflictHydrationKeyRef.current = hydrationKey;

    const contextMessage = conflictResolutionContext?.conflictMessage;
    const contextConflictEvent = conflictResolutionContext?.conflictEvent;
    if (contextMessage) {
      setChipConflictMessage((prev) => (prev === contextMessage ? prev : contextMessage));
    } else if (contextConflictEvent?.title) {
      const who = assigneeLabelForConflict(assigneeIds, familyMembers);
      const lead = who ? `${who} — ` : '';
      const nextMsg = `${lead}${contextConflictEvent.title} (${formatConflictMetaFromEvent(contextConflictEvent).replace(' · ', ', ')})`;
      setChipConflictMessage((prev) => (prev === nextMsg ? prev : nextMsg));
    }

    if (conflictResolutionContext?.suggestedChange) {
      setChipConflictSuggestion((prev) => {
        const prevSig = prev
          ? `${String(prev.newStart || prev.new_start || '')}|${String(prev.newEnd || prev.new_end || '')}`
          : '';
        const next = conflictResolutionContext.suggestedChange;
        const nextSig = `${String(next.newStart || next.new_start || '')}|${String(next.newEnd || next.new_end || '')}`;
        return prevSig === nextSig ? prev : next;
      });
    } else if (contextMessage || contextConflictEvent) {
      setChipConflictSuggestion((prev) => (prev == null ? prev : null));
    }

    setChipConflictLoading((prev) => (prev ? false : prev));
  }, [
    event?.id,
    openConflictResolution,
    chipConflictBannerDismissed,
    conflictResolutionSignature,
    assigneeIdsSignature,
    familyMembersSignature,
  ]);

  const mergeDescriptionWithNote = (prev, note) => {
    const n = (note || '').trim();
    if (!n) return prev || null;
    const p = (prev || '').trim();
    return p ? `${p}\n\n${n}` : n;
  };

  const sendWorkToStudents = useCallback(
    async (note) => {
      if (!familyId || !event?.id || assigneeIds.length === 0) {
        toast.push('Choose at least one student and save the event first.', 'error');
        return;
      }
      const uid = authUser?.id;
      if (!uid) {
        toast.push('You must be signed in.', 'error');
        return;
      }
      if (!isSchoolWorkEventType(event?.event_type || eventType)) {
        toast.push('This only applies to schoolwork-style events.', 'info');
        return;
      }
      setSendToStudentSubmitting(true);
      try {
        const eventIdStr = String(event.id);
        const dueTs = event.due_ts || event.end_ts || event.start_ts;
        const dueStr = dueTs ? new Date(dueTs).toISOString().split('T')[0] : null;
        const titleBase = (draftTitle || event.title || 'Schoolwork').trim().slice(0, 200);

        for (const childId of assigneeIds) {
          const { data: rows, error: findErr } = await supabase
            .from('assignments')
            .select('id, title, description, linked_event_ids, need_help')
            .eq('family_id', familyId)
            .eq('child_id', childId)
            .order('updated_at', { ascending: false })
            .limit(200);

          if (findErr) throw findErr;

          const linked =
            (rows || []).find((r) => assignmentRowLinksEventId(r, eventIdStr)) || null;

          const noteTrim = (note || '').trim();

          if (linked?.id) {
            const baseUpdates = {
              assigned_by: uid,
              status: 'not_started',
            };
            if (isChildHelpAssignment(linked)) {
              baseUpdates.title = titleBase;
              baseUpdates.need_help = false;
            }
            if (noteTrim) {
              baseUpdates.description = mergeDescriptionWithNote(linked.description, noteTrim);
            }
            const { error: upErr } = await updateAssignment(linked.id, baseUpdates);
            if (upErr) throw upErr;
          } else {
            const { error: insErr } = await createAssignment({
              family_id: familyId,
              child_id: childId,
              title: titleBase,
              description: noteTrim || null,
              assigned_by: uid,
              related_subject: subjectId || null,
              due_date: dueStr,
              status: 'not_started',
              linked_event_ids: [eventIdStr],
              need_help: false,
            });
            if (insErr) throw insErr;
          }
        }

        toast.push('Sent to student', 'success');
        setShowSendToStudentModal(false);
        setSendToStudentNote('');
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('childAssignmentsNeedRefresh'));
          window.dispatchEvent(new CustomEvent('parentAssignmentsNeedRefresh'));
        }
      } catch (e) {
        console.error('[EventDetails] sendWorkToStudents', e);
        toast.push(e?.message || 'Could not send', 'error');
      } finally {
        setSendToStudentSubmitting(false);
      }
    },
    [familyId, event, assigneeIds, authUser?.id, draftTitle, eventType, subjectId, toast]
  );

  const startPeriod = useMemo(() => {
    if (!draftStartTime) return null;
    const upper = draftStartTime.toUpperCase();
    if (upper.includes('AM') && !upper.includes('PM')) return 'AM';
    if (upper.includes('PM')) return 'PM';
    return null;
  }, [draftStartTime]);

  const endPeriod = useMemo(() => {
    if (!draftEndTime) return null;
    const upper = draftEndTime.toUpperCase();
    if (upper.includes('AM') && !upper.includes('PM')) return 'AM';
    if (upper.includes('PM')) return 'PM';
    return null;
  }, [draftEndTime]);

  const statusOptions = useMemo(() => {
    const current = normalizeStatus(event?.status);
    return Array.from(new Set([...STATUS_BASE, current].filter(Boolean)));
  }, [event?.status]);

  // Helper functions matching TaskCreateModal
  const showAcademicFields = () => {
    return eventType && ['Lesson', 'Activity', 'Assignment', 'Class Day', 'Scheduled Class Day', 'Schedule Block', 'ClassDay'].includes(eventType);
  };

  const showLocationFields = () => {
    return eventType && ['Appointment', 'Activity'].includes(eventType);
  };

  const validateFields = () => {
    const errors = {};
    
    if (!draftTitle.trim()) {
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
    
    if (assigneeIds.length === 0) {
      errors.assignee = 'At least one assignee is required';
    }

    if (isRecurring && placement === 'calendar') {
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
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const isFormValid = () => {
    if (!draftTitle.trim()) return false;
    if (assigneeIds.length === 0) return false;
    if (!dueDate) return false;
    if (placement === 'calendar' && !allDay && !startTime.trim()) return false;
    if (!eventType) return false;
    const isMultiDayEvent = false; // No multi-day events in new system
    if (isMultiDayEvent && placement === 'calendar' && !eventEndDate) return false;
    if (isRecurring && placement === 'calendar') {
      if (recurrenceEndType === 'after') {
        const fromNum = recurrenceEndAfter != null ? Number(recurrenceEndAfter) : NaN;
        const fromText = recurrenceEndAfterText ? parseInt(recurrenceEndAfterText, 10) : NaN;
        const countValue =
          Number.isFinite(fromNum) && fromNum >= 1 ? fromNum : fromText;
        if (!Number.isFinite(countValue) || countValue < 1) return false;
      } else if (recurrenceEndType === 'on' && !recurrenceEndDate) {
        return false;
      }
    }
    return true;
  };

  useEffect(() => {
    if (!dueDate) return;
    setValidationErrors((prev) => {
      if (!prev.date) return prev;
      const next = { ...prev };
      delete next.date;
      return next;
    });
  }, [dueDate]);

  useEffect(() => {
    if (assigneeIds.length === 0) return;
    setValidationErrors((prev) => {
      if (!prev.assignee) return prev;
      const next = { ...prev };
      delete next.assignee;
      return next;
    });
  }, [assigneeIds]);

  // Handle scheduling mode changes - when initialSchedulingMode becomes true, 
  // set editing and schedulingBacklog states and placement to 'calendar'
  // Also check for _openInEditMode flag on the event itself
  useEffect(() => {
    if (readOnly) return;
    const shouldOpenInEditMode = initialSchedulingMode || event?._openInEditMode;
    if (shouldOpenInEditMode) {
      console.log('[EventDetails] Opening in edit mode - initialSchedulingMode:', initialSchedulingMode, '_openInEditMode:', event?._openInEditMode);
      setEditing(true);
      if (initialSchedulingMode || event?._openInEditMode) {
        setSchedulingBacklog(true);
        setPlacement('calendar');
      }
      // Also notify parent that we're in editing mode
      onEditingChangeRef.current?.(true);
    }
  }, [readOnly, initialSchedulingMode, event?._openInEditMode]);

  // Avoid probing lesson_standards on every modal open.
  // The table is not available in all environments, and eager loading
  // creates a noisy 404 even when the standards UI is unused.

  const loadAttachedStandards = async () => {
    if (!event?.id) return;
    if (lessonStandardsUnavailableSession) {
      setAttachedStandards([]);
      setLoadingStandards(false);
      return;
    }
    setLoadingStandards(true);
    try {
      // Avoid standards(*) embed: PostgREST returns PGRST200 if no FK to standards in schema cache.
      const { data: links, error } = await supabase
        .from('lesson_standards')
        .select('standard_id')
        .eq('lesson_id', event.id);

      if (error) throw error;

      const linkStandardIds = [...new Set((links || []).map((r) => r.standard_id).filter(Boolean))];
      let loadedStandards = [];
      if (linkStandardIds.length === 0) {
        setAttachedStandards([]);
      } else {
        const { data: stdRows, error: stdErr } = await supabase
          .from('standards')
          .select('*')
          .in('id', linkStandardIds);

        if (stdErr) throw stdErr;

        loadedStandards = (stdRows || []).map((row) => ({
          id: row.id,
          ...row,
        }));
        setAttachedStandards(loadedStandards);
      }

      // Load mastery levels if event is done and has a student
      if (event.status === 'done' && event.child_id) {
        const standardIds = loadedStandards.map((s) => s.id);
        if (standardIds.length > 0) {
          const { data: masteryData, error: masteryError } = await supabase
            .from('student_standard_mastery')
            .select('standard_id, mastery_level')
            .eq('student_id', event.child_id)
            .in('standard_id', standardIds);
          
          if (!masteryError && masteryData) {
            const masteryMap = {};
            masteryData.forEach(m => {
              masteryMap[m.standard_id] = m.mastery_level;
            });
            setStandardsMastery(masteryMap);
          }
        }
      }
    } catch (error) {
      // lesson_standards may be missing or RLS may return 400; show no standards instead of failing
      const msg = String(error?.message || error?.details || error || '').toLowerCase();
      const status = error?.status;
      if (
        status === 404 ||
        msg.includes('404') ||
        msg.includes('lesson_standards') ||
        msg.includes('failed to load resource') ||
        msg.includes('relation') ||
        msg.includes('does not exist')
      ) {
        lessonStandardsUnavailableSession = true;
      }
      setAttachedStandards([]);
    } finally {
      setLoadingStandards(false);
    }
  };

  const handleMaterialDropdownToggle = () => {
    const willShow = !showMaterialDropdown;
    
    if (willShow && Platform.OS === 'web' && materialButtonRef.current) {
      // Calculate position before showing dropdown
      const node = materialButtonRef.current._nativeNode || materialButtonRef.current;
      if (node && typeof node.getBoundingClientRect === 'function') {
        const rect = node.getBoundingClientRect();
        const dropdownMaxHeight = 300;
        
        // Position below the button (like subject dropdown)
        const top = rect.bottom + 4;
        
        const newPosition = {
          top: top,
          left: rect.left,
          width: rect.width, // Match the selector box width exactly
          maxHeight: dropdownMaxHeight,
        };
        setMaterialDropdownPosition(newPosition);
      }
    }
    
    setShowMaterialDropdown(willShow);
  };

  const handleAttachStandards = async (standards) => {
    if (!event?.id) return;
    
    try {
      const { error } = await apiRequest('/api/standards/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson_id: event.id,
          standards: standards.map(s => s.id),
        }),
      });
      
      if (error) throw error;
      
      setAttachedStandards(standards);
      onEventUpdated?.();
    } catch (error) {
      Alert.alert('Error', 'Failed to attach standards');
    }
  };

  const handleRemoveStandard = async (standardId) => {
    if (!event?.id) return;
    
    try {
      const { error } = await supabase
        .from('lesson_standards')
        .delete()
        .eq('lesson_id', event.id)
        .eq('standard_id', standardId);
      
      if (error) throw error;
      
      setAttachedStandards(prev => prev.filter(s => s.id !== standardId));
      setStandardsMastery(prev => {
        const next = { ...prev };
        delete next[standardId];
        return next;
      });
      onEventUpdated?.();
    } catch (error) {
      Alert.alert('Error', 'Failed to remove standard');
    }
  };

  const handleMasteryUpdate = async (data) => {
    if (!event?.child_id) return;
    
    try {
      const { error } = await apiRequest('/api/standards/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (error) throw error;
      
      setStandardsMastery(prev => ({
        ...prev,
        [data.standard_id]: data.mastery_level,
      }));
      onEventUpdated?.();
    } catch (error) {
      Alert.alert('Error', 'Failed to update mastery level');
    }
  };

  // Notify parent when editing state changes
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      console.log('[EventDetails] Notifying parent of editing state:', editing);
    }
    onEditingChangeRef.current?.(editing);
  }, [editing]);

  // Update material dropdown position on scroll/resize when visible
  useEffect(() => {
    if (showMaterialDropdown && Platform.OS === 'web' && materialButtonRef.current) {
      const updatePosition = () => {
        if (materialButtonRef.current) {
          const node = materialButtonRef.current._nativeNode || materialButtonRef.current;
          if (node && typeof node.getBoundingClientRect === 'function') {
            const rect = node.getBoundingClientRect();
            const dropdownMaxHeight = 300;
            
            // Position below the button (like subject dropdown)
            const top = rect.bottom + 4;
            
            const newPosition = {
              top: top,
              left: rect.left,
              width: rect.width, // Match the selector box width exactly
              maxHeight: dropdownMaxHeight,
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
          }
        }
      };
      
      // Update on scroll/resize
      if (typeof window !== 'undefined') {
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        
        return () => {
          window.removeEventListener('scroll', updatePosition, true);
          window.removeEventListener('resize', updatePosition);
        };
      }
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
            setSubjectDropdownPosition((prev) => {
              if (
                prev?.top === newPosition.top &&
                prev?.left === newPosition.left &&
                prev?.width === newPosition.width
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

  useEffect(() => {
    if (!event) return;

    const recurrenceSignature =
      event.recurrence_rule == null
        ? ''
        : (typeof event.recurrence_rule === 'string'
          ? event.recurrence_rule
          : JSON.stringify(event.recurrence_rule));
    const eventSignature = [
      String(event.id || ''),
      String(event.updated_at || ''),
      String(event.start_ts || event.start || event.start_local || ''),
      String(event.end_ts || event.end || event.end_local || ''),
      String(event.status || ''),
      String(event.event_type || ''),
      String(event.subject_id || ''),
      String(event.child_id || ''),
      Array.isArray(event.child_ids) ? event.child_ids.map(String).join(',') : '',
      String(event.material_id || ''),
      recurrenceSignature,
      String(event.is_backlog === true || event.data?.is_backlog === true),
      String(initialSchedulingMode === true),
    ].join('|');
    if (lastHydratedEventSignatureRef.current === eventSignature) {
      return;
    }
    lastHydratedEventSignatureRef.current = eventSignature;

    const startTs = getTimestamp(event, ['start_ts', 'start', 'start_local']);
    const endTs = getTimestamp(event, ['end_ts', 'end', 'end_local']);

    // Title
    setDraftTitle(event.title || '');
    
    // Date handling
    const dateString = toDateInput(startTs);
    const dateObj = startTs ? new Date(startTs) : new Date();
    setDraftDate(dateString || (event.is_backlog === true || event.data?.is_backlog === true ? new Date().toISOString().split('T')[0] : ''));
    setDueDate(dateObj);
    setCalendarViewMonth(dateObj);
    
    // End date for multi-day events (Project, Trip, Holiday, Other)
    // Check if this is a multi-day event type
    const isMultiDayEventType = event.event_type && ['Project', 'Trip', 'Holiday', 'Other'].includes(event.event_type);
    if (endTs && isMultiDayEventType) {
      const endDateObj = new Date(endTs);
      const startDateObj = startTs ? new Date(startTs) : null;
      
      // Always load the end date for multi-day events, even if same day
      // The user can change it if needed
      if (startDateObj) {
        // Extract just the date part (ignore time) for the end date picker
        const endDateOnly = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate());
        const startDateOnly = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
        
        console.log('[EventDetails] Loading end date for multi-day event:', {
          event_type: event.event_type,
          start_ts: startTs,
          end_ts: endTs,
          startDateObj: startDateObj.toISOString(),
          endDateObj: endDateObj.toISOString(),
          startDateOnly: startDateOnly.toISOString(),
          endDateOnly: endDateOnly.toISOString(),
          areSameDay: startDateOnly.getTime() === endDateOnly.getTime()
        });
        
        setEventEndDate(endDateOnly);
        setEventEndDateCalendarViewMonth(endDateOnly);
      } else {
        setEventEndDate(null);
      }
    } else {
      setEventEndDate(null);
    }
    
    // Placement (calendar vs backlog)
    // If initialSchedulingMode is true, set to 'calendar' to show date/time pickers
    const isBacklog = event.is_backlog === true || event.data?.is_backlog === true;
    setPlacement(initialSchedulingMode ? 'calendar' : (isBacklog ? 'backlog' : 'calendar'));

    // All day inference
    const inferredAllDay =
      !!startTs &&
      (() => {
        try {
          const startDate = new Date(startTs);
          const endDate = endTs ? new Date(endTs) : null;
          const startIsMidnight = startDate.getHours() === 0 && startDate.getMinutes() === 0;
          const endIsMidnight = endDate ? endDate.getHours() === 0 && endDate.getMinutes() === 0 : true;

          if (startIsMidnight && endIsMidnight) {
            return true;
          }
        } catch {
          return false;
        }
        return false;
      })();

    setDraftAllDay(inferredAllDay || (!startTs && !endTs));
    setAllDay(inferredAllDay || (!startTs && !endTs));

    // Time handling: prefer start_local/end_local from RPC (family timezone) so plan times display correctly
    if (inferredAllDay) {
      setDraftStartTime('');
      setDraftEndTime('');
      setStartTime('');
      setEndTime('');
    } else {
      const startFromLocal = timeStringToDisplay(event.start_local);
      const endFromLocal = timeStringToDisplay(event.end_local);
      const startTimeStr = startFromLocal || toTimeInput(startTs);
      const endTimeStr = endFromLocal || toTimeInput(endTs);
      setDraftStartTime(startTimeStr);
      setDraftEndTime(endTimeStr);
      setStartTime(startTimeStr || DEFAULT_START_TIME);
      setEndTime(endTimeStr || '');
    }
    
    // Assignees
    // For flexible events with overlaps, child_id might be null but child_ids array contains the assignment
    // Check child_id first, then child_ids array, then child object
    const childId = event.child_id || 
                    (event.child_ids && event.child_ids.length > 0 ? event.child_ids[0] : null) || 
                    event.childId || 
                    event.child?.id || 
                    null;
    
    setDraftChildId(childId);
    // Use child_ids array if available, otherwise use child_id if it exists
    const assigneeIdsArray = event.child_ids && event.child_ids.length > 0 
      ? event.child_ids 
      : (childId ? [childId] : []);
    setAssigneeIds(assigneeIdsArray);
    
    // Notes
    const notesStr = event.description || event.notes || '';
    setDraftNotes(notesStr);
    setNotes(notesStr);
    
    // Status
    setDraftStatus(normalizeStatus(event.status));
    
    // Tags
    setDraftTags(Array.isArray(event.tags) ? event.tags : []);
    setTagInput('');
    
    // Event type (display class day variants consistently as "Class Day")
    setEventType(normalizeEventTypeForDisplay(event.event_type || 'Lesson'));
    
    // Academic fields
    setSubjectId(event.subject_id || null);
    setCountsTowardPlan(event.counts_toward_plan !== false);
    const loadedType = normalizeEventTypeForDisplay(event.event_type || 'Lesson');
    setShowRequiresSubmissionHome(
      typeof event.requires_submission_home === 'boolean'
        ? event.requires_submission_home
        : defaultRequiresSubmissionHomeForEventType(
            loadedType === 'Class Day' ? 'Lesson' : loadedType
          )
    );
    setAcademicYearId(event.academic_year_id || null);
    setInstructionalMinutesOverride(event.instructional_minutes != null ? String(event.instructional_minutes) : '');
    const unitStr = ((event.unit || event.curriculum_unit_title || '') + '').trim();
    setUnit(unitStr);
    const cm = parseCurriculumMetadata(event);
    let lessonStr =
      (event.lesson && String(event.lesson).trim()) ||
      (cm.lesson_label && String(cm.lesson_label).trim()) ||
      '';
    if (!lessonStr && event.curriculum_lesson_id && event.title) {
      lessonStr = String(event.title).trim();
    }
    setLesson(lessonStr);
    setGrade(event.grade || '');
    setPercentOfTotalGrade(event.percent_of_total_grade ? event.percent_of_total_grade.toString() : '');
    
    // Location fields
    setLocation(event.location || '');
    setMode(event.mode || '');
    setConnectedCalendarTargets([]);
    setInstructor(event.instructor || '');
    setGoalLink(event.goal_link || null);
    
    // Auto-expand sections if they have content
    const hasLogisticDetails = !!(event.location || event.mode || event.instructor);
    setShowLogisticDetails(hasLogisticDetails);
    setShowAcademicDetails(eventHasAcademicDetailsSection(event));
    
    // Materials
    setDraftMaterialId(event.material_id || null);
    setSelectedMaterialId(event.material_id || null);
    setAttachedMaterialIds(event.materials_attachment_ids || (event.material_id ? [event.material_id] : []));
    
    // Recurring event
    if (event.recurrence_rule) {
      try {
        const rule = typeof event.recurrence_rule === 'string' ? JSON.parse(event.recurrence_rule) : event.recurrence_rule;
        setIsRecurring(true);
        setRecurrenceType(rule.frequency?.toLowerCase() || 'daily');
        setRecurrenceInterval(rule.interval || null);
        setRecurrenceIntervalText(rule.interval ? rule.interval.toString() : '');
        if (rule.count) {
          setRecurrenceEndType('after');
          setRecurrenceEndAfter(rule.count);
          setRecurrenceEndAfterText(rule.count.toString());
        } else if (rule.until) {
          setRecurrenceEndType('on');
          setRecurrenceEndDate(new Date(rule.until));
        } else {
          setRecurrenceEndType('never');
        }
      } catch (e) {
        // Invalid recurrence rule, ignore
      }
    } else if (isPartOfRecurringSeries(event) || isPlanYearBlockSeries(event)) {
      // Instance rows may omit recurrence_rule; master fetch fills RRULE details. Plan-year slots share a block id.
      setIsRecurring(true);
      setRecurrenceType('weekly');
      setRecurrenceInterval(null);
      setRecurrenceIntervalText('');
      setRecurrenceEndType('never');
      setRecurrenceEndAfter(null);
      setRecurrenceEndAfterText('');
      setRecurrenceEndDate(null);
    } else {
      setIsRecurring(false);
      setRecurrenceType('daily');
      setRecurrenceInterval(null);
      setRecurrenceIntervalText('');
      setRecurrenceEndType('never');
      setRecurrenceEndAfter(null);
      setRecurrenceEndAfterText('');
      setRecurrenceEndDate(null);
    }
    
    // Only reset schedulingBacklog if not in initial scheduling mode
    if (!initialSchedulingMode) {
      setSchedulingBacklog(false);
    }
  }, [event, initialSchedulingMode]);

  // Recurring instances often omit recurrence_rule on the row; load the series master's rule for the toggle + recurrence UI.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!event?.id || event.recurrence_rule) return;
      if (!isPartOfRecurringSeries(event) || isPlanYearBlockSeries(event)) return;
      const masterId = event.parent_event_id || event.recurrence_id;
      const selfId = cleanPlannerEventId(String(event.id));
      if (!masterId || masterId === selfId) return;
      const { data, error } = await supabase
        .from('events')
        .select('recurrence_rule')
        .eq('id', masterId)
        .maybeSingle();
      if (cancelled || error || !data?.recurrence_rule) return;
      try {
        const rule = typeof data.recurrence_rule === 'string' ? JSON.parse(data.recurrence_rule) : data.recurrence_rule;
        setIsRecurring(true);
        setRecurrenceType(rule.frequency?.toLowerCase() || 'daily');
        setRecurrenceInterval(rule.interval || null);
        setRecurrenceIntervalText(rule.interval ? rule.interval.toString() : '');
        if (rule.count) {
          setRecurrenceEndType('after');
          setRecurrenceEndAfter(rule.count);
          setRecurrenceEndAfterText(rule.count.toString());
        } else if (rule.until) {
          setRecurrenceEndType('on');
          setRecurrenceEndDate(new Date(rule.until));
        } else {
          setRecurrenceEndType('never');
        }
      } catch (_) {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event?.id, event?.recurrence_rule, event?.parent_event_id, event?.recurrence_id, event?.generated_by, event?.source_block_id]);

  // Load materials when event opens (guarded against repeated same-key execution).
  useEffect(() => {
    if (!familyId || !event?.id) return;
    const loadKey = `${familyId}:${event.id}`;
    if (lastMaterialsLoadKeyRef.current === loadKey) return;
    lastMaterialsLoadKeyRef.current = loadKey;
    loadMaterials();
  }, [familyId, event?.id]);

  // Load subject-related data (guarded against repeated same-key execution).
  useEffect(() => {
    if (!familyId || !event?.id) return;
    const loadKey = `${familyId}:${event.id}:${assigneeIdsSignature}:${preloadedSubjectsSignature}`;
    if (lastSubjectsLoadKeyRef.current === loadKey) return;
    lastSubjectsLoadKeyRef.current = loadKey;

    const hasPreloaded =
      Array.isArray(preloadedSubjects) &&
      preloadedSubjects.length > 0 &&
      assigneeIds.length > 0;
    if (hasPreloaded) {
      const nextSubjects = filterSubjectsForAssignees(preloadedSubjects, assigneeIds);
      setSubjects((prev) => {
        const prevIds = (prev || []).map((s) => String(s?.id || '')).join('|');
        const nextIds = (nextSubjects || []).map((s) => String(s?.id || '')).join('|');
        return prevIds === nextIds ? prev : nextSubjects;
      });
    }
    fetchSubjects({ background: hasPreloaded });
    if (assigneeIds.length > 0) {
      fetchSubjectGoals(assigneeIds[0]);
    }
  }, [familyId, event?.id, assigneeIdsSignature, preloadedSubjectsSignature]);

  // Merge shell preloaded academic years into list (same shape as fetch; keeps rows merged from event-specific fetch)
  useEffect(() => {
    if (!Array.isArray(preloadedAcademicYears) || preloadedAcademicYears.length === 0) return;
    setAcademicYears((prev) => {
      const byId = new Map((prev || []).map((a) => [a.id, a]));
      preloadedAcademicYears.forEach((a) => {
        if (a?.id) byId.set(a.id, a);
      });
      const next = Array.from(byId.values()).sort((a, b) => {
        const sa = a.start_date ? String(a.start_date).slice(0, 10) : '';
        const sb = b.start_date ? String(b.start_date).slice(0, 10) : '';
        return sb.localeCompare(sa);
      });
      const prevSig = (prev || [])
        .map((a) => `${String(a?.id || '')}:${String(a?.start_date || '')}:${String(a?.end_date || '')}`)
        .join('|');
      const nextSig = next
        .map((a) => `${String(a?.id || '')}:${String(a?.start_date || '')}:${String(a?.end_date || '')}`)
        .join('|');
      return prevSig === nextSig ? prev : next;
    });
  }, [preloadedAcademicYearsSignature]);

  // Load academic years for Instructional accounting (Counts toward year plan → Plan dropdown)
  useEffect(() => {
    if (!familyId) {
      setAcademicYears([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('academic_years')
        .select('id, start_date, end_date, year_name')
        .eq('family_id', familyId)
        .order('updated_at', { ascending: false })
        .limit(24);
      if (cancelled) return;
      if (error) {
        if (!(Array.isArray(preloadedAcademicYears) && preloadedAcademicYears.length > 0)) {
          setAcademicYears([]);
        }
        return;
      }
      // One chip per plan: dedupe by date range so we show only one row per plan (the most recent, with friendly name)
      const seen = new Set();
      let list = (data || []).filter((ay) => {
        const start = (ay.start_date && String(ay.start_date).slice(0, 10)) || '';
        const end = (ay.end_date && String(ay.end_date).slice(0, 10)) || '';
        const key = `${start}_${end}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // This event may reference a year row that was dropped by dedupe (same date range, different id) — always include it.
      if (academicYearId && !list.some((a) => a.id === academicYearId)) {
        const { data: linkedRow } = await supabase
          .from('academic_years')
          .select('id, start_date, end_date, year_name')
          .eq('id', academicYearId)
          .eq('family_id', familyId)
          .maybeSingle();
        if (!cancelled && linkedRow) {
          list = [linkedRow, ...list];
        }
      }
      if (!cancelled) {
        setAcademicYears((prev) => {
          const prevSig = (prev || [])
            .map((a) => `${String(a?.id || '')}:${String(a?.start_date || '')}:${String(a?.end_date || '')}`)
            .join('|');
          const nextSig = (list || [])
            .map((a) => `${String(a?.id || '')}:${String(a?.start_date || '')}:${String(a?.end_date || '')}`)
            .join('|');
          return prevSig === nextSig ? prev : list;
        });
      }
    })();
    return () => { cancelled = true; };
  }, [familyId, preloadedAcademicYearsSignature, academicYearId]);

  // When academic_year_id is set after the list query, or preloaded list omitted this id, merge the row in.
  useEffect(() => {
    if (!familyId || !academicYearId) return;
    let cancelled = false;
    (async () => {
      const { data: one, error } = await supabase
        .from('academic_years')
        .select('id, start_date, end_date, year_name')
        .eq('id', academicYearId)
        .eq('family_id', familyId)
        .maybeSingle();
      if (cancelled || error || !one) return;
      setAcademicYears((prev) => {
        if (prev.some((a) => a.id === one.id)) return prev;
        return [one, ...prev];
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId, academicYearId]);

  // Check grade percentage sum when percentOfTotalGrade or subjectId changes (for editing)
  useEffect(() => {
    const checkPercentSum = async () => {
      // Only check if we have a subject and a percentage value, and if we're editing
      if (!editing || !subjectId || !percentOfTotalGrade.trim()) {
        setPercentValidationError(null);
        setPercentValidationData(null);
        return;
      }

      const parsedPercent = parseFloat(percentOfTotalGrade.trim());
      
      // Check for invalid number format
      if (isNaN(parsedPercent) || !isFinite(parsedPercent)) {
        setPercentValidationError({
          message: 'Please enter a valid number between 0 and 100',
          suggestedPercent: null
        });
        setPercentValidationData(null);
        return;
      }

      // Check for values outside 0-100 range
      if (parsedPercent < 0 || parsedPercent > 100) {
        setPercentValidationError({
          message: 'Percentage must be between 0 and 100%',
          suggestedPercent: parsedPercent > 100 ? 100 : 0
        });
        setPercentValidationData(null);
        return;
      }

      setCheckingPercent(true);
      try {
        const { data, error } = await supabase.rpc('get_subject_grade_percentage_sum', {
          p_subject_id: subjectId,
          p_exclude_event_id: event?.id || null // Exclude current event when editing
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
  }, [editing, subjectId, percentOfTotalGrade, event?.id]);

  const loadMaterials = async () => {
    if (!familyId) return;
    setLoadingMaterials(true);
    try {
      // Load all materials (now includes both purchased materials and uploaded files)
      const materialsData = await getMaterials(familyId, {}, session);
      console.log('[EventDetails] Loaded materials:', materialsData?.length || 0);
      
      setMaterials((prev) => (sameIdList(prev, materialsData || []) ? prev : (materialsData || [])));
      if (materialsData.length === 0) {
        console.warn('[EventDetails] No materials found for familyId:', familyId);
      }
    } catch (error) {
      console.error('[EventDetails] Failed to load materials:', error);
    } finally {
      setLoadingMaterials(false);
    }
  };

  const loadMaterialsRef = useRef(loadMaterials);
  loadMaterialsRef.current = loadMaterials;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !familyId) return;
    const onMaterialsRefresh = (e) => {
      const fid = e?.detail?.familyId;
      if (fid && fid !== familyId) return;
      loadMaterialsRef.current?.();
    };
    window.addEventListener('refreshMaterials', onMaterialsRefresh);
    return () => window.removeEventListener('refreshMaterials', onMaterialsRefresh);
  }, [familyId]);

  const fetchSubjects = async (opts = {}) => {
    const background = opts.background === true;
    if (!familyId) return;
    if (!background) setLoadingSubjects(true);
    try {
      // If no assignees selected, show no subjects (user must select assignee first)
      if (assigneeIds.length === 0) {
        setSubjects([]);
        return;
      }

      const { data: allSubjects, error: allError } = await supabase
        .from('subject')
        .select('id, name, child_id')
        .eq('family_id', familyId);

      if (allError) {
        console.error('Error fetching all subjects:', allError);
        throw allError;
      }

      const filteredSubjects = filterSubjectsForAssignees(allSubjects, assigneeIds);
      setSubjects((prev) => {
        const prevSig = (prev || []).map((s) => String(s?.id || '')).join('|');
        const nextSig = (filteredSubjects || []).map((s) => String(s?.id || '')).join('|');
        return prevSig === nextSig ? prev : filteredSubjects;
      });
    } catch (error) {
      console.error('Error in fetchSubjects:', error);
      if (!background) setSubjects([]);
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
        if (error.code === 'PGRST301' || error.status === 403 || error.message?.includes('permission')) {
          setSubjectGoals([]);
          return;
        }
        throw error;
      }
      setSubjectGoals(data || []);
    } catch (error) {
      setSubjectGoals([]);
    }
  };

  const childName =
    event?.child?.first_name ||
    event?.child?.name ||
    event?.childName ||
    event?.child_name ||
    (Array.isArray(event?.assignees) && event.assignees.length ? event.assignees.join(', ') : null);

  const subjectName = event?.subject?.name || event?.subject || event?.subjectName || event?.subject_name || (event?.generated_by === 'plan_year' && event?.title) || null;

  /** Stable subject label: local list → preload → embedded event subject (avoids "Unknown" flash). */
  const resolvedSubjectLabel = useMemo(() => {
    if (!subjectId) return null;
    const fromState = subjects.find((s) => s.id === subjectId)?.name;
    if (fromState) return fromState;
    if (Array.isArray(preloadedSubjects)) {
      const fromPre = preloadedSubjects.find((s) => s.id === subjectId)?.name;
      if (fromPre) return fromPre;
    }
    return (
      event?.subject?.name ||
      (typeof event?.subject === 'string' ? event.subject : null) ||
      event?.subjectName ||
      event?.subject_name ||
      (event?.generated_by === 'plan_year' && event?.title) ||
      null
    );
  }, [subjectId, subjects, preloadedSubjects, event?.subject, event?.subjectName, event?.subject_name, event?.generated_by, event?.title]);

  /** Academic year row for this event's plan — local list first, then shell preload (stable Add to plan? / banners). */
  const resolvedAcademicYearRow = useMemo(() => {
    if (!academicYearId) return null;
    const fromState = academicYears.find((a) => a.id === academicYearId);
    if (fromState) return fromState;
    if (Array.isArray(preloadedAcademicYears)) {
      return preloadedAcademicYears.find((a) => a.id === academicYearId) || null;
    }
    return null;
  }, [academicYearId, academicYears, preloadedAcademicYears]);

  /** Chips for Add to plan?: merge fetched rows + shell preload without dropping merged ids. */
  const academicYearsForPlanChips = useMemo(() => {
    const byId = new Map();
    (Array.isArray(preloadedAcademicYears) ? preloadedAcademicYears : []).forEach((a) => {
      if (a?.id) byId.set(a.id, a);
    });
    (academicYears || []).forEach((a) => {
      if (a?.id) byId.set(a.id, a);
    });
    return Array.from(byId.values()).sort((a, b) => {
      const sa = a.start_date ? String(a.start_date).slice(0, 10) : '';
      const sb = b.start_date ? String(b.start_date).slice(0, 10) : '';
      return sb.localeCompare(sa);
    });
  }, [academicYears, preloadedAcademicYears]);

  const performDeleteEntireSeries = async () => {
    if (readOnly || !event?.id) return;
    setDeleting(true);
    try {
      const cleanId = cleanPlannerEventId(String(event.id));
      const { data: { user: authUser } } = await supabase.auth.getUser();
      let userFamilyId = familyId || event.family_id;
      if (authUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('family_id')
          .eq('id', authUser.id)
          .maybeSingle();
        userFamilyId = profile?.family_id || userFamilyId;
      }
      if (!userFamilyId) {
        throw new Error('Missing family');
      }
      const { error: seriesError, logEventId } = await softDeleteEventSeries(supabase, userFamilyId, event, cleanId);
      if (seriesError) throw seriesError;
      toast.push('Series deleted', 'success');
      const idForHooks = logEventId ?? cleanId;
      if (onEventDeleted) onEventDeleted(idForHooks);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { eventId: idForHooks } }));
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
      }
      try {
        const eventDate = event.start_ts
          ? new Date(event.start_ts).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
        logDeleteEvent(idForHooks, eventDate, event.child_id);
      } catch (_) {}
    } catch (err) {
      const msg = err?.message || 'Failed to delete series';
      toast.push(msg, 'error');
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setDeleting(false);
    }
  };

  const performDeleteSingleOccurrence = async () => {
    if (readOnly) return;
    if (!event?.id) {
      if (Platform.OS === 'web') {
        window.alert('Error: Event ID is missing');
      } else {
        Alert.alert('Error', 'Event ID is missing');
      }
      return;
    }

            setDeleting(true);
            try {
      const deleteTargetId = cleanPlannerEventId(String(event.id));
      console.log('[EventDetails] Attempting to delete event:', deleteTargetId);
      console.log('[EventDetails] Event details:', { id: deleteTargetId, family_id: event.family_id, title: event.title });
      
      // Get the current user's family_id for the RPC function
      const { data: { user: authUser } } = await supabase.auth.getUser();
      let userFamilyId = event.family_id;
      
      if (authUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('family_id')
          .eq('id', authUser.id)
          .maybeSingle();
        userFamilyId = profile?.family_id || event.family_id;
        console.log('[EventDetails] Current user family_id:', userFamilyId);
        console.log('[EventDetails] Event family_id:', event.family_id);
      }
      
      // Try using RPC function first (bypasses RLS with SECURITY DEFINER)
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('delete_event', {
          _event_id: deleteTargetId,
          _family_id: userFamilyId
        });
        
        if (rpcError) {
          console.warn('[EventDetails] RPC delete failed, falling back to soft delete:', rpcError);
          console.warn('[EventDetails] RPC error details:', JSON.stringify(rpcError, null, 2));
          // Fall through to soft delete below
        } else if (rpcData?.success) {
          console.log('[EventDetails] RPC delete succeeded:', rpcData);
          
          // Verify the soft delete actually worked
          await new Promise(resolve => setTimeout(resolve, 300)); // Wait for DB to update
          const { data: verifyData } = await supabase
            .from('events')
            .select('deleted_at')
            .eq('id', deleteTargetId)
            .maybeSingle();
          
          if (verifyData?.deleted_at) {
            console.log('[EventDetails] RPC soft delete verified - deleted_at is set');
          toast.push('Event deleted', 'success');
          // RPC delete worked - call onEventDeleted and return
          if (onEventDeleted) {
            onEventDeleted(deleteTargetId);
          }
          
          // Log delete event action
          try {
            const eventDate = event.start_ts ? new Date(event.start_ts).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            logDeleteEvent(
              deleteTargetId,
              eventDate,
              event.child_id
            );
          } catch (logError) {
            // Ignore logging errors
          }
          
          return; // Exit early - delete succeeded via RPC
          } else {
            console.warn('[EventDetails] RPC returned success but deleted_at not set, falling back to direct soft delete');
            // Fall through to direct soft delete below
          }
        } else {
          console.warn('[EventDetails] RPC delete returned success=false:', rpcData);
          // Fall through to direct soft delete below
        }
      } catch (rpcErr) {
        console.warn('[EventDetails] RPC delete error, falling back to direct delete:', rpcErr);
        // Fall through to direct delete below
      }
      
      // Fallback: Try soft delete (set deleted_at)
      console.log('[EventDetails] Attempting soft delete as fallback');
      const deleteQuery = supabase
        .from('events')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', deleteTargetId)
        .is('deleted_at', null); // Only update if not already deleted

      let directDeleteResult;
      try {
        directDeleteResult = await deleteQuery;
        console.log('[EventDetails] Delete query result:', directDeleteResult);
      } catch (networkError) {
        // Catch network errors (TypeError: Load failed, etc.)
        console.error('[EventDetails] Network error during delete:', networkError);
        if (networkError instanceof TypeError && networkError.message?.includes('Load failed')) {
          throw new Error('Network error: Unable to connect to server. Please check your connection and try again.');
        }
        throw networkError;
      }

      const { data, error } = directDeleteResult || {};

      if (error) {
        console.error('[EventDetails] Delete error from Supabase:', error);
        console.error('[EventDetails] Error code:', error.code);
        console.error('[EventDetails] Error message:', error.message);
        console.error('[EventDetails] Error details:', error.details);
        console.error('[EventDetails] Error hint:', error.hint);
        console.error('[EventDetails] Full error:', JSON.stringify(error, null, 2));
        
        // Check for specific error codes
        if (error.code === '42501') {
          throw new Error('Permission denied: You do not have permission to delete this event.');
        } else if (error.code === '23503') {
          throw new Error('Cannot delete: This event is referenced by other records.');
        } else if (error.message?.includes('permission denied') || error.message?.includes('row-level security')) {
          throw new Error('Permission denied: Row-level security policy prevents deletion of this event.');
        }
        
        throw error;
      }

      console.log('[EventDetails] Delete query completed without error, data:', data);
      console.log('[EventDetails] Delete response status:', directDeleteResult?.status);
      console.log('[EventDetails] Delete response count:', directDeleteResult?.count);
      
      // Check if soft delete actually affected any rows
      // Supabase returns count: 0 if no rows were updated (even if no error)
      if (directDeleteResult?.count === 0) {
        console.warn('[EventDetails] Soft delete query returned count: 0 - no rows were updated (may already be deleted)');
        // Check if it's already deleted
        const { data: checkData } = await supabase
          .from('events')
          .select('deleted_at')
          .eq('id', deleteTargetId)
          .maybeSingle();
        
        if (checkData?.deleted_at) {
          console.log('[EventDetails] Event is already soft-deleted');
          toast.push('Event deleted', 'success');
          if (onEventDeleted) {
            onEventDeleted(deleteTargetId);
          }
          return; // Exit early - already deleted
        }
        // Fall through to verification
      } else if (directDeleteResult?.count !== null && directDeleteResult?.count > 0) {
        console.log('[EventDetails] Soft delete query affected', directDeleteResult.count, 'row(s)');
        // Soft delete succeeded, verify it
      }
      
      // Wait a moment for the delete to propagate
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify soft deletion succeeded by checking if deleted_at is set
      console.log('[EventDetails] Verifying soft deletion for event:', deleteTargetId);
      const { data: verifyData, error: verifyError } = await supabase
        .from('events')
        .select('id, deleted_at')
        .eq('id', deleteTargetId)
        .maybeSingle();

      console.log('[EventDetails] Verification result:', { verifyData, verifyError });

      if (verifyError) {
        if (verifyError.code === 'PGRST116') {
          // PGRST116 is "not found" which is good - means it was deleted
          console.log('[EventDetails] Delete verified - event not found (deleted)');
          toast.push('Event deleted', 'success');
        } else {
          console.warn('[EventDetails] Error verifying deletion (may be RLS):', verifyError);
          // If we can't verify due to RLS, check if delete returned success
          // If no error from delete, assume it worked
          if (!error) {
            console.log('[EventDetails] Delete query succeeded, assuming deletion worked despite verification error');
          } else {
            throw new Error(`Delete verification failed: ${verifyError.message}`);
          }
        }
      } else if (verifyData) {
        // Check if soft delete succeeded (deleted_at is set)
        if (verifyData.deleted_at) {
          console.log('[EventDetails] Soft delete verified - deleted_at is set');
          toast.push('Event deleted', 'success');
          if (onEventDeleted) {
            onEventDeleted(deleteTargetId);
          }
          return; // Exit early - soft delete succeeded
        }
        
        // Event still exists and is not soft-deleted - delete failed
        console.error('[EventDetails] Delete failed - event still exists and is not deleted:', verifyData);
        console.error('[EventDetails] Direct delete query result:', { data, error });
        console.error('[EventDetails] Event ID attempted:', deleteTargetId);
        console.error('[EventDetails] Event family_id:', event.family_id);
        
        // Check if this might be an RLS issue by trying to read the event
        const { data: readData, error: readError } = await supabase
          .from('events')
          .select('id, family_id, status')
          .eq('id', deleteTargetId)
          .maybeSingle();
        
        console.log('[EventDetails] Can read event after delete attempt:', { readData, readError });
        
        if (readError && readError.code === 'PGRST301') {
          // Permission denied - RLS is blocking, but delete might have worked
          console.warn('[EventDetails] RLS blocking verification - delete may have succeeded');
          // Trust that delete worked if the query didn't error
        } else if (readData) {
          // We can read it, so delete definitely failed
          // Try soft delete as fallback (mark as canceled)
          console.warn('[EventDetails] Hard delete failed, attempting soft delete (mark as canceled)');
          try {
            const { error: updateError } = await supabase
              .from('events')
              .update({ 
                status: 'canceled',
                canceled_at: new Date().toISOString()
              })
              .eq('id', deleteTargetId);
            
            if (updateError) {
              console.error('[EventDetails] Soft delete also failed:', updateError);
              throw new Error(`Delete operation failed: Event still exists in database. Event ID: ${deleteTargetId}. This may be due to database constraints, triggers, or RLS policies preventing deletion. Error: ${updateError.message}`);
            } else {
              console.log('[EventDetails] Soft delete succeeded - event marked as canceled');
              // Verify soft delete worked
              const { data: softVerifyData } = await supabase
                .from('events')
                .select('id, status')
                .eq('id', deleteTargetId)
                .maybeSingle();
              
              if (softVerifyData && softVerifyData.status === 'canceled') {
                console.log('[EventDetails] Soft delete verified - event is now canceled');
                // Treat soft delete as success - call onEventDeleted
                toast.push('Event deleted', 'success');
                if (onEventDeleted) {
                  onEventDeleted(deleteTargetId);
                }
                return; // Exit early - soft delete succeeded
              }
            }
          } catch (softDeleteErr) {
            throw new Error(`Delete operation failed: Event still exists in database. Event ID: ${deleteTargetId}. This may be due to database constraints, triggers, or RLS policies preventing deletion.`);
          }
        }
      } else {
          // Event not found - might be deleted or RLS blocking
          console.log('[EventDetails] Event not found during verification - assuming soft delete succeeded');
          toast.push('Event deleted', 'success');
          if (onEventDeleted) {
            onEventDeleted(deleteTargetId);
          }
          return; // Exit early
        }
      
      // If we get here, soft deletion was successful
      toast.push('Event deleted', 'success');
      if (onEventDeleted) {
        onEventDeleted(deleteTargetId);
      }
              
      // Log delete event action (will be logged in PlannerWeek.handleEventDeleted if called from there)
      // EventDetails is used in multiple contexts, so we log here as fallback
      try {
        const eventDate = event.start_ts ? new Date(event.start_ts).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        logDeleteEvent(
          deleteTargetId,
          eventDate,
          event.child_id
        );
      } catch (logError) {
        // Ignore logging errors
      }
            } catch (err) {
      // Handle different types of errors
      let errorMessage = 'Failed to delete event';
      
      if (err?.message) {
        if (err.message.includes('Load failed') || err.message.includes('Failed to fetch')) {
          errorMessage = 'Network error: Please check your connection and try again';
        } else if (err.message.includes('timed out')) {
          errorMessage = 'Request timed out: Please try again';
        } else {
          errorMessage = err.message;
        }
      } else if (err?.details) {
        errorMessage = err.details;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }

      console.error('[EventDetails] Delete error:', err);
      toast.push(errorMessage, 'error');

      if (Platform.OS === 'web') {
        window.alert(`Failed to delete event: ${errorMessage}`);
      } else {
        Alert.alert('Error', `Failed to delete event: ${errorMessage}`);
      }
            } finally {
              setDeleting(false);
            }
  };

  const handleDelete = async () => {
    if (readOnly) return;
    if (!event?.id) {
      if (Platform.OS === 'web') {
        window.alert('Error: Event ID is missing');
      } else {
        Alert.alert('Error', 'Event ID is missing');
      }
      return;
    }

    if (isDeletableSeriesGroup(event)) {
      setShowRecurringDeleteModal(true);
      return;
    }

    let confirmed = false;
    if (Platform.OS === 'web') {
      confirmed = window.confirm('Are you sure you want to delete this event?');
    } else {
      confirmed = await new Promise((resolve) => {
        Alert.alert(
          'Delete Event',
          'Are you sure you want to delete this event?',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve(false),
            },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => resolve(true),
            },
          ]
        );
      });
    }

    if (!confirmed) return;
    await performDeleteSingleOccurrence();
  };

  const toggleTag = (tag) => {
    setDraftTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setTagInput('');
  };

  const commitTag = () => {
    const trimmed = tagInput.trim().replace(/^#/, '');
    if (trimmed && !draftTags.includes(trimmed)) {
      setDraftTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  };

  const removeTag = (tag) => {
    setDraftTags((prev) => prev.filter((t) => t !== tag));
  };

  // Proactive schedule conflict check while editing (same rules as add-event modal)
  useEffect(() => {
    if (
      !editing ||
      readOnly ||
      placement !== 'calendar' ||
      allDay ||
      !startTime?.trim() ||
      assigneeIds.length === 0 ||
      !dueDate ||
      !familyId
    ) {
      setConflictWarning(null);
      return;
    }
    if (shouldAllowOverlaps) {
      setConflictWarning(null);
      return;
    }

    const checkConflicts = async () => {
      try {
        const baseDate = new Date(dueDate);
        baseDate.setHours(0, 0, 0, 0);

        const resolvedStart = applyTimeToDate(baseDate, startTime);
        if (!resolvedStart) {
          setConflictWarning(null);
          return;
        }

        const isMultiDayEventType = eventType && ['Project', 'Trip', 'Holiday', 'Other'].includes(eventType);
        let resolvedEnd;

        if (isMultiDayEventType && eventEndDate) {
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

        const localYear = dueDate.getFullYear();
        const localMonth = dueDate.getMonth();
        const localDay = dueDate.getDate();
        const localStartOfDay = new Date(localYear, localMonth, localDay, 0, 0, 0, 0);

        let localEndOfDay;
        if (isMultiDayEventType && eventEndDate) {
          const endDateYear = eventEndDate.getFullYear();
          const endDateMonth = eventEndDate.getMonth();
          const endDateDay = eventEndDate.getDate();
          localEndOfDay = new Date(endDateYear, endDateMonth, endDateDay, 23, 59, 59, 999);
        } else {
          localEndOfDay = new Date(localYear, localMonth, localDay, 23, 59, 59, 999);
        }

        const startOfDay = localStartOfDay.toISOString();
        const endOfDay = localEndOfDay.toISOString();

        let query = supabase
          .from('events')
          .select('*')
          .eq('family_id', familyId)
          .lt('start_ts', endOfDay)
          .neq('status', 'canceled')
          .is('canceled_at', null)
          .is('deleted_at', null);

        query = query.in('child_id', assigneeIds);

        const { data: existingEventsRaw, error } = await query;

        const filteredEventsRaw = (existingEventsRaw || []).filter((ev) => {
          const eventStart = new Date(ev.start_ts);
          const eventEnd = ev.end_ts ? new Date(ev.end_ts) : null;
          return eventStart < resolvedEnd && (!eventEnd || eventEnd > resolvedStart);
        });

        let eventsWithChildIds = [];
        if (assigneeIds.length > 0) {
          const { data: eventsWithArrays, error: arrayError } = await supabase
            .from('events')
            .select('*')
            .eq('family_id', familyId)
            .lt('start_ts', endOfDay)
            .neq('status', 'canceled')
            .is('canceled_at', null)
            .is('deleted_at', null)
            .not('child_ids', 'is', null);

          if (!arrayError && eventsWithArrays) {
            eventsWithChildIds = eventsWithArrays.filter((ev) => {
              const eventChildIds = ev.child_ids || [];
              const hasChildOverlap = eventChildIds.some((cid) => assigneeIds.includes(cid));
              if (!hasChildOverlap) return false;
              const eventStart = new Date(ev.start_ts);
              const eventEnd = ev.end_ts ? new Date(ev.end_ts) : null;
              return eventStart < resolvedEnd && (!eventEnd || eventEnd > resolvedStart);
            });
          }
        }

        const allEvents = [...filteredEventsRaw];
        const existingEventIds = new Set(allEvents.map((e) => e.id));
        eventsWithChildIds.forEach((ev) => {
          if (!existingEventIds.has(ev.id)) {
            allEvents.push(ev);
            existingEventIds.add(ev.id);
          }
        });

        const existingEvents = allEvents;

        if (error) {
          setConflictWarning(null);
          return;
        }

        const formatTime = (date) => {
          let hours = date.getHours();
          const minutes = date.getMinutes();
          const period = hours >= 12 ? 'PM' : 'AM';
          if (hours > 12) hours -= 12;
          else if (hours === 0) hours = 12;
          return minutes === 0 ? `${hours} ${period}` : `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
        };

        const conflicts = [];
        for (const otherEv of existingEvents || []) {
          if (event?.id && otherEv.id === event.id) continue;

          const eventStart = new Date(otherEv.start_ts);
          const eventEnd = new Date(otherEv.end_ts || otherEv.start_ts);

          if (resolvedStart < eventEnd && eventStart < resolvedEnd) {
            const eventDate = new Date(otherEv.start_ts);
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const dayName = dayNames[eventDate.getDay()];
            const monthName = monthNames[eventDate.getMonth()];
            const day = eventDate.getDate();

            const startTimeStr = formatTime(eventStart);
            const endTimeStr = formatTime(eventEnd);
            const startTimeOnly = startTimeStr.replace(/\s*(AM|PM)$/i, '');
            const endTimeOnly = endTimeStr.replace(/\s*(AM|PM)$/i, '');
            const period = startTimeStr.includes('PM') ? 'PM' : 'AM';
            const timeRange = `${startTimeOnly}–${endTimeOnly} ${period}`;

            const who = assigneeLabelForConflict(assigneeIds, familyMembers);
            const lead = who ? `${who} — ` : '';
            conflicts.push({
              event: otherEv,
              message: `${lead}${otherEv.title} (${dayName} ${monthName} ${day}, ${timeRange})`,
            });
          }
        }

        if (conflicts.length > 0) {
          const suggestion = findNextAvailableConflictSlot(
            conflicts[0].event,
            resolvedStart,
            resolvedEnd,
            existingEvents || [],
            assigneeIds
          );
          setConflictWarning({
            ...conflicts[0],
            conflictCount: conflicts.length,
            allConflicts: conflicts,
            suggestedChange: suggestion
              ? {
                  ...suggestion,
                  message: formatConflictSuggestionMessage(suggestion.newStart, suggestion.newEnd),
                }
              : null,
          });
        } else {
          setConflictWarning(null);
        }
      } catch (err) {
        console.error('[EventDetails] Error in conflict detection:', err);
        setConflictWarning(null);
      }
    };

    const timeoutId = setTimeout(checkConflicts, 300);
    return () => clearTimeout(timeoutId);
  }, [
    editing,
    readOnly,
    placement,
    allDay,
    startTime,
    endTime,
    assigneeIds,
    dueDate,
    eventEndDate,
    eventType,
    familyId,
    shouldAllowOverlaps,
    event?.id,
    familyMembers,
  ]);

  // Handle overlap errors by fetching conflicting events and showing conflict UI
  const handleOverlapError = async (errorMessage, startDate, endDate, assigneeIds) => {
    try {
      // Check if error is an overlap error
      if (!errorMessage || (!errorMessage.includes('overlap') && !errorMessage.includes('Event overlaps'))) {
        return false;
      }

      console.log('[EventDetails] Detected overlap error, fetching conflicting events...');
      
      // Extract child ID from error message if available
      const childIdMatch = errorMessage.match(/child:\s*([a-f0-9-]+)/i);
      const targetChildIds = childIdMatch ? [childIdMatch[1]] : assigneeIds;
      const validTargetChildIds = (targetChildIds || []).filter((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || '').trim())
      );
      const cleanCurrentEventId = cleanPlannerEventId(String(event?.id || ''));

      if (validTargetChildIds.length === 0) {
        console.warn('[EventDetails] No child IDs available for conflict check');
        return false;
      }

      // Fetch events that might conflict in the date range
      const startOfRange = new Date(startDate);
      startOfRange.setHours(0, 0, 0, 0);
      const endOfRange = new Date(endDate || startDate);
      endOfRange.setHours(23, 59, 59, 999);

      let query = supabase
        .from('events')
        .select('*')
        .eq('family_id', familyId)
        .in('child_id', validTargetChildIds)
        .gte('start_ts', startOfRange.toISOString())
        .lte('start_ts', endOfRange.toISOString())
        .neq('status', 'canceled')
        .is('canceled_at', null)
        .is('deleted_at', null);

      if (cleanCurrentEventId) {
        query = query.neq('id', cleanCurrentEventId); // Exclude the current event being edited
      }
      const { data: existingEvents, error: fetchError } = await query;

      if (fetchError || !existingEvents || existingEvents.length === 0) {
        console.warn('[EventDetails] Could not fetch conflicting events:', fetchError);
        return false;
      }

      // Check which events actually overlap
      const conflicts = [];
      const resolvedStart = new Date(startDate);
      const resolvedEnd = new Date(endDate || startDate);

      for (const existingEvent of existingEvents) {
        const eventStart = new Date(existingEvent.start_ts);
        const eventEnd = new Date(existingEvent.end_ts || existingEvent.start_ts);

        if (resolvedStart < eventEnd && eventStart < resolvedEnd) {
          // Format conflict message
          const eventDate = new Date(existingEvent.start_ts);
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
          
          const whoOv = assigneeLabelForConflict(targetChildIds, familyMembers);
          const leadOv = whoOv ? `${whoOv} — ` : '';
          conflicts.push({
            event: existingEvent,
            message: `${leadOv}${existingEvent.title} (${dayName} ${monthName} ${day}, ${timeRange})`
          });
        }
      }

      if (conflicts.length > 0) {
        console.log('[EventDetails] Setting conflict warning from overlap error:', conflicts[0]);
        const suggestion = findNextAvailableConflictSlot(
          conflicts[0].event,
          resolvedStart,
          resolvedEnd,
          existingEvents || [],
          targetChildIds
        );
        setConflictWarning({
          ...conflicts[0],
          conflictCount: conflicts.length,
          allConflicts: conflicts,
          suggestedChange: suggestion
            ? {
                ...suggestion,
                message: formatConflictSuggestionMessage(suggestion.newStart, suggestion.newEnd),
              }
            : null,
        });
        return true;
      }

      return false;
    } catch (err) {
      console.error('[EventDetails] Error handling overlap error:', err);
      return false;
    }
  };

  const handleSave = async (skipValidation = false, allowOverlaps = false) => {
    if (!event?.id) return;
    if (!draftTitle.trim()) {
      Alert.alert('Validation', 'Please enter a title.');
      return;
    }

    // Validate percentage - show inline errors instead of toast
    if (percentOfTotalGrade.trim() && subjectId) {
      const parsedPercent = parseFloat(percentOfTotalGrade.trim());
      if (!isNaN(parsedPercent) && isFinite(parsedPercent)) {
        // If value is outside 0-100 range, show inline error
        if (parsedPercent < 0 || parsedPercent > 100) {
          setPercentValidationError({
            message: 'Percentage must be between 0 and 100%',
            suggestedPercent: parsedPercent > 100 ? 100 : 0
          });
          return;
        }

        // Check if async validation found an issue (already set inline, just prevent save)
        if (percentValidationError) {
          return;
        }

        // If we have validation data and it shows exceeding 100%, set inline error and prevent save
        if (percentValidationData && percentValidationData.newTotal > 100) {
          setPercentValidationError({
            message: `This would exceed 100% for this subject. Current total: ${percentValidationData.totalPercent.toFixed(1)}%, remaining: ${percentValidationData.remainingPercent.toFixed(1)}%.`,
            suggestedPercent: Math.max(0, percentValidationData.remainingPercent)
          });
          setPercentValidationData(percentValidationData);
          return;
        }

        // Do a final synchronous validation check if we don't have validation data yet
        // This ensures we catch the issue even if async validation hasn't completed
        if (!percentValidationData && !checkingPercent && parsedPercent > 0) {
          try {
            const { data: validationData, error: validationError } = await supabase.rpc('get_subject_grade_percentage_sum', {
              p_subject_id: subjectId,
              p_exclude_event_id: event?.id || null
            });

            if (!validationError && validationData) {
              const totalPercent = parseFloat(validationData.total_percent) || 0;
              const remainingPercent = parseFloat(validationData.remaining_percent) || 100;
              const newTotal = totalPercent + parsedPercent;

              if (newTotal > 100) {
                setPercentValidationError({
                  message: `This would exceed 100% for this subject. Current total: ${totalPercent.toFixed(1)}%, remaining: ${remainingPercent.toFixed(1)}%.`,
                  suggestedPercent: Math.max(0, remainingPercent)
                });
                setPercentValidationData({
                  totalPercent,
                  remainingPercent,
                  assignments: validationData.assignments || [],
                  newTotal
                });
                return;
              }
            }
          } catch (validationErr) {
            console.error('Error in final validation check:', validationErr);
            // Continue with save if validation check fails (don't block save due to validation error)
          }
        }
      } else {
        // Invalid number format - check if field has content
        if (percentOfTotalGrade.trim()) {
          setPercentValidationError({
            message: 'Please enter a valid number between 0 and 100',
            suggestedPercent: null
          });
          return;
        }
      }
    }

    console.log('🔵 [EventDetails] ========== handleSave CALLED ==========');
    console.log('[EventDetails] handleSave called with state:', {
      eventId: event.id,
      eventType,
      eventEndDate: eventEndDate?.toISOString(),
      eventEndDateDateString: eventEndDate?.toDateString(),
      dueDate: dueDate?.toISOString(),
      dueDateDateString: dueDate?.toDateString(),
      startTime,
      endTime,
      allDay,
      placement
    });

    let startDateObj = null;
    let endDateObj = null;

    // If scheduling a backlog item, date is required
    if (schedulingBacklog && !draftDate) {
      Alert.alert('Date Required', 'Please enter a date to schedule this task.');
      return;
    }

    // Use dueDate for date, startTime/endTime for times (matching TaskCreateModal structure)
    const dateToUse = dueDate ? toDateInput(dueDate.toISOString()) : draftDate;
    
    if (dateToUse) {
      if (allDay || draftAllDay) {
        const baseDate = dueDate || new Date(dateToUse);
        baseDate.setHours(0, 0, 0, 0);
        startDateObj = baseDate;
        endDateObj = new Date(baseDate);
        endDateObj.setHours(23, 59, 0, 0);
        if (!startDateObj || Number.isNaN(startDateObj.getTime())) {
          Alert.alert('Validation', 'Start date is invalid.');
          return;
        }
      } else {
        if (!startTime.trim() && !draftStartTime.trim()) {
          Alert.alert('Validation', 'Please enter a start time or mark the event as All Day.');
          return;
        }

        const timeToUse = startTime.trim() || draftStartTime.trim();
        const resolvedStart = applyTimeToDate(dueDate || new Date(dateToUse), timeToUse);
        if (!resolvedStart) {
          Alert.alert('Validation', 'Enter a valid start time, e.g. 9:00 AM');
          return;
        }
        startDateObj = resolvedStart;

        // Check if this is a multi-day event type with an end date set
        const isMultiDayEventType = eventType && ['Project', 'Trip', 'Holiday', 'Other'].includes(eventType);
        console.log('[EventDetails] Checking end date logic:', {
          isMultiDayEventType,
          eventType,
          hasEventEndDate: !!eventEndDate,
          eventEndDate: eventEndDate?.toISOString(),
          hasEndTime: !!(endTime.trim() || draftEndTime.trim())
        });
        
        if (isMultiDayEventType && eventEndDate) {
          console.log('[EventDetails] Multi-day event detected:', { eventType, eventEndDate: eventEndDate.toISOString(), startDateObj: startDateObj.toISOString() });
          // For multi-day events, set end date to end of the selected day (23:59)
          // This ensures the project spans the full day
          // Create a new date from the eventEndDate to avoid timezone issues
          const endDateYear = eventEndDate.getFullYear();
          const endDateMonth = eventEndDate.getMonth();
          const endDateDay = eventEndDate.getDate();
          endDateObj = new Date(endDateYear, endDateMonth, endDateDay, 23, 59, 59, 999);
          
          console.log('[EventDetails] Created endDateObj from eventEndDate:', {
            eventEndDate: eventEndDate.toISOString(),
            endDateYear,
            endDateMonth,
            endDateDay,
            endDateObj: endDateObj.toISOString()
          });
          
          // If end date is before start date, that's invalid - use start date + 1 day
          // But allow same-day projects (end date = start date)
          const startDateOnly = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
          const endDateOnly = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate());
          
          console.log('[EventDetails] Comparing dates:', {
            startDateOnly: startDateOnly.toISOString(),
            endDateOnly: endDateOnly.toISOString(),
            comparison: endDateOnly.getTime() < startDateOnly.getTime()
          });
          
          if (endDateOnly.getTime() < startDateOnly.getTime()) {
            console.warn('[EventDetails] End date is before start date, adjusting to start date + 1 day');
            endDateObj = new Date(startDateObj);
            endDateObj.setDate(endDateObj.getDate() + 1);
            endDateObj.setHours(23, 59, 59, 999);
          }
          console.log('[EventDetails] Final endDateObj for multi-day event:', {
            endDateObj: endDateObj.toISOString(),
            startDateObj: startDateObj.toISOString(),
            daysDifference: Math.round((endDateOnly.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24))
          });
        } else if (endTime.trim() || draftEndTime.trim()) {
          // Single-day event with end time
          const endTimeToUse = endTime.trim() || draftEndTime.trim();
          let resolvedEnd = applyTimeToDate(dueDate || new Date(dateToUse), endTimeToUse);
          if (!resolvedEnd) {
            Alert.alert('Validation', 'Enter a valid end time, e.g. 10:00 AM');
            return;
          }
          if (resolvedEnd <= startDateObj) {
            resolvedEnd = new Date(startDateObj.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
          }
          endDateObj = resolvedEnd;
        } else {
          endDateObj = new Date(startDateObj.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
        }
      }
    }

    setSaving(true);
    try {
      const isBacklog = event.is_backlog === true || event.data?.is_backlog === true;
      
      // Build recurrence rule if recurring
      let recurrenceRule = null;
      if (isRecurring && placement === 'calendar') {
        const interval = recurrenceInterval || 1;
        const rule = {
          frequency: recurrenceType.toUpperCase(),
          interval: interval,
        };
        if (recurrenceEndType === 'after') {
          const countValue = recurrenceEndAfter || (recurrenceEndAfterText ? parseInt(recurrenceEndAfterText, 10) : null);
          if (countValue && !isNaN(countValue) && countValue > 0) {
            rule.count = countValue;
          }
        } else if (recurrenceEndType === 'on' && recurrenceEndDate) {
          rule.until = recurrenceEndDate.toISOString().split('T')[0];
        }
        recurrenceRule = rule;
      }
      
      const updates = {
        title: draftTitle.trim(),
        description: notes.trim() ? notes.trim() : null,
        child_id: assigneeIds.length > 0 ? assigneeIds[0] : null,
        child_ids: assigneeIds.length > 0 ? assigneeIds : [], // Use empty array instead of null to match DB default
        status: normalizeStatus(draftStatus),
        tags: draftTags.length ? draftTags : null,
        material_id: selectedMaterialId || null,
        materials_attachment_ids: attachedMaterialIds.length > 0 ? attachedMaterialIds : null,
        event_type: normalizeEventTypeForPersistence(eventType),
        subject_id: subjectId || null,
        unit: (unit && unit.trim()) ? unit.trim() : null,
        // Mirror unit/lesson for APIs that read curriculum_unit_title / events.lesson (subject structure, plan slot labels).
        curriculum_unit_title: (unit && unit.trim()) ? unit.trim() : null,
        lesson: (lesson && lesson.trim()) ? lesson.trim() : null,
        grade: (grade && grade.trim()) ? grade.trim() : null,
        percent_of_total_grade: percentOfTotalGrade.trim() ? (() => {
          const parsed = parseFloat(percentOfTotalGrade.trim());
          return !isNaN(parsed) && isFinite(parsed) ? parsed : null;
        })() : null,
        location: (location && location.trim()) ? location.trim() : null,
        mode: mode || null,
        instructor: (instructor && instructor.trim()) ? instructor.trim() : null,
        goal_link: goalLink || null,
        recurrence_rule: recurrenceRule ? JSON.stringify(recurrenceRule) : null,
        requires_submission_home: showRequiresSubmissionHome,
      };

      const cmSave = parseCurriculumMetadata(event);
      const hadMetaKeys = Object.keys(cmSave).length > 0;
      if (lesson && lesson.trim()) {
        cmSave.lesson_label = lesson.trim();
      } else {
        delete cmSave.lesson_label;
      }
      if (Object.keys(cmSave).length > 0) {
        updates.curriculum_metadata = cmSave;
      } else if (hadMetaKeys) {
        updates.curriculum_metadata = null;
      }
      
      // Log assigneeIds state before save
      console.log('[EventDetails] AssigneeIds state before save:', {
        assigneeIds,
        assigneeIdsLength: assigneeIds.length,
        child_id: updates.child_id,
        child_ids: updates.child_ids,
        currentEventChildIds: event.child_ids,
        currentEventChildId: event.child_id
      });

      // If moving from backlog to schedule, set is_backlog to false and set date/time
      // Only move to schedule if user explicitly changed placement to 'calendar' or is in scheduling mode
      if (isBacklog && (placement === 'calendar' || schedulingBacklog) && startDateObj) {
        updates.is_backlog = false;
        updates.start_ts = startDateObj.toISOString();
        updates.end_ts = endDateObj?.toISOString() || null;
        toast.push('Task moved to schedule', 'success');
      } else if (startDateObj && !isBacklog) {
        updates.start_ts = startDateObj.toISOString();
        // Always set end_ts - use calculated endDateObj or default to start + 1 hour
        if (endDateObj) {
          updates.end_ts = endDateObj.toISOString();
        } else {
          // Default: start + 1 hour if no end time/date specified
          updates.end_ts = new Date(startDateObj.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000).toISOString();
        }
        console.log('[EventDetails] Saving event with dates:', { 
          start_ts: updates.start_ts, 
          end_ts: updates.end_ts,
          eventType,
          eventEndDate: eventEndDate?.toISOString(),
          endDateObj: endDateObj?.toISOString(),
          hasEventEndDate: !!eventEndDate,
          isMultiDay: eventType && ['Project', 'Trip', 'Holiday', 'Other'].includes(eventType)
        });
      } else if (schedulingBacklog) {
        // If we're in scheduling mode but no date was set, this shouldn't happen due to validation above
        toast.push('Please enter a date to schedule this task', 'error');
        setSaving(false);
        return;
      }

      // Remove undefined values from updates (Supabase doesn't accept undefined)
      // BUT keep null values - they are important for clearing fields
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, value]) => value !== undefined)
      );
      
      // Ensure child_ids is ALWAYS explicitly included in the update
      // This is critical because Supabase might not update a field if it's not explicitly included
      // Use empty array [] instead of null to match database default and ensure Supabase processes the update
      const currentChildIds = event.child_ids || (event.child_id ? [event.child_id] : []);
      // Use empty array [] instead of null when there are no assignees
      // This matches the database default and ensures Supabase actually updates the field
      const newChildIds = assigneeIds.length > 0 ? assigneeIds : [];
      
      // Compare arrays properly
      const currentIdsArray = [...currentChildIds].sort();
      const newIdsArray = [...newChildIds].sort();
      const childIdsChanged = JSON.stringify(currentIdsArray) !== JSON.stringify(newIdsArray);
      
      // ALWAYS explicitly include child_ids and child_id in cleanUpdates
      // Using empty array [] instead of null ensures Supabase processes the update
      cleanUpdates.child_ids = newChildIds;
      cleanUpdates.child_id = assigneeIds.length > 0 ? assigneeIds[0] : null;

      // Plan events are real events; attach/detach from plan via "Count as instructional time" and plan attachment.
      // No placeholder flip — preserve academic_year_id, generated_by, source_block_id for plan linkage.
      
      console.log('[EventDetails] child_ids update preparation:', {
        currentChildIds,
        newChildIds,
        childIdsChanged,
        cleanUpdatesChildIds: cleanUpdates.child_ids,
        cleanUpdatesChildId: cleanUpdates.child_id,
        assigneeIdsLength: assigneeIds.length
      });
      
      console.log('[EventDetails] About to save to database:', {
        eventId: event.id,
        updates: cleanUpdates,
        originalUpdates: updates,
        cleanUpdatesChildIds: cleanUpdates.child_ids,
        cleanUpdatesChildId: cleanUpdates.child_id,
        childIdsChanged
      });
      
      let { error, data } = await supabase
        .from('events')
        .update(cleanUpdates)
        .eq('id', cleanPlannerEventId(String(event.id)))
        .select();
      
      // Log the response from the database
      console.log('[EventDetails] Database update response:', {
        error: error?.message,
        returnedData: data?.[0],
        returnedChildIds: data?.[0]?.child_ids,
        returnedChildId: data?.[0]?.child_id
      });
      
      // If we get an overlap error, persist immediately as a flexible overlap.
      // We still hydrate the conflict UI first when possible so reopened modal state is rich.
      if (error && (error.message?.includes('overlap') || error.message?.includes('Event overlaps'))) {
        if (!allowOverlaps) {
          console.log('[EventDetails] Overlap error detected, hydrating conflict warning before immediate save');
          await handleOverlapError(error.message, startDateObj, endDateObj, assigneeIds);
        }
        
        console.log('[EventDetails] Overlap error detected, doing immediate multi-step update with is_flexible=true');
        
        // Step 1: Set is_flexible = true first (only if it's not already set)
        if (!cleanUpdates.is_flexible) {
          const setFlexibleResult = await supabase
            .from('events')
            .update({ is_flexible: true })
            .eq('id', cleanPlannerEventId(String(event.id)))
            .select();
          
          if (setFlexibleResult.error) {
            console.error('[EventDetails] Error setting is_flexible=true:', setFlexibleResult.error);
            throw setFlexibleResult.error;
          }
          console.log('[EventDetails] Set is_flexible=true successfully');
        }
        
        // Step 2: Update all fields EXCEPT child_id first
        const childIdToUpdate = cleanUpdates.child_id;
        const updatesWithoutChildId = { ...cleanUpdates };
        delete updatesWithoutChildId.child_id;
        updatesWithoutChildId.is_flexible = true; // Ensure it stays true
        
        if (Object.keys(updatesWithoutChildId).length > 0) {
          const updateWithoutChildResult = await supabase
            .from('events')
            .update(updatesWithoutChildId)
            .eq('id', cleanPlannerEventId(String(event.id)))
            .select();
          
          if (updateWithoutChildResult.error) {
            console.error('[EventDetails] Error updating fields (without child_id):', updateWithoutChildResult.error);
            throw updateWithoutChildResult.error;
          }
          console.log('[EventDetails] Updated fields (without child_id) successfully');
        }
        
        // Step 3: If child_id is being changed, use a different approach
        // The exclusion constraint checks child_id, but not child_ids array
        // For flexible events, we can use child_ids array instead, or set child_id to NULL
        // and rely on child_ids array. However, for consistency, we'll use an RPC function
        // if available, or use a workaround by setting child_ids array first
        if (childIdToUpdate !== undefined && childIdToUpdate !== event.child_id) {
          // Use RPC function if available, otherwise use multi-step approach
          // First, try using the update_event_with_overlap_handling RPC function
          // IMPORTANT: Use the full assigneeIds array, not just childIdToUpdate
          // Use empty array [] instead of null to match database default
          const childIdsToUpdate = cleanUpdates.child_ids || (childIdToUpdate ? [childIdToUpdate] : []);
          console.log('[EventDetails] Updating child_id/child_ids via RPC:', {
            childIdToUpdate,
            childIdsToUpdate,
            cleanUpdatesChildIds: cleanUpdates.child_ids
          });
          try {
            const rpcResult = await supabase.rpc('update_event_with_overlap_handling', {
              _event_id: cleanPlannerEventId(String(event.id)),
              _updates: {
                ...cleanUpdates,
                child_id: childIdToUpdate,
                child_ids: childIdsToUpdate, // Use full array, not just [childIdToUpdate]
                is_flexible: true
              },
              _allow_overlaps: true
            });
            
            if (rpcResult.error) {
              throw rpcResult.error;
            }
            
            if (rpcResult.data && rpcResult.data.ok) {
              console.log('[EventDetails] Updated child_id successfully using RPC function');
              // Fetch the updated event
              const fetchResult = await supabase
                .from('events')
                .select()
                .eq('id', cleanPlannerEventId(String(event.id)))
                .single();
              if (fetchResult.error) {
                throw fetchResult.error;
              }
              data = [fetchResult.data];
            } else {
              throw new Error(rpcResult.data?.error || 'RPC function returned error');
            }
          } catch (rpcError) {
            console.warn('[EventDetails] RPC function not available or failed, using fallback method:', rpcError);
            
            // Fallback: For flexible events with overlaps, use child_ids array instead of child_id
            // This is a workaround because the exclusion constraint only checks child_id, not child_ids
            // The exclusion constraint prevents overlapping events for the same child_id, but not for child_ids array
            // For flexible events with overlaps, we'll use child_ids array to track the assignment
            // while keeping child_id as NULL to bypass the constraint
            // IMPORTANT: Use the full assigneeIds array from cleanUpdates, not just childIdToUpdate
            // Use empty array [] instead of null to match database default
            const childIdsForFallback = cleanUpdates.child_ids || (childIdToUpdate ? [childIdToUpdate] : []);
            console.log('[EventDetails] Fallback update - using child_ids:', {
              childIdsForFallback,
              childIdToUpdate,
              cleanUpdatesChildIds: cleanUpdates.child_ids
            });
            const fallbackUpdate = {
              child_id: null, // Set to NULL to bypass constraint
              child_ids: childIdsForFallback, // Use full array from cleanUpdates
              is_flexible: true
            };
            fallbackUpdate.requires_submission_home = showRequiresSubmissionHome;

            const fallbackResult = await supabase
              .from('events')
              .update(fallbackUpdate)
              .eq('id', cleanPlannerEventId(String(event.id)))
              .select();
            
            if (fallbackResult.error) {
              console.error('[EventDetails] Error with fallback method (setting child_id to NULL):', fallbackResult.error);
              throw fallbackResult.error;
            }
            
            console.log('[EventDetails] Fallback method succeeded (child_id set to NULL, using child_ids array for flexible event)');
            console.log('[EventDetails] Note: For flexible events with overlaps, child assignment is tracked via child_ids array');
            console.log('[EventDetails] Saved event data:', {
              child_id: fallbackResult.data?.[0]?.child_id,
              child_ids: fallbackResult.data?.[0]?.child_ids,
              is_flexible: fallbackResult.data?.[0]?.is_flexible
            });
            data = fallbackResult.data;
          }
        } else {
          // Fetch the final data if we didn't update child_id
          const fetchResult = await supabase
            .from('events')
            .select()
            .eq('id', cleanPlannerEventId(String(event.id)))
            .single();
          if (fetchResult.error) {
            console.error('[EventDetails] Error fetching updated event:', fetchResult.error);
            throw fetchResult.error;
          }
          data = [fetchResult.data];
        }
        
        // Success with multi-step update
        error = null;
        console.log('[EventDetails] Multi-step update succeeded with is_flexible=true');
      } else if (error) {
        console.error('[EventDetails] Database update error:', error);
        console.error('[EventDetails] Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          eventId: event.id,
          eventType: eventType,
          updates: cleanUpdates
        });
        
        // Check if error is due to percent_of_total_grade constraint violation
        if (error.message && (
          error.message.includes('percent_of_total_grade') ||
          error.message.includes('check constraint') ||
          error.message.includes('violates check constraint')
        )) {
          // Set inline error instead of toast
          setPercentValidationError({
            message: 'Percentage must be between 0 and 100%',
            suggestedPercent: null
          });
          throw error;
        }
        
        throw error;
      }
      
      // If .select() didn't return data, fetch the event explicitly to get the latest state
      // This is important because RLS or other issues might prevent .select() from returning data
      // Retry the fetch up to 3 times with a small delay to handle potential race conditions
      if (!data || !data[0]) {
        console.log('[EventDetails] .select() did not return data, fetching event explicitly');
        // Small initial delay to ensure database transaction has committed
        await new Promise(resolve => setTimeout(resolve, 150));
        
        let fetchResult = null;
        let retries = 3;
        let fetchSucceeded = false;
        
        while (retries > 0 && !fetchSucceeded) {
          if (retries < 3) {
            // Additional delay before retry to allow database to commit
            await new Promise(resolve => setTimeout(resolve, 150));
          }
          
          console.log(`[EventDetails] Fetching event (attempt ${4 - retries}/3)...`);
          fetchResult = await supabase
            .from('events')
            .select()
            .eq('id', cleanPlannerEventId(String(event.id)))
            .single();
          
          if (fetchResult.error) {
            console.warn(`[EventDetails] Error fetching updated event (attempt ${4 - retries}/3):`, {
              error: fetchResult.error,
              message: fetchResult.error?.message,
              code: fetchResult.error?.code
            });
            retries--;
          } else if (fetchResult.data) {
            data = [fetchResult.data];
            fetchSucceeded = true;
            const childIdsMatch = JSON.stringify([...data[0].child_ids].sort()) === JSON.stringify([...newChildIds].sort());
            console.log('[EventDetails] Successfully fetched event after update:', {
              child_id: data[0].child_id,
              child_ids: data[0].child_ids,
              expected_child_ids: newChildIds,
              is_flexible: data[0].is_flexible,
              childIdsMatch: childIdsMatch,
              childIdsMatchDetails: {
                saved: [...data[0].child_ids].sort(),
                expected: [...newChildIds].sort()
              }
            });
            
            if (!childIdsMatch) {
              console.error('[EventDetails] WARNING: child_ids mismatch after update!', {
                saved: data[0].child_ids,
                expected: newChildIds
              });
            }
          } else {
            console.warn(`[EventDetails] Fetch returned no data (attempt ${4 - retries}/3)`);
            retries--;
          }
        }
        
        if (!data || !data[0]) {
          console.error('[EventDetails] Failed to fetch updated event after all retries, using cleanUpdates for patch');
        }
      }
      
      console.log('[EventDetails] Database update successful:', {
        eventId: event.id,
        savedData: data?.[0],
        saved_start_ts: data?.[0]?.start_ts,
        saved_end_ts: data?.[0]?.end_ts,
        saved_child_id: data?.[0]?.child_id,
        saved_child_ids: data?.[0]?.child_ids,
        expected_child_ids: newChildIds,
        childIdsMatch: data?.[0]?.child_ids ? 
          JSON.stringify([...data[0].child_ids].sort()) === JSON.stringify([...newChildIds].sort()) : 
          JSON.stringify(newChildIds) === '[]'
      });

      // Attach standards if any were selected
      if (attachedStandards.length > 0) {
        try {
          const { error: attachError } = await apiRequest('/api/standards/attach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lesson_id: event.id,
              standards: attachedStandards.map(s => s.id),
            }),
          });
          
          if (attachError) {
            console.error('[EventDetails] Failed to attach standards:', attachError);
          }
        } catch (attachErr) {
          console.error('[EventDetails] Error attaching standards:', attachErr);
        }
      }

      if (
        placement === 'calendar' &&
        Array.isArray(connectedCalendarTargets) &&
        connectedCalendarTargets.includes('google')
      ) {
        const { error: syncError } = await pushEventToGoogleCalendar(event.id);
        if (syncError) {
          toast.push(`Saved, but Google Calendar sync failed: ${syncError.message || 'Unknown error'}`, 'error');
        } else {
          toast.push('Event also synced to Google Calendar', 'success');
        }
      }

      // Keep canonical curriculum rows in sync when this occurrence is tied to a plan/subject lesson.
      const syncPlanOrSubject =
        !!(subjectId || event?.subject_id || event?.academic_year_id);
      const lessonIdFk = event?.curriculum_lesson_id;
      if (syncPlanOrSubject && lessonIdFk) {
        const newUnitT = (unit && unit.trim()) ? unit.trim() : '';
        const newLessonT =
          (lesson && lesson.trim()) ? lesson.trim() : (draftTitle || '').trim() || null;
        try {
          const { data: lesRow, error: lesErr } = await supabase
            .from('curriculum_lessons')
            .select('id, unit_id, title')
            .eq('id', lessonIdFk)
            .maybeSingle();
          if (!lesErr && lesRow?.unit_id) {
            if (newUnitT) {
              const { error: unitErr } = await supabase
                .from('curriculum_units')
                .update({ title: newUnitT })
                .eq('id', lesRow.unit_id);
              if (unitErr) {
                console.warn('[EventDetails] curriculum_units title sync:', unitErr.message || unitErr);
              }
            }
            if (newLessonT && String(newLessonT) !== String(lesRow.title || '')) {
              const { error: ltErr } = await supabase
                .from('curriculum_lessons')
                .update({ title: newLessonT })
                .eq('id', lesRow.id);
              if (ltErr) {
                console.warn('[EventDetails] curriculum_lessons title sync:', ltErr.message || ltErr);
              }
            }
          }
        } catch (curSyncErr) {
          console.warn('[EventDetails] curriculum row sync skipped', curSyncErr);
        }
      }

      const patch = { ...updates };
      if (!('start_ts' in patch) && event.start_ts) {
        patch.start_ts = event.start_ts;
      }
      if (!('end_ts' in patch) && event.end_ts) {
        patch.end_ts = event.end_ts;
      }
      
      // Include saved data from database, especially child_ids if child_id is null
      // This is critical for flexible events where child_id might be NULL but child_ids has the assignment
      if (data?.[0]) {
        console.log('[EventDetails] Including saved data in patch:', {
          child_id: data[0].child_id,
          child_ids: data[0].child_ids,
          is_flexible: data[0].is_flexible
        });
        // Include child_id and child_ids from saved data to ensure UI updates correctly
        // Even if child_id is NULL, we need to include child_ids so the UI can display the child
        if (data[0].child_id !== undefined) {
          patch.child_id = data[0].child_id;
        }
        if (data[0].child_ids !== undefined) {
          patch.child_ids = data[0].child_ids;
        }
        // Also include other fields that might have been updated
        if (data[0].is_flexible !== undefined) {
          patch.is_flexible = data[0].is_flexible;
        }
      } else {
        // If we still don't have data, at least include the child_ids from cleanUpdates
        // This ensures the UI reflects the changes even if we can't fetch from DB
        console.warn('[EventDetails] No data returned from update, using cleanUpdates for patch');
        if (cleanUpdates.child_ids !== undefined) {
          patch.child_ids = cleanUpdates.child_ids;
        }
        if (cleanUpdates.child_id !== undefined) {
          patch.child_id = cleanUpdates.child_id;
        }
      }

      const afterEventRow = data?.[0] || { ...event, ...cleanUpdates };
      emitMaterialLinkageEventsIfChangedWeb(familyId, event, afterEventRow);

      setEditing(false);
      setSchedulingBacklog(false);
      
      // Clear conflict warning on successful save
      setConflictWarning(null);
      setShouldAutoAdjust(false);
      setShouldAllowOverlaps(false);
      
      // Show toast for regular edits (not backlog moves, which already showed toast above)
      if (!isBacklog || !startDateObj) {
        toast.push('Event updated', 'success');
      }

      if (typeof window !== 'undefined') {
        // Drop any stale planner conflict snapshot so the next modal open
        // rebuilds conflict details from the newly saved event state.
        window.dispatchEvent(new CustomEvent('clearConflictBanner'));
      }
      
      // Close the modal after saving
      onClose?.();
      
      onEventPatched?.({
        id: event.id,
        previous_start_ts: event.start_ts,
        ...patch,
      });
      onEventUpdated?.();
      // Plan-year events: drop stale plan caches, refresh calendar + home, plan health
      const planYearId = patch?.academic_year_id ?? event?.academic_year_id;
      if (typeof window !== 'undefined' && planYearId && familyId) {
        const yid = String(planYearId);
        dropPlanYearFullDataCacheEntry(familyId, yid);
        dropPlanEditListTimesCacheEntry(familyId, yid);
        window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
        window.dispatchEvent(
          new CustomEvent('refreshCalendar', {
            detail: { forceInvalidate: true, skipHomeRefresh: false },
          }),
        );
      } else if (typeof window !== 'undefined' && event?.academic_year_id) {
        window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
      }
      // Subject-linked edits (no plan year on patch): still refresh calendar + plan summary listeners.
      if (
        typeof window !== 'undefined' &&
        !planYearId &&
        (subjectId || event?.subject_id)
      ) {
        window.dispatchEvent(
          new CustomEvent('refreshCalendar', {
            detail: { forceInvalidate: true, skipHomeRefresh: false },
          }),
        );
      }
      // Refresh Subjects page so grades/materials and subject detail stay in sync
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
        const detailSubjectId = cleanUpdates.subject_id ?? event?.subject_id;
        if (detailSubjectId) {
          window.dispatchEvent(
            new CustomEvent('refreshSubjectDetail', { detail: { subjectId: detailSubjectId } }),
          );
        }
      }
    } catch (err) {
      // Only show error toast if it's not an overlap error (those are handled by conflict UI)
      const errorMessage = err?.message || '';
      if (!errorMessage.includes('overlap') && !errorMessage.includes('Event overlaps')) {
        toast.push('Failed to update event', 'error');
        Alert.alert('Error', 'Failed to update event');
      }
    } finally {
      setSaving(false);
    }
  };


  const renderViewMode = () => {
    const selectedMaterials = materials.filter(m => attachedMaterialIds.includes(m.id));
    
    // Get end date for display - use state first, then fallback to event's end_ts
    let displayEndDate = eventEndDate;
    if (!displayEndDate && event?.end_ts) {
      const isMultiDayEventType = event?.event_type && ['Project', 'Trip', 'Holiday', 'Other'].includes(event.event_type);
      if (isMultiDayEventType) {
        const endDateObj = new Date(event.end_ts);
        const startDateObj = event?.start_ts ? new Date(event.start_ts) : dueDate;
        if (startDateObj) {
          const endDateOnly = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate());
          const startDateOnly = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
          // Only use if different from start date
          if (endDateOnly.getTime() !== startDateOnly.getTime()) {
            displayEndDate = endDateOnly;
          }
        }
      }
    }

    const parentHelpAssignment = parentLinkedAssignments.find((a) => a.need_help);
    const parentSubmissionAssignment = parentLinkedAssignments.find(
      (a) =>
        a.status === 'submitted' &&
        (a.review_status == null || a.review_status === 'needs_revision')
    );
    const parentChildLabel = (a) =>
      a?.child?.first_name ||
      familyMembers.find((m) => String(m.id) === String(a?.child_id))?.name ||
      'Child';

    const showParentAlertsRow =
      isParentView &&
      event?.id &&
      isSchoolWorkEventType(event?.event_type || eventType) &&
      (!parentLinkedReady || parentHelpAssignment || parentSubmissionAssignment);

    return (
      <SafeView style={{ flex: 1, backgroundColor: '#ffffff' }}>
        {/* Header / Title */}
        <View style={styles.header}>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>EVENT DETAILS</Text>
          </View>
          <Text style={styles.headerTitleLarge}>
            {draftTitle || event?.title || 'Untitled Event'}
          </Text>
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
          <SafeView style={{ flex: 1 }}>
          {/* Parent: help / submission — above plan + send banners (same footprint as gray banners) */}
          {showParentAlertsRow && (
            <View style={{ alignSelf: 'stretch', marginTop: 14, marginBottom: 4 }}>
              <View
                style={{
                  alignSelf: 'stretch',
                  backgroundColor: 'rgba(79, 70, 229, 0.07)',
                  borderRadius: 10,
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                  borderWidth: 1,
                  borderColor: 'rgba(79, 70, 229, 0.18)',
                }}
              >
                {!parentLinkedReady ? (
                  <View
                    style={{
                      minHeight: 40,
                      justifyContent: 'center',
                    }}
                  >
                    <ActivityIndicator size="small" color="#89B5E4" />
                  </View>
                ) : (
                  <>
                    {parentHelpAssignment ? (
                      <Text style={{ color: FG, fontSize: 13, lineHeight: 18, ...webCooper(400) }}>
                        {parentChildLabel(parentHelpAssignment)} asked for help on this.{' '}
                        <Text
                          onPress={() => {
                            setParentHelpModalAssignment(parentHelpAssignment);
                            setShowParentHelpModal(true);
                          }}
                          style={{
                            fontSize: 13,
                            color: '#EA580C',
                            ...webCooper(700),
                            ...(Platform.OS === 'web' && { cursor: 'pointer' }),
                          }}
                        >
                          Respond to help request
                        </Text>
                      </Text>
                    ) : null}
                    {parentSubmissionAssignment ? (
                      <View style={{ marginTop: parentHelpAssignment ? 12 : 0 }}>
                        <Text style={{ color: FG, fontSize: 13, lineHeight: 18, ...webCooper(400) }}>
                          {parentChildLabel(parentSubmissionAssignment)} submitted work for review.
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            setParentSubmissionModalAssignment(parentSubmissionAssignment);
                            setShowParentSubmissionModal(true);
                          }}
                          style={{ marginTop: 8, alignSelf: 'flex-start' }}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={{ fontSize: 13, color: '#2563EB', ...webCooper(700) }}>Review submission</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            </View>
          )}

          {showChipConflictBanner ? renderPersistentConflictContainer(false) : null}

          {/* Banner when event is connected to a plan - at top */}
          {countsTowardPlan && academicYearId && (() => {
            const planLabel = formatAcademicYearPlanLabel(resolvedAcademicYearRow) || 'this plan';
            return (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  if (typeof window !== 'undefined') {
                    onClose?.();
                    window.dispatchEvent(
                      new CustomEvent('openPlanYearModal', {
                        detail: {
                          from: 'event_details',
                          openInSubjectsSchedule: true,
                      academicYearId:
                        academicYearId ||
                        event?.academic_year_id ||
                        event?.data?.academic_year_id ||
                        null,
                          subjectId:
                            event?.subject_id != null ? String(event.subject_id) : null,
                          skipPlanSummary: true,
                      openToEditList: !(
                        academicYearId ||
                        event?.academic_year_id ||
                        event?.data?.academic_year_id
                      ),
                        },
                      })
                    );
                  }
                }}
                style={[styles.connectedPlanBanner, { marginTop: 8 }]}
                {...(Platform.OS === 'web' && { type: 'button', cursor: 'pointer' })}
              >
                <Text style={styles.connectedPlanBannerText}>
                  This event is connected to {planLabel}. To make changes to the connected plan{' '}
                  <Text style={styles.connectedPlanBannerLink}>click here.</Text>
                </Text>
              </TouchableOpacity>
            );
          })()}

          {isParentView &&
            !readOnly &&
            event?.id &&
            familyId &&
            isSchoolWorkEventType(event?.event_type || eventType) &&
            assigneeIds.length > 0 &&
            hasInvitedAssignee && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setShowSendToStudentModal(true)}
                style={[
                  styles.connectedPlanBanner,
                  styles.sendToStudentBanner,
                  (countsTowardPlan && academicYearId) || showParentAlertsRow ? { marginTop: 8 } : { marginTop: 14 },
                ]}
                {...(Platform.OS === 'web' && { type: 'button', cursor: 'pointer' })}
                accessibilityRole="button"
                accessibilityLabel="Send to student"
              >
                <Text style={styles.connectedPlanBannerText}>
                  To send this to your student as a required submission,{' '}
                  <Text style={styles.connectedPlanBannerLink}>click here.</Text>
                </Text>
              </TouchableOpacity>
            )}

          {/* Event Type - at top */}
          {eventType && (
            <SafeFieldRow style={[styles.fieldRow, { marginTop: 10, marginBottom: 8 }]}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Event Type</Text>
                <View style={styles.dropdownContainer}>
                  <View style={[styles.dropdownOption, styles.dropdownOptionActive]}>
                    <Text style={[styles.dropdownOptionText, styles.dropdownOptionTextActive]}>
                      {eventType}
                    </Text>
                  </View>
                </View>
              </View>
            </SafeFieldRow>
          )}

          {viewerRole === 'tutor' && event?.id && familyId ? (
            <TutorEventHelpPanel
              eventId={event.id}
              familyId={familyId}
              onUpdated={() => onEventUpdated?.()}
            />
          ) : null}

          {/* Tags - show if they exist */}
          {Array.isArray(event?.tags) && event.tags.length > 0 && (
            <SafeFieldRow style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Tags</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {event.tags.map((tag, index) => (
                    <View
                      key={index}
                      style={{
                        backgroundColor: CHIP_BG,
                        borderWidth: 1,
                        borderColor: CHIP_BORDER,
                        borderRadius: 16,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: FG }}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </SafeFieldRow>
          )}

          {/* Date and Assignee - side by side in chipRow */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            style={{ marginBottom: 0 }}
          >
            {/* Date chip */}
            {placement === 'calendar' ? (
              <View style={styles.chip}>
                <View>
                  <Text style={styles.chipLabel}>Date</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <View style={[styles.chipOption, styles.chipOptionActive]}>
                    <Text style={[styles.chipOptionText, styles.chipOptionTextActive]}>
                      {displayEndDate && dueDate && displayEndDate.getTime() !== dueDate.getTime() 
                        ? fmtDateRange(dueDate, displayEndDate)
                        : dueDate ? fmt(dueDate) : '—'
                      }
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Assignee chip - show only selected */}
            {assigneeIds.length > 0 ? (
              <View style={styles.chip}>
                <View>
                  <Text style={styles.chipLabel}>Assignee</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  {assigneeIds.map((id) => {
                    const member = familyMembers.find(m => m.id === id);
                    if (!member) return null;
                    return (
                      <View key={id} style={[styles.chipOption, styles.chipOptionActive]}>
                        <Text style={[styles.chipOptionText, styles.chipOptionTextActive]}>
                          {member.name || member.first_name || 'Unknown'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </ScrollView>

          {/* Schedule Time - in gray rounded block */}
          {placement === 'calendar' && (
            <SafeView style={styles.fieldRow}>
              <View style={styles.timeSection}>
                <View style={styles.timeToggleRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.sectionLabel}>Schedule time</Text>
                  </View>
                  {isRecurring && (
                    <View style={styles.allDayControl}>
                      <Text style={styles.allDayLabel}>Recurring</Text>
                      <Text style={{ color: FG, fontSize: 13, marginTop: 4 }}>Enabled</Text>
                    </View>
                  )}
                </View>
                {!allDay && (
                  <View style={styles.timeInputsRow}>
                    <View style={[styles.timeField, { minWidth: 120 }]}>
                      <Text style={styles.timeLabel}>Start</Text>
                      <Text style={{ color: FG, fontSize: 14, marginTop: 4 }}>{startTime || 'Not set'}</Text>
                    </View>
                    <View style={[styles.timeField, { minWidth: 120 }]}>
                      <Text style={styles.timeLabel}>End</Text>
                      <Text style={{ color: FG, fontSize: 14, marginTop: 4 }}>{endTime || 'Not set'}</Text>
                    </View>
                  </View>
                )}
                {isRecurring && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.timeLabel, { marginBottom: 8 }]}>Recurrence</Text>
                    <Text style={{ color: SUB, fontSize: 13 }}>
                      {recurrenceType.charAt(0).toUpperCase() + recurrenceType.slice(1)}
                      {recurrenceInterval ? ` every ${recurrenceInterval} ${recurrenceType === 'daily' ? 'day(s)' : recurrenceType === 'weekly' ? 'week(s)' : 'month(s)'}` : ''}
                      {recurrenceEndType === 'never' ? ' (never ends)' : recurrenceEndType === 'after' ? ` (ends after ${recurrenceEndAfter} occurrence${recurrenceEndAfter !== 1 ? 's' : ''})` : recurrenceEndDate ? ` (ends on ${fmt(recurrenceEndDate)})` : ''}
                    </Text>
                  </View>
                )}
              </View>
            </SafeView>
          )}

          {/* Logistic Details - show if location, mode, or instructor exist */}
          {(location || mode || instructor) && (
            <SafeView style={styles.academicSection}>
              <View
                style={{
                  paddingVertical: 4,
                }}
              >
                <Text style={styles.sectionLabel}>Logistical details</Text>
              </View>
                  {location && (
                    <SafeFieldRow style={styles.fieldRow}>
                      <View style={styles.field}>
                        <Text style={[styles.fieldLabel, { fontWeight: '700' }]}>Location</Text>
                        <Text style={{ color: FG, fontSize: 14, marginTop: 4 }}>{location}</Text>
                      </View>
                    </SafeFieldRow>
                  )}
                  {mode && (
                    <SafeFieldRow style={styles.fieldRow}>
                      <View style={styles.field}>
                        <Text style={[styles.fieldLabel, { fontWeight: '700' }]}>Mode</Text>
                        <Text style={{ color: FG, fontSize: 14, marginTop: 4 }}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</Text>
                      </View>
                    </SafeFieldRow>
                  )}
                  {instructor && (
                    <SafeFieldRow style={styles.fieldRow}>
                      <View style={styles.field}>
                        <Text style={[styles.fieldLabel, { fontWeight: '700' }]}>Instructor / Host</Text>
                        <Text style={{ color: FG, fontSize: 14, marginTop: 4 }}>{instructor}</Text>
                      </View>
                    </SafeFieldRow>
                  )}
            </SafeView>
          )}

          {/* Academic Details - keep as is */}
          {(subjectId || unit || lesson || grade || event?.percent_of_total_grade) && (
            <SafeView style={[styles.academicSection, styles.academicSectionTopSpacing]}>
              <View
                style={{
                  paddingVertical: 4,
                }}
              >
                <Text style={styles.sectionLabel}>Academic Details</Text>
              </View>
              {subjectId && (
                <SafeFieldRow style={[styles.fieldRow, styles.fieldRowFull]}>
                  <View style={[styles.field, styles.fieldStretch]}>
                    <Text style={[styles.fieldLabel, { fontWeight: '700' }]}>Subject</Text>
                    {loadingSubjects && !resolvedSubjectLabel ? (
                      <View style={{ marginTop: 8, alignItems: 'flex-start' }}>
                        <ActivityIndicator size="small" color={MUTED} />
                      </View>
                    ) : (
                      <Text style={{ color: FG, fontSize: 14, marginTop: 4, width: '100%' }}>
                        {resolvedSubjectLabel || subjectName || 'Unknown'}
                      </Text>
                    )}
                  </View>
                </SafeFieldRow>
              )}
              {unit ? (
                <SafeFieldRow style={[styles.fieldRow, styles.fieldRowFull]}>
                  <View style={[styles.field, styles.fieldStretch]}>
                    <Text style={[styles.fieldLabel, { fontWeight: '700' }]}>Unit</Text>
                    <Text style={{ color: FG, fontSize: 14, marginTop: 4, width: '100%' }}>{unit}</Text>
                  </View>
                </SafeFieldRow>
              ) : null}
              {lesson ? (
                <SafeFieldRow style={[styles.fieldRow, styles.fieldRowFull]}>
                  <View style={[styles.field, styles.fieldStretch]}>
                    <Text style={[styles.fieldLabel, { fontWeight: '700' }]}>Lesson</Text>
                    <Text style={{ color: FG, fontSize: 14, marginTop: 4, width: '100%' }}>{lesson}</Text>
                  </View>
                </SafeFieldRow>
              ) : null}
              {grade && (
                <SafeFieldRow style={styles.fieldRow}>
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { fontWeight: '700' }]}>Grade</Text>
                    <Text style={{ color: FG, fontSize: 14, marginTop: 4 }}>{grade}</Text>
                  </View>
                </SafeFieldRow>
              )}
              {event?.percent_of_total_grade != null && (
                <SafeFieldRow style={styles.fieldRow}>
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { fontWeight: '700' }]}>% of Total Grade</Text>
                    <Text style={{ color: FG, fontSize: 14, marginTop: 4 }}>
                      {parseFloat(event.percent_of_total_grade).toFixed(1)}%
                    </Text>
                  </View>
                </SafeFieldRow>
              )}
              {attachedStandards.length > 0 && (
                <SafeFieldRow style={styles.fieldRow}>
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { fontWeight: '700' }]}>Standards</Text>
                    <View style={{ marginTop: 8 }}>
                      {attachedStandards.map((standard) => (
                        <Text key={standard.id} style={{ color: FG, fontSize: 13, marginBottom: 4 }}>
                          {standard.code || standard.name || standard.id}
                        </Text>
                      ))}
                    </View>
                  </View>
                </SafeFieldRow>
              )}
            </SafeView>
          )}

          {/* Attachments - show as links */}
          {selectedMaterials.length > 0 && (
            <SafeFieldRow style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Attachments</Text>
                <View style={{ marginTop: 8 }}>
                  {selectedMaterials.map((material) => (
                    <TouchableOpacity
                      key={material.id}
                      onPress={async () => {
                        // Check if it's a file-based material (has storage_path)
                        const isFileBased = material.storage_path && material.storage_path.trim() !== '';
                        
                        if (isFileBased) {
                          // Check if it's a PDF (by mime type or file extension)
                          const isPdf = material.mime === 'application/pdf' || 
                                        (material.storage_path && material.storage_path.toLowerCase().endsWith('.pdf')) ||
                                        (material.title && material.title.toLowerCase().endsWith('.pdf'));
                          
                          if (material.storage_path && isPdf) {
                            try {
                              // Use signed URL for better compatibility
                              const { data: signedUrlData, error: signedError } = await supabase.storage
                                .from('evidence')
                                .createSignedUrl(material.storage_path, 3600); // 1 hour expiry
                              
                              if (signedError) {
                                console.error('[EventDetails] Error getting signed URL:', signedError);
                                Alert.alert(
                                  'File Access Error',
                                  `Unable to access the file: ${signedError.message || 'Storage error'}.`
                                );
                                return;
                              } else if (signedUrlData?.signedUrl) {
                                setPdfUrl(signedUrlData.signedUrl);
                                setPdfTitle(material.title || 'Attachment');
                                setShowPdfViewer(true);
                              } else {
                                Alert.alert(
                                  'File Access Error',
                                  'Unable to generate a URL for this file. Please try again later.'
                                );
                              }
                            } catch (err) {
                              console.error('[EventDetails] Error getting PDF URL:', err);
                              Alert.alert(
                                'Error',
                                `Unable to open file: ${err.message || 'Unknown error'}`
                              );
                            }
                          } else {
                            // File-based but not PDF - open in new tab
                            const fileUrl = `${supabase.supabaseUrl}/storage/v1/object/public/materials/${material.storage_path}`;
                            if (Platform.OS === 'web') {
                              window.open(fileUrl, '_blank');
                            }
                          }
                        } else {
                          // Non-file-based material - only use provider_url if it's a Supabase storage URL
                          if (material.provider_url && 
                              material.provider_url.toLowerCase().endsWith('.pdf') && 
                              isSupabaseStorageUrl(material.provider_url)) {
                            setPdfUrl(material.provider_url);
                            setPdfTitle(material.title || 'Attachment');
                            setShowPdfViewer(true);
                          } else if (material.provider_url) {
                            // External URL - open in new tab
                            if (Platform.OS === 'web') {
                              window.open(material.provider_url, '_blank');
                            }
                          }
                        }
                      }}
                      style={{ marginBottom: 8 }}
                    >
                      <Text style={{ color: ACCENT, fontSize: 14, textDecorationLine: 'underline' }}>
                        {material.title || 'View Attachment'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </SafeFieldRow>
          )}

          {/* Notes */}
          {notes && notes.trim() && (
            <SafeFieldRow style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Notes</Text>
                <Text style={{ color: FG, fontSize: 14, marginTop: 4 }}>{notes}</Text>
              </View>
            </SafeFieldRow>
          )}

          {session?.role_flags?.isChild &&
            event?.id &&
            isSchoolWorkEventType(event?.event_type || eventType) && (
              <SafeFieldRow style={[styles.fieldRow, { marginTop: 4 }]}>
                <View
                  style={{
                    alignSelf: 'stretch',
                    backgroundColor: 'rgba(79, 70, 229, 0.07)',
                    borderRadius: 12,
                    paddingTop: 10,
                    paddingBottom: 18,
                    paddingHorizontal: 14,
                  }}
                >
                  <Text style={styles.fieldLabel}>Need help with this?</Text>
                  {!linkedHelpReady ? (
                    <View
                      style={{
                        minHeight: 72,
                        marginTop: 8,
                        justifyContent: 'center',
                        alignItems: 'flex-start',
                      }}
                      accessibilityLabel="Loading help status"
                    >
                      <ActivityIndicator size="small" color="#89B5E4" />
                    </View>
                  ) : eventLinkedHelpAssignment?.need_help ? (
                    <>
                      <Text style={{ color: FG, fontSize: 14, marginTop: 6, lineHeight: 20 }}>
                        Your parent can see your message. You can send another note anytime.
                      </Text>
                      <View
                        style={{
                          marginTop: 14,
                          flexDirection: 'row',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 12,
                        }}
                      >
                        <TouchableOpacity
                          onPress={() => setShowStudentHelpHistoryModal(true)}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityLabel="View what you sent"
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <View
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 6,
                              borderRadius: 999,
                              backgroundColor: '#EBF5FF',
                              borderWidth: 1,
                              borderColor: '#89B5E4',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: '700',
                                color: '#89B5E4',
                                ...(Platform.OS === 'web' && {
                                  fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                }),
                              }}
                            >
                              Asked
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            setAskHelpModalAssignment(eventLinkedHelpAssignment);
                            setShowAskParentHelpModal(true);
                          }}
                          activeOpacity={0.85}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: '600',
                              color: '#89B5E4',
                              ...(Platform.OS === 'web' && {
                                fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                              }),
                            }}
                          >
                            Ask another question
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={{ color: FG, fontSize: 14, marginTop: 6, lineHeight: 20 }}>
                        Get help from your parent on this assignment.
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          setAskHelpModalAssignment(null);
                          setShowAskParentHelpModal(true);
                        }}
                        style={{
                          marginTop: 16,
                          alignSelf: 'flex-start',
                          paddingVertical: 12,
                          paddingHorizontal: 20,
                          borderRadius: 10,
                          backgroundColor: '#85C4F2',
                          ...(Platform.OS === 'web' && {
                            boxShadow: '0 2px 6px rgba(133, 196, 242, 0.35)',
                            cursor: 'pointer',
                          }),
                        }}
                        activeOpacity={0.9}
                      >
                        <Text
                          style={{
                            color: '#fff',
                            fontWeight: '500',
                            fontSize: 15,
                            ...(Platform.OS === 'web' && {
                              fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                            }),
                          }}
                        >
                          Ask for help
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </SafeFieldRow>
            )}

          </SafeView>
        </ScrollView>

        {/* Footer: Cancel left; Delete Event (neutral) + Edit Event (primary) */}
        <SafeView style={[styles.footer, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <TouchableOpacity onPress={onClose} style={{ paddingVertical: 10, paddingHorizontal: 20 }}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          {!readOnly && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {event?.id && (
              <TouchableOpacity
                {...(Platform.OS === 'web' && { type: 'button' })}
                onPress={() => handleDelete()}
                disabled={deleting}
                style={{ paddingVertical: 10, paddingHorizontal: 20, ...(Platform.OS === 'web' && { cursor: deleting ? 'not-allowed' : 'pointer' }) }}
              >
                <Text style={[styles.deleteEventText, deleting && { opacity: 0.6 }]}>
                  {deleting ? 'Deleting…' : 'Delete Event'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => {
                setEditing(true);
                onEditingChange?.(true);
              }}
              style={styles.createButton}
              activeOpacity={0.9}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Edit2 size={16} color="#FFF" />
              <Text style={styles.createButtonText}>Edit Event</Text>
            </TouchableOpacity>
          </View>
          )}
        </SafeView>
      </SafeView>
    );
  };

  const renderEditForm = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      console.log('[EventDetails] renderEditForm called');
    }
    return (
    <SafeView style={{ flex: 1, backgroundColor: '#ffffff' }}>
      {/* Header: title only (matches plan summary header) */}
      <View style={styles.headerEditEvent}>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>EDIT EVENT</Text>
        </View>
        <TextInput
          placeholder="Event name"
          placeholderTextColor={MUTED}
          value={draftTitle}
          onChangeText={(text) => {
            setDraftTitle(text);
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
      <View style={styles.headerDivider} />

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
      {showChipConflictBanner ? renderPersistentConflictContainer(false) : conflictWarning && (
        <View
          style={[
            cb.banner,
            {
              marginTop: 8,
              marginBottom: 8,
              marginHorizontal: 0,
            },
          ]}
        >
          <View style={cb.bannerContentCompact}>
            <View style={cb.bannerIconWrapSm}>
              <AlertCircle size={14} color="#5B8FC7" />
            </View>
            <View style={cb.bannerTextGrow}>
              {editFormConflictRich?.kind === 'rich' ? (
                <View style={cb.conflictLine}>
                  <Text style={cb.kicker}>Conflict with </Text>
                  <LearnerPill
                    child={editFormConflictRich.learner}
                    nameFallback={editFormConflictRich.nameFallback || undefined}
                  />
                  <Text style={cb.conflictTitle} numberOfLines={1}>
                    {' '}
                    — {editFormConflictRich.conflictingTitle}
                  </Text>
                  {editFormConflictRich.metaLine ? (
                    <Text style={cb.metaInline} numberOfLines={1}>
                      {' '}
                      · {editFormConflictRich.metaLine}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text style={cb.bannerMessagePlain} numberOfLines={2}>
                  Conflicts with {editFormConflictRich?.text || conflictWarning.message}
                </Text>
              )}
            </View>
            <View style={cb.bannerActionsRow}>
              <TouchableOpacity
                {...(Platform.OS === 'web' && { type: 'button' })}
                onPress={async (e) => {
                  if (Platform.OS === 'web' && e) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                  applySuggestedConflictChange(
                    conflictWarning?.suggestedChange ||
                    chipConflictSuggestion ||
                    conflictResolutionContext?.suggestedChange
                  );
                }}
                style={cb.primaryButton}
              >
                <Text style={cb.primaryButtonText}>Adjust automatically</Text>
              </TouchableOpacity>
              <TouchableOpacity
                {...(Platform.OS === 'web' && { type: 'button' })}
                onPress={(e) => {
                  if (Platform.OS === 'web' && e) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                  setShouldAllowOverlaps(true);
                  setConflictWarning(null);
                  handleSave(false, true);
                }}
                style={cb.ghostButton}
              >
                <Text style={cb.ghostButtonText}>Save anyway</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Plan link banner + Send to student — top of form, under plan context (matches read-only order) */}
      {countsTowardPlan && academicYearId && (() => {
        const planLabel = formatAcademicYearPlanLabel(resolvedAcademicYearRow) || 'this plan';
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              if (typeof window !== 'undefined') {
                onClose?.();
                window.dispatchEvent(
                  new CustomEvent('openPlanYearModal', {
                    detail: {
                      from: 'event_details',
                      openInSubjectsSchedule: true,
                      academicYearId:
                        academicYearId ||
                        event?.academic_year_id ||
                        event?.data?.academic_year_id ||
                        null,
                      subjectId:
                        event?.subject_id != null ? String(event.subject_id) : null,
                      skipPlanSummary: true,
                      openToEditList: !(
                        academicYearId ||
                        event?.academic_year_id ||
                        event?.data?.academic_year_id
                      ),
                    },
                  })
                );
              }
            }}
            style={[styles.connectedPlanBanner, { marginTop: 8 }]}
            {...(Platform.OS === 'web' && { type: 'button', cursor: 'pointer' })}
          >
            <Text style={styles.connectedPlanBannerText}>
              This event is connected to {planLabel}. To make changes to the connected plan{' '}
              <Text style={styles.connectedPlanBannerLink}>click here.</Text>
            </Text>
          </TouchableOpacity>
        );
      })()}

      {isParentView &&
        !readOnly &&
        event?.id &&
        familyId &&
        isSchoolWorkEventType(eventType) &&
        assigneeIds.length > 0 &&
        hasInvitedAssignee && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setShowSendToStudentModal(true)}
            style={[
              styles.connectedPlanBanner,
              styles.sendToStudentBanner,
              (countsTowardPlan && academicYearId) ? { marginTop: 8 } : { marginTop: 14 },
            ]}
            {...(Platform.OS === 'web' && { type: 'button', cursor: 'pointer' })}
            accessibilityRole="button"
            accessibilityLabel="Send to student"
          >
            <Text style={styles.connectedPlanBannerText}>
              To send this to your student as a required submission,{' '}
              <Text style={styles.connectedPlanBannerLink}>click here.</Text>
            </Text>
          </TouchableOpacity>
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
                  setEventType(type);
                  setShowRequiresSubmissionHome(
                    defaultRequiresSubmissionHomeForEventType(type === 'Class Day' ? 'Lesson' : type)
                  );
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
          const isMultiDayEvent = ['Trip', 'Holiday', 'Project', 'Other'].includes(eventType);
          
          if (isMultiDayEvent) {
            // Start date picker for multi-day events
            return (
              <View style={[styles.chip, validationErrors.date && styles.chipFieldError]}>
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
              <View style={[styles.chip, validationErrors.date && styles.chipFieldError]}>
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
          }
        })()}

        {/* Assignee chip — error text sits under this column, not full modal width */}
        {familyMembers.length > 0 && (
          <View style={styles.assigneeChipColumn}>
            <View style={[styles.chip, validationErrors.assignee && styles.chipFieldError]}>
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
                        if (validationErrors.assignee) {
                          setValidationErrors((prev) => {
                            if (!prev.assignee) return prev;
                            const next = { ...prev };
                            delete next.assignee;
                            return next;
                          });
                        }
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
            {validationErrors.assignee ? (
              <Text style={styles.assigneeErrorText}>{validationErrors.assignee}</Text>
            ) : null}
          </View>
        )}
      </ScrollView>
      {validationErrors.date ? (
        <View style={{ marginTop: 4, marginBottom: 4, paddingHorizontal: 0 }}>
          <Text style={styles.errorTextSmall}>{validationErrors.date}</Text>
        </View>
      ) : null}


      {/* End date picker - shown below start date for multi-day events */}
      {placement === 'calendar' && ['Trip', 'Holiday', 'Project', 'Other'].includes(eventType) && (
        <View style={{ marginTop: 8, marginBottom: 8, paddingHorizontal: 0 }}>
          <View style={[
            styles.chip,
            { alignSelf: 'flex-start', marginRight: 0 },
            validationErrors.endDate && { borderColor: '#ef4444', borderWidth: 1.5 }
          ]}>
            <Text style={[styles.chipLabel, { marginRight: 12 }]}>End:</Text>
            <TouchableOpacity onPress={() => eventEndDate && setEventEndDate(addDays(eventEndDate, -1))}>
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
            <TouchableOpacity 
              onPress={() => {
                const today = new Date();
                const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                setEventEndDate(todayDateOnly);
                setEventEndDateCalendarViewMonth(todayDateOnly);
              }} 
              style={styles.todayButton}
            >
              <Text style={styles.todayText}>Today</Text>
            </TouchableOpacity>
          </View>
          {validationErrors.endDate && (
            <Text style={styles.errorTextSmall}>{validationErrors.endDate}</Text>
          )}
        </View>
      )}

      <SafeView>
        {placement === 'calendar' && (
          <View style={[styles.timeSection, validationErrors.time && styles.timeSectionError]}>
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
            setDraftAllDay(value);
            if (value) {
                        setStartTime('');
                        setEndTime('');
              setDraftStartTime('');
              setDraftEndTime('');
                        if (validationErrors.time) {
                          setValidationErrors({ ...validationErrors, time: null });
                        }
                      } else {
                        setStartTime(startTime || DEFAULT_START_TIME);
                        setEndTime(endTime || '');
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
                    onValueChange={(v) => {
                      setIsRecurring(v);
                      if (validationErrors.recurrenceEnd) {
                        setValidationErrors((prev) => ({ ...prev, recurrenceEnd: null }));
                      }
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
                          setDraftStartTime(formatted);
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
                        borderColor: validationErrors.time ? '#ef4444' : '#e5e7eb',
                        borderStyle: 'solid',
                        fontSize: 14,
                        color: '#111827',
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
                        const formatted = formatTimeInput(text);
                        setStartTime(formatted);
                setDraftStartTime(formatted);
                        if (validationErrors.time) {
                          setValidationErrors({ ...validationErrors, time: null });
                        }
                      }}
                      style={[
                        styles.timeInputEdit,
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
                          setDraftEndTime(formatted);
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
                        borderColor: '#e5e7eb',
                        borderStyle: 'solid',
                        fontSize: 14,
                        color: '#111827',
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
                        const formatted = formatTimeInput(text);
                        setEndTime(formatted);
                        setDraftEndTime(formatted);
                      }}
                      style={styles.timeInputEdit}
                      autoCapitalize="characters"
                    />
                  )}
                </View>
              </View>
            )}
            {isRecurring && (
              <View style={styles.recurringSectionContent}>
                {/* Repeat and Every in one row */}
                <View style={{ marginBottom: 16, flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: SUB, fontSize: 12, marginBottom: 8, fontWeight: '500' }}>Repeat</Text>
                    <ChipRow style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' }}>
                      {['daily', 'weekly', 'monthly'].map((type) => (
                        <TouchableOpacity
                          key={type}
                          onPress={() => setRecurrenceType(type)}
                          style={[
                            {
                              paddingVertical: 6,
                              paddingHorizontal: 12,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: CHIP_BORDER,
                              backgroundColor: '#fff',
                            },
                            recurrenceType === type && {
                              backgroundColor: '#e0f2fe',
                              borderColor: '#bae6fd',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              {
                                color: FG,
                                fontSize: 12,
                              },
                              recurrenceType === type && {
                                fontWeight: '600',
                                color: FG,
                              },
                            ]}
                          >
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ChipRow>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: SUB, fontSize: 12, marginBottom: 8, fontWeight: '500' }}>Every</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput
                        style={{
                          borderWidth: 1,
                          borderColor: BORDER,
                          borderRadius: 10,
                          width: 60,
                          textAlign: 'center',
                          marginBottom: 0,
                          paddingVertical: 6,
                          paddingHorizontal: 12,
                          height: 'auto',
                          color: FG,
                        }}
                        value={recurrenceIntervalText}
                        onChangeText={(text) => {
                          if (text === '' || /^\d+$/.test(text)) {
                            setRecurrenceIntervalText(text);
                            const num = parseInt(text, 10);
                            if (!isNaN(num) && num > 0) {
                              setRecurrenceInterval(num);
                            }
                          }
                        }}
                        onBlur={() => {
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
                    <Text style={{ color: SUB, fontSize: 12, marginBottom: 8, fontWeight: '500' }}>Ends</Text>
                    <ChipRow style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' }}>
                      {['never', 'after', 'on'].map((endType) => (
              <TouchableOpacity
                          key={endType}
                          onPress={() => {
                            setRecurrenceEndType(endType);
                            if (validationErrors.recurrenceEnd) {
                              setValidationErrors((prev) => ({ ...prev, recurrenceEnd: null }));
                            }
                          }}
                          style={[
                            {
                              paddingVertical: 6,
                              paddingHorizontal: 12,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: CHIP_BORDER,
                              backgroundColor: '#fff',
                            },
                            recurrenceEndType === endType && {
                              backgroundColor: '#e0f2fe',
                              borderColor: '#bae6fd',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              {
                                color: FG,
                                fontSize: 12,
                              },
                              recurrenceEndType === endType && {
                                fontWeight: '600',
                                color: FG,
                              },
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
                      <Text style={{ color: SUB, fontSize: 12, marginBottom: 8, fontWeight: '500' }}>Number of occurrences</Text>
                      <TextInput
                        style={{
                          borderWidth: validationErrors.recurrenceEnd && recurrenceEndType === 'after' ? 1.5 : 1,
                          borderColor:
                            validationErrors.recurrenceEnd && recurrenceEndType === 'after' ? '#ef4444' : BORDER,
                          borderRadius: 10,
                          width: 100,
                          marginBottom: 0,
                          paddingVertical: 6,
                          paddingHorizontal: 12,
                          height: 'auto',
                          color: FG,
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
                      />
                    </View>
                  )}
                  {recurrenceEndType === 'on' && (
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: SUB, fontSize: 12, marginBottom: 8, fontWeight: '500' }}>End date</Text>
                      <TouchableOpacity
                        style={{
                          borderWidth: validationErrors.recurrenceEnd && recurrenceEndType === 'on' ? 1.5 : 1,
                          borderColor:
                            validationErrors.recurrenceEnd && recurrenceEndType === 'on' ? '#ef4444' : BORDER,
                          borderRadius: 10,
                          marginBottom: 0,
                          paddingVertical: 6,
                          paddingHorizontal: 12,
                          height: 'auto',
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
                        <Text style={{ color: recurrenceEndDate ? FG : MUTED }}>
                          {recurrenceEndDate ? fmt(recurrenceEndDate) : 'Select end date'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                {validationErrors.recurrenceEnd ? (
                  <Text style={[styles.errorTextSmall, { marginTop: 8 }]}>{validationErrors.recurrenceEnd}</Text>
                ) : null}
              </View>
            )}
          </View>
        )}
      </SafeView>
        {/* Logistical details section */}
        <ModalSectionCard
          Icon={MapPin}
          title="Logistical details"
          subtitle="Location, mode, and host"
          expanded={showLogisticDetails}
          onPress={() => setShowLogisticDetails(!showLogisticDetails)}
          accent="#7C70F4"
        >
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
                  <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Instructor / Host (optional)</Text>
                  <TextInput
                    placeholder="e.g. Elisa"
                    placeholderTextColor={MUTED}
                    value={instructor}
                    onChangeText={setInstructor}
                    style={styles.input}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Mode (optional)</Text>
                  <SafeView style={styles.dropdownContainer}>
                    <ChipRow style={[styles.dropdownRow, { marginTop: 4 }]}>{MODE_OPTIONS.map((m) => (
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
                  <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Add to connected calendar</Text>
                  <SafeView style={styles.dropdownContainer}>
                    <ChipRow style={[styles.dropdownRow, { marginTop: 4 }]}>
                      {CALENDAR_CONNECTION_OPTIONS.map((provider) => {
                        const isSelected = connectedCalendarTargets.includes(provider.value);
                        return (
                          <TouchableOpacity
                            key={provider.value}
                            onPress={() =>
                              setConnectedCalendarTargets((prev) =>
                                prev.includes(provider.value)
                                  ? prev.filter((value) => value !== provider.value)
                                  : [...prev, provider.value]
                              )
                            }
                            style={[
                              styles.dropdownOption,
                              styles.calendarConnectionOption,
                              isSelected && styles.dropdownOptionActive,
                            ]}
                          >
                            <View style={styles.calendarConnectionOptionContent}>
                              {isSelected ? <Check size={12} color="#6BB3E8" /> : null}
                              <Text
                                style={[
                                  styles.dropdownOptionText,
                                  isSelected && styles.dropdownOptionTextActive,
                                ]}
                              >
                                {provider.label}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ChipRow>
                  </SafeView>
                </View>
              </SafeFieldRow>
        </ModalSectionCard>

        {/* Academic details section */}
        <ModalSectionCard
          Icon={GraduationCap}
          title="Academic details"
          subtitle="Scheduling and grading context"
          expanded={showAcademicDetails}
          onPress={() => setShowAcademicDetails(!showAcademicDetails)}
          accent="#7C70F4"
        >
          {/* Academic toggles */}
          {placement === 'calendar' && (
            <View style={{ marginTop: 0, marginBottom: 12 }}>
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
          )}
          {/* Subject + Unit row */}
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
                        ? resolvedSubjectLabel || subjectName || 'Select...' 
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
                  {percentValidationError.suggestedPercent !== null && percentValidationError.suggestedPercent !== undefined && (
                    <View style={{ marginTop: 4, paddingLeft: 22 }}>
                      <Text style={styles.fieldHelpText}>
                        {`Suggested: Use ${percentValidationError.suggestedPercent.toFixed(1)}% to stay within 100%`}
                      </Text>
                      {percentValidationData && percentValidationData.assignments && percentValidationData.assignments.length > 0 && (
                        <View style={{ marginTop: 8 }}>
                          <Text style={[styles.fieldHelpText, { marginBottom: 4, fontWeight: '600' }]}>
                            Or reduce the weight of other assignments:
                          </Text>
                          {percentValidationData.assignments.slice(0, 3).map((assignment, idx) => (
                            <Text key={idx} style={[styles.fieldHelpText, { marginLeft: 8 }]}>
                              {`• ${assignment.title}: ${assignment.percent}%`}
                            </Text>
                          ))}
                          {percentValidationData.assignments.length > 3 && (
                            <Text style={[styles.fieldHelpText, { marginLeft: 8, fontStyle: 'italic' }]}>
                              {`and ${percentValidationData.assignments.length - 3} more...`}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          </SafeFieldRow>
        </ModalSectionCard>

        {/* Notes and attachments section */}
        <ModalSectionCard
          Icon={FileText}
          title="Notes and attachments"
          subtitle="Anything else to remember"
          expanded={showNotesSection}
          onPress={() => setShowNotesSection(!showNotesSection)}
          accent="#7C70F4"
        >
          <View style={{ marginTop: 2 }}>
            <TextInput
              placeholder="Add any additional notes about this event"
              placeholderTextColor={MUTED}
              value={notes}
              onChangeText={(text) => {
                setNotes(text);
                setDraftNotes(text);
              }}
              style={[styles.input, styles.notesInput]}
              multiline
              textAlignVertical="top"
            />
          </View>

          {familyId && (
            <SafeFieldRow style={[styles.fieldRow, { marginTop: 8 }]}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Attachments (optional)</Text>
              <View style={styles.materialSelectorContainer}>
                <TouchableOpacity
                  ref={materialButtonRef}
                  style={styles.materialSelector}
                  onPress={handleMaterialDropdownToggle}
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
                      setDraftMaterialId(null);
                    }}
                  >
                    <Text style={styles.clearMaterialText}>Clear</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.addMaterialButton}
                  onPress={() => setShowAddMaterialModal(true)}
                >
                  <Plus size={14} color="#B8D7F9" />
                  <Text style={styles.addMaterialText}>Add New</Text>
                </TouchableOpacity>
              </View>
              {showMaterialDropdown && Platform.OS === 'web' && (() => {
                let ReactDOM;
                try {
                  ReactDOM = require('react-dom');
                } catch (e) {
                }
                
                const dropdownContent = (
                  <View
                    ref={materialDropdownRef}
                    style={{
                      position: 'fixed',
                      top: materialDropdownPosition.top,
                      left: materialDropdownPosition.left,
                      width: materialDropdownPosition.width || 400,
                      backgroundColor: '#FFFFFF',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: 'rgba(15,23,42,0.08)',
                      padding: 4,
                      minWidth: 400,
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
                    setDraftMaterialId(null);
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
                      setDraftMaterialId(material.id);
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

      {session?.role_flags?.isChild && event?.id && isSchoolWorkEventType(eventType) && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, paddingTop: 4 }}>
          <View
            style={{
              alignSelf: 'stretch',
              backgroundColor: 'rgba(79, 70, 229, 0.07)',
              borderRadius: 10,
              paddingVertical: 10,
              paddingHorizontal: 14,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: FG }}>Need help with this?</Text>
            {!linkedHelpReady ? (
              <View
                style={{
                  minHeight: 52,
                  marginTop: 6,
                  justifyContent: 'center',
                  alignItems: 'flex-start',
                }}
                accessibilityLabel="Loading help status"
              >
                <ActivityIndicator size="small" color="#89B5E4" />
              </View>
            ) : eventLinkedHelpAssignment?.need_help ? (
              <>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, lineHeight: 16 }}>
                  Your parent can see your message. You can send another note anytime.
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => setShowStudentHelpHistoryModal(true)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="View what you sent"
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: '#EBF5FF',
                        borderWidth: 1,
                        borderColor: '#89B5E4',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#89B5E4' }}>Asked</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setAskHelpModalAssignment(eventLinkedHelpAssignment);
                      setShowAskParentHelpModal(true);
                    }}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#89B5E4' }}>Ask another question</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, lineHeight: 16 }}>
                  Get help from your parent on this assignment.
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setAskHelpModalAssignment(null);
                    setShowAskParentHelpModal(true);
                  }}
                  style={{ marginTop: 10, alignSelf: 'flex-start' }}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#89B5E4' }}>Ask for help</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
      <View style={styles.footerDivider} />
      {/* Footer with Cancel, Delete Event (when editing), and Save */}
      <View style={styles.footerEditEvent}>
        <TouchableOpacity
          {...(Platform.OS === 'web' && { type: 'button' })}
          onPress={() => {
          onClose?.();
        }}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <View style={styles.footerEditEventRight}>
          {event?.id && !readOnly && (
            <TouchableOpacity
              {...(Platform.OS === 'web' && { type: 'button' })}
              onPress={() => handleDelete()}
              disabled={deleting}
              style={Platform.OS === 'web' ? { cursor: deleting ? 'not-allowed' : 'pointer' } : undefined}
            >
              <Text style={[styles.deleteEventText, deleting && { opacity: 0.6 }]}>
                {deleting ? 'Deleting…' : 'Delete Event'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
          onPress={() => {
            if (saving) return;
            if (!validateFields()) return;
            handleSave();
          }}
          disabled={saving}
          style={[
            styles.createButton,
            (saving || !isFormValid()) && styles.createButtonDisabled,
            Platform.OS === 'web' && !saving && !isFormValid() && { cursor: 'pointer' },
          ]}
        >
          <Check size={16} color="#FFF" />
          <Text style={[
            styles.createButtonText,
            (saving || !isFormValid()) && styles.createButtonTextDisabled,
          ]}>
            {saving ? 'Saving…' : 'Save changes'}
          </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeView>
  );
  };


  const selectedMaterial = materials.find(m => m.id === draftMaterialId);

  const editFormConflictRich = useMemo(() => {
    if (!conflictWarning) return null;
    const msg = conflictWarning.message || '';
    const ev = conflictWarning.event;
    const parsed = msg ? parseConflictMessageString(msg) : null;
    const movedLike = { child_id: assigneeIds[0], child_ids: assigneeIds };
    const learner = resolveLearnerChild(movedLike, mapChildrenForConflict(familyMembers), parsed?.learnerName);
    const title = ev?.title || parsed?.conflictingTitle;
    const meta = ev ? formatConflictMetaFromEvent(ev) : parsed?.metaLine;
    if (title || parsed) {
      return {
        kind: 'rich',
        learner,
        conflictingTitle: title || parsed?.conflictingTitle || 'Event',
        metaLine: meta || parsed?.metaLine || '',
        nameFallback: parsed?.learnerName,
      };
    }
    return { kind: 'plain', text: msg || 'Schedule conflict' };
  }, [conflictWarning, assigneeIds, familyMembers]);

  const chipConflictRich = useMemo(() => {
    const contextMessage = conflictResolutionContext?.conflictMessage;
    if (contextMessage) {
      const parsed = parseConflictMessageString(contextMessage);
      const learner = resolveLearnerChild(
        conflictResolutionContext?.movedEvent || event,
        mapChildrenForConflict(familyMembers),
        parsed?.learnerName
      );
      if (parsed) {
        return {
          kind: 'rich',
          learner,
          conflictingTitle: parsed.conflictingTitle,
          metaLine: parsed.metaLine,
          nameFallback: parsed.learnerName,
        };
      }
      return { kind: 'plain', text: contextMessage };
    }
    if (!chipConflictMessage) return null;
    const parsed = parseConflictMessageString(chipConflictMessage);
    const learner = resolveLearnerChild(event, mapChildrenForConflict(familyMembers), parsed?.learnerName);
    if (parsed) {
      return {
        kind: 'rich',
        learner,
        conflictingTitle: parsed.conflictingTitle,
        metaLine: parsed.metaLine,
        nameFallback: parsed.learnerName,
      };
    }
    return { kind: 'plain', text: chipConflictMessage };
  }, [chipConflictMessage, conflictResolutionContext, event, familyMembers]);

  const showChipConflictBanner =
    !chipConflictBannerDismissed &&
    !!(
      chipConflictLoading ||
      chipConflictMessage ||
      chipConflictSuggestion ||
      conflictResolutionContext?.conflictMessage ||
      conflictResolutionContext?.suggestedChange
    );

  const applySuggestedConflictChange = useCallback((suggestion) => {
    if (!suggestion?.newStart || !suggestion?.newEnd) return false;
    const nextStart = suggestion.newStart instanceof Date ? suggestion.newStart : new Date(suggestion.newStart);
    const nextEnd = suggestion.newEnd instanceof Date ? suggestion.newEnd : new Date(suggestion.newEnd);
    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) return false;

    setDueDate(nextStart);
    setDraftDate(toDateInput(nextStart.toISOString()));
    setStartTime(formatTimeForInput(nextStart));
    setEndTime(formatTimeForInput(nextEnd));
    setConflictWarning(null);
    setChipConflictMessage(null);
    setChipConflictSuggestion(null);
    setChipConflictBannerDismissed(true);
    setShouldAutoAdjust(true);
    onOpenConflictResolutionConsumed?.();
    return true;
  }, [onOpenConflictResolutionConsumed]);

  const persistSuggestedConflictChange = useCallback(async (suggestion) => {
    if (!event?.id || !suggestion?.newStart || !suggestion?.newEnd) return false;
    const nextStart = suggestion.newStart instanceof Date ? suggestion.newStart : new Date(suggestion.newStart);
    const nextEnd = suggestion.newEnd instanceof Date ? suggestion.newEnd : new Date(suggestion.newEnd);
    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) return false;

    const optimisticPatch = {
      id: event.id,
      previous_start_ts: event.start_ts,
      start_ts: nextStart.toISOString(),
      end_ts: nextEnd.toISOString(),
    };

    applySuggestedConflictChange(suggestion);
    onEventPatched?.(optimisticPatch);

    try {
      const { data, error } = await supabase
        .from('events')
        .update({
          start_ts: nextStart.toISOString(),
          end_ts: nextEnd.toISOString(),
        })
        .eq('id', cleanPlannerEventId(String(event.id)))
        .select()
        .single();
      if (error) throw error;
      onEventPatched?.({
        id: event.id,
        previous_start_ts: event.start_ts,
        ...(data || optimisticPatch),
      });
      onEventUpdated?.();
      return true;
    } catch (err) {
      console.error('[EventDetails] Failed to auto-apply suggested conflict change:', err);
      Alert.alert('Could not adjust automatically', err?.message || 'Please try again.');
      onEventUpdated?.();
      return false;
    }
  }, [applySuggestedConflictChange, event?.id, event?.start_ts, onEventPatched, onEventUpdated]);

  const openPersistentConflictResolution = useCallback(() => {
    const suggestion = chipConflictSuggestion || conflictResolutionContext?.suggestedChange || null;
    if (editing) {
      applySuggestedConflictChange(suggestion);
      return;
    }
    persistSuggestedConflictChange(suggestion);
  }, [applySuggestedConflictChange, chipConflictSuggestion, conflictResolutionContext, editing, persistSuggestedConflictChange]);

  const dismissPersistentConflictResolution = useCallback(() => {
    setChipConflictBannerDismissed(true);
    setChipConflictMessage(null);
    setChipConflictSuggestion(null);
    onOpenConflictResolutionConsumed?.();
    if (Platform.OS === 'web' && event?.id && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('dismissedConflicts');
        const arr = raw ? JSON.parse(raw) : [];
        const next = Array.isArray(arr) ? [...new Set([...arr, String(event.id)])] : [String(event.id)];
        localStorage.setItem('dismissedConflicts', JSON.stringify(next));
      } catch (_) {
        /* ignore */
      }
    }
  }, [event?.id, onOpenConflictResolutionConsumed]);

  const renderPersistentConflictContainer = useCallback((inline = false) => (
    <View
      style={[
        cb.banner,
        inline
          ? { marginTop: 6, marginBottom: 8, marginHorizontal: 0 }
          : { marginTop: 8, marginBottom: 4, marginHorizontal: 0 },
      ]}
    >
      <View style={cb.bannerContentCompact}>
        <View style={cb.bannerIconWrapSm}>
          <AlertCircle size={14} color="#5B8FC7" />
        </View>
        <View style={cb.bannerTextGrow}>
          {chipConflictLoading ? (
            <ActivityIndicator size="small" color="#64748B" style={{ alignSelf: 'flex-start' }} />
          ) : chipConflictRich?.kind === 'rich' ? (
            <>
              <View style={cb.conflictLine}>
                <Text style={cb.kicker}>Conflict with </Text>
                <LearnerPill
                  child={chipConflictRich.learner}
                  nameFallback={chipConflictRich.nameFallback || undefined}
                />
                <Text style={cb.conflictTitle} numberOfLines={1}>
                  {' '}
                  — {chipConflictRich.conflictingTitle}
                </Text>
                {chipConflictRich.metaLine ? (
                  <Text style={cb.metaInline} numberOfLines={1}>
                    {' '}
                    · {chipConflictRich.metaLine}
                  </Text>
                ) : null}
              </View>
              {chipConflictSuggestion?.message ? (
                <Text style={[cb.metaInline, { marginTop: 4 }]} numberOfLines={2}>
                  Suggested change: {chipConflictSuggestion.message}
                </Text>
              ) : conflictResolutionContext?.suggestedChange?.message ? (
                <Text style={[cb.metaInline, { marginTop: 4 }]} numberOfLines={2}>
                  Suggested change: {conflictResolutionContext.suggestedChange.message}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={cb.bannerMessagePlain} numberOfLines={2}>
                Overlaps with {chipConflictRich?.text || chipConflictMessage}
              </Text>
              {chipConflictSuggestion?.message ? (
                <Text style={[cb.metaInline, { marginTop: 4 }]} numberOfLines={2}>
                  Suggested change: {chipConflictSuggestion.message}
                </Text>
              ) : conflictResolutionContext?.suggestedChange?.message ? (
                <Text style={[cb.metaInline, { marginTop: 4 }]} numberOfLines={2}>
                  Suggested change: {conflictResolutionContext.suggestedChange.message}
                </Text>
              ) : null}
            </>
          )}
        </View>
        {!chipConflictLoading && (chipConflictMessage || chipConflictSuggestion) ? (
          <View style={cb.bannerActionsRow}>
            {!readOnly ? (
              <TouchableOpacity
                {...(Platform.OS === 'web' && { type: 'button' })}
                onPress={openPersistentConflictResolution}
                style={cb.primaryButton}
              >
                <Text style={cb.primaryButtonText}>Adjust automatically</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              {...(Platform.OS === 'web' && { type: 'button' })}
              onPress={dismissPersistentConflictResolution}
              style={cb.ghostButton}
            >
              <Text style={cb.ghostButtonText}>Ignore</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  ), [cb, chipConflictLoading, chipConflictMessage, chipConflictRich, chipConflictSuggestion, dismissPersistentConflictResolution, openPersistentConflictResolution, readOnly]);

  useEffect(() => {
    if (!conflictWarning) return;
    editConflictEnterOp.setValue(0);
    editConflictEnterY.setValue(5);
    const useNativeDriver = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(editConflictEnterOp, { toValue: 1, duration: 240, useNativeDriver }),
      Animated.timing(editConflictEnterY, { toValue: 0, duration: 240, useNativeDriver }),
    ]).start();
  }, [conflictWarning]);

  useEffect(() => {
    if (!showChipConflictBanner) return;
    chipConflictEnterOp.setValue(0);
    chipConflictEnterY.setValue(5);
    const useNativeDriver = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(chipConflictEnterOp, { toValue: 1, duration: 240, useNativeDriver }),
      Animated.timing(chipConflictEnterY, { toValue: 0, duration: 240, useNativeDriver }),
    ]).start();
  }, [showChipConflictBanner]);

  return (
    <>
      {showRecurringDeleteModal ? (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deleting) setShowRecurringDeleteModal(false);
        }}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
          activeOpacity={1}
          onPress={() => {
            if (!deleting) setShowRecurringDeleteModal(false);
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => {
              if (Platform.OS === 'web' && e?.stopPropagation) e.stopPropagation();
            }}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              padding: 24,
              maxWidth: 400,
              width: '100%',
              ...(Platform.OS === 'web' ? { boxShadow: '0 10px 25px rgba(0,0,0,0.12)' } : {}),
            }}
          >
            <Text style={[{ fontSize: 18, fontWeight: '700', color: '#111827' }, webCooper('700')]}>
              {isPlanYearBlockSeries(event) ? 'Delete plan lessons?' : 'Delete recurring event?'}
            </Text>
            <Text style={{ marginTop: 12, fontSize: 14, color: '#6b7280', lineHeight: 20 }}>
              {isPlanYearBlockSeries(event)
                ? 'This lesson is part of your year plan schedule. Delete only this day, or remove every matching lesson from the calendar for this plan block.'
                : 'This event is part of a series. Delete only this occurrence, or remove every occurrence in the series.'}
            </Text>
            <View style={{ marginTop: 22, gap: 12 }}>
              <TouchableOpacity
                {...(Platform.OS === 'web' && { type: 'button' })}
                onPress={async () => {
                  setShowRecurringDeleteModal(false);
                  await performDeleteSingleOccurrence();
                }}
                disabled={deleting}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  backgroundColor: '#f3f4f6',
                  alignItems: 'center',
                  ...(Platform.OS === 'web' && { cursor: deleting ? 'not-allowed' : 'pointer' }),
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#374151' }}>Delete this occurrence</Text>
              </TouchableOpacity>
              <TouchableOpacity
                {...(Platform.OS === 'web' && { type: 'button' })}
                onPress={async () => {
                  setShowRecurringDeleteModal(false);
                  await performDeleteEntireSeries();
                }}
                disabled={deleting}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  backgroundColor: '#dc2626',
                  alignItems: 'center',
                  ...(Platform.OS === 'web' && { cursor: deleting ? 'not-allowed' : 'pointer' }),
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#ffffff' }}>Delete all in series</Text>
              </TouchableOpacity>
              <TouchableOpacity
                {...(Platform.OS === 'web' && { type: 'button' })}
                onPress={() => !deleting && setShowRecurringDeleteModal(false)}
                disabled={deleting}
                style={{ paddingVertical: 8, alignItems: 'center', ...(Platform.OS === 'web' && { cursor: 'pointer' }) }}
              >
                <Text style={{ fontSize: 15, fontWeight: '500', color: '#2563eb' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      ) : null}
      <View style={{ flex: 1, backgroundColor: '#ffffff', minHeight: 400 }}>
        {editing ? renderEditForm() : renderViewMode()}
      </View>
          
          {/* Standards Search Modal */}
          {showStandardsModal ? (
            <StandardsSearchModal
              visible
              onClose={() => setShowStandardsModal(false)}
              onSelect={handleAttachStandards}
              subjectId={subjectId}
              initialSelected={attachedStandards}
            />
          ) : null}

          {/* Add Subject Modal */}
          {showAddSubjectModal ? (
            <AddSubjectModal
              visible
              onClose={() => setShowAddSubjectModal(false)}
              onSubjectAdded={(newSubject) => {
                fetchSubjects();
                if (newSubject?.id) {
                  setSubjectId(newSubject.id);
                }
              }}
              familyId={familyId}
              defaultChildId={assigneeIds.length > 0 ? assigneeIds[0] : null}
            />
          ) : null}

          {showAskParentHelpModal ? (
            <AskParentHelpModal
              visible
              onClose={() => {
                setShowAskParentHelpModal(false);
                setAskHelpModalAssignment(null);
              }}
              onSent={() => {
                toast.push('Sent to your parent', 'success');
                loadEventLinkedHelpAssignment();
                setAskHelpModalAssignment(null);
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('childAssignmentsNeedRefresh'));
                }
              }}
              familyId={familyId}
              childId={event?.child_id || (assigneeIds.length > 0 ? assigneeIds[0] : null) || session?.child_id}
              assignment={askHelpModalAssignment}
              eventContext={
                askHelpModalAssignment
                  ? null
                  : event?.id
                    ? {
                        id: event.id,
                        title: event.title || draftTitle,
                        start_ts: event.start_ts,
                        end_ts: event.end_ts,
                      }
                    : null
              }
            />
          ) : null}

          {showSendToStudentModal ? (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={() => {
              if (!sendToStudentSubmitting) {
                setShowSendToStudentModal(false);
                setSendToStudentNote('');
              }
            }}
          >
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                justifyContent: 'center',
                alignItems: 'center',
                padding: 16,
              }}
              activeOpacity={1}
              onPress={() => {
                if (!sendToStudentSubmitting) {
                  setShowSendToStudentModal(false);
                  setSendToStudentNote('');
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => {}}
                style={{
                  backgroundColor: LD.shell,
                  borderRadius: 24,
                  width: '100%',
                  maxWidth: 520,
                  borderWidth: 1,
                  borderColor: LD.shellBorder,
                  overflow: 'hidden',
                  position: 'relative',
                  ...shellShadow,
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    if (!sendToStudentSubmitting) {
                      setShowSendToStudentModal(false);
                      setSendToStudentNote('');
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
                    backgroundColor: 'rgba(255,255,255,0.85)',
                    borderWidth: 1,
                    borderColor: LD.border,
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <X size={20} color={LD.ink} />
                </TouchableOpacity>

                <View style={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 28 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      color: LD.muted,
                      lineHeight: 21,
                      marginBottom: 18,
                      ...fontDisplay('400'),
                    }}
                  >
                    This will notify {sendToStudentTargetLabel} that the assignment needs their attention.
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: LD.inkSoft,
                      marginBottom: 8,
                      letterSpacing: 0.15,
                      ...fontDisplay('600'),
                    }}
                  >
                    Note (optional)
                  </Text>
                  <TextInput
                    value={sendToStudentNote}
                    onChangeText={setSendToStudentNote}
                    placeholder="Add a short message…"
                    placeholderTextColor={LD.placeholder}
                    multiline
                    editable={!sendToStudentSubmitting}
                    textAlignVertical="top"
                    style={{
                      borderWidth: 1,
                      borderColor: LD.border,
                      borderRadius: 16,
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      fontSize: 15,
                      color: LD.ink,
                      minHeight: 120,
                      maxHeight: 260,
                      backgroundColor: LD.fillSoft,
                      ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
                    }}
                  />

                  <View style={{ marginTop: 24 }}>
                    <TouchableOpacity
                      onPress={() => sendWorkToStudents(sendToStudentNote.trim())}
                      disabled={sendToStudentSubmitting}
                      style={{
                        backgroundColor: LD.black,
                        paddingVertical: 15,
                        borderRadius: 14,
                        alignItems: 'center',
                        opacity: sendToStudentSubmitting ? 0.5 : 1,
                        ...(Platform.OS === 'web'
                          ? { boxShadow: '0 2px 8px rgba(17, 24, 39, 0.12)', cursor: sendToStudentSubmitting ? 'not-allowed' : 'pointer' }
                          : {}),
                      }}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '600', color: '#ffffff', ...fontDisplay('600') }}>
                        {sendToStudentSubmitting ? 'Sending…' : 'Send to student'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        if (!sendToStudentSubmitting) {
                          setShowSendToStudentModal(false);
                          setSendToStudentNote('');
                        }
                      }}
                      disabled={sendToStudentSubmitting}
                      style={{ paddingVertical: 12, alignItems: 'center', marginTop: 4 }}
                      {...(Platform.OS === 'web' && { cursor: sendToStudentSubmitting ? 'default' : 'pointer' })}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '400', color: LD.mutedLight }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
          ) : null}

          {showStudentHelpHistoryModal ? (
            <StudentHelpHistoryModal
              visible
              onClose={() => setShowStudentHelpHistoryModal(false)}
              assignment={eventLinkedHelpAssignment}
              contextTitle={event?.title || draftTitle}
            />
          ) : null}

          {parentHelpModalAssignment && showParentHelpModal ? (
            <RespondToHelpRequestModal
              visible
              assignment={parentHelpModalAssignment}
              onClose={() => {
                setShowParentHelpModal(false);
                setParentHelpModalAssignment(null);
              }}
              onResponded={() => {
                loadEventLinkedParentAssignments();
                onEventUpdated?.();
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('parentAssignmentsNeedRefresh'));
                }
              }}
            />
          ) : null}

          {parentSubmissionModalAssignment && showParentSubmissionModal ? (
            <AssignmentReviewModal
              visible
              assignment={parentSubmissionModalAssignment}
              onClose={() => {
                setShowParentSubmissionModal(false);
                setParentSubmissionModalAssignment(null);
              }}
              onReviewed={() => {
                loadEventLinkedParentAssignments();
                onEventUpdated?.();
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('parentAssignmentsNeedRefresh'));
                }
              }}
              submissionReview
            />
          ) : null}

          {/* Add Material Modal */}
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

                  {/* Year Navigation */}
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
                        const today = new Date();
                        setCalendarViewMonth(today);
                        setDueDate(today);
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
                      startDate.setDate(startDate.getDate() - startDate.getDay());
                      
                      const days = [];
                      const currentDate = new Date(startDate);
                      
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
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
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
                      ...(Platform.OS === 'web' && {
                        fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }),
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
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginBottom: 12,
                  }}>
                    <TouchableOpacity
                      onPress={() => {
                        const newMonth = new Date(eventEndDateCalendarViewMonth);
                        newMonth.setFullYear(newMonth.getFullYear() - 1);
                        setEventEndDateCalendarViewMonth(newMonth);
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
                        const defaultEnd = new Date(dueDate);
                        defaultEnd.setDate(defaultEnd.getDate() + 1);
                        setEventEndDateCalendarViewMonth(defaultEnd);
                        setEventEndDate(defaultEnd);
                        setShowEventEndDatePicker(false);
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
                      }}>+1 day</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const newMonth = new Date(eventEndDateCalendarViewMonth);
                        newMonth.setFullYear(newMonth.getFullYear() + 1);
                        setEventEndDateCalendarViewMonth(newMonth);
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
                      const year = eventEndDateCalendarViewMonth.getFullYear();
                      const month = eventEndDateCalendarViewMonth.getMonth();
                      const firstDay = new Date(year, month, 1);
                      const lastDay = new Date(year, month + 1, 0);
                      const startDate = new Date(firstDay);
                      startDate.setDate(startDate.getDate() - startDate.getDay());
                      
                      const days = [];
                      const currentDate = new Date(startDate);
                      
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
                                const isBeforeStart = dueDate && day < dueDate;
                                
                                return (
                                  <TouchableOpacity
                                    key={idx}
                                    onPress={() => {
                                      if (!isBeforeStart) {
                                        console.log('[EventDetails] User selected end date:', {
                                          selectedDay: day.toISOString(),
                                          dayDate: day.toDateString(),
                                          startDate: dueDate?.toDateString()
                                        });
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
                                      backgroundColor: isSelected ? ACCENT : 'transparent',
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

          {/* Recurrence End Date Calendar Picker Modal */}
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

                  {/* Year Navigation */}
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
                      startDate.setDate(startDate.getDate() - startDate.getDay());
                      
                      const days = [];
                      const currentDate = new Date(startDate);
                      
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
                                      if (validationErrors.recurrenceEnd) {
                                        setValidationErrors((prev) => ({ ...prev, recurrenceEnd: null }));
                                      }
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

      {/* PDF Viewer Modal */}
      {showPdfViewer && pdfUrl && (
        <Modal
          visible={showPdfViewer}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowPdfViewer(false)}
        >
          <View style={styles.pdfModalOverlay}>
            <TouchableOpacity
              style={styles.pdfModalOverlayTouchable}
              activeOpacity={1}
              onPress={() => setShowPdfViewer(false)}
            />
            <View
              style={styles.pdfModalContainer}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.pdfModalHeader}>
                <Text style={styles.pdfModalTitle} numberOfLines={1}>
                  {pdfTitle}
                </Text>
                <View style={styles.pdfModalActions}>
                  {Platform.OS === 'web' && (
                    <TouchableOpacity
                      style={styles.pdfModalButton}
                      onPress={() => {
                        window.open(pdfUrl, '_blank');
                      }}
                    >
                      <ExternalLink size={18} color={colors.accent} />
                      <Text style={styles.pdfModalButtonText}>Open in new tab</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.pdfModalCloseButton}
                    onPress={() => setShowPdfViewer(false)}
                  >
                    <X size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.pdfViewerContainer}>
                {Platform.OS === 'web' ? (
                  <PDFIframe src={pdfUrl} title={pdfTitle} />
                ) : (
                  <View style={styles.pdfFallback}>
                    <Text style={styles.pdfFallbackText}>
                      PDF viewing is not available on this platform.
                    </Text>
                    <TouchableOpacity
                      style={styles.pdfModalButton}
                      onPress={() => {
                        Alert.alert('Open PDF', 'Would you like to open this PDF in your browser?');
                      }}
                    >
                      <ExternalLink size={18} color={colors.accent} />
                      <Text style={styles.pdfModalButtonText}>Open externally</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionContent: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
    minHeight: 40,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  editButton: {
    flex: 1,
    backgroundColor: colors.text || '#111827',
    borderWidth: 1,
    borderColor: colors.text || '#111827',
  },
  editButtonText: {
    color: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  deleteButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  deleteButtonText: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 12,
  },
  deleteButtonTextText: {
    color: colors.muted || 'rgba(15, 23, 42, 0.6)',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  cancelButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  timeInput: {
    width: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timePeriodContainer: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 0,
    zIndex: 10,
  },
  timePeriodButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    minWidth: 52,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  timePeriodButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...Platform.select({
      web: {
        boxShadow: `0 4px 8px ${colors.primary}33`,
      },
      default: {
        shadowColor: colors.primary,
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
      },
    }),
  },
  timePeriodButtonDisabled: {
    opacity: 0.5,
  },
  timePeriodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timePeriodButtonTextDisabled: {
    color: colors.muted,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timePeriodButtonTextActive: {
    color: colors.white,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  editForm: {
    gap: 16,
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 16,
  },
  inlineField: {
    flex: 1,
    minWidth: 180,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  attachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  attachButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  standardsList: {
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
    padding: 20,
    ...shadows.large,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modalInput: {
    padding: 12,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalButtonCancel: {
    backgroundColor: colors.bgSubtle,
  },
  modalButtonSave: {
    backgroundColor: colors.primary,
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modalButtonCancelText: {
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modalButtonSaveText: {
    color: colors.accentContrast,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tagChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  editTagChip: {
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  editTagChipText: {
    color: colors.text,
    fontSize: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestedChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  suggestedChipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#bae6fd',
  },
  suggestedChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestedChipTextActive: {
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assigneeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  assigneeChipActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  assigneeChipText: {
    color: colors.text,
    fontSize: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assigneeChipTextActive: {
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyHint: {
    fontSize: 12,
    color: colors.muted,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  statusChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  statusChipActive: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  statusChipText: {
    color: colors.text,
    fontSize: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  statusChipTextActive: {
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialSelectorContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  materialSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.card,
    minHeight: 40,
  },
  materialSelectorText: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialSelectorPlaceholder: {
    color: colors.muted,
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
    fontSize: 12,
    color: colors.muted,
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
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
  },
  addMaterialText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 200,
    zIndex: 1000,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 5,
      },
    }),
  },
  materialDropdownList: {
    maxHeight: 200,
  },
  materialDropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  materialDropdownItemActive: {
    backgroundColor: colors.accentLight,
  },
  materialDropdownItemText: {
    fontSize: 14,
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialDropdownItemTextActive: {
    color: colors.accent,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  // Styles matching TaskCreateModal.js
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F5',
    backgroundColor: '#FAF9FF',
  },
  headerEditEvent: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 14,
    justifyContent: 'center',
    backgroundColor: '#FAF9FF',
  },
  headerBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 8,
    backgroundColor: '#FFFFFFC9',
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: '#7C70F4',
  },
  headerTitleLarge: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    color: '#1E2A3A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  googleConnectChip: {
    alignSelf: 'flex-start',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
    borderRadius: 9999,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarConnectionOption: {
    minHeight: 30,
  },
  calendarConnectionOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#EEF0F5',
    marginHorizontal: 0,
    marginTop: 0,
  },
  footerDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginHorizontal: 20,
  },
  titleInput: {
    fontSize: 22,
    fontWeight: '700',
    color: FG,
    paddingVertical: 0,
    ...(Platform.OS !== 'web' && { textAlignVertical: 'center' }),
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  titleInputHero: {
    fontSize: 24,
    fontWeight: '700',
    color: FG,
    paddingVertical: 0,
    ...(Platform.OS !== 'web' && { textAlignVertical: 'center' }),
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  bodyScroll: {
    flex: 1,
    maxHeight: Platform.OS === 'web' ? 'min(70vh, calc(100vh - 220px))' : undefined,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 6,
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
  chipRow: {
    paddingHorizontal: 0,
    paddingTop: 6,
    paddingBottom: 6,
    gap: 8,
    alignItems: 'center',
    flexDirection: 'row',
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
  chipFieldError: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
  },
  assigneeChipColumn: {
    marginRight: 8,
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  assigneeErrorText: {
    color: '#ef4444',
    fontSize: 11,
    marginTop: 6,
    maxWidth: 260,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
  chipOption: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
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
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    overflow: 'visible',
  },
  /** Single full-width row (e.g. Lesson) — row + column stretch so inputs span the modal. */
  fieldRowFull: {
    width: '100%',
    alignSelf: 'stretch',
  },
  field: {
    flex: 1,
    alignItems: 'flex-start',
    overflow: 'visible',
  },
  fieldStretch: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'stretch',
  },
  inputFullWidth: {
    width: '100%',
    alignSelf: 'stretch',
  },
  selectFullWidth: {
    width: '100%',
    alignSelf: 'stretch',
  },
  selectContainerFull: {
    width: '100%',
    alignSelf: 'stretch',
  },
  fieldLabelEdit: {
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
  dropdownContainerError: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
    borderRadius: 20,
    padding: 4,
  },
  fieldHelpText: {
    color: MUTED,
    fontSize: 12,
    fontStyle: 'italic',
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
  timeSectionError: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
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
  timeInputEdit: {
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
  connectedPlanBanner: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginHorizontal: 0,
    marginTop: 2,
    marginBottom: 4,
  },
  connectedPlanBannerText: {
    fontSize: 13,
    color: SUB,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sendToStudentBanner: {
    alignSelf: 'flex-start',
    width: 'auto',
    maxWidth: '100%',
  },
  connectedPlanBannerLink: {
    color: '#85C4F2',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#EEF0F5',
  },
  footerEditEvent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  footerEditEventRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  deleteEventText: {
    color: '#EF4444',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor: 'pointer',
    }),
  },
  cancelText: {
    color: '#6C738E',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  createButton: {
    backgroundColor: '#7C70F4',
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 12px rgba(124,112,244,0.24)',
      cursor: 'pointer',
    }),
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
    fontWeight: '700',
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
  academicSection: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#f9fafb',
    overflow: 'visible',
  },
  /** Tight spacing above Academic Details after Schedule / Logistical sections */
  academicSectionTopSpacing: {
    marginTop: 8,
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
    backgroundColor: '#e0f2fe',
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
  },
  standardsSelectorPlaceholder: {
    color: MUTED,
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
  },
  standardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  standardChipText: {
    fontSize: 12,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  removeStandardButton: {
    padding: 2,
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
  },
  materialSelectorPlaceholder: {
    color: MUTED,
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
  },
  addMaterialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#B8D7F9',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  addMaterialText: {
    fontSize: 13,
    color: '#1e40af',
    fontWeight: '600',
  },
  pdfModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...Platform.select({
      web: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      },
    }),
  },
  pdfModalOverlayTouchable: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  pdfModalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: Platform.OS === 'web' ? '90%' : '100%',
    maxWidth: 1200,
    maxHeight: '85%',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
    ...Platform.select({
      web: {
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
      },
    }),
  },
  pdfModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#ffffff',
  },
  pdfModalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginRight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pdfModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pdfModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  pdfModalButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pdfModalCloseButton: {
    padding: 4,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  pdfViewerContainer: {
    height: Platform.OS === 'web' ? 'calc(85vh - 80px)' : '100%',
    minHeight: 400,
    backgroundColor: '#f9fafb',
    ...Platform.select({
      web: {
        maxHeight: 'calc(85vh - 80px)',
      },
    }),
  },
  pdfFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  pdfFallbackText: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 20,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
