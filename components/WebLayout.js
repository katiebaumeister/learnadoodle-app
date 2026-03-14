import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Platform, View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal, ActivityIndicator, Image } from 'react-native';

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
import { X, Filter, Check, SlidersHorizontal, ChevronLeft, ChevronRight, ChevronDown, BookOpen, RefreshCw, Plus, Calendar, LayoutGrid, Clock, Kanban, CheckSquare, Sparkles, RotateCcw, Target, Package, BarChart3, FileText, Activity, TrendingUp, Star, Link, AlertTriangle, Search, Lock, Download, Bot } from 'lucide-react';
import { getChildColorFromAvatar } from '../utils/avatarColors';
import { useAuth } from '../contexts/AuthContext';
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
import AddSubjectModal from './AddSubjectModal';
import EditChildModal from './EditChildModal';
import PlanYearWizard from './year/PlanYearWizard';
import PlanYearModal from './planner/PlanYearModal';
import { STRINGS } from '../lib/i18n/strings';
import PackWeekModal from './ai/PackWeekModal';
import CatchUpModal from './ai/CatchUpModal';
import SummarizeProgressModal from './ai/SummarizeProgressModal';
import AIModal from './AIModal';
import { proposeReschedule, getFamilyMembers, getOnboardingStatus } from '../lib/apiClient';
import { getPlanHealth } from '../lib/services/academicYearClient';
import AnalyticsDashboard from './analytics/AnalyticsDashboard';
import ProgressReport from './analytics/ProgressReport';
import ScheduleSettingsModal from './modals/ScheduleSettingsModal';
import AIToolsModal from './AIToolsModal';
import SyllabusUpload from './SyllabusUpload';
import { ToastProvider } from './Toast';
import { supabase } from '../lib/supabase';
import { PlannerDiffProvider } from '../app/state/usePlannerDiffStore';
import PlannerDiffModal from '../app/components/schedule/PlannerDiffModal';
import { PlannerHealthProvider } from '../app/state/usePlannerHealthStore';
import { ConstraintsProvider } from '../app/state/useConstraintsStore';
import AddFromLinkModal from './planner/AddFromLinkModal';
import QuickRescheduleModal from './planner/modals/QuickRescheduleModal';
import PlanWeekModal from './planner/modals/PlanWeekModal';
import BuildCurriculumModal from './planner/modals/BuildCurriculumModal';
import ProgressForecastModal from './planner/modals/ProgressForecastModal';
import RebalanceModal from './planner/modals/RebalanceModal';
import SchedulingAssistant from './planner/SchedulingAssistant';
import PlannerWalkthrough from './planner/PlannerWalkthrough';
import PlanHealthIcon from './planner/PlanHealthIcon';
import OnboardingModal from './onboarding/OnboardingModal';
import AppLoader from './AppLoader';

const EXPORT_CALENDAR_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function toLocalYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function WebLayout({ navigation, routeParams, session: propSession = null, userRole: propUserRole = null }) {
  const { user } = useAuth();
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
  const { openSearch } = useGlobalSearch();
  const [activeTab, setActiveTab] = useState('home');
  const [activeSubtab, setActiveSubtab] = useState(null);
  const [activeTopNav, setActiveTopNav] = useState('home');
  const [activeChildId, setActiveChildId] = useState(null);
  const [activeChildSection, setActiveChildSection] = useState('affirmation');
  const [showSyllabusUpload, setShowSyllabusUpload] = useState(false);
  const [showDoodleSearchModal, setShowDoodleSearchModal] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventModalEventId, setEventModalEventId] = useState(null);
  const [eventModalInitialEvent, setEventModalInitialEvent] = useState(null);
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

  // Onboarding: resolve status before first paint so we never flash landing without modal
  const [onboardingCheckDone, setOnboardingCheckDone] = useState(false);
  const [initialOnboardingBlocked, setInitialOnboardingBlocked] = useState(false);
  const [onboardingJustCompleted, setOnboardingJustCompleted] = useState(false);
  const [activeRightTool, setActiveRightTool] = useState(null);
  const prevActiveTabRef = useRef(null);
  // AI Tool Modals
  const [showPackWeekModal, setShowPackWeekModal] = useState(false);
  const [showCatchUpModal, setShowCatchUpModal] = useState(false);
  const [showSummarizeProgressModal, setShowSummarizeProgressModal] = useState(false);
  const [showPlanYearWizard, setShowPlanYearWizard] = useState(false);
  const [showPlanYearModal, setShowPlanYearModal] = useState(false);
  const [planYearInitialAcademicYearId, setPlanYearInitialAcademicYearId] = useState(null);
  const [planYearInitialPlanSummaryData, setPlanYearInitialPlanSummaryData] = useState(null);
  const [planYearOpenForNewPlan, setPlanYearOpenForNewPlan] = useState(false);
  const [planYearFromSubjectDetail, setPlanYearFromSubjectDetail] = useState(false);
  const [planYearHighlightFromHealth, setPlanYearHighlightFromHealth] = useState(false);
  const [planYearInitialSubjectId, setPlanYearInitialSubjectId] = useState(null);
  const [planYearInitialMaterialId, setPlanYearInitialMaterialId] = useState(null);
  const [showRebalanceModal, setShowRebalanceModal] = useState(false);
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
  useEffect(() => {
    if (propUserRole != null) return;
    if (session && session.effective_role) {
      setUserRole(session.effective_role);
    }
  }, [session, propUserRole]);
  const [homeLoading, setHomeLoading] = useState(true); // true so initial load overlay stays until WebContent reports ready
  const [plannerLoading, setPlannerLoading] = useState(true); // planner month preload so first open has events
  const [familyDataLoaded, setFamilyDataLoaded] = useState(false); // children, family, subjects from fetchFamilyMembers/fetchFamilyData
  const [subjectsLoading, setSubjectsLoading] = useState(true); // subjects overview preload
  const [materialsLoading, setMaterialsLoading] = useState(true); // materials list preload
  const [initialAppLoadDone, setInitialAppLoadDone] = useState(false);
  const [selectedCalendarChildren, setSelectedCalendarChildren] = useState(null);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const filterButtonRef = useRef(null);
  const [filterDropdownPosition, setFilterDropdownPosition] = useState({ top: 0, left: 0 });
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
  const filtersButtonRef = useRef(null);
  const [filtersDropdownPosition, setFiltersDropdownPosition] = useState({ top: 0, left: 0 });
  const filtersDropdownRef = useRef(null);
  const [showViewModeDropdown, setShowViewModeDropdown] = useState(false);
  const viewModeButtonRef = useRef(null);
  const viewModeDropdownRef = useRef(null);
  const [viewModeDropdownPosition, setViewModeDropdownPosition] = useState({ top: 0, left: 0 });
  const [selectedEventTypes, setSelectedEventTypes] = useState(null);
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
  const [showFreezeWeekTooltip, setShowFreezeWeekTooltip] = useState(false);
  const [freezeWeekTooltipPosition, setFreezeWeekTooltipPosition] = useState({ x: 0, y: 0 });
  const freezeWeekButtonRef = useRef(null);
  const planWeekButtonRef = useRef(null);

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
  
  // Walkthrough refs
  const newButtonRef = useRef(null);
  const middleButtonsRef = useRef(null);
  const sidebarRef = useRef(null);
  const [showPlannerWalkthrough, setShowPlannerWalkthrough] = useState(false);
  const [hasAnyEvents, setHasAnyEvents] = useState(null); // null = not checked yet
  
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
  
  // Log state changes for debugging
  useEffect(() => {
    console.log('[ViewDropdown] State changed to:', showViewDropdown);
  }, [showViewDropdown]);
  
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

  // Handle click outside Filters dropdown
  useEffect(() => {
    if (showFiltersDropdown && Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleClickOutside = (event) => {
        const buttonNode = filtersButtonRef.current?._nativeNode || filtersButtonRef.current;
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

  // Handle click outside View Mode dropdown
  useEffect(() => {
    if (showViewModeDropdown && Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleClickOutside = (event) => {
        const buttonNode = viewModeButtonRef.current?._nativeNode || viewModeButtonRef.current;
        const dropdownNode = viewModeDropdownRef.current?._nativeNode || viewModeDropdownRef.current;
        
        const target = event.target;
        const isInsideButton = buttonNode && (buttonNode === target || buttonNode.contains(target));
        const isInsideDropdown = dropdownNode && (dropdownNode === target || dropdownNode.contains(target));
        
        if (!isInsideButton && !isInsideDropdown) {
          setShowViewModeDropdown(false);
        }
      };
      
      document.addEventListener('click', handleClickOutside, true);
      
      return () => {
        document.removeEventListener('click', handleClickOutside, true);
      };
    }
  }, [showViewModeDropdown]);

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
        console.log('[PlannerSearch] Searching with query:', plannerSearchQuery, 'familyId:', familyId);
        const eventsResult = await supabase
          .from('events')
          .select('id, title, start_ts, status, is_backlog')
          .eq('family_id', familyId)
          .is('deleted_at', null)
          .neq('status', 'canceled')
          .ilike('title', `%${plannerSearchQuery}%`)
          .limit(20)
          .order('start_ts', { ascending: false });

        console.log('[PlannerSearch] Query result:', { error: eventsResult.error, dataCount: eventsResult.data?.length });

        if (eventsResult.error) {
          console.error('[PlannerSearch] Error searching events:', eventsResult.error);
          setPlannerSearchResults([]);
          setShowSearchDropdown(true);
        } else if (eventsResult.data) {
          // Deduplicate: group by title and keep only the most recent event for each title
          const eventMap = new Map();
          eventsResult.data.forEach(event => {
            const title = (event.title || 'Untitled Event').toLowerCase().trim();
            const eventDate = event.start_ts ? new Date(event.start_ts) : new Date();
            const isBacklog = event.is_backlog === true || (event.start_ts && new Date(event.start_ts).getFullYear() >= 2099);
            
            // If we haven't seen this title, or this event is more recent, use it
            if (!eventMap.has(title) || eventMap.get(title).date < eventDate) {
              eventMap.set(title, {
                id: event.id,
                title: event.title || 'Untitled Event',
                date: eventDate,
                dateStr: isBacklog ? 'Backlog' : eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                isBacklog: isBacklog,
              });
            }
          });
          
          // Convert map to array and limit to 10 most recent
          const results = Array.from(eventMap.values())
            .sort((a, b) => b.date - a.date)
            .slice(0, 10);
          
          console.log('[PlannerSearch] Mapped results:', results.length);
          setPlannerSearchResults(results);
          setShowSearchDropdown(true);
        } else {
          setPlannerSearchResults([]);
          setShowSearchDropdown(true);
        }
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
  }, [plannerSearchQuery, familyId]);

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
          console.log('[ViewDropdown] Button rect:', rect);
          console.log('[ViewDropdown] Setting dropdown position:', newPosition);
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
                  console.log('[ViewDropdown] Directly set DOM styles on element:', domElement, {
                    position: 'fixed',
                    top: `${newPosition.top}px`,
                    left: `${newPosition.left}px`,
                    zIndex: '10000'
                  });
                } else {
                  console.log('[ViewDropdown] Could not find style property on element:', domElement);
                }
              } else {
                console.log('[ViewDropdown] Menu ref current is null');
              }
            } else {
              console.log('[ViewDropdown] Menu ref not set yet');
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
  
  // Debug context menu state
  useEffect(() => {
    if (contextMenuView) {
      console.log('[WebLayout] Context menu opened for view:', contextMenuView, 'Position:', contextMenuPosition);
    }
  }, [contextMenuView, contextMenuPosition]);

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
    console.log('[ViewDropdown] useEffect triggered, showViewDropdown:', showViewDropdown, 'Platform:', Platform.OS);
    if (!showViewDropdown || Platform.OS !== 'web' || typeof document === 'undefined') {
      // Clean up handler if dropdown is closed
      if (viewDropdownHandlerRef.current) {
        console.log('[ViewDropdown] Removing existing click outside listener (dropdown closed)');
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
        
        console.log('[ViewDropdown] Click detected, isInside:', isInside, 'target:', event.target);
        
        if (!isInside && isDropdownVisible) {
          console.log('[ViewDropdown] Closing dropdown (clicked outside)');
          setShowViewDropdown(false);
          setContextMenuView(null);
        } else if (isInside) {
          console.log('[ViewDropdown] Click inside dropdown - allowing onPress to handle');
          // Don't prevent default - let React Native's onPress handle it
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
      console.log('[ViewDropdown] Adding click outside listener');
      // Use bubble phase so React Native's onPress fires first
      document.addEventListener('click', delayedHandler);
    }, 200);
    
    return () => {
      console.log('[ViewDropdown] Cleanup: clearing timeout and removing listener');
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
      if (!user) return;
      try {
        const { getMe } = await import('../lib/apiClient');
        const { data: meData, error: meError } = await getMe();
        
        // Handle 401 errors gracefully (backend might not be running or auth not ready)
        const isAuthError = meError?.status === 401 || meError?.response?.status === 401;
        
        // Always fetch profile table for freshest name/phone
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role, email, name, first_name, phone, avatar_url')
          .eq('id', user.id)
          .maybeSingle();

        if (!meError && meData) {
          const mergedProfile = {
            ...meData,
            // Prefer profiles table for editable fields; email must be logged-in user's (child sees own email, not parent's)
            name: profileData?.name || profileData?.first_name || meData.name || meData.first_name || '',
            first_name: profileData?.first_name || meData.first_name || '',
            email: user.email || profileData?.email || meData.email,
            phone: profileData?.phone || meData.phone || '',
            avatar_url: profileData?.avatar_url || meData.avatar_url || null,
          };
          setUserRole(meData.role || profileData?.role || 'parent');
          setProfile(mergedProfile);
        } else if (!isAuthError) {
          // Only log non-auth errors
          console.warn('[WebLayout] getMe error (non-critical):', meError);
        }
        
        // Always fallback to profile table (works even if backend is down)
        if (profileData) {
          setUserRole(profileData.role || 'parent');
          // If we don't have profile from API, create a minimal profile object
          if (!meData) {
            setProfile({
              role: profileData.role || 'parent',
              email: user.email || profileData.email,
              name: profileData.name || profileData.first_name || '',
              first_name: profileData.first_name || '',
              phone: profileData.phone || '',
              avatar_url: profileData.avatar_url || null
            });
          }
        } else {
          setUserRole('parent'); // Default fallback
          if (!meData) {
            setProfile({
              role: 'parent',
              email: user.email
            });
          }
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
  }, [user]);

  // Refresh profile when settings updates it
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !user) return;

    const handleRefreshProfile = async () => {
      try {
        const { getMe } = await import('../lib/apiClient');
        const { data: meData, error: meError } = await getMe();

        const { data: profileData } = await supabase
          .from('profiles')
          .select('role, email, name, first_name, phone, avatar_url')
          .eq('id', user.id)
          .maybeSingle();

        if (!meError && meData) {
          const mergedProfile = {
            ...meData,
            name: profileData?.name || profileData?.first_name || meData.name || meData.first_name || '',
            first_name: profileData?.first_name || meData.first_name || '',
            email: user.email || profileData?.email || meData.email,
            phone: profileData?.phone || meData.phone || '',
            avatar_url: profileData?.avatar_url || meData.avatar_url || null,
          };
          setUserRole(meData.role || profileData?.role || 'parent');
          setProfile(mergedProfile);
          return;
        }

        if (profileData) {
          setUserRole(profileData.role || 'parent');
          setProfile({
            role: profileData.role || 'parent',
            email: user.email || profileData.email,
            name: profileData.name || profileData.first_name || '',
            first_name: profileData.first_name || '',
            phone: profileData.phone || '',
            avatar_url: profileData.avatar_url || null
          });
        }
      } catch (error) {
        // Silent fallback
      }
    };

    window.addEventListener('refreshProfile', handleRefreshProfile);
    return () => {
      window.removeEventListener('refreshProfile', handleRefreshProfile);
    };
  }, [user]);

  // Helper function to validate and clean avatar URLs
  const validateAvatarUrl = (url) => {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    
    // Check if it's just a UUID (invalid URL format)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(trimmed)) {
      return null; // It's just a UUID, not a valid URL
    }
    
    // Valid URLs must start with http://, https://, or data:
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
      return trimmed;
    }
    
    // If it's a known avatar key (like "prof1"), it's valid
    const knownAvatarKeys = ['prof1', 'prof2', 'prof3', 'prof4', 'prof5', 'prof6', 'prof7', 'prof8', 'prof9', 'prof10'];
    if (knownAvatarKeys.includes(trimmed.toLowerCase())) {
      return trimmed;
    }
    
    // Otherwise, it's not a valid URL
    return null;
  };

  const fetchFamilyMembers = useCallback(async () => {
    if (!user) return;
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .maybeSingle();
      if (profileData?.family_id) {
        setFamilyId(profileData.family_id);
        try {
          const { data: childrenData, error: childrenError } = await supabase
            .from('children')
            .select('*')
            .eq('family_id', profileData.family_id)
            .eq('archived', false);
          
          if (childrenError) {
            // Try without archived filter if that fails
            if (childrenError.code === '400' || childrenError.code === 'PGRST301' || childrenError.code === '42703') {
              const { data: allData } = await supabase
                .from('children')
                .select('*')
                .eq('family_id', profileData.family_id);
              // Validate and clean avatar URLs
              const cleaned = (allData || []).map(child => ({
                ...child,
                avatar_url: validateAvatarUrl(child.avatar_url || child.avatar),
                avatar: validateAvatarUrl(child.avatar) ?? null
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
              avatar_url: validateAvatarUrl(child.avatar_url || child.avatar),
              avatar: validateAvatarUrl(child.avatar) ?? null
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
                .eq('family_id', profileData.family_id)
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
                .select('id, name, child_id, grade, notes, created_at, updated_at')
                .eq('family_id', profileData.family_id)
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
  }, [user, subjectsLoaded, fullSubjectsLoaded]);

  const fetchFamilyData = useCallback(async () => {
    if (!user) return;
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
  }, [user]);

  useEffect(() => {
    if (!user) {
      setFamilyDataLoaded(true);
      return;
    }
    let mounted = true;
    Promise.all([fetchFamilyMembers(), fetchFamilyData()])
      .then(() => { if (mounted) setFamilyDataLoaded(true); })
      .catch(() => { if (mounted) setFamilyDataLoaded(true); });
    return () => { mounted = false; };
  }, [fetchFamilyData, fetchFamilyMembers, user]);

  // Resolve onboarding status before showing main content so we never flash landing without modal
  useEffect(() => {
    if (!user || !session) {
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
  }, [user, session]);

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
      // Also refetch full subject data (including child_id) so Courses tab shows correct per-child assignments
      const { data: fullSubjectsData } = await supabase
        .from('subject')
        .select('id, name, child_id, grade, notes, created_at, updated_at')
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

    const checkUrlRoute = () => {
      const pathname = window.location.pathname;
      const subjectDetailMatch = pathname.match(/^\/subjects\/([^/]+)$/);
      
      if (subjectDetailMatch) {
        const subjectId = subjectDetailMatch[1];
        const expectedTab = `subject-${subjectId}`;
        if (activeTab !== expectedTab) {
          setActiveTab(expectedTab);
          setActiveTopNav('intelligence');
        }
      } else if (pathname === '/subjects') {
        // Legacy subjects list route now points to Intelligence Hub
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', '/intelligence');
        }
        if (activeTab !== 'intelligence') {
          setActiveTab('intelligence');
          setActiveTopNav('intelligence');
        }
      } else if (pathname === '/intelligence') {
        if (activeTab !== 'intelligence') {
          setActiveTab('intelligence');
          setActiveTopNav('intelligence');
        }
      } else if (pathname === '/planner') {
        if (activeTab !== 'planner') {
          setActiveTab('planner');
          setActiveTopNav('planner');
        }
        const urlParams = new URLSearchParams(window.location.search);
        const view = urlParams.get('view');
        if (view) {
          setCurrentView(view);
        }
      } else if (pathname === '/materials') {
        if (activeTab !== 'materials') {
          setActiveTab('materials');
          setActiveTopNav('materials');
        }
      } else if (pathname === '/' || pathname === '/home') {
        // On home page - always set tab if URL matches
        if (activeTab !== 'home') {
          setActiveTab('home');
          setActiveTopNav('home');
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
      // If event has detail (subject object), it's edit mode
      const subject = e.detail?.subject || null;
      setEditingSubject(subject);
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
      setShowTaskModal(true);
    };
    
    window.addEventListener('openTaskModal', handleOpenTaskModal);
    
    return () => {
      window.removeEventListener('openTaskModal', handleOpenTaskModal);
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
      
      if (!eventId) {
        console.warn('[WebLayout] openEventModal event received but no eventId provided');
        return;
      }
      
      console.log('[WebLayout] openEventModal event received:', { eventId, hasInitialEvent: !!initialEvent, activeTab });
      
      // Open the event modal
      setEventModalEventId(eventId);
      setEventModalInitialEvent(initialEvent);
      setShowEventModal(true);
    };
    
    window.addEventListener('openEventModal', handleOpenEventModal);
    
    return () => {
      window.removeEventListener('openEventModal', handleOpenEventModal);
    };
  }, [activeTab]);

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
      const detail = event?.detail ?? {};
      const from = detail.from;
      const yearIdFromEvent = detail.academicYearId;
      const subjectId = detail.subjectId ?? null;
      const materialId = detail.materialId ?? null;
      console.log('[WebLayout] openPlanYearModal event', { from, yearIdFromEvent, subjectId, materialId });
      setPlanYearHighlightFromHealth(from === 'plan_health_over');
      setPlanYearFromSubjectDetail(from === 'subject_detail');
      setPlanYearInitialSubjectId(subjectId);
      setPlanYearInitialMaterialId(materialId);
      if (yearIdFromEvent) {
        setPlanYearInitialAcademicYearId(yearIdFromEvent);
        setPlanYearInitialPlanSummaryData(detail.planSummaryData ?? null);
        setPlanYearOpenForNewPlan(false);
      } else {
        setPlanYearInitialAcademicYearId(null);
        setPlanYearInitialPlanSummaryData(null);
        setPlanYearOpenForNewPlan(materialId != null || subjectId != null || from === 'library' || from === 'generate_curriculum' || from === 'magic_extract');
      }
      setShowPlanYearModal(true);
    };
    window.addEventListener('openPlanYearModal', handler);
    return () => window.removeEventListener('openPlanYearModal', handler);
  }, []);

  // Deprecated: openBuildCurriculumModal now opens Plan My Year instead (same params: subjectId, subjectName, materialId)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (e) => {
      const detail = e?.detail ?? {};
      const subjectId = detail.subjectId ?? null;
      const subjectName = detail.subjectName ?? null;
      const materialId = detail.materialId ?? null;
      setPlanYearInitialSubjectId(subjectId);
      setPlanYearInitialMaterialId(materialId);
      setPlanYearInitialAcademicYearId(null);
      setPlanYearOpenForNewPlan(true);
      setShowPlanYearModal(true);
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
      handleTabChange('planner');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/planner?view=attendance');
        window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'attendance' }));
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
          updateUrlParams({ view: null });
          handleTabChange('planner');
          break;
        case 'new':
          handleTabChange('settings', 'profile');
          break;
        case 'materials':
          handleTabChange('materials');
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
          break;
        default:
          handleTabChange('home');
      }
    },
    [handleTabChange]
  );

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
    prevActiveTabRef.current = activeTab;
    
    if (activeTab !== 'calendar' && activeTab !== 'planner') {
      setActiveRightTool(null);
    } else if (activeTab === 'planner' && prevTab !== 'planner') {
      // Ensure right pane is closed when switching TO planner (not when already on it)
      setActiveRightTool(null);
    }
  }, [activeTab]);


  // Check if walkthrough has been completed
  const getWalkthroughCompleted = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('plannerWalkthroughCompleted') === 'true';
    }
    return false;
  };

  const setWalkthroughCompleted = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('plannerWalkthroughCompleted', 'true');
    }
  };

  // Check for events when planner screen loads
  useEffect(() => {
    if (activeTab === 'planner' && familyId && hasAnyEvents === null) {
      const checkEvents = async () => {
        try {
          const { count, error } = await supabase
            .from('events')
            .select('*', { count: 'exact', head: true })
            .eq('family_id', familyId)
            .is('deleted_at', null);
          
          if (!error) {
            const hasEvents = count > 0;
            setHasAnyEvents(hasEvents);
            
            // Show walkthrough if no events and not completed
            if (!hasEvents && !getWalkthroughCompleted()) {
              // Small delay to ensure DOM is ready
              setTimeout(() => {
                setShowPlannerWalkthrough(true);
              }, 100);
            }
          }
        } catch (err) {
          console.warn('[PlannerWalkthrough] Error checking for events:', err);
          setHasAnyEvents(true); // Default to true to not show walkthrough on error
        }
      };
      
      checkEvents();
    }
  }, [activeTab, familyId, hasAnyEvents]);

  // Determine if we're on a calendar screen
  const isCalendarScreen = activeTab === 'calendar' || activeTab === 'planner';

  // Show full-screen loading when home tab is loading
  const showFullScreenLoading = activeTab === 'home' && homeLoading;

  // Dismiss initial app load overlay once current tab's data is ready (home or planner)
  useEffect(() => {
    const homeReady = activeTab === 'home' && !homeLoading && !plannerLoading && familyDataLoaded && !subjectsLoading && !materialsLoading;
    const plannerReady = (activeTab === 'planner' || activeTab === 'calendar') && !plannerLoading && (familyId != null);
    if (homeReady || plannerReady) {
      setInitialAppLoadDone(true);
    }
  }, [activeTab, homeLoading, plannerLoading, familyDataLoaded, subjectsLoading, materialsLoading, familyId]);

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
        label: 'Planner',
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
            'Week': 'Week',
            'Month': 'Month',
            'Day': 'Day',
            'Board': 'Board',
          };
          const viewLabel = viewMap[view] || view.charAt(0).toUpperCase() + view.slice(1);
          crumbs.push({ label: viewLabel });
        }
      }
    } else if (activeTab === 'materials') {
      crumbs.push({ label: 'Library' });
    } else if (activeTab === 'subjects') {
      crumbs.push({ label: 'Subjects' });
    } else if (activeTab && activeTab.startsWith('subject-')) {
      crumbs.push({ 
        label: 'Subjects',
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
      crumbs.push({ label: 'Family' });
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
  }, [user, activeTab, activeChildName, activeChildSection, handleTabChange]);

  // Handler for Feedback chip
  const handleOpenFeedback = useCallback(() => {
    if (Platform.OS === 'web') {
      window.open('https://learnadoodle.com/contact', '_blank');
    }
  }, []);

  // Onboarding gating: only close modal when user has reached "You're all set" and clicked Finish (onboarding_completed)
  // onboardingJustCompleted: close immediately when complete API succeeds (avoids depending on follow-up family fetch, e.g. 429)
  const onboardingBlocked = !!(
    session &&
    !onboardingJustCompleted &&
    (initialOnboardingBlocked || (family && !family.onboarding_completed))
  );

  // Don't show main content until onboarding status is known (avoids flash of landing without modal)
  if (user && session && !onboardingCheckDone) {
    return <AppLoader />;
  }

  return (
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
            onAvatarPress: () => handleTabChange('settings', 'profile'),
            user: user,
            userRole: userRole || 'parent',
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
              borderBottomColor: 'rgba(15, 23, 42, 0.04)',
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
                  gap: 12,
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
                  >
                    <View>
                      <Text style={{
                        fontSize: 22,
                        color: '#1E293B',
                        fontWeight: '600',
                        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        marginBottom: 2,
                      }}>
                        {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </Text>
                      <Text style={{
                        fontSize: 13,
                        color: '#64748B',
                        fontWeight: '400',
                        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }}>
                        {(() => {
                          const month = currentMonth.getMonth();
                          const year = currentMonth.getFullYear();
                          let termName = 'Fall Term';
                          if (month >= 0 && month <= 4) termName = 'Spring Term'; // January - May
                          else if (month >= 5 && month <= 7) termName = 'Summer Term'; // June - August
                          else if (month >= 8 && month <= 11) termName = 'Fall Term'; // September - December
                          let schoolYearStart = year;
                          if (month >= 8) {
                            schoolYearStart = year;
                          } else {
                            schoolYearStart = year - 1;
                          }
                          const schoolYearEnd = schoolYearStart + 1;
                          const schoolYearShort = `${String(schoolYearStart).slice(-2)}/${String(schoolYearEnd).slice(-2)}`;
                          return `${termName} · ${schoolYearShort} School Year`;
                        })()}
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
                
                {/* Center: View State Controls (View Mode + Filters + Plan & Optimize) */}
                <View 
                  ref={middleButtonsRef}
                  style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    gap: 8,
                    flex: 1,
                    justifyContent: 'center',
                  }}
                >
                  {/* View Mode Dropdown */}
                  <View style={{ position: 'relative' }}>
                    <TouchableOpacity
                      ref={viewModeButtonRef}
                      onPress={() => {
                        if (Platform.OS === 'web' && viewModeButtonRef.current) {
                          const node = viewModeButtonRef.current._nativeNode || viewModeButtonRef.current;
                          if (node && typeof node.getBoundingClientRect === 'function') {
                            const rect = node.getBoundingClientRect();
                            setViewModeDropdownPosition({
                              top: rect.bottom + 4,
                              left: rect.left,
                            });
                          }
                        }
                        setShowViewModeDropdown(!showViewModeDropdown);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        height: 36,
                        gap: 4,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: '#E6EBF2',
                      }}
                    >
                      <Text style={{ 
                        fontSize: 15, 
                        color: '#1E293B',
                        fontWeight: '500',
                        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }}>
                        {(() => {
                          const viewLabels = {
                            'month': 'Month',
                            'week': 'Week',
                            'board': 'Board',
                            'tasks': 'To-do lists',
                            'attendance': 'Attendance',
                          };
                          return viewLabels[currentView] || 'Month';
                        })()}
                      </Text>
                      <ChevronDown size={13} color="#64748B" />
                    </TouchableOpacity>
                    
                    {showViewModeDropdown && Platform.OS === 'web' && (
                      <View
                        ref={viewModeDropdownRef}
                        style={{
                          position: 'fixed',
                          top: viewModeDropdownPosition.top,
                          left: viewModeDropdownPosition.left,
                          backgroundColor: '#FFFFFF',
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: 'rgba(15,23,42,0.08)',
                          padding: 4,
                          minWidth: 160,
                          zIndex: 1000,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        }}
                      >
                        {[
                          { key: 'month', label: 'Month' },
                          // Week view hidden from UI for now; logic kept
                          { key: 'board', label: 'Board' },
                          { key: 'tasks', label: 'To-do lists' },
                          { key: 'attendance', label: 'Attendance' },
                        ].map((view) => {
                          const isActive = (currentView === view.key) || (currentView === 'board' && view.key === 'board') || (currentView === 'attendance' && view.key === 'attendance');
                          return (
                            <TouchableOpacity
                              key={view.key}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                                paddingVertical: 8,
                                paddingHorizontal: 10,
                                borderRadius: 4,
                                backgroundColor: isActive ? 'rgba(167, 139, 250, 0.1)' : 'transparent',
                              }}
                              onPress={() => {
                                const viewValue = view.key;
                                setCurrentView(viewValue);
                                setDefaultView(viewValue);
                                setShowViewModeDropdown(false);
                                if (Platform.OS === 'web') {
                                  const url = new URL(window.location);
                                  url.searchParams.set('view', viewValue);
                                  window.history.pushState({}, '', url);
                                  window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: viewValue }));
                                }
                              }}
                            >
                              <Text style={{ 
                                fontSize: 15, 
                                color: isActive ? 'rgba(167, 139, 250, 0.9)' : 'rgba(15,23,42,0.9)',
                                fontWeight: isActive ? '600' : '400',
                                fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                              }}>
                                {view.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                  
                  {/* Combined Filters Button */}
                  <View style={{ position: 'relative' }}>
                    <TouchableOpacity
                      ref={filtersButtonRef}
                      onPress={() => {
                        if (Platform.OS === 'web' && filtersButtonRef.current) {
                          const node = filtersButtonRef.current._nativeNode || filtersButtonRef.current;
                          if (node && typeof node.getBoundingClientRect === 'function') {
                            const rect = node.getBoundingClientRect();
                            setFiltersDropdownPosition({
                              top: rect.bottom + 4,
                              left: rect.left,
                            });
                          }
                        }
                        setShowFiltersDropdown(!showFiltersDropdown);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        height: 36,
                        gap: 4,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: '#E6EBF2',
                      }}
                    >
                      <Text style={{ 
                        fontSize: 15, 
                        color: '#1E293B',
                        fontWeight: '500',
                        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }}>
                        {(() => {
                          const childrenText = selectedCalendarChildren && selectedCalendarChildren.length > 0 
                            ? `${selectedCalendarChildren.length === 1 ? '1' : selectedCalendarChildren.length} Child${selectedCalendarChildren.length > 1 ? 'ren' : ''}`
                            : 'All Children';
                          const eventsText = selectedEventTypes && selectedEventTypes.length > 0
                            ? `${selectedEventTypes.length} Event Type${selectedEventTypes.length > 1 ? 's' : ''}`
                            : 'All Events';
                          return `Filters: ${childrenText} · ${eventsText}`;
                        })()}
                      </Text>
                      <ChevronDown size={13} color="rgba(15, 23, 42, 0.7)" />
                    </TouchableOpacity>
                    
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
                          maxWidth: 300,
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
                        {['Lesson', 'Assignment', 'Activity', 'Appointment', 'Project', 'Exam'].map((eventType) => {
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
                      </View>
                    )}
                  </View>
                  
                  {/* Plan My Year button + Plan health notification icon */}
                  <View style={{ 
                    flexShrink: 0,
                    position: 'relative',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    {family?.default_planning_mode !== 'NONE' && (
                      <TouchableOpacity
                        onPress={() => {
                          setPlanYearInitialAcademicYearId(null);
                          setPlanYearOpenForNewPlan(true);
                          setShowPlanYearModal(true);
                        }}
                        accessibilityLabel={STRINGS.planMyYear.modal.title}
                        accessibilityRole="button"
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          height: 36,
                          gap: 8,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          backgroundColor: '#FFFFFF',
                          borderWidth: 1,
                          borderColor: '#E6EBF2',
                        }}
                      >
                        <Target size={16} color="#1E293B" strokeWidth={2} />
                        <Text style={{
                          fontSize: 15,
                          color: '#1E293B',
                          fontWeight: '500',
                          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        }}>
                          {STRINGS.planMyYear.modal.title}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {(activeTab === 'planner' || activeTab === 'calendar') && (
                      <TouchableOpacity
                        onPress={() => {
                          const m = currentMonth.getMonth();
                          const y = currentMonth.getFullYear();
                          const firstDay = `${y}-${String(m + 1).padStart(2, '0')}-01`;
                          const lastDay = new Date(y, m + 1, 0);
                          const lastDayStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
                          setExportStartDate(firstDay);
                          setExportEndDate(lastDayStr);
                          setShowExportModal(true);
                        }}
                        accessibilityLabel="Export"
                        accessibilityRole="button"
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          height: 36,
                          gap: 8,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          backgroundColor: '#FFFFFF',
                          borderWidth: 1,
                          borderColor: '#E6EBF2',
                        }}
                        activeOpacity={0.7}
                      >
                        <Download size={16} color="#1E293B" strokeWidth={2} />
                        <Text style={{
                          fontSize: 15,
                          color: '#1E293B',
                          fontWeight: '500',
                          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        }}>
                          Export
                        </Text>
                      </TouchableOpacity>
                    )}
                    <PlanHealthIcon familyId={familyId} visible={activeTab === 'planner' || activeTab === 'calendar'} initialHealth={preloadedPlanHealth} />
                  </View>
                  
                  {/* Freeze Week toggle - icon only, shown only in Week view */}
                  {currentView === 'week' && (
                    <>
                      <TouchableOpacity
                        ref={freezeWeekButtonRef}
                        onPress={() => {
                          if (Platform.OS === 'web' && typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('plannerToggleFreezeWeek'));
                          }
                        }}
                        activeOpacity={0.7}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 12,
                          backgroundColor: 'rgba(255, 255, 255, 0.9)',
                          borderWidth: 1,
                          borderColor: 'rgba(209, 213, 219, 0.8)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        {...(Platform.OS === 'web' && {
                          onMouseEnter: (e) => {
                            const node = freezeWeekButtonRef.current?._nativeNode || freezeWeekButtonRef.current;
                            if (node && typeof node.getBoundingClientRect === 'function') {
                              const rect = node.getBoundingClientRect();
                              setFreezeWeekTooltipPosition({
                                x: rect.left + rect.width / 2,
                                y: rect.bottom,
                              });
                              setShowFreezeWeekTooltip(true);
                            }
                          },
                          onMouseLeave: () => {
                            setShowFreezeWeekTooltip(false);
                          },
                        })}
                      >
                        <Lock size={14} color="rgba(15, 23, 42, 0.75)" />
                      </TouchableOpacity>
                      
                      {/* Freeze Week Tooltip */}
                      {Platform.OS === 'web' && showFreezeWeekTooltip && (() => {
                        let ReactDOM;
                        try {
                          ReactDOM = require('react-dom');
                        } catch (e) {
                          return null;
                        }
                        
                        const tooltipContent = (
                          <View
                            style={{
                              position: 'fixed',
                              left: freezeWeekTooltipPosition.x,
                              top: freezeWeekTooltipPosition.y,
                              transform: 'translate(-50%, 0)',
                              backgroundColor: '#1F2937',
                              borderRadius: 6,
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              marginTop: 4,
                              zIndex: 10001,
                              maxWidth: 280,
                              ...(Platform.OS === 'web' && {
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                              }),
                            }}
                          >
                            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '500', lineHeight: 16 }}>
                              Freeze Week - this will exempt week from changes both manual and scheduling assistant changes
                            </Text>
                          </View>
                        );
                        
                        if (ReactDOM && typeof document !== 'undefined' && document.body) {
                          return ReactDOM.createPortal(tooltipContent, document.body);
                        }
                        return tooltipContent;
                      })()}
                    </>
                  )}
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
                        {isSearchingPlanner ? (
                          <View style={{ padding: 16, alignItems: 'center' }}>
                            <Text style={{ fontSize: 14, color: '#6b7280' }}>Searching...</Text>
                          </View>
                        ) : plannerSearchResults.length > 0 ? (
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
                        ) : (
                          <View style={{ padding: 16, alignItems: 'center' }}>
                            <Text style={{ fontSize: 14, color: '#6b7280' }}>None found</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>

                  {/* New Event Button */}
                  <TouchableOpacity
                    ref={newButtonRef}
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
                  marginTop: -32, // Position above button
                },
                { pointerEvents: 'none' },
              ]}
            >
              <Text style={{
                color: '#FFFFFF',
                fontSize: 12,
                fontWeight: '500',
                fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                whiteSpace: 'nowrap',
              }}>
                {tooltip.text}
              </Text>
            </View>
          )}
          
          {/* Main Content */}
          <WebContent
            activeTab={activeTab}
            activeSubtab={activeSubtab}
            activeChildId={activeChildId}
            plannerView={currentView}
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
            onHomeLoadingChange={setHomeLoading}
            onPlannerLoadingChange={setPlannerLoading}
            onSubjectsLoadingChange={setSubjectsLoading}
            onMaterialsLoadingChange={setMaterialsLoading}
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
          />
        </AppShell>

      <OnboardingModal
        visible={onboardingBlocked}
        familyId={familyId}
        initialPlanningMode={family?.default_planning_mode ?? null}
        onCompleted={async () => {
          await fetchFamilyData();
          if (Platform.OS === 'web') {
            window.dispatchEvent(new CustomEvent('refreshChildren'));
            window.dispatchEvent(new CustomEvent('refreshSubjects'));
          }
        }}
      />

      {/* Doodle bot search modal - opened via floating Ask AI button */}
      {showDoodleSearchModal && (
        <SearchModal visible={showDoodleSearchModal} onClose={() => setShowDoodleSearchModal(false)} onNavigate={handleDoodleNavigate} />
      )}

      {/* Floating Ask AI button - circular icon, learnadoodle blue */}
      {user && (
        <TouchableOpacity
          onPress={() => setShowDoodleSearchModal(true)}
          style={styles.fabAskAI}
          activeOpacity={0.85}
          accessibilityLabel="Ask AI"
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Image source={require('../assets/icon.png')} style={styles.fabAskAIIcon} resizeMode="contain" />
        </TouchableOpacity>
      )}

      <GlobalNewMenu
        visible={showNewMenu}
        onClose={() => setShowNewMenu(false)}
        position={newMenuPosition}
        currentContext={activeTab}
        onAddChild={() => setShowAddChildModal(true)}
        onAddSubject={() => setShowAddSubjectModal(true)}
        onAddActivity={() => {
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
      <TaskCreateModal
        visible={showTaskModal}
          onClose={() => {
            setShowTaskModal(false);
            setTaskModalChildId(null);
            setTaskModalChildIds([]);
            setTaskModalDefaultSubjectId(null);
            setTaskModalDefaultEventType(null);
            setTaskModalDefaultPlacement('calendar'); // Reset to default for next time
            setTaskModalDefaultStartTime(null);
            setTaskModalDefaultTitle(null);
          }}
          defaultDate={taskModalDate}
          defaultChildId={taskModalChildId}
          defaultChildIds={taskModalChildIds}
          defaultSubjectId={taskModalDefaultSubjectId}
          defaultEventType={taskModalDefaultEventType}
          defaultPlacement={taskModalDefaultPlacement}
          defaultStartTime={taskModalDefaultStartTime}
          defaultTitle={taskModalDefaultTitle}
          familyId={familyId}
          familyMembers={children.map(child => ({
            id: child.id,
            name: child.first_name || child.name || 'Unknown',
            role: 'child'
          }))}
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

      {/* Global Event Modal - available from any screen (family, planner, etc.) */}
      <EventModal
        visible={showEventModal}
        eventId={eventModalEventId}
        initialEvent={eventModalInitialEvent}
        schedulingMode={false}
        familyId={familyId}
        children={children}
        familyMembers={children.map(child => ({
          id: child.id,
          name: child.first_name || child.name || 'Unknown',
          role: 'child'
        }))}
        onClose={() => {
          setShowEventModal(false);
          setEventModalEventId(null);
          setEventModalInitialEvent(null);
        }}
        onEventUpdated={async () => {
          console.log('[WebLayout] Global EventModal onEventUpdated');
          // Dispatch refresh events
          if (Platform.OS === 'web') {
            window.dispatchEvent(new CustomEvent('refreshCalendar'));
            window.dispatchEvent(new CustomEvent('eventDeleted', { 
              detail: { eventId: eventModalEventId } 
            }));
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

      <PlanYearModal
        key={planYearInitialAcademicYearId || 'plan-year-modal'}
        visible={showPlanYearModal}
        onClose={() => {
          setShowPlanYearModal(false);
          // Defer resetting plan-year state until after modal close animation so we don't
          // flash the "Create new plan" first screen when closing from "Edit plan".
          setTimeout(() => {
            setPlanYearHighlightFromHealth(false);
            setPlanYearFromSubjectDetail(false);
            setPlanYearInitialAcademicYearId(null);
            setPlanYearInitialPlanSummaryData(null);
            setPlanYearOpenForNewPlan(false);
            setPlanYearInitialSubjectId(null);
            setPlanYearInitialMaterialId(null);
          }, 300);
        }}
        familyId={familyId}
        children={children}
        subjects={subjects}
        fullSubjects={fullSubjects}
        initialAcademicYearId={planYearInitialAcademicYearId}
        initialPlanSummaryData={planYearInitialPlanSummaryData}
        openForNewPlan={planYearOpenForNewPlan}
        fromSubjectDetail={planYearFromSubjectDetail}
        highlightFromPlanHealth={planYearHighlightFromHealth}
        initialSubjectId={planYearInitialSubjectId}
        initialMaterialId={planYearInitialMaterialId}
        onOpenBuildCurriculum={(params) => {
          setBuildCurriculumInitialSubjectId(params.initialSubjectId ?? null);
          setBuildCurriculumInitialSubjectName(params.initialSubjectName ?? null);
          setBuildCurriculumInitialInputMode(params.initialInputMode ?? null);
          setBuildCurriculumInitialSourceUrl(params.initialSourceUrl ?? null);
          setBuildCurriculumInitialTopic(params.initialTopic ?? null);
          setBuildCurriculumInitialMaterialId(params.initialMaterialId ?? null);
          setShowBuildCurriculumModal(true);
        }}
        onComplete={() => {
          setShowPlanYearModal(false);
          setPlanYearHighlightFromHealth(false);
          setPlanYearFromSubjectDetail(false);
          setPlanYearInitialAcademicYearId(null);
          setPlanYearInitialPlanSummaryData(null);
          setPlanYearOpenForNewPlan(false);
          setPlanYearInitialSubjectId(null);
          setPlanYearInitialMaterialId(null);
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refreshCalendar'));
        }}
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

      {/* Rebalance Modal */}
      <RebalanceModal
        visible={showRebalanceModal}
        onClose={() => setShowRebalanceModal(false)}
        familyId={familyId}
        children={children}
        selectedChildIds={selectedCalendarChildren}
        onComplete={(result) => {
          console.log('Rebalance completed:', result);
          setShowRebalanceModal(false);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('refreshCalendar'));
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
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}>
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 12,
            padding: 24,
            width: '100%',
            maxWidth: 480,
            borderWidth: 1,
            borderColor: '#E6EBF2',
          }}>
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
                { key: 'instructionalTime', label: 'Count as instructional time' },
                { key: 'plan', label: 'Plan My Year' },
                { key: 'location', label: 'Location' },
                { key: 'mode', label: 'Mode' },
                { key: 'instructor', label: 'Instructor' },
                { key: 'subject', label: 'Subject' },
                { key: 'grade', label: 'Grade' },
                { key: 'unit', label: 'Unit' },
                { key: 'percentOfTotal', label: '% of total' },
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
                <Download size={16} color="#FFFFFF" />
                <Text style={{ fontSize: 15, fontWeight: '500', color: '#FFFFFF', fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>Export</Text>
              </TouchableOpacity>
            </View>
            </View>
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

      {/* Planner Walkthrough */}
      {isCalendarScreen && (
        <PlannerWalkthrough
          visible={showPlannerWalkthrough}
          onClose={() => {
            setShowPlannerWalkthrough(false);
            setWalkthroughCompleted();
          }}
          onComplete={() => {
            setShowPlannerWalkthrough(false);
            setWalkthroughCompleted();
          }}
          targetRefs={{
            newButtonRef,
            middleButtonsRef,
            sidebarRef,
          }}
        />
      )}

      {/* Edit Child Modal */}
      <EditChildModal
        visible={showEditChildModal}
        onClose={() => {
          setShowEditChildModal(false);
          setEditingChild(null);
        }}
        child={editingChild}
        onChildUpdated={(updatedChild) => {
          // Refresh children list
          const updatedChildren = children.map(c => 
            c.id === updatedChild.id ? updatedChild : c
          );
          setChildren(updatedChildren);
        }}
      />

      {/* Add/Edit Subject Modal */}
      <AddSubjectModal
        visible={showAddSubjectModal}
        onClose={() => {
          setShowAddSubjectModal(false);
          setEditingSubject(null);
        }}
        familyId={familyId}
        subject={editingSubject}
        children={children}
        onSubjectAdded={() => {
          // Refresh subjects
          setEditingSubject(null);
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('refreshSubjects'));
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

      {/* Right Toolbar */}
      {activeRightTool && (
        <RightToolbar
          tool={activeRightTool}
          onClose={() => setActiveRightTool(null)}
        />
      )}
        </PlannerDiffProvider>
      </FiltersProvider>
      {/* Initial app load: same loader as landing (white + light blue spinner + learnadoodle) */}
      {!initialAppLoadDone && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="auto">
          <AppLoader />
        </View>
      )}
    </ToastProvider>
  );
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
  fabAskAI: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#9ECFFB',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 14px rgba(158, 207, 251, 0.4)',
      zIndex: 9998,
    }),
    ...(Platform.OS !== 'web' && {
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
    }),
  },
  fabAskAIIcon: {
    width: 44,
    height: 44,
  },
});
