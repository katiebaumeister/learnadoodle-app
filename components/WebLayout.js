import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Platform, View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal, ActivityIndicator, Image, LayoutAnimation, Alert } from 'react-native';

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
import { X, Filter, Check, SlidersHorizontal, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, BookOpen, RefreshCw, Plus, LayoutGrid, Clock, Kanban, CheckSquare, Sparkles, RotateCcw, Target, Package, BarChart3, FileText, Activity, Star, Link, AlertTriangle, Search, ExternalLink, Bot, HelpCircle, Download, Bell } from 'lucide-react';
import { getChildColorFromAvatar } from '../utils/avatarColors';
import { useAuth } from '../contexts/AuthContext';
import { useOptionalFamilyUserControls } from '../contexts/FamilyUserControlsContext';
import { FiltersProvider } from '../contexts/FiltersContext';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import WebContent from './WebContent';
import SearchModal from './SearchModal';
import GlobalNewMenu from './GlobalNewMenu';
import AppShell from './layout/AppShell.js';
import RightToolbar from './RightToolbar';
import TaskCreateModal from './TaskCreateModal';
import EventModal from './events/EventModal';
import AddChildModal from './AddChildModal';
import InviteChildModal from './InviteChildModal';
import AddSubjectModal from './AddSubjectModal';
import EditChildModal from './EditChildModal';
import AskParentHelpModal from './child/AskParentHelpModal';
import SubmitForReviewModal from './child/SubmitForReviewModal';
import { linkedSummariesFromFamilyApiMembers } from '../lib/services/childInviteStatus';
import PlanYearWizard from './year/PlanYearWizard';
import PlanYearModal from './planner/PlanYearModal';
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
import HelpPopover from './planner/HelpPopover';
import PlannerSettingsPopover from './planner/PlannerSettingsPopover';
import OnboardingModal from './onboarding/OnboardingModal';
import ExplorerTourOverlay from './onboarding/ExplorerTourOverlay';
import LearnerQuickStartModal from './onboarding/LearnerQuickStartModal';
import { preloadSubjectsPlanOverview, preloadSubjectsScheduleData } from './subjects/SubjectsPlanBuilder';
import { prefetchAllSubjectProgressPlans } from '../lib/prefetchSubjectProgressPlan';
import { parseExplorerTourFromPrefs, persistExplorerTourMerge, EXPLORER_TOUR_PREFS_KEY } from '../lib/services/explorerTourClient';
import AppLoader, { ensureWebShellImagesLoaded } from './AppLoader';
import RebalanceModal from './year/RebalanceModal';
import { preloadProviderConnectionLogos } from '../lib/preloadConnectedAccountAssets';
import { collectAvatarUrlsFromFamilyState, preloadRemoteImageUrls } from '../lib/preloadRemoteImages';
import { cleanPlannerEventId } from '../lib/utils/recurringEventUtils';
import { AVATAR_KEYS } from '../assets/imageAssetMap';

/**
 * Parent-only post-onboarding explorer tour (spotlight copy).
 * Retired: parent onboarding is the Doodle setup checklist in SearchModal (DoodleSetupGuidePanel).
 * Kept for reference; prefs are auto-marked complete so the overlay never shows.
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
  {
    targetId: 'explorer-tour-right-toolbar',
    title: 'Planning tools',
    body: "Explore Learnadoodle's planning actions and analytics.",
  },
];

const normalizeConflictEventId = (rawId) => {
  const trimmed = String(rawId || '').trim();
  if (!trimmed) return '';
  return cleanPlannerEventId(trimmed) || trimmed;
};

const EXPORT_CALENDAR_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SUBJECTS_PENDING_PLAN_OPEN_STORAGE_KEY = 'ld_pending_subject_schedule_plan_open';
const DISMISSED_CONFLICTS_STORAGE_KEY = 'ld_planner_dismissed_conflicts';
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
  const [activeChildId, setActiveChildId] = useState(null);
  const [activeChildSection, setActiveChildSection] = useState('affirmation');
  const [showSyllabusUpload, setShowSyllabusUpload] = useState(false);
  const [showDoodleSearchModal, setShowDoodleSearchModal] = useState(false);
  /** Optional prefilled prompt when opening Doodle from Library (or other callers). */
  const [doodleSearchInitialPrompt, setDoodleSearchInitialPrompt] = useState(null);
  const [showPlanningModal, setShowPlanningModal] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [showInviteChildModal, setShowInviteChildModal] = useState(false);
  const [inviteChildModalPrefillId, setInviteChildModalPrefillId] = useState(null);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [addSubjectPrefill, setAddSubjectPrefill] = useState({ schoolYear: null, schoolTerm: null, childIds: [] });
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showDirectAskParentHelpModal, setShowDirectAskParentHelpModal] = useState(false);
  const [directHelpAssignment, setDirectHelpAssignment] = useState(null);
  const [directHelpEventContext, setDirectHelpEventContext] = useState(null);
  const [directHelpChildId, setDirectHelpChildId] = useState(null);
  const [showDirectSubmitForReviewModal, setShowDirectSubmitForReviewModal] = useState(false);
  const [directSubmitAssignment, setDirectSubmitAssignment] = useState(null);
  const [directSubmitEventContext, setDirectSubmitEventContext] = useState(null);
  const [directSubmitChildId, setDirectSubmitChildId] = useState(null);
  const [directSubmitViewOnly, setDirectSubmitViewOnly] = useState(false);
  const [eventModalEventId, setEventModalEventId] = useState(null);
  const [eventModalInitialEvent, setEventModalInitialEvent] = useState(null);
  /** null | 'help' | 'submission' — parent review inbox opens event details + matching modal */
  const [eventModalParentFocus, setEventModalParentFocus] = useState(null);
  const [eventModalChildFocus, setEventModalChildFocus] = useState(null);
  /** Plan "Dates with events" row edit → open EventModal in edit form, not read-only details */
  const [eventModalSchedulingMode, setEventModalSchedulingMode] = useState(false);
  /** 'single' | 'series' */
  const [eventModalEditScope, setEventModalEditScope] = useState('single');
  /** true = open only the Send to student modal (no EventDetails shell) */
  const [eventModalSendOnlyMode, setEventModalSendOnlyMode] = useState(false);
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
  const [newMenuPosition, setNewMenuPosition] = useState({ x: 320, y: 88 });
  const [children, setChildren] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [subjectsLoaded, setSubjectsLoaded] = useState(false); // Cache flag for subjects
  const [fullSubjects, setFullSubjects] = useState([]); // Full subject data for FamilyPanel courses section
  const [fullSubjectsLoaded, setFullSubjectsLoaded] = useState(false); // Cache flag for full subjects
  // Initialize familyId from session on first paint so planner/home load immediately (no blank until effect runs)
  const [familyId, setFamilyId] = useState(() => (session?.family_id ?? null));
  const [family, setFamily] = useState(null);
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
  const [showPlanYearWizard, setShowPlanYearWizard] = useState(false);
  const [planYearInitialAcademicYearId, setPlanYearInitialAcademicYearId] = useState(null);
  const [planYearInitialPlanSummaryData, setPlanYearInitialPlanSummaryData] = useState(null);
  const [planYearOpenForNewPlan, setPlanYearOpenForNewPlan] = useState(false);
  const [planYearOpenToEditList, setPlanYearOpenToEditList] = useState(false);
  const [planYearOpenDirectlyToScope, setPlanYearOpenDirectlyToScope] = useState(false);
  const [planYearFromSubjectDetail, setPlanYearFromSubjectDetail] = useState(false);
  /** Subject "Manage schedule": open logistics/editing UI without the intermediate plan-summary screen. */
  const [planYearSkipInitialPlanSummary, setPlanYearSkipInitialPlanSummary] = useState(false);
  const [planYearHighlightFromHealth, setPlanYearHighlightFromHealth] = useState(false);
  const [planYearInitialSubjectId, setPlanYearInitialSubjectId] = useState(null);
  const [planYearInitialSubjectName, setPlanYearInitialSubjectName] = useState(null);
  const [planYearInitialChildIds, setPlanYearInitialChildIds] = useState([]);
  const [planYearInitialSubjectSchoolYear, setPlanYearInitialSubjectSchoolYear] = useState(null);
  const [planYearInitialSubjectSchoolTerm, setPlanYearInitialSubjectSchoolTerm] = useState(null);
  const [planYearInitialMaterialId, setPlanYearInitialMaterialId] = useState(null);
  const [planYearInitialUnitStructureMethod, setPlanYearInitialUnitStructureMethod] = useState(null);
  const [planYearInitialSubjectHasCurriculumContent, setPlanYearInitialSubjectHasCurriculumContent] = useState(null);
  /** When PlanYearModal opens as overlay from subject detail, refresh that subject on close. */
  const planYearModalReturnSubjectIdRef = useRef(null);
  const showPlanningModalRef = useRef(false);
  const planYearInitialAcademicYearIdRef = useRef(null);
  const [showRebalanceModal, setShowRebalanceModal] = useState(false);
  const [rebalanceEvent, setRebalanceEvent] = useState(null);
  const [rebalanceYearPlanId, setRebalanceYearPlanId] = useState(null);
  const [showPlanYearDropdown, setShowPlanYearDropdown] = useState(false);
  const planYearDropdownButtonRef = useRef(null);
  const planYearDropdownRef = useRef(null);
  const [planYearDropdownPosition, setPlanYearDropdownPosition] = useState({ top: 0, left: 0 });
  const planYearReturnViewRef = useRef('month');
  const resetInlinePlanYearOpenState = useCallback(() => {
    setPlanYearHighlightFromHealth(false);
    setPlanYearFromSubjectDetail(false);
    setPlanYearInitialAcademicYearId(null);
    setPlanYearInitialPlanSummaryData(null);
    setPlanYearOpenForNewPlan(false);
    setPlanYearOpenToEditList(false);
    setPlanYearOpenDirectlyToScope(false);
    setPlanYearSkipInitialPlanSummary(false);
    setPlanYearInitialSubjectId(null);
    setPlanYearInitialSubjectName(null);
    setPlanYearInitialChildIds([]);
    setPlanYearInitialSubjectSchoolYear(null);
    setPlanYearInitialSubjectSchoolTerm(null);
    setPlanYearInitialMaterialId(null);
    setPlanYearInitialUnitStructureMethod(null);
    setPlanYearInitialSubjectHasCurriculumContent(null);
  }, []);
  useEffect(() => {
    showPlanningModalRef.current = showPlanningModal;
  }, [showPlanningModal]);
  useEffect(() => {
    planYearInitialAcademicYearIdRef.current = planYearInitialAcademicYearId;
  }, [planYearInitialAcademicYearId]);
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
  const [plannerSearchQuery, setPlannerSearchQuery] = useState('');
  const plannerSearchInputRef = useRef(null);
  const [plannerSearchResults, setPlannerSearchResults] = useState([]);
  const [isSearchingPlanner, setIsSearchingPlanner] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchInputRef = useRef(null);
  const searchDropdownRef = useRef(null);
  const [searchDropdownPosition, setSearchDropdownPosition] = useState({ top: 0, left: 0 });
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

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const familyUserControls = useOptionalFamilyUserControls();
  const allowedRef = useRef(familyUserControls.allowed);
  allowedRef.current = familyUserControls.allowed;
  const isSelfManagedStudent = familyUserControls?.isSelfManagedStudent === true;
  const showPlannerHeaderQuickActions =
    session?.role_flags?.isChild !== true || isSelfManagedStudent;
  const sessionRestricted = !!(session?.role_flags?.isChild || session?.role_flags?.isTutor);
  const denyFamilyEventEdit = sessionRestricted && !familyUserControls.allowed('events');
  const childDoodleBotDisabled =
    session?.role_flags?.isChild === true &&
    familyUserControls.effectivePermissions?.canUseDoodleBot === false;
  const hidePlannerNewForRestrictedChild =
    session?.role_flags?.isChild === true && denyFamilyEventEdit;
  const canShowPlannerNewButton = !isTutorUser && !hidePlannerNewForRestrictedChild;
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
      (homeNeedsInitialData && !homeInitialDataReady) ||
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
  const [filterExpanded, setFilterExpanded] = useState(false);
  const filterButtonRef = useRef(null);
  const [filterDropdownPosition, setFilterDropdownPosition] = useState({ top: 0, left: 0 });
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
  const topToolbarFiltersButtonRef = useRef(null);
  const helpButtonRef = useRef(null);
  const conflictNotificationsButtonRef = useRef(null);
  const conflictNotificationsPopoverRef = useRef(null);
  const conflictNotificationsCloseTimerRef = useRef(null);
  const [showHelpPopover, setShowHelpPopover] = useState(false);
  const [showConflictNotificationsPopover, setShowConflictNotificationsPopover] = useState(false);
  const [dismissedConflictNotifications, setDismissedConflictNotifications] = useState([]);
  const [helpPopoverPosition, setHelpPopoverPosition] = useState({ top: 0, left: 0 });
  const helpPopoverRef = useRef(null);
  const helpPopoverCloseTimerRef = useRef(null);
  const [showPlannerSettingsPopover, setShowPlannerSettingsPopover] = useState(false);
  const [plannerSettingsPopoverPosition, setPlannerSettingsPopoverPosition] = useState({ top: 0, left: 0 });
  const settingsButtonRef = useRef(null);
  const [filtersDropdownPosition, setFiltersDropdownPosition] = useState({ top: 0, left: 0 });
  const filtersDropdownRef = useRef(null);
  const [selectedEventTypes, setSelectedEventTypes] = useState(null);
  const [selectedConnectedAccounts, setSelectedConnectedAccounts] = useState(null);
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

  const clearHelpPopoverCloseTimer = useCallback(() => {
    if (helpPopoverCloseTimerRef.current) {
      clearTimeout(helpPopoverCloseTimerRef.current);
      helpPopoverCloseTimerRef.current = null;
    }
  }, []);

  const clearConflictNotificationsCloseTimer = useCallback(() => {
    if (conflictNotificationsCloseTimerRef.current) {
      clearTimeout(conflictNotificationsCloseTimerRef.current);
      conflictNotificationsCloseTimerRef.current = null;
    }
  }, []);

  const openConflictNotificationsPopover = useCallback(() => {
    clearConflictNotificationsCloseTimer();
    if (dismissedConflictNotifications.length === 0) return;
    setShowConflictNotificationsPopover(true);
  }, [clearConflictNotificationsCloseTimer, dismissedConflictNotifications.length]);

  const scheduleConflictNotificationsClose = useCallback(() => {
    clearConflictNotificationsCloseTimer();
    conflictNotificationsCloseTimerRef.current = setTimeout(() => {
      setShowConflictNotificationsPopover(false);
      conflictNotificationsCloseTimerRef.current = null;
    }, 140);
  }, [clearConflictNotificationsCloseTimer]);

  const updateHelpPopoverPosition = useCallback(() => {
    if (Platform.OS === 'web' && helpButtonRef.current) {
      const node = helpButtonRef.current._nativeNode || helpButtonRef.current;
      if (node && typeof node.getBoundingClientRect === 'function') {
        const rect = node.getBoundingClientRect();
        setHelpPopoverPosition({
          top: rect.bottom + 4,
          left: rect.left,
        });
      }
    }
  }, []);

  const openHelpPopover = useCallback(() => {
    clearHelpPopoverCloseTimer();
    updateHelpPopoverPosition();
    setShowPlannerSettingsPopover(false);
    setShowHelpPopover(true);
  }, [clearHelpPopoverCloseTimer, updateHelpPopoverPosition]);

  const scheduleHelpPopoverClose = useCallback(() => {
    clearHelpPopoverCloseTimer();
    helpPopoverCloseTimerRef.current = setTimeout(() => {
      setShowHelpPopover(false);
      helpPopoverCloseTimerRef.current = null;
    }, 120);
  }, [clearHelpPopoverCloseTimer]);

  useEffect(() => () => clearHelpPopoverCloseTimer(), [clearHelpPopoverCloseTimer]);
  useEffect(() => () => clearConflictNotificationsCloseTimer(), [clearConflictNotificationsCloseTimer]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(DISMISSED_CONFLICTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalized = parsed
        .filter((item) => item && item.eventId)
        .slice(0, 12)
        .map((item) => ({
          eventId: normalizeConflictEventId(item.eventId),
          eventTitle: item.eventTitle || 'Event',
          conflictCount: Number(item.conflictCount || 0),
          conflictMessage: item.conflictMessage || null,
          movedEvent: item.movedEvent || null,
          conflictEvent: item.conflictEvent || null,
          timestamp: Number(item.timestamp || Date.now()),
        }));
      setDismissedConflictNotifications(normalized);
    } catch (_) {
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        DISMISSED_CONFLICTS_STORAGE_KEY,
        JSON.stringify((dismissedConflictNotifications || []).slice(0, 12)),
      );
    } catch (_) {
    }
  }, [dismissedConflictNotifications]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handlePageHide = () => {
      const active = window.__ldActiveConflictBanner;
      if (!active?.visible || !active?.eventId) return;
      try {
        const raw = window.sessionStorage.getItem(DISMISSED_CONFLICTS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        const current = Array.isArray(parsed) ? parsed : [];
        const key = normalizeConflictEventId(active.eventId);
        const remaining = current.filter(
          (item) => normalizeConflictEventId(item?.eventId || '') !== key,
        );
        const next = [
          {
            eventId: key,
            eventTitle: active.eventTitle || 'Event',
            conflictCount: Number(active.conflictCount || 0),
            conflictMessage: active.conflictMessage || null,
            movedEvent: active.movedEvent || null,
            conflictEvent: active.conflictEvent || null,
            timestamp: Date.now(),
          },
          ...remaining,
        ].slice(0, 12);
        window.sessionStorage.setItem(DISMISSED_CONFLICTS_STORAGE_KEY, JSON.stringify(next));
      } catch (_) {
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, []);
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
  const [exportColumns, setExportColumns] = useState({
    instructionalTime: false,
    plan: false,
    location: false,
    mode: false,
    instructor: false,
    subject: false,
    grade: false,
    unit: false,
    percentOfTotal: false,
    attachmentTitle: false,
    notes: false,
  });
  const [showExportStartDatePicker, setShowExportStartDatePicker] = useState(false);
  const [showExportEndDatePicker, setShowExportEndDatePicker] = useState(false);
  const [exportStartCalendarMonth, setExportStartCalendarMonth] = useState(() => new Date());
  const [exportEndCalendarMonth, setExportEndCalendarMonth] = useState(() => new Date());
  const [exportModalSubjectId, setExportModalSubjectId] = useState(null);
  const [exportModalSubjectName, setExportModalSubjectName] = useState(null);

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
  
  // Get default view from localStorage
  const getDefaultView = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('plannerDefaultView') || null;
    }
    return null;
  };
  
  // Set default view in localStorage
  const setDefaultView = (view) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('plannerDefaultView', view);
    }
  };
  
  const [defaultView, setDefaultViewState] = useState(() => getDefaultView());
  
  // Get current view from URL params, localStorage default, or 'month'
  const [currentView, setCurrentView] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlView = urlParams.get('view');
      if (urlView) return urlView;
      const savedDefault = getDefaultView();
      if (savedDefault) return savedDefault;
      return 'month';
    }
    return 'month';
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

  // Update view chip slider position when currentView changes (Month / Week / To-do only)
  useEffect(() => {
    const chipKeys = ['month', 'board', 'tasks'];
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

  // Handle click outside Help popover
  useEffect(() => {
    if (showHelpPopover && Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleClickOutside = (event) => {
        const buttonNode = helpButtonRef.current?._nativeNode || helpButtonRef.current;
        const popoverNode = helpPopoverRef.current?._nativeNode || helpPopoverRef.current;
        const target = event.target;
        const isInsideButton = buttonNode && (buttonNode === target || buttonNode.contains(target));
        const isInsidePopover = popoverNode && (popoverNode === target || popoverNode.contains(target));
        if (!isInsideButton && !isInsidePopover) {
          setShowHelpPopover(false);
        }
      };
      document.addEventListener('click', handleClickOutside, true);
      return () => document.removeEventListener('click', handleClickOutside, true);
    }
  }, [showHelpPopover]);

  // Handle click outside conflict notifications popover
  useEffect(() => {
    if (showConflictNotificationsPopover && Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleClickOutside = (event) => {
        const buttonNode = conflictNotificationsButtonRef.current?._nativeNode || conflictNotificationsButtonRef.current;
        const popoverNode = conflictNotificationsPopoverRef.current?._nativeNode || conflictNotificationsPopoverRef.current;
        const target = event.target;
        const isInsideButton = buttonNode && (buttonNode === target || buttonNode.contains(target));
        const isInsidePopover = popoverNode && (popoverNode === target || popoverNode.contains(target));
        if (!isInsideButton && !isInsidePopover) {
          setShowConflictNotificationsPopover(false);
        }
      };
      document.addEventListener('click', handleClickOutside, true);
      return () => document.removeEventListener('click', handleClickOutside, true);
    }
  }, [showConflictNotificationsPopover]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleConflictDismissed = (event) => {
      const detail = event?.detail || {};
      if (!detail?.eventId) return;
      const key = normalizeConflictEventId(detail.eventId);
      setDismissedConflictNotifications((prev) => {
        const remaining = prev.filter(
          (item) => normalizeConflictEventId(item.eventId) !== key,
        );
        const next = [
          {
            eventId: key,
            eventTitle: detail.eventTitle || 'Event',
            conflictCount: Number(detail.conflictCount || 0),
            conflictMessage: detail.conflictMessage || null,
            movedEvent: detail.movedEvent || null,
            conflictEvent: detail.conflictEvent || null,
            timestamp: detail.timestamp || Date.now(),
          },
          ...remaining,
        ];
        return next.slice(0, 12);
      });
      setShowConflictNotificationsPopover(false);
    };
    window.addEventListener('plannerDragConflictDismissed', handleConflictDismissed);
    return () => window.removeEventListener('plannerDragConflictDismissed', handleConflictDismissed);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleConflictResolved = (event) => {
      const resolvedId = normalizeConflictEventId(event?.detail?.eventId || '');
      if (!resolvedId) return;
      setDismissedConflictNotifications((prev) =>
        (prev || []).filter(
          (item) => normalizeConflictEventId(item?.eventId || '') !== resolvedId,
        ),
      );
    };
    window.addEventListener('plannerDragConflictResolved', handleConflictResolved);
    return () => window.removeEventListener('plannerDragConflictResolved', handleConflictResolved);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleEventRescheduled = (event) => {
      const detail = event?.detail || {};
      if (detail?.apiError) return;
      const resolvedId = normalizeConflictEventId(detail?.eventId || '');
      if (!resolvedId) return;
      setDismissedConflictNotifications((prev) =>
        (prev || []).filter(
          (item) => normalizeConflictEventId(item?.eventId || '') !== resolvedId,
        ),
      );
    };
    window.addEventListener('eventRescheduled', handleEventRescheduled);
    return () => window.removeEventListener('eventRescheduled', handleEventRescheduled);
  }, []);

  // Handle click outside Planner Settings popover
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

  // Handle click outside Plan Year dropdown
  useEffect(() => {
    if (showPlanYearDropdown && Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleClickOutside = (event) => {
        const buttonNode = planYearDropdownButtonRef.current?._nativeNode || planYearDropdownButtonRef.current;
        const dropdownNode = planYearDropdownRef.current?._nativeNode || planYearDropdownRef.current;
        const target = event.target;
        const isInsideButton = buttonNode && (buttonNode === target || buttonNode.contains(target));
        const isInsideDropdown = dropdownNode && (dropdownNode === target || dropdownNode.contains(target));
        if (!isInsideButton && !isInsideDropdown) {
          setShowPlanYearDropdown(false);
        }
      };
      document.addEventListener('click', handleClickOutside, true);
      return () => document.removeEventListener('click', handleClickOutside, true);
    }
  }, [showPlanYearDropdown]);

  // Search events when query changes
  useEffect(() => {
    if (!plannerSearchQuery.trim() || !familyId) {
      setPlannerSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    const searchEvents = async () => {
      setIsSearchingPlanner(true);
      try {
        const normalizedQuery = String(plannerSearchQuery || '').toLowerCase().trim();
        const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
        const escapedQuery = normalizedQuery.replace(/[%_]/g, '\\$&');
        console.log('[PlannerSearch] Searching with query:', plannerSearchQuery, 'familyId:', familyId);
        const childNameById = new Map(
          (children || []).map((child) => [String(child?.id || ''), String(child?.first_name || child?.name || '').trim()])
        );

        // Match child-name tokens (e.g., "max", "lily") to IDs.
        const matchedChildIds = (children || [])
          .filter((child) => {
            const fullName = `${child?.first_name || ''} ${child?.last_name || ''} ${child?.name || ''}`.toLowerCase();
            return queryTokens.some((token) => token && fullName.includes(token));
          })
          .map((child) => child?.id)
          .filter(Boolean);

        const textSearch = await supabase
          .from('events')
          .select('*')
          .eq('family_id', familyId)
          .is('deleted_at', null)
          .neq('status', 'canceled')
          .or(`title.ilike.%${escapedQuery}%,description.ilike.%${escapedQuery}%,subject.ilike.%${escapedQuery}%,subject_name.ilike.%${escapedQuery}%,event_type.ilike.%${escapedQuery}%,source.ilike.%${escapedQuery}%`)
          .order('start_ts', { ascending: false })
          .limit(250);

        // Fallback text query in case some columns in OR are unavailable in a deployment.
        const titleOnlySearch = textSearch.error
          ? await supabase
              .from('events')
              .select('*')
              .eq('family_id', familyId)
              .is('deleted_at', null)
              .neq('status', 'canceled')
              .ilike('title', `%${escapedQuery}%`)
              .order('start_ts', { ascending: false })
              .limit(250)
          : null;

        const childSearch = matchedChildIds.length > 0
          ? await supabase
              .from('events')
              .select('*')
              .eq('family_id', familyId)
              .is('deleted_at', null)
              .neq('status', 'canceled')
              .in('child_id', matchedChildIds)
              .order('start_ts', { ascending: false })
              .limit(250)
          : { data: [], error: null };

        if (textSearch.error && titleOnlySearch?.error) {
          console.error('[PlannerSearch] Error searching events:', textSearch.error, titleOnlySearch.error);
          setPlannerSearchResults([]);
          setShowSearchDropdown(true);
          return;
        }

        const mergedById = new Map();
        [...(textSearch.data || []), ...(titleOnlySearch?.data || []), ...(childSearch.data || [])].forEach((event) => {
          if (!event?.id) return;
          mergedById.set(event.id, event);
        });

        const mergedEvents = Array.from(mergedById.values());
        const results = mergedEvents
          .map((event) => {
              const eventDate = event.start_ts ? new Date(event.start_ts) : null;
              const hasValidDate = eventDate && Number.isFinite(eventDate.getTime());
              const isBacklog = event.is_backlog === true || (hasValidDate && eventDate.getFullYear() >= 2099);
              const title = String(event.title || 'Untitled Event');
              const description = String(event.description || '');
              const eventType = String(event.event_type || event.source || '');
              const subjectName = String(event.subject_name || event.subject || '');
              const childNames = [];
              const childId = String(event.child_id || '');
              if (childId && childNameById.has(childId)) {
                childNames.push(childNameById.get(childId));
              }
              if (Array.isArray(event.child_ids)) {
                event.child_ids.forEach((id) => {
                  const key = String(id || '');
                  if (!key) return;
                  const candidate = childNameById.get(key);
                  if (candidate) childNames.push(candidate);
                });
              }
              const uniqueChildNames = [...new Set(childNames.filter(Boolean))];
              const childNamesText = uniqueChildNames.join(' ');

              const fullDateLabel = hasValidDate
                ? eventDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                : '';
              const shortDateLabel = hasValidDate
                ? eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '';
              const compactDateLabel = hasValidDate
                ? `${eventDate.getMonth() + 1}/${eventDate.getDate()}`
                : '';

              const haystack = [
                title,
                description,
                eventType,
                subjectName,
                childNamesText,
                fullDateLabel,
                shortDateLabel,
                compactDateLabel,
              ].join(' ').toLowerCase();

              if (queryTokens.length > 0 && !queryTokens.every((token) => haystack.includes(token))) {
                return null;
              }

              let score = 0;
              let matchReason = 'Matched details';
              const titleLower = title.toLowerCase();
              const subjectLower = subjectName.toLowerCase();
              const typeLower = eventType.toLowerCase();
              const childLower = childNamesText.toLowerCase();
              const dateLower = [fullDateLabel, shortDateLabel, compactDateLabel].join(' ').toLowerCase();

              if (normalizedQuery && titleLower.includes(normalizedQuery)) {
                score += 50;
                matchReason = 'Matched title';
              } else if (normalizedQuery && subjectLower.includes(normalizedQuery)) {
                score += 35;
                matchReason = 'Matched subject';
              } else if (normalizedQuery && childLower.includes(normalizedQuery)) {
                score += 30;
                matchReason = 'Matched student';
              } else if (normalizedQuery && typeLower.includes(normalizedQuery)) {
                score += 25;
                matchReason = 'Matched event type';
              } else if (normalizedQuery && dateLower.includes(normalizedQuery)) {
                score += 20;
                matchReason = 'Matched date';
              }

              queryTokens.forEach((token) => {
                if (titleLower.includes(token)) score += 8;
                if (subjectLower.includes(token)) score += 6;
                if (childLower.includes(token)) score += 6;
                if (typeLower.includes(token)) score += 4;
                if (dateLower.includes(token)) score += 3;
              });

              return {
                id: event.id,
                title,
                date: hasValidDate ? eventDate : new Date(0),
                dateStr: isBacklog
                  ? 'Backlog'
                  : hasValidDate
                    ? eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'No date',
                isBacklog,
                matchReason,
                score,
              };
            })
            .filter(Boolean)
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              return b.date - a.date;
            })
            .slice(0, 20);

        console.log('[PlannerSearch] Mapped results:', results.length);
        setPlannerSearchResults(results);
        setShowSearchDropdown(true);
      } catch (error) {
        console.error('[PlannerSearch] Exception searching events:', error);
        setPlannerSearchResults([]);
        setShowSearchDropdown(true);
      } finally {
        setIsSearchingPlanner(false);
      }
    };

    const timeoutId = setTimeout(searchEvents, 300);
    return () => clearTimeout(timeoutId);
  }, [plannerSearchQuery, familyId, children]);

  // Update search dropdown position
  useEffect(() => {
    if (showSearchDropdown && Platform.OS === 'web' && searchInputRef.current) {
      const updatePosition = () => {
        const node = searchInputRef.current?._nativeNode || searchInputRef.current;
        if (node && typeof node.getBoundingClientRect === 'function') {
          const rect = node.getBoundingClientRect();
          setSearchDropdownPosition({
            top: rect.bottom + 4,
            left: rect.left,
          });
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
  }, [showSearchDropdown]);

  // Handle click outside search dropdown
  useEffect(() => {
    if (showSearchDropdown && Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleClickOutside = (event) => {
        const inputNode = searchInputRef.current?._nativeNode || searchInputRef.current;
        const dropdownNode = searchDropdownRef.current?._nativeNode || searchDropdownRef.current;
        
        const target = event.target;
        const isInsideInput = inputNode && (inputNode === target || inputNode.contains(target));
        const isInsideDropdown = dropdownNode && (dropdownNode === target || dropdownNode.contains(target));
        
        if (!isInsideInput && !isInsideDropdown) {
          setShowSearchDropdown(false);
        }
      };
      
      document.addEventListener('click', handleClickOutside, true);
      
      return () => {
        document.removeEventListener('click', handleClickOutside, true);
      };
    }
  }, [showSearchDropdown]);

  // Handle selecting a search result - navigate to date or backlog
  const handleSearchResultSelect = (result) => {
    setPlannerSearchQuery('');
    setShowSearchDropdown(false);
    setPlannerSearchResults([]);
    
    if (typeof window !== 'undefined') {
      // If event is in backlog, switch to tasks view with backlog tab
      if (result.isBacklog) {
        // Switch to tasks view with backlog section in URL
        const url = new URL(window.location.href);
        url.searchParams.set('view', 'tasks');
        url.searchParams.set('section', 'backlog');
        window.history.pushState({}, '', url.toString());
        
        // Dispatch event to switch to tasks view
        window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'tasks' }));
        
        // Also dispatch event to set backlog section (in case TasksView listens to it)
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('plannerTasksViewChange', { detail: { section: 'backlog' } }));
        }, 200);
      } else {
        // Calendar event: navigate to event's date and open event modal (no screen switch)
        const eventDate = result.date;
        setCurrentMonth(eventDate);
        
        // If currently in tasks view, switch to calendar (month) view so modal shows over calendar
        if (currentView === 'tasks') {
          const url = new URL(window.location.href);
          url.searchParams.set('view', 'month');
          window.history.pushState({}, '', url.toString());
          window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'month' }));
          setCurrentView('month');
        }
        
        window.dispatchEvent(new CustomEvent('plannerMonthChange', { detail: eventDate }));
        // Open event modal instead of just navigating
        if (result.id) {
          window.dispatchEvent(new CustomEvent('openEventModal', { detail: { eventId: result.id } }));
        }
      }
    }
  };

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
        // If URL has a view param, use it; otherwise check localStorage default
        if (urlView) {
          setCurrentView(urlView);
        } else {
          const savedDefault = getDefaultView();
          if (savedDefault) {
            setCurrentView(savedDefault);
          } else {
            setCurrentView('month');
          }
        }
      };
      
      // Initial sync
      updateView();
      
      // Listen for URL changes (popstate event)
      window.addEventListener('popstate', updateView);
      
      // Listen for plannerViewChange events (e.g. from month day click → board)
      const handleViewChange = (event) => {
        const newView = event.detail;
        setCurrentView(newView);
        // Clear right-toolbar focus when returning to main planner segments
        if (['month', 'board', 'tasks'].includes(newView)) {
          setActiveRightTool(null);
        }
        const url = new URL(window.location.href);
        if (newView === 'month' || newView === 'Month') {
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

  // Handle view change
  const handleViewChange = (view) => {
    console.log('[WebLayout] handleViewChange called with view:', view);
    setCurrentView(view);
    // Note: setShowViewDropdown is now called in onPress to close immediately
    
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (view === 'month') {
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
        try {
          const { data: childrenData, error: childrenError } = await supabase
            .from('children')
            .select('*')
            .eq('family_id', resolvedFamilyId)
            .eq('archived', false);
          
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
              setChildren(cleaned);
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
            setChildren(cleaned);
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
  }, [fetchFamilyData, fetchFamilyMembers, authUserId, sessionFamilyId]);

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

  // When onboarding completes (modal or event), close modal optimistically and refresh family/calendar/children/subjects
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleOnboardingCompleted = () => {
      setOnboardingJustCompleted(true);
      setInitialOnboardingBlocked(false);
      fetchFamilyData();
      fetchFamilyMembers();
      window.dispatchEvent(new CustomEvent('refreshCalendar'));
      window.dispatchEvent(new CustomEvent('refreshChildren'));
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
    };
    window.addEventListener('onboardingCompleted', handleOnboardingCompleted);
    return () => window.removeEventListener('onboardingCompleted', handleOnboardingCompleted);
  }, [fetchFamilyData, fetchFamilyMembers]);

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
      } else if (pathname === '/subjects' || pathname === '/intelligence') {
        // Keep legacy /intelligence compatible but normalize to /subjects.
        if (pathname === '/intelligence') {
          window.history.replaceState({}, '', '/subjects');
        }
        setActiveTab('subjects');
        setActiveTopNav('subjects');
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
      } else if (pathname === '/family' || pathname === '/profile') {
        if (pathname === '/profile') {
          window.history.replaceState({}, '', '/family');
        }
        if (activeTab !== 'profile') {
          setActiveTab('profile');
          setActiveTopNav('profile');
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
    } else if (activeTab === 'settings') {
      // Preserve activeChildId so Profile can show the child's email when parent is "viewing as" that child
    } else if (activeSubtab) {
      setActiveChildId(activeSubtab);
    } else {
      setActiveChildId(null);
      setActiveChildSection('affirmation');
    }
  }, [activeTab, activeSubtab]);

  useEffect(() => {
    if (activeTab === 'home') {
      setActiveTopNav((prev) => (prev === 'family' ? prev : 'home'));
    } else if (activeTab === 'explore') {
      setActiveTopNav('explore');
    } else if ((activeTab === 'calendar' || activeTab === 'planner') && activeTopNav !== 'family') {
      setActiveTopNav('planner');
    } else if (activeTab === 'materials') {
      setActiveTopNav('materials');
    } else if (activeTab === 'subjects' || (activeTab && activeTab.startsWith('subject-'))) {
      setActiveTopNav('subjects');
    } else if (activeTab === 'intelligence') {
      setActiveTopNav('intelligence');
    } else if (activeTab === 'profile') {
      setActiveTopNav('profile');
    } else if (activeTab === 'tutor-students') {
      setActiveTopNav('tutor-students');
    } else if (activeTab === 'settings') {
      setActiveTopNav('new');
    } else if ((activeTab === 'children-list' || (activeTab && activeTab.startsWith('child-'))) && activeChildId) {
      setActiveTopNav('family');
    }
  }, [activeTab, activeChildId, activeTopNav]);

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
      // If event has detail (subject object), it's edit mode
      const subject = e.detail?.subject || null;
      const incomingSchoolYear = e.detail?.schoolYear || null;
      const incomingSchoolTerm = e.detail?.schoolTerm || null;
      const incomingChildIds = Array.isArray(e.detail?.childIds) ? e.detail.childIds.filter(Boolean) : [];
      setEditingSubject(subject);
      setAddSubjectPrefill({
        schoolYear: subject ? null : incomingSchoolYear,
        schoolTerm: subject ? null : incomingSchoolTerm,
        childIds: subject ? [] : incomingChildIds,
      });
      setShowAddSubjectModal(true);
    };
    window.addEventListener('openAddSubjectModal', handler);
    return () => window.removeEventListener('openAddSubjectModal', handler);
  }, []);

  // Listen for openTaskModal event to open the global TaskCreateModal
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
      setShowTaskModal(true);
    };
    
    window.addEventListener('openTaskModal', handleOpenTaskModal);
    
    return () => {
      window.removeEventListener('openTaskModal', handleOpenTaskModal);
    };
  }, [isTutorUser]);

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
      const sendOnlyMode = !!detail.sendOnlyMode;
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
            setDirectHelpAssignment(detail.assignment || null);
            setDirectHelpEventContext(eventContext);
            setDirectHelpChildId(resolvedChildId);
            setShowDirectAskParentHelpModal(true);
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

      // Open the event modal
      setEventModalEventId(eventId);
      setEventModalInitialEvent(initialEvent);
      setEventModalSchedulingMode(schedulingMode);
      setEventModalEditScope(editScope);
      setEventModalSendOnlyMode(sendOnlyMode);
      setEventModalOpenConflictResolution(openConflictResolution);
      setEventModalConflictResolutionContext(conflictResolutionContext);
      setEventModalParentFocus(
        parentEventFocus === 'help' || parentEventFocus === 'submission' || parentEventFocus === 'send'
          ? parentEventFocus
          : null
      );
      setEventModalChildFocus(
        childEventFocus === 'help' || childEventFocus === 'submission'
          ? childEventFocus
          : null
      );
      setShowEventModal(true);
    };
    
    window.addEventListener('openEventModal', handleOpenEventModal);
    
    return () => {
      window.removeEventListener('openEventModal', handleOpenEventModal);
    };
  }, [activeTab, denyFamilyEventEdit]);

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
    const handler = () => {
      fetchFamilyMembers();
      setInviteChildModalPrefillId(null);
      setShowInviteChildModal(true);
    };
    window.addEventListener('openInviteChildModal', handler);
    return () => window.removeEventListener('openInviteChildModal', handler);
  }, [fetchFamilyMembers]);

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
      // Navigate to Intelligence Hub → Plan the Year instead
      navigateToIntelligence({ tab: 'planner-ai', tool: 'planYear' });
    };
    window.addEventListener('openYearWizard', handler);
    return () => window.removeEventListener('openYearWizard', handler);
  }, [navigateToIntelligence]);

  // Listen for openPlanYearModal event (from PlanHealthBanner / FixItSuggestionsModal / EventDetails / AddSubjectModal / MagicExtract / Library)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (event) => {
      const rf = sessionRef.current?.role_flags;
      const restricted = !!(rf?.isChild || rf?.isTutor);
      if (restricted && !allowedRef.current('plans')) {
        Alert.alert('Not available', 'Your family admin has disabled adding or editing plans.');
        return;
      }
      const detail = event?.detail ?? {};
      const from = detail.from;
      const yearIdFromEvent =
        detail.academicYearId ||
        detail.academic_year_id ||
        detail.yearPlanId ||
        detail.year_plan_id ||
        null;
      const subjectId = detail.subjectId ?? null;
      const subjectName = detail.subjectName ?? null;
      const childIds = Array.isArray(detail.childIds) ? detail.childIds.filter(Boolean) : [];
      const subjectSchoolYear = detail.schoolYear ?? detail.subjectSchoolYear ?? null;
      const subjectSchoolTerm = detail.schoolTerm ?? detail.subjectSchoolTerm ?? null;
      const materialId = detail.materialId ?? null;
      const initialUnitStructureMethod = detail.initialUnitStructureMethod ?? null;
      const subjectHasCurriculumContent =
        typeof detail.subjectHasCurriculumContent === 'boolean'
          ? detail.subjectHasCurriculumContent
          : null;
      const openToEditListBase = detail.openToEditList === true;
      const openAsModal = detail.openAsModal === true;
      const skipPlanSummary = detail.skipPlanSummary === true;
      const openInSubjectsSchedule = detail.openInSubjectsSchedule === true;
      if (openInSubjectsSchedule) {
        const pendingPayload = {
          from: 'event_details',
          subjectId: subjectId != null ? String(subjectId) : null,
          subjectName: subjectName != null ? String(subjectName) : null,
          academicYearId: yearIdFromEvent || null,
          schoolYear: subjectSchoolYear != null ? String(subjectSchoolYear) : null,
          schoolTerm: subjectSchoolTerm != null ? String(subjectSchoolTerm) : null,
          openToEditList: openToEditListBase || !yearIdFromEvent,
          skipPlanSummary,
        };
        try {
          window.sessionStorage.setItem(
            SUBJECTS_PENDING_PLAN_OPEN_STORAGE_KEY,
            JSON.stringify(pendingPayload)
          );
        } catch (_) {
          // no-op
        }
        handleTabChange('subjects');
        window.history.pushState({}, '', '/subjects');
        return;
      }
      const fromEventDetails = from === 'event_details';
      const onPlannerLikeShell =
        activeTabRef.current === 'planner' || activeTabRef.current === 'calendar';
      const effectiveOpenAsModal = fromEventDetails ? !onPlannerLikeShell : openAsModal;
      const openToEditList = openToEditListBase || (fromEventDetails && !yearIdFromEvent);
      const hasExistingEditYearContext =
        !!planYearInitialAcademicYearIdRef.current && showPlanningModalRef.current;
      // EventDetails can emit a follow-up openPlanYearModal without academicYearId.
      // Do not let that downgrade an already-opening edit-year modal into new-plan mode.
      if (effectiveOpenAsModal && fromEventDetails && !yearIdFromEvent && hasExistingEditYearContext) {
        console.log('[WebLayout] openPlanYearModal ignored downgrade event', {
          from,
          yearIdFromEvent,
          existingYearId: planYearInitialAcademicYearIdRef.current,
        });
        return;
      }
      console.log('[WebLayout] openPlanYearModal event', {
        from,
        yearIdFromEvent,
        subjectId,
        materialId,
        openToEditList,
        openAsModal,
        effectiveOpenAsModal,
        skipPlanSummary,
      });
      setPlanYearHighlightFromHealth(from === 'plan_health_over');
      setPlanYearFromSubjectDetail(
        from === 'subject_detail' || (fromEventDetails && effectiveOpenAsModal)
      );
      setPlanYearInitialSubjectId(subjectId);
      setPlanYearInitialSubjectName(subjectName);
      setPlanYearInitialChildIds(childIds);
      setPlanYearInitialSubjectSchoolYear(subjectSchoolYear);
      setPlanYearInitialSubjectSchoolTerm(subjectSchoolTerm);
      setPlanYearInitialMaterialId(materialId);
      setPlanYearInitialUnitStructureMethod(initialUnitStructureMethod);
      setPlanYearInitialSubjectHasCurriculumContent(subjectHasCurriculumContent);

      if (effectiveOpenAsModal) {
        planYearModalReturnSubjectIdRef.current = subjectId || null;
        setPlanYearSkipInitialPlanSummary(skipPlanSummary);
        if (yearIdFromEvent) {
          setPlanYearInitialAcademicYearId(yearIdFromEvent);
          setPlanYearInitialPlanSummaryData(detail.planSummaryData ?? null);
          setPlanYearOpenForNewPlan(false);
          setPlanYearOpenToEditList(openToEditList);
        } else {
          setPlanYearInitialAcademicYearId(null);
          setPlanYearInitialPlanSummaryData(null);
          setPlanYearOpenForNewPlan(
            openToEditList ||
              materialId != null ||
              subjectId != null ||
              from === 'library' ||
              from === 'generate_curriculum' ||
              from === 'magic_extract'
          );
          // Preserve explicit saved-schedule-list intent from subject detail / toolbar.
          // Clearing this here incorrectly routes the modal into schedule setup flow.
          setPlanYearOpenToEditList(openToEditList);
        }
        setPlanYearOpenDirectlyToScope(!!detail.openDirectlyToScope && !openToEditList);
        setShowPlanningModal(true);
        return;
      }

      planYearModalReturnSubjectIdRef.current = null;
      setPlanYearSkipInitialPlanSummary(skipPlanSummary);
      if (yearIdFromEvent) {
        setPlanYearInitialAcademicYearId(yearIdFromEvent);
        setPlanYearInitialPlanSummaryData(detail.planSummaryData ?? null);
        setPlanYearOpenForNewPlan(false);
      } else {
        setPlanYearInitialAcademicYearId(null);
        setPlanYearInitialPlanSummaryData(null);
        setPlanYearOpenForNewPlan(openToEditList || materialId != null || subjectId != null || from === 'library' || from === 'generate_curriculum' || from === 'magic_extract');
      }
      setPlanYearOpenToEditList(openToEditList || !!yearIdFromEvent);
      setPlanYearOpenDirectlyToScope(!!detail.openDirectlyToScope && !openToEditList);
      planYearReturnViewRef.current = currentView;
      handleTabChange('planner');
      const viewToShow = yearIdFromEvent || openToEditList ? 'edit-year' : 'plan-year';
      setCurrentView(viewToShow);
      if (Platform.OS === 'web') {
        const url = new URL(window.location);
        url.pathname = '/planner';
        url.searchParams.set('view', viewToShow);
        window.history.pushState({}, '', url);
        window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: viewToShow }));
      }
    };
    window.addEventListener('openPlanYearModal', handler);
    return () => window.removeEventListener('openPlanYearModal', handler);
  }, []);

  // Deprecated: openBuildCurriculumModal now opens Plan My Year instead (same params: subjectId, subjectName, materialId)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (e) => {
      const rf = sessionRef.current?.role_flags;
      const restricted = !!(rf?.isChild || rf?.isTutor);
      if (restricted && !allowedRef.current('plans')) {
        Alert.alert('Not available', 'Your family admin has disabled adding or editing plans.');
        return;
      }
      const detail = e?.detail ?? {};
      const subjectId = detail.subjectId ?? null;
      const subjectName = detail.subjectName ?? null;
      const materialId = detail.materialId ?? null;
      setPlanYearInitialSubjectId(subjectId);
      setPlanYearInitialMaterialId(materialId);
      setPlanYearInitialAcademicYearId(null);
      setPlanYearOpenForNewPlan(true);
      planYearReturnViewRef.current = currentView;
      handleTabChange('planner');
      setCurrentView('plan-year');
      if (Platform.OS === 'web') {
        const url = new URL(window.location);
        url.searchParams.set('view', 'plan-year');
        window.history.pushState({}, '', url);
        window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'plan-year' }));
      }
    };
    window.addEventListener('openBuildCurriculumModal', handler);
    return () => window.removeEventListener('openBuildCurriculumModal', handler);
  }, []);

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

  // Legacy unit-structure event routes removed.
  // Add Subject "Add units" now routes through openPlanYearModal to keep one modal stack.

  // Open Doodle chat from anywhere (e.g. Library empty state — optional initialPrompt in event detail)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (e) => {
      const d = e?.detail || {};
      const p = d.initialPrompt;
      setDoodleSearchInitialPrompt(typeof p === 'string' && p.trim() ? p.trim() : null);
      setShowDoodleSearchModal(true);
    };
    window.addEventListener('openDoodleSearchModal', handler);
    return () => window.removeEventListener('openDoodleSearchModal', handler);
  }, []);

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
    setShowDoodleSearchModal(false);
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
      handleTabChange('planner');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/planner?view=plan-year');
        window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'plan-year' }));
      }
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
  }, [handleTabChange]);

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

  // After sign-in: provider logos for Connected accounts (non-blocking)
  useEffect(() => {
    if (Platform.OS !== 'web' || !user?.id) return;
    const run = () => preloadProviderConnectionLogos();
    let idleId;
    if (typeof requestIdleCallback !== 'undefined') {
      idleId = requestIdleCallback(run, { timeout: 4000 });
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
  }, [user?.id]);

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

  const handleTopSelect = useCallback(
    (key) => {
      setActiveTopNav(key);
      switch (key) {
        case 'home':
          handleTabChange('home');
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
          handleTabChange('planner');
          break;
        case 'new':
          handleTabChange('settings', 'profile');
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.pushState({}, '', '/family');
          }
          break;
        case 'materials':
          handleTabChange('materials');
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.pushState({}, '', '/library');
          }
          break;
        case 'subjects':
          handleTabChange('subjects');
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.pushState({}, '', '/subjects');
          }
          break;
        case 'review':
          handleTabChange('review');
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.pushState({}, '', '/review');
          }
          break;
        case 'records':
          handleTabChange('records');
          break;
        case 'intelligence':
          handleTabChange('intelligence');
          break;
        case 'coach':
          handleTabChange('coach');
          break;
        case 'profile':
          handleTabChange('profile');
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
    [handleTabChange]
  );

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
      // Migrate: replace spotlight tour with Doodle setup guide (chatbot checklist). Do not open overlay.
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
        const { error } = await persistExplorerTourMerge(authUserId, { parent: { step: 2 } });
        if (!error) mergeExplorerTourInProfile({ parent: { step: 2 } });
        setExplorerParentStep(2);
        return;
      }
      if (explorerParentStep === 2) {
        const { error } = await persistExplorerTourMerge(authUserId, { parent: { done: true, step: 3 } });
        if (!error) mergeExplorerTourInProfile({ parent: { done: true, step: 3 } });
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
    const enteringPlanner = activeTab === 'planner' && prevTab !== 'planner';
    if (activeTab !== 'calendar' && activeTab !== 'planner') {
      setActiveRightTool(null);
    } else if (enteringPlanner) {
      // Ensure right pane is closed when switching TO planner (not when already on it)
      setActiveRightTool(null);
      // If Plan Builder was opened from Subject Detail, do not keep planner stuck on inline
      // plan-year/edit-year when user navigates back to Planner. Default back to month view.
      const isInlinePlanView = currentView === 'plan-year' || currentView === 'edit-year';
      if (isInlinePlanView && planYearFromSubjectDetail) {
        resetInlinePlanYearOpenState();
        setCurrentView('month');
        setDefaultView('month');
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const url = new URL(window.location);
          url.searchParams.set('view', 'month');
          window.history.replaceState({}, '', url);
          window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'month' }));
        }
      }
    }
    prevActiveTabRef.current = activeTab;
  }, [activeTab, currentView, planYearFromSubjectDetail, resetInlinePlanYearOpenState]);

  // Determine if we're on a calendar screen
  const isCalendarScreen = activeTab === 'calendar' || activeTab === 'planner';

  /** Schedule setup / preferences replace the main pane in URL state but must not unmount WebContent (month grid stays warm). */
  const isPlanYearInline =
    isCalendarScreen && (currentView === 'plan-year' || currentView === 'edit-year');
  const plannerViewForWebContent = isPlanYearInline
    ? (() => {
        const r = planYearReturnViewRef.current || defaultView || 'month';
        return ['plan-year', 'edit-year'].includes(r) ? defaultView || 'month' : r;
      })()
    : currentView;

  /** Icon keys on RightToolbar — highlight purple; tasks/backlog are legacy and have no icon. */
  const rightToolbarActiveKeyForIcons =
    activeRightTool === 'tasks' || activeRightTool === 'backlog'
      ? null
      : (currentView === 'plan-year' ? 'build-plan' :
        currentView === 'edit-year' ? 'edit-plan' :
          currentView === 'attendance' ? 'attendance' :
            currentView === 'attendance-drilldown' ? 'attendance-drilldown' :
            activeRightTool);
  /** When true, top segmented view chips should not use purple (full-screen plan/attendance view is primary). */
  const rightToolbarClaimsPlannerSegmentFocus =
    (activeRightTool != null && !['tasks', 'backlog'].includes(activeRightTool)) ||
    ['plan-year', 'edit-year', 'attendance'].includes(currentView);
  /** Purple segmented chip only when that row is the active context. */
  const showTopPlannerSegmentHighlight =
    ['month', 'board', 'tasks', 'attendance-drilldown'].includes(currentView) && !rightToolbarClaimsPlannerSegmentFocus;

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
      crumbs.push({ 
        label: 'Calendar',
        onPress: () => handleTabChange('planner'),
      });
      
      // Check URL params for view mode (lowercase in URL, capitalize for display)
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const view = urlParams.get('view');
        if (view) {
          const viewMap = {
            'week': 'Week',
            'month': 'Month',
            'day': 'Day',
            'board': 'Board',
            'attendance': 'Attendance',
            'attendance-drilldown': 'Attendance drill-down',
            'Week': 'Week',
            'Month': 'Month',
            'Day': 'Day',
            'Board': 'Board',
            'Attendance': 'Attendance',
          };
          const viewLabel = viewMap[view] || view.charAt(0).toUpperCase() + view.slice(1);
          crumbs.push({ label: viewLabel });
        }
      }
    } else if (activeTab === 'materials') {
      crumbs.push({ label: 'Materials' });
    } else if (activeTab === 'subjects') {
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
          flushToEdge={activeTopNav === 'planner'}
          sidebar={{
            topActive: activeTopNav,
            onSelectTop: handleTopSelect,
            childrenList: children,
            activeChildId: activeChildId,
            activeChildSection: activeChildSection,
            onSelectChild: handleChildSelect,
            onSelectChildSection: handleChildSectionSelect,
            onOpenNew: handleOpenNewMenu,
            onOpenSearch: openSearch,
            onAvatarPress: () => {
              if (resolvedShellUserRole === 'child' || resolvedShellUserRole === 'student') {
                handleTabChange('home');
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.history.pushState({}, '', '/');
                }
                return;
              }
              handleTabChange('settings', 'profile');
            },
            user: user,
            userRole: resolvedShellUserRole,
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
                justifyContent: 'space-between',
              }}>
                {/* Left: Date & Term/School Year */}
                <View style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center',
                  width: 236,
                  maxWidth: '100%',
                  flexShrink: 0,
                }}>
                  <TouchableOpacity
                    onPress={() => {
                      let newDate;
                      if (currentView === 'board' || currentView === 'Board') {
                        newDate = addWeeks(currentMonth, -1);
                      } else if (currentView === 'week' || currentView === 'Week') {
                        newDate = addWeeks(currentMonth, -1);
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
                    activeOpacity={0.8}
                    onPress={() => {
                      if (currentView === 'month' || currentView === 'week' || currentView === 'board') {
                        const today = new Date();
                        setCurrentMonth(today);
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('plannerMonthChange', { detail: today }));
                        }
                      }
                    }}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <View style={{ width: '100%', alignItems: 'center' }}>
                      <Text style={{
                        fontSize: 26,
                        color: '#1E293B',
                        fontWeight: '600',
                        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        textAlign: 'center',
                      }}>
                        {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    onPress={() => {
                      let newDate;
                      if (currentView === 'board' || currentView === 'Board') {
                        newDate = addWeeks(currentMonth, 1);
                      } else if (currentView === 'week' || currentView === 'Week') {
                        newDate = addWeeks(currentMonth, 1);
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
                
                {/* Center: View State Controls (View Mode chips) */}
                <View 
                  style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    gap: 8,
                    flex: 1,
                    justifyContent: 'center',
                  }}
                >
                  {/* Help popover - Planner & Calendar FAQs */}
                  {showHelpPopover && Platform.OS === 'web' && (
                    <View
                      ref={helpPopoverRef}
                      onMouseEnter={clearHelpPopoverCloseTimer}
                      onMouseLeave={scheduleHelpPopoverClose}
                    >
                      <HelpPopover
                        visible={showHelpPopover}
                        onClose={() => {
                          clearHelpPopoverCloseTimer();
                          setShowHelpPopover(false);
                        }}
                        position={helpPopoverPosition}
                        helpForumHref="/help/faqs"
                      />
                    </View>
                  )}
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
                  {/* Filters dropdown - opened from right toolbar */}
                  {showFiltersDropdown && Platform.OS === 'web' && (
                      <View
                        ref={filtersDropdownRef}
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
                        {/* Children Filter Section */}
                        {children && children.length > 1 && (
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
                        const childColor = getChildColorFromAvatar(child.avatar);
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
                            <Text style={{ fontSize: 15, color: 'rgba(15,23,42,0.9)', flex: 1, fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                              {child.first_name || child.name || 'Unknown'}
                            </Text>
                            {/* Colored dot - moved to right */}
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: childColor,
                                flexShrink: 0,
                              }}
                            />
                          </TouchableOpacity>
                        );
                      })}
                            <View style={{
                              height: 1,
                              backgroundColor: 'rgba(15,23,42,0.06)',
                              marginVertical: 4,
                            }} />
                          </>
                        )}
                        
                        {/* Event Types Filter Section */}
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
                            Event Types
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
                            All Event Types
                          </Text>
                        </TouchableOpacity>
                        {['Lesson', 'Assignment', 'Activity', 'Appointment', 'Project', 'Exam', 'Day Off', 'Break'].map((eventType) => {
                          const isSelected = selectedEventTypes?.includes(eventType);
                          
                          // Get background color for event type (matching EventChip colors)
                          const getEventTypeBackgroundColor = (type) => {
                            const typeLower = type.toLowerCase();
                            if (typeLower === 'lesson') return '#E3F0FF'; // Soft Blue
                            if (typeLower === 'activity') return '#EDE6FF'; // Lavender
                            if (typeLower === 'assignment') return '#DFF7E3'; // Soft Green
                            if (typeLower === 'appointment') return '#F2F4F7'; // Warm Gray
                            if (typeLower === 'project') return '#D6F0ED'; // Soft Teal
                            if (typeLower === 'exam') return '#FCE7F3'; // Soft Pink
                            if (typeLower === 'day off') return '#FFEDE2'; // Soft Peach
                            if (typeLower === 'break') return '#FFF7D6'; // Soft Sand
                            return 'transparent';
                          };
                          
                          return (
                            <TouchableOpacity
                              key={eventType}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                                paddingVertical: 6,
                                paddingHorizontal: 10,
                                borderRadius: 4,
                                backgroundColor: getEventTypeBackgroundColor(eventType),
                              }}
                              onPress={() => {
                                const current = selectedEventTypes || [];
                                const newSelection = isSelected
                                  ? current.filter(type => type !== eventType)
                                  : [...current, eventType];
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
                                {eventType}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}

                        <View style={{
                          height: 1,
                          backgroundColor: 'rgba(15,23,42,0.06)',
                          marginVertical: 4,
                        }} />

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
                            Connected Accounts
                          </Text>
                        </View>

                        <View style={{ paddingVertical: 4, gap: 2 }}>
                          {[
                            { id: 'google', label: 'Google Calendar' },
                            { id: 'apple', label: 'Apple Calendar' },
                          ].map((provider) => {
                            const isConnected = plannerConnectedProviderIds.includes(provider.id);
                            const isSelected = !!selectedConnectedAccounts?.includes(provider.id);
                            return (
                              <View
                                key={provider.id}
                                style={{
                                  paddingVertical: 6,
                                  paddingHorizontal: 10,
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  {isConnected ? (
                                    <TouchableOpacity
                                      onPress={() => {
                                        const current = selectedConnectedAccounts || [];
                                        const next = isSelected
                                          ? current.filter((item) => item !== provider.id)
                                          : [...current, provider.id];
                                        setSelectedConnectedAccounts(next.length > 0 ? next : null);
                                      }}
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
                                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                    >
                                      {isSelected && <Check size={10} color="#FFFFFF" />}
                                    </TouchableOpacity>
                                  ) : (
                                    <View
                                      style={{
                                        width: 14,
                                        height: 14,
                                        borderRadius: 3,
                                        borderWidth: 1.5,
                                        borderColor: '#D1D5DB',
                                        backgroundColor: '#F3F4F6',
                                      }}
                                    />
                                  )}

                                  <TouchableOpacity
                                    onPress={() => handleTabChange('settings', 'connections')}
                                    style={{ ...(Platform.OS === 'web' && { cursor: 'pointer' }) }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 15,
                                        color: 'rgba(15,23,42,0.9)',
                                        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                      }}
                                    >
                                      {provider.label}
                                    </Text>
                                  </TouchableOpacity>
                                </View>

                                {!isConnected && (
                                  <View style={{ marginLeft: 22, marginTop: 4 }}>
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        color: 'rgba(107,114,128,0.8)',
                                        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                      }}
                                    >
                                      Account not connected
                                    </Text>
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  
                  {/* Filters chip - left of view control, matches views control height */}
                  <TouchableOpacity
                    ref={topToolbarFiltersButtonRef}
                    onPress={() => {
                      if (showFiltersDropdown) {
                        setShowFiltersDropdown(false);
                        return;
                      }
                      if (Platform.OS === 'web' && topToolbarFiltersButtonRef.current) {
                        const node = topToolbarFiltersButtonRef.current._nativeNode || topToolbarFiltersButtonRef.current;
                        if (node && typeof node.getBoundingClientRect === 'function') {
                          const rect = node.getBoundingClientRect();
                          setFiltersDropdownPosition({
                            top: rect.bottom + 4,
                            left: rect.left,
                          });
                        }
                      }
                      setShowFiltersDropdown(true);
                    }}
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
                    {/* Sliding purple highlight — only when Month/Week/To-do is the active context (not plan/attendance from right bar) */}
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
                      { key: 'month', label: 'Month' },
                      { key: 'board', label: 'Week' },
                      { key: 'tasks', label: 'List' },
                    ].map((view) => {
                      const isActive = showTopPlannerSegmentHighlight && currentView === view.key;
                      return (
                        <TouchableOpacity
                          key={view.key}
                          onLayout={(e) => {
                            const { x, width } = e.nativeEvent.layout;
                            viewChipLayouts.current[view.key] = { x, width };
                            if (currentView === view.key) {
                              setViewChipSlider({ left: x, width });
                            }
                          }}
                          onPress={() => {
                            const viewValue = view.key;
                            if (currentView === 'plan-year' || currentView === 'edit-year') {
                              resetInlinePlanYearOpenState();
                            }
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
                          style={{
                            paddingVertical: 8,
                            paddingHorizontal: 14,
                            borderRadius: 9999,
                            zIndex: 10,
                          }}
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
                  
                  {/* Help + Export icons - right of Filters (hidden for learner child accounts) */}
                  {showPlannerHeaderQuickActions ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0, position: 'relative' }}>
                    <TouchableOpacity
                      ref={helpButtonRef}
                      onPress={() => {
                        if (showHelpPopover) {
                          clearHelpPopoverCloseTimer();
                          setShowHelpPopover(false);
                          return;
                        }
                        openHelpPopover();
                      }}
                      style={{ padding: 4 }}
                      {...(Platform.OS === 'web' && {
                        cursor: 'pointer',
                        onMouseEnter: () => {
                          openHelpPopover();
                        },
                        onMouseLeave: () => {
                          scheduleHelpPopoverClose();
                        },
                      })}
                    >
                      <HelpCircle size={22} color="rgba(15,23,42,0.7)" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
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
                      }}
                      style={{ padding: 4 }}
                      {...(Platform.OS === 'web' && {
                        cursor: 'pointer',
                        onMouseEnter: (e) => {
                          const node = e?.currentTarget || e?.target;
                          if (node && typeof node.getBoundingClientRect === 'function') {
                            const rect = node.getBoundingClientRect();
                            setTooltip({
                              visible: true,
                              text: 'Export planner',
                              x: rect.left + rect.width / 2,
                              y: rect.bottom,
                            });
                          }
                        },
                        onMouseLeave: () => setTooltip((prev) => ({ ...prev, visible: false })),
                      })}
                    >
                      <Download size={20} color="rgba(15,23,42,0.7)" />
                    </TouchableOpacity>
                    <View style={{ position: 'relative' }}>
                      <TouchableOpacity
                        ref={conflictNotificationsButtonRef}
                        onPress={() => {}}
                        style={{ padding: 4, opacity: dismissedConflictNotifications.length > 0 ? 1 : 0.45 }}
                        {...(Platform.OS === 'web' && {
                          cursor: dismissedConflictNotifications.length > 0 ? 'pointer' : 'default',
                          onMouseEnter: () => {
                            if (dismissedConflictNotifications.length > 0) {
                              openConflictNotificationsPopover();
                            }
                          },
                          onMouseLeave: () => {
                            if (dismissedConflictNotifications.length > 0) {
                              scheduleConflictNotificationsClose();
                            }
                          },
                        })}
                      >
                        <Bell size={20} color={dismissedConflictNotifications.length > 0 ? '#B45309' : 'rgba(15,23,42,0.5)'} />
                        {dismissedConflictNotifications.length > 0 ? (
                          <View
                            style={{
                              position: 'absolute',
                              top: -2,
                              right: -4,
                              minWidth: 16,
                              height: 16,
                              borderRadius: 8,
                              backgroundColor: '#F59E0B',
                              paddingHorizontal: 4,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                              {dismissedConflictNotifications.length > 9 ? '9+' : dismissedConflictNotifications.length}
                            </Text>
                          </View>
                        ) : null}
                      </TouchableOpacity>
                      {showConflictNotificationsPopover && dismissedConflictNotifications.length > 0 ? (
                        <View
                          ref={conflictNotificationsPopoverRef}
                          onMouseEnter={clearConflictNotificationsCloseTimer}
                          onMouseLeave={scheduleConflictNotificationsClose}
                          style={{
                            position: 'absolute',
                            top: 30,
                            left: 4,
                            width: 340,
                            maxHeight: 280,
                            backgroundColor: '#FFFFFF',
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: 'rgba(15,23,42,0.1)',
                            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
                            zIndex: 1200,
                            overflow: 'hidden',
                          }}
                        >
                          <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(15,23,42,0.06)' }}>
                            <Text style={{
                              color: '#0F172A',
                              fontSize: 13,
                              fontWeight: '700',
                              ...(Platform.OS === 'web' && {
                                fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                              }),
                            }}>Dismissed conflicts</Text>
                          </View>
                          <ScrollView style={{ maxHeight: 220 }}>
                            {dismissedConflictNotifications.map((item) => (
                              <TouchableOpacity
                                key={`${item.eventId}-${item.timestamp}`}
                                onPress={() => {
                                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                    window.dispatchEvent(
                                      new CustomEvent('plannerDragConflictReopen', {
                                        detail: {
                                          eventId: item.eventId,
                                          conflictCount: item.conflictCount || 0,
                                          eventTitle: item.eventTitle || 'Event',
                                          conflictMessage: item.conflictMessage || null,
                                          conflictEvent: item.conflictEvent || null,
                                          movedEvent: item.movedEvent || null,
                                          timestamp: Date.now(),
                                        },
                                      }),
                                    );
                                  }
                                  setShowConflictNotificationsPopover(false);
                                }}
                                style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(15,23,42,0.05)' }}
                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                              >
                                <Text style={{
                                  fontSize: 13,
                                  color: '#0F172A',
                                  fontWeight: '600',
                                  ...(Platform.OS === 'web' && {
                                    fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                  }),
                                }} numberOfLines={1}>
                                  {item.eventTitle || 'Event'}
                                </Text>
                                <Text style={{
                                  fontSize: 12,
                                  color: '#6B7280',
                                  marginTop: 2,
                                  ...(Platform.OS === 'web' && {
                                    fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                  }),
                                }} numberOfLines={2}>
                                  {item.conflictMessage || `Conflicts: ${item.conflictCount || 1}`}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      ) : null}
                    </View>
                    </View>
                  ) : null}
                  
                </View>

                {/* Search Bar and New Event Button */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  flexShrink: 0,
                }}>
                  {/* Search Bar */}
                  <View style={{ position: 'relative' }}>
                    <TouchableOpacity
                      ref={searchInputRef}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        maxWidth: 250,
                        gap: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: showSearchDropdown ? '#8b5cf6' : '#E6EBF2',
                        backgroundColor: '#FFFFFF',
                        height: 36,
                        ...Platform.select({
                          web: {
                            cursor: 'text',
                          },
                        }),
                      }}
                      onPress={() => plannerSearchInputRef.current?.focus()}
                      activeOpacity={1}
                    >
                      <TextInput
                        ref={plannerSearchInputRef}
                        style={[
                          {
                            flex: 1,
                            fontSize: 16,
                            color: '#111827',
                            backgroundColor: 'transparent',
                            ...Platform.select({
                              web: {
                                fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                outline: 'none',
                                border: 'none',
                                boxShadow: 'none',
                                WebkitAppearance: 'none',
                                MozAppearance: 'none',
                                WebkitFocusRingColor: 'transparent',
                              },
                            }),
                          },
                        ]}
                        placeholder="Search planner..."
                        value={plannerSearchQuery}
                        onChangeText={(text) => {
                          setPlannerSearchQuery(text);
                          if (text.length > 0) {
                            setShowSearchDropdown(true);
                          }
                        }}
                        onFocus={() => {
                          if (plannerSearchResults.length > 0 || plannerSearchQuery.length > 0) {
                            setShowSearchDropdown(true);
                          }
                        }}
                        placeholderTextColor="#9ca3af"
                        {...(Platform.OS === 'web' && {
                          nativeID: 'planner-search-input',
                        })}
                      />
                      {plannerSearchQuery.length > 0 ? (
                        <TouchableOpacity
                          onPress={() => {
                            setPlannerSearchQuery('');
                            setPlannerSearchResults([]);
                            setShowSearchDropdown(false);
                          }}
                          style={{
                            padding: 4,
                            ...Platform.select({
                              web: {
                                cursor: 'pointer',
                              },
                            }),
                          }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <X size={18} color="#9ca3af" />
                        </TouchableOpacity>
                      ) : (
                        <View style={{ padding: 4 }}>
                          <Search size={18} color="#9ca3af" />
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Search Results Dropdown */}
                    {showSearchDropdown && Platform.OS === 'web' && (
                      <View
                        ref={searchDropdownRef}
                        style={{
                          position: 'fixed',
                          top: searchDropdownPosition.top,
                          left: searchDropdownPosition.left,
                          width: 250,
                          maxHeight: 300,
                          backgroundColor: '#ffffff',
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: '#e5e7eb',
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                          zIndex: 1000,
                          overflow: 'hidden',
                        }}
                      >
                        {plannerSearchResults.length > 0 ? (
                          <ScrollView style={{ maxHeight: 300 }}>
                            {plannerSearchResults.map((result) => (
                              <TouchableOpacity
                                key={result.id}
                                onPress={() => handleSearchResultSelect(result)}
                                style={{
                                  padding: 12,
                                  borderBottomWidth: 1,
                                  borderBottomColor: '#f3f4f6',
                                  ...Platform.select({
                                    web: {
                                      cursor: 'pointer',
                                    },
                                  }),
                                }}
                                activeOpacity={0.7}
                              >
                                <Text
                                  style={{
                                    fontSize: 14,
                                    fontWeight: '500',
                                    color: '#111827',
                                    marginBottom: 4,
                                    ...Platform.select({
                                      web: {
                                        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                      },
                                    }),
                                  }}
                                  numberOfLines={1}
                                >
                                  {result.title}
                                </Text>
                                <Text
                                  style={{
                                    fontSize: 12,
                                    color: '#6b7280',
                                    ...Platform.select({
                                      web: {
                                        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                      },
                                    }),
                                  }}
                                >
                                  {result.dateStr}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        ) : isSearchingPlanner ? (
                          <View style={{ padding: 16, alignItems: 'center' }}>
                            <Text style={{ fontSize: 14, color: '#6b7280' }}>Searching...</Text>
                          </View>
                        ) : (
                          <View style={{ padding: 16, alignItems: 'center' }}>
                            <Text style={{ fontSize: 14, color: '#6b7280' }}>None found</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>

                  {/* New Event Button — parents only; tutors use read-first planner */}
                  {canShowPlannerNewButton && (
                  <TouchableOpacity
                    {...(Platform.OS === 'web' ? { nativeID: 'explorer-tour-planner-new' } : {})}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      backgroundColor: '#111827',
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: '#111827',
                    }}
                    onPress={() => {
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('openTaskModal', { detail: { date: new Date() } }));
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{
                      fontSize: 14,
                      color: '#FFFFFF',
                      fontWeight: '700',
                      ...Platform.select({
                        web: {
                          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        },
                      }),
                    }}>
                      + NEW
                    </Text>
                  </TouchableOpacity>
                  )}
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
          
          {/* Main Content + Right Toolbar */}
          <View style={{ flex: 1, flexDirection: isCalendarScreen ? 'row' : 'column', minWidth: 0 }}>
            <View style={{ flex: 1, minWidth: 0, position: 'relative' }}>
              <View
                style={{
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  zIndex: 0,
                  ...(isPlanYearInline
                    ? { pointerEvents: 'none' }
                    : { pointerEvents: 'auto' }),
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
                selectedCalendarChildren={selectedCalendarChildren}
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
                  setFamily(updatedFamily);
                }}
                session={session}
                profile={profile}
                preloadedPlanHealth={preloadedPlanHealth}
                onHomeInitialDataReady={handleHomeInitialDataReady}
              />
              </View>
              {isPlanYearInline ? (
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 1,
                    flex: 1,
                    minHeight: 0,
                    minWidth: 0,
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  <PlanYearModal
                    renderInline
                    visible
                    onClose={(result) => {
                      const returnView = result?.returnView || planYearReturnViewRef.current || defaultView || 'month';
                      setCurrentView(returnView);
                      if (Platform.OS === 'web') {
                        const url = new URL(window.location);
                        url.searchParams.set('view', returnView);
                        window.history.pushState({}, '', url);
                        window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: returnView }));
                      }
                      resetInlinePlanYearOpenState();
                    }}
                    familyId={familyId}
                    children={children}
                    subjects={subjects}
                    fullSubjects={fullSubjects}
                    initialAcademicYearId={planYearInitialAcademicYearId}
                    initialPlanSummaryData={planYearInitialPlanSummaryData}
                    openForNewPlan={planYearOpenForNewPlan}
                    openToEditPlanList={currentView === 'edit-year' || planYearOpenToEditList}
        openDirectlyToScope={planYearOpenDirectlyToScope}
        fromSubjectDetail={planYearFromSubjectDetail}
        skipInitialPlanSummary={planYearSkipInitialPlanSummary}
        highlightFromPlanHealth={planYearHighlightFromHealth}
        initialSubjectId={planYearInitialSubjectId}
                    initialSubjectName={planYearInitialSubjectName}
                    initialSubjectChildIds={planYearInitialChildIds}
                    initialSubjectSchoolYear={planYearInitialSubjectSchoolYear}
                    initialSubjectSchoolTerm={planYearInitialSubjectSchoolTerm}
        initialMaterialId={planYearInitialMaterialId}
                    initialUnitStructureMethod={planYearInitialUnitStructureMethod}
        initialSubjectHasCurriculumContent={planYearInitialSubjectHasCurriculumContent}
        onOpenBuildCurriculum={(params) => {
          setBuildCurriculumInitialSubjectId(params.initialSubjectId ?? null);
                      setBuildCurriculumInitialSubjectName(params.initialSubjectName ?? null);
                      setBuildCurriculumInitialInputMode(params.initialInputMode ?? null);
                      setBuildCurriculumInitialSourceUrl(params.initialSourceUrl ?? null);
                      setBuildCurriculumInitialTopic(params.initialTopic ?? null);
                      setBuildCurriculumInitialMaterialId(params.initialMaterialId ?? null);
                      setShowBuildCurriculumModal(true);
                    }}
                    onOpenRebalance={(params) => {
                      setRebalanceEvent(params?.event ?? null);
                      setRebalanceYearPlanId(params?.yearPlanId ?? null);
                      setShowRebalanceModal(true);
                    }}
                    onOpenPlannerSettings={() => handleTabChange('settings', 'planner-settings')}
                    onOpenManualCurriculumBuilder={(detail) => {
                      if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        window.dispatchEvent(
                          new CustomEvent('openPlanYearModal', {
                            detail: {
                              from: 'subject_detail',
                              openAsModal: false,
                              skipPlanSummary: true,
                              openDirectlyToScope: true,
                              subjectId: detail?.subjectId ?? null,
                              familyId: detail?.familyId ?? familyId ?? null,
                              initialUnitStructureMethod: 'manual',
                            },
                          })
                        );
                      }
                    }}
                    onComplete={(result) => {
                      const returnView = result?.returnView || planYearReturnViewRef.current || defaultView || 'month';
                      setCurrentView(returnView);
                      if (Platform.OS === 'web') {
                        const url = new URL(window.location);
                        url.searchParams.set('view', returnView);
                        window.history.pushState({}, '', url);
                        window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: returnView }));
                        window.dispatchEvent(new CustomEvent('refreshCalendar'));
                      }
                      resetInlinePlanYearOpenState();
                    }}
                  />
                </View>
              ) : null}
            </View>
            {activeTab === 'calendar' && (
              <View
                {...(Platform.OS === 'web' ? { nativeID: 'explorer-tour-right-toolbar' } : {})}
                style={{
                width: 64,
                flexShrink: 0,
                borderLeftWidth: 1,
                borderLeftColor: 'rgba(15,23,42,0.08)',
                backgroundColor: '#FFFFFF',
                flexDirection: 'column',
                ...(Platform.OS === 'web' && { minHeight: 360 }),
              }}>
                <RightToolbar
                  activeTool={rightToolbarActiveKeyForIcons}
                  onTasks={() => {
                    if (currentView === 'plan-year' || currentView === 'edit-year') resetInlinePlanYearOpenState();
                    setActiveRightTool('tasks');
                    setCurrentView('tasks');
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'tasks' }));
                      window.dispatchEvent(new CustomEvent('plannerTasksViewChange', { detail: { section: 'today' } }));
                    }
                  }}
                  onBacklog={() => {
                    if (currentView === 'plan-year' || currentView === 'edit-year') resetInlinePlanYearOpenState();
                    setActiveRightTool('backlog');
                    setCurrentView('tasks');
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'tasks' }));
                      window.dispatchEvent(new CustomEvent('plannerTasksViewChange', { detail: { section: 'backlog' } }));
                    }
                  }}
                  onRebalance={() => {
                    setActiveRightTool('rebalance');
                    setRebalanceEvent(null);
                    setRebalanceYearPlanId(null);
                    setShowRebalanceModal(true);
                  }}
                  onBuildPlan={() => {
                    handleTabChange('settings', 'planner-settings');
                  }}
                  onEditPlan={() => {
                    handleTabChange('settings', 'planner-settings');
                  }}
                  onAttendance={() => {
                    if (currentView === 'plan-year' || currentView === 'edit-year') resetInlinePlanYearOpenState();
                    setActiveRightTool('attendance');
                    setCurrentView('attendance');
                    setDefaultView('attendance');
                    if (typeof window !== 'undefined') {
                      const url = new URL(window.location);
                      url.searchParams.set('view', 'attendance');
                      window.history.pushState({}, '', url);
                      window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'attendance' }));
                    }
                  }}
                  onExport={() => {
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
                  }}
                  onSettings={() => handleTabChange('settings', 'profile')}
                  onPackWeek={() => setShowPackWeekModal(true)}
                  onCatchUp={() => setShowCatchUpModal(true)}
                  onHealth={() => setShowAIToolsModal(true)}
                  children={children}
                  selectedChildren={selectedCalendarChildren}
                  onChildFilterChange={setSelectedCalendarChildren}
                  familyId={familyId}
                  connectedProviderIds={plannerConnectedProviderIds}
                  onConnectProvider={handlePlannerProviderConnect}
                />
              </View>
            )}
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
        primaryLabel={explorerParentStep >= 2 ? 'Done' : 'Next'}
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
      {user && (
        <SearchModal
          visible={showDoodleSearchModal}
          onClose={() => {
            setShowDoodleSearchModal(false);
            setDoodleSearchInitialPrompt(null);
          }}
          onNavigate={handleDoodleNavigate}
          initialPrompt={doodleSearchInitialPrompt}
        />
      )}

      {/* Ask AI — floating button (all main tabs including Home) */}
      {user && !childDoodleBotDisabled && (
        <View style={styles.fabAskAIWrap}>
          <TouchableOpacity
            onPress={() => {
              setDoodleSearchInitialPrompt(null);
              setShowDoodleSearchModal(true);
            }}
            style={styles.fabAskAI}
            activeOpacity={0.85}
            accessibilityLabel="Ask Learnadoodle"
            {...(Platform.OS === 'web' && {
              cursor: 'pointer',
              title: 'Ask Learnadoodle',
            })}
          >
            <Image source={require('../assets/icon.png')} style={styles.fabAskAIIcon} resizeMode="contain" />
          </TouchableOpacity>
        </View>
      )}

      {/* Add/Edit Subject Modal */}
      <AddSubjectModal
        visible={showAddSubjectModal}
        onClose={() => {
          setShowAddSubjectModal(false);
          setEditingSubject(null);
          setAddSubjectPrefill({ schoolYear: null, schoolTerm: null, childIds: [] });
        }}
        familyId={familyId}
        subject={editingSubject}
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
          setEditingSubject(null);
          setAddSubjectPrefill({ schoolYear: null, schoolTerm: null, childIds: [] });
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            if (newSubject?.id) {
              window.dispatchEvent(new CustomEvent('subjectRecordUpserted', { detail: { subject: newSubject } }));
            }
            window.dispatchEvent(new CustomEvent('refreshSubjects'));
          }
        }}
      />

      {/* Planning Modal - mostly full screen - unified Plan my year + Edit subject structure */}
      <PlanYearModal
        key={`${planYearInitialAcademicYearId || 'unified-planning-modal'}-${planYearInitialUnitStructureMethod || 'default'}`}
        visible={showPlanningModal}
        onClose={(result) => {
          const sid = planYearModalReturnSubjectIdRef.current;
          planYearModalReturnSubjectIdRef.current = null;
          if (sid && Platform.OS === 'web' && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId: sid } }));
          }
          if (result?.returnView) {
            handleTabChange('planner');
            setActiveTopNav('planner');
            setCurrentView(result.returnView);
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.history.pushState({}, '', `/planner?view=${result.returnView}`);
              window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: result.returnView }));
            }
          }
          setShowPlanningModal(false);
          setTimeout(() => {
            setPlanYearHighlightFromHealth(false);
            setPlanYearFromSubjectDetail(false);
            setPlanYearInitialAcademicYearId(null);
            setPlanYearInitialPlanSummaryData(null);
            setPlanYearOpenForNewPlan(false);
            setPlanYearOpenToEditList(false);
            setPlanYearOpenDirectlyToScope(false);
            setPlanYearSkipInitialPlanSummary(false);
            setPlanYearInitialSubjectId(null);
            setPlanYearInitialSubjectName(null);
            setPlanYearInitialChildIds([]);
            setPlanYearInitialSubjectSchoolYear(null);
            setPlanYearInitialSubjectSchoolTerm(null);
            setPlanYearInitialMaterialId(null);
            setPlanYearInitialUnitStructureMethod(null);
          }, 300);
        }}
        familyId={familyId}
        children={children}
        subjects={subjects}
        fullSubjects={fullSubjects}
        initialAcademicYearId={planYearInitialAcademicYearId}
        initialPlanSummaryData={planYearInitialPlanSummaryData}
        openForNewPlan={planYearOpenForNewPlan}
        openToEditPlanList={planYearOpenToEditList}
        openDirectlyToScope={planYearOpenDirectlyToScope}
        fromSubjectDetail={planYearFromSubjectDetail}
        skipInitialPlanSummary={planYearSkipInitialPlanSummary}
        highlightFromPlanHealth={planYearHighlightFromHealth}
        initialSubjectId={planYearInitialSubjectId}
        initialSubjectName={planYearInitialSubjectName}
        initialSubjectChildIds={planYearInitialChildIds}
        initialSubjectSchoolYear={planYearInitialSubjectSchoolYear}
        initialSubjectSchoolTerm={planYearInitialSubjectSchoolTerm}
        initialMaterialId={planYearInitialMaterialId}
        initialUnitStructureMethod={planYearInitialUnitStructureMethod}
        initialSubjectHasCurriculumContent={planYearInitialSubjectHasCurriculumContent}
        onOpenBuildCurriculum={(params) => {
          setBuildCurriculumInitialSubjectId(params.subjectId || null);
          setBuildCurriculumInitialSubjectName(params.subjectName || null);
          setBuildCurriculumInitialMaterialId(params.materialId || null);
          setBuildCurriculumInitialInputMode(params.inputMode || null);
          setBuildCurriculumInitialSourceUrl(params.sourceUrl || null);
          setBuildCurriculumInitialTopic(params.topic || null);
          setShowBuildCurriculumModal(true);
        }}
        onOpenRebalance={(params) => {
          setRebalanceEvent(params?.event ?? null);
          setRebalanceYearPlanId(params?.yearPlanId ?? null);
          setShowRebalanceModal(true);
        }}
        onOpenPlannerSettings={() => handleTabChange('settings', 'planner-settings')}
        onOpenManualCurriculumBuilder={(detail) => {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('openPlanYearModal', {
                detail: {
                  from: 'subject_detail',
                  openAsModal: true,
                  skipPlanSummary: true,
                  openDirectlyToScope: true,
                  subjectId: detail?.subjectId ?? null,
                  familyId: detail?.familyId ?? familyId ?? null,
                  initialUnitStructureMethod: 'manual',
                },
              })
            );
          }
        }}
        onComplete={async (result) => {
          const sid = planYearModalReturnSubjectIdRef.current;
          planYearModalReturnSubjectIdRef.current = null;
          if (result?.returnView) {
            handleTabChange('planner');
            setActiveTopNav('planner');
            setCurrentView(result.returnView);
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.history.pushState({}, '', `/planner?view=${result.returnView}`);
              window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: result.returnView }));
            }
          }
          setShowPlanningModal(false);
          await fetchFamilyData();
          if (Platform.OS === 'web') {
            window.dispatchEvent(new CustomEvent('refreshChildren'));
            window.dispatchEvent(new CustomEvent('refreshSubjects'));
            if (sid) {
              window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId: sid } }));
            }
          }
        }}
      />

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
        onAddActivity={() => {
          if (sessionRestricted && !familyUserControls.allowed('events')) {
            Alert.alert('Not available', 'Your family admin has disabled creating or editing events.');
            return;
          }
          setTaskModalDate(new Date());
          setShowTaskModal(true);
          setShowNewMenu(false);
        }}
        onAddSyllabus={() => setShowSyllabusUpload(true)}
        onAIGenerate={() => setShowAIToolsModal(true)}
      />

      {/* Year Planning Wizard - Now handled by IntelligenceHub */}
      {/* Removed: PlanYearWizard instance - use IntelligenceHub → Planner AI → Plan the Year */}

      {/* Global Task Create Modal - available from any screen (planner, home, family, etc.) */}
      {showTaskModal ? (
      <TaskCreateModal
        visible
          onClose={() => {
            setShowTaskModal(false);
            setTaskModalChildId(null);
            setTaskModalChildIds([]);
            setTaskModalDefaultSubjectId(null);
            setTaskModalDefaultEventType(null);
            setTaskModalDefaultPlacement('calendar'); // Reset to default for next time
            setTaskModalDefaultStartTime(null);
            setTaskModalDefaultTitle(null);
            setTaskModalDefaultMaterialId(null);
          }}
          defaultDate={taskModalDate}
          defaultChildId={taskModalChildId}
          defaultChildIds={taskModalChildIds}
          defaultSubjectId={taskModalDefaultSubjectId}
          defaultEventType={taskModalDefaultEventType}
          defaultPlacement={taskModalDefaultPlacement}
          defaultStartTime={taskModalDefaultStartTime}
          defaultTitle={taskModalDefaultTitle}
          defaultMaterialId={taskModalDefaultMaterialId}
          familyId={familyId}
          familyMembers={familyMembersForEventing}
          lists={[
            { id: 'inbox', name: 'Inbox' },
            ...children.map(child => ({
              id: `child:${child.id}`,
              name: child.first_name || child.name || 'Unknown'
            }))
          ]}
          onCreated={async (task) => {
            // Refresh calendar data if we're on a calendar screen
            if (activeTab === 'calendar' || activeTab === 'planner') {
              // Trigger a refresh by changing and changing back the tab
              // Or we could emit an event that WebContent listens to
              if (Platform.OS === 'web') {
                window.dispatchEvent(new CustomEvent('refreshCalendar'));
              }
            }
          }}
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

      {showDirectAskParentHelpModal ? (
        <AskParentHelpModal
          visible
          onClose={() => {
            setShowDirectAskParentHelpModal(false);
            setDirectHelpAssignment(null);
            setDirectHelpEventContext(null);
            setDirectHelpChildId(null);
          }}
          onSent={() => {
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('childAssignmentsNeedRefresh'));
              window.dispatchEvent(new CustomEvent('refreshRightRail'));
              window.dispatchEvent(new CustomEvent('refreshCalendar'));
            }
          }}
          familyId={familyId}
          childId={directHelpChildId || session?.child_id || activeChildId || null}
          assignment={directHelpAssignment}
          eventContext={directHelpEventContext}
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
        sendOnlyMode={eventModalSendOnlyMode}
        onOpenConflictResolutionConsumed={() => setEventModalOpenConflictResolution(false)}
        familyId={familyId}
        children={children}
        viewerRole={session?.role_flags?.isTutor ? 'tutor' : undefined}
        denyFamilyEventEdit={denyFamilyEventEdit}
        preloadedAcademicYears={preloadedAcademicYears}
        preloadedSubjects={fullSubjects}
        preloadedFamilyAssignments={preloadedFamilyAssignments}
        familyMembers={familyMembersForEventing}
        parentEventFocus={eventModalParentFocus}
        onParentEventFocusConsumed={() => setEventModalParentFocus(null)}
        childEventFocus={eventModalChildFocus}
        onChildEventFocusConsumed={() => setEventModalChildFocus(null)}
        onClose={() => {
          setShowEventModal(false);
          setEventModalEventId(null);
          setEventModalInitialEvent(null);
          setEventModalParentFocus(null);
          setEventModalChildFocus(null);
          setEventModalSchedulingMode(false);
          setEventModalEditScope('single');
          setEventModalSendOnlyMode(false);
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
          setShowPlanYearWizard(true);
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

      <PlanYearWizard
        visible={showPlanYearWizard}
        onClose={() => setShowPlanYearWizard(false)}
        familyId={familyId}
      />

      {/* Global Add Child Modal - so Plan Year and other screens can open it */}
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
        onRequestClose={() => {
          setShowExportModal(false);
          setExportModalSubjectId(null);
          setExportModalSubjectName(null);
        }}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.4)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
          activeOpacity={1}
          onPress={() => {
            setShowExportModal(false);
            setExportModalSubjectId(null);
            setExportModalSubjectName(null);
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 12,
              padding: 24,
              width: '100%',
              maxWidth: 480,
              borderWidth: 1,
              borderColor: '#E6EBF2',
            }}
          >
            <Text style={{
              fontSize: 18,
              fontWeight: '600',
              color: '#1E293B',
              marginBottom: 16,
              fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}>
              {exportModalSubjectName ? `Export planner - ${exportModalSubjectName}` : 'Export planner'}
            </Text>
            <Text style={{
              fontSize: 14,
              color: '#64748B',
              marginBottom: 12,
              fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}>
              Choose the date range and optional columns to export as CSV.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#475569', marginBottom: 6, fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>Start date</Text>
                <TouchableOpacity
                  onPress={() => {
                    setExportStartCalendarMonth(exportStartDate ? new Date(exportStartDate + 'T12:00:00') : new Date());
                    setShowExportStartDatePicker(true);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    height: 40,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#E6EBF2',
                    backgroundColor: '#FFFFFF',
                  }}
                  activeOpacity={0.7}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={{ fontSize: 15, color: exportStartDate ? '#1E293B' : '#94A3B8', fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                    {exportStartDate ? (() => { const d = new Date(exportStartDate + 'T12:00:00'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); })() : 'Select start date'}
                  </Text>
                  <ChevronDown size={16} color="#64748B" />
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#475569', marginBottom: 6, fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>End date</Text>
                <TouchableOpacity
                  onPress={() => {
                    setExportEndCalendarMonth(exportEndDate ? new Date(exportEndDate + 'T12:00:00') : new Date());
                    setShowExportEndDatePicker(true);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    height: 40,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#E6EBF2',
                    backgroundColor: '#FFFFFF',
                  }}
                  activeOpacity={0.7}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={{ fontSize: 15, color: exportEndDate ? '#1E293B' : '#94A3B8', fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                    {exportEndDate ? (() => { const d = new Date(exportEndDate + 'T12:00:00'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); })() : 'Select end date'}
                  </Text>
                  <ChevronDown size={16} color="#64748B" />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 8, fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>Optional columns (include when checked)</Text>
            <ScrollView style={{ maxHeight: 220, marginBottom: 20 }} nestedScrollEnabled>
              {[
                { key: 'location', label: 'Location' },
                { key: 'mode', label: 'Mode' },
                { key: 'instructor', label: 'Instructor' },
                { key: 'subject', label: 'Subject' },
                { key: 'grade', label: 'Grade' },
                { key: 'unit', label: 'Unit' },
                { key: 'percentOfTotal', label: '% of total' },
                { key: 'instructionalTime', label: 'Counted as instructional time' },
                { key: 'plan', label: 'Part of structured class plan' },
                { key: 'attachmentTitle', label: 'Attachment title' },
                { key: 'notes', label: 'Notes' },
              ].map(({ key, label }) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setExportColumns((prev) => ({ ...prev, [key]: !prev[key] }))}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 }}
                  activeOpacity={0.7}
                >
                  <View style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    borderWidth: 1.5,
                    borderColor: exportColumns[key] ? '#1E293B' : '#CBD5E1',
                    backgroundColor: exportColumns[key] ? '#1E293B' : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {exportColumns[key] && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                  </View>
                  <Text style={{ fontSize: 14, color: '#334155', fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setShowExportModal(false)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#E6EBF2',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '500', color: '#64748B', fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const start = exportStartDate.trim();
                  const end = exportEndDate.trim();
                  if (!start || !end) return;
                  const startD = new Date(start);
                  const endD = new Date(end);
                  if (isNaN(startD.getTime()) || isNaN(endD.getTime())) return;
                  if (startD > endD) return;
                  setShowExportModal(false);
                  if (typeof window !== 'undefined') {
                    const exportDetail = { startDate: startD, endDate: endD, columns: exportColumns };
                    if (exportModalSubjectId) exportDetail.subjectId = exportModalSubjectId;
                    if (exportModalSubjectName) exportDetail.subjectName = exportModalSubjectName;
                    window.dispatchEvent(new CustomEvent('plannerExportToExcel', { detail: exportDetail }));
                  }
                  setExportModalSubjectId(null);
                  setExportModalSubjectName(null);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  backgroundColor: '#1E293B',
                  borderWidth: 1,
                  borderColor: '#1E293B',
                }}
              >
                <ExternalLink size={16} color="#FFFFFF" />
                <Text style={{ fontSize: 15, fontWeight: '500', color: '#FFFFFF', fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>Export</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
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
  fabAskAIWrap: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    ...(Platform.OS === 'web' && { zIndex: 9998 }),
  },
  fabAskAI: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#9ECFFB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 14px rgba(158, 207, 251, 0.4)',
    }),
    ...(Platform.OS !== 'web' && {
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
    }),
  },
  fabSetupBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#7c3aed',
    borderWidth: 2,
    borderColor: '#fff',
  },
  fabAskAIIcon: {
    width: 58,
    height: 58,
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