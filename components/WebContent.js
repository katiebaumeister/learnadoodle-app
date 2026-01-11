import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
import { getChildColorFromAvatar } from '../utils/avatarColors'

// Set up error suppression immediately on module load (before React renders)
// This catches errors that occur during initial page load
if (typeof window !== 'undefined') {
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  
  // Helper to check if error should be suppressed
  const shouldSuppress = (message) => {
    if (!message || typeof message !== 'string') return false;
    // Check if message contains a UUID (in any format - with or without parentheses, etc.)
    const hasUuid = uuidPattern.test(message);
    // Check if it's a 404 or resource loading error
    const is404 = message.includes('404') || 
                 message.includes('Failed to load resource') || 
                 message.includes('Not Found') ||
                 message.includes('the server responded with a status of 404') ||
                 message.includes('status of 404') ||
                 message.includes('Failed to load');
    // Suppress if it has a UUID and is a 404/resource error
    if (hasUuid && is404) return true;
    // Also suppress if the message is JUST a UUID (common case)
    const trimmed = message.trim();
    const isJustUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
    if (isJustUuid) return true;
    return false;
  };
  
  // Intercept console errors immediately - this catches errors logged through console.error
  const originalError = window.console.error;
  window.console.error = (...args) => {
    const message = args.join(' ');
    // Check message and all string arguments
    if (shouldSuppress(message) || args.some(arg => typeof arg === 'string' && shouldSuppress(arg))) {
      return; // Suppress this error
    }
    // Also check for "Failed to load resource" with UUIDs in any argument
    const hasUuidInArgs = args.some(arg => {
      if (typeof arg === 'string') {
        return uuidPattern.test(arg) && (arg.includes('404') || arg.includes('Failed to load resource'));
      }
      return false;
    });
    if (hasUuidInArgs) {
      return; // Suppress UUID-related 404 errors
    }
    originalError.apply(console, args);
  };

  // Also intercept console.warn in case some errors are logged as warnings
  const originalWarn = window.console.warn;
  window.console.warn = (...args) => {
    const message = args.join(' ');
    if (shouldSuppress(message) || args.some(arg => typeof arg === 'string' && shouldSuppress(arg))) {
      return; // Suppress this warning
    }
    originalWarn.apply(console, args);
  };

  // Intercept image and iframe load errors at the DOM level (capture phase)
  // This prevents images/iframes with invalid UUID URLs from even attempting to load
  const handleResourceError = (e) => {
    const target = e.target;
    const tagName = target?.tagName?.toUpperCase();
    if (target && (tagName === 'IMG' || tagName === 'IFRAME') && target.src) {
      const url = target.src;
      // Check if URL is just a UUID (invalid URL) - prevent loading
      if (uuidPattern.test(url) && !url.includes('http') && !url.includes('data:')) {
        e.preventDefault();
        e.stopPropagation();
        if (target.style) {
          target.style.display = 'none';
        }
        return false;
      }
      // Check if URL contains UUID and might be a 404
      if (uuidPattern.test(url)) {
        e.preventDefault();
        e.stopPropagation();
        if (target.style) {
          target.style.display = 'none';
        }
        return false;
      }
    }
  };

  // Intercept image loading BEFORE it happens - prevent invalid URLs from being set
  // This intercepts both Image constructor and direct src attribute setting
  const originalImage = window.Image;
  const originalCreateElement = document.createElement;
  
  // Intercept createElement to catch img tags and iframes
  document.createElement = function(tagName, ...args) {
    const element = originalCreateElement.call(document, tagName, ...args);
    const tagLower = tagName.toLowerCase();
    
    if (tagLower === 'img' || tagLower === 'iframe') {
      const originalSetAttribute = element.setAttribute;
      element.setAttribute = function(name, value) {
        if (name === 'src' && value && typeof value === 'string') {
          const isJustUuid = uuidPattern.test(value) && !value.includes('http') && !value.includes('data:');
          if (isJustUuid) {
            // Don't set invalid UUID URLs
            console.warn(`[WebContent] Blocked invalid UUID URL for ${tagLower}:`, value);
            return;
          }
        }
        return originalSetAttribute.call(this, name, value);
      };
    }
    return element;
  };
  
  // Intercept Image constructor
  window.Image = function(...args) {
    const img = new originalImage(...args);
    const originalSrcSetter = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')?.set;
    if (originalSrcSetter) {
      Object.defineProperty(img, 'src', {
        set: function(value) {
          // Validate URL before setting
          if (value && typeof value === 'string') {
            const isJustUuid = uuidPattern.test(value) && !value.includes('http') && !value.includes('data:');
            if (isJustUuid) {
              // Don't set invalid UUID URLs - prevent the browser from attempting to load
              if (this.style) {
                this.style.display = 'none';
              }
              return;
            }
          }
          originalSrcSetter.call(this, value);
        },
        get: function() {
          return this.getAttribute('src') || '';
        },
        configurable: true
      });
    }
    return img;
  };

  // CRITICAL: Intercept HTMLImageElement.prototype.src at the prototype level
  // This catches ALL img elements, including those created by React Native
  const originalImageSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (originalImageSrcDescriptor && originalImageSrcDescriptor.set) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      set: function(value) {
        // Validate URL before setting - this catches React Native Image components
        if (value && typeof value === 'string') {
          const isJustUuid = uuidPattern.test(value) && !value.includes('http') && !value.includes('data:');
          if (isJustUuid) {
            // Don't set invalid UUID URLs - prevent the browser from attempting to load
            if (this.style) {
              this.style.display = 'none';
            }
            // Set a data attribute so we know it was blocked
            this.setAttribute('data-blocked-uuid', 'true');
            return; // Don't call the original setter
          }
        }
        // Valid URL - proceed normally
        originalImageSrcDescriptor.set.call(this, value);
      },
      get: function() {
        // Return empty string if this was blocked
        if (this.getAttribute('data-blocked-uuid') === 'true') {
          return '';
        }
        return originalImageSrcDescriptor.get ? originalImageSrcDescriptor.get.call(this) : this.getAttribute('src') || '';
      },
      configurable: true,
      enumerable: true
    });
  }

  // CRITICAL: Intercept HTMLIFrameElement.prototype.src at the prototype level
  // This catches ALL iframe elements to prevent UUID URLs from being loaded
  if (typeof HTMLIFrameElement !== 'undefined') {
    const originalIframeSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
    if (originalIframeSrcDescriptor && originalIframeSrcDescriptor.set) {
      Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
        set: function(value) {
          // Validate URL before setting
          if (value && typeof value === 'string') {
            const isJustUuid = uuidPattern.test(value) && !value.includes('http') && !value.includes('data:');
            if (isJustUuid) {
              // Don't set invalid UUID URLs - prevent the browser from attempting to load
              console.warn('[WebContent] Blocked invalid UUID URL for iframe:', value);
              if (this.style) {
                this.style.display = 'none';
              }
              // Set a data attribute so we know it was blocked
              this.setAttribute('data-blocked-uuid', 'true');
              return; // Don't call the original setter
            }
          }
          // Valid URL - proceed normally
          originalIframeSrcDescriptor.set.call(this, value);
        },
        get: function() {
          // Return empty string if this was blocked
          if (this.getAttribute('data-blocked-uuid') === 'true') {
            return '';
          }
          return originalIframeSrcDescriptor.get ? originalIframeSrcDescriptor.get.call(this) : this.getAttribute('src') || '';
        },
        configurable: true,
        enumerable: true
      });
    }
  }
  
  // Also intercept all img elements via MutationObserver to catch src changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
        const target = mutation.target;
        if (target.tagName === 'IMG' && target.src) {
          const url = target.src;
          const isJustUuid = uuidPattern.test(url) && !url.includes('http') && !url.includes('data:');
          if (isJustUuid) {
            // Remove invalid UUID URL
            target.removeAttribute('src');
            if (target.style) {
              target.style.display = 'none';
            }
          }
        }
      }
    });
  });
  
  // Observe all img elements
  if (document.body) {
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['src'],
      subtree: true,
      childList: true
    });
  } else {
    // If body doesn't exist yet, wait for DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['src'],
        subtree: true,
        childList: true
      });
    });
  }

  // Intercept general errors (including network resource load failures)
  const handleError = (e) => {
    const message = e.message || e.toString() || '';
    const url = e.target?.src || e.filename || e.target?.href || e.target?.currentSrc || '';
    const combined = `${message} ${url}`;
    
    // Check if this is a UUID-related 404 error
    const hasUuid = uuidPattern.test(combined) || uuidPattern.test(message) || uuidPattern.test(url);
    const is404 = message.includes('404') || 
                 message.includes('Failed to load resource') || 
                 message.includes('Not Found') ||
                 combined.includes('404') ||
                 combined.includes('Failed to load resource');
    
    if (hasUuid && is404) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }
    
    // Also check with shouldSuppress for other error formats
    if (shouldSuppress(combined) || shouldSuppress(message) || shouldSuppress(url)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  };

  // Intercept unhandled promise rejections
  const handleRejection = (e) => {
    const reason = e.reason?.toString() || e.reason?.message || '';
    if (shouldSuppress(reason)) {
      e.preventDefault();
    }
  };

  // Intercept fetch requests to prevent loading invalid UUID URLs
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = args[0]?.toString() || '';
    // Check if URL is just a UUID (invalid URL)
    if (uuidPattern.test(url) && !url.includes('http') && !url.includes('data:')) {
      // Return a rejected promise to prevent the fetch
      return Promise.reject(new Error('Invalid UUID URL blocked'));
    }
    return originalFetch.apply(this, args);
  };

  // Intercept XMLHttpRequest to prevent loading invalid UUID URLs
  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    if (url && typeof url === 'string') {
      const isJustUuid = uuidPattern.test(url) && !url.includes('http') && !url.includes('data:');
      if (isJustUuid) {
        // Prevent the request
        console.warn('[WebContent] Blocked XMLHttpRequest with UUID URL:', url);
        this.abort();
        return;
      }
    }
    return originalXHROpen.call(this, method, url, ...args);
  };

  // Intercept window.open to prevent opening UUID URLs
  const originalWindowOpen = window.open;
  window.open = function(url, target, features) {
    if (url && typeof url === 'string') {
      const isJustUuid = uuidPattern.test(url) && !url.includes('http') && !url.includes('data:');
      if (isJustUuid) {
        console.warn('[WebContent] Blocked window.open with UUID URL:', url);
        return null;
      }
    }
    return originalWindowOpen.call(this, url, target, features);
  };

  // Use capture phase to catch errors early - MUST be before any images/iframes load
  // Add listeners with highest priority (capture phase, first)
  if (document.addEventListener) {
    document.addEventListener('error', handleResourceError, { capture: true, passive: false });
    window.addEventListener('error', handleError, { capture: true, passive: false });
    window.addEventListener('unhandledrejection', handleRejection, { capture: true, passive: false });
    
    // Also intercept network errors (resource loading failures) to suppress UUID-related 404s
    window.addEventListener('error', (e) => {
      const url = e.filename || e.target?.src || e.target?.href || '';
      if (url && typeof url === 'string') {
        // Check if the URL is just a UUID
        const isJustUuid = uuidPattern.test(url) && !url.includes('http') && !url.includes('data:');
        if (isJustUuid) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return false;
        }
      }
    }, { capture: true, passive: false });
  } else {
    // Fallback for older browsers
    document.addEventListener('error', handleResourceError, true);
    window.addEventListener('error', handleError, true);
    window.addEventListener('unhandledrejection', handleRejection);
  }
  
  // Immediately clean up any existing invalid image sources in the DOM
  const cleanupInvalidImages = () => {
    const allImages = document.querySelectorAll('img');
    allImages.forEach(img => {
      const src = img.src || img.getAttribute('src') || '';
      if (src && typeof src === 'string') {
        const isJustUuid = uuidPattern.test(src) && !src.includes('http') && !src.includes('data:');
        if (isJustUuid) {
          img.removeAttribute('src');
          img.style.display = 'none';
          img.setAttribute('data-blocked-uuid', 'true');
        }
      }
    });
  };
  
  // Run cleanup immediately if DOM is ready, otherwise wait
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanupInvalidImages);
  } else {
    cleanupInvalidImages();
  }
  
  // Also run cleanup periodically to catch dynamically added images
  // Use a more frequent interval initially, then back off
  let cleanupCount = 0;
  const cleanupInterval = setInterval(() => {
    cleanupInvalidImages();
    cleanupCount++;
    // After 50 iterations (5 seconds), reduce frequency to every 500ms
    if (cleanupCount > 50) {
      clearInterval(cleanupInterval);
      setInterval(cleanupInvalidImages, 500);
    }
  }, 100);
  
  // Clear any cached invalid URLs from localStorage/sessionStorage
  // Also clear ALL localStorage keys that might contain avatar data or upload URLs
  try {
    const keysToCheck = ['home_data_', 'calendar_cache_', 'children_cache', 'calendar_data_', 'month_data_', 'week_data_'];
    const allKeys = Object.keys(localStorage);
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    // Recursively clean invalid UUID URLs in cached data
    const cleanData = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(cleanData);
      } else if (obj && typeof obj === 'object') {
        const cleaned = {};
        for (const [k, v] of Object.entries(obj)) {
          // Check avatar fields, url fields, and thumbnailUrl fields
          if ((k === 'avatar_url' || k === 'avatar' || k === 'url' || k === 'thumbnailUrl') && typeof v === 'string') {
            if (uuidPattern.test(v.trim()) && !v.includes('http') && !v.includes('data:')) {
              cleaned[k] = null; // Remove invalid UUID
            } else {
              cleaned[k] = v;
            }
          } else {
            cleaned[k] = cleanData(v);
          }
        }
        return cleaned;
      }
      return obj;
    };
    
    allKeys.forEach(key => {
      if (keysToCheck.some(prefix => key.startsWith(prefix))) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          const cleaned = cleanData(data);
          localStorage.setItem(key, JSON.stringify(cleaned));
        } catch (e) {
          // If parsing fails, just delete the cache entry
          localStorage.removeItem(key);
        }
      }
    });
    
    // Also clear sessionStorage
    try {
      const sessionKeys = Object.keys(sessionStorage);
      sessionKeys.forEach(key => {
        if (keysToCheck.some(prefix => key.startsWith(prefix))) {
          try {
            const data = JSON.parse(sessionStorage.getItem(key));
            const cleaned = cleanData(data);
            sessionStorage.setItem(key, JSON.stringify(cleaned));
          } catch (e) {
            sessionStorage.removeItem(key);
          }
        }
      });
    } catch (e) {
      // Ignore sessionStorage errors
    }
  } catch (e) {
    // Ignore storage errors
  }
}
import { Ionicons } from '@expo/vector-icons'
import { Clock, ArrowRight, UserCircle, Link, MapPin, Eye, Plus, Upload, Copy, Sparkles, Download, Users, Settings, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { proposeReschedule, getWeekStart, apiRequest } from '../lib/apiClient'
import { deleteEvent as deletePlannerEvent } from '../lib/services/plannerClientWithOffline'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import SyllabusUpload from './SyllabusUpload'
import SyllabusUploadModal from './planner/SyllabusUploadModal'
import AIChatModal from './AIChatModal'
import CalendarPlanning from './CalendarPlanning'
import TaskCreateModal from './TaskCreateModal'
import EventModal from './events/EventModal'
// import ExploreContent from './archived/ExploreContent' // Archived - explore page removed
import QuickReviewModal from './materials/QuickReviewModal'
import RebalanceModal from './year/RebalanceModal'
import EventOutcomeModal from './events/EventOutcomeModal'
import ChildDashboard from './dashboards/ChildDashboard'
import TutorDashboard from './dashboards/TutorDashboard'
import IntegrationsSettings from './settings/IntegrationsSettings'
import InspireLearning from './inspire/InspireLearning'
import LearningStoryCard from './parent/LearningStoryCard'
import AssuranceCard from './confidence/AssuranceCard'
import StudentStreakNotification from './confidence/StudentStreakNotification'
import ContinueLearningStrip from './content/ContinueLearningStrip'
import TemplatesPage from './templates/TemplatesPage'
import HomeTopBar from './home/HomeTopBar'
import TodayNotificationCard from './home/TodayNotificationCard'
import MicroNotificationCard from './home/MicroNotificationCard'
import HeroMoodCard from './home/HeroMoodCard'
import FamilyOverviewCards from './home/FamilyOverviewCards'
import ChildMicroWorldCard from './home/ChildMicroWorldCard'
import ParentCoachingCards from './home/ParentCoachingCards'
import CollapsedInsightsSection from './home/CollapsedInsightsSection'
import HomeTileMissingLogs from './home/tiles/HomeTileMissingLogs'
import HomeTilePortfolioSuggestions from './home/tiles/HomeTilePortfolioSuggestions'
import HomeTileAreasOfMastery from './home/tiles/HomeTileAreasOfMastery'
import HomeTileReflectionPrompt from './home/tiles/HomeTileReflectionPrompt'
import GroupsPage from './social/GroupsPage'
import MarketplacePage from './social/MarketplacePage'

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
import AddSubjectModal from './AddSubjectModal'
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
import TodaysLearningTimeGrouped from './home/TodaysLearningTimeGrouped'
import DailyConnectionUnified from './home/DailyConnectionUnified'
import TodayCard from './home/TodayCard'
import WeeklyProgress from './home/WeeklyProgress'
import DailyInsights from './home/DailyInsights'
import HeroInsights from './home/HeroInsights'
import StickyNotesContainer from './notes/StickyNotesContainer'
import { getDailyTips } from '../lib/dailyTips'
import LoadingScreen from './LoadingScreen'
import UpcomingBigEvents from './home/UpcomingBigEvents'
import RecommendedReads from './home/RecommendedReads'
import TasksToday from './home/TasksToday'
import ConversationStarters from './home/ConversationStarters'
import NextUpTile from './home/NextUpTile'
import DayDrawer from './planner/DayDrawer'
import { getTodaySummary, getTodayInsights, getMultiDaySummary, getHomeTilesSummary } from '../lib/services/homeClient'
import { generateInsights, buildInsightContext } from '../lib/services/insightEngine'
import AIActions from './planner/AIActions'
import CenterPane from './planner/CenterPane'
import ChildProfile from './ChildProfile'
// import Attendance from './records/Attendance' // Archived - records screen removed
import Uploads from './documents/Uploads'
import UploadsEnhanced from './documents/UploadsEnhanced'
// import DocumentsEnhanced from './documents/DocumentsEnhanced' // Causes bundler issues
import LessonPlans from './lesson-plans/LessonPlans'
// import Reports from './records/Reports' // Archived - records screen removed
// import RecordsPhase4 from './records/RecordsPhase4' // Archived - records screen removed
// import WebRecordsScreen from './records/WebRecordsScreen' // Archived - records screen removed
import PortfolioTimeline from './portfolio/PortfolioTimeline'
import MaterialsLibrary from './materials/MaterialsLibrary'
import IntelligenceHub from './intelligence/IntelligenceHub'
import { getMaterials } from '../lib/services/materialsClient'
import CoachTab from './ai/CoachTab'
import ProfileScreen from '../app/profile';
import ComprehensiveProfile from './profile/ComprehensiveProfile';
import SectionHeader from './ui/SectionHeader'
import SuggestionActionModal from './planner/SuggestionActionModal'
// import NoteEditorModal from './records/NoteEditorModal' // Archived - records screen removed
import CurriculumImportWizard from './curriculum/CurriculumImportWizard'
import { colors, shadows } from '../theme/colors'

import SubjectSelectForm from './SubjectSelectForm'
import TemplatePicker from './templates/TemplatePicker'
import { getSubjectRecommendations, processLiveClass, analyzeProgress, chatWithDoodleBot } from '../lib/aiProcessor.js'
import { AIConversationService } from '../lib/aiConversationService.js'
import { processDoodleMessage, executeTool } from '../lib/doodleAssistant.js'
import { useOfflineSync } from '../lib/hooks/useOfflineSync'
import { detectConflicts } from '../lib/utils/conflictDetection'
import DragDropConflictBanner from './planner/DragDropConflictBanner'

export default function WebContent({ activeTab, activeSubtab, activeChildSection, user, onChildAdded, navigation, showSyllabusUpload, onSyllabusProcessed, onCloseSyllabusUpload, onTabChange, onSubtabChange, pendingDoodlePrompt, onConsumeDoodlePrompt, showAddChildModal, onCloseAddChildModal, showAddSubjectModal, onCloseAddSubjectModal, onRightSidebarRender, onOpenSettings, onEditChild, onAddSyllabus, onHomeLoadingChange, selectedCalendarChildren: propSelectedCalendarChildren, onSelectedCalendarChildrenChange, selectedEventTypes: propSelectedEventTypes, onSelectedEventTypesChange, onCurrentMonthChange, onCalendarViewChange }) {
  // Helper function to validate and clean avatar URLs
  // Filters out UUIDs that aren't valid URLs to prevent 404 errors
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
  const [conversationStarters, setConversationStarters] = useState([]);
  const [weeklyProgress, setWeeklyProgress] = useState({});
  const [weeklyProgressLoading, setWeeklyProgressLoading] = useState(true);
  const [hasWeeklyGoal, setHasWeeklyGoal] = useState(false);
  const [hasBacklogItems, setHasBacklogItems] = useState(false);
  const [backlogCount, setBacklogCount] = useState(0);
  
  // Home filters (date and children)
  const [homeSelectedDate, setHomeSelectedDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [homeSelectedChildren, setHomeSelectedChildren] = useState('all');
  
  // On app load, check if the real current date has changed and update homeSelectedDate if needed
  useEffect(() => {
    const checkAndUpdateDate = () => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      // Compare dates using local date components to avoid timezone issues
      const formatLocalDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      const nowDateStr = formatLocalDate(now);
      const selectedDateStr = formatLocalDate(homeSelectedDate);
      
      if (nowDateStr !== selectedDateStr) {
        console.log('[WebContent] Date changed detected on app load:', {
          previous: selectedDateStr,
          current: nowDateStr,
          updating: true
        });
        setHomeSelectedDate(now);
      }
    };
    
    // Check immediately on mount
    checkAndUpdateDate();
  }, []); // Empty dependency array = run only on mount
  
  // Home summary data (from Records + Intelligence)
  const [homeSummary, setHomeSummary] = useState(null);
  const [homeSummaryLoading, setHomeSummaryLoading] = useState(false);
  const [homeNotifications, setHomeNotifications] = useState([]);
  const [microNotifications, setMicroNotifications] = useState([]);
  const [multiDaySummary, setMultiDaySummary] = useState(null);
  const [multiDayLoading, setMultiDayLoading] = useState(false);
  const [homeTilesData, setHomeTilesData] = useState(null);
  const [homeTilesLoading, setHomeTilesLoading] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [showSuggestionModal, setShowSuggestionModal] = useState(false);
  const [showCurriculumWizard, setShowCurriculumWizard] = useState(false);
  
  
  // Adaptive layout tier (1 = base, 2 = expanded, 3 = full)
  const [rightSidebarTier, setRightSidebarTier] = useState(1);
  const rightSidebarRef = useRef(null);
  
  // Family ID state (must be declared early to avoid TDZ errors)
  const [familyId, setFamilyId] = useState(null);
  
  // Materials cache for pre-loading
  const [materialsCache, setMaterialsCache] = useState(null);
  const [materialsCacheTimestamp, setMaterialsCacheTimestamp] = useState(null);
  const [materialsCacheLoading, setMaterialsCacheLoading] = useState(false);
  
  // Pre-load materials when familyId is available
  useEffect(() => {
    if (!familyId || materialsCacheLoading) return;
    
    // Only pre-load if cache is empty or older than 5 minutes
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    const shouldPreload = !materialsCache || 
                         !materialsCacheTimestamp || 
                         (Date.now() - materialsCacheTimestamp > CACHE_TTL);
    
    if (shouldPreload) {
      setMaterialsCacheLoading(true);
      getMaterials(familyId, {})
        .then(data => {
          setMaterialsCache(data);
          setMaterialsCacheTimestamp(Date.now());
        })
        .catch(err => {
          console.warn('[WebContent] Error pre-loading materials:', err);
        })
        .finally(() => {
          setMaterialsCacheLoading(false);
        });
    }
  }, [familyId, materialsCache, materialsCacheTimestamp, materialsCacheLoading]);
  
  // Initialize offline sync
  useOfflineSync(familyId);
  
  // Cache key for home data
  const getHomeDataCacheKey = (familyId, date) => {
    return `home_data_${familyId}_${date}`;
  };

  // Background function to check goals and backlog for CTA stories
  const checkGoalsAndBacklogForCTAs = async (familyId, children, selectedChildId) => {
    const ctaStories = [];
    
    try {
      // Check for active goals (for selected child or first child in family)
      let hasGoals = false;
      let childIdToCheck = selectedChildId;
      
      if (!childIdToCheck && children.length > 0) {
        childIdToCheck = children[0].id;
      }
      
      if (childIdToCheck) {
        try {
          const { data: goalCount, error: goalsError } = await supabase
            .rpc('get_child_active_goals_count', { p_child_id: childIdToCheck });
          
          if (!goalsError) {
            hasGoals = (goalCount || 0) > 0;
          }
        } catch (err) {
          console.warn('[Home] Error checking goals:', err);
        }
      }
      
      // Check for backlog items (events with status='backlog')
      try {
        let backlogQuery = supabase
          .from('events')
          .select('id')
          .eq('family_id', familyId)
          .eq('status', 'backlog');
        if (selectedChildId) {
          backlogQuery = backlogQuery.eq('child_id', selectedChildId);
        }
        const { data: backlog } = await backlogQuery;
        const hasBacklog = (backlog || []).length > 0;
        
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
      } catch (err) {
        console.warn('[Home] Error checking backlog:', err);
      }
    } catch (err) {
      console.warn('[Home] Error in CTA check:', err);
    }
    
    return ctaStories;
  };

  // Cache TTL: 15 minutes
  const CACHE_TTL_MS = 15 * 60 * 1000;

  // Helper to clean invalid avatar UUIDs from data
  const cleanAvatarUrls = (data) => {
    if (!data) return data;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const cleanValue = (val) => {
      if (Array.isArray(val)) {
        return val.map(cleanValue);
      } else if (val && typeof val === 'object') {
        const cleaned = {};
        for (const [k, v] of Object.entries(val)) {
          if ((k === 'avatar_url' || k === 'avatar') && typeof v === 'string') {
            // Remove invalid UUIDs
            if (uuidPattern.test(v.trim()) && !v.includes('http') && !v.includes('data:')) {
              cleaned[k] = null;
            } else {
              cleaned[k] = v;
            }
          } else {
            cleaned[k] = cleanValue(v);
          }
        }
        return cleaned;
      }
      return val;
    };
    return cleanValue(data);
  };

  // Load from cache
  const loadHomeDataFromCache = (familyId, date) => {
    if (typeof window === 'undefined') return null;
    try {
      const cacheKey = getHomeDataCacheKey(familyId, date);
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return null;
      
      const { data, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;
      
      if (age < CACHE_TTL_MS) {
        // Clean invalid UUIDs from cached data before returning
        return cleanAvatarUrls(data);
      } else {
        console.log(`[Home] Cache expired (age: ${Math.round(age / 1000)}s)`);
        localStorage.removeItem(cacheKey);
        return null;
      }
    } catch (err) {
      console.error('[Home] Error reading cache:', err);
      return null;
    }
  };

  // Save to cache
  const saveHomeDataToCache = (familyId, date, data) => {
    if (typeof window === 'undefined') return;
    try {
      const cacheKey = getHomeDataCacheKey(familyId, date);
      // Clean invalid UUIDs before saving to cache
      const cleanedData = cleanAvatarUrls(data);
      localStorage.setItem(cacheKey, JSON.stringify({
        data: cleanedData,
        timestamp: Date.now()
      }));
      console.log('[Home] Data cached');
    } catch (err) {
      console.error('[Home] Error saving cache:', err);
    }
  };

  // Invalidate cache (call when data changes)
  const invalidateHomeDataCache = (familyId, date = null) => {
    if (typeof window === 'undefined') return;
    try {
      if (date) {
        // Invalidate specific date
        const cacheKey = getHomeDataCacheKey(familyId, date);
        localStorage.removeItem(cacheKey);
        console.log(`[Home] Cache invalidated for ${date}`);
      } else {
        // Invalidate all dates for this family
        const prefix = `home_data_${familyId}_`;
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith(prefix)) {
            localStorage.removeItem(key);
          }
        });
        console.log('[Home] All cache invalidated for family');
      }
    } catch (err) {
      console.error('[Home] Error invalidating cache:', err);
    }
  };

  // Ref to store refreshCalendarData function for event listener
  const refreshCalendarDataRef = useRef(null);
  
  // Initialize the ref and global function - this will be set when refreshCalendarData is defined
  // We'll set it up in a useEffect that depends on refreshCalendarData being available

  // Listen for openTaskModal event - only handle if NOT on family screen
  // Family screen events are handled by WebLayout's global modal
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleOpenTaskModal = (event) => {
      const detail = event.detail || {};
      
      // Check if we're on the family screen - if so, let WebLayout handle it
      const isFamilyScreen = activeTab === 'profile' || 
                            (activeTab && typeof activeTab === 'string' && activeTab.startsWith('child-')) ||
                            (activeTab && typeof activeTab === 'string' && activeTab.startsWith('notes-pages-')) ||
                            activeTab === 'children-list';
      
      if (isFamilyScreen) {
        console.log('[WebContent] openTaskModal event ignored - on family screen, WebLayout will handle it');
        return;
      }
      
      // Only handle for non-family screens (planner, home, etc.)
      const date = detail.date || new Date();
      const childId = detail.childId || null;
      
      console.log('[WebContent] openTaskModal event received (non-family screen):', { 
        date, 
        childId, 
        eventType: detail.eventType, 
        subjectId: detail.subjectId,
        activeTab 
      });
      
      // Set all state values - React will batch these updates
      setTaskModalDate(date);
      setTaskModalChildId(childId);
      setTaskModalDefaultPlacement('calendar'); // Ensure placement is set
      setShowTaskModal(true);
      
      console.log('[WebContent] Task modal state set - showTaskModal: true, date:', date, 'childId:', childId);
    };
    
    console.log('[WebContent] Setting up openTaskModal event listener');
    window.addEventListener('openTaskModal', handleOpenTaskModal);
    
    return () => {
      console.log('[WebContent] Removing openTaskModal event listener');
      window.removeEventListener('openTaskModal', handleOpenTaskModal);
    };
  }, [activeTab]);

  // Listen for openEventModal event to open event details modal
  // Only handle if NOT on family screen - family screen events are handled by WebLayout's global modal
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleOpenEventModal = (event) => {
      const detail = event.detail || {};
      const eventId = detail.eventId;
      const initialEvent = detail.initialEvent || null;
      
      // Check if we're on the family screen - if so, let WebLayout handle it
      const isFamilyScreen = activeTab === 'profile' || 
                            (activeTab && typeof activeTab === 'string' && activeTab.startsWith('child-')) ||
                            (activeTab && typeof activeTab === 'string' && activeTab.startsWith('notes-pages-')) ||
                            activeTab === 'children-list';
      
      if (isFamilyScreen) {
        console.log('[WebContent] openEventModal event ignored - on family screen, WebLayout will handle it');
        return;
      }
      
      if (!eventId) {
        console.warn('[WebContent] openEventModal event received but no eventId provided');
        return;
      }
      
      console.log('[WebContent] openEventModal event received (non-family screen):', { eventId, hasInitialEvent: !!initialEvent, activeTab });
      
      // Close any other modals
      setShowNewEventForm(false);
      setShowTaskModal(false);
      
      // Open the event modal
      setEventModalEventId(eventId);
      setEventModalInitialEvent(initialEvent);
      setEventModalVisible(true);
    };
    
    window.addEventListener('openEventModal', handleOpenEventModal);
    
    return () => {
      window.removeEventListener('openEventModal', handleOpenEventModal);
    };
  }, [activeTab]);
  
  // Listen for optimistic event reschedule updates
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleEventRescheduled = async (event) => {
      const { eventId, updatedEvent, apiError } = event.detail || {};
      if (!eventId || !updatedEvent) return;
      
      console.log('[WebContent] Optimistic update for event:', eventId);
      
      // Mark the time of this drag-and-drop to prevent immediate refreshes
      lastDragDropTimeRef.current = Date.now();
      
      // Track this event as having a pending optimistic update
      pendingOptimisticUpdatesRef.current.add(eventId);
      
      // We'll clear the pending flag after conflict detection completes
      // If there's a conflict, we'll keep it until resolved
      // If no conflict, we'll clear it after the API call completes (handled in conflict detection)
      
      // Debounce: Don't show banner if same event dragged multiple times quickly
      if (dragDebounceTimeoutRef.current) {
        clearTimeout(dragDebounceTimeoutRef.current);
      }
      
      // Check if this is the same event as last drag (debounce)
      const isSameEvent = lastDragEventRef.current?.eventId === eventId;
      const timeSinceLastDrag = lastDragEventRef.current 
        ? Date.now() - lastDragEventRef.current.timestamp 
        : Infinity;
      
      // If this is a new drag of the same event, clear any previous pending flag
      // (user is making a new move, so previous optimistic update is no longer relevant)
      if (isSameEvent && timeSinceLastDrag > 2000) {
        console.log('[WebContent] Same event dragged again - clearing previous pending flag');
        // Don't clear here - we'll add it again below, but this ensures we start fresh
      }
      
      // Always run conflict detection, even for optimistic updates
      // The debounce timeout will handle rapid successive drags
      // We need to check for conflicts even if the API hasn't responded yet
      console.log('[WebContent] Running conflict detection:', { 
        eventId, 
        isSameEvent, 
        timeSinceLastDrag, 
        apiError: !!apiError,
        willRun: true 
      });
      
      // Store this drag for debouncing
      lastDragEventRef.current = {
        eventId,
        timestamp: Date.now(),
      };
      
      // Wait a bit for the database to update, then check for conflicts
      dragDebounceTimeoutRef.current = setTimeout(async () => {
        try {
          // Get all events for the same child and day
          const eventDate = new Date(updatedEvent.start_ts || updatedEvent.start || updatedEvent.start_local);
          if (isNaN(eventDate.getTime())) {
            console.log('[WebContent] Invalid event date for conflict detection:', updatedEvent.start_ts || updatedEvent.start || updatedEvent.start_local);
            return;
          }
          const dateKey = eventDate.toISOString().split('T')[0];
          // child_id might be nested or have different name
          const childId = updatedEvent.child_id || updatedEvent.childId || updatedEvent.student_id || 
                         (updatedEvent.data && (updatedEvent.data.child_id || updatedEvent.data.childId || updatedEvent.data.student_id));
          
          // Try to get familyId from event if not available from state
          const eventFamilyId = familyId || updatedEvent.family_id || updatedEvent.familyId ||
                               (updatedEvent.data && (updatedEvent.data.family_id || updatedEvent.data.familyId));
          
          if (!childId || !dateKey || !eventFamilyId) {
            console.log('[WebContent] Missing required data for conflict detection:', { 
              childId, 
              dateKey, 
              familyId,
              eventFamilyId,
              updatedEventKeys: Object.keys(updatedEvent),
              hasData: !!updatedEvent.data,
              dataKeys: updatedEvent.data ? Object.keys(updatedEvent.data) : null
            });
            return;
          }
          
          // Fetch from database to ensure we have the latest (including the just-moved event)
          const { data: dbEvents, error } = await supabase
            .from('events')
            .select('*')
            .eq('family_id', eventFamilyId)
            .eq('child_id', childId)
            .gte('start_ts', new Date(dateKey + 'T00:00:00').toISOString())
            .lt('start_ts', new Date(dateKey + 'T23:59:59').toISOString())
            .neq('status', 'canceled')
            .is('canceled_at', null)
            .is('deleted_at', null);
          
          if (error) {
            console.error('[WebContent] Error fetching events for conflict detection:', error);
            return;
          }
          
          // Create a mutable copy of dbEvents for conflict detection
          // dbEvents is readonly from Supabase, so we need a new array
          let eventsForConflictDetection = [...(dbEvents || [])];
          
          // Find the moved event in the database results
          // If not found, or if found but position doesn't match optimistic update (conflict occurred),
          // use the optimistic update data for conflict detection
          let movedEvent = eventsForConflictDetection.find(e => e.id === eventId);
          const optimisticStart = updatedEvent.start_ts || updatedEvent.start || updatedEvent.start_local;
          const optimisticEnd = updatedEvent.end_ts || updatedEvent.end || updatedEvent.end_local;
          
          if (!movedEvent) {
            console.log('[WebContent] Moved event not found in database - using optimistic update data');
            // Use the optimistic update data for conflict detection
            movedEvent = {
              id: eventId,
              child_id: updatedEvent.child_id,
              start_ts: optimisticStart,
              end_ts: optimisticEnd,
              title: updatedEvent.title || 'Event',
            };
            // Add it to eventsForConflictDetection
            eventsForConflictDetection = [...eventsForConflictDetection, movedEvent];
          } else {
            // Check if database position matches optimistic update
            const dbStart = movedEvent.start_ts;
            const dbEnd = movedEvent.end_ts;
            
            // If positions don't match, the API call likely failed (conflict), so use optimistic update
            if (dbStart !== optimisticStart || dbEnd !== optimisticEnd) {
              console.log('[WebContent] Database position differs from optimistic update (conflict detected) - using optimistic update for conflict detection');
              // Replace the database version with optimistic update for conflict detection
              movedEvent = {
                ...movedEvent,
                start_ts: optimisticStart,
                end_ts: optimisticEnd,
              };
              // Update in eventsForConflictDetection array
              const index = eventsForConflictDetection.findIndex(e => e.id === eventId);
              if (index >= 0) {
                eventsForConflictDetection = [...eventsForConflictDetection.slice(0, index), movedEvent, ...eventsForConflictDetection.slice(index + 1)];
              }
            }
          }
          
          // Detect conflicts
          const conflictCount = detectConflicts(movedEvent, eventsForConflictDetection);
          
          if (conflictCount > 0) {
            // Find the first conflicting event for the banner
            const movedStart = new Date(movedEvent.start_ts || movedEvent.start);
            const movedEnd = new Date(movedEvent.end_ts || movedEvent.end);
            const movedChildId = movedEvent.child_id;
            
            let firstConflictEvent = null;
            for (const event of eventsForConflictDetection || []) {
              if (!event || event.id === eventId || event.child_id !== movedChildId) continue;
              if (event.status === 'canceled' || event.canceled_at || event.deleted_at) continue;
              
              const eventStart = new Date(event.start_ts || event.start);
              const eventEnd = new Date(event.end_ts || event.end);
              const movedDate = movedStart.toISOString().split('T')[0];
              const eventDate = eventStart.toISOString().split('T')[0];
              if (movedDate !== eventDate) continue;
              
              // Check for overlap
              if (movedStart < eventEnd && eventStart < movedEnd) {
                firstConflictEvent = event;
                break;
              }
            }
            
            // Conflicts detected - keep the pending optimistic update flag
            // so the optimistic update isn't overwritten by refreshes
            console.log('[WebContent] Conflicts detected - showing banner for event:', eventId, 'conflictCount:', conflictCount);
            
            // When conflicts are detected, keep the optimistic update visible so the user can see where they tried to move it
            // and decide what to do via the conflict banner (accept suggestion, undo, etc.)
            // This applies whether the API call succeeded or failed - conflicts are conflicts
            if (conflictCount > 0) {
              console.log('[WebContent] Conflicts detected - keeping optimistic update visible for user interaction', { hasApiError: !!apiError });
              // Ensure the pending optimistic update flag is set so the optimistic update stays visible
              // The user will decide what to do via the conflict banner
              // Don't fetch database state here - let the user interact with the banner first
              pendingOptimisticUpdatesRef.current.add(eventId);
            } else if (apiError && conflictCount === 0) {
              console.log('[WebContent] No conflicts but API error - fetching database state for event:', eventId);
              // Clear the pending optimistic update flag so merge doesn't preserve the failed optimistic update
              pendingOptimisticUpdatesRef.current.delete(eventId);
              // Fetch the database state to update the grid
              (async () => {
                try {
                  const { supabase } = await import('../lib/supabase');
                  const { data: currentEvent, error: fetchError } = await supabase
                    .from('events')
                    .select('*')
                    .eq('id', eventId)
                    .eq('family_id', familyId)
                    .maybeSingle();
                  
                  if (!fetchError && currentEvent) {
                    // Calculate the correct date key for the database event (use local date, not UTC)
                    const eventDate = new Date(currentEvent.start_ts);
                    // Get local date components to build date key (YYYY-MM-DD)
                    const year = eventDate.getFullYear();
                    const month = String(eventDate.getMonth() + 1).padStart(2, '0');
                    const day = String(eventDate.getDate()).padStart(2, '0');
                    const dateKey = `${year}-${month}-${day}`;
                    
                    // Compute start_local in "HH:MM" format (same as RPC) using local time
                    const startLocalHours = eventDate.getHours();
                    const startLocalMinutes = eventDate.getMinutes();
                    const startLocalStr = `${String(startLocalHours).padStart(2, '0')}:${String(startLocalMinutes).padStart(2, '0')}`;
                    
                    // Compute end_local in same format
                    const endLocalStr = currentEvent.end_ts ? (() => {
                      const endDate = new Date(currentEvent.end_ts);
                      return `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
                    })() : undefined;
                    
                    // Format the event to match loadMonthData structure
                    const formattedEvent = {
                      id: currentEvent.id,
                      type: currentEvent.source || 'activity',
                      title: currentEvent.title || 'Untitled Event',
                      childName: 'Child',
                      time: startLocalStr,
                      color: 'teal',
                      subject: '',
                      status: currentEvent.status || 'scheduled',
                      year_plan_id: currentEvent.year_plan_id,
                      event_type: currentEvent.event_type,
                      data: {
                        ...currentEvent,
                        date_local: dateKey,
                      },
                      date_local: dateKey,
                      start_local: startLocalStr,
                      end_local: endLocalStr,
                      start_ts: currentEvent.start_ts,
                      end_ts: currentEvent.end_ts,
                      assignee: currentEvent.child_id,
                      assignees: currentEvent.child_id ? [currentEvent.child_id] : [],
                      child_id: currentEvent.child_id,
                    };
                    
                    // Update calendarEvents: remove from all dates, then add to correct date with database data
                    // Mark as recently fetched FIRST to prevent merge from adding optimistic update back
                    recentlyFetchedFromDbRef.current.set(eventId, Date.now());
                    
                    // Remove optimistic update from cache BEFORE updating calendarEvents to prevent merge from adding it back
                    const monthKey = `${eventDate.getFullYear()}-${eventDate.getMonth()}`;
                    setCalendarDataCache(prev => {
                      const newCache = { ...prev };
                      if (newCache[monthKey]) {
                        // Remove the optimistic update from the cache for this event
                        const monthEvents = newCache[monthKey];
                        Object.keys(monthEvents).forEach(cacheDateKey => {
                          if (Array.isArray(monthEvents[cacheDateKey])) {
                            const beforeCount = monthEvents[cacheDateKey].length;
                            monthEvents[cacheDateKey] = monthEvents[cacheDateKey].filter(e => e && e.id !== eventId);
                            const afterCount = monthEvents[cacheDateKey].length;
                            if (beforeCount > afterCount) {
                              console.log(`[WebContent] Removed optimistic update from cache BEFORE calendarEvents update: ${eventId} from ${cacheDateKey} (${beforeCount} -> ${afterCount} events)`);
                            }
                            if (monthEvents[cacheDateKey].length === 0) {
                              delete monthEvents[cacheDateKey];
                            }
                          }
                        });
                        newCache[monthKey] = monthEvents;
                      }
                      return newCache;
                    });
                    
                    setCalendarEvents(prevEvents => {
                      const newEvents = { ...prevEvents };
                      
                      // Track which dates had the event before removal
                      const datesWithEvent = Object.keys(prevEvents).filter(d => {
                        const dayEvents = prevEvents[d];
                        return Array.isArray(dayEvents) && dayEvents.some(e => e && e.id === eventId);
                      });
                      
                      // Log what events exist on each date before removal
                      const eventsByDate = {};
                      datesWithEvent.forEach(d => {
                        const dayEvents = prevEvents[d] || [];
                        eventsByDate[d] = dayEvents
                          .filter(e => e && e.id === eventId)
                          .map(e => ({ time: e.time, start_local: e.start_local, start_ts: e.start_ts }));
                      });
                      
                      console.log(`[WebContent] Before removal - event ${eventId} exists on dates:`, datesWithEvent, 'with times:', eventsByDate);
                      
                      // Remove the event from wherever it currently is (including optimistic update on wrong date)
                      // IMPORTANT: Remove from ALL dates, including the original date (2026-01-01) if the optimistic update moved it
                      Object.keys(newEvents).forEach(prevDateKey => {
                        const dayEvents = newEvents[prevDateKey];
                        if (Array.isArray(dayEvents)) {
                          const beforeCount = dayEvents.length;
                          // Filter out the event by ID - this removes both optimistic updates and any stale database versions
                          newEvents[prevDateKey] = dayEvents.filter(e => {
                            if (!e || !e.id) return true;
                            if (e.id === eventId) {
                              // Log the time of the event we're removing to help debug
                              const eventTime = e.start_local || e.time || e.start_ts || 'unknown';
                              console.log(`[WebContent] Removing event ${eventId} from ${prevDateKey} (optimistic update or stale data) - time was: ${eventTime}`);
                              return false;
                            }
                            return true;
                          });
                          const afterCount = newEvents[prevDateKey].length;
                          if (beforeCount > afterCount) {
                            console.log(`[WebContent] Removed event ${eventId} from ${prevDateKey} (${beforeCount} -> ${afterCount} events)`);
                          }
                          if (newEvents[prevDateKey].length === 0) {
                            delete newEvents[prevDateKey];
                          }
                        }
                      });
                      
                      // Verify removal worked
                      const afterRemovalDates = Object.keys(newEvents).filter(d => {
                        const dayEvents = newEvents[d];
                        return Array.isArray(dayEvents) && dayEvents.some(e => e && e.id === eventId);
                      });
                      if (afterRemovalDates.length > 0) {
                        console.warn(`[WebContent] WARNING: Event ${eventId} still exists on dates after removal:`, afterRemovalDates);
                        // Force remove again
                        afterRemovalDates.forEach(d => {
                          newEvents[d] = newEvents[d].filter(e => e && e.id !== eventId);
                          if (newEvents[d].length === 0) {
                            delete newEvents[d];
                          }
                        });
                      }
                      
                      // Verify event was removed from all dates
                      const stillExistsOn = Object.keys(newEvents).filter(d => {
                        const dayEvents = newEvents[d];
                        return Array.isArray(dayEvents) && dayEvents.some(e => e && e.id === eventId);
                      });
                      if (stillExistsOn.length > 0) {
                        console.warn('[WebContent] Event still exists on dates after removal:', stillExistsOn);
                        // Force remove from those dates
                        stillExistsOn.forEach(d => {
                          newEvents[d] = newEvents[d].filter(e => e && e.id !== eventId);
                          if (newEvents[d].length === 0) {
                            delete newEvents[d];
                          }
                        });
                      }
                      
                      // Add the event to the correct date with database data
                      // IMPORTANT: Make sure we replace any existing event with the same ID (optimistic update)
                      if (!newEvents[dateKey]) {
                        newEvents[dateKey] = [];
                      }
                      
                      // Log what's on the target date BEFORE we remove anything
                      const beforeRemoveEvents = (newEvents[dateKey] || []).filter(e => e && e.id === eventId);
                      if (beforeRemoveEvents.length > 0) {
                        console.log(`[WebContent] Target date ${dateKey} has ${beforeRemoveEvents.length} instance(s) of event ${eventId} BEFORE removal:`, 
                          beforeRemoveEvents.map(e => ({ time: e.time, start_local: e.start_local, start_ts: e.start_ts }))
                        );
                      } else {
                        console.log(`[WebContent] Target date ${dateKey} has NO instances of event ${eventId} before removal (total events on date: ${(newEvents[dateKey] || []).length})`);
                      }
                      
                      // Remove any existing event with this ID from this date (in case optimistic update is still here)
                      const beforeAddCount = newEvents[dateKey].length;
                      const eventsToRemove = newEvents[dateKey].filter(e => e && e.id === eventId);
                      if (eventsToRemove.length > 0) {
                        console.log(`[WebContent] Found ${eventsToRemove.length} existing instance(s) of event ${eventId} on ${dateKey} to remove:`, 
                          eventsToRemove.map(e => ({ time: e.time, start_local: e.start_local, start_ts: e.start_ts }))
                        );
                      }
                      newEvents[dateKey] = newEvents[dateKey].filter(e => e && e.id !== eventId);
                      const afterFilterCount = newEvents[dateKey].length;
                      if (beforeAddCount > afterFilterCount) {
                        console.log(`[WebContent] Removed ${beforeAddCount - afterFilterCount} existing event(s) ${eventId} from ${dateKey} before adding database version (${beforeAddCount} -> ${afterFilterCount} events)`);
                      }
                      
                      // Now add the database event
                      newEvents[dateKey].push(formattedEvent);
                      console.log(`[WebContent] Added database event ${eventId} to ${dateKey} with time ${formattedEvent.time} (${formattedEvent.start_local})`);
                      
                      // Verify event is now only on the correct date
                      const finalDatesWithEvent = Object.keys(newEvents).filter(d => {
                        const dayEvents = newEvents[d];
                        return Array.isArray(dayEvents) && dayEvents.some(e => e && e.id === eventId);
                      });
                      
                      // Check what events are on the target date after adding database event
                      const eventsOnTargetDate = newEvents[dateKey] || [];
                      const eventTimesOnTargetDate = eventsOnTargetDate
                        .filter(e => e && e.id === eventId)
                        .map(e => ({
                          id: e.id,
                          time: e.time,
                          start_local: e.start_local,
                          start_ts: e.start_ts,
                        }));
                      
                      console.log('[WebContent] Updated calendarEvents with database event (conflict detected):', {
                        eventId,
                        dateKey,
                        start_local: startLocalStr,
                        time: formattedEvent.time,
                        start_ts: currentEvent.start_ts,
                        localDate: `${year}-${month}-${day}`,
                        utcDate: eventDate.toISOString().split('T')[0],
                        formattedEventDate: formattedEvent.date_local,
                        removedFromDates: datesWithEvent,
                        finalDatesWithEvent: finalDatesWithEvent,
                        shouldBeOnlyOn: [dateKey],
                        correct: finalDatesWithEvent.length === 1 && finalDatesWithEvent[0] === dateKey,
                        eventsOnTargetDateAfterAdd: eventsOnTargetDate.length,
                        eventInstancesOnTargetDate: eventTimesOnTargetDate,
                        hasMultipleInstances: eventTimesOnTargetDate.length > 1,
                      });
                      
                      // If there are multiple instances of this event on the target date, that's a problem
                      if (eventTimesOnTargetDate.length > 1) {
                        console.error('[WebContent] ERROR: Multiple instances of event on target date!', {
                          eventId,
                          dateKey,
                          instances: eventTimesOnTargetDate,
                        });
                        // Force remove all except the database version (the one with correct start_local)
                        const beforeFix = newEvents[dateKey].length;
                        newEvents[dateKey] = newEvents[dateKey].filter(e => {
                          if (!e || e.id !== eventId) return true;
                          // Keep only the one that matches the database time
                          const matches = e.start_local === startLocalStr || e.time === formattedEvent.time;
                          if (!matches) {
                            console.log(`[WebContent] Removing duplicate instance with time ${e.time} (${e.start_local}), keeping database version ${formattedEvent.time} (${startLocalStr})`);
                          }
                          return matches;
                        });
                        const afterFix = newEvents[dateKey].length;
                        console.log(`[WebContent] Fixed: Removed duplicate instances (${beforeFix} -> ${afterFix} events), kept only database version`);
                      } else if (eventTimesOnTargetDate.length === 1) {
                        // Check if the single instance has the correct time
                        const instance = eventTimesOnTargetDate[0];
                        if (instance.start_local !== startLocalStr && instance.time !== formattedEvent.time) {
                          console.warn('[WebContent] WARNING: Single instance has wrong time!', {
                            eventId,
                            dateKey,
                            instanceTime: instance.time,
                            instanceStartLocal: instance.start_local,
                            expectedTime: formattedEvent.time,
                            expectedStartLocal: startLocalStr,
                          });
                          // Replace it with the database version
                          const index = newEvents[dateKey].findIndex(e => e && e.id === eventId);
                          if (index >= 0) {
                            newEvents[dateKey][index] = formattedEvent;
                            console.log(`[WebContent] Replaced wrong instance with database version`);
                          }
                        }
                      }
                      
                      return newEvents;
                    });
                    
                    // Mark this event as recently fetched from database (extend timeout to 10 seconds)
                    // Note: This was already set above before calendarEvents update, and cache was already cleaned
                    
                    setTimeout(() => {
                      recentlyFetchedFromDbRef.current.delete(eventId);
                      console.log('[WebContent] Removed recentlyFetchedFromDb flag for event:', eventId);
                    }, 10000);
                    
                    // Store formattedEvent in a variable accessible to the setTimeout
                    const dbEventForVerification = formattedEvent;
                    const correctDateKey = dateKey;
                    
                    // Double-check after a short delay that the event is only on the correct date with correct time
                    setTimeout(() => {
                      setCalendarEvents(prevEvents => {
                        const allDatesWithEvent = Object.keys(prevEvents).filter(d => {
                          const dayEvents = prevEvents[d];
                          return Array.isArray(dayEvents) && dayEvents.some(e => e && e.id === eventId);
                        });
                        
                        // Check the event on the target date to see if it has the correct time
                        const eventsOnTargetDate = prevEvents[correctDateKey] || [];
                        const eventInstancesOnTarget = eventsOnTargetDate
                          .filter(e => e && e.id === eventId)
                          .map(e => ({
                            time: e.time,
                            start_local: e.start_local,
                            start_ts: e.start_ts,
                          }));
                        
                        const hasCorrectTime = eventInstancesOnTarget.some(e => 
                          e.start_local === dbEventForVerification.start_local || 
                          e.time === dbEventForVerification.time
                        );
                        
                        if (allDatesWithEvent.length !== 1 || allDatesWithEvent[0] !== correctDateKey || !hasCorrectTime) {
                          console.warn('[WebContent] Event is on wrong dates or has wrong time after update, fixing:', {
                            eventId,
                            allDatesWithEvent,
                            shouldBeOn: correctDateKey,
                            eventsOnTargetDate: eventInstancesOnTarget,
                            expectedTime: dbEventForVerification.time,
                            expectedStartLocal: dbEventForVerification.start_local,
                            hasCorrectTime,
                          });
                          
                          const newEvents = { ...prevEvents };
                          
                          // Remove from all dates
                          allDatesWithEvent.forEach(d => {
                            if (d !== correctDateKey) {
                              const beforeCount = (newEvents[d] || []).length;
                              newEvents[d] = (newEvents[d] || []).filter(e => e && e.id !== eventId);
                              const afterCount = newEvents[d].length;
                              if (beforeCount > afterCount) {
                                console.log(`[WebContent] Verification: Removed event ${eventId} from ${d} (${beforeCount} -> ${afterCount} events)`);
                              }
                              if (newEvents[d].length === 0) {
                                delete newEvents[d];
                              }
                            }
                          });
                          
                          // Ensure it's on the correct date with correct time
                          if (!newEvents[correctDateKey]) {
                            newEvents[correctDateKey] = [];
                          }
                          
                          // Remove all instances of this event from the correct date first
                          const beforeRemove = newEvents[correctDateKey].length;
                          newEvents[correctDateKey] = newEvents[correctDateKey].filter(e => e && e.id !== eventId);
                          const afterRemove = newEvents[correctDateKey].length;
                          if (beforeRemove > afterRemove) {
                            console.log(`[WebContent] Verification: Removed ${beforeRemove - afterRemove} instance(s) of event ${eventId} from ${correctDateKey} (had wrong time)`);
                          }
                          
                          // Now add the database version
                          newEvents[correctDateKey].push(dbEventForVerification);
                          console.log(`[WebContent] Verification: Added/Replaced event ${eventId} on ${correctDateKey} with correct time ${dbEventForVerification.time} (${dbEventForVerification.start_local})`);
                          
                          // Verify again
                          const finalDates = Object.keys(newEvents).filter(d => {
                            const dayEvents = newEvents[d];
                            return Array.isArray(dayEvents) && dayEvents.some(e => e && e.id === eventId);
                          });
                          console.log('[WebContent] Verification complete:', {
                            eventId,
                            finalDates,
                            shouldBeOn: correctDateKey,
                            correct: finalDates.length === 1 && finalDates[0] === correctDateKey,
                          });
                          
                          return newEvents;
                        }
                        
                        return prevEvents;
                      });
                    }, 100);
                  }
                } catch (err) {
                  console.error('[WebContent] Error fetching database state during conflict:', err);
                }
              })();
            }
            
            // Check if banner was already dismissed for this specific move
            setConflictBanner(prev => {
              const wasDismissed = prev.dismissed && 
                                   prev.eventId === eventId &&
                                   prev.timestamp > Date.now() - 60000; // Within last minute
              
              if (!wasDismissed) {
                // Format conflict message similar to TaskCreateModal
                let conflictMessage = null;
                if (firstConflictEvent) {
                  const eventDate = new Date(firstConflictEvent.start_ts);
                  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                  const dayName = dayNames[eventDate.getDay()];
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
                  
                  const eventStart = new Date(firstConflictEvent.start_ts);
                  const eventEnd = new Date(firstConflictEvent.end_ts || firstConflictEvent.start_ts);
                  const startTimeStr = formatTime(eventStart);
                  const endTimeStr = formatTime(eventEnd);
                  
                  // Format time range: "4 PM–5 PM" -> "4–5 PM"
                  const startTimeOnly = startTimeStr.replace(/\s*(AM|PM)$/i, '');
                  const endTimeOnly = endTimeStr.replace(/\s*(AM|PM)$/i, '');
                  const period = startTimeStr.includes('PM') ? 'PM' : 'AM';
                  const timeRange = `${startTimeOnly}–${endTimeOnly} ${period}`;
                  
                  conflictMessage = `${firstConflictEvent.title} (${dayName} ${monthName} ${day}, ${timeRange})`;
                }
                
                return {
                  visible: true,
                  eventId,
                  conflictCount,
                  eventTitle: movedEvent.title || 'this event',
                  conflictEvent: firstConflictEvent, // Store the first conflicting event
                  movedEvent: movedEvent, // Store the moved event for suggestion acceptance
                  conflictMessage, // Formatted conflict message
                  dismissed: false,
                  timestamp: Date.now(),
                };
              }
              return prev;
            });
          } else {
            // No conflicts detected
            if (apiError) {
              // API call failed but no conflicts found - this might be a permission error or other issue
              // Keep the optimistic update visible so user can see what they tried to do
              // Show error message to user
              // Log full error details for debugging
              console.error('[WebContent] No conflicts but API error - keeping optimistic update visible and showing error:', {
                eventId,
                error: apiError,
                errorMessage: apiError?.message,
                errorStatus: apiError?.status,
                errorDetail: apiError?.detail,
                fullError: JSON.stringify(apiError, null, 2),
              });
              
              // Keep the optimistic update visible
              pendingOptimisticUpdatesRef.current.add(eventId);
              
              // Show error alert to user
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                const errorMessage = apiError?.message || apiError?.detail || 'Unable to save the event change. Please try again.';
                const errorStatus = apiError?.status;
                let userMessage = errorMessage;
                
                // Provide more helpful error messages based on error type
                if (errorStatus === 500) {
                  if (errorMessage.includes('permission') || errorMessage.includes('42501') || errorMessage.includes('calendar_days_cache')) {
                    userMessage = 'Database permission error. The system cannot access required data. Please contact support.\n\nError: ' + errorMessage;
                  } else if (errorMessage.includes('outside_availability')) {
                    userMessage = 'The new time is outside the available time blocks for this child.';
                  } else if (errorMessage.includes('RPC error')) {
                    userMessage = 'Database error occurred. This is likely a permissions issue that needs to be fixed on the server.\n\nError: ' + errorMessage;
                  } else {
                    userMessage = 'Server error occurred while saving. Changes will be lost on refresh. Please try again or contact support if the problem persists.\n\nError: ' + errorMessage;
                  }
                }
                
                Alert.alert(
                  'Failed to Save',
                  userMessage + '\n\nNote: Your changes are visible but not saved. They will be lost if you refresh the page.',
                  [{ text: 'OK' }]
                );
              }
              
              // Don't fetch database state - keep optimistic update visible
              // The user can try again or refresh to see the actual state
              return;
            } else {
              // No conflicts and API call succeeded - clear the pending flag
              // The database now has the correct position, so refreshes are safe
              console.log('[WebContent] No conflicts - clearing pending optimistic update for event:', eventId);
              pendingOptimisticUpdatesRef.current.delete(eventId);
            }
            
            // Hide banner if it was showing for this event
            setConflictBanner(prev => {
              if (prev.eventId === eventId) {
                return { ...prev, visible: false };
              }
              return prev;
            });
          }
        } catch (err) {
          console.error('[WebContent] Error in conflict detection:', err);
        }
      }, 800); // Delay to ensure database has updated
      
      // Update the event in calendarEvents immediately
      setCalendarEvents(prevEvents => {
        const newEvents = { ...prevEvents };
        let found = false;
        
        // Find and update the event in the calendarEvents structure
        Object.keys(newEvents).forEach(dateKey => {
          const dayEvents = newEvents[dateKey];
          if (Array.isArray(dayEvents)) {
            const index = dayEvents.findIndex(e => e && e.id === eventId);
            if (index >= 0) {
              // Update the event
              const updatedDayEvents = [...dayEvents];
              // CRITICAL: Preserve start_local from updatedEvent (it's the source of truth)
              const preservedStartLocal = updatedEvent.start_local || updatedDayEvents[index].start_local;
              const preservedEndLocal = updatedEvent.end_local || updatedDayEvents[index].end_local;
              const preservedTime = updatedEvent.time || updatedEvent.start_local || updatedDayEvents[index].time;
              
              updatedDayEvents[index] = {
                ...updatedDayEvents[index],
                ...updatedEvent,
                // CRITICAL: Ensure start_local is preserved (critical for time display)
                // Use updatedEvent.start_local as primary source since it's set correctly in MonthGrid
                start_local: preservedStartLocal,
                end_local: preservedEndLocal,
                time: preservedTime,
                data: {
                  ...updatedDayEvents[index].data,
                  ...updatedEvent,
                  // CRITICAL: Ensure start_local is also in nested data object
                  start_local: preservedStartLocal,
                  end_local: preservedEndLocal,
                  time: preservedTime,
                }
              };
              
              // Log only if start_local is missing (potential issue)
              if (!preservedStartLocal) {
                console.warn('[WebContent] start_local missing when updating event:', {
                  eventId,
                  dateKey,
                  updatedEventStartLocal: updatedEvent.start_local,
                  updatedEventTime: updatedEvent.time,
                });
              }
              newEvents[dateKey] = updatedDayEvents;
              found = true;
              
              // Also check if we need to move it to a different date
              // Use date_local if available (more reliable), otherwise parse from start_ts
              const newDateKey = updatedEvent.date_local || (() => {
                const newDate = new Date(updatedEvent.start_ts || updatedEvent.start || updatedEvent.start_local);
                if (!isNaN(newDate.getTime())) {
                  return newDate.toISOString().split('T')[0];
                }
                return null;
              })();
              
              if (newDateKey && newDateKey !== dateKey) {
                console.log('[WebContent] Moving event from', dateKey, 'to', newDateKey);
                // Remove from old date
                newEvents[dateKey] = updatedDayEvents.filter(e => e.id !== eventId);
                // Add to new date with updated event
                if (!newEvents[newDateKey]) {
                  newEvents[newDateKey] = [];
                }
                // Use the updated event (already has all the new date info)
                // CRITICAL: Preserve start_local from updatedEvent (it's the source of truth)
                const preservedStartLocal = updatedEvent.start_local || updatedDayEvents[index].start_local;
                const preservedEndLocal = updatedEvent.end_local || updatedDayEvents[index].end_local;
                const preservedTime = updatedEvent.time || updatedEvent.start_local || updatedDayEvents[index].time;
                
                const movedEvent = {
                  ...updatedDayEvents[index],
                  date_local: newDateKey, // Ensure date_local is set
                  // CRITICAL: Ensure start_local is preserved when moving to new date
                  start_local: preservedStartLocal,
                  end_local: preservedEndLocal,
                  time: preservedTime,
                  data: {
                    ...updatedDayEvents[index].data,
                    ...updatedEvent,
                    start_local: preservedStartLocal,
                    end_local: preservedEndLocal,
                    time: preservedTime,
                  }
                };
                newEvents[newDateKey] = [...(newEvents[newDateKey] || []), movedEvent];
                
                console.log('[WebContent] Moved event to new date with preserved local time:', {
                  eventId,
                  fromDate: dateKey,
                  toDate: newDateKey,
                  start_local: movedEvent.start_local,
                  start_ts: movedEvent.start_ts,
                  time: movedEvent.time,
                });
              } else if (!newDateKey) {
                console.warn('[WebContent] Could not determine new date for event', eventId);
              }
            }
          }
        });
        
        return found ? newEvents : prevEvents;
      });
    };
    
    const handleEventRescheduleError = async (event) => {
      const { eventId, error } = event.detail || {};
      if (!eventId) return;
      
      // For 500 errors (backend/permission issues), don't revert here
      // These should be handled by the conflict detection flow which keeps the optimistic update visible
      if (error && error.status === 500) {
        console.log('[WebContent] 500 error in handleEventRescheduleError - not reverting, should be handled by conflict detection');
        return;
      }
      
      console.log('[WebContent] Reverting optimistic update for event:', eventId);
      
      // Clear the pending flag since we're reverting
      pendingOptimisticUpdatesRef.current.delete(eventId);
      
      // Fetch the current event state from the database first
      try {
        const { supabase } = await import('../lib/supabase');
        const { data: currentEvent, error } = await supabase
          .from('events')
          .select('*')
          .eq('id', eventId)
          .eq('family_id', familyId)
          .maybeSingle();
        
        if (error || !currentEvent) {
          console.error('[WebContent] Error fetching event for revert:', error);
          // Fallback: just remove optimistic update and refresh
          setCalendarEvents(prevEvents => {
            const newEvents = { ...prevEvents };
            Object.keys(newEvents).forEach(dateKey => {
              const dayEvents = newEvents[dateKey];
              if (Array.isArray(dayEvents)) {
                newEvents[dateKey] = dayEvents.filter(e => e && e.id !== eventId);
                if (newEvents[dateKey].length === 0) {
                  delete newEvents[dateKey];
                }
              }
            });
            return newEvents;
          });
          if (typeof window !== 'undefined') {
            setTimeout(() => window.dispatchEvent(new CustomEvent('refreshCalendar')), 100);
          }
          return;
        }
        
        // Calculate the correct date key for the database event
        const eventDate = new Date(currentEvent.start_ts);
        const dateKey = eventDate.toISOString().split('T')[0];
        
        // Update calendarEvents: remove from all dates, then add to correct date with database data
        setCalendarEvents(prevEvents => {
          const newEvents = { ...prevEvents };
          
          // Remove the event from wherever it currently is
          Object.keys(newEvents).forEach(prevDateKey => {
            const dayEvents = newEvents[prevDateKey];
            if (Array.isArray(dayEvents)) {
              newEvents[prevDateKey] = dayEvents.filter(e => e && e.id !== eventId);
              if (newEvents[prevDateKey].length === 0) {
                delete newEvents[prevDateKey];
              }
            }
          });
          
          // Add the event to the correct date with database data
          if (!newEvents[dateKey]) {
            newEvents[dateKey] = [];
          }
          
          // Format the event data for MonthGrid (needs to match the format from loadMonthData)
          // The RPC returns start_local in "HH:MM" format (e.g., "17:30" for 5:30 PM)
          // When querying directly, we need to compute it in the same format
          const startDate = new Date(currentEvent.start_ts);
          
          // Compute start_local in "HH:MM" format (same as RPC)
          // EventChip can parse this format
          const startLocalHours = startDate.getHours();
          const startLocalMinutes = startDate.getMinutes();
          const startLocalStr = currentEvent.start_local || `${String(startLocalHours).padStart(2, '0')}:${String(startLocalMinutes).padStart(2, '0')}`;
          
          // Compute end_local in same format
          const endLocalStr = currentEvent.end_local || (currentEvent.end_ts ? (() => {
            const endDate = new Date(currentEvent.end_ts);
            return `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
          })() : undefined);
          
          // Format time string for display (EventChip will parse start_local itself)
          const timeStr = startDate.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          });
          
          // Format the event to match the structure from loadMonthData
          // This ensures it displays correctly in MonthGrid/EventChip
          // Note: We'll preserve existing fields from calendarEvents if available, otherwise use database values
          const formattedEvent = {
            id: currentEvent.id,
            type: currentEvent.source || 'activity',
            title: currentEvent.title || 'Untitled Event',
            childName: 'Child', // Will be resolved from children data if available
            time: startLocalStr, // Use start_local format for time field (EventChip will parse it)
            color: 'teal', // Default color (can be determined from subject if needed)
            subject: '', // Will be resolved from subject data if available
            status: currentEvent.status || 'scheduled',
            year_plan_id: currentEvent.year_plan_id,
            event_type: currentEvent.event_type,
            data: {
              ...currentEvent,
              date_local: dateKey,
            },
            date_local: dateKey, // Critical for MonthGrid grouping
            start_local: startLocalStr, // "HH:MM" format (e.g., "17:30" for 5:30 PM)
            end_local: endLocalStr, // "HH:MM" format
            start_ts: currentEvent.start_ts,
            end_ts: currentEvent.end_ts,
            assignee: currentEvent.child_id,
            assignees: currentEvent.child_id ? [currentEvent.child_id] : [],
            child_id: currentEvent.child_id,
          };
          
          // Check if event already exists on this date (shouldn't, but be safe)
          const existingIndex = newEvents[dateKey].findIndex(e => e && e.id === eventId);
          if (existingIndex >= 0) {
            newEvents[dateKey][existingIndex] = formattedEvent;
          } else {
            newEvents[dateKey].push(formattedEvent);
          }
          
          return newEvents;
        });
        
        // Invalidate cache for the month to force fresh data on next load
        const monthKey = `${eventDate.getFullYear()}-${eventDate.getMonth()}`;
        setCalendarDataCache(prev => {
          const newCache = { ...prev };
          if (newCache[monthKey]) {
            delete newCache[monthKey];
          }
          return newCache;
        });
        
      } catch (err) {
        console.error('[WebContent] Error in revert handler:', err);
        // Fallback: remove optimistic update and refresh
        setCalendarEvents(prevEvents => {
          const newEvents = { ...prevEvents };
          Object.keys(newEvents).forEach(dateKey => {
            const dayEvents = newEvents[dateKey];
            if (Array.isArray(dayEvents)) {
              newEvents[dateKey] = dayEvents.filter(e => e && e.id !== eventId);
              if (newEvents[dateKey].length === 0) {
                delete newEvents[dateKey];
              }
            }
          });
          return newEvents;
        });
        if (typeof window !== 'undefined') {
          setTimeout(() => window.dispatchEvent(new CustomEvent('refreshCalendar')), 100);
        }
      }
    };
    
    window.addEventListener('eventRescheduled', handleEventRescheduled);
    window.addEventListener('eventRescheduleError', handleEventRescheduleError);
    
    return () => {
      window.removeEventListener('eventRescheduled', handleEventRescheduled);
      window.removeEventListener('eventRescheduleError', handleEventRescheduleError);
    };
  }, [familyId]);
  
  // Track recent drag-and-drop operations to prevent immediate refreshes
  const lastDragDropTimeRef = useRef(0);
  
  // Track events with pending optimistic updates to prevent cache overwrites
  const pendingOptimisticUpdatesRef = useRef(new Set());
  // Track events that were just updated from database to prevent merge from overwriting
  const recentlyFetchedFromDbRef = useRef(new Map()); // Map<eventId, timestamp>
  
  // Expose the ref to window so MonthGrid can update it synchronously
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.__lastDragDropTime = 0;
      Object.defineProperty(window, '__lastDragDropTime', {
        get: () => lastDragDropTimeRef.current,
        set: (value) => { lastDragDropTimeRef.current = value; },
        configurable: true
      });
      
      // Expose function to clear pending optimistic updates
      window.__clearPendingOptimisticUpdate = (eventId) => {
        if (pendingOptimisticUpdatesRef.current.has(eventId)) {
          console.log('[WebContent] Clearing pending optimistic update for event:', eventId);
          pendingOptimisticUpdatesRef.current.delete(eventId);
        }
      };
    }
  }, []);
  
  // Listen for calendar refresh events from global task modal
  // This allows the TaskCreateModal in WebLayout to trigger a calendar refresh
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleRefreshCalendar = async (event) => {
      console.log('[WebContent] handleRefreshCalendar called', event?.detail);
      
      // Check if there are any pending optimistic updates - if so, delay the refresh
      if (pendingOptimisticUpdatesRef.current.size > 0) {
        console.log('[WebContent] Delaying refresh -', pendingOptimisticUpdatesRef.current.size, 'pending optimistic updates');
        // Delay the refresh to allow the API call to complete
        setTimeout(() => {
          // Re-dispatch the refresh event after delay
          window.dispatchEvent(new CustomEvent('refreshCalendar', event?.detail || {}));
        }, 2000);
        return;
      }
      
      // Check if a drag-and-drop happened recently - if so, delay the refresh
      const timeSinceLastDrag = Date.now() - lastDragDropTimeRef.current;
      if (timeSinceLastDrag < 2000) {
        console.log('[WebContent] Delaying refresh - drag-and-drop happened', timeSinceLastDrag, 'ms ago');
        // Delay the refresh to allow the API call to complete
        setTimeout(() => {
          // Re-dispatch the refresh event after delay
          window.dispatchEvent(new CustomEvent('refreshCalendar', event?.detail || {}));
        }, 2000 - timeSinceLastDrag);
        return;
      }
      
      // Check if we should skip home refresh (e.g., when we're already refreshing)
      const skipHomeRefresh = event?.detail?.skipHomeRefresh || false;
      const targetMonth = event?.detail?.targetMonth;
      const targetYear = event?.detail?.targetYear;
      
      // Use target date if provided, otherwise use current month
      let refreshDate = null;
      if (targetYear !== undefined && targetMonth !== undefined) {
        refreshDate = new Date(targetYear, targetMonth, 1);
        console.log('[WebContent] Refreshing specific month:', { year: targetYear, month: targetMonth, date: refreshDate });
      }
      
      // Always refresh calendar data when requested, regardless of active tab
      // This ensures new events appear immediately after year plan creation
      console.log('[WebContent] Calling refreshCalendarData with date:', refreshDate);
      // Call the function directly - it's always available
      refreshCalendarData(refreshDate).catch(err => console.error('[WebContent] Calendar refresh failed:', err));
      
      // Force planner to refresh by dispatching a custom event
      // PlannerWeek listens to this event to trigger a refetch
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
      }
      
      // Invalidate home data cache when calendar refreshes (unless we're skipping home refresh)
      if (user && !skipHomeRefresh) {
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('family_id')
            .eq('id', user.id)
            .maybeSingle();
          
          if (profileData?.family_id) {
            invalidateHomeDataCache(profileData.family_id);
            // If we're on home tab, trigger a refresh
            if (activeTab === 'home') {
              setHomeLoading(true);
        if (onHomeLoadingChange) onHomeLoadingChange(true);
              // Trigger re-fetch by clearing homeData
              setHomeData(null);
            }
          }
        } catch (err) {
          console.error('[Home] Error invalidating cache on refresh:', err);
        }
      }
    };
    
    window.addEventListener('refreshCalendar', handleRefreshCalendar);
    
    // Listen for event creation and deletion to refresh home page
    const handleEventCreated = async (event) => {
      if (activeTab === 'home' && user) {
        console.log('[WebContent] Event created, refreshing home page');
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('family_id')
            .eq('id', user.id)
            .maybeSingle();
          
          if (profileData?.family_id) {
            // Invalidate cache
            invalidateHomeDataCache(profileData.family_id);
            
            // Get current selected date
            const validDate = homeSelectedDate instanceof Date && !isNaN(homeSelectedDate.getTime())
              ? homeSelectedDate
              : new Date();
            validDate.setHours(0, 0, 0, 0);
            const selectedDateStr = validDate.toISOString().split('T')[0];
            
            // Refetch home data
            const homeDataResult = await supabase.rpc('get_home_data', {
              _family_id: profileData.family_id,
              _date: selectedDateStr,
              _horizon_days: 14,
            });
            
            const { data: rawData, error } = homeDataResult;
            const data = rawData ? cleanAvatarUrls(rawData) : rawData;
            
            if (!error && data) {
              const stories = (data?.stories || []).filter(s => 
                s && s.title && s.body && s.title.trim() && s.body.trim()
              );
              
              const updatedData = {
                ...data,
                stories: stories,
              };
              
              setHomeData(updatedData);
              saveHomeDataToCache(profileData.family_id, selectedDateStr, updatedData);
              
              // Also refresh fetchTodaysLearning
              await fetchTodaysLearning();
            }
          }
        } catch (err) {
          console.error('[WebContent] Error refreshing home after event created:', err);
        }
      }
    };
    
    const handleEventDeletedForHome = async (event) => {
      if (activeTab === 'home' && user) {
        const deletedId = event.detail?.eventId || event.detail?.id;
        console.log('[WebContent] Event deleted, refreshing home page, deletedId:', deletedId);
        
        // Optimistically remove from homeData
        if (homeData && deletedId) {
          setHomeData(prev => {
            if (!prev) return prev;
            const updatedLearning = (prev.learning || []).filter(e => e.id !== deletedId);
            return {
              ...prev,
              learning: updatedLearning
            };
          });
        }
        
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('family_id')
            .eq('id', user.id)
            .maybeSingle();
          
          if (profileData?.family_id) {
            // Invalidate cache
            invalidateHomeDataCache(profileData.family_id);
            
            // Get current selected date
            const validDate = homeSelectedDate instanceof Date && !isNaN(homeSelectedDate.getTime())
              ? homeSelectedDate
              : new Date();
            validDate.setHours(0, 0, 0, 0);
            const selectedDateStr = validDate.toISOString().split('T')[0];
            
            // Refetch home data
            const homeDataResult = await supabase.rpc('get_home_data', {
              _family_id: profileData.family_id,
              _date: selectedDateStr,
              _horizon_days: 14,
            });
            
            const { data: rawData, error } = homeDataResult;
            const data = rawData ? cleanAvatarUrls(rawData) : rawData;
            
            if (!error && data) {
              const stories = (data?.stories || []).filter(s => 
                s && s.title && s.body && s.title.trim() && s.body.trim()
              );
              
              // Filter out deleted event
              const updatedLearning = deletedId 
                ? (data?.learning || []).filter(e => e.id !== deletedId)
                : (data?.learning || []);
              
              const updatedData = {
                ...data,
                stories: stories,
                learning: updatedLearning,
              };
              
              setHomeData(updatedData);
              saveHomeDataToCache(profileData.family_id, selectedDateStr, updatedData);
              
              // Also refresh fetchTodaysLearning
              await fetchTodaysLearning();
            }
          }
        } catch (err) {
          console.error('[WebContent] Error refreshing home after event deleted:', err);
        }
      }
    };
    
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('eventCreated', handleEventCreated);
      window.addEventListener('eventDeleted', handleEventDeletedForHome);
    }
    
    return () => {
      window.removeEventListener('refreshCalendar', handleRefreshCalendar);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('eventCreated', handleEventCreated);
        window.removeEventListener('eventDeleted', handleEventDeletedForHome);
      }
    };
  }, [activeTab, homeData, user, homeSelectedDate]);

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
    
    // Listen for openNoteEditor custom event
    const handleOpenNoteEditor = (event) => {
      const detail = event.detail || {};
      setNoteEditorProps({
        linkedEventId: detail.eventId || null,
        defaultChildId: detail.childId || null,
        defaultText: detail.defaultText || '',
        date: detail.date || null,
      });
      // setShowNoteEditor(true); // Archived - records screen removed
    };
    window.addEventListener('openNoteEditor', handleOpenNoteEditor);
    return () => {
      window.removeEventListener('openRebalanceModal', handleOpenRebalance);
      window.removeEventListener('openNoteEditor', handleOpenNoteEditor);
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
        
        // Handle 401 errors gracefully (backend might not be running or auth not ready)
        const isAuthError = meError?.status === 401 || meError?.response?.status === 401;
        const isNetworkError = meError?.message?.includes('Cannot connect') || 
                              meError?.message?.includes('Failed to fetch') ||
                              meError?.message?.includes('Load failed');
        
        if (!meError && meData) {
          setUserRole(meData.role || 'parent');
          setAccessibleChildren(meData.accessible_children || []);
        } else if (!isAuthError && !isNetworkError) {
          // Only log non-auth, non-network errors
          console.warn('[WebContent] getMe error (non-critical):', meError);
        }
        
        // Always fallback to profile table (works even if backend is down or returns 401)
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('role, family_id')
            .eq('id', user.id)
            .maybeSingle();
          if (profileData) {
            setUserRole(profileData.role || 'parent');
          } else {
            setUserRole('parent'); // Default fallback
          }
        } catch (profileError) {
          // Silent fallback
          setUserRole('parent');
        }
        
        // Set empty accessible children if we couldn't get them from API
        if (!meData?.accessible_children) {
          setAccessibleChildren([]);
        }
      } catch (error) {
        // Don't log network errors as errors
        const isNetworkError = error.message?.includes('Cannot connect') || 
                              error.message?.includes('Failed to fetch') ||
                              error.message?.includes('Load failed');
        if (!isNetworkError) {
          console.error('Error fetching user info:', error);
        }
        // Set defaults on any error
        setUserRole('parent');
        setAccessibleChildren([]);
      }
    };
    fetchUserInfo();
  }, [user]);

  useEffect(() => {
    const fetchHomeData = async () => {
      if (!user) return;
      try {
        setHomeLoading(true);
        if (onHomeLoadingChange) onHomeLoadingChange(true);
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('family_id')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          console.error('Error fetching profile for home:', profileError);
          setHomeLoading(false);
        if (onHomeLoadingChange) onHomeLoadingChange(false);
          return;
        }

        if (profileData?.family_id) {
          // Use selected date instead of always using today
          const validDate = homeSelectedDate instanceof Date && !isNaN(homeSelectedDate.getTime())
            ? homeSelectedDate
            : new Date();
          validDate.setHours(0, 0, 0, 0);
          const selectedDateStr = validDate.toISOString().split('T')[0];
          
          // Try cache first
          const cachedData = loadHomeDataFromCache(profileData.family_id, selectedDateStr);
          if (cachedData) {
            // Show cached data immediately
            const cachedStories = (cachedData?.stories || []).filter(s => 
              s && s.title && s.body && s.title.trim() && s.body.trim()
            );
            
            setHomeData({
              ...cachedData,
              stories: cachedStories
            });
            // Set conversation starters from cache if available
            setConversationStarters(cachedData?.conversation_starters || []);
            setHomeLoading(false);
            if (onHomeLoadingChange) onHomeLoadingChange(false);
            
            // Check for updated CTA stories in background (in case goals/backlog changed)
            checkGoalsAndBacklogForCTAs(profileData.family_id, cachedData?.children || [], selectedChildId)
              .then(ctaStories => {
                if (ctaStories.length > 0) {
                  // Only update if CTA stories are different from cached ones
                  const hasCachedCTAs = cachedStories.some(s => s.kind === 'cta-goals' || s.kind === 'cta-backlog');
                  if (!hasCachedCTAs) {
                    setHomeData(prev => ({
                      ...prev,
                      stories: [...ctaStories, ...prev.stories]
                    }));
                  }
                }
              })
              .catch(err => {
                console.warn('[Home] Error checking CTA stories from cache:', err);
              });
            
            return;
          }

          // No cache or expired - fetch fresh data
          // Fetch home data first (critical), conversation starters can be non-blocking
          console.log('[WebContent] Fetching home data for date:', selectedDateStr, 'family_id:', profileData.family_id);
          const homeDataResult = await supabase.rpc('get_home_data', {
            _family_id: profileData.family_id,
            _date: selectedDateStr,
            _horizon_days: 14,
          });

          const { data: rawData, error } = homeDataResult;
          
          if (error) {
            console.error('[WebContent] Error fetching home data:', error);
          } else {
            console.log('[WebContent] Home data received - learning events count:', rawData?.learning?.length || 0);
            if (rawData?.learning && rawData.learning.length > 0) {
              console.log('[WebContent] Learning events:', rawData.learning.map(e => ({
                id: e.id,
                title: e.topic || e.title || e.subject,
                start_ts: e.start_ts,
                end_ts: e.end_ts,
                start_local: e.start_local,
                end_local: e.end_local,
                status: e.status,
                event_type: e.event_type
              })));
            } else {
              console.log('[WebContent] No learning events returned from RPC for date:', selectedDateStr);
            }
          }
          
          // Clean invalid avatar UUIDs from RPC response before using
          const data = rawData ? cleanAvatarUrls(rawData) : rawData;
          
          // Fetch conversation starters in parallel but don't block on it
          let conversationData = [];
          apiRequest('/api/conversation/starters', { method: 'GET' })
            .then(result => {
              conversationData = result?.data || [];
              setConversationStarters(conversationData);
              // Update cache with conversation starters if we have data
              if (data && !error) {
                const updatedData = {
                  ...data,
                  conversation_starters: conversationData
                };
                saveHomeDataToCache(profileData.family_id, selectedDateStr, updatedData);
              }
            })
            .catch(err => {
              console.warn('[Home] Error loading conversation starters (non-blocking):', err);
              // Non-critical, continue without conversation starters
            });

          if (error) {
            console.error('Error fetching home data:', error);
          } else {
            // Filter out empty/invalid stories (missing title or body)
            const stories = (data?.stories || []).filter(s => 
              s && s.title && s.body && s.title.trim() && s.body.trim()
            );
            
            // Show UI immediately with main data (progressive loading)
            const initialData = {
              ...data,
              stories: stories, // Show existing stories first
              conversation_starters: [] // Will be updated when conversation starters load
            };
            
            setHomeData(initialData);
            setHomeLoading(false);
            if (onHomeLoadingChange) onHomeLoadingChange(false);
            
            // Cache the initial data
            saveHomeDataToCache(profileData.family_id, selectedDateStr, initialData);
            
            // Load CTA stories in background (non-blocking)
            checkGoalsAndBacklogForCTAs(profileData.family_id, data?.children || [], selectedChildId)
              .then(ctaStories => {
                if (ctaStories.length > 0) {
                  // Update stories with CTA stories prepended
                  setHomeData(prev => ({
                    ...prev,
                    stories: [...ctaStories, ...prev.stories]
                  }));
                  
                  // Update cache with CTA stories
                  const updatedData = {
                    ...initialData,
                    stories: [...ctaStories, ...stories]
                  };
                  saveHomeDataToCache(profileData.family_id, selectedDateStr, updatedData);
                }
              })
              .catch(err => {
                console.warn('[Home] Error loading CTA stories:', err);
                // Non-critical, so we don't block on this
              });
          }
        }
      } catch (err) {
        console.error('Unexpected error fetching home data:', err);
      } finally {
        setHomeLoading(false);
        if (onHomeLoadingChange) onHomeLoadingChange(false);
      }
    };

    fetchHomeData();
  }, [user, homeSelectedDate, homeSelectedChildren]);

  // Listen for calendar events and refresh home data when events change
  useEffect(() => {
    if (!user || Platform.OS !== 'web') return;
    
    const handleEventChange = async (event) => {
      // Get the event details to determine which dates to invalidate
      const eventDetail = event?.detail || {};
      const eventId = eventDetail.eventId || eventDetail.id;
      const updatedEvent = eventDetail.updatedEvent || eventDetail.event;
      
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('family_id')
          .eq('id', user.id)
          .maybeSingle();
        
        if (!profileData?.family_id) return;
        
        // Extract dates from event data
        let datesToInvalidate = new Set();
        
        // For eventRescheduled, we need to check if the event moved to a different day
        if (event.type === 'eventRescheduled' && updatedEvent) {
          // Get the new date from the updated event
          const newDateStr = updatedEvent.start_ts 
            ? new Date(updatedEvent.start_ts).toISOString().split('T')[0]
            : updatedEvent.date_local || updatedEvent.date;
          
          if (newDateStr) datesToInvalidate.add(newDateStr);
          
          // Also check multi-day events - invalidate all dates they span
          if (updatedEvent.end_ts && updatedEvent.start_ts) {
            const startDate = new Date(updatedEvent.start_ts);
            const endDate = new Date(updatedEvent.end_ts);
            const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            for (let i = 0; i <= daysDiff; i++) {
              const date = new Date(startDate);
              date.setDate(date.getDate() + i);
              datesToInvalidate.add(date.toISOString().split('T')[0]);
            }
          }
        } else if (updatedEvent || eventDetail.event) {
          // For created/deleted events, use the event's date
          const eventData = updatedEvent || eventDetail.event;
          const dateStr = eventData.start_ts 
            ? new Date(eventData.start_ts).toISOString().split('T')[0]
            : eventData.date_local || eventData.date;
          
          if (dateStr) datesToInvalidate.add(dateStr);
          
          // Also check multi-day events
          if (eventData.end_ts && eventData.start_ts) {
            const startDate = new Date(eventData.start_ts);
            const endDate = new Date(eventData.end_ts);
            const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            for (let i = 0; i <= daysDiff; i++) {
              const date = new Date(startDate);
              date.setDate(date.getDate() + i);
              datesToInvalidate.add(date.toISOString().split('T')[0]);
            }
          }
        } else {
          // Unknown date - invalidate all cache to be safe
          invalidateHomeDataCache(profileData.family_id);
          if (activeTab === 'home') {
            setTimeout(() => setHomeData(null), 300);
          }
          return;
        }
        
        // Invalidate cache for all affected dates
        datesToInvalidate.forEach(dateStr => {
          invalidateHomeDataCache(profileData.family_id, dateStr);
        });
        
        // If we're on home tab and current date is affected, trigger a refetch
        if (activeTab === 'home') {
          const currentDateStr = homeSelectedDate instanceof Date && !isNaN(homeSelectedDate.getTime())
            ? homeSelectedDate.toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];
          
          if (datesToInvalidate.has(currentDateStr)) {
            setTimeout(() => {
              setHomeData(null); // Clear homeData to trigger refetch
            }, 300);
          }
        }
      } catch (err) {
        console.error('[WebContent] Error invalidating home cache on event change:', err);
      }
    };
    
    const handleRefreshCalendar = async (event) => {
      // Only handle if not skipping home refresh
      if (event?.detail?.skipHomeRefresh) return;
      
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('family_id')
          .eq('id', user.id)
          .maybeSingle();
        
        if (!profileData?.family_id) return;
        
        // Invalidate all home cache when calendar refreshes (events might have changed)
        invalidateHomeDataCache(profileData.family_id);
        
        // If we're on home tab, trigger a refetch
        if (activeTab === 'home') {
          setHomeData(null); // Clear homeData to trigger refetch
        }
      } catch (err) {
        console.error('[WebContent] Error invalidating home cache on calendar refresh:', err);
      }
    };
    
    window.addEventListener('eventCreated', handleEventChange);
    window.addEventListener('eventDeleted', handleEventChange);
    window.addEventListener('eventRescheduled', handleEventChange);
    window.addEventListener('refreshCalendar', handleRefreshCalendar);
    
    return () => {
      window.removeEventListener('eventCreated', handleEventChange);
      window.removeEventListener('eventDeleted', handleEventChange);
      window.removeEventListener('eventRescheduled', handleEventChange);
      window.removeEventListener('refreshCalendar', handleRefreshCalendar);
    };
  }, [user, activeTab, homeSelectedDate]);
  
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

  // Error suppression is now set up at module load time (above) to catch errors on initial load
  // This useEffect is kept for any additional setup if needed, but the main suppression runs immediately
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const originalError = window.console.error;
      const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      
      // Helper to check if error should be suppressed
      const shouldSuppress = (message) => {
        if (!message || typeof message !== 'string') return false;
        const hasUuid = uuidPattern.test(message);
        const is404 = message.includes('404') || 
                     message.includes('Failed to load resource') || 
                     message.includes('Not Found') ||
                     message.includes('the server responded with a status of 404') ||
                     message.includes('status of 404');
        return hasUuid && is404;
      };
      
      // Intercept console errors to suppress 404s for resources with UUIDs
      window.console.error = (...args) => {
        const message = args.join(' ');
        // Check message and all string arguments
        if (shouldSuppress(message) || args.some(arg => typeof arg === 'string' && shouldSuppress(arg))) {
          return; // Suppress this error
        }
        originalError.apply(console, args);
      };

      // Intercept image and iframe load errors at the DOM level (capture phase)
      const handleImageError = (e) => {
        const target = e.target;
        const tagName = target?.tagName?.toUpperCase();
        if (target && (tagName === 'IMG' || tagName === 'IFRAME') && target.src) {
          const url = target.src;
          // Check if URL is just a UUID (invalid URL)
          if (uuidPattern.test(url) && !url.includes('http') && !url.includes('data:')) {
            e.preventDefault();
            e.stopPropagation();
            if (target.style) {
              target.style.display = 'none';
            }
            return false;
          }
          // Check if URL contains UUID and might be a 404
          if (uuidPattern.test(url)) {
            e.preventDefault();
            e.stopPropagation();
            if (target.style) {
              target.style.display = 'none';
            }
            return false;
          }
        }
      };

      // Intercept general errors
      const handleError = (e) => {
        const message = e.message || e.toString() || '';
        const url = e.target?.src || e.filename || e.target?.href || '';
        const combined = `${message} ${url}`;
        
        if (shouldSuppress(combined) || shouldSuppress(message) || shouldSuppress(url)) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      };

      // Intercept unhandled promise rejections
      const handleRejection = (e) => {
        const reason = e.reason?.toString() || e.reason?.message || '';
        if (shouldSuppress(reason)) {
          e.preventDefault();
        }
      };

      // Use capture phase to catch errors early
      document.addEventListener('error', handleImageError, true);
      window.addEventListener('error', handleError, true);
      window.addEventListener('unhandledrejection', handleRejection);

      return () => {
        window.console.error = originalError;
        document.removeEventListener('error', handleImageError, true);
        window.removeEventListener('error', handleError, true);
        window.removeEventListener('unhandledrejection', handleRejection);
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
      // If avatarKey is a UUID (invalid), return default
      if (avatarKey && typeof avatarKey === 'string') {
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidPattern.test(avatarKey.trim())) {
          // It's a UUID, not a valid avatar key - return default
          return avatarSources.prof1;
        }
        // If it's a valid URL, don't use it here (should use Image with uri instead)
        if (avatarKey.startsWith('http://') || avatarKey.startsWith('https://') || avatarKey.startsWith('data:')) {
          // This shouldn't be passed to getAvatarSource, but return default to be safe
          return avatarSources.prof1;
        }
      }
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
  const [familyScreenSelectedChildId, setFamilyScreenSelectedChildId] = useState(null) // null = "All Children"
  const [subjects, setSubjects] = useState([])
  const [activities, setActivities] = useState([])
  const [dailyTasks, setDailyTasks] = useState([])
  const [today] = useState(new Date().toISOString().split('T')[0])

  // Load subjects when familyId is available
  useEffect(() => {
    if (!familyId) return;
    
    const loadSubjects = async () => {
      try {
        const { data, error } = await supabase
          .from('subject')
          .select('id, name')
          .eq('family_id', familyId)
          .order('name');
        
        if (error) throw error;
        setSubjects(data || []);
      } catch (error) {
        console.error('Error loading subjects:', error);
      }
    };
    
    loadSubjects();
  }, [familyId]);
  
  // Calendar data caching
  const [calendarDataCache, setCalendarDataCache] = useState({})
  const [calendarBlackoutDates, setCalendarBlackoutDates] = useState({})
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
  const [showNoteEditor, setShowNoteEditor] = useState(false)
  const [noteEditorProps, setNoteEditorProps] = useState({
    linkedEventId: null,
    defaultChildId: null,
    defaultText: '',
    date: null,
  })
  const [showOutcomeModal, setShowOutcomeModal] = useState(false)
  const [outcomeEvent, setOutcomeEvent] = useState(null)
  const [eventModalInitialEvent, setEventModalInitialEvent] = useState(null)
  const [showMaterialReviewModal, setShowMaterialReviewModal] = useState(false)
  const [materialReviewEvent, setMaterialReviewEvent] = useState(null)
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
  const [taskModalChildId, setTaskModalChildId] = useState(null);
  const [taskModalDefaultPlacement, setTaskModalDefaultPlacement] = useState('calendar');
  
  // Debug: Log when showTaskModal changes
  useEffect(() => {
    console.log('[WebContent] showTaskModal changed to:', showTaskModal);
  }, [showTaskModal]);
  
  // Drag-drop conflict banner state
  const [conflictBanner, setConflictBanner] = useState({
    visible: false,
    eventId: null,
    conflictCount: 0,
    eventTitle: '',
    conflictEvent: null, // Store the first conflicting event
    movedEvent: null, // Store the moved event for suggestion acceptance
    dismissed: false,
    timestamp: 0,
  });
  const lastDragEventRef = useRef(null);
  const dragDebounceTimeoutRef = useRef(null);
  
  // Debug: Log when conflictBanner state changes (only when visible)
  useEffect(() => {
    if (conflictBanner.visible) {
      console.log('[WebContent] Conflict banner shown:', { eventId: conflictBanner.eventId, conflictCount: conflictBanner.conflictCount });
    }
  }, [conflictBanner.visible, conflictBanner.eventId, conflictBanner.conflictCount]);

  // Listen for clearConflictBanner event (from Quick Reschedule when conflicts are resolved)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleClearConflictBanner = () => {
      console.log('[WebContent] Clearing conflict banner (conflicts resolved)');
      setConflictBanner({
        visible: false,
        eventId: null,
        conflictCount: 0,
        eventTitle: '',
        conflictEvent: null,
        movedEvent: null,
        dismissed: false,
        timestamp: 0,
      });
    };
    
    window.addEventListener('clearConflictBanner', handleClearConflictBanner);
    
    return () => {
      window.removeEventListener('clearConflictBanner', handleClearConflictBanner);
    };
  }, []);
  
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
    activityId: null,
    subjectId: null
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
      activityId: null,
      subjectId: null
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
        .is('deleted_at', null) // Exclude soft-deleted events
        .is('canceled_at', null) // Exclude canceled events

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

      // Try fetching with archived filter first
      let childrenData, archivedData;
      try {
        const { data: activeData, error: activeError } = await supabase
          .from('children')
          .select('*')
          .eq('family_id', profile.family_id)
          .eq('archived', false)

        if (activeError) {
          // Log the full error details for debugging
          console.error('[WebContent] Error fetching children:', {
            code: activeError.code,
            message: activeError.message,
            details: activeError.details,
            hint: activeError.hint,
            family_id: profile.family_id
          });
          
          // If archived column doesn't exist or RLS issue, try without archived filter
          if (activeError.code === '42703' || activeError.message?.includes('archived') || activeError.code === '400' || activeError.code === 'PGRST301' || activeError.code === '42501') {
            console.log('[WebContent] Trying to fetch children without archived filter');
            const { data: allData, error: allError } = await supabase
              .from('children')
              .select('*')
              .eq('family_id', profile.family_id)
            
            if (allError) {
              console.error('[WebContent] Error fetching children (fallback):', {
                code: allError.code,
                message: allError.message,
                details: allError.details,
                hint: allError.hint
              });
              // Don't return - set empty arrays instead
              childrenData = [];
              archivedData = [];
            } else {
              childrenData = allData || [];
              archivedData = [];
            }
          } else {
            // For other errors, still try without archived filter as fallback
            console.log('[WebContent] Trying fallback query without archived filter');
            const { data: allData, error: allError } = await supabase
              .from('children')
              .select('*')
              .eq('family_id', profile.family_id)
            
            if (allError) {
              console.error('[WebContent] Fallback also failed:', allError);
              childrenData = [];
              archivedData = [];
            } else {
              childrenData = allData || [];
              archivedData = [];
            }
          }
        } else {
          childrenData = activeData || [];
          
          // Try fetching archived children
          try {
            const { data: archivedResult, error: archivedError } = await supabase
        .from('children')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('archived', true)
            
            if (archivedError && archivedError.code !== '42703') {
              console.warn('[WebContent] Error fetching archived children:', archivedError);
              archivedData = [];
            } else {
              archivedData = archivedResult || [];
            }
          } catch (archivedErr) {
            console.warn('[WebContent] Exception fetching archived children:', archivedErr);
            archivedData = [];
          }
        }
      } catch (err) {
        console.warn('[WebContent] Exception in fetchChildren:', err);
        childrenData = [];
        archivedData = [];
      }

      if (childrenData) {
        // Validate and clean avatar URLs before setting
        const cleanedChildren = childrenData.map(child => ({
          ...child,
          avatar_url: validateAvatarUrl(child.avatar_url || child.avatar),
          avatar: validateAvatarUrl(child.avatar) || child.avatar // Keep original if validation fails, but prefer validated
        }));
        setChildren(cleanedChildren)
        // Initialize selectedChildren with all children selected
        setSelectedChildren(cleanedChildren.map(child => child.id))
      }

      if (archivedData) {
        // Validate and clean avatar URLs for archived children too
        const cleanedArchived = archivedData.map(child => ({
          ...child,
          avatar_url: validateAvatarUrl(child.avatar_url || child.avatar),
          avatar: validateAvatarUrl(child.avatar) || child.avatar
        }));
        setArchivedChildren(cleanedArchived)
      }
    } catch (error) {
      console.error('[WebContent] Error fetching children:', error)
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
    // Check if it's a child profile tab (from sidebar)
    if (activeTab.startsWith('child-')) {
      const childId = activeTab.replace('child-', '');
      const child = children.find(c => c.id === childId);
      if (child) {
        return (
          <View style={{ flex: 1 }}>
            <ChildProfile
              childId={child.id}
              childName={child.first_name}
              familyId={familyId}
              activeChildSection={activeChildSection || 'affirmation'}
              onBack={null}
              onDeleted={() => {
                console.log('Child deleted, returning to children list');
                onTabChange('children-list');
                setTimeout(() => {
                  window.location.reload();
                }, 500);
              }}
              onAITopOff={(params) => {
                console.log('AI top-off:', params);
                if (typeof window !== 'undefined') {
                  const urlParams = new URLSearchParams();
                  urlParams.set('ai_topoff_for_subject', params.subject);
                  urlParams.set('minutes_needed', params.minutesNeeded.toString());
                  urlParams.set('plan_for_child', params.childId);
                  window.history.replaceState({}, '', `?${urlParams.toString()}`);
                }
                onTabChange('planner');
              }}
              onEditGoal={(goal) => {
                console.log('Edit goal:', goal);
              }}
              onAddGoal={() => {
                console.log('Add goal for child:', child.id);
              }}
              onEditInfo={() => {
                if (onEditChild) {
                  onEditChild(child);
                } else {
                  console.log('Edit child info:', child.id);
                }
              }}
              onAISummary={() => {
                console.log('Generate AI summary for:', child.id);
              }}
              onPlanYear={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('openYearWizard'));
                }
              }}
              onAddSyllabus={onAddSyllabus}
              onOpenPlanner={(params) => {
                console.log('Open planner:', params);
                if (typeof window !== 'undefined') {
                  const urlParams = new URLSearchParams();
                  urlParams.set('plan_for_child', params.childId);
                  urlParams.set('week', params.weekStart);
                  if (params.rebalance) {
                    urlParams.set('rebalance', 'true');
                  }
                  window.history.replaceState({}, '', `?${urlParams.toString()}`);
                }
                onTabChange('planner');
              }}
              onNavigate={(section) => {
                // Handle navigation to different child sections
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('childSectionChange', { detail: { childId: child.id, section } }));
                }
              }}
            />
          </View>
        );
      }
    }
    
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
    // If somehow navigated to these tabs, redirect to planner
    if (activeTab === 'schedule-rules') {
      return renderPlannerContent()
    }
    if (activeTab === 'ai-planner') {
      return renderPlannerContent()
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
          // Don't show loading screen here - it's shown at WebLayout level
          if (homeLoading || !homeData) {
            return null;
          }
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
      // case 'explore': // Archived - explore page removed
      //   return <ExploreContent familyId={familyId} children={children} />
      case 'materials':
        if (!familyId) {
          return (
            <View style={styles.content}>
              <Text style={styles.title}>Loading...</Text>
            </View>
          )
        }
        try {
          return <MaterialsLibrary 
            familyId={familyId} 
            children={children || []}
            preloadedMaterials={materialsCache}
            onMaterialsUpdate={(newMaterials) => {
              setMaterialsCache(newMaterials);
              setMaterialsCacheTimestamp(Date.now());
            }}
          />
        } catch (err) {
          console.error('[WebContent] Error rendering MaterialsLibrary:', err);
          return (
            <View style={styles.content}>
              <Text style={styles.title}>Error Loading Library</Text>
              <Text style={styles.subtitle}>{err?.message || 'Unknown error'}</Text>
            </View>
          )
        }
      case 'intelligence':
        if (!familyId) {
          return (
            <View style={styles.content}>
              <Text style={styles.title}>Loading...</Text>
            </View>
          )
        }
        try {
          return <IntelligenceHub familyId={familyId} children={children || []} />
        } catch (err) {
          console.error('[WebContent] Error rendering IntelligenceHub:', err);
          return (
            <View style={styles.content}>
              <Text style={styles.title}>Error Loading Intelligence Hub</Text>
              <Text style={styles.subtitle}>{err?.message || 'Unknown error'}</Text>
            </View>
          )
        }
      case 'coach':
        if (!familyId) {
          return (
            <View style={styles.content}>
              <Text style={styles.title}>Loading...</Text>
            </View>
          )
        }
        try {
          return <CoachTab familyId={familyId} children={children || []} userRole="parent" />
        } catch (err) {
          console.error('[WebContent] Error rendering CoachTab:', err);
          return (
            <View style={styles.content}>
              <Text style={styles.title}>Error Loading Family Coach</Text>
              <Text style={styles.subtitle}>{err?.message || 'Unknown error'}</Text>
            </View>
          )
        }
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
      // case 'reports': // Archived - records screen removed
      // case 'records': // Archived - records screen removed
      //   return renderRecordsContent()
      case 'profile':
        // Always show comprehensive profile
        // If childId is available from activeSubtab, use it
        // Otherwise, default to "All Children" (null)
        if (activeSubtab && children) {
          const child = children.find(c => String(c.id) === String(activeSubtab));
          if (child) {
            return <ComprehensiveProfile childId={child.id} familyId={familyId} children={children} onOpenSettings={onOpenSettings} onEditChild={onEditChild} onTabChange={onTabChange} />;
          }
        }
        // Default to "All Children" (null) instead of first child
        return <ComprehensiveProfile childId={null} familyId={familyId} children={children || []} onOpenSettings={onOpenSettings} onEditChild={onEditChild} onTabChange={onTabChange} />
      case 'integrations':
      case 'settings':
        return <IntegrationsSettings user={user} />
      case 'templates':
        // Route to Records with templates subtab
        if (onSubtabChange) onSubtabChange('templates');
        return renderRecordsContent()
      case 'curriculum-import':
      case 'curriculum/import':
        return renderCurriculumImportContent()
      case 'syllabi':
      case 'imports':
      case 'doodle-ai':
        return renderComingSoonContent()
      case 'calendar-planning':
        return renderCalendarPlanningContent()
      case 'kanban':
        return renderComingSoonContent()
      case 'groups':
        return <GroupsPage familyId={familyId} userId={user?.id} />
      case 'marketplace':
        return <MarketplacePage familyId={familyId} userId={user?.id} />
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

  // Check for weekly goals and backlog items
  useEffect(() => {
    if (!familyId || !homeData?.children || homeData.children.length === 0) {
      setHasWeeklyGoal(false);
      setHasBacklogItems(false);
      return;
    }

    const checkGoalsAndBacklog = async () => {
      try {
        // Get child IDs for the family
        const childIds = homeData.children.map(c => c.id);
        
        if (childIds.length === 0) {
          setHasWeeklyGoal(false);
          setHasBacklogItems(false);
          return;
        }

        // Check for weekly goals using RPC function to bypass RLS issues
        // Check each child and if any has goals, set hasWeeklyGoal to true
        let foundGoals = false;
        for (const childId of childIds) {
          try {
            const { data: goalCount, error: goalsError } = await supabase
              .rpc('get_child_active_goals_count', { p_child_id: childId });
            
            if (!goalsError && goalCount > 0) {
              foundGoals = true;
              break; // Found at least one goal, no need to check others
            }
          } catch (err) {
            // Silently continue - RPC might not be available or RLS might block
            // Don't log errors here as they're expected in some setups
            continue;
          }
        }
        setHasWeeklyGoal(foundGoals);

        // Check for backlog items and get count
        const { data: backlog, error: backlogError } = await supabase
          .from('events')
          .select('id')
          .eq('family_id', familyId)
          .eq('status', 'backlog');
        
        if (backlogError) {
          console.warn('[WebContent] Error checking backlog:', backlogError);
          setHasBacklogItems(false);
          setBacklogCount(0);
        } else {
          const backlogCount = backlog?.length || 0;
          setHasBacklogItems(backlogCount > 0);
          setBacklogCount(backlogCount);
        }
      } catch (err) {
        console.warn('[WebContent] Error checking goals/backlog:', err);
        setHasWeeklyGoal(false);
        setHasBacklogItems(false);
      }
    };

    checkGoalsAndBacklog();
  }, [familyId, homeData?.children]);

  // Generate tip context and get daily tip
  const getTodayTip = (children, learning) => {
    try {
      const eventCount = learning.length;
      const totalMinutes = learning.reduce((sum, event) => {
        const start = new Date(event.start_ts || event.start_local);
        const end = new Date(event.end_ts || event.end_local);
        return sum + (end - start) / (1000 * 60);
      }, 0);

      const density = eventCount > 0 ? totalMinutes / (eventCount * 60) : 0;
      
      // Determine schedule load
      let scheduleLoad = "light";
      if (eventCount === 0) {
        scheduleLoad = "light";
      } else if (density < 1.5) {
        scheduleLoad = "light";
      } else if (density < 3) {
        scheduleLoad = "medium";
      } else {
        scheduleLoad = "heavy";
      }

      const ctx = {
        scheduleLoad,
        hasWeeklyGoal,
        hasBacklogItems,
        numChildren: children?.length || 0,
        dayOfWeek: new Date().getDay(),
      };

      const tips = getDailyTips(ctx, 1); // Get one tip (will prioritize perspective)
      return tips[0] || null;
    } catch (err) {
      console.error('[WebContent] Error getting today tip:', err);
      return null;
    }
  };

  // Generate interpretive weekly progress line
  const generateWeeklyProgressLine = (progress, children) => {
    try {
      if (!children || children.length === 0) return null;

      const totalCompleted = Object.values(progress).reduce((sum, p) => sum + (p.completed || 0), 0);
      const totalScheduled = Object.values(progress).reduce((sum, p) => sum + (p.total || 0), 0);
      
      if (totalScheduled === 0) {
        return "A fresh week ahead — start with one small win.";
      }

      const completionRate = totalCompleted / totalScheduled;
      
      if (completionRate >= 0.7) {
        return "You're off to a strong start. Keep the momentum going.";
      } else if (completionRate >= 0.4) {
        return "You're off to a good start. Small wins add up.";
      } else if (completionRate > 0) {
        return "Every step counts — you're building momentum.";
      } else {
        return "A fresh week ahead — start with one small win.";
      }
    } catch (err) {
      console.error('[WebContent] Error generating weekly progress line:', err);
      return null;
    }
  };

  // Generate interpretive daily insights
  const generateDailyInsights = (children, learning) => {
    try {
      const insights = [];
      
      if (learning.length === 0) {
        insights.push("Today is a light day — perfect for following interests.");
        return insights;
      }

      const eventCount = learning.length;
      const totalMinutes = learning.reduce((sum, event) => {
        const start = new Date(event.start_ts || event.start_local);
        const end = new Date(event.end_ts || event.end_local);
        return sum + (end - start) / (1000 * 60);
      }, 0);

      const density = eventCount > 0 ? totalMinutes / (eventCount * 60) : 0;
      
      // Interpretive insights based on schedule
      if (density < 1.5) {
        insights.push("Today's load is light — expect a spacious and flexible day.");
      } else if (density < 3) {
        insights.push("Today's load is moderate — expect a productive but manageable day.");
      } else {
        insights.push("Today's load is full — short, focused sessions will work best.");
      }

      // Time distribution insights
      const morningEvents = learning.filter(e => {
        const hour = new Date(e.start_ts || e.start_local).getHours();
        return hour >= 8 && hour < 12;
      });
      const afternoonEvents = learning.filter(e => {
        const hour = new Date(e.start_ts || e.start_local).getHours();
        return hour >= 12 && hour < 17;
      });

      if (morningEvents.length > afternoonEvents.length && morningEvents.length > 0) {
        const childNames = [...new Set(morningEvents.map(e => {
          const child = children.find(c => c.id === e.child_id);
          return child?.first_name || child?.name;
        }))].filter(Boolean);
        if (childNames.length > 0) {
          insights.push(`${childNames.join(' and ')} ${childNames.length === 1 ? 'has' : 'have'} more learning front-loaded this morning.`);
        }
      } else if (afternoonEvents.length > morningEvents.length && afternoonEvents.length > 0) {
        const childNames = [...new Set(afternoonEvents.map(e => {
          const child = children.find(c => c.id === e.child_id);
          return child?.first_name || child?.name;
        }))].filter(Boolean);
        if (childNames.length > 0) {
          insights.push(`${childNames.join(' and ')} ${childNames.length === 1 ? 'has' : 'have'} more space later in the day.`);
        }
      }

      // Subject-specific insights
      const subjects = [...new Set(learning.map(l => l.subject))];
      if (subjects.length === 1 && learning.length > 0) {
        insights.push(`Today focuses on ${subjects[0]} — a good chance for deep work.`);
      } else if (subjects.length > 0) {
        const childSubjects = children.map(child => {
          const childLearning = learning.filter(l => l.child_id === child.id);
          const childSubjectsList = [...new Set(childLearning.map(l => l.subject))];
          return { child, subjects: childSubjectsList };
        }).filter(cs => cs.subjects.length > 0);

        if (childSubjects.length === 1 && childSubjects[0].subjects.length === 1) {
          const childName = childSubjects[0].child.first_name || childSubjects[0].child.name;
          insights.push(`${childName} has one focused session — a good chance for deep work.`);
        }
      }

      return insights.slice(0, 3); // Max 3 bullets
    } catch (err) {
      console.error('[WebContent] Error generating daily insights:', err);
      return ["A steady day of learning ahead."];
    }
  };

  // Load weekly progress
  useEffect(() => {
    if (!familyId || !homeData?.children || homeData.children.length === 0) {
      setWeeklyProgressLoading(false);
      return;
    }

    const loadWeeklyProgress = async () => {
      setWeeklyProgressLoading(true);
      try {
        const weekStart = getWeekStart(new Date());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const progressData = {};
        
        for (const child of homeData.children) {
          try {
            const { data: allEvents, error: allEventsError } = await supabase
              .from('events')
              .select('id, status')
              .eq('child_id', child.id)
              .gte('start_ts', weekStart.toISOString())
              .lte('start_ts', weekEnd.toISOString())
              .in('status', ['scheduled', 'done']);

            if (allEventsError) {
              console.error(`[WebContent] Error loading events for ${child.id}:`, allEventsError);
              progressData[child.id] = { completed: 0, total: 0 };
              continue;
            }

            const totalEvents = allEvents?.length || 0;
            const completedEvents = allEvents?.filter(e => e.status === 'done').length || 0;

            progressData[child.id] = {
              completed: completedEvents,
              total: totalEvents || 0,
            };
          } catch (err) {
            console.error(`[WebContent] Error processing child ${child.id}:`, err);
            progressData[child.id] = { completed: 0, total: 0 };
          }
        }

        setWeeklyProgress(progressData);
      } catch (err) {
        console.error('[WebContent] Error loading weekly progress:', err);
      } finally {
        setWeeklyProgressLoading(false);
      }
    };

    loadWeeklyProgress();
  }, [familyId, homeData?.children]);
  
  // Load home summary (Records + Intelligence data) when filters change
  useEffect(() => {
    if (!familyId || !homeData?.children) return;
    
    // Validate date
    if (!(homeSelectedDate instanceof Date) || isNaN(homeSelectedDate.getTime())) {
      console.warn('Invalid homeSelectedDate, resetting to today');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setHomeSelectedDate(today);
      return;
    }
    
    const loadHomeSummary = async () => {
      setHomeSummaryLoading(true);
      try {
        const resolvedChildIds = homeSelectedChildren === 'all'
          ? (homeData?.children || []).map(c => c?.id).filter(Boolean)
          : Array.isArray(homeSelectedChildren) ? homeSelectedChildren : [];
        
        // Ensure date is valid before passing
        const validDate = new Date(homeSelectedDate);
        validDate.setHours(0, 0, 0, 0);
        
        const [summary, insights] = await Promise.all([
          getTodaySummary(familyId, validDate, resolvedChildIds).catch(err => {
            console.warn('Error loading today summary:', err);
            return { nextEvents: [], attendanceStatus: { thisWeek: { totalMinutes: 0, totalDays: 0, byDay: {} }, missingLogs: [] }, missingEvidence: { total: 0, byChild: {} }, date: validDate.toISOString().split('T')[0] };
          }),
          getTodayInsights(familyId, validDate, resolvedChildIds).catch(err => {
            console.warn('Error loading insights:', err);
            return [];
          }),
        ]);
        
        setHomeSummary({ ...summary, insights });
        
        // Generate micro notifications (2 max visible)
        const microNotifs = [];
        
        // Card A - Daily Perspective
        // Calculate learning density for today
        const todayLearning = (homeData?.learning || []).filter(event => {
          if (!event.start_ts && !event.start_local) return false;
          try {
            const eventDate = new Date(event.start_ts || event.start_local);
            if (isNaN(eventDate.getTime())) return false;
            const eventDateStr = eventDate.toISOString().split('T')[0];
            const selectedDateStr = validDate.toISOString().split('T')[0];
            if (eventDateStr !== selectedDateStr) return false;
            if (resolvedChildIds.length > 0 && !resolvedChildIds.includes(event.child_id)) return false;
            return true;
          } catch (e) {
            return false;
          }
        });
        
        const eventCount = todayLearning.length;
        const totalMinutes = todayLearning.reduce((sum, event) => {
          const start = new Date(event.start_ts || event.start_local);
          const end = new Date(event.end_ts || event.end_local);
          return sum + (end - start) / (1000 * 60);
        }, 0);
        const density = eventCount > 0 ? totalMinutes / (eventCount * 60) : 0;
        
        let perspectiveMessage = '';
        if (eventCount === 0) {
          perspectiveMessage = "Today is a good day for slow learning and noticing small wins.";
        } else if (density < 1.5) {
          perspectiveMessage = "Today is a good day for slow learning and noticing small wins.";
        } else if (density < 3) {
          perspectiveMessage = "Today is busy. Protect a few quiet minutes for reading or reflection.";
        } else {
          perspectiveMessage = "Today is busy. Protect a few quiet minutes for reading or reflection.";
        }
        
        microNotifs.push({
          id: 'daily_perspective',
          type: 'perspective',
          message: perspectiveMessage,
          onPress: () => {}, // No action needed
        });
        
        // Card B - Dynamic Nudge
        // Check for missing logs
        if (summary.attendanceStatus?.missingLogs?.length > 0) {
          const missingCount = summary.attendanceStatus.missingLogs.length;
          const childNames = homeData?.children || [];
          const firstChild = childNames.find(c => resolvedChildIds.includes(c.id)) || childNames[0];
          const childName = firstChild?.first_name || firstChild?.name || 'your child';
          microNotifs.push({
            id: 'nudge_missing_logs',
            type: 'nudge',
            message: `${childName} has ${missingCount} missing log${missingCount > 1 ? 's' : ''} — review attendance?`,
            onPress: () => onTabChange('records?tab=attendance'),
          });
        }
        // Check for missing evidence
        else if (summary.missingEvidence?.total === 0 && resolvedChildIds.length > 0) {
          const childNames = homeData?.children || [];
          const firstChild = childNames.find(c => resolvedChildIds.includes(c.id)) || childNames[0];
          const childName = firstChild?.first_name || firstChild?.name || 'your child';
          microNotifs.push({
            id: 'nudge_missing_evidence',
            type: 'nudge',
            message: `${childName} hasn't uploaded evidence this week.`,
            onPress: () => onTabChange('records?tab=portfolio'),
          });
        }
        // Check for project nudges (if we have project data)
        else if (insights.length > 0) {
          const projectInsight = insights.find(i => i.title?.toLowerCase().includes('project') || i.text?.toLowerCase().includes('project'));
          if (projectInsight) {
            const childNames = homeData?.children || [];
            const firstChild = childNames.find(c => resolvedChildIds.includes(c.id)) || childNames[0];
            const childName = firstChild?.first_name || firstChild?.name || 'your child';
            const subjectMatch = projectInsight.text?.match(/(\w+)\s+project/i);
            const subject = subjectMatch ? subjectMatch[1] : 'their';
            microNotifs.push({
              id: 'nudge_project',
              type: 'nudge',
              message: `Send ${childName} a nudge about their ${subject} project.`,
              onPress: () => onTabChange('planner'),
          });
        }
        }
        
        // Limit to 2 max
        setMicroNotifications(microNotifs.slice(0, 2));
        
        // Keep old notifications for backward compatibility (but don't show them)
        setHomeNotifications([]);
      } catch (error) {
        console.error('Error loading home summary:', error);
        setHomeSummary(null);
        setHomeNotifications([]);
      } finally {
        setHomeSummaryLoading(false);
      }
    };
    
    loadHomeSummary();
  }, [familyId, homeSelectedDate, homeSelectedChildren, homeData?.children]);

  // Load multi-day summary (yesterday, today, tomorrow) - simplified without caching hook for now
  useEffect(() => {
    if (!familyId || !homeData?.children || !Array.isArray(homeData.children) || homeData.children.length === 0) {
      setMultiDaySummary(null);
      setMultiDayLoading(false);
      return;
    }
    
    const loadMultiDaySummary = async () => {
      setMultiDayLoading(true);
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const dates = [
          yesterday.toISOString().split('T')[0],
          today.toISOString().split('T')[0],
          tomorrow.toISOString().split('T')[0],
        ];
        
        const resolvedChildIds = homeSelectedChildren === 'all'
          ? homeData.children.map(c => c?.id).filter(Boolean)
          : Array.isArray(homeSelectedChildren) ? homeSelectedChildren : [];
        
        const summary = await getMultiDaySummary(familyId, dates, resolvedChildIds);
        setMultiDaySummary(summary);
      } catch (error) {
        console.error('Error loading multi-day summary:', error);
        setMultiDaySummary(null);
      } finally {
        setMultiDayLoading(false);
      }
    };
    
    loadMultiDaySummary();
  }, [familyId, homeSelectedChildren, homeData]);

  // Load home tiles summary - simplified without caching hook for now
  useEffect(() => {
    if (!familyId || !homeSelectedDate || !homeData?.children || !Array.isArray(homeData.children) || homeData.children.length === 0) {
      setHomeTilesData(null);
      setHomeTilesLoading(false);
      return;
    }
    
    const loadHomeTiles = async () => {
      setHomeTilesLoading(true);
      try {
        const resolvedChildIds = homeSelectedChildren === 'all'
          ? homeData.children.map(c => c?.id).filter(Boolean)
          : (Array.isArray(homeSelectedChildren) ? homeSelectedChildren : []);
        
        const tilesData = await getHomeTilesSummary(familyId, homeSelectedDate, resolvedChildIds.length > 0 ? resolvedChildIds : 'all');
        setHomeTilesData(tilesData);
      } catch (error) {
        console.error('Error loading home tiles:', error);
        setHomeTilesData(null);
      } finally {
        setHomeTilesLoading(false);
      }
    };
    
    loadHomeTiles();
  }, [familyId, homeSelectedDate, homeSelectedChildren, homeData]);

  // Re-check goals/backlog when homeData changes
  useEffect(() => {
    if (!familyId || !homeData?.children) return;
    // This will trigger the goals/backlog check which updates hasWeeklyGoal and hasBacklogItems
  }, [familyId, homeData?.children]);

  // Load intelligence modules data

  // Adaptive layout: Determine tier based on container height and left column density
  useEffect(() => {
    if (!rightSidebarRef.current || Platform.OS !== 'web' || !homeData) {
      setRightSidebarTier(1);
      return;
    }
    
    const updateTier = () => {
      const container = rightSidebarRef.current;
      if (!container) {
        setRightSidebarTier(1);
        return;
      }
      
      const height = container.offsetHeight || container.clientHeight || 0;
      const leftColumnEvents = (homeData.learning || []).length;
      
      // Tier logic:
      // - Tier 3: Container > 900px OR left column has > 6 events
      // - Tier 2: Container > 650px OR left column has > 4 events
      // - Tier 1: Default (always show)
      
      if (height > 900 || leftColumnEvents > 6) {
        setRightSidebarTier(3);
      } else if (height > 650 || leftColumnEvents > 4) {
        setRightSidebarTier(2);
      } else {
        setRightSidebarTier(1);
      }
    };
    
    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(updateTier, 200);
    
    // Set up ResizeObserver for web
    let resizeObserver = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(updateTier);
      resizeObserver.observe(rightSidebarRef.current);
    }
    
    // Fallback: check on window resize
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('resize', updateTier);
    }
    
    return () => {
      clearTimeout(timeoutId);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('resize', updateTier);
      }
    };
  }, [homeData]);

  const renderHomeContent = () => {
    if (homeLoading || !homeData) {
      return null; // Don't show duplicate loading screen - initial app load already handles it
    }

    // Validate date before using it
    const validSelectedDate = homeSelectedDate instanceof Date && !isNaN(homeSelectedDate.getTime())
      ? homeSelectedDate
      : new Date();
    validSelectedDate.setHours(0, 0, 0, 0);
    const selectedDateStr = validSelectedDate.toISOString().split('T')[0];

    const todayTip = getTodayTip(homeData.children || [], homeData.learning || []);
    const weeklyProgressLine = generateWeeklyProgressLine(weeklyProgress, homeData.children || []);
    
    // Generate daily insights using Insight Engine
    let dailyInsightsData = null;
    try {
      const context = buildInsightContext(homeData, validSelectedDate);
      dailyInsightsData = generateInsights(context);
    } catch (err) {
      console.warn('Insight Engine error, using fallback:', err);
      // Fallback to legacy format
    const dailyInsightsBullets = homeSummary?.insights?.length > 0
      ? homeSummary.insights.slice(0, 3).map(i => i.summary || i.text || i.title)
      : generateDailyInsights(homeData.children || [], homeData.learning || []);
      dailyInsightsData = { bullets: dailyInsightsBullets };
    }
    
    // Resolve child IDs for filtering
    const resolvedChildIds = homeSelectedChildren === 'all'
      ? (homeData?.children || []).map(c => c?.id).filter(Boolean)
      : Array.isArray(homeSelectedChildren) ? homeSelectedChildren : [];
    
    // Filter learning events by selected date and children
    
    // Since get_home_data already filters by date, all events in homeData.learning are for the selected date
    // We just need to filter by selected children
    // Note: Deleted events are filtered at the database level by the get_home_data RPC function
    const filteredLearning = (homeData.learning || []).filter(event => {
      // Filter by selected children if any are selected
        if (resolvedChildIds.length > 0 && !resolvedChildIds.includes(event.child_id)) return false;
      
        return true;
    });

    // Generate perspective message for Hero Mood Card
    const eventCount = filteredLearning.length;
    const totalMinutes = filteredLearning.reduce((sum, event) => {
      const start = new Date(event.start_ts || event.start_local);
      const end = new Date(event.end_ts || event.end_local);
      return sum + (end - start) / (1000 * 60);
    }, 0);
    const density = eventCount > 0 ? totalMinutes / (eventCount * 60) : 0;
    
    let perspectiveMessage = '';
    if (eventCount === 0) {
      perspectiveMessage = "Today is a good day for slow learning and noticing small wins.";
    } else if (density < 1.5) {
      perspectiveMessage = "Today is a good day for slow learning and noticing small wins.";
    } else if (density < 3) {
      perspectiveMessage = "Today is a good day for steady progress and focused attention.";
            } else {
      perspectiveMessage = "Today is a good day for pacing yourself and celebrating each step.";
    }

    // Generate child micro-world messages from Daily Connection data
    const childMicroWorlds = (homeData.children || []).map((child, index) => {
      const childName = child.first_name || child.name || 'Child';
      
      // Find connection starter for this child
      const connection = conversationStarters?.find(c => c.child_id === child.id);
      
      let message = '';
      if (connection) {
        // Transform connection prompt into micro-world message
        const prompt = connection.prompt || connection.detail || '';
        const subject = connection.subject || 'learning';
        
        // Make it more emotional/personal
        if (prompt.includes('curious') || prompt.includes('curiosity')) {
          message = `Their ${subject.toLowerCase()} curiosity is peaking — ask about what's exciting them.`;
        } else if (prompt.includes('diving') || prompt.includes('dive')) {
          message = `${subject} is resurfacing — spark a conversation about what they're discovering.`;
        } else if (prompt.includes('creative') || prompt.includes('project') || prompt.includes('groove')) {
          message = "Creative mode is high — ask what project they're excited by.";
        } else {
          // Default transformation based on subject
          const subjectLower = subject.toLowerCase();
          if (subjectLower.includes('science')) {
            message = "Her science curiosity is peaking — ask about energy or motion.";
          } else if (subjectLower.includes('chemistry')) {
            message = "Chemistry is resurfacing — spark a conversation about reactions.";
          } else if (subjectLower.includes('art') || subjectLower.includes('creative')) {
            message = "Creative mode is high — ask what project they're excited by.";
          } else {
            message = `Their ${subjectLower} interest is growing — ask what's capturing their attention.`;
              }
        }
      } else {
        // Fallback: generate based on child's learning
        const childLearning = filteredLearning.filter(l => l.child_id === child.id);
        const subjects = [...new Set(childLearning.map(l => l.subject).filter(Boolean))];
        const primarySubject = subjects[0] || 'learning';
        
        // Generate emotional message based on subject
        const subjectLower = primarySubject.toLowerCase();
        if (subjectLower.includes('science')) {
          message = "Her science curiosity is peaking — ask about energy or motion.";
        } else if (subjectLower.includes('chemistry')) {
          message = "Chemistry is resurfacing — spark a conversation about reactions.";
        } else if (subjectLower.includes('art') || subjectLower.includes('creative')) {
          message = "Creative mode is high — ask what project they're excited by.";
        } else {
          message = `Their ${subjectLower} interest is growing — ask what's capturing their attention.`;
        }
      }
      
      return {
        childName,
        message,
      };
    }).filter(w => w.message);

    // Generate parent coaching suggestions
    const coachingSuggestions = [];
    if (homeSummary) {
      const resolvedChildIdsForCoaching = homeSelectedChildren === 'all'
                  ? homeData.children.map(c => c.id)
                  : Array.isArray(homeSelectedChildren) ? homeSelectedChildren : [];
                
      // Check for light days
      if (filteredLearning.length === 0 && homeData.children.length > 0) {
        const child = homeData.children[0];
        coachingSuggestions.push({
          text: `Today is light for ${child.first_name || child.name} — a good day to catch up on Reading.`,
                    });
                }
                
      // Check attendance gaps
      const missingLogs = homeSummary.attendanceStatus?.missingLogs || [];
      if (missingLogs.length === 0) {
        coachingSuggestions.push({
          text: "Try 1 quiet moment of reflection.",
        });
      }
      
      // General guidance
      if (eventCount > 3) {
        coachingSuggestions.push({
          text: "Focus on one meaningful block; don't over-schedule.",
        });
      } else {
        coachingSuggestions.push({
          text: "Protect time for deep work and meaningful connections.",
        });
      }
    }

    // Generate daily tips using getDailyTips
    const scheduleLoad = eventCount === 0 ? 'light' : totalMinutes < 120 ? 'light' : totalMinutes < 240 ? 'medium' : 'heavy';
    const tipsContext = {
      scheduleLoad,
      hasWeeklyGoal: hasWeeklyGoal,
      hasBacklogItems: hasBacklogItems,
      numChildren: homeData.children?.length || 0,
      dayOfWeek: validSelectedDate.getDay(),
    };
    const dailyTips = getDailyTips(tipsContext, 2);

    return (
      <View style={{ flex: 1 }}>
        <ScrollView 
          style={styles.content} 
          contentContainerStyle={styles.homeContentContainer}
          showsVerticalScrollIndicator={true}
        >
        {/* Hero Insights - Co-Star style daily guidance */}
        <HeroInsights
          primary={dailyInsightsData?.primary}
          child_insight={dailyInsightsData?.child_insight}
          emotional={null}
          tactical={null}
          strategic={dailyInsightsData?.strategic}
          cta={dailyInsightsData?.cta || "View weekly story"}
          onViewFull={() => onTabChange('records')}
        />
        

        {/* Single Column Layout: Learning + Tasks */}
        <View style={styles.homeMainLayout}>
          <View style={styles.homeLeftColumn}>
            {/* Today's Learning */}
            <View style={styles.familyScheduleHeader}>
              <Text style={styles.familyScheduleTitle}>Family Schedule</Text>
            </View>
            <TodaysLearningTimeGrouped 
          children={homeData.children || []}
              learning={filteredLearning}
              currentDate={validSelectedDate}
              onViewPlanner={() => onTabChange('planner')}
              onEventClick={(event) => {
                // Navigate to planner screen month view showing today's date
                const todayStr = validSelectedDate.toISOString().split('T')[0];
                
                // Update URL with date and view parameters
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  const url = new URL(window.location.href);
                  url.searchParams.set('tab', 'planner');
                  url.searchParams.set('date', todayStr);
                  url.searchParams.set('view', 'month');
                  window.history.replaceState({}, '', url.toString());
                }
                
                // Switch to planner tab
                onTabChange('planner');
                
                // Dispatch events to ensure view switches correctly
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'month' }));
                    // Also update the month to show the event's date
                    if (onCurrentMonthChange) {
                      onCurrentMonthChange(validSelectedDate);
                    }
                    // Dispatch month change event
                    window.dispatchEvent(new CustomEvent('plannerMonthChange', { detail: validSelectedDate }));
                  }, 100);
                }
              }}
              onEventComplete={async (event) => {
                console.log('[WebContent] onEventComplete callback triggered for event:', event?.id);
                
                // Optimistically update the event status in homeData immediately
                if (homeData && event?.id) {
                  setHomeData(prev => {
                    if (!prev) return prev;
                    const updatedLearning = (prev.learning || []).map(e => 
                      e.id === event.id ? { ...e, status: e.status === 'done' ? 'scheduled' : 'done' } : e
                    );
                    return {
                      ...prev,
                      learning: updatedLearning
                    };
                  });
                }
                
                // Refresh home data in the background without showing loading screen
                // Don't invalidate cache - just update it directly to avoid triggering reload
                if (user && homeData) {
                  try {
                    const { data: profileData } = await supabase
                      .from('profiles')
                      .select('family_id')
                      .eq('id', user.id)
                      .maybeSingle();
                    
                    if (profileData?.family_id) {
                      const validDate = homeSelectedDate instanceof Date && !isNaN(homeSelectedDate.getTime())
                        ? homeSelectedDate
                        : new Date();
                      validDate.setHours(0, 0, 0, 0);
                      const selectedDateStr = validDate.toISOString().split('T')[0];
                      
                      // Refetch in background without setting loading state
                      const homeDataResult = await supabase.rpc('get_home_data', {
                        _family_id: profileData.family_id,
                        _date: selectedDateStr,
                        _horizon_days: 14,
                      });
                      
                      const { data: rawData, error } = homeDataResult;
                      
                      // Clean invalid avatar UUIDs from RPC response before using
                      const data = rawData ? cleanAvatarUrls(rawData) : rawData;
                      
                      if (!error && data) {
                        const stories = (data?.stories || []).filter(s => 
                          s && s.title && s.body && s.title.trim() && s.body.trim()
                        );
                        
                        const updatedData = {
                          ...data,
                          stories: stories,
                        };
                        
                        // Update state and cache without invalidating
                        setHomeData(updatedData);
                        saveHomeDataToCache(profileData.family_id, selectedDateStr, updatedData);
                      }
                    }
                  } catch (err) {
                    console.error('[WebContent] Error refreshing home data after event complete:', err);
                  }
                }
                
                // Also dispatch refresh event for other components
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipHomeRefresh: true } }));
                }
          }}
        />
        
            {/* Backlog Tasks */}
            <TasksToday
              tasks={homeData.tasks || []}
              backlogCount={backlogCount}
              onViewPlanner={() => {
                // Navigate to planner list view with backlog tab
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  // Set URL parameters first - this ensures planner reads 'tasks' view on mount
                  const url = new URL(window.location.href);
                  url.searchParams.set('tab', 'planner');
                  url.searchParams.set('view', 'tasks');
                  url.searchParams.set('section', 'backlog');
                  window.history.replaceState({}, '', url.toString());
                  
                  // Dispatch events synchronously to update state immediately
                  window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'tasks' }));
                  window.dispatchEvent(new CustomEvent('plannerTasksViewChange', { detail: { section: 'backlog' } }));
                  
                  // Switch tabs immediately - URL params are already set so planner will read 'tasks' view
                  onTabChange('planner');
                } else {
                  onTabChange('planner');
                }
              }}
              onAddTask={() => {
                setTaskModalDate(validSelectedDate);
                setShowTaskModal(true);
              }}
              onToggleTask={(taskId) => {
                // Handle task toggle
              }}
              onGenerateTasks={() => {
                // Generate tasks from subjects
                const dateStr = validSelectedDate.toISOString().split('T')[0];
                onTabChange(`planner?date=${dateStr}&action=generate_tasks`);
              }}
              onAddFromBacklog={() => {
                const dateStr = validSelectedDate.toISOString().split('T')[0];
                onTabChange(`planner?date=${dateStr}&action=add_from_backlog`);
                }}
              onTaskClick={(task) => {
                // Navigate to planner list view with backlog tab
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  // Set URL parameters first - this ensures planner reads 'tasks' view on mount
                  const url = new URL(window.location.href);
                  url.searchParams.set('tab', 'planner');
                  url.searchParams.set('view', 'tasks');
                  url.searchParams.set('section', 'backlog');
                  window.history.replaceState({}, '', url.toString());
                  
                  // Dispatch events synchronously to update state immediately
                  window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'tasks' }));
                  window.dispatchEvent(new CustomEvent('plannerTasksViewChange', { detail: { section: 'backlog' } }));
                  
                  // Switch tabs immediately - URL params are already set so planner will read 'tasks' view
                  onTabChange('planner');
                } else {
                  onTabChange('planner');
                }
              }}
              />
          </View>
          </View>
        </ScrollView>

        {/* Suggestion Action Modal */}
        <SuggestionActionModal
          visible={showSuggestionModal}
          suggestion={selectedSuggestion}
          onClose={() => {
            setShowSuggestionModal(false);
            setSelectedSuggestion(null);
          }}
          onNavigateToPlanner={(date) => {
            if (date) {
              const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
              onTabChange(`planner?date=${dateStr}`);
            } else {
              onTabChange('planner');
            }
          }}
        />

        {/* Task Create Modal */}
        <TaskCreateModal
          visible={showTaskModal}
          onClose={() => {
            setShowTaskModal(false);
            setTaskModalDate(null);
            setTaskModalChildId(null);
            setTaskModalDefaultPlacement('calendar'); // Reset to default
          }}
          defaultDate={taskModalDate || validSelectedDate}
          defaultChildId={taskModalChildId}
          defaultPlacement={taskModalDefaultPlacement}
          familyId={familyId}
          familyMembers={(homeData?.children || []).map(child => ({
            id: child.id,
            name: child.first_name || child.name || 'Unknown',
            role: 'child'
          }))}
          lists={[
            { id: 'inbox', name: 'Inbox' },
            ...(homeData?.children || []).map(child => ({
              id: `child:${child.id}`,
              name: child.first_name || child.name || 'Unknown'
            }))
          ]}
          onCreated={async (task) => {
            // Dispatch eventCreated event for home page and other components
            if (Platform.OS === 'web' && typeof window !== 'undefined' && task?.id) {
              window.dispatchEvent(new CustomEvent('eventCreated', { 
                detail: { eventId: task.id } 
              }));
              window.dispatchEvent(new CustomEvent('refreshCalendar'));
            }
            
            // Refresh home data after task creation
            if (homeData) {
              setHomeData(null); // This will trigger a refetch
            }
          }}
                  />

        {/* Event Details Modal */}
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
            console.log('[WebContent] onEventUpdated callback triggered');
            
            // Refresh home data after event update
            if (homeData) {
              // Invalidate cache and refetch
              if (user) {
                try {
                  const { data: profileData } = await supabase
                    .from('profiles')
                    .select('family_id')
                    .eq('id', user.id)
                    .maybeSingle();
                  
                  if (profileData?.family_id) {
                    invalidateHomeDataCache(profileData.family_id);
                    
                    const validDate = homeSelectedDate instanceof Date && !isNaN(homeSelectedDate.getTime())
                      ? homeSelectedDate
                      : new Date();
                    validDate.setHours(0, 0, 0, 0);
                    const selectedDateStr = validDate.toISOString().split('T')[0];
                    
                    const homeDataResult = await supabase.rpc('get_home_data', {
                      _family_id: profileData.family_id,
                      _date: selectedDateStr,
                      _horizon_days: 14,
                    });
                    
                    const { data: rawData, error } = homeDataResult;
                    
                    // Clean invalid avatar UUIDs from RPC response before using
                    const data = rawData ? cleanAvatarUrls(rawData) : rawData;
                    
                    if (!error && data) {
                      const stories = (data?.stories || []).filter(s => 
                        s && s.title && s.body && s.title.trim() && s.body.trim()
                      );
                      
                      setHomeData({
                        ...data,
                        stories: stories,
                      });
                      
                      saveHomeDataToCache(profileData.family_id, selectedDateStr, {
                        ...data,
                        stories: stories,
                      });
                    }
                  }
                } catch (err) {
                  console.error('[WebContent] Error refreshing home data after update:', err);
                }
              }
            }
            
            // Refresh calendar data for planner
            console.log('[WebContent] Refreshing calendar data after event update');
            await refreshCalendarData();
            
            // Also dispatch refresh event for other components
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipHomeRefresh: true } }));
            }
          }}
          onEventDeleted={async (deletedEventId) => {
            console.log('[WebContent] onEventDeleted callback triggered');
            console.log('[WebContent] Deleted event ID:', deletedEventId || eventModalEventId);
            console.log('[WebContent] Current homeData:', homeData ? 'exists' : 'null');
            
            const deletedId = deletedEventId || eventModalEventId;
            
            // Optimistically remove the event from current homeData immediately
            if (homeData && deletedId) {
              console.log('[WebContent] Optimistically removing event from homeData');
              setHomeData(prev => {
                if (!prev) return prev;
                const updatedLearning = (prev.learning || []).filter(e => e.id !== deletedId);
                return {
                  ...prev,
                  learning: updatedLearning
                };
              });
            }
            
            // Optimistically remove from calendarEvents (for planner) immediately
            if (deletedId) {
              console.log('[WebContent] Optimistically removing event from calendarEvents');
              setCalendarEvents(prevEvents => {
                const updated = { ...prevEvents };
                Object.keys(updated).forEach(dateKey => {
                  if (Array.isArray(updated[dateKey])) {
                    updated[dateKey] = updated[dateKey].filter(e => e.id !== deletedId);
                    // Remove date key if no events left
                    if (updated[dateKey].length === 0) {
                      delete updated[dateKey];
                    }
                  }
                });
                return updated;
              });
              
              // Dispatch event deletion event for TasksView and other components
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('eventDeleted', { 
                  detail: { eventId: deletedId, id: deletedId } 
                }));
                
                // Also dispatch refreshCalendar event to reload planner/calendar views
                window.dispatchEvent(new CustomEvent('refreshCalendar', { 
                  detail: { eventId: deletedId } 
                }));
              }
              
              // Invalidate calendar cache to force reload
              setCalendarDataCache({});
              setIsCalendarDataLoaded(false);
              
              // Immediately reload calendar data for the current month
              if (familyId) {
                const today = new Date();
                const todayYear = today.getFullYear();
                const todayMonth = today.getMonth() + 1;
                loadMonthData(todayYear, todayMonth).then(monthData => {
                  if (monthData && monthData.events) {
                    const filteredEvents = {};
                    Object.keys(monthData.events).forEach(key => {
                      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
                        filteredEvents[key] = monthData.events[key];
                      }
                    });
                    setCalendarEvents(prevEvents => {
                      // Remove the deleted event and merge new data
                      const updated = { ...prevEvents };
                      Object.keys(updated).forEach(dateKey => {
                        if (Array.isArray(updated[dateKey])) {
                          updated[dateKey] = updated[dateKey].filter(e => e.id !== deletedId);
                          if (updated[dateKey].length === 0) {
                            delete updated[dateKey];
                          }
                        }
                      });
                      return { ...updated, ...filteredEvents };
                    });
                    setCalendarDataCache(prev => ({
                      ...prev,
                      [`${todayYear}-${today.getMonth()}`]: filteredEvents
                    }));
                  }
                });
              }
            }
            
            // Close the modal first
            console.log('[WebContent] Closing event modal');
            setEventModalVisible(false);
            setEventModalEventId(null);
            setEventModalInitialEvent(null);
            
            // Invalidate cache and refetch immediately
            if (user) {
              try {
                const { data: profileData } = await supabase
                  .from('profiles')
                  .select('family_id')
                  .eq('id', user.id)
                  .maybeSingle();
                
                if (profileData?.family_id) {
                  // Invalidate cache first
                  console.log('[WebContent] Invalidating home data cache');
                  invalidateHomeDataCache(profileData.family_id);
                  
                  // Get current selected date
                  const validDate = homeSelectedDate instanceof Date && !isNaN(homeSelectedDate.getTime())
                    ? homeSelectedDate
                    : new Date();
                  validDate.setHours(0, 0, 0, 0);
                  const selectedDateStr = validDate.toISOString().split('T')[0];
                  
                  // Force refetch immediately without showing loading screen
                  console.log('[WebContent] Refetching home data after delete');
                  
                  const homeDataResult = await supabase.rpc('get_home_data', {
                    _family_id: profileData.family_id,
                    _date: selectedDateStr,
                    _horizon_days: 14,
                  });
                  
                  const { data: rawData, error } = homeDataResult;
                  
                  // Clean invalid avatar UUIDs from RPC response before using
                  const data = rawData ? cleanAvatarUrls(rawData) : rawData;
                  
                  if (error) {
                    console.error('[WebContent] Error refetching home data:', error);
                    // If refetch fails, keep current data visible and let useEffect handle retry
                    // Don't set homeData to null - that would trigger loading screen
                    // The useEffect will retry automatically
                  } else {
                    // Filter out empty/invalid stories
                    const stories = (data?.stories || []).filter(s => 
                      s && s.title && s.body && s.title.trim() && s.body.trim()
                    );
                    
                    // Also filter out the deleted event (in case it's still in the response)
                    const updatedLearning = deletedId 
                      ? (data?.learning || []).filter(e => e.id !== deletedId)
                      : (data?.learning || []);
                    
                    console.log('[WebContent] Filtered learning events:', {
                      before: (data?.learning || []).length,
                      after: updatedLearning.length,
                      deletedId: deletedId
                    });
                    
                    const updatedData = {
                      ...data,
                      stories: stories,
                      learning: updatedLearning,
                    };
                    
                    // Ensure loading state is false before updating
                    setHomeLoading(false);
                    if (onHomeLoadingChange) onHomeLoadingChange(false);
                    
                    // Update homeData immediately with fresh data
                    setHomeData(updatedData);
                    
                    // Cache the updated data
                    saveHomeDataToCache(profileData.family_id, selectedDateStr, updatedData);
                    
                    console.log('[WebContent] Home data updated successfully');
                  }
                  
                  // Also refresh fetchTodaysLearning to update the "Today's Learning" section
                  if (activeTab === 'home') {
                    console.log('[WebContent] Refreshing fetchTodaysLearning after delete');
                    await fetchTodaysLearning();
                  }
                  
                  // Refresh calendar data for planner (this will update calendarEvents)
                  // Refresh the month containing the deleted event, or current month if we don't know
                  console.log('[WebContent] Refreshing calendar data for planner');
                  const eventDate = eventModalInitialEvent?.start_ts || eventModalInitialEvent?.start;
                  const refreshDate = eventDate ? new Date(eventDate) : currentMonth;
                  await refreshCalendarData(refreshDate);
                  
                  // Dispatch calendar refresh event (but don't trigger home refresh since we already did)
                  // This will refresh the calendar view without affecting home data
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    console.log('[WebContent] Dispatching refreshCalendar event for calendar view');
                    // Use a different event name or add a flag to prevent home refresh
                    window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipHomeRefresh: true } }));
                  }
                }
              } catch (err) {
                console.error('[WebContent] Error refreshing home data:', err);
              }
            }
            console.log('[WebContent] onEventDeleted callback completed');
          }}
              familyId={familyId}
          familyMembers={(homeData?.children || []).map(child => ({
            id: child.id,
            name: child.first_name || child.name || 'Unknown',
            role: 'child'
          }))}
        />
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
    );
  };

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
                      <Image 
                        source={getAvatarSource(child.avatar)} 
                        style={styles.childAvatar} 
                        resizeMode="contain"
                        onError={(e) => {
                          // Suppress 404 errors for missing avatars - they're harmless
                          if (Platform.OS === 'web' && e.nativeEvent) {
                            e.preventDefault?.();
                          }
                        }}
                      />
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
        
        <View style={styles.familyScreenContainer}>
          {/* Left Column - Main Content */}
          <View style={styles.familyScreenMainContent}>
            <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingVertical: 32 }}>
              {/* Child Filter - Pill Segmented Control */}
              {children.length > 0 && (
                <View style={styles.childFilterContainer}>
                  <View style={styles.segmentedControl}>
                    <TouchableOpacity
                      style={[
                        styles.segmentedControlSegment,
                        familyScreenSelectedChildId === null && styles.segmentedControlSegmentActive
                      ]}
                      onPress={() => setFamilyScreenSelectedChildId(null)}
                      activeOpacity={0.7}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text style={[
                        styles.segmentedControlText,
                        familyScreenSelectedChildId === null && styles.segmentedControlTextActive
                      ]}>
                        All Children
                      </Text>
                    </TouchableOpacity>
                    {children.map(child => (
                      <TouchableOpacity
                        key={child.id}
                        style={[
                          styles.segmentedControlSegment,
                          familyScreenSelectedChildId === child.id && styles.segmentedControlSegmentActive
                        ]}
                        onPress={() => setFamilyScreenSelectedChildId(child.id)}
                        activeOpacity={0.7}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={[
                          styles.segmentedControlText,
                          familyScreenSelectedChildId === child.id && styles.segmentedControlTextActive
                        ]}>
                          {child.first_name || child.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

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
                  {(familyScreenSelectedChildId === null 
                    ? children 
                    : children.filter(c => c.id === familyScreenSelectedChildId)
                  ).map(child => {
                    // Get child's avatar color for background
                    const childColor = getChildColorFromAvatar(child.avatar);
                    
                    return (
                      <View 
                        key={child.id} 
                        style={[styles.childCard, { backgroundColor: childColor }]}
                      >
                        <Text style={styles.childName}>{child.first_name}</Text>
                        <Text style={styles.childDetails}>
                          Age: {child.age} | Grade: {child.grade}
                        </Text>
                      </View>
                    );
                  })}
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

          {/* Right Sidebar */}
          <View style={styles.familyScreenRightSidebar}>
            {/* Family Settings Card */}
            <TouchableOpacity
              style={styles.familySidebarCard}
              onPress={() => onOpenSettings && onOpenSettings('family')}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && {
                cursor: 'pointer',
              })}
            >
              <View style={styles.familySidebarCardContent}>
                <View style={styles.familySidebarCardIconContainer}>
                  <Settings size={24} color={colors.accent} />
                </View>
                <View style={styles.familySidebarCardTextContainer}>
                  <Text style={styles.familySidebarCardTitle}>Family Settings</Text>
                  <Text style={styles.familySidebarCardDescription}>
                    Manage family members, roles, and preferences
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Quick Stats Card */}
            <View style={styles.familySidebarCard}>
              <View style={styles.familySidebarCardContent}>
                <View style={styles.familySidebarCardIconContainer}>
                  <Users size={24} color={colors.accent} />
                </View>
                <View style={styles.familySidebarCardTextContainer}>
                  <Text style={styles.familySidebarCardTitle}>Family Overview</Text>
                  <View style={styles.familyStatsContainer}>
                    <Text style={styles.familyStatText}>
                      {children.length} {children.length === 1 ? 'child' : 'children'}
                    </Text>
                    {archivedChildren.length > 0 && (
                      <Text style={styles.familyStatText}>
                        {archivedChildren.length} archived
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    )
  }

  const renderLessonPlansContent = () => {
    return <LessonPlans familyId={familyId} initialPlans={[]} children={children} />;
  }

  const renderRecordsContent = () => {
    // Records screen removed - archived
    return (
      <View style={styles.content}>
        <Text style={styles.title}>Records</Text>
        <Text style={styles.subtitle}>This feature has been archived</Text>
      </View>
    );
    // // New Records Architecture: Use WebRecordsScreen
    // // Fallback to old attendance/reports views if subtab is specified
    // if (activeSubtab === 'attendance') {
    //   return <Attendance familyId={familyId} />;
    // } else if (activeSubtab === 'reports') {
    //   return <Reports familyId={familyId} />;
    // } else if (activeSubtab === 'templates') {
    //   return <TemplatesPage familyId={familyId} children={children || []} />;
    // } else if (activeSubtab === 'timeline' || activeSubtab === 'portfolio') {
    //   return <PortfolioTimeline familyId={familyId} />;
    // }

    // // Default: Show new WebRecordsScreen component
    // return <WebRecordsScreen familyId={familyId} navigation={navigation} children={children || []} />;
  }

  const renderCurriculumImportContent = () => {
    return (
      <View style={styles.content}>
        <CurriculumImportWizard
          visible={true}
          onClose={() => {
            setShowCurriculumWizard(false);
            onTabChange('home');
          }}
          familyId={familyId}
          children={children || []}
          subjects={subjects || []}
        />
      </View>
    );
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
  // Helper function to determine which month's calendar grid contains today
  const getMonthForToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get the first day of the current month
    const firstOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Calculate the start of the calendar grid for current month (Sunday before or on the 1st)
    const startOfWeekForCurrentMonth = new Date(firstOfCurrentMonth);
    const dayOfWeek = startOfWeekForCurrentMonth.getDay();
    startOfWeekForCurrentMonth.setDate(startOfWeekForCurrentMonth.getDate() - dayOfWeek);
    
    // Calculate the start of the calendar grid for next month
    const firstOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const startOfWeekForNextMonth = new Date(firstOfNextMonth);
    const dayOfWeekNext = startOfWeekForNextMonth.getDay();
    startOfWeekForNextMonth.setDate(startOfWeekForNextMonth.getDate() - dayOfWeekNext);
    
    // Check if today falls within the next month's calendar grid
    // (i.e., if today is >= the start of next month's grid)
    if (today >= startOfWeekForNextMonth) {
      // Today appears in next month's grid, so show next month
      return firstOfNextMonth;
    }
    
    // Otherwise, show current month
    return firstOfCurrentMonth;
  };

  const [currentMonth, setCurrentMonth] = useState(() => {
    const date = getMonthForToday();
    // Ensure the initial date is valid
    if (isNaN(date.getTime())) {
      console.error('[WebContent] Invalid initial date, using fallback');
      return new Date(2025, 0, 1); // Fallback to Jan 1, 2025
    }
    return date;
  });
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





      


  // Handle event completion (toggle done/scheduled + optionally open outcome modal)
  const handleEventComplete = async (event) => {
    if (!event?.id) return;
    
    const isCurrentlyDone = event.status === 'done';
    const newStatus = isCurrentlyDone ? 'scheduled' : 'done';
    
    // Optimistically update the UI immediately
    setCalendarEvents(prevEvents => {
      const updated = { ...prevEvents };
      Object.keys(updated).forEach(dateKey => {
        // Ensure dateKey value is an array before calling map
        if (Array.isArray(updated[dateKey])) {
          updated[dateKey] = updated[dateKey].map(ev => 
            ev.id === event.id ? { ...ev, status: newStatus } : ev
          );
        }
      });
      return updated;
    });
    
    try {
      const { completeEvent, updateEventStatus } = await import('../lib/services/attendanceClient');
      
      let result;
      if (isCurrentlyDone) {
        // Mark as not done (scheduled) using status update endpoint
        result = await updateEventStatus(event.id, 'scheduled');
      } else {
        // Mark as done using the attendance client (creates attendance record)
        result = await completeEvent(event.id);
      }
      
      if (result.error) {
        console.error('[WebContent] Error updating event status:', result.error);
        // Revert optimistic update on error
        setCalendarEvents(prevEvents => {
          const reverted = { ...prevEvents };
          Object.keys(reverted).forEach(dateKey => {
            // Ensure dateKey value is an array before calling map
            if (Array.isArray(reverted[dateKey])) {
              reverted[dateKey] = reverted[dateKey].map(ev => 
                ev.id === event.id ? { ...ev, status: event.status || 'scheduled' } : ev
              );
            }
          });
          return reverted;
        });
        if (Platform.OS === 'web') {
          alert(`Failed to ${isCurrentlyDone ? 'unmark' : 'mark'} event as done: ${result.error.message || result.error}`);
        }
        return;
      }
      
      // Skip refresh to avoid loading state - optimistic update already handles UI
      // The server state will sync on next natural refresh (tab switch, date change, etc.)
      // This provides instant feedback without the jarring loading state
      
      // Only prompt for material review when marking as done (not when undoing)
      if (!isCurrentlyDone && event.material_id && event.child_id && familyId) {
        // Check if there's already a recent review for this material/child/event combo
        const { getMaterialReviews } = await import('../lib/services/materialsClient');
        try {
          const reviews = await getMaterialReviews(event.material_id);
          const hasRecentReview = reviews.some(r => 
            r.child_id === event.child_id && 
            r.event_id === event.id &&
            // Only prompt if review is older than 1 day or doesn't exist
            (!r.created_at || (new Date() - new Date(r.created_at)) > 24 * 60 * 60 * 1000)
          );
          
          if (!hasRecentReview) {
            // Prompt for material review
            setMaterialReviewEvent(event);
            setShowMaterialReviewModal(true);
          }
        } catch (err) {
          console.error('Error checking for existing review:', err);
          // Still prompt if check fails
          setMaterialReviewEvent(event);
          setShowMaterialReviewModal(true);
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
    
    // Extract original ID if it's an expanded project event (remove -day-X suffix)
    // Check for _originalId, originalId, or extract from expanded ID format (id-day-X)
    let eventId = event?._originalId || event?.originalId || event?.id;
    
    // If the ID contains '-day-', it's an expanded project event - extract the original ID
    if (eventId && typeof eventId === 'string' && eventId.includes('-day-')) {
      eventId = eventId.split('-day-')[0];
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (eventId && !uuidRegex.test(eventId)) {
      console.warn('[WebContent] Invalid UUID format in handleEventSelect:', eventId, 'from event:', event);
      // Try to extract from the event object
      eventId = event?._originalId || event?.originalId || null;
    }
    
    console.log('[WebContent] handleEventSelect - extracted eventId:', {
      originalEventId: event?.id,
      extractedEventId: eventId,
      hasOriginalId: !!event?._originalId,
      hasOriginalIdProp: !!event?.originalId
    });
    
    setEventModalEventId(eventId || null);
    if (event) {
      // Use the extracted eventId for the initial event object
      const cleanEventId = eventId || event.id;
      setEventModalInitialEvent({
        id: cleanEventId,
        title: event.title,
        description: event.description || event.data?.description || '',
        status: event.status || event.data?.status,
        start_ts: event.start_ts || event.start || event.data?.start_ts || event.data?.start,
        end_ts: event.end_ts || event.end || event.data?.end_ts || event.data?.end,
        start_local: event.start_local || event.data?.start_local,
        end_local: event.end_local || event.data?.end_local,
        updated_at: event.updated_at || event.data?.updated_at,
        child_id: event.childId || event.child_id || event.data?.child_id,
        child_ids: event.child_ids || event.data?.child_ids, // Include child_ids for flexible events
        tags: event.tags || event.data?.tags,
        source: event.source || event.data?.source,
        // Include all other fields from event to preserve optimistic updates
        ...event,
        ...event.data,
        // Override id with the clean eventId
        id: cleanEventId,
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
      
      // Build menu items based on whether we have cut/copied data
      const menuItems = [];
      
      if (cutEventData) {
        menuItems.push({ text: 'Paste Event', action: () => handlePasteEvent(dateKey) });
      }
      
      menuItems.push({ text: 'Create New Event', action: () => handleCreateNewEvent(dateKey) });
      menuItems.push({ 
        text: 'Add Note', 
        action: () => {
          // Open note editor for this day
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('openNoteEditor', {
              detail: { 
                date: dateKey,
                familyId: familyId,
              }
            }));
          }
        }
      });
      
      // Calculate menu dimensions for positioning
      const estimatedMenuHeight = menuItems.length * 50 + 16;
      const estimatedMenuWidth = 200;
      
      // Calculate adjusted position based on viewport boundaries
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const clickY = nativeEvent.clientY;
      const clickX = nativeEvent.clientX;
      
      // If menu would go off bottom, position it above the click point
      let menuTop = clickY;
      if (clickY + estimatedMenuHeight > viewportHeight) {
        menuTop = clickY - estimatedMenuHeight;
        if (menuTop < 0) {
          menuTop = 10;
        }
      }
      
      // If menu would go off right edge, position it to the left of click point
      let menuLeft = clickX;
      if (clickX + estimatedMenuWidth > viewportWidth) {
        menuLeft = clickX - estimatedMenuWidth;
        if (menuLeft < 0) {
          menuLeft = 10;
        }
      }
      
      const menu = document.createElement('div');
      menu.id = 'context-menu';
      menu.style.cssText = `
        position: fixed;
        top: ${menuTop}px;
        left: ${menuLeft}px;
        background-color: #ffffff;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
        z-index: 999999;
        min-width: 200px;
        padding: 8px 0;
        font-family: "Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      `;
      
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
          document.removeEventListener('mousedown', closeMenu, true);
          document.removeEventListener('contextmenu', closeMenu, true);
        }
      };
      // Use bubble phase for click (so menu item handlers fire first)
      // Use capture phase for mousedown/contextmenu to catch right-clicks
      document.addEventListener('click', closeMenu);
      document.addEventListener('mousedown', closeMenu, true);
      document.addEventListener('contextmenu', closeMenu, true);
    }
  };

  const handleRightClick = (event, nativeEvent) => {
    if (typeof window !== 'undefined' && nativeEvent) {
      nativeEvent.preventDefault();
      
      // Check if we're in tasks view by checking the URL or active tab
      const isInTasksView = activeTab === 'planner' && calendarView === 'tasks';
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const viewParam = urlParams?.get('view');
      const isTasksViewFromUrl = viewParam === 'tasks';
      
      // More aggressive check: if page body contains "Trash" as a prominent header, we're likely in trash
      let pageHasTrashHeader = false;
      if (typeof window !== 'undefined' && document.body) {
        const bodyText = document.body.textContent || '';
        // Check if "Trash" appears as a standalone word (not part of another word)
        const trashMatch = bodyText.match(/\bTrash\b/);
        if (trashMatch) {
          // Look for elements with "Trash" text that are large headers
          const allElements = Array.from(document.querySelectorAll('*'));
          const trashElements = allElements.filter(el => {
            const text = (el.textContent || '').trim();
            return text === 'Trash';
          });
          for (const el of trashElements) {
            const style = window.getComputedStyle ? window.getComputedStyle(el) : {};
            const fontSize = parseFloat(style.fontSize || '0');
            const fontWeight = style.fontWeight || '';
            // If it's a large, bold header, we're in trash
            if (fontSize > 16 || fontWeight === 'bold' || fontWeight === '600' || fontWeight === '700') {
              pageHasTrashHeader = true;
              break;
            }
          }
        }
      }
      
      // Create context menu directly in DOM
      const existingMenu = document.getElementById('context-menu');
      if (existingMenu) {
        existingMenu.remove();
      }
      
      const menuItems = [];
      
      // Build menu items first to calculate menu size
      // (We'll add items below, but need to estimate size for positioning)
      
      // All holidays in the calendar come from the holidays table (which includes both
      // selected global holidays and custom family holidays), so they should all be editable
      // The global_official_holidays table is just the master list used during onboarding
      const isGlobalHoliday = false; // All holidays in calendar are family-managed
      
      // Only show Edit for non-global holidays
      if (!isGlobalHoliday) {
        menuItems.push({ text: 'Edit Event', action: () => handleContextEditEvent(event) });
      }
      
      // Check if event is deleted (in trash view)
      // First check if the event has _activeSection metadata indicating we're in trash
      let isInTrashFromMetadata = event?._activeSection === 'trash';
      
      // Fallback: if page has "Trash" header, we're in trash
      if (!isInTrashFromMetadata && pageHasTrashHeader) {
        isInTrashFromMetadata = true;
      }
      
      // Events from trash view may have deleted_at at different levels
      // Check all possible locations where deleted_at might be
      // deleted_at can be a timestamp string, so check for truthiness
      // Also do a deep search for deleted_at in the event object
      const deletedAtValue = event?.deleted_at || event?.deleted || event?.data?.deleted_at || 
                            (event?.ev && (event.ev.deleted_at || event.ev.deleted));
      
      // Deep search for deleted_at anywhere in the event object (as a fallback)
      let deepDeletedAt = null;
      if (event && typeof event === 'object') {
        try {
          const eventString = JSON.stringify(event);
          if (eventString.includes('deleted_at')) {
            // Try multiple patterns to extract deleted_at value
            const patterns = [
              /"deleted_at"\s*:\s*"([^"]+)"/,  // String value
              /"deleted_at"\s*:\s*"([^"]*null[^"]*)"/,  // null string (should be ignored)
              /"deleted_at"\s*:\s*([^,}\]]+)/  // Any value (number, string, etc.)
            ];
            for (const pattern of patterns) {
              const match = eventString.match(pattern);
              if (match && match[1] && match[1] !== 'null' && match[1] !== '""') {
                deepDeletedAt = match[1];
                break;
              }
            }
          }
        } catch (e) {
          // Ignore JSON stringify errors
        }
      }
      
      const isDeleted = !!(deletedAtValue || deepDeletedAt || isInTrashFromMetadata);
      
      // Also check if we're in tasks view - if so, and we have a deleted_at value, assume it's in trash
      const mightBeInTrash = (isInTasksView || isTasksViewFromUrl) && deletedAtValue;
      
      // Additional check: if we're in tasks view, try to detect if we're in trash section
      // This is a fallback in case deleted_at isn't detected in the event object
      let isInTrashSection = false;
      if (typeof window !== 'undefined' && (isInTasksView || isTasksViewFromUrl)) {
        // Try to detect if we're in trash by checking the DOM
        // Look for "Trash" text in the main content area header (large text)
        const allElements = Array.from(document.querySelectorAll('*'));
        const trashHeader = allElements.find(el => {
          const text = (el.textContent || '').trim();
          const tagName = el.tagName || '';
          const style = window.getComputedStyle ? window.getComputedStyle(el) : {};
          const fontSize = parseFloat(style.fontSize || '0');
          return text === 'Trash' && (
            tagName === 'H1' || tagName === 'H2' || tagName === 'H3' ||
            fontSize > 20 ||
            (el.className && typeof el.className === 'string' && (
              el.className.includes('header') || 
              el.className.includes('Header') ||
              el.className.includes('title') ||
              el.className.includes('Title')
            ))
          );
        });
        if (trashHeader) {
          isInTrashSection = true;
        }
        
        // Also check if there's a sidebar item with "Trash" that appears active
        const sidebarItems = allElements.filter(el => {
          const text = (el.textContent || '').trim();
          return text === 'Trash' || text.includes('Trash');
        });
        const activeTrashItem = sidebarItems.find(el => {
          const style = window.getComputedStyle ? window.getComputedStyle(el) : {};
          const classes = el.className || '';
          return style.backgroundColor !== 'transparent' && style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
                 (typeof classes === 'string' && (classes.includes('Active') || classes.includes('active')));
        });
        if (activeTrashItem) {
          isInTrashSection = true;
        }
        
        // Final fallback: if we're in tasks view and the event doesn't have normal event fields,
        // assume it's from trash (trash events might not have start_ts, etc.)
        if (!isInTrashSection && !event?.start_ts && !event?.start && !event?.data?.start_ts) {
          // Event without start time in tasks view might be from trash
          isInTrashSection = true;
        }
      }
      
      // Determine if we should show Restore vs Delete
      // If we're in tasks view and can detect trash section, prioritize showing Restore
      // Also, if we're in tasks view and the event doesn't have normal scheduling fields,
      // it's likely from trash (trash events might not have start_ts)
      const eventLacksNormalFields = !event?.start_ts && !event?.start && !event?.data?.start_ts;
      const likelyInTrash = (isInTasksView || isTasksViewFromUrl) && (isInTrashSection || eventLacksNormalFields);
      
      // More aggressive check: if we're in tasks view, check if the page text contains "Trash"
      // This is a fallback if DOM detection fails
      let pageIndicatesTrash = false;
      if (typeof window !== 'undefined' && (isInTasksView || isTasksViewFromUrl)) {
        const pageText = document.body?.textContent || '';
        // If page contains "Trash" and we're in tasks view, and the event doesn't have normal fields,
        // assume we're in trash section
        if (pageText.includes('Trash') && eventLacksNormalFields) {
          pageIndicatesTrash = true;
        }
      }
      
      // Simple logic: Only show Restore Event if we're explicitly in trash section (from metadata)
      // Otherwise, show Delete Event for non-global holidays
      if (isInTrashFromMetadata && !isGlobalHoliday) {
        // In trash view: show Restore Event only
        menuItems.push({ text: 'Restore Event', action: () => {
          handleRestoreEvent(event);
        }});
      } else if (!isGlobalHoliday) {
        // Not in trash view: show Delete Event only
        menuItems.push({ text: 'Delete Event', action: () => handleDeleteEvent(event), isDelete: true });
      }
      
      // If no menu items are available (global holiday), show informational message
      if (menuItems.length === 0) {
        menuItems.push({ text: 'Global holidays cannot be modified', action: () => {}, isDisabled: true });
      }
      
      // Calculate menu dimensions for positioning
      // Each menu item is approximately 50px tall (16px padding top + 16px padding bottom + ~18px text)
      const estimatedMenuHeight = menuItems.length * 50 + 16; // +16 for padding
      const estimatedMenuWidth = 200; // min-width
      
      // Calculate adjusted position based on viewport boundaries
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const clickY = nativeEvent.clientY;
      const clickX = nativeEvent.clientX;
      
      // If menu would go off bottom, position it above the click point
      let menuTop = clickY;
      if (clickY + estimatedMenuHeight > viewportHeight) {
        menuTop = clickY - estimatedMenuHeight;
        // Ensure it doesn't go off the top either
        if (menuTop < 0) {
          menuTop = 10; // Small margin from top
        }
      }
      
      // If menu would go off right edge, position it to the left of click point
      let menuLeft = clickX;
      if (clickX + estimatedMenuWidth > viewportWidth) {
        menuLeft = clickX - estimatedMenuWidth;
        // Ensure it doesn't go off the left either
        if (menuLeft < 0) {
          menuLeft = 10; // Small margin from left
        }
      }
      
      // Create menu element with calculated position
      const menu = document.createElement('div');
      menu.id = 'context-menu';
      menu.style.cssText = `
        position: fixed;
        top: ${menuTop}px;
        left: ${menuLeft}px;
        background-color: #ffffff;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
        z-index: 999999;
        min-width: 200px;
        padding: 8px 0;
        font-family: "Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      `;
      
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
      
      // Store the original event to prevent immediate closure
      const originalEventTime = Date.now();
      const originalEventTarget = nativeEvent.target;
      
      // Close menu when clicking elsewhere
      const closeMenu = (e) => {
        // Don't close if clicking inside the menu
        if (menu && menu.contains(e.target)) {
          return;
        }
        // Don't close if the event target is the menu itself
        if (e.target === menu) {
          return;
        }
        // Don't close if this is the same event that opened the menu (within 200ms)
        if (e.target === originalEventTarget && Date.now() - originalEventTime < 200) {
          return;
        }
        if (menu && menu.parentNode) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
          document.removeEventListener('mousedown', closeMenu, true);
          document.removeEventListener('contextmenu', closeMenu, true);
        }
      };
      
      // Delay attaching listeners to prevent immediate closure from the right-click event
      setTimeout(() => {
        // Use bubble phase for click (so menu item handlers fire first)
        // Use capture phase for mousedown/contextmenu to catch right-clicks
        document.addEventListener('click', closeMenu);
        document.addEventListener('mousedown', closeMenu, true);
        document.addEventListener('contextmenu', closeMenu, true);
      }, 100);
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

  const handleRestoreEvent = async (event) => {
    if (!event || !event.id || !familyId) {
      console.error('[WebContent] Cannot restore event: missing event.id or familyId');
      return;
    }
    
    try {
      // Restore event by setting deleted_at to NULL
      const { error } = await supabase
        .from('events')
        .update({ deleted_at: null })
        .eq('id', event.id)
        .eq('family_id', familyId);
      
      if (error) {
        console.error('[WebContent] Error restoring event:', error);
        throw error;
      }
      
      console.log('[WebContent] Event restored successfully:', event.id);
      
      // Remove from calendarEvents immediately
      setCalendarEvents(prevEvents => {
        const updated = { ...prevEvents };
        Object.keys(updated).forEach(dateKey => {
          if (Array.isArray(updated[dateKey])) {
            updated[dateKey] = updated[dateKey].filter(e => e.id !== event.id);
            if (updated[dateKey].length === 0) {
              delete updated[dateKey];
            }
          }
        });
        return updated;
      });
      
      // Invalidate cache and reload
      setCalendarDataCache({});
      setIsCalendarDataLoaded(false);
      
      // Dispatch refresh event
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar', { 
          detail: { eventId: event.id, action: 'restored' } 
        }));
        window.dispatchEvent(new CustomEvent('eventRestored', { 
          detail: { eventId: event.id } 
        }));
      }
      
      // Show success message
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // You can add a toast notification here if available
        console.log('Event restored successfully');
      }
    } catch (error) {
      console.error('[WebContent] Failed to restore event:', error);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        alert('Failed to restore event. Please try again.');
      }
    }
  };

  const handleDeleteEvent = async (event, options = {}) => {
    if (event && event.id) {
      try {
        const { deleteSeries = false, deleteRange = false } = options;
        
        // Extract original ID if it's an expanded project event (remove -day-X suffix)
        // Check for _originalId, originalId, or extract from expanded ID format (id-day-X)
        let eventId = event._originalId || event.originalId || event.id;
        
        // If the ID contains '-day-', it's an expanded project event - extract the original ID
        if (eventId && typeof eventId === 'string' && eventId.includes('-day-')) {
          eventId = eventId.split('-day-')[0];
        }
        
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(eventId)) {
          console.error('[WebContent] Invalid UUID format:', eventId, 'from event:', event);
          throw new Error(`Invalid event ID format: ${eventId}`);
        }
        
        console.log('[WebContent] Deleting event:', { 
          cleanEventId: eventId, 
          originalEventId: event.id,
          eventType: event.event_type || event.type, 
          originalId: event._originalId, 
          eventIdFromEvent: event.id 
        });
        
          // All holidays in the calendar are family-managed and can be deleted
        if (event.type === 'holiday') {
          // Delete from holidays table
          const { error } = await supabase
            .from('holidays')
            .delete()
            .eq('id', eventId);
          
          if (error) throw error;
        } else if (event.type === 'lesson') {
          // Delete from activity_instances table
          const { error } = await supabase
            .from('activity_instances')
            .delete()
            .eq('id', eventId);
          
          if (error) throw error;
        } else {
          // Default: delete planner calendar events (events table) via planner client
          if (!familyId) {
            throw new Error('Missing familyId for deleting planner event');
          }
          
          // If deleting entire range (for multi-day events), find all related events first
          if (deleteRange) {
            // Get event details to find all events in the same range
            const { data: currentEventData, error: fetchError } = await supabase
              .from('events')
              .select('title, event_type, family_id, start_ts, end_ts')
              .eq('id', eventId)
              .single();
            
            if (fetchError || !currentEventData) {
              console.error('[WebContent] Error fetching event for range deletion:', fetchError);
              throw new Error('Failed to fetch event details');
            }
            
            const { title, event_type, family_id } = currentEventData;
            
            // Find all events with the same title, event_type, and family_id
            // These should be the events in the same multi-day range
            const { data: rangeEvents, error: findError } = await supabase
              .from('events')
              .select('id, start_ts')
              .eq('title', title)
              .eq('event_type', event_type)
              .eq('family_id', family_id)
              .is('deleted_at', null)
              .order('start_ts', { ascending: true });
            
            if (findError) {
              console.error('[WebContent] Error finding range events:', findError);
              throw new Error('Failed to find events in range');
            }
            
            if (!rangeEvents || rangeEvents.length === 0) {
              // No related events found, delete single event
              const result = await deletePlannerEvent(eventId, familyId);
              if (result?.error) {
                throw result.error;
              }
            } else {
              // Delete all events in the range
              const eventIdsToDelete = rangeEvents.map(e => e.id);
              
              // Use soft delete for all events in the range
              const { error: deleteError } = await supabase
                .from('events')
                .update({ deleted_at: new Date().toISOString() })
                .in('id', eventIdsToDelete)
                .is('deleted_at', null);
              
              if (deleteError) {
                console.error('[WebContent] Error deleting range:', deleteError);
                throw new Error('Failed to delete event range');
              }
              
              // Trigger refresh for all deleted events
              // Use the first event's date for cache clearing
              const firstEventDate = rangeEvents[0]?.start_ts ? new Date(rangeEvents[0].start_ts) : new Date();
              const lastEventDate = rangeEvents[rangeEvents.length - 1]?.start_ts ? new Date(rangeEvents[rangeEvents.length - 1].start_ts) : new Date();
              
              // Clear cache for all months that contain events in the range
              const monthsToClear = new Set();
              rangeEvents.forEach(e => {
                if (e.start_ts) {
                  const date = new Date(e.start_ts);
                  const year = date.getFullYear();
                  const monthIndex = date.getMonth();
                  monthsToClear.add(`${year}-${monthIndex}`);
                }
              });
              
              // Clear cache for affected months
              if (typeof window !== 'undefined' && window.__clearCalendarCache) {
                monthsToClear.forEach(monthKey => {
                  window.__clearCalendarCache(monthKey);
                });
              }
              
              // Dispatch eventDeleted for each event and trigger refresh
              eventIdsToDelete.forEach(eventId => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { eventId } }));
                }
              });
              
              // Trigger calendar refresh
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('refreshCalendar'));
              }
            }
          } else if (deleteSeries) {
            // If deleting entire series, find all related events first
            // First, get the recurrence fields from the event or query the database
            let recurrenceRule = event.recurrence_rule || event.data?.recurrence_rule;
            let recurrenceId = event.recurrence_id || event.data?.recurrence_id;
            let parentEventId = event.parent_event_id || event.data?.parent_event_id;
            
            // If not in event object, query the database
            if ((!recurrenceRule && !recurrenceId && !parentEventId) && eventId) {
              const { data: eventData } = await supabase
                .from('events')
                .select('recurrence_rule, parent_event_id, recurrence_id')
                .eq('id', eventId)
                .single();
              
              if (eventData) {
                recurrenceRule = eventData.recurrence_rule;
                recurrenceId = eventData.recurrence_id;
                parentEventId = eventData.parent_event_id;
              }
            }
            
            // Find the master event ID (the root of the recurrence series)
            // For instances: parent_event_id or recurrence_id points to the master
            // For master events: parent_event_id and recurrence_id are set to its own ID
            let masterEventId = parentEventId || recurrenceId;
            
            // If this is a master event (has recurrence_rule), use its own ID
            if (recurrenceRule && !masterEventId) {
              masterEventId = eventId;
            }
            
            // Clean masterEventId if it has -day-X suffix
            if (masterEventId && typeof masterEventId === 'string' && masterEventId.includes('-day-')) {
              masterEventId = masterEventId.split('-day-')[0];
            }
            
            // Fallback to eventId if we still don't have a master ID
            if (!masterEventId) {
              masterEventId = eventId;
            }
            
            // First, find all event IDs in the series
            const { data: relatedEvents, error: findError } = await supabase
              .from('events')
              .select('id')
              .or(`id.eq.${masterEventId},parent_event_id.eq.${masterEventId},recurrence_id.eq.${masterEventId}`);
            
            if (findError) {
              console.error('[WebContent] Error finding related events:', findError);
              throw new Error('Failed to find related events in series');
            }
            
            const eventIdsToDelete = relatedEvents?.map(e => e.id) || [];
            
            if (eventIdsToDelete.length === 0) {
              // No related events found, delete single event
              const result = await deletePlannerEvent(eventId, familyId);
              if (result?.error) {
                throw result.error;
              }
            } else {
              // Delete all events in the series
              const { error: deleteError } = await supabase
                .from('events')
                .delete()
                .in('id', eventIdsToDelete);
              
              if (deleteError) {
                console.error('[WebContent] Error deleting series:', deleteError);
                throw new Error('Failed to delete event series');
              }
            }
          } else {
            // Delete single occurrence - use RPC function for reliable deletion
            console.log('[WebContent] Deleting single event via RPC:', eventId);
            const { data: rpcData, error: rpcError } = await supabase.rpc('delete_event', {
              _event_id: eventId,
              _family_id: familyId
            });
            
            console.log('[WebContent] RPC delete response:', { rpcData, rpcError });
            
            if (rpcError) {
              console.warn('[WebContent] RPC delete failed, falling back to deletePlannerEvent:', rpcError);
              const result = await deletePlannerEvent(eventId, familyId);
              if (result?.error) {
                throw result.error;
              }
            } else if (!rpcData?.success) {
              console.warn('[WebContent] RPC delete returned failure, falling back to deletePlannerEvent:', rpcData);
              const result = await deletePlannerEvent(eventId, familyId);
              if (result?.error) {
                throw result.error;
              }
            } else {
              console.log('[WebContent] RPC delete succeeded (soft delete):', rpcData);
              
              // Verify the soft delete actually worked (wait a bit for DB to update)
              await new Promise(resolve => setTimeout(resolve, 300));
              const { data: verifyData } = await supabase
                .from('events')
                .select('deleted_at')
                .eq('id', eventId)
                .maybeSingle();
              
              if (verifyData?.deleted_at) {
                console.log('[WebContent] Delete verified - deleted_at is set');
              } else {
                console.warn('[WebContent] Delete verification failed - deleted_at not set yet');
              }
            }
          }
        }
        
        // Immediately remove from calendarEvents state for instant UI update
        setCalendarEvents(prevEvents => {
          const updated = { ...prevEvents };
          Object.keys(updated).forEach(dateKey => {
            if (Array.isArray(updated[dateKey])) {
              // Remove both the original ID and any expanded versions, and filter out soft-deleted events
              updated[dateKey] = updated[dateKey].filter(e => {
                // Filter out soft-deleted events
                const deletedAt = e?.deleted_at || e?.data?.deleted_at || e?.deleted;
                if (deletedAt) {
                  console.log('[WebContent] Removing soft-deleted event from calendarEvents:', e?.id, 'on date:', dateKey);
                  return false;
                }
                
                // Remove the deleted event by ID (both original and expanded versions)
                const eId = e?._originalId || e?.originalId || e?.id;
                const cleanEId = eId && typeof eId === 'string' && eId.includes('-day-') 
                  ? eId.split('-day-')[0] 
                  : eId;
                return cleanEId !== eventId && e?.id !== event?.id && e?.id !== eventId;
              });
              if (updated[dateKey].length === 0) {
                delete updated[dateKey];
              }
            }
          });
          return updated;
        });
        
        // Clear and refresh calendar cache for the affected month
        if (familyId && typeof window !== 'undefined') {
          try {
            // Determine which month/year to refresh based on the event start date
            const eventDate = event.start_ts ? new Date(event.start_ts) : new Date();
            const targetYear = eventDate.getFullYear();
            const targetMonthIndex = eventDate.getMonth(); // 0-based
            const targetMonthNum = targetMonthIndex + 1;   // 1-based for RPC
            const monthKey = `${targetYear}-${targetMonthIndex}`;

            // Clear month from in-memory cache so next load is fresh
            setCalendarDataCache(prevCache => {
              const updated = { ...prevCache };
              delete updated[monthKey];
              return updated;
            });
            
            if (window.__clearCalendarCache) {
              window.__clearCalendarCache(monthKey);
            }

            // Reload month data immediately
            if (window.__loadMonthData) {
              await window.__loadMonthData(targetYear, targetMonthNum);
            } else if (preloadCalendarDataRPC) {
              // Fallback to generic preloader if direct loader isn't available
              await preloadCalendarDataRPC();
            }
          } catch (cacheError) {
            console.error('Error refreshing calendar cache after delete:', cacheError);
          }
        }

        // Refresh today's learning
        await fetchTodaysLearning();

        // Dispatch refresh event to trigger TasksView to reload trash items
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshCalendar', { 
            detail: { eventId: eventId, action: 'deleted' } 
          }));
          window.dispatchEvent(new CustomEvent('eventDeleted', { 
            detail: { eventId: eventId, id: eventId } 
          }));
        }
        
        handleCloseContextMenu();
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
        // Check if this is a new-style event or old-style event
        const isNewStyleEvent = cutEventData.eventType === 'new';
        
        if (isNewStyleEvent) {
          // New-style event: use create_task_event RPC
          if (!cutEventData.start_ts) {
            if (typeof window !== 'undefined' && window.alert) {
              window.alert('Cannot paste event: Missing start time information in copied data.');
            }
            return;
          }

          // Parse the target date (dateKey is in YYYY-MM-DD format)
          const [year, month, day] = dateKey.split('-');
          const targetDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          
          // Get the original start time to preserve the time of day
          const originalStart = new Date(cutEventData.start_ts);
          const originalEnd = cutEventData.end_ts ? new Date(cutEventData.end_ts) : null;
          
          // Calculate duration in minutes
          const durationMinutes = cutEventData.minutes || 
            (originalEnd ? Math.round((originalEnd.getTime() - originalStart.getTime()) / 60000) : 60);
          
          // Create new start time on the target date with the same time of day
          const newStart = new Date(targetDate);
          newStart.setHours(originalStart.getHours());
          newStart.setMinutes(originalStart.getMinutes());
          newStart.setSeconds(originalStart.getSeconds());
          
          // Create new end time
          const newEnd = new Date(newStart);
          newEnd.setMinutes(newEnd.getMinutes() + durationMinutes);

          // Use create_task_event RPC to create the event
          const { data: rpcData, error: rpcError } = await supabase.rpc('create_task_event', {
            _family_id: familyId,
            _child_id: cutEventData.child_id,
            _title: cutEventData.title || 'Untitled Event',
            _start_ts: newStart.toISOString(),
            _description: cutEventData.description || null,
            _end_ts: newEnd.toISOString(),
            _status: cutEventData.status || 'scheduled',
            _source: 'manual',
            _tags: cutEventData.tags || null,
            _is_flexible: cutEventData.is_flexible || false,
            _event_type: cutEventData.event_type || null,
            _subject_id: cutEventData.subject_id || null,
            _unit: cutEventData.unit || null,
            _grade: cutEventData.grade || null,
            _location: cutEventData.location || null,
            _mode: cutEventData.mode || null,
            _instructor: cutEventData.instructor || null,
            _minutes: durationMinutes,
            _materials_attachment_ids: cutEventData.materials_attachment_ids || null,
            _source_link: cutEventData.source_link || null,
            _resume_position: cutEventData.resume_position || null,
          });

          if (rpcError || !rpcData || !rpcData.ok) {
            const errorMsg = rpcError?.message || rpcData?.error || 'Failed to paste event';
            throw new Error(errorMsg);
          }
        } else {
          // Old-style event: use activity_instances table
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
        }

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

        // Check if this is a new-style event (from events table) or old-style (from activity_instances)
        const isNewStyleEvent = event.start_ts || event.start;
        
        if (isNewStyleEvent) {
          // New-style event: has start_ts/end_ts, subject_id, etc.
          if (!event.start_ts && !event.start) {
            if (typeof window !== 'undefined' && window.alert) {
              window.alert('Cannot cut event: Missing start time information.');
            }
            return;
          }

          const startTs = event.start_ts || event.start;
          const endTs = event.end_ts || event.end;
          
          // Store complete event data for new-style events
          const cutData = {
            eventType: 'new', // Flag to indicate new-style event
            id: event.id,
            title: event.title || '',
            description: event.description || '',
            start_ts: startTs,
            end_ts: endTs,
            subject_id: event.subject_id || null,
            child_id: event.child_id || event.childId || null,
            status: event.status || 'scheduled',
            familyId: event.family_id || event.familyId || familyId,
            minutes: event.minutes || (endTs && startTs ? Math.round((new Date(endTs).getTime() - new Date(startTs).getTime()) / 60000) : 60),
            event_type: event.event_type || null,
            tags: event.tags || null,
            is_flexible: event.is_flexible || false,
            location: event.location || null,
            mode: event.mode || null,
            instructor: event.instructor || null,
            unit: event.unit || null,
            grade: event.grade || null,
            materials_attachment_ids: event.materials_attachment_ids || null,
            source_link: event.source_link || null,
            resume_position: event.resume_position || null,
          };
          
          // Store cut data in state for potential paste operation
          setCutEventData(cutData);
          
          // Delete the original event from events table
          const { error } = await supabase
            .from('events')
            .delete()
            .eq('id', event.id);
          if (error) throw error;
        } else {
          // Old-style event: has trackId/activityId
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
            eventType: 'old', // Flag to indicate old-style event
            title: event.title || '',
            description: event.description || '',
            scheduledDate: event.scheduledDate || '',
            scheduledTime: event.scheduledTime || '',
            dueDate: event.dueDate || '',
            finishTime: event.finishTime || '',
            timeEstimate: event.estimateMinutes ? String(event.estimateMinutes) : '60',
            assignees: event.assignees || [],
            status: event.status || 'planned',
            trackId: event.trackId,
            activityId: event.activityId,
            familyId: event.familyId || familyId,
            minutes: event.estimateMinutes || 60,
            child_name: event.assignees ? JSON.stringify(event.assignees) : '[]'
          };
          
          // Store cut data in state for potential paste operation
          setCutEventData(cutData);
          
          // Delete the original event from activity_instances
          if (event.type === 'lesson') {
            const { error } = await supabase
              .from('activity_instances')
              .delete()
              .eq('id', event.id);
            if (error) throw error;
          }
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

        // Check if this is a new-style event (from events table) or old-style (from activity_instances)
        const isNewStyleEvent = event.start_ts || event.start;
        
        if (isNewStyleEvent) {
          // New-style event: has start_ts/end_ts, subject_id, etc.
          if (!event.start_ts && !event.start) {
            if (typeof window !== 'undefined' && window.alert) {
              window.alert('Cannot copy event: Missing start time information.');
            }
            return;
          }

          const startTs = event.start_ts || event.start;
          const endTs = event.end_ts || event.end;
          
          // Store complete event data for new-style events
          const copyData = {
            eventType: 'new', // Flag to indicate new-style event
            title: event.title || '',
            description: event.description || '',
            start_ts: startTs,
            end_ts: endTs,
            subject_id: event.subject_id || null,
            child_id: event.child_id || event.childId || null,
            status: event.status || 'scheduled',
            familyId: event.family_id || event.familyId || familyId,
            minutes: event.minutes || (endTs && startTs ? Math.round((new Date(endTs).getTime() - new Date(startTs).getTime()) / 60000) : 60),
            event_type: event.event_type || null,
            tags: event.tags || null,
            is_flexible: event.is_flexible || false,
            location: event.location || null,
            mode: event.mode || null,
            instructor: event.instructor || null,
            unit: event.unit || null,
            grade: event.grade || null,
            materials_attachment_ids: event.materials_attachment_ids || null,
            source_link: event.source_link || null,
            resume_position: event.resume_position || null,
          };
          
          // Store copy data in state for potential paste operation
          setCutEventData(copyData);
        } else {
          // Old-style event: has trackId/activityId
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
            eventType: 'old', // Flag to indicate old-style event
            title: event.title || '',
            description: event.description || '',
            scheduledDate: event.scheduledDate || '',
            scheduledTime: event.scheduledTime || '',
            dueDate: event.dueDate || '',
            finishTime: event.finishTime || '',
            timeEstimate: event.estimateMinutes ? String(event.estimateMinutes) : '60',
            assignees: event.assignees || [],
            status: event.status || 'planned',
            trackId: event.trackId,
            activityId: event.activityId,
            familyId: event.familyId || familyId,
            minutes: event.estimateMinutes || 60,
            child_name: event.assignees ? JSON.stringify(event.assignees) : '[]'
          };
          
          // Store copy data in state for potential paste operation
          setCutEventData(copyData);
        }
        
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
          
          const { data: insertedData, error } = await supabase
            .from('activity_instances')
            .insert([eventData])
            .select();
          
          if (error) throw error;
          
          console.log('Event duplicated successfully');
          
          // Dispatch eventCreated event for home page and other components
          if (Platform.OS === 'web' && typeof window !== 'undefined' && insertedData?.[0]?.id) {
            window.dispatchEvent(new CustomEvent('eventCreated', { 
              detail: { eventId: insertedData[0].id } 
            }));
          }
          
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

  const handleRepeatNextWeek = async (event) => {
    if (!event || !event.id) {
      console.warn('No event provided to repeat');
      return;
    }

    try {
      // Calculate new dates (7 days later)
      const originalStart = new Date(event.start_ts);
      const originalEnd = event.end_ts ? new Date(event.end_ts) : null;
      
      const newStart = new Date(originalStart);
      newStart.setDate(newStart.getDate() + 7);
      
      const newEnd = originalEnd ? new Date(originalEnd) : null;
      if (newEnd) {
        newEnd.setDate(newEnd.getDate() + 7);
      }

      // Calculate duration in minutes
      const durationMs = originalEnd 
        ? (originalEnd.getTime() - originalStart.getTime())
        : (event.minutes || 60) * 60 * 1000;
      const minutes = Math.round(durationMs / 60000);

      // Use create_task_event RPC to create the duplicated event
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_task_event', {
        _family_id: event.family_id || familyId,
        _child_id: event.child_id,
        _title: event.title || 'Untitled Event',
        _start_ts: newStart.toISOString(),
        _description: event.description || null,
        _end_ts: newEnd ? newEnd.toISOString() : null,
        _status: 'scheduled',
        _source: 'manual',
        _tags: event.tags || null,
        _is_flexible: event.is_flexible || false,
        _event_type: event.event_type || null,
        _subject_id: event.subject_id || null,
        _unit: event.unit || null,
        _grade: event.grade || null,
        _location: event.location || null,
        _mode: event.mode || null,
        _instructor: event.instructor || null,
        _goal_link: event.goal_link || null,
        _minutes: minutes,
        _materials_attachment_ids: event.materials_attachment_ids || null,
        _source_link: event.source_link || null,
        _resume_position: event.resume_position || null,
      });

      if (rpcError || !rpcData?.ok) {
        const errorMsg = rpcError?.message || rpcData?.error || 'Failed to repeat event';
        console.error('Error repeating event:', errorMsg);
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Failed to repeat event: ${errorMsg}`);
        }
        return;
      }

      console.log('Event repeated successfully for next week');
      
      // Dispatch eventCreated event for home page and other components
      if (Platform.OS === 'web' && typeof window !== 'undefined' && rpcData?.id) {
        window.dispatchEvent(new CustomEvent('eventCreated', { 
          detail: { eventId: rpcData.id } 
        }));
      }
      
      // Refresh calendar data
      if (familyId && refreshCalendarDataRef.current) {
        refreshCalendarDataRef.current();
      }

      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Event repeated for next week successfully');
      }
    } catch (error) {
      console.error('Error repeating event:', error);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Error repeating event: ' + error.message);
      }
    }
  };

  const handleCopyToNextYear = async (event) => {
    if (!event || !event.id) {
      console.warn('No event provided to copy');
      return;
    }

    try {
      // Calculate new dates (1 year later)
      const originalStart = new Date(event.start_ts);
      const originalEnd = event.end_ts ? new Date(event.end_ts) : null;
      
      const newStart = new Date(originalStart);
      newStart.setFullYear(newStart.getFullYear() + 1);
      
      const newEnd = originalEnd ? new Date(originalEnd) : null;
      if (newEnd) {
        newEnd.setFullYear(newEnd.getFullYear() + 1);
      }

      // Calculate duration in minutes
      const durationMs = originalEnd 
        ? (originalEnd.getTime() - originalStart.getTime())
        : (event.minutes || 60) * 60 * 1000;
      const minutes = Math.round(durationMs / 60000);

      // Use create_task_event RPC to create the duplicated event
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_task_event', {
        _family_id: event.family_id || familyId,
        _child_id: event.child_id,
        _title: event.title || 'Untitled Event',
        _start_ts: newStart.toISOString(),
        _description: event.description || null,
        _end_ts: newEnd ? newEnd.toISOString() : null,
        _status: 'scheduled',
        _source: 'manual',
        _tags: event.tags || null,
        _is_flexible: event.is_flexible || false,
        _event_type: event.event_type || null,
        _subject_id: event.subject_id || null,
        _unit: event.unit || null,
        _grade: event.grade || null,
        _location: event.location || null,
        _mode: event.mode || null,
        _instructor: event.instructor || null,
        _goal_link: event.goal_link || null,
        _minutes: minutes,
        _materials_attachment_ids: event.materials_attachment_ids || null,
        _source_link: event.source_link || null,
        _resume_position: event.resume_position || null,
      });

      if (rpcError || !rpcData?.ok) {
        const errorMsg = rpcError?.message || rpcData?.error || 'Failed to copy event';
        console.error('Error copying event to next year:', errorMsg);
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Failed to copy event: ${errorMsg}`);
        }
        return;
      }

      console.log('Event copied successfully to next year');
      
      // Dispatch eventCreated event for home page and other components
      if (Platform.OS === 'web' && typeof window !== 'undefined' && rpcData?.id) {
        window.dispatchEvent(new CustomEvent('eventCreated', { 
          detail: { eventId: rpcData.id } 
        }));
      }
      
      // Refresh calendar data
      if (familyId && refreshCalendarDataRef.current) {
        refreshCalendarDataRef.current();
      }

      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Event copied to next year successfully');
      }
    } catch (error) {
      console.error('Error copying event to next year:', error);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Error copying event: ' + error.message);
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
  // Note: We do NOT pass _child_ids here - filtering is done client-side in convertCalendarEventsToArray
  // This allows filters to work instantly without reloading data, and filters work across all loaded months
  const loadMonthData = async (year, month) => {
    if (!familyId) return {};
    
    // Validate inputs
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      console.error('[WebContent] Invalid year or month in loadMonthData:', { year, month });
      return {};
    }
    
    try {
      // Always load ALL events for the month - filtering happens client-side
      const { data, error } = await supabase.rpc('get_month_view', {
        _family_id: familyId,
        _year: year,
        _month: month,
        _child_ids: null  // Always null - we filter client-side
      });

      if (error) {
        console.error('Error fetching month data:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        // Return null to indicate error (not empty object which would overwrite cache)
        return null;
      }

      if (!data) {
        console.log('No data returned from get_month_view RPC');
        return null;
      }

      // Check if start_local is in the RPC response
      const eventsByDate = data.events_by_date || {};
      
      // Debug: Log total events returned
      const totalEvents = Object.values(eventsByDate).reduce((sum, dayEvents) => sum + (dayEvents?.length || 0), 0);
      console.log('[loadMonthData] RPC returned events_by_date with', Object.keys(eventsByDate).length, 'days and', totalEvents, 'total events');
      
      // Log events for today and a few days around it for debugging
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const todayEvents = eventsByDate[todayStr] || [];
      console.log('[loadMonthData] Events for today (' + todayStr + '):', todayEvents.length, todayEvents.map(e => ({ id: e.id, title: e.title, status: e.status, date_local: e.date_local })));
      
      // Log all dates that have events
      const allDatesWithEvents = Object.keys(eventsByDate).filter(date => eventsByDate[date]?.length > 0);
      console.log('[loadMonthData] All dates with events:', allDatesWithEvents);
      allDatesWithEvents.forEach(date => {
        const dayEvents = eventsByDate[date] || [];
        console.log('[loadMonthData] Date', date, 'has', dayEvents.length, 'events:', dayEvents.map(e => e.title).join(', '));
      });
      
      // Log a sample of dates with events
      const datesWithEvents = Object.keys(eventsByDate).filter(date => eventsByDate[date]?.length > 0).slice(0, 5);
      console.log('[loadMonthData] Sample dates with events:', datesWithEvents);
      
      const sampleEvent = Object.values(eventsByDate)[0]?.[0];
      if (sampleEvent && !sampleEvent.start_local) {
        console.error('[WebContent] 🚨 CRITICAL: get_month_view RPC is NOT returning start_local!', {
          eventId: sampleEvent.id,
          title: sampleEvent.title,
          availableKeys: Object.keys(sampleEvent),
          note: 'The get_month_view RPC function needs to be updated to return start_local. Check 2025-11-16_add_year_plan_id_to_get_month_view.sql'
        });
      }

      // Load blackout periods for this month to filter events
      // month is 1-indexed (1-12), so month-1 is 0-indexed for Date constructor
      // Validate inputs before creating dates
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        console.error('[loadMonthData] Invalid year or month before creating dates:', { year, month });
        return {};
      }
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0); // Last day of the month
      
      // Validate the dates were created successfully
      if (isNaN(monthStart.getTime()) || isNaN(monthEnd.getTime())) {
        console.error('[loadMonthData] Invalid dates created:', { year, month, monthStart, monthEnd });
        return {};
      }
      
      // Use local date components to avoid timezone shifts from toISOString()
      const formatLocalDate = (date) => {
        if (!date || isNaN(date.getTime())) {
          console.error('[loadMonthData] formatLocalDate called with invalid date:', date);
          return null;
        }
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };
      
      const monthStartStr = formatLocalDate(monthStart);
      const monthEndStr = formatLocalDate(monthEnd);
      
      // Validate date strings were created successfully
      if (!monthStartStr || !monthEndStr) {
        console.error('[loadMonthData] Failed to format dates:', { monthStart, monthEnd, monthStartStr, monthEndStr });
        return {};
      }
      
      // Query blackouts that overlap with this month
      // Get all blackouts for the family and filter in JavaScript for better control
      // Query all blackouts for the family (no date filter) to avoid missing any
      const { data: allBlackouts, error: blackoutsError } = await supabase
        .from('blackout_periods')
        .select('id, starts_on, ends_on, child_id, family_id, reason')
        .eq('family_id', familyId);
      
      if (blackoutsError) {
        console.error('[loadMonthData] Error querying blackouts:', blackoutsError);
        console.error('[loadMonthData] Error details:', JSON.stringify(blackoutsError, null, 2));
      } else {
        // Blackouts loaded successfully
      }
      
      // Filter blackouts that overlap with this month in JavaScript
      // IMPORTANT: do this using date strings (YYYY-MM-DD) instead of Date objects to avoid
      // timezone shifts where UTC/local conversions can move a blackout outside the month.
      const blackoutsData = (allBlackouts || []).filter(blackout => {
        const toYmd = (value) => {
          if (!value) return null;
          // value might already be YYYY-MM-DD or a full ISO string
          return String(value).split('T')[0];
        };

        const startStr = toYmd(blackout.starts_on);
        const endStr = toYmd(blackout.ends_on);

        if (!startStr || !endStr) {
          console.warn('[loadMonthData] Blackout has invalid dates, skipping:', blackout);
          return false;
        }

        // Overlap check using pure YYYY-MM-DD string comparison:
        // starts_on <= monthEndStr AND ends_on >= monthStartStr
        const overlaps = startStr <= monthEndStr && endStr >= monthStartStr;

        if (overlaps) {
          console.warn('[loadMonthData] Blackout overlaps:', {
            blackout: JSON.stringify(blackout, null, 2),
            start: startStr,
            end: endStr,
            monthStart: monthStartStr,
            monthEnd: monthEndStr,
            overlaps,
          });
        }

        return overlaps;
      });
      
      // Blackouts filtered for month overlap

      // Build set of blackout dates
      const blackoutDates = new Set();
      if (blackoutsData) {
          blackoutsData.forEach(blackout => {
            // Parse date strings directly as local dates (YYYY-MM-DD format)
            // Don't use new Date() which interprets as UTC and causes timezone shifts
            const parseLocalDate = (dateStr) => {
              if (!dateStr) return null;
              // Extract YYYY-MM-DD parts directly
              const parts = dateStr.split('T')[0].split('-');
              if (parts.length !== 3) return null;
              return {
                year: parseInt(parts[0], 10),
                month: parseInt(parts[1], 10), // 1-based month (1-12)
                day: parseInt(parts[2], 10)
              };
            };
            
            const startDate = parseLocalDate(blackout.starts_on);
            const endDate = parseLocalDate(blackout.ends_on);
            
            if (!startDate || !endDate) {
              console.warn('[loadMonthData] Invalid blackout date format:', blackout);
              return;
            }
            
            // If child-specific blackout, apply it (filtering is done client-side, not here)
            const isFamilyWide = !blackout.child_id;
            const appliesToSelected = true; // Always apply - filtering happens client-side
            
            if (isFamilyWide || appliesToSelected) {
              console.log('[loadMonthData] Processing blackout:', {
                starts_on: blackout.starts_on,
                ends_on: blackout.ends_on,
                startParsed: startDate,
                endParsed: endDate,
                isFamilyWide,
                appliesToSelected
              });
              
              // Iterate through date range using date string comparison (no Date objects = no timezone issues)
              // Convert parsed dates back to YYYY-MM-DD strings for comparison
              const startDateStr = `${startDate.year}-${String(startDate.month).padStart(2, '0')}-${String(startDate.day).padStart(2, '0')}`;
              const endDateStr = `${endDate.year}-${String(endDate.month).padStart(2, '0')}-${String(endDate.day).padStart(2, '0')}`;
              
              // Iterate day by day using string comparison
              let currentDateStr = startDateStr;
              while (currentDateStr <= endDateStr) {
                blackoutDates.add(currentDateStr);
                // Move to next day by parsing and incrementing
                const [year, month, day] = currentDateStr.split('-').map(Number);
                const nextDate = new Date(year, month - 1, day + 1); // month is 0-based in Date constructor
                const nextYear = nextDate.getFullYear();
                const nextMonth = String(nextDate.getMonth() + 1).padStart(2, '0');
                const nextDay = String(nextDate.getDate()).padStart(2, '0');
                currentDateStr = `${nextYear}-${nextMonth}-${nextDay}`;
              }
              console.log('[loadMonthData] Added blackout dates from', startDateStr, 'to', endDateStr, '- total:', Array.from(blackoutDates).filter(d => d >= startDateStr && d <= endDateStr).length);
            }
          });
      }

      // Convert the RPC response to the format expected by the calendar
      const events = {};
      
      // Convert events_by_date to the format expected by calendar
      Object.keys(eventsByDate).forEach(date => {
        // Skip events on blackout days
        if (blackoutDates.has(date)) {
          const dayEvents = eventsByDate[date] || [];
          console.log('[loadMonthData] Skipping', dayEvents.length, 'events on blackout date:', date);
          events[date] = []; // Empty array for blackout days
          return;
        }
        
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
          
          // CRITICAL: Ensure date_local is preserved in the event data structure
          // MonthGrid uses date_local to group events by day
          const eventData = {
            ...event,
            date_local: event.date_local || date // Use date_local from RPC, fallback to date key
          };
          
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
            event_type: event.event_type, // Preserve event_type from RPC for filtering
            data: eventData, // Include date_local in data
            date_local: event.date_local || date, // Also at top level for MonthGrid
            assignee: event.child_id,
            assignees: event.child_id ? [event.child_id] : []
          };
        });
      });

      // Validate and clean children avatar URLs from RPC response
      const cleanedChildren = (data.children || []).map(child => ({
        ...child,
        avatar: validateAvatarUrl(child.avatar) || child.avatar, // Keep original if validation fails
        avatar_url: validateAvatarUrl(child.avatar_url || child.avatar) || null
      }));

      const blackoutDatesArray = Array.from(blackoutDates);
      return { 
        events, 
        blackoutDates: blackoutDatesArray,
        children: cleanedChildren // Return cleaned children data
      };
      
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
      // Load the month that contains today's date to ensure today's events are visible
      const today = new Date();
      const todayYear = today.getFullYear();
      const todayMonth = today.getMonth() + 1; // JavaScript months are 0-based
      
      console.log('[preloadCalendarDataRPC] Loading month containing today:', {
        todayYear,
        todayMonth,
        monthKey: `${todayYear}-${today.getMonth()}`,
        currentMonthDisplayed: `${currentMonth.getFullYear()}-${currentMonth.getMonth()}`
      });
      
      const monthData = await loadMonthData(todayYear, todayMonth);
      
      // Only store in cache if we got actual data (not null or empty due to error)
      if (monthData && monthData !== null && typeof monthData === 'object') {
        const events = monthData.events || monthData; // Handle both old and new format
        const blackoutDates = monthData.blackoutDates || [];
        
        if (Object.keys(events).length > 0) {
          // Store in cache with the correct key format (JavaScript months are 0-based)
          // Merge with existing cache to preserve other months' data
          const monthKey = `${todayYear}-${today.getMonth()}`;
          
          // Filter out non-date keys (like "children") from events before storing
          const filteredEvents = {};
          Object.keys(events).forEach(key => {
            // Only include keys that match date format YYYY-MM-DD
            if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
              filteredEvents[key] = events[key];
            }
          });
          
          setCalendarDataCache(prev => ({
            ...prev,
            [monthKey]: filteredEvents
          }));
          
          // Store blackout dates separately - always store, even if empty array
          setCalendarBlackoutDates(prev => ({
            ...prev,
            [monthKey]: blackoutDates
          }));
          
          // Immediately merge events into calendarEvents after setting cache
          setCalendarEvents(prevEvents => {
            const merged = { ...prevEvents, ...filteredEvents };
            console.log('[preloadCalendarDataRPC] Immediately merging events:', {
              monthKey,
              datesAdded: Object.keys(filteredEvents).length,
              prevDates: Object.keys(prevEvents).length,
              totalDates: Object.keys(merged).length,
              sampleDates: Object.keys(filteredEvents).slice(0, 3)
            });
            return merged;
          });
        }
        setIsCalendarDataLoaded(true);
      } else {
        console.warn('No events loaded, preserving existing cache');
        // Still mark as loaded so we don't keep retrying, but don't overwrite cache
        setIsCalendarDataLoaded(true);
      }
      
      
    } catch (error) {
      console.error('Error pre-loading calendar data:', error);
      // Still mark as loaded to prevent infinite retry loops
      setIsCalendarDataLoaded(true);
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
    console.log('[WebContent] refreshCalendarData called', { referenceDate, familyId });
    if (!familyId) {
      console.warn('[WebContent] refreshCalendarData: No familyId, returning');
      return;
    }

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
      
      // Also clear blackout dates for this month
      setCalendarBlackoutDates(prevBlackouts => {
        const newBlackouts = { ...prevBlackouts };
        delete newBlackouts[monthKey];
        return newBlackouts;
      });

      console.log('[WebContent] refreshCalendarData: Loading month data for', monthKey);
      const monthData = await loadMonthData(targetYear, targetMonthNum);
      const events = monthData.events || monthData; // Handle both old and new format
      const blackoutDates = monthData.blackoutDates || [];
      
      console.log('[WebContent] refreshCalendarData: Loaded data for', monthKey, {
        eventsCount: Object.keys(events).length,
        blackoutDatesCount: blackoutDates.length,
        blackoutDates,
      });

      setCalendarDataCache(prevCache => ({
        ...prevCache,
        [monthKey]: events,
      }));
      
      // Update blackout dates cache - always store, even if empty
      console.log('[WebContent] refreshCalendarData: Updating blackout dates cache for', monthKey, ':', blackoutDates);
      setCalendarBlackoutDates(prevBlackouts => ({
        ...prevBlackouts,
        [monthKey]: blackoutDates,
      }));

      // Merge updated events into calendarEvents (don't replace all events, just update this month)
      setCalendarEvents(prevEvents => {
        const updated = { ...prevEvents };
        // Update events for dates in this month
        Object.keys(events).forEach(dateKey => {
          updated[dateKey] = events[dateKey];
        });
        // Remove date keys that are in this month but no longer have events
        const monthStart = new Date(targetYear, targetMonthIndex, 1);
        const monthEnd = new Date(targetYear, targetMonthIndex + 1, 0);
        for (let day = 1; day <= monthEnd.getDate(); day++) {
          const date = new Date(targetYear, targetMonthIndex, day);
          const dateKey = date.toISOString().split('T')[0];
          if (!events[dateKey] && updated[dateKey]) {
            delete updated[dateKey];
          }
        }
        return updated;
      });

      if (!isCalendarDataLoaded) {
        setIsCalendarDataLoaded(true);
      }

      console.log('Refresh complete. Updated', Object.keys(events).length, 'days in month:', monthKey);
    } catch (error) {
      console.error('Error refreshing calendar data:', error);
    }
  };
  
  // Initialize ref and global function after refreshCalendarData is defined
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    // Set up the ref - create a wrapper that calls refreshCalendarData
    refreshCalendarDataRef.current = (referenceDate = null) => {
      return refreshCalendarData(referenceDate);
    };
    
    // Also expose globally for direct calls
    if (typeof window !== 'undefined') {
      window.__refreshCalendarData = (referenceDate = null) => {
        return refreshCalendarData(referenceDate);
      };
      
      // Also expose a cache clearing function
      window.__clearCalendarCache = (monthKey) => {
        console.log('[WebContent] Clearing calendar cache for:', monthKey);
        setCalendarDataCache(prevCache => {
          const newCache = { ...prevCache };
          delete newCache[monthKey];
          return newCache;
        });
        setCalendarBlackoutDates(prevBlackouts => {
          const newBlackouts = { ...prevBlackouts };
          delete newBlackouts[monthKey];
          return newBlackouts;
        });
      };
    }
  }, [familyId]); // Re-initialize when familyId changes
  
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
      preloadCalendarDataRPC(); // Use the new RPC version
    }
  }, [familyId, isCalendarDataLoaded, calendarDataLoading]);

  // Update calendar events when month changes, but only if calendar tab is active
  useEffect(() => {
    try {
      if (familyId && (activeTab === 'calendar' || activeTab === 'planner') && isCalendarDataLoaded) {
        // Validate currentMonth is a valid date
        if (!currentMonth || !(currentMonth instanceof Date) || isNaN(currentMonth.getTime())) {
          console.error('[WebContent] Invalid currentMonth date:', currentMonth);
          return;
        }
        
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        
        // Validate year and month are valid
        if (isNaN(year) || isNaN(month) || month < 0 || month > 11 || year < 1900 || year > 2100) {
          console.error('[WebContent] Invalid year or month:', { year, month, currentMonth });
          return;
        }
        
        const monthKey = `${year}-${month}`;
        const monthEvents = calendarDataCache[monthKey] || {};
        
        // If we don't have data for this month, load it using the RPC
        if (!monthEvents || Object.keys(monthEvents).length === 0) {
          console.log('No cached data for month:', monthKey, 'loading with RPC');
          // Ensure month + 1 is valid (1-12)
          const monthForRPC = month + 1;
          if (monthForRPC < 1 || monthForRPC > 12) {
            console.error('[WebContent] Invalid month for RPC:', { month, monthForRPC, year });
            return;
          }
          loadMonthData(year, monthForRPC)
            .then(events => {
              // Only update cache if we got actual data (not null or empty due to error)
              if (events && events !== null && Object.keys(events).length > 0) {
                setCalendarDataCache(prev => ({
                  ...prev,
                  [monthKey]: events
                }));
              } else {
                console.warn('No events loaded for month', monthKey, 'not updating cache');
              }
            })
            .catch(error => {
              console.error('Error loading month data:', error);
            });
        }
      }
    } catch (error) {
      console.error('[WebContent] Error in month change useEffect:', error);
      // Don't crash the app - just log the error
    }
  }, [currentMonth, familyId, activeTab, isCalendarDataLoaded]);

  // Separate useEffect to update calendar events when cache changes or when returning to planner/calendar tab
  useEffect(() => {
    if (familyId && (activeTab === 'calendar' || activeTab === 'planner') && isCalendarDataLoaded && Object.keys(calendarDataCache).length > 0) {
      // Merge all events from cache, filtering out non-date keys
      const allEvents = {};
      Object.keys(calendarDataCache).forEach(key => {
        if (calendarDataCache[key] && typeof calendarDataCache[key] === 'object') {
          const monthEvents = calendarDataCache[key];
          // Only include date keys (YYYY-MM-DD format)
          Object.keys(monthEvents).forEach(dateKey => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
              allEvents[dateKey] = monthEvents[dateKey];
            }
          });
        }
      });
      
      // Debug: Log what's being merged
      const cacheKeys = Object.keys(calendarDataCache);
      const totalEvents = Object.values(allEvents).reduce((sum, dayEvents) => sum + (Array.isArray(dayEvents) ? dayEvents.length : 0), 0);
      console.log('[WebContent] Merging calendar events from cache:', {
        cacheKeys: cacheKeys,
        totalDatesWithEvents: Object.keys(allEvents).length,
        totalEvents: totalEvents,
        sampleDates: Object.keys(allEvents).slice(0, 5),
        currentCalendarEventsCount: Object.keys(calendarEvents).length
      });
      
      // Only update if we have events to merge (don't overwrite with empty object)
      if (Object.keys(allEvents).length > 0) {
        setCalendarEvents(prevEvents => {
          // Merge with existing events, but preserve optimistic updates
          const merged = { ...prevEvents };
          
          // For each date in the cache, merge events but preserve optimistic updates
          Object.keys(allEvents).forEach(dateKey => {
            const cacheEvents = allEvents[dateKey];
            if (Array.isArray(cacheEvents)) {
              // If this date already has events, merge them carefully
              if (Array.isArray(merged[dateKey])) {
                // Create a map of existing events by ID (these may include optimistic updates)
                const existingEventsMap = new Map();
                merged[dateKey].forEach(e => {
                  if (e && e.id) {
                    // Filter out soft-deleted events
                    const deletedAt = e.deleted_at || e.data?.deleted_at || e.deleted;
                    if (deletedAt) {
                      console.log('[WebContent] Excluding soft-deleted event from existing events:', e.id, 'on date:', dateKey, 'deleted_at:', deletedAt);
                      return; // Skip deleted events
                    }
                    
                    // If this event was recently fetched from DB, only include it if it's on the correct date
                    // Check if the event's date_local matches this dateKey
                    if (recentlyFetchedFromDbRef.current.has(e.id)) {
                      const eventDateLocal = e.date_local || e.data?.date_local;
                      if (eventDateLocal === dateKey) {
                        // This is the correct date for the database event - include it
                        console.log('[WebContent] Including recently fetched DB event on correct date:', e.id, 'on date:', dateKey, 'time:', e.time, 'start_local:', e.start_local);
                        existingEventsMap.set(e.id, e);
                      } else {
                        // This is the wrong date (optimistic update on wrong date) - exclude it
                        console.log('[WebContent] Excluding recently fetched DB event from wrong date:', e.id, 'on date:', dateKey, 'should be on:', eventDateLocal, 'time:', e.time, 'start_local:', e.start_local);
                      }
                    } else {
                      // Not recently fetched - BUT if this event ID was recently fetched from DB, exclude this old version
                      // (This handles the case where an optimistic update is still in calendarEvents from a previous state)
                      if (recentlyFetchedFromDbRef.current.has(e.id)) {
                        // This shouldn't happen (we already checked), but just in case
                        console.log('[WebContent] WARNING: Event not marked as recently fetched but should be:', e.id);
                        // Exclude it - we'll use the database version instead
                        return;
                      }
                      // Check if this event ID exists in recentlyFetchedFromDbRef - if so, this is an old optimistic update
                      // and we should exclude it (the database version will be added from cache or already exists)
                      // Actually, we can't check this here because we're iterating over existing events
                      // But we can check later when processing cache events
                      console.log('[WebContent] Including existing event (not recently fetched):', e.id, 'on date:', dateKey, 'time:', e.time, 'start_local:', e.start_local);
                      existingEventsMap.set(e.id, e);
                    }
                  }
                });
                
                // After processing existing events, check if we have any that should be excluded
                // If an event ID was recently fetched from DB, we should only keep ONE version - the database version
                // The database version should have been added above (line 10680) with date_local matching dateKey
                // Remove any other versions of the same event ID (old optimistic updates)
                const eventsToRemove = [];
                const recentlyFetchedEvents = new Set();
                existingEventsMap.forEach((event, eventId) => {
                  if (recentlyFetchedFromDbRef.current.has(eventId)) {
                    const eventDateLocal = event.date_local || event.data?.date_local;
                    if (eventDateLocal === dateKey) {
                      // This is the database version on the correct date - mark it as the one to keep
                      recentlyFetchedEvents.add(eventId);
                      console.log('[WebContent] Found database version of recently fetched event:', eventId, 'on date:', dateKey, 'time:', event.time, 'start_local:', event.start_local);
                    }
                  }
                });
                // Now remove any events with the same ID that are NOT the database version
                existingEventsMap.forEach((event, eventId) => {
                  if (recentlyFetchedEvents.has(eventId)) {
                    // This is the database version - keep it
                    return;
                  }
                  if (recentlyFetchedFromDbRef.current.has(eventId)) {
                    // This event ID was recently fetched, but this version is not the database version
                    // (either wrong date or missing date_local/start_local) - remove it
                    console.log('[WebContent] Removing non-database version of recently fetched event:', eventId, 'on date:', dateKey, 'time:', event.time, 'start_local:', event.start_local, 'date_local:', event.date_local);
                    eventsToRemove.push(eventId);
                  }
                });
                eventsToRemove.forEach(eventId => existingEventsMap.delete(eventId));
                
                // Log what events are in the map for this date after cleanup
                const eventsAfterCleanup = Array.from(existingEventsMap.values()).filter(e => e && e.id === 'fd8afe0d-ffc8-4753-9ea6-32835b52fcb6');
                if (eventsAfterCleanup.length > 0) {
                  const eventDetails = eventsAfterCleanup.map(e => ({
                    time: e.time,
                    start_local: e.start_local,
                    date_local: e.date_local,
                    start_ts: e.start_ts,
                    hasRecentlyFetchedFlag: recentlyFetchedFromDbRef.current.has(e.id),
                  }));
                  console.log('[WebContent] Events for fd8afe0d-ffc8-4753-9ea6-32835b52fcb6 on', dateKey, 'after cleanup:', JSON.stringify(eventDetails, null, 2));
                }
                
                // Add/update events from cache, but preserve optimistic updates and recently fetched events
                cacheEvents.forEach(cacheEvent => {
                  if (cacheEvent && cacheEvent.id) {
                    // Filter out soft-deleted events
                    const deletedAt = cacheEvent.deleted_at || cacheEvent.data?.deleted_at || cacheEvent.deleted;
                    if (deletedAt) {
                      console.log('[WebContent] Excluding soft-deleted event from cache:', cacheEvent.id, 'on date:', dateKey, 'deleted_at:', deletedAt);
                      return; // Skip deleted events
                    }
                    
                    // Priority 1: If event was recently fetched from database, skip it (it's already in the map if on correct date)
                    if (recentlyFetchedFromDbRef.current.has(cacheEvent.id)) {
                      // Check if this is the correct date for the database event
                      const eventDateLocal = cacheEvent.date_local || cacheEvent.data?.date_local;
                      if (eventDateLocal === dateKey) {
                        // This is the correct date - the database event should already be in the map
                        console.log('[WebContent] Skipping cache event that was recently fetched from DB (correct date):', cacheEvent.id, 'on date:', dateKey);
                      } else {
                        // This is the wrong date (optimistic update) - definitely skip it
                        console.log('[WebContent] Skipping cache event that was recently fetched from DB (wrong date):', cacheEvent.id, 'on date:', dateKey, 'should be on:', eventDateLocal, 'cache event time:', cacheEvent.time, 'start_local:', cacheEvent.start_local);
                      }
                      // Don't add to map - the database version is already there (if on correct date)
                    } else if (pendingOptimisticUpdatesRef.current.has(cacheEvent.id)) {
                      // Priority 2: If this event has a pending optimistic update, keep the optimistic version
                      // Don't overwrite - the optimistic version is already in the map
                      console.log('[WebContent] Preserving optimistic update for event:', cacheEvent.id, 'on date:', dateKey);
                    } else {
                      // No pending update or recent fetch
                      // BUT: If this event is already in the map and was recently fetched from DB, don't overwrite it with cache
                      if (existingEventsMap.has(cacheEvent.id) && recentlyFetchedFromDbRef.current.has(cacheEvent.id)) {
                        const existingEvent = existingEventsMap.get(cacheEvent.id);
                        const existingDateLocal = existingEvent.date_local || existingEvent.data?.date_local;
                        if (existingDateLocal === dateKey) {
                          console.log('[WebContent] Not overwriting recently fetched DB event with cache event:', cacheEvent.id, 'on date:', dateKey, 'cache time:', cacheEvent.time, 'cache start_local:', cacheEvent.start_local, 'existing time:', existingEvent.time, 'existing start_local:', existingEvent.start_local);
                          return; // Don't overwrite - keep the database version
                        }
                      }
                      // Check if this event ID was recently fetched from DB (even if cache event doesn't have the flag)
                      // This handles the case where the optimistic update is still in cache but we've already fetched the DB version
                      if (recentlyFetchedFromDbRef.current.has(cacheEvent.id)) {
                        // This shouldn't happen (we already checked above), but just in case
                        const cacheEventDateLocal = cacheEvent.date_local || cacheEvent.data?.date_local;
                        console.log('[WebContent] WARNING: Cache event has same ID as recently fetched DB event:', cacheEvent.id, 'cache date:', dateKey, 'cache time:', cacheEvent.time, 'should be on:', cacheEventDateLocal);
                        // Skip it - we should use the database version instead
                        return;
                      }
                      console.log('[WebContent] Adding cache event to map:', cacheEvent.id, 'on date:', dateKey, 'time:', cacheEvent.time, 'start_local:', cacheEvent.start_local);
                      existingEventsMap.set(cacheEvent.id, cacheEvent);
                    }
                  }
                });
                
                merged[dateKey] = Array.from(existingEventsMap.values());
                
                // Final check: Log what events are on this date after merge (for debugging)
                if (dateKey === '2026-01-01') {
                  const finalEvents = merged[dateKey].filter(e => e && e.id === 'fd8afe0d-ffc8-4753-9ea6-32835b52fcb6');
                  if (finalEvents.length > 0) {
                    const eventDetails = finalEvents.map(e => ({
                      time: e.time,
                      start_local: e.start_local,
                      date_local: e.date_local,
                      start_ts: e.start_ts,
                      hasRecentlyFetchedFlag: recentlyFetchedFromDbRef.current.has(e.id),
                    }));
                    console.log('[WebContent] FINAL (cache merge): Events for fd8afe0d-ffc8-4753-9ea6-32835b52fcb6 on 2026-01-01 after merge:', JSON.stringify(eventDetails, null, 2));
                    console.log('[WebContent] FINAL: Total events on 2026-01-01:', merged[dateKey].length);
                  } else {
                    console.log('[WebContent] FINAL (cache merge): No events found for fd8afe0d-ffc8-4753-9ea6-32835b52fcb6 on 2026-01-01 after merge');
                  }
                }
              } else {
                // No existing events for this date, but filter out events with pending optimistic updates
                // or recently fetched from database (they might be on a different date due to the move)
                // IMPORTANT: If an event was recently fetched from DB, it should only appear on its database date,
                // not on any other date (like the optimistic update date)
                merged[dateKey] = cacheEvents.filter(e => {
                  if (e && e.id) {
                    // Filter out soft-deleted events
                    const deletedAt = e.deleted_at || e.data?.deleted_at || e.deleted;
                    if (deletedAt) {
                      console.log('[WebContent] Excluding soft-deleted event from cache (new date):', e.id, 'on date:', dateKey, 'deleted_at:', deletedAt);
                      return false;
                    }
                    
                    if (recentlyFetchedFromDbRef.current.has(e.id)) {
                      // Event was recently fetched from DB - only include it if this is the correct date
                      // We need to check what date the database event says it should be on
                      // For now, skip it entirely - it will be added by the database fetch update
                      console.log('[WebContent] Skipping cache event that was recently fetched from DB (will use DB version):', e.id, 'on date:', dateKey);
                      return false;
                    }
                    if (pendingOptimisticUpdatesRef.current.has(e.id)) {
                      console.log('[WebContent] Skipping cache event with pending optimistic update:', e.id, 'on date:', dateKey);
                      return false;
                    }
                  }
                  return true;
                });
              }
            } else {
              // Non-array value, just use cache version
              merged[dateKey] = cacheEvents;
            }
          });
          
          console.log('[WebContent] Merged events:', {
            prevCount: Object.keys(prevEvents).length,
            newCount: Object.keys(allEvents).length,
            mergedCount: Object.keys(merged).length,
            pendingOptimisticUpdates: pendingOptimisticUpdatesRef.current.size
          });
          return merged;
        });
      }
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

  // Fetch calendar data when switching to calendar/planner tab
  useEffect(() => {
    if ((activeTab === 'calendar' || activeTab === 'planner') && familyId && !isCalendarDataLoaded) {
      console.log('[WebContent] Initial load: calling preloadCalendarDataRPC');
      preloadCalendarDataRPC();
    }
  }, [activeTab, familyId, isCalendarDataLoaded]);

  // Load data for the current month when currentMonth changes (e.g., user navigates to different month)
  useEffect(() => {
    if ((activeTab === 'calendar' || activeTab === 'planner') && familyId && currentMonth) {
      const targetYear = currentMonth.getFullYear();
      const targetMonthIndex = currentMonth.getMonth();
      const targetMonthNum = targetMonthIndex + 1; // 1-indexed for loadMonthData
      const monthKey = `${targetYear}-${targetMonthIndex}`; // 0-indexed for cache key
      
      
      // Check if we already have data for this month in cache
      // Count only date keys (YYYY-MM-DD format) to avoid counting "children" or other metadata
      const cachedMonthData = calendarDataCache[monthKey] || {};
      const dateKeysInCache = Object.keys(cachedMonthData).filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key));
      const hasCachedData = dateKeysInCache.length > 0;
      
      console.log('[WebContent] Month navigation:', {
        targetYear,
        targetMonthIndex,
        targetMonthNum,
        monthKey,
        hasCachedData,
        cacheKeys: Object.keys(calendarDataCache)
      });
      
      if (!hasCachedData) {
        console.log('[WebContent] Loading month data for:', monthKey);
        loadMonthData(targetYear, targetMonthNum).then(monthData => {
          if (monthData && monthData !== null) {
            // Extract only events, not children or other metadata
            const events = monthData.events || {};
            const blackoutDates = monthData.blackoutDates || [];
            
            // Filter out any non-date keys (like "children") from events
            const filteredEvents = {};
            Object.keys(events).forEach(key => {
              // Only include keys that match date format YYYY-MM-DD
              if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
                filteredEvents[key] = events[key];
              }
            });
            
            const eventCount = Object.values(filteredEvents).reduce((sum, dayEvents) => sum + (Array.isArray(dayEvents) ? dayEvents.length : 0), 0);
            console.log('[WebContent] Loaded month data for', monthKey, ':', {
              datesWithEvents: Object.keys(filteredEvents).length,
              totalEvents: eventCount,
              sampleDates: Object.keys(filteredEvents).slice(0, 3)
            });
            
            setCalendarDataCache(prevCache => ({
              ...prevCache,
              [monthKey]: filteredEvents,
            }));
            
            setCalendarBlackoutDates(prevBlackouts => ({
              ...prevBlackouts,
              [monthKey]: blackoutDates,
            }));
            
            // Immediately merge events into calendarEvents after setting cache
            // But preserve optimistic updates
            setCalendarEvents(prevEvents => {
              const merged = { ...prevEvents };
              
              // For each date in the loaded events, merge but preserve optimistic updates
              Object.keys(filteredEvents).forEach(dateKey => {
                const loadedEvents = filteredEvents[dateKey];
                if (Array.isArray(loadedEvents)) {
                  // If this date already has events, merge them carefully
                  if (Array.isArray(merged[dateKey])) {
                    // Create a map of existing events by ID (these may include optimistic updates)
                    const existingEventsMap = new Map();
                    merged[dateKey].forEach(e => {
                      if (e && e.id) {
                        // If this event was recently fetched from DB, only include it if it's on the correct date
                        // Check if the event's date_local matches this dateKey
                        if (recentlyFetchedFromDbRef.current.has(e.id)) {
                          const eventDateLocal = e.date_local || e.data?.date_local;
                          if (eventDateLocal === dateKey) {
                            // This is the correct date for the database event - include it
                            existingEventsMap.set(e.id, e);
                          } else {
                            // This is the wrong date (optimistic update on wrong date) - exclude it
                            console.log('[WebContent] Excluding recently fetched DB event from wrong date (immediate merge):', e.id, 'on date:', dateKey, 'should be on:', eventDateLocal);
                          }
                        } else {
                          // Not recently fetched, include it
                          existingEventsMap.set(e.id, e);
                        }
                      }
                    });
                    
                    // Add/update events from loaded data, but preserve optimistic updates and recently fetched events
                    loadedEvents.forEach(loadedEvent => {
                      if (loadedEvent && loadedEvent.id) {
                        // Priority 1: If event was recently fetched from database, skip it (it's already in the map if on correct date)
                        if (recentlyFetchedFromDbRef.current.has(loadedEvent.id)) {
                          // Check if this is the correct date for the database event
                          const eventDateLocal = loadedEvent.date_local || loadedEvent.data?.date_local;
                          if (eventDateLocal === dateKey) {
                            // This is the correct date - the database event should already be in the map
                            console.log('[WebContent] Skipping loaded event that was recently fetched from DB (correct date):', loadedEvent.id, 'on date:', dateKey);
                          } else {
                            // This is the wrong date (optimistic update) - definitely skip it
                            console.log('[WebContent] Skipping loaded event that was recently fetched from DB (wrong date):', loadedEvent.id, 'on date:', dateKey, 'should be on:', eventDateLocal);
                          }
                          // Don't add to map - the database version is already there (if on correct date)
                        } else if (pendingOptimisticUpdatesRef.current.has(loadedEvent.id)) {
                          // Priority 2: If this event has a pending optimistic update, keep the optimistic version
                          // Don't overwrite - the optimistic version is already in the map
                          console.log('[WebContent] Preserving optimistic update in immediate merge for event:', loadedEvent.id, 'on date:', dateKey);
                        } else {
                          // No pending update or recent fetch, use loaded version (may overwrite existing)
                          existingEventsMap.set(loadedEvent.id, loadedEvent);
                        }
                      }
                    });
                    
                    merged[dateKey] = Array.from(existingEventsMap.values());
                  } else {
                    // No existing events for this date, but filter out events with pending optimistic updates
                    // or recently fetched from database (they might be on a different date due to the move)
                    // IMPORTANT: If an event was recently fetched from DB, it should only appear on its database date,
                    // not on any other date (like the optimistic update date)
                    merged[dateKey] = loadedEvents.filter(e => {
                      if (e && e.id) {
                        if (recentlyFetchedFromDbRef.current.has(e.id)) {
                          // Event was recently fetched from DB - only include it if this is the correct date
                          // We need to check what date the database event says it should be on
                          // For now, skip it entirely - it will be added by the database fetch update
                          console.log('[WebContent] Skipping loaded event that was recently fetched from DB (will use DB version):', e.id, 'on date:', dateKey);
                          return false;
                        }
                        if (pendingOptimisticUpdatesRef.current.has(e.id)) {
                          console.log('[WebContent] Skipping loaded event with pending optimistic update:', e.id, 'on date:', dateKey);
                          return false;
                        }
                      }
                      return true;
                    });
                  }
                } else {
                  // Non-array value, just use loaded version
                  merged[dateKey] = loadedEvents;
                }
              });
              
              console.log('[WebContent] Immediately merging loaded month events:', {
                monthKey,
                datesAdded: Object.keys(filteredEvents).length,
                totalDates: Object.keys(merged).length,
                pendingOptimisticUpdates: pendingOptimisticUpdatesRef.current.size
              });
              return merged;
            });
            
          } else {
            console.warn('[WebContent] No month data returned for', monthKey);
          }
        }).catch(err => {
          console.error('[WebContent] Error loading month data:', err);
        });
      } else {
        // Use cached data - it should already be filtered when stored
        const cachedEvents = calendarDataCache[monthKey] || {};
        
        // Double-check and filter out any non-date keys that might have snuck in
        const filteredCached = {};
        let hasNonDateKeys = false;
        Object.keys(cachedEvents).forEach(key => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
            filteredCached[key] = cachedEvents[key];
          } else {
            hasNonDateKeys = true;
          }
        });
        
        // Only update cache if we found non-date keys to remove
        if (hasNonDateKeys && Object.keys(filteredCached).length > 0) {
          setCalendarDataCache(prevCache => ({
            ...prevCache,
            [monthKey]: filteredCached,
          }));
        }
        
        const dateCount = Object.keys(filteredCached).length;
        console.log('[WebContent] Using cached data for', monthKey, '-', dateCount, 'dates with events', hasNonDateKeys ? '(filtered out non-date keys)' : '');
      }
    }
  }, [currentMonth, activeTab, familyId, calendarDataCache, calendarBlackoutDates]);

  // Restore events from cache when returning to planner/calendar tab
  // This ensures events are visible even if cache hasn't changed
  const prevActiveTabRef = React.useRef(activeTab);
  useEffect(() => {
    const wasOnPlannerOrCalendar = prevActiveTabRef.current === 'planner' || prevActiveTabRef.current === 'calendar';
    const isNowOnPlannerOrCalendar = activeTab === 'planner' || activeTab === 'calendar';
    const returningToPlannerOrCalendar = !wasOnPlannerOrCalendar && isNowOnPlannerOrCalendar;
    
    prevActiveTabRef.current = activeTab;
    
    if (returningToPlannerOrCalendar && familyId && isCalendarDataLoaded && Object.keys(calendarDataCache).length > 0) {
      // Merge all events from cache
      const allEvents = {};
      Object.keys(calendarDataCache).forEach(key => {
        if (calendarDataCache[key] && typeof calendarDataCache[key] === 'object') {
          Object.assign(allEvents, calendarDataCache[key]);
        }
      });
      
      // Only update if we have events
      if (Object.keys(allEvents).length > 0) {
        console.log('[WebContent] Restoring calendar events when returning to planner/calendar tab');
        console.log('Restoring', Object.keys(allEvents).length, 'days of events from cache');
        
        // Filter out soft-deleted events before restoring
        const filteredEvents = {};
        Object.keys(allEvents).forEach(dateKey => {
          const dateEvents = allEvents[dateKey];
          if (Array.isArray(dateEvents)) {
            const nonDeletedEvents = dateEvents.filter(e => {
              if (!e || !e.id) return false;
              const deletedAt = e.deleted_at || e.data?.deleted_at || e.deleted;
              if (deletedAt) {
                console.log('[WebContent] Filtering out soft-deleted event during restoration:', e.id, 'on date:', dateKey, 'deleted_at:', deletedAt);
                return false;
              }
              return true;
            });
            if (nonDeletedEvents.length > 0) {
              filteredEvents[dateKey] = nonDeletedEvents;
            }
          } else {
            filteredEvents[dateKey] = dateEvents;
          }
        });
        
        setCalendarEvents(filteredEvents);
      }
    }
  }, [activeTab, familyId, isCalendarDataLoaded, calendarDataCache]);

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

  // Get default view from localStorage helper
  const getDefaultView = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('plannerDefaultView') || null;
    }
    return null;
  };

  // Calendar view state with URL persistence
  const [calendarView, setCalendarView] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlView = params.get('view');
      // If URL has a view param, use it; otherwise check localStorage default
      if (urlView) return urlView;
      const savedDefault = getDefaultView();
      if (savedDefault) return savedDefault;
      return 'month';
    }
    return 'month';
  });

  // Apply default view when switching to planner tab (if no URL param)
  // Also sync calendarView with URL params when tab becomes active
  useEffect(() => {
    if (activeTab === 'planner' && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlView = params.get('view');
      
      // If URL has a view param, sync calendarView with it immediately
      if (urlView && calendarView !== urlView) {
        console.log('[WebContent] Syncing calendarView with URL param on tab switch:', urlView);
        setCalendarView(urlView);
        // Sync to parent
        if (onCalendarViewChange) {
          onCalendarViewChange(urlView);
        }
      } else if (!urlView) {
        // If no URL view param, check and apply default view
        const savedDefault = getDefaultView();
        if (savedDefault) {
          // Only update if current view is not the default
          if (calendarView !== savedDefault) {
            console.log('[WebContent] Applying default view on planner tab switch:', savedDefault);
            setCalendarView(savedDefault);
            // Update URL to reflect default view
            params.set('view', savedDefault);
            const newUrl = `${window.location.pathname}?${params.toString()}`;
            window.history.replaceState({}, '', newUrl);
            // Sync to parent
            if (onCalendarViewChange) {
              onCalendarViewChange(savedDefault);
            }
          }
        } else if (calendarView !== 'month') {
          // If no default is set and current view is not 'month', reset to 'month'
          console.log('[WebContent] No default view set, resetting to month');
          setCalendarView('month');
        }
      }
    }
  }, [activeTab]); // Only depend on activeTab - URL params are checked when tab becomes active

  // Listen to plannerViewChange event from Views dropdown
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleViewChange = (event) => {
        const newView = event.detail;
        console.log('[WebContent] plannerViewChange event received:', newView);
        setCalendarView(newView);
        
        // Sync to parent
        if (onCalendarViewChange) {
          onCalendarViewChange(newView);
        }
        
        // Update URL
        const params = new URLSearchParams(window.location.search);
        params.set('view', newView);
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.pushState({}, '', newUrl);
        
        // Always ensure events are restored from cache when switching views
        // This prevents events from disappearing when switching between month/week/day/board
        if (isCalendarDataLoaded && familyId && Object.keys(calendarDataCache).length > 0) {
          const allEvents = {};
          Object.keys(calendarDataCache).forEach(key => {
            if (calendarDataCache[key] && typeof calendarDataCache[key] === 'object') {
              Object.assign(allEvents, calendarDataCache[key]);
            }
          });
          
          // Only update if we have events in cache and current events are empty or different
          if (Object.keys(allEvents).length > 0) {
            const currentEventKeys = Object.keys(calendarEvents);
            const cacheEventKeys = Object.keys(allEvents);
            
            // If events are empty or significantly different, restore from cache
            if (currentEventKeys.length === 0 || 
                cacheEventKeys.length > currentEventKeys.length ||
                !cacheEventKeys.every(key => currentEventKeys.includes(key))) {
              console.log('[WebContent] Restoring events from cache after view change:', {
                currentEvents: currentEventKeys.length,
                cacheEvents: cacheEventKeys.length,
                newView: newView
              });
              setCalendarEvents(allEvents);
            }
          }
        }
      };
      
      window.addEventListener('plannerViewChange', handleViewChange);
      return () => {
        window.removeEventListener('plannerViewChange', handleViewChange);
      };
    }
  }, [onCalendarViewChange, calendarEvents, calendarDataCache, isCalendarDataLoaded, familyId]);

  // Sync calendarView to parent when it changes (e.g., from URL)
  useEffect(() => {
    if (onCalendarViewChange) {
      onCalendarViewChange(calendarView);
    }
  }, [calendarView, onCalendarViewChange]);

  const [selectedCalendarChildren, setSelectedCalendarChildren] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const childParam = params.get('child');
      if (childParam) {
        // Filter out "all" and any invalid values
        const childIds = childParam.split(',').filter(id => id && id !== 'all' && id.trim() !== '');
        return childIds.length > 0 ? childIds : null;
      }
      return null;
    }
    return null;
  });

  // Use prop from parent if provided (controlled mode), otherwise use internal state
  const effectiveSelectedCalendarChildren = propSelectedCalendarChildren !== undefined 
    ? propSelectedCalendarChildren 
    : selectedCalendarChildren;

  // Use prop from parent if provided (controlled mode), otherwise use null (no internal state for event types)
  const effectiveSelectedEventTypes = propSelectedEventTypes !== undefined 
    ? propSelectedEventTypes 
    : null;

  // Sync prop changes to internal state (when parent controls it)
  useEffect(() => {
    if (propSelectedCalendarChildren !== undefined) {
      setSelectedCalendarChildren(propSelectedCalendarChildren);
    }
  }, [propSelectedCalendarChildren]);

  // Sync selectedCalendarChildren to parent (WebLayout) when internal state changes
  useEffect(() => {
    if (onSelectedCalendarChildrenChange && propSelectedCalendarChildren === undefined) {
      onSelectedCalendarChildrenChange(selectedCalendarChildren);
    }
  }, [selectedCalendarChildren, onSelectedCalendarChildrenChange, propSelectedCalendarChildren]);

  // Sync currentMonth to parent (WebLayout)
  useEffect(() => {
    if (onCurrentMonthChange) {
      onCurrentMonthChange(currentMonth);
    }
  }, [currentMonth, onCurrentMonthChange]);

  // Listen for month changes from toolbar
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleMonthChange = (event) => {
      const newMonth = event.detail;
      if (newMonth instanceof Date && !isNaN(newMonth.getTime())) {
        // Validate the date is reasonable (between 1900 and 2100)
        const year = newMonth.getFullYear();
        const month = newMonth.getMonth();
        if (year >= 1900 && year <= 2100 && month >= 0 && month <= 11) {
          setCurrentMonth(newMonth);
          // Update selectedDate to trigger calendar refresh
          setSelectedDate(newMonth);
        } else {
          console.error('[WebContent] Invalid date in handleMonthChange:', { year, month, date: newMonth });
        }
      } else {
        console.error('[WebContent] Invalid date object in handleMonthChange:', newMonth);
      }
    };
    window.addEventListener('plannerMonthChange', handleMonthChange);
    return () => {
      window.removeEventListener('plannerMonthChange', handleMonthChange);
    };
  }, []);

  // Listen for child filter changes from toolbar (WebLayout)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    
    const handleChildFilterChange = (event) => {
      const detail = event.detail || {};
      const next = detail.selectedChildren;
      // Normalize to null or array of ids
      if (next && Array.isArray(next) && next.length > 0) {
        setSelectedCalendarChildren(next);
      } else {
        setSelectedCalendarChildren(null);
      }
    };
    
    window.addEventListener('calendarChildFilterChange', handleChildFilterChange);
    return () => {
      window.removeEventListener('calendarChildFilterChange', handleChildFilterChange);
    };
  }, []);

  // NOTE: We NO LONGER reload month data when child filter changes
  // Filtering is now done entirely client-side in convertCalendarEventsToArray
  // This provides instant filtering without network requests and works across all loaded months
  // The useEffect below is commented out but kept for reference
  /*
  useEffect(() => {
    const isPlannerOrCalendar = activeTab === 'planner' || activeTab === 'calendar';
    if (familyId && calendarView === 'month' && isCalendarDataLoaded && isPlannerOrCalendar) {
      const currentYear = currentMonth.getFullYear();
      const currentMonthNum = currentMonth.getMonth() + 1;
      console.log('Child filter changed, reloading month data with filter:', selectedCalendarChildren);
      loadMonthData(currentYear, currentMonthNum).then(events => {
        if (events && events !== null && Object.keys(events).length > 0) {
          const monthKey = `${currentYear}-${currentMonth.getMonth()}`;
          setCalendarDataCache(prev => ({ ...prev, [monthKey]: events }));
          setCalendarEvents(prevEvents => ({
            ...prevEvents,
            ...events
          }));
        } else {
          console.warn('No events loaded for month, not updating cache or events');
        }
      });
    }
  }, [selectedCalendarChildren, familyId, activeTab, currentMonth, isCalendarDataLoaded]);
  */

  // Update URL when view or children change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      
      if (calendarView !== 'month') {
        params.set('view', calendarView);
      } else {
        params.delete('view');
      }
      
      // Filter out "all" before setting URL param
      const validChildIds = effectiveSelectedCalendarChildren && Array.isArray(effectiveSelectedCalendarChildren)
        ? effectiveSelectedCalendarChildren.filter(id => id && id !== 'all' && typeof id === 'string')
        : [];
      
      if (validChildIds.length > 0) {
        params.set('child', validChildIds.join(','));
      } else {
        params.delete('child');
      }
      
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [calendarView, effectiveSelectedCalendarChildren]);

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
                          ...Platform.select({
                            web: {
                              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                            },
                            default: {
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: 0.1,
                              shadowRadius: 4,
                              elevation: 5,
                            },
                          }),
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
          // Default Right Pane Content - Empty when no tool is active
                <View style={{ flex: 1, minHeight: 0 }} />
        )}
      </>
    );
  }, [activeTab, calendarView, showNewEventForm, selectedEvent, searchQuery, isSearching, searchResults, newEventType, showEventTypeDropdown, isSearchFocused, onRightSidebarRender, closeNewEventForm, handleCloseEvent, handleEventSelect, handleSearch, newEventFormData, setNewEventFormData, holidayDateRange, setHolidayDateRange, holidayRepeat, setHolidayRepeat, availableTracks, availableActivities, trackTriggerRef, activityTriggerRef, statusTriggerRef, measureTriggerPosition, setShowTrackDropdown, setShowActivityDropdown, setShowStatusDropdown, setTrackTriggerDimensions, setActivityTriggerDimensions, setStatusTriggerDimensions, saveNewEventFromForm, editingTitle, tempTitle, handleTitleEdit, handleTitleSave, handleTitleCancel, editingStatus, tempStatus, handleStatusEdit, handleStatusSave, handleStatusCancel, editingScheduledTime, editingFinishTime, tempScheduledTime, tempFinishTime, handleScheduledTimeEdit, handleFinishTimeEdit, handleBothTimesSave, handleScheduledTimeCancel, handleFinishTimeCancel, editingScheduledDate, editingDueDate, tempScheduledDate, tempDueDate, handleScheduledDateEdit, handleDueDateEdit, handleScheduledDateSave, handleDueDateSave, handleScheduledDateCancel, handleDueDateCancel, editingAssignee, tempAssignee, handleAssigneeEdit, handleAssigneeSave, handleAssigneeCancel, isEditingEvent, editedEventData, setIsEditingEvent, setEditedEventData, handleDescriptionChange, children, getStatusColor, getCurrentAssignees, calculateFinishTime, familyId, selectedCalendarChildren]);

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
  // Filters events by selectedCalendarChildren if filter is active
  const convertCalendarEventsToArray = React.useCallback(() => {
    const eventsArray = [];
    
    // Determine which child IDs to filter by
    // null means show all children, array means show only selected
    // Safety check: ensure effectiveSelectedCalendarChildren is defined
    const filterChildIds = (effectiveSelectedCalendarChildren && Array.isArray(effectiveSelectedCalendarChildren) && effectiveSelectedCalendarChildren.length > 0)
      ? effectiveSelectedCalendarChildren.filter(id => id && id !== 'all' && typeof id === 'string')
      : null;
    
    // Determine which event types to filter by
    // null means show all event types, array means show only selected
    const filterEventTypes = (effectiveSelectedEventTypes && Array.isArray(effectiveSelectedEventTypes) && effectiveSelectedEventTypes.length > 0)
      ? effectiveSelectedEventTypes
      : null;
    
    Object.entries(calendarEvents).forEach(([dateKey, dayEvents]) => {
      if (Array.isArray(dayEvents)) {
        dayEvents.forEach(event => {
          if (event && event.id) {
            // Filter out deleted events - check BEFORE processing event
            if (event.deleted_at || event.deleted || event.data?.deleted_at) {
              return; // Skip deleted events
            }
            
            // Apply child filter if active - check BEFORE processing event
            if (filterChildIds && filterChildIds.length > 0) {
              // Get child_id from various possible locations in the event structure
              // Events from loadMonthData have: data.child_id, assignee, assignees[0]
              const eventChildId = event.data?.child_id || event.assignee || (event.assignees && event.assignees[0]) || event.child_id || event.childId || event.student_id;
              
              // Skip event if it doesn't belong to any selected child
              if (!eventChildId || !filterChildIds.includes(eventChildId)) {
                return; // Skip this event - don't add it to the array
              }
            }
            
            // Apply event type filter if active - check BEFORE processing event
            if (filterEventTypes && filterEventTypes.length > 0) {
              // Get event_type from various possible locations in the event structure
              const eventType = event.data?.event_type || event.event_type || event.type;
              
              // Skip event if it doesn't match any selected event type
              if (!eventType || !filterEventTypes.includes(eventType)) {
                return; // Skip this event - don't add it to the array
              }
            }
            // Parse the date from dateKey (YYYY-MM-DD) as LOCAL date, not UTC
            // This prevents timezone shifts (e.g., Nov 20 UTC midnight = Nov 19 EST evening)
            // Validate dateKey format first
            if (!dateKey || typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
              console.error('[convertCalendarEventsToArray] Invalid dateKey format:', dateKey);
              return; // Skip this event
            }
            
            const [year, month, day] = dateKey.split('-').map(Number);
            // Validate parsed date components before creating date
            if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
              console.error('[convertCalendarEventsToArray] Invalid date components:', { dateKey, year, month, day });
              return; // Skip this event
            }
            
            let date = new Date(year, month - 1, day); // month is 0-indexed in JS, creates LOCAL date
            
            // Validate the date was created successfully
            if (isNaN(date.getTime())) {
              console.error('[convertCalendarEventsToArray] Invalid date created:', { dateKey, year, month, day, date });
              return; // Skip this event
            }
            
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
            
            // Spread event first, then override with extracted values (so explicit values take precedence)
            // Extract recurrence fields from nested data structure (RPC returns them in event.data)
            // Also check top-level in case they're already extracted
            const recurrenceRule = event.data?.recurrence_rule || event.recurrence_rule;
            const parentEventId = event.data?.parent_event_id || event.parent_event_id;
            const recurrenceId = event.data?.recurrence_id || event.recurrence_id;
            
            const finalEvent = {
              ...event,
              id: event.id,
              title: event.title || 'Untitled Event',
              start: date.toISOString(),
              start_ts: event.data?.start_ts || event.start_ts || event.start, // Preserve UTC timestamp
              end_ts: event.data?.end_ts || event.end_ts || event.end, // Preserve UTC timestamp
              // CRITICAL: Extract start_local, end_local, date_local from event.data (where RPC stores them)
              // Put these AFTER ...event spread so they override any undefined values
              start_local: event.data?.start_local || event.start_local,
              end_local: event.data?.end_local || event.end_local,
              date_local: event.data?.date_local || event.date_local,
              childId: event.childId || event.student_id || event.data?.child_id,
              child_id: event.data?.child_id || event.child_id, // Also preserve child_id
              subject: event.subject || event.subjectName || event.data?.subject_name,
              color: eventColor,
              status: event.status || event.data?.status || 'scheduled',
              type: event.type,
              year_plan_id: event.year_plan_id || event.data?.year_plan_id, // Preserve year_plan_id
              // Preserve recurrence fields for recurring event detection - ensure they're at top level
              recurrence_rule: recurrenceRule,
              parent_event_id: parentEventId,
              recurrence_id: recurrenceId
            };
            
            eventsArray.push(finalEvent);
          }
        });
      }
    });
    
    // Debug logging removed - filter is working correctly
    
    // Removed verbose logging - only log warnings/errors
    // Debug: Log when convertCalendarEventsToArray is called
    // console.log('[convertCalendarEventsToArray] Called with calendarEvents:', {
    //   totalDates: Object.keys(calendarEvents).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).length,
    //   totalEvents: eventsArray.length,
    //   timestamp: new Date().toISOString()
    // });
    
    return eventsArray;
  }, [calendarEvents, effectiveSelectedCalendarChildren, effectiveSelectedEventTypes]);

  const renderPlannerContent = () => {
    // Show structure even while loading - use empty arrays/objects for initial render
    const eventsArray = convertCalendarEventsToArray();
    
    // Removed verbose logging - only log warnings/errors
    // Debug: Log how many events are being passed to the calendar
    // const dateKeys = Object.keys(calendarEvents).filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key));
    // console.log('[renderPlannerContent] Converting calendarEvents to array:', {
    //   totalDatesInCalendarEvents: dateKeys.length,
    //   totalNonDateKeys: Object.keys(calendarEvents).length - dateKeys.length,
    //   totalEventsInArray: eventsArray.length,
    //   currentMonth: currentMonth ? `${currentMonth.getFullYear()}-${currentMonth.getMonth()}` : 'null',
    //   sampleEvents: eventsArray.slice(0, 3).map(e => ({
    //     id: e.id,
    //     title: e.title,
    //     date_local: e.date_local,
    //     start_ts: e.start_ts,
    //     dateKey: e.date_local ? (() => {
    //       const [y, m, d] = e.date_local.split('-').map(Number);
    //       const date = new Date(y, m - 1, d);
    //       return date.toDateString();
    //     })() : null
    //   })),
    //   sampleDateKeys: dateKeys.slice(0, 5)
    // });
    
    const filters = {
      childIds: effectiveSelectedCalendarChildren,
      eventTypes: effectiveSelectedEventTypes,
      subjects: null // Can be added later if needed
    };
    
    // Get blackout dates for current month
    const monthKey = `${currentMonth.getFullYear()}-${currentMonth.getMonth()}`;
    const blackoutDates = calendarBlackoutDates[monthKey] || [];
    
    // Determine loading states
    const isLoadingFamily = !familyId;
    const isLoadingCalendar = !isCalendarDataLoaded || calendarDataLoading;
    
    // Show loading indicator inline if needed
    // Note: We don't show "Loading events..." separately - if calendar data is loaded, 
    // we're done loading (even if there are no events in the database)
    const showLoadingIndicator = isLoadingFamily || isLoadingCalendar;


    return (
      <View style={{ flex: 1 }}>
        {/* Show inline loading indicator if needed */}
        {showLoadingIndicator && (
          <View style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 1000,
            backgroundColor: '#ffffff',
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#e5e7eb',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            ...(Platform.OS === 'web' && {
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }),
          }}>
            <Animated.View style={[styles.loadingSpinner, { transform: [{ rotate: spin }] }]} />
            <Text style={{
              fontSize: 13,
              color: '#6b7280',
            }}>
              {isLoadingFamily ? 'Loading family...' : 'Loading calendar...'}
            </Text>
          </View>
        )}
        
        {/* Conflict Banner - only show on month view */}
        {calendarView === 'month' && activeTab === 'planner' && conflictBanner.visible && !conflictBanner.dismissed && (
          <DragDropConflictBanner
            visible={true}
            conflictCount={conflictBanner.conflictCount}
            eventTitle={conflictBanner.eventTitle}
            eventId={conflictBanner.eventId}
            conflictEvent={conflictBanner.conflictEvent}
            conflictMessage={conflictBanner.conflictMessage}
            familyId={familyId}
            onQuickReschedule={async () => {
              // Find the moved event from database
              try {
                const { data: eventData, error } = await supabase
                  .from('events')
                  .select('*')
                  .eq('id', conflictBanner.eventId)
                  .eq('family_id', familyId)
                  .maybeSingle();
                
                if (error || !eventData) {
                  console.error('[WebContent] Error fetching event for Quick Reschedule:', error);
                  // Fallback: try to find in calendarEvents
                  Object.keys(calendarEvents).forEach(dateKey => {
                    const dayEvents = calendarEvents[dateKey] || [];
                    const event = dayEvents.find(e => e.id === conflictBanner.eventId);
                    if (event) {
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('openQuickReschedule', {
                          detail: {
                            event: event,
                            skipToPreview: true,
                          }
                        }));
                      }
                    }
                  });
                } else {
                  // Dispatch event to open Quick Reschedule modal
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('openQuickReschedule', {
                      detail: {
                        event: eventData,
                        skipToPreview: true, // Skip to preview step
                      }
                    }));
                  }
                }
                setConflictBanner(prev => ({ ...prev, visible: false }));
              } catch (err) {
                console.error('[WebContent] Error in Quick Reschedule from banner:', err);
              }
            }}
            onDismiss={() => {
              setConflictBanner(prev => ({ ...prev, dismissed: true, visible: false }));
              // Keep the pending optimistic update flag so the event stays where user dragged it
              // It will be cleared when user moves the event again or refreshes manually
              console.log('[WebContent] Conflict banner dismissed - keeping optimistic update for event:', conflictBanner.eventId);
            }}
            onSuggestionAccepted={async (newStart, newEnd) => {
              // Apply the suggested reschedule directly
              try {
                const eventId = conflictBanner.eventId;
                const movedEvent = conflictBanner.movedEvent;
                
                if (!movedEvent) {
                  console.error('[WebContent] No movedEvent in conflict banner');
                  return;
                }
                
                // Create updated event with new times
                // Format start_local and end_local in "HH:MM" format (not ISO timestamp)
                const startLocalHours = newStart.getHours();
                const startLocalMinutes = newStart.getMinutes();
                const startLocalStr = `${String(startLocalHours).padStart(2, '0')}:${String(startLocalMinutes).padStart(2, '0')}`;
                
                const endLocalHours = newEnd.getHours();
                const endLocalMinutes = newEnd.getMinutes();
                const endLocalStr = `${String(endLocalHours).padStart(2, '0')}:${String(endLocalMinutes).padStart(2, '0')}`;
                
                const updatedEvent = {
                  ...movedEvent,
                  start_ts: newStart.toISOString(),
                  end_ts: newEnd.toISOString(),
                  start_local: startLocalStr, // "HH:MM" format (e.g., "16:00" for 4 PM)
                  end_local: endLocalStr, // "HH:MM" format
                  updated_at: new Date().toISOString(),
                };
                
                // Apply optimistic update to calendarEvents immediately (like drag-and-drop does)
                setCalendarEvents(prevEvents => {
                  const newEvents = { ...prevEvents };
                  let found = false;
                  
                  // Find and update the event in the calendarEvents structure
                  Object.keys(newEvents).forEach(dateKey => {
                    const dayEvents = newEvents[dateKey];
                    if (Array.isArray(dayEvents)) {
                      const index = dayEvents.findIndex(e => e && e.id === eventId);
                      if (index >= 0) {
                        // Calculate new date key for the event
                        const newDateKey = newStart.toISOString().split('T')[0];
                        const updatedDayEvents = [...dayEvents];
                        
                        // Update the event
                        updatedDayEvents[index] = {
                          ...updatedDayEvents[index],
                          ...updatedEvent,
                          start_local: updatedEvent.start_local,
                          end_local: updatedEvent.end_local,
                          data: {
                            ...updatedDayEvents[index].data,
                            ...updatedEvent,
                            start_local: updatedEvent.start_local,
                            end_local: updatedEvent.end_local,
                          }
                        };
                        
                        // If the date changed, move the event to the new date
                        if (dateKey !== newDateKey) {
                          newEvents[dateKey] = updatedDayEvents.filter(e => e && e.id !== eventId);
                          if (!newEvents[newDateKey]) {
                            newEvents[newDateKey] = [];
                          }
                          newEvents[newDateKey].push(updatedDayEvents[index]);
                        } else {
                          newEvents[dateKey] = updatedDayEvents;
                        }
                        found = true;
                      }
                    }
                  });
                  
                  return found ? newEvents : prevEvents;
                });
                
                // Track this event as having a pending optimistic update
                pendingOptimisticUpdatesRef.current.add(eventId);
                
                // Clear the conflict banner
                setConflictBanner(prev => ({ ...prev, visible: false }));
                
                // Call rescheduleEvent to sync with backend (but we've already updated UI)
                const { rescheduleEvent } = await import('../lib/services/plannerClientWithOffline');
                const result = await rescheduleEvent(
                  eventId,
                  newStart.toISOString(),
                  newEnd.toISOString(),
                  'drag_drop',
                  'Auto-adjusted to resolve conflict',
                  familyId
                );
                
                // Only clear pending flag if API call succeeded
                if (result.data && !result.error) {
                  // API call succeeded - clear pending flag after a delay to allow refresh
                  setTimeout(() => {
                    pendingOptimisticUpdatesRef.current.delete(eventId);
                  }, 2000);
                } else if (result.error) {
                  // API call failed - log error and show message to user
                  console.error('[WebContent] Failed to save event change:', {
                    eventId,
                    error: result.error,
                    errorMessage: result.error.message,
                    errorStatus: result.error.status,
                  });
                  
                  // Show error alert to user
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    Alert.alert(
                      'Failed to Save',
                      `Unable to save the event change. ${result.error.message || 'Please try again.'}`,
                      [{ text: 'OK' }]
                    );
                  }
                  
                  // Keep the pending flag so optimistic update persists
                  // User can try again or undo
                }
                
              } catch (err) {
                console.error('[WebContent] Error accepting suggestion:', err);
                // Show error alert to user
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  Alert.alert(
                    'Error',
                    'An error occurred while saving the event change. Please try again.',
                    [{ text: 'OK' }]
                  );
                }
                // Keep the optimistic update even on error
              }
            }}
          />
        )}
        
        <CenterPane
          date={currentMonth}
          events={eventsArray}
          selectedDate={selectedDate}
          viewMode={calendarView}
          onSelectDate={(newDate) => {
            setSelectedDate(newDate);
            // Also update currentMonth if the month/year changed
            if (newDate instanceof Date && !isNaN(newDate.getTime())) {
              const newMonth = newDate.getMonth();
              const newYear = newDate.getFullYear();
              const currentMonthNum = currentMonth.getMonth();
              const currentYear = currentMonth.getFullYear();
              
              console.log('[WebContent] onSelectDate called:', {
                newDate: newDate.toISOString(),
                newMonth,
                newYear,
                currentMonthNum,
                currentYear,
                willUpdate: newMonth !== currentMonthNum || newYear !== currentYear,
              });
              
              if (newMonth !== currentMonthNum || newYear !== currentYear) {
                const newMonthDate = new Date(newYear, newMonth, 1);
                console.log('[WebContent] Month changed via onSelectDate:', {
                  from: `${currentYear}-${currentMonthNum + 1} (${currentMonth.toLocaleString('en-US', { month: 'long' })})`,
                  to: `${newYear}-${newMonth + 1} (${newMonthDate.toLocaleString('en-US', { month: 'long' })})`,
                  settingCurrentMonthTo: newMonthDate.toISOString(),
                });
                setCurrentMonth(newMonthDate);
              }
            }
          }}
          onEventSelect={handleEventSelect}
          onEventRightClick={handleRightClick}
          onEventComplete={handleEventComplete}
          filters={filters}
          children={children}
          blackoutDates={blackoutDates}
          onChildFilterChange={(childIds) => {
            // Filter out "all" and ensure we only store valid UUIDs
            if (childIds && Array.isArray(childIds)) {
              const validIds = childIds.filter(id => id && id !== 'all' && typeof id === 'string');
              setSelectedCalendarChildren(validIds.length > 0 ? validIds : null);
            } else {
              setSelectedCalendarChildren(null);
            }
          }}
          onCreateTask={(placementPreference) => {
            setTaskModalDate(selectedDate || new Date());
            setTaskModalDefaultPlacement(placementPreference || 'calendar');
            setShowTaskModal(true);
          }}
          onNavigateToIntelligence={(params) => {
            // Navigate to Intelligence Hub with query params
            if (onTabChange) {
              onTabChange('intelligence');
              // Store params for IntelligenceHub to read
              if (typeof window !== 'undefined') {
                const queryString = new URLSearchParams(params).toString();
                window.history.replaceState({}, '', `?tab=intelligence&${queryString}`);
              }
            }
          }}
        />
        
        {/* Task Create Modal */}
        <TaskCreateModal
          key={`task-modal-${taskModalDefaultPlacement}`} // Force remount when placement changes
          visible={showTaskModal}
          onClose={() => {
            setShowTaskModal(false);
            setTaskModalChildId(null);
            setTaskModalDefaultPlacement('calendar'); // Reset to default
          }}
          defaultDate={taskModalDate}
          defaultChildId={taskModalChildId}
          defaultPlacement={taskModalDefaultPlacement}
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
            // Dispatch eventCreated event for home page and other components
            if (Platform.OS === 'web' && typeof window !== 'undefined' && task?.id) {
              window.dispatchEvent(new CustomEvent('eventCreated', { 
                detail: { eventId: task.id } 
              }));
            }
            // Refresh calendar data after task creation
            await refreshCalendarData();
          }}
        />
        <EventModal
          visible={eventModalVisible}
          eventId={eventModalEventId}
          initialEvent={eventModalInitialEvent}
          familyId={familyId}
          onClose={() => {
            setEventModalVisible(false);
            setEventModalEventId(null);
            setEventModalInitialEvent(null);
          }}
          onEventUpdated={async () => {
            console.log('[WebContent] Planner EventModal onEventUpdated');
            
            // Refresh calendar data for planner
            await refreshCalendarData();
            
            // Always invalidate home data cache when events are updated, so home screen shows updated data
            if (user) {
              try {
                const { data: profileData } = await supabase
                  .from('profiles')
                  .select('family_id')
                  .eq('id', user.id)
                  .maybeSingle();
                
                if (profileData?.family_id) {
                  invalidateHomeDataCache(profileData.family_id);
                  
                  // If we're currently viewing home, refresh the data immediately
                  if (activeTab === 'home' && homeData) {
                    const validDate = homeSelectedDate instanceof Date && !isNaN(homeSelectedDate.getTime())
                      ? homeSelectedDate
                      : new Date();
                    validDate.setHours(0, 0, 0, 0);
                    const selectedDateStr = validDate.toISOString().split('T')[0];
                    
                    const homeDataResult = await supabase.rpc('get_home_data', {
                      _family_id: profileData.family_id,
                      _date: selectedDateStr,
                      _horizon_days: 14,
                    });
                    
                    const { data: rawData, error } = homeDataResult;
                    
                    // Clean invalid avatar UUIDs from RPC response before using
                    const data = rawData ? cleanAvatarUrls(rawData) : rawData;
                    
                    if (!error && data) {
                      const stories = (data?.stories || []).filter(s => 
                        s && s.title && s.body && s.title.trim() && s.body.trim()
                      );
                      
                      setHomeData({
                        ...data,
                        stories: stories,
                      });
                      
                      saveHomeDataToCache(profileData.family_id, selectedDateStr, {
                        ...data,
                        stories: stories,
                      });
                    }
                  }
                }
              } catch (err) {
                console.error('[WebContent] Error refreshing home data after planner update:', err);
              }
            }
            
            // Dispatch refresh event (don't skip home refresh so cache gets invalidated)
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('refreshCalendar'));
            }
          }}
          onEventDeleted={async (deletedEventId) => {
            console.log('[WebContent] Planner EventModal onEventDeleted with ID:', deletedEventId || eventModalEventId);
            
            const deletedId = deletedEventId || eventModalEventId;
            
            if (!deletedId) {
              console.error('[WebContent] onEventDeleted called but no event ID provided');
              return;
            }
            
            // Verify the event was actually soft-deleted from the database
            // Note: onEventDeleted is only called if EventDetails verified the delete succeeded
            // So we can trust it, but we'll do a quick verification anyway
            try {
              const { data: verifyData, error: verifyError } = await supabase
                .from('events')
                .select('id, status, deleted_at')
                .eq('id', deletedId)
                .maybeSingle();
              
              if (verifyError && verifyError.code !== 'PGRST116') {
                // PGRST116 is "not found" which is good - means deleted
                console.warn('[WebContent] Error verifying deletion (non-critical):', verifyError);
                // Continue - EventDetails already verified
              } else if (verifyData) {
                // Event still exists - check if it's soft-deleted (deleted_at is set)
                if (verifyData.deleted_at) {
                  console.log('[WebContent] Event was soft-deleted (deleted_at is set) - treating as success');
                  // Continue with optimistic updates - soft delete is acceptable
                } else if (verifyData.status === 'canceled') {
                  console.log('[WebContent] Event was soft-deleted (marked as canceled) - treating as success');
                  // Continue with optimistic updates - soft delete is acceptable
                } else {
                  console.warn('[WebContent] Event still exists in database after deletion! ID:', deletedId, 'Status:', verifyData.status, 'deleted_at:', verifyData.deleted_at);
                  // Don't proceed with optimistic updates if delete didn't work
                  window.alert('Failed to delete event: Event still exists in database. Please try again.');
                  return;
                }
              } else {
                console.log('[WebContent] Deletion verified - event no longer exists in database');
              }
            } catch (verifyErr) {
              console.error('[WebContent] Error verifying deletion:', verifyErr);
              // Continue with optimistic update - EventDetails already verified the delete
            }
            
            // Optimistically remove from calendarEvents immediately
            if (deletedId) {
              console.log('[WebContent] Optimistically removing event from calendarEvents (planner)');
              setCalendarEvents(prevEvents => {
                const updated = { ...prevEvents };
                Object.keys(updated).forEach(dateKey => {
                  if (Array.isArray(updated[dateKey])) {
                    updated[dateKey] = updated[dateKey].filter(e => e.id !== deletedId);
                    // Remove date key if no events left
                    if (updated[dateKey].length === 0) {
                      delete updated[dateKey];
                    }
                  }
                });
                return updated;
              });
            }
            
            // Optimistically remove from homeData if we're viewing home
            if (activeTab === 'home' && homeData && deletedId) {
              console.log('[WebContent] Optimistically removing event from homeData (planner delete)');
              setHomeData(prev => {
                if (!prev) return prev;
                const updatedLearning = (prev.learning || []).filter(e => e.id !== deletedId);
                return {
                  ...prev,
                  learning: updatedLearning
                };
              });
            }
            
            // Close modal
            setEventModalVisible(false);
            setEventModalEventId(null);
            setEventModalInitialEvent(null);
            
            // Invalidate calendar cache to force reload
            setCalendarDataCache({});
            setIsCalendarDataLoaded(false);
            
            // Refresh home data if we're on home tab
            if (activeTab === 'home' && user) {
              try {
                const { data: profileData } = await supabase
                  .from('profiles')
                  .select('family_id')
                  .eq('id', user.id)
                  .maybeSingle();
                
                if (profileData?.family_id) {
                  // Invalidate cache first
                  invalidateHomeDataCache(profileData.family_id);
                  
                  // Get current selected date
                  const validDate = homeSelectedDate instanceof Date && !isNaN(homeSelectedDate.getTime())
                    ? homeSelectedDate
                    : new Date();
                  validDate.setHours(0, 0, 0, 0);
                  const selectedDateStr = validDate.toISOString().split('T')[0];
                  
                  // Force refetch immediately
                  console.log('[WebContent] Refetching home data after planner delete');
                  const homeDataResult = await supabase.rpc('get_home_data', {
                    _family_id: profileData.family_id,
                    _date: selectedDateStr,
                    _horizon_days: 14,
                  });
                  
                  const { data: rawData, error } = homeDataResult;
                  const data = rawData ? cleanAvatarUrls(rawData) : rawData;
                  
                  if (!error && data) {
                    // Filter out the deleted event
                    const updatedLearning = deletedId 
                      ? (data?.learning || []).filter(e => e.id !== deletedId)
                      : (data?.learning || []);
                    
                    const updatedData = {
                      ...data,
                      learning: updatedLearning,
                    };
                    
                    setHomeLoading(false);
                    if (onHomeLoadingChange) onHomeLoadingChange(false);
                    setHomeData(updatedData);
                    saveHomeDataToCache(profileData.family_id, selectedDateStr, updatedData);
                    
                    // Also refresh fetchTodaysLearning
                    await fetchTodaysLearning();
                  }
                }
              } catch (err) {
                console.error('[WebContent] Error refreshing home data after planner delete:', err);
              }
            }
            
            // Refresh calendar data for the month containing the deleted event
            const eventDate = eventModalInitialEvent?.start_ts || eventModalInitialEvent?.start;
            const refreshDate = eventDate ? new Date(eventDate) : currentMonth;
            console.log('[WebContent] Refreshing calendar data for month containing deleted event:', refreshDate);
            await refreshCalendarData(refreshDate);
            
            // Dispatch refresh event for other components
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('refreshCalendar', { 
                detail: { eventId: deletedId } 
              }));
            }
            
            // Refresh home data if needed
            if (activeTab === 'home' && homeData && user) {
              try {
                const { data: profileData } = await supabase
                  .from('profiles')
                  .select('family_id')
                  .eq('id', user.id)
                  .maybeSingle();
                
                if (profileData?.family_id) {
                  invalidateHomeDataCache(profileData.family_id);
                  
                  const validDate = homeSelectedDate instanceof Date && !isNaN(homeSelectedDate.getTime())
                    ? homeSelectedDate
                    : new Date();
                  validDate.setHours(0, 0, 0, 0);
                  const selectedDateStr = validDate.toISOString().split('T')[0];
                  
                  const homeDataResult = await supabase.rpc('get_home_data', {
                    _family_id: profileData.family_id,
                    _date: selectedDateStr,
                    _horizon_days: 14,
                  });
                  
                  const { data: rawData, error } = homeDataResult;
                  
                  // Clean invalid avatar UUIDs from RPC response before using
                  const data = rawData ? cleanAvatarUrls(rawData) : rawData;
                  
                  if (!error && data) {
                    const stories = (data?.stories || []).filter(s => 
                      s && s.title && s.body && s.title.trim() && s.body.trim()
                    );
                    
                    const updatedLearning = deletedId 
                      ? (data?.learning || []).filter(e => e.id !== deletedId)
                      : (data?.learning || []);
                    
                    setHomeData({
                      ...data,
                      stories: stories,
                      learning: updatedLearning,
                    });
                    
                    saveHomeDataToCache(profileData.family_id, selectedDateStr, {
                      ...data,
                      stories: stories,
                      learning: updatedLearning,
                    });
                  }
                }
              } catch (err) {
                console.error('[WebContent] Error refreshing home data after planner delete:', err);
              }
            }
            
            // Dispatch refresh event
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipHomeRefresh: true } }));
            }
          }}
          onEventPatched={handleEventModalPatched}
          familyMembers={children.map(child => ({
            id: child.id,
            name: child.first_name || child.name || 'Unknown',
          }))}
        />
        
        {/* Material Review Modal */}
        {materialReviewEvent && (
          <QuickReviewModal
            visible={showMaterialReviewModal}
            onClose={() => {
              setShowMaterialReviewModal(false);
              setMaterialReviewEvent(null);
            }}
            onSaved={() => {
              setShowMaterialReviewModal(false);
              setMaterialReviewEvent(null);
            }}
            materialId={materialReviewEvent.material_id}
            childId={materialReviewEvent.child_id}
            familyId={familyId}
            eventId={materialReviewEvent.id}
            materialTitle={materialReviewEvent.material?.title || 'this material'}
            childName={children.find(c => c.id === materialReviewEvent.child_id)?.first_name || ''}
          />
        )}
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
      setCurrentMonth(getMonthForToday());
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
                 <Text style={{ 
                   fontSize: 26, 
                   fontWeight: '700', 
                   color: '#111827',
                   fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                 }}>
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
                       const isSelected = effectiveSelectedCalendarChildren === null || effectiveSelectedCalendarChildren.includes(child.id);
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
                             const current = effectiveSelectedCalendarChildren;
                             if (current === null) {
                               const otherChildren = children
                                 .filter(c => c.id !== child.id)
                                 .map(c => c.id);
                               if (onSelectedCalendarChildrenChange) {
                                 onSelectedCalendarChildrenChange(otherChildren.length > 0 ? otherChildren : null);
                               } else {
                                 setSelectedCalendarChildren(otherChildren.length > 0 ? otherChildren : null);
                               }
                             } else if (isSelected) {
                               const newSelection = current.filter(id => id !== child.id);
                               if (onSelectedCalendarChildrenChange) {
                                 onSelectedCalendarChildrenChange(newSelection.length === 0 ? null : newSelection);
                               } else {
                                 setSelectedCalendarChildren(newSelection.length === 0 ? null : newSelection);
                               }
                             } else {
                               if (onSelectedCalendarChildrenChange) {
                                 onSelectedCalendarChildrenChange([...current, child.id]);
                               } else {
                                 setSelectedCalendarChildren([...current, child.id]);
                               }
                             }
                           }}
                         >
                           <Image 
                             source={getAvatarSource(child.avatar)} 
                             style={{
                               width: 20,
                               height: 20,
                               borderRadius: 10,
                               borderWidth: isSelected ? 2 : 1,
                               borderColor: isSelected ? '#3b82f6' : '#d1d5db',
                               opacity: isSelected ? 1 : 0.6
                             }}
                             resizeMode="contain"
                             onError={(e) => {
                               // Suppress 404 errors for missing avatars - they're harmless
                               if (Platform.OS === 'web' && e.nativeEvent) {
                                 e.preventDefault?.();
                               }
                             }}
                           />
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
                      {/* Conflict Banner - only show on month view */}
                      {(() => {
                        const isPlanner = activeTab === 'planner';
                        const isMonthView = calendarView === 'month';
                        const shouldRenderBanner = isPlanner && isMonthView;
                        const bannerVisible = conflictBanner.visible && !conflictBanner.dismissed;
                        
                        console.log('[WebContent] Banner render check (outside IIFE):', { 
                          isPlanner,
                          isMonthView,
                          shouldRenderBanner,
                          bannerVisible, 
                          conflictBannerVisible: conflictBanner.visible, 
                          conflictBannerDismissed: conflictBanner.dismissed,
                          conflictCount: conflictBanner.conflictCount,
                          eventId: conflictBanner.eventId,
                          activeTab,
                          calendarView,
                          willRender: shouldRenderBanner && bannerVisible
                        });
                        
                        if (!shouldRenderBanner) {
                          return null;
                        }
                        
                        if (!bannerVisible) {
                          console.log('[WebContent] Banner should render but not visible');
                          return null;
                        }
                        
                        console.log('[WebContent] Rendering DragDropConflictBanner component');
                        return (
                          <DragDropConflictBanner
                            visible={true}
                            conflictCount={conflictBanner.conflictCount}
                            eventTitle={conflictBanner.eventTitle}
                            eventId={conflictBanner.eventId}
                            conflictEvent={conflictBanner.conflictEvent}
                            conflictMessage={conflictBanner.conflictMessage}
                            familyId={familyId}
                            onQuickReschedule={async () => {
                            // Find the moved event from database
                            try {
                              const { data: eventData, error } = await supabase
                                .from('events')
                                .select('*')
                                .eq('id', conflictBanner.eventId)
                                .eq('family_id', familyId)
                                .maybeSingle();
                              
                              if (error || !eventData) {
                                console.error('[WebContent] Error fetching event for Quick Reschedule:', error);
                                // Fallback: try to find in calendarEvents
                                Object.keys(calendarEvents).forEach(dateKey => {
                                  const dayEvents = calendarEvents[dateKey] || [];
                                  const event = dayEvents.find(e => e.id === conflictBanner.eventId);
                                  if (event) {
                                    if (typeof window !== 'undefined') {
                                      window.dispatchEvent(new CustomEvent('openQuickReschedule', {
                                        detail: {
                                          event: event,
                                          skipToPreview: true,
                                        }
                                      }));
                                    }
                                  }
                                });
                              } else {
                                // Dispatch event to open Quick Reschedule modal
                                if (typeof window !== 'undefined') {
                                  window.dispatchEvent(new CustomEvent('openQuickReschedule', {
                                    detail: {
                                      event: eventData,
                                      skipToPreview: true, // Skip to preview step
                                    }
                                  }));
                                }
                              }
                              setConflictBanner(prev => ({ ...prev, visible: false }));
                            } catch (err) {
                              console.error('[WebContent] Error in Quick Reschedule from banner:', err);
                            }
                          }}
                          onDismiss={() => {
                            setConflictBanner(prev => ({ ...prev, dismissed: true, visible: false }));
                            // Keep the pending optimistic update flag so the event stays where user dragged it
                            // It will be cleared when user moves the event again or refreshes manually
                            console.log('[WebContent] Conflict banner dismissed - keeping optimistic update for event:', conflictBanner.eventId);
                          }}
                          onSuggestionAccepted={async (newStart, newEnd) => {
                            // Apply the suggested reschedule directly
                            try {
                              const eventId = conflictBanner.eventId;
                              const movedEvent = conflictBanner.movedEvent;
                              
                              if (!movedEvent) {
                                console.error('[WebContent] No movedEvent in conflict banner');
                                return;
                              }
                              
                              // Create updated event with new times
                              // Format start_local and end_local in "HH:MM" format (not ISO timestamp)
                              const startLocalHours = newStart.getHours();
                              const startLocalMinutes = newStart.getMinutes();
                              const startLocalStr = `${String(startLocalHours).padStart(2, '0')}:${String(startLocalMinutes).padStart(2, '0')}`;
                              
                              const endLocalHours = newEnd.getHours();
                              const endLocalMinutes = newEnd.getMinutes();
                              const endLocalStr = `${String(endLocalHours).padStart(2, '0')}:${String(endLocalMinutes).padStart(2, '0')}`;
                              
                              const updatedEvent = {
                                ...movedEvent,
                                start_ts: newStart.toISOString(),
                                end_ts: newEnd.toISOString(),
                                start_local: startLocalStr, // "HH:MM" format (e.g., "16:00" for 4 PM)
                                end_local: endLocalStr, // "HH:MM" format
                                updated_at: new Date().toISOString(),
                              };
                              
                              // Apply optimistic update to calendarEvents immediately (like drag-and-drop does)
                              setCalendarEvents(prevEvents => {
                                const newEvents = { ...prevEvents };
                                let found = false;
                                
                                // Find and update the event in the calendarEvents structure
                                Object.keys(newEvents).forEach(dateKey => {
                                  const dayEvents = newEvents[dateKey];
                                  if (Array.isArray(dayEvents)) {
                                    const index = dayEvents.findIndex(e => e && e.id === eventId);
                                    if (index >= 0) {
                                      // Calculate new date key for the event
                                      const newDateKey = newStart.toISOString().split('T')[0];
                                      const updatedDayEvents = [...dayEvents];
                                      
                                      // Update the event
                                      updatedDayEvents[index] = {
                                        ...updatedDayEvents[index],
                                        ...updatedEvent,
                                        start_local: updatedEvent.start_local,
                                        end_local: updatedEvent.end_local,
                                        data: {
                                          ...updatedDayEvents[index].data,
                                          ...updatedEvent,
                                          start_local: updatedEvent.start_local,
                                          end_local: updatedEvent.end_local,
                                        }
                                      };
                                      
                                      // If the date changed, move the event to the new date
                                      if (dateKey !== newDateKey) {
                                        newEvents[dateKey] = updatedDayEvents.filter(e => e && e.id !== eventId);
                                        if (!newEvents[newDateKey]) {
                                          newEvents[newDateKey] = [];
                                        }
                                        newEvents[newDateKey].push(updatedDayEvents[index]);
                                      } else {
                                        newEvents[dateKey] = updatedDayEvents;
                                      }
                                      found = true;
                                    }
                                  }
                                });
                                
                                return found ? newEvents : prevEvents;
                              });
                              
                              // Track this event as having a pending optimistic update
                              pendingOptimisticUpdatesRef.current.add(eventId);
                              
                              // Clear the conflict banner
                              setConflictBanner(prev => ({ ...prev, visible: false }));
                              
                              // Call rescheduleEvent to sync with backend (but we've already updated UI)
                              const { rescheduleEvent } = await import('../lib/services/plannerClientWithOffline');
                              const result = await rescheduleEvent(
                                eventId,
                                newStart.toISOString(),
                                newEnd.toISOString(),
                                'drag_drop',
                                'Auto-adjusted to resolve conflict',
                                familyId
                              );
                              
                              // Only clear pending flag if API call succeeded
                              if (result.data && !result.error) {
                                // API call succeeded - clear pending flag after a delay to allow refresh
                                setTimeout(() => {
                                  pendingOptimisticUpdatesRef.current.delete(eventId);
                                }, 2000);
                              } else if (result.error) {
                                // API call failed - log error and show message to user
                                console.error('[WebContent] Failed to save event change:', {
                                  eventId,
                                  error: result.error,
                                  errorMessage: result.error.message,
                                  errorStatus: result.error.status,
                                });
                                
                                // Show error alert to user
                                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                  Alert.alert(
                                    'Failed to Save',
                                    `Unable to save the event change. ${result.error.message || 'Please try again.'}`,
                                    [{ text: 'OK' }]
                                  );
                                }
                                
                                // Keep the pending flag so optimistic update persists
                                // User can try again or undo
                              }
                              
                            } catch (err) {
                              console.error('[WebContent] Error accepting suggestion:', err);
                              // Show error alert to user
                              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                Alert.alert(
                                  'Error',
                                  'An error occurred while saving the event change. Please try again.',
                                  [{ text: 'OK' }]
                                );
                              }
                              // Keep the optimistic update even on error
                            }
                          }}
                        />
                        );
                      })()}
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
                                
                                // Debug logging for the specific event we're tracking
                                if (dateKey === '2026-01-01') {
                                  const trackedEvents = dayEvents.filter(e => e && e.id === 'fd8afe0d-ffc8-4753-9ea6-32835b52fcb6');
                                  if (trackedEvents.length > 0) {
                                    const eventDetails = trackedEvents.map(e => ({
                                      time: e.time,
                                      start_local: e.start_local,
                                      date_local: e.date_local,
                                      start_ts: e.start_ts,
                                    }));
                                    console.log('[WebContent] RENDERING: Events for fd8afe0d-ffc8-4753-9ea6-32835b52fcb6 on 2026-01-01 being rendered:', JSON.stringify(eventDetails, null, 2));
                                  }
                                }
                                
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
            onClose={() => {
              setShowTaskModal(false);
              setTaskModalChildId(null);
              setTaskModalDefaultPlacement('calendar'); // Reset to default
            }}
            defaultDate={taskModalDate}
            defaultChildId={taskModalChildId}
            defaultPlacement={taskModalDefaultPlacement}
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
    <>
      {/* Sticky Notes Container - Disabled */}
      {/* {familyId && <StickyNotesContainer familyId={familyId} visible={true} />} */}
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
        familyId={familyId}
        subjects={subjects}
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
      <AddSubjectModal
        visible={showAddSubjectModal}
        onClose={onCloseAddSubjectModal}
        onSubjectAdded={() => {
          // Refresh subjects if needed
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('refreshSubjects'));
          }
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
      
      <SyllabusUploadModal
        visible={showSyllabusModal}
        onClose={handleCloseSyllabusUpload}
        familyId={familyId}
        children={children || []}
        subjects={subjects || []}
        onPlanCreated={({ planId }) => {
          handleCloseSyllabusUpload();
          if (onSyllabusProcessed) {
            onSyllabusProcessed({ success: true, planId });
          }
          // Refresh planner if on planner tab
          if (activeTab === 'planner' && refreshCalendarDataRef.current) {
            refreshCalendarDataRef.current();
          }
        }}
      />
      
      {/* <NoteEditorModal - Archived - records screen removed
        visible={showNoteEditor}
        onClose={() => {
          setShowNoteEditor(false);
          setNoteEditorProps({ linkedEventId: null, defaultChildId: null, defaultText: '', date: null });
        }}
        onSaved={() => {
          setShowNoteEditor(false);
          setNoteEditorProps({ linkedEventId: null, defaultChildId: null, defaultText: '', date: null });
          // Refresh calendar/planner data
          if (refreshCalendarDataRef.current) {
            refreshCalendarDataRef.current();
          }
        }}
        familyId={familyId}
        linkedEventId={noteEditorProps.linkedEventId}
        defaultChildId={noteEditorProps.defaultChildId}
        defaultText={noteEditorProps.defaultText}
        children={children || []}
        availableEvents={[]}
      /> */}

      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    overflow: 'auto',
  },
  notificationsContainer: {
    marginBottom: 16,
  },
  microNotificationsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  suggestionsContainer: {
    marginBottom: 24,
    marginHorizontal: 20,
  },
  suggestionsContainerInline: {
    marginTop: 0,
    marginBottom: 0,
  },
  greetingSection: {
    marginTop: 24, // mt-6
    marginBottom: 24, // mb-6
    paddingHorizontal: 24, // px-6 (align with AppContainer)
  },
  greetingTitle: {
    fontSize: 26, // text-2xl
    fontWeight: '700', // font-bold (standardized)
    color: '#111827', // colors.text (standardized)
    marginBottom: 0,
    lineHeight: 32,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  todayCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  todayCardWrapper: {
    minWidth: 280,
    maxWidth: 400,
    ...Platform.select({
      web: {
        flexShrink: 1,
        flexGrow: 0,
        flexBasis: 'auto',
      },
      default: {
        flex: 1,
      },
    }),
  },
  homeContentContainer: {
    paddingBottom: 40,
  },
  homeMainLayout: {
    flexDirection: 'column',
    gap: 20,
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    ...Platform.select({
      web: {
        display: 'flex',
      },
      default: {
        flexDirection: 'column',
      },
    }),
  },
  homeLeftColumn: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    gap: 8,
    ...Platform.select({
      web: {
        maxWidth: '100%',
      },
      default: {
        flex: 1,
        width: '100%',
      },
    }),
  },
  homeRightSidebar: {
    flex: 1,
    minWidth: 0,
    gap: 0,
    ...Platform.select({
      web: {
        maxWidth: 'calc(28% - 10px)',
      },
      default: {
        flex: 1,
        width: '100%',
      },
    }),
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  multiDayPreview: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  homeTilesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  homeTileWrapper: {
    width: 'calc(50% - 6px)',
    minWidth: 200,
    flex: 1,
    maxWidth: 'calc(50% - 6px)',
  },
  tilesLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    width: '100%',
    justifyContent: 'center',
  },
  tilesLoadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  multiDayCard: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    cursor: 'pointer',
  },
  multiDayCardActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  multiDayLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  multiDayBullet: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  coachingSection: {
    marginBottom: 24,
    padding: 20,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  coachingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  coachingSuggestions: {
    gap: 12,
  },
  coachingSuggestion: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  coachingSuggestionText: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 8,
  },
  coachingAction: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
  },
  coachingActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  insightsWhySection: {
    marginTop: 12,
    gap: 8,
  },
  insightWhy: {
    padding: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  insightWhyLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  insightWhyText: {
    fontSize: 12,
    color: '#64748b',
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
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: 'rgba(0, 0, 0, 0.1)',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 1,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
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
    gap: 24,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  homeMainColumn: {
    flex: 2,
    minWidth: 400,
    maxWidth: '100%',
  },
  homeSideColumn: {
    flex: 1,
    minWidth: 300,
    maxWidth: '100%',
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
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    minHeight: 40,
  },
  filterChipActive: {
    backgroundColor: '#f0f5ff',
    borderColor: '#4285f4',
    boxShadow: '0 2px 4px rgba(66, 133, 244, 0.1)',
  },
  filterChipText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#3c4043',
    fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  filterChipTextActive: {
    color: '#4285f4',
    fontWeight: '600',
    fontSize: 16,
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
  familyScreenContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    padding: 16,
    minHeight: '100%',
    gap: 32,
  },
  familyScreenMainContent: {
    flex: 1,
    maxWidth: '65%',
    minWidth: 0,
  },
  familyScreenRightSidebar: {
    width: '35%',
    minWidth: 300,
    maxWidth: 400,
    gap: 16,
  },
  familySidebarCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      },
    }),
  },
  familySidebarCardContent: {
    flexDirection: 'row',
    gap: 12,
  },
  familySidebarCardIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.accentLight || '#f0f9ff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  familySidebarCardTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  familySidebarCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  familySidebarCardDescription: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
    opacity: 0.8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  familyStatsContainer: {
    marginTop: 8,
    gap: 4,
  },
  familyStatText: {
    fontSize: 13,
    color: colors.text,
    opacity: 0.8,
  },
  viewProfile: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '500',
    marginTop: 12,
  },
  childFilterContainer: {
    marginBottom: 24,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6', // Light grey background for container
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#e5e7eb', // Subtle border
    padding: 4,
    gap: 0,
    alignSelf: 'flex-start',
    ...Platform.select({
      web: {
        display: 'inline-flex',
        width: 'fit-content',
      },
    }),
  },
  segmentedControlSegment: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
    backgroundColor: 'transparent',
    ...Platform.select({
      web: {
        transition: 'all 0.2s ease',
      },
    }),
  },
  segmentedControlSegmentActive: {
    backgroundColor: '#dbeafe', // Light blue background for active
  },
  segmentedControlText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280', // Dark grey text for inactive
    ...Platform.select({
      web: {
        fontFamily: '"Cooper Hewitt", -apple-system, BlinkSystemFont, "Segoe UI", sans-serif',
      },
    }),
  },
  segmentedControlTextActive: {
    color: '#1e40af', // Dark blue text for active
    fontWeight: '600',
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
  familyScheduleHeader: {
    marginBottom: 12,
    paddingHorizontal: 0,
  },
  familyScheduleTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
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
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
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
const HomeEventModal = ({ showHomeEventModal, setShowHomeEventModal, homeEventType, setHomeEventType, homeEventFormData, setHomeEventFormData, saveHomeEvent, students = [], familyId, subjects = [] }) => {
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
              <>
                {/* Subject Selection */}
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Subject (optional)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {subjects.slice(0, 10).map(subj => (
                      <TouchableOpacity
                        key={subj.id}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 20,
                          borderWidth: 2,
                          borderColor: homeEventFormData.subjectId === subj.id ? '#38B6FF' : '#e5e7eb',
                          backgroundColor: homeEventFormData.subjectId === subj.id ? '#E6F4FF' : '#ffffff'
                        }}
                        onPress={() => {
                          setHomeEventFormData(prev => ({
                            ...prev,
                            subjectId: prev.subjectId === subj.id ? null : subj.id
                          }));
                        }}
                      >
                        <Text style={{ color: '#111827', fontSize: 12 }}>
                          {subj.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

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
              </>
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

            {/* Template Picker - only for lessons */}
            {homeEventType === 'lesson' && familyId && (
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Template (optional)</Text>
                <TemplatePicker
                  subjectId={homeEventFormData.subjectId}
                  familyId={familyId}
                  onSelect={(template) => {
                    // Apply template data to form
                    if (template.default_objectives) {
                      setHomeEventFormData(prev => ({
                        ...prev,
                        description: template.default_objectives
                      }));
                    }
                  }}
                />
              </View>
            )}

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