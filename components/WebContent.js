import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  Image,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Clock, ArrowRight, UserCircle, Link, MapPin, Eye, Plus, Upload, Copy, Sparkles, Download, Users, Settings, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { proposeReschedule, getWeekStart } from '../lib/apiClient'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import SyllabusUpload from './SyllabusUpload'
import OpenAITest from './OpenAITest'
import AIChatModal from './AIChatModal'
import AIConversationTest from './AIConversationTest'
import CalendarPlanning from './CalendarPlanning'
import TaskCreateModal from './TaskCreateModal'
import EventModal from './events/EventModal'
import ExploreContent from './ExploreContent'
import RebalanceModal from './year/RebalanceModal'
import EventOutcomeModal from './events/EventOutcomeModal'
import ChildDashboard from './dashboards/ChildDashboard'
import TutorDashboard from './dashboards/TutorDashboard'
import IntegrationsSettings from './settings/IntegrationsSettings'
import InspireLearning from './inspire/InspireLearning'

// Simple notification system
import { 
  showEventSaveSuccess, 
  showEventSaveError, 
  showEventDeleteSuccess, 
  showEventDeleteError,
  showScheduleUpdateSuccess,
  showScheduleUpdateError,
  showRuleSaveSuccess,
  showRuleSaveError,
  showRuleDeleteSuccess,
  showRuleDeleteError,
  showOverrideSaveSuccess,
  showOverrideSaveError,
  showPlanGeneratedSuccess,
  showPlanGeneratedError,
  showPlanCommitSuccess,
  showPlanCommitError,
  withNotification
} from '../lib/simpleNotifications'

// Cache refresh utilities
import { smartRefreshCache, refreshFamilyCache } from '../lib/cacheRefresh'

import AddChildForm from './AddChildForm'
import AddChildModal from './AddChildModal'
import AddOptions from './AddOptions'
import SubjectGoalsManager from './SubjectGoalsManager'
import StudentDetailsModal from './StudentDetailsModal'
import ScheduleRulesButton from './ScheduleRulesButton'
import PlannerButton from './PlannerButton'
import ScheduleRulesView from './ScheduleRulesView'
import AIPlannerView from './AIPlannerView'
import PageHeader from './PageHeader'
import StoriesRow from './home/StoriesRow'
import TodaysLearning from './home/TodaysLearning'
import DailyInsights from './home/DailyInsights'
import UpcomingBigEvents from './home/UpcomingBigEvents'
import RecommendedReads from './home/RecommendedReads'
import TasksToday from './home/TasksToday'
import NextUpTile from './home/NextUpTile'
import DayDrawer from './planner/DayDrawer'
import AIActions from './planner/AIActions'
import CenterPane from './planner/CenterPane'
import ChildProfile from './ChildProfile'
import Attendance from './records/Attendance'
import Uploads from './documents/Uploads'
import UploadsEnhanced from './documents/UploadsEnhanced'
// import DocumentsEnhanced from './documents/DocumentsEnhanced' // Causes bundler issues
import LessonPlans from './lesson-plans/LessonPlans'
import Reports from './records/Reports'
import RecordsPhase4 from './records/RecordsPhase4'
import { colors, shadows } from '../theme/colors'

import SubjectSelectForm from './SubjectSelectForm'
import { getSubjectRecommendations, processLiveClass, analyzeProgress, chatWithDoodleBot } from '../lib/aiProcessor.js'
import { AIConversationService } from '../lib/aiConversationService.js'
import { processDoodleMessage, executeTool } from '../lib/doodleAssistant.js'

export default function WebContent({ activeTab, activeSubtab, activeChildSection, user, onChildAdded, navigation, showSyllabusUpload, onSyllabusProcessed, onCloseSyllabusUpload, onTabChange, onSubtabChange, pendingDoodlePrompt, onConsumeDoodlePrompt, showAddChildModal, onCloseAddChildModal, onRightSidebarRender }) {
  // Create rotating animation for loading spinners
  const spinValue = useRef(new Animated.Value(0)).current;
  
  React.useEffect(() => {
    const spinAnimation = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      })
    );
    spinAnimation.start();
    
    return () => spinAnimation.stop();
  }, [spinValue]);
  
  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Home data state (top-level to avoid hooks inside render helpers)
  const [homeData, setHomeData] = useState(null);
  const [homeLoading, setHomeLoading] = useState(true);
  const [selectedChildId, setSelectedChildId] = useState(null);

  // Ref to store refreshCalendarData function for event listener
  const refreshCalendarDataRef = useRef(null);

  // Listen for calendar refresh events from global task modal
  // This allows the TaskCreateModal in WebLayout to trigger a calendar refresh
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleRefreshCalendar = () => {
      // Always refresh calendar data when requested, regardless of active tab
      // This ensures new events appear immediately after year plan creation
      if (refreshCalendarDataRef.current) {
        refreshCalendarDataRef.current().catch(err => console.error('Calendar refresh failed:', err));
      }
    };
    
    window.addEventListener('refreshCalendar', handleRefreshCalendar);
    return () => {
      window.removeEventListener('refreshCalendar', handleRefreshCalendar);
    };
  }, [activeTab]);

  // Listen for rebalance modal events from PlannerWeek
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    
    const handleOpenRebalance = (e) => {
      const { event, yearPlanId } = e.detail;
      setRebalanceEvent(event);
      setRebalanceYearPlanId(yearPlanId);
      setShowRebalanceModal(true);
    };
    
    window.addEventListener('openRebalanceModal', handleOpenRebalance);
    return () => {
      window.removeEventListener('openRebalanceModal', handleOpenRebalance);
    };
  }, []);

  // User role state
  const [userRole, setUserRole] = useState(null);
  const [accessibleChildren, setAccessibleChildren] = useState([]);

  useEffect(() => {
    const fetchUserInfo = async () => {
      if (!user) return;
      try {
        const { getMe } = await import('../lib/apiClient');
        const { data: meData, error: meError } = await getMe();
        if (!meError && meData) {
          setUserRole(meData.role || 'parent');
          setAccessibleChildren(meData.accessible_children || []);
        } else {
          // Fallback: get from profile
          const { data: profileData } = await supabase
            .from('profiles')
            .select('role, family_id')
            .eq('id', user.id)
            .maybeSingle();
          if (profileData) {
            setUserRole(profileData.role || 'parent');
          }
        }
      } catch (error) {
        console.error('Error fetching user info:', error);
      }
    };
    fetchUserInfo();
  }, [user]);

  useEffect(() => {
    const fetchHomeData = async () => {
      if (!user) return;
      try {
        setHomeLoading(true);
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('family_id')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          console.error('Error fetching profile for home:', profileError);
          setHomeLoading(false);
          return;
        }

        if (profileData?.family_id) {
          const { data, error } = await supabase.rpc('get_home_data', {
            _family_id: profileData.family_id,
            _date: new Date().toISOString().split('T')[0],
            _horizon_days: 14,
          });

          if (error) {
            console.error('Error fetching home data:', error);
          } else {
            // Debug: Log learning data to see what we're getting
            console.log('Home data learning:', data?.learning);
            console.log('Home data children:', data?.children);
            console.log('Home data availability:', data?.availability);
            console.log('Home data date:', data?.date);
            
            // Also check what events exist for today to debug
            if (profileData?.family_id) {
              const todayStr = new Date().toISOString().split('T')[0];
              const { data: todayEvents } = await supabase
                .from('events')
                .select('id, child_id, title, start_ts, status')
                .eq('family_id', profileData.family_id)
                .gte('start_ts', todayStr + 'T00:00:00')
                .lt('start_ts', todayStr + 'T23:59:59');
              console.log('Direct events query for today:', todayEvents);
            }
            
            // Check for goals and backlog, add CTA stories if missing
            // Filter out empty/invalid stories (missing title or body)
            const stories = (data?.stories || []).filter(s => 
              s && s.title && s.body && s.title.trim() && s.body.trim()
            );
            let ctaStories = [];
            
            // Check for active goals (for selected child or first child in family)
            // RLS requires a specific child_id, so we always need to query with one
            let hasGoals = false;
            try {
              let childIdToCheck = selectedChildId;
              
              // If no child selected, use first child from homeData (already fetched)
              if (!childIdToCheck && data?.children && data.children.length > 0) {
                childIdToCheck = data.children[0].id;
              }
              
              // Only check if we have a child ID
              if (childIdToCheck) {
                // Use RPC function to bypass RLS issues
                const { data: goalCount, error: goalsError } = await supabase
                  .rpc('get_child_active_goals_count', { p_child_id: childIdToCheck });
                
                if (goalsError) {
                  // Log error but treat as no goals (graceful degradation)
                  console.warn('Error checking goals:', goalsError);
                  hasGoals = false;
                } else {
                  hasGoals = (goalCount || 0) > 0;
                  console.log(`Goals check for child ${childIdToCheck}: count=${goalCount}, hasGoals=${hasGoals}`);
                }
              } else {
                console.log('No child ID to check goals for');
              }
              // If no children exist, hasGoals stays false (which is correct)
            } catch (err) {
              console.warn('Could not check goals:', err);
              hasGoals = false;
            }
            
            // Check for backlog items (events with status='backlog')
            let backlogQuery = supabase
              .from('events')
              .select('id')
              .eq('family_id', profileData.family_id)
              .eq('status', 'backlog');
            if (selectedChildId) {
              backlogQuery = backlogQuery.eq('child_id', selectedChildId);
            }
            const { data: backlog } = await backlogQuery;
            const hasBacklog = (backlog || []).length > 0;
            console.log(`Backlog check: count=${(backlog || []).length}, hasBacklog=${hasBacklog}`);
            
            // Add CTA stories if missing
            if (!hasGoals) {
              ctaStories.push({
                id: 'cta-goals',
                title: 'Set weekly goals',
                tag: 'Tip',
                kind: 'cta-goals',
                body: 'Create minutes-per-week goals so we can suggest quick top‑offs.',
                icon: 'sparkles'
              });
            }
            if (!hasBacklog) {
              ctaStories.push({
                id: 'cta-backlog',
                title: 'Add a backlog item',
                tag: 'Planner',
                kind: 'cta-backlog',
                body: 'Add learning items to your backlog for easy scheduling later.',
                icon: 'book-open'
              });
            }
            
            // Prepend CTA stories to existing stories
            setHomeData({
              ...data,
              stories: [...ctaStories, ...stories]
            });
          }
        }
      } catch (err) {
        console.error('Unexpected error fetching home data:', err);
      } finally {
        setHomeLoading(false);
      }
    };

    fetchHomeData();
  }, [user, selectedChildId]);
  
  // Add CSS animation for loading spinner and event chip hover (web only)
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const style = document.createElement('style');
      style.textContent = `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .loading-spinner {
          animation: spin 1s linear infinite;
        }
        .event-chip-hoverable:hover {
          transform: scale(1.02);
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .event-chip-hoverable {
          transition: all 0.2s ease;
        }
      `;
      document.head.appendChild(style);
      
      // Prevent default context menu globally, but allow it on events
      const preventContextMenu = (e) => {
        // Allow context menu on event elements (they handle their own right-click)
        const target = e.target;
        if (target && (target.closest('[data-event-id]') || target.hasAttribute('data-event-id'))) {
          // Don't prevent - let the event handle it
          return;
        }
        e.preventDefault();
      };
      document.addEventListener('contextmenu', preventContextMenu);
      
      return () => {
        document.head.removeChild(style);
        document.removeEventListener('contextmenu', preventContextMenu);
      };
    }
  }, []);

  // Avatar sources - static mapping for React Native
  const avatarSources = {
    prof1: require('../assets/prof1.png'),
    prof2: require('../assets/prof2.png'),
    prof3: require('../assets/prof3.png'),
    prof4: require('../assets/prof4.png'),
    prof5: require('../assets/prof5.png'),
    prof6: require('../assets/prof6.png'),
    prof7: require('../assets/prof7.png'),
    prof8: require('../assets/prof8.png'),
    prof9: require('../assets/prof9.png'),
    prof10: require('../assets/prof10.png'),
  }

  // Helper function to safely get avatar source
  const getAvatarSource = (avatarKey) => {
    try {
      return avatarSources[avatarKey] || avatarSources.prof1
    } catch (error) {
      console.warn('Avatar source error:', error)
      return avatarSources.prof1
    }
  }

  // Helper function to get time-based greeting
  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) {
      return 'Good morning'
    } else if (hour >= 12 && hour < 17) {
      return 'Good afternoon'
    } else {
      return 'Good evening'
    }
  }

  // State variables
  const [children, setChildren] = useState([])
  const [archivedChildren, setArchivedChildren] = useState([])
  const [showArchived, setShowArchived] = useState(false)
  const [subjects, setSubjects] = useState([])
  const [activities, setActivities] = useState([])
  const [dailyTasks, setDailyTasks] = useState([])
  const [today] = useState(new Date().toISOString().split('T')[0])
  const [familyId, setFamilyId] = useState(null)
  
  // Calendar data caching
  const [calendarDataCache, setCalendarDataCache] = useState({})
  const [isCalendarDataLoaded, setIsCalendarDataLoaded] = useState(false)
  const [calendarDataLoading, setCalendarDataLoading] = useState(false)

  // Add child form state
  const [addChildName, setAddChildName] = useState('')
  const [addChildAge, setAddChildAge] = useState('')
  const [addChildGrade, setAddChildGrade] = useState('')
  const [addChildInterests, setAddChildInterests] = useState('')
  const [addChildStandards, setAddChildStandards] = useState('')
  const [addChildStyle, setAddChildStyle] = useState('')
  const [addChildCollegeBound, setAddChildCollegeBound] = useState(false)
  const [showSubjectSelectForChild, setShowSubjectSelectForChild] = useState(null)
  const [addChildAvatar, setAddChildAvatar] = useState('prof1')
  const [isAddingChild, setIsAddingChild] = useState(false)

  // DoodleBot state
  const [doodleMessages, setDoodleMessages] = useState([])
  const [doodleLoading, setDoodleLoading] = useState(false)
  const [doodleInput, setDoodleInput] = useState('')
  const [doodleConversationId, setDoodleConversationId] = useState(null)
  const [tasksData, setTasksData] = useState({ todo: [], inProgress: [], done: [] })
  const [scheduleRulesModalOpen, setScheduleRulesModalOpen] = useState(false)
  const [aiPlannerModalOpen, setAIPlannerModalOpen] = useState(false)
  const [addChildModalOpen, setAddChildModalOpen] = useState(false)
  const [subjectGoalsModalOpen, setSubjectGoalsModalOpen] = useState(false)
  const modalOpacity = useRef(new Animated.Value(0)).current

  // Animate modal opacity for fast fade in/out
  useEffect(() => {
    if (scheduleRulesModalOpen || aiPlannerModalOpen || addChildModalOpen) {
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 150, // Fast fade in (150ms)
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 100, // Even faster fade out (100ms)
        useNativeDriver: false,
      }).start();
    }
  }, [scheduleRulesModalOpen, aiPlannerModalOpen, addChildModalOpen]);

  const [progressData, setProgressData] = useState({ yearLabel: '', start: '', end: '', percent: 0 })
  const [todaysLearning, setTodaysLearning] = useState([])
  const [todaysEvents, setTodaysEvents] = useState([])
  const [loadingLearning, setLoadingLearning] = useState(true)
  const [track, setTrack] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [showHolidays, setShowHolidays] = useState(true)
  const [showAISuggestions, setShowAISuggestions] = useState(false)
  const [showComingSoonModal, setShowComingSoonModal] = useState(false)
  const [miniCalendarMonth, setMiniCalendarMonth] = useState(new Date())
  const [selectedChildren, setSelectedChildren] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [showStudentModal, setShowStudentModal] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [eventModalVisible, setEventModalVisible] = useState(false)
  const [eventModalEventId, setEventModalEventId] = useState(null)
  const [showOutcomeModal, setShowOutcomeModal] = useState(false)
  const [outcomeEvent, setOutcomeEvent] = useState(null)
  const [eventModalInitialEvent, setEventModalInitialEvent] = useState(null)
  const [isEditingEvent, setIsEditingEvent] = useState(false)
  const [editedEventData, setEditedEventData] = useState({})
  const [showActionMenu, setShowActionMenu] = useState(false)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showAssigneeMenu, setShowAssigneeMenu] = useState(false)
  const [showPriorityMenu, setShowPriorityMenu] = useState(false)

  const [showTagsInput, setShowTagsInput] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const [editingTimeEstimate, setEditingTimeEstimate] = useState(false)
  const [tempTimeEstimate, setTempTimeEstimate] = useState('')
  const [editingDueDate, setEditingDueDate] = useState(false)
  const [tempDueDate, setTempDueDate] = useState('')
  const [editingScheduledDate, setEditingScheduledDate] = useState(false)
  const [tempScheduledDate, setTempScheduledDate] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [tempTitle, setTempTitle] = useState('')
  const [editingAssignee, setEditingAssignee] = useState(false)
  const [tempAssignee, setTempAssignee] = useState([])
  const [editingStatus, setEditingStatus] = useState(false)
  const [tempStatus, setTempStatus] = useState('')
  const [editingScheduledTime, setEditingScheduledTime] = useState(false)
  const [tempScheduledTime, setTempScheduledTime] = useState('')
  const [editingFinishTime, setEditingFinishTime] = useState(false)
  const [tempFinishTime, setTempFinishTime] = useState('')



  // Right Pane New Event State
  const [showNewEventForm, setShowNewEventForm] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskModalDate, setTaskModalDate] = useState(null);
  
  // Home Page Modal State
  const [showHomeEventModal, setShowHomeEventModal] = useState(false);
  const [homeEventType, setHomeEventType] = useState('lesson');
  
  // Rebalance Modal State
  const [showRebalanceModal, setShowRebalanceModal] = useState(false);
  const [rebalanceEvent, setRebalanceEvent] = useState(null);
  const [rebalanceYearPlanId, setRebalanceYearPlanId] = useState(null);
  const [homeEventFormData, setHomeEventFormData] = useState({
    title: '',
    description: '',
    scheduledDate: '',
    scheduledTime: '',
    endTime: '',
    dueDate: '',
    finishTime: '',
    timeEstimate: '',
    assignees: [],
    status: 'planned',
    trackId: null,
    activityId: null
  });

  // Context menu state
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [contextMenuEvent, setContextMenuEvent] = useState(null);
  const [cutEventData, setCutEventData] = useState(null);
  
  const [newEventFormData, setNewEventFormData] = useState({
    title: '',
    description: '',
    scheduledDate: '',
    scheduledTime: '',
    dueDate: '',
    finishTime: '',
    timeEstimate: '',
    assignees: [],
    status: 'planned',
    trackId: null,
    activityId: null
  });
  const [holidayDateRange, setHolidayDateRange] = useState({
    startDate: '',
    endDate: '',
    isRange: false
  });
  const [holidayRepeat, setHolidayRepeat] = useState({
    enabled: false,
    frequency: 'weekly', // weekly, monthly, yearly
    interval: 1
  });
  const [newEventType, setNewEventType] = useState('lesson');
  const [showEventTypeDropdown, setShowEventTypeDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showTrackDropdown, setShowTrackDropdown] = useState(false);
  const [showActivityDropdown, setShowActivityDropdown] = useState(false);
  const [availableTracks, setAvailableTracks] = useState([]);
  const [availableActivities, setAvailableActivities] = useState([]);
  
  // Track dimensions for proper dropdown anchoring (viewport coordinates)
  const [trackTriggerDimensions, setTrackTriggerDimensions] = useState({ width: 0, height: 0, x: 0, y: 0 });
  const [activityTriggerDimensions, setActivityTriggerDimensions] = useState({ width: 0, height: 0, x: 0, y: 0 });
  const [statusTriggerDimensions, setStatusTriggerDimensions] = useState({ width: 0, height: 0, x: 0, y: 0 });
  
  // Refs for measuring trigger positions
  const trackTriggerRef = useRef(null);
  const activityTriggerRef = useRef(null);
  const statusTriggerRef = useRef(null);
  
  // Helper function to measure trigger position in viewport coordinates
  const measureTriggerPosition = (ref, setDimensions) => {
    const node = ref.current;
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x, y, width, height) => {
        setDimensions({ x, y, width, height });
      });
    }
  };

  // Close all dropdowns when clicking outside
  const closeAllDropdowns = () => {
    setShowActionMenu(false)
    setShowStatusMenu(false)
    setShowAssigneeMenu(false)
    setShowPriorityMenu(false)
    setShowTagsInput(false)
    setEditingTimeEstimate(false)
    setEditingDueDate(false)
    setEditingScheduledDate(false)
    setEditingTitle(false)
    setEditingAssignee(false)
    setEditingStatus(false)
    setEditingScheduledTime(false)
    setEditingFinishTime(false)
    setShowEventTypeDropdown(false)
    setShowStatusDropdown(false)
    setShowTrackDropdown(false)
    setShowActivityDropdown(false)
  }

  // Close dropdowns when event changes
  useEffect(() => {
    closeAllDropdowns()
  }, [selectedEvent])

  // Fetch available tracks and activities when familyId is available
  useEffect(() => {
    if (familyId) {
      fetchAvailableTracks()
      fetchAvailableActivities()
    }
  }, [familyId])

  // Calculate finish time based on scheduled time and time estimate
  const calculateFinishTime = (scheduledTime, timeEstimateMinutes) => {
    if (!scheduledTime || !timeEstimateMinutes || timeEstimateMinutes <= 0) {
      return null
    }

    try {
      // Parse the scheduled time (handle both "9:00 AM" and "09:00" formats)
      let hours, minutes
      const timeMatch = scheduledTime.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i)
      
      if (!timeMatch) {
        return null
      }

      hours = parseInt(timeMatch[1])
      minutes = parseInt(timeMatch[2])
      const period = timeMatch[3]?.toUpperCase()

      // Convert to 24-hour format if needed
      if (period === 'PM' && hours !== 12) {
        hours += 12
      } else if (period === 'AM' && hours === 12) {
        hours = 0
      }

      // Add the time estimate
      const totalMinutes = hours * 60 + minutes + timeEstimateMinutes
      const finishHours = Math.floor(totalMinutes / 60)
      const finishMinutes = totalMinutes % 60

      // Convert back to 12-hour format for display
      let displayHours = finishHours
      const displayPeriod = finishHours >= 12 ? 'PM' : 'AM'
      
      if (finishHours > 12) {
        displayHours = finishHours - 12
      } else if (finishHours === 0) {
        displayHours = 12
      }

      return `${displayHours}:${finishMinutes.toString().padStart(2, '0')} ${displayPeriod}`
    } catch (error) {
      console.error('Error calculating finish time:', error)
      return null
    }
  }

  // Calculate time estimate based on scheduled time and finish time
  const calculateTimeEstimate = (scheduledTime, finishTime) => {
    if (!scheduledTime || !finishTime) {
      return null
    }

    try {
      // Parse the scheduled time
      let startHours, startMinutes
      const startMatch = scheduledTime.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i)
      
      if (!startMatch) {
        return null
      }

      startHours = parseInt(startMatch[1])
      startMinutes = parseInt(startMatch[2])
      const startPeriod = startMatch[3]?.toUpperCase()

      // Convert start time to 24-hour format
      if (startPeriod === 'PM' && startHours !== 12) {
        startHours += 12
      } else if (startPeriod === 'AM' && startHours === 12) {
        startHours = 0
      }

      // Parse the finish time
      let finishHours, finishMinutes
      const finishMatch = finishTime.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i)
      
      if (!finishMatch) {
        return null
      }

      finishHours = parseInt(finishMatch[1])
      finishMinutes = parseInt(finishMatch[2])
      const finishPeriod = finishMatch[3]?.toUpperCase()

      // Convert finish time to 24-hour format
      if (finishPeriod === 'PM' && finishHours !== 12) {
        finishHours += 12
      } else if (finishPeriod === 'AM' && finishHours === 12) {
        finishHours = 0
      }

      // Calculate the difference in minutes
      const startTotalMinutes = startHours * 60 + startMinutes
      const finishTotalMinutes = finishHours * 60 + finishMinutes
      
      let diffMinutes = finishTotalMinutes - startTotalMinutes
      
      // Handle overnight events (finish time is next day)
      if (diffMinutes < 0) {
        diffMinutes += 24 * 60 // Add 24 hours
      }

      return diffMinutes > 0 ? diffMinutes : null
    } catch (error) {
      console.error('Error calculating time estimate:', error)
      return null
    }
  }
  // Home Page Modal Functions
  const saveHomeEvent = async () => {
    // Validate required fields before saving
    if (!homeEventFormData.title || homeEventFormData.title.trim() === '') {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Please enter a title for the event.');
      }
      return;
    }

    if (!homeEventFormData.scheduledDate) {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Please select a date for the event.');
      }
      return;
    }

    // Optimistic update - close modal and reset form immediately
    const originalFormData = { ...homeEventFormData };
    setHomeEventFormData({
      title: '',
      description: '',
      scheduledDate: '',
      scheduledTime: '',
      dueDate: '',
      finishTime: '',
      timeEstimate: '',
      assignees: [],
      status: 'planned',
      trackId: null,
      activityId: null
    });
    setShowHomeEventModal(false);

    try {
      let result;
      
      if (homeEventType === 'lesson' || homeEventType === 'activity') {
        // Validate required fields for lessons and activities
        if (!originalFormData.trackId) {
          // Revert optimistic updates on validation error
          setHomeEventFormData(originalFormData);
          setShowHomeEventModal(true);
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Please select a track for the event. This field is required.');
          }
          return;
        }

        if (!originalFormData.activityId) {
          // Revert optimistic updates on validation error
          setHomeEventFormData(originalFormData);
          setShowHomeEventModal(true);
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Please select an activity for the event. This field is required.');
          }
          return;
        }

        if (!originalFormData.assignees || originalFormData.assignees.length === 0) {
          // Revert optimistic updates on validation error
          setHomeEventFormData(originalFormData);
          setShowHomeEventModal(true);
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Please assign the event to at least one child or parent.');
          }
          return;
        }

        if (!originalFormData.timeEstimate || parseInt(originalFormData.timeEstimate) <= 0) {
          // Revert optimistic updates on validation error
          setHomeEventFormData(originalFormData);
          setShowHomeEventModal(true);
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Please enter a valid time estimate (in minutes) for the event.');
          }
          return;
        }
        // Convert MM/DD/YY to YYYY-MM-DD format for database
        const convertToYYYYMMDD = (dateString) => {
          if (!dateString) return null;
          const match = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})/);
          if (!match) return null;
          
          const [, month, day, year] = match;
          const fullYear = parseInt(year) + (parseInt(year) < 50 ? 2000 : 1900);
          return `${fullYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        };

        // Derive minutes/finish_time from start/end time if both provided
        const parseTime = (t) => {
          if (!t) return null;
          // supports '9:00 AM' or '09:00'
          const m = t.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
          if (!m) return null;
          let h = parseInt(m[1], 10);
          const min = parseInt(m[2], 10);
          const ap = m[3]?.toUpperCase();
          if (ap === 'PM' && h < 12) h += 12;
          if (ap === 'AM' && h === 12) h = 0;
          return h * 60 + min;
        };
        const startMin = parseTime(originalFormData.scheduledTime);
        const endMin = parseTime(originalFormData.endTime);
        const computedMinutes = (startMin != null && endMin != null && endMin > startMin) ? (endMin - startMin) : 60;
        const toFinishTime = (mins) => {
          if (startMin == null) return null;
          const total = startMin + mins;
          const h = Math.floor(total / 60) % 24;
          const m = total % 60;
          return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
        };

        const eventData = {
          family_id: familyId,
          activity_id: originalFormData.activityId,
          track_id: originalFormData.trackId,
          title: originalFormData.title,
          description: originalFormData.description || '',
          scheduled_date: convertToYYYYMMDD(originalFormData.scheduledDate),
          scheduled_time: originalFormData.scheduledTime || null,
          due_date: null,
          minutes: parseInt(originalFormData.timeEstimate) || computedMinutes,
          finish_time: toFinishTime(parseInt(originalFormData.timeEstimate) || computedMinutes),
          child_name: JSON.stringify(
            originalFormData.assignees.map(id => id === 'PARENT' ? 'Parent' : (children.find(c => c.id === id)?.first_name || 'Unknown'))
          ),
          status: originalFormData.status || 'planned',
          created_at: new Date().toISOString()
        };

        // Save to activity_instances table for lessons and activities
        result = await supabase
          .from('activity_instances')
          .insert([eventData]);
      } else {
        // Holiday
        const convertToYYYYMMDD = (dateString) => {
          if (!dateString) return null;
          const match = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})/);
          if (!match) return null;
          
          const [, month, day, year] = match;
          const fullYear = parseInt(year) + (parseInt(year) < 50 ? 2000 : 1900);
          return `${fullYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        };
        
        const holidayData = {
          holiday_name: originalFormData.title,
          holiday_date: convertToYYYYMMDD(originalFormData.scheduledDate),
          description: originalFormData.description || '',
          is_proposed: false,
          created_at: new Date().toISOString(),
          family_year_id: (await supabase.from('family_years').select('id').eq('is_current', true).single()).data?.id
        };

        // Write as schedule_overrides 'off' instead of holidays
        result = await supabase
          .from('schedule_overrides')
          .insert([{ scope_type: 'family', scope_id: familyId, date: holidayData.holiday_date, override_kind: 'off', start_time: '00:00', end_time: '23:59', notes: holidayData.holiday_name, is_active: true }]);
      }

      if (result.error) {
        throw result.error;
      }

      // Success - refresh data and cache in background
      if (activeTab === 'home') {
        fetchTodaysLearning().catch(err => console.error('Background fetch failed:', err));
      }
      refreshCalendarData().catch(err => console.error('Background refresh failed:', err));
      
      // Refresh cache for immediate UI updates
      if (familyId) {
        smartRefreshCache(familyId, true).catch(err => console.error('Cache refresh failed:', err));
      }

      // Show success notification
      showEventSaveSuccess();
    } catch (error) {
      console.error('Error saving home event:', error);
      // Revert optimistic updates on error
      setHomeEventFormData(originalFormData);
      setShowHomeEventModal(true);
      
      // Show error notification
      showEventSaveError(error);
    }
  };

  // Right Pane New Event Functions
  const openNewEventForm = () => {
    setShowNewEventForm(true);
    setSelectedEvent(null);
    setNewEventType('lesson');
    setShowEventTypeDropdown(false);
    setNewEventFormData({
      title: '',
      description: '',
      scheduledDate: '',
      scheduledTime: '',
      dueDate: '',
      finishTime: '',
      timeEstimate: '',
      assignees: [],
      status: 'planned'
    });
  };

  const closeNewEventForm = () => {
    setShowNewEventForm(false);
    setSelectedEvent(null);
    setNewEventType('lesson');
    setShowEventTypeDropdown(false);
    setHolidayDateRange({
      startDate: '',
      endDate: '',
      isRange: false
    });
    setHolidayRepeat({
      enabled: false,
      frequency: 'yearly',
      interval: 1
    });
  };

  // Fetch available tracks for the family
  const fetchAvailableTracks = async () => {
    try {
      const { data: tracks, error } = await supabase
        .from('subject_track')
        .select('id, name, status, family_id')
        .eq('family_id', familyId);
      if (error) throw error;
      // Normalize to { id, name } shape used by UI
      const normalized = (tracks || []).map(t => ({ id: t.id, name: t.name }));
      setAvailableTracks(normalized);
    } catch (error) {
      console.error('Error fetching tracks:', error);
      setAvailableTracks([]);
    }
  };

  // Fetch available activities for the family
  const fetchAvailableActivities = async () => {
    try {
      const { data: activities, error } = await supabase
        .from('events')
        .select('id, title')
        .eq('family_id', familyId)
        .eq('source', 'activity');
      
      if (error) throw error;
      setAvailableActivities(activities || []);
    } catch (error) {
      console.error('Error fetching activities:', error);
      setAvailableActivities([]);
    }
  };

  const saveNewEventFromForm = async () => {
    // Validate required fields before saving
    if (!newEventFormData.title || newEventFormData.title.trim() === '') {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Please enter a title for the event.');
      }
      return;
    }

    if (!newEventFormData.scheduledDate) {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Please select a date for the event.');
      }
      return;
    }

    // Optimistic update - close form immediately
    const originalFormData = { ...newEventFormData };
    const originalEventType = newEventType;
    closeNewEventForm();

    try {

      if (originalEventType === 'lesson' || originalEventType === 'activity') {
        // Validate required fields for lessons and activities
        if (!originalFormData.trackId) {
          // Revert optimistic updates on validation error
          setNewEventFormData(originalFormData);
          setNewEventType(originalEventType);
          setShowNewEventForm(true);
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Please select a track for the event. This field is required.');
          }
          return;
        }

        if (!originalFormData.activityId) {
          // Revert optimistic updates on validation error
          setNewEventFormData(originalFormData);
          setNewEventType(originalEventType);
          setShowNewEventForm(true);
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Please select an activity for the event. This field is required.');
          }
          return;
        }

        if (!originalFormData.assignees || originalFormData.assignees.length === 0) {
          // Revert optimistic updates on validation error
          setNewEventFormData(originalFormData);
          setNewEventType(originalEventType);
          setShowNewEventForm(true);
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Please assign the event to at least one child or parent.');
          }
          return;
        }

        if (!originalFormData.timeEstimate || parseInt(originalFormData.timeEstimate) <= 0) {
          // Revert optimistic updates on validation error
          setNewEventFormData(originalFormData);
          setNewEventType(originalEventType);
          setShowNewEventForm(true);
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Please enter a valid time estimate (in minutes) for the event.');
          }
          return;
        }
      }

      let result;
      
      if (originalEventType === 'lesson' || originalEventType === 'activity') {
        // Calculate finish time for new events
        const timeEstimate = parseInt(originalFormData.timeEstimate) || 0
        const finishTime = calculateFinishTime(originalFormData.scheduledTime, timeEstimate)
        
        // Convert MM/DD/YY to YYYY-MM-DD format for database
        const convertToYYYYMMDD = (dateString) => {
          if (!dateString) return null;
          const match = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})/);
          if (!match) return null;
          const month = parseInt(match[1]);
          const day = parseInt(match[2]);
          const year = parseInt(match[3]);
          const fullYear = year < 50 ? 2000 + year : 1900 + year; // Assume 20xx for years < 50
          return `${fullYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        };
        
        const eventData = {
          family_id: familyId,
          activity_id: originalFormData.activityId,
          track_id: originalFormData.trackId,
          title: originalFormData.title,
          description: originalFormData.description,
          scheduled_date: convertToYYYYMMDD(originalFormData.scheduledDate),
          scheduled_time: originalFormData.scheduledTime || null,
          due_date: convertToYYYYMMDD(originalFormData.dueDate),
          minutes: timeEstimate,
          finish_time: finishTime || null,
          child_name: JSON.stringify(originalFormData.assignees.map(id => children.find(c => c.id === id)?.first_name).filter(Boolean)),
          status: originalFormData.status,
          created_at: new Date().toISOString()
        };

        // Save to activity_instances table for lessons and activities
        result = await supabase
          .from('activity_instances')
          .insert([eventData]);
      } else if (originalEventType === 'holiday') {
        // Handle holiday creation with date range and repetition
        const holidaysToCreate = [];
        
        if (holidayDateRange.isRange) {
          // Create multiple holidays for date range
          const startDate = new Date(holidayDateRange.startDate);
          const endDate = new Date(holidayDateRange.endDate);
          
          for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
            const dateStr = date.toISOString().split('T')[0];
            const holidayData = {
              family_id: familyId,
              holiday_name: originalFormData.title,
              holiday_date: dateStr,
              description: originalFormData.description,
              is_proposed: false,
              created_at: new Date().toISOString(),
              repeat_config: holidayRepeat.enabled ? JSON.stringify(holidayRepeat) : null
            };
            holidaysToCreate.push(holidayData);
          }
        } else {
          // Single holiday
          // Convert MM/DD/YY to YYYY-MM-DD format for database
          const convertToYYYYMMDD = (dateString) => {
            if (!dateString) return null;
            const match = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})/);
            if (!match) return null;
            const month = parseInt(match[1]);
            const day = parseInt(match[2]);
            const year = parseInt(match[3]);
            const fullYear = year < 50 ? 2000 + year : 1900 + year; // Assume 20xx for years < 50
            return `${fullYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          };
          
          const holidayData = {
            family_id: familyId,
            holiday_name: originalFormData.title,
            holiday_date: convertToYYYYMMDD(originalFormData.scheduledDate),
            description: originalFormData.description,
            is_proposed: false,
            created_at: new Date().toISOString(),
            repeat_config: holidayRepeat.enabled ? JSON.stringify(holidayRepeat) : null
          };
          holidaysToCreate.push(holidayData);
        }

        // Save all holidays as overrides
        const overrideRows = holidaysToCreate.map(h => ({ scope_type: 'family', scope_id: familyId, date: h.holiday_date, override_kind: 'off', start_time: '00:00', end_time: '23:59', notes: h.holiday_name, is_active: true }));
        result = await supabase
          .from('schedule_overrides')
          .insert(overrideRows);
      }

      if (result.error) {
        throw result.error;
      }

      // Success - refresh calendar data and cache in background
      refreshCalendarData().catch(err => console.error('Background refresh failed:', err));
      
      // Refresh cache for immediate UI updates
      if (familyId) {
        smartRefreshCache(familyId, true).catch(err => console.error('Cache refresh failed:', err));
      }
      
      // Show success notification
      showEventSaveSuccess();
    } catch (error) {
      console.error('Error saving new event:', error);
      // Revert optimistic updates on error
      setNewEventFormData(originalFormData);
      setNewEventType(originalEventType);
      setShowNewEventForm(true);
      
      // Show error notification
      showEventSaveError(error);
    }
  };

  // Handle opening syllabus from the Next Up tile
  const handleOpenSyllabus = async (event) => {
    if (!event) {
      console.warn('No event provided to open syllabus');
      return;
    }

    // Navigate to documents tab with syllabi view
    // The event should have child_id and subject_id to filter the syllabus
    console.log('Opening syllabus for event:', event);
    
    // Switch to documents tab - syllabi are shown there
    onTabChange('documents');
    
    // Optionally, we could store the subject_id/child_id to filter
    // when the documents component loads, but for now just navigate
  };

  // Handle starting an event from the Next Up tile
  const handleStartEvent = async (event) => {
    if (!event || !event.id) {
      console.warn('No event provided to start');
      return;
    }

    try {
      const now = new Date();
      const eventStartTime = new Date(event.start_ts);
      const eventEndTime = event.end_ts ? new Date(event.end_ts) : null;
      
      // Determine status: if event has already passed or is about to end, mark as done
      // Otherwise, mark as in_progress
      let status = 'in_progress';
      let actualStart = now;
      
      // If event was supposed to start in the past or is very close to ending, mark as done
      if (eventEndTime && now >= eventEndTime) {
        status = 'done';
      } else if (eventEndTime && (eventEndTime - now) < 60000) { // Less than 1 minute left
        status = 'done';
      }
      
      // Update event in database
      // Preserve scheduled times, only update status and actual completion time
      const updateData = {
        status: status,
      };
      
      // If marking as done and event hasn't ended yet, set actual end time
      if (status === 'done' && (!eventEndTime || now > eventEndTime)) {
        updateData.end_ts = now.toISOString();
      }
      
      // Store actual start time in metadata for tracking
      const currentMetadata = event.metadata || {};
      updateData.metadata = {
        ...currentMetadata,
        actual_start_time: actualStart.toISOString(),
        started_at: actualStart.toISOString()
      };
      
      const { error } = await supabase
        .from('events')
        .update(updateData)
        .eq('id', event.id);

      if (error) {
        console.error('Error starting event:', error);
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Failed to start activity: ${error.message}`);
        }
        return;
      }

      console.log(`Event ${event.id} started with status: ${status}`);
      
      // Refresh home data to update the Next Up tile
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('family_id')
          .eq('id', user.id)
          .maybeSingle();
        
        if (profile?.family_id) {
          // Trigger a refresh of home data
          const { data, error: fetchError } = await supabase.rpc('get_home_data', {
            _family_id: profile.family_id,
            _date: new Date().toISOString().split('T')[0],
            _horizon_days: 14,
          });
          
          if (!fetchError && data) {
            setHomeData(data);
          }
        }
      }
      
      // Home data will refresh automatically, showing the updated state
    } catch (err) {
      console.error('Failed to start event:', err);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`Failed to start activity: ${err.message}`);
      }
    }
  };

  // Save event changes to Supabase with optimistic updates
  const saveEventChanges = async (eventId, changes, onSuccess, onError) => {
    try {
      console.log('Attempting to save changes:', { eventId, changes })
      
      // For lesson events (activity_instances), update the instance table
      // For activity events (activities), update the activities table
      const tableName = selectedEvent?.type === 'lesson' ? 'activity_instances' : 'activities'
      
      const { error } = await supabase
        .from(tableName)
        .update(changes)
        .eq('id', eventId)
      
      if (error) {
        console.error('Error saving event changes:', error)
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        })
        
        // Call error callback to revert optimistic update
        if (onError) {
          onError(error);
        }
        
        return { success: false, error: error.message }
      }
      
      console.log('Successfully saved changes to database')
      
      // Call success callback for any additional updates
      if (onSuccess) {
        onSuccess();
      }
      
      // Refresh cache for immediate UI updates
      if (familyId) {
        smartRefreshCache(familyId, true).catch(err => console.error('Cache refresh failed:', err));
      }
      
      // No need to refresh calendar data since we're using optimistic updates
      // The UI is already updated with the correct data
      fetchTodaysLearning().catch(err => console.error('Background fetch failed:', err));
      
      return { success: true }
    } catch (error) {
      console.error('Failed to save event changes:', error)
      
      // Call error callback to revert optimistic update
      if (onError) {
        onError(error);
      }
      
      return { success: false, error: error.message }
    }
  }

  // Handle status change with save
  const handleStatusChange = async (newStatus) => {
    if (!selectedEvent?.id) {
      console.error('No event ID for status change')
      return
    }

    // Check if this is a fallback event (string ID starting with 'fallback-')
    if (typeof selectedEvent.id === 'string' && selectedEvent.id.startsWith('fallback-')) {
      console.log('Cannot save changes to fallback events')
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Cannot save changes to sample events. Please select a real event from your calendar.')
      }
      return
    }

    // Check if this is a lesson event (activity_instances) - these can be updated
    if (selectedEvent.type === 'lesson') {
      console.log('Updating status for lesson event (activity_instance)')
      // Continue with the update - lesson events can have their status changed
    }

    // Optimistic update - update UI immediately
    const originalStatus = selectedEvent?.data?.status
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            status: newStatus
          }
        })
        setShowStatusMenu(false)
    
    // Save to database in background
    saveEventChanges(
      selectedEvent.id, 
      { status: newStatus },
      // onSuccess callback (already updated UI)
      () => {
        console.log('Status update saved successfully')
        showEventSaveSuccess()
      },
      // onError callback - revert the optimistic update
      (error) => {
        console.error('Failed to save status change:', error)
        // Revert to original status
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            status: originalStatus
          }
        })
        setShowStatusMenu(true) // Reopen menu so user can try again
        
        // Show error notification
        showEventSaveError(error)
    }
    )
  }

  // Handle assignee change with save (supports multiple assignees)
  const handleAssigneeChange = async (assignee, action = 'toggle') => {
    if (!selectedEvent?.id) {
      console.error('No event ID for assignee change')
      return
    }

    // Check if this is a fallback event (string ID starting with 'fallback-')
    if (typeof selectedEvent.id === 'string' && selectedEvent.id.startsWith('fallback-')) {
      console.log('Cannot save changes to fallback events')
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Cannot save changes to sample events. Please select a real event from your calendar.')
      }
      return
    }

    // Check if this is a lesson event (activity_instances) - these can be updated
    if (selectedEvent.type === 'lesson') {
      console.log('Updating assignee for lesson event (activity_instance)')
      // Continue with the update - lesson events can have their assignee changed
    }
      
      // Get current assignees
      const currentAssignees = getCurrentAssignees()
      let newAssignees = []
      
      if (action === 'toggle') {
        // Toggle assignee in/out of the list
        if (currentAssignees.includes(assignee)) {
          newAssignees = currentAssignees.filter(a => a !== assignee)
        } else {
          newAssignees = [...currentAssignees, assignee]
        }
      } else if (action === 'set') {
        // Set single assignee
        newAssignees = [assignee]
      } else if (action === 'clear') {
        // Clear all assignees
        newAssignees = []
      }
      
    // Optimistic update - update UI immediately
      const originalAssignees = selectedEvent?.data?.child_name
        const updatedEvent = {
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            child_name: JSON.stringify(newAssignees)
          }
        }
        setSelectedEvent(updatedEvent)
        setShowAssigneeMenu(false)
      
      // Save to database in background
      saveEventChanges(
        selectedEvent.id, 
        { child_name: JSON.stringify(newAssignees) },
        // onSuccess callback (already updated UI)
        () => {
          console.log('Assignee update saved successfully')
        },
        // onError callback - revert the optimistic update
        (error) => {
          console.error('Failed to save assignee change:', error)
          // Revert to original assignees
          setSelectedEvent({
            ...selectedEvent, 
            data: {
              ...selectedEvent.data,
              child_name: originalAssignees
            }
          })
          setShowAssigneeMenu(true) // Reopen menu so user can try again
          
      if (typeof window !== 'undefined' && window.alert) {
            window.alert(`Failed to update assignee: ${error.message}`)
      }
    }
      )
  }
  // Handle description change with save
  const handleDescriptionChange = async (newDescription) => {
    if (!selectedEvent?.id) {
      console.error('No event ID for description change')
      return
    }

    // Check if this is a fallback event (string ID starting with 'fallback-')
    if (typeof selectedEvent.id === 'string' && selectedEvent.id.startsWith('fallback-')) {
      console.log('Cannot save changes to fallback events')
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Cannot save changes to sample events. Please select a real event from your calendar.')
      }
      return
    }

    // Optimistic update - update UI immediately
    const originalDescription = selectedEvent?.data?.description
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            description: newDescription
          }
        })
    setEditingDescription(false)
    
    // Save to database in background
    saveEventChanges(
      selectedEvent.id, 
      { description: newDescription },
      // onSuccess callback (already updated UI)
      () => {
        console.log('Description update saved successfully')
      },
      // onError callback - revert the optimistic update
      (error) => {
        console.error('Failed to save description change:', error)
        // Revert to original description
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            description: originalDescription
          }
        })
        setEditingDescription(true) // Reopen editor so user can try again
        
      if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Failed to update description: ${error.message}`)
      }
    }
    )
  }

  // Helper function to get current assignees
  const getCurrentAssignees = () => {
    // Handle both old single assignee and new JSON array format
    // Check child_name first (new format)
    if (selectedEvent.data?.child_name) {
      try {
        // Try to parse as JSON array
        const parsed = JSON.parse(selectedEvent.data.child_name)
        if (Array.isArray(parsed)) {
          return parsed
        } else {
          // Single assignee value
          return [selectedEvent.data.child_name]
        }
      } catch (e) {
        // Not JSON, treat as single assignee
        return [selectedEvent.data.child_name]
      }
    } else if (selectedEvent.assignees && selectedEvent.assignees.length > 0) {
      return selectedEvent.assignees
    } else if (selectedEvent.data?.assignee) {
      try {
        // Try to parse as JSON array
        const parsed = JSON.parse(selectedEvent.data.assignee)
        if (Array.isArray(parsed)) {
          return parsed
        } else {
          // Single assignee value
          return [selectedEvent.data.assignee]
        }
      } catch (e) {
        // Not JSON, treat as single assignee
        return [selectedEvent.data.assignee]
      }
    } else if (selectedEvent.assignee) {
      try {
        // Try to parse as JSON array
        const parsed = JSON.parse(selectedEvent.assignee)
        if (Array.isArray(parsed)) {
          return parsed
        } else {
          // Single assignee value
          return [selectedEvent.assignee]
        }
      } catch (e) {
        // Not JSON, treat as single assignee
        return [selectedEvent.assignee]
      }
    }
    return []
  }

  // Helper functions for status and priority
  const getStatusColor = (status) => {
    switch (status) {
      case 'planned': return '#3b82f6'  // Blue for To Do
      case 'in_progress': return '#f59e0b'  // Orange for In Progress
      case 'completed': return '#10b981'  // Green for Completed
      case 'skipped': return '#6b7280'  // Gray for Skipped
      default: return '#3b82f6'
    }
  }

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'Low': return '#10b981'
      case 'Medium': return '#f59e0b'
      case 'High': return '#dc2626'
      case 'Urgent': return '#7c2d12'
      default: return '#f59e0b'
    }
  }

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'Low': return '🟢'
      case 'Medium': return '🟡'
      case 'High': return '🔴'
      case 'Urgent': return '🚨'
      default: return '🟡'
    }
  }

  // Syllabus upload state
  const [processedSyllabi, setProcessedSyllabi] = useState([])
  const [showSyllabusModal, setShowSyllabusModal] = useState(false)





  // Handle time estimate editing
  const handleTimeEstimateEdit = () => {
    setTempTimeEstimate(selectedEvent.data?.minutes || selectedEvent.estimateMinutes || '')
    setEditingTimeEstimate(true)
  }

  const handleTimeEstimateSave = async () => {
    if (!selectedEvent?.id) {
      console.error('No event ID for time estimate change')
      return
    }

    if (typeof selectedEvent.id === 'string' && selectedEvent.id.startsWith('fallback-')) {
      console.log('Cannot save changes to fallback events')
      return
    }

    const newEstimate = parseInt(tempTimeEstimate, 10)
    if (isNaN(newEstimate) || newEstimate < 0) {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Please enter a valid number of minutes (0 or greater)')
      }
      return
    }

      // Calculate finish time based on scheduled time and new estimate
      const currentScheduledTime = selectedEvent.data?.scheduled_time || selectedEvent.scheduled_time
      const finishTime = calculateFinishTime(currentScheduledTime, newEstimate)
      
    // Optimistic update - update UI immediately
    const originalMinutes = selectedEvent?.data?.minutes
    const originalFinishTime = selectedEvent?.data?.finish_time
    setSelectedEvent({
      ...selectedEvent, 
      data: {
        ...selectedEvent.data,
        minutes: newEstimate,
        finish_time: finishTime
      }
    })
    setEditingTimeEstimate(false)
    
    // Save to database in background
    saveEventChanges(
      selectedEvent.id, 
      { 
        minutes: newEstimate,
        finish_time: finishTime
      },
      // onSuccess callback (already updated UI)
      () => {
        console.log('Time estimate update saved successfully')
      },
      // onError callback - revert the optimistic update
      (error) => {
        console.error('Failed to save time estimate change:', error)
        // Revert to original values
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            minutes: originalMinutes,
            finish_time: originalFinishTime
          }
        })
        setEditingTimeEstimate(true) // Reopen editor so user can try again
        
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Failed to update time estimate: ${error.message}`)
        }
      }
    )
  }

  const handleTimeEstimateCancel = () => {
    setEditingTimeEstimate(false)
    setTempTimeEstimate('')
  }

  // Handle due date editing
  const handleDueDateEdit = () => {
    const currentDueDate = selectedEvent.data?.due_date || ''
    if (currentDueDate) {
      // Convert YYYY-MM-DD to MM/DD/YY
      const [year, month, day] = currentDueDate.split('-')
      const shortYear = year.substring(2) // Get last 2 digits
      setTempDueDate(`${month}/${day}/${shortYear}`)
    } else {
      setTempDueDate('')
    }
    setEditingDueDate(true)
  }

  const handleDueDateSave = async () => {
    if (!selectedEvent?.id) {
      console.error('No event ID for due date change')
      return
    }

    if (typeof selectedEvent.id === 'string' && selectedEvent.id.startsWith('fallback-')) {
      console.log('Cannot save changes to fallback events')
      return
    }

    // Convert MM/DD/YY to YYYY-MM-DD format
    let finalDueDate = null
    if (tempDueDate.trim() !== '') {
      // Validate MM/DD/YY format
      if (!/^\d{2}\/\d{2}\/\d{2}$/.test(tempDueDate)) {
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('Invalid date format. Please use MM/DD/YY (e.g., 01/15/25)')
        }
        return
      }
      
      // Convert MM/DD/YY to YYYY-MM-DD
      const [month, day, year] = tempDueDate.split('/')
      const fullYear = '20' + year // Assume 20xx for 2-digit years
      finalDueDate = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }

    // Optimistic update - update UI immediately
    const originalDueDate = selectedEvent?.data?.due_date
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            due_date: finalDueDate
          }
        })
        setEditingDueDate(false)
    
    // Save to database in background
    saveEventChanges(
      selectedEvent.id, 
      { due_date: finalDueDate },
      // onSuccess callback (already updated UI)
      () => {
        console.log('Due date update saved successfully')
      },
      // onError callback - revert the optimistic update
      (error) => {
        console.error('Failed to save due date change:', error)
        // Revert to original due date
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            due_date: originalDueDate
          }
        })
        setEditingDueDate(true) // Reopen editor so user can try again
        
      if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Failed to update due date: ${error.message}`)
      }
    }
    )
  }

  const handleDueDateCancel = () => {
    setEditingDueDate(false)
    setTempDueDate('')
  }

  // Handle scheduled date editing
  const handleScheduledDateEdit = () => {
    const currentScheduledDate = selectedEvent.data?.scheduled_date || ''
    if (currentScheduledDate) {
      // Convert YYYY-MM-DD to MM/DD/YY
      const [year, month, day] = currentScheduledDate.split('-')
      const shortYear = year.substring(2) // Get last 2 digits
      setTempScheduledDate(`${month}/${day}/${shortYear}`)
    } else {
      setTempScheduledDate('')
    }
    setEditingScheduledDate(true)
  }

  const handleScheduledDateSave = async () => {
    if (!selectedEvent?.id) {
      console.error('No event ID for scheduled date change')
      return
    }

    if (typeof selectedEvent.id === 'string' && selectedEvent.id.startsWith('fallback-')) {
      console.log('Cannot save changes to fallback events')
      return
    }

    // Convert MM/DD/YY to YYYY-MM-DD format
    let finalScheduledDate = null
    if (tempScheduledDate.trim() !== '') {
      // Validate MM/DD/YY format
      if (!/^\d{2}\/\d{2}\/\d{2}$/.test(tempScheduledDate)) {
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('Invalid date format. Please use MM/DD/YY (e.g., 01/15/25)')
        }
        return
      }
      
      // Convert MM/DD/YY to YYYY-MM-DD
      const [month, day, year] = tempScheduledDate.split('/')
      const fullYear = '20' + year // Assume 20xx for 2-digit years
      finalScheduledDate = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }

    // Optimistic update - update UI immediately
    const originalScheduledDate = selectedEvent?.data?.scheduled_date
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            scheduled_date: finalScheduledDate
          }
        })
        setEditingScheduledDate(false)
    
    // Save to database in background
    saveEventChanges(
      selectedEvent.id, 
      { scheduled_date: finalScheduledDate },
      // onSuccess callback (already updated UI)
      () => {
        console.log('Scheduled date update saved successfully')
      },
      // onError callback - revert the optimistic update
      (error) => {
        console.error('Failed to save scheduled date change:', error)
        // Revert to original scheduled date
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            scheduled_date: originalScheduledDate
          }
        })
        setEditingScheduledDate(true) // Reopen editor so user can try again
        
      if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Failed to update scheduled date: ${error.message}`)
      }
    }
    )
  }

  const handleScheduledDateCancel = () => {
    setEditingScheduledDate(false)
    setTempScheduledDate('')
  }

  // Handle title editing
  const handleTitleEdit = () => {
    const currentTitle = selectedEvent.data?.title || selectedEvent.title || ''
    setTempTitle(currentTitle)
    setEditingTitle(true)
  }

  const handleTitleSave = async () => {
    if (!selectedEvent?.id) {
      console.error('No event ID for title change')
      return
    }

    if (typeof selectedEvent.id === 'string' && selectedEvent.id.startsWith('fallback-')) {
      console.log('Cannot save changes to fallback events')
      return
    }

    const finalTitle = tempTitle.trim() || null

    // Optimistic update - update UI immediately
    const originalTitle = selectedEvent?.data?.title || selectedEvent?.title
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            title: finalTitle
          }
        })
        setEditingTitle(false)
    
    // Save to database in background
    saveEventChanges(
      selectedEvent.id, 
      { title: finalTitle },
      // onSuccess callback (already updated UI)
      () => {
        console.log('Title update saved successfully')
      },
      // onError callback - revert the optimistic update
      (error) => {
        console.error('Failed to save title change:', error)
        // Revert to original title
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            title: originalTitle
          }
        })
        setEditingTitle(true) // Reopen editor so user can try again
        
      if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Failed to update title: ${error.message}`)
      }
    }
    )
  }

  const handleTitleCancel = () => {
    setEditingTitle(false)
    setTempTitle('')
  }

  // Handle assignee inline editing
  const handleAssigneeEdit = () => {
    const currentAssignees = getCurrentAssignees()
    setTempAssignee([...currentAssignees])
    setEditingAssignee(true)
  }

  const handleAssigneeSave = async () => {
    if (!selectedEvent?.id) {
      console.error('No event ID for assignee change')
      return
    }

    if (typeof selectedEvent.id === 'string' && selectedEvent.id.startsWith('fallback-')) {
      console.log('Cannot save changes to fallback events')
      return
    }

    // Optimistic update - update UI immediately
    const originalAssignee = selectedEvent?.data?.child_name
    setSelectedEvent({
      ...selectedEvent, 
      data: {
        ...selectedEvent.data,
        child_name: JSON.stringify(tempAssignee)
      }
    })
    setEditingAssignee(false)
    
    // Save to database in background
    saveEventChanges(
      selectedEvent.id, 
      { child_name: JSON.stringify(tempAssignee) },
      // onSuccess callback (already updated UI)
      () => {
        console.log('Single assignee update saved successfully')
      },
      // onError callback - revert the optimistic update
      (error) => {
        console.error('Failed to save single assignee change:', error)
        // Revert to original assignee
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            child_name: originalAssignee
          }
        })
        setEditingAssignee(true) // Reopen editor so user can try again
        
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Failed to update assignee: ${error.message}`)
        }
      }
    )
  }

  const handleAssigneeCancel = () => {
    setEditingAssignee(false)
    setTempAssignee([])
  }

  // Handle status inline editing
  const handleStatusEdit = () => {
    const currentStatus = selectedEvent.data?.status || 'planned'
    setTempStatus(currentStatus)
    setEditingStatus(true)
  }

  const handleStatusSave = async () => {
    if (!selectedEvent?.id) {
      console.error('No event ID for status change')
      return
    }

    if (typeof selectedEvent.id === 'string' && selectedEvent.id.startsWith('fallback-')) {
      console.log('Cannot save changes to fallback events')
      return
    }

    // Optimistic update - update UI immediately
    const originalStatus = selectedEvent?.data?.status
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            status: tempStatus
          }
        })
        setEditingStatus(false)
    
    // Save to database in background
    saveEventChanges(
      selectedEvent.id, 
      { status: tempStatus },
      // onSuccess callback (already updated UI)
      () => {
        console.log('Inline status update saved successfully')
      },
      // onError callback - revert the optimistic update
      (error) => {
        console.error('Failed to save inline status change:', error)
        // Revert to original status
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            status: originalStatus
          }
        })
        setEditingStatus(true) // Reopen editor so user can try again
        
      if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Failed to update status: ${error.message}`)
      }
    }
    )
  }

  const handleStatusCancel = () => {
    setEditingStatus(false)
    setTempStatus('')
  }

  // Handle scheduled time inline editing
  const handleScheduledTimeEdit = () => {
    const currentTime = selectedEvent.data?.scheduled_time || ''
    console.log('handleScheduledTimeEdit called with currentTime:', currentTime);
    
    // Convert time format for HTML time input (HH:MM)
    if (Platform.OS === 'web' && currentTime) {
      // Convert "9:00 AM" format to "09:00" format for HTML time input
      const timeMatch = currentTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
      if (timeMatch) {
        let hours = parseInt(timeMatch[1])
        const minutes = timeMatch[2]
        const period = timeMatch[3].toUpperCase()
        
        if (period === 'PM' && hours !== 12) {
          hours += 12
        } else if (period === 'AM' && hours === 12) {
          hours = 0
        }
        
        const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes}`
        console.log('Setting tempScheduledTime to:', formattedTime);
        setTempScheduledTime(formattedTime)
      } else {
        console.log('Setting tempScheduledTime to currentTime (no match):', currentTime);
        setTempScheduledTime(currentTime)
      }
    } else if (Platform.OS === 'web' && !currentTime) {
      // If no current time, set to empty string for HTML time input
      console.log('No current time, setting tempScheduledTime to empty string');
      setTempScheduledTime('')
    } else {
      console.log('Setting tempScheduledTime to currentTime (no web/platform):', currentTime);
      setTempScheduledTime(currentTime)
    }
    setEditingScheduledTime(true)
  }

  const handleScheduledTimeSave = async () => {
    if (!selectedEvent?.id) {
      console.error('No event ID for scheduled time change')
      return
    }

    if (typeof selectedEvent.id === 'string' && selectedEvent.id.startsWith('fallback-')) {
      console.log('Cannot save changes to fallback events')
      return
    }

    // Convert time format for display (HH:MM to 12-hour format)
    let timeToSave = tempScheduledTime
    if (Platform.OS === 'web' && tempScheduledTime) {
      const timeMatch = tempScheduledTime.match(/^(\d{1,2}):(\d{2})$/)
      if (timeMatch) {
        let hours = parseInt(timeMatch[1])
        const minutes = timeMatch[2]
        
        const period = hours >= 12 ? 'PM' : 'AM'
        if (hours > 12) {
          hours -= 12
        } else if (hours === 0) {
          hours = 12
        }
        
        timeToSave = `${hours}:${minutes} ${period}`
      }
    }

    // Convert empty string to null for database compatibility
    if (timeToSave === '' || timeToSave === null || timeToSave === undefined) {
      timeToSave = null
    }

      // Calculate finish time based on new scheduled time and current estimate
      const currentEstimate = selectedEvent.data?.minutes || selectedEvent.estimateMinutes || 0
      const finishTime = calculateFinishTime(timeToSave, currentEstimate)
      
    // Optimistic update - update UI immediately
    const originalScheduledTime = selectedEvent?.data?.scheduled_time
    const originalFinishTime = selectedEvent?.data?.finish_time
    console.log('Optimistic update - setting scheduled_time to:', timeToSave)
    console.log('Optimistic update - setting finish_time to:', finishTime)
    setSelectedEvent({
      ...selectedEvent, 
      data: {
        ...selectedEvent.data,
        scheduled_time: timeToSave,
        finish_time: finishTime
      }
    })
    setEditingScheduledTime(false)
    
    // Save to database in background
    saveEventChanges(
      selectedEvent.id, 
      { 
        scheduled_time: timeToSave,
        finish_time: finishTime
      },
      // onSuccess callback (already updated UI)
      () => {
        console.log('Scheduled time update saved successfully')
      },
      // onError callback - revert the optimistic update
      (error) => {
        console.error('Failed to save scheduled time change:', error)
        // Revert to original times
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            scheduled_time: originalScheduledTime,
            finish_time: originalFinishTime
          }
        })
        setEditingScheduledTime(true) // Reopen editor so user can try again
        
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Failed to update scheduled time: ${error.message}`)
        }
      }
    )
  }

  const handleScheduledTimeCancel = () => {
    setEditingScheduledTime(false)
    setTempScheduledTime('')
  }

  // Handle finish time editing
  const handleFinishTimeEdit = () => {
    const currentFinishTime = selectedEvent.data?.finish_time || ''
    console.log('handleFinishTimeEdit called with currentFinishTime:', currentFinishTime);
    
    if (currentFinishTime) {
      // Convert "10:30 AM" format to "10:30" format for HTML time input
      const timeMatch = currentFinishTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
      if (timeMatch) {
        let hours = parseInt(timeMatch[1])
        const minutes = timeMatch[2]
        const period = timeMatch[3].toUpperCase()
        
        // Convert to 24-hour format
        if (period === 'PM' && hours !== 12) {
          hours += 12
        } else if (period === 'AM' && hours === 12) {
          hours = 0
        }
        
        const time24Hour = `${hours.toString().padStart(2, '0')}:${minutes}`
        console.log('Setting tempFinishTime to:', time24Hour);
        setTempFinishTime(time24Hour)
      } else {
        console.log('Setting tempFinishTime to currentFinishTime (no match):', currentFinishTime);
        setTempFinishTime(currentFinishTime)
      }
    } else {
      // If no current finish time, set to empty string for HTML time input
      console.log('No current finish time, setting tempFinishTime to empty string');
      setTempFinishTime('')
    }
    setEditingFinishTime(true)
  }
  // Combined function to save both scheduled and finish times together
  const handleBothTimesSave = async () => {
    if (!selectedEvent?.id) {
      console.error('No event ID for time changes')
      return
    }

    if (typeof selectedEvent.id === 'string' && selectedEvent.id.startsWith('fallback-')) {
      console.log('Cannot save changes to fallback events')
      return
    }

    console.log('Time values before conversion:', { tempScheduledTime, tempFinishTime });

    // Convert scheduled time format
    let scheduledTimeToSave = tempScheduledTime
    if (Platform.OS === 'web' && tempScheduledTime) {
      const timeMatch = tempScheduledTime.match(/^(\d{1,2}):(\d{2})$/)
      if (timeMatch) {
        let hours = parseInt(timeMatch[1])
        const minutes = timeMatch[2]
        
        const period = hours >= 12 ? 'PM' : 'AM'
        if (hours > 12) {
          hours -= 12
        } else if (hours === 0) {
          hours = 12
        }
        
        scheduledTimeToSave = `${hours}:${minutes} ${period}`
      }
    }

    // Convert finish time format
    let finishTimeToSave = tempFinishTime
    if (Platform.OS === 'web' && tempFinishTime) {
      const timeMatch = tempFinishTime.match(/^(\d{1,2}):(\d{2})$/)
      if (timeMatch) {
        let hours = parseInt(timeMatch[1])
        const minutes = timeMatch[2]
        
        const period = hours >= 12 ? 'PM' : 'AM'
        if (hours > 12) {
          hours -= 12
        } else if (hours === 0) {
          hours = 12
        }
        
        finishTimeToSave = `${hours}:${minutes} ${period}`
      }
    }

    // Convert empty strings to null for database compatibility
    if (scheduledTimeToSave === '' || scheduledTimeToSave === null || scheduledTimeToSave === undefined) {
      scheduledTimeToSave = null
    }
    if (finishTimeToSave === '' || finishTimeToSave === null || finishTimeToSave === undefined) {
      finishTimeToSave = null
    }

    // Calculate time estimate if both times are provided
    let calculatedMinutes = null
    if (scheduledTimeToSave && finishTimeToSave) {
      calculatedMinutes = calculateTimeEstimate(scheduledTimeToSave, finishTimeToSave)
    }

    // Optimistic update - update UI immediately
    const originalScheduledTime = selectedEvent?.data?.scheduled_time
    const originalFinishTime = selectedEvent?.data?.finish_time
    const originalMinutes = selectedEvent?.data?.minutes
    
    console.log('Combined optimistic update - setting scheduled_time to:', scheduledTimeToSave)
    console.log('Combined optimistic update - setting finish_time to:', finishTimeToSave)
    console.log('Combined optimistic update - setting minutes to:', calculatedMinutes)
    
    setSelectedEvent({
      ...selectedEvent, 
      data: {
        ...selectedEvent.data,
        scheduled_time: scheduledTimeToSave,
        finish_time: finishTimeToSave,
        ...(calculatedMinutes && { minutes: calculatedMinutes })
      }
    })
    setEditingScheduledTime(false)
    setEditingFinishTime(false)
    
    // Also update the calendar event data optimistically
    const currentYear = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const monthKey = `${currentYear}-${month}`;
    const monthEvents = calendarDataCache[monthKey] || {};
    
    // Create a completely new object to ensure React detects the change
    const newMonthEvents = {};
    let eventUpdated = false;
    
    Object.keys(monthEvents).forEach(dateKey => {
      const events = monthEvents[dateKey];
      newMonthEvents[dateKey] = events.map(event => {
        if (event.id === selectedEvent.id) {
          eventUpdated = true;
          console.log('Updated calendar event time optimistically:', event.id, 'to', scheduledTimeToSave);
          // Create a new event object with updated time
          return { ...event, time: scheduledTimeToSave };
        }
        return event;
      });
    });
    
    if (eventUpdated) {
      // Update the calendar events state with the new object, preserving events from other months
      setCalendarEvents(prevCalendarEvents => ({
        ...prevCalendarEvents,
        ...newMonthEvents
      }));
      console.log('Calendar events state updated with new time');
    }
    
    // Prepare changes for database
    const changes = {
      scheduled_time: scheduledTimeToSave,
      finish_time: finishTimeToSave
    }
    if (calculatedMinutes) {
      changes.minutes = calculatedMinutes
    }
    
    // Save to database in background
    saveEventChanges(
      selectedEvent.id, 
      changes,
      // onSuccess callback (already updated UI)
      () => {
        console.log('Combined time update saved successfully')
      },
      // onError callback - revert the optimistic update
      (error) => {
        console.error('Failed to save combined time changes:', error)
        // Revert to original times
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            scheduled_time: originalScheduledTime,
            finish_time: originalFinishTime,
            minutes: originalMinutes
          }
        })
        setEditingScheduledTime(true) // Reopen editor so user can try again
        setEditingFinishTime(true)
        
        // Also revert the calendar event data
        const currentYear = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const monthKey = `${currentYear}-${month}`;
        const monthEvents = calendarDataCache[monthKey] || {};
        
        // Create a completely new object to ensure React detects the change
        const newMonthEvents = {};
        let eventReverted = false;
        
        Object.keys(monthEvents).forEach(dateKey => {
          const events = monthEvents[dateKey];
          newMonthEvents[dateKey] = events.map(event => {
            if (event.id === selectedEvent.id) {
              eventReverted = true;
              console.log('Reverted calendar event time:', event.id, 'to', originalScheduledTime);
              // Create a new event object with reverted time
              return { ...event, time: originalScheduledTime };
            }
            return event;
          });
        });
        
        if (eventReverted) {
          // Update the calendar events state with the new object, preserving events from other months
          setCalendarEvents(prevCalendarEvents => ({
            ...prevCalendarEvents,
            ...newMonthEvents
          }));
          console.log('Calendar events state reverted with original time');
        }
        
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Failed to update times: ${error.message}`)
        }
      }
    )
  }

  const handleFinishTimeSave = async () => {
    if (!selectedEvent?.id) {
      console.error('No event ID for finish time change')
      return
    }

    if (typeof selectedEvent.id === 'string' && selectedEvent.id.startsWith('fallback-')) {
      console.log('Cannot save changes to fallback events')
      return
    }

    // Convert time format for display (HH:MM to 12-hour format)
    let timeToSave = tempFinishTime
    if (Platform.OS === 'web' && tempFinishTime) {
      const timeMatch = tempFinishTime.match(/^(\d{1,2}):(\d{2})$/)
      if (timeMatch) {
        let hours = parseInt(timeMatch[1])
        const minutes = timeMatch[2]
        
        const period = hours >= 12 ? 'PM' : 'AM'
        if (hours > 12) {
          hours -= 12
        } else if (hours === 0) {
          hours = 12
        }
        
        timeToSave = `${hours}:${minutes} ${period}`
      }
    }

    // Convert empty string to null for database compatibility
    if (timeToSave === '' || timeToSave === null || timeToSave === undefined) {
      timeToSave = null
    }

      // Calculate time estimate based on new finish time and current scheduled time
      const currentScheduledTime = selectedEvent.data?.scheduled_time || selectedEvent.scheduled_time
      const calculatedTimeEstimate = calculateTimeEstimate(currentScheduledTime, timeToSave)
      
    // Optimistic update - update UI immediately
    const originalFinishTime = selectedEvent?.data?.finish_time
    const originalMinutes = selectedEvent?.data?.minutes
    setSelectedEvent({
      ...selectedEvent, 
      data: {
        ...selectedEvent.data,
        finish_time: timeToSave,
        minutes: calculatedTimeEstimate
      }
    })
    setEditingFinishTime(false)
    
    // Save to database in background
    saveEventChanges(
      selectedEvent.id, 
      { 
        finish_time: timeToSave,
        minutes: calculatedTimeEstimate
      },
      // onSuccess callback (already updated UI)
      () => {
        console.log('Finish time update saved successfully')
      },
      // onError callback - revert the optimistic update
      (error) => {
        console.error('Failed to save finish time change:', error)
        // Revert to original values
        setSelectedEvent({
          ...selectedEvent, 
          data: {
            ...selectedEvent.data,
            finish_time: originalFinishTime,
            minutes: originalMinutes
          }
        })
        setEditingFinishTime(true) // Reopen editor so user can try again
        
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Failed to update finish time: ${error.message}`)
        }
      }
    )
  }

  const handleFinishTimeCancel = () => {
    setEditingFinishTime(false)
    setTempFinishTime('')
  }

  // Fetch children on mount
  useEffect(() => {
    fetchChildren()
    fetchFamilyId()
    fetchTodaysLearning()
  }, [])

  const handleStudentPress = (studentData) => {
    setSelectedStudent(studentData)
    setShowStudentModal(true)
  }

  const handleCloseStudentModal = () => {
    setShowStudentModal(false)
    setSelectedStudent(null)
  }

  const handleDeleteChild = async (childId) => {
    try {
      console.log('=== DELETE CHILD PROCESS STARTED ===');
      console.log('Child ID to delete:', childId);
      console.log('Family ID:', familyId);
      
      // Close the modal immediately to prevent UI errors
      handleCloseStudentModal();
      
      // PROPER CASCADE DELETION: Delete in correct order to avoid foreign key violations
      console.log('Starting cascade deletion process...');
      
      // Step 1: Delete activity_instances that reference this family
      console.log('Step 1: Deleting activity_instances...');
      try {
        const { error: activityInstancesError } = await supabase
          .from('events')
          .delete()
          .eq('family_id', familyId)
          .eq('source', 'lesson');
        
        if (activityInstancesError) {
          console.log('Activity instances deletion failed:', activityInstancesError.message);
        } else {
          console.log('Activity instances deleted successfully');
        }
      } catch (err) {
        console.log('Activity instances deletion error:', err);
      }
      
      // Step 2: Delete activities that reference this family
      console.log('Step 2: Deleting activities...');
      try {
        const { error: activitiesError } = await supabase
          .from('events')
          .delete()
          .eq('family_id', familyId)
          .eq('source', 'activity');
        
        if (activitiesError) {
          console.log('Activities deletion failed:', activitiesError.message);
        } else {
          console.log('Activities deleted successfully');
        }
      } catch (err) {
        console.log('Activities deletion error:', err);
      }
      
      // Step 3: Delete subject_track records that reference this child
      console.log('Step 3: Deleting subject_track records...');
      try {
        const { error: subjectTrackError } = await supabase
          .from('subject_track')
            .delete()
          .eq('child_id', childId);
          
        if (subjectTrackError) {
          console.log('Subject_track deletion failed:', subjectTrackError.message);
          } else {
          console.log('Subject_track records deleted successfully');
          }
      } catch (err) {
        console.log('Subject_track deletion error:', err);
        }
        
      // Step 4: Delete tracks that belong to this family
      console.log('Step 4: Deleting tracks...');
        try {
        const { error: tracksError } = await supabase
            .from('subject_track')
            .delete()
            .eq('family_id', familyId);
          
        if (tracksError) {
          console.log('Tracks deletion failed:', tracksError.message);
          } else {
          console.log('Tracks deleted successfully');
        }
      } catch (err) {
        console.log('Tracks deletion error:', err);
      }
      
      // Step 5: Delete subjects that belong to this family
      // Note: This might fail due to circular foreign key constraints, but that's okay
      // since the child deletion will still succeed
      console.log('Step 5: Attempting to delete subjects...');
      try {
        const { error: subjectsError } = await supabase
          .from('subject')
          .delete()
          .eq('family_id', familyId);

        if (subjectsError) {
          console.log('Subjects deletion failed (expected due to circular constraints):', subjectsError.message);
          console.log('Continuing with child deletion...');
        } else {
          console.log('Subjects deleted successfully');
        }
      } catch (err) {
        console.log('Subjects deletion error (expected):', err);
        console.log('Continuing with child deletion...');
      }
      
      // Step 6: Finally delete the child
      console.log('Step 6: Deleting child record...');
      try {
        const { error: childError } = await supabase
          .from('children')
          .delete()
          .eq('id', childId);

        if (childError) {
          console.log('Child deletion failed:', childError.message);
          throw new Error(childError.message);
        } else {
          console.log('Child deleted successfully');
        }
      } catch (err) {
        console.log('Child deletion error:', err);
        throw err;
      }
      
      console.log('=== DELETE CHILD PROCESS COMPLETED ===');
      
      // Refresh the children list and learning data
      console.log('Refreshing data...');
      await fetchChildren();
      await fetchTodaysLearning();
      
      // Refresh cache for immediate UI updates
      if (familyId) {
        smartRefreshCache(familyId, true).catch(err => console.error('Cache refresh failed:', err));
      }
      
      // Show success notification
      showSuccess('Child and all related data deleted successfully');
      
    } catch (error) {
      console.error('=== DELETE CHILD PROCESS FAILED ===');
      console.error('Error deleting child:', error);
      
      let errorMessage = 'An error occurred while deleting the child';
      if (error.message.includes('foreign key constraint')) {
        errorMessage = 'Cannot delete child because they have associated learning data. Please contact support to remove all related data first.';
      }
      
      // Show error notification
      showError(errorMessage);
    }
  };

  const fetchTodaysLearning = async () => {
    try {
      setLoadingLearning(true)
      
      // Get user's profile to find family_id
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single()

      if (!profile?.family_id) return

      // Get today's date and day of week
      const today = new Date()
      const dayOfWeek = today.getDay() // 0 = Sunday, 1 = Monday, etc.
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const todayName = dayNames[dayOfWeek]

      // Get learning tracks for today
      const { data: tracks, error: tracksError } = await supabase
        .from('subject_track')
        .select('id, name, class_schedule, study_days, roadmap, course_outline, status')
        .eq('family_id', profile.family_id)
        .eq('status', 'active')
      
      if (tracksError) throw tracksError

      // Also fetch track data for the sidebar
      const { data: trackData, error: trackDataError } = await supabase
        .from('subject_track')
        .select('*')
        .eq('family_id', profile.family_id)
      
      if (!trackDataError) {
        setTrack(trackData || []);
      }

      // Filter tracks that are active today
      const todaysTracks = tracks?.filter(track => {
        if (!track.study_days) return false
        return track.study_days.includes(todayName)
      }) || []

      // Group tracks by child
      const learningByChild = children?.map(child => {
        const childTracks = todaysTracks.filter(track => 
          track.name.includes(child.first_name)
        )
        return {
          child,
          tracks: childTracks
        }
      }).filter(item => item.tracks.length > 0)

      setTodaysLearning(learningByChild || [])

      // Also fetch actual scheduled events for today
      const todayStr = today.toISOString().split('T')[0]
      const { data: instances } = await supabase
        .from('events')
        .select('id, title, description, start_ts, status')
        .eq('family_id', profile.family_id)
        .eq('source', 'lesson')
        .gte('start_ts', todayStr + 'T00:00:00')
        .lt('start_ts', todayStr + 'T23:59:59')

      const { data: holidays } = await supabase
        .from('schedule_overrides')
        .select('date, notes, override_kind')
        .eq('scope_type', 'family')
        .eq('scope_id', profile.family_id)
        .eq('override_kind', 'off')
        .eq('date', todayStr)

      const events = []
      ;(instances || []).forEach(i => {
        // Extract time from start_ts timestamp
        const timeFromTs = i.start_ts ? new Date(i.start_ts).toTimeString().slice(0, 5) : null;
        events.push({
          id: i.id,
          type: 'activity',
          title: i.title,
          time: timeFromTs,
          status: i.status,
          description: i.description,
          assignees: (() => { try { const v = JSON.parse(i.child_name || '[]'); return Array.isArray(v) ? v : [v]; } catch { return []; } })()
        })
      })
      ;(holidays || []).forEach(h => {
        events.push({ id: h.id, type: 'holiday', title: h.holiday_name, time: null, status: null, description: h.description })
      })

      // Sort by time (nulls last)
      events.sort((a,b) => {
        if (!a.time && !b.time) return 0
        if (!a.time) return 1
        if (!b.time) return -1
        return String(a.time).localeCompare(String(b.time))
      })
      setTodaysEvents(events)
    } catch (error) {
      console.error('Error fetching today\'s learning:', error)
    } finally {
      setLoadingLearning(false)
    }
  }

  // Update progress when selected child changes
  const updateProgressForChild = async (childId) => {
    if (!childId) {
      // "All Children" view - don't change progress data, let individual cards show their progress
      return
    }
    
    const child = children.find(c => c.id === childId)
    if (child) {
      try {
        // Fetch real progress data from the database
        const { data: progressData, error } = await supabase.rpc('get_child_progress_summary', {
          _child_id: childId,
          _week_start: new Date().toISOString().split('T')[0]
        })
        
        if (error) {
          console.error('Error fetching child progress:', error)
          return
        }
        
        if (progressData) {
          setProgressData(prev => ({ 
            ...prev, 
            percent: progressData.completion_pct || 0,
            totalMinutes: progressData.total_minutes || 0,
            doneMinutes: progressData.done_minutes || 0
          }))
        }
      } catch (error) {
        console.error('Error updating progress for child:', error)
      }
    }
  }

  const fetchChildren = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single()

      if (!profile?.family_id) return

      const { data: childrenData } = await supabase
        .from('children')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('archived', false)

      const { data: archivedData } = await supabase
        .from('children')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('archived', true)

      if (childrenData) {
        setChildren(childrenData)
        // Initialize selectedChildren with all children selected
        setSelectedChildren(childrenData.map(child => child.id))
      }

      if (archivedData) {
        setArchivedChildren(archivedData)
      }
    } catch (error) {
      console.error('Error fetching children:', error)
    }
  }

  const handleRestoreChild = async (childId) => {
    try {
      const { data, error } = await supabase.rpc('restore_child', {
        _family: familyId,
        _child: childId
      });

      if (error || !data?.ok) {
        const reason = data?.reason || 'unknown';
        alert(
          reason === 'forbidden' ? 'You do not have permission' :
          reason === 'not_found' ? 'Child not found' :
          'Failed to restore child'
        );
        return;
      }

      alert('Child restored successfully');
      // Refresh children data
      await fetchChildren();
    } catch (error) {
      console.error('Error restoring child:', error);
      alert('Failed to restore child');
    }
  };

  const fetchFamilyId = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single()

      if (profile?.family_id) {
        setFamilyId(profile.family_id)
      }
    } catch (error) {
      console.error('Error fetching family ID:', error)
    }
  }

  // Load progress once family known
  useEffect(() => {
    if (familyId) {
      loadProgress()
    }
  }, [familyId])

  // Load tasks when filter changes
  useEffect(() => {
    if (familyId) {
      loadTasks()
    }
  }, [familyId, selectedChildId])

  const loadProgress = async () => {
    try {
      const { data: year, error } = await supabase
        .from('family_years')
        .select('start_date,end_date')
        .eq('family_id', familyId)
        .eq('is_current', true)
        .maybeSingle()
      if (error) throw error

      if (year) {
        const start = new Date(year.start_date)
        const end = new Date(year.end_date)
        const todayDate = new Date()
        const totalMs = Math.max(end - start, 1)
        const doneMs = Math.min(Math.max(todayDate - start, 0), totalMs)
        const percent = Math.round((doneMs / totalMs) * 100)
        
        // Set specific progress percentages for Max and Lilly
        let specificPercent = percent
        if (selectedChildId) {
          const child = children.find(c => c.id === selectedChildId)
          if (child) {
                      if (child.first_name === 'Max') {
            specificPercent = 90
          } else if (child.first_name === 'Lilly') {
            specificPercent = 48
          }
          }
        }
        
        setProgressData({
          yearLabel: `${start.getFullYear()}-${end.getFullYear()}` || 'Current Year',
          start: year.start_date,
          end: year.end_date,
          percent: specificPercent,
        })
      } else {
        // Set default progress for "All Children" view - will show individual child progress in cards
        setProgressData({ yearLabel: '2025-2026', start: '2025-08-01', end: '2026-07-31', percent: 0 })
      }
    } catch (e) {
      console.warn('loadProgress failed:', e)
      setProgressData({ yearLabel: '2025-2026', start: '2025-08-01', end: '2026-07-31', percent: 0 })
    }
  }

  const loadTasks = async () => {
    try {
      // If a child selected, find their subject ids first
      let subjectIds = null
      if (selectedChildId) {
        const { data: subs, error: subErr } = await supabase
          .from('subject')
          .select('id')
          .eq('child_id', selectedChildId)
        if (!subErr && subs) subjectIds = subs.map((s) => s.id)
      }

      let query = supabase
        .from('events')
        .select('id, title, subject_id, source, created_at')
        .eq('family_id', familyId)
        .eq('source', 'activity')
        .order('created_at', { ascending: false })
      if (subjectIds && subjectIds.length > 0) {
        query = query.in('subject_id', subjectIds)
      }
      const { data, error } = await query
      if (error) throw error

      if (data && data.length > 0) {
        const buckets = { todo: [], inProgress: [], done: [] }
        data.forEach((a) => {
          // Use the status field directly from events table
          const status = a.status || 'To do'
          if (/done/i.test(status)) buckets.done.push(a)
          else if (/progress|doing|work/i.test(status)) buckets.inProgress.push(a)
          else buckets.todo.push(a)
        })
        setTasksData(buckets)
      } else {
        // placeholders
        setTasksData({
          todo: [{ id: 'p1', name: 'Math worksheet 3' }],
          inProgress: [{ id: 'p2', name: 'Read chapter 2' }],
          done: [{ id: 'p3', name: 'Journal entry' }],
        })
      }
    } catch (e) {
      console.warn('loadTasks failed:', e)
      setTasksData({
        todo: [{ id: 'p1', name: 'Math worksheet 3' }],
        inProgress: [{ id: 'p2', name: 'Read chapter 2' }],
        done: [{ id: 'p3', name: 'Journal entry' }],
      })
    }
  }
  const handleAddChild = async () => {
    if (!addChildName.trim() || !addChildAge.trim() || !addChildGrade.trim()) {
      Alert.alert('Required Fields', 'Please fill in the name, age, and grade fields.')
      return
    }

    setIsAddingChild(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Error', 'User not authenticated')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single()

      if (profileError || !profile?.family_id) {
        Alert.alert('Error', 'Family not found')
      return
    }

      const { data: newChild, error: childError } = await supabase
        .from('children')
        .insert([
          {
            first_name: addChildName.trim(),
            age: parseInt(addChildAge),
            grade: parseInt(addChildGrade),
            interests: addChildInterests.trim() || null,
            standards: addChildStandards.trim() || null,
            learning_style: addChildStyle.trim() || null,
            college_bound: addChildCollegeBound,
            avatar: addChildAvatar,
            family_id: profile.family_id
          }
        ])
        .select()
        .single()

      if (childError) {
        console.error('Error adding child:', childError)
        Alert.alert('Error', 'Failed to add child: ' + childError.message)
        return
      }

      // Reset form
      setAddChildName('')
      setAddChildAge('')
      setAddChildGrade('')
      setAddChildInterests('')
      setAddChildStandards('')
      setAddChildStyle('')
      setAddChildCollegeBound(false)
      setAddChildAvatar('prof1')

      Alert.alert('Success', `${addChildName} has been added successfully!`)
      
      // Refresh children list
      fetchChildren()
      if (onChildAdded) {
        onChildAdded()
      }
    } catch (error) {
      console.error('Error adding child:', error)
      Alert.alert('Error', 'An unexpected error occurred')
    } finally {
      setIsAddingChild(false)
    }
  }

  const handleDoodleMessage = async (message) => {
    try {
      setDoodleLoading(true)
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single();
      
      if (!profile?.family_id) throw new Error('No family_id found for user');
      const familyId = profile.family_id;

      let conversationId = doodleConversationId;
      if (!conversationId) {
        conversationId = await AIConversationService.createConversation(
          familyId,
          'doodlebot',
          'DoodleBot Assistant'
        );
        setDoodleConversationId(conversationId);
      }

      await AIConversationService.addMessage(conversationId, 'user', message);
      
      setDoodleMessages(prev => [...prev, { role: 'user', content: message, timestamp: Date.now() }])
      
      const currentMessageCount = doodleMessages.length;
      if (currentMessageCount === 0) {
        const welcomeMessage = `Hi! I'm Doodle, your fast chat assistant for Learnadoodle! 

I can help you with:
• Quick questions → direct answers
• Log homework/activities → add_activity
• Check recent progress → progress_summary
• Request short-term schedule shifts → queue_reschedule
• Suggest subjects for a child/year
• Suggest courses (live-class, self-paced, custom)

I can see you have ${children.length} child(ren) set up. How can I help you today?`
        
        await AIConversationService.addMessage(conversationId, 'assistant', welcomeMessage);
        setDoodleMessages(prev => [...prev, { role: 'assistant', content: welcomeMessage, timestamp: Date.now() }])
        setDoodleLoading(false)
        return
      }
      
      // Use the new Doodle assistant
      const response = await processDoodleMessage(message, familyId, conversationId);
      
      // Handle tool execution if needed
      if (response.tool) {
        try {
          const toolResult = await executeTool(response.tool, response.params, familyId);
          if (toolResult.success) {
            response.message += `\n\n✅ ${response.tool} completed successfully!`;
          }
        } catch (toolError) {
          console.error('Tool execution error:', toolError);
          response.message += `\n\n❌ Sorry, I couldn't complete that action. Please try again.`;
        }
      }
      
      // Handle fetch requests
      if (response.fetch) {
        if (response.fetch === 'custom-plan') {
          response.message += `\n\n🔄 I'm working on your custom plan. This may take a moment...`;
        } else if (response.fetch === '2-week-plan') {
          response.message += `\n\n📅 I'm generating your 2-week plan. This may take a moment...`;
        }
      }
      
      await AIConversationService.addMessage(conversationId, 'assistant', response.message);
      
      setDoodleMessages(prev => [...prev, { role: 'assistant', content: response.message, timestamp: Date.now() }])
      
    } catch (error) {
      console.error('Error chatting with Doodle:', error)
      const errorMessage = 'Sorry, I encountered an error while processing your request. Please try again.'
      setDoodleMessages(prev => [...prev, { role: 'assistant', content: errorMessage, timestamp: Date.now() }])
    } finally {
      setDoodleLoading(false)
    }
  }

  // If a prompt is passed from the global search bar, send it once
  useEffect(() => {
    if (pendingDoodlePrompt && activeTab === 'search') {
      // Simulate typing into chat and trigger send
      setDoodleInput(pendingDoodlePrompt)
      handleDoodleMessage(pendingDoodlePrompt)
      onConsumeDoodlePrompt && onConsumeDoodlePrompt()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDoodlePrompt, activeTab])

  const handleSendMessage = () => {
    console.log('handleSendMessage called, current input:', doodleInput)
    if (doodleInput.trim()) {
      const messageToSend = doodleInput.trim()
      console.log('Sending message:', messageToSend)
      
      // Clear input immediately
      setDoodleInput('')
      console.log('Input cleared immediately')
      
      // Then handle the message
      handleDoodleMessage(messageToSend)
    }
  }

  // Syllabus upload handlers
  const handleSyllabusProcessed = (syllabusData) => {
    setProcessedSyllabi(prev => [...prev, syllabusData])
    if (onSyllabusProcessed) {
      onSyllabusProcessed(syllabusData)
    }
  }

  const handleOpenSyllabusUpload = () => {
    setShowSyllabusModal(true)
  }

  const handleCloseSyllabusUpload = () => {
    setShowSyllabusModal(false)
  }

  const renderContent = () => {
    // Check if it's a syllabus upload tab for a specific child
    if (activeTab.startsWith('syllabus-upload-')) {
      return renderSyllabusContent()
    }
    
    // Check if it's a to-do list tab for a specific child
    if (activeTab.startsWith('to-do-list-')) {
      return renderToDoListContent()
    }
    
    // Check if it's a projects tab for a specific child
    if (activeTab.startsWith('projects-')) {
      return renderProjectsContent()
    }
    
    // Check if it's a notes page tab for a specific child
    if (activeTab.startsWith('notes-pages-')) {
      return renderNotesContent()
    }
    
    // Check if it's a calendar tab
    if (activeTab === 'calendar') {
      return renderCalendarContent()
    }
    // Planner tab - show CenterPane with view switcher
    if (activeTab === 'planner') {
      return renderPlannerContent()
    }
    // Schedule Rules and AI Planner are now modals, not separate tabs
    // If somehow navigated to these tabs, redirect to calendar
    if (activeTab === 'schedule-rules') {
      return renderCalendarContent()
    }
    if (activeTab === 'ai-planner') {
      return renderCalendarContent()
    }
    if (activeTab === 'notifications') {
      return (
        <View style={styles.content}>
          <Text style={styles.title}>No notifications right now!</Text>
        </View>
      )
    }
    
    switch (activeTab) {
      case 'search':
        return renderSearchContent()
      case 'home':
        // Route to appropriate dashboard based on role
        if (userRole === 'child' && accessibleChildren.length > 0) {
          return <ChildDashboard childId={accessibleChildren[0].id} childName={accessibleChildren[0].name || accessibleChildren[0].first_name} />
        } else if (userRole === 'tutor') {
          return <TutorDashboard accessibleChildren={accessibleChildren} />
        } else {
          return renderHomeContent()
        }
      case 'child-dashboard':
        if (activeSubtab) {
          const child = accessibleChildren.find(c => c.id === activeSubtab);
          return <ChildDashboard childId={activeSubtab} childName={child?.name || child?.first_name} />
        }
        return accessibleChildren.length > 0 ? (
          <ChildDashboard childId={accessibleChildren[0].id} childName={accessibleChildren[0].name || accessibleChildren[0].first_name} />
        ) : renderHomeContent()
      case 'tutor-dashboard':
        return <TutorDashboard accessibleChildren={accessibleChildren} />
      case 'explore':
        return <ExploreContent familyId={familyId} children={children} />
      case 'inspire-learning':
      case 'inspire':
        return (
          <View style={styles.content}>
            <InspireLearning 
              familyId={familyId}
              children={children}
            />
          </View>
        )
      case 'add-child':
        // Add child is now a modal, redirect to home or children list
        return activeSubtab ? renderChildrenListContent() : renderHomeContent()
      case 'add-options':
        // Deprecated screen: route to Home content instead
        return renderHomeContent()
      case 'add-activity':
        return renderAddActivityContent()

      case 'syllabus':
        return renderSyllabusContent()
      case 'documents':
        return renderDocumentsContent()
      case 'children-list':
        return renderChildrenListContent()
      case 'lesson-plans':
        return renderLessonPlansContent()
      case 'attendance':
      case 'reports':
      case 'records':
        return renderRecordsContent()
      case 'integrations':
      case 'settings':
        return <IntegrationsSettings user={user} />
      case 'templates':
      case 'syllabi':
      case 'imports':
      case 'doodle-ai':
        return renderComingSoonContent()
      case 'calendar-planning':
        return renderCalendarPlanningContent()
      case 'kanban':
        return renderComingSoonContent()
      default:
        // Default routing based on role
        if (userRole === 'child' && accessibleChildren.length > 0) {
          return <ChildDashboard childId={accessibleChildren[0].id} childName={accessibleChildren[0].name || accessibleChildren[0].first_name} />
        } else if (userRole === 'tutor') {
          return <TutorDashboard accessibleChildren={accessibleChildren} />
        } else {
          return renderHomeContent()
        }
    }
  }

  const renderSearchContent = () => {
    return (
      <View style={styles.content}>
        <Text style={styles.title}>Ask Doodle</Text>
        <Text style={styles.subtitle}>Your fast chat assistant for Learnadoodle</Text>
        
        <View style={styles.chatContainer}>
          <View style={styles.messagesContainer}>
            {doodleMessages.length === 0 ? (
              <View style={styles.welcomeMessage}>
                <Text style={styles.welcomeTitle}>Hi! I'm Doodle 🤖</Text>
                <Text style={styles.welcomeText}>
                  Your fast chat assistant for Learnadoodle. I can help you with:
                </Text>
                <Text style={styles.welcomeBullet}>• Quick questions → direct answers</Text>
                <Text style={styles.welcomeBullet}>• Log homework/activities → add_activity</Text>
                <Text style={styles.welcomeBullet}>• Check recent progress → progress_summary</Text>
                <Text style={styles.welcomeBullet}>• Request short-term schedule shifts → queue_reschedule</Text>
                <Text style={styles.welcomeBullet}>• Suggest subjects for a child/year</Text>
                <Text style={styles.welcomeBullet}>• Suggest courses (live-class, self-paced, custom)</Text>
                <Text style={styles.welcomeText}>
                  I can see you have {children.length} child(ren) set up. How can I help you today?
                </Text>
        </View>
            ) : (
              doodleMessages.map((message, index) => (
                <View key={`doodle-${message.role}-${index}-${message.content.substring(0, 10)}`} style={[
                  styles.message,
                  message.role === 'user' ? styles.userMessage : styles.assistantMessage
                ]}>
                  <Text style={styles.messageText}>{message.content}</Text>
      </View>
              ))
            )}
            {doodleLoading && (
              <View style={styles.loadingMessage}>
                <Text style={styles.loadingText}>Doodle is thinking...</Text>
        </View>
            )}
      </View>
          
          <View style={styles.inputContainer}>
        <TextInput
              style={styles.chatInput}
              placeholder="Ask me anything about your family's learning..."
              value={doodleInput}
              onChangeText={setDoodleInput}
              multiline
              onSubmitEditing={handleSendMessage}
              onKeyPress={(e) => {
                if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                  handleSendMessage();
                }
              }}
            />
          <TouchableOpacity
              style={[styles.sendButton, !doodleInput.trim() && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={!doodleInput.trim() || doodleLoading}
          >
              <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
        </View>
      </View>
    )
  }

  const renderHomeContent = () => {
    if (homeLoading || !homeData) {
      return (
        <View style={styles.content}>
          <View style={styles.greetingSection}>
            <Text style={styles.greetingTitle}>{getTimeBasedGreeting()}</Text>
          </View>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      );
    }

    return (
      <View style={styles.content}>
        {/* Time-based Greeting */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingTitle}>{getTimeBasedGreeting()}</Text>
        </View>

        {/* Stories Row (Flo-style) */}
        <StoriesRow 
          stories={homeData.stories || []} 
          currentDate={homeData.date ? new Date(homeData.date) : new Date()}
          onGenerateTips={() => onTabChange('ai-planner')}
          onStoryAction={(story) => {
            console.log('Story action:', story);
            // Handle CTA stories
            if (story.kind === 'cta-goals') {
              setSubjectGoalsModalOpen(true);
            } else if (story.kind === 'cta-backlog') {
              // Store intent to open backlog in sessionStorage for planner to check
              if (typeof window !== 'undefined') {
                sessionStorage.setItem('openBacklogDrawer', 'true');
                console.log('Set sessionStorage flag for backlog drawer');
              }
              console.log('Switching to planner tab');
              onTabChange('planner');
              // Also dispatch event as fallback (wait for component to mount)
              setTimeout(() => {
                if (typeof window !== 'undefined') {
                  console.log('Dispatching openBacklogDrawer event');
                  window.dispatchEvent(new CustomEvent('openBacklogDrawer'));
                }
              }, 500);
            } else if (story.kind === 'planner' || story.kind === 'tip') {
              onTabChange('ai-planner');
            } else if (story.kind === 'event') {
              onTabChange('add-activity');
            } else if (story.kind === 'article') {
              // Open article link
              console.log('Open article:', story.title);
            }
          }}
        />

        {/* Next Up Tile */}
        <NextUpTile 
          nextEvent={homeData.next_event}
          onOpenSyllabus={handleOpenSyllabus}
          onAIPlan={() => onTabChange('ai-planner')}
        />

        {/* Main Content Grid */}
        <View style={styles.homeGrid}>
          <View style={styles.homeMainColumn}>
            <TodaysLearning 
              children={homeData.children || []}
              learning={homeData.learning || []}
              availability={homeData.availability || []}
              currentDate={homeData.date ? new Date(homeData.date) : new Date()}
              onDateChange={async (newDate) => {
                console.log('Date changed to:', newDate);
                // Refetch home data for the new date
                try {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) return;
                  
                  const { data: profile } = await supabase
                    .from('profiles')
                    .select('family_id')
                    .eq('id', user.id)
                    .maybeSingle();
                  
                  if (profile?.family_id) {
                    const dateStr = newDate.toISOString().split('T')[0];
                    const { data, error } = await supabase.rpc('get_home_data', {
                      _family_id: profile.family_id,
                      _date: dateStr,
                      _horizon_days: 14,
                    });
                    
                    if (!error && data) {
                      // Merge with existing homeData but update learning for the new date
                      setHomeData({
                        ...homeData,
                        ...data,
                        date: dateStr
                      });
                    }
                  }
                } catch (err) {
                  console.error('Error fetching home data for date:', err);
                }
              }}
              onAddLesson={(childId) => {
                console.log('Add lesson for child:', childId);
                onTabChange('add-activity');
              }}
              onAIPlanDay={(childId) => {
                console.log('AI plan day for child:', childId);
                onTabChange('ai-planner');
              }}
            />
            
            <TasksToday 
              tasks={homeData.tasks || []}
              onAddTask={() => onTabChange('add-activity')}
              onToggleTask={(taskId) => console.log('Toggle task:', taskId)}
              onGenerateTasks={() => {
                console.log('Generate 3 quick tasks from subjects');
                // TODO: Implement AI task generation
              }}
            />
          </View>
          
          <View style={styles.homeSideColumn}>
            <DailyInsights 
              onGeneratePlan={() => onTabChange('ai-planner')}
              onViewProgress={() => onTabChange('records')}
            />
            
            <UpcomingBigEvents 
              events={homeData.events || []}
              onAddToCalendar={(event) => {
                console.log('Add to calendar:', event);
              }}
              onAddTravelBlock={(event) => {
                console.log('Add travel/prep block for:', event);
                onTabChange('add-activity');
              }}
            />
            
            <RecommendedReads />
            
            <InspireLearning 
              familyId={familyId}
              children={children}
            />
          </View>
        </View>
      </View>
    );
  };

  // Legacy home content helpers (can be removed)
  const renderLegacyHomeContent = () => {
    return (
      <View style={styles.content}>
        {/* Old home content - keeping for reference but not using */}
        {/* Upcoming Events Block */}
        <View style={styles.upcomingEventsSection}>
          <Text style={styles.upcomingEventsCaption}>Upcoming events</Text>
          <View style={styles.upcomingEventsBlock}>
            <View style={styles.upcomingEventsContent}>
            {/* Feature Promotion Section */}
            <View style={styles.featurePromotion}>
              <Text style={styles.featureTitle}>Connect Google & Apple Calendar with Learnadoodle</Text>
              <Text style={styles.featureDescription}>Sync your existing calendars and keep all your events organized in one place.</Text>
              <View style={styles.connectButtonsContainer}>
                <TouchableOpacity style={styles.connectButton}>
                  <Image 
                    source={require('../assets/google.png')} 
                    style={styles.logoIcon}
                    resizeMode="contain"
                  />
                  <Text style={styles.connectButtonText}>Continue with Google</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.connectButton}>
                  <Image 
                    source={require('../assets/apple.png')} 
                    style={styles.appleLogoIcon}
                    resizeMode="contain"
                  />
                  <Text style={styles.connectButtonText}>Continue with Apple</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Upcoming Events List */}
            <View style={styles.upcomingEventsList}>
              {todaysEvents.length > 0 ? (
                todaysEvents.slice(0, 2).map((evt, index) => (
                  <View key={evt.id} style={styles.eventItem}>
                    <View style={styles.eventDate}>
                      <Text style={styles.eventDay}>
                        {index === 0 ? 'Today' : 'Tomorrow'}
                </Text>
                      <Text style={styles.eventDateNumber}>
                        {new Date(evt.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                    <View style={styles.eventDetails}>
                      <Text style={styles.eventTitle}>{evt.title}</Text>
                      <Text style={styles.eventTimeLocation}>
                        {evt.time ? `${String(evt.time).slice(0,5)} · Home` : 'All day · Home'}
                      </Text>
                      {index === 0 && (
                        <TouchableOpacity style={styles.joinButton}>
                          <Text style={styles.joinButtonText}>Track progress</Text>
              </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.noEventsContainer}>
                  <Text style={styles.noEventsText}>No events scheduled</Text>
              <TouchableOpacity
                    style={styles.addEventButton}
            onPress={() => {
                      setShowHomeEventModal(true);
                      setHomeEventType('lesson');
                      const today = new Date();
                      const mm = String(today.getMonth() + 1).padStart(2, '0');
                      const dd = String(today.getDate()).padStart(2, '0');
                      const yy = String(today.getFullYear()).slice(-2);
                      setHomeEventFormData(prev => ({
                        ...prev,
                        scheduledDate: `${mm}/${dd}/${yy}`
                      }));
                    }}
                  >
                    <Text style={styles.addEventButtonText}>Add new events</Text>
          </TouchableOpacity>
      </View>
          )}
            </View>
          </View>
        </View>
        </View>







        {/* Tasks Block */}
        <View style={styles.tasksSection}>
          <Text style={styles.tasksCaption}>Tasks</Text>
          <View style={styles.tasksBlock}>
            <View style={styles.tasksContent}>
              {/* Task Items */}
              <View style={styles.taskItem}>
                <View style={styles.taskCheckbox}>
                  <View style={styles.taskCheckboxInner} />
                    </View>
                <View style={styles.taskDetails}>
                  <Text style={styles.taskTitle}>Complete Math Lesson</Text>
                  <Text style={styles.taskSubtitle}>Due tomorrow at 3:00 PM</Text>
                  </View>
                <View style={styles.taskBadge}>
                  <Text style={styles.taskBadgeText}>To Do</Text>
                    </View>
                    </View>

              <View style={styles.taskItem}>
                <View style={styles.taskCheckbox}>
                  <View style={styles.taskCheckboxInner} />
                  </View>
                <View style={styles.taskDetails}>
                  <Text style={styles.taskTitle}>Writing Assignment</Text>
                  <Text style={styles.taskSubtitle}>Due Friday</Text>
            </View>
                <View style={styles.taskBadge}>
                  <Text style={styles.taskBadgeText}>To Do</Text>
        </View>
              </View>

              <View style={styles.taskItem}>
                <View style={styles.taskCheckboxChecked}>
                  <View style={styles.taskCheckboxCheckedInner}>
                    <Text style={styles.taskCheckboxIcon}>✓</Text>
                  </View>
                </View>
                <View style={styles.taskDetails}>
                  <Text style={styles.taskTitleChecked}>Science Project</Text>
                  <Text style={styles.taskSubtitle}>Due next week</Text>
                </View>
                <View style={styles.taskBadgeDone}>
                  <Text style={styles.taskBadgeTextDone}>Done</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Pinned Items Block - removed per request */}

        {/* Empty State */}
        {children.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Welcome to Learnadoodle!</Text>
            <Text style={styles.emptySubtitle}>
              Get started by adding your first child and setting up your learning environment
            </Text>
        <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => onTabChange('add-child')}
        >
              <Text style={styles.primaryButtonText}>Add Your First Child</Text>
        </TouchableOpacity>
        </View>
      )}

      {/* Student Details Modal */}
      <StudentDetailsModal
        visible={showStudentModal}
        student={selectedStudent}
        onClose={handleCloseStudentModal}
        onDelete={handleDeleteChild}
      />
      

      </View>
    )
  }

  const renderAddChildContent = () => {
    return (
      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
          <Text style={styles.title}>Family Setup</Text>
          <Text style={styles.subtitle}>Complete your family profile and learning preferences</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add Children</Text>
            <Text style={styles.sectionSubtitle}>Enter each child's information</Text>

            <AddChildForm
              submitting={isAddingChild}
              onSubmit={async (payload) => {
                setIsAddingChild(true)
                try {
                  const { data: { user } } = await supabase.auth.getUser()
                  if (!user) throw new Error('Not authenticated')
                  const { data: profile } = await supabase
                    .from('profiles')
                    .select('family_id')
                    .eq('id', user.id)
                    .single()
                  if (!profile?.family_id) throw new Error('Family not found')

                  const insert = {
                    name: payload.first_name,
                    age: payload.age,
                    grade: payload.grade,
                    interests: payload.interests,
                    standards: payload.standards,
                    learning_style: payload.learning_style,
                    college_bound: payload.college_bound,
                    avatar: payload.avatar,
                    family_id: profile.family_id,
                  }

                  const { data: inserted, error } = await supabase.from('children').insert(insert).select().single()
                  if (error) throw error

                  // refresh
                  await fetchChildren()
                  setShowSubjectSelectForChild(inserted)
                  Alert.alert('Success', `${payload.first_name} has been added! Now pick subjects…`)
                } catch (e) {
                  console.error('Add child failed:', e)
                  Alert.alert('Error', e.message || 'Failed to add child')
                } finally {
                  setIsAddingChild(false)
                }
              }}
            />

            {children.length > 0 && (
              <View style={styles.childrenList}>
                <Text style={styles.sectionTitle}>Added Children:</Text>
                {children.map((child, index) => (
                  <View key={`child-${child.id}-${index}`} style={styles.childCard}>
                    <View style={styles.childCardHeader}>
                      <Image source={getAvatarSource(child.avatar)} style={styles.childAvatar} resizeMode="contain" />
                      <View style={styles.childInfo}>
                        <Text style={styles.childName}>{child.first_name}</Text>
                        <Text style={styles.childDetails}>Age: {child.age} | Grade: {child.grade}</Text>
        </View>
      </View>
            </View>
          ))}
        </View>
      )}

            {showSubjectSelectForChild && (
              <Modal visible animationType="slide" onRequestClose={() => setShowSubjectSelectForChild(null)}>
                <View style={{ flex: 1, backgroundColor: '#fff' }}>
                  <SubjectSelectForm
                    child={showSubjectSelectForChild}
                    onClose={() => setShowSubjectSelectForChild(null)}
                    onSaved={() => {
                      setShowSubjectSelectForChild(null)
                      Alert.alert('Subjects saved', 'Great! Let\'s set up your academic year next.');
                      onTabChange && onTabChange('calendar')
                    }}
                  />
      </View>
              </Modal>
        )}
    </View>
        </View>
      </ScrollView>
  )
  }
  const renderDocumentsContent = () => {
    return (
      <UploadsEnhanced familyId={familyId} initialChildren={children} />
    )
  }

  const renderChildrenListContent = () => {
    // If activeSubtab is set, show child profile
    if (activeSubtab) {
      const child = children.find(c => c.id === activeSubtab);
      if (child) {
        return (
          <View style={{ flex: 1, backgroundColor: colors.bgSubtle }}>
            <ChildProfile
              childId={child.id}
              childName={child.first_name}
              familyId={familyId}
              activeChildSection={activeChildSection || 'overview'}
              onBack={() => {
                console.log('Back to children list');
                onSubtabChange?.(null);
              }}
              onDeleted={() => {
                console.log('Child deleted, returning to children list');
                onSubtabChange?.(null);
                // Refresh children list
                setTimeout(() => {
                  window.location.reload();
                }, 500);
              }}
              onAITopOff={(params) => {
                console.log('AI top-off:', params);
                // Set URL params for AI planner
                if (typeof window !== 'undefined') {
                  const urlParams = new URLSearchParams();
                  urlParams.set('ai_topoff_for_subject', params.subject);
                  urlParams.set('minutes_needed', params.minutesNeeded.toString());
                  urlParams.set('plan_for_child', params.childId);
                  window.history.replaceState({}, '', `?${urlParams.toString()}`);
                }
                onTabChange('ai-planner');
              }}
              onEditGoal={(goal) => {
                console.log('Edit goal:', goal);
                // TODO: Open goal edit modal
              }}
              onAddGoal={() => {
                console.log('Add goal for child:', child.id);
                // TODO: Open goal add modal
              }}
              onEditInfo={() => {
                console.log('Edit child info:', child.id);
                // TODO: Open edit child modal
              }}
              onAISummary={() => {
                console.log('Generate AI summary for:', child.id);
                // TODO: Call AI summary API
              }}
              onPlanYear={() => {
                // Trigger year wizard from parent (WebLayout)
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('openYearWizard'));
                }
              }}
              onOpenPlanner={(params) => {
                console.log('Open planner for next week:', params);
                // Set URL params for AI planner
                if (typeof window !== 'undefined') {
                  const urlParams = new URLSearchParams();
                  urlParams.set('plan_for_child', params.childId);
                  urlParams.set('week', params.weekStart);
                  window.history.replaceState({}, '', `?${urlParams.toString()}`);
                }
                onTabChange('ai-planner');
              }}
            />
          </View>
        );
      }
    }

    const childrenActions = [
      { 
        label: 'Add Child', 
        icon: Plus, 
        primary: true,
        onPress: () => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('openAddChildModal'));
          }
        }
      },
      { 
        label: 'Import Roster', 
        icon: Upload,
        onPress: () => {
          if (Platform.OS === 'web') {
            window.alert('Import roster coming soon!');
          }
        }
      },
    ];

    return (
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <PageHeader
          title="Children"
          subtitle="Manage your children and their learning profiles"
          actions={childrenActions}
        />
        
        <ScrollView style={{ flex: 1, paddingVertical: 32, minHeight: 0 }}>
          {/* Show Archived Toggle */}
          {archivedChildren.length > 0 && (
            <View style={styles.archivedToggle}>
              <TouchableOpacity
                style={styles.toggleButton}
                onPress={() => setShowArchived(!showArchived)}
              >
                <Text style={styles.toggleText}>
                  {showArchived ? '✓' : '○'} Show archived ({archivedChildren.length})
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Active Children */}
          {children.length > 0 && (
            <View style={styles.childrenGrid}>
              {children.map(child => (
                <TouchableOpacity 
                  key={child.id} 
                  style={styles.childCard}
                  onPress={() => {
                    // Navigate to child profile
                    onSubtabChange?.(child.id);
                  }}
                >
                  <Text style={styles.childName}>{child.first_name}</Text>
                  <Text style={styles.childDetails}>
                    Age: {child.age} | Grade: {child.grade}
                  </Text>
                  <Text style={styles.viewProfile}>View Profile →</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Archived Children */}
          {showArchived && archivedChildren.length > 0 && (
            <View style={styles.archivedSection}>
              <Text style={styles.archivedSectionTitle}>Archived Children</Text>
              <View style={styles.childrenGrid}>
                {archivedChildren.map(child => (
                  <View key={child.id} style={styles.archivedChildCard}>
                    <View style={styles.archivedChildInfo}>
                      <Text style={styles.archivedChildName}>{child.first_name}</Text>
                      <Text style={styles.archivedChildDetails}>
                        Age: {child.age} | Grade: {child.grade}
                      </Text>
                      <View style={styles.archivedBadge}>
                        <Text style={styles.archivedBadgeText}>Archived</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.restoreButton}
                      onPress={() => handleRestoreChild(child.id)}
                    >
                      <Text style={styles.restoreButtonText}>Restore</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Empty State */}
          {children.length === 0 && archivedChildren.length === 0 && (
            <View style={{ alignItems: 'center', padding: 64 }}>
              <Text style={{ fontSize: 16, color: '#6b7280', marginBottom: 16 }}>No children added yet</Text>
              <TouchableOpacity
                style={styles.button}
                onPress={() => onTabChange('add-child')}
              >
                <Text style={styles.buttonText}>+ Add Your First Child</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    )
  }

  const renderLessonPlansContent = () => {
    return <LessonPlans familyId={familyId} initialPlans={[]} children={children} />;
  }

  const renderRecordsContent = () => {
    // Phase 4: Use new comprehensive Records component
    // Fallback to old attendance/reports views if subtab is specified
    if (activeSubtab === 'attendance') {
      return <Attendance familyId={familyId} />;
    } else if (activeSubtab === 'reports') {
      return <Reports familyId={familyId} />;
    }

    // Default: Show Phase 4 Records component
    return <RecordsPhase4 familyId={familyId} />;
  }

  const renderComingSoonContent = () => {
    return (
      <View style={styles.content}>
        <Text style={styles.title}>Coming Soon</Text>
        <Text style={styles.subtitle}>This feature is under development</Text>
        <View style={{ alignItems: 'center', padding: 60 }}>
          <Text style={{ fontSize: 16, color: '#6b7280', textAlign: 'center' }}>
            We're working on this feature. Check back soon!
          </Text>
        </View>
      </View>
    )
  }

  const renderSyllabusContent = () => {
    return (
      <View style={styles.content}>
        <Text style={styles.title}>Upload Syllabus</Text>
        <Text style={styles.subtitle}>Convert raw syllabus text into clean Markdown</Text>
        
        <View style={styles.syllabusSection}>
          <Text style={styles.sectionTitle}>Course Syllabus Processing</Text>
          <Text style={styles.sectionSubtitle}>
            Upload your course syllabus to convert it into clean, structured Markdown format using AI.
          </Text>
          
            <TouchableOpacity
            style={styles.button}
            onPress={handleOpenSyllabusUpload}
            >
            <Text style={styles.buttonText}>Upload Syllabus</Text>
            </TouchableOpacity>

          {/* Display processed syllabi */}
          {processedSyllabi.length > 0 && (
            <View style={styles.processedSyllabiSection}>
              <Text style={styles.sectionTitle}>Processed Syllabi</Text>
              {processedSyllabi.map((syllabus, index) => (
                <View key={`syllabus-${syllabus.course_title}-${index}`} style={styles.syllabusCard}>
                  <Text style={styles.syllabusTitle}>{syllabus.course_title}</Text>
                  <Text style={styles.syllabusProvider}>{syllabus.provider_name}</Text>
                  {syllabus.unit_start && (
                    <Text style={styles.syllabusUnit}>Starting from Unit {syllabus.unit_start}</Text>
                  )}
                  <Text style={styles.syllabusPreview} numberOfLines={3}>
                    {syllabus.course_outline}
                </Text>
        </View>
              ))}
            </View>
          )}
        </View>


      </View>
    )
  }

  const renderToDoListContent = () => {
    return (
      <View style={styles.content}>
        <Text style={styles.title}>To-Do List</Text>
        <Text style={styles.subtitle}>Manage tasks and assignments</Text>
        
        <View style={styles.comingSoonSection}>
          <Text style={styles.comingSoonTitle}>To-Do List Coming Soon</Text>
          <Text style={styles.comingSoonText}>
            We're working on a comprehensive to-do list feature that will help you track tasks, assignments, and learning activities for each child.
          </Text>
        </View>
      </View>
    )
  }

  const renderProjectsContent = () => {
    return (
      <View style={styles.content}>
        <Text style={styles.title}>Projects</Text>
        <Text style={styles.subtitle}>Track and manage learning projects</Text>
        
        <View style={styles.comingSoonSection}>
          <Text style={styles.comingSoonTitle}>Projects Page Coming Soon</Text>
          <Text style={styles.comingSoonText}>
            Our projects feature will help you organize and track long-term learning projects, research assignments, and creative activities.
          </Text>
        </View>
      </View>
    )
  }

  const renderNotesContent = () => {
    return (
      <View style={styles.content}>
        <Text style={styles.title}>Notes Pages</Text>
        <Text style={styles.subtitle}>Create and organize learning notes</Text>
        
        <View style={styles.comingSoonSection}>
          <Text style={styles.comingSoonTitle}>Notes Page Coming Soon</Text>
          <Text style={styles.comingSoonText}>
            A powerful notes system is in development that will allow you to create, organize, and share learning notes for each subject and child.
          </Text>
        </View>
      </View>
    )
  }

    // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarEvents, setCalendarEvents] = useState({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  
  // Web-compatible alert function
  const showAlert = (title, message) => {
    if (typeof window !== 'undefined' && window.alert) {
      // Web environment
      window.alert(`${title}\n\n${message}`);
    } else {
      // React Native environment
      Alert.alert(title, message, [{ text: 'OK' }]);
    }
  };

  const getMonthKeyFromIso = (isoString) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${date.getMonth()}`;
  };

  const monthKeyToDate = (monthKey) => {
    if (!monthKey) return null;
    const [yearStr, monthStr] = monthKey.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (Number.isNaN(year) || Number.isNaN(month)) return null;
    return new Date(year, month, 1);
  };





      


  // Handle event completion (mark as done + optionally open outcome modal)
  const handleEventComplete = async (event) => {
    if (!event?.id) return;
    
    // Optimistically update the UI immediately
    setCalendarEvents(prevEvents => {
      const updated = { ...prevEvents };
      Object.keys(updated).forEach(dateKey => {
        updated[dateKey] = updated[dateKey].map(ev => 
          ev.id === event.id ? { ...ev, status: 'done' } : ev
        );
      });
      return updated;
    });
    
    try {
      const { completeEvent } = await import('../lib/services/attendanceClient');
      const result = await completeEvent(event.id);
      
      if (result.error) {
        console.error('[WebContent] Error completing event:', result.error);
        // Revert optimistic update on error
        setCalendarEvents(prevEvents => {
          const reverted = { ...prevEvents };
          Object.keys(reverted).forEach(dateKey => {
            reverted[dateKey] = reverted[dateKey].map(ev => 
              ev.id === event.id ? { ...ev, status: event.status || 'scheduled' } : ev
            );
          });
          return reverted;
        });
        if (Platform.OS === 'web') {
          alert(`Failed to complete event: ${result.error.message || result.error}`);
        }
        return;
      }
      
      // Refresh calendar to ensure we have the latest data from server
      if (refreshCalendarDataRef.current) {
        refreshCalendarDataRef.current().catch(err => console.error('Calendar refresh failed:', err));
      } else {
        // Fallback: dispatch refresh event
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshCalendar'));
        }
      }
      
      // Optionally prompt for outcome (for now, just complete silently)
      // User can click on completed event later to add reflection
    } catch (error) {
      console.error('[WebContent] Exception completing event:', error);
      // Revert optimistic update on error
      setCalendarEvents(prevEvents => {
        const reverted = { ...prevEvents };
        Object.keys(reverted).forEach(dateKey => {
          reverted[dateKey] = reverted[dateKey].map(ev => 
            ev.id === event.id ? { ...ev, status: event.status || 'scheduled' } : ev
          );
        });
        return reverted;
      });
      if (Platform.OS === 'web') {
        alert(`Error: ${error.message || 'Unknown error'}`);
      }
    }
  };

  // Fetch real calendar events from Supabase
  const handleEventSelect = (event) => {
    setShowNewEventForm(false);
    setShowTaskModal(false);
    setEventModalVisible(true);
    setEventModalEventId(event?.id || null);
    if (event) {
      setEventModalInitialEvent({
        id: event.id,
        title: event.title,
        description: event.description || event.data?.description || '',
        status: event.status || event.data?.status,
        start_ts: event.start_ts || event.start || event.data?.start_ts || event.data?.start,
        end_ts: event.end_ts || event.end || event.data?.end_ts || event.data?.end,
        child_id: event.childId || event.child_id || event.data?.child_id,
        tags: event.tags || event.data?.tags,
        source: event.source || event.data?.source,
      });
    } else {
      setEventModalInitialEvent(null);
    }
    setSelectedEvent(null);
    setIsEditingEvent(false);
    setEditedEventData({
      title: event?.title,
      childName: event?.childName,
      time: event?.time,
      type: event?.type,
      date: event?.date,
      location: event?.location || '',
      notes: event?.notes || ''
    });
  }

  const handleEventModalPatched = async (patch) => {
    if (!patch) return;
    const eventId = patch.id || eventModalEventId;
    if (!eventId) return;

    const previousStart =
      patch.previous_start_ts ||
      eventModalInitialEvent?.start_ts ||
      eventModalInitialEvent?.start ||
      eventModalInitialEvent?.data?.start_ts ||
      null;

    const newStart =
      patch.start_ts ||
      eventModalInitialEvent?.start_ts ||
      eventModalInitialEvent?.start ||
      previousStart;

    setEventModalInitialEvent((prev) => {
      const base = prev ? { ...prev } : {};
      return { ...base, ...patch, id: eventId };
    });

    const monthKeysToRefresh = new Set();
    const prevMonthKey = getMonthKeyFromIso(previousStart);
    if (prevMonthKey) {
      monthKeysToRefresh.add(prevMonthKey);
    }
    const newMonthKey = getMonthKeyFromIso(newStart);
    if (newMonthKey) {
      monthKeysToRefresh.add(newMonthKey);
    }

    if (monthKeysToRefresh.size === 0) {
      monthKeysToRefresh.add(`${currentMonth.getFullYear()}-${currentMonth.getMonth()}`);
    }

    const refreshPromises = Array.from(monthKeysToRefresh)
      .map((key) => monthKeyToDate(key))
      .filter(Boolean)
      .map((date) => refreshCalendarData(date));

    if (refreshPromises.length > 0) {
      await Promise.all(refreshPromises);
    }
  };

  const handleEditEvent = () => {
    setIsEditingEvent(true)
  }

  // Context menu functions
  const handleCalendarDayRightClick = (dateKey, nativeEvent) => {
    if (typeof window !== 'undefined' && nativeEvent) {
      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      
      // Remove any existing context menu
      const existingMenu = document.getElementById('context-menu');
      if (existingMenu) {
        existingMenu.remove();
      }
      
      const menu = document.createElement('div');
      menu.id = 'context-menu';
      menu.style.cssText = `
        position: fixed;
        top: ${nativeEvent.clientY}px;
        left: ${nativeEvent.clientX}px;
        background-color: #ffffff;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
        z-index: 999999;
        min-width: 200px;
        padding: 8px 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      
      // Build menu items based on whether we have cut/copied data
      const menuItems = [];
      
      if (cutEventData) {
        menuItems.push({ text: 'Paste Event', action: () => handlePasteEvent(dateKey) });
      }
      
      menuItems.push({ text: 'Create New Event', action: () => handleCreateNewEvent(dateKey) });
      
      menuItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.style.cssText = `
          padding: 16px 24px;
          color: #374151;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          border-bottom: ${index < menuItems.length - 1 ? '1px solid #f3f4f6' : 'none'};
          display: flex;
          align-items: center;
          gap: 16px;
        `;
        
        // Add hover effect
        div.addEventListener('mouseenter', () => {
          div.style.backgroundColor = '#f8fafc';
          div.style.color = '#1f2937';
        });
        
        div.addEventListener('mouseleave', () => {
          div.style.backgroundColor = 'transparent';
          div.style.color = '#374151';
        });
        
        div.textContent = item.text;
        
        div.addEventListener('click', () => {
          console.log(`${item.text} clicked for date: ${dateKey}`);
          item.action();
          menu.remove();
        });
        menu.appendChild(div);
      });
      
      document.body.appendChild(menu);
      console.log('Calendar day context menu created for date:', dateKey);
      
      // Close menu when clicking elsewhere
      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 100);
    }
  };

  const handleRightClick = (event, nativeEvent) => {
    console.log('handleRightClick called with:', event.title, nativeEvent);
    if (typeof window !== 'undefined' && nativeEvent) {
      nativeEvent.preventDefault();
      console.log('Setting context menu at position:', nativeEvent.clientX, nativeEvent.clientY);
      
      // Create context menu directly in DOM
      const existingMenu = document.getElementById('context-menu');
      if (existingMenu) {
        existingMenu.remove();
      }
      
      const menu = document.createElement('div');
      menu.id = 'context-menu';
      menu.style.cssText = `
        position: fixed;
        top: ${nativeEvent.clientY}px;
        left: ${nativeEvent.clientX}px;
        background-color: #ffffff;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
        z-index: 999999;
        min-width: 200px;
        padding: 8px 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      
      const menuItems = [];
      
      // All holidays in the calendar come from the holidays table (which includes both
      // selected global holidays and custom family holidays), so they should all be editable
      // The global_official_holidays table is just the master list used during onboarding
      const isGlobalHoliday = false; // All holidays in calendar are family-managed
      
      // Only show Edit for non-global holidays
      if (!isGlobalHoliday) {
        menuItems.push({ text: 'Edit Event', action: () => handleContextEditEvent(event) });
      }
      
      // Show Cut/Copy/Duplicate for all events (lessons, activities, and holidays)
      // since all holidays in the calendar are family-managed
      if (event.type !== 'holiday') {
        menuItems.push(
          { text: 'Cut Event', action: () => handleCutEvent(event) },
          { text: 'Copy Event', action: () => handleCopyEvent(event) },
          { text: 'Duplicate Event', action: () => handleDuplicateEvent(event) }
        );
      } else if (event.type === 'holiday') {
        // Holidays don't have track/activity data needed for cut/copy, but we can still duplicate
        menuItems.push(
          { text: 'Duplicate Event', action: () => handleDuplicateEvent(event) }
        );
      }
      
      // Only show Delete for non-global holidays
      if (!isGlobalHoliday) {
        menuItems.push({ text: 'Delete Event', action: () => handleDeleteEvent(event), isDelete: true });
      }
      
      // Add rebalance option if event has year_plan_id (from year plan seeding)
      if (event.year_plan_id) {
        menuItems.push({ 
          text: 'Rebalance subject from here...', 
          action: () => {
            setRebalanceEvent(event);
            setRebalanceYearPlanId(event.year_plan_id);
            setShowRebalanceModal(true);
          }
        });
      }
      
      // If no menu items are available (global holiday), show informational message
      if (menuItems.length === 0) {
        menuItems.push({ text: 'Global holidays cannot be modified', action: () => {}, isDisabled: true });
      }
      
      menuItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.style.cssText = `
          padding: 16px 24px;
          color: ${item.isDisabled ? '#9ca3af' : (item.isDelete ? '#dc2626' : '#374151')};
          font-size: 15px;
          font-weight: 500;
          cursor: ${item.isDisabled ? 'default' : 'pointer'};
          transition: all 0.15s ease;
          border-bottom: ${index < menuItems.length - 1 ? '1px solid #f3f4f6' : 'none'};
          display: flex;
          align-items: center;
          gap: 16px;
        `;
        
        // Add hover effect only for non-disabled items
        if (!item.isDisabled) {
          div.addEventListener('mouseenter', () => {
            div.style.backgroundColor = item.isDelete ? '#fef2f2' : '#f8fafc';
            div.style.color = item.isDelete ? '#b91c1c' : '#1f2937';
          });
          
          div.addEventListener('mouseleave', () => {
            div.style.backgroundColor = 'transparent';
            div.style.color = item.isDelete ? '#dc2626' : '#374151';
          });
        }
        
        div.textContent = item.text;
        
        // Only add click handler for non-disabled items
        if (!item.isDisabled) {
          div.addEventListener('click', () => {
            console.log(`${item.text} clicked`);
            item.action();
            menu.remove();
          });
        }
        menu.appendChild(div);
      });
      
      document.body.appendChild(menu);
      console.log('Context menu created and added to DOM');
      
      // Close menu when clicking elsewhere
      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 100);
    }
  };

  const handleCloseContextMenu = () => {
    setShowContextMenu(false);
    setContextMenuEvent(null);
  };

  const closeContextMenuIfOpen = () => {
    const existingMenu = document.getElementById('context-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
  };

  const handleContextEditEvent = (event) => {
    if (event) {
      // All holidays in the calendar are family-managed and can be edited
      
      handleEventSelect(event);
      setIsEditingEvent(true);
    }
  };

  const handleDeleteEvent = async (event) => {
    if (event && event.id) {
      try {
        // All holidays in the calendar are family-managed and can be deleted
        if (event.type === 'holiday') {
          // Delete from holidays table
          const { error } = await supabase
            .from('holidays')
            .delete()
            .eq('id', event.id);
          
          if (error) throw error;
        } else if (event.type === 'lesson') {
          // Delete from activity_instances table
          const { error } = await supabase
            .from('activity_instances')
            .delete()
            .eq('id', event.id);
          
          if (error) throw error;
        }
        
        // Refresh calendar data
        if (familyId) {
          await preloadCalendarDataRPC();
        }
        
        // Refresh today's learning
        await fetchTodaysLearning();
        
        // Force calendar refresh
        setCurrentMonth(prev => new Date(prev));
        
        handleCloseContextMenu();
        
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('Event deleted successfully');
        }
      } catch (error) {
        console.error('Error deleting event:', error);
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('Error deleting event: ' + error.message);
        }
      }
    }
  };

  const handlePasteEvent = async (dateKey) => {
    if (cutEventData && familyId) {
      try {
        // Validate that we have all required data before pasting
        if (!cutEventData.trackId) {
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Cannot paste event: Missing track information in copied data.');
          }
          return;
        }
        
        if (!cutEventData.activityId) {
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Cannot paste event: Missing activity information in copied data.');
          }
          return;
        }

        // Create event data with exact values from copied/cut data
        const eventData = {
          family_id: familyId,
          activity_id: cutEventData.activityId,
          track_id: cutEventData.trackId,
          title: cutEventData.title,
          description: cutEventData.description,
          scheduled_date: dateKey, // Use the clicked date
          scheduled_time: (() => {
            // Handle different time formats
            if (!cutEventData.scheduledTime) return null;
            
            // If it's "All Day" or similar, return null (no specific time)
            if (cutEventData.scheduledTime.toLowerCase().includes('all day') || 
                cutEventData.scheduledTime.toLowerCase().includes('scheduled')) {
              return null;
            }
            
            // If it's already in HH:MM format, add seconds
            if (cutEventData.scheduledTime.match(/^\d{1,2}:\d{2}$/)) {
              return `${cutEventData.scheduledTime}:00`;
            }
            
            // If it's in HH:MM AM/PM format, convert to 24-hour
            const timeMatch = cutEventData.scheduledTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
            if (timeMatch) {
              let hours = parseInt(timeMatch[1]);
              const minutes = timeMatch[2];
              const period = timeMatch[3]?.toUpperCase();
              
              if (period === 'PM' && hours < 12) hours += 12;
              if (period === 'AM' && hours === 12) hours = 0;
              
              return `${hours.toString().padStart(2, '0')}:${minutes}:00`;
            }
            
            // If we can't parse it, return null
            return null;
          })(),
          minutes: parseInt(cutEventData.timeEstimate) || 60,
          child_name: cutEventData.child_name || JSON.stringify(cutEventData.assignees || []),
          status: cutEventData.status,
          created_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from('activity_instances')
          .insert([eventData]);

        if (error) throw error;

        if (familyId) {
          await preloadCalendarDataRPC();
        }
        await fetchTodaysLearning();

        // Force calendar refresh by updating the current month state
        setCurrentMonth(prev => new Date(prev));

        // Clear the cut data after successful paste
        setCutEventData(null);

        if (typeof window !== 'undefined' && window.alert) {
          window.alert('Event pasted successfully');
        }
      } catch (error) {
        console.error('Error pasting event:', error);
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('Error pasting event: ' + error.message);
        }
      }
    }
  };

  const handleCreateNewEvent = (dateKey) => {
    // Convert dateKey (YYYY-MM-DD) to MM/DD/YY format for the form
    const [year, month, day] = dateKey.split('-');
    const mm = month.padStart(2, '0');
    const dd = day.padStart(2, '0');
    const yy = year.slice(-2);
    const formattedDate = `${mm}/${dd}/${yy}`;

    // Set up form data with the clicked date
    setNewEventFormData({
      title: '',
      description: '',
      scheduledDate: formattedDate,
      scheduledTime: '',
      dueDate: '',
      finishTime: '',
      timeEstimate: '60',
      assignees: [],
      status: 'planned',
      trackId: null,
      activityId: null
    });

    setNewEventType('lesson');
    setShowNewEventForm(true);
  };
  const handleCutEvent = async (event) => {
    if (event && event.id) {
      try {
        // Holidays don't have track/activity data needed for cut/copy operations
        if (event.type === 'holiday') {
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Holidays cannot be cut/copied because they don\'t have track/activity data. Use duplicate instead.');
          }
          return;
        }

        // Validate that we have all required data before cutting
        if (!event.trackId) {
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Cannot cut event: Missing track information. Please ensure the event has a valid track assigned.');
          }
          return;
        }
        
        if (!event.activityId) {
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Cannot cut event: Missing activity information. Please ensure the event has a valid activity assigned.');
          }
          return;
        }

        // Store complete event data with proper data types
        const cutData = {
          title: event.title || '',
          description: event.description || '',
          scheduledDate: event.scheduledDate || '',
          scheduledTime: event.scheduledTime || '',
          dueDate: event.dueDate || '',
          finishTime: event.finishTime || '',
          timeEstimate: event.estimateMinutes ? String(event.estimateMinutes) : '60',
          assignees: event.assignees || [],
          status: event.status || 'planned',
          trackId: event.trackId, // Required field - no fallback
          activityId: event.activityId, // Required field - no fallback
          familyId: event.familyId || familyId,
          minutes: event.estimateMinutes || 60,
          child_name: event.assignees ? JSON.stringify(event.assignees) : '[]'
        };
        
        // Store cut data in state for potential paste operation
        setCutEventData(cutData);
        
        // Delete the original event (cut operation)
        if (event.type === 'lesson') {
          const { error } = await supabase
            .from('activity_instances')
            .delete()
            .eq('id', event.id);
          if (error) throw error;
        } else if (event.type === 'holiday') {
          const { error } = await supabase
            .from('holidays')
            .delete()
            .eq('id', event.id);
          if (error) throw error;
        }
        
        if (familyId) {
          await preloadCalendarDataRPC();
        }
        await fetchTodaysLearning();
        
        // Force calendar refresh
        setCurrentMonth(prev => new Date(prev));
        
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('Event cut successfully');
        }
      } catch (error) {
        console.error('Error cutting event:', error);
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('Error cutting event: ' + error.message);
        }
      }
    }
  };

  const handleCopyEvent = async (event) => {
    if (event) {
      try {
        // Holidays don't have track/activity data needed for cut/copy operations
        if (event.type === 'holiday') {
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Holidays cannot be cut/copied because they don\'t have track/activity data. Use duplicate instead.');
          }
          return;
        }

        // Validate that we have all required data before copying
        if (!event.trackId) {
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Cannot copy event: Missing track information. Please ensure the event has a valid track assigned.');
          }
          return;
        }
        
        if (!event.activityId) {
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Cannot copy event: Missing activity information. Please ensure the event has a valid activity assigned.');
          }
          return;
        }

        // Store complete event data with proper data types
        const copyData = {
          title: event.title || '',
          description: event.description || '',
          scheduledDate: event.scheduledDate || '',
          scheduledTime: event.scheduledTime || '',
          dueDate: event.dueDate || '',
          finishTime: event.finishTime || '',
          timeEstimate: event.estimateMinutes ? String(event.estimateMinutes) : '60',
          assignees: event.assignees || [],
          status: event.status || 'planned',
          trackId: event.trackId, // Required field - no fallback
          activityId: event.activityId, // Required field - no fallback
          familyId: event.familyId || familyId,
          minutes: event.estimateMinutes || 60,
          child_name: event.assignees ? JSON.stringify(event.assignees) : '[]'
        };
        
        // Store copy data in state for potential paste operation
        setCutEventData(copyData);
        
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('Event copied successfully');
        }
      } catch (error) {
        console.error('Error copying event:', error);
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('Error copying event: ' + error.message);
        }
      }
    }
  };

  const handleDuplicateEvent = async (event) => {
    if (event) {
      try {
        console.log('Duplicating event:', event.title);
        
        // Set up form data for duplication
        const eventDate = new Date();
        const mm = String(eventDate.getMonth() + 1).padStart(2, '0');
        const dd = String(eventDate.getDate()).padStart(2, '0');
        const yy = String(eventDate.getFullYear()).slice(-2);
        
        const duplicateData = {
          title: event.title + ' (Copy)',
          description: event.description || '',
          scheduledDate: `${mm}/${dd}/${yy}`,
          scheduledTime: event.time === 'Scheduled' ? '' : event.time,
          dueDate: '',
          finishTime: '',
          timeEstimate: event.estimateMinutes ? String(event.estimateMinutes) : '60',
          assignees: event.assignees || [],
          status: event.status || 'planned',
          trackId: event.trackId || null,
          activityId: event.activityId || null
        };
        
        // If it's a lesson, save directly to activity_instances
        if (event.type === 'lesson') {
          // Convert date format for database
          const convertToYYYYMMDD = (dateStr) => {
            const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{2})/);
            if (!match) return null;
            const [, month, day, year] = match;
            const fullYear = parseInt(year) + (parseInt(year) < 50 ? 2000 : 1900);
            return `${fullYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          };
          
          const eventData = {
            family_id: familyId,
            activity_id: duplicateData.activityId || availableActivities[0]?.id,
            track_id: duplicateData.trackId,
            title: duplicateData.title,
            description: duplicateData.description,
            scheduled_date: convertToYYYYMMDD(duplicateData.scheduledDate),
            scheduled_time: duplicateData.scheduledTime ? `${duplicateData.scheduledTime}:00` : null,
            minutes: parseInt(duplicateData.timeEstimate) || 60,
            child_name: JSON.stringify(duplicateData.assignees),
            status: duplicateData.status,
            created_at: new Date().toISOString()
          };
          
          const { error } = await supabase
            .from('activity_instances')
            .insert([eventData]);
          
          if (error) throw error;
          
          console.log('Event duplicated successfully');
          
          // Refresh calendar data
          if (familyId) {
            preloadCalendarDataRPC();
          }
          fetchTodaysLearning();
          
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Event duplicated successfully');
          }
        } else if (event.type === 'holiday') {
          // For holidays, use the existing holiday creation logic
          const convertToYYYYMMDD = (dateStr) => {
            const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{2})/);
            if (!match) return null;
            const [, month, day, year] = match;
            const fullYear = parseInt(year) + (parseInt(year) < 50 ? 2000 : 1900);
            return `${fullYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          };
          
          const holidayData = {
            holiday_name: duplicateData.title,
            holiday_date: convertToYYYYMMDD(duplicateData.scheduledDate),
            description: duplicateData.description,
            is_proposed: false,
            family_year_id: (await supabase.from('family_years').select('id').eq('family_id', familyId).eq('is_current', true).single()).data?.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          const { error } = await supabase
            .from('holidays')
            .insert([holidayData]);
          
          if (error) throw error;
          
          console.log('Holiday duplicated successfully');
          
          // Refresh calendar data
          if (familyId) {
            preloadCalendarDataRPC();
          }
          
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Holiday duplicated successfully');
          }
        } else {
          // For other types, fall back to opening the form
          setNewEventFormData(duplicateData);
          setNewEventType(event.type);
          setShowNewEventForm(true);
        }
      } catch (error) {
        console.error('Error duplicating event:', error);
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('Error duplicating event: ' + error.message);
        }
      }
    }
  };

  const handleSaveEvent = async () => {
    try {
      // Here you would typically save to your database
      // For now, we'll just update the local state
      setSelectedEvent({
        ...selectedEvent,
        ...editedEventData
      })
      setIsEditingEvent(false)
      // You could also update the calendar events here
    } catch (error) {
      console.error('Error saving event:', error)
    }
  }

  const handleCancelEdit = () => {
    setIsEditingEvent(false)
    setEditedEventData({
      title: selectedEvent.title,
      childName: selectedEvent.childName,
      time: selectedEvent.time,
      type: selectedEvent.type,
      date: selectedEvent.date,
      location: selectedEvent.location || '',
      notes: selectedEvent.notes || ''
    })
  }

  const handleCloseEvent = () => {
    setSelectedEvent(null)
    setIsEditingEvent(false)
    setEditedEventData({})
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const results = [];
      
      // First, search through what we already have loaded
      Object.entries(calendarEvents).forEach(([dateKey, dayEvents]) => {
        dayEvents.forEach(event => {
          const searchText = `${event.title} ${event.childName} ${event.type}`.toLowerCase();
          if (searchText.includes(searchQuery.toLowerCase())) {
            results.push({
              ...event,
              date: dateKey,
              displayDate: new Date(dateKey).toLocaleDateString()
            });
          }
        });
      });
      
      // If query is very short, show results immediately
      if (searchQuery.length <= 2) {
        setSearchResults(results);
        setIsSearching(false);
        return;
      }
      
      // For comprehensive search, fetch additional months efficiently
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth();
      
      // Only fetch 2 months before and after current month
      const monthsToFetch = [];
      for (let i = -2; i <= 2; i++) {
        const month = (currentMonth + i + 12) % 12;
        const year = currentYear + Math.floor((currentMonth + i) / 12);
        if (year >= currentYear - 1 && year <= currentYear + 1) {
          monthsToFetch.push({ month, year });
        }
      }
      
      // Fetch all months in parallel
      const fetchPromises = monthsToFetch.map(({ month, year }) => 
        fetchCalendarEvents(month, year)
      );
      
      const additionalEvents = await Promise.all(fetchPromises);
      
      // Search through additional events and combine with existing results
      additionalEvents.forEach(events => {
        Object.entries(events).forEach(([dateKey, dayEvents]) => {
          dayEvents.forEach(event => {
            const searchText = `${event.title} ${event.childName} ${event.type}`.toLowerCase();
            if (searchText.includes(searchQuery.toLowerCase())) {
              results.push({
                ...event,
                date: dateKey,
                displayDate: new Date(dateKey).toLocaleDateString()
              });
            }
            // Limit results to prevent overwhelming the UI
            if (results.length >= 50) return;
          });
        });
      });
      
      // Show all results at once
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Load calendar data for a specific month using the new RPC
  const loadMonthData = async (year, month) => {
    if (!familyId) return {};
    
    console.log('Loading month data for:', year, month);
    
    try {
      const { data, error } = await supabase.rpc('get_month_view', {
        _family_id: familyId,
        _year: year,
        _month: month,
        _child_ids: selectedCalendarChildren && selectedCalendarChildren.length > 0 ? selectedCalendarChildren : null
      });

      console.log('get_month_view RPC call result:', { data, error, familyId, year, month });

      if (error) {
        console.error('Error fetching month data:', error);
        return {};
      }

      if (!data) {
        console.log('No data returned from get_month_view RPC');
        return {};
      }

      // Debug: Log sample events from RPC
      const eventsByDate = data.events_by_date || {};
      console.log('Sample events from RPC:', Object.keys(eventsByDate).slice(0, 3).map(date => ({
        date,
        events: eventsByDate[date]?.slice(0, 2).map(e => ({ title: e.title, source: e.source, start_local: e.start_local, year_plan_id: e.year_plan_id }))
      })));
      // Debug: Check if year_plan_id is in the RPC response
      const sampleEvent = Object.values(eventsByDate)[0]?.[0];
      if (sampleEvent) {
        console.log('[WebContent] Sample event from RPC has year_plan_id?', {
          hasYearPlanId: !!sampleEvent.year_plan_id,
          year_plan_id: sampleEvent.year_plan_id,
          allKeys: Object.keys(sampleEvent),
          title: sampleEvent.title
        });
      }

      // Convert the RPC response to the format expected by the calendar
      const events = {};
      
      // Convert events_by_date to the format expected by calendar
      Object.keys(eventsByDate).forEach(date => {
        const dayEvents = eventsByDate[date] || [];
        events[date] = dayEvents.map(event => {
          // Determine color based on subject (if available) or default to teal
          let eventColor = 'teal'; // Default color
          const subjectName = event.subject_name || event.subject || '';
          if (subjectName) {
            const subjectLower = subjectName.toLowerCase();
            // Map subjects to EventChip-supported colors: teal, violet, amber, sky
            if (subjectLower.includes('reading') || subjectLower.includes('literacy') || subjectLower.includes('english') || subjectLower.includes('language')) {
              eventColor = 'sky'; // Blue-ish for reading/language
            } else if (subjectLower.includes('math') || subjectLower.includes('mathematics')) {
              eventColor = 'amber'; // Yellow/orange for math
            } else if (subjectLower.includes('art') || subjectLower.includes('arts') || subjectLower.includes('creative')) {
              eventColor = 'violet'; // Purple for arts
            } else if (subjectLower.includes('science')) {
              eventColor = 'teal'; // Teal for science
            }
          }
          
          return {
            id: event.id,
            type: event.source || 'activity',
            title: event.title || 'Untitled Event',
            childName: data.children?.find(c => c.id === event.child_id)?.name || 'Child',
            time: event.start_local || 'Scheduled',
            color: eventColor,
            subject: subjectName,
            status: event.status || 'scheduled',
            year_plan_id: event.year_plan_id, // Preserve year_plan_id from RPC
            data: event,
            assignee: event.child_id,
            assignees: event.child_id ? [event.child_id] : []
          };
        });
      });

      console.log('Month data loaded successfully. Events by date:', Object.keys(events).length);
      
      return events;
      
    } catch (error) {
      console.error('Error loading month data:', error);
      return {};
    }
  };

  // Pre-load calendar data for the current month using RPC
  const preloadCalendarDataRPC = async () => {
    if (!familyId || isCalendarDataLoaded) return;
    
    setCalendarDataLoading(true);
    
    try {
      const currentYear = currentMonth.getFullYear();
      const currentMonthNum = currentMonth.getMonth() + 1; // JavaScript months are 0-based
      
      console.log('Pre-loading calendar data for current month using RPC:', currentYear, currentMonthNum);
      
      const events = await loadMonthData(currentYear, currentMonthNum);
      
      // Store in cache with the correct key format (JavaScript months are 0-based)
      const monthKey = `${currentYear}-${currentMonth.getMonth()}`;
      const cache = { [monthKey]: events };
      
      console.log('Storing events in cache for month:', monthKey, 'with', Object.keys(events).length, 'days');
      console.log('Events being stored:', events);
      
      setCalendarDataCache(cache);
      setIsCalendarDataLoaded(true);
      
    } catch (error) {
      console.error('Error pre-loading calendar data:', error);
    } finally {
      setCalendarDataLoading(false);
    }
  };

  // Pre-load all calendar data for the entire year
  const preloadCalendarData = async () => {
    if (!familyId || isCalendarDataLoaded) return;
    
    setCalendarDataLoading(true);
    
    try {
      // Get current year and fetch data for the entire year
      const currentYear = new Date().getFullYear();
      const viewingYear = currentMonth.getFullYear();
      const yearToLoad = Math.max(currentYear, viewingYear); // Load current year or viewing year, whichever is later
      const startDate = new Date(yearToLoad, 0, 1); // January 1st
      const endDate = new Date(yearToLoad, 11, 31); // December 31st
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      console.log('Pre-loading calendar data for entire year:', startDateStr, 'to', endDateStr);
      
      const events = {};
      const cache = {};
      
      // Fetch children for this family
      const { data: childrenData, error: childrenError } = await supabase
        .from('children')
        .select('id, first_name')
        .eq('family_id', familyId);
      
      if (childrenError) {
        console.error('Error fetching children:', childrenError);
      }
      
      // Fetch activities for the entire year
      try {
        const { data: activitiesData, error: activitiesError } = await supabase
          .from('events')
          .select('*')
          .eq('source', 'activity');
        
        if (activitiesError) {
          console.error('Error fetching activities:', activitiesError);
        } else if (activitiesData && activitiesData.length > 0) {
          // Filter activities by family_id if available, otherwise show all
          const familyActivities = activitiesData.filter(activity => 
            !activity.family_id || activity.family_id === familyId
          );
          
          familyActivities.forEach(activity => {
            // Handle different date field names gracefully
            let dateKey = null;
            if (activity.created_at) {
              dateKey = activity.created_at.split('T')[0];
            } else {
              // If no date field, skip this activity
              return;
            }
            
            // Add if it's in the current year
            if (dateKey >= startDateStr && dateKey <= endDateStr) {
              if (!events[dateKey]) events[dateKey] = [];
              
              // Try to assign to a child if we have children data
              const childName = childrenData && childrenData.length > 0 
                ? childrenData[0].first_name 
                : 'Family Activity';
              
              // Ensure title is never undefined or null
              let title = activity.title || 'Activity';
              
              // Clean up malformed titles (remove leading dashes, bullets, etc.)
              if (title && typeof title === 'string') {
                title = title.replace(/^[-•*]\s*/, '').trim();
              }
              
              if (!title || title === 'undefined' || title === 'null' || title === '') {
                console.warn('Found activity with invalid title after cleaning:', activity);
                return; // Skip this activity
              }
              
              events[dateKey].push({
                id: activity.id,
                type: 'activity',
                title: title,
                childName: childName,
                time: 'Scheduled',
                color: 'orange',
                data: activity,
                assignee: activity.assignee || null,
                assignees: activity.assignee ? (() => {
                  try {
                    const parsed = JSON.parse(activity.assignee)
                    return Array.isArray(parsed) ? parsed : [activity.assignee]
                  } catch (e) {
                    return [typeof window !== 'undefined' ? [activity.assignee] : [activity.assignee]]
                  }
                })() : []
              });
            }
          });
        }
      } catch (error) {
        console.error('Error fetching activities:', error);
      }
      
      // Fetch lesson instances (real, date-specific lessons) for the entire year
      // NOTE: activity_instances table was migrated to events table with source='lesson'
      try {
        const { data: activityInstances, error: aiError } = await supabase
          .from('events')
          .select('id, title, description, start_ts, end_ts, status, child_id, subject_id')
          .eq('family_id', familyId)
          .eq('source', 'lesson')
          .gte('start_ts', startDateStr + 'T00:00:00')
          .lte('start_ts', endDateStr + 'T23:59:59');
        
        if (aiError) {
          console.error('Error fetching activity instances:', aiError);
        } else {
          console.log('Fetched activity instances:', activityInstances?.length || 0, 'instances');
          if (activityInstances && activityInstances.length > 0) {
            console.log('Sample activity instance:', activityInstances[0]);
          }
        }
        
        if (activityInstances && activityInstances.length > 0) {
          activityInstances.forEach(instance => {
            // Extract date from start_ts
            const dateKey = instance.start_ts ? instance.start_ts.split('T')[0] : null;
            if (!dateKey) return;
            if (!events[dateKey]) events[dateKey] = [];

            // Get child name from children table separately if needed
            const childName = 'Student'; // We'll get this from the child_id later if needed
            let title = instance.title || 'Lesson';
            
            // Clean up malformed titles (remove leading dashes, bullets, etc.)
            if (title && typeof title === 'string') {
              title = title.replace(/^[-•*]\s*/, '').trim();
            }
            
            // Ensure title is never undefined, null, or empty after cleaning
            if (!title || title === 'undefined' || title === 'null' || title === '') {
              // Don't skip - use a fallback title instead
              title = `Event ${instance.id.slice(0, 8)}`;
            }
            
            // Extract time from start_ts
            let timeLabel = 'Scheduled';
            if (instance.start_ts) {
              timeLabel = new Date(instance.start_ts).toTimeString().slice(0, 5);
            }

            // Assignee comes from child_id
            const assigneeValue = instance.child_id || null;
            const assigneesArray = assigneeValue ? (() => {
              try {
                const parsed = JSON.parse(assigneeValue);
                return Array.isArray(parsed) ? parsed : [assigneeValue];
              } catch {
                return [assigneeValue];
              }
            })() : [];

            // Calculate duration in minutes
            const durationMin = instance.start_ts && instance.end_ts 
              ? Math.round((new Date(instance.end_ts) - new Date(instance.start_ts)) / 60000)
              : null;

            events[dateKey].push({
              id: instance.id,
              type: 'lesson',
              title: title,
              childName,
              time: timeLabel,
              color: 'blue',
              data: instance,
              status: instance.status || 'todo',
              assignee: assigneeValue,
              assignees: assigneesArray,
              description: instance.description || undefined,
              estimateMinutes: durationMin ?? undefined,
              due: false
            });
          });
        }
      } catch (error) {
        console.error('Error fetching activity instances:', error);
      }
      
      // Fetch holidays for the entire year (only if holidays filter is enabled)
      if (showHolidays) {
        try {
          // Get the current family year ID
          const { data: familyYearData, error: familyYearError } = await supabase
            .from('family_years')
            .select('id')
            .eq('family_id', familyId)
            .eq('is_current', true)
            .maybeSingle();
          
          if (familyYearError) {
            console.error('Error fetching family year:', familyYearError);
          } else if (familyYearData) {
            const { data: holidaysData, error: holidaysError } = await supabase
              .from('holidays')
              .select('*')
              .eq('family_year_id', familyYearData.id);
            
            if (holidaysError) {
              console.error('Error fetching holidays:', holidaysError);
            } else if (holidaysData && holidaysData.length > 0) {
              holidaysData.forEach(holiday => {
                // Use the correct holiday_date field from your database
                let dateKey = null;
                if (holiday.holiday_date) {
                  dateKey = holiday.holiday_date;
                } else if (holiday.start_date) {
                  dateKey = holiday.start_date;
                } else if (holiday.date) {
                  dateKey = holiday.date;
                } else if (holiday.created_at) {
                  dateKey = holiday.created_at.split('T')[0];
                } else {
                  // If no date field, skip this holiday
                  return;
                }
                
                // Add if it's in the current year
                if (dateKey >= startDateStr && dateKey <= endDateStr) {
                  if (!events[dateKey]) events[dateKey] = [];
                  
                  // Ensure title is never undefined or null
                  const title = holiday.holiday_name || 'Holiday';
                  if (!title || title === 'undefined' || title === 'null') {
                    console.warn('Found holiday with invalid title:', holiday);
                    return; // Skip this holiday
                  }
                  
                  events[dateKey].push({
                    id: holiday.id,
                    type: 'holiday',
                    title: title,
                    childName: 'All Family',
                    time: 'All Day',
                    color: 'red',
                    data: holiday
                  });
                }
              });
            }
          }
        } catch (error) {
          console.error('Error fetching holidays:', error);
        }
      }
      
      // Sort events within each day by scheduled_time (if present), else push to bottom
      try {
        const toMinutes = (evt) => {
          const t = evt?.data?.scheduled_time;
          if (!t) return 24 * 60 + (evt.type === 'holiday' ? 1 : 0);
          const parts = String(t).split(':');
          const hours = parseInt(parts[0] || '0', 10);
          const minutes = parseInt(parts[1] || '0', 10);
          return hours * 60 + minutes;
        };
        Object.keys(events).forEach((dateKey) => {
          events[dateKey].sort((a, b) => {
            const ta = toMinutes(a);
            const tb = toMinutes(b);
            if (ta !== tb) return ta - tb;
            const at = (a.title || '').toString().toLowerCase();
            const bt = (b.title || '').toString().toLowerCase();
            if (at && bt) return at.localeCompare(bt);
            if (at) return -1;
            if (bt) return 1;
            return 0;
          });
        });
      } catch (sortErr) {
        console.warn('Event sort skipped due to error:', sortErr);
      }

      // Build comprehensive cache for the entire year
      for (let month = 0; month < 12; month++) {
        const monthStart = new Date(currentYear, month, 1);
        const monthEnd = new Date(currentYear, month + 1, 0);
        const monthKey = `${currentYear}-${month}`;
        
        const monthEvents = {};
        for (let day = monthStart.getDate(); day <= monthEnd.getDate(); day++) {
          const dateKey = new Date(currentYear, month, day).toISOString().split('T')[0];
          if (events[dateKey]) {
            monthEvents[dateKey] = events[dateKey];
          }
        }
        
        cache[monthKey] = monthEvents;
      }

      // Store the comprehensive cache and mark as loaded
      setCalendarDataCache(cache);
      setIsCalendarDataLoaded(true);
      
      console.log('Calendar data pre-loaded successfully. Events for', Object.keys(events).length, 'days');
      console.log('Total events loaded:', Object.values(events).flat().length);
      console.log('Event dates:', Object.keys(events).sort());
      
      
    } catch (error) {
      console.error('Error pre-loading calendar data:', error);
    } finally {
      setCalendarDataLoading(false);
    }
  };
  const refreshCalendarData = async (referenceDate = null) => {
    if (!familyId) return;
    
    // Store function reference for event listener
    refreshCalendarDataRef.current = () => refreshCalendarData(referenceDate);

    try {
      let baseDate;
      if (referenceDate instanceof Date) {
        baseDate = referenceDate;
      } else if (referenceDate) {
        baseDate = new Date(referenceDate);
      } else {
        baseDate = currentMonth;
      }

      if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) {
        baseDate = currentMonth;
      }

      const targetYear = baseDate.getFullYear();
      const targetMonthIndex = baseDate.getMonth();
      const targetMonthNum = targetMonthIndex + 1;
      const monthKey = `${targetYear}-${targetMonthIndex}`;

      console.log('Refreshing calendar data for month:', monthKey);

      // Clear the cache for this month to force a fresh load
      setCalendarDataCache(prevCache => {
        const newCache = { ...prevCache };
        delete newCache[monthKey];
        return newCache;
      });

      const events = await loadMonthData(targetYear, targetMonthNum);

      setCalendarDataCache(prevCache => ({
        ...prevCache,
        [monthKey]: events,
      }));

      // Also update calendarEvents state if we're on the calendar tab
      // Always update to ensure checkmarks reflect latest status
      setCalendarEvents(events);

      if (!isCalendarDataLoaded) {
        setIsCalendarDataLoaded(true);
      }

      console.log('Refresh complete. Updated', Object.keys(events).length, 'days in month:', monthKey);
    } catch (error) {
      console.error('Error refreshing calendar data:', error);
    }
  };


  // Load data for a specific year if not already cached
  const loadYearData = async (year) => {
    if (!familyId) return;
    
    const yearKey = `${year}`;
    if (calendarDataCache[yearKey]) return; // Already loaded
    
    console.log('Loading data for year:', year);
    
    try {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31);
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      // Fetch activities for the year
      const { data: activitiesData, error: activitiesError } = await supabase
        .from('events')
        .select('*')
        .eq('source', 'activity')
        .gte('created_at', startDateStr)
        .lte('created_at', endDateStr);
      
      if (activitiesError) {
        console.error('Error fetching activities for year:', year, activitiesError);
        return;
      }
      
      // Process activities and add to cache
      const yearEvents = {};
      if (activitiesData) {
        activitiesData.forEach(activity => {
          let dateKey = null;
          if (activity.created_at) {
            dateKey = activity.created_at.split('T')[0];
          }
          
          if (dateKey && dateKey >= startDateStr && dateKey <= endDateStr) {
            if (!yearEvents[dateKey]) yearEvents[dateKey] = [];
            
            const title = activity.title || 'Activity';
            yearEvents[dateKey].push({
              id: activity.id,
              type: 'activity',
              title: title,
              data: activity
            });
          }
        });
      }
      
      // Add to cache
      setCalendarDataCache(prev => ({
        ...prev,
        [yearKey]: yearEvents
      }));
      
    } catch (error) {
      console.error('Error loading year data:', error);
    }
  };

  // Legacy function for backward compatibility (now just returns cached data)
  const fetchCalendarEvents = async (month, year) => {
    if (!familyId) return {};
    
    // If we have cached data, return it immediately
    if (isCalendarDataLoaded && calendarDataCache[`${year}-${month}`]) {
      return calendarDataCache[`${year}-${month}`];
    }
    
    // If no cached data, trigger pre-loading
    if (!isCalendarDataLoaded) {
      await preloadCalendarDataRPC();
      return calendarDataCache[`${year}-${month}`] || {};
    }
    
    return {};
  };
  
  // Pre-load all calendar data when familyId is available
  useEffect(() => {
    if (familyId && !isCalendarDataLoaded && !calendarDataLoading) {
      console.log('Triggering calendar data pre-load for family:', familyId);
      preloadCalendarDataRPC(); // Use the new RPC version
    }
  }, [familyId, isCalendarDataLoaded, calendarDataLoading]);

  // Update calendar events when month changes, but only if calendar tab is active
  useEffect(() => {
    if (familyId && activeTab === 'calendar' && isCalendarDataLoaded) {
      const monthKey = `${currentMonth.getFullYear()}-${currentMonth.getMonth()}`;
      const monthEvents = calendarDataCache[monthKey] || {};
      
      // If we don't have data for this month, load it using the RPC
      if (!monthEvents || Object.keys(monthEvents).length === 0) {
        console.log('No cached data for month:', monthKey, 'loading with RPC');
        loadMonthData(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
          .then(events => {
            if (Object.keys(events).length > 0) {
              setCalendarDataCache(prev => ({
                ...prev,
                [monthKey]: events
              }));
            }
          })
          .catch(error => {
            console.error('Error loading month data:', error);
          });
      }
    }
  }, [currentMonth, familyId, activeTab, isCalendarDataLoaded]);

  // Separate useEffect to update calendar events when cache changes
  useEffect(() => {
    if (familyId && isCalendarDataLoaded && Object.keys(calendarDataCache).length > 0) {
      // Merge all events from cache
      const allEvents = {};
      Object.keys(calendarDataCache).forEach(key => {
        if (calendarDataCache[key] && typeof calendarDataCache[key] === 'object') {
          Object.assign(allEvents, calendarDataCache[key]);
        }
      });
      
      console.log('Setting calendar events from cache:', allEvents);
      console.log('Cache keys:', Object.keys(calendarDataCache));
      console.log('Calendar events keys:', Object.keys(allEvents));
      console.log('Sample calendar events:', Object.keys(allEvents).slice(0, 5).map(key => ({ date: key, count: allEvents[key].length })));
      
      setCalendarEvents(allEvents);
    }
  }, [calendarDataCache, familyId, activeTab, isCalendarDataLoaded]);

  // Force calendar re-render when month changes to ensure events display correctly
  useEffect(() => {
    if (familyId && isCalendarDataLoaded && Object.keys(calendarEvents).length > 0) {
      // Force re-render by updating calendarEvents with a new object reference
      setCalendarEvents(prevEvents => ({ ...prevEvents }));
    }
  }, [currentMonth, familyId, isCalendarDataLoaded]);

  // Note: Filtering is now handled by the cache watcher useEffect above
  // This useEffect was causing events to be reduced to only current month
  // and overwriting the cache watcher's work

  // Fetch calendar data when switching to calendar tab
  useEffect(() => {
    if ((activeTab === 'calendar' || activeTab === 'planner') && familyId && !isCalendarDataLoaded) {
      console.log('Calendar tab activated, triggering data pre-load');
      preloadCalendarDataRPC();
    }
  }, [activeTab, familyId, isCalendarDataLoaded]);

  // Trigger search when query changes
  useEffect(() => {
    if (searchQuery.trim()) {
      const timeoutId = setTimeout(() => {
        handleSearch();
      }, 500); // Increased debounce to 500ms for better performance
      
      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  // Calendar view state with URL persistence
  const [calendarView, setCalendarView] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('view') || 'month';
    }
    return 'month';
  });

  const [selectedCalendarChildren, setSelectedCalendarChildren] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const childParam = params.get('child');
      return childParam ? childParam.split(',') : null;
    }
    return null;
  });

  // Reload month data when child filter changes
  useEffect(() => {
    if (familyId && calendarView === 'month' && isCalendarDataLoaded && activeTab === 'calendar') {
      const currentYear = currentMonth.getFullYear();
      const currentMonthNum = currentMonth.getMonth() + 1;
      console.log('Child filter changed, reloading month data with filter:', selectedCalendarChildren);
      loadMonthData(currentYear, currentMonthNum).then(events => {
        const monthKey = `${currentYear}-${currentMonth.getMonth()}`;
        setCalendarDataCache(prev => ({ ...prev, [monthKey]: events }));
        setCalendarEvents(events);
      });
    }
  }, [selectedCalendarChildren, familyId, calendarView, activeTab, currentMonth, isCalendarDataLoaded]);

  // Update URL when view or children change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      
      if (calendarView !== 'month') {
        params.set('view', calendarView);
      } else {
        params.delete('view');
      }
      
      if (selectedCalendarChildren && selectedCalendarChildren.length > 0) {
        params.set('child', selectedCalendarChildren.join(','));
      } else {
        params.delete('child');
      }
      
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [calendarView, selectedCalendarChildren]);

  // Generate right sidebar content for planner
  const getRightSidebarContent = React.useCallback(() => {
    if (!onRightSidebarRender) return null;
    
    if (activeTab !== 'planner' && activeTab !== 'calendar-planning' && calendarView !== 'month') {
      return null;
    }

      return (
      <>
              {showNewEventForm ? (
          // New Event Form View
                <ScrollView 
            style={{ flex: 1, zIndex: 1, minHeight: 0 }} 
                  contentContainerStyle={{ 
                    padding: 16,
                    paddingBottom: 60
                  }}
                  showsVerticalScrollIndicator={true}
                  bounces={false}
                  nestedScrollEnabled={true}
                >
                  {/* Close Button - Top Right */}
                  <TouchableOpacity 
                    onPress={closeNewEventForm}
                    style={{
                      position: 'absolute',
                    top: 16,
                    right: 16,
                      zIndex: 1000
                    }}
                  >
                    <Text style={{ fontSize: 16, color: '#6b7280' }}>✕</Text>
                  </TouchableOpacity>

                  {/* New Event Header */}
                  <View style={{ 
                    marginBottom: 16,
              marginTop: 40,
              flexShrink: 0
                  }}>
                    <View style={{ position: 'relative', marginBottom: showEventTypeDropdown ? 120 : 0 }}>
                      <TouchableOpacity
                        onPress={() => setShowEventTypeDropdown(!showEventTypeDropdown)}
                          style={{
                    flexDirection: 'row', 
                          alignItems: 'center',
                    justifyContent: 'space-between', 
                            backgroundColor: '#ffffff',
                            borderWidth: 1,
                            borderColor: '#e1e5e9',
                            borderRadius: 6,
                          padding: 8,
                          minWidth: 120
                        }}
                      >
                        <Text style={{ 
                          fontSize: 12, 
                            fontWeight: '600',
                            color: '#111827',
                          textTransform: 'capitalize'
                        }}>
                          {newEventType === 'holiday' ? 'Days Off' : newEventType}
                    </Text>
                        <Ionicons 
                          name={showEventTypeDropdown ? "chevron-up" : "chevron-down"} 
                          size={14} 
                          color="#6b7280" 
                        />
                      </TouchableOpacity>
                      
                      {showEventTypeDropdown && (
                          <View style={{
                            position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          backgroundColor: '#ffffff',
                          borderWidth: 1,
                          borderColor: '#e1e5e9',
                          borderRadius: 6,
                          marginTop: 4,
                          zIndex: 9999,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.1,
                          shadowRadius: 4,
                          elevation: 5
                        }}>
                          {['lesson', 'activity', 'holiday'].map((type) => (
                            <TouchableOpacity
                              key={type}
                              onPress={() => {
                                setNewEventType(type);
                                setShowEventTypeDropdown(false);
                              }}
                              style={{
                                padding: 16,
                                borderBottomWidth: type !== 'holiday' ? 1 : 0,
                                borderBottomColor: '#f3f4f6',
                                backgroundColor: newEventType === type ? '#f3f4f6' : 'transparent'
                              }}
                            >
                              <Text style={{
                                fontSize: 14,
                                color: newEventType === type ? '#1e40af' : '#374151',
                                fontWeight: newEventType === type ? '600' : '400',
                                textTransform: 'capitalize'
                              }}>
                                {type === 'holiday' ? 'Days Off' : type}
                    </Text>
                            </TouchableOpacity>
                          ))}
                          </View>
                      )}
                        </View>
                  </View>

                  {/* Title Section */}
            <View style={{ marginBottom: 16, flexShrink: 0 }}>
                    <View style={{ padding: 4 }}>
                        <TextInput
                          style={{
                            backgroundColor: '#ffffff',
                            borderWidth: 1,
                            borderColor: '#e1e5e9',
                            borderRadius: 6,
                            padding: 8,
                          fontSize: 12,
                          color: '#111827'
                        }}
                        placeholder="Title"
                        value={newEventFormData.title}
                        onChangeText={(text) => setNewEventFormData({...newEventFormData, title: text})}
                      />
                    </View>
                    </View>
                    
                  {/* Description Section */}
            <View style={{ marginBottom: 16, flexShrink: 0 }}>
                    <View style={{ padding: 4 }}>
                      <TextInput
                        style={{
                          backgroundColor: '#ffffff',
                          borderWidth: 1,
                          borderColor: '#e1e5e9',
                          borderRadius: 6,
                          padding: 8,
                          fontSize: 12,
                            color: '#111827',
                          minHeight: 60
                        }}
                        placeholder="Description"
                        value={newEventFormData.description}
                        onChangeText={(text) => setNewEventFormData({...newEventFormData, description: text})}
                        multiline
                        textAlignVertical="top"
                      />
                    </View>
                  </View>

                  {/* Track Selection Section - Only for lessons */}
                  {newEventType === 'lesson' && (
              <View style={{ marginBottom: 16, flexShrink: 0 }}>
                      <View style={{ position: 'relative', padding: 4 }}>
                        <TouchableOpacity
                          ref={trackTriggerRef}
                          onPress={() => {
                            measureTriggerPosition(trackTriggerRef, setTrackTriggerDimensions);
                            setShowTrackDropdown(!showTrackDropdown);
                          }}
                          style={{
                            flexDirection: 'row', 
                            alignItems: 'center',
                            justifyContent: 'space-between', 
                            backgroundColor: '#ffffff',
                            borderWidth: 1,
                            borderColor: '#e1e5e9',
                            borderRadius: 6,
                            padding: 8,
                            fontSize: 12,
                            color: '#111827',
                            width: '100%'
                          }}
                        >
                          <Text style={{ 
                            fontSize: 12, 
                            color: '#111827'
                          }}>
                            {newEventFormData.trackId ? 
                              availableTracks.find(t => t.id === newEventFormData.trackId)?.name || 'Select Track' :
                              'Select Track'
                            }
                    </Text>
                          <Ionicons 
                            name={showTrackDropdown ? "chevron-up" : "chevron-down"} 
                            size={14} 
                            color="#6b7280" 
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Activity Selection Section - Only for lessons */}
                  {newEventType === 'lesson' && (
              <View style={{ marginBottom: 16, flexShrink: 0 }}>
                      <View style={{ position: 'relative', padding: 4 }}>
                        <TouchableOpacity 
                          ref={activityTriggerRef}
                          onPress={() => {
                            measureTriggerPosition(activityTriggerRef, setActivityTriggerDimensions);
                            setShowActivityDropdown(!showActivityDropdown);
                          }}
                          style={{
                            flexDirection: 'row', 
                            alignItems: 'center',
                            justifyContent: 'space-between', 
                            backgroundColor: '#ffffff',
                            borderWidth: 1,
                            borderColor: '#e1e5e9',
                            borderRadius: 6,
                            padding: 8,
                            fontSize: 12,
                            color: '#111827',
                            width: '100%'
                          }}
                        >
                          <Text style={{ 
                            fontSize: 12, 
                            color: '#111827'
                          }}>
                            {newEventFormData.activityId ? 
                              availableActivities.find(a => a.id === newEventFormData.activityId)?.title || 'Select Activity' :
                              'Select Activity'
                            }
                      </Text>
                          <Ionicons 
                            name={showActivityDropdown ? "chevron-up" : "chevron-down"} 
                            size={14} 
                            color="#6b7280" 
                          />
                        </TouchableOpacity>
                    </View>
                    </View>
                  )}

                  {/* Date Selection Section - Different for holidays */}
                  {newEventType === 'holiday' ? (
                    <>
                      {/* Date Range Toggle */}
                <View style={{ marginBottom: 16, flexShrink: 0 }}>
                        <View style={{ padding: 4 }}>
                          <View style={{
                            flexDirection: 'row', 
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 8
                          }}>
                            <TouchableOpacity
                              onPress={() => setHolidayDateRange(prev => ({ ...prev, isRange: false }))}
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                               borderRadius: 4,
                                backgroundColor: !holidayDateRange.isRange ? '#3b82f6' : '#f3f4f6',
                              borderWidth: 1,
                                borderColor: !holidayDateRange.isRange ? '#3b82f6' : '#d1d5db'
                              }}
                            >
                              <Text style={{ 
                                fontSize: 11, 
                                color: !holidayDateRange.isRange ? '#ffffff' : '#374151',
                                fontWeight: '500'
                              }}>
                                Single Day
                    </Text>
                      </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => setHolidayDateRange(prev => ({ ...prev, isRange: true }))}
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: 4,
                                backgroundColor: holidayDateRange.isRange ? '#3b82f6' : '#f3f4f6',
                                borderWidth: 1,
                                borderColor: holidayDateRange.isRange ? '#3b82f6' : '#d1d5db'
                            }}
                          >
                            <Text style={{ 
                                fontSize: 11, 
                                color: holidayDateRange.isRange ? '#ffffff' : '#374151',
                                fontWeight: '500'
                              }}>
                                Date Range
                              </Text>
                          </TouchableOpacity>
                          </View>
                        </View>
                  </View>

                      {/* Single Date Input */}
                      {!holidayDateRange.isRange && (
                  <View style={{ marginBottom: 16, flexShrink: 0 }}>
                          <View style={{ padding: 4 }}>
                            <TextInput
                      style={{
                      backgroundColor: '#ffffff',
                        borderWidth: 1,
                      borderColor: '#e1e5e9',
                        borderRadius: 6,
                      padding: 8,
                                fontSize: 12,
                                color: '#111827'
                              }}
                              placeholder="Date (YYYY-MM-DD)"
                              value={newEventFormData.scheduledDate}
                              onChangeText={(text) => setNewEventFormData({...newEventFormData, scheduledDate: text})}
                            />
                          </View>
                    </View>
                  )}

                      {/* Date Range Inputs */}
                      {holidayDateRange.isRange && (
                        <>
                    <View style={{ marginBottom: 16, flexShrink: 0 }}>
                            <View style={{ padding: 4 }}>
                              <TextInput
                      style={{
                                  backgroundColor: '#ffffff',
                        borderWidth: 1,
                                  borderColor: '#e1e5e9',
                        borderRadius: 6,
                                  padding: 8,
                                  fontSize: 12,
                                  color: '#111827'
                                }}
                                placeholder="Start Date (YYYY-MM-DD)"
                                value={holidayDateRange.startDate}
                                onChangeText={(text) => setHolidayDateRange(prev => ({ ...prev, startDate: text }))}
                              />
                    </View>
                          </View>
                    <View style={{ marginBottom: 16, flexShrink: 0 }}>
                            <View style={{ padding: 4 }}>
                              <TextInput
                                style={{
                                  backgroundColor: '#ffffff',
                                  borderWidth: 1,
                                  borderColor: '#e1e5e9',
                                  borderRadius: 6,
                                  padding: 8,
                                  fontSize: 12,
                                  color: '#111827'
                                }}
                                placeholder="End Date (YYYY-MM-DD)"
                                value={holidayDateRange.endDate}
                                onChangeText={(text) => setHolidayDateRange(prev => ({ ...prev, endDate: text }))}
                              />
                            </View>
                          </View>
                        </>
                      )}

                      {/* Repeat Options */}
                <View style={{ marginBottom: 16, flexShrink: 0 }}>
                        <View style={{ padding: 4 }}>
                          <View style={{
                        flexDirection: 'row',
                            alignItems: 'center', 
                        justifyContent: 'space-between',
                            marginBottom: 8
                          }}>
                            <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '500' }}>
                              Repeat
                            </Text>
                            <TouchableOpacity
                              onPress={() => setHolidayRepeat(prev => ({ ...prev, enabled: !prev.enabled }))}
                              style={{
                                width: 32,
                            height: 16,
                                backgroundColor: holidayRepeat.enabled ? '#3b82f6' : '#d1d5db',
                                borderRadius: 8,
                                padding: 2
                              }}
                            >
                        <View style={{
                                width: 12,
                                height: 12,
                                backgroundColor: '#ffffff',
                                borderRadius: 6,
                                transform: [{ translateX: holidayRepeat.enabled ? 16 : 0 }]
                              }} />
                      </TouchableOpacity>
                          </View>
                    
                          {holidayRepeat.enabled && (
                            <View style={{ gap: 8 }}>
                      <View style={{
                                flexDirection: 'row', 
                            alignItems: 'center',
                                gap: 8
                              }}>
                                <View style={{ 
                                  flexDirection: 'row', 
                                  gap: 4
                                }}>
                                  {['weekly', 'monthly', 'yearly'].map((freq) => (
                          <TouchableOpacity 
                                      key={freq}
                                      onPress={() => setHolidayRepeat(prev => ({ ...prev, frequency: freq }))}
                            style={{ 
                                        paddingHorizontal: 6,
                                        paddingVertical: 2,
                                        borderRadius: 3,
                                        backgroundColor: holidayRepeat.frequency === freq ? '#3b82f6' : '#f3f4f6',
                              borderWidth: 1,
                                        borderColor: holidayRepeat.frequency === freq ? '#3b82f6' : '#d1d5db'
                            }}
                          >
                                      <Text style={{ 
                                        fontSize: 10, 
                                        color: holidayRepeat.frequency === freq ? '#ffffff' : '#374151'
                                      }}>
                                        {freq.charAt(0).toUpperCase() + freq.slice(1)}
                                      </Text>
                    </TouchableOpacity>
                                  ))}
                    </View>
                  </View>
                      </View>
                    )}
                  </View>
                      </View>
                    </>
                  ) : (
              <View style={{ marginBottom: 16, flexShrink: 0 }}>
                      <View style={{ padding: 4 }}>
                                                <TextInput
                      style={{
                      backgroundColor: '#ffffff',
                        borderWidth: 1,
                      borderColor: '#e1e5e9',
                        borderRadius: 6,
                      padding: 8,
                            fontSize: 12,
                            color: '#111827',
                            textAlign: 'left',
                            letterSpacing: 2
                          }}
                          placeholder="MM/DD/YY"
                          placeholderTextColor="#9ca3af"
                          value={newEventFormData.scheduledDate}
                          onChangeText={(text) => {
                            if (text.length < newEventFormData.scheduledDate.length) {
                              setNewEventFormData({...newEventFormData, scheduledDate: text})
                              return
                            }
                      let formatted = text.replace(/\D/g, '')
                            if (formatted.length >= 2) {
                              formatted = formatted.substring(0, 2) + '/' + formatted.substring(2)
                            }
                            if (formatted.length >= 5) {
                              formatted = formatted.substring(0, 5) + '/' + formatted.substring(5, 7)
                            }
                            setNewEventFormData({...newEventFormData, scheduledDate: formatted})
                          }}
                          maxLength={8}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  )}

                  {/* Due Date Section - Only for lessons and activities */}
                  {newEventType !== 'holiday' && (
              <View style={{ marginBottom: 16, flexShrink: 0 }}>
                      <View style={{ padding: 4 }}>
                                                <TextInput
                      style={{
                      backgroundColor: '#ffffff',
                        borderWidth: 1,
                      borderColor: '#e1e5e9',
                        borderRadius: 6,
                      padding: 8,
                            fontSize: 12,
                            color: '#111827',
                            textAlign: 'left',
                            letterSpacing: 2
                          }}
                          placeholder="MM/DD/YY (optional)"
                          placeholderTextColor="#9ca3af"
                          value={newEventFormData.dueDate}
                          onChangeText={(text) => {
                            if (text.length < newEventFormData.dueDate.length) {
                              setNewEventFormData({...newEventFormData, dueDate: text})
                              return
                            }
                      let formatted = text.replace(/\D/g, '')
                            if (formatted.length >= 2) {
                              formatted = formatted.substring(0, 2) + '/' + formatted.substring(2)
                            }
                            if (formatted.length >= 5) {
                              formatted = formatted.substring(0, 5) + '/' + formatted.substring(5, 7)
                            }
                            setNewEventFormData({...newEventFormData, dueDate: formatted})
                          }}
                          maxLength={8}
                          keyboardType="numeric"
                        />
                    </View>
                  </View>
                  )}

                  {/* Scheduled Time Section - Only for lessons and activities */}
                  {newEventType !== 'holiday' && (
              <View style={{ marginBottom: 16, flexShrink: 0 }}>
                      <View style={{ padding: 4 }}>
                        {Platform.OS === 'web' ? (
                    <View style={{
                      backgroundColor: '#ffffff',
                      borderWidth: 1,
                      borderColor: '#e1e5e9',
                      borderRadius: 6,
                      padding: 8,
                            minHeight: 32
                          }}>
                            <input
                              type="time"
                              value={newEventFormData.scheduledTime}
                              onChange={(e) => setNewEventFormData({...newEventFormData, scheduledTime: e.target.value})}
                              style={{ 
                                border: 'none',
                                outline: 'none',
                                fontSize: 12,
                                color: '#111827',
                                backgroundColor: 'transparent',
                                width: '100%',
                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
                              }}
                            />
                          </View>
                        ) : (
                          <TextInput
                            style={{
                              backgroundColor: '#ffffff',
                              borderWidth: 1,
                              borderColor: '#e1e5e9',
                              borderRadius: 6,
                              padding: 8,
                              fontSize: 12,
                              color: '#111827',
                              minHeight: 32
                            }}
                            value={newEventFormData.scheduledTime}
                            onChangeText={(text) => setNewEventFormData({...newEventFormData, scheduledTime: text})}
                            placeholder="9:00"
                            placeholderTextColor="#9ca3af"
                          />
                        )}
                      </View>
                    </View>
                  )}

                  {/* Finish Time Section - Only for lessons and activities */}
                  {newEventType !== 'holiday' && (
              <View style={{ marginBottom: 16, flexShrink: 0 }}>
                      <View style={{ padding: 4 }}>
                        {Platform.OS === 'web' ? (
                          <View style={{
                            backgroundColor: '#ffffff',
                            borderWidth: 1,
                            borderColor: '#e1e5e9',
                            borderRadius: 6,
                            padding: 8,
                            minHeight: 32
                          }}>
                            <input
                              type="time"
                              value={newEventFormData.finishTime}
                              onChange={(e) => setNewEventFormData({...newEventFormData, finishTime: e.target.value})}
                      style={{
                                border: 'none',
                                outline: 'none',
                                fontSize: 12,
                                color: '#111827',
                                backgroundColor: 'transparent',
                                width: '100%',
                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
                              }}
                            />
                          </View>
                        ) : (
                          <TextInput
                            style={{
                              backgroundColor: '#ffffff',
                        borderWidth: 1,
                              borderColor: '#e1e5e9',
                        borderRadius: 6,
                              padding: 8,
                              fontSize: 12,
                              color: '#111827',
                              minHeight: 32
                            }}
                            value={newEventFormData.finishTime}
                            onChangeText={(text) => setNewEventFormData({...newEventFormData, finishTime: text})}
                            placeholder="10:30"
                            placeholderTextColor="#9ca3af"
                          />
                        )}
                      </View>
                    </View>
                  )}

                  {/* Student Section - Auto-populated from track */}
                  {newEventType !== 'holiday' && newEventFormData.trackId && (
              <View style={{ marginBottom: 16, flexShrink: 0 }}>
                      <View style={{ padding: 4 }}>
                        <View style={{
                          backgroundColor: '#f8fafc',
                          borderWidth: 1,
                          borderColor: '#e2e8f0',
                          borderRadius: 6,
                          padding: 8,
                        flexDirection: 'row',
                        alignItems: 'center'
                        }}>
                          <Text style={{ fontSize: 12, color: '#64748b', marginRight: 8 }}>Student:</Text>
                          <Text style={{ fontSize: 12, color: '#1e293b', fontWeight: '500' }}>
                            {(() => {
                              const selectedTrack = availableTracks.find(t => t.id === newEventFormData.trackId);
                              if (selectedTrack) {
                                if (selectedTrack.name.includes("Max")) return "Max";
                                if (selectedTrack.name.includes("Lilly")) return "Lilly";
                              }
                              return "Auto-selected from track";
                            })()}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Status Section - Only for lessons and activities */}
                  {newEventType !== 'holiday' && (
                    <View style={{ marginBottom: 16 }}>
                      <View style={{ position: 'relative', padding: 4 }}>
                        <TouchableOpacity
                          ref={statusTriggerRef}
                          onPress={() => {
                            measureTriggerPosition(statusTriggerRef, setStatusTriggerDimensions);
                            setShowStatusDropdown(!showStatusDropdown);
                          }}
                          style={{
                            flexDirection: 'row', 
                            alignItems: 'center',
                            justifyContent: 'space-between', 
                            backgroundColor: '#ffffff',
                            borderWidth: 1,
                            borderColor: '#e1e5e9',
                            borderRadius: 6,
                            padding: 8,
                            fontSize: 12,
                            color: '#111827',
                            width: '100%'
                          }}
                        >
                          <Text style={{ 
                            fontSize: 12, 
                            color: '#111827',
                            textTransform: 'capitalize'
                          }}>
                            {newEventFormData.status === 'planned' ? 'To Do' : newEventFormData.status.replace('_', ' ')}
                        </Text>
                          <Ionicons 
                            name={showStatusDropdown ? "chevron-up" : "chevron-down"} 
                            size={14} 
                            color="#6b7280" 
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Save Button */}
                            <TouchableOpacity 
                    onPress={saveNewEventFromForm}
                    disabled={
                      !newEventFormData.title || 
                      !newEventFormData.scheduledDate ||
                      (newEventType === 'lesson' && (!newEventFormData.trackId || !newEventFormData.activityId || !newEventFormData.assignees || newEventFormData.assignees.length === 0 || !newEventFormData.timeEstimate || parseInt(newEventFormData.timeEstimate) <= 0)) ||
                      (newEventType === 'holiday' ? 
                        (holidayDateRange.isRange ? 
                          (!holidayDateRange.startDate || !holidayDateRange.endDate) : 
                          !newEventFormData.scheduledDate
                        ) : 
                        !newEventFormData.scheduledDate
                      )
                    }
                              style={{ 
                      backgroundColor: (
                        !newEventFormData.title || 
                        (newEventType === 'lesson' && (!newEventFormData.trackId || !newEventFormData.activityId)) ||
                        (newEventType === 'holiday' ? 
                          (holidayDateRange.isRange ? 
                            (!holidayDateRange.startDate || !holidayDateRange.endDate) : 
                            !newEventFormData.scheduledDate
                          ) : 
                          !newEventFormData.scheduledDate
                        )
                      ) ? '#d1d5db' : '#3b82f6',
                      padding: 10,
                      borderRadius: 8,
                      alignItems: 'center',
                      marginTop: 12
                    }}
                  >
                              <Text style={{ 
                        color: '#ffffff',
                                fontSize: 14,
                        fontWeight: '600'
                      }}>
                        Create {newEventType === 'holiday' ? 'Days Off' : newEventType.charAt(0).toUpperCase() + newEventType.slice(1)}
                    </Text>
                    </TouchableOpacity>
                                  </ScrollView>
              ) : (selectedEvent && !eventModalVisible) ? (
          selectedEvent.type === 'holiday' ? (
            // Holiday Details View
            <ScrollView 
              style={{ flex: 1, minHeight: 0 }} 
              contentContainerStyle={{ 
                padding: 16,
                paddingBottom: 60
              }}
              showsVerticalScrollIndicator={true}
              bounces={false}
              nestedScrollEnabled={true}
            >
              {/* Close Button */}
              <TouchableOpacity 
                onPress={handleCloseEvent}
                  style={{
                    position: 'absolute',
                    top: 16,
                    right: 16,
                    zIndex: 1000
                  }}
              >
                <Text style={{ fontSize: 16, color: '#6b7280' }}>✕</Text>
              </TouchableOpacity>

              {/* Holiday Header */}
              <View style={{ 
                marginBottom: 16,
                marginTop: 40,
                flexShrink: 0
              }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 8 }}>
                  {selectedEvent.title}
                </Text>
              </View>

              {/* Holiday Date */}
              <View style={{ marginBottom: 16, flexShrink: 0 }}>
                <View style={{ padding: 4 }}>
                  <Text style={{ color: '#111827', fontSize: 12 }}>
                    {selectedEvent.data?.holiday_date ? new Date(selectedEvent.data.holiday_date).toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    }) : 'Date not available'}
                  </Text>
                </View>
              </View>
            </ScrollView>
          ) : (
                  // Event Details View - Matching Add Event Form Structure
                  <ScrollView 
              style={{ flex: 1, minHeight: 0 }} 
                    contentContainerStyle={{ 
                        padding: 16,
                      paddingBottom: 60
                    }}
                    showsVerticalScrollIndicator={true}
                    bounces={false}
                    nestedScrollEnabled={true}
                  >
                    {/* Close Button - Top Right */}
                    <TouchableOpacity 
                      onPress={handleCloseEvent}
                      style={{
                        position: 'absolute',
                    top: 16,
                    right: 16,
                        zIndex: 1000
                      }}
                    >
                      <Text style={{ fontSize: 16, color: '#6b7280' }}>✕</Text>
                    </TouchableOpacity>

              {/* Title Section */}
              <View style={{ marginBottom: 16, marginTop: 40, flexShrink: 0 }}>
                    <View style={{ padding: 4 }}>
                      {editingTitle ? (
                        <View>
                          <TextInput
                            style={{
                              backgroundColor: '#ffffff',
                                      borderWidth: 1,
                              borderColor: '#e1e5e9',
                              borderRadius: 6,
                              padding: 8,
                              fontSize: 12,
                              color: '#111827',
                              marginBottom: 8,
                              minHeight: 32
                            }}
                            value={tempTitle}
                            onChangeText={setTempTitle}
                            placeholder="Title"
                            placeholderTextColor="#9ca3af"
                          />
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                              style={{
                                backgroundColor: '#10b981',
                                paddingHorizontal: 16,
                                paddingVertical: 6,
                                borderRadius: 4,
                                flex: 1
                              }}
                              onPress={handleTitleSave}
                            >
                              <Text style={{ 
                                color: 'white', 
                                fontSize: 12, 
                                textAlign: 'center', 
                                fontWeight: '500'
                              }}>
                                Save
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                              style={{
                                backgroundColor: '#f3f4f6',
                                paddingHorizontal: 16,
                                paddingVertical: 6,
                                borderRadius: 4,
                                flex: 1
                              }}
                              onPress={handleTitleCancel}
                            >
                                      <Text style={{ 
                                color: '#374151', 
                                        fontSize: 12, 
                                textAlign: 'center', 
                                        fontWeight: '500' 
                                      }}>
                                Cancel
                                      </Text>
                            </TouchableOpacity>
                                    </View>
                                </View>
                      ) : (
                        <TouchableOpacity 
                          style={{
                            padding: 8,
                            cursor: Platform.OS === 'web' ? 'pointer' : 'default'
                          }}
                      onPress={handleTitleEdit}
                          activeOpacity={0.7}
                        >
                      <Text style={{ color: '#111827', fontSize: 12 }}>
                        {selectedEvent.data?.title || selectedEvent.title || 'No title'}
                                </Text>
                        </TouchableOpacity>
                      )}
                              </View>
                      </View>

                  {/* Status Section */}
              <View style={{ marginBottom: 16, flexShrink: 0 }}>
                    <View style={{ padding: 4 }}>
                      {editingStatus ? (
                      <View style={{
                        backgroundColor: '#ffffff',
                        borderWidth: 1,
                        borderColor: '#e1e5e9',
                        borderRadius: 6,
                        padding: 8,
                          marginBottom: 8
                        }}>
                          {['planned', 'in_progress', 'completed', 'skipped'].map((status) => (
                            <TouchableOpacity 
                              key={status}
                              style={{ 
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingVertical: 6,
                                paddingHorizontal: 4
                              }}
                              onPress={() => setTempStatus(status)}
                            >
                              <View style={{
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: getStatusColor(status),
                                marginRight: 8
                              }} />
                              <Text style={{ 
                                color: tempStatus === status ? '#111827' : '#6b7280',
                                fontSize: 12,
                                fontWeight: tempStatus === status ? '500' : '400'
                              }}>
                                {(() => {
                                  switch(status) {
                                    case 'planned': return 'To Do'
                                    case 'in_progress': return 'In Progress'
                                    case 'completed': return 'Completed'
                                    case 'skipped': return 'Skipped'
                                    default: return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
                                  }
                                })()}
                    </Text>
                            </TouchableOpacity>
                          ))}
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity 
                        style={{
                                backgroundColor: '#10b981',
                          paddingHorizontal: 16,
                          paddingVertical: 6,
                                borderRadius: 4,
                                flex: 1
                              }}
                              onPress={handleStatusSave}
                            >
                              <Text style={{ 
                                color: 'white', 
                                fontSize: 12,
                                textAlign: 'center', 
                                fontWeight: '500' 
                              }}>
                                Save
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                              style={{ 
                            backgroundColor: '#f3f4f6',
                            paddingHorizontal: 16,
                            paddingVertical: 6,
                                borderRadius: 4,
                                flex: 1
                              }}
                              onPress={handleStatusCancel}
                            >
                              <Text style={{ 
                                color: '#374151', 
                                fontSize: 12, 
                                textAlign: 'center', 
                                fontWeight: '500' 
                              }}>
                                Cancel
                              </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                      ) : (
                        <TouchableOpacity 
                          style={{
                            padding: 8,
                            cursor: Platform.OS === 'web' ? 'pointer' : 'default'
                          }}
                          onPress={handleStatusEdit}
                          activeOpacity={0.7}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <View style={{
                              width: 6,
                              height: 6,
                                borderRadius: 3,
                              backgroundColor: getStatusColor((selectedEvent.data?.status || selectedEvent.status) || 'planned'),
                              marginRight: 8
                            }} />
                            <Text style={{ color: '#111827', fontSize: 12 }}>
                              {(() => {
                                const currentStatus = (selectedEvent.data?.status || selectedEvent.status) || 'planned'
                                switch(currentStatus) {
                                  case 'planned': return 'To Do'
                                  case 'in_progress': return 'In Progress'
                                  case 'completed': return 'Completed'
                                  case 'skipped': return 'Skipped'
                                  default: return currentStatus.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
                                }
                              })()}
                    </Text>
                              </View>
                            </TouchableOpacity>
                      )}
                          </View>
                  </View>

                                    {/* Time Range Section */}
              <View style={{ marginBottom: 16, flexShrink: 0 }}>
                    <View style={{ padding: 4 }}>
                      {(editingScheduledTime || editingFinishTime) ? (
                      <View>
                          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                            {/* Start Time Input */}
                        <View style={{ flex: 1, minHeight: 0 }}>
                              <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>Start Time</Text>
                              {Platform.OS === 'web' ? (
                      <View style={{
                        backgroundColor: '#ffffff',
                        borderWidth: 1,
                        borderColor: '#e1e5e9',
                        borderRadius: 6,
                        padding: 8,
                                  minHeight: 32
                                }}>
                                  <input
                                    type="time"
                                    value={tempScheduledTime}
                                    onChange={(e) => setTempScheduledTime(e.target.value)}
                              style={{ 
                                      border: 'none',
                                      outline: 'none',
                                      fontSize: 12,
                                      color: '#111827',
                                      backgroundColor: 'transparent',
                                      width: '100%',
                                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
                                    }}
                                  />
                                </View>
                              ) : (
                        <TextInput
                          style={{
                            backgroundColor: '#ffffff',
                            borderWidth: 1,
                            borderColor: '#e1e5e9',
                            borderRadius: 6,
                                    padding: 8,
                                    fontSize: 12,
                            color: '#111827',
                                    minHeight: 32
                                  }}
                                  value={tempScheduledTime}
                                  onChangeText={setTempScheduledTime}
                                  placeholder={selectedEvent.data?.scheduled_time ? "9:00" : "Add start time"}
                          placeholderTextColor="#9ca3af"
                                />
                        )}
                      </View>
                              
                            {/* Finish Time Input */}
                        <View style={{ flex: 1, minHeight: 0 }}>
                              <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>Finish Time</Text>
                              {Platform.OS === 'web' ? (
                              <View style={{
                                  backgroundColor: '#ffffff',
                                  borderWidth: 1,
                                  borderColor: '#e1e5e9',
                                  borderRadius: 6,
                                  padding: 8,
                                  minHeight: 32
                                }}>
                                  <input
                                    type="time"
                                    value={tempFinishTime}
                                    onChange={(e) => setTempFinishTime(e.target.value)}
                                    style={{
                                      border: 'none',
                                      outline: 'none',
                                      fontSize: 12,
                                color: '#111827', 
                                      backgroundColor: 'transparent',
                                      width: '100%',
                                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
                                    }}
                                  />
                                </View>
                              ) : (
                                <TextInput
                                  style={{
                                    backgroundColor: '#ffffff',
                                    borderWidth: 1,
                                    borderColor: '#e1e5e9',
                                    borderRadius: 6,
                                    padding: 8,
                                    fontSize: 12,
                                    color: '#111827',
                                    minHeight: 32
                                  }}
                                  value={tempFinishTime}
                                  onChangeText={setTempFinishTime}
                                  placeholder={selectedEvent.data?.finish_time ? "10:30" : "Add end time"}
                                  placeholderTextColor="#9ca3af"
                                />
                              )}
                            </View>
                  </View>

                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity 
                            style={{
                              backgroundColor: '#10b981',
                                paddingHorizontal: 16,
                                paddingVertical: 6,
                                borderRadius: 4,
                              flex: 1
                            }}
                            onPress={() => {
                                handleBothTimesSave()
                            }}
                          >
                            <Text style={{ 
                              color: 'white', 
                                fontSize: 12, 
                              textAlign: 'center', 
                              fontWeight: '500' 
                            }}>
                              Save
                    </Text>
                          </TouchableOpacity>
                        <TouchableOpacity 
                          style={{
                            backgroundColor: '#f3f4f6',
                            paddingHorizontal: 16,
                            paddingVertical: 6,
                                borderRadius: 4,
                              flex: 1
                            }}
                            onPress={() => {
                                handleScheduledTimeCancel()
                                handleFinishTimeCancel()
                              }}
                            >
                              <Text style={{ 
                                color: '#374151', 
                                fontSize: 12, 
                                textAlign: 'center', 
                                fontWeight: '500'
                              }}>
                                Cancel
                              </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                        <TouchableOpacity
                          style={{
                            padding: 8,
                            cursor: Platform.OS === 'web' ? 'pointer' : 'default'
                          }}
                          onPress={() => {
                            handleScheduledTimeEdit()
                            handleFinishTimeEdit()
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                            {/* Start Time Display */}
                            <View style={{ flexShrink: 0 }}>
                              <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 0 }}>Start</Text>
                              <Text style={{ color: '#111827', fontSize: 12 }}>
                            {selectedEvent.data?.scheduled_time ? (() => {
                              const time = selectedEvent.data.scheduled_time
                              const timeMatch = time.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i)
                              if (timeMatch) {
                                let hours = parseInt(timeMatch[1])
                                const minutes = timeMatch[2]
                                const period = timeMatch[3]?.toUpperCase()
                                
                                if (!period) {
                                  if (hours >= 12) {
                                    if (hours > 12) hours -= 12
                                    return `${hours}:${minutes} PM`
                                  } else {
                                    if (hours === 0) hours = 12
                                    return `${hours}:${minutes} AM`
                                  }
                                } else {
                                  return `${hours}:${minutes} ${period}`
                                }
                              }
                              return time
                            })() : 'Set time'}
                          </Text>
                        </View>

                        {/* Arrow */}
                        <Text style={{ color: '#6b7280', fontSize: 12, marginHorizontal: 0 }}>→</Text>

                        {/* Finish Time Display */}
                        <View style={{ flexShrink: 0 }}>
                          <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 0 }}>Finish</Text>
                          <Text style={{ color: '#111827', fontSize: 12 }}>
                            {(() => {
                              const finishTime = selectedEvent.data?.finish_time
                              if (finishTime) {
                                const timeMatch = finishTime.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i)
                                  if (timeMatch) {
                                    let hours = parseInt(timeMatch[1])
                                    const minutes = timeMatch[2]
                                    const period = timeMatch[3]?.toUpperCase()
                                    
                                    if (!period) {
                                      if (hours >= 12) {
                                        if (hours > 12) hours -= 12
                                        return `${hours}:${minutes} PM`
                                      } else {
                                        if (hours === 0) hours = 12
                                        return `${hours}:${minutes} AM`
                                      }
                                    } else {
                                      return `${hours}:${minutes} ${period}`
                                    }
                                  }
                                return finishTime
                              } else {
                                const scheduledTime = selectedEvent.data?.scheduled_time || selectedEvent.scheduled_time
                                const timeEstimate = selectedEvent.data?.minutes || selectedEvent.estimateMinutes || 0
                                if (scheduledTime && timeEstimate > 0) {
                                  const calculatedFinishTime = calculateFinishTime(scheduledTime, timeEstimate)
                                  return calculatedFinishTime || 'Auto-calc'
                                } else {
                                return 'Set time'
                                }
                              }
                              })()}
                      </Text>
                        </View>

                        {/* Duration Display */}
                        <View style={{ flexShrink: 0, alignSelf: 'flex-end' }}>
                          <Text style={{ color: '#9ca3af', fontSize: 12 }}>
                            {(() => {
                              const timeEstimate = selectedEvent.data?.minutes || selectedEvent.estimateMinutes || 0
                              if (timeEstimate > 0) {
                                if (timeEstimate >= 60) {
                                  const hours = Math.floor(timeEstimate / 60)
                                  const minutes = timeEstimate % 60
                                  if (minutes === 0) {
                                    return `${hours}h`
                                  } else {
                                    const decimalHours = (timeEstimate / 60).toFixed(1)
                                    return `${decimalHours}h`
                                  }
                                } else {
                                  return `${timeEstimate}m`
                                }
                              }
                              return ''
                            })()}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
                  </View>

                                    {/* Date Range Section */}
              <View style={{ marginBottom: 16, flexShrink: 0 }}>
                    <View style={{ padding: 4 }}>
                      {(editingScheduledDate || editingDueDate) ? (
                      <View>
                          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                            {/* Start Date Input */}
                        <View style={{ flex: 1, minHeight: 0 }}>
                              <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>Start Date</Text>
                        <TextInput
                          style={{
                            backgroundColor: '#ffffff',
                            borderWidth: 1,
                            borderColor: '#e1e5e9',
                            borderRadius: 6,
                                  padding: 8,
                                  fontSize: 12,
                            color: '#111827',
                                  minHeight: 32,
                                  textAlign: 'left',
                                  letterSpacing: 2
                                }}
                                value={tempScheduledDate}
                                onChangeText={(text) => {
                                  if (text.length < tempScheduledDate.length) {
                                    setTempScheduledDate(text)
                                    return
                                  }
                              let formatted = text.replace(/\D/g, '')
                                  if (formatted.length >= 2) {
                                    formatted = formatted.substring(0, 2) + '/' + formatted.substring(2)
                                  }
                                  if (formatted.length >= 5) {
                                    formatted = formatted.substring(0, 5) + '/' + formatted.substring(5, 7)
                                  }
                                  setTempScheduledDate(formatted)
                                }}
                                placeholder="MM/DD/YY"
                          placeholderTextColor="#9ca3af"
                                maxLength={8}
                                keyboardType="numeric"
                              />
                            </View>

                            {/* Due Date Input */}
                        <View style={{ flex: 1, minHeight: 0 }}>
                              <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>Due Date</Text>
                              <TextInput
                                style={{
                                  backgroundColor: '#ffffff',
                                  borderWidth: 1,
                                  borderColor: '#e1e5e9',
                                  borderRadius: 6,
                                  padding: 8,
                                  fontSize: 12,
                                  color: '#111827',
                                  minHeight: 32,
                                  textAlign: 'left',
                                  letterSpacing: 2
                                }}
                                value={tempDueDate}
                                onChangeText={(text) => {
                                  if (text.length < tempDueDate.length) {
                                    setTempDueDate(text)
                                    return
                                  }
                              let formatted = text.replace(/\D/g, '')
                                  if (formatted.length >= 2) {
                                    formatted = formatted.substring(0, 2) + '/' + formatted.substring(2)
                                  }
                                  if (formatted.length >= 5) {
                                    formatted = formatted.substring(0, 5) + '/' + formatted.substring(5, 7)
                                  }
                                  setTempDueDate(formatted)
                                }}
                                placeholder="MM/DD/YY"
                                placeholderTextColor="#9ca3af"
                                maxLength={8}
                                keyboardType="numeric"
                              />
                            </View>
                          </View>

                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity 
                            style={{
                              backgroundColor: '#10b981',
                                paddingHorizontal: 16,
                                paddingVertical: 6,
                                borderRadius: 4,
                              flex: 1
                            }}
                            onPress={() => {
                                handleScheduledDateSave()
                                handleDueDateSave()
                            }}
                          >
                            <Text style={{ 
                              color: 'white', 
                                fontSize: 12, 
                              textAlign: 'center', 
                              fontWeight: '500' 
                            }}>
                              Save
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={{
                              backgroundColor: '#f3f4f6',
                          paddingHorizontal: 16,
                          paddingVertical: 6,
                                borderRadius: 4,
                              flex: 1
                            }}
                            onPress={() => {
                                handleScheduledDateCancel()
                                handleDueDateCancel()
                              }}
                            >
                              <Text style={{ 
                                color: '#374151', 
                                fontSize: 12, 
                                textAlign: 'center', 
                                fontWeight: '500' 
                              }}>
                                Cancel
                              </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                        <TouchableOpacity
                          style={{
                            padding: 8,
                            cursor: Platform.OS === 'web' ? 'pointer' : 'default'
                          }}
                          onPress={() => {
                            handleScheduledDateEdit()
                            handleDueDateEdit()
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                            {/* Start Date Display */}
                            <View style={{ flexShrink: 0 }}>
                              <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 0 }}>Start</Text>
                              <Text style={{ color: '#111827', fontSize: 12 }}>
                            {selectedEvent.data?.scheduled_date ? (() => {
                              const date = new Date(selectedEvent.data.scheduled_date)
                              const month = (date.getMonth() + 1).toString().padStart(2, '0')
                              const day = date.getDate().toString().padStart(2, '0')
                              const year = date.getFullYear().toString().slice(-2)
                              return `${month}/${day}/${year}`
                            })() : 'Set date'}
                      </Text>
                  </View>

                            {/* Arrow */}
                            <Text style={{ color: '#6b7280', fontSize: 12, marginHorizontal: 0 }}>→</Text>

                            {/* Due Date Display */}
                            <View style={{ flexShrink: 0 }}>
                              <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 0 }}>Due</Text>
                              <Text style={{ color: '#111827', fontSize: 12 }}>
                            {selectedEvent.data?.due_date ? 
                              (() => {
                                const [year, month, day] = selectedEvent.data.due_date.split('-')
                                const dueDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
                                const formattedDate = `${dueDate.getMonth() + 1}/${dueDate.getDate()}/${dueDate.getFullYear()}`
                                return formattedDate
                              })() : 
                              'Set date'
                            }
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              {/* Assignee Section */}
              <View style={{ marginBottom: 16, flexShrink: 0 }}>
                <View style={{ padding: 4 }}>
                  {editingAssignee ? (
                    <View style={{
                      backgroundColor: '#ffffff',
                      borderWidth: 1,
                      borderColor: '#e1e5e9',
                      borderRadius: 6,
                      padding: 8,
                      marginBottom: 8
                    }}>
                      {/* Children options */}
                      {children.map(child => (
                        <TouchableOpacity 
                          key={child.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 6,
                            paddingHorizontal: 4
                          }}
                          onPress={() => {
                            const assignee = child.first_name
                            if (tempAssignee.includes(assignee)) {
                              setTempAssignee(tempAssignee.filter(a => a !== assignee))
                            } else {
                              setTempAssignee([...tempAssignee, assignee])
                            }
                          }}
                        >
                          <View style={{
                            width: 14,
                            height: 14,
                            borderWidth: 1,
                            borderColor: '#d1d5db',
                            borderRadius: 3,
                            marginRight: 8,
                            backgroundColor: tempAssignee.includes(child.first_name) ? '#3b82f6' : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            {tempAssignee.includes(child.first_name) && (
                              <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>✓</Text>
                            )}
                          </View>
                          <Text style={{ 
                            color: tempAssignee.includes(child.first_name) ? '#111827' : '#6b7280',
                            fontSize: 12,
                            fontWeight: tempAssignee.includes(child.first_name) ? '500' : '400'
                          }}>
                            {child.first_name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      
                      {/* Parent option */}
                      <TouchableOpacity 
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 6,
                          paddingHorizontal: 4
                        }}
                        onPress={() => {
                          const assignee = 'Parent'
                          if (tempAssignee.includes(assignee)) {
                            setTempAssignee(tempAssignee.filter(a => a !== assignee))
                          } else {
                            setTempAssignee([...tempAssignee, assignee])
                          }
                        }}
                      >
                        <View style={{
                          width: 14,
                          height: 14,
                          borderWidth: 1,
                          borderColor: '#d1d5db',
                          borderRadius: 3,
                          marginRight: 8,
                          backgroundColor: tempAssignee.includes('Parent') ? '#3b82f6' : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {tempAssignee.includes('Parent') && (
                            <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>✓</Text>
                          )}
                        </View>
                        <Text style={{ 
                          color: tempAssignee.includes('Parent') ? '#111827' : '#6b7280',
                          fontSize: 12,
                          fontWeight: tempAssignee.includes('Parent') ? '500' : '400'
                        }}>
                          Parent
                        </Text>
                      </TouchableOpacity>
                      
                      {/* Clear All option */}
                      <TouchableOpacity 
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 6,
                          paddingHorizontal: 4,
                          borderTopWidth: 1,
                          borderTopColor: '#e5e7eb',
                          marginTop: 8,
                          paddingTop: 8
                        }}
                        onPress={() => setTempAssignee([])}
                      >
                        <Text style={{ 
                          color: '#dc2626', 
                          fontSize: 12,
                          fontWeight: '500'
                        }}>
                          Clear All Assignees
                        </Text>
                      </TouchableOpacity>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <TouchableOpacity 
                          style={{
                            backgroundColor: '#10b981',
                            paddingHorizontal: 16,
                            paddingVertical: 6,
                            borderRadius: 4,
                            flex: 1
                          }}
                          onPress={handleAssigneeSave}
                        >
                          <Text style={{ 
                            color: 'white', 
                            fontSize: 12, 
                            textAlign: 'center', 
                            fontWeight: '500' 
                          }}>
                            Save
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={{
                            backgroundColor: '#f3f4f6',
                            paddingHorizontal: 16,
                            paddingVertical: 6,
                            borderRadius: 4,
                            flex: 1
                          }}
                          onPress={handleAssigneeCancel}
                        >
                          <Text style={{ 
                            color: '#374151', 
                            fontSize: 12, 
                            textAlign: 'center', 
                            fontWeight: '500' 
                          }}>
                            Cancel
                          </Text>
                        </TouchableOpacity>
                            </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={{
                        padding: 8,
                        cursor: Platform.OS === 'web' ? 'pointer' : 'default'
                      }}
                      onPress={handleAssigneeEdit}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <UserCircle size={14} color="#6b7280" style={{ marginRight: 8 }} />
                        <Text style={{ color: '#111827', fontSize: 12 }}>
                          {(() => {
                            const assignees = getCurrentAssignees()
                            if (assignees.length === 0) return 'Not assigned'
                            return assignees.join(', ')
                          })()}
                        </Text>
                          </View>
                      </TouchableOpacity>
                    )}
                    </View>
                  </View>

                  {/* Description Section */}
              <View style={{ marginBottom: 16, flexShrink: 0 }}>
                    <View style={{ padding: 4 }}>
                    {isEditingEvent ? (
                      <View>
                        <TextInput
                          style={{
                            backgroundColor: '#ffffff',
                            borderWidth: 1,
                            borderColor: '#e1e5e9',
                            borderRadius: 6,
                              padding: 8,
                              fontSize: 12,
                            color: '#111827',
                              minHeight: 60,
                            textAlignVertical: 'top',
                              marginBottom: 8
                          }}
                            value={editedEventData.description || selectedEvent.data?.description || selectedEvent.description || ''}
                          onChangeText={(text) => setEditedEventData({...editedEventData, description: text})}
                            placeholder="Description"
                          placeholderTextColor="#9ca3af"
                          multiline={true}
                          numberOfLines={4}
                        />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={{
                            backgroundColor: '#10b981',
                                paddingHorizontal: 16,
                                paddingVertical: 6,
                                borderRadius: 4,
                            flex: 1
                          }}
                            onPress={() => {
                                const newDescription = editedEventData.description || selectedEvent.data?.description || selectedEvent.description || '';
                              handleDescriptionChange(newDescription);
                              setIsEditingEvent(false);
                              setEditedEventData({});
                            }}
                          >
                            <Text style={{ 
                              color: 'white', 
                                fontSize: 12, 
                              textAlign: 'center', 
                              fontWeight: '500' 
                            }}>
                              Save
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{
                              backgroundColor: '#f3f4f6',
                                paddingHorizontal: 16,
                                paddingVertical: 6,
                                borderRadius: 4,
                            flex: 1
                          }}
                            onPress={() => {
                              setIsEditingEvent(false);
                              setEditedEventData({});
                            }}
                        >
                              <Text style={{ color: '#6b7280', fontSize: 12, textAlign: 'center' }}>Cancel</Text>
                        </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={{
                            padding: 8,
                            cursor: Platform.OS === 'web' ? 'pointer' : 'default'
                          }}
                          onPress={() => setIsEditingEvent(true)}
                          activeOpacity={0.7}
                        >
                      <Text style={{ 
                            fontSize: 12, 
                            color: (selectedEvent.data?.description || selectedEvent.description) ? '#111827' : '#9ca3af',
                            fontStyle: (selectedEvent.data?.description || selectedEvent.description) ? 'normal' : 'italic',
                            lineHeight: 16
                          }}>
                            {selectedEvent.data?.description || selectedEvent.description || 'Description'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                </ScrollView>
          )
              ) : (
          // Default Right Pane Content
                <ScrollView 
                  showsVerticalScrollIndicator={true}
                  contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
                  nestedScrollEnabled={true}
            style={{ flex: 1, minHeight: 0 }}
                >
                                {/* Search Section */}
            <View style={{ marginBottom: 24, flexShrink: 0 }}>
                  <View 
                    style={{
                      backgroundColor: isSearchFocused ? '#ffffff' : '#f8fafc',
                    borderRadius: 8,
                    borderWidth: 1,
                      borderColor: isSearchFocused ? '#e1e5e9' : 'transparent',
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                      elevation: 1,
                  transition: 'all 0.2s ease'
                    }}
                    {...(typeof window !== 'undefined' && {
                      onMouseEnter: (e) => {
                        if (!isSearchFocused) {
                          e.target.style.borderColor = '#e1e5e9';
                        }
                      },
                      onMouseLeave: (e) => {
                        if (!isSearchFocused) {
                          e.target.style.borderColor = 'transparent';
                        }
                      }
                    })}
                  >
                    <TextInput
                      style={{ 
                        fontSize: 14, 
                        color: '#374151',
                        backgroundColor: 'transparent',
                        borderWidth: 0,
                        padding: 0,
                        margin: 0,
                        outline: 'none'
                      }}
                      placeholder="Search events"
                      placeholderTextColor="#9ca3af"
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      onSubmitEditing={handleSearch}
                      onFocus={() => setIsSearchFocused(true)}
                      onBlur={() => setIsSearchFocused(false)}
                    />
                  </View>
              {searchQuery.length > 0 && (
                <TouchableOpacity 
                  onPress={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: 16,
                    top: 6,
                    padding: 4
                  }}
                >
                  <Text style={{ color: '#9ca3af', fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            
            {/* Search Results Section */}
              {searchQuery.length > 0 && (
                <View style={{ 
                height: 'calc(100vh - 120px)',
                  overflow: 'hidden'
                }}>
                  <Text style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: '#111827',
                    marginBottom: 12
                  }}>
                    Search Results
                  </Text>
                  {isSearching ? (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 0 }}>
                    <Text style={{ color: '#6b7280', textAlign: 'center' }}>Searching...</Text>
                    </View>
                  ) : searchResults.length > 0 ? (
                    <ScrollView 
                    style={{ height: 'calc(100vh - 180px)' }}
                      showsVerticalScrollIndicator={true}
                      contentContainerStyle={{ paddingBottom: 20 }}
                    >
                  <View style={{ gap: 8 }}>
                    {searchResults.map((result, index) => (
                        <TouchableOpacity
                        key={`search-result-${index}`}
                        style={{
                          backgroundColor: '#ffffff',
                          borderRadius: 6,
                          padding: 12,
                          borderWidth: 1,
                          borderColor: '#e1e5e9'
                        }}
                          onPress={() => {
                            handleEventSelect(result);
                          }}
                        >
                          <Text style={{
                            fontSize: 14,
                          fontWeight: '500',
                            color: '#111827',
                          marginBottom: 4
                          }}>
                          {result.title}
                          </Text>
                          <Text style={{
                            fontSize: 12,
                          color: '#6b7280'
                          }}>
                          {result.type} • {result.childName} • {result.date}
                          </Text>
                        </TouchableOpacity>
                    ))}
                    </View>
                    </ScrollView>
                  ) : (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 0 }}>
                    <Text style={{ color: '#6b7280', textAlign: 'center' }}>
                      No results found
                    </Text>
                    </View>
                  )}
                </View>
              )}
              
            {/* Today's Schedule Section */}
            {!searchQuery && (
              <View style={{ marginTop: 20, flexShrink: 0 }}>
                <Text style={{
                  fontSize: 14,
                  color: '#6b7280',
                  textAlign: 'left'
                }}>
                  Nothing scheduled for today
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </>
    );
  }, [activeTab, calendarView, showNewEventForm, selectedEvent, searchQuery, isSearching, searchResults, newEventType, showEventTypeDropdown, isSearchFocused, onRightSidebarRender, closeNewEventForm, handleCloseEvent, handleEventSelect, handleSearch, newEventFormData, setNewEventFormData, holidayDateRange, setHolidayDateRange, holidayRepeat, setHolidayRepeat, availableTracks, availableActivities, trackTriggerRef, activityTriggerRef, statusTriggerRef, measureTriggerPosition, setShowTrackDropdown, setShowActivityDropdown, setShowStatusDropdown, setTrackTriggerDimensions, setActivityTriggerDimensions, setStatusTriggerDimensions, saveNewEventFromForm, editingTitle, tempTitle, handleTitleEdit, handleTitleSave, handleTitleCancel, editingStatus, tempStatus, handleStatusEdit, handleStatusSave, handleStatusCancel, editingScheduledTime, editingFinishTime, tempScheduledTime, tempFinishTime, handleScheduledTimeEdit, handleFinishTimeEdit, handleBothTimesSave, handleScheduledTimeCancel, handleFinishTimeCancel, editingScheduledDate, editingDueDate, tempScheduledDate, tempDueDate, handleScheduledDateEdit, handleDueDateEdit, handleScheduledDateSave, handleDueDateSave, handleScheduledDateCancel, handleDueDateCancel, editingAssignee, tempAssignee, handleAssigneeEdit, handleAssigneeSave, handleAssigneeCancel, isEditingEvent, editedEventData, setIsEditingEvent, setEditedEventData, handleDescriptionChange, children, getStatusColor, getCurrentAssignees, calculateFinishTime]);

  // Memoize right sidebar content to avoid infinite loops
  const rightSidebarContent = React.useMemo(() => {
    if (!onRightSidebarRender) return null;
    
    if (activeTab !== 'planner' && activeTab !== 'calendar-planning' && calendarView !== 'month') {
      return null;
    }

    return getRightSidebarContent();
  }, [activeTab, calendarView, showNewEventForm, selectedEvent, searchQuery, isSearching, searchResults, newEventType, showEventTypeDropdown, isSearchFocused, onRightSidebarRender, eventModalVisible]);

  // Track previous content key to avoid unnecessary updates
  const prevContentKeyRef = React.useRef(null);
  
  // Notify parent about right sidebar content only when it actually changes
  useEffect(() => {
    if (!onRightSidebarRender) return;
    
    // Create a key from the actual values that determine the content
    const contentKey = JSON.stringify({
      activeTab,
      calendarView,
      showNewEventForm,
      selectedEventId: selectedEvent?.id,
      searchQuery,
      isSearching,
      searchResultsCount: searchResults.length,
      newEventType,
      showEventTypeDropdown,
      isSearchFocused,
      editingTitle,
      editingStatus,
      editingScheduledTime,
      editingFinishTime,
      editingScheduledDate,
      editingDueDate,
      editingAssignee,
      isEditingEvent,
      eventModalVisible
    });
    
    // Only update if the key actually changed
    if (prevContentKeyRef.current !== contentKey) {
      prevContentKeyRef.current = contentKey;
      const content = getRightSidebarContent();
      onRightSidebarRender(content);
    }
  }, [activeTab, calendarView, showNewEventForm, selectedEvent, searchQuery, isSearching, searchResults, newEventType, showEventTypeDropdown, isSearchFocused, editingTitle, editingStatus, editingScheduledTime, editingFinishTime, editingScheduledDate, editingDueDate, editingAssignee, isEditingEvent, eventModalVisible, onRightSidebarRender, getRightSidebarContent]);

  // Convert calendarEvents object to array format for CenterPane
  const convertCalendarEventsToArray = () => {
    const eventsArray = [];
    Object.entries(calendarEvents).forEach(([dateKey, dayEvents]) => {
      if (Array.isArray(dayEvents)) {
        dayEvents.forEach(event => {
          if (event && event.id) {
            // Parse the date from dateKey (YYYY-MM-DD) as LOCAL date, not UTC
            // This prevents timezone shifts (e.g., Nov 20 UTC midnight = Nov 19 EST evening)
            const [year, month, day] = dateKey.split('-').map(Number);
            let date = new Date(year, month - 1, day); // month is 0-indexed in JS, creates LOCAL date
            
            // Use start_ts from event data if available (preserves exact time)
            if (event.data?.start_ts) {
              const tsDate = new Date(event.data.start_ts);
              if (!isNaN(tsDate.getTime())) {
                // Extract local date components to verify it matches dateKey
                const tsYear = tsDate.getFullYear();
                const tsMonth = tsDate.getMonth() + 1;
                const tsDay = tsDate.getDate();
                
                // If the timestamp's local date matches dateKey, use the timestamp
                // Otherwise, use the dateKey date with parsed time
                if (tsYear === year && tsMonth === month && tsDay === day) {
                  date = tsDate; // Use the full timestamp
                } else if (event.time) {
                  // Date mismatch - use dateKey date with parsed time
                  const timeMatch = event.time.match(/(\d{1,2}):(\d{2})/);
                  if (timeMatch) {
                    let hours = parseInt(timeMatch[1]);
                    const minutes = parseInt(timeMatch[2]);
                    if (event.time.includes('PM') && hours !== 12) hours += 12;
                    if (event.time.includes('AM') && hours === 12) hours = 0;
                    date.setHours(hours, minutes, 0, 0);
                  }
                }
              } else if (event.time) {
                // Invalid timestamp, fall back to parsing time string
                const timeMatch = event.time.match(/(\d{1,2}):(\d{2})/);
                if (timeMatch) {
                  let hours = parseInt(timeMatch[1]);
                  const minutes = parseInt(timeMatch[2]);
                  if (event.time.includes('PM') && hours !== 12) hours += 12;
                  if (event.time.includes('AM') && hours === 12) hours = 0;
                  date.setHours(hours, minutes, 0, 0);
                }
              }
            } else if (event.time) {
              // No start_ts, parse time string (e.g., "9:00 AM" or "09:00")
              const timeMatch = event.time.match(/(\d{1,2}):(\d{2})/);
              if (timeMatch) {
                let hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                // Check for AM/PM
                if (event.time.includes('PM') && hours !== 12) hours += 12;
                if (event.time.includes('AM') && hours === 12) hours = 0;
                date.setHours(hours, minutes, 0, 0);
              }
            }
            // Ensure color is valid for EventChip (teal, violet, amber, sky)
            const validColors = ['teal', 'violet', 'amber', 'sky'];
            let eventColor = event.color || 'teal';
            if (!validColors.includes(eventColor)) {
              // Map invalid colors to valid ones
              if (eventColor === 'blue') eventColor = 'sky';
              else if (eventColor === 'orange') eventColor = 'amber';
              else eventColor = 'teal'; // Default fallback
            }
            
            eventsArray.push({
              id: event.id,
              title: event.title || 'Untitled Event',
              start: date.toISOString(),
              childId: event.childId || event.student_id || event.data?.child_id,
              subject: event.subject || event.subjectName || event.data?.subject_name,
              color: eventColor,
              status: event.status || event.data?.status || 'scheduled',
              type: event.type,
              year_plan_id: event.year_plan_id || event.data?.year_plan_id, // Preserve year_plan_id
              ...event
            });
          }
        });
      }
    });
    return eventsArray;
  };

  const renderPlannerContent = () => {
    console.log('[Planner] renderPlannerContent called');
    if (!familyId) {
      return (
        <View style={styles.content}>
          <Text style={styles.title}>Planner</Text>
          <Text style={styles.subtitle}>Loading family information...</Text>
        </View>
      );
    }

    // Show loading state for initial calendar load
    if (!isCalendarDataLoaded || calendarDataLoading) {
      return (
        <View style={styles.content}>
          <Text style={styles.title}>Planner</Text>
          <Text style={styles.subtitle}>Pre-loading calendar data...</Text>
          <View style={{ 
            marginTop: 20,
            alignItems: 'center' 
          }}>
            <Animated.View style={[styles.loadingSpinner, { transform: [{ rotate: spin }] }]} />
            <Text style={{
              marginTop: 16,
              fontSize: 14,
              color: '#6b7280',
              textAlign: 'center'
            }}>
              Loading entire year of calendar events...
            </Text>
            <Text style={{
              marginTop: 8,
              fontSize: 12,
              color: '#9ca3af',
              textAlign: 'center'
            }}>
              This will make navigation instant!
            </Text>
          </View>
        </View>
      );
    }

    const eventsArray = convertCalendarEventsToArray();
    const filters = {
      childIds: selectedCalendarChildren,
      subjects: null // Can be added later if needed
    };

    return (
      <View style={{ flex: 1, backgroundColor: 'white' }}>
        <CenterPane
          date={currentMonth}
          events={eventsArray}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onEventSelect={handleEventSelect}
          onEventComplete={handleEventComplete}
          onEventRightClick={(event, nativeEvent) => {
            console.log('[WebContent] CenterPane right-click on event:', event?.title);
            if (typeof window !== 'undefined' && nativeEvent) {
              // Prevent default if it's a native event
              if (nativeEvent.preventDefault) {
                nativeEvent.preventDefault();
              }
              
              // Get position from event (handle both native and synthetic events)
              const clientX = nativeEvent.clientX || (nativeEvent.nativeEvent && nativeEvent.nativeEvent.clientX) || (typeof window !== 'undefined' && window.event && window.event.clientX) || 0;
              const clientY = nativeEvent.clientY || (nativeEvent.nativeEvent && nativeEvent.nativeEvent.clientY) || (typeof window !== 'undefined' && window.event && window.event.clientY) || 0;
              
              // Create context menu directly in DOM (same pattern as PlannerWeek)
              const existingMenu = document.getElementById('context-menu');
              if (existingMenu) {
                existingMenu.remove();
              }
              
              const menu = document.createElement('div');
              menu.id = 'context-menu';
              menu.style.cssText = `
                position: fixed;
                top: ${clientY}px;
                left: ${clientX}px;
                background-color: #ffffff;
                border-radius: 12px;
                border: 1px solid #e5e7eb;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
                z-index: 999999;
                min-width: 200px;
                padding: 8px 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              `;
              
              const menuItems = [];
              
              menuItems.push({ text: 'Edit Event', action: () => handleEventSelect(event) });
              
              // Add "Add reflection" option for completed events
              if (event.status === 'done') {
                menuItems.push({ 
                  text: 'Add reflection...', 
                  action: () => {
                    setOutcomeEvent(event);
                    setShowOutcomeModal(true);
                  }
                });
              }
              
              // Add rebalance option if event has year_plan_id (check multiple possible field names)
              const yearPlanId = event.year_plan_id || event.yearPlanId;
              console.log('[WebContent] Event year_plan_id check:', { 
                eventId: event.id, 
                title: event.title,
                year_plan_id: event.year_plan_id,
                yearPlanId: event.yearPlanId,
                hasYearPlanId: !!yearPlanId,
                allKeys: Object.keys(event),
                eventData: event // Log full event for debugging
              });
              if (yearPlanId) {
                console.log('[WebContent] Adding Rebalance option for event:', event.title, 'yearPlanId:', yearPlanId);
              } else {
                console.log('[WebContent] NO year_plan_id found for event:', event.title, '- Rebalance option will NOT appear');
              }
              if (yearPlanId) {
                menuItems.push({ 
                  text: 'Rebalance subject from here...', 
                  action: () => {
                    // Dispatch custom event to open rebalance modal
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('openRebalanceModal', {
                        detail: { event, yearPlanId: yearPlanId }
                      }));
                    }
                  }
                });
              }
              
              menuItems.push({ text: 'Delete Event', action: () => {
                if (window.confirm('Are you sure you want to delete this event?')) {
                  console.log('Delete event:', event.id);
                  // TODO: Implement delete logic
                }
              }, isDelete: true });
              
              menuItems.forEach((item, index) => {
                const div = document.createElement('div');
                div.style.cssText = `
                  padding: 16px 24px;
                  color: ${item.isDelete ? '#dc2626' : '#374151'};
                  font-size: 15px;
                  font-weight: 500;
                  cursor: pointer;
                  transition: all 0.15s ease;
                  border-bottom: ${index < menuItems.length - 1 ? '1px solid #f3f4f6' : 'none'};
                `;
                
                div.addEventListener('mouseenter', () => {
                  div.style.backgroundColor = item.isDelete ? '#fef2f2' : '#f8fafc';
                });
                
                div.addEventListener('mouseleave', () => {
                  div.style.backgroundColor = 'transparent';
                });
                
                div.textContent = item.text;
                div.addEventListener('click', () => {
                  item.action();
                  menu.remove();
                });
                menu.appendChild(div);
              });
              
              document.body.appendChild(menu);
              
              const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                  menu.remove();
                  document.removeEventListener('click', closeMenu);
                }
              };
              setTimeout(() => document.addEventListener('click', closeMenu), 100);
            }
          }}
          onCreateTask={() => {
            setTaskModalDate(selectedDate || new Date());
            setShowTaskModal(true);
          }}
          filters={filters}
        />
        
        {/* Task Create Modal */}
        <TaskCreateModal
          visible={showTaskModal}
          onClose={() => setShowTaskModal(false)}
          defaultDate={taskModalDate}
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
            // Refresh calendar data after task creation
            await refreshCalendarData();
          }}
        />
        <EventModal
          visible={eventModalVisible}
          eventId={eventModalEventId}
          initialEvent={eventModalInitialEvent}
          onClose={() => {
            setEventModalVisible(false);
            setEventModalEventId(null);
            setEventModalInitialEvent(null);
          }}
          onEventUpdated={async () => {
            await refreshCalendarData();
          }}
          onEventDeleted={async () => {
            await refreshCalendarData();
            setEventModalVisible(false);
            setEventModalEventId(null);
            setEventModalInitialEvent(null);
          }}
          onEventPatched={handleEventModalPatched}
          familyMembers={children.map(child => ({
            id: child.id,
            name: child.first_name || child.name || 'Unknown',
          }))}
        />
      </View>
    );
  };

  const renderCalendarContent = () => {
    if (!familyId) {
                    return (
        <View style={styles.content}>
          <Text style={styles.title}>Calendar</Text>
          <Text style={styles.subtitle}>Loading family information...</Text>
        </View>
      )
    }

    // Show Month View (original calendar)
    if (!familyId) {
                                return (
        <View style={styles.content}>
          <Text style={styles.title}>Calendar</Text>
          <Text style={styles.subtitle}>Loading family information...</Text>
        </View>
      )
    }

    // Show loading state for initial calendar load
    if (!isCalendarDataLoaded || calendarDataLoading) {
      return (
        <View style={styles.content}>
          <Text style={styles.title}>Calendar</Text>
          <Text style={styles.subtitle}>Pre-loading calendar data...</Text>
          <View style={{ 
            marginTop: 20,
            alignItems: 'center' 
          }}>
            <Animated.View style={[styles.loadingSpinner, { transform: [{ rotate: spin }] }]} />
                            <Text style={{
              marginTop: 16,
                                            fontSize: 14,
              color: '#6b7280',
              textAlign: 'center'
            }}>
              Loading entire year of calendar events...
                            </Text>
                                          <Text style={{
              marginTop: 8,
                                            fontSize: 12,
              color: '#9ca3af',
              textAlign: 'center'
                                          }}>
              This will make navigation instant!
                                          </Text>
                                        </View>
        </View>
      )
    }

    const goToPreviousMonth = () => {
      setCurrentMonth(prev => {
        const newDate = new Date(prev);
        newDate.setMonth(prev.getMonth() - 1);
        return newDate;
      });
    };

    const goToNextMonth = () => {
      setCurrentMonth(prev => {
        const newDate = new Date(prev);
        newDate.setMonth(prev.getMonth() + 1);
        return newDate;
      });
    };

    const goToToday = () => {
      setCurrentMonth(new Date());
    };

    const formatMonthYear = (date) => {
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };
                                
                                return (
          <View style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: '#ffffff', flexDirection: 'row', overflow: 'visible', minHeight: 0, height: Platform.OS === 'web' ? '100vh' : undefined, display: 'flex', width: '100%', margin: 0, padding: 0 }}>
                         {/* Center Column - Calendar */}
             <View style={{ flex: 1, paddingTop: 0, paddingBottom: 0, paddingHorizontal: 0, alignSelf: 'stretch', minHeight: 0, flexDirection: 'column', height: Platform.OS === 'web' ? '100vh' : undefined, overflow: 'visible', width: 'calc(100% + 32px)', marginLeft: -16, marginRight: -16, backgroundColor: '#ffffff' }}>



               {/* Calendar Header */}
               <View style={{ 
                 flexDirection: 'row', 
                 alignItems: 'center', 
                 justifyContent: 'space-between',
                 marginBottom: 16,
                 paddingHorizontal: 16,
                 flexShrink: 0,
                 width: '100%'
               }}>
                 {/* Month/Year Title - Left Aligned */}
                 <Text style={{ fontSize: 24, fontWeight: '600', color: '#111827' }}>
                   {formatMonthYear(currentMonth)}
                 </Text>
                 
                 {/* Filters - Center */}
                 <View style={{ 
                   flexDirection: 'row', 
                   alignItems: 'center',
                   gap: 16,
                   flexShrink: 0
                 }}>
                   {/* Child Filters */}
                   <View style={{ 
                     flexDirection: 'row', 
                     alignItems: 'center',
                     gap: 8
                   }}>
                     {children.map((child) => {
                       const isSelected = selectedCalendarChildren === null || selectedCalendarChildren.includes(child.id);
                       return (
                                    <TouchableOpacity
                           key={child.id}
                                      style={{
                             flexDirection: 'row',
                     alignItems: 'center',
                             paddingVertical: 4,
                             paddingHorizontal: 8,
                             borderRadius: 6,
                             backgroundColor: isSelected ? '#eff6ff' : '#f9fafb',
                     borderWidth: 1,
                             borderColor: isSelected ? '#3b82f6' : '#e5e7eb',
                             gap: 6
                           }}
                           onPress={() => {
                             if (selectedCalendarChildren === null) {
                               const otherChildren = children
                                 .filter(c => c.id !== child.id)
                                 .map(c => c.id);
                               setSelectedCalendarChildren(otherChildren.length > 0 ? otherChildren : null);
                             } else if (isSelected) {
                               const newSelection = selectedCalendarChildren.filter(id => id !== child.id);
                               setSelectedCalendarChildren(newSelection.length === 0 ? null : newSelection);
                             } else {
                               setSelectedCalendarChildren([...selectedCalendarChildren, child.id]);
                             }
                           }}
                         >
                           <View style={{
                             width: 14,
                             height: 14,
                             borderWidth: 2,
                             borderColor: isSelected ? '#3b82f6' : '#d1d5db',
                             backgroundColor: isSelected ? '#3b82f6' : 'transparent',
                             borderRadius: 3,
                             alignItems: 'center',
                             justifyContent: 'center'
                           }}>
                             {isSelected && (
                                          <Text style={{
                                 color: '#ffffff',
                                 fontSize: 8,
                                 fontWeight: 'bold'
                               }}>
                                 ✓
                                          </Text>
                             )}
                                        </View>
                                          <Text style={{
                             color: isSelected ? '#1e40af' : '#6b7280', 
                                            fontSize: 12,
                             fontWeight: isSelected ? '500' : '400'
                                          }}>
                             {child.first_name}
                                          </Text>
                                    </TouchableOpacity>
                                );
                              })}
                            </View>

                   {/* Holiday Filter */}
                 <TouchableOpacity
                   style={{
                       flexDirection: 'row',
                     alignItems: 'center',
                       paddingVertical: 4,
                       paddingHorizontal: 8,
                       borderRadius: 6,
                       backgroundColor: showHolidays ? '#eff6ff' : '#f9fafb',
                     borderWidth: 1,
                       borderColor: showHolidays ? '#3b82f6' : '#e5e7eb',
                       gap: 6
                     }}
                     onPress={() => setShowHolidays(!showHolidays)}
                   >
                     <View style={{
                       width: 14,
                       height: 14,
                       borderWidth: 2,
                       borderColor: showHolidays ? '#3b82f6' : '#d1d5db',
                       backgroundColor: showHolidays ? '#3b82f6' : 'transparent',
                       borderRadius: 3,
                       alignItems: 'center',
                       justifyContent: 'center'
                     }}>
                       {showHolidays && (
                      <Text style={{
                           color: '#ffffff',
                           fontSize: 8,
                           fontWeight: 'bold'
                         }}>
                           ✓
                      </Text>
                        )}
                    </View>
                     <Text style={{ 
                       color: showHolidays ? '#1e40af' : '#6b7280', 
                       fontSize: 12,
                       fontWeight: showHolidays ? '500' : '400'
                     }}>
                       Holidays
                    </Text>
                 </TouchableOpacity>
                 </View>
                 
                 {/* Navigation Buttons - Right Aligned */}
                 <View style={{ 
                   flexDirection: 'row', 
                   alignItems: 'center',
                   gap: 8,
                   flexShrink: 0
                 }}>
                    <TouchableOpacity
              onPress={goToPreviousMonth}
                      style={{
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: '#e1e5e9',
                       paddingHorizontal: 8, 
                       paddingVertical: 8,
                       minHeight: 24,
                       alignItems: 'center',
                       justifyContent: 'center'
                     }}
                   >
                     <Text style={{ color: '#374151', fontSize: 16 }}>‹</Text>
                    </TouchableOpacity>
               
                 <TouchableOpacity
                  onPress={() => {
                       const today = new Date();
                       const currentMonthYear = currentMonth.getFullYear() * 12 + currentMonth.getMonth();
                       const todayMonthYear = today.getFullYear() * 12 + today.getMonth();
                       
                       if (currentMonthYear !== todayMonthYear) {
                         setCurrentMonth(today);
                       }
                  }}
                   style={{
                       borderRadius: 6, 
                       borderWidth: 1,
                       borderColor: '#e1e5e9', 
                       paddingHorizontal: 8, 
                       paddingVertical: 8,
                       minHeight: 24,
                     alignItems: 'center',
                       justifyContent: 'center'
                   }}
                 >
                     <Text style={{ color: '#374151', fontSize: 12, fontWeight: '500' }}>Today</Text>
                 </TouchableOpacity>
                 
                 <TouchableOpacity
              onPress={goToNextMonth}
                   style={{
                       borderRadius: 6, 
                    borderWidth: 1,
                       borderColor: '#e1e5e9', 
                       paddingHorizontal: 8, 
                       paddingVertical: 8,
                       minHeight: 24,
                     alignItems: 'center',
                       justifyContent: 'center'
                   }}
                 >
                     <Text style={{ color: '#374151', fontSize: 16 }}>›</Text>
                 </TouchableOpacity>
                 
                 <TouchableOpacity
                     onPress={openNewEventForm}
                   style={{
                       borderRadius: 6, 
                       borderWidth: 1,
                       borderColor: '#e1e5e9', 
                       paddingHorizontal: 6, 
                       paddingVertical: 2,
                       minHeight: 24,
                     alignItems: 'center',
                       justifyContent: 'center'
                   }}
                 >
                     <Text style={{ color: '#374151', fontSize: 16 }}>+</Text>
                 </TouchableOpacity>

                 <TouchableOpacity
                     onPress={() => {
                       setTaskModalDate(new Date());
                       setShowTaskModal(true);
                     }}
                   style={{
                       backgroundColor: '#d4a256',
                     borderRadius: 8,
                       paddingHorizontal: 12,
                     paddingVertical: 6,
                       minHeight: 24,
                     alignItems: 'center',
                       justifyContent: 'center'
                   }}
                 >
                     <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '600' }}>Add Task</Text>
                 </TouchableOpacity>

                   {calendarLoading && (
                     <Animated.View style={{ 
                       marginLeft: 8,
                       width: 12,
                       height: 12,
                       borderRadius: 6,
                       borderWidth: 1.5,
                     borderColor: '#e5e7eb',
                       borderTopColor: '#3b82f6',
                       transform: [{ rotate: spin }]
                     }} />
                   )}
                 </View>
            </View>
            
            {/* Calendar Grid */}
            <View style={{ 
                     backgroundColor: '#ffffff',
              flex: 1,
              minHeight: 0,
                     flexDirection: 'column',
              overflow: 'visible',
              marginHorizontal: 16,
              width: 'calc(100% - 32px)'
            }}>
              {/* Day Headers */}
                    <View style={{ 
                      flexDirection: 'row', 
                backgroundColor: '#f9fafb',
                borderBottomWidth: 1,
                borderBottomColor: '#e1e5e9',
                flexShrink: 0
              }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                  <View key={`calendar-header-${day}-${index}`} style={{ 
                    flex: 1, 
                    borderRightWidth: index < 6 ? 1 : 0,
                    borderRightColor: '#e1e5e9',
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                    minHeight: 0
                  }}>
                    <Text style={{ 
                      fontSize: 12, 
                      color: '#6b7280', 
                      textAlign: 'center',
                      fontWeight: '600'
                    }}>{day.toUpperCase()}</Text>
            </View>
          ))}
      </View>
              
              {/* Calendar Days Grid - Scrollable */}
              <ScrollView 
                style={{ flex: 1, minHeight: 0 }}
                contentContainerStyle={{ flexGrow: 1 }}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
              >
                {calendarLoading ? (
                  // Loading state for calendar grid (filtering)
                                    <View style={{
                    flex: 1, 
                    justifyContent: 'center', 
                     alignItems: 'center',
                    padding: 40,
                    minHeight: 0
                  }}>
                    <Animated.View style={[styles.loadingSpinner, { transform: [{ rotate: spin }] }]} />
                    <Text style={{
                      marginTop: 16,
                      fontSize: 14,
                      color: '#6b7280',
                      textAlign: 'center'
                    }}>
                      Applying filters...
                    </Text>
                    <Text style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: '#9ca3af',
                      textAlign: 'center'
                    }}>
                      Filtering from cached data
                    </Text>
                                    </View>
                ) : (
                  (() => {
                    // Show loading state if no events have been loaded yet
                    if (Object.keys(calendarEvents).length === 0 && !isCalendarDataLoaded) {
                                    return (
                                        <View style={{
                          flex: 1, 
                     justifyContent: 'center',
                                          alignItems: 'center',
                          padding: 40,
                          minHeight: 0
                        }}>
                          <Animated.View style={[styles.loadingSpinner, { transform: [{ rotate: spin }] }]} />
                          <Text style={{
                            marginTop: 16,
                            fontSize: 14,
                            color: '#6b7280',
                            textAlign: 'center'
                          }}>
                            Loading calendar events...
                          </Text>
                                        </View>
                      );
                    }

                  // Calculate proper month boundaries for currentMonth
                  const year = currentMonth.getFullYear();
                  const month = currentMonth.getMonth();
                  const firstDayOfMonth = new Date(year, month, 1);
                  const lastDayOfMonth = new Date(year, month + 1, 0);
                  const startDate = new Date(firstDayOfMonth);
                  startDate.setDate(startDate.getDate() - firstDayOfMonth.getDay()); // Start from Sunday
                  
                  const weeks = [];
                  let currentDate = new Date(startDate);
                  
                  // Generate 6 weeks
                  for (let week = 0; week < 6; week++) {
                    const weekDays = [];
                    for (let day = 0; day < 7; day++) {
                      weekDays.push(new Date(currentDate));
                      currentDate.setDate(currentDate.getDate() + 1);
                    }
                    weeks.push(weekDays);
                  }
                  
                  return (
                    <View style={{ flexDirection: 'column', flex: 1, minHeight: 0 }}>
                      {weeks.map((week, weekIndex) => (
                        <View key={`calendar-week-${weekIndex}`} style={{ 
                        flexDirection: 'row',
                      flex: 1,
                      borderBottomWidth: weekIndex < 5 ? 1 : 0,
                      borderBottomColor: '#e1e5e9',
                      minHeight: 0
                    }}>
                      {week.map((date, dayIndex) => {
                        const isCurrentMonth = date.getMonth() === month;
                        const isToday = date.toDateString() === new Date().toDateString();
                        const dayNumber = date.getDate();
                        
                        return (
                 <TouchableOpacity
                            key={`calendar-day-${weekIndex}-${dayIndex}-${date.toISOString().split('T')[0]}`}
                            onPress={() => {
                              closeContextMenuIfOpen();
                              const dateKey = date.toISOString().split('T')[0];
                              const dayEvents = calendarEvents[dateKey] || [];
                              console.log('Month view looking for date:', dateKey, 'found events:', dayEvents.length);
                              if (dayEvents.length > 0) {
                                showAlert(
                                  `Events for ${date.toLocaleDateString()}`,
                                  dayEvents.map(event => `${event.title || 'Untitled'} (${event.type})`).join('\n')
                                );
                              } else {
                                // Open task modal when tapping an empty day
                                setTaskModalDate(new Date(date));
                                setShowTaskModal(true);
                              }
                            }}
                   style={{
                              flex: 1, 
                              borderRightWidth: dayIndex < 6 ? 1 : 0,
                              borderRightColor: '#e1e5e9',
                              padding: 8,
                              backgroundColor: isToday ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                              cursor: 'pointer',
                              minHeight: 0
                            }}
                            // Web-specific click handler
                            {...(typeof window !== 'undefined' && {
                              onClick: () => {
                                closeContextMenuIfOpen();
                                const dateKey = date.toISOString().split('T')[0];
                                const dayEvents = calendarEvents[dateKey] || [];
                                if (dayEvents.length > 0) {
                                  // For now, just show the first event
                                  if (dayEvents.length > 0) {
                                    handleEventSelect(dayEvents[0]);
                                  }
                                }
                              },
                              onMouseDown: (e) => {
                                if (e.button === 2) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const dateKey = date.toISOString().split('T')[0];
                                  handleCalendarDayRightClick(dateKey, e);
                                }
                              },
                              onContextMenu: (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const dateKey = date.toISOString().split('T')[0];
                                handleCalendarDayRightClick(dateKey, e);
                              }
                            })}
                          >
                  <Text style={{
                              fontSize: 14, 
                              color: isCurrentMonth ? '#374151' : '#d1d5db',
                              fontWeight: isToday ? '600' : 'normal',
                              marginBottom: 8
                            }}>
                              {dayNumber}
                            </Text>
                            
                            {/* Calendar Chips */}
                            <View style={styles.calendarChips}>
                              {/* Dynamic Event Chips from generated data */}
                              {(() => {
                                const dateKey = date.toISOString().split('T')[0];
                                const dayEvents = calendarEvents[dateKey] || [];
                                
                                // Debug logging for missing events (can be removed after testing)
                                // if (dateKey === '2025-08-15' || dateKey === '2025-09-05' || dateKey === '2025-09-19') {
                                //   console.log(`Debug ${dateKey}:`, {
                                //     dayEvents: dayEvents.length,
                                //     calendarEventsKeys: Object.keys(calendarEvents).length,
                                //     hasDateKey: dateKey in calendarEvents,
                                //     sampleEvents: dayEvents.slice(0, 2)
                                //   });
                                // }
                                
                                // Filter valid events and limit to 4 for display (increased from 3)
                                const validEvents = dayEvents
                                  .filter(event => {
                                    // Only filter out events that are truly invalid
                                    if (!event || !event.id) return false;
                                    // Allow events with fallback titles or valid titles
                                    return true;
                                  })
                                  .slice(0, 4);
                                const remainingCount = dayEvents.length - validEvents.length;
                                
                                return (
                                  <>
                                    {/* Show up to 3 compact event chips */}
                                    {validEvents.map((event, eventIndex) => (
                <TouchableOpacity
                                        key={`event-${eventIndex}`}
                  onPress={() => {
                                          handleEventSelect(event);
                                        }}
                                        style={[
                                          styles.eventChip,
                                          event.type === 'lesson' && styles.chipLesson,
                                          event.type === 'activity' && styles.chipActivity,
                                          event.type === 'holiday' && styles.chipHoliday
                                        ]}
                                        {...(typeof window !== 'undefined' && {
                                          className: 'event-chip-hoverable'
                                        })}
                                        // Web-specific click handlers
                                        {...(typeof window !== 'undefined' && {
                                          onClick: (e) => {
                                            // Only show alert on left click (not right click)
                                            if (e.button === 0 || e.button === undefined) {
                                            if (event.type === 'lesson') {
                                              showAlert(
                                                `${event.title}`,
                                                `${event.childName} - ${event.time}\n\nSubject: ${event.subjectName || 'Unknown'}\nTrack ID: ${event.trackId}\n\n${event.type.charAt(0).toUpperCase() + event.type.slice(1)} scheduled for ${date.toLocaleDateString()}`
                                              );
                                            } else {
                                              showAlert(
                                                `${event.title}`,
                                                `${event.childName} - ${event.time}\n\n${event.type.charAt(0).toUpperCase() + event.type.slice(1)} scheduled for ${date.toLocaleDateString()}`
                                              );
                                            }
                                            }
                                          },
                                          onMouseDown: (e) => {
                                            console.log('Mouse down on event chip, button:', e.button);
                                            if (e.button === 2) {
                                              console.log('Right-click detected on event chip!');
                                              e.preventDefault();
                                              e.stopPropagation();
                                              handleRightClick(event, e);
                                            }
                                          },
                                          onContextMenu: (e) => {
                                            console.log('Context menu event on event chip!');
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleRightClick(event, e);
                                          }
                                        })}
                                      >
                                        <Text style={styles.chipText} numberOfLines={1}>
                                            {event.time ? (() => {
                                              // Check if this is a time range (contains "-")
                                              if (event.time.includes(' - ')) {
                                                const [startTime, endTime] = event.time.split(' - ')
                                                
                                                // Format start time
                                                const startMatch = startTime.match(/(\d{1,2}):(\d{2})/)
                                                let startDisplay = startTime
                                                if (startMatch) {
                                                  let hours = parseInt(startMatch[1])
                                                  const minutes = startMatch[2]
                                                  
                                                  const period = hours >= 12 ? 'PM' : 'AM'
                                                  if (hours > 12) {
                                                    hours -= 12
                                                  } else if (hours === 0) {
                                                    hours = 12
                                                  }
                                                  
                                                  startDisplay = minutes === '00' ? `${hours} ${period}` : `${hours}:${minutes} ${period}`
                                                }
                                                
                                                // Format end time
                                                const endMatch = endTime.match(/(\d{1,2}):(\d{2})/)
                                                let endDisplay = endTime
                                                if (endMatch) {
                                                  let hours = parseInt(endMatch[1])
                                                  const minutes = endMatch[2]
                                                  
                                                  const period = hours >= 12 ? 'PM' : 'AM'
                                                  if (hours > 12) {
                                                    hours -= 12
                                                  } else if (hours === 0) {
                                                    hours = 12
                                                  }
                                                  
                                                  endDisplay = minutes === '00' ? `${hours} ${period}` : `${hours}:${minutes} ${period}`
                                                }
                                                
                                                return (
                                                  <Text>
                                                    <Text style={{ fontWeight: '400' }}>{startDisplay}-{endDisplay} </Text>
                                                    <Text style={{ fontWeight: '600' }}>{event.title}</Text>
                              </Text>
                                                )
                                              } else {
                                                // Single time (original logic)
                                                const timeMatch = event.time.match(/(\d{1,2}):(\d{2})/)
                                                if (timeMatch) {
                                                  let hours = parseInt(timeMatch[1])
                                                  const minutes = timeMatch[2]
                                                  
                                                  const period = hours >= 12 ? 'PM' : 'AM'
                                                  if (hours > 12) {
                                                    hours -= 12
                                                  } else if (hours === 0) {
                                                    hours = 12
                                                  }
                                                  
                                                  // Show just hour if minutes are 00, otherwise show full time
                                                  const timeDisplay = minutes === '00' ? `${hours} ${period}` : `${hours}:${minutes} ${period}`
                                                  return (
                                                    <Text>
                                                      <Text style={{ fontWeight: '400' }}>{timeDisplay} </Text>
                                                      <Text style={{ fontWeight: '600' }}>{event.title}</Text>
                                                    </Text>
                                                  )
                                                }
                                                return <Text style={{ fontWeight: '600' }}>{event.title}</Text>
                                              }
                                            })() : <Text style={{ fontWeight: '600' }}>{event.title}</Text>}
                  </Text>
                </TouchableOpacity>
                                    ))}
                                    
                                    {/* Show remaining count if there are more events */}
                                    {remainingCount > 0 && (
                                <View style={{
                                        backgroundColor: 'rgba(156, 163, 175, 0.2)',
                    borderRadius: 8,
                                        paddingHorizontal: 6,
                                        paddingVertical: 4,
                                        minWidth: 24,
                    alignItems: 'center',
                    borderWidth: 1,
                                        borderColor: 'rgba(156, 163, 175, 0.3)',
                                        cursor: 'pointer'
                                      }}>
                  <Text style={{
                                          fontSize: 9, 
                                          color: '#6b7280',
                                          fontWeight: '600'
                                        }}>
                                          +{remainingCount}
                  </Text>
               </View>
                          )}
                                  </>
                                );
                              })()}
             </View>
                </TouchableOpacity>
                        );
                      })}
               </View>
                  ))}
             </View>
                  );
                  })()
                )}
              </ScrollView>
            </View>
            </View>
          </View>
          
          {/* Task Create Modal */}
          <TaskCreateModal
            visible={showTaskModal}
            onClose={() => setShowTaskModal(false)}
            defaultDate={taskModalDate}
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
              // Refresh calendar data after task creation
              await refreshCalendarData();
            }}
          />
          </View>
        )
  }
      
  const renderCalendarPlanningContent = () => {
    if (!familyId) {
        return (
          <View style={styles.content}>
          <Text style={styles.title}>Calendar Planning</Text>
          <Text style={styles.subtitle}>Loading family information...</Text>
          </View>
        )
    }
      
        return (
          <View style={styles.content}>
        <CalendarPlanning 
          familyId={familyId}
          academicYear={null}
          showOnboardingBanner={false}
          onBack={() => onTabChange('calendar')}
        />
          </View>
        )
  }

  const renderScheduleRulesContent = () => {
    if (!familyId) {
      return (
        <View style={styles.content}>
          <Text style={styles.title}>Schedule Rules</Text>
          <Text style={styles.subtitle}>Loading family information...</Text>
        </View>
      )
    }

    return (
      <ScheduleRulesView familyId={familyId} children={children} />
    )
  }

  const renderAIPlannerContent = () => {
    if (!familyId) {
      return (
        <View style={styles.content}>
          <Text style={styles.title}>AI Planner</Text>
          <Text style={styles.subtitle}>Loading family information...</Text>
        </View>
      )
    }

    // Parse URL parameters for AI Planner
    const urlParams = {};
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      urlParams.ai_topoff_for_subject = params.get('ai_topoff_for_subject');
      urlParams.minutes_needed = params.get('minutes_needed');
      urlParams.plan_for_child = params.get('plan_for_child');
      urlParams.week = params.get('week');
    }

    return (
      <AIPlannerView 
        familyId={familyId} 
        children={children}
        urlParams={urlParams}
      />
    )
  }
  const renderAddOptionsContent = () => {
        return (
          <ScrollView style={styles.content} showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 60 }}>
            {/* Child Filter Chips */}
            {children.length > 0 && (
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Filter by child:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                  <View style={styles.filterChips}>
                <TouchableOpacity
                      key={'all'} 
                      onPress={() => {
                        setSelectedChildId(null)
                        updateProgressForChild(null)
                      }} 
                      style={[
                        styles.filterChip,
                        selectedChildId === null && styles.filterChipActive
                      ]}
                    >
                      <Text style={[
                        styles.filterChipText,
                        selectedChildId === null && styles.filterChipTextActive
                      ]}>
                        All Children
                    </Text>
                  </TouchableOpacity>
                    {children.map((c) => (
                  <TouchableOpacity
                        key={c.id} 
                onPress={() => {
                          setSelectedChildId(c.id)
                          updateProgressForChild(c.id)
                        }} 
                        style={[
                          styles.filterChip,
                          selectedChildId === c.id && styles.filterChipActive
                        ]}
                      >
                        <Text style={[
                          styles.filterChipText,
                          selectedChildId === c.id && styles.filterChipTextActive
                        ]}>
                          {c.first_name}
                        </Text>
                </TouchableOpacity>
                    ))}
            </View>
                </ScrollView>
          </View>
                )}
          </ScrollView>
        )
  }

  return (
    <View style={styles.container}>
      {renderContent()}
      <HomeEventModal
        showHomeEventModal={showHomeEventModal}
        setShowHomeEventModal={setShowHomeEventModal}
        homeEventType={homeEventType}
        setHomeEventType={setHomeEventType}
        homeEventFormData={homeEventFormData}
        setHomeEventFormData={setHomeEventFormData}
        saveHomeEvent={saveHomeEvent}
        students={children}
      />
      <AddChildModal
        visible={showAddChildModal}
        onClose={onCloseAddChildModal}
        onChildAdded={(child) => {
          if (onChildAdded) {
            onChildAdded();
          }
          // Refresh children list
          fetchChildren();
        }}
        familyId={familyId}
      />
      <EventOutcomeModal
        visible={showOutcomeModal}
        event={outcomeEvent}
        onClose={() => {
          setShowOutcomeModal(false);
          setOutcomeEvent(null);
        }}
        onSaved={() => {
          // Refresh calendar after saving outcome
          if (refreshCalendarDataRef.current) {
            refreshCalendarDataRef.current().catch(err => console.error('Calendar refresh failed:', err));
          }
        }}
      />
      
      {showRebalanceModal && rebalanceEvent && rebalanceYearPlanId && familyId && (
        <RebalanceModal
          visible={showRebalanceModal}
          event={rebalanceEvent}
          yearPlanId={rebalanceYearPlanId}
          familyId={familyId}
          onClose={() => {
            setShowRebalanceModal(false);
            setRebalanceEvent(null);
            setRebalanceYearPlanId(null);
          }}
          onSuccess={async () => {
            // Refresh calendar data after rebalance
            if (refreshCalendarDataRef.current) {
              await refreshCalendarDataRef.current();
            }
          }}
        />
      )}
      
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fbfbfc',
  },
  content: {
    flex: 1,
    backgroundColor: '#fbfbfc',
    overflow: 'auto',
  },
  greetingSection: {
    marginTop: 32,
    marginBottom: 24,
  },
  greetingTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 16,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.accent,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentContrast,
  },
  quickActionButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: colors.radiusMd,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionTextSecondary: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  viewToggle: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.panel,
    borderRadius: 6,
    padding: 2,
  },
  viewToggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  viewToggleButtonActive: {
    backgroundColor: colors.card,
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 1,
  },
  viewToggleText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.muted,
  },
  viewToggleTextActive: {
    color: colors.text,
  },
  loadingText: {
    fontSize: 14,
    color: '#667085',
    textAlign: 'center',
    marginTop: 40,
  },
  homeGrid: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 24,
  },
  homeMainColumn: {
    flex: 2,
    gap: 16,
  },
  homeSideColumn: {
    flex: 1,
    gap: 16,
  },
  greetingSubtitle: {
    fontSize: 16,
    color: '#718096',
    fontStyle: 'italic',
  },
  upcomingEventsBlock: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
  },
  upcomingEventsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  calendarIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#38B6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  calendarIconNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  upcomingEventsSection: {
    marginBottom: 24,
  },
  upcomingEventsCaption: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 8,
  },
  upcomingEventsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
  },
  tasksSection: {
    marginBottom: 24,
  },
  tasksCaption: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 8,
  },
  tasksBlock: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
  },
  tasksContent: {
    padding: 16,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  taskCheckbox: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 3,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskCheckboxInner: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  taskCheckboxChecked: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 3,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
  },
  taskCheckboxCheckedInner: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  taskCheckboxIcon: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  taskDetails: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 2,
  },
  taskTitleChecked: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9ca3af',
    marginBottom: 2,
    textDecorationLine: 'line-through',
  },
  taskSubtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  taskBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  taskBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  taskBadgeDone: {
    backgroundColor: '#d1fae5',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  taskBadgeTextDone: {
    fontSize: 12,
    fontWeight: '500',
    color: '#065f46',
  },
  pinnedSection: {
    marginBottom: 24,
  },
  pinnedCaption: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 8,
  },
  pinnedBlock: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
  },
  pinnedContent: {
    padding: 16,
  },
  pinnedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  pinnedIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  databaseIcon: {
    position: 'relative',
    width: 32,
    height: 32,
  },
  databaseGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 24,
    height: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#9ca3af',
    borderRadius: 2,
    padding: 2,
  },
  gridCell: {
    width: 5,
    height: 5,
    backgroundColor: '#ffffff',
    margin: 0,
    borderRadius: 1,
  },
  homeIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
  },
  homeBase: {
    position: 'absolute',
    bottom: 0,
    left: 2,
    width: 12,
    height: 8,
    backgroundColor: '#9ca3af',
    borderRadius: 1,
  },
  homeRoof: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 16,
    height: 8,
    backgroundColor: '#9ca3af',
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  pinnedDetails: {
    flex: 1,
  },
  pinnedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  pinnedSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  selectButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  selectButtonText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '500',
  },
  upcomingEventsContent: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  featurePromotion: {
    flex: 1,
    paddingRight: 16,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  featureIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#38B6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  featureIconNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 8,
    lineHeight: 24,
  },
  featureDescription: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 16,
    lineHeight: 20,
  },
  connectButtonsContainer: {
    gap: 16,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 200,
  },
  logoIcon: {
    width: 32,
    height: 32,
    marginRight: 12,
  },
  appleLogoIcon: {
    width: 32,
    height: 32,
    marginRight: 12,
  },
  connectButtonText: {
    fontSize: 14,
    color: '#2d3748',
    fontWeight: '500',
  },
  upcomingEventsList: {
    flex: 1,
    paddingLeft: 16,
    gap: 16,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  eventDate: {
    alignItems: 'center',
    marginRight: 12,
    minWidth: 50,
  },
  eventDay: {
    fontSize: 12,
    color: '#718096',
    fontWeight: '500',
  },
  eventDateNumber: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
  },
  eventDetails: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 2,
  },
  eventTimeLocation: {
    fontSize: 12,
    color: '#718096',
    marginBottom: 8,
  },
  joinButton: {
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  joinButtonText: {
    fontSize: 12,
    color: '#2d3748',
    fontWeight: '500',
  },
  noEventsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  noEventsText: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 12,
  },
  addEventButton: {
    backgroundColor: '#38B6FF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addEventButtonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  card: {
    width: '48%',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#fff',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
    borderWidth: 1,
    borderColor: '#f0f0f0',
    marginBottom: 16,
  },
  cardBlue: { backgroundColor: '#eef6ff' },
  cardPink: { backgroundColor: '#fff0f5' },
  cardGreen: { backgroundColor: '#f0fff4' },
  cardYellow: { backgroundColor: '#fffbea' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 8 },
  taskColumns: { flexDirection: 'row', gap: 12 },
  taskColumn: { flex: 1 },
  taskColumnTitle: { fontWeight: '600', color: '#555', marginBottom: 8 },
  taskItem: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#eaeaea', marginBottom: 8 },
  checkbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: '#bbb', backgroundColor: '#fff' },
  taskText: { color: '#333' },
  primaryBtn: { backgroundColor: '#38B6FF', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  innerSearch: { borderWidth: 1, borderColor: '#e1e1e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff', marginBottom: 8 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressCircle: { width: 64, height: 64, borderRadius: 32, borderWidth: 6, borderColor: '#38B6FF', backgroundColor: '#e6f4ff' },
  bulletLine: { color: '#555', marginTop: 2 },
  detailLine: { color: '#333' },
  scrollContainer: {
    flex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '400',
    color: '#666666',
    marginBottom: 32,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    lineHeight: 26,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 24,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    letterSpacing: '-0.01em',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },


  form: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  avatarOption: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  avatarOptionSelected: {
    borderColor: '#38B6FF',
    boxShadow: '0 2px 8px rgba(56, 182, 255, 0.3)',
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#333',
    marginRight: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#38B6FF',
    borderColor: '#38B6FF',
  },
  checkboxText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#38B6FF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  childrenList: {
    marginTop: 24,
  },
  childCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  childCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  childAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  childDetails: {
    fontSize: 14,
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 32,
    textAlign: 'center',
    maxWidth: 400,
    lineHeight: 24,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  chatContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f3f4',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.06)',
    overflow: 'hidden',
  },
  messagesContainer: {
    minHeight: 400,
    padding: 24,
    backgroundColor: '#fafbfc',
  },
  welcomeMessage: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  welcomeText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeBullet: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  message: {
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    maxWidth: '80%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#1a1a1a',
    marginLeft: 'auto',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f1f3f4',
    marginRight: 'auto',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1a1a1a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  userMessageText: {
    color: '#ffffff',
  },
  loadingMessage: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
    gap: 12,
  },
  chatInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e9ecef',
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    backgroundColor: '#f8f9fa',
  },
  sendButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  syllabusSection: {
    marginBottom: 32,
  },
  processedSyllabiSection: {
    marginTop: 24,
  },
  syllabusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  },
  syllabusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  syllabusProvider: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  syllabusUnit: {
    fontSize: 14,
    color: '#38B6FF',
    marginBottom: 8,
  },
  syllabusPreview: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  comingSoonSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  comingSoonTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  comingSoonText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 500,
  },
  filterSection: {
    marginBottom: 32,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  filterScroll: {
    marginBottom: 8,
  },
  filterChips: {
    flexDirection: 'row',
    gap: 12,
  },
  filterChip: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  filterChipActive: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
    boxShadow: '0 4px 12px rgba(26, 26, 26, 0.15)',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  actionButton: {
    backgroundColor: '#38B6FF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  progressSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  progressItem: {
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  progressValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  focusContent: {
    marginTop: 16,
  },
  focusText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  focusSubjects: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  subjectTag: {
    backgroundColor: '#e0e0e0',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  resourceList: {
    marginTop: 16,
  },
  resourceItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f9f9f9',
    marginBottom: 10,
    alignItems: 'center',
  },
  resourceText: {
    fontSize: 14,
    color: '#333',
  },
  childrenSection: {
    marginBottom: 40,
  },
  childrenGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
  },
  childCard: {
    width: 320,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#f1f3f4',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.06)',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  viewProfile: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '500',
    marginTop: 12,
  },
  archivedToggle: {
    marginBottom: 24,
  },
  toggleButton: {
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
  },
  archivedSection: {
    marginTop: 32,
  },
  archivedSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  archivedChildCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    opacity: 0.7,
  },
  archivedChildInfo: {
    flex: 1,
  },
  archivedChildName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  archivedChildDetails: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 8,
  },
  archivedBadge: {
    backgroundColor: colors.orangeSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  archivedBadgeText: {
    fontSize: 12,
    color: colors.orangeBold,
    fontWeight: '500',
  },
  restoreButton: {
    backgroundColor: colors.greenBold,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  restoreButtonText: {
    color: colors.card,
    fontSize: 14,
    fontWeight: '500',
  },
  recordsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  recordCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  recordCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  recordCardSubtitle: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  childCardHover: {
    boxShadow: '0 8px 25px rgba(0, 0, 0, 0.08), 0 3px 10px rgba(0, 0, 0, 0.06)',
    transform: 'translateY(-2px)',
  },
  childHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  childAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 16,
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  childDetails: {
    fontSize: 14,
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  childStats: {
    flexDirection: 'row',
    gap: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  primaryButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  primaryButtonHover: {
    backgroundColor: '#000000',
    transform: 'translateY(-1px)',
    boxShadow: '0 8px 25px rgba(26, 26, 26, 0.25)',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  // Update existing card styles to work with new layout
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
    flex: 1,
    minWidth: 280,
  },
  cardBlue: {
    borderLeftWidth: 4,
    borderLeftColor: '#38B6FF',
  },
  // Today's Learning Styles
  todaysLearningSection: {
    marginTop: 24,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    marginTop: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  smallAddButton: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 22,
    minWidth: 22
  },
  smallAddButtonText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 14,
    textAlign: 'center'
  },
  contextMenuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#4b5563',
    borderRadius: 4,
    marginVertical: 2,
  },
  contextMenuDelete: {
    borderBottomWidth: 0,
  },
  contextMenuText: {
    fontSize: 14,
    color: '#f9fafb',
    fontWeight: '600',
  },
  contextMenuDeleteText: {
    color: '#fca5a5',
  },
  childLearningCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#38B6FF',
  },
  trackItem: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  trackName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2d3748',
    marginBottom: 4,
  },
  trackSchedule: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  roadmapPreview: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
  roadmapLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  roadmapContent: {
    fontSize: 12,
    color: '#38B6FF',
    fontStyle: 'italic',
  },
  noLearningContainer: {
    alignItems: 'center',
    padding: 20,
  },
  noLearningText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  noLearningSubtext: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  // Single add event button for empty state
  addEventButton: {
    backgroundColor: '#38B6FF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginTop: 8,
  },
  addEventButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  cardGreen: {
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  cardYellow: {
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  cardPink: {
    borderLeftWidth: 4,
    borderLeftColor: '#E91E63',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  noDataText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 20,
  },
  formContainer: {
    maxWidth: 600,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    borderWidth: 1,
    borderColor: '#f1f3f4',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
  },
  formTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  formSubtitle: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 32,
    lineHeight: 24,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  formRow: {
    marginBottom: 24,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  formInput: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    backgroundColor: '#ffffff',
    transition: 'all 0.2s ease',
  },
  formInputFocus: {
    borderColor: '#1a1a1a',
    boxShadow: '0 0 0 3px rgba(26, 26, 26, 0.1)',
  },
  formButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  formButtonHover: {
    backgroundColor: '#000000',
    transform: 'translateY(-1px)',
    boxShadow: '0 4px 12px rgba(26, 26, 26, 0.2)',
  },
  formButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  avatarOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#e9ecef',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  avatarOptionSelected: {
    borderColor: '#1a1a1a',
    transform: 'scale(1.1)',
  },
  gradeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  gradeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e9ecef',
    backgroundColor: '#f8f9fa',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  gradeChipSelected: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  gradeChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  gradeChipTextSelected: {
    color: '#ffffff',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#e9ecef',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  checkboxChecked: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#1a1a1a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  subjectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 16,
  },
  subjectCard: {
    width: 200,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#f1f3f4',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  subjectCardHover: {
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
    transform: 'translateY(-2px)',
  },
  subjectName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  subjectDetails: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 12,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  subjectToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleSwitch: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e9ecef',
    padding: 2,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  toggleSwitchActive: {
    backgroundColor: '#1a1a1a',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    transition: 'all 0.2s ease',
  },
  toggleThumbActive: {
    transform: 'translateX(16px)',
  },
  aiHelpButton: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    marginTop: 16,
  },
  aiHelpButtonHover: {
    backgroundColor: '#e9ecef',
    borderColor: '#1a1a1a',
  },
  aiHelpButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  calendarContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f3f4',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
    overflow: 'hidden',
  },
  calendarHeader: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
    backgroundColor: '#fafbfc',
  },
  calendarTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  calendarSubtitle: {
    fontSize: 14,
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  calendarGrid: {
    padding: 24,
  },
  calendarRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  calendarCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  calendarCellHover: {
    backgroundColor: '#f8f9fa',
  },
  calendarCellToday: {
    backgroundColor: '#1a1a1a',
  },
  calendarCellText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  calendarCellTextToday: {
    color: '#ffffff',
  },
  calendarCellTextOther: {
    color: '#cccccc',
  },
  calendarLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    maxWidth: 500,
    width: '90%',
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#f1f3f4',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  modalClose: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  modalCloseHover: {
    backgroundColor: '#e9ecef',
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 24,
  },
  quickAction: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  quickActionHover: {
    backgroundColor: '#e9ecef',
    borderColor: '#1a1a1a',
    transform: 'translateY(-1px)',
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  successContainer: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  successText: {
    fontSize: 14,
    color: '#16a34a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  
  // Calendar Chip Styles
  calendarChips: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    gap: 1,
    maxHeight: 90,
    overflow: 'hidden',
    minHeight: 0,
  },
  eventChip: {
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: '100%',
    maxWidth: '100%',
    alignItems: 'flex-start',
    borderWidth: 1,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    flexShrink: 0,
  },
  chipToday: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    minWidth: 16,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  chipLesson: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    minWidth: 16,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  chipActivity: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    minWidth: 16,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  chipHoliday: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    minWidth: 16,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  chipText: {
    fontSize: 9,
    color: '#374151',
    fontWeight: '600',
    textAlign: 'left',
    lineHeight: 11,
  },
  chipSubtext: {
    fontSize: 7,
    color: '#6b7280',
    fontWeight: '500',
    textAlign: 'left',
    marginTop: 1,
    lineHeight: 9,
  },
  
  // Hover effects for web
  chipHover: {
    transform: 'scale(1.1)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  },
  
  // Loading spinner animation
  loadingSpinner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#e5e7eb',
    borderTopColor: '#3b82f6',
  },
  
  // Mini Calendar Chip Styles - Removed since chips are no longer shown
  
  // Calendar Legend and Controls Styles - Removed for cleaner interface

  // Home Page Modal Styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 999999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e1e5e9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  modalCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#6b7280',
    fontWeight: '400',
    lineHeight: 18,
  },
  modalContent: {
    padding: 16,
    backgroundColor: '#ffffff',
  },
  modalScroll: {
    maxHeight: '70vh',
  },
  modalSectionTitle: { fontSize: 12, fontWeight: '600', color: '#111827', marginBottom: 16 },
  eventTypeButtons: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  eventTypeButton: { flex: 1, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: '#e1e5e9', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  eventTypeButtonActive: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  eventTypeButtonText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  eventTypeButtonTextActive: { color: '#1e40af' },
  quickForm: { gap: 16 },
  formField: { gap: 8 },
  formLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 2 },
  formInput: { borderWidth: 1, borderColor: '#e1e5e9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8, fontSize: 12, color: '#111827', backgroundColor: '#ffffff', minHeight: 36 },
  formTextArea: { minHeight: 80, textAlignVertical: 'top', paddingTop: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#e1e5e9' },
  modalCancelButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1, borderColor: '#e1e5e9', backgroundColor: '#ffffff', minWidth: 80, alignItems: 'center' },
  modalCancelText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  modalSaveButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, backgroundColor: '#3b82f6', minWidth: 96, alignItems: 'center' },
  modalSaveText: { fontSize: 12, fontWeight: '600', color: 'white' },

});

// Add the home page modal after the main component
const HomeEventModal = ({ showHomeEventModal, setShowHomeEventModal, homeEventType, setHomeEventType, homeEventFormData, setHomeEventFormData, saveHomeEvent, students = [] }) => {
  if (!showHomeEventModal) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContainer}>
        {/* Modal Header */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add Event</Text>
          <TouchableOpacity 
            onPress={() => setShowHomeEventModal(false)}
            style={styles.modalCloseButton}
          >
            <Text style={styles.modalCloseText}>×</Text>
          </TouchableOpacity>
        </View>

        {/* Event Type Selection */}
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={true}>
          <Text style={styles.modalSectionTitle}>What would you like to add?</Text>
          
          <View style={styles.eventTypeButtons}>
            <TouchableOpacity 
              style={[
                styles.eventTypeButton, 
                homeEventType === 'lesson' && styles.eventTypeButtonActive
              ]}
              onPress={() => setHomeEventType('lesson')}
            >
              <Text style={[
                styles.eventTypeButtonText,
                homeEventType === 'lesson' && styles.eventTypeButtonTextActive
              ]}>
                Lesson
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.eventTypeButton, 
                homeEventType === 'activity' && styles.eventTypeButtonActive
              ]}
              onPress={() => setHomeEventType('activity')}
            >
              <Text style={[
                styles.eventTypeButtonText,
                homeEventType === 'activity' && styles.eventTypeButtonTextActive
              ]}>
                Activity
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.eventTypeButton, 
                homeEventType === 'holiday' && styles.eventTypeButtonActive
              ]}
              onPress={() => setHomeEventType('holiday')}
            >
              <Text style={[
                styles.eventTypeButtonText,
                homeEventType === 'holiday' && styles.eventTypeButtonTextActive
              ]}>
                Day Off
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick Form */}
          <View style={styles.quickForm}>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Title</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Enter event title"
                value={homeEventFormData.title}
                onChangeText={(text) => setHomeEventFormData({...homeEventFormData, title: text})}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Date</Text>
              <TextInput
                style={styles.formInput}
                placeholder="MM/DD/YY"
                value={homeEventFormData.scheduledDate}
                onChangeText={(text) => {
                  // Format as MM/DD/YY with automatic slashes
                  let formatted = text.replace(/\D/g, '') // Remove non-digits
                  if (formatted.length >= 2) {
                    formatted = formatted.substring(0, 2) + '/' + formatted.substring(2)
                  }
                  if (formatted.length >= 5) {
                    formatted = formatted.substring(0, 5) + '/' + formatted.substring(5, 7)
                  }
                  setHomeEventFormData({...homeEventFormData, scheduledDate: formatted})
                }}
                maxLength={8}
                keyboardType="numeric"
              />
            </View>

            {homeEventType !== 'holiday' && (
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Time</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="9:00 AM"
                  value={homeEventFormData.scheduledTime}
                  onChangeText={(text) => setHomeEventFormData({...homeEventFormData, scheduledTime: text})}
                />
                <View style={{ height: 8 }} />
                <Text style={styles.formLabel}>End Time</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="10:00 AM"
                  value={homeEventFormData.endTime}
                  onChangeText={(text) => setHomeEventFormData({...homeEventFormData, endTime: text})}
                />
              </View>
            )}

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                placeholder="Enter description"
                value={homeEventFormData.description}
                onChangeText={(text) => setHomeEventFormData({...homeEventFormData, description: text})}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Status selection for lesson/activity */}
            {homeEventType !== 'holiday' && (
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Status</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['planned', 'in_progress', 'completed', 'cancelled'].map(st => (
                    <TouchableOpacity
                      key={st}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: homeEventFormData.status === st ? '#3b82f6' : '#e1e5e9',
                        backgroundColor: homeEventFormData.status === st ? '#eff6ff' : '#ffffff'
                      }}
                      onPress={() => setHomeEventFormData(prev => ({ ...prev, status: st }))}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: homeEventFormData.status === st ? '#1e40af' : '#6b7280' }}>
                        {st.replace('_',' ').replace(/^\w/, c => c.toUpperCase())}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Assignee selection (not for Day Off) */}
            {homeEventType !== 'holiday' && (
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Assign to</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[{ id: 'PARENT', first_name: 'Parent' }, ...students].map(opt => (
                    <TouchableOpacity
                      key={opt.id}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 20,
                        borderWidth: 2,
                        borderColor: homeEventFormData.assignees.includes(opt.id) ? '#38B6FF' : '#e5e7eb',
                        backgroundColor: homeEventFormData.assignees.includes(opt.id) ? '#E6F4FF' : '#ffffff'
                      }}
                      onPress={() => {
                        setHomeEventFormData(prev => {
                          const selected = new Set(prev.assignees);
                          if (selected.has(opt.id)) selected.delete(opt.id); else selected.add(opt.id);
                          return { ...prev, assignees: Array.from(selected) };
                        });
                      }}
                    >
                    <Text style={{ color: '#111827', fontSize: 12 }}>
                        {opt.first_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.modalActions}>
            <TouchableOpacity 
              style={styles.modalCancelButton}
              onPress={() => setShowHomeEventModal(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.modalSaveButton,
                (!homeEventFormData.title || 
                 !homeEventFormData.scheduledDate || 
                 (homeEventType !== 'holiday' && (!homeEventFormData.trackId || !homeEventFormData.activityId || !homeEventFormData.assignees || homeEventFormData.assignees.length === 0 || !homeEventFormData.timeEstimate || parseInt(homeEventFormData.timeEstimate) <= 0))) && { opacity: 0.5 }
              ]}
              onPress={saveHomeEvent}
              disabled={
                !homeEventFormData.title || 
                !homeEventFormData.scheduledDate || 
                (homeEventType !== 'holiday' && (!homeEventFormData.trackId || !homeEventFormData.activityId || !homeEventFormData.assignees || homeEventFormData.assignees.length === 0 || !homeEventFormData.timeEstimate || parseInt(homeEventFormData.timeEstimate) <= 0))
              }
            >
              <Text style={styles.modalSaveText}>
                Add Event
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>


    </View>
  );
};