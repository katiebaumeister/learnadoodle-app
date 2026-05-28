import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, ScrollView, Alert, TextInput, Switch, Platform, Modal, Animated, ActivityIndicator, Image, useWindowDimensions } from 'react-native';
import {
  LearnerPill,
  resolveLearnerChild,
  formatConflictMetaFromEvent,
  parseConflictMessageString,
  mapChildrenForConflict,
  sharedConflictBannerStyles as cb,
} from '../planner/conflictBannerShared';
import { Clock, BookOpen, Edit2, Plus, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X, Save, Check, Calculator, FlaskConical, ExternalLink, AlertCircle, MapPin, GraduationCap, FileText, Trash2, Send, Mail } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { formatDate, apiRequest, pushEventToGoogleCalendar, getFamilyMembers } from '../../lib/apiClient';
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
import { fetchSubjectCurriculumEventsStructure } from '../../lib/services/curriculumClient';
import AskParentHelpModal from '../child/AskParentHelpModal';
import SubmitForReviewModal from '../child/SubmitForReviewModal';
import StudentHelpHistoryModal from '../child/StudentHelpHistoryModal';
import RespondToHelpRequestModal from '../parent/RespondToHelpRequestModal';
import AssignmentReviewModal from '../assignments/AssignmentReviewModal';
import TutorEventHelpPanel from '../tutor/TutorEventHelpPanel';
import { isSchoolWorkEventType } from '../child/childHomeRailHelpers';
import { assignmentRowLinksEventId } from '../../lib/assignmentLinkedEventUtils';
import { ModalSectionCard } from '../ui/ModalSectionCard';
import ConfirmDialog from '../ConfirmDialog';
import { LD, shellShadow, fontDisplay } from '../parent/parentModalTheme';
import { findFirstConflictEvent } from '../../lib/utils/conflictDetection';
import {
  isPartOfRecurringSeries,
  isPlanYearBlockSeries,
  isDeletableSeriesGroup,
  cleanPlannerEventId,
  resolveSeriesMasterEventId,
  resolveSeriesLinkIds,
  softDeleteEventSeries,
} from '../../lib/utils/recurringEventUtils';

// Session-level guard: if this environment does not expose `lesson_standards`,
// don't keep retrying the same failing request on every EventDetails mount.
let lessonStandardsUnavailableSession = false;

const AVATAR_SOURCES = {
  prof1: require('../../assets/prof1.png'),
  prof2: require('../../assets/prof2.png'),
  prof3: require('../../assets/prof3.png'),
  prof4: require('../../assets/prof4.png'),
  prof5: require('../../assets/prof5.png'),
  prof6: require('../../assets/prof6.png'),
  prof7: require('../../assets/prof7.png'),
  prof8: require('../../assets/prof8.png'),
  prof9: require('../../assets/prof9.png'),
  prof10: require('../../assets/prof10.png'),
};

function resolveStudentAvatarSource(rawAvatar) {
  if (!rawAvatar || typeof rawAvatar !== 'string') return AVATAR_SOURCES.prof1;
  const trimmed = rawAvatar.trim();
  if (!trimmed) return AVATAR_SOURCES.prof1;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return { uri: trimmed };
  }
  const normalized = trimmed
    .toLowerCase()
    .replace(/^.*[\\/]/, '')
    .replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
  return AVATAR_SOURCES[normalized] || AVATAR_SOURCES.prof1;
}

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
  const subjectIds = Array.isArray(cm?.subject_ids)
    ? cm.subject_ids.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  return !!(
    ev.subject_id ||
    subjectIds.length > 0 ||
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

function sameAssignmentTrackingList(a = [], b = []) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  if (left.length !== right.length) return false;
  const normalizeHelpLog = (value) => {
    if (Array.isArray(value)) return JSON.stringify(value);
    if (typeof value === 'string') return value;
    return '';
  };
  for (let i = 0; i < left.length; i += 1) {
    const l = left[i] || {};
    const r = right[i] || {};
    if (String(l.id || '') !== String(r.id || '')) return false;
    if (String(l.updated_at || '') !== String(r.updated_at || '')) return false;
    if (String(l.submitted_at || '') !== String(r.submitted_at || '')) return false;
    if (String(l.status || '') !== String(r.status || '')) return false;
    if (String(l.review_status || '') !== String(r.review_status || '')) return false;
    if (Boolean(l.need_help) !== Boolean(r.need_help)) return false;
    if (normalizeHelpLog(l.help_message_log) !== normalizeHelpLog(r.help_message_log)) return false;
  }
  return true;
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

function extractSubjectIdsFromEvent(ev) {
  if (!ev) return [];
  const cm = parseCurriculumMetadata(ev);
  const fromMeta = Array.isArray(cm?.subject_ids)
    ? cm.subject_ids.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const fallbackSingle = ev?.subject_id ? [String(ev.subject_id)] : [];
  return Array.from(new Set(fromMeta.length > 0 ? fromMeta : fallbackSingle));
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
  const isTimeOnlyString = (raw) => {
    if (typeof raw !== 'string') return false;
    const trimmed = raw.trim();
    if (!trimmed) return false;
    // Time-only forms should never be treated as full timestamps.
    return (
      /^\d{1,2}:\d{2}(?::\d{2})?$/.test(trimmed)
      || /^\d{1,2}:\d{2}(?::\d{2})?\s*(AM|PM)$/i.test(trimmed)
    );
  };
  for (const key of keys) {
    const value = event[key];
    if (value) {
      if (isTimeOnlyString(value)) continue;
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
  if (/^\d{1,2}:\d{2}(?::\d{2})?\s*(AM|PM)$/i.test(trimmed)) {
    return trimmed.replace(/^(\d{1,2}:\d{2})(?::\d{2})(\s*(AM|PM))$/i, '$1$2');
  }
  // 24h HH:MM(:SS) or H:MM(:SS)
  const m24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
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

// Format time input as a guided mask while preserving typed intent.
const formatTimeInput = (value, previousValue = '') => {
  if (!value || !String(value).trim()) return '';
  const raw = String(value);
  const upper = raw.toUpperCase();
  const condensedUpper = upper.replace(/\s+/g, '');
  const hasExplicitAM = /\bAM\b/.test(upper) || condensedUpper.endsWith('AM');
  const hasExplicitPM = /\bPM\b/.test(upper) || condensedUpper.endsWith('PM');
  const hasPartialAM = !hasExplicitAM && !hasExplicitPM && condensedUpper.includes('A');
  const hasPartialPM = !hasExplicitAM && !hasExplicitPM && condensedUpper.includes('P');
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

const normalizeTimeValue = (rawValue) => {
  const value = String(rawValue || '').replace(/_/g, '').trim();
  if (!value || value === ':') return '';
  return value;
};

const shouldSkipConflictEvent = (ev) => {
  if (!ev) return true;
  if (ev.status === 'canceled' || ev.canceled_at || ev.deleted_at) return true;
  if (ev.is_backlog) return true;
  if (ev.is_flexible === true) return true;
  // Recurring master/template rows are not concrete scheduled instances.
  if (ev.recurrence_rule && String(ev.id || '') === String(ev.parent_event_id || '')) return true;
  const start = new Date(ev.start_ts || ev.start);
  const end = new Date(ev.end_ts || ev.end);
  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
    // Legacy timeless rows may still be persisted as full-day windows.
    if (durationMinutes >= 23 * 60) return true;
  }
  return false;
};

// Validate and convert time string to 24-hour format for storage
const parseTimeTo24Hour = (timeStr) => {
  if (!timeStr) return null;
  const normalized = String(timeStr).replace(/_/g, '').trim();
  
  // Handle formats: "8 AM", "8:00 AM", "08:00 AM", "8", "8:00"
  // Match: (hours)(optional colon and minutes)(optional AM/PM)
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
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

const formatTime = (timestamp) => {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const SUGGESTED_TAGS = ['math', 'reading', 'science', 'writing', 'review', 'test', 'project', 'practice'];

const EVENT_TYPES = [
  'Lesson',
  'Project',
  'Exam',
  'Assignment',
  'Activity',
  'Appointment',
  'Day Off',
  'Break',
];
const MULTI_DAY_EVENT_TYPES = ['Project', 'Trip', 'Holiday', 'Other', 'Break'];
const EVENT_TYPE_FILTER_COLORS = {
  lesson: '#E3F0FF',
  assignment: '#DFF7E3',
  activity: '#EDE6FF',
  appointment: '#F2F4F7',
  project: '#D6F0ED',
  exam: '#FCE7F3',
  'day off': '#FFEDE2',
  break: '#FFF7D6',
};
const EVENT_TYPE_FILTER_OUTLINE_COLORS = {
  lesson: '#BFDFFF',
  assignment: '#BEE8C8',
  activity: '#D9C9FF',
  appointment: '#D3D9E3',
  project: '#AEE2DB',
  exam: '#F6C8DE',
  'day off': '#F7D1BD',
  break: '#F2E39A',
};
const getEventTypeActiveChipStyle = (type) => {
  const key = String(type || '').trim().toLowerCase();
  const fill = EVENT_TYPE_FILTER_COLORS[key] || 'rgba(133,196,242,0.2)';
  const outline = EVENT_TYPE_FILTER_OUTLINE_COLORS[key] || '#6BB3E8';
  return {
    backgroundColor: fill,
    borderColor: outline,
    borderWidth: 1.5,
  };
};

const normalizeEventTypeForDisplay = (type, holidayType = null) => {
  const holidayRaw = String(holidayType || '').trim().toUpperCase();
  if (holidayRaw === 'CUSTOM_BREAK') return 'Break';
  if (holidayRaw === 'CUSTOM_HOLIDAY' || holidayRaw === 'GLOBAL_HOLIDAY') return 'Day Off';
  const raw = String(type || '').trim();
  if (!raw) return 'Lesson';
  const lower = raw.toLowerCase();
  if (raw === 'Schedule Block' || raw === 'Scheduled Class Day' || raw === 'ClassDay') {
    return 'Lesson';
  }
  if (lower === 'custom_break') return 'Break';
  if (lower === 'custom_holiday' || lower === 'global_holiday') return 'Day Off';
  if (lower === 'break') return 'Break';
  if (lower === 'holiday' || lower === 'day off' || lower === 'dayoff') return 'Day Off';
  const canonical = EVENT_TYPES.find((option) => option.toLowerCase() === lower);
  if (canonical) return canonical;
  return raw;
};

const normalizeEventTypeForPersistence = (type) => {
  if (type === 'Scheduled Class Day') return 'Schedule Block';
  if (type === 'Class Day') return 'ClassDay';
  if (type === 'Day Off' || type === 'Break') return 'Holiday';
  const lower = String(type || '').trim().toLowerCase();
  if (lower === 'day off' || lower === 'dayoff' || lower === 'break') return 'Holiday';
  return type || 'Lesson';
};

const VALID_DB_EVENT_TYPES = new Set([
  'Appointment',
  'Travel',
  'Live Class',
  'Home Lesson',
  'Core Class',
  'Activity',
  'Sport',
  'Assessment',
  'Meeting',
  'Family Event',
  'Lesson',
  'Project',
  'Exam',
  'Assignment',
  'Holiday',
  'Trip',
  'Other',
  'Schedule Block',
  'ClassDay',
]);

// Tag categories and suggested tags
const TAG_CATEGORIES = {
  domain: ['academic', 'physical', 'creative', 'social', 'emotional'],
};

const MODE_OPTIONS = ['home', 'online', 'outside', 'travel'];
const CALENDAR_CONNECTION_OPTIONS = [
  { value: 'google', label: 'Google' },
  { value: 'apple', label: 'Apple' },
];

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
const RECURRENCE_WEEKDAY_OPTIONS = [
  { value: 'SU', label: 'Sun' },
  { value: 'MO', label: 'Mon' },
  { value: 'TU', label: 'Tue' },
  { value: 'WE', label: 'Wed' },
  { value: 'TH', label: 'Thu' },
  { value: 'FR', label: 'Fri' },
  { value: 'SA', label: 'Sat' },
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
const WEEKDAY_FROM_DATE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const CLASS_DAY_DEFAULT_WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR'];
const RECURRENCE_SERIES_UI_CACHE = new Map();

// Helper functions
function addDays(d, n) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

function fmt(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizeByWeekday(value) {
  const raw = Array.isArray(value) ? value : value != null ? [value] : [];
  return Array.from(
    new Set(
      raw
        .flatMap((entry) => {
          if (typeof entry === 'string' && entry.includes(',')) {
            return entry.split(',').map((part) => part.trim()).filter(Boolean);
          }
          return [entry];
        })
        .map((entry) => {
          if (typeof entry === 'string') return entry.slice(0, 2).toUpperCase();
          if (typeof entry === 'number' && Number.isInteger(entry)) return WEEKDAY_FROM_DATE[(entry % 7 + 7) % 7] || null;
          if (entry && typeof entry === 'object') {
            const candidate = entry.weekday || entry.value || entry.code || null;
            return typeof candidate === 'string' ? candidate.slice(0, 2).toUpperCase() : null;
          }
          return null;
        })
        .filter((code) => RECURRENCE_WEEKDAY_OPTIONS.some((option) => option.value === code))
    )
  );
}

function resolveWeekdayCodeFromEventOrDueDate(event, dueDate) {
  const directDate = dueDate instanceof Date && !Number.isNaN(dueDate.getTime()) ? dueDate : null;
  if (directDate) return WEEKDAY_FROM_DATE[directDate.getDay()] || 'MO';

  const candidates = [
    event?.start_ts,
    event?.due_ts,
    event?.end_ts,
    event?.due_date,
    event?.start_date,
  ];
  for (const rawValue of candidates) {
    if (!rawValue) continue;
    const raw = String(rawValue).trim();
    if (!raw) continue;
    let parsed = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      parsed = new Date(`${raw}T12:00:00`);
    } else {
      parsed = new Date(raw);
    }
    if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
      return WEEKDAY_FROM_DATE[parsed.getDay()] || 'MO';
    }
  }
  return 'MO';
}

function recurrenceSeriesCacheKeyCandidates(event) {
  const keys = [
    event?.recurrence_id,
    event?.parent_event_id,
    event?.source_block_id,
    event?.id,
  ]
    .map((value) => cleanPlannerEventId(String(value || '')))
    .filter(Boolean);
  return Array.from(new Set(keys));
}

function readRecurrenceSeriesUiCache(event) {
  const keys = recurrenceSeriesCacheKeyCandidates(event);
  for (const key of keys) {
    const cached = RECURRENCE_SERIES_UI_CACHE.get(key);
    if (cached) return cached;
  }
  return null;
}

function writeRecurrenceSeriesUiCache(event, payload) {
  if (!payload || typeof payload !== 'object') return;
  const keys = recurrenceSeriesCacheKeyCandidates(event);
  if (keys.length === 0) return;
  keys.forEach((key) => {
    RECURRENCE_SERIES_UI_CACHE.set(key, payload);
  });
}

function hhmmUtcFromTs(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function durationMinutesFromTs(startValue, endValue) {
  const s = new Date(startValue || '');
  const e = new Date(endValue || '');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 60000));
}

function normalizedChildIdsKey(value) {
  const arr = Array.isArray(value)
    ? value.map((v) => String(v || '').trim()).filter(Boolean).sort()
    : [];
  return arr.join('|');
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

export default function EventDetails({ event, onEventUpdated, onEventDeleted, familyMembers = [], onEventPatched, familyId, onEditingChange, onClose, initialSchedulingMode = false, editScope = 'single', readOnly = false, readOnlyReason = null, preloadedAcademicYears = null, preloadedSubjects = null, preloadedFamilyAssignments = null, viewerRole = null, parentEventFocus = null, onParentEventFocusConsumed, childEventFocus = null, onChildEventFocusConsumed, openConflictResolution = false, conflictResolutionContext = null, onOpenConflictResolutionConsumed, sendOnlyMode = false }) {
  const { width: viewportWidth } = useWindowDimensions();
  const session = useSession();
  const { user: authUser } = useAuth();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const [showRecurringDeleteModal, setShowRecurringDeleteModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isSeriesGroupEvent = isDeletableSeriesGroup(event);
  const isSeriesEditScope = editScope === 'series' && isSeriesGroupEvent;
  const hasPersistedEventId = Boolean(event?.id);
  const isSingleSeriesOccurrenceEdit = isSeriesGroupEvent && !isSeriesEditScope;
  const [editing, setEditing] = useState(initialSchedulingMode);
  const [saving, setSaving] = useState(false);
  const [schedulingBacklog, setSchedulingBacklog] = useState(initialSchedulingMode); // State for "Add to schedule" mode

  const [draftTitle, setDraftTitle] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [dueDate, setDueDate] = useState(new Date());
  const [eventEndDate, setEventEndDate] = useState(null); // End date for multi-day events
  const [draftStartTime, setDraftStartTime] = useState('');
  const [draftEndTime, setDraftEndTime] = useState('');
  const [startTime, setStartTime] = useState('');
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
  const lessonButtonRef = useRef(null);
  const lessonDropdownRef = useRef(null);
  const [showLessonDropdown, setShowLessonDropdown] = useState(false);
  const [lessonDropdownPosition, setLessonDropdownPosition] = useState({ top: 0, left: 0, width: 200, maxHeight: 220 });
  const startTimeButtonRef = useRef(null);
  const startTimeDropdownRef = useRef(null);
  const endTimeButtonRef = useRef(null);
  const endTimeDropdownRef = useRef(null);
  const [showStartTimeDropdown, setShowStartTimeDropdown] = useState(false);
  const [showEndTimeDropdown, setShowEndTimeDropdown] = useState(false);
  const [startTimeDropdownPosition, setStartTimeDropdownPosition] = useState({ top: 0, left: 0, width: 200 });
  const [endTimeDropdownPosition, setEndTimeDropdownPosition] = useState({ top: 0, left: 0, width: 200 });
  const [lessonOptions, setLessonOptions] = useState([]);
  const [loadingLessonOptions, setLoadingLessonOptions] = useState(false);
  
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
  const [subjectIds, setSubjectIds] = useState(() => extractSubjectIdsFromEvent(event));
  const [subjectId, setSubjectId] = useState(() => extractSubjectIdsFromEvent(event)[0] ?? null);
  const [countsTowardPlan, setCountsTowardPlan] = useState(() => event?.counts_toward_plan !== false);
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
  const [recurrenceEndType, setRecurrenceEndType] = useState('never');
  const [recurrenceEndAfter, setRecurrenceEndAfter] = useState(null);
  const [recurrenceEndAfterText, setRecurrenceEndAfterText] = useState('');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(null);
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState([]);
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
  const [showSubmitForReviewModal, setShowSubmitForReviewModal] = useState(false);
  /** Assignment row linked to this event (if any), for child "Asked" / ask-another flow */
  const [eventLinkedHelpAssignment, setEventLinkedHelpAssignment] = useState(null);
  /** False until the first linked-assignment fetch finishes for this event+child (avoids Ask → Asked flash). Refresh keeps prior row until the new fetch completes. */
  const [linkedHelpReady, setLinkedHelpReady] = useState(false);
  const linkedHelpFetchSeq = useRef(0);
  /** When set, modal uses assignment path (follow-up); when null, uses eventContext (first ask) */
  const [askHelpModalAssignment, setAskHelpModalAssignment] = useState(null);
  const [submitModalAssignment, setSubmitModalAssignment] = useState(null);
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
  const [queueSendToStudentAfterSave, setQueueSendToStudentAfterSave] = useState(false);
  const [sendToStudentSubmitting, setSendToStudentSubmitting] = useState(false);
  const [sendToStudentInlineError, setSendToStudentInlineError] = useState('');
  const [invitedAssigneeIds, setInvitedAssigneeIds] = useState([]);
  const [childInviteSummaries, setChildInviteSummaries] = useState(() => {
    const seed = {};
    (familyMembers || []).forEach((m) => {
      const sid =
        m?.child_id != null ? String(m.child_id)
        : m?.id != null ? String(m.id)
        : '';
      if (!sid) return;
      const raw = String(m?.invite_status || '').trim().toLowerCase();
      const status = raw === 'connected' ? 'accepted' : raw;
      if (!status) return;
      seed[sid] = { invite_status: status };
    });
    return seed;
  });
  const [inviteEligibilityReady, setInviteEligibilityReady] = useState(false);
  const [showSendInviteClarification, setShowSendInviteClarification] = useState(false);

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
    if (!familyId) return;
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
        const next = fetchedBySubject.flat();
        const dedup = Array.from(
          new Map(next.map((item) => [item.key, item])).values()
        );
        setLessonOptions(dedup);
      } finally {
        if (!cancelled) setLoadingLessonOptions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId, subjectIds, subjects]);

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
    return () => document.removeEventListener('mousedown', handleLessonClickOutside);
  }, [showLessonDropdown]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !showStartTimeDropdown || !startTimeButtonRef.current) return undefined;
    const updatePosition = () => {
      const node = startTimeButtonRef.current?._nativeNode || startTimeButtonRef.current;
      if (!node || typeof node.getBoundingClientRect !== 'function') return;
      const rect = node.getBoundingClientRect();
      setStartTimeDropdownPosition((prev) => {
        const next = { top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 150) };
        if (prev?.top === next.top && prev?.left === next.left && prev?.width === next.width) return prev;
        return next;
      });
    };
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
    if (Platform.OS !== 'web' || !showEndTimeDropdown || !endTimeButtonRef.current) return undefined;
    const updatePosition = () => {
      const node = endTimeButtonRef.current?._nativeNode || endTimeButtonRef.current;
      if (!node || typeof node.getBoundingClientRect !== 'function') return;
      const rect = node.getBoundingClientRect();
      setEndTimeDropdownPosition((prev) => {
        const next = { top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 150) };
        if (prev?.top === next.top && prev?.left === next.left && prev?.width === next.width) return prev;
        return next;
      });
    };
    const timeoutId = setTimeout(updatePosition, 0);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showEndTimeDropdown]);

  useEffect(() => {
    if (Platform.OS !== 'web' || (!showStartTimeDropdown && !showEndTimeDropdown)) return undefined;
    const handleClickOutside = (event) => {
      const target = event?.target;
      if (!target) return;
      const startButtonNode = startTimeButtonRef.current?._nativeNode || startTimeButtonRef.current;
      const startDropdownNode = startTimeDropdownRef.current?._nativeNode || startTimeDropdownRef.current;
      const endButtonNode = endTimeButtonRef.current?._nativeNode || endTimeButtonRef.current;
      const endDropdownNode = endTimeDropdownRef.current?._nativeNode || endTimeDropdownRef.current;

      const inStart = (startButtonNode && startButtonNode.contains(target))
        || (startDropdownNode && startDropdownNode.contains(target));
      const inEnd = (endButtonNode && endButtonNode.contains(target))
        || (endDropdownNode && endDropdownNode.contains(target));

      if (!inStart) setShowStartTimeDropdown(false);
      if (!inEnd) setShowEndTimeDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showStartTimeDropdown, showEndTimeDropdown]);

  useEffect(() => {
    if (allDay) {
      setShowStartTimeDropdown(false);
      setShowEndTimeDropdown(false);
    }
  }, [allDay]);

  useEffect(() => {
    if (!editing) {
      setShowStartTimeDropdown(false);
      setShowEndTimeDropdown(false);
    }
  }, [editing]);

  const isParentView = useMemo(
    () => session?.role_flags?.isParent === true && session?.role_flags?.isChild !== true,
    [session?.role_flags?.isParent, session?.role_flags?.isChild]
  );
  const showPermissionViewOnlyPill =
    readOnly &&
    readOnlyReason === 'permissions' &&
    session?.role_flags?.isChild === true;

  const helpChildId = useMemo(
    () => event?.child_id || (assigneeIds.length > 0 ? assigneeIds[0] : null) || session?.child_id,
    [event?.child_id, assigneeIds, session?.child_id]
  );

  const acceptedInvitedAssigneeIdsFromMembers = useMemo(() => {
    if (!assigneeIds?.length || !familyMembers?.length) return [];
    const wanted = new Set(assigneeIds.map((id) => String(id)));
    const accepted = new Set();
    (familyMembers || []).forEach((m) => {
      const inviteStatusRaw = String(m?.invite_status || '').trim().toLowerCase();
      // "connected" is a valid accepted/linked state for existing child accounts.
      const inviteStatus = inviteStatusRaw === 'connected' ? 'accepted' : inviteStatusRaw;
      if (inviteStatus !== 'accepted') return;
      const role = String(m?.member_role || m?.role || '').toLowerCase();
      if (role && role !== 'child' && role !== 'student') return;
      if (m?.child_id != null && wanted.has(String(m.child_id))) {
        accepted.add(String(m.child_id));
      }
      let scope = m?.child_scope;
      if (typeof scope === 'string') {
        try { scope = JSON.parse(scope); } catch (_) { scope = []; }
      }
      if (Array.isArray(scope)) {
        scope.forEach((id) => {
          const sid = String(id);
          if (wanted.has(sid)) accepted.add(sid);
        });
      }
      if (m?.id != null && wanted.has(String(m.id)) && inviteStatus === 'accepted') {
        accepted.add(String(m.id));
      }
    });
    return [...accepted];
  }, [assigneeIds, familyMembers]);

  useEffect(() => {
    const seed = {};
    (familyMembers || []).forEach((m) => {
      const sid =
        m?.child_id != null ? String(m.child_id)
        : m?.id != null ? String(m.id)
        : '';
      if (!sid) return;
      const raw = String(m?.invite_status || '').trim().toLowerCase();
      const status = raw === 'connected' ? 'accepted' : raw;
      if (!status) return;
      seed[sid] = { invite_status: status };
    });
    if (Object.keys(seed).length === 0) return;
    setChildInviteSummaries((prev) => {
      if (prev && Object.keys(prev).length > 0) return prev;
      return seed;
    });
  }, [familyMembers]);

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
      setInvitedAssigneeIds([]);
      setChildInviteSummaries({});
      setInviteEligibilityReady(true);
      return;
    }
    if (acceptedInvitedAssigneeIdsFromMembers.length > 0) {
      setInvitedAssigneeIds((prev) => {
        const prevKey = [...new Set((prev || []).map(String))].sort().join('|');
        const nextKey = [...new Set(acceptedInvitedAssigneeIdsFromMembers.map(String))].sort().join('|');
        return prevKey === nextKey ? prev : acceptedInvitedAssigneeIdsFromMembers;
      });
      setInviteEligibilityReady(true);
      return;
    }
    setInviteEligibilityReady(false);
    let cancelled = false;
    (async () => {
      try {
        let rows = [];
        let inviteSummaries = {};
        if (Platform.OS === 'web') {
          const { data, error } = await getFamilyMembers();
          if (!cancelled && !error) {
            inviteSummaries =
              data?.child_invite_summaries && typeof data.child_invite_summaries === 'object'
                ? data.child_invite_summaries
                : {};
            rows = Array.isArray(data?.members)
              ? data.members.filter((m) => {
                  const role = String(m?.member_role || m?.role || '').toLowerCase();
                  return role === 'child' || role === 'student';
                })
              : [];
          }
        } else {
          const { data, error } = await supabase
            .from('family_members')
            .select('child_id, child_scope, member_role, invite_status')
            .eq('family_id', familyId)
            .in('invite_status', ['accepted', 'connected']);
          if (!cancelled && !error) rows = Array.isArray(data) ? data : [];
        }
        if (cancelled) return;
        const wanted = new Set(assigneeIds.map(String));
        const invited = new Set();
        Object.entries(inviteSummaries || {}).forEach(([childId, summary]) => {
          const sid = String(childId || '').trim();
          if (!sid || !wanted.has(sid)) return;
          const raw = String(summary?.invite_status || '').trim().toLowerCase();
          const status = raw === 'connected' ? 'accepted' : raw;
          if (status === 'accepted') invited.add(sid);
        });
        (rows || []).forEach((m) => {
          if (m?.child_id != null && wanted.has(String(m.child_id))) invited.add(String(m.child_id));
          if (m?.id != null && wanted.has(String(m.id))) invited.add(String(m.id));
          let scope = m?.child_scope;
          if (typeof scope === 'string') {
            try { scope = JSON.parse(scope); } catch (_) { scope = []; }
          }
          if (Array.isArray(scope)) {
            scope.forEach((id) => {
              const sid = String(id);
              if (wanted.has(sid)) invited.add(sid);
            });
          }
        });
        if (!cancelled) {
          setInvitedAssigneeIds((prev) => {
            const prevKey = [...new Set((prev || []).map(String))].sort().join('|');
            const nextIds = [...invited];
            const nextKey = [...new Set(nextIds.map(String))].sort().join('|');
            return prevKey === nextKey ? prev : nextIds;
          });
          setChildInviteSummaries((prev) => {
            const prevKey = JSON.stringify(prev || {});
            const nextKey = JSON.stringify(inviteSummaries || {});
            return prevKey === nextKey ? prev : (inviteSummaries || {});
          });
          setInviteEligibilityReady(true);
        }
      } catch (_) {
        if (!cancelled) {
          setInvitedAssigneeIds([]);
          setChildInviteSummaries({});
          setInviteEligibilityReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isParentView, familyId, assigneeIds, acceptedInvitedAssigneeIdsFromMembers]);

  const effectiveInvitedAssigneeIds = useMemo(() => {
    const fromState = [...new Set((invitedAssigneeIds || []).map(String))];
    if (fromState.length > 0 || inviteEligibilityReady) return fromState;
    return [...new Set((acceptedInvitedAssigneeIdsFromMembers || []).map(String))];
  }, [invitedAssigneeIds, inviteEligibilityReady, acceptedInvitedAssigneeIdsFromMembers]);

  const sendEligibleAssigneeIds = useMemo(() => {
    const invitedSet = new Set((effectiveInvitedAssigneeIds || []).map(String));
    return (assigneeIds || []).map(String).filter((id) => invitedSet.has(id));
  }, [assigneeIds, effectiveInvitedAssigneeIds]);

  const sendBlockedAssigneeIds = useMemo(() => {
    const invitedSet = new Set((effectiveInvitedAssigneeIds || []).map(String));
    return (assigneeIds || []).map(String).filter((id) => !invitedSet.has(id));
  }, [assigneeIds, effectiveInvitedAssigneeIds]);

  const assigneeInviteStatusMap = useMemo(() => {
    const statusById = new Map();
    Object.entries(childInviteSummaries || {}).forEach(([childId, summary]) => {
      const sid = String(childId || '').trim();
      if (!sid) return;
      const rawBase = String(summary?.invite_status || '').trim().toLowerCase();
      const raw = rawBase === 'connected' ? 'accepted' : rawBase;
      const status = raw === 'accepted' || raw === 'pending' ? raw : 'none';
      statusById.set(sid, status);
    });
    (familyMembers || []).forEach((m) => {
      const statusRawBase = String(m?.invite_status || '').trim().toLowerCase();
      const statusRaw = statusRawBase === 'connected' ? 'accepted' : statusRawBase;
      const status = statusRaw === 'accepted' || statusRaw === 'pending' ? statusRaw : 'none';
      const applyStatus = (id) => {
        if (id == null) return;
        const key = String(id);
        const prev = statusById.get(key);
        // Keep strongest state if duplicates exist.
        if (prev === 'accepted') return;
        if (status === 'accepted' || !prev || (prev === 'none' && status === 'pending')) {
          statusById.set(key, status);
        }
      };
      applyStatus(m?.id);
      applyStatus(m?.child_id);
      let scope = m?.child_scope;
      if (typeof scope === 'string') {
        try { scope = JSON.parse(scope); } catch (_) { scope = []; }
      }
      if (Array.isArray(scope)) scope.forEach((id) => applyStatus(id));
    });
    return statusById;
  }, [familyMembers, childInviteSummaries]);

  const sendPendingAssigneeIds = useMemo(
    () => sendBlockedAssigneeIds.filter((id) => assigneeInviteStatusMap.get(String(id)) === 'pending'),
    [sendBlockedAssigneeIds, assigneeInviteStatusMap]
  );
  const sendNeedsInviteAssigneeIds = useMemo(
    () => sendBlockedAssigneeIds.filter((id) => assigneeInviteStatusMap.get(String(id)) !== 'pending'),
    [sendBlockedAssigneeIds, assigneeInviteStatusMap]
  );

  const hasInvitedAssignee = sendEligibleAssigneeIds.length > 0;

  const formatAssigneeNameList = useCallback((ids = []) => {
    const names = (Array.isArray(ids) ? ids : [])
      .map((id) => {
        const member = (familyMembers || []).find((m) => String(m?.id) === String(id));
        return String(member?.name || member?.first_name || '').trim();
      })
      .filter(Boolean);
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  }, [familyMembers]);

  const sendInviteClarificationText = useMemo(() => {
    const invitedCount = sendEligibleAssigneeIds.length;
    const blockedCount = sendBlockedAssigneeIds.length;
    if (invitedCount <= 0 && blockedCount > 0) {
      const pendingNames = formatAssigneeNameList(sendPendingAssigneeIds);
      const needsInviteNames = formatAssigneeNameList(sendNeedsInviteAssigneeIds);
      if (sendPendingAssigneeIds.length > 0 && sendNeedsInviteAssigneeIds.length === 0) {
        const pendingVerb = sendPendingAssigneeIds.length === 1 ? 'has' : 'have';
        return pendingNames
          ? `${pendingNames} ${pendingVerb} not accepted the invite yet. Sending will unlock after acceptance.`
          : 'Invite not yet accepted. Sending will unlock after acceptance.';
      }
      if (sendPendingAssigneeIds.length > 0 && sendNeedsInviteAssigneeIds.length > 0) {
        const pendingVerb = sendPendingAssigneeIds.length === 1 ? 'has' : 'have';
        const pendingPart = pendingNames
          ? `${pendingNames} ${pendingVerb} not accepted yet`
          : 'Some students have not accepted yet';
        const invitePart = needsInviteNames
          ? `invite ${needsInviteNames}`
          : 'invite the remaining students';
        return `${pendingPart}, and ${invitePart} before sending this assignment.`;
      }
      return needsInviteNames
        ? `Invite ${needsInviteNames} before sending this assignment`
        : 'Invite the assigned students before sending this assignment';
    }
    if (invitedCount > 0 && blockedCount > 0) {
      const invitedNames = formatAssigneeNameList(sendEligibleAssigneeIds);
      const pendingNames = formatAssigneeNameList(sendPendingAssigneeIds);
      const needsInviteNames = formatAssigneeNameList(sendNeedsInviteAssigneeIds);
      if (invitedNames && pendingNames && needsInviteNames) {
        return `This will send to ${invitedNames}. ${pendingNames} still need to accept, and invite ${needsInviteNames} before sending to them.`;
      }
      if (invitedNames && pendingNames) {
        const pendingVerb = sendPendingAssigneeIds.length === 1 ? 'needs' : 'need';
        return `This will send to ${invitedNames}. ${pendingNames} still ${pendingVerb} to accept ${sendPendingAssigneeIds.length === 1 ? 'the' : 'their'} invite.`;
      }
      if (invitedNames && needsInviteNames) {
        return `This will send to ${invitedNames}. Invite ${needsInviteNames} before sending to them.`;
      }
      const blockedNames = formatAssigneeNameList(sendBlockedAssigneeIds);
      if (invitedNames && blockedNames) {
        return `This will send to ${invitedNames}. Invite not yet accepted for ${blockedNames}.`;
      }
      return 'Some assigned students still need an invite before they can receive this assignment';
    }
    return '';
  }, [sendEligibleAssigneeIds, sendBlockedAssigneeIds, sendPendingAssigneeIds, sendNeedsInviteAssigneeIds, formatAssigneeNameList]);

  const openInviteChildModalForSend = useCallback(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const preferredChildId = sendBlockedAssigneeIds[0] || assigneeIds[0] || null;
    window.dispatchEvent(
      new CustomEvent('openInviteChildModal', {
        detail: { childId: preferredChildId || null },
      })
    );
  }, [sendBlockedAssigneeIds, assigneeIds]);

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
      setParentLinkedAssignments((prev) => (sameAssignmentTrackingList(prev, matches) ? prev : matches));
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
    setParentLinkedAssignments((prev) => (sameAssignmentTrackingList(prev, matches) ? prev : matches));
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

  const sendTrackingSummary = useMemo(() => {
    const linkedAssignments = Array.isArray(parentLinkedAssignments) ? parentLinkedAssignments : [];
    const sentAssignments = linkedAssignments.filter((assignment) => assignment?.assigned_by != null);

    const nameForAssignment = (assignment) => {
      const childId = assignment?.child_id;
      const joinedName = assignment?.child?.first_name || assignment?.child?.name || '';
      if (joinedName && String(joinedName).trim()) return String(joinedName).trim();
      const member = (familyMembers || []).find((m) => String(m?.id) === String(childId));
      return (member?.name || member?.first_name || 'student').trim();
    };

    const formatWhen = (value) => {
      if (!value) return 'Date unknown';
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return 'Date unknown';
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
      const diffDays = Math.round((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));
      const time = parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (diffDays === 0) return `today at ${time}`;
      if (diffDays === 1) return `yesterday at ${time}`;
      const date = parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return `${date} at ${time}`;
    };

    const parseHelpLog = (rawLog) => {
      if (Array.isArray(rawLog)) return rawLog;
      if (typeof rawLog === 'string') {
        try {
          const parsed = JSON.parse(rawLog);
          return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          return [];
        }
      }
      return [];
    };

    const assigneeSet = new Set((assigneeIds || []).map((id) => String(id)));
    const candidateStudents = (familyMembers || []).filter((member) => assigneeSet.has(String(member?.id)));
    const sharedCount = sentAssignments.length;
    const totalCount = candidateStudents.length;
    const ctaLabel = sharedCount > 0
      ? 'Send again to students'
      : (totalCount > 1 ? 'Send to students' : 'Send to student');
    const historyItems = [];
    sentAssignments.forEach((assignment) => {
      const studentName = nameForAssignment(assignment);
      const helpLog = parseHelpLog(assignment?.help_message_log);
      let hasParentSendLog = false;
      helpLog.forEach((entry) => {
        const senderRole = String(entry?.sender_role || '').trim().toLowerCase();
        const reason = String(entry?.reason || '').trim().toLowerCase();
        const body = String(entry?.body || entry?.message || entry?.note || '').trim();
        const tsRaw = entry?.created_at || entry?.timestamp || assignment?.updated_at || assignment?.created_at || null;
        const ts = new Date(tsRaw || 0).getTime();
        if (!Number.isFinite(ts) || ts <= 0) return;
        if (senderRole === 'parent' && reason === 'sent_assignment') {
          hasParentSendLog = true;
          const hasCustomMessage = body && body !== '[Sent assignment]';
          historyItems.push({
            ts,
            kind: 'parent_send',
            studentName,
            when: formatWhen(tsRaw),
            message: hasCustomMessage ? body : null,
            line: hasCustomMessage
              ? `Sent to ${studentName} at ${formatWhen(tsRaw)} — "${body}"`
              : `Sent to ${studentName} at ${formatWhen(tsRaw)}`,
          });
          return;
        }
        if (senderRole === 'child' && body) {
          historyItems.push({
            ts,
            kind: 'child_reply',
            studentName,
            when: formatWhen(tsRaw),
            message: body,
            line: `${studentName} replied at ${formatWhen(tsRaw)} — "${body}"`,
          });
        }
      });
      if (!hasParentSendLog) {
        const fallbackTsRaw = assignment?.updated_at || assignment?.created_at || null;
        const fallbackTs = new Date(fallbackTsRaw || 0).getTime();
        if (Number.isFinite(fallbackTs) && fallbackTs > 0) {
          historyItems.push({
            ts: fallbackTs,
            kind: 'parent_send',
            studentName,
            when: formatWhen(fallbackTsRaw),
            message: null,
            line: `Sent to ${studentName} at ${formatWhen(fallbackTsRaw)}`,
          });
        }
      }
      const status = String(assignment?.status || '').trim().toLowerCase();
      if (status === 'submitted' || status === 'reviewed' || status === 'accepted') {
        const submittedTsRaw = assignment?.submitted_at || assignment?.updated_at || null;
        const submittedTs = new Date(submittedTsRaw || 0).getTime();
        if (Number.isFinite(submittedTs) && submittedTs > 0) {
          historyItems.push({
            ts: submittedTs,
            kind: 'child_returned',
            studentName,
            when: formatWhen(submittedTsRaw),
            message: null,
            line: `${studentName} sent work back at ${formatWhen(submittedTsRaw)}`,
          });
        }
      }
    });
    const historyLines = historyItems
      .sort((a, b) => a.ts - b.ts)
      .filter((item, index, arr) => index === arr.findIndex((other) => (
        other.ts === item.ts && other.line === item.line
      )))
      .map((item) => item.line);
    const latestByTime = [...historyItems]
      .filter((item) => item && Number.isFinite(item.ts))
      .sort((a, b) => b.ts - a.ts);
    const latestFeedback = latestByTime.find((item) => item.kind === 'child_reply' || item.kind === 'child_returned') || null;
    const latestSent = latestByTime.find((item) => item.kind === 'parent_send') || null;
    const latestSendBatchNames = (() => {
      if (!latestSent) return [];
      const BATCH_WINDOW_MS = 90 * 1000;
      const sameBatch = latestByTime.filter((item) => (
        item.kind === 'parent_send'
        && Math.abs(Number(item.ts || 0) - Number(latestSent.ts || 0)) <= BATCH_WINDOW_MS
        && String(item.message || '') === String(latestSent.message || '')
      ));
      return [...new Set(
        sameBatch
          .map((item) => String(item.studentName || '').trim())
          .filter(Boolean)
      )].sort((a, b) => a.localeCompare(b));
    })();
    const latestStatusLine = latestFeedback
      ? (
          latestFeedback.kind === 'child_reply' && latestFeedback.message
            ? `${latestFeedback.studentName || 'Student'} sent back on ${latestFeedback.when} with message: "${latestFeedback.message}"`
            : `${latestFeedback.studentName || 'Student'} sent back on ${latestFeedback.when}`
        )
      : (latestSent
          ? `Last sent to ${(latestSendBatchNames.length > 0 ? latestSendBatchNames.join(', ') : (latestSent.studentName || 'student'))} on ${latestSent.when}`
          : null);

    return {
      hasShared: sentAssignments.length > 0,
      sharedCount,
      totalCount,
      ctaLabel,
      historyLines,
      latestStatusLine,
    };
  }, [parentLinkedAssignments, familyMembers, assigneeIds]);

  const sendEntryCtaLabel = useMemo(() => {
    if (hasInvitedAssignee || sendBlockedAssigneeIds.length === 0) {
      return sendTrackingSummary.ctaLabel || 'Send to student';
    }
    if (sendPendingAssigneeIds.length > 0 && sendNeedsInviteAssigneeIds.length === 0) {
      return sendPendingAssigneeIds.length > 1 ? 'Invites not yet accepted' : 'Invite not yet accepted';
    }
    if (sendPendingAssigneeIds.length > 0 && sendNeedsInviteAssigneeIds.length > 0) {
      return 'Invites pending/needed';
    }
    return 'Invite child to send';
  }, [
    hasInvitedAssignee,
    sendBlockedAssigneeIds.length,
    sendPendingAssigneeIds.length,
    sendNeedsInviteAssigneeIds.length,
    sendTrackingSummary.ctaLabel,
  ]);

  useEffect(() => {
    const canQueueSendAfterSave = Boolean(
      event?.id
      && familyId
      && assigneeIds.length > 0
      && hasInvitedAssignee
      && placement === 'calendar'
      && isParentView
      && isSchoolWorkEventType(eventType)
    );
    if (!canQueueSendAfterSave && queueSendToStudentAfterSave) {
      setQueueSendToStudentAfterSave(false);
    }
  }, [
    event?.id,
    familyId,
    assigneeIds.length,
    hasInvitedAssignee,
    placement,
    isParentView,
    eventType,
    queueSendToStudentAfterSave,
  ]);

  useEffect(() => {
    if (!showSendToStudentModal && !queueSendToStudentAfterSave) {
      setShowSendInviteClarification(false);
    }
  }, [showSendToStudentModal, queueSendToStudentAfterSave]);

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
    } else if (parentEventFocus === 'send') {
      setShowSendToStudentModal(true);
      onParentEventFocusConsumed?.();
    }
  }, [parentLinkedReady, parentEventFocus, parentLinkedAssignments, onParentEventFocusConsumed]);

  useEffect(() => {
    if (!childEventFocus) return;
    if (childEventFocus === 'help') {
      setAskHelpModalAssignment(eventLinkedHelpAssignment || null);
      setShowAskParentHelpModal(true);
      onChildEventFocusConsumed?.();
      return;
    }
    if (childEventFocus === 'submission') {
      setSubmitModalAssignment(eventLinkedHelpAssignment || null);
      setShowSubmitForReviewModal(true);
      onChildEventFocusConsumed?.();
    }
  }, [childEventFocus, eventLinkedHelpAssignment, onChildEventFocusConsumed]);

  // Validation
  const [validationErrors, setValidationErrors] = useState({});
  const [validationBanner, setValidationBanner] = useState('');
  
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
  const loggedInvalidAcademicYearIdsRef = useRef(new Set());

  const editConflictEnterOp = useRef(new Animated.Value(0)).current;
  const editConflictEnterY = useRef(new Animated.Value(5)).current;
  const chipConflictEnterOp = useRef(new Animated.Value(0)).current;
  const chipConflictEnterY = useRef(new Animated.Value(5)).current;

  useEffect(() => {
    onEditingChangeRef.current = onEditingChange;
  }, [onEditingChange]);

  const logInvalidAcademicYearIdOnce = useCallback((source, rawAcademicYearId) => {
    if (!__DEV__) return;
    const value = String(rawAcademicYearId ?? '').trim();
    if (!value) return;
    const key = `${source}:${value}`;
    if (loggedInvalidAcademicYearIdsRef.current.has(key)) return;
    loggedInvalidAcademicYearIdsRef.current.add(key);
    console.warn('[EventDetails] Skipping academic_years query for non-UUID academic_year_id:', {
      source,
      academic_year_id: rawAcademicYearId,
      event_id: event?.id || null,
    });
  }, [event?.id]);

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

  const appendAssignmentSendLogQuiet = useCallback(async (assignmentId, noteText = '') => {
    if (!assignmentId) return;
    const body = String(noteText || '').trim() || '[Sent assignment]';
    try {
      const { error } = await supabase.rpc('append_assignment_help_message', {
        p_assignment_id: assignmentId,
        p_body: body,
        p_reason: 'sent_assignment',
      });
      if (error) {
        console.warn('[EventDetails] append_assignment_help_message:', error.message || error);
      }
    } catch (e) {
      console.warn('[EventDetails] append_assignment_help_message', e);
    }
  }, []);

  const closeSendToStudentModal = useCallback(() => {
    if (sendToStudentSubmitting) return;
    setShowSendToStudentModal(false);
    setSendToStudentNote('');
    setSendToStudentInlineError('');
    if (sendOnlyMode) {
      onClose?.();
    }
  }, [sendToStudentSubmitting, sendOnlyMode, onClose]);

  const sendWorkToStudents = useCallback(
    async (note) => {
      setSendToStudentInlineError('');
      const targetAssigneeIds = (sendEligibleAssigneeIds || []).map(String).filter(Boolean);
      if (!familyId || !event?.id || assigneeIds.length === 0) {
        setSendToStudentInlineError('Choose at least one student and save the event first.');
        return;
      }
      if (targetAssigneeIds.length === 0) {
        setSendToStudentInlineError(
          sendInviteClarificationText || 'Invite the assigned students before sending this assignment.',
        );
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

        for (const childId of targetAssigneeIds) {
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
          let linkedAssignmentId = null;

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
            linkedAssignmentId = linked.id;
          } else {
            const { data: createdAssignment, error: insErr } = await createAssignment({
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
            linkedAssignmentId = createdAssignment?.id || null;
          }
          await appendAssignmentSendLogQuiet(linkedAssignmentId, noteTrim);
        }

        const blockedCount = Math.max(0, Number(assigneeIds.length || 0) - Number(targetAssigneeIds.length || 0));
        toast.push(
          blockedCount > 0
            ? `Sent to ${targetAssigneeIds.length} student${targetAssigneeIds.length === 1 ? '' : 's'}. ${blockedCount} need invite access first.`
            : 'Sent to student',
          'success'
        );
        setSendToStudentInlineError('');
        setShowSendToStudentModal(false);
        setSendToStudentNote('');
        if (sendOnlyMode) {
          onClose?.();
        }
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('childAssignmentsNeedRefresh'));
          window.dispatchEvent(new CustomEvent('parentAssignmentsNeedRefresh'));
          window.dispatchEvent(new CustomEvent('refreshRightRail'));
          window.dispatchEvent(new CustomEvent('refreshCalendar'));
        }
        await loadEventLinkedParentAssignments();
      } catch (e) {
        console.error('[EventDetails] sendWorkToStudents', e);
        toast.push(e?.message || 'Could not send', 'error');
      } finally {
        setSendToStudentSubmitting(false);
      }
    },
    [familyId, event, assigneeIds, sendEligibleAssigneeIds, sendInviteClarificationText, authUser?.id, draftTitle, eventType, subjectId, toast, sendOnlyMode, onClose, appendAssignmentSendLogQuiet, loadEventLinkedParentAssignments]
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
  const headerAttendanceChip = useMemo(() => {
    const normalizedStatus = normalizeStatus(draftStatus || event?.status);

    if (normalizedStatus === 'done') {
      return { label: 'ATTENDED', dotStyle: styles.headerStatusDotAttended };
    }

    let startDate = null;
    const draftStart = combineDateTime(draftDate, draftStartTime);
    if (draftStart && !Number.isNaN(draftStart.getTime())) {
      startDate = draftStart;
    } else {
      const fallbackStart = event?.start_ts || event?.start || event?.start_local || null;
      const parsedFallback = fallbackStart ? new Date(fallbackStart) : null;
      if (parsedFallback && !Number.isNaN(parsedFallback.getTime())) {
        startDate = parsedFallback;
      }
    }

    if (startDate && startDate.getTime() > Date.now()) {
      return { label: 'UPCOMING', dotStyle: styles.headerStatusDotUpcoming };
    }

    return { label: 'UNATTENDED', dotStyle: styles.headerStatusDotUnattended };
  }, [draftStatus, event?.status, draftDate, draftStartTime, event?.start_ts, event?.start, event?.start_local]);
  const currentHolidayType = useMemo(
    () => String(event?.holiday_type || event?.holidayType || '').toUpperCase(),
    [event?.holiday_type, event?.holidayType]
  );
  const isDaysOffOrBreakEvent = useMemo(() => {
    const normalizedEventType = String(eventType || '').trim().toLowerCase();
    return (
      currentHolidayType === 'CUSTOM_HOLIDAY' ||
      currentHolidayType === 'CUSTOM_BREAK' ||
      normalizedEventType === 'day off' ||
      normalizedEventType === 'break'
    );
  }, [currentHolidayType, eventType]);
  const shouldHideAttendanceChip = isDaysOffOrBreakEvent || currentHolidayType === 'GLOBAL_HOLIDAY';
  const hideScheduleTimeControls = isDaysOffOrBreakEvent;
  const hideLearningDetailsSection = isDaysOffOrBreakEvent;
  const showBreakEndDateField = placement === 'calendar' && normalizeEventTypeForDisplay(eventType) === 'Break';
  const isClassDayEventType = useMemo(
    () => normalizeEventTypeForDisplay(eventType) === 'Class Day',
    [eventType]
  );
  const useCompactRepeatGrid = useMemo(
    () => (Platform.OS === 'web' ? viewportWidth < 1200 : viewportWidth < 900),
    [viewportWidth]
  );
  const academicSectionTitle = 'Learning details';
  // Helper functions matching TaskCreateModal
  const showAcademicFields = () => {
    return eventType && ['Lesson', 'Activity', 'Assignment', 'Class Day', 'Scheduled Class Day', 'Schedule Block', 'ClassDay'].includes(eventType);
  };

  const showLocationFields = () => {
    return eventType && ['Appointment', 'Activity'].includes(eventType);
  };

  const buildValidationBannerMessage = useCallback((errors) => {
    const messagesByKey = {
      title: 'enter an event name',
      eventType: 'select an event type',
      date: 'choose a date',
      assignee: 'select at least one assignee',
      time: 'enter a start time',
      endDate: 'set a valid end date',
      recurrenceWeekdays: 'choose at least one repeat day',
      recurrenceEnd: 'set a valid recurrence end',
    };
    const orderedKeys = ['title', 'eventType', 'date', 'assignee', 'time', 'endDate', 'recurrenceWeekdays', 'recurrenceEnd'];
    const missing = orderedKeys
      .filter((key) => Boolean(errors?.[key]))
      .map((key) => messagesByKey[key])
      .filter(Boolean);
    if (missing.length === 0) return '';
    if (missing.length === 1) return `Please ${missing[0]} before saving.`;
    if (missing.length === 2) return `Please ${missing[0]} and ${missing[1]} before saving.`;
    return `Please ${missing.slice(0, -1).join(', ')}, and ${missing[missing.length - 1]} before saving.`;
  }, []);

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

  const recurrenceSavedTermEnd = useMemo(() => {
    const ymd = String(resolvedAcademicYearRow?.end_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
    const parsed = new Date(`${ymd}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [resolvedAcademicYearRow]);

  const validateFields = ({ showBanner = false } = {}) => {
    const errors = {};
    
    if (!draftTitle.trim()) {
      errors.title = 'Title is required';
    }
    
    if (!dueDate) {
      errors.date = 'Date is required';
    }
    
    if (!eventType) {
      errors.eventType = 'Event type is required';
    }

    if (showBreakEndDateField && eventEndDate && dueDate && eventEndDate < dueDate) {
      errors.endDate = 'End date cannot be before the start date';
    }
    
    if (assigneeIds.length === 0) {
      errors.assignee = 'At least one assignee is required';
    }

    if (isRecurring && placement === 'calendar' && !isSingleSeriesOccurrenceEdit) {
      if (recurrenceType === 'weekly' && (!Array.isArray(recurrenceWeekdays) || recurrenceWeekdays.length === 0)) {
        errors.recurrenceWeekdays = 'Select at least one weekday';
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
      } else if (recurrenceEndType === 'term_end' && !recurrenceSavedTermEnd) {
        errors.recurrenceEnd = 'No term end is set for this school year';
      }
    }

    setValidationErrors(errors);
    if (showBanner) {
      setValidationBanner(Object.keys(errors).length > 0 ? buildValidationBannerMessage(errors) : '');
    }
    return Object.keys(errors).length === 0;
  };

  const isFormValid = () => {
    if (!draftTitle.trim()) return false;
    if (assigneeIds.length === 0) return false;
    if (!dueDate) return false;
    if (!eventType) return false;
    const isMultiDayEvent = MULTI_DAY_EVENT_TYPES.includes(normalizeEventTypeForDisplay(eventType));
    if (isMultiDayEvent && placement === 'calendar' && eventEndDate && eventEndDate < dueDate) return false;
    if (isRecurring && placement === 'calendar' && !isSingleSeriesOccurrenceEdit) {
      if (recurrenceType === 'weekly' && (!Array.isArray(recurrenceWeekdays) || recurrenceWeekdays.length === 0)) return false;
      if (recurrenceEndType === 'after') {
        const fromNum = recurrenceEndAfter != null ? Number(recurrenceEndAfter) : NaN;
        const fromText = recurrenceEndAfterText ? parseInt(recurrenceEndAfterText, 10) : NaN;
        const countValue =
          Number.isFinite(fromNum) && fromNum >= 1 ? fromNum : fromText;
        if (!Number.isFinite(countValue) || countValue < 1) return false;
      } else if (recurrenceEndType === 'on' && !recurrenceEndDate) {
        return false;
      } else if (recurrenceEndType === 'term_end' && !recurrenceSavedTermEnd) {
        return false;
      }
    }
    return true;
  };

  const handleDismissEventModal = useCallback(() => {
    setValidationErrors({});
    setValidationBanner('');
    setPercentValidationError(null);
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!validationBanner) return;
    if (isFormValid()) {
      setValidationBanner('');
    }
  }, [
    validationBanner,
    draftTitle,
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
    recurrenceEndType,
    recurrenceEndAfter,
    recurrenceEndAfterText,
    recurrenceEndDate,
    recurrenceSavedTermEnd,
  ]);

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
    const shouldOpenInEditMode = initialSchedulingMode || event?._openInEditMode;
    if (readOnly) {
      setEditing(!!shouldOpenInEditMode);
      setSchedulingBacklog(!!shouldOpenInEditMode);
      if (shouldOpenInEditMode) {
        setPlacement('calendar');
      }
      onEditingChangeRef.current?.(!!shouldOpenInEditMode);
      return;
    }
    if (shouldOpenInEditMode) {
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
    
    // End date for multi-day events (Project, Trip, Holiday, Other, Break)
    const normalizedLoadedType = normalizeEventTypeForDisplay(
      event?.event_type || eventType || 'Lesson',
      event?.holiday_type || event?.holidayType
    );
    const isMultiDayEventType = MULTI_DAY_EVENT_TYPES.includes(normalizedLoadedType);
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
    // IMPORTANT: keep "no explicit time" events editable by treating flexible/timeless
    // lesson rows as untimed (empty editable fields), not as locked all-day rows.
    const isFlexibleTimeless = event?.is_flexible === true;
    const eventTypeRaw = normalizeEventTypeForDisplay(
      event?.event_type || eventType || '',
      event?.holiday_type || event?.holidayType
    );
    const isIntrinsicAllDayType = MULTI_DAY_EVENT_TYPES.includes(eventTypeRaw);
    const inferredAllDayFromBounds =
      !!startTs &&
      (() => {
        try {
          const startDate = new Date(startTs);
          const endDate = endTs ? new Date(endTs) : null;
          const startIsMidnight =
            startDate.getHours() === 0 &&
            startDate.getMinutes() === 0;
          const endIsMidnight =
            endDate
              ? endDate.getHours() === 0 && endDate.getMinutes() === 0
              : true;
          const endIsEndOfDay =
            endDate
              ? endDate.getHours() === 23 && endDate.getMinutes() === 59
              : false;
          const sameCalendarDay =
            endDate
              ? startDate.getFullYear() === endDate.getFullYear() &&
                startDate.getMonth() === endDate.getMonth() &&
                startDate.getDate() === endDate.getDate()
              : true;

          // Treat both midnight->midnight and midnight->23:59 as timeless/all-day.
          if (startIsMidnight && (endIsMidnight || (sameCalendarDay && endIsEndOfDay))) {
            return true;
          }
        } catch {
          return false;
        }
        return false;
      })();
    const shouldTreatAsUntimed =
      isFlexibleTimeless || (inferredAllDayFromBounds && !isIntrinsicAllDayType);
    const inferredAllDay = inferredAllDayFromBounds && !shouldTreatAsUntimed;

    setDraftAllDay(inferredAllDay);
    setAllDay(inferredAllDay);

    // Time handling: prefer start_local/end_local from RPC (family timezone) so plan times display correctly
    if (inferredAllDay || shouldTreatAsUntimed || (!startTs && !endTs)) {
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
      setStartTime(startTimeStr || '');
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
    setEventType(normalizeEventTypeForDisplay(event.event_type || 'Lesson', event?.holiday_type || event?.holidayType));
    
    // Academic fields
    applySubjectSelection(extractSubjectIdsFromEvent(event));
    setCountsTowardPlan(event.counts_toward_plan !== false);
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
        const parsedWeekdays = normalizeByWeekday(rule.byweekday);
        const normalizedWeekdays =
          parsedWeekdays.length > 0
            ? parsedWeekdays
            : (normalizeEventTypeForDisplay(event?.event_type || eventType) === 'Class Day' ? CLASS_DAY_DEFAULT_WEEKDAYS : []);
        setIsRecurring(true);
        setRecurrenceType(rule.frequency?.toLowerCase() || 'daily');
        setRecurrenceInterval(rule.interval || null);
        setRecurrenceWeekdays(normalizedWeekdays);
        if (rule.count) {
          setRecurrenceEndType('after');
          setRecurrenceEndAfter(rule.count);
          setRecurrenceEndAfterText(rule.count.toString());
          writeRecurrenceSeriesUiCache(event, {
            weekdays: normalizedWeekdays,
            endType: 'after',
            endAfter: rule.count,
            endDate: null,
          });
        } else if (rule.until) {
          setRecurrenceEndType('on');
          setRecurrenceEndDate(new Date(rule.until));
          writeRecurrenceSeriesUiCache(event, {
            weekdays: normalizedWeekdays,
            endType: 'on',
            endAfter: null,
            endDate: new Date(rule.until),
          });
        } else {
          setRecurrenceEndType('never');
          writeRecurrenceSeriesUiCache(event, {
            weekdays: normalizedWeekdays,
            endType: 'never',
            endAfter: null,
            endDate: null,
          });
        }
      } catch (e) {
        // Invalid recurrence rule, ignore
      }
    } else if (isPartOfRecurringSeries(event) || isPlanYearBlockSeries(event)) {
      // Instance rows may omit recurrence_rule; master fetch fills RRULE details. Plan-year slots share a block id.
      const cachedSeriesUi = readRecurrenceSeriesUiCache(event);
      setIsRecurring(true);
      setRecurrenceType('weekly');
      setRecurrenceInterval(null);
      setRecurrenceWeekdays(Array.isArray(cachedSeriesUi?.weekdays) ? cachedSeriesUi.weekdays : []);
      setRecurrenceEndType(cachedSeriesUi?.endType || 'never');
      setRecurrenceEndAfter(cachedSeriesUi?.endAfter ?? null);
      setRecurrenceEndAfterText(cachedSeriesUi?.endAfter ? String(cachedSeriesUi.endAfter) : '');
      setRecurrenceEndDate(cachedSeriesUi?.endDate ? new Date(cachedSeriesUi.endDate) : null);
    } else {
      setIsRecurring(false);
      setRecurrenceType('daily');
      setRecurrenceInterval(null);
      setRecurrenceWeekdays([]);
      setRecurrenceEndType('never');
      setRecurrenceEndAfter(null);
      setRecurrenceEndAfterText('');
      setRecurrenceEndDate(null);
    }
    
    // Only reset schedulingBacklog if not in initial scheduling mode
    if (!initialSchedulingMode) {
      setSchedulingBacklog(false);
    }
  }, [event, initialSchedulingMode, applySubjectSelection]);

  // In Edit Series mode, show the series anchor start date (not the clicked occurrence date).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!event?.id || !isSeriesEditScope) return;

      const cleanEventId = cleanPlannerEventId(String(event.id || ''));
      const masterId = resolveSeriesMasterEventId(event, cleanEventId);
      let seriesStartTs = null;

      if (masterId) {
        const masterQuery = supabase
          .from('events')
          .select('start_ts')
          .eq('id', masterId)
          .is('deleted_at', null)
          .maybeSingle();
        const { data: masterRow } = familyId
          ? await masterQuery.eq('family_id', familyId)
          : await masterQuery;
        if (masterRow?.start_ts) {
          seriesStartTs = masterRow.start_ts;
        }
      }

      if (!seriesStartTs) {
        const seriesLinkIds = resolveSeriesLinkIds(event, cleanEventId);
        if (seriesLinkIds.length > 0) {
          const filterClauses = seriesLinkIds.flatMap((id) => [
            `id.eq.${id}`,
            `recurrence_id.eq.${id}`,
            `parent_event_id.eq.${id}`,
          ]);
          let firstSeriesQuery = supabase
            .from('events')
            .select('start_ts')
            .or(filterClauses.join(','))
            .is('deleted_at', null)
            .order('start_ts', { ascending: true })
            .limit(1);
          if (familyId) {
            firstSeriesQuery = firstSeriesQuery.eq('family_id', familyId);
          }
          const { data: firstSeriesRows } = await firstSeriesQuery;
          if (Array.isArray(firstSeriesRows) && firstSeriesRows[0]?.start_ts) {
            seriesStartTs = firstSeriesRows[0].start_ts;
          }
        }
      }

      if (cancelled || !seriesStartTs) return;
      const seriesStartDate = new Date(seriesStartTs);
      if (Number.isNaN(seriesStartDate.getTime())) return;

      setDueDate(seriesStartDate);
      setDraftDate(toDateInput(seriesStartDate.toISOString()));
      setCalendarViewMonth(seriesStartDate);
    })();

    return () => {
      cancelled = true;
    };
  }, [event?.id, event?.parent_event_id, event?.recurrence_id, isSeriesEditScope, familyId]);

  // Recurring instances often omit recurrence_rule on the row; load the series master's rule for the toggle + recurrence UI.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!event?.id || event.recurrence_rule) return;
      if (!isPartOfRecurringSeries(event) || isPlanYearBlockSeries(event)) return;
      const masterId = event.parent_event_id || event.recurrence_id;
      const selfId = cleanPlannerEventId(String(event.id));
      if (!masterId || masterId === selfId) return;
      let recurrenceRulePayload = null;
      const { data: byIdData, error: byIdError } = await supabase
        .from('events')
        .select('recurrence_rule')
        .eq('id', masterId)
        .maybeSingle();
      if (byIdData?.recurrence_rule) {
        recurrenceRulePayload = byIdData.recurrence_rule;
      } else {
        // Some instance rows store a shared recurrence_id token rather than the master event id.
        const { data: bySeriesData, error: bySeriesError } = await supabase
          .from('events')
          .select('recurrence_rule')
          .eq('recurrence_id', masterId)
          .not('recurrence_rule', 'is', null)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (bySeriesData?.recurrence_rule) {
          recurrenceRulePayload = bySeriesData.recurrence_rule;
        } else if (byIdError && bySeriesError) {
          return;
        } else {
          return;
        }
      }
      if (cancelled || !recurrenceRulePayload) return;
      try {
        const rule = typeof recurrenceRulePayload === 'string'
          ? JSON.parse(recurrenceRulePayload)
          : recurrenceRulePayload;
        setIsRecurring(true);
        setRecurrenceType(rule.frequency?.toLowerCase() || 'daily');
        setRecurrenceInterval(rule.interval || null);
        const parsedWeekdays = normalizeByWeekday(rule.byweekday);
        const normalizedWeekdays = parsedWeekdays.length > 0 ? parsedWeekdays : (isClassDayEventType ? CLASS_DAY_DEFAULT_WEEKDAYS : []);
        setRecurrenceWeekdays(normalizedWeekdays);
        if (rule.count) {
          setRecurrenceEndType('after');
          setRecurrenceEndAfter(rule.count);
          setRecurrenceEndAfterText(rule.count.toString());
          writeRecurrenceSeriesUiCache(event, {
            weekdays: normalizedWeekdays,
            endType: 'after',
            endAfter: rule.count,
            endDate: null,
          });
        } else if (rule.until) {
          setRecurrenceEndType('on');
          setRecurrenceEndDate(new Date(rule.until));
          writeRecurrenceSeriesUiCache(event, {
            weekdays: normalizedWeekdays,
            endType: 'on',
            endAfter: null,
            endDate: new Date(rule.until),
          });
        } else {
          setRecurrenceEndType('never');
          writeRecurrenceSeriesUiCache(event, {
            weekdays: normalizedWeekdays,
            endType: 'never',
            endAfter: null,
            endDate: null,
          });
        }
      } catch (_) {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event?.id, event?.recurrence_rule, event?.parent_event_id, event?.recurrence_id, event?.generated_by, event?.source_block_id]);

  // Split-weekday series store one weekday per master rule.
  // When those masters are linked by a shared recurrence_id, merge weekdays for edit UX.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!event?.id) return;
      if (!isRecurring || recurrenceType !== 'weekly') return;
      if (Array.isArray(recurrenceWeekdays) && recurrenceWeekdays.length > 1) return;
      const recurrenceGroupId = cleanPlannerEventId(String(event?.recurrence_id || ''));
      if (!recurrenceGroupId) return;
      const { data, error } = await supabase
        .from('events')
        .select('recurrence_rule, start_ts')
        .eq('recurrence_id', recurrenceGroupId)
        .not('recurrence_rule', 'is', null)
        .is('deleted_at', null);
      if (cancelled || error || !Array.isArray(data) || data.length === 0) return;
      const collected = [];
      data.forEach((row) => {
        if (!row?.recurrence_rule) return;
        try {
          const parsed = typeof row.recurrence_rule === 'string'
            ? JSON.parse(row.recurrence_rule)
            : row.recurrence_rule;
          if (parsed?.byweekday != null) {
            collected.push(parsed.byweekday);
          }
        } catch (_) {
          // ignore bad rows
        }
        const rowStart = row?.start_ts ? new Date(row.start_ts) : null;
        if (rowStart instanceof Date && !Number.isNaN(rowStart.getTime())) {
          const weekdayFromStart = WEEKDAY_FROM_DATE[rowStart.getDay()];
          if (weekdayFromStart) {
            collected.push(weekdayFromStart);
          }
        }
      });
      const mergedWeekdays = normalizeByWeekday(collected);
      if (mergedWeekdays.length > 1) {
        setRecurrenceWeekdays(mergedWeekdays);
        writeRecurrenceSeriesUiCache(event, {
          weekdays: mergedWeekdays,
          endType: recurrenceEndType,
          endAfter: recurrenceEndAfter,
          endDate: recurrenceEndDate,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event?.id, event?.recurrence_id, isRecurring, recurrenceType, recurrenceEndType, recurrenceEndAfter, recurrenceEndDate]);

  // Backward compatibility: older split-weekday series may not share recurrence_id.
  // Infer sibling weekday masters by near-identical metadata and merge weekdays for edit UI.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!event?.id || !familyId) return;
      if (!isRecurring || recurrenceType !== 'weekly') return;
      if (Array.isArray(recurrenceWeekdays) && recurrenceWeekdays.length > 1) return;

      const anchorMasterId = cleanPlannerEventId(String(event.parent_event_id || event.recurrence_id || event.id || ''));
      if (!anchorMasterId) return;
      const { data: anchor, error: anchorErr } = await supabase
        .from('events')
        .select('id, title, subject_id, event_type, child_id, child_ids, start_ts, end_ts, recurrence_rule, created_at, deleted_at')
        .eq('id', anchorMasterId)
        .maybeSingle();
      if (cancelled || anchorErr || !anchor || anchor.deleted_at) return;

      let anchorRule = null;
      try {
        anchorRule = typeof anchor.recurrence_rule === 'string'
          ? JSON.parse(anchor.recurrence_rule)
          : anchor.recurrence_rule;
      } catch (_) {
        anchorRule = null;
      }
      const anchorFreq = String(anchorRule?.frequency || anchorRule?.freq || '').toUpperCase();
      if (anchorFreq !== 'WEEKLY') return;
      if (!anchor.created_at) return;
      const createdAt = new Date(anchor.created_at);
      if (Number.isNaN(createdAt.getTime())) return;
      const windowStart = new Date(createdAt.getTime() - 5 * 60 * 1000).toISOString();
      const windowEnd = new Date(createdAt.getTime() + 5 * 60 * 1000).toISOString();

      let query = supabase
        .from('events')
        .select('recurrence_rule, child_id, child_ids, start_ts, end_ts')
        .eq('family_id', familyId)
        .is('deleted_at', null)
        .eq('title', anchor.title || '')
        .gte('created_at', windowStart)
        .lte('created_at', windowEnd)
        .not('recurrence_rule', 'is', null);
      query = anchor.event_type == null ? query.is('event_type', null) : query.eq('event_type', anchor.event_type);
      query = anchor.subject_id == null ? query.is('subject_id', null) : query.eq('subject_id', anchor.subject_id);
      query = anchor.child_id == null ? query.is('child_id', null) : query.eq('child_id', anchor.child_id);
      const { data: siblings, error: siblingsErr } = await query;
      if (cancelled || siblingsErr || !Array.isArray(siblings) || siblings.length === 0) return;

      const targetInterval = String(anchorRule?.interval || 1);
      const targetUntil = String(anchorRule?.until || '');
      const anchorChildIds = normalizedChildIdsKey(anchor.child_ids);
      const anchorStartTime = hhmmUtcFromTs(anchor.start_ts);
      const anchorDuration = durationMinutesFromTs(anchor.start_ts, anchor.end_ts);
      const weekdayBuckets = [];
      let totalCount = 0;
      let everyRuleHasCount = true;
      siblings.forEach((row) => {
        let rule = null;
        try {
          rule = typeof row?.recurrence_rule === 'string'
            ? JSON.parse(row.recurrence_rule)
            : row?.recurrence_rule;
        } catch (_) {
          rule = null;
        }
        const freq = String(rule?.frequency || rule?.freq || '').toUpperCase();
        if (freq !== 'WEEKLY') return;
        if (String(rule?.interval || 1) !== targetInterval) return;
        if (String(rule?.until || '') !== targetUntil) return;
        if (String(row?.child_id || '') !== String(anchor.child_id || '')) return;
        if (normalizedChildIdsKey(row?.child_ids) !== anchorChildIds) return;
        if (hhmmUtcFromTs(row?.start_ts) !== anchorStartTime) return;
        if (durationMinutesFromTs(row?.start_ts, row?.end_ts) !== anchorDuration) return;
        if (rule?.byweekday != null) weekdayBuckets.push(rule.byweekday);
        const rowStart = row?.start_ts ? new Date(row.start_ts) : null;
        if (rowStart instanceof Date && !Number.isNaN(rowStart.getTime())) {
          const weekdayFromStart = WEEKDAY_FROM_DATE[rowStart.getDay()];
          if (weekdayFromStart) {
            weekdayBuckets.push(weekdayFromStart);
          }
        }
        const countNum = Number(rule?.count);
        if (Number.isFinite(countNum) && countNum > 0) {
          totalCount += countNum;
        } else {
          everyRuleHasCount = false;
        }
      });
      const mergedWeekdays = normalizeByWeekday(weekdayBuckets);
      if (!cancelled && mergedWeekdays.length > 1) {
        setRecurrenceWeekdays(mergedWeekdays);
        writeRecurrenceSeriesUiCache(event, {
          weekdays: mergedWeekdays,
          endType: recurrenceEndType,
          endAfter: recurrenceEndAfter,
          endDate: recurrenceEndDate,
        });
      }
      if (!cancelled && everyRuleHasCount && totalCount > 0) {
        setRecurrenceEndType('after');
        setRecurrenceEndAfter(totalCount);
        setRecurrenceEndAfterText(String(totalCount));
        writeRecurrenceSeriesUiCache(event, {
          weekdays: mergedWeekdays.length > 0 ? mergedWeekdays : recurrenceWeekdays,
          endType: 'after',
          endAfter: totalCount,
          endDate: null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    event?.id,
    event?.parent_event_id,
    event?.recurrence_id,
    familyId,
    isRecurring,
    recurrenceType,
    recurrenceWeekdays,
    recurrenceEndType,
    recurrenceEndAfter,
    recurrenceEndDate,
  ]);

  useEffect(() => {
    if (!isRecurring || placement !== 'calendar' || recurrenceType !== 'weekly') return;
    if (Array.isArray(recurrenceWeekdays) && recurrenceWeekdays.length > 0) return;
    if (isPartOfRecurringSeries(event) && !event?.recurrence_rule) return;
    if (isPlanYearBlockSeries(event) && event?.academic_year_id) return;
    const fallback = resolveWeekdayCodeFromEventOrDueDate(event, dueDate);
    setRecurrenceWeekdays([fallback]);
  }, [isRecurring, placement, recurrenceType, recurrenceWeekdays, dueDate, event]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isRecurring || placement !== 'calendar' || recurrenceType !== 'weekly') return;
      if (Array.isArray(recurrenceWeekdays) && recurrenceWeekdays.length > 0) return;
      if (isPartOfRecurringSeries(event) && !event?.recurrence_rule) return;
      if (!isPlanYearBlockSeries(event) || !event?.academic_year_id) return;
      if (!isUUID(String(event.academic_year_id))) {
        logInvalidAcademicYearIdOnce('recurrence-weekday-load', event.academic_year_id);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('academic_years')
          .select('allowed_weekdays')
          .eq('id', event.academic_year_id)
          .maybeSingle();
        if (cancelled || error) return;
        const normalized = normalizeByWeekday(data?.allowed_weekdays);
        if (normalized.length > 0) {
          setRecurrenceWeekdays(normalized);
          writeRecurrenceSeriesUiCache(event, {
            weekdays: normalized,
            endType: recurrenceEndType,
            endAfter: recurrenceEndAfter,
            endDate: recurrenceEndDate,
          });
          return;
        }
      } catch (_) {
        // ignore and fallback below
      }
      if (!cancelled) {
        if (isClassDayEventType) {
          setRecurrenceWeekdays(CLASS_DAY_DEFAULT_WEEKDAYS);
          writeRecurrenceSeriesUiCache(event, {
            weekdays: CLASS_DAY_DEFAULT_WEEKDAYS,
            endType: recurrenceEndType,
            endAfter: recurrenceEndAfter,
            endDate: recurrenceEndDate,
          });
        } else {
          const fallback = resolveWeekdayCodeFromEventOrDueDate(event, dueDate);
          setRecurrenceWeekdays([fallback]);
          writeRecurrenceSeriesUiCache(event, {
            weekdays: [fallback],
            endType: recurrenceEndType,
            endAfter: recurrenceEndAfter,
            endDate: recurrenceEndDate,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isRecurring, placement, recurrenceType, recurrenceWeekdays, event, dueDate, isClassDayEventType, recurrenceEndType, recurrenceEndAfter, recurrenceEndDate]);

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
      const hasValidAcademicYearId = academicYearId && isUUID(String(academicYearId));
      if (academicYearId && !hasValidAcademicYearId) {
        logInvalidAcademicYearIdOnce('linked-row-merge', academicYearId);
      }
      if (hasValidAcademicYearId && !list.some((a) => a.id === academicYearId)) {
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
    if (!isUUID(String(academicYearId))) {
      logInvalidAcademicYearIdOnce('single-row-load', academicYearId);
      return;
    }
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
  }, [familyId, academicYearId, logInvalidAcademicYearIdOnce]);

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

  /** Stable subject labels: local list → preload → embedded event subject fallback. */
  const resolvedSubjectLabels = useMemo(() => {
    if (!Array.isArray(subjectIds) || subjectIds.length === 0) return [];
    const labels = subjectIds
      .map((sid) => {
        const fromState = subjects.find((s) => String(s.id) === String(sid))?.name;
        if (fromState) return fromState;
        if (Array.isArray(preloadedSubjects)) {
          const fromPre = preloadedSubjects.find((s) => String(s.id) === String(sid))?.name;
          if (fromPre) return fromPre;
        }
        if (subjectId && String(sid) === String(subjectId)) {
          return (
            event?.subject?.name ||
            (typeof event?.subject === 'string' ? event.subject : null) ||
            event?.subjectName ||
            event?.subject_name ||
            null
          );
        }
        return null;
      })
      .filter(Boolean);
    return Array.from(new Set(labels));
  }, [subjectIds, subjectId, subjects, preloadedSubjects, event?.subject, event?.subjectName, event?.subject_name]);
  const resolvedSubjectLabel = resolvedSubjectLabels.length > 0
    ? resolvedSubjectLabels.join(', ')
    : ((event?.generated_by === 'plan_year' && event?.title) || subjectName || null);

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
        const seriesDeleteDetail = isPlanYearBlockSeries(event) && event?.source_block_id && event?.academic_year_id
          ? {
              sourceBlockId: String(event.source_block_id),
              seriesAcademicYearId: String(event.academic_year_id),
            }
          : {
              seriesMasterEventId: resolveSeriesMasterEventId(event, cleanId),
              seriesLinkIds: resolveSeriesLinkIds(event, cleanId),
            };
        window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { eventId: idForHooks, ...seriesDeleteDetail } }));
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
      const isCustomExclusionDelete =
        currentHolidayType === 'CUSTOM_HOLIDAY' || currentHolidayType === 'CUSTOM_BREAK';
      if (
        isCustomExclusionDelete &&
        Platform.OS === 'web' &&
        typeof window !== 'undefined' &&
        deleteTargetId
      ) {
        window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { eventId: deleteTargetId } }));
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipHomeRefresh: true } }));
      }
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
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const attemptedDeleteId = cleanPlannerEventId(String(event?.id || ''));
        const isCustomExclusionDelete =
          currentHolidayType === 'CUSTOM_HOLIDAY' || currentHolidayType === 'CUSTOM_BREAK';
        if (isCustomExclusionDelete && attemptedDeleteId) {
          window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
        }
      }
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

    setShowDeleteConfirm(true);
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

        const isMultiDayEventType = MULTI_DAY_EVENT_TYPES.includes(normalizeEventTypeForDisplay(eventType));
        let resolvedEnd;

        if (isMultiDayEventType && eventEndDate) {
          const endDateYear = eventEndDate.getFullYear();
          const endDateMonth = eventEndDate.getMonth();
          const endDateDay = eventEndDate.getDate();
          resolvedEnd = new Date(endDateYear, endDateMonth, endDateDay, 23, 59, 59, 999);
        } else {
          const normalizedEndTime = normalizeTimeValue(endTime);
          resolvedEnd = normalizedEndTime
            ? applyTimeToDate(baseDate, normalizedEndTime)
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
          if (shouldSkipConflictEvent(otherEv)) continue;

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
        if (shouldSkipConflictEvent(existingEvent)) continue;
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
    let hasExplicitStartTime = false;

    // If scheduling a backlog item, date is required
    if (schedulingBacklog && !draftDate) {
      Alert.alert('Date Required', 'Please enter a date to schedule this task.');
      return;
    }

    // Use dueDate for date, startTime/endTime for times (matching TaskCreateModal structure)
    const dateToUse = dueDate ? toDateInput(dueDate.toISOString()) : draftDate;
    const normalizedStartInput = normalizeTimeValue(startTime) || normalizeTimeValue(draftStartTime);
    const normalizedEndInput = normalizeTimeValue(endTime) || normalizeTimeValue(draftEndTime);
    const isMultiDayEventType = MULTI_DAY_EVENT_TYPES.includes(normalizeEventTypeForDisplay(eventType));
    if (!(allDay || draftAllDay) && !normalizedStartInput && normalizedEndInput) {
      setValidationErrors((prev) => ({
        ...prev,
        time: 'Enter a start time before adding an end time.',
      }));
      return;
    }
    
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
        const timeToUse = normalizedStartInput;
        if (!timeToUse) {
          // Keep start/end optional by defaulting blank-time edits to all-day bounds.
          const baseDate = dueDate || new Date(dateToUse);
          baseDate.setHours(0, 0, 0, 0);
          startDateObj = baseDate;
          endDateObj = new Date(baseDate);
          endDateObj.setHours(23, 59, 0, 0);
        } else {
          hasExplicitStartTime = true;
          const resolvedStart = applyTimeToDate(dueDate || new Date(dateToUse), timeToUse);
          if (!resolvedStart) {
            setValidationErrors((prev) => ({
              ...prev,
              time: 'Enter a valid start time (e.g., 9:00 AM) or leave it blank.',
            }));
            return;
          }
          startDateObj = resolvedStart;

          if (normalizedEndInput) {
            // Single-day event with end time
            const endTimeToUse = normalizedEndInput;
            let resolvedEnd = applyTimeToDate(dueDate || new Date(dateToUse), endTimeToUse);
            if (!resolvedEnd) {
              setValidationErrors((prev) => ({
                ...prev,
                time: 'Enter a valid end time (e.g., 10:00 AM) or leave it blank.',
              }));
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
    }

    if (dateToUse && isMultiDayEventType) {
      const startBase = dueDate ? new Date(dueDate) : new Date(dateToUse);
      startBase.setHours(0, 0, 0, 0);
      if (!startDateObj || Number.isNaN(startDateObj.getTime())) {
        startDateObj = new Date(startBase);
      }
      if (eventEndDate instanceof Date && !Number.isNaN(eventEndDate.getTime())) {
        const endDateOnly = new Date(eventEndDate.getFullYear(), eventEndDate.getMonth(), eventEndDate.getDate());
        if (endDateOnly < startBase) {
          setValidationErrors((prev) => ({ ...prev, endDate: 'End date cannot be before the start date.' }));
          return;
        }
        endDateObj = new Date(endDateOnly.getFullYear(), endDateOnly.getMonth(), endDateOnly.getDate(), 23, 59, 59, 999);
      } else {
        endDateObj = new Date(startBase.getFullYear(), startBase.getMonth(), startBase.getDate(), 23, 59, 59, 999);
      }
    }

    setSaving(true);
    try {
      const isBacklog = event.is_backlog === true || event.data?.is_backlog === true;
      
      // Build recurrence rule if recurring. In single-occurrence scope, keep existing series rule untouched.
      let recurrenceRule = null;
      if (isSingleSeriesOccurrenceEdit) {
        if (event?.recurrence_rule == null) {
          recurrenceRule = null;
        } else {
          recurrenceRule =
            typeof event.recurrence_rule === 'string'
              ? event.recurrence_rule
              : JSON.stringify(event.recurrence_rule);
        }
      } else if (isRecurring && placement === 'calendar') {
        const interval = recurrenceInterval || 1;
        const rule = {
          frequency: recurrenceType.toUpperCase(),
          interval: interval,
        };
        if (recurrenceType === 'weekly') {
          const fallback = WEEKDAY_FROM_DATE[new Date(dueDate || new Date()).getDay()] || 'MO';
          const weekdays = Array.isArray(recurrenceWeekdays) && recurrenceWeekdays.length > 0
            ? recurrenceWeekdays
            : [fallback];
          rule.byweekday = weekdays;
        }
        if (recurrenceEndType === 'after') {
          const countValue = recurrenceEndAfter || (recurrenceEndAfterText ? parseInt(recurrenceEndAfterText, 10) : null);
          if (countValue && !isNaN(countValue) && countValue > 0) {
            rule.count = countValue;
          }
        } else if (recurrenceEndType === 'on' && recurrenceEndDate) {
          rule.until = recurrenceEndDate.toISOString().split('T')[0];
        } else if (recurrenceEndType === 'term_end' && recurrenceSavedTermEnd) {
          rule.until = recurrenceSavedTermEnd.toISOString().split('T')[0];
        }
        recurrenceRule = rule;
      }
      
      const displayEventType = normalizeEventTypeForDisplay(eventType);
      const persistedEventType = normalizeEventTypeForPersistence(displayEventType);
      const updates = {
        title: draftTitle.trim(),
        description: notes.trim() ? notes.trim() : null,
        child_id: assigneeIds.length > 0 ? assigneeIds[0] : null,
        child_ids: assigneeIds.length > 0 ? assigneeIds : [], // Use empty array instead of null to match DB default
        status: normalizeStatus(draftStatus),
        tags: draftTags.length ? draftTags : null,
        material_id: selectedMaterialId || null,
        materials_attachment_ids: attachedMaterialIds.length > 0 ? attachedMaterialIds : null,
        event_type: persistedEventType,
        subject_id: subjectIds[0] || null,
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
      };
      // Preserve optional-time semantics:
      // - Blank start time => flexible/timeless row (editable when reopened)
      // - Explicit start time => fixed-time row
      if (!(allDay || draftAllDay)) {
        updates.is_flexible = !hasExplicitStartTime;
      } else {
        updates.is_flexible = false;
      }

      const cmSave = parseCurriculumMetadata(event);
      const hadMetaKeys = Object.keys(cmSave).length > 0;
      if (lesson && lesson.trim()) {
        cmSave.lesson_label = lesson.trim();
      } else {
        delete cmSave.lesson_label;
      }
      if (subjectIds.length > 0) {
        cmSave.subject_ids = subjectIds;
      } else {
        delete cmSave.subject_ids;
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
          isMultiDay: MULTI_DAY_EVENT_TYPES.includes(normalizeEventTypeForDisplay(eventType))
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
      // Final defensive normalization before write so DB constraints are never violated.
      const normalizedForDb = normalizeEventTypeForPersistence(cleanUpdates.event_type);
      cleanUpdates.event_type = VALID_DB_EVENT_TYPES.has(normalizedForDb)
        ? normalizedForDb
        : 'Lesson';
      
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
      const targetEventId = cleanPlannerEventId(String(event.id));
      const seriesLinkIds = isSeriesEditScope
        ? resolveSeriesLinkIds(event, targetEventId)
        : [];
      const scopedFamilyId = String(familyId || event?.family_id || '').trim();
      let resolvedSeriesLinkIds = [...seriesLinkIds];
      const resolvedSeriesRowsById = new Map();
      const attendanceLockedSeriesRowIds = new Set();
      const todayStartLocal = new Date();
      todayStartLocal.setHours(0, 0, 0, 0);
      if (isSeriesEditScope && seriesLinkIds.length > 0) {
        try {
          // Expand linkage ids so updates apply to the full series even when legacy rows
          // use mixed recurrence_id / parent_event_id linkage patterns.
          let probeIds = [...seriesLinkIds];
          let pass = 0;
          while (probeIds.length > 0 && pass < 3) {
            const filterClauses = probeIds.flatMap((id) => [
              `id.eq.${id}`,
              `parent_event_id.eq.${id}`,
              `recurrence_id.eq.${id}`,
            ]);
            let resolveQuery = supabase
              .from('events')
              .select('id, parent_event_id, recurrence_id, start_ts, status')
              .or(filterClauses.join(','))
              .is('deleted_at', null);
            if (scopedFamilyId) resolveQuery = resolveQuery.eq('family_id', scopedFamilyId);
            const { data: linkedRows, error: linkedRowsError } = await resolveQuery;
            if (linkedRowsError || !Array.isArray(linkedRows) || linkedRows.length === 0) break;
            linkedRows.forEach((row) => {
              const rowId = cleanPlannerEventId(String(row?.id || ''));
              if (!rowId) return;
              resolvedSeriesRowsById.set(rowId, row);
            });
            const discoveredIds = Array.from(
              new Set(
                linkedRows.flatMap((row) => [
                  cleanPlannerEventId(String(row?.id || '')),
                  cleanPlannerEventId(String(row?.parent_event_id || '')),
                  cleanPlannerEventId(String(row?.recurrence_id || '')),
                ]).filter(Boolean)
              )
            );
            const nextProbeIds = discoveredIds.filter((id) => !resolvedSeriesLinkIds.includes(id));
            if (nextProbeIds.length === 0) {
              resolvedSeriesLinkIds = Array.from(new Set([...resolvedSeriesLinkIds, ...discoveredIds]));
              break;
            }
            resolvedSeriesLinkIds = Array.from(new Set([...resolvedSeriesLinkIds, ...discoveredIds]));
            probeIds = nextProbeIds;
            pass += 1;
          }
        } catch (resolveErr) {
          console.warn('[EventDetails] Failed to expand series scope ids:', resolveErr);
        }
      }
      if (isSeriesEditScope && resolvedSeriesRowsById.size > 0) {
        const resolvedSeriesRows = Array.from(resolvedSeriesRowsById.values());
        const pastRows = resolvedSeriesRows.filter((row) => {
          const rowStart = row?.start_ts ? new Date(row.start_ts) : null;
          return rowStart instanceof Date && !Number.isNaN(rowStart.getTime()) && rowStart < todayStartLocal;
        });
        pastRows.forEach((row) => {
          const normalized = normalizeStatus(String(row?.status || ''));
          if (normalized === 'done' || normalized === 'completed') {
            const rowId = cleanPlannerEventId(String(row?.id || ''));
            if (rowId) attendanceLockedSeriesRowIds.add(rowId);
          }
        });
        const pastRowIds = pastRows
          .map((row) => cleanPlannerEventId(String(row?.id || '')))
          .filter(Boolean);
        if (pastRowIds.length > 0) {
          try {
            let attendanceQuery = supabase
              .from('attendance_records')
              .select('event_id')
              .in('event_id', pastRowIds);
            if (scopedFamilyId) attendanceQuery = attendanceQuery.eq('family_id', scopedFamilyId);
            const { data: attendanceRows } = await attendanceQuery;
            (attendanceRows || []).forEach((row) => {
              const lockedId = cleanPlannerEventId(String(row?.event_id || ''));
              if (lockedId) attendanceLockedSeriesRowIds.add(lockedId);
            });
          } catch (attendanceErr) {
            console.warn('[EventDetails] Failed checking attendance-locked rows:', attendanceErr);
          }
        }
      }
      const editableSeriesRowIds = resolvedSeriesRowsById.size > 0
        ? Array.from(resolvedSeriesRowsById.keys()).filter((id) => !attendanceLockedSeriesRowIds.has(id))
        : [];
      const seriesSharedUpdates = isSeriesEditScope
        ? Object.fromEntries(
            Object.entries(cleanUpdates).filter(([key]) => key !== 'start_ts' && key !== 'end_ts')
          )
        : null;

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
        childIdsChanged,
        isSeriesEditScope,
      });
      
      let { error, data } = await supabase
        .from('events')
        .update(cleanUpdates)
        .eq('id', targetEventId)
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

      if (
        isSeriesEditScope &&
        seriesSharedUpdates &&
        Object.keys(seriesSharedUpdates).length > 0 &&
        (resolvedSeriesRowsById.size > 0 || resolvedSeriesLinkIds.length > 0)
      ) {
        const filterClauses = resolvedSeriesLinkIds.flatMap((id) => [
          `id.eq.${id}`,
          `parent_event_id.eq.${id}`,
          `recurrence_id.eq.${id}`,
        ]);
        try {
          let seriesQuery = supabase
            .from('events')
            .update(seriesSharedUpdates);
          if (resolvedSeriesRowsById.size > 0) {
            if (editableSeriesRowIds.length === 0) {
              seriesQuery = null;
            } else {
              seriesQuery = seriesQuery.in('id', editableSeriesRowIds);
            }
          } else {
            seriesQuery = seriesQuery.or(filterClauses.join(',')).is('deleted_at', null);
          }
          if (seriesQuery && scopedFamilyId) {
            seriesQuery = seriesQuery.eq('family_id', scopedFamilyId);
          }
          if (seriesQuery) {
            const { error: seriesUpdateError } = await seriesQuery;
            if (seriesUpdateError) {
              console.warn('[EventDetails] Series update partially failed:', seriesUpdateError);
              toast.push('Updated this event, but could not apply all series changes.', 'error');
            }
          }
        } catch (seriesErr) {
          console.warn('[EventDetails] Series update threw:', seriesErr);
          toast.push('Updated this event, but could not apply all series changes.', 'error');
        }
      }

      if (
        isSeriesEditScope &&
        startDateObj instanceof Date &&
        !Number.isNaN(startDateObj.getTime()) &&
        (resolvedSeriesRowsById.size > 0 || resolvedSeriesLinkIds.length > 0)
      ) {
        const seriesStartBoundary = new Date(startDateObj);
        seriesStartBoundary.setHours(0, 0, 0, 0);
        const boundaryIso = seriesStartBoundary.toISOString();
        const nowIso = new Date().toISOString();
        try {
          let archiveQuery = supabase
            .from('events')
            .update({ deleted_at: nowIso });
          if (resolvedSeriesRowsById.size > 0) {
            if (editableSeriesRowIds.length === 0) {
              archiveQuery = null;
            } else {
              archiveQuery = archiveQuery
                .in('id', editableSeriesRowIds)
                .lt('start_ts', boundaryIso)
                .is('deleted_at', null);
            }
          } else {
            const archiveFilterClauses = resolvedSeriesLinkIds.flatMap((id) => [
              `id.eq.${id}`,
              `parent_event_id.eq.${id}`,
              `recurrence_id.eq.${id}`,
            ]);
            archiveQuery = archiveQuery
              .or(archiveFilterClauses.join(','))
              .lt('start_ts', boundaryIso)
              .is('deleted_at', null);
          }
          if (archiveQuery && scopedFamilyId) archiveQuery = archiveQuery.eq('family_id', scopedFamilyId);
          if (archiveQuery) {
            const { error: archiveError } = await archiveQuery;
            if (archiveError) {
              console.warn('[EventDetails] Failed archiving pre-series-start rows:', archiveError);
            }
          }
        } catch (archiveErr) {
          console.warn('[EventDetails] Exception archiving pre-series-start rows:', archiveErr);
        }
      }
      if (isSeriesEditScope && attendanceLockedSeriesRowIds.size > 0) {
        toast.push(
          `Preserved ${attendanceLockedSeriesRowIds.size} past attendance-locked occurrence${attendanceLockedSeriesRowIds.size === 1 ? '' : 's'}.`,
          'info'
        );
      }

      // Split-weekday recurrence compatibility:
      // when editing a weekly series and selecting additional weekdays, create missing weekday series rows
      // so events actually appear on newly selected days.
      if (
        isSeriesEditScope &&
        isRecurring &&
        recurrenceType === 'weekly' &&
        (resolvedSeriesRowsById.size > 0 || resolvedSeriesLinkIds.length > 0)
      ) {
        const recurrenceRuleObject =
          recurrenceRule && typeof recurrenceRule === 'string'
            ? (() => {
                try { return JSON.parse(recurrenceRule); } catch (_) { return null; }
              })()
            : recurrenceRule;
        const selectedWeekdayCodes = normalizeByWeekday(
          Array.isArray(recurrenceWeekdays) && recurrenceWeekdays.length > 0
            ? recurrenceWeekdays
            : recurrenceRuleObject?.byweekday
        );
        if (recurrenceRuleObject && selectedWeekdayCodes.length > 0) {
          const filterClauses = resolvedSeriesLinkIds.flatMap((id) => [
            `id.eq.${id}`,
            `parent_event_id.eq.${id}`,
            `recurrence_id.eq.${id}`,
          ]);
          let seriesRowsQuery = supabase
            .from('events')
            .select('id, parent_event_id, recurrence_id, start_ts')
            .is('deleted_at', null);
          if (resolvedSeriesRowsById.size > 0) {
            if (editableSeriesRowIds.length === 0) {
              seriesRowsQuery = null;
            } else {
              seriesRowsQuery = seriesRowsQuery.in('id', editableSeriesRowIds);
            }
          } else {
            seriesRowsQuery = seriesRowsQuery.or(filterClauses.join(','));
          }
          if (seriesRowsQuery && scopedFamilyId) {
            seriesRowsQuery = seriesRowsQuery.eq('family_id', scopedFamilyId);
          }
          const { data: seriesRows, error: seriesRowsError } = seriesRowsQuery
            ? await seriesRowsQuery
            : { data: [], error: null };
          if (!seriesRowsError && Array.isArray(seriesRows) && seriesRows.length > 0) {
            // Hard-remove rows that no longer match the selected weekly weekday set.
            const selectedWeekdaySet = new Set(selectedWeekdayCodes);
            const weekdayRowsToRemove = seriesRows
              .filter((row) => {
                const rowStart = row?.start_ts ? new Date(row.start_ts) : null;
                if (!(rowStart instanceof Date) || Number.isNaN(rowStart.getTime())) return false;
                const weekdayCode = WEEKDAY_FROM_DATE[rowStart.getDay()];
                return weekdayCode && !selectedWeekdaySet.has(weekdayCode);
              })
              .map((row) => cleanPlannerEventId(String(row?.id || '')))
              .filter(Boolean);
            if (weekdayRowsToRemove.length > 0) {
              const nowIso = new Date().toISOString();
              let removeRowsQuery = supabase
                .from('events')
                .update({ deleted_at: nowIso })
                .in('id', Array.from(new Set(weekdayRowsToRemove)))
                .is('deleted_at', null);
              if (scopedFamilyId) {
                removeRowsQuery = removeRowsQuery.eq('family_id', scopedFamilyId);
              }
              const { error: removeRowsErr } = await removeRowsQuery;
              if (removeRowsErr) {
                console.warn('[EventDetails] Failed removing deselected weekday rows:', removeRowsErr);
              }
            }

            const weekdayToMasterId = new Map();
            seriesRows.forEach((row) => {
              const rowStart = row?.start_ts ? new Date(row.start_ts) : null;
              if (!(rowStart instanceof Date) || Number.isNaN(rowStart.getTime())) return;
              const weekdayCode = WEEKDAY_FROM_DATE[rowStart.getDay()];
              if (!weekdayCode) return;
              const masterId = cleanPlannerEventId(String(row?.parent_event_id || row?.id || ''));
              if (!masterId) return;
              if (!weekdayToMasterId.has(weekdayCode)) {
                weekdayToMasterId.set(weekdayCode, masterId);
              }
            });

            const existingWeekdayCodes = Array.from(weekdayToMasterId.keys());
            const existingWeekdaySet = new Set(existingWeekdayCodes);
            const weekdaysToAdd = selectedWeekdayCodes.filter((code) => !existingWeekdaySet.has(code));
            const weekdaysToRemove = existingWeekdayCodes.filter((code) => !selectedWeekdaySet.has(code));
            const groupRecurrenceId = cleanPlannerEventId(String(event?.recurrence_id || seriesLinkIds[0] || targetEventId || ''));

            if (weekdaysToRemove.length > 0) {
              const nowIso = new Date().toISOString();
              for (const weekdayCode of weekdaysToRemove) {
                const weekdayMasterId = weekdayToMasterId.get(weekdayCode);
                if (!weekdayMasterId) continue;
                let removeQuery = supabase
                  .from('events')
                  .update({ deleted_at: nowIso })
                  .or(`id.eq.${weekdayMasterId},parent_event_id.eq.${weekdayMasterId},recurrence_id.eq.${weekdayMasterId}`)
                  .is('deleted_at', null);
                if (scopedFamilyId) {
                  removeQuery = removeQuery.eq('family_id', scopedFamilyId);
                }
                const { error: removeErr } = await removeQuery;
                if (removeErr) {
                  console.warn('[EventDetails] Failed to remove deselected weekday series:', {
                    weekdayCode,
                    weekdayMasterId,
                    error: removeErr,
                  });
                }
              }
            }

            if (weekdaysToAdd.length > 0 && scopedFamilyId) {
              const baselineStart =
                startDateObj instanceof Date && !Number.isNaN(startDateObj.getTime())
                  ? new Date(startDateObj)
                  : (() => {
                      const fallback = new Date(event?.start_ts || event?.start || Date.now());
                      return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
                    })();
              const baselineEnd =
                endDateObj instanceof Date && !Number.isNaN(endDateObj.getTime())
                  ? new Date(endDateObj)
                  : (() => {
                      const fallback = new Date(event?.end_ts || '');
                      if (!Number.isNaN(fallback.getTime())) return fallback;
                      return new Date(baselineStart.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
                    })();
              const durationMs = Math.max(
                baselineEnd.getTime() - baselineStart.getTime(),
                DEFAULT_DURATION_MINUTES * 60 * 1000
              );
              const baselineWeekday = baselineStart.getDay();
              const normalizedIntervalWeeks = Number.isFinite(Number(recurrenceRuleObject?.interval))
                ? Math.max(1, Number(recurrenceRuleObject.interval))
                : 1;
              const weekdayCodeToIndex = (code) =>
                WEEKDAY_FROM_DATE.indexOf(String(code || '').slice(0, 2).toUpperCase());
              const totalCount = Number.isFinite(Number(recurrenceRuleObject?.count))
                ? Math.max(0, Number(recurrenceRuleObject.count))
                : null;
              const countsByWeekday = (() => {
                if (!totalCount || totalCount <= 0) return null;
                const weekdayIndices = selectedWeekdayCodes
                  .map((code) => weekdayCodeToIndex(code))
                  .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx <= 6)
                  .sort((a, b) => a - b);
                if (weekdayIndices.length === 0) return null;
                const nextByWeekday = new Map();
                const result = new Map();
                weekdayIndices.forEach((weekdayIdx) => {
                  const firstDate = new Date(baselineStart);
                  const daysUntilWeekday = (weekdayIdx - baselineWeekday + 7) % 7;
                  firstDate.setDate(firstDate.getDate() + daysUntilWeekday);
                  nextByWeekday.set(weekdayIdx, firstDate);
                  result.set(weekdayIdx, 0);
                });
                let emitted = 0;
                while (emitted < totalCount) {
                  let chosenWeekday = null;
                  let chosenDate = null;
                  weekdayIndices.forEach((weekdayIdx) => {
                    const candidate = nextByWeekday.get(weekdayIdx);
                    if (!candidate) return;
                    if (
                      !chosenDate ||
                      candidate.getTime() < chosenDate.getTime() ||
                      (candidate.getTime() === chosenDate.getTime() && chosenWeekday != null && weekdayIdx < chosenWeekday)
                    ) {
                      chosenWeekday = weekdayIdx;
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

              for (const weekdayCode of weekdaysToAdd) {
                const weekdayIndex = weekdayCodeToIndex(weekdayCode);
                if (!Number.isInteger(weekdayIndex) || weekdayIndex < 0 || weekdayIndex > 6) continue;
                const daysUntilWeekday = (weekdayIndex - baselineWeekday + 7) % 7;
                const seriesStart = new Date(baselineStart);
                seriesStart.setDate(seriesStart.getDate() + daysUntilWeekday);
                const seriesEnd = new Date(seriesStart.getTime() + durationMs);
                const splitRule = {
                  ...recurrenceRuleObject,
                  byweekday: [weekdayCode],
                };
                if (countsByWeekday) {
                  const perDayCount = countsByWeekday.get(weekdayIndex) || 0;
                  if (perDayCount <= 0) continue;
                  splitRule.count = perDayCount;
                }
                const rpcParams = {
                  _family_id: scopedFamilyId,
                  _child_id: newChildIds.length > 0 ? newChildIds[0] : null,
                  _child_ids: newChildIds,
                  _title: cleanUpdates.title || event?.title || 'Untitled Event',
                  _start_ts: seriesStart.toISOString(),
                  _description: cleanUpdates.description ?? event?.description ?? null,
                  _end_ts: seriesEnd.toISOString(),
                  _status: cleanUpdates.status || normalizeStatus(event?.status || 'scheduled'),
                  _source: event?.source || 'manual',
                  _tags: cleanUpdates.tags ?? event?.tags ?? null,
                  _is_flexible: cleanUpdates.is_flexible === true,
                  _event_type: cleanUpdates.event_type ?? event?.event_type ?? null,
                  _subject_id: cleanUpdates.subject_id ?? event?.subject_id ?? null,
                  _unit: cleanUpdates.unit ?? event?.unit ?? null,
                  _grade: cleanUpdates.grade ?? event?.grade ?? null,
                  _percent_of_total_grade: cleanUpdates.percent_of_total_grade ?? event?.percent_of_total_grade ?? null,
                  _location: cleanUpdates.location ?? event?.location ?? null,
                  _mode: cleanUpdates.mode ?? event?.mode ?? null,
                  _instructor: cleanUpdates.instructor ?? event?.instructor ?? null,
                  _goal_link: cleanUpdates.goal_link ?? event?.goal_link ?? null,
                  _minutes: Math.max(1, Math.round(durationMs / 60000)),
                  _materials_attachment_ids: cleanUpdates.materials_attachment_ids ?? event?.materials_attachment_ids ?? null,
                  _recurrence_rule: JSON.stringify(splitRule),
                };
                const { data: createdData, error: createErr } = await supabase.rpc('create_task_event', rpcParams);
                if (createErr || !createdData?.ok || !createdData?.id) {
                  console.warn('[EventDetails] Failed to create added weekday series:', {
                    weekdayCode,
                    error: createErr || createdData,
                  });
                  continue;
                }
                const createdSeriesId = cleanPlannerEventId(String(createdData.id || ''));
                if (groupRecurrenceId && createdSeriesId) {
                  const { error: linkErr } = await supabase
                    .from('events')
                    .update({ recurrence_id: groupRecurrenceId })
                    .eq('family_id', scopedFamilyId)
                    .or(`id.eq.${createdSeriesId},parent_event_id.eq.${createdSeriesId},recurrence_id.eq.${createdSeriesId}`)
                    .is('deleted_at', null);
                  if (linkErr) {
                    console.warn('[EventDetails] Failed linking added weekday series to recurrence group:', {
                      groupRecurrenceId,
                      createdSeriesId,
                      error: linkErr,
                    });
                  }
                }
              }
            }
          }
        }
      }

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

      if (
        queueSendToStudentAfterSave
        && placement === 'calendar'
        && isParentView
        && isSchoolWorkEventType(eventType)
        && event?.id
        && familyId
        && assigneeIds.length > 0
        && hasInvitedAssignee
      ) {
        await sendWorkToStudents(sendToStudentNote.trim());
        setQueueSendToStudentAfterSave(false);
      }

      setEditing(false);
      setSchedulingBacklog(false);
      
      // Clear conflict warning on successful save
      setConflictWarning(null);
      setShouldAutoAdjust(false);
      setShouldAllowOverlaps(false);
      
      // Show toast for regular edits (not backlog moves, which already showed toast above)
      if (!isBacklog || !startDateObj) {
        if (isSeriesEditScope) {
          toast.push('Series updated', 'success');
          if (recurrenceRule) {
            const recurrenceRuleObject =
              typeof recurrenceRule === 'string'
                ? (() => {
                    try { return JSON.parse(recurrenceRule); } catch (_) { return null; }
                  })()
                : recurrenceRule;
            if (recurrenceRuleObject && typeof recurrenceRuleObject === 'object') {
              const cachedWeekdays = normalizeByWeekday(recurrenceRuleObject.byweekday);
              writeRecurrenceSeriesUiCache(event, {
                weekdays: cachedWeekdays,
                endType: recurrenceEndType,
                endAfter: recurrenceEndAfter,
                endDate: recurrenceEndDate,
              });
            }
          }
        } else {
          toast.push('Event updated', 'success');
        }
      }

      if (typeof window !== 'undefined') {
        // Drop any stale planner conflict snapshot so the next modal open
        // rebuilds conflict details from the newly saved event state.
        window.dispatchEvent(new CustomEvent('clearConflictBanner'));
      }
      
      // Close the modal after saving
      handleDismissEventModal();
      
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
      const isMultiDayEventType = MULTI_DAY_EVENT_TYPES.includes(
        normalizeEventTypeForDisplay(event?.event_type, event?.holiday_type || event?.holidayType)
      );
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
          <View style={styles.headerContent}>
            <View style={styles.headerTextWrap}>
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>EVENT DETAILS</Text>
              </View>
              {showPermissionViewOnlyPill ? (
                <View style={styles.headerViewOnlyChip}>
                  <Text style={styles.headerViewOnlyChipText}>VIEW ONLY</Text>
                </View>
              ) : null}
              <Text style={styles.headerTitleLarge}>
                {draftTitle || event?.title || 'Untitled Event'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleDismissEventModal}
              style={styles.headerCloseButton}
              accessibilityRole="button"
              accessibilityLabel="Close event details"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
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
                      {recurrenceEndType === 'never'
                        ? ' (never ends)'
                        : recurrenceEndType === 'after'
                          ? ` (ends after ${recurrenceEndAfter} occurrence${recurrenceEndAfter !== 1 ? 's' : ''})`
                          : recurrenceEndType === 'term_end'
                            ? (recurrenceSavedTermEnd ? ` (ends on ${fmt(recurrenceSavedTermEnd)})` : '')
                            : recurrenceEndDate
                              ? ` (ends on ${fmt(recurrenceEndDate)})`
                              : ''}
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
          {(subjectIds.length > 0 || unit || lesson || grade || event?.percent_of_total_grade) && (
            <SafeView style={[styles.academicSection, styles.academicSectionTopSpacing]}>
              <View
                style={{
                  paddingVertical: 4,
                }}
              >
                <Text style={styles.sectionLabel}>Academic Details</Text>
              </View>
              {subjectIds.length > 0 && (
                <SafeFieldRow style={[styles.fieldRow, styles.fieldRowFull]}>
                  <View style={[styles.field, styles.fieldStretch]}>
                    <Text style={[styles.fieldLabel, { fontWeight: '700' }]}>
                      {subjectIds.length > 1 ? 'Subjects' : 'Subject'}
                    </Text>
                    {loadingSubjects && resolvedSubjectLabels.length === 0 ? (
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

          </SafeView>
        </ScrollView>

        {/* Footer: Cancel + Delete + Edit grouped on right */}
        <SafeView style={styles.footer}>
          <View style={styles.footerActionGroup}>
            <TouchableOpacity
              onPress={handleDismissEventModal}
              style={styles.cancelButtonFilled}
              activeOpacity={0.9}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.cancelButtonFilledText}>Cancel</Text>
            </TouchableOpacity>
            {!readOnly && (
            <>
            {event?.id && (
              <TouchableOpacity
                {...(Platform.OS === 'web' && { type: 'button' })}
                onPress={() => handleDelete()}
                disabled={deleting}
                style={[
                  styles.deleteEventButton,
                  deleting && styles.deleteEventButtonDisabled,
                ]}
              >
                <Trash2 size={17} color="#DC2626" />
                <Text style={[styles.deleteEventButtonText, deleting && { opacity: 0.8 }]}>
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
            </>
            )}
          </View>
        </SafeView>
      </SafeView>
    );
  };

  const renderEditForm = () => {
    return (
    <SafeView style={{ flex: 1, backgroundColor: '#ffffff' }}>
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
      <View pointerEvents={readOnly ? 'none' : 'auto'}>
      {/* Header */}
      <View style={styles.headerEditEvent}>
        <View style={styles.headerContent}>
          <View style={styles.headerTextWrap}>
            <View style={styles.headerBadgeRow}>
              <View style={[styles.headerBadge, styles.headerBadgeTight]}>
                <Text style={styles.headerBadgeText}>{isSeriesEditScope ? 'EDIT SERIES' : 'EDIT EVENT'}</Text>
              </View>
              {!shouldHideAttendanceChip && (
                <View style={styles.headerStatusChip}>
                  <View style={[styles.headerStatusDot, headerAttendanceChip.dotStyle]} />
                  <Text style={styles.headerStatusChipText}>{headerAttendanceChip.label}</Text>
                </View>
              )}
            </View>
            <Text style={styles.headerTitleLarge}>
              {isSeriesEditScope ? 'Edit series' : (hasPersistedEventId ? 'Edit event' : 'New event')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleDismissEventModal}
            style={styles.headerCloseButton}
            accessibilityRole="button"
            accessibilityLabel="Close edit event"
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <X size={18} color="#64748B" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.headerDivider} />
      <SafeFieldRow style={[styles.fieldRow, styles.fieldRowFull, { marginTop: 12, marginBottom: 8 }]}>
        <View style={[styles.field, styles.fieldStretch]}>
          <Text style={styles.fieldLabel}>
            Name <Text style={{ color: '#ef4444' }}>*</Text>
          </Text>
          <TextInput
            placeholder="Name"
            placeholderTextColor={MUTED}
            value={draftTitle}
            onChangeText={(text) => {
              setDraftTitle(text);
              if (validationErrors.title) {
                setValidationErrors({ ...validationErrors, title: null });
              }
            }}
            style={[
              styles.titleInputHero,
              styles.inputFullWidth,
              validationErrors.title && styles.inputError,
            ]}
            autoFocus
          />
          {validationErrors.title && (
            <Text style={styles.errorText}>{validationErrors.title}</Text>
          )}
        </View>
      </SafeFieldRow>
      {validationBanner ? (
        <View style={styles.validationBannerContainer}>
          <Text style={styles.validationBannerText}>{validationBanner}</Text>
        </View>
      ) : null}

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
            <ChipRow style={styles.dropdownRow}>{EVENT_TYPES.map((type) => {
              const isSelected = eventType === type;
              return (
              <TouchableOpacity
                key={type}
                onPress={() => {
                  setEventType(type);
                  if (validationErrors.eventType) {
                    setValidationErrors({ ...validationErrors, eventType: null });
                  }
                }}
                style={[
                  styles.dropdownOption,
                  isSelected && styles.dropdownOptionActive,
                  isSelected && getEventTypeActiveChipStyle(type),
                ]}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    isSelected && styles.dropdownOptionTextActive,
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            );})}</ChipRow>
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
            <Text style={styles.errorTextSmall}>{validationErrors.assignee}</Text>
          ) : null}
        </View>
      </SafeFieldRow>

      <SafeView>
        {placement === 'calendar' && (
          <View style={[styles.scheduleFieldsWrap, validationErrors.time && styles.scheduleFieldsWrapError]}>
            <View style={[styles.dateTimeInlineRow, Platform.OS === 'web' && styles.dateTimeInlineRowWeb]}>
              <View style={[styles.timeField, styles.dateFieldInline]}>
                <Text style={styles.timeLabel}>
                  {isSeriesEditScope ? 'Series start date' : 'Date'} <Text style={{ color: '#ef4444' }}>*</Text>
                </Text>
                <View style={[styles.chip, validationErrors.date && styles.chipFieldError, { alignSelf: 'flex-start', marginRight: 0, backgroundColor: '#ffffff' }]}>
                  <TouchableOpacity
                    onPress={() => {
                      setDueDate(addDays(dueDate, -1));
                      if (validationErrors.date) {
                        setValidationErrors((prev) => ({ ...prev, date: null }));
                      }
                    }}
                  >
                    <ChevronLeft size={16} color={FG} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setCalendarViewMonth(dueDate);
                      setShowCalendarPicker(true);
                      if (validationErrors.date) {
                        setValidationErrors((prev) => ({ ...prev, date: null }));
                      }
                    }}
                    style={{ flex: 1, paddingHorizontal: 8 }}
                  >
                    <Text style={styles.chipText}>{fmt(dueDate)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setDueDate(addDays(dueDate, +1));
                      if (validationErrors.date) {
                        setValidationErrors((prev) => ({ ...prev, date: null }));
                      }
                    }}
                  >
                    <ChevronRight size={16} color={FG} />
                  </TouchableOpacity>
                </View>
                {validationErrors.date ? <Text style={styles.errorTextSmall}>{validationErrors.date}</Text> : null}
              </View>
              {showBreakEndDateField ? (
                <View style={[styles.timeField, styles.dateFieldInline]}>
                  <Text style={styles.timeLabel}>End date</Text>
                  <View style={[styles.chip, validationErrors.endDate && styles.chipFieldError, { alignSelf: 'flex-start', marginRight: 0, backgroundColor: '#ffffff' }]}>
                    <TouchableOpacity
                      onPress={() => {
                        const next = new Date(eventEndDate || dueDate || new Date());
                        next.setDate(next.getDate() - 1);
                        setEventEndDate(next);
                        if (validationErrors.endDate) {
                          setValidationErrors((prev) => ({ ...prev, endDate: null }));
                        }
                      }}
                    >
                      <ChevronLeft size={16} color={FG} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        if (validationErrors.endDate) {
                          setValidationErrors((prev) => ({ ...prev, endDate: null }));
                        }
                        setEventEndDateCalendarViewMonth(eventEndDate || dueDate || new Date());
                        setShowEventEndDatePicker(true);
                      }}
                      style={{ flex: 1, paddingHorizontal: 8 }}
                    >
                      <Text style={[styles.chipText, !eventEndDate && { color: MUTED }]}>
                        {eventEndDate ? fmt(eventEndDate) : 'Optional'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const next = new Date(eventEndDate || dueDate || new Date());
                        next.setDate(next.getDate() + 1);
                        setEventEndDate(next);
                        if (validationErrors.endDate) {
                          setValidationErrors((prev) => ({ ...prev, endDate: null }));
                        }
                      }}
                    >
                      <ChevronRight size={16} color={FG} />
                    </TouchableOpacity>
                  </View>
                  {validationErrors.endDate ? <Text style={styles.errorTextSmall}>{validationErrors.endDate}</Text> : null}
                </View>
              ) : null}
              {!hideScheduleTimeControls && (
              <View style={[styles.timeInputsRow, Platform.OS === 'web' && styles.timeInputsRowInline]}>
                <View style={[styles.timeField, styles.timeFieldCompact]}>
                  <Text style={styles.timeLabel}>Start</Text>
                  {Platform.OS === 'web' ? (
                    <View style={styles.selectContainer}>
                      <TouchableOpacity
                        ref={startTimeButtonRef}
                        style={[
                          styles.select,
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
                      >
                        <Text style={[styles.selectText, !startTime && styles.selectPlaceholder]}>
                          {startTime || 'Optional'}
                        </Text>
                        <ChevronDown size={16} color={MUTED} />
                      </TouchableOpacity>
                      {showStartTimeDropdown && (() => {
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
                                width: startTimeDropdownPosition.width || 150,
                                marginTop: 0,
                                zIndex: 99999,
                              },
                            ]}
                          >
                            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>
                              <TouchableOpacity
                                style={[styles.selectOption, !startTime && styles.selectOptionActive]}
                                onPress={() => {
                                  setStartTime('');
                                  setDraftStartTime('');
                                  setShowStartTimeDropdown(false);
                                  if (validationErrors.time) {
                                    setValidationErrors((prev) => ({ ...prev, time: null }));
                                  }
                                }}
                              >
                                <Text style={[styles.selectOptionText, !startTime && styles.selectOptionTextActive]}>Optional</Text>
                              </TouchableOpacity>
                              {TIME_SELECT_OPTIONS.map((timeOption) => (
                                <TouchableOpacity
                                  key={`start-${timeOption}`}
                                  style={[styles.selectOption, startTime === timeOption && styles.selectOptionActive]}
                                  onPress={() => {
                                    setStartTime(timeOption);
                                    setDraftStartTime(timeOption);
                                    setShowStartTimeDropdown(false);
                                    if (validationErrors.time) {
                                      setValidationErrors((prev) => ({ ...prev, time: null }));
                                    }
                                  }}
                                >
                                  <Text style={[styles.selectOptionText, startTime === timeOption && styles.selectOptionTextActive]}>
                                    {timeOption}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        );
                        if (ReactDOM?.createPortal && typeof document !== 'undefined' && document.body) {
                          return ReactDOM.createPortal(dropdownContent, document.body);
                        }
                        return dropdownContent;
                      })()}
                    </View>
                  ) : (
                    <TextInput
                      placeholder="Optional"
                      placeholderTextColor={MUTED}
                      value={startTime}
                      onFocus={() => {
                        if (!startTime) {
                          setStartTime('__:__ __');
                          setDraftStartTime('__:__ __');
                        }
                      }}
                      onBlur={() => {
                        setStartTime((prev) => (prev === '__:__ __' ? '' : prev));
                        setDraftStartTime((prev) => (prev === '__:__ __' ? '' : prev));
                      }}
                      onChangeText={(text) => {
                        const formatted = formatTimeInput(text, startTime);
                        setStartTime(formatted);
                        setDraftStartTime(formatted);
                        if (validationErrors.time) {
                          setValidationErrors({ ...validationErrors, time: null });
                        }
                      }}
                      style={[
                        styles.timeInputEdit,
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
                    <View style={styles.selectContainer}>
                      <TouchableOpacity
                        ref={endTimeButtonRef}
                        style={[
                          styles.select,
                          styles.timeSelectButton,
                          allDay && styles.timeInputDisabled,
                        ]}
                        onPress={() => {
                          if (allDay) return;
                          setShowEndTimeDropdown((prev) => !prev);
                          setShowStartTimeDropdown(false);
                        }}
                        disabled={allDay}
                      >
                        <Text style={[styles.selectText, !endTime && styles.selectPlaceholder]}>
                          {endTime || 'Optional'}
                        </Text>
                        <ChevronDown size={16} color={MUTED} />
                      </TouchableOpacity>
                      {showEndTimeDropdown && (() => {
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
                                width: endTimeDropdownPosition.width || 150,
                                marginTop: 0,
                                zIndex: 99999,
                              },
                            ]}
                          >
                            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>
                              <TouchableOpacity
                                style={[styles.selectOption, !endTime && styles.selectOptionActive]}
                                onPress={() => {
                                  setEndTime('');
                                  setDraftEndTime('');
                                  setShowEndTimeDropdown(false);
                                }}
                              >
                                <Text style={[styles.selectOptionText, !endTime && styles.selectOptionTextActive]}>Optional</Text>
                              </TouchableOpacity>
                              {TIME_SELECT_OPTIONS.map((timeOption) => (
                                <TouchableOpacity
                                  key={`end-${timeOption}`}
                                  style={[styles.selectOption, endTime === timeOption && styles.selectOptionActive]}
                                  onPress={() => {
                                    setEndTime(timeOption);
                                    setDraftEndTime(timeOption);
                                    setShowEndTimeDropdown(false);
                                  }}
                                >
                                  <Text style={[styles.selectOptionText, endTime === timeOption && styles.selectOptionTextActive]}>
                                    {timeOption}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        );
                        if (ReactDOM?.createPortal && typeof document !== 'undefined' && document.body) {
                          return ReactDOM.createPortal(dropdownContent, document.body);
                        }
                        return dropdownContent;
                      })()}
                    </View>
                  ) : (
                    <TextInput
                      placeholder="Optional"
                      placeholderTextColor={MUTED}
                      value={endTime}
                      onFocus={() => {
                        if (!endTime) {
                          setEndTime('__:__ __');
                          setDraftEndTime('__:__ __');
                        }
                      }}
                      onBlur={() => {
                        setEndTime((prev) => (prev === '__:__ __' ? '' : prev));
                        setDraftEndTime((prev) => (prev === '__:__ __' ? '' : prev));
                      }}
                      onChangeText={(text) => {
                        const formatted = formatTimeInput(text, endTime);
                        setEndTime(formatted);
                        setDraftEndTime(formatted);
                      }}
                      style={[styles.timeInputEdit, allDay && styles.timeInputDisabled]}
                      editable={!allDay}
                      autoCapitalize="characters"
                    />
                  )}
                </View>
                <View style={[styles.inlineSwitchField, styles.inlineSwitchFieldStack]}>
                  <Text style={[styles.timeLabel, styles.inlineSwitchLabel]}>Repeat</Text>
                  <View style={styles.inlineSwitchControlWrap}>
                    {isSingleSeriesOccurrenceEdit ? (
                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: '#DBEAFE',
                          backgroundColor: '#EFF6FF',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '700',
                            color: '#1E40AF',
                            ...(Platform.OS === 'web' && {
                              fontFamily: '"League Spartan", "Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                            }),
                          }}
                        >
                          Series-managed
                        </Text>
                      </View>
                    ) : (
                      <Switch
                        value={isRecurring}
                        onValueChange={(value) => {
                          setIsRecurring(value);
                          if (value) {
                            if (recurrenceType === 'weekly' && (!Array.isArray(recurrenceWeekdays) || recurrenceWeekdays.length === 0)) {
                              if (isClassDayEventType) {
                                setRecurrenceWeekdays(CLASS_DAY_DEFAULT_WEEKDAYS);
                              } else {
                                const fallback = resolveWeekdayCodeFromEventOrDueDate(event, dueDate);
                                setRecurrenceWeekdays([fallback]);
                              }
                            }
                          } else if (validationErrors.recurrenceEnd) {
                            setValidationErrors((prev) => ({ ...prev, recurrenceEnd: null }));
                          }
                        }}
                        trackColor={{ false: BORDER, true: '#AECBFA' }}
                        thumbColor={isRecurring ? '#45A29E' : '#f9fafb'}
                      />
                    )}
                  </View>
                </View>
              </View>
              )}
            </View>
            {!hideScheduleTimeControls && isRecurring && !isSingleSeriesOccurrenceEdit && (
              <View style={styles.recurringSectionContent}>
                <View style={[styles.repeatGrid, useCompactRepeatGrid && styles.repeatGridCompact]}>
                  <View style={[styles.repeatGroup, styles.repeatGroupPattern]}>
                    <Text style={styles.recurrenceGroupLabel}>Repeat pattern</Text>
                    <ChipRow style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' }}>
                      {['daily', 'weekly', 'monthly'].map((type) => (
                        <TouchableOpacity
                          key={type}
                          onPress={() => {
                            setRecurrenceType(type);
                            if (type === 'weekly' && (!Array.isArray(recurrenceWeekdays) || recurrenceWeekdays.length === 0)) {
                              if (isClassDayEventType) {
                                setRecurrenceWeekdays(CLASS_DAY_DEFAULT_WEEKDAYS);
                              } else {
                                const fallback = resolveWeekdayCodeFromEventOrDueDate(event, dueDate);
                                setRecurrenceWeekdays([fallback]);
                              }
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
                          {RECURRENCE_WEEKDAY_OPTIONS.map((day) => {
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
                            if (
                              endType === 'on' &&
                              isSeriesEditScope &&
                              !recurrenceEndDate &&
                              dueDate instanceof Date &&
                              !Number.isNaN(dueDate.getTime())
                            ) {
                              setRecurrenceEndDate(new Date(dueDate));
                            }
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
                          <Text style={{ color: recurrenceSavedTermEnd ? FG : MUTED, fontSize: 12 }}>
                            {recurrenceSavedTermEnd ? fmt(recurrenceSavedTermEnd) : 'No term end set'}
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
        {/* Academic details section */}
        {!hideLearningDetailsSection && (
        <ModalSectionCard
          Icon={GraduationCap}
          title={academicSectionTitle}
          subtitle="Scheduling and grading context"
          expanded={showAcademicDetails}
          onPress={() => setShowAcademicDetails(!showAcademicDetails)}
          accent="#9ECFFB"
        >
          {/* Subject + Unit + Grade + % row */}
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
              <TouchableOpacity
                                key={subj.id}
                onPress={() => {
                                  const nextIds = subjectIds.includes(subj.id)
                                    ? subjectIds.filter((id) => id !== subj.id)
                                    : [...subjectIds, subj.id];
                                  applySubjectSelection(nextIds);
                                }}
                                style={[styles.selectOption, subjectIds.includes(subj.id) && styles.selectOptionActive]}
                              >
                                <Text style={[styles.selectOptionText, subjectIds.includes(subj.id) && styles.selectOptionTextActive]}>
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
                      <TouchableOpacity
                        key={subj.id}
                        onPress={() => {
                          const nextIds = subjectIds.includes(subj.id)
                            ? subjectIds.filter((id) => id !== subj.id)
                            : [...subjectIds, subj.id];
                          applySubjectSelection(nextIds);
                        }}
                        style={[styles.selectOption, subjectIds.includes(subj.id) && styles.selectOptionActive]}
                      >
                        <Text style={[styles.selectOptionText, subjectIds.includes(subj.id) && styles.selectOptionTextActive]}>
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
            <View style={[styles.field, styles.academicFieldUnit]}>
              <Text style={[styles.fieldLabel, styles.learningRowLabel]}>Lesson</Text>
              <View style={[styles.selectContainer, styles.academicSelectContainer]}>
                <TouchableOpacity
                  ref={lessonButtonRef}
                  style={[styles.select, styles.academicSelect, (!subjectIds?.[0] || loadingLessonOptions) && { opacity: 0.6 }]}
                  onPress={() => {
                    if (subjectIds?.[0] && !loadingLessonOptions) setShowLessonDropdown((prev) => !prev);
                  }}
                  disabled={!subjectIds?.[0] || loadingLessonOptions}
                >
                  <Text
                    style={[
                      styles.selectText,
                      (!lesson || !String(lesson).trim()) && styles.selectPlaceholder,
                    ]}
                  >
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
                          <Text style={[styles.selectOptionText, !lesson && styles.selectOptionTextActive]}>None</Text>
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
                      <Text style={[styles.selectOptionText, !lesson && styles.selectOptionTextActive]}>None</Text>
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
          {placement === 'calendar' && isParentView && isSchoolWorkEventType(eventType) ? (
            <View style={styles.learningDetailsSendSection}>
              <Text style={[styles.fieldLabel, styles.sendSectionTitle]}>Send to student</Text>
              {!parentLinkedReady ? (
                <Text style={styles.fieldHelpText}>Loading...</Text>
              ) : sendTrackingSummary.totalCount === 0 ? (
                null
              ) : (
                <View style={styles.workflowActivityWrap}>
                  {queueSendToStudentAfterSave ? (
                    <TextInput
                      placeholder="Optional note for student"
                      placeholderTextColor={MUTED}
                      value={sendToStudentNote}
                      onChangeText={setSendToStudentNote}
                      style={[styles.input, styles.notesInput, { minHeight: 72, marginTop: 8, marginBottom: 8 }]}
                      multiline
                      textAlignVertical="top"
                      editable={!saving}
                    />
                  ) : null}
                  {Array.isArray(sendTrackingSummary.historyLines) && sendTrackingSummary.historyLines.length > 0 ? (
                    <View style={styles.workflowHistoryList}>
                      {sendTrackingSummary.historyLines.map((line, index) => (
                        <Text key={`send-history-line-${index}`} style={styles.workflowSentLine}>
                          {line}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              )}
              <View style={styles.workflowHeaderRow}>
                <TouchableOpacity
                  onPress={() => {
                    const hasBaseRequirements = Boolean(event?.id && familyId && assigneeIds.length > 0);
                    setShowSendInviteClarification(true);
                    if (!hasBaseRequirements) return;
                    if (!hasInvitedAssignee && sendBlockedAssigneeIds.length > 0) {
                      if (sendPendingAssigneeIds.length > 0 && sendNeedsInviteAssigneeIds.length === 0) {
                        // Invite already sent; waiting on acceptance before send can be enabled.
                        return;
                      }
                      openInviteChildModalForSend();
                      return;
                    }
                    setQueueSendToStudentAfterSave((prev) => !prev);
                  }}
                  style={[
                    styles.workflowActionButton,
                    queueSendToStudentAfterSave && styles.workflowActionButtonActive,
                    (!event?.id || !familyId || assigneeIds.length === 0) && styles.workflowActionButtonDisabled,
                  ]}
                  {...(Platform.OS === 'web' && { cursor: (!event?.id || !familyId || assigneeIds.length === 0) ? 'default' : 'pointer' })}
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
                      {sendEntryCtaLabel}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
              {((!hasInvitedAssignee && sendBlockedAssigneeIds.length > 0) || showSendInviteClarification) && sendInviteClarificationText ? (
                <Text style={[styles.fieldHelpText, { marginTop: 8 }]}>
                  {sendInviteClarificationText}
                </Text>
              ) : null}
            </View>
          ) : null}
        </ModalSectionCard>
        )}

        {/* Notes and attachments section */}
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
              <Text style={styles.fieldLabel}>Attachments</Text>
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
                  <Plus size={14} color="#5B6880" />
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
      </View>

      </ScrollView>

      <View style={styles.footerDivider} />
      {/* Footer with Cancel, Delete Event (when editing), and Save */}
      <View style={styles.footerEditEvent}>
        <View style={styles.footerEditEventRight}>
          <TouchableOpacity
            {...(Platform.OS === 'web' && { type: 'button' })}
            onPress={() => {
              handleDismissEventModal();
            }}
            style={styles.cancelButtonFilled}
            activeOpacity={0.9}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.cancelButtonFilledText}>Cancel</Text>
          </TouchableOpacity>
          {event?.id && !readOnly && (
            <TouchableOpacity
              {...(Platform.OS === 'web' && { type: 'button' })}
              onPress={() => handleDelete()}
              disabled={deleting}
              style={[
                styles.deleteEventButton,
                deleting && styles.deleteEventButtonDisabled,
              ]}
            >
              <Trash2 size={17} color="#DC2626" />
              <Text style={[styles.deleteEventButtonText, deleting && { opacity: 0.8 }]}>
                {deleting ? 'Deleting…' : 'Delete Event'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
          onPress={() => {
            if (saving || readOnly) return;
            if (!validateFields({ showBanner: true })) return;
            handleSave();
          }}
          disabled={saving || readOnly}
          style={[
            styles.createButton,
            (saving || readOnly) && styles.createButtonDisabled,
          ]}
        >
          <Check size={16} color="#FFF" />
          <Text style={[
            styles.createButtonText,
            (saving || readOnly) && styles.createButtonTextDisabled,
          ]}>
            {saving ? 'Saving…' : (readOnly ? 'View only' : 'Save changes')}
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

  const resolveSuggestedConflictBounds = useCallback((suggestion) => {
    if (!suggestion) return null;
    const rawStart = suggestion.newStart || suggestion.new_start || suggestion.start || null;
    const rawEnd = suggestion.newEnd || suggestion.new_end || suggestion.end || null;
    if (!rawStart || !rawEnd) return null;
    const nextStart = rawStart instanceof Date ? rawStart : new Date(rawStart);
    const nextEnd = rawEnd instanceof Date ? rawEnd : new Date(rawEnd);
    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) return null;
    return { nextStart, nextEnd };
  }, []);

  const applySuggestedConflictChange = useCallback((suggestion) => {
    const bounds = resolveSuggestedConflictBounds(suggestion);
    if (!bounds) return false;
    const { nextStart, nextEnd } = bounds;
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
  }, [onOpenConflictResolutionConsumed, resolveSuggestedConflictBounds]);

  const persistSuggestedConflictChange = useCallback(async (suggestion) => {
    if (!event?.id) return false;
    const bounds = resolveSuggestedConflictBounds(suggestion);
    if (!bounds) return false;
    const { nextStart, nextEnd } = bounds;

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
  }, [applySuggestedConflictChange, event?.id, event?.start_ts, onEventPatched, onEventUpdated, resolveSuggestedConflictBounds]);

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
            <Text
              style={[
                {
                  fontSize: 18,
                  fontWeight: '700',
                  color: '#111827',
                  ...(Platform.OS === 'web' && {
                    fontFamily: '"League Spartan", "Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }),
                },
              ]}
            >
              {isPlanYearBlockSeries(event) ? 'Delete past lessons?' : 'Delete recurring event?'}
            </Text>
            <Text style={{ marginTop: 12, fontSize: 14, color: '#6b7280', lineHeight: 20 }}>
              {isPlanYearBlockSeries(event)
                ? 'This lesson is part of your year plan schedule. Delete only this day, or remove every matching lesson from the calendar for this plan block.'
                : 'This event is part of a series. Delete only this occurrence, or remove every occurrence in the series.'}
            </Text>
            <View style={{ marginTop: 22, gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  {...(Platform.OS === 'web' && { type: 'button' })}
                  onPress={async () => {
                    setShowRecurringDeleteModal(false);
                    await performDeleteSingleOccurrence();
                  }}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    backgroundColor: '#F8FAFC',
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...(Platform.OS === 'web' && { cursor: deleting ? 'not-allowed' : 'pointer' }),
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Trash2 size={15} color="#64748B" />
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '600',
                        color: '#334155',
                        ...(Platform.OS === 'web' && {
                          fontFamily: '"League Spartan", "Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        }),
                      }}
                    >
                      Delete this day
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  {...(Platform.OS === 'web' && { type: 'button' })}
                  onPress={async () => {
                    setShowRecurringDeleteModal(false);
                    await performDeleteEntireSeries();
                  }}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#FECACA',
                    backgroundColor: '#FEF2F2',
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...(Platform.OS === 'web' && { cursor: deleting ? 'not-allowed' : 'pointer' }),
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Trash2 size={15} color="#DC2626" />
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '600',
                        color: '#DC2626',
                        ...(Platform.OS === 'web' && {
                          fontFamily: '"League Spartan", "Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        }),
                      }}
                    >
                      Delete all in series
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                {...(Platform.OS === 'web' && { type: 'button' })}
                onPress={() => !deleting && setShowRecurringDeleteModal(false)}
                disabled={deleting}
                style={{ paddingVertical: 8, alignItems: 'center', ...(Platform.OS === 'web' && { cursor: 'pointer' }) }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '500',
                    color: '#64748B',
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"League Spartan", "Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      ) : null}
      <ConfirmDialog
        visible={showDeleteConfirm}
        title="Delete event?"
        message="Are you sure you want to delete this event?"
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        cancelLabel="Cancel"
        destructive
        onCancel={() => {
          if (!deleting) setShowDeleteConfirm(false);
        }}
        onConfirm={async () => {
          if (deleting) return;
          setShowDeleteConfirm(false);
          await performDeleteSingleOccurrence();
        }}
      />
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
                  applySubjectSelection([newSubject.id]);
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
                  window.dispatchEvent(new CustomEvent('parentAssignmentsNeedRefresh'));
                  window.dispatchEvent(new CustomEvent('refreshRightRail'));
                  window.dispatchEvent(new CustomEvent('refreshCalendar'));
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

          {showSubmitForReviewModal ? (
            <SubmitForReviewModal
              visible
              onClose={() => {
                setShowSubmitForReviewModal(false);
                setSubmitModalAssignment(null);
              }}
              onSubmitted={() => {
                toast.push('Submitted for review', 'success');
                loadEventLinkedHelpAssignment();
                loadEventLinkedParentAssignments();
                setSubmitModalAssignment(null);
                onEventUpdated?.();
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('childAssignmentsNeedRefresh'));
                  window.dispatchEvent(new CustomEvent('parentAssignmentsNeedRefresh'));
                  window.dispatchEvent(new CustomEvent('refreshRightRail'));
                  window.dispatchEvent(new CustomEvent('refreshCalendar'));
                }
              }}
              familyId={familyId}
              childId={event?.child_id || (assigneeIds.length > 0 ? assigneeIds[0] : null) || session?.child_id}
              assignment={submitModalAssignment}
              eventContext={
                event?.id
                  ? {
                      id: event.id,
                      title: event.title || draftTitle,
                      start_ts: event.start_ts,
                      end_ts: event.end_ts,
                      subject_id: event.subject_id || subjectId || null,
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
            onRequestClose={closeSendToStudentModal}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                justifyContent: 'center',
                alignItems: 'center',
                padding: 16,
              }}
            >
              <TouchableOpacity
                onPress={closeSendToStudentModal}
                activeOpacity={1}
                style={StyleSheet.absoluteFillObject}
                accessibilityRole="button"
                accessibilityLabel="Close"
                {...(Platform.OS === 'web' && { cursor: 'default' })}
              />
              <View
                pointerEvents="box-none"
                style={{
                  backgroundColor: '#FFFFFF',
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
                  onPress={closeSendToStudentModal}
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
                    {sendInviteClarificationText
                      ? sendInviteClarificationText
                      : (
                        sendTrackingSummary.hasShared
                          ? (sendTrackingSummary.latestStatusLine || 'Last sent recently.')
                          : `This will notify ${sendToStudentTargetLabel} that the assignment needs their attention.`
                      )}
                  </Text>
                  {Array.isArray(sendTrackingSummary.historyLines) && sendTrackingSummary.historyLines.length > 0 ? (
                    <View style={[styles.workflowHistoryList, { marginTop: 0, marginBottom: 12 }]}>
                      {sendTrackingSummary.historyLines.map((line, index) => (
                        <Text key={`send-modal-history-line-${index}`} style={styles.workflowSentLine}>
                          {line}
                        </Text>
                      ))}
                    </View>
                  ) : null}
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
                    Note
                  </Text>
                  <TextInput
                    value={sendToStudentNote}
                    onChangeText={(value) => {
                      setSendToStudentNote(value);
                      if (sendToStudentInlineError) setSendToStudentInlineError('');
                    }}
                    onKeyPress={(e) => {
                      e?.stopPropagation?.();
                    }}
                    onKeyDown={(e) => {
                      e?.stopPropagation?.();
                    }}
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
                      backgroundColor: '#FFFFFF',
                      ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
                    }}
                  />
                  {sendToStudentInlineError ? (
                    <Text style={[styles.errorTextSmall, { marginTop: 8 }]}>
                      {sendToStudentInlineError}
                    </Text>
                  ) : null}

                  <View style={{ marginTop: 24 }}>
                    <TouchableOpacity
                      onPress={() => sendWorkToStudents(sendToStudentNote.trim())}
                      disabled={sendToStudentSubmitting}
                      style={[
                        styles.workflowActionButton,
                        sendToStudentSubmitting && styles.workflowActionButtonDisabled,
                        { alignSelf: 'center' },
                      ]}
                      {...(Platform.OS === 'web' && { cursor: sendToStudentSubmitting ? 'not-allowed' : 'pointer' })}
                    >
                      <View style={styles.workflowActionButtonRow}>
                        <View style={styles.workflowActionIconWrap}>
                          <Send size={12} color="#5B6880" />
                        </View>
                        <Text style={styles.workflowActionButtonText}>
                          {sendToStudentSubmitting ? 'Sending…' : (sendTrackingSummary.ctaLabel || 'Send to student')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
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
    color: SUB,
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '500',
    textAlign: 'left',
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
    backgroundColor: '#F0F8FF',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerEditEvent: {
    marginHorizontal: -20,
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 14,
    justifyContent: 'center',
    backgroundColor: '#F0F8FF',
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
    color: '#85C4F2',
  },
  headerViewOnlyChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginBottom: 8,
  },
  headerViewOnlyChipText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#4F46E5',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", "Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  headerBadgeTight: {
    marginBottom: 0,
  },
  headerStatusChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFFC9',
  },
  headerStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerStatusDotAttended: {
    backgroundColor: '#6BB3E8',
  },
  headerStatusDotUnattended: {
    backgroundColor: '#F2A0A0',
  },
  headerStatusDotUpcoming: {
    backgroundColor: '#C7DDF6',
  },
  headerStatusChipText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: '#85C4F2',
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
  headerCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
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
    marginHorizontal: -20,
    marginTop: 0,
  },
  validationBannerContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 24,
    marginTop: 12,
    marginBottom: 4,
  },
  validationBannerText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    maxHeight: Platform.OS === 'web' ? 'min(60vh, calc(100vh - 300px))' : undefined,
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
  learningRowLabel: {
    marginBottom: 6,
    minHeight: 16,
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
  academicSelectContainer: {
    width: '100%',
  },
  academicSelect: {
    minHeight: 40,
    height: 40,
    borderRadius: 12,
    paddingVertical: 8,
  },
  academicInputCompact: {
    minHeight: 40,
    height: 40,
    borderRadius: 12,
    width: 96,
    maxWidth: 96,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    marginBottom: 0,
    paddingVertical: 8,
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
  helpBubble: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  workflowHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: FG,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  workflowHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 10,
    marginBottom: 4,
  },
  workflowActionButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D6DCE8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  workflowActionButtonActive: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  workflowActionButtonDisabled: {
    opacity: 0.5,
  },
  workflowActionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 14,
    color: '#5B6880',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", "Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  workflowActionButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
  workflowContextText: {
    fontSize: 12,
    color: MUTED,
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  workflowDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 10,
  },
  workflowEmptyWrap: {
    marginBottom: 8,
  },
  workflowActivityWrap: {
    marginTop: 0,
    marginBottom: 2,
  },
  learningDetailsSendSection: {
    marginTop: 8,
    paddingTop: 0,
  },
  sendSectionTitle: {
    marginBottom: 2,
    minHeight: 0,
  },
  workflowHistoryList: {
    marginTop: 2,
    gap: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  workflowSentLine: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  workflowTimelineList: {
    marginTop: 4,
    gap: 8,
  },
  workflowTimelineItem: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  workflowTimelineTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  workflowTimelineWhen: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  workflowTimelineMessage: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  studentRowsWrap: {
    marginBottom: 2,
    gap: 4,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderRadius: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  studentIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  studentAvatar: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
  },
  studentRowName: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  studentRowMeta: {
    marginTop: 1,
    fontSize: 12,
    color: MUTED,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  studentTrailLine: {
    marginTop: 1,
    fontSize: 11,
    color: '#9CA3AF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
  },
  statusPillSENT: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  statusPillNOTVIEWED: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
  },
  statusPillNOTYETSHARED: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  statusPillINPROGRESS: {
    backgroundColor: '#F0FDFA',
    borderColor: '#CCFBF1',
  },
  statusPillRETURNED: {
    backgroundColor: '#ECFDF5',
    borderColor: '#BBF7D0',
  },
  statusPillCOMPLETED: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  statusPillNEEDSREVIEW: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: FG,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  studentMetaRow: {
    marginTop: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  studentRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activityList: {
    gap: 4,
    marginBottom: 10,
  },
  activityItem: {
    fontSize: 12,
    color: SUB,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timelineWrap: {
    marginTop: 6,
    gap: 8,
  },
  timelineItem: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  timelineItemParent: {
    backgroundColor: '#EEF6FF',
    borderColor: '#BFDBFE',
  },
  timelineItemStudent: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  timelineItemSystem: {
    backgroundColor: '#F8FAFC',
    borderColor: BORDER,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  timelineRole: {
    fontSize: 12,
    fontWeight: '700',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timelineDate: {
    fontSize: 11,
    color: MUTED,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timelineBody: {
    fontSize: 13,
    lineHeight: 18,
    color: FG,
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
  scheduleFieldsWrap: {
    marginBottom: 8,
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
  topScheduleDateChip: {
    minHeight: 40,
    height: 40,
    marginBottom: 0,
    paddingHorizontal: 10,
    gap: 6,
  },
  topScheduleLabel: {
    minHeight: 16,
    marginBottom: 6,
  },
  toggleField: {
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
  },
  toggleControlWrap: {
    minHeight: 40,
    justifyContent: 'center',
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
    marginBottom: 2,
    gap: 10,
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
  timeInputsRowInline: {
    flex: 1,
    minWidth: 220,
  },
  timeField: {
    flex: 1,
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
  timeInputEdit: {
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
  timeSelectButton: {
    minHeight: 40,
    height: 40,
    borderRadius: 14,
    paddingVertical: 10,
    width: '100%',
    maxWidth: 100,
  },
  timeSelectOptions: {
    borderRadius: 14,
    maxHeight: 220,
    zIndex: 32000,
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
    justifyContent: 'flex-end',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#EEF0F5',
  },
  footerEditEvent: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  footerActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  footerEditEventRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  deleteEventButton: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  deleteEventButtonDisabled: {
    backgroundColor: '#FEF2F2',
    ...(Platform.OS === 'web' && {
      cursor: 'not-allowed',
    }),
  },
  deleteEventButtonText: {
    color: '#B91C1C',
    fontWeight: '700',
    fontSize: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  cancelText: {
    color: '#6C738E',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  cancelButtonFilled: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  cancelButtonFilledText: {
    color: '#374151',
    fontWeight: '700',
    fontSize: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  createButton: {
    backgroundColor: '#9ECFFB',
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    ...(Platform.OS === 'web' && {
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
  repeatGridCompact: {
    ...(Platform.OS === 'web' && {
      gridTemplateColumns: '1fr 1fr',
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
    borderRadius: 14,
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
