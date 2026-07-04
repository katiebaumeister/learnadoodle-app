import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Platform, View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, Image, LayoutAnimation, Alert } from 'react-native';

// For web portal rendering
let ReactDOM;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    ReactDOM = require('react-dom');
  } catch (e) {
    console.warn('ReactDOM not available for portal rendering');
  }
}
import { addMonths, addDays, addWeeks, startOfWeek } from './planner/utils/date';
import { shiftCalendarYearAnchor } from './planner/plannerYearRange';
import { formatPlannerWeekHeaderLabel } from './planner/plannerSectionRouting';
import { X, Filter, Check, SlidersHorizontal, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, BookOpen, RefreshCw, Plus, LayoutGrid, Clock, Kanban, CheckSquare, Sparkles, RotateCcw, Target, Package, BarChart3, FileText, Activity, Star, Link, AlertTriangle, ExternalLink, Bot } from 'lucide-react';
import { sourceForChild } from './ui/ChildAvatarCluster';
import { useAuth } from '../contexts/AuthContext';
import { useOptionalFamilyUserControls } from '../contexts/FamilyUserControlsContext';
import { FiltersProvider } from '../contexts/FiltersContext';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import WebContent from './WebContent';
import SearchModal from './SearchModal';
import GlobalNewMenu from './GlobalNewMenu';
import AppShell from './layout/AppShell.js';
import { resolveSection, getSectionNavTab, getSectionsForTab, SECTION_TITLE_BY_TAB } from './layout/sectionNavConfig';
import SecondaryNavShell from './layout/SecondaryNavShell';
import CalendarEventCreateModal from './create/CalendarEventCreateModal';
import DayOffCreateModal from './create/DayOffCreateModal';
import AssignmentCreateModal from './create/AssignmentCreateModal';
import AssignmentEditModal from './create/AssignmentEditModal';
import TaskCreateModal from './TaskCreateModal';
import { resolveCreateModalKind, createPaneOptionToModalKind } from '../lib/create/resolveCreateModalKind';
import AssignmentSubmittalRequestModal from './subjects/AssignmentSubmittalRequestModal';
import EventModal from './events/EventModal';
import AddChildModal from './AddChildModal';
import InviteChildModal from './InviteChildModal';
import AddSubjectModal from './AddSubjectModal';
import EditSubjectSettingsModal from './subjects/EditSubjectSettingsModal';
import EditChildModal from './EditChildModal';
import SubmitForReviewModal from './child/SubmitForReviewModal';
import RespondToHelpRequestModal from './parent/RespondToHelpRequestModal';
import WorkReviewModal from './assignments/WorkReviewModal';
import { runSendNudgeForEvent } from '../lib/openAssignmentWorkflow';
import {
  fetchPrimaryAssignmentForEvent,
  fetchEventForAssignmentEdit,
  isWorkAssignmentEditEvent,
  resolveLinkedEventIdFromAssignment,
} from '../lib/create/assignmentEditHelpers';
import PlannerItemSummaryModal from './planner/PlannerItemSummaryModal';
import LearningDayModal from './planner/LearningDayModal';
import {
  OPEN_LEARNING_DAY_MODAL_EVENT,
  enrichLearningDayEvent,
  learningDayEventSelectFields,
} from '../lib/planner/learningDayModalNavigation';
import { getPlannerEventCategory } from '../lib/planner/plannerEventCategories';
import { shouldSkipPlannerItemSummary } from '../lib/planner/plannerItemSummaryModel';
import { resolveEventSubjectId } from '../lib/planner/plannerEventSubject';
import {
  isDayOffOrHolidayEvent,
  shouldUseLegacyEventModal,
} from '../lib/create/eventOpenRouting';
import { saveLesson } from '../lib/create/saveEventHelpers';
import { linkedSummariesFromFamilyApiMembers } from '../lib/services/childInviteStatus';
import { STRINGS } from '../lib/i18n/strings';
import PackWeekModal from './ai/PackWeekModal';
import CatchUpModal from './ai/CatchUpModal';
import SummarizeProgressModal from './ai/SummarizeProgressModal';
import AIModal from './AIModal';
import { proposeReschedule, getFamilyMembers, getOnboardingStatus, ensureFamily, startGoogleCalendarOAuth, getGoogleCalendarStatus, pullGoogleCalendar } from '../lib/apiClient';
import { getPlanHealth } from '../lib/services/academicYearClient';
import AnalyticsDashboard from './analytics/AnalyticsDashboard';
import ProgressReport from './analytics/ProgressReport';
import ScheduleSettingsModal from './modals/ScheduleSettingsModal';
import AIToolsModal from './AIToolsModal';
import SyllabusUpload from './SyllabusUpload';
import { ToastProvider } from './Toast';
import { supabase } from '../lib/supabase';
import { prefetchPlanEditListForFamily } from '../lib/services/plannerPrefetch';
import { preloadBulletinBoardForFamily, invalidateBulletinPostsCache } from '../lib/bulletinBoardCache';
import { subscribeOnboardingCompleted } from '../lib/onboardingCrossTab';
import { seedHomeWelcomeBulletinPost } from '../lib/homeWelcomeBulletin';
import { useFamilyPlanningMode } from '../lib/useFamilyPlanningMode';
import { PlannerDiffProvider } from '../app/state/usePlannerDiffStore';
import PlannerDiffModal from '../app/components/schedule/PlannerDiffModal';
import { PlannerHealthProvider } from '../app/state/usePlannerHealthStore';
import { ConstraintsProvider } from '../app/state/useConstraintsStore';
import AddFromLinkModal from './planner/AddFromLinkModal';
import QuickRescheduleModal from './planner/modals/QuickRescheduleModal';
import PlanWeekModal from './planner/modals/PlanWeekModal';
import BuildCurriculumModal from './planner/modals/BuildCurriculumModal';
import ProgressForecastModal from './planner/modals/ProgressForecastModal';
import SchedulingAssistant from './planner/SchedulingAssistant';
import PlannerSettingsPopover from './planner/PlannerSettingsPopover';
import PlannerSmartActionsMenu from './planner/PlannerSmartActionsMenu';
import SchoolYearSettingsModal from './settings/SchoolYearSettingsModal';
import { resolveSchoolYearLabelFromAnchor } from './planner/plannerYearRange';
import AppModalShell from './ui/AppModalShell';
import { ModalFooter } from './ui/ModalFooter';
import { createModalStyles as exportModalStyles } from './create/shared/createModalStyles';
import OnboardingModal from './onboarding/OnboardingModal';
import ExplorerTourOverlay from './onboarding/ExplorerTourOverlay';
import LearnerQuickStartModal from './onboarding/LearnerQuickStartModal';
import { preloadSubjectsPlanOverview, preloadSubjectsScheduleData } from './subjects/SubjectsPlanBuilder';
import SubjectUnitsEditorHost from './subjects/SubjectUnitsEditorHost';
import {
  dispatchOpenSubjectUnitsEditor,
  dispatchOpenSchoolYearSettings,
  dispatchOpenSchoolYearSettingsModal,
  handleLegacyPlanYearRequest,
  handleLegacyBuildCurriculumRequest,
  sanitizeLegacyPlanYearView,
  PLANNER_DEFAULT_CALENDAR_VIEW,
} from '../lib/planYearRetirement';
import { prefetchAllSubjectProgressPlans } from '../lib/prefetchSubjectProgressPlan';
import { parseExplorerTourFromPrefs, persistExplorerTourMerge, EXPLORER_TOUR_PREFS_KEY } from '../lib/services/explorerTourClient';
import { getPostOnboardingRoute } from '../lib/setupGuide';
import AppLoader, { ensureWebShellImagesLoaded } from './AppLoader';
import RebalanceModal from './year/RebalanceModal';
import FamilyMessagesPane from './messages/FamilyMessagesPane';
import FamilyCreatePane from './create/FamilyCreatePane';
import PlannerCreateMenu from './create/PlannerCreateMenu';
import SubjectPickerModal from './create/SubjectPickerModal';
import LearningDaySetupChoiceModal from './planner/LearningDaySetupChoiceModal';
import { PLANNER_EVENT_CATEGORIES } from '../lib/planner/plannerEventCategories';
import { defaultPlannerExportColumnSelection, PLANNER_EXPORT_OPTIONAL_COLUMN_DEFS } from '../lib/plannerExportOptionalColumns';
import { useHoverDropdown } from './ui/useHoverDropdown';
import { collectAvatarUrlsFromFamilyState, preloadRemoteImageUrls } from '../lib/preloadRemoteImages';
import { AVATAR_KEYS } from '../assets/imageAssetMap';
/**
 * Retired: parent explorer tour and Doodle chatbot setup checklist.
 * Post-onboarding guidance is a seeded Learnadoodle bulletin welcome post (see homeWelcomeBulletin.js).
 */
const EXPLORER_PARENT_STEPS = [
  {
    targetId: 'explorer-tour-sidebar-planner',
    title: 'Start with Planner',
    body: 'Start here! Try adding some events and full year plans.',
  },
  {
    targetId: 'explorer-tour-planner-new',
    title: 'Add events',
    body: 'Use + New to add activities and events to your calendar (and more).',
  },
];

const EXPORT_CALENDAR_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SUBJECTS_PENDING_PLAN_OPEN_STORAGE_KEY = 'ld_pending_subject_schedule_plan_open';
function toLocalYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isUuidLike(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized);
}

function parseSchoolYearLabel(label) {
  const match = String(label || '').trim().match(/^(\d{4})\/(\d{2,4})$/);
  if (!match) return null;
  const startYear = Number(match[1]);
  if (!Number.isFinite(startYear)) return null;
  const rawEnd = String(match[2] || '').trim();
  const endYear = rawEnd.length === 2 ? Number(`${String(startYear).slice(0, 2)}${rawEnd}`) : Number(rawEnd);
  if (!Number.isFinite(endYear)) return null;
  return { startYear, endYear };
}

function groupSubjectIdsByYear(subjects = []) {
  const groupedByYear = {};
  (Array.isArray(subjects) ? subjects : []).forEach((subject) => {
    const label = String(subject?.school_year || '').trim();
    const subjectId = String(subject?.id || '').trim();
    if (!label || !subjectId) return;
    if (!groupedByYear[label]) groupedByYear[label] = new Set();
    groupedByYear[label].add(subjectId);
  });
  return groupedByYear;
}

/** Avatar column may be prof1–10 or a real URL — same rules as children fetch. */
function validateChildAvatarUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(trimmed)) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  if (AVATAR_KEYS.includes(trimmed.toLowerCase())) {
    return trimmed;
  }
  return null;
}

/** Merge Supabase row into existing child so avatar chips update immediately (avoids stale refetch replacing the row). */
function mergeUpdatedChildIntoList(prev, row) {
  if (!row?.id || !Array.isArray(prev)) return prev;
  return prev.map((c) => {
    if (c.id !== row.id) return c;
    const av = validateChildAvatarUrl(row.avatar) ?? row.avatar ?? c.avatar;
    const avUrl = validateChildAvatarUrl(row.avatar_url || row.avatar) ?? c.avatar_url;
    return {
      ...c,
      ...row,
      avatar: av,
      avatar_url: avUrl,
      first_name: row.first_name ?? c.first_name,
      name: row.first_name ?? row.name ?? c.name,
    };
  });
}

/** Family / account UI tabs that often keep URL as `/` (or a stale `/planner` / `/materials`) — must not be overwritten by popstate URL sync. */
function isFamilyShellTab(tab) {
  if (!tab || typeof tab !== 'string') return false;
  return (
    tab === 'profile' ||
    tab === 'settings' ||
    tab === 'family' ||
    tab === 'children-list' ||
    tab.startsWith('child-') ||
    tab.startsWith('notes-pages-')
  );
}

export default function WebLayout({ navigation, routeParams, session: propSession = null, userRole: propUserRole = null }) {
  const { user, signOut } = useAuth();
  const authUserId = user?.id ?? null;
  // Try to get session from context if not provided as prop
  let session = propSession;
  try {
    const { useSession } = require('../contexts/SessionContext');
    const contextSession = useSession();
    if (!session) {
      session = contextSession;
    }
  } catch (e) {
    // SessionContext not available or not in provider, use prop only
  }
  const hasSession = !!session;
  const sessionFamilyId = session?.family_id ?? null;
  const sessionIsParent = session?.role_flags?.isParent === true;
  const sessionIsChild = session?.role_flags?.isChild === true;
  const sessionIsTutor = session?.role_flags?.isTutor === true;
  const { openSearch } = useGlobalSearch();
  const [activeTab, setActiveTab] = useState('home');
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const [activeSubtab, setActiveSubtab] = useState(null);
  const [activeTopNav, setActiveTopNav] = useState('home');
  const [isMessagesPaneOpen, setIsMessagesPaneOpen] = useState(false);
  const [isCreatePaneOpen, setIsCreatePaneOpen] = useState(false);
  const [activeChildId, setActiveChildId] = useState(null);
  const [activeChildSection, setActiveChildSection] = useState('affirmation');
  const [showSyllabusUpload, setShowSyllabusUpload] = useState(false);
  const [showDoodleSearchModal, setShowDoodleSearchModal] = useState(false);
  /** Optional prefilled prompt when opening Doodle from header search (or other callers). */
  const [doodleSearchInitialPrompt, setDoodleSearchInitialPrompt] = useState(null);
  const [doodleSearchAutoSubmit, setDoodleSearchAutoSubmit] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [showInviteChildModal, setShowInviteChildModal] = useState(false);
  const [inviteChildModalPrefillId, setInviteChildModalPrefillId] = useState(null);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [showEditSubjectSettingsModal, setShowEditSubjectSettingsModal] = useState(false);
  const [editSubjectSettingsInitialTab, setEditSubjectSettingsInitialTab] = useState('details');
  const [editingSubject, setEditingSubject] = useState(null);
  const [addSubjectPrefill, setAddSubjectPrefill] = useState({ schoolYear: null, schoolTerm: null, childIds: [] });
  const [createModalKind, setCreateModalKind] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showDirectSubmitForReviewModal, setShowDirectSubmitForReviewModal] = useState(false);
  const [directSubmitAssignment, setDirectSubmitAssignment] = useState(null);
  const [directSubmitEventContext, setDirectSubmitEventContext] = useState(null);
  const [directSubmitChildId, setDirectSubmitChildId] = useState(null);
  const [directSubmitViewOnly, setDirectSubmitViewOnly] = useState(false);
  const [showDirectHelpModal, setShowDirectHelpModal] = useState(false);
  const [directHelpAssignment, setDirectHelpAssignment] = useState(null);
  const [showDirectReviewModal, setShowDirectReviewModal] = useState(false);
  const [directReviewAssignment, setDirectReviewAssignment] = useState(null);
  const [showAssignmentEditModal, setShowAssignmentEditModal] = useState(false);
  const [assignmentEditContext, setAssignmentEditContext] = useState(null);
  const [plannerSummaryContext, setPlannerSummaryContext] = useState(null);
  const [learningDayModalState, setLearningDayModalState] = useState({
    visible: false,
    event: null,
  });
  const [showCalendarEventEditModal, setShowCalendarEventEditModal] = useState(false);
  const [calendarEventEditContext, setCalendarEventEditContext] = useState(null);
  const [eventModalEventId, setEventModalEventId] = useState(null);
  const [eventModalInitialEvent, setEventModalInitialEvent] = useState(null);
  /** Plan "Dates with events" row edit → open EventModal in edit form */
  const [eventModalSchedulingMode, setEventModalSchedulingMode] = useState(false);
  /** 'single' | 'series' */
  const [eventModalEditScope, setEventModalEditScope] = useState('single');
  /** Planner chip warning → open EventModal with top conflict banner (Auto reschedule / Ignore) */
  const [eventModalOpenConflictResolution, setEventModalOpenConflictResolution] = useState(false);
  const [eventModalConflictResolutionContext, setEventModalConflictResolutionContext] = useState(null);
  const [showEditChildModal, setShowEditChildModal] = useState(false);
  const [editingChild, setEditingChild] = useState(null);
  const [taskModalDate, setTaskModalDate] = useState(new Date());
  const [taskModalChildId, setTaskModalChildId] = useState(null);
  const [taskModalChildIds, setTaskModalChildIds] = useState([]);
  const [taskModalDefaultSubjectId, setTaskModalDefaultSubjectId] = useState(null);
  const [taskModalDefaultEventType, setTaskModalDefaultEventType] = useState(null);
  const [taskModalDefaultPlacement, setTaskModalDefaultPlacement] = useState('calendar');
  const [taskModalDefaultStartTime, setTaskModalDefaultStartTime] = useState(null);
  const [taskModalDefaultTitle, setTaskModalDefaultTitle] = useState(null);
  const [taskModalDefaultMaterialId, setTaskModalDefaultMaterialId] = useState(null);
  const [taskModalLinkedLearningDayEventId, setTaskModalLinkedLearningDayEventId] = useState(null);
  const [taskModalDefaultCurriculumLessonId, setTaskModalDefaultCurriculumLessonId] = useState(null);
  const [taskModalSubmittalAfterCreate, setTaskModalSubmittalAfterCreate] = useState(false);
  const taskModalSubmittalAfterCreateRef = useRef(false);
  const [submittalRequestContext, setSubmittalRequestContext] = useState(null);
  const [newMenuPosition, setNewMenuPosition] = useState({ x: 320, y: 88 });
  const [children, setChildren] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [subjectsLoaded, setSubjectsLoaded] = useState(false); // Cache flag for subjects
  const [fullSubjects, setFullSubjects] = useState([]); // Full subject data for FamilyPanel courses section
  const [fullSubjectsLoaded, setFullSubjectsLoaded] = useState(false); // Cache flag for full subjects
  // Initialize familyId from session on first paint so planner/home load immediately (no blank until effect runs)
  const [familyId, setFamilyId] = useState(() => (session?.family_id ?? null));
  const [family, setFamily] = useState(null);
  const familyPlanningMode = useFamilyPlanningMode(familyId, family);
  const [profile, setProfile] = useState(null);

  const editChildLinkedLoginEmail = useMemo(() => {
    if (!editingChild?.id || !family?.members?.length) return null;
    const map = linkedSummariesFromFamilyApiMembers(family.members, [editingChild.id]);
    return map[String(editingChild.id)]?.invite_email ?? null;
  }, [editingChild?.id, family?.members]);

  const familyMembersForEventing = useMemo(() => {
    const summaries = family?.child_invite_summaries && typeof family.child_invite_summaries === 'object'
      ? family.child_invite_summaries
      : {};
    const members = Array.isArray(family?.members) ? family.members : [];
    return (children || []).map((child) => {
      const sid = String(child?.id || '');
      const summary = sid ? summaries[sid] || null : null;
      const member = members.find((m) => {
        const mChild = m?.child_id != null ? String(m.child_id) : '';
        const mId = m?.id != null ? String(m.id) : '';
        return (mChild && mChild === sid) || (mId && mId === sid);
      }) || null;
      const inviteStatusRaw = String(
        summary?.invite_status ||
        member?.invite_status ||
        ''
      ).trim().toLowerCase();
      const inviteStatus = inviteStatusRaw === 'connected' ? 'accepted' : inviteStatusRaw || 'none';
      return {
        id: child.id,
        child_id: child.id,
        first_name: child.first_name || child.name || 'Unknown',
        name: child.first_name || child.name || 'Unknown',
        avatar: child.avatar || child.avatar_url || null,
        avatar_url: child.avatar_url || child.avatar || null,
        role: 'child',
        member_role: 'child',
        invite_status: inviteStatus,
      };
    });
  }, [children, family?.members, family?.child_invite_summaries]);

  const closeLearningDayModal = useCallback(() => {
    setLearningDayModalState({ visible: false, event: null });
  }, []);

  const handlePlannerLearningDaySaved = useCallback(({ event: savedEvent } = {}) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
    const subjectId = resolveEventSubjectId(savedEvent);
    if (subjectId) {
      window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId } }));
    }
  }, []);

  const openFocusedPlannerEdit = useCallback((eventRow, assignment = null, view = 'edit') => {
    if (!eventRow) return;
    if (isWorkAssignmentEditEvent(eventRow?.event_type)) {
      setAssignmentEditContext({
        assignment,
        linkedEvent: eventRow,
        view,
      });
      setShowAssignmentEditModal(true);
      return;
    }
    setCalendarEventEditContext({ event: eventRow });
    setShowCalendarEventEditModal(true);
  }, []);

  const openEditFromPlannerSummary = useCallback(() => {
    const ctx = plannerSummaryContext;
    if (!ctx?.event) return;
    const { event, assignment, category } = ctx;
    setPlannerSummaryContext(null);
    if (category === 'Learning day') {
      setLearningDayModalState({ visible: true, event });
      return;
    }
    openFocusedPlannerEdit(event, assignment, 'edit');
  }, [plannerSummaryContext, openFocusedPlannerEdit]);

  const resetCreateModalState = useCallback(() => {
    setCreateModalKind(null);
    setTaskModalChildId(null);
    setTaskModalChildIds([]);
    setTaskModalDefaultSubjectId(null);
    setTaskModalDefaultEventType(null);
    setTaskModalDefaultPlacement('calendar');
    setTaskModalDefaultStartTime(null);
    setTaskModalDefaultTitle(null);
    setTaskModalDefaultMaterialId(null);
    setTaskModalLinkedLearningDayEventId(null);
    setTaskModalDefaultCurriculumLessonId(null);
    setTaskModalSubmittalAfterCreate(false);
    taskModalSubmittalAfterCreateRef.current = false;
  }, []);

  const handleCreateModalCreated = useCallback(async (task) => {
    if (taskModalSubmittalAfterCreateRef.current && task?.id) {
      setSubmittalRequestContext({ event: task, assignment: null });
      setTaskModalSubmittalAfterCreate(false);
      taskModalSubmittalAfterCreateRef.current = false;
    }
    if (activeTab === 'calendar' || activeTab === 'planner') {
      if (Platform.OS === 'web') {
        window.dispatchEvent(new CustomEvent('refreshCalendar'));
      }
    }
  }, [activeTab]);

  // Keep familyId in sync with session when it becomes available or changes
  useEffect(() => {
    if (session?.family_id && session.family_id !== familyId) {
      setFamilyId(session.family_id);
    }
  }, [session?.family_id, familyId]);

  // Preload plan health at app start so banner/icon show immediately when switching to planner
  const [preloadedPlanHealth, setPreloadedPlanHealth] = useState(null);
  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    getPlanHealth(familyId).then(({ data, error }) => {
      if (!cancelled && !error && data?.plan_exists) setPreloadedPlanHealth(data);
    });
    return () => { cancelled = true; };
  }, [familyId]);

  // Warm subjects schedule/year-target overview once on app load for this family.
  // Subjects page then hydrates immediately from cache when opened.
  useEffect(() => {
    if (!familyId) return;
    preloadSubjectsPlanOverview(familyId, { force: false }).catch(() => {});
  }, [familyId]);

  const warmSubjectsScheduleCaches = useCallback(({ force = true } = {}) => {
    if (!familyId || !Array.isArray(subjects) || subjects.length === 0) return;
    const groupedByYear = groupSubjectIdsByYear(subjects);
    Object.entries(groupedByYear).forEach(([schoolYearLabel, subjectIdSet]) => {
      const parsed = parseSchoolYearLabel(schoolYearLabel);
      if (!parsed) return;
      preloadSubjectsScheduleData(familyId, {
        schoolYearLabel,
        startYear: parsed.startYear,
        endYear: parsed.endYear,
        subjectIds: [...subjectIdSet],
        force,
      }).catch(() => {});
    });
  }, [familyId, subjects]);

  // Warm schedule supplemental data (settings + target defaults + attendance/projection events)
  // across all known subject years so year/term switching in Subjects > Schedule stays instant.
  useEffect(() => {
    warmSubjectsScheduleCaches({ force: false });
  }, [warmSubjectsScheduleCaches]);

  // Keep subjects schedule cache warm after event mutations so Schedule numbers stay current
  // before the user navigates into the tab.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !familyId) return undefined;
    let timerId = null;
    const queueWarm = () => {
      if (timerId != null) return;
      timerId = setTimeout(() => {
        timerId = null;
        preloadSubjectsPlanOverview(familyId, { force: true }).catch(() => {});
        warmSubjectsScheduleCaches({ force: true });
        if (Array.isArray(subjects) && subjects.length > 0) {
          prefetchAllSubjectProgressPlans(familyId, subjects, { concurrency: 8 }).catch(() => {});
        }
      }, 500);
    };
    window.addEventListener('eventCreated', queueWarm);
    window.addEventListener('eventUpdated', queueWarm);
    window.addEventListener('eventDeleted', queueWarm);
    window.addEventListener('refreshSubjects', queueWarm);
    return () => {
      if (timerId != null) clearTimeout(timerId);
      window.removeEventListener('eventCreated', queueWarm);
      window.removeEventListener('eventUpdated', queueWarm);
      window.removeEventListener('eventDeleted', queueWarm);
      window.removeEventListener('refreshSubjects', queueWarm);
    };
  }, [familyId, warmSubjectsScheduleCaches, subjects]);

  // Warm subject progress/unit-structure cache once subjects are known, so Edit Subject can render stable units actions immediately.
  useEffect(() => {
    if (!familyId || !Array.isArray(subjects) || subjects.length === 0) return;
    prefetchAllSubjectProgressPlans(familyId, subjects, { concurrency: 8 }).catch(() => {});
  }, [familyId, subjects]);

  // Onboarding: resolve status before first paint so we never flash landing without modal
  const [onboardingCheckDone, setOnboardingCheckDone] = useState(false);
  const [onboardingUiReady, setOnboardingUiReady] = useState(false);
  const [onboardingModalReady, setOnboardingModalReady] = useState(false);
  const [initialOnboardingBlocked, setInitialOnboardingBlocked] = useState(false);
  const [onboardingJustCompleted, setOnboardingJustCompleted] = useState(false);
  const [shellImagesReady, setShellImagesReady] = useState(Platform.OS !== 'web');
  const [homeInitialDataReady, setHomeInitialDataReady] = useState(false);
  const handleHomeInitialDataReady = useCallback(() => {
    setHomeInitialDataReady(true);
  }, []);

  /** Post-onboarding explorer tour (parents: 3-step; child/tutor: one modal). Persisted in profiles.app_preferences. */
  const [explorerParentTourOpen, setExplorerParentTourOpen] = useState(false);
  const [explorerParentStep, setExplorerParentStep] = useState(0);
  const [learnerQuickStartOpen, setLearnerQuickStartOpen] = useState(false);

  const [activeRightTool, setActiveRightTool] = useState(null);
  const prevActiveTabRef = useRef(null);
  // AI Tool Modals
  const [showPackWeekModal, setShowPackWeekModal] = useState(false);
  const [showCatchUpModal, setShowCatchUpModal] = useState(false);
  const [showSummarizeProgressModal, setShowSummarizeProgressModal] = useState(false);
  const [showRebalanceModal, setShowRebalanceModal] = useState(false);
  const [rebalanceEvent, setRebalanceEvent] = useState(null);
  const [rebalanceYearPlanId, setRebalanceYearPlanId] = useState(null);
  const [showWhatIfModal, setShowWhatIfModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showPlanWeekModal, setShowPlanWeekModal] = useState(false);
  const [showPlan2WeeksModal, setShowPlan2WeeksModal] = useState(false);
  const [showAddFromLinkModal, setShowAddFromLinkModal] = useState(false);
  const [showQuickRescheduleModal, setShowQuickRescheduleModal] = useState(false);
  const [quickRescheduleInitialEvent, setQuickRescheduleInitialEvent] = useState(null);
  const [showBuildCurriculumModal, setShowBuildCurriculumModal] = useState(false);
  const [buildCurriculumInitialSubjectId, setBuildCurriculumInitialSubjectId] = useState(null);
  const [buildCurriculumInitialSubjectName, setBuildCurriculumInitialSubjectName] = useState(null);
  const [buildCurriculumInitialInputMode, setBuildCurriculumInitialInputMode] = useState(null);
  const [buildCurriculumInitialSourceUrl, setBuildCurriculumInitialSourceUrl] = useState(null);
  const [buildCurriculumInitialTopic, setBuildCurriculumInitialTopic] = useState(null);
  const [buildCurriculumInitialMaterialId, setBuildCurriculumInitialMaterialId] = useState(null);
  const [showProgressForecastModal, setShowProgressForecastModal] = useState(false);
  const [showSchedulingAssistantModal, setShowSchedulingAssistantModal] = useState(false);
  const [schedulingAssistantChildId, setSchedulingAssistantChildId] = useState(null);
  const [schedulingAssistantWeekStart, setSchedulingAssistantWeekStart] = useState(() => startOfWeek(new Date()));
  const [showSmartActionsMenu, setShowSmartActionsMenu] = useState(false);
  const smartActionsButtonRef = useRef(null);
  const plannerAnchorRef = useRef(new Date());
  const [showEditSchoolYearModal, setShowEditSchoolYearModal] = useState(false);
  const [editSchoolYearInitialLabel, setEditSchoolYearInitialLabel] = useState(null);
  const [showDayOffModal, setShowDayOffModal] = useState(false);
  const [dayOffModalDate, setDayOffModalDate] = useState(null);
  const [dayOffModalSchoolYearLabel, setDayOffModalSchoolYearLabel] = useState(null);
  const [showPlannerCreateMenu, setShowPlannerCreateMenu] = useState(false);
  const [showLearningDaySubjectPicker, setShowLearningDaySubjectPicker] = useState(false);
  const [learningDaySetupChoice, setLearningDaySetupChoice] = useState({ visible: false, subject: null });
  const plannerCreateButtonRef = useRef(null);
  const smartActionsHover = useHoverDropdown({
    open: showSmartActionsMenu,
    setOpen: setShowSmartActionsMenu,
    onOpen: () => setShowPlannerCreateMenu(false),
  });
  const plannerCreateHover = useHoverDropdown({
    open: showPlannerCreateMenu,
    setOpen: setShowPlannerCreateMenu,
    onOpen: () => setShowSmartActionsMenu(false),
  });
  const [showAnalyticsDashboard, setShowAnalyticsDashboard] = useState(false);
  const [showProgressReport, setShowProgressReport] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAIToolsModal, setShowAIToolsModal] = useState(false);
  const [userRole, setUserRole] = useState(propUserRole || null);
  
  // Update userRole from session when prop not provided (prop wins so child gets same shell with userRole="child")
  const sessionEffectiveRole = session?.effective_role;
  useEffect(() => {
    if (propUserRole != null) return;
    if (!sessionEffectiveRole) return;
    setUserRole((prev) => (prev === sessionEffectiveRole ? prev : sessionEffectiveRole));
  }, [sessionEffectiveRole, propUserRole]);

  /** Tutor: read-first planner; no global "new event" ownership. */
  const isTutorUser = userRole === 'tutor' || session?.role_flags?.isTutor === true;
  const roleFlags = session?.role_flags || {};
  const resolvedShellUserRole = useMemo(() => {
    if (roleFlags.isTutor === true) return 'tutor';
    if (roleFlags.isChild === true) return session?.effective_role || 'child';
    if (roleFlags.isParent === true) return 'parent';
    return session?.effective_role || userRole || 'parent';
  }, [
    roleFlags.isTutor,
    roleFlags.isChild,
    roleFlags.isParent,
    session?.effective_role,
    userRole,
  ]);

  // For a child/student, the planner and child filters must be locked to their
  // OWN child record(s). Without this, a child sees every sibling's to-dos.
  const viewerScopedChildIds = useMemo(() => {
    if (!sessionIsChild) return null;
    const ids = [];
    if (session?.child_id) ids.push(String(session.child_id));
    if (Array.isArray(session?.accessible_children)) {
      session.accessible_children.forEach((c) => {
        const id = c?.id ?? c;
        if (id) ids.push(String(id));
      });
    }
    const unique = Array.from(new Set(ids.filter(Boolean)));
    return unique.length > 0 ? unique : null;
  }, [sessionIsChild, session?.child_id, session?.accessible_children]);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const familyUserControls = useOptionalFamilyUserControls();
  const allowedRef = useRef(familyUserControls.allowed);
  allowedRef.current = familyUserControls.allowed;

  // Mirror the subject lists so window-event listeners (empty deps) can resolve a
  // full subject object by id (e.g. opening the schedule editor from a planner event).
  const subjectsRef = useRef([]);
  subjectsRef.current = (Array.isArray(fullSubjects) && fullSubjects.length > 0) ? fullSubjects : subjects;
  const isSelfManagedStudent = familyUserControls?.isSelfManagedStudent === true;
  const showPlannerHeaderQuickActions =
    session?.role_flags?.isChild !== true || isSelfManagedStudent;
  const sessionRestricted = !!(session?.role_flags?.isChild || session?.role_flags?.isTutor);
  const denyFamilyEventEdit = sessionRestricted && !familyUserControls.allowed('events');
  const childDoodleBotDisabled =
    session?.role_flags?.isChild === true &&
    familyUserControls.effectivePermissions?.canUseDoodleBot === false;

  const openUnitsAndLessonsModal = useCallback((detail = {}) => {
    if (sessionRestricted && !familyUserControls.allowed('plans')) {
      Alert.alert('Not available', 'Your family admin has disabled adding or editing plans.');
      return;
    }
    dispatchOpenSubjectUnitsEditor({
      subjectId: detail.subjectId || null,
      subjectName: detail.subjectName || null,
      method: detail.method || 'manual',
      childIds: detail.childIds && Array.isArray(detail.childIds)
        ? detail.childIds.filter(Boolean)
        : (detail.childId ? [detail.childId] : []),
    });
  }, [familyUserControls, sessionRestricted]);

  const openCreateModal = useCallback((kind, detail = {}) => {
    if (kind === 'lesson') {
      if (sessionRestricted && !familyUserControls.allowed('events')) {
        Alert.alert('Not available', 'Your family admin has disabled creating or editing events.');
        return;
      }
      const date = detail.date || new Date();
      const incomingChildIds = detail.childIds && Array.isArray(detail.childIds)
        ? detail.childIds
        : (detail.childId ? [detail.childId] : []);
      const primaryChildId = incomingChildIds.length > 0 ? incomingChildIds[0] : null;

      setTaskModalDate(date);
      setTaskModalChildIds(incomingChildIds);
      setTaskModalChildId(primaryChildId);
      setTaskModalDefaultSubjectId(detail.subjectId || null);
      setTaskModalDefaultEventType('Lesson');
      setTaskModalDefaultPlacement(detail.placement || 'calendar');
      setTaskModalDefaultStartTime(detail.startTime || null);
      setTaskModalDefaultTitle(detail.title ?? null);
      setTaskModalDefaultMaterialId(detail.materialId || null);
      setTaskModalLinkedLearningDayEventId(detail.linkedLearningDayEventId || null);
      setTaskModalDefaultCurriculumLessonId(detail.curriculumLessonId || null);
      setTaskModalSubmittalAfterCreate(false);
      taskModalSubmittalAfterCreateRef.current = false;
      setCreateModalKind('lesson');
      return;
    }
    const date = detail.date || new Date();
    const incomingChildIds = detail.childIds && Array.isArray(detail.childIds)
      ? detail.childIds
      : (detail.childId ? [detail.childId] : []);
    const primaryChildId = incomingChildIds.length > 0 ? incomingChildIds[0] : null;

    setTaskModalDate(date);
    setTaskModalChildIds(incomingChildIds);
    setTaskModalChildId(primaryChildId);
    setTaskModalDefaultSubjectId(detail.subjectId || null);
    setTaskModalDefaultEventType(detail.eventType || null);
    setTaskModalDefaultPlacement(detail.placement || 'calendar');
    setTaskModalDefaultStartTime(detail.startTime || null);
    setTaskModalDefaultTitle(detail.title ?? null);
    setTaskModalDefaultMaterialId(detail.materialId || null);
    setTaskModalLinkedLearningDayEventId(detail.linkedLearningDayEventId || null);
    setTaskModalDefaultCurriculumLessonId(detail.curriculumLessonId || null);
    setTaskModalSubmittalAfterCreate(!!detail.submittalAfterCreate);
    taskModalSubmittalAfterCreateRef.current = !!detail.submittalAfterCreate;
    setCreateModalKind(kind);
  }, [familyUserControls, sessionRestricted]);

  const openDoodleSearch = useCallback((options = {}) => {
    if (childDoodleBotDisabled) return;
    const prompt = typeof options === 'string' ? options : options?.prompt;
    const autoSubmit = typeof options === 'object' ? !!options?.autoSubmit : false;
    setDoodleSearchInitialPrompt(typeof prompt === 'string' && prompt.trim() ? prompt.trim() : null);
    setDoodleSearchAutoSubmit(autoSubmit);
    setShowDoodleSearchModal(true);
  }, [childDoodleBotDisabled]);

  const closeDoodleSearch = useCallback(() => {
    setShowDoodleSearchModal(false);
    setDoodleSearchInitialPrompt(null);
    setDoodleSearchAutoSubmit(false);
  }, []);
  const learnerQuickStartSections = useMemo(() => {
    const isChild = session?.role_flags?.isChild === true;
    const isTutor = session?.role_flags?.isTutor === true;
    if (isTutor) {
      return ['Home', 'My students', 'Planner', 'Materials'];
    }
    if (!isChild) {
      return ['Home', 'Planner', 'Subjects', 'Materials'];
    }
    const permissions = familyUserControls.effectivePermissions || {};
    const sections = [];
    if (permissions.canViewHome !== false) sections.push('Home');
    if (permissions.canViewPlanner !== false) sections.push('Planner');
    if (permissions.canViewSubjects !== false) sections.push('Subjects');
    if (permissions.canViewLibrary !== false) sections.push('Materials');
    return sections.length > 0 ? sections : ['Home'];
  }, [
    session?.role_flags?.isChild,
    session?.role_flags?.isTutor,
    familyUserControls.effectivePermissions?.canViewHome,
    familyUserControls.effectivePermissions?.canViewPlanner,
    familyUserControls.effectivePermissions?.canViewSubjects,
    familyUserControls.effectivePermissions?.canViewLibrary,
  ]);

  /** Home / planner data hydrate in WebContent in the background — shell never blocks on tab data. */
  /** null until first fetch — matches EventDetails query (deduped, limit 24) for Add to plan? chips */
  const [preloadedAcademicYears, setPreloadedAcademicYears] = useState(null);
  /** null = not loaded yet; rows seed EventModal help/submission strips without a blocking fetch */
  const [preloadedFamilyAssignments, setPreloadedFamilyAssignments] = useState(null);
  // Derived: must come after session/state used below (avoid TDZ)
  const onboardingBlocked = !!(
    session &&
    !onboardingJustCompleted &&
    (initialOnboardingBlocked || (family && !family.onboarding_completed))
  );
  // Only parent home uses ParentHomeScreen's initial-data ready callback.
  // Using resolvedShellUserRole avoids false "parent-like" matches during
  // partial role_flags hydration on child/tutor sessions.
  const homeNeedsInitialData = activeTab === 'home' && resolvedShellUserRole === 'parent';
  // Fullscreen loader: block on session + shell assets, and onboarding only when actually blocked.
  const showLoader = !!(
    user &&
    session &&
    ((session.loading === true) ||
      !shellImagesReady ||
      (homeNeedsInitialData && !homeInitialDataReady && !onboardingBlocked) ||
      (onboardingBlocked && (!onboardingUiReady || !onboardingModalReady)))
  );
  const showLoaderEffective = showLoader;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      setShellImagesReady(true);
      return;
    }
    let cancelled = false;
    ensureWebShellImagesLoaded()
      .then(() => {
        if (!cancelled) setShellImagesReady(true);
      })
      .catch(() => {
        if (!cancelled) setShellImagesReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!onboardingBlocked) setOnboardingModalReady(false);
  }, [onboardingBlocked]);

  useEffect(() => {
    // Keep startup loader for first Home hydration only.
    if (activeTab !== 'home') {
      setHomeInitialDataReady(true);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!homeNeedsInitialData || homeInitialDataReady) return;
    const timeoutId = setTimeout(() => {
      setHomeInitialDataReady(true);
      if (typeof console !== 'undefined') {
        console.warn('[WebLayout] Home initial-data gate timed out; releasing loader fail-safe.');
      }
    }, 12000);
    return () => clearTimeout(timeoutId);
  }, [homeNeedsInitialData, homeInitialDataReady]);

  const [selectedCalendarChildren, setSelectedCalendarChildren] = useState(null);
  const [selectedEventTypes, setSelectedEventTypes] = useState(null);
  // Unread direct-message count for the signed-in user (drives the Messages nav badge,
  // so a parent is notified when a child sends a message / asks a question).
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  useEffect(() => {
    if (!authUserId) {
      setUnreadMessagesCount(0);
      return undefined;
    }
    let cancelled = false;
    const loadUnread = async () => {
      try {
        let total = 0;
        const { count: userUnread, error: userError } = await supabase
          .from('family_direct_messages')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_user_id', authUserId)
          .is('read_at', null)
          .neq('sender_user_id', authUserId);
        if (!userError) total += userUnread || 0;

        const childScopeId = session?.child_id ? String(session.child_id) : null;
        if (childScopeId && familyId) {
          const { count: childUnread, error: childError } = await supabase
            .from('family_direct_messages')
            .select('id', { count: 'exact', head: true })
            .eq('family_id', familyId)
            .eq('recipient_child_id', childScopeId)
            .is('read_at', null)
            .neq('sender_user_id', authUserId);
          if (!childError) total += childUnread || 0;
        }

        if (!cancelled) {
          setUnreadMessagesCount(total);
        }
      } catch (_) {
        /* ignore (table/RLS unavailable) */
      }
    };
    loadUnread();
    const pollMs = isMessagesPaneOpen ? 12000 : 60000;
    const interval = setInterval(loadUnread, pollMs);
    let onRefresh;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      onRefresh = () => loadUnread();
      window.addEventListener('refreshRightRail', onRefresh);
      window.addEventListener('familyDirectMessagesUpdated', onRefresh);
      window.addEventListener('focus', onRefresh);
    }
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (onRefresh && Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('refreshRightRail', onRefresh);
        window.removeEventListener('familyDirectMessagesUpdated', onRefresh);
        window.removeEventListener('focus', onRefresh);
      }
    };
  }, [authUserId, familyId, isMessagesPaneOpen, session?.child_id]);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const filterButtonRef = useRef(null);
  const [filterDropdownPosition, setFilterDropdownPosition] = useState({ top: 0, left: 0 });
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
  const topToolbarFiltersButtonRef = useRef(null);
  const [showPlannerSettingsPopover, setShowPlannerSettingsPopover] = useState(false);
  const [plannerSettingsPopoverPosition, setPlannerSettingsPopoverPosition] = useState({ top: 0, left: 0 });
  const settingsButtonRef = useRef(null);
  const [filtersDropdownPosition, setFiltersDropdownPosition] = useState({ top: 0, left: 0 });
  const filtersDropdownRef = useRef(null);
  const updateFiltersDropdownPosition = useCallback(() => {
    if (Platform.OS !== 'web' || !topToolbarFiltersButtonRef.current) return;
    const node = topToolbarFiltersButtonRef.current._nativeNode || topToolbarFiltersButtonRef.current;
    if (node && typeof node.getBoundingClientRect === 'function') {
      const rect = node.getBoundingClientRect();
      setFiltersDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, []);
  const filtersHover = useHoverDropdown({
    open: showFiltersDropdown,
    setOpen: setShowFiltersDropdown,
    onOpen: () => {
      setShowSmartActionsMenu(false);
      setShowPlannerCreateMenu(false);
      updateFiltersDropdownPosition();
    },
  });
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const connectedAccounts = useMemo(() => {
    const allowed = new Set(['google', 'apple']);
    const found = new Set();
    const addProvider = (value) => {
      const key = String(value || '').trim().toLowerCase();
      if (allowed.has(key)) found.add(key);
    };

    const rawCandidates = [
      session?.connected_accounts,
      session?.integrations,
      session?.provider_connections,
    ];

    rawCandidates.forEach((raw) => {
      if (!raw) return;
      if (Array.isArray(raw)) {
        raw.forEach((entry) => {
          if (typeof entry === 'string') {
            addProvider(entry);
            return;
          }
          if (entry && typeof entry === 'object') {
            addProvider(entry.provider || entry.name || entry.id || entry.type);
          }
        });
        return;
      }
      if (typeof raw === 'object') {
        Object.entries(raw).forEach(([key, value]) => {
          if (value === true || value === 'connected' || value === 'active') {
            addProvider(key);
            return;
          }
          if (value && typeof value === 'object') {
            const status = String(value.status || value.state || '').toLowerCase();
            if (value.connected === true || status === 'connected' || status === 'active') {
              addProvider(key);
            }
          }
        });
      }
    });

    return Array.from(found).sort((a, b) => a.localeCompare(b));
  }, [session?.connected_accounts, session?.integrations, session?.provider_connections]);

  const plannerConnectedProviderIds = useMemo(() => {
    const found = [];
    if (googleCalendarConnected) found.push('google');
    if (connectedAccounts.includes('apple')) found.push('apple');
    return found;
  }, [connectedAccounts, googleCalendarConnected]);

  const refreshGoogleCalendarConnection = useCallback(async () => {
    const { data, error } = await getGoogleCalendarStatus();
    if (error) return;
    setGoogleCalendarConnected(!!data?.connected);
  }, []);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showViewDropdown, setShowViewDropdown] = useState(false);
  const viewDropdownHandlerRef = useRef(null);
  const viewDropdownContainerRef = useRef(null);
  const viewDropdownButtonRef = useRef(null);
  const [viewDropdownPosition, setViewDropdownPosition] = useState({ top: 0, left: 0 });
  const viewDropdownMenuRef = useRef(null);
  const viewItemRefs = useRef({});
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [contextMenuView, setContextMenuView] = useState(null);
  const [contextMenuPosition, setContextMenuPosition] = useState({ top: 0, left: 0 });
  const [tooltip, setTooltip] = useState({ visible: false, text: '', x: 0, y: 0 });
  const tooltipRef = useRef(null);
  const quickRescheduleButtonRef = useRef(null);
  const progressForecastButtonRef = useRef(null);
  const buildCurriculumButtonRef = useRef(null);
  const planWeekButtonRef = useRef(null);
  const viewChipLayouts = useRef({});
  const [viewChipSlider, setViewChipSlider] = useState({ left: 0, width: 0 });
  const syncingGoogleCalendarPullRef = useRef(false);
  const lastGoogleCalendarPullAtRef = useRef(0);

  // Planner export date-range modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportColumns, setExportColumns] = useState(defaultPlannerExportColumnSelection);
  const [showExportStartDatePicker, setShowExportStartDatePicker] = useState(false);
  const [showExportEndDatePicker, setShowExportEndDatePicker] = useState(false);
  const [exportStartCalendarMonth, setExportStartCalendarMonth] = useState(() => new Date());
  const [exportEndCalendarMonth, setExportEndCalendarMonth] = useState(() => new Date());
  const [exportModalSubjectId, setExportModalSubjectId] = useState(null);
  const [exportModalSubjectName, setExportModalSubjectName] = useState(null);

  const openPlannerExportModal = useCallback(() => {
    setTooltip({ visible: false, text: '', x: 0, y: 0 });
    const m = currentMonth.getMonth();
    const y = currentMonth.getFullYear();
    const firstDay = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0);
    const lastDayStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    setExportStartDate(firstDay);
    setExportEndDate(lastDayStr);
    setExportModalSubjectId(null);
    setExportModalSubjectName(null);
    setShowExportModal(true);
  }, [currentMonth]);

  const closeExportPlannerModal = useCallback(() => {
    setShowExportModal(false);
    setExportModalSubjectId(null);
    setExportModalSubjectName(null);
  }, []);

  const handleExportPlannerConfirm = useCallback(() => {
    const start = exportStartDate.trim();
    const end = exportEndDate.trim();
    if (!start || !end) return;
    const startD = new Date(start);
    const endD = new Date(end);
    if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) return;
    if (startD > endD) return;
    closeExportPlannerModal();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const exportDetail = { startDate: startD, endDate: endD, columns: exportColumns };
      if (exportModalSubjectId) exportDetail.subjectId = exportModalSubjectId;
      if (exportModalSubjectName) exportDetail.subjectName = exportModalSubjectName;
      window.dispatchEvent(new CustomEvent('plannerExportToExcel', { detail: exportDetail }));
    }
  }, [
    exportStartDate,
    exportEndDate,
    exportColumns,
    exportModalSubjectId,
    exportModalSubjectName,
    closeExportPlannerModal,
  ]);

  const syncGoogleCalendarIntoPlanner = useCallback(async ({ showAlert = false } = {}) => {
    if (!googleCalendarConnected || syncingGoogleCalendarPullRef.current) return;
    syncingGoogleCalendarPullRef.current = true;
    try {
      const syncStart = new Date(currentMonth);
      syncStart.setMonth(syncStart.getMonth() - 1);
      syncStart.setDate(1);
      const syncEnd = new Date(currentMonth);
      syncEnd.setMonth(syncEnd.getMonth() + 3);
      syncEnd.setDate(0);
      syncEnd.setHours(23, 59, 59, 999);
      const { data, error } = await pullGoogleCalendar({
        start: syncStart.toISOString(),
        end: syncEnd.toISOString(),
      });
      if (error) {
        if (showAlert) {
          Alert.alert('Sync failed', error?.message || 'Failed to sync Google Calendar events.');
        }
        return;
      }
      lastGoogleCalendarPullAtRef.current = Date.now();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar'));
      }
      if (showAlert) {
        const imported = data?.imported || 0;
        const updated = data?.updated || 0;
        Alert.alert('Google Calendar synced', `Imported ${imported} and updated ${updated} event${imported + updated === 1 ? '' : 's'}.`);
      }
    } finally {
      syncingGoogleCalendarPullRef.current = false;
    }
  }, [googleCalendarConnected, currentMonth]);

  useEffect(() => {
    if (!hasSession || !familyId) return;
    refreshGoogleCalendarConnection();
  }, [hasSession, familyId, refreshGoogleCalendarConnection]);

  useEffect(() => {
    if (activeTab !== 'planner' && activeTab !== 'calendar') return;
    refreshGoogleCalendarConnection();
    if (googleCalendarConnected) {
      const now = Date.now();
      const elapsed = now - lastGoogleCalendarPullAtRef.current;
      if (elapsed > 120000) {
        syncGoogleCalendarIntoPlanner();
      }
    }
  }, [activeTab, googleCalendarConnected, refreshGoogleCalendarConnection, syncGoogleCalendarIntoPlanner]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const handleOAuthMessage = (event) => {
      const type = event?.data?.type;
      if (type === 'GOOGLE_OAUTH_SUCCESS' || type === 'GOOGLE_DRIVE_OAUTH_SUCCESS') {
        refreshGoogleCalendarConnection();
        setTimeout(() => {
          syncGoogleCalendarIntoPlanner();
        }, 900);
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [refreshGoogleCalendarConnection, syncGoogleCalendarIntoPlanner]);

  const handlePlannerProviderConnect = useCallback(async (providerId, providerLabel, options = {}) => {
    if (providerId !== 'google') {
      Alert.alert('Coming soon', `${providerLabel} planner integration is coming soon.`);
      return;
    }
    if (googleCalendarConnected) {
      if (options?.alreadyConnected) {
        await syncGoogleCalendarIntoPlanner({ showAlert: true });
        return;
      }
      Alert.alert('Connected', 'Google Calendar is already connected.');
      return;
    }

    const resolvedFamilyId = familyId || session?.family_id || null;
    if (!resolvedFamilyId) {
      Alert.alert('Not ready yet', 'Please finish loading your family profile, then try again.');
      return;
    }

    const { data, error } = await startGoogleCalendarOAuth({ familyId: resolvedFamilyId });
    if (error || !data?.auth_url) {
      Alert.alert('Connection failed', error?.message || 'Failed to start Google Calendar connection.');
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const popup = window.open(
        data.auth_url,
        'Google Calendar OAuth',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );
      if (!popup) {
        Alert.alert('Popup blocked', 'Allow popups for learnadoodle.com and try again.');
        return;
      }
      Alert.alert('Continue in popup', 'Complete Google Calendar connection in the popup window.');
      return;
    }

    Alert.alert('Unsupported', 'Google Calendar connection is currently available in the web app.');
  }, [familyId, session?.family_id, googleCalendarConnected, syncGoogleCalendarIntoPlanner]);
  
  // Scope the remembered planner view per user so a brand-new user's first
  // login always falls back to the Week view instead of inheriting a stale
  // value left in localStorage by a previous session or another account.
  const getPlannerViewStorageKey = () =>
    (authUserId ? `plannerDefaultView:${authUserId}` : null);

  // Get default view from localStorage. Returns null (→ Week) until we know
  // which user is logged in, so the first login can never inherit a stale view.
  const getDefaultView = () => {
    const key = getPlannerViewStorageKey();
    if (key && Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key) || null;
    }
    return null;
  };
  
  // Set default view in localStorage
  const setDefaultView = (view) => {
    const key = getPlannerViewStorageKey();
    if (key && Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, view);
    }
  };
  
  const [defaultView, setDefaultViewState] = useState(() => getDefaultView());
  
  // Get current view from URL params, localStorage default, or week (board)
  const [currentView, setCurrentView] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlView = urlParams.get('view');
      if (urlView) return sanitizeLegacyPlanYearView(urlView);
      // Always default to Week on load; ignore any previously remembered view.
      return PLANNER_DEFAULT_CALENDAR_VIEW;
    }
    return PLANNER_DEFAULT_CALENDAR_VIEW;
  });

  // Close filter dropdown when clicking outside
  useEffect(() => {
    if (filterExpanded && Platform.OS === 'web' && typeof document !== 'undefined') {
      // Use a delayed handler to allow onPress to fire first
      const handleClickOutside = (event) => {
        // Check if click is inside the filter dropdown (button or menu)
        const isInside = event.target.closest('[data-filter-dropdown]');
        if (!isInside) {
          // Small delay to allow onPress handlers to execute first
          setTimeout(() => {
            setFilterExpanded(false);
          }, 200);
        }
      };
      // Use 'click' instead of 'mousedown' to align with React Native Web's onPress
      // Use capture phase to catch early, but with delay to let onPress fire
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside, true);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleClickOutside, true);
      };
    }
  }, [filterExpanded]);

  // Remove focus outline on planner search input
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const style = document.createElement('style');
      style.textContent = `
        #planner-search-input:focus {
          outline: none !important;
          border: none !important;
          box-shadow: none !important;
        }
        #planner-search-input {
          outline: none !important;
          border: none !important;
          box-shadow: none !important;
        }
      `;
      document.head.appendChild(style);
      return () => {
        if (document.head.contains(style)) {
          document.head.removeChild(style);
        }
      };
    }
  }, []);

  // Update filter dropdown position when it opens (web only)
  useEffect(() => {
    if (filterExpanded && Platform.OS === 'web' && filterButtonRef.current) {
      const updatePosition = () => {
        if (filterButtonRef.current) {
          const node = filterButtonRef.current._nativeNode || filterButtonRef.current;
          if (node && typeof node.getBoundingClientRect === 'function') {
            const rect = node.getBoundingClientRect();
            const newPosition = {
              top: rect.bottom + 4, // 4px gap below button
              left: rect.left, // Align left edge with button
            };
            setFilterDropdownPosition(newPosition);
          }
        }
      };
      
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [filterExpanded]);

  // Update view dropdown position when it opens (web only)
  useEffect(() => {
    if (showViewDropdown && Platform.OS === 'web' && viewDropdownButtonRef.current) {
      const updatePosition = () => {
        if (viewDropdownButtonRef.current) {
          const node = viewDropdownButtonRef.current._nativeNode || viewDropdownButtonRef.current;
          if (node && typeof node.getBoundingClientRect === 'function') {
            const rect = node.getBoundingClientRect();
            const newPosition = {
              top: rect.bottom + 4,
              left: rect.left,
            };
            setViewDropdownPosition(newPosition);
          }
        }
      };
      
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [showViewDropdown]);

  // Close view dropdown when clicking outside
  useEffect(() => {
    if (showViewDropdown && Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleClickOutside = (event) => {
        const isInside = event.target.closest('[data-view-dropdown]');
        if (!isInside) {
          setTimeout(() => {
            setShowViewDropdown(false);
          }, 200);
        }
      };
      
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside, true);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleClickOutside, true);
      };
    }
  }, [showViewDropdown]);

  // Update view chip slider position when currentView changes (Month / Week / Year)
  useEffect(() => {
    const chipKeys = ['board', 'month', 'year', 'tasks'];
    if (!chipKeys.includes(currentView)) {
      setViewChipSlider({ left: 0, width: 0 });
      return;
    }
    const layout = viewChipLayouts.current[currentView];
    if (layout) {
      setViewChipSlider({ left: layout.x, width: layout.width });
    }
  }, [currentView]);

  // Handle click outside Filters dropdown
  useEffect(() => {
    if (showFiltersDropdown && Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleClickOutside = (event) => {
        const buttonNode = topToolbarFiltersButtonRef.current?._nativeNode || topToolbarFiltersButtonRef.current;
        const dropdownNode = filtersDropdownRef.current?._nativeNode || filtersDropdownRef.current;
        
        const target = event.target;
        const isInsideButton = buttonNode && (buttonNode === target || buttonNode.contains(target));
        const isInsideDropdown = dropdownNode && (dropdownNode === target || dropdownNode.contains(target));
        
        if (!isInsideButton && !isInsideDropdown) {
          setShowFiltersDropdown(false);
        }
      };
      
      document.addEventListener('click', handleClickOutside, true);
      
      return () => {
        document.removeEventListener('click', handleClickOutside, true);
      };
    }
  }, [showFiltersDropdown]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const openPlanWeek = () => setShowPlanWeekModal(true);
    const openFilters = () => {
      updateFiltersDropdownPosition();
      setShowFiltersDropdown(true);
    };
    window.addEventListener('openPlanWeekModal', openPlanWeek);
    window.addEventListener('openPlannerFilters', openFilters);
    return () => {
      window.removeEventListener('openPlanWeekModal', openPlanWeek);
      window.removeEventListener('openPlannerFilters', openFilters);
    };
  }, [updateFiltersDropdownPosition]);

  const plannerSettingsPopoverRef = useRef(null);
  useEffect(() => {
    if (showPlannerSettingsPopover && Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleClickOutside = (event) => {
        const buttonNode = settingsButtonRef.current?._nativeNode || settingsButtonRef.current;
        const popoverNode = plannerSettingsPopoverRef.current?._nativeNode || plannerSettingsPopoverRef.current;
        const target = event.target;
        const isInsideButton = buttonNode && (buttonNode === target || buttonNode.contains(target));
        const isInsidePopover = popoverNode && (popoverNode === target || popoverNode.contains(target));
        if (!isInsideButton && !isInsidePopover) {
          setShowPlannerSettingsPopover(false);
        }
      };
      document.addEventListener('click', handleClickOutside, true);
      return () => document.removeEventListener('click', handleClickOutside, true);
    }
  }, [showPlannerSettingsPopover]);

  // Calculate dropdown position when it opens
  useEffect(() => {
    if (showViewDropdown && Platform.OS === 'web' && viewDropdownButtonRef.current) {
      const updatePosition = () => {
        if (viewDropdownButtonRef.current) {
          const rect = viewDropdownButtonRef.current.getBoundingClientRect();
          const newPosition = {
            top: rect.bottom + 4,
            left: rect.left, // Align left edge of dropdown with left edge of button
          };
          setDropdownPosition(newPosition);
          
          // Directly update DOM element styles for immediate effect
          // Use setTimeout to ensure the element is mounted
          setTimeout(() => {
            if (viewDropdownMenuRef.current) {
              const menuElement = viewDropdownMenuRef.current._nativeNode || viewDropdownMenuRef.current;
              if (menuElement) {
                // Try multiple ways to access the DOM element
                let domElement = menuElement;
                if (menuElement._nativeNode) {
                  domElement = menuElement._nativeNode;
                } else if (menuElement.nodeType === undefined && menuElement.firstChild) {
                  // React Native Web wraps elements
                  domElement = menuElement.firstChild || menuElement;
                }
                
                if (domElement && domElement.style) {
                  domElement.style.position = 'fixed';
                  domElement.style.top = `${newPosition.top}px`;
                  domElement.style.left = `${newPosition.left}px`;
                  domElement.style.zIndex = '10000';
                }
              }
            }
          }, 0);
        }
      };
      
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [showViewDropdown]);

  // Close context menu when dropdown closes
  useEffect(() => {
    if (!showViewDropdown) {
      setContextMenuView(null);
    }
  }, [showViewDropdown]);

  // Listen for openQuickReschedule event from right-click menu or conflict banner
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleOpenQuickReschedule = (event) => {
      const eventData = event.detail?.event;
      const skipToPreview = event.detail?.skipToPreview || false;
      if (eventData) {
        setQuickRescheduleInitialEvent({ ...eventData, skipToPreview });
        setShowQuickRescheduleModal(true);
      }
    };

    window.addEventListener('openQuickReschedule', handleOpenQuickReschedule);
    return () => {
      window.removeEventListener('openQuickReschedule', handleOpenQuickReschedule);
    };
  }, []);
  
  // Attach native right-click handlers to view items using refs
  useEffect(() => {
    if (!showViewDropdown || Platform.OS !== 'web' || typeof document === 'undefined') {
      // Clean up refs when dropdown closes
      Object.values(viewItemRefs.current).forEach(ref => {
        if (ref && ref._nativeNode) {
          const node = ref._nativeNode;
          const handler = node._contextMenuHandler;
          if (handler) {
            node.removeEventListener('contextmenu', handler);
            delete node._contextMenuHandler;
          }
        }
      });
      return;
    }
    
    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      Object.keys(viewItemRefs.current).forEach(viewKey => {
        const ref = viewItemRefs.current[viewKey];
        if (!ref) return;
        
        const node = ref._nativeNode || ref;
        if (!node || typeof node.addEventListener !== 'function') return;
        
        // Remove existing handler if any
        if (node._contextMenuHandler) {
          node.removeEventListener('contextmenu', node._contextMenuHandler);
        }
        
        // Create new handler
        const handleContextMenu = (e) => {
          if (viewKey === 'tasks') return; // Don't allow setting tasks as default
          
          e.preventDefault();
          e.stopPropagation();
          
          console.log('[WebLayout] Right-click detected on view (ref-based):', viewKey);
          const rect = node.getBoundingClientRect();
          const position = {
            top: rect.top,
            left: rect.right + 8, // Position to the right of the item with 8px gap
          };
          console.log('[WebLayout] Setting context menu position:', position);
          setContextMenuPosition(position);
          setContextMenuView(viewKey);
        };
        
        node._contextMenuHandler = handleContextMenu;
        node.addEventListener('contextmenu', handleContextMenu);
        console.log('[WebLayout] Attached contextmenu listener to view:', viewKey);
      });
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      Object.values(viewItemRefs.current).forEach(ref => {
        if (ref && ref._nativeNode) {
          const node = ref._nativeNode;
          const handler = node._contextMenuHandler;
          if (handler) {
            node.removeEventListener('contextmenu', handler);
            delete node._contextMenuHandler;
          }
        }
      });
    };
  }, [showViewDropdown]);


  // Close view dropdown when clicking outside
  useEffect(() => {
    if (!showViewDropdown || Platform.OS !== 'web' || typeof document === 'undefined') {
      // Clean up handler if dropdown is closed
      if (viewDropdownHandlerRef.current) {
        document.removeEventListener('mousedown', viewDropdownHandlerRef.current);
        viewDropdownHandlerRef.current = null;
      }
      return;
    }
    
    // Use a longer delay to prevent immediate closure when opening
    // This gives React time to update the DOM and attach event handlers
    const timeoutId = setTimeout(() => {
      const handleClickOutside = (event) => {
        // Don't close context menu on right-click
        if (event.button === 2 || event.which === 3) {
          return;
        }
        
        // Close context menu if clicking outside
        if (contextMenuView) {
          // Check if click is inside context menu
          const contextMenuElement = document.querySelector('[data-context-menu="view-default"]');
          if (contextMenuElement && contextMenuElement.contains(event.target)) {
            return; // Click is inside context menu, don't close
          }
          setContextMenuView(null);
        }
        
        // Check if dropdown is actually visible by checking DOM state
        const menu = viewDropdownMenuRef.current;
        const menuNode = menu ? (menu._nativeNode || menu) : null;
        const isDropdownVisible = menuNode && menuNode.offsetParent !== null && window.getComputedStyle(menuNode).display !== 'none';
        
        if (!isDropdownVisible) {
          return;
        }
        
        // Check if click is inside the dropdown - check for data attribute first (fastest)
        let currentElement = event.target;
        let isInside = false;
        
        // Check for data attribute as we traverse up
        while (currentElement && currentElement !== document.body) {
          if (currentElement.getAttribute && currentElement.getAttribute('data-view-dropdown') !== null) {
            isInside = true;
            break;
          }
          currentElement = currentElement.parentElement;
        }
        
        // If not found via data attribute, check refs
        if (!isInside) {
          const container = viewDropdownContainerRef.current;
          if (container) {
            const domNode = container._nativeNode || container;
            if (domNode && typeof domNode.contains === 'function' && domNode.contains(event.target)) {
              isInside = true;
            }
          }
        }
        
        if (!isInside && menuNode) {
          if (menuNode.contains && menuNode.contains(event.target)) {
            isInside = true;
          }
        }
        
        if (!isInside && isDropdownVisible) {
          setShowViewDropdown(false);
          setContextMenuView(null);
        }
      };
      
      // Remove any existing handler first
      if (viewDropdownHandlerRef.current) {
        document.removeEventListener('click', viewDropdownHandlerRef.current);
      }
      
      // Store and add new handler with delay to allow onPress to fire first
      const delayedHandler = (event) => {
        // Small delay to let React Native's onPress fire first
        setTimeout(() => {
          handleClickOutside(event);
        }, 150);
      };
      
      viewDropdownHandlerRef.current = delayedHandler;
      // Use bubble phase so React Native's onPress fires first
      document.addEventListener('click', delayedHandler);
    }, 200);
    
    return () => {
      clearTimeout(timeoutId);
      if (viewDropdownHandlerRef.current) {
        document.removeEventListener('click', viewDropdownHandlerRef.current);
        viewDropdownHandlerRef.current = null;
      }
    };
  }, [showViewDropdown, contextMenuView]);

  // Sync current view from URL params and listen for changes
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const updateView = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const urlView = urlParams.get('view');
        // If URL has a view param (deep link), use it; otherwise default to Week.
        if (urlView) {
          setCurrentView(sanitizeLegacyPlanYearView(urlView));
        } else {
          setCurrentView(PLANNER_DEFAULT_CALENDAR_VIEW);
        }
      };
      
      // Initial sync
      updateView();
      
      // Listen for URL changes (popstate event)
      window.addEventListener('popstate', updateView);
      
      // Listen for plannerViewChange events (e.g. from month day click → board)
      const handleViewChange = (event) => {
        const newView = sanitizeLegacyPlanYearView(event.detail);
        setCurrentView(newView);
        // Clear right-toolbar focus when returning to main planner segments
        if (['month', 'board', 'tasks', 'year'].includes(newView)) {
          setActiveRightTool(null);
        }
        const url = new URL(window.location.href);
        const normalizedView = String(newView || '').toLowerCase();
        if (normalizedView === 'board' || normalizedView === 'week') {
          url.searchParams.delete('view');
        } else {
          url.searchParams.set('view', newView);
        }
        window.history.replaceState({}, '', url.toString());
      };
      window.addEventListener('plannerViewChange', handleViewChange);
      
      return () => {
        window.removeEventListener('popstate', updateView);
        window.removeEventListener('plannerViewChange', handleViewChange);
      };
    }
  }, []);

  // Once the logged-in user resolves, default the planner to Week on login.
  // We never override an explicit ?view= deep link or manual selection.
  useEffect(() => {
    if (!authUserId || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const urlView = new URLSearchParams(window.location.search).get('view');
    if (urlView) return;
    setCurrentView(PLANNER_DEFAULT_CALENDAR_VIEW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId]);

  // Handle view change
  const handleViewChange = (view) => {
    console.log('[WebLayout] handleViewChange called with view:', view);
    setCurrentView(view);
    // Note: setShowViewDropdown is now called in onPress to close immediately
    
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const normalizedView = String(view || '').toLowerCase();
      if (normalizedView === 'board' || normalizedView === 'week') {
        url.searchParams.delete('view');
      } else {
        url.searchParams.set('view', view);
      }
      window.history.replaceState({}, '', url.toString());
      
      // Dispatch event to update WebContent
      console.log('[WebLayout] Dispatching plannerViewChange event with view:', view);
      window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: view }));
    }
  };

  // Handle tasks view - open tasks tool
  const handleTasksView = () => {
    setShowViewDropdown(false);
    setContextMenuView(null);
    if (typeof window !== 'undefined') {
      // Dispatch plannerViewChange event to switch to tasks view
      console.log('[WebLayout] Dispatching plannerViewChange event with view: tasks');
      window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'tasks' }));
    }
  };
  
  const activeChildName = useMemo(() => {
    if (!activeSubtab || !children?.length) return null;
    const child = children.find((c) => String(c.id) === String(activeSubtab));
    return child?.first_name || child?.name || null;
  }, [activeSubtab, children]);

  // Fetch user role and profile
  useEffect(() => {
    const fetchUserRole = async () => {
      if (!authUserId) return;
      try {
        const { getMe } = await import('../lib/apiClient');
        const { data: meData, error: meError } = await getMe();
        
        // Handle 401 errors gracefully (backend might not be running or auth not ready)
        const isAuthError = meError?.status === 401 || meError?.response?.status === 401;
        
        // Web production can block direct Supabase REST via browser policy/CORS checks; keep backend as source of truth there.
        let profileData = null;
        if (Platform.OS !== 'web') {
          const profileRes = await supabase
            .from('profiles')
            .select('role, email, name, first_name, phone, avatar_url, app_preferences, family_id')
            .eq('id', authUserId)
            .maybeSingle();
          profileData = profileRes?.data || null;
        }

        if (!meError && meData) {
          const mergedProfile = {
            ...meData,
            // Prefer profiles table for editable fields; email must be logged-in user's (child sees own email, not parent's)
            name: profileData?.name || profileData?.first_name || meData.name || meData.first_name || '',
            first_name: profileData?.first_name || meData.first_name || '',
            email: user.email || profileData?.email || meData.email,
            phone: profileData?.phone || meData.phone || '',
            avatar_url: profileData?.avatar_url || meData.avatar_url || null,
            app_preferences: profileData?.app_preferences ?? null,
            family_id: profileData?.family_id ?? meData?.family_id ?? null,
          };
          setUserRole(meData.role || profileData?.role || 'parent');
          setProfile(mergedProfile);
        } else if (!isAuthError) {
          // Only log non-auth errors
          const isConnectivityNoise = /Cannot connect to backend server|Request timed out|Load failed|Failed to fetch/i.test(String(meError?.message || ''));
          if (!isConnectivityNoise) {
            console.warn('[WebLayout] getMe error (non-critical):', meError);
          }
        }
        
        // Fallback to profile table only when /me is unavailable.
        if (!meData) {
          if (profileData) {
            setUserRole(profileData.role || 'parent');
            setProfile({
              role: profileData.role || 'parent',
              email: user.email || profileData.email,
              name: profileData.name || profileData.first_name || '',
              first_name: profileData.first_name || '',
              phone: profileData.phone || '',
              avatar_url: profileData.avatar_url || null,
              app_preferences: profileData.app_preferences ?? null,
              family_id: profileData.family_id ?? null,
            });
          } else {
            setUserRole('parent'); // Default fallback
            setProfile({
              role: 'parent',
              email: user.email
            });
          }
        }
        if (profileData?.family_id) {
          setFamilyId((fid) => fid || profileData.family_id);
        }
      } catch (error) {
        // Silent fallback - don't log errors here
        setUserRole('parent');
        setProfile({
          role: 'parent',
          email: user.email
        });
      }
    };
    fetchUserRole();
  }, [authUserId, user?.email]);

  // Refresh profile when settings updates it
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !authUserId) return;

    const handleRefreshProfile = async () => {
      try {
        const { getMe } = await import('../lib/apiClient');
        const { data: meData, error: meError } = await getMe();

        let profileData = null;
        if (Platform.OS !== 'web') {
          const profileRes = await supabase
            .from('profiles')
            .select('role, email, name, first_name, phone, avatar_url, app_preferences, family_id')
            .eq('id', authUserId)
            .maybeSingle();
          profileData = profileRes?.data || null;
        }

        if (!meError && meData) {
          const mergedProfile = {
            ...meData,
            name: profileData?.name || profileData?.first_name || meData.name || meData.first_name || '',
            first_name: profileData?.first_name || meData.first_name || '',
            email: user.email || profileData?.email || meData.email,
            phone: profileData?.phone || meData.phone || '',
            avatar_url: profileData?.avatar_url || meData.avatar_url || null,
            app_preferences: profileData?.app_preferences ?? null,
            family_id: profileData?.family_id ?? meData?.family_id ?? null,
          };
          setUserRole(meData.role || profileData?.role || 'parent');
          setProfile(mergedProfile);
          if (profileData?.family_id) {
            setFamilyId((fid) => fid || profileData.family_id);
          }
          return;
        }

        if (!meData && profileData) {
          setUserRole(profileData.role || 'parent');
          setProfile({
            role: profileData.role || 'parent',
            email: user.email || profileData.email,
            name: profileData.name || profileData.first_name || '',
            first_name: profileData.first_name || '',
            phone: profileData.phone || '',
            avatar_url: profileData.avatar_url || null,
            app_preferences: profileData.app_preferences ?? null,
            family_id: profileData.family_id ?? null,
          });
          if (profileData.family_id) {
            setFamilyId((fid) => fid || profileData.family_id);
          }
        }
      } catch (error) {
        // Silent fallback
      }
    };

    window.addEventListener('refreshProfile', handleRefreshProfile);
    return () => {
      window.removeEventListener('refreshProfile', handleRefreshProfile);
    };
  }, [authUserId, user?.email]);

  const fetchFamilyMembers = useCallback(async () => {
    if (!authUserId || (!sessionFamilyId && !familyId)) return;
    try {
      let resolvedFamilyId = sessionFamilyId || familyId || null;
      if (!resolvedFamilyId && Platform.OS !== 'web') {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('family_id')
          .eq('id', authUserId)
          .maybeSingle();
        resolvedFamilyId = profileData?.family_id || null;
      }
      if (resolvedFamilyId) {
        setFamilyId(resolvedFamilyId);
        // A child/student must only ever see their own child record(s), never siblings'.
        const scopeChildrenToViewer = (list) => {
          if (!sessionIsChild || !Array.isArray(viewerScopedChildIds) || viewerScopedChildIds.length === 0) {
            return list;
          }
          const allowed = new Set(viewerScopedChildIds.map(String));
          return (list || []).filter((c) => allowed.has(String(c?.id)));
        };
        try {
          const { data: childrenData, error: childrenError } = await supabase
            .from('children')
            .select('*')
            .eq('family_id', resolvedFamilyId)
            // Treat NULL archived as not-archived; `.eq('archived', false)` alone drops
            // rows where archived was never backfilled, hiding a child from the planner.
            .or('archived.eq.false,archived.is.null');
          
          if (childrenError) {
            // Try without archived filter if that fails
            if (childrenError.code === '400' || childrenError.code === 'PGRST301' || childrenError.code === '42703') {
              const { data: allData } = await supabase
                .from('children')
                .select('*')
                .eq('family_id', resolvedFamilyId);
              // Validate and clean avatar URLs
              const cleaned = (allData || []).map(child => ({
                ...child,
                avatar_url: validateChildAvatarUrl(child.avatar_url || child.avatar),
                avatar: validateChildAvatarUrl(child.avatar) ?? null
              }));
              setChildren(scopeChildrenToViewer(cleaned));
            } else {
              console.warn('[WebLayout] Error fetching children:', childrenError);
              setChildren([]);
            }
          } else {
            // Validate and clean avatar URLs
            const cleaned = (childrenData || []).map(child => ({
              ...child,
              avatar_url: validateChildAvatarUrl(child.avatar_url || child.avatar),
              avatar: validateChildAvatarUrl(child.avatar) ?? null
            }));
            setChildren(scopeChildrenToViewer(cleaned));
          }
          
          // Also fetch subjects for diff modal (only if not already loaded)
          // Subjects are static backend data - load once and cache
          if (!subjectsLoaded) {
            try {
              const { data: subjectsData } = await supabase
                .from('subject')
                .select('id, name')
                .eq('family_id', resolvedFamilyId)
                .order('name');
              setSubjects(subjectsData || []);
              setSubjectsLoaded(true); // Mark as loaded so we don't reload
            } catch (subjectsErr) {
              console.warn('[WebLayout] Error fetching subjects:', subjectsErr);
              setSubjects([]);
              setSubjectsLoaded(true); // Mark as loaded even on error to prevent retry loops
            }
          }
          
          // Also fetch full subject data for FamilyPanel courses section (only if not already loaded)
          // Preload this on initial app load to avoid loading delay when visiting courses section
          if (!fullSubjectsLoaded) {
            try {
              const { data: fullSubjectsData } = await supabase
                .from('subject')
                .select('id, name, child_id, grade, notes, created_at, updated_at, default_constraint_mode, default_target_days, default_target_hours')
                .eq('family_id', resolvedFamilyId)
                .order('name');
              setFullSubjects(fullSubjectsData || []);
              setFullSubjectsLoaded(true); // Mark as loaded so we don't reload
            } catch (fullSubjectsErr) {
              console.warn('[WebLayout] Error fetching full subjects:', fullSubjectsErr);
              setFullSubjects([]);
              setFullSubjectsLoaded(true); // Mark as loaded even on error to prevent retry loops
            }
          }
        } catch (err) {
          console.warn('[WebLayout] Exception fetching children:', err);
          setChildren([]);
        }
      } else {
        setChildren([]);
      }
    } catch (error) {
      console.error('[WebLayout] Unable to load family children', error);
      setChildren([]);
    }
  }, [authUserId, sessionFamilyId, familyId, subjectsLoaded, fullSubjectsLoaded]);

  const fetchFamilyData = useCallback(async () => {
    if (!authUserId) return;
    try {
      const { data, error } = await getFamilyMembers();
      if (!error && data) {
        setFamily(data);
        if (data.id) {
          setFamilyId(data.id);
        }
      }
    } catch (error) {
      console.error('[WebLayout] Unable to load family data', error);
    }
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId || !sessionFamilyId) return;
    if (!isUuidLike(sessionFamilyId)) return;
    if (onboardingBlocked) return;
    let mounted = true;
    const fetchAcademicYears = async () => {
      let result = await supabase
        .from('academic_years')
        .select('id, start_date, end_date, year_name')
        .eq('family_id', sessionFamilyId)
        .order('updated_at', { ascending: false })
        .limit(24);
      if (
        result?.error
        && String(result.error?.message || result.error?.details || '').toLowerCase().includes('year_name')
      ) {
        // Older DBs may not have year_name yet; fall back to core columns.
        result = await supabase
          .from('academic_years')
          .select('id, start_date, end_date')
          .eq('family_id', sessionFamilyId)
          .order('updated_at', { ascending: false })
          .limit(24);
      }
      const { data, error } = result;
      if (!mounted) return;
      if (error) {
        setPreloadedAcademicYears([]);
        return;
      }
      const seen = new Set();
      const list = (data || []).filter((ay) => {
        const start = (ay.start_date && String(ay.start_date).slice(0, 10)) || '';
        const end = (ay.end_date && String(ay.end_date).slice(0, 10)) || '';
        const key = `${start}_${end}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setPreloadedAcademicYears(list);
    };
    const fetchFamilyAssignments = async () => {
      const { data, error } = await supabase
        .from('assignments')
        .select(
          '*, child:child_id (id, first_name, avatar), subject:related_subject (id, name)'
        )
        .eq('family_id', sessionFamilyId)
        .order('updated_at', { ascending: false })
        .limit(120);
      if (!mounted) return;
      if (error) {
        setPreloadedFamilyAssignments([]);
        return;
      }
      setPreloadedFamilyAssignments(data || []);
    };
    setPreloadedFamilyAssignments(null);
    setPreloadedAcademicYears(null);
    preloadBulletinBoardForFamily(sessionFamilyId).catch(() => {});
    Promise.all([
      fetchFamilyMembers(),
      fetchFamilyData(),
    ]).catch(() => {});
    const runDeferredPreloads = () => {
      fetchAcademicYears().catch(() => {
        if (mounted) setPreloadedAcademicYears([]);
      });
      fetchFamilyAssignments().catch(() => {
        if (mounted) setPreloadedFamilyAssignments([]);
      });
      preloadBulletinBoardForFamily(sessionFamilyId).catch(() => {});
      prefetchPlanEditListForFamily(sessionFamilyId).catch(() => {});
    };
    let idleHandle = null;
    let timeoutHandle = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(() => {
        if (!mounted) return;
        runDeferredPreloads();
      }, { timeout: 1800 });
    } else {
      timeoutHandle = setTimeout(() => {
        if (!mounted) return;
        runDeferredPreloads();
      }, 900);
    }
    return () => {
      mounted = false;
      if (Platform.OS === 'web' && typeof window !== 'undefined' && idleHandle != null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle != null) clearTimeout(timeoutHandle);
    };
  }, [fetchFamilyData, fetchFamilyMembers, authUserId, sessionFamilyId, onboardingBlocked]);

  // Resolve onboarding status before showing main content so we never flash landing without modal
  useEffect(() => {
    if (!authUserId || !hasSession) {
      setOnboardingCheckDone(true);
      setInitialOnboardingBlocked(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getOnboardingStatus();
        const data = res?.data ?? res;
        if (cancelled) return;
        setOnboardingCheckDone(true);
        setInitialOnboardingBlocked(!data?.onboarding_completed);
      } catch (_) {
        if (!cancelled) {
          setOnboardingCheckDone(true);
          setInitialOnboardingBlocked(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [authUserId, hasSession]);

  // Onboarding path: brief delay so modal can mount under loader. Skipped when not blocked (faster shell).
  useEffect(() => {
    if (!onboardingCheckDone) {
      setOnboardingUiReady(false);
      return;
    }
    if (!onboardingBlocked) {
      setOnboardingUiReady(true);
      return;
    }
    const id = setTimeout(() => setOnboardingUiReady(true), 50);
    return () => clearTimeout(id);
  }, [onboardingCheckDone, onboardingBlocked]);

  // New signup: ensure family exists so onboarding modal has familyId (backend creates family + links profile)
  const ensureFamilyInFlightRef = useRef(false);
  const ensureFamilyAndSet = useCallback(async () => {
    if (ensureFamilyInFlightRef.current) return null;
    ensureFamilyInFlightRef.current = true;
    const tryOnce = async () => {
      const res = await ensureFamily();
      const fid = res?.data?.family_id;
      if (fid) {
        setFamilyId(fid);
        fetchFamilyData();
        fetchFamilyMembers();
        return { fid, status: res?.error?.status };
      }
      return { fid: null, status: res?.error?.status };
    };
    try {
      let { fid, status } = await tryOnce();
      if (fid) return fid;
      // 404 = route missing; 500 = backend/db error (e.g. missing GRANT). Retry once after delay.
      if (status === 404 || status === 500) {
        await new Promise(r => setTimeout(r, 800));
        const retry = await tryOnce();
        if (retry.fid) return retry.fid;
      }
      return null;
    } catch (_) {
      return null;
    } finally {
      ensureFamilyInFlightRef.current = false;
    }
  }, [fetchFamilyData, fetchFamilyMembers]);

  useEffect(() => {
    if (!authUserId || !sessionIsParent || familyId || !hasSession || session?.loading !== false) return;
    let cancelled = false;
    ensureFamilyAndSet().then(() => { if (!cancelled) {} });
    return () => { cancelled = true; };
  }, [authUserId, sessionIsParent, familyId, hasSession, session?.loading, ensureFamilyAndSet]);

  // Listen for children refresh events
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleRefreshChildren = () => {
      fetchFamilyMembers();
      fetchFamilyData();
    };
    window.addEventListener('refreshChildren', handleRefreshChildren);
    return () => {
      window.removeEventListener('refreshChildren', handleRefreshChildren);
    };
  }, [fetchFamilyData, fetchFamilyMembers]);

  // After edit-child save: apply authoritative row immediately so planner/home chips match new avatar (before refetch can return stale).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onProfile = (e) => {
      const row = e?.detail?.child;
      if (!row?.id) return;
      setChildren((prev) => mergeUpdatedChildIntoList(prev, row));
    };
    window.addEventListener('childProfileUpdated', onProfile);
    return () => window.removeEventListener('childProfileUpdated', onProfile);
  }, []);

  // Listen for subjects refresh (e.g. after onboarding, adding from Plan Year)
  const refetchSubjects = useCallback(async () => {
    if (!familyId) return;
    try {
      const { data: subjectsData } = await supabase
        .from('subject')
        .select('id, name')
        .eq('family_id', familyId)
        .order('name');
      setSubjects(subjectsData || []);
      // Also refetch full subject data (including planning targets) for Plan Year / courses / preferences UIs
      const { data: fullSubjectsData } = await supabase
        .from('subject')
        .select('id, name, child_id, grade, notes, created_at, updated_at, default_constraint_mode, default_target_days, default_target_hours')
        .eq('family_id', familyId)
        .order('name');
      setFullSubjects(fullSubjectsData || []);
    } catch (err) {
      console.warn('[WebLayout] Error refetching subjects:', err);
    }
  }, [familyId]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleRefreshSubjects = () => refetchSubjects();
    window.addEventListener('refreshSubjects', handleRefreshSubjects);
    return () => window.removeEventListener('refreshSubjects', handleRefreshSubjects);
  }, [refetchSubjects]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const handlePlanningModeChanged = (event) => {
      const nextMode = event?.detail?.default_planning_mode;
      if (nextMode !== undefined && nextMode !== null) {
        setFamily((prev) => (prev ? { ...prev, default_planning_mode: nextMode } : prev));
      }
    };
    const handleRefreshFamily = (event) => {
      const nextMode = event?.detail?.default_planning_mode;
      if (nextMode !== undefined && nextMode !== null) {
        setFamily((prev) => (prev ? { ...prev, default_planning_mode: nextMode } : prev));
        return;
      }
      fetchFamilyData();
    };
    window.addEventListener('planningModeChanged', handlePlanningModeChanged);
    window.addEventListener('refreshFamily', handleRefreshFamily);
    return () => {
      window.removeEventListener('planningModeChanged', handlePlanningModeChanged);
      window.removeEventListener('refreshFamily', handleRefreshFamily);
    };
  }, [fetchFamilyData]);

  // When onboarding completes (modal or event), close modal optimistically and refresh family/calendar/children/subjects
  const applyOnboardingCompleted = useCallback(async (eventDetail = {}) => {
    setOnboardingJustCompleted(true);
    setInitialOnboardingBlocked(false);
    fetchFamilyData();
    fetchFamilyMembers();
    window.dispatchEvent(new CustomEvent('refreshCalendar'));
    window.dispatchEvent(new CustomEvent('refreshChildren'));
    window.dispatchEvent(new CustomEvent('refreshSubjects'));

    const fid = eventDetail?.familyId || familyId || sessionFamilyId;
    const planningMode =
      eventDetail?.planningMode
      || family?.default_planning_mode
      || null;
    if (!fid) return;

    invalidateBulletinPostsCache(fid);
    try {
      const seedResult = await seedHomeWelcomeBulletinPost({ familyId: fid, planningMode });
      if (seedResult?.error) {
        console.warn('[WebLayout] home welcome bulletin', seedResult.error);
      }
    } catch (seedErr) {
      console.warn('[WebLayout] home welcome bulletin', seedErr);
    }
    invalidateBulletinPostsCache(fid);
    window.dispatchEvent(new CustomEvent('refreshBulletinBoard', { detail: { familyId: fid } }));
    preloadBulletinBoardForFamily(fid).catch(() => {});
  }, [fetchFamilyData, fetchFamilyMembers, familyId, sessionFamilyId, family?.default_planning_mode]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleOnboardingCompleted = (event) => {
      applyOnboardingCompleted(event?.detail || {});
    };
    window.addEventListener('onboardingCompleted', handleOnboardingCompleted);
    const unsubscribeCrossTab = subscribeOnboardingCompleted(applyOnboardingCompleted);
    return () => {
      window.removeEventListener('onboardingCompleted', handleOnboardingCompleted);
      unsubscribeCrossTab();
    };
  }, [applyOnboardingCompleted]);

  // Another tab may finish onboarding first — poll status while this tab is still blocked.
  useEffect(() => {
    if (!onboardingBlocked || !authUserId || !hasSession) return undefined;
    let cancelled = false;
    const syncFromServer = async () => {
      try {
        const res = await getOnboardingStatus();
        const data = res?.data ?? res;
        if (cancelled || !data?.onboarding_completed) return;
        applyOnboardingCompleted({ planningMode: data.default_planning_mode || null });
      } catch (_) {
        /* ignore transient API errors */
      }
    };
    syncFromServer();
    const id = setInterval(syncFromServer, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [onboardingBlocked, authUserId, hasSession, applyOnboardingCompleted]);

  // Handle URL-based routing for subject detail pages
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const isPageReload = () => {
      try {
        const navEntry = window.performance?.getEntriesByType?.('navigation')?.[0];
        if (navEntry && navEntry.type === 'reload') return true;
        // Fallback for older navigation timing API.
        if (window.performance?.navigation?.type === 1) return true;
      } catch (_) {}
      return false;
    };

    const checkUrlRoute = () => {
      if (isPageReload()) {
        window.history.replaceState({}, '', '/');
        setIsMessagesPaneOpen(false);
        setIsCreatePaneOpen(false);
        setActiveTab('home');
        setActiveTopNav((prev) => (prev === 'family' ? prev : 'home'));
        return;
      }
      const pathnameRaw = window.location.pathname || '/';
      const pathname = pathnameRaw.replace(/\/$/, '') || '/';
      const subjectDetailMatch = pathname.match(/^\/subjects\/([^/]+)$/);
      
      if (subjectDetailMatch) {
        const subjectId = subjectDetailMatch[1];
        const expectedTab = `subject-${subjectId}`;
        setActiveTab(expectedTab);
        setActiveTopNav('subjects');
      } else if (pathname === '/learning' || pathname === '/subject-catalog') {
        window.history.replaceState({}, '', '/subjects');
        setActiveTab('subjects');
        setActiveTopNav('subjects');
      } else if (pathname === '/subjects' || pathname === '/intelligence') {
        // Keep legacy /intelligence compatible but normalize to /subjects.
        if (pathname === '/intelligence') {
          window.history.replaceState({}, '', '/subjects');
        }
        setActiveTab('subjects');
        setActiveTopNav('subjects');
      } else if (pathname === '/planner/preferences') {
        if (isFamilyShellTab(activeTabRef.current)) {
          return;
        }
        setActiveTab('settings');
        setActiveSubtab('planner-settings');
        setActiveTopNav('planning-preferences');
      } else if (pathname === '/planner') {
        // Family panel uses pushState for About/Terms/Privacy; URL may still be /planner after switching to Family without a replace.
        if (isFamilyShellTab(activeTabRef.current)) {
          return;
        }
        if (activeTab !== 'planner') {
          setActiveTab('planner');
          setActiveTopNav('planner');
        }
        const urlParams = new URLSearchParams(window.location.search);
        const view = urlParams.get('view');
        if (view) {
          setCurrentView(view);
        }
      } else if (pathname === '/messages') {
        if (!isFamilyShellTab(activeTabRef.current)) {
          setIsMessagesPaneOpen(true);
          setActiveTopNav('messages');
        }
      } else if (pathname === '/materials' || pathname === '/library') {
        if (pathname === '/materials') {
          window.history.replaceState({}, '', '/library');
        }
        if (isFamilyShellTab(activeTabRef.current)) {
          return;
        }
        if (activeTab !== 'materials') {
          setActiveTab('materials');
          setActiveTopNav('materials');
        }
      } else if (pathname === '/records') {
        if (activeTab !== 'records') {
          setActiveTab('records');
          setActiveTopNav('records');
        }
      } else if (pathname === '/family' || pathname === '/profile') {
        if (pathname === '/profile') {
          window.history.replaceState({}, '', '/family');
        }
        if (activeTab !== 'family' && activeTab !== 'profile') {
          setActiveTab('family');
          setActiveTopNav('family');
        }
      } else if (pathname === '/students') {
        if (activeTab !== 'tutor-students') {
          setActiveTab('tutor-students');
          setActiveTopNav('tutor-students');
        }
      } else if (pathname === '/' || pathname === '/home') {
        // Family stays on `/` but uses pushState for About/Terms/Privacy. Forcing Home on popstate
        // must not run for any family shell tab (settings, profile, child-*, etc.).
        if (!isFamilyShellTab(activeTabRef.current)) {
          setActiveTab('home');
          setActiveTopNav((prev) => (prev === 'family' ? prev : 'home'));
        }
      }
    };

    // Only check on mount and popstate, not on every activeTab change
    checkUrlRoute();
    
    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', checkUrlRoute);
    
    return () => {
      window.removeEventListener('popstate', checkUrlRoute);
    };
  }, []); // Empty deps - only run on mount and popstate

  useEffect(() => {
    // Handle child tabs from sidebar (child-{id})
    if (activeTab && activeTab.startsWith('child-')) {
      const childId = activeTab.replace('child-', '');
      setActiveChildId(childId);
      return;
    }
    if (activeTab === 'settings') {
      // Preserve activeChildId so Profile can show the child's email when parent is "viewing as" that child
      return;
    }
    if (activeTab === 'children-list') {
      const subtabIsChildId =
        activeSubtab &&
        Array.isArray(children) &&
        children.some((c) => String(c.id) === String(activeSubtab));
      if (subtabIsChildId) {
        setActiveChildId(activeSubtab);
      }
    }
    // Parent "viewing as child" persists across tabs until handleExitChildView clears activeChildId.
  }, [activeTab, activeSubtab, children]);

  const syncTopNavFromActiveTab = useCallback(() => {
    if (activeTab === 'home') {
      setActiveTopNav((prev) => (prev === 'family' ? prev : 'home'));
    } else if (activeTab === 'explore') {
      setActiveTopNav('explore');
    } else if (activeTab === 'calendar' || activeTab === 'planner') {
      setActiveTopNav((prev) => (prev === 'family' ? prev : 'planner'));
    } else if (activeTab === 'records') {
      setActiveTopNav('records');
    } else if (activeTab === 'family') {
      setActiveTopNav('family');
    } else if (
      (activeTab === 'subjects' || activeTab === 'learning')
      && activeSubtab === 'materials'
    ) {
      setActiveTopNav('materials');
    } else if (activeTab === 'materials') {
      setActiveTopNav('materials');
    } else if (activeTab === 'learning') {
      setActiveTopNav('learning');
    } else if (activeTab === 'subjects' || (activeTab && activeTab.startsWith('subject-'))) {
      setActiveTopNav('subjects');
    } else if (activeTab === 'intelligence') {
      setActiveTopNav('intelligence');
    } else if (activeTab === 'profile' || activeTab === 'settings') {
      setActiveTopNav(activeSubtab === 'planner-settings' ? 'planning-preferences' : 'profile');
    } else if (activeTab === 'tutor-students') {
      setActiveTopNav('tutor-students');
    } else if (activeTab && activeTab.startsWith('child-')) {
      setActiveTopNav('home');
    } else if (activeTab === 'children-list' && activeChildId) {
      setActiveTopNav('family');
    }
  }, [activeTab, activeSubtab, activeChildId]);

  useEffect(() => {
    if (isCreatePaneOpen) return;
    syncTopNavFromActiveTab();
  }, [activeTab, activeChildId, isCreatePaneOpen, syncTopNavFromActiveTab]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = () => setShowAddChildModal(true);
    window.addEventListener('openAddChildModal', handler);
    return () => window.removeEventListener('openAddChildModal', handler);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e) => {
      const rf = sessionRef.current?.role_flags;
      const restricted = !!(rf?.isChild || rf?.isTutor);
      if (restricted && !allowedRef.current('subjects')) {
        Alert.alert('Not available', 'Your family admin has disabled adding or editing subjects.');
        return;
      }
      // If event has detail (subject object), it's edit mode. Callers may also pass
      // just a subjectId (e.g. the planner right-click menu), which we resolve to the
      // full subject record so the settings/schedule editor has complete data.
      let subject = e.detail?.subject || null;
      if (!subject && e.detail?.subjectId) {
        const wantedId = String(e.detail.subjectId);
        subject = (subjectsRef.current || []).find((s) => String(s?.id) === wantedId) || null;
      }
      const incomingSchoolYear = e.detail?.schoolYear || null;
      const incomingSchoolTerm = e.detail?.schoolTerm || null;
      const incomingChildIds = Array.isArray(e.detail?.childIds) ? e.detail.childIds.filter(Boolean) : [];
      if (subject) {
        setEditingSubject(subject);
        setEditSubjectSettingsInitialTab(e.detail?.initialTab || 'details');
        setShowEditSubjectSettingsModal(true);
        return;
      }
      setEditingSubject(null);
      setAddSubjectPrefill({
        schoolYear: incomingSchoolYear,
        schoolTerm: incomingSchoolTerm,
        childIds: incomingChildIds,
      });
      setShowAddSubjectModal(true);
    };
    window.addEventListener('openAddSubjectModal', handler);
    return () => window.removeEventListener('openAddSubjectModal', handler);
  }, []);

  // Listen for openTaskModal — routes to Calendar Event / Lesson / Assignment create modals
  // Available from any screen (family, planner, home, calendar, etc.)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleOpenTaskModal = (event) => {
      if (isTutorUser) return;
      const rf = sessionRef.current?.role_flags;
      const restricted = !!(rf?.isChild || rf?.isTutor);
      if (restricted && !allowedRef.current('events')) {
        Alert.alert('Not available', 'Your family admin has disabled creating or editing events.');
        return;
      }
      const detail = event.detail || {};
      const kind = resolveCreateModalKind(detail.eventType);
      openCreateModal(kind, detail);
    };
    
    window.addEventListener('openTaskModal', handleOpenTaskModal);
    
    return () => {
      window.removeEventListener('openTaskModal', handleOpenTaskModal);
    };
  }, [isTutorUser, openCreateModal]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleOpenLearningDaySetup = (e) => {
      const subject = e.detail?.subject;
      if (!subject?.id) return;
      setLearningDaySetupChoice({ visible: true, subject });
    };
    window.addEventListener('openLearningDaySetupChoice', handleOpenLearningDaySetup);
    return () => {
      window.removeEventListener('openLearningDaySetupChoice', handleOpenLearningDaySetup);
    };
  }, []);

  // Listen for openEventModal event to open the global EventModal
  // Available from any screen (family, planner, etc.)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleOpenEventModal = (event) => {
      const detail = event.detail || {};
      const eventId = detail.eventId;
      const initialEvent = detail.initialEvent || null;
      const parentEventFocus = detail.parentEventFocus ?? null;
      const childEventFocus = detail.childEventFocus ?? null;
      const requestedSchedulingMode = detail.schedulingMode;
      const forceReadOnlyEditForm =
        sessionRef.current?.role_flags?.isChild === true && denyFamilyEventEdit;
      const schedulingMode = forceReadOnlyEditForm
        ? true
        : denyFamilyEventEdit
          ? false
          : (typeof requestedSchedulingMode === 'boolean' ? requestedSchedulingMode : true);
      const editScope = detail.editScope === 'series' ? 'series' : 'single';
      const openConflictResolution = !!detail.openConflictResolution;
      let conflictResolutionContext = detail.conflictResolutionContext || null;
      if (!conflictResolutionContext && openConflictResolution && Platform.OS === 'web' && typeof window !== 'undefined') {
        const activeConflict = window.__ldActiveConflictBanner;
        if (
          activeConflict &&
          (
            String(activeConflict.eventId) === String(eventId) ||
            String(activeConflict.conflictEvent?.id) === String(eventId)
          )
        ) {
          conflictResolutionContext = {
            conflictEvent: activeConflict.conflictEvent || null,
            movedEvent: activeConflict.movedEvent || null,
            conflictMessage: activeConflict.conflictMessage || null,
            suggestedChange: activeConflict.suggestedChange || null,
          };
        }
      }

      if (!eventId) {
        console.warn('[WebLayout] openEventModal event received but no eventId provided');
        return;
      }

      if (detail.sendOnlyMode || detail.parentEventFocus === 'send') {
        (async () => {
          try {
            const resolvedFamilyId = familyId || sessionRef.current?.family_id || null;
            if (!resolvedFamilyId) throw new Error('Missing family');
            const { childCount } = await runSendNudgeForEvent({
              familyId: resolvedFamilyId,
              eventId,
              initialEvent,
            });
            Alert.alert(
              'Nudge sent',
              `Reminder sent to ${childCount} student${childCount === 1 ? '' : 's'}.`,
            );
          } catch (err) {
            Alert.alert('Could not send nudge', err?.message || 'Try again.');
          }
        })();
        return;
      }

      if (detail.parentEventFocus === 'help' && detail.assignment) {
        setDirectHelpAssignment(detail.assignment);
        setShowDirectHelpModal(true);
        return;
      }

      if (detail.parentEventFocus === 'submission' && detail.assignment) {
        setAssignmentEditContext({
          assignment: detail.assignment,
          linkedEvent: initialEvent,
          view: 'submissions',
        });
        setShowAssignmentEditModal(true);
        return;
      }

      if (childEventFocus === 'submission' || childEventFocus === 'help') {
        const openDirectChildModal = async () => {
          let eventRow = initialEvent && String(initialEvent.id || '') === String(eventId) ? initialEvent : null;
          if (!eventRow) {
            try {
              const { data } = await supabase
                .from('events')
                .select('id, title, start_ts, end_ts, subject_id, child_id')
                .eq('id', eventId)
                .maybeSingle();
              if (data) eventRow = data;
            } catch (_) {
              /* noop */
            }
          }
          const resolvedChildId =
            detail.childId ||
            eventRow?.child_id ||
            sessionRef.current?.child_id ||
            activeChildId ||
            null;

          const eventContext = eventRow ? {
            id: eventRow.id,
            title: eventRow.title,
            start_ts: eventRow.start_ts,
            end_ts: eventRow.end_ts,
            subject_id: eventRow.subject_id || null,
          } : { id: eventId };

          if (childEventFocus === 'help') {
            return;
          }

          setDirectSubmitAssignment(detail.assignment || null);
          setDirectSubmitEventContext(eventContext);
          setDirectSubmitChildId(resolvedChildId);
          setDirectSubmitViewOnly(detail.submissionViewOnly === true);
          setShowDirectSubmitForReviewModal(true);
        };
        openDirectChildModal();
        return;
      }

      const roleFlags = sessionRef.current?.role_flags || {};
      const isParentViewer = roleFlags.isParent === true && roleFlags.isChild !== true;

      // Restricted students must never reach the parent assignment editor
      // (edit fields, response type, delete, grade, mark complete). Route any
      // work-assignment open to the student submit/view modal instead.
      const isRestrictedStudentViewer =
        roleFlags.isChild === true && roleFlags.isParent !== true && !isSelfManagedStudent;
      if (isRestrictedStudentViewer) {
        (async () => {
          let eventRow = initialEvent && String(initialEvent.id || '') === String(eventId)
            ? initialEvent
            : null;
          if (!eventRow?.event_type) {
            try { eventRow = await fetchEventForAssignmentEdit(eventId); } catch (_) { /* noop */ }
          }
          if (eventRow && isWorkAssignmentEditEvent(eventRow.event_type)) {
            const resolvedFamilyId = familyId || sessionRef.current?.family_id || null;
            let assignment = detail.assignment || null;
            if (!assignment && resolvedFamilyId) {
              try {
                assignment = await fetchPrimaryAssignmentForEvent({
                  familyId: resolvedFamilyId,
                  eventId,
                  childId: detail.childId || eventRow?.child_id || null,
                });
              } catch (_) { /* noop */ }
            }
            const resolvedChildId =
              detail.childId ||
              eventRow?.child_id ||
              sessionRef.current?.child_id ||
              activeChildId ||
              null;
            setDirectSubmitAssignment(assignment);
            setDirectSubmitEventContext({
              id: eventRow.id,
              title: eventRow.title,
              start_ts: eventRow.start_ts,
              end_ts: eventRow.end_ts,
              subject_id: eventRow.subject_id || null,
            });
            setDirectSubmitChildId(resolvedChildId);
            setDirectSubmitViewOnly(detail.submissionViewOnly === true);
            setShowDirectSubmitForReviewModal(true);
            return;
          }
          // Non-assignment events fall back to the read-only event modal.
          setEventModalEventId(eventId);
          setEventModalInitialEvent(initialEvent);
          setEventModalSchedulingMode(schedulingMode);
          setEventModalEditScope(editScope);
          setEventModalOpenConflictResolution(openConflictResolution);
          setEventModalConflictResolutionContext(conflictResolutionContext);
          setShowEventModal(true);
        })();
        return;
      }

      const useLegacyModal = shouldUseLegacyEventModal({
        editScope,
        openConflictResolution,
        childEventFocus,
        parentEventFocus,
        sendOnlyMode: detail.sendOnlyMode,
      });
      const shouldRouteToFocusedModal =
        isParentViewer &&
        !denyFamilyEventEdit &&
        schedulingMode &&
        !useLegacyModal;

      if (shouldRouteToFocusedModal) {
        if (
          (initialEvent && isDayOffOrHolidayEvent(initialEvent)) ||
          String(eventId || '').startsWith('holiday-')
        ) {
          dispatchOpenSchoolYearSettingsModal();
          return;
        }

        (async () => {
          try {
            let eventRow = initialEvent;
            if (!eventRow?.event_type) {
              eventRow = await fetchEventForAssignmentEdit(eventId);
            }
            if (!eventRow) {
              if (
                isDayOffOrHolidayEvent(initialEvent) ||
                String(eventId || '').startsWith('holiday-')
              ) {
                dispatchOpenSchoolYearSettingsModal();
                return;
              }
              throw new Error('Event not found');
            }

            if (isDayOffOrHolidayEvent(eventRow)) {
              dispatchOpenSchoolYearSettingsModal();
              return;
            }

            if (isWorkAssignmentEditEvent(eventRow?.event_type)) {
              const resolvedFamilyId = familyId || sessionRef.current?.family_id || null;
              const assignment = resolvedFamilyId
                ? await fetchPrimaryAssignmentForEvent({
                  familyId: resolvedFamilyId,
                  eventId,
                  childId: detail.childId || initialEvent?.child_id || null,
                })
                : null;

              if (!denyFamilyEventEdit && shouldSkipPlannerItemSummary(detail)) {
                setAssignmentEditContext({
                  assignment,
                  linkedEvent: eventRow,
                  view: detail.assignmentView === 'submissions' ? 'submissions' : 'edit',
                });
                setShowAssignmentEditModal(true);
                return;
              }

              setPlannerSummaryContext({
                event: eventRow,
                assignment,
                category: 'Assignment',
                readOnly: denyFamilyEventEdit,
              });
              return;
            }

            if (!denyFamilyEventEdit && shouldSkipPlannerItemSummary(detail)) {
              setCalendarEventEditContext({ event: eventRow, editScope });
              setShowCalendarEventEditModal(true);
              return;
            }

            setPlannerSummaryContext({
              event: eventRow,
              assignment: null,
              category: getPlannerEventCategory(eventRow),
              readOnly: denyFamilyEventEdit,
            });
          } catch (err) {
            console.warn('[WebLayout] focused event modal redirect failed:', err);
            if (
              isDayOffOrHolidayEvent(initialEvent) ||
              String(eventId || '').startsWith('holiday-')
            ) {
              dispatchOpenSchoolYearSettingsModal();
              return;
            }
            setEventModalEventId(eventId);
            setEventModalInitialEvent(initialEvent);
            setEventModalSchedulingMode(schedulingMode);
            setEventModalEditScope(editScope);
            setEventModalOpenConflictResolution(openConflictResolution);
            setEventModalConflictResolutionContext(conflictResolutionContext);
            setShowEventModal(true);
          }
        })();
        return;
      }

      setEventModalEventId(eventId);
      setEventModalInitialEvent(initialEvent);
      setEventModalSchedulingMode(schedulingMode);
      setEventModalEditScope(editScope);
      setEventModalOpenConflictResolution(openConflictResolution);
      setEventModalConflictResolutionContext(conflictResolutionContext);
      setShowEventModal(true);
    };
    
    const handleOpenNudgeForEvent = (event) => {
      const detail = event.detail || {};
      const eventId = detail.eventId;
      if (!eventId) return;
      (async () => {
        try {
          const resolvedFamilyId = familyId || sessionRef.current?.family_id || null;
          if (!resolvedFamilyId) throw new Error('Missing family');
          const { childCount } = await runSendNudgeForEvent({
            familyId: resolvedFamilyId,
            eventId,
            initialEvent: detail.initialEvent || null,
            childIds: detail.childIds || null,
            note: detail.note || null,
          });
          Alert.alert(
            'Nudge sent',
            `Reminder sent to ${childCount} student${childCount === 1 ? '' : 's'}.`,
          );
        } catch (err) {
          Alert.alert('Could not send nudge', err?.message || 'Try again.');
        }
      })();
    };

    const handleOpenHelpForAssignment = (event) => {
      const assignment = event.detail?.assignment || null;
      if (!assignment) return;
      setDirectHelpAssignment(assignment);
      setShowDirectHelpModal(true);
    };

    const handleOpenEditAssignment = (event) => {
      const detail = event.detail || {};
      if (!detail.assignment && !detail.linkedEvent && !detail.eventId) return;

      (async () => {
        try {
          let eventRow = detail.linkedEvent || null;
          const resolvedEventId =
            detail.eventId ||
            eventRow?.id ||
            resolveLinkedEventIdFromAssignment(detail.assignment);
          if (!eventRow && resolvedEventId) {
            eventRow = await fetchEventForAssignmentEdit(resolvedEventId);
          }
          if (eventRow && isDayOffOrHolidayEvent(eventRow)) {
            dispatchOpenSchoolYearSettings();
            return;
          }
          if (eventRow && !isWorkAssignmentEditEvent(eventRow.event_type)) {
            setCalendarEventEditContext({ event: eventRow });
            setShowCalendarEventEditModal(true);
            return;
          }
          setAssignmentEditContext({
            assignment: detail.assignment || null,
            linkedEvent: eventRow || detail.linkedEvent || null,
            eventId: resolvedEventId || null,
            view: detail.view === 'submissions' ? 'submissions' : 'edit',
          });
          setShowAssignmentEditModal(true);
        } catch (err) {
          console.warn('[WebLayout] openEditAssignment failed:', err);
        }
      })();
    };

    const handleOpenReviewForAssignment = (event) => {
      handleOpenEditAssignment({
        detail: {
          ...(event.detail || {}),
          view: 'edit',
        },
      });
    };
    
    window.addEventListener('openEventModal', handleOpenEventModal);
    window.addEventListener('openNudgeForEvent', handleOpenNudgeForEvent);
    window.addEventListener('openHelpForAssignment', handleOpenHelpForAssignment);
    window.addEventListener('openReviewForAssignment', handleOpenReviewForAssignment);
    window.addEventListener('openEditAssignment', handleOpenEditAssignment);
    
    return () => {
      window.removeEventListener('openEventModal', handleOpenEventModal);
      window.removeEventListener('openNudgeForEvent', handleOpenNudgeForEvent);
      window.removeEventListener('openHelpForAssignment', handleOpenHelpForAssignment);
      window.removeEventListener('openReviewForAssignment', handleOpenReviewForAssignment);
      window.removeEventListener('openEditAssignment', handleOpenEditAssignment);
    };
  }, [activeTab, denyFamilyEventEdit, familyId, isSelfManagedStudent]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;

    const handleOpenLearningDayModal = async (event) => {
      const detail = event.detail || {};
      let row = detail.event || null;
      const eventId = detail.eventId || row?.id || null;
      const resolvedFamilyId = familyId || sessionRef.current?.family_id || null;
      if (!row && eventId && resolvedFamilyId) {
        try {
          let query = supabase
            .from('events')
            .select(learningDayEventSelectFields())
            .eq('id', String(eventId))
            .eq('family_id', resolvedFamilyId);
          const { data: fetched, error } = await query.maybeSingle();
          if (!error && fetched) row = fetched;
        } catch (_) {}
      }
      if (!row?.id) return;
      const enriched = await enrichLearningDayEvent({
        supabase,
        familyId: resolvedFamilyId,
        event: row,
      });

      if (!denyFamilyEventEdit && detail.skipSummary) {
        setLearningDayModalState({ visible: true, event: enriched });
        return;
      }

      setPlannerSummaryContext({
        event: enriched,
        assignment: null,
        category: 'Learning day',
        readOnly: denyFamilyEventEdit,
      });
    };

    window.addEventListener(OPEN_LEARNING_DAY_MODAL_EVENT, handleOpenLearningDayModal);
    return () => {
      window.removeEventListener(OPEN_LEARNING_DAY_MODAL_EVENT, handleOpenLearningDayModal);
    };
  }, [familyId, denyFamilyEventEdit]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (event) => {
      const patch = event?.detail?.patch;
      const patchId = patch?.id;
      if (!patchId) return;
      setEventModalInitialEvent((prev) => {
        if (!prev || String(prev.id) !== String(patchId)) return prev;
        return {
          ...prev,
          ...patch,
        };
      });
    };
    window.addEventListener('eventPatched', handler);
    return () => window.removeEventListener('eventPatched', handler);
  }, []);

  // Subject overview → Home review inbox (parent)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (event) => {
      setActiveTab('home');
      const requestedSection = event?.detail?.section;
      if (!requestedSection) return;
      const normalizedSection =
        requestedSection === 'help'
          ? 'help_requests'
          : requestedSection;
      if (
        normalizedSection !== 'help_requests' &&
        normalizedSection !== 'submissions' &&
        normalizedSection !== 'needs_revision'
      ) {
        return;
      }
      // Fire after tab switch so EmbeddedNotificationCenter is mounted and can receive focus event.
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('embeddedNotificationParentFocus', {
              detail: { section: normalizedSection },
            })
          );
        }
      }, 0);
    };
    window.addEventListener('openParentHomeReviewInbox', handler);
    return () => window.removeEventListener('openParentHomeReviewInbox', handler);
  }, []);

  const handleChildAdded = () => {
    fetchFamilyMembers();
  };

  const updateUrlParams = (updates) => {
    if (Platform.OS !== 'web') return;
    const url = new URL(window.location.href);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, value);
      }
    });
    window.history.replaceState({}, '', url.toString());
  };

  const handleTabChange = useCallback((tab, subtab = null) => {
    setActiveTab(tab);
    if (typeof subtab !== 'undefined') {
      setActiveSubtab(subtab);
    } else {
      setActiveSubtab(null);
    }
  }, []);

  // Home rail "Invite Child" → global modal (stay on Home)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (event) => {
      const childId = String(event?.detail?.childId || '').trim() || null;
      setInviteChildModalPrefillId(childId);
      setShowInviteChildModal(true);
    };
    window.addEventListener('openInviteChildModal', handler);
    return () => window.removeEventListener('openInviteChildModal', handler);
  }, []);

  // Helper to navigate to Intelligence Hub with query params
  const navigateToIntelligence = useCallback((params = {}) => {
    handleTabChange('intelligence');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const queryString = new URLSearchParams(params).toString();
      window.history.replaceState({}, '', `?tab=intelligence&${queryString}`);
    }
  }, [handleTabChange]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = () => {
      dispatchOpenSchoolYearSettings();
    };
    window.addEventListener('openYearWizard', handler);
    return () => window.removeEventListener('openYearWizard', handler);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const handler = (event) => {
      const detailDate = event?.detail;
      if (detailDate instanceof Date && !Number.isNaN(detailDate.getTime())) {
        plannerAnchorRef.current = detailDate;
      }
    };
    window.addEventListener('plannerMonthChange', handler);
    return () => window.removeEventListener('plannerMonthChange', handler);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const openEditSchoolYear = (schoolYearLabel) => {
      const label = String(schoolYearLabel || '').trim()
        || resolveSchoolYearLabelFromAnchor(plannerAnchorRef.current || new Date());
      setEditSchoolYearInitialLabel(label);
      setShowEditSchoolYearModal(true);
    };
    const handler = (event) => {
      openEditSchoolYear(event?.detail?.schoolYearLabel);
    };
    window.addEventListener('openEditSchoolYearModal', handler);
    return () => window.removeEventListener('openEditSchoolYearModal', handler);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const handler = (event) => {
      const defaultDate = event?.detail?.defaultDate || plannerAnchorRef.current || new Date();
      const schoolYearLabel = String(event?.detail?.schoolYearLabel || '').trim()
        || resolveSchoolYearLabelFromAnchor(defaultDate instanceof Date ? defaultDate : new Date());
      setDayOffModalSchoolYearLabel(schoolYearLabel);
      setDayOffModalDate(defaultDate);
      setShowDayOffModal(true);
    };
    window.addEventListener('openDayOffModal', handler);
    return () => window.removeEventListener('openDayOffModal', handler);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const handler = (event) => {
      const modeId = event?.detail?.modeId;
      switch (modeId) {
        case 'rebalance':
          setRebalanceEvent(null);
          setRebalanceYearPlanId(null);
          setShowRebalanceModal(true);
          break;
        case 'catch-up':
          setShowCatchUpModal(true);
          break;
        case 'pack-week':
          setShowPackWeekModal(true);
          break;
        case 'school-year-settings':
        case 'plan-year':
          dispatchOpenSchoolYearSettingsModal();
          break;
        case 'what-if':
          setShowWhatIfModal(true);
          break;
        case 'summarize-progress':
          setShowSummarizeProgressModal(true);
          break;
        case 'analytics':
          setShowAnalyticsDashboard(true);
          break;
        case 'heatmap':
          navigateToIntelligence({ tab: 'planner-ai', tool: 'heatmap' });
          break;
        case 'bulk-attendance': {
          setActiveRightTool(null);
          setCurrentView('year');
          setDefaultView('year');
          if (Platform.OS === 'web') {
            const url = new URL(window.location);
            url.searchParams.set('view', 'year');
            window.history.pushState({}, '', url);
            window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'year' }));
            window.setTimeout(() => {
              window.dispatchEvent(new CustomEvent('openPlannerBulkAttendance'));
            }, 150);
          }
          break;
        }
        case 'export-attendance': {
          setActiveRightTool(null);
          setCurrentView('year');
          setDefaultView('year');
          if (Platform.OS === 'web') {
            const url = new URL(window.location);
            url.searchParams.set('view', 'year');
            window.history.pushState({}, '', url);
            window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'year' }));
            window.setTimeout(() => {
              window.dispatchEvent(new CustomEvent('openPlannerExportAttendance'));
            }, 150);
          }
          break;
        }
        case 'export':
          openPlannerExportModal();
          break;
        default:
          break;
      }
    };
    window.addEventListener('plannerSmartAction', handler);
    return () => window.removeEventListener('plannerSmartAction', handler);
  }, [navigateToIntelligence, openPlannerExportModal]);

  // Legacy Plan Year entry points → School Year Settings, subject page, or units editor.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (event) => {
      const rf = sessionRef.current?.role_flags;
      const restricted = !!(rf?.isChild || rf?.isTutor);
      if (restricted && !allowedRef.current('plans')) {
        Alert.alert('Not available', 'Your family admin has disabled adding or editing plans.');
        return;
      }
      handleLegacyPlanYearRequest(event?.detail ?? {}, { handleTabChange });
    };
    window.addEventListener('openPlanYearModal', handler);
    return () => window.removeEventListener('openPlanYearModal', handler);
  }, [handleTabChange]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (event) => {
      const rf = sessionRef.current?.role_flags;
      const restricted = !!(rf?.isChild || rf?.isTutor);
      if (restricted && !allowedRef.current('plans')) {
        Alert.alert('Not available', 'Your family admin has disabled adding or editing plans.');
        return;
      }
      handleLegacyBuildCurriculumRequest(event?.detail ?? {}, { handleTabChange });
    };
    window.addEventListener('openBuildCurriculumModal', handler);
    return () => window.removeEventListener('openBuildCurriculumModal', handler);
  }, [handleTabChange]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (event) => {
      const tab = String(event?.detail?.tab || '').trim();
      if (tab) handleTabChange(tab);
    };
    window.addEventListener('openNavigateTab', handler);
    return () => window.removeEventListener('openNavigateTab', handler);
  }, [handleTabChange]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = () => {
      handleTabChange('settings', 'planner-settings');
    };
    window.addEventListener('openSchoolYearSettings', handler);
    return () => window.removeEventListener('openSchoolYearSettings', handler);
  }, [handleTabChange]);

  // Listen for openScheduleRules event
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = () => {
      setShowSettingsModal(true);
    };
    window.addEventListener('openScheduleRules', handler);
    return () => window.removeEventListener('openScheduleRules', handler);
  }, []);

  // Open Family > Planning Preferences from cross-app actions (e.g. Add Event advanced recurrence options)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = () => {
      handleTabChange('settings', 'planner-settings');
    };
    window.addEventListener('openPlanningPreferences', handler);
    return () => window.removeEventListener('openPlanningPreferences', handler);
  }, [handleTabChange]);

  // Listen for openExportPlannerModal event (e.g. from Subject detail Attendance section)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (e) => {
      const detail = e?.detail || {};
      setExportModalSubjectId(detail.subjectId || null);
      setExportModalSubjectName(detail.subjectName || null);
      setShowExportModal(true);
    };
    window.addEventListener('openExportPlannerModal', handler);
    return () => window.removeEventListener('openExportPlannerModal', handler);
  }, []);

  // Subject-scoped units editor is handled by SubjectUnitsEditorHost (openSubjectUnitsEditor).

  // Open Doodle chat from anywhere (e.g. Library empty state — optional initialPrompt in event detail)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (e) => {
      const d = e?.detail || {};
      const p = d.initialPrompt;
      openDoodleSearch({
        prompt: typeof p === 'string' && p.trim() ? p.trim() : null,
        autoSubmit: !!d.autoSubmit,
      });
    };
    window.addEventListener('openDoodleSearchModal', handler);
    return () => window.removeEventListener('openDoodleSearchModal', handler);
  }, [openDoodleSearch]);

  // Navigation handler for global search - expose via window for GlobalSearchModal
  const handleSearchNavigate = useCallback((tab, subtab = null, params = {}) => {
    handleTabChange(tab, subtab);
    
    // Handle child section navigation
    if (tab === 'children-list' && params.section) {
      setActiveChildSection(params.section);
    }
    
    if (params.eventId && Platform.OS === 'web') {
      updateUrlParams({ eventId: params.eventId });
    }
    if (params.subjectId && Platform.OS === 'web') {
      updateUrlParams({ subjectId: params.subjectId });
    }
    if (params.section && Platform.OS === 'web') {
      updateUrlParams({ section: params.section });
    }
  }, [handleTabChange]);

  // Doodle modal: when assistant returns navigate_*, close modal and go to that page
  const handleDoodleNavigate = useCallback((target) => {
    closeDoodleSearch();
    if (target === 'navigate_planner_attendance') {
      handleTabChange('subjects');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/subjects?mode=progress');
      }
    } else if (target === 'navigate_subjects_progress') {
      handleTabChange('subjects');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/subjects?mode=progress');
      }
    } else if (target === 'navigate_planner') {
      handleTabChange('planner');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/planner');
      }
    } else if (target === 'navigate_home') {
      handleTabChange('home');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/');
      }
    } else if (target === 'navigate_family_feedback') {
      handleTabChange('settings', 'feedback');
    } else if (target === 'navigate_family') {
      handleTabChange('profile');
    } else if (target === 'navigate_family_members') {
      handleTabChange('settings', 'members');
    } else if (target === 'navigate_subjects') {
      handleTabChange('subjects');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/subjects');
      }
    } else if (target === 'navigate_materials') {
      handleTabChange('materials');
    } else if (target === 'navigate_setup_plan_year') {
      dispatchOpenSchoolYearSettings();
      handleTabChange('settings', 'planner-settings');
    } else if (target === 'navigate_setup_attendance') {
      handleTabChange('planner');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/planner?view=attendance');
        window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'attendance' }));
      }
    } else if (target === 'navigate_setup_planner_calendar') {
      handleTabChange('planner');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/planner?view=month');
        window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'month' }));
      }
    }
  }, [handleTabChange, closeDoodleSearch]);

  // Expose navigation handler globally for GlobalSearchModal
  useEffect(() => {
    if (Platform.OS === 'web') {
      window.__ldSearchNavigate = handleSearchNavigate;
      return () => {
        delete window.__ldSearchNavigate;
      };
    }
  }, [handleSearchNavigate]);

  const avatarUrlsToPreload = useMemo(
    () => collectAvatarUrlsFromFamilyState(profile, children, family),
    [profile, children, family]
  );

  // Remote https avatars (children, members, profile) — background
  useEffect(() => {
    if (Platform.OS !== 'web' || avatarUrlsToPreload.length === 0) return;
    const run = () => preloadRemoteImageUrls(avatarUrlsToPreload);
    let idleId;
    if (typeof requestIdleCallback !== 'undefined') {
      idleId = requestIdleCallback(run, { timeout: 6000 });
    } else {
      idleId = setTimeout(run, 1);
    }
    return () => {
      if (typeof cancelIdleCallback !== 'undefined' && typeof idleId === 'number') {
        cancelIdleCallback(idleId);
      } else {
        clearTimeout(idleId);
      }
    };
  }, [avatarUrlsToPreload]);

  // Handler for Settings chip

  const handleCreatePaneSelect = useCallback(
    (optionId) => {
      setIsCreatePaneOpen(false);
      syncTopNavFromActiveTab();
      const modalKind = createPaneOptionToModalKind(optionId);
      if (modalKind === 'lesson') {
        if (sessionRestricted && !familyUserControls.allowed('plans')) {
          Alert.alert('Not available', 'Your family admin has disabled adding or editing plans.');
          return;
        }
        openUnitsAndLessonsModal({
          date: new Date(),
          childIds: [],
        });
        return;
      }
      if (modalKind) {
        if (sessionRestricted && !familyUserControls.allowed('events')) {
          Alert.alert('Not available', 'Your family admin has disabled creating or editing events.');
          return;
        }
        openCreateModal(modalKind, {
          date: new Date(),
          eventType: modalKind === 'assignment' ? 'Assignment' : null,
          submittalAfterCreate: optionId === 'submission_request',
        });
        return;
      }
      switch (optionId) {
        case 'subject':
          if (sessionRestricted && !familyUserControls.allowed('subjects')) {
            Alert.alert('Not available', 'Your family admin has disabled adding or editing subjects.');
            return;
          }
          setEditingSubject(null);
          setShowAddSubjectModal(true);
          break;
        case 'child':
          if (resolvedShellUserRole === 'child' || resolvedShellUserRole === 'student' || resolvedShellUserRole === 'tutor') {
            Alert.alert('Not available', 'Only family admins can add children.');
            return;
          }
          setShowAddChildModal(true);
          break;
        case 'material':
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('openAddMaterialModal'));
          }
          break;
        default:
          break;
      }
    },
    [
      familyUserControls,
      openCreateModal,
      openUnitsAndLessonsModal,
      resolvedShellUserRole,
      sessionRestricted,
      syncTopNavFromActiveTab,
    ]
  );

  const openPlannerCreateModal = useCallback((kind) => {
    if (kind === 'day_off') {
      if (sessionRestricted && !familyUserControls.allowed('planning_preferences')) {
        Alert.alert('Not available', 'Your family admin has disabled school year settings.');
        return;
      }
      setShowPlannerCreateMenu(false);
      const anchorDate = currentMonth || new Date();
      setDayOffModalSchoolYearLabel(resolveSchoolYearLabelFromAnchor(anchorDate));
      setDayOffModalDate(anchorDate);
      setShowDayOffModal(true);
      return;
    }
    if (kind === 'learning_day') {
      if (sessionRestricted && !familyUserControls.allowed('subjects')) {
        Alert.alert('Not available', 'Your family admin has disabled adding or editing subjects.');
        return;
      }
      setShowPlannerCreateMenu(false);
      setShowLearningDaySubjectPicker(true);
      return;
    }
    if (sessionRestricted && !familyUserControls.allowed('events')) {
      Alert.alert('Not available', 'Your family admin has disabled creating or editing events.');
      return;
    }
    // A child creating an event must attribute it to themselves, not the whole family.
    const childIds = sessionIsChild && viewerScopedChildIds
      ? viewerScopedChildIds
      : (Array.isArray(selectedCalendarChildren) ? selectedCalendarChildren : []);
    openCreateModal(kind, {
      date: currentMonth,
      childIds,
      childId: childIds[0] || null,
      eventType: kind === 'assignment' ? 'Assignment' : null,
    });
    setShowPlannerCreateMenu(false);
  }, [currentMonth, familyUserControls, openCreateModal, selectedCalendarChildren, sessionRestricted, sessionIsChild, viewerScopedChildIds]);

  const handleLearningDaySubjectSelect = useCallback((subject) => {
    setShowLearningDaySubjectPicker(false);
    if (!subject) return;
    setLearningDaySetupChoice({ visible: true, subject });
  }, []);

  const closeLearningDaySetupChoice = useCallback(() => {
    setLearningDaySetupChoice({ visible: false, subject: null });
  }, []);

  const resolveSubjectChildIds = useCallback((subject) => {
    if (!subject) return [];
    const ids = []
      .concat(
        Array.isArray(subject?.assignedChildren) ? subject.assignedChildren : [],
        Array.isArray(subject?.assigned_children) ? subject.assigned_children : [],
        Array.isArray(subject?.child_ids) ? subject.child_ids : [],
        Array.isArray(subject?.childIds) ? subject.childIds : [],
      )
      .map((childId) => String(childId || '').trim())
      .filter(Boolean);
    if (subject?.child_id) {
      ids.push(String(subject.child_id));
    }
    return [...new Set(ids)];
  }, []);

  const handleLearningDayOneOffEvent = useCallback(async () => {
    const subject = learningDaySetupChoice.subject;
    if (!subject?.id || !familyId) return;
    const childIds = resolveSubjectChildIds(subject);
    try {
      const created = await saveLesson({
        familyId,
        title: subject.name || 'Learning day',
        childIds,
        subjectId: subject.id,
        scheduleMode: 'unscheduled',
        date: currentMonth,
      });
      if (created?.id) {
        const enriched = await enrichLearningDayEvent({
          supabase,
          familyId,
          event: created,
        });
        closeLearningDaySetupChoice();
        setLearningDayModalState({ visible: true, event: enriched || created });
      } else {
        closeLearningDaySetupChoice();
      }
    } catch (err) {
      console.warn('[LearningDayOneOff] creation error:', err?.message || err);
      closeLearningDaySetupChoice();
    }
  }, [
    closeLearningDaySetupChoice,
    currentMonth,
    familyId,
    learningDaySetupChoice.subject,
    resolveSubjectChildIds,
  ]);

  const handleLearningDayEditSubjectSchedule = useCallback(() => {
    const subject = learningDaySetupChoice.subject;
    closeLearningDaySetupChoice();
    if (!subject) return;
    setEditingSubject(subject);
    setEditSubjectSettingsInitialTab('schedule');
    setShowEditSubjectSettingsModal(true);
  }, [closeLearningDaySetupChoice, learningDaySetupChoice.subject]);

  const handleLearningDayCreateSubject = useCallback(() => {
    setShowLearningDaySubjectPicker(false);
    setEditingSubject(null);
    setAddSubjectPrefill({ schoolYear: null, schoolTerm: null, childIds: [] });
    setShowAddSubjectModal(true);
  }, []);

  const handleTopSelect = useCallback(
    (key) => {
      if (key === 'messages') {
        if (isMessagesPaneOpen) {
          setIsMessagesPaneOpen(false);
          syncTopNavFromActiveTab();
        } else {
          setIsCreatePaneOpen(false);
          setIsMessagesPaneOpen(true);
          setActiveTopNav('messages');
        }
        return;
      }
      if (key === 'create') {
        if (isCreatePaneOpen) {
          setIsCreatePaneOpen(false);
          syncTopNavFromActiveTab();
        } else {
          setIsMessagesPaneOpen(false);
          setIsCreatePaneOpen(true);
          setActiveTopNav('create');
        }
        return;
      }

      setIsCreatePaneOpen(false);
      setActiveTopNav(key);
      switch (key) {
        case 'home':
          if (activeChildId) {
            handleTabChange(`child-${activeChildId}`);
          } else {
            handleTabChange('home');
          }
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.pushState({}, '', '/');
          }
          break;
        // case 'explore': // Archived - explore page removed
        //   handleTabChange('explore');
        //   break;
        case 'planner':
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.pathname = '/planner';
            url.searchParams.delete('view');
            window.history.pushState({}, '', url.toString());
          }
          handleTabChange('planner', 'calendar');
          break;
        case 'planning-preferences':
          handleTabChange('settings', 'planner-settings');
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.pushState({}, '', '/planner/preferences');
          }
          break;
        case 'new':
          handleTabChange('settings', 'profile');
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.pushState({}, '', '/family');
          }
          break;
        case 'materials':
          handleTabChange('subjects', 'materials');
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.pushState({}, '', '/subjects');
          }
          break;
        case 'subjects':
          handleTabChange('subjects', 'subjects');
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.pushState({}, '', '/subjects');
          }
          break;
        case 'learning':
          handleTabChange('learning', 'subjects');
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.pushState({}, '', '/learning');
          }
          break;
        case 'review':
          handleTabChange('review');
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.pushState({}, '', '/review');
          }
          break;
        case 'records':
          handleTabChange('records', 'attendance');
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.pushState({}, '', '/records');
          }
          break;
        case 'intelligence':
          handleTabChange('intelligence');
          break;
        case 'coach':
          handleTabChange('coach');
          break;
        case 'profile':
          handleTabChange('settings', 'profile');
          break;
        case 'family':
          handleTabChange('family', 'members');
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.pushState({}, '', '/family');
          }
          break;
        case 'tutor-students':
          handleTabChange('tutor-students');
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.pushState({}, '', '/students');
          }
          break;
        default:
          handleTabChange('home');
      }
    },
    [activeChildId, handleTabChange, isCreatePaneOpen, isMessagesPaneOpen, syncTopNavFromActiveTab]
  );

  // Mode-aware landing route after onboarding completes
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handlePostOnboardingRoute = (event) => {
      const planningMode =
        event?.detail?.planningMode
        || family?.default_planning_mode
        || null;
      const route = getPostOnboardingRoute(planningMode);
      if (route?.tab) {
        handleTabChange(route.tab, route.subtab ?? null);
        handleTopSelect(route.tab);
      }
    };
    window.addEventListener('onboardingCompleted', handlePostOnboardingRoute);
    return () => window.removeEventListener('onboardingCompleted', handlePostOnboardingRoute);
  }, [family?.default_planning_mode, handleTabChange, handleTopSelect]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = () => handleTopSelect('messages');
    window.addEventListener('openMessagesPane', handler);
    return () => window.removeEventListener('openMessagesPane', handler);
  }, [handleTopSelect]);

  const mergeExplorerTourInProfile = useCallback((patch) => {
    setProfile((p) => {
      if (!p) return p;
      const prev = p.app_preferences && typeof p.app_preferences === 'object' ? p.app_preferences : {};
      const cur =
        prev[EXPLORER_TOUR_PREFS_KEY] && typeof prev[EXPLORER_TOUR_PREFS_KEY] === 'object'
          ? prev[EXPLORER_TOUR_PREFS_KEY]
          : {};
      const nextTour = { ...cur };
      if (patch.parent) nextTour.parent = { ...(cur.parent || {}), ...patch.parent };
      if (patch.learner) nextTour.learner = { ...(cur.learner || {}), ...patch.learner };
      return {
        ...p,
        app_preferences: {
          ...prev,
          [EXPLORER_TOUR_PREFS_KEY]: nextTour,
        },
      };
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!onboardingCheckDone || onboardingBlocked) return;
    if (!authUserId || !hasSession) return;
    if (profile == null) return;

    const tour = parseExplorerTourFromPrefs(profile.app_preferences);
    const isParent = sessionIsParent;
    const isLearner = !!(sessionIsChild || sessionIsTutor);

    if (isParent && !tour.parent.done && !tour.parent.skipped) {
      // Retired explorer tour — auto-mark complete; setup guidance is on Home.
      setExplorerParentTourOpen(false);
      setLearnerQuickStartOpen(false);
      void persistExplorerTourMerge(authUserId, { parent: { done: true, step: 3 } }).then(({ error }) => {
        if (!error) mergeExplorerTourInProfile({ parent: { done: true, step: 3 } });
      });
    } else if (isLearner && !tour.learner.done && !tour.learner.skipped) {
      setExplorerParentTourOpen(false);
      setLearnerQuickStartOpen(true);
    } else {
      setExplorerParentTourOpen(false);
      setLearnerQuickStartOpen(false);
    }
  }, [
    onboardingCheckDone,
    onboardingBlocked,
    authUserId,
    hasSession,
    profile,
    profile?.app_preferences,
    sessionIsParent,
    sessionIsChild,
    sessionIsTutor,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!explorerParentTourOpen) return;
    if (explorerParentStep >= 1 && activeTab !== 'planner') {
      handleTopSelect('planner');
    }
  }, [explorerParentTourOpen, explorerParentStep, activeTab, handleTopSelect]);

  const handleExplorerParentNext = useCallback(async () => {
    if (!authUserId) return;
    try {
      if (explorerParentStep === 0) {
        const { error } = await persistExplorerTourMerge(authUserId, { parent: { step: 1 } });
        if (!error) mergeExplorerTourInProfile({ parent: { step: 1 } });
        handleTopSelect('planner');
        setExplorerParentStep(1);
        return;
      }
      if (explorerParentStep === 1) {
        const { error } = await persistExplorerTourMerge(authUserId, { parent: { done: true, step: 2 } });
        if (!error) mergeExplorerTourInProfile({ parent: { done: true, step: 2 } });
        setExplorerParentTourOpen(false);
      }
    } catch (e) {
      console.warn('[WebLayout] explorer tour persist failed', e);
    }
  }, [authUserId, explorerParentStep, handleTopSelect, mergeExplorerTourInProfile]);

  const handleExplorerParentSkip = useCallback(async () => {
    if (!authUserId) return;
    try {
      const { error } = await persistExplorerTourMerge(authUserId, { parent: { skipped: true } });
      if (!error) mergeExplorerTourInProfile({ parent: { skipped: true } });
      setExplorerParentTourOpen(false);
    } catch (e) {
      console.warn('[WebLayout] explorer tour skip failed', e);
    }
  }, [authUserId, mergeExplorerTourInProfile]);

  const handleLearnerGotIt = useCallback(async () => {
    if (!authUserId) return;
    try {
      const { error } = await persistExplorerTourMerge(authUserId, { learner: { done: true } });
      if (!error) mergeExplorerTourInProfile({ learner: { done: true } });
      setLearnerQuickStartOpen(false);
    } catch (e) {
      console.warn('[WebLayout] learner quick start persist failed', e);
    }
  }, [authUserId, mergeExplorerTourInProfile]);

  const handleLearnerDontShow = useCallback(async () => {
    if (!authUserId) return;
    try {
      const { error } = await persistExplorerTourMerge(authUserId, { learner: { skipped: true } });
      if (!error) mergeExplorerTourInProfile({ learner: { skipped: true } });
      setLearnerQuickStartOpen(false);
    } catch (e) {
      console.warn('[WebLayout] learner quick start skip failed', e);
    }
  }, [authUserId, mergeExplorerTourInProfile]);

  const handleChildSelect = useCallback(
    (childId) => {
      setActiveTopNav('family');
      setActiveChildId(childId);
      setActiveChildSection('affirmation');
      handleTabChange(`child-${childId}`);
    },
    [handleTabChange]
  );

  const handleExitChildView = useCallback(() => {
    setActiveChildId(null);
    setActiveChildSection('affirmation');
    handleTabChange('home');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
    }
  }, [handleTabChange]);

  const handleChildSectionSelect = useCallback(
    (childId, section) => {
      setActiveTopNav('family');
      setActiveChildId(childId);
      setActiveChildSection(section);
      const childTabId = `child-${childId}`;
      if (activeTab !== childTabId) {
        handleTabChange(childTabId);
      }
    },
    [activeTab, handleTabChange]
  );

  const handleOpenNewMenu = useCallback((anchor) => {
    if (Platform.OS === 'web') {
      if (anchor && typeof anchor.x === 'number' && typeof anchor.y === 'number') {
        // Align menu left edge with button left edge for better visual connection
        const offsetX = anchor.x;
        // Position menu directly below the button with minimal gap for visual connection
        const offsetY = anchor.y + (anchor.height ?? 40) + 1; // 1px gap for tight visual connection
        setNewMenuPosition({ x: offsetX, y: offsetY });
      } else {
        const x = Math.max(window.innerWidth - 320, 320);
        setNewMenuPosition({ x, y: 88 });
      }
    }
    setShowNewMenu(true);
  }, []);


  // Clear right tool when switching away from calendar screens
  // Also ensure right tool is closed when planner first opens
  useEffect(() => {
    const prevTab = prevActiveTabRef.current;
    const enteringPlanner = activeTab === 'planner' && prevTab !== activeTab;
    if (activeTab !== 'calendar' && activeTab !== 'planner') {
      setActiveRightTool(null);
    } else if (enteringPlanner) {
      // Ensure right pane is closed when switching TO planner (not when already on it)
      setActiveRightTool(null);
      const sanitizedView = sanitizeLegacyPlanYearView(currentView);
      if (sanitizedView !== currentView) {
        setCurrentView(sanitizedView);
        setDefaultView(sanitizedView);
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const url = new URL(window.location);
          url.searchParams.set('view', sanitizedView);
          window.history.replaceState({}, '', url);
          window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: sanitizedView }));
        }
      }
    }
    prevActiveTabRef.current = activeTab;
  }, [activeTab, currentView]);

  const isCalendarScreen =
    activeTab === 'calendar' || activeTab === 'planner';

  const plannerViewForWebContent = sanitizeLegacyPlanYearView(currentView);

  /** When true, top segmented view chips should not use purple (full-screen plan/attendance view is primary). */
  const rightToolbarClaimsPlannerSegmentFocus =
    (activeRightTool != null && !['tasks', 'backlog'].includes(activeRightTool)) ||
    currentView === 'attendance';
  /** Purple segmented chip only when that row is the active context. */
  const showTopPlannerSegmentHighlight =
    ['month', 'board', 'tasks', 'year', 'attendance-drilldown'].includes(currentView) && !rightToolbarClaimsPlannerSegmentFocus;

  // Generate breadcrumbs with account name first
  const generateBreadcrumbs = useMemo(() => {
    const crumbs = [];
    
    // Get account name from user email (use part before @)
    const accountName = user?.email 
      ? user.email.split('@')[0].split('.').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
      : 'Account';
    
    crumbs.push({
      label: accountName,
      onPress: () => handleTabChange('home'),
    });

    // Add navigation path based on active tab
    if (activeTab === 'home') {
      crumbs.push({ label: 'Home' });
    } else if (activeTab === 'planner' || activeTab === 'calendar') {
      crumbs.push({ label: 'Planner' });
    } else if (activeTab === 'materials') {
      crumbs.push({ label: 'Materials' });
    } else if (activeTab === 'subjects') {
      crumbs.push({ label: 'Learning' });
    } else if (activeTab === 'learning') {
      crumbs.push({ label: 'Learning' });
    } else if (activeTab && activeTab.startsWith('subject-')) {
      crumbs.push({ 
        label: 'Learning',
        onPress: () => handleTabChange('subjects'),
      });
      // Try to get subject name from subjects list
      const subjectId = activeTab.replace('subject-', '');
      const subject = subjects.find(s => s.id === subjectId);
      if (subject) {
        crumbs.push({ label: subject.name });
      } else {
        crumbs.push({ label: 'Subject Details' });
      }
    } else if (activeTab === 'records') {
      crumbs.push({ label: 'Records' });
    } else if (activeTab === 'family') {
      crumbs.push({ label: 'Family' });
    } else if (activeTab === 'intelligence') {
      crumbs.push({ label: 'Intelligence' });
    } else if (activeTab === 'explore') {
      crumbs.push({ label: 'Explore' });
    } else if (activeTab === 'profile') {
      crumbs.push({ label: 'Profile' });
    } else if (activeTab && activeTab.startsWith('child-')) {
      crumbs.push({ label: 'Settings' });
      if (activeChildName) {
        crumbs.push({ label: activeChildName });
      }
      if (activeChildSection && activeChildSection !== 'affirmation') {
        const sectionLabels = {
          'updates': 'Updates',
          'growth': 'Growth',
          'complete-profile': 'Complete Profile',
        };
        crumbs.push({ label: sectionLabels[activeChildSection] || activeChildSection });
      }
    }

    return crumbs;
  }, [authUserId, user?.email, activeTab, activeChildName, activeChildSection, handleTabChange, subjects]);

  // Handler for Feedback chip
  const handleOpenFeedback = useCallback(() => {
    if (Platform.OS === 'web') {
      window.open('https://learnadoodle.com/contact', '_blank');
    }
  }, []);

  const handleShellAvatarPress = useCallback(() => {
    if (resolvedShellUserRole === 'child' || resolvedShellUserRole === 'student') {
      handleTabChange('home');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.pushState({}, '', '/');
      }
      return;
    }
    handleTabChange('settings', 'profile');
  }, [resolvedShellUserRole, handleTabChange]);

  const handleShellOpenSettings = useCallback((section = 'profile') => {
    handleTabChange('settings', section);
  }, [handleTabChange]);

  const handleShellLogOut = useCallback(async () => {
    try {
      await signOut();
    } catch (error) {
      // signOut handles local fallback
    }
  }, [signOut]);

  const shellSectionNavTab = useMemo(() => {
    const tab = getSectionNavTab(activeTab);
    // Learning, Family, Records, and Planner use in-content navigation without the shell secondary pane.
    if (tab === 'subjects' || tab === 'learning' || tab === 'family' || tab === 'records' || tab === 'planner') return null;
    return tab;
  }, [activeTab]);
  const shellSectionNavSections = shellSectionNavTab ? getSectionsForTab(shellSectionNavTab) : null;
  const shellActiveSection = shellSectionNavTab
    ? resolveSection(shellSectionNavTab, activeSubtab)
    : null;

  const handleShellSectionChange = useCallback((key) => {
    if (!shellSectionNavTab) return;
    setActiveSubtab(key);
    handleTabChange(shellSectionNavTab, key);
  }, [shellSectionNavTab, handleTabChange]);

  const shellSectionNav = shellSectionNavSections ? (
    <SecondaryNavShell
      title={SECTION_TITLE_BY_TAB[shellSectionNavTab]}
      sections={shellSectionNavSections}
      activeSection={shellActiveSection}
      onSectionChange={handleShellSectionChange}
    />
  ) : null;

  // When user+session: one tree so loader never remounts; content is either preload placeholder or full app
  if (user && session) {
    return (
      <>
        {showLoaderEffective && (
          <View style={[StyleSheet.absoluteFillObject, Platform.OS === 'web' && { position: 'fixed', zIndex: 99999 }, { pointerEvents: 'auto' }]}>
            <AppLoader spinnerOnly />
          </View>
        )}
        <ToastProvider>
      <FiltersProvider>
        <PlannerDiffProvider>
        <AppShell
          disabled={onboardingBlocked}
          flushToEdge={activeTab === 'planner' || activeTab === 'calendar'}
          sectionNav={shellSectionNav}
          leftPane={{
            visible: isMessagesPaneOpen || isCreatePaneOpen,
            width: 340,
            content: isCreatePaneOpen ? (
              <FamilyCreatePane
                placement="left"
                onClosePane={() => {
                  setIsCreatePaneOpen(false);
                  syncTopNavFromActiveTab();
                }}
                onSelectOption={handleCreatePaneSelect}
                disabledOptions={{
                  calendar_event: denyFamilyEventEdit,
                  assignment: denyFamilyEventEdit,
                  subject: sessionRestricted && !familyUserControls.allowed('subjects'),
                  child:
                    resolvedShellUserRole === 'child'
                    || resolvedShellUserRole === 'student'
                    || resolvedShellUserRole === 'tutor',
                  material: familyUserControls.effectivePermissions?.canViewLibrary === false,
                }}
              />
            ) : (
              <FamilyMessagesPane
                familyId={familyId}
                viewerRole={resolvedShellUserRole || 'parent'}
                viewerChildId={session?.child_id || null}
                currentUserId={authUserId}
                children={children}
                active={isMessagesPaneOpen}
                placement="left"
                onClosePane={() => {
                  setIsMessagesPaneOpen(false);
                  syncTopNavFromActiveTab();
                }}
              />
            ),
          }}
          sidebar={{
            topActive: activeTopNav,
            messagesPaneOpen: isMessagesPaneOpen,
            createPaneOpen: isCreatePaneOpen,
            onSelectTop: handleTopSelect,
            childrenList: children,
            activeChildId: activeChildId,
            activeChildSection: activeChildSection,
            onSelectChild: handleChildSelect,
            onSelectChildSection: handleChildSectionSelect,
            onExitChildView: handleExitChildView,
            onOpenNew: handleOpenNewMenu,
            onOpenSearch: openSearch,
            onAvatarPress: handleShellAvatarPress,
            user: user,
            userRole: resolvedShellUserRole,
            familyPlanningMode: familyPlanningMode ?? family?.default_planning_mode ?? null,
            unreadMessagesCount,
          }}
          onOpenSettings={(section = 'profile') => {
            handleTabChange('settings', section);
          }}
          onOpenFeedback={handleOpenFeedback}
        >
          {/* Toolbars - moved inside main content */}
          {isCalendarScreen && (
            <View style={{ 
              width: '100%', 
              flexDirection: 'column', 
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: '#E5E7EB',
              position: 'relative',
              zIndex: 1,
              ...(Platform.OS === 'web' ? { 
                overflow: 'visible',
                overflowY: 'visible',
                overflowX: 'visible',
              } : {}),
            }}>
              {/* Single Row: All Controls */}
              <View style={{ 
                flexDirection: 'row', 
                alignItems: 'center',
              }}>
                {/* Left: Date & Term/School Year */}
                <View style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center',
                  gap: 8,
                  flex: 1,
                  minWidth: 0,
                }}>
                  {currentView !== 'tasks' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity
                      onPress={() => {
                        let newDate;
                        if (currentView === 'board' || currentView === 'Board') {
                          newDate = addWeeks(currentMonth, -1);
                        } else if (currentView === 'week' || currentView === 'Week') {
                          newDate = addWeeks(currentMonth, -1);
                        } else if (currentView === 'year') {
                          newDate = shiftCalendarYearAnchor(currentMonth, -1);
                        } else {
                          const newMonth = addMonths(currentMonth, -1);
                          newDate = new Date(newMonth.getFullYear(), newMonth.getMonth(), 1);
                        }
                        setCurrentMonth(newDate);
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('plannerMonthChange', { detail: newDate }));
                        }
                      }}
                      style={{
                        padding: 4,
                      }}
                      activeOpacity={0.7}
                    >
                      <ChevronLeft size={16} color="rgba(15,23,42,0.4)" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        let newDate;
                        if (currentView === 'board' || currentView === 'Board') {
                          newDate = addWeeks(currentMonth, 1);
                        } else if (currentView === 'week' || currentView === 'Week') {
                          newDate = addWeeks(currentMonth, 1);
                        } else if (currentView === 'year') {
                          newDate = shiftCalendarYearAnchor(currentMonth, 1);
                        } else {
                          const newMonth = addMonths(currentMonth, 1);
                          newDate = new Date(newMonth.getFullYear(), newMonth.getMonth(), 1);
                        }
                        setCurrentMonth(newDate);
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('plannerMonthChange', { detail: newDate }));
                        }
                      }}
                      style={{
                        padding: 4,
                      }}
                      activeOpacity={0.7}
                    >
                      <ChevronRight size={16} color="rgba(15,23,42,0.4)" />
                    </TouchableOpacity>
                  </View>
                  ) : null}

                  {currentView === 'tasks' ? (
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={{
                      fontSize: 26,
                      color: '#1E293B',
                      fontWeight: '600',
                      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      flexShrink: 1,
                    }}>
                      All Events
                    </Text>
                  ) : (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={{ flexShrink: 1, minWidth: 0, maxWidth: '100%' }}
                    onPress={() => {
                      if (currentView === 'month' || currentView === 'week' || currentView === 'board' || currentView === 'year') {
                        const today = new Date();
                        setCurrentMonth(today);
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('plannerMonthChange', { detail: today }));
                        }
                      }
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={{
                      fontSize: 26,
                      color: '#1E293B',
                      fontWeight: '600',
                      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      flexShrink: 1,
                    }}>
                      {currentView === 'year'
                        ? String(currentMonth.getFullYear())
                        : (currentView === 'board' || currentView === 'week')
                          ? formatPlannerWeekHeaderLabel(currentMonth)
                          : currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </Text>
                  </TouchableOpacity>
                  )}
                </View>
                
                {/* Center: View State Controls (View Mode chips) — fixed true center via balanced side columns */}
                <View 
                  style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  {/* Planner Settings popover - mini Planning Preferences */}
                  {showPlannerSettingsPopover && Platform.OS === 'web' && (
                    <View ref={plannerSettingsPopoverRef}>
                      <PlannerSettingsPopover
                        visible={showPlannerSettingsPopover}
                        onClose={() => setShowPlannerSettingsPopover(false)}
                        position={plannerSettingsPopoverPosition}
                        connectedProviderIds={plannerConnectedProviderIds}
                        onConnectProvider={handlePlannerProviderConnect}
                        onOpenFullSettings={() => handleTabChange('settings', 'connections')}
                      />
                    </View>
                  )}
                  
                  {/* View Mode - Segmented control with sliding highlight */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderRadius: 9999,
                      borderWidth: 1,
                      borderColor: '#E6EBF2',
                      backgroundColor: '#FFFFFF',
                      padding: 6,
                      flexShrink: 0,
                    }}
                  >
                    {/* Sliding highlight — matches Learning / filter chip active blue */}
                    {showTopPlannerSegmentHighlight && viewChipSlider.width > 0 && (
                      <View
                        style={{
                          position: 'absolute',
                          left: viewChipSlider.left,
                          top: 6,
                          bottom: 6,
                          width: viewChipSlider.width,
                          borderRadius: 9999,
                          backgroundColor: 'rgba(139, 92, 246, 0.15)',
                          borderWidth: 1,
                          borderColor: 'rgba(139, 92, 246, 0.5)',
                        }}
                      />
                    )}
                    {[
                      { key: 'board', label: 'Week' },
                      { key: 'month', label: 'Month' },
                      { key: 'year', label: 'Year' },
                      { key: 'tasks', label: 'List' },
                    ].map((view) => {
                      const isActive = showTopPlannerSegmentHighlight && currentView === view.key;
                      return (
                        <TouchableOpacity
                          key={view.key}
                          onLayout={(e) => {
                            const { x, width } = e.nativeEvent.layout;
                            // Ignore measurements taken while the bar is hidden (width 0),
                            // otherwise the active-tab pill never positions on first visit.
                            if (!width) return;
                            viewChipLayouts.current[view.key] = { x, width };
                            if (currentView === view.key) {
                              setViewChipSlider({ left: x, width });
                            }
                          }}
                          onPress={() => {
                            const viewValue = view.key;
                            if (Platform.OS !== 'web') {
                              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            }
                            setActiveRightTool(null);
                            setCurrentView(viewValue);
                            setDefaultView(viewValue);
                            if (Platform.OS === 'web') {
                              const url = new URL(window.location);
                              url.searchParams.set('view', viewValue);
                              window.history.pushState({}, '', url);
                              window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: viewValue }));
                            }
                          }}
                          style={[
                            {
                              paddingVertical: 8,
                              paddingHorizontal: 14,
                              borderRadius: 9999,
                              zIndex: 10,
                            },
                            // Fallback active pill until the sliding highlight is measured
                            // (guarantees the active tab shows on first planner visit).
                            isActive && viewChipSlider.width === 0 && {
                              backgroundColor: 'rgba(139, 92, 246, 0.15)',
                              borderWidth: 1,
                              borderColor: 'rgba(139, 92, 246, 0.5)',
                            },
                          ]}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={{
                            fontSize: 15,
                            color: isActive ? 'rgba(99, 102, 241, 1)' : 'rgba(15,23,42,0.85)',
                            fontWeight: isActive ? '600' : '500',
                            fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                          }}>
                            {view.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  
                </View>

                {/* Filters + Smart Actions */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  flex: 1,
                  minWidth: 0,
                  justifyContent: 'flex-end',
                }}>
                  {showFiltersDropdown && Platform.OS === 'web' && (
                    <View
                      ref={filtersDropdownRef}
                      {...filtersHover.panelProps}
                      style={{
                        position: 'fixed',
                        top: filtersDropdownPosition.top,
                        left: filtersDropdownPosition.left,
                        backgroundColor: '#FFFFFF',
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: 'rgba(15,23,42,0.08)',
                        padding: 4,
                        minWidth: 200,
                        maxWidth: 350,
                        zIndex: 1000,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                      }}
                    >
                      {/* A child/student never picks another child; the filter is locked to them. */}
                      {!sessionIsChild && children && children.length > 1 ? (
                        <>
                      <View style={{
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: 'rgba(15,23,42,0.06)',
                        marginBottom: 4,
                      }}>
                        <Text style={{
                          fontSize: 13,
                          color: 'rgba(107, 114, 128, 0.7)',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        }}>
                          Children
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 4,
                        }}
                        onPress={() => {
                          setSelectedCalendarChildren(null);
                        }}
                      >
                        <View style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          borderWidth: 1.5,
                          borderColor: selectedCalendarChildren === null ? '#8B5CF6' : '#D1D5DB',
                          backgroundColor: selectedCalendarChildren === null ? '#8B5CF6' : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {selectedCalendarChildren === null && (
                            <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: 'bold' }}>✓</Text>
                          )}
                        </View>
                        <Text style={{ fontSize: 15, color: 'rgba(15,23,42,0.9)', fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                          All Children
                        </Text>
                      </TouchableOpacity>
                      {children.map((child) => {
                        const isSelected = selectedCalendarChildren !== null && selectedCalendarChildren?.includes(child.id);
                        return (
                          <TouchableOpacity
                            key={child.id}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 4,
                            }}
                            onPress={() => {
                              const current = selectedCalendarChildren === null
                                ? []
                                : (selectedCalendarChildren || []);
                              const newSelection = isSelected
                                ? current.filter(id => id !== child.id)
                                : [...current, child.id];
                              const allSelected = newSelection.length === children.length;
                              setSelectedCalendarChildren(allSelected ? null : (newSelection.length > 0 ? newSelection : null));
                            }}
                          >
                            <View
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: 3,
                                borderWidth: 1.5,
                                borderColor: isSelected ? '#8B5CF6' : '#D1D5DB',
                                backgroundColor: isSelected ? '#8B5CF6' : 'transparent',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {isSelected && (
                                <Check size={10} color="#FFFFFF" />
                              )}
                            </View>
                            <View
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 10,
                                overflow: 'hidden',
                                flexShrink: 0,
                                backgroundColor: '#f1f5f9',
                              }}
                            >
                              <Image
                                source={sourceForChild(child)}
                                style={{
                                  width: 20,
                                  height: 20,
                                  transform: [{ scale: 1.2 }],
                                  ...(Platform.OS === 'web' && { objectFit: 'cover' }),
                                }}
                                resizeMode="cover"
                              />
                            </View>
                            <Text style={{ fontSize: 15, color: 'rgba(15,23,42,0.9)', flex: 1, fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                              {child.first_name || child.name || 'Unknown'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                        <View style={{
                          height: 1,
                          backgroundColor: 'rgba(15,23,42,0.06)',
                          marginVertical: 4,
                        }} />
                        </>
                      ) : null}

                      <View style={{
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: 'rgba(15,23,42,0.06)',
                        marginBottom: 4,
                      }}>
                        <Text style={{
                          fontSize: 13,
                          color: 'rgba(107, 114, 128, 0.7)',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        }}>
                          Event types
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 4,
                        }}
                        onPress={() => {
                          setSelectedEventTypes(null);
                        }}
                      >
                        <View style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          borderWidth: 1.5,
                          borderColor: selectedEventTypes === null ? '#8B5CF6' : '#D1D5DB',
                          backgroundColor: selectedEventTypes === null ? '#8B5CF6' : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {selectedEventTypes === null && (
                            <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: 'bold' }}>✓</Text>
                          )}
                        </View>
                        <Text style={{ fontSize: 15, color: 'rgba(15,23,42,0.9)', fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                          All event types
                        </Text>
                      </TouchableOpacity>
                      {PLANNER_EVENT_CATEGORIES.map(({ key, label, color }) => {
                        const isSelected = selectedEventTypes?.includes(key);
                        const isDayOffFilter = key === 'Day off';
                        return (
                          <TouchableOpacity
                            key={key}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 4,
                              backgroundColor: color,
                              ...(isDayOffFilter ? {
                                borderWidth: 1,
                                borderColor: 'rgba(148, 163, 184, 0.35)',
                              } : null),
                            }}
                            onPress={() => {
                              const current = selectedEventTypes || [];
                              const newSelection = isSelected
                                ? current.filter((type) => type !== key)
                                : [...current, key];
                              setSelectedEventTypes(newSelection.length > 0 ? newSelection : null);
                            }}
                          >
                            <View
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: 3,
                                borderWidth: 1.5,
                                borderColor: isSelected ? '#8B5CF6' : '#D1D5DB',
                                backgroundColor: isSelected ? '#8B5CF6' : 'transparent',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {isSelected && (
                                <Check size={10} color="#FFFFFF" />
                              )}
                            </View>
                            <Text style={{ fontSize: 15, color: 'rgba(15,23,42,0.9)', fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  <TouchableOpacity
                      ref={topToolbarFiltersButtonRef}
                      onPress={filtersHover.wrapClickToggle(() => {
                        if (showFiltersDropdown) {
                          setShowFiltersDropdown(false);
                          return;
                        }
                        updateFiltersDropdownPosition();
                        setShowSmartActionsMenu(false);
                        setShowPlannerCreateMenu(false);
                        setShowFiltersDropdown(true);
                      })}
                      {...filtersHover.triggerProps}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingVertical: 13,
                        paddingHorizontal: 14,
                        borderRadius: 9999,
                        borderWidth: 1,
                        borderColor: '#E6EBF2',
                        backgroundColor: '#FFFFFF',
                        flexShrink: 0,
                      }}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text style={{
                        fontSize: 15,
                        color: 'rgba(15,23,42,0.85)',
                        fontWeight: '500',
                        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }}>
                        Filters
                      </Text>
                      {showFiltersDropdown ? (
                        <ChevronUp size={16} color="rgba(15,23,42,0.7)" />
                      ) : (
                        <ChevronDown size={16} color="rgba(15,23,42,0.7)" />
                      )}
                    </TouchableOpacity>
                  <TouchableOpacity
                    ref={smartActionsButtonRef}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingVertical: 13,
                      paddingHorizontal: 14,
                      borderRadius: 9999,
                      borderWidth: 1,
                      borderColor: '#E6EBF2',
                      backgroundColor: '#FFFFFF',
                      flexShrink: 0,
                    }}
                    onPress={smartActionsHover.wrapClickToggle(() => {
                      setShowPlannerCreateMenu(false);
                      setShowSmartActionsMenu((open) => !open);
                    })}
                    {...smartActionsHover.triggerProps}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Sparkles size={16} color="rgba(15,23,42,0.85)" strokeWidth={2.25} />
                    <Text style={{
                      fontSize: 15,
                      color: 'rgba(15,23,42,0.85)',
                      fontWeight: '500',
                      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }}>
                      Smart Actions
                    </Text>
                    {showSmartActionsMenu ? (
                      <ChevronUp size={16} color="rgba(15,23,42,0.7)" />
                    ) : (
                      <ChevronDown size={16} color="rgba(15,23,42,0.7)" />
                    )}
                  </TouchableOpacity>
                  <PlannerSmartActionsMenu
                    visible={showSmartActionsMenu}
                    triggerRef={smartActionsButtonRef}
                    onClose={() => setShowSmartActionsMenu(false)}
                    showExport={showPlannerHeaderQuickActions}
                    panelProps={smartActionsHover.panelProps}
                  />
                  {!denyFamilyEventEdit ? (
                    <TouchableOpacity
                      ref={plannerCreateButtonRef}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingVertical: 13,
                        paddingHorizontal: 14,
                        borderRadius: 9999,
                        borderWidth: 1,
                        borderColor: '#E6EBF2',
                        backgroundColor: '#FFFFFF',
                        flexShrink: 0,
                      }}
                      onPress={plannerCreateHover.wrapClickToggle(() => {
                        setShowSmartActionsMenu(false);
                        setShowPlannerCreateMenu((open) => !open);
                      })}
                      {...plannerCreateHover.triggerProps}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Plus size={16} color="rgba(15,23,42,0.85)" strokeWidth={2.25} />
                      <Text style={{
                        fontSize: 15,
                        color: 'rgba(15,23,42,0.85)',
                        fontWeight: '500',
                        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }}>
                        Create
                      </Text>
                      {showPlannerCreateMenu ? (
                        <ChevronUp size={16} color="rgba(15,23,42,0.7)" />
                      ) : (
                        <ChevronDown size={16} color="rgba(15,23,42,0.7)" />
                      )}
                    </TouchableOpacity>
                  ) : null}
                  <PlannerCreateMenu
                    visible={showPlannerCreateMenu}
                    triggerRef={plannerCreateButtonRef}
                    onClose={() => setShowPlannerCreateMenu(false)}
                    onSelect={openPlannerCreateModal}
                    panelProps={plannerCreateHover.panelProps}
                  />
                </View>
              </View>

            </View>
          )}
          
          {/* Planning Mode Active Banner */}
          {isCalendarScreen && (showQuickRescheduleModal || showPlanWeekModal || showBuildCurriculumModal || showProgressForecastModal) && (
            <View style={{
              width: '100%',
              backgroundColor: 'rgba(167, 139, 250, 0.08)',
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(167, 139, 250, 0.15)',
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}>
                <View style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: 'rgba(167, 139, 250, 0.6)',
                }} />
                <Text style={{
                  fontSize: 12,
                  color: 'rgba(107, 114, 128, 0.9)',
                  fontWeight: '500',
                }}>
                  Planning mode active — changes may affect multiple days
                </Text>
              </View>
            </View>
          )}
          

          {/* Tooltip for Smart Tools */}
          {Platform.OS === 'web' && tooltip.visible && (
            <View
              ref={tooltipRef}
              style={[
                {
                  position: 'fixed',
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  zIndex: 100000,
                  pointerEvents: 'none',
                  left: tooltip.x,
                  top: tooltip.y,
                  transform: [{ translateX: -50 }], // Center horizontally
                  marginTop: 8, // Position below button
                },
                { pointerEvents: 'none' },
              ]}
            >
              <Text style={{
                color: '#FFFFFF',
                fontSize: 14,
                fontWeight: '500',
                fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                whiteSpace: 'nowrap',
              }}>
                {tooltip.text}
              </Text>
            </View>
          )}
          
          {/* Main Content */}
          <View style={{ flex: 1, flexDirection: 'column', minWidth: 0 }}>
            <View style={{ flex: 1, minWidth: 0, position: 'relative' }}>
              <View
                style={{
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  zIndex: 0,
                  pointerEvents: 'auto',
                }}
              >
              <WebContent
                activeTab={activeTab}
                activeSubtab={activeSubtab}
                activeChildId={activeChildId}
                plannerView={plannerViewForWebContent}
                activeChildSection={activeChildSection}
                user={user}
                onChildAdded={handleChildAdded}
                navigation={navigation}
                showSyllabusUpload={showSyllabusUpload}
                onSyllabusProcessed={(data) => {
                  console.log('Syllabus processed:', data);
                  setShowSyllabusUpload(false);
                }}
                onCloseSyllabusUpload={() => setShowSyllabusUpload(false)}
                onTabChange={handleTabChange}
                onSubtabChange={setActiveSubtab}
                pendingDoodlePrompt={null}
                onConsumeDoodlePrompt={() => {}}
                onCalendarViewChange={(view) => {
                  // View change handled by WebContent
                }}
                showAddChildModal={showAddChildModal}
                onCloseAddChildModal={() => setShowAddChildModal(false)}
                showAddSubjectModal={showAddSubjectModal}
                onCloseAddSubjectModal={() => {
                  setShowAddSubjectModal(false);
                  setEditingSubject(null);
                }}
                onOpenSettings={(section = 'profile') => {
                  handleTabChange('settings', section);
                }}
                onEditChild={(child) => {
                  setEditingChild(child);
                  setShowEditChildModal(true);
                }}
                onAddSyllabus={() => setShowSyllabusUpload(true)}
                selectedCalendarChildren={
                  sessionIsChild && viewerScopedChildIds
                    ? viewerScopedChildIds
                    : selectedCalendarChildren
                }
                onSelectedCalendarChildrenChange={setSelectedCalendarChildren}
                selectedEventTypes={selectedEventTypes}
                onSelectedEventTypesChange={setSelectedEventTypes}
                onCurrentMonthChange={setCurrentMonth}
                subjects={subjects}
                fullSubjects={fullSubjects}
                familyId={familyId}
                children={children}
                family={family}
                onFamilyUpdate={(updatedFamily) => {
                  setFamily((prev) => ({
                    ...(prev || {}),
                    ...(updatedFamily || {}),
                  }));
                }}
                session={session}
                profile={profile}
                preloadedPlanHealth={preloadedPlanHealth}
                preloadedAcademicYears={preloadedAcademicYears}
                onHomeInitialDataReady={handleHomeInitialDataReady}
                onViewAsChild={handleChildSelect}
                onExitChildView={handleExitChildView}
              />
              </View>
            </View>
          </View>
        </AppShell>

      <ExplorerTourOverlay
        visible={
          Platform.OS === 'web' &&
          explorerParentTourOpen &&
          session?.role_flags?.isParent === true &&
          !onboardingBlocked
        }
        targetId={EXPLORER_PARENT_STEPS[explorerParentStep]?.targetId}
        title={EXPLORER_PARENT_STEPS[explorerParentStep]?.title ?? ''}
        body={EXPLORER_PARENT_STEPS[explorerParentStep]?.body ?? ''}
        primaryLabel={explorerParentStep >= 1 ? 'Done' : 'Next'}
        onNext={handleExplorerParentNext}
        onSkip={handleExplorerParentSkip}
      />

      <LearnerQuickStartModal
        visible={false}
        onGotIt={handleLearnerGotIt}
        onSkip={handleLearnerDontShow}
        visibleSections={learnerQuickStartSections}
      />

      <OnboardingModal
        visible={onboardingBlocked}
        familyId={familyId}
        initialPlanningMode={family?.default_planning_mode ?? null}
        onCompleted={async () => {
          await fetchFamilyData();
          if (Platform.OS === 'web') {
            window.dispatchEvent(new CustomEvent('refreshChildren'));
            window.dispatchEvent(new CustomEvent('refreshSubjects'));
            window.dispatchEvent(new CustomEvent('refreshProfile'));
          }
        }}
        onReady={() => setOnboardingModalReady(true)}
        onEnsureFamily={ensureFamilyAndSet}
      />

      {/* Doodle bot search modal — keep mounted while logged in so chat state persists when closed */}
      {user && !childDoodleBotDisabled && (
        <SearchModal
          visible={showDoodleSearchModal}
          onClose={closeDoodleSearch}
          onNavigate={handleDoodleNavigate}
          initialPrompt={doodleSearchInitialPrompt}
          autoSubmitInitialPrompt={doodleSearchAutoSubmit}
        />
      )}

      {/* Add Subject Modal */}
      <AddSubjectModal
        visible={showAddSubjectModal}
        onClose={() => {
          setShowAddSubjectModal(false);
          setAddSubjectPrefill({ schoolYear: null, schoolTerm: null, childIds: [] });
        }}
        familyId={familyId}
        initialSchoolYear={addSubjectPrefill.schoolYear}
        initialSchoolTerm={addSubjectPrefill.schoolTerm}
        defaultChildIds={addSubjectPrefill.childIds}
        children={children}
        onSubjectAdded={(newSubject) => {
          setSubjects((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            if (!newSubject?.id) return list;
            const idx = list.findIndex((s) => String(s?.id) === String(newSubject.id));
            if (idx === -1) return [newSubject, ...list];
            const next = [...list];
            next[idx] = { ...next[idx], ...newSubject };
            return next;
          });
          setAddSubjectPrefill({ schoolYear: null, schoolTerm: null, childIds: [] });
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            if (newSubject?.id) {
              window.dispatchEvent(new CustomEvent('subjectRecordUpserted', { detail: { subject: newSubject } }));
            }
            window.dispatchEvent(new CustomEvent('refreshSubjects'));
          }
        }}
      />

      <EditSubjectSettingsModal
        visible={showEditSubjectSettingsModal && !!editingSubject}
        onClose={() => {
          setShowEditSubjectSettingsModal(false);
          setEditingSubject(null);
          setEditSubjectSettingsInitialTab('details');
        }}
        familyId={familyId}
        subject={editingSubject}
        children={children}
        initialTab={editSubjectSettingsInitialTab}
        initialGradingSettings={editingSubject?.grading_settings}
        onSaved={(newSubject) => {
          setSubjects((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            if (!newSubject?.id) return list;
            const idx = list.findIndex((s) => String(s?.id) === String(newSubject.id));
            if (idx === -1) return list;
            const next = [...list];
            next[idx] = { ...next[idx], ...newSubject };
            return next;
          });
          setFullSubjects((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            if (!newSubject?.id) return list;
            const idx = list.findIndex((s) => String(s?.id) === String(newSubject.id));
            if (idx === -1) return list;
            const next = [...list];
            next[idx] = { ...next[idx], ...newSubject };
            return next;
          });
          setEditingSubject((prev) => (prev ? { ...prev, ...newSubject } : prev));
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('subjectRecordUpserted', { detail: { subject: newSubject } }));
            window.dispatchEvent(new CustomEvent('refreshSubjects'));
          }
        }}
      />

      <SubjectPickerModal
        visible={showLearningDaySubjectPicker}
        onClose={() => setShowLearningDaySubjectPicker(false)}
        subjects={fullSubjects.length > 0 ? fullSubjects : subjects}
        children={children}
        title="Choose a subject"
        subtitle="Pick the subject you want to add learning days for."
        emptyMessage="No subjects yet. Create one to add learning days."
        onSelect={handleLearningDaySubjectSelect}
        onCreateNew={
          sessionRestricted && !familyUserControls.allowed('subjects')
            ? null
            : handleLearningDayCreateSubject
        }
      />

      <LearningDaySetupChoiceModal
        visible={learningDaySetupChoice.visible}
        subjectName={learningDaySetupChoice.subject?.name || 'Subject'}
        onClose={closeLearningDaySetupChoice}
        onOneOffLearningEvent={handleLearningDayOneOffEvent}
        onEditSubjectSchedule={handleLearningDayEditSubjectSchedule}
      />

      <SubjectUnitsEditorHost familyId={familyId} />

      <GlobalNewMenu
        visible={showNewMenu}
        onClose={() => setShowNewMenu(false)}
        position={newMenuPosition}
        currentContext={activeTab}
        onAddChild={() => setShowAddChildModal(true)}
        onAddSubject={() => {
          if (sessionRestricted && !familyUserControls.allowed('subjects')) {
            Alert.alert('Not available', 'Your family admin has disabled adding or editing subjects.');
            return;
          }
          setShowAddSubjectModal(true);
        }}
        onAddCalendarEvent={() => {
          if (sessionRestricted && !familyUserControls.allowed('events')) {
            Alert.alert('Not available', 'Your family admin has disabled creating or editing events.');
            return;
          }
          openCreateModal('calendar_event', { date: new Date() });
          setShowNewMenu(false);
        }}
        onAddLesson={() => {
          handleTabChange('subjects', 'subjects');
          setShowNewMenu(false);
        }}
        onAddAssignment={() => {
          if (sessionRestricted && !familyUserControls.allowed('events')) {
            Alert.alert('Not available', 'Your family admin has disabled creating or editing events.');
            return;
          }
          openCreateModal('assignment', { date: new Date(), eventType: 'Assignment' });
          setShowNewMenu(false);
        }}
        onAddSyllabus={() => setShowSyllabusUpload(true)}
        onAIGenerate={() => setShowAIToolsModal(true)}
      />

      {/* Focused create modals — available from any screen */}
      {createModalKind === 'calendar_event' ? (
        <CalendarEventCreateModal
          visible
          onClose={resetCreateModalState}
          onCreated={handleCreateModalCreated}
          defaultDate={taskModalDate}
          defaultChildId={taskModalChildId}
          defaultChildIds={taskModalChildIds}
          defaultSubjectId={taskModalDefaultSubjectId}
          defaultTitle={taskModalDefaultTitle}
          defaultMaterialId={taskModalDefaultMaterialId}
          defaultStartTime={taskModalDefaultStartTime}
          familyId={familyId}
          familyMembers={familyMembersForEventing}
        />
      ) : null}

      {showDayOffModal ? (
        <DayOffCreateModal
          visible
          onClose={() => {
            setShowDayOffModal(false);
            setDayOffModalDate(null);
            setDayOffModalSchoolYearLabel(null);
          }}
          familyId={familyId}
          schoolYearLabel={dayOffModalSchoolYearLabel}
          defaultDate={dayOffModalDate}
        />
      ) : null}

      {createModalKind === 'assignment' ? (
        <AssignmentCreateModal
          visible
          onClose={resetCreateModalState}
          onCreated={handleCreateModalCreated}
          defaultDate={taskModalDate}
          defaultChildId={taskModalChildId}
          defaultChildIds={taskModalChildIds}
          defaultSubjectId={taskModalDefaultSubjectId}
          defaultTitle={taskModalDefaultTitle}
          defaultMaterialId={taskModalDefaultMaterialId}
          defaultEventType={taskModalDefaultEventType}
          defaultLinkedLearningDayEventId={taskModalLinkedLearningDayEventId}
          defaultCurriculumLessonId={taskModalDefaultCurriculumLessonId}
          requireParentApprovalDefault={taskModalSubmittalAfterCreate}
          familyId={familyId}
          familyMembers={familyMembersForEventing}
        />
      ) : null}

      {createModalKind === 'lesson' ? (
        <TaskCreateModal
          visible
          onClose={resetCreateModalState}
          onCreated={handleCreateModalCreated}
          defaultDate={taskModalDate}
          defaultChildId={taskModalChildId}
          defaultChildIds={taskModalChildIds}
          defaultSubjectId={taskModalDefaultSubjectId}
          defaultEventType="Lesson"
          defaultPlacement={taskModalDefaultPlacement}
          defaultStartTime={taskModalDefaultStartTime}
          defaultTitle={taskModalDefaultTitle}
          defaultMaterialId={taskModalDefaultMaterialId}
          familyId={familyId}
          familyMembers={familyMembersForEventing}
        />
      ) : null}

      {submittalRequestContext ? (
        <AssignmentSubmittalRequestModal
          visible
          onClose={() => setSubmittalRequestContext(null)}
          onRequested={() => setSubmittalRequestContext(null)}
          familyId={familyId}
          event={submittalRequestContext.event}
          assignment={submittalRequestContext.assignment}
          subjectId={submittalRequestContext.event?.subject_id || null}
          assignedChildIds={
            Array.isArray(submittalRequestContext.event?.child_ids)
              ? submittalRequestContext.event.child_ids
              : submittalRequestContext.event?.child_id
                ? [submittalRequestContext.event.child_id]
                : []
          }
          children={children}
        />
      ) : null}

      {showDirectSubmitForReviewModal ? (
        <SubmitForReviewModal
          visible
          onClose={() => {
            setShowDirectSubmitForReviewModal(false);
            setDirectSubmitAssignment(null);
            setDirectSubmitEventContext(null);
            setDirectSubmitChildId(null);
            setDirectSubmitViewOnly(false);
          }}
          onSubmitted={() => {
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('childAssignmentsNeedRefresh'));
              window.dispatchEvent(new CustomEvent('parentAssignmentsNeedRefresh'));
              window.dispatchEvent(new CustomEvent('refreshRightRail'));
              window.dispatchEvent(new CustomEvent('refreshCalendar'));
            }
          }}
          familyId={familyId}
          childId={directSubmitChildId || session?.child_id || activeChildId || null}
          assignment={directSubmitAssignment}
          eventContext={directSubmitEventContext}
          viewOnly={directSubmitViewOnly}
        />
      ) : null}

      {showDirectHelpModal && directHelpAssignment ? (
        <RespondToHelpRequestModal
          visible
          assignment={directHelpAssignment}
          onClose={() => {
            setShowDirectHelpModal(false);
            setDirectHelpAssignment(null);
          }}
          onResponded={() => {
            setShowDirectHelpModal(false);
            setDirectHelpAssignment(null);
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('parentAssignmentsNeedRefresh'));
              window.dispatchEvent(new CustomEvent('refreshRightRail'));
              window.dispatchEvent(new CustomEvent('refreshCalendar'));
            }
          }}
        />
      ) : null}

      {showCalendarEventEditModal && calendarEventEditContext?.event ? (
        <CalendarEventCreateModal
          visible
          editEvent={calendarEventEditContext.event}
          editScope={calendarEventEditContext.editScope || 'single'}
          familyId={familyId}
          familyMembers={familyMembersForEventing}
          onClose={() => {
            setShowCalendarEventEditModal(false);
            setCalendarEventEditContext(null);
          }}
          onUpdated={() => {
            setShowCalendarEventEditModal(false);
            setCalendarEventEditContext(null);
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('refreshCalendar'));
            }
          }}
          onDeleted={() => {
            setShowCalendarEventEditModal(false);
            setCalendarEventEditContext(null);
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('refreshCalendar'));
            }
          }}
        />
      ) : null}

      {plannerSummaryContext ? (
        <PlannerItemSummaryModal
          visible
          event={plannerSummaryContext.event}
          assignment={plannerSummaryContext.assignment}
          category={plannerSummaryContext.category}
          children={children}
          subjects={fullSubjects}
          readOnly={plannerSummaryContext.readOnly}
          onClose={() => setPlannerSummaryContext(null)}
          onEdit={openEditFromPlannerSummary}
        />
      ) : null}

      {learningDayModalState.visible && learningDayModalState.event ? (
        <LearningDayModal
          visible
          event={learningDayModalState.event}
          familyId={familyId}
          subjects={fullSubjects}
          children={children}
          onClose={closeLearningDayModal}
          onSaved={(detail) => {
            handlePlannerLearningDaySaved(detail);
            closeLearningDayModal();
          }}
        />
      ) : null}

      {showAssignmentEditModal && assignmentEditContext ? (
        <AssignmentEditModal
          visible
          familyId={familyId}
          familyMembers={familyMembersForEventing}
          assignment={assignmentEditContext.assignment}
          linkedEvent={assignmentEditContext.linkedEvent}
          initialView={assignmentEditContext.view || 'edit'}
          onClose={() => {
            setShowAssignmentEditModal(false);
            setAssignmentEditContext(null);
          }}
          onSaved={() => {
            setShowAssignmentEditModal(false);
            setAssignmentEditContext(null);
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('parentAssignmentsNeedRefresh'));
              window.dispatchEvent(new CustomEvent('refreshRightRail'));
              window.dispatchEvent(new CustomEvent('refreshCalendar'));
              window.dispatchEvent(new CustomEvent('refreshSubjects'));
            }
          }}
          onDeleted={() => {
            setShowAssignmentEditModal(false);
            setAssignmentEditContext(null);
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('parentAssignmentsNeedRefresh'));
              window.dispatchEvent(new CustomEvent('refreshRightRail'));
              window.dispatchEvent(new CustomEvent('refreshCalendar'));
              window.dispatchEvent(new CustomEvent('refreshSubjects'));
              window.dispatchEvent(new CustomEvent('eventDeleted', {
                detail: { eventId: assignmentEditContext.linkedEvent?.id || null },
              }));
            }
          }}
        />
      ) : null}

      {showDirectReviewModal && directReviewAssignment ? (
        <WorkReviewModal
          visible
          assignment={directReviewAssignment}
          onClose={() => {
            setShowDirectReviewModal(false);
            setDirectReviewAssignment(null);
          }}
          onReviewed={() => {
            setShowDirectReviewModal(false);
            setDirectReviewAssignment(null);
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('parentAssignmentsNeedRefresh'));
              window.dispatchEvent(new CustomEvent('refreshRightRail'));
              window.dispatchEvent(new CustomEvent('refreshCalendar'));
              window.dispatchEvent(new CustomEvent('refreshSubjects'));
            }
          }}
        />
      ) : null}

      {/* Global Event Modal - available from any screen (family, planner, etc.) */}
      <EventModal
        visible={showEventModal}
        eventId={eventModalEventId}
        initialEvent={eventModalInitialEvent}
        schedulingMode={eventModalSchedulingMode}
        editScope={eventModalEditScope}
        openConflictResolution={eventModalOpenConflictResolution}
        conflictResolutionContext={eventModalConflictResolutionContext}
        onOpenConflictResolutionConsumed={() => setEventModalOpenConflictResolution(false)}
        familyId={familyId}
        children={children}
        viewerRole={session?.role_flags?.isTutor ? 'tutor' : undefined}
        denyFamilyEventEdit={denyFamilyEventEdit}
        preloadedAcademicYears={preloadedAcademicYears}
        preloadedSubjects={fullSubjects}
        familyMembers={familyMembersForEventing}
        onClose={() => {
          setShowEventModal(false);
          setEventModalEventId(null);
          setEventModalInitialEvent(null);
          setEventModalSchedulingMode(false);
          setEventModalEditScope('single');
          setEventModalOpenConflictResolution(false);
          setEventModalConflictResolutionContext(null);
        }}
        onEventPatched={(patch) => {
          if (Platform.OS === 'web' && patch?.id) {
            window.dispatchEvent(
              new CustomEvent('eventPatched', {
                detail: { patch },
              })
            );
          }
        }}
        onEventUpdated={async () => {
          console.log('[WebLayout] Global EventModal onEventUpdated');
          // Refresh calendar only — do NOT dispatch eventDeleted; that optimistically removes
          // the event from planner state and makes saved events disappear until refetch.
          if (Platform.OS === 'web') {
            window.dispatchEvent(new CustomEvent('refreshCalendar'));
          }
        }}
        onEventDeleted={async (deletedEventId) => {
          console.log('[WebLayout] Global EventModal onEventDeleted:', deletedEventId);
          // Dispatch refresh events
          if (Platform.OS === 'web') {
            window.dispatchEvent(new CustomEvent('refreshCalendar'));
            window.dispatchEvent(new CustomEvent('eventDeleted', { 
              detail: { eventId: deletedEventId || eventModalEventId } 
            }));
          }
        }}
      />

      {/* AI Modals - Now handled by IntelligenceHub */}
      {/* Removed: SummarizeProgressModal, PackWeekModal, CatchUpModal instances */}

      {/* Analytics Dashboard */}
      {showAnalyticsDashboard && (
        <AnalyticsDashboard
          visible={showAnalyticsDashboard}
          onClose={() => setShowAnalyticsDashboard(false)}
          familyId={familyId}
        />
      )}

      {/* Progress Report */}
      {showProgressReport && (
        <ProgressReport
          visible={showProgressReport}
          onClose={() => setShowProgressReport(false)}
          familyId={familyId}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <ScheduleSettingsModal
          visible={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* AI Tools Modal */}
      <AIToolsModal
        visible={showAIToolsModal}
        onClose={() => setShowAIToolsModal(false)}
        onOpenPackWeek={() => {
          setShowAIToolsModal(false);
          setShowPackWeekModal(true);
        }}
        onOpenCatchUp={() => {
          setShowAIToolsModal(false);
          setShowCatchUpModal(true);
        }}
        onOpenSummarizeProgress={() => {
          setShowAIToolsModal(false);
          setShowSummarizeProgressModal(true);
        }}
        onOpenPlanYear={() => {
          setShowAIToolsModal(false);
          dispatchOpenSchoolYearSettings();
          handleTabChange('settings', 'planner-settings');
        }}
        onOpenRebalance={() => {
          setShowAIToolsModal(false);
          setRebalanceEvent(null);
          setRebalanceYearPlanId(null);
          setShowRebalanceModal(true);
        }}
        onOpenWhatIf={() => {
          setShowAIToolsModal(false);
          setShowWhatIfModal(true);
        }}
        onOpenReschedule={() => {
          setShowAIToolsModal(false);
          setShowRescheduleModal(true);
        }}
        onOpenPlanWeek={() => {
          setShowAIToolsModal(false);
          setShowPlanWeekModal(true);
        }}
        onOpenPlan2Weeks={() => {
          setShowAIToolsModal(false);
          setShowPlan2WeeksModal(true);
        }}
        onOpenAddFromLink={() => {
          setShowAIToolsModal(false);
          setShowAddFromLinkModal(true);
        }}
      />

      {/* AI Tool Modals */}
      <SchoolYearSettingsModal
        visible={showEditSchoolYearModal}
        onClose={() => {
          setShowEditSchoolYearModal(false);
          setEditSchoolYearInitialLabel(null);
        }}
        familyId={familyId}
        initialSchoolYearLabel={editSchoolYearInitialLabel}
      />

      <PackWeekModal
        visible={showPackWeekModal}
        onClose={() => setShowPackWeekModal(false)}
        familyId={familyId}
      />

      <CatchUpModal
        visible={showCatchUpModal}
        onClose={() => setShowCatchUpModal(false)}
        familyId={familyId}
      />

      <SummarizeProgressModal
        visible={showSummarizeProgressModal}
        onClose={() => setShowSummarizeProgressModal(false)}
        familyId={familyId}
      />

      {/* Global Add Child Modal */}
      <AddChildModal
        visible={showAddChildModal}
        onClose={() => setShowAddChildModal(false)}
        familyId={familyId}
        onChildAdded={() => {
          fetchFamilyData();
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refreshChildren'));
        }}
      />

      <InviteChildModal
        visible={showInviteChildModal}
        onClose={() => {
          setShowInviteChildModal(false);
          setInviteChildModalPrefillId(null);
        }}
        onOpenUserControls={() => {
          handleTabChange('settings', 'members');
        }}
        familyId={familyId}
        familyChildren={children}
        familyMembersFromApi={family?.members ?? null}
        childInviteSummariesFromApi={family?.child_invite_summaries ?? null}
        prefillChildId={inviteChildModalPrefillId}
        onPrefillConsumed={() => setInviteChildModalPrefillId(null)}
        onInvited={() => {
          fetchFamilyMembers();
          fetchFamilyData();
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refreshChildren'));
        }}
      />

      <RebalanceModal
        visible={showRebalanceModal}
        event={rebalanceEvent}
        yearPlanId={rebalanceYearPlanId}
        familyId={familyId}
        onClose={() => {
          setShowRebalanceModal(false);
          setRebalanceEvent(null);
          setRebalanceYearPlanId(null);
          setActiveRightTool(null);
        }}
        onSuccess={() => {
          fetchFamilyData();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('refreshCalendar'));
            window.dispatchEvent(new CustomEvent('refreshSubjects'));
          }
        }}
      />

      {/* Export planner date range modal */}
      <Modal
        visible={showExportModal}
        transparent
        animationType="fade"
        onRequestClose={closeExportPlannerModal}
      >
        <View style={exportModalStyles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeExportPlannerModal} />
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={exportModalStyles.modalWrap}
          >
            <AppModalShell
              title={exportModalSubjectName ? `Export planner — ${exportModalSubjectName}` : 'Export planner'}
              onClose={closeExportPlannerModal}
              disableShellScroll
              shellStyle={exportModalStyles.compactShell}
              titleRowStyle={exportModalStyles.compactTitleRow}
              contentContainerStyle={exportModalStyles.contentContainer}
              bodyStyle={exportModalStyles.shellBody}
              footer={(
                <ModalFooter
                  mode="add"
                  primaryLabel="Export"
                  onCancel={closeExportPlannerModal}
                  onPrimary={handleExportPlannerConfirm}
                  accent="#9ECFFB"
                  visuallyDisabled={!exportStartDate.trim() || !exportEndDate.trim()}
                />
              )}
            >
              <Text style={exportModalStyles.fieldLabel}>
                Choose the date range and optional columns to export as CSV.
              </Text>
              <View style={[exportModalStyles.dateTimeInlineRow, { marginBottom: 14 }]}>
                <View style={[exportModalStyles.scheduleColumn, { flex: 1 }]}>
                  <Text style={exportModalStyles.fieldLabel}>Start date</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setExportStartCalendarMonth(exportStartDate ? new Date(exportStartDate + 'T12:00:00') : new Date());
                      setShowExportStartDatePicker(true);
                    }}
                    style={exportModalStyles.select}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={[exportModalStyles.selectText, !exportStartDate && exportModalStyles.selectPlaceholder]}>
                      {exportStartDate
                        ? new Date(exportStartDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'Select start date'}
                    </Text>
                    <ChevronDown size={16} color="#64748B" />
                  </TouchableOpacity>
                </View>
                <View style={[exportModalStyles.scheduleColumn, { flex: 1 }]}>
                  <Text style={exportModalStyles.fieldLabel}>End date</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setExportEndCalendarMonth(exportEndDate ? new Date(exportEndDate + 'T12:00:00') : new Date());
                      setShowExportEndDatePicker(true);
                    }}
                    style={exportModalStyles.select}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={[exportModalStyles.selectText, !exportEndDate && exportModalStyles.selectPlaceholder]}>
                      {exportEndDate
                        ? new Date(exportEndDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'Select end date'}
                    </Text>
                    <ChevronDown size={16} color="#64748B" />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[exportModalStyles.fieldLabel, { marginBottom: 8 }]}>
                Optional columns (include when checked)
              </Text>
              <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                {PLANNER_EXPORT_OPTIONAL_COLUMN_DEFS.map(({ key, label }) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setExportColumns((prev) => ({ ...prev, [key]: !prev[key] }))}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 }}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      borderWidth: 1.5,
                      borderColor: exportColumns[key] ? '#9ECFFB' : '#CBD5E1',
                      backgroundColor: exportColumns[key] ? '#9ECFFB' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {exportColumns[key] ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                    </View>
                    <Text style={{ fontSize: 14, color: '#334155' }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </AppModalShell>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Export start date calendar picker */}
      {showExportStartDatePicker && (
        <Modal animationType="fade" transparent visible onRequestClose={() => setShowExportStartDatePicker(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setShowExportStartDatePicker(false)}>
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, width: Platform.OS === 'web' ? 320 : '90%', maxWidth: 320, ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } : {}) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <TouchableOpacity onPress={() => { const d = new Date(exportStartCalendarMonth); d.setMonth(d.getMonth() - 1); setExportStartCalendarMonth(d); }} style={{ padding: 4 }}>
                  <ChevronLeft size={20} color="#1E293B" />
                </TouchableOpacity>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#1E293B', fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>{exportStartCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                <TouchableOpacity onPress={() => { const d = new Date(exportStartCalendarMonth); d.setMonth(d.getMonth() + 1); setExportStartCalendarMonth(d); }} style={{ padding: 4 }}>
                  <ChevronRight size={20} color="#1E293B" />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity onPress={() => { const d = new Date(exportStartCalendarMonth); d.setFullYear(d.getFullYear() - 1); setExportStartCalendarMonth(d); }} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>← Year</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { const today = new Date(); setExportStartCalendarMonth(today); setExportStartDate(toLocalYYYYMMDD(today)); setShowExportStartDatePicker(false); }} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 12, color: '#64748B', textDecorationLine: 'underline' }}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { const d = new Date(exportStartCalendarMonth); d.setFullYear(d.getFullYear() + 1); setExportStartCalendarMonth(d); }} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>Year →</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                {EXPORT_CALENDAR_WEEKDAY_LABELS.map((day) => (
                  <View key={day} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '500' }}>{day}</Text>
                  </View>
                ))}
              </View>
              {(() => {
                const year = exportStartCalendarMonth.getFullYear();
                const month = exportStartCalendarMonth.getMonth();
                const firstDay = new Date(year, month, 1);
                const startDateGrid = new Date(firstDay);
                startDateGrid.setDate(startDateGrid.getDate() - startDateGrid.getDay());
                const days = [];
                const current = new Date(startDateGrid);
                for (let i = 0; i < 42; i++) { days.push(new Date(current)); current.setDate(current.getDate() + 1); }
                return (
                  <View>
                    {[0, 1, 2, 3, 4, 5].map((week) => (
                      <View key={week} style={{ flexDirection: 'row', marginBottom: 4 }}>
                        {days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                          const isCurrentMonth = day.getMonth() === month;
                          const ymd = toLocalYYYYMMDD(day);
                          const isSelected = exportStartDate === ymd;
                          const isToday = ymd === toLocalYYYYMMDD(new Date());
                          return (
                            <TouchableOpacity
                              key={idx}
                              onPress={() => { setExportStartDate(ymd); setShowExportStartDatePicker(false); }}
                              style={{
                                flex: 1,
                                aspectRatio: 1,
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 6,
                                ...(isSelected ? { backgroundColor: '#1E293B' } : {}),
                                ...(isToday && !isSelected ? { borderWidth: 2, borderColor: '#1E293B' } : {}),
                              }}
                            >
                              <Text style={{ fontSize: 13, color: isSelected ? '#fff' : (!isCurrentMonth ? '#94A3B8' : '#1E293B'), fontWeight: isSelected ? '600' : '400' }}>{day.getDate()}</Text>
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

      {/* Export end date calendar picker */}
      {showExportEndDatePicker && (
        <Modal animationType="fade" transparent visible onRequestClose={() => setShowExportEndDatePicker(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setShowExportEndDatePicker(false)}>
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, width: Platform.OS === 'web' ? 320 : '90%', maxWidth: 320, ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } : {}) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <TouchableOpacity onPress={() => { const d = new Date(exportEndCalendarMonth); d.setMonth(d.getMonth() - 1); setExportEndCalendarMonth(d); }} style={{ padding: 4 }}>
                  <ChevronLeft size={20} color="#1E293B" />
                </TouchableOpacity>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#1E293B', fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>{exportEndCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                <TouchableOpacity onPress={() => { const d = new Date(exportEndCalendarMonth); d.setMonth(d.getMonth() + 1); setExportEndCalendarMonth(d); }} style={{ padding: 4 }}>
                  <ChevronRight size={20} color="#1E293B" />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity onPress={() => { const d = new Date(exportEndCalendarMonth); d.setFullYear(d.getFullYear() - 1); setExportEndCalendarMonth(d); }} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>← Year</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { const today = new Date(); setExportEndCalendarMonth(today); setExportEndDate(toLocalYYYYMMDD(today)); setShowExportEndDatePicker(false); }} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 12, color: '#64748B', textDecorationLine: 'underline' }}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { const d = new Date(exportEndCalendarMonth); d.setFullYear(d.getFullYear() + 1); setExportEndCalendarMonth(d); }} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>Year →</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                {EXPORT_CALENDAR_WEEKDAY_LABELS.map((day) => (
                  <View key={day} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '500' }}>{day}</Text>
                  </View>
                ))}
              </View>
              {(() => {
                const year = exportEndCalendarMonth.getFullYear();
                const month = exportEndCalendarMonth.getMonth();
                const firstDay = new Date(year, month, 1);
                const startDateGrid = new Date(firstDay);
                startDateGrid.setDate(startDateGrid.getDate() - startDateGrid.getDay());
                const days = [];
                const current = new Date(startDateGrid);
                for (let i = 0; i < 42; i++) { days.push(new Date(current)); current.setDate(current.getDate() + 1); }
                return (
                  <View>
                    {[0, 1, 2, 3, 4, 5].map((week) => (
                      <View key={week} style={{ flexDirection: 'row', marginBottom: 4 }}>
                        {days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                          const isCurrentMonth = day.getMonth() === month;
                          const ymd = toLocalYYYYMMDD(day);
                          const isSelected = exportEndDate === ymd;
                          const isToday = ymd === toLocalYYYYMMDD(new Date());
                          return (
                            <TouchableOpacity
                              key={idx}
                              onPress={() => { setExportEndDate(ymd); setShowExportEndDatePicker(false); }}
                              style={{
                                flex: 1,
                                aspectRatio: 1,
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 6,
                                ...(isSelected ? { backgroundColor: '#1E293B' } : {}),
                                ...(isToday && !isSelected ? { borderWidth: 2, borderColor: '#1E293B' } : {}),
                              }}
                            >
                              <Text style={{ fontSize: 13, color: isSelected ? '#fff' : (!isCurrentMonth ? '#94A3B8' : '#1E293B'), fontWeight: isSelected ? '600' : '400' }}>{day.getDate()}</Text>
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

      {/* Scheduling Assistant Modal */}
      <Modal
        visible={showSchedulingAssistantModal}
        transparent={false}
        animationType="slide"
        onRequestClose={() => {
          setShowSchedulingAssistantModal(false);
          setSchedulingAssistantChildId(null);
        }}
      >
        <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(15,23,42,0.08)',
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>
              Scheduling Assistant
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowSchedulingAssistantModal(false);
                setSchedulingAssistantChildId(null);
              }}
              style={{ paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Text style={{ fontSize: 14, color: '#6B7280', fontWeight: '600' }}>Close</Text>
            </TouchableOpacity>
          </View>

          <SchedulingAssistant
            key={`${schedulingAssistantChildId}-${schedulingAssistantWeekStart?.getTime()}`}
            familyId={familyId}
            childId={schedulingAssistantChildId || (children.length > 0 ? children[0].id : null)}
            weekStart={schedulingAssistantWeekStart}
            events={[]} // Events will be fetched by SchedulingAssistant component
            children={children}
            onEventPress={(event) => {
              // Handle event press if needed
            }}
            onEventRightClick={(event) => {
              // Handle right click if needed
            }}
            onEventComplete={(event) => {
              // Handle event complete if needed
            }}
            onRefresh={async () => {
              // Refresh calendar data if available
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
              }
            }}
          />
        </View>
      </Modal>

      {/* What-If Analysis Modal */}
      {showWhatIfModal && (
        <AIModal
          visible={showWhatIfModal}
          onClose={() => setShowWhatIfModal(false)}
          title="What-If Analysis"
          prompt={`Perform a what-if analysis: What would happen if we added more activities to the schedule?`}
          onComplete={(result) => {
            console.log('What-If result:', result);
            setShowWhatIfModal(false);
          }}
        />
      )}

      {/* Reschedule Modal */}
      {showRescheduleModal && (
        <AIModal
          visible={showRescheduleModal}
          onClose={() => setShowRescheduleModal(false)}
          title="Reschedule Missed Work"
          prompt={`Reschedule all missed work for ${children.map(c => c.first_name || c.name).join(', ')}.`}
          onComplete={(result) => {
            console.log('Reschedule result:', result);
            setShowRescheduleModal(false);
          }}
        />
      )}

      {/* Plan Week Modal */}
      <PlanWeekModal
        visible={showPlanWeekModal}
        onClose={() => setShowPlanWeekModal(false)}
        familyId={familyId}
        children={children}
        selectedChildIds={selectedCalendarChildren}
        onComplete={(result) => {
          console.log('Plan week completed:', result);
          setShowPlanWeekModal(false);
        }}
      />

      {/* Plan 2 Weeks Modal */}
      {showPlan2WeeksModal && (
        <AIModal
          visible={showPlan2WeeksModal}
          onClose={() => setShowPlan2WeeksModal(false)}
          title="Plan Next 2 Weeks"
          prompt={`Plan the next 2 weeks for ${children.map(c => c.first_name || c.name).join(', ')}.`}
          onComplete={(result) => {
            console.log('Plan 2 Weeks result:', result);
            setShowPlan2WeeksModal(false);
          }}
        />
      )}

      {/* Add From Link Modal */}
      <AddFromLinkModal
        visible={showAddFromLinkModal}
        onClose={() => setShowAddFromLinkModal(false)}
        familyId={familyId}
      />

      {/* Resolve Conflicts Modal */}
      {/* Quick Reschedule Modal */}
      <QuickRescheduleModal
        visible={showQuickRescheduleModal}
        onClose={() => {
          setShowQuickRescheduleModal(false);
          setQuickRescheduleInitialEvent(null);
        }}
        familyId={familyId}
        children={children}
        selectedChildIds={selectedCalendarChildren}
        initialEvent={quickRescheduleInitialEvent}
        onComplete={(result) => {
          console.log('Quick reschedule completed:', result);
          setShowQuickRescheduleModal(false);
          setQuickRescheduleInitialEvent(null);
        }}
      />

      {/* Plan Week Modal */}
      <PlanWeekModal
        visible={showPlanWeekModal}
        onClose={() => setShowPlanWeekModal(false)}
        familyId={familyId}
        children={children}
        selectedChildIds={selectedCalendarChildren}
        onComplete={(result) => {
          console.log('Plan week completed:', result);
          setShowPlanWeekModal(false);
        }}
      />

      {/* Build Curriculum Modal */}
      <BuildCurriculumModal
        visible={showBuildCurriculumModal}
        onClose={() => {
          setShowBuildCurriculumModal(false);
          setBuildCurriculumInitialSubjectId(null);
          setBuildCurriculumInitialSubjectName(null);
          setBuildCurriculumInitialInputMode(null);
          setBuildCurriculumInitialSourceUrl(null);
          setBuildCurriculumInitialTopic(null);
          setBuildCurriculumInitialMaterialId(null);
        }}
        familyId={familyId}
        children={children}
        selectedChildIds={selectedCalendarChildren}
        initialSubjectId={buildCurriculumInitialSubjectId}
        initialSubjectName={buildCurriculumInitialSubjectName}
        initialInputMode={buildCurriculumInitialInputMode}
        initialSourceUrl={buildCurriculumInitialSourceUrl}
        initialTopic={buildCurriculumInitialTopic}
        initialMaterialId={buildCurriculumInitialMaterialId}
        onComplete={(result) => {
          console.log('Build curriculum completed:', result);
          setShowBuildCurriculumModal(false);
          setBuildCurriculumInitialSubjectId(null);
          setBuildCurriculumInitialSubjectName(null);
          setBuildCurriculumInitialInputMode(null);
          setBuildCurriculumInitialSourceUrl(null);
          setBuildCurriculumInitialTopic(null);
          setBuildCurriculumInitialMaterialId(null);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('refreshCalendar'));
          }
        }}
      />

      {/* Progress Forecast Modal */}
      <ProgressForecastModal
        visible={showProgressForecastModal}
        onClose={() => setShowProgressForecastModal(false)}
        familyId={familyId}
        children={children}
        selectedChildIds={selectedCalendarChildren}
        onPlanWeek={(childId) => {
          setShowProgressForecastModal(false);
          setShowPlanWeekModal(true);
        }}
        onQuickReschedule={(childId) => {
          setShowProgressForecastModal(false);
          setShowQuickRescheduleModal(true);
        }}
      />

      {/* Planner Diff Modal */}
      <PlannerDiffModal
        visible={false}
        onClose={() => {}}
      />

      {/* Edit Child Modal */}
      <EditChildModal
        visible={showEditChildModal}
        onClose={() => {
          setShowEditChildModal(false);
          setEditingChild(null);
        }}
        child={editingChild}
        familyId={familyId}
        linkedLoginEmail={editChildLinkedLoginEmail}
        childInviteStatus="none"
        pendingInviteEmail={null}
        onRequestInviteChild={(childId) => {
          setShowEditChildModal(false);
          setEditingChild(null);
          setInviteChildModalPrefillId(childId || null);
          setShowInviteChildModal(true);
        }}
        onChildUpdated={(updatedChild, meta) => {
          if (!updatedChild?.id) return;
          setChildren((prev) => mergeUpdatedChildIntoList(prev, updatedChild));
          if (meta?.unlinkLogin) {
            const sid = String(updatedChild.id);
            const cleared = {
              invite_status: 'none',
              invite_email: null,
              invite_sent_at: null,
            };
            setFamily((f) =>
              f
                ? {
                    ...f,
                    child_invite_summaries: { ...(f.child_invite_summaries || {}), [sid]: cleared },
                    members: (f.members || []).filter((m) => {
                      const role = (m.member_role || m.role || '').toLowerCase();
                      if (role !== 'child' && role !== 'student') return true;
                      if (m.child_id != null && String(m.child_id) === sid) return false;
                      return true;
                    }),
                  }
                : f
            );
          }
        }}
      />

      {/* Syllabus Upload Modal */}
      {showSyllabusUpload && (
        <SyllabusUpload
          visible={showSyllabusUpload}
          onClose={() => setShowSyllabusUpload(false)}
          onProcessed={(data) => {
            console.log('Syllabus processed:', data);
            setShowSyllabusUpload(false);
          }}
        />
      )}

        </PlannerDiffProvider>
      </FiltersProvider>
          </ToastProvider>
      </>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  onboardingCheckContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  planningModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 10000,
    }),
  },
  planningModalContent: {
    width: '95%',
    height: '90%',
    maxWidth: 1400,
    maxHeight: 900,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    }),
  },
  planningModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  planningModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  planningModalBody: {
    flex: 1,
    padding: 24,
  },
});