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
import { getSubjectsWithOverview, getSubjectDetail } from '../lib/services/subjectsClient'
import { getHolidaysForRange, getEventForPlanSlot } from '../lib/services/academicYearClient'
import { completeEvent, updateEventStatus } from '../lib/services/attendanceClient'

// Set up error suppression immediately on module load (before React renders)
// This catches errors that occur during initial page load
// Only run on web where both window and document exist
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
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
              // Check for UUIDs with or without suffixes (like -day-0)
              const uuidWithSuffixPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z0-9-]+)?$/i;
              const isJustUuid = (uuidPattern.test(value) || uuidWithSuffixPattern.test(value)) && !value.includes('http') && !value.includes('data:');
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
              // Check for UUIDs with or without suffixes (like -day-0)
              const uuidWithSuffixPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z0-9-]+)?$/i;
              const isJustUuid = (uuidPattern.test(value) || uuidWithSuffixPattern.test(value)) && !value.includes('http') && !value.includes('data:');
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
                // Check for UUIDs with or without suffixes (like -day-0)
                const uuidWithSuffixPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z0-9-]+)?$/i;
                const isJustUuid = (uuidPattern.test(value) || uuidWithSuffixPattern.test(value)) && !value.includes('http') && !value.includes('data:');
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
    const uuidWithSuffixPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z0-9-]+)?$/i;
    
    // Recursively clean invalid UUID URLs in cached data
    const cleanData = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(cleanData);
      } else if (obj && typeof obj === 'object') {
        const cleaned = {};
        for (const [k, v] of Object.entries(obj)) {
          // Check avatar fields, url fields, and thumbnailUrl fields
          if ((k === 'avatar_url' || k === 'avatar' || k === 'url' || k === 'thumbnailUrl') && typeof v === 'string') {
            // Remove invalid UUIDs (with or without suffixes like -day-0)
            if ((uuidPattern.test(v.trim()) || uuidWithSuffixPattern.test(v.trim())) && !v.includes('http') && !v.includes('data:')) {
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
import { createEventViaSupabaseRpc, deleteEvent as deletePlannerEvent, restoreEventFromTrash, permanentlyDeleteTrashEvent } from '../lib/services/plannerClientWithOffline'
import {
  prefetchWeekViewIntoOffline,
  prefetchBacklogAndTrash,
  prefetchPlannerAttendanceSnapshot,
  prefetchPlanEditListForFamily,
} from '../lib/services/plannerPrefetch'
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
import AddMaterialModal from './materials/AddMaterialModal'
import RebalanceModal from './year/RebalanceModal'
import EventOutcomeModal from './events/EventOutcomeModal'
import ConfirmDialog from './ConfirmDialog'
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
import FamilyPanel from './settings/FamilyPanel'
import ChildMicroWorldCard from './home/ChildMicroWorldCard'
import ParentCoachingCards from './home/ParentCoachingCards'
import CollapsedInsightsSection from './home/CollapsedInsightsSection'
import HomeTileMissingLogs from './home/tiles/HomeTileMissingLogs'
import HomeTilePortfolioSuggestions from './home/tiles/HomeTilePortfolioSuggestions'
import HomeTileAreasOfMastery from './home/tiles/HomeTileAreasOfMastery'
import HomeTileReflectionPrompt from './home/tiles/HomeTileReflectionPrompt'
import QuickAddCard from './home/QuickAddCard'
import TodayHeroCard from './home/TodayHeroCard'
import TodayScheduleCard from './home/TodayScheduleCard'
import BacklogCard from './home/BacklogCard'
import WeeklyPulseCard from './home/WeeklyPulseCard'
import ThisWeekStrip from './home/ThisWeekStrip'
import ParentDigestModal from './home/ParentDigestModal'
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
// NOTE: schedule_overrides removed - Schedule Rules feature disabled
// import ScheduleRulesButton from './ScheduleRulesButton'
import PlannerButton from './PlannerButton'
// import ScheduleRulesView from './ScheduleRulesView'
import AIPlannerView from './AIPlannerView'
import PageHeader from './PageHeader'
import StoriesRow from './home/StoriesRow'
import TodaysLearning from './home/TodaysLearning'
import TodaysLearningTimeGrouped from './home/TodaysLearningTimeGrouped'
import DailyConnectionUnified from './home/DailyConnectionUnified'
import TodayCard from './home/TodayCard'
import WeeklyProgress from './home/WeeklyProgress'
import DailyInsights from './home/DailyInsights'
import AnimatedIcon from './AnimatedIcon'
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
import SchedulingAssistant from './planner/SchedulingAssistant'
import ChildProfile from './ChildProfile'
import ChildHomeScreen from './child/ChildHomeScreen'
// import Attendance from './records/Attendance' // Archived - records screen removed
import Uploads from './documents/Uploads'
import UploadsEnhanced from './documents/UploadsEnhanced'
// import DocumentsEnhanced from './documents/DocumentsEnhanced' // Causes bundler issues
import LessonPlans from './lesson-plans/LessonPlans'
// import Reports from './records/Reports' // Archived - records screen removed
// import RecordsPhase4 from './records/RecordsPhase4' // Archived - records screen removed
// import WebRecordsScreen from './records/WebRecordsScreen' // Archived - records screen removed
import PortfolioTimeline from './portfolio/PortfolioTimeline'
import ReviewInboxScreen from './parent/ReviewInboxScreen'
import MaterialsLibrary from './materials/MaterialsLibrary'
// Archived: import IntelligenceHub from './intelligence/IntelligenceHub'
import SubjectDetailPage from './subjects/SubjectDetailPage'
import SubjectsPage from './subjects/SubjectsPage'
import { getMaterials } from '../lib/services/materialsClient'
import CoachTab from './ai/CoachTab'
import ProfileScreen from '../app/profile';
import ComprehensiveProfile from './profile/ComprehensiveProfile';
import SettingsScreen from './settings/SettingsScreen';
import SectionHeader from './ui/SectionHeader'
import SuggestionActionModal from './planner/SuggestionActionModal'
// import NoteEditorModal from './records/NoteEditorModal' // Archived - records screen removed
import CurriculumImportWizard from './curriculum/CurriculumImportWizard'
import { colors, shadows, getShadow } from '../theme/colors'

import SubjectSelectForm from './SubjectSelectForm'
import TemplatePicker from './templates/TemplatePicker'
import { getSubjectRecommendations, processLiveClass, analyzeProgress, chatWithDoodleBot } from '../lib/aiProcessor.js'
import { AIConversationService } from '../lib/aiConversationService.js'
import { processDoodleMessage, executeTool, getDisplayMessage, getToolName, getToolParams } from '../lib/doodleAssistant.js'
import { useOfflineSync } from '../lib/hooks/useOfflineSync'
import { detectConflicts } from '../lib/utils/conflictDetection'
import DragDropConflictBanner from './planner/DragDropConflictBanner'
import PlanHealthBanner from './planner/PlanHealthBanner'

import ParentHomeScreen from './home/ParentHomeScreen';

export default function WebContent({ activeTab, activeSubtab, activeChildId: propActiveChildId = null, activeChildSection, user, onChildAdded, navigation, showSyllabusUpload, onSyllabusProcessed, onCloseSyllabusUpload, onTabChange, onSubtabChange, pendingDoodlePrompt, onConsumeDoodlePrompt, showAddChildModal, onCloseAddChildModal, showAddSubjectModal, onCloseAddSubjectModal, onRightSidebarRender, onOpenSettings, onEditChild, onAddSyllabus, onHomeLoadingChange, onPlannerLoadingChange, onSubjectsLoadingChange, onMaterialsLoadingChange, selectedCalendarChildren: propSelectedCalendarChildren, onSelectedCalendarChildrenChange, selectedEventTypes: propSelectedEventTypes, onSelectedEventTypesChange, onCurrentMonthChange, onCalendarViewChange, plannerView: propPlannerView = 'month', subjects: propSubjects = [], fullSubjects: propFullSubjects = [], familyId: propFamilyId = null, children: propChildren = [], family: propFamily = null, onFamilyUpdate = null, profile: propProfile = null, session: propSession = null, preloadedPlanHealth: propPreloadedPlanHealth = null }) {
  // Helper function to validate and clean avatar URLs
  // Filters out UUIDs that aren't valid URLs to prevent 404 errors
  const validateAvatarUrl = (url) => {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    
    // Check if it's just a UUID (invalid URL format) or UUID with suffix (like -day-0)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidWithSuffixPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z0-9-]+)?$/i;
    if (uuidPattern.test(trimmed) || uuidWithSuffixPattern.test(trimmed)) {
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
        useNativeDriver: Platform.OS !== 'web',
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
  const [hasAnyEvents, setHasAnyEvents] = useState(null); // null = not checked yet, true/false = checked
  const [showParentDigest, setShowParentDigest] = useState(false);
  
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

  // Scheduling Assistant (Outlook-style) modal state
  const [showSchedulingAssistant, setShowSchedulingAssistant] = useState(false);
  const [schedulingAssistantSeedEvent, setSchedulingAssistantSeedEvent] = useState(null);
  const [schedulingAssistantChildId, setSchedulingAssistantChildId] = useState(null);
  const [schedulingAssistantWeekStart, setSchedulingAssistantWeekStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    // Sunday start to match WeekGrid
    d.setDate(d.getDate() - d.getDay());
    return d;
  });
  
  
  // Adaptive layout tier (1 = base, 2 = expanded, 3 = full)
  const [rightSidebarTier, setRightSidebarTier] = useState(1);
  const rightSidebarRef = useRef(null);
  
  // Family ID state (must be declared early to avoid TDZ errors)
  // Use propFamilyId if provided; fallback to session.family_id so home/planner have familyId on first paint
  const [familyId, setFamilyId] = useState(propFamilyId || propSession?.family_id || null);
  
  // Materials cache for pre-loading
  const [materialsCache, setMaterialsCache] = useState(null);
  const [materialsCacheTimestamp, setMaterialsCacheTimestamp] = useState(null);
  const [materialsCacheLoading, setMaterialsCacheLoading] = useState(false);
  
  // Pre-load materials when familyId is available (report to parent for initial load overlay)
  useEffect(() => {
    if (!familyId) {
      onMaterialsLoadingChange?.(false);
      return;
    }
    if (materialsCacheLoading) return;

    // Only pre-load if cache is empty or older than 5 minutes
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    const shouldPreload = !materialsCache ||
                         !materialsCacheTimestamp ||
                         (Date.now() - materialsCacheTimestamp > CACHE_TTL);

    if (shouldPreload) {
      setMaterialsCacheLoading(true);
      onMaterialsLoadingChange?.(true);
      getMaterials(familyId, {}, propSession)
        .then(data => {
          setMaterialsCache(data);
          setMaterialsCacheTimestamp(Date.now());
        })
        .catch(err => {
          console.warn('[WebContent] Error pre-loading materials:', err);
        })
        .finally(() => {
          setMaterialsCacheLoading(false);
          onMaterialsLoadingChange?.(false);
        });
    } else {
      onMaterialsLoadingChange?.(false);
    }
  }, [familyId, materialsCache, materialsCacheTimestamp, materialsCacheLoading, onMaterialsLoadingChange]);
  
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

  // Helper to clean invalid avatar/image UUIDs from data (stops 404s when these are used as Image uri)
  const cleanAvatarUrls = (data) => {
    if (!data) return data;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidWithSuffixPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z0-9-]+)?$/i;
    const imageUrlKeys = ['avatar_url', 'avatar', 'url', 'thumbnailUrl', 'cover_image_url'];
    const isInvalidImageUrl = (v) => typeof v === 'string' && (uuidPattern.test(v.trim()) || uuidWithSuffixPattern.test(v.trim())) && !v.includes('http') && !v.includes('data:');
    const cleanValue = (val) => {
      if (Array.isArray(val)) {
        return val.map(cleanValue);
      } else if (val && typeof val === 'object') {
        const cleaned = {};
        for (const [k, v] of Object.entries(val)) {
          if (imageUrlKeys.includes(k) && typeof v === 'string') {
            cleaned[k] = isInvalidImageUrl(v) ? null : v;
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
      const isFamilyScreen = activeTab === 'profile' || activeTab === 'settings' ||
                            (activeTab && typeof activeTab === 'string' && activeTab.startsWith('child-')) ||
                            (activeTab && typeof activeTab === 'string' && activeTab.startsWith('notes-pages-')) ||
                            activeTab === 'children-list';

      if (isFamilyScreen) return;
      
      // Only handle for non-family screens (planner, home, etc.)
      const date = detail.date || new Date();
      const incomingChildIds = detail.childIds && Array.isArray(detail.childIds)
        ? detail.childIds
        : (detail.childId ? [detail.childId] : []);
      const primaryChildId = incomingChildIds.length > 0 ? incomingChildIds[0] : null;
      const subjectId = detail.subjectId || null;
      
      setTaskModalDate(date);
      setTaskModalChildIds(incomingChildIds);
      setTaskModalChildId(primaryChildId);
      setTaskModalDefaultSubjectId(subjectId);
      setTaskModalDefaultEventType(detail.eventType || null);
      setTaskModalDefaultPlacement(detail.placement || 'calendar');
      setShowTaskModal(true);
    };
    
    window.addEventListener('openTaskModal', handleOpenTaskModal);
    return () => window.removeEventListener('openTaskModal', handleOpenTaskModal);
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
      const isFamilyScreen = activeTab === 'profile' || activeTab === 'settings' ||
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

  // Listen for openEventForPlanSlot (from Plan Year plan summary "Dates with events" row click)
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const normalizeTime = (t) => {
      if (t == null || t === '') return '';
      const s = String(t).trim();
      const m = s.match(/^(\d{1,2}):(\d{2})/);
      return m ? `${String(parseInt(m[1], 10))}:${m[2]}` : s.replace(/^0(?=\d:)/, '');
    };

    const findMatch = (eventsByDate, dateYmd, startLocal, subjectId, subjectName) => {
      const dayEvents = eventsByDate[dateYmd] || [];
      const nStart = normalizeTime(startLocal);
      return dayEvents.find((e) => {
        if (!e || !e.id) return false;
        const subjectMatch = subjectId != null && (String(e.subject_id) === String(subjectId) || (e.subject_name && subjectName && String(e.subject_name).trim() === String(subjectName).trim()));
        if (!subjectMatch) return false;
        if (startLocal == null) return true; // all-day
        const et = normalizeTime(e.start_local || e.time);
        return et === nStart || (e.start_local === startLocal) || (e.time === startLocal);
      });
    };

    const handleOpenEventForPlanSlot = async (event) => {
      const detail = event.detail || {};
      const { dateYmd, startLocal, subjectId, academicYearId, subjectName } = detail;
      if (!dateYmd) return;
      if (__DEV__) console.log('[WebContent] openEventForPlanSlot received', { dateYmd, startLocal, subjectId, subjectName });

      let eventsByDate = calendarEventsRef.current || {};
      let match = findMatch(eventsByDate, dateYmd, startLocal, subjectId, subjectName);

      // If no match, fetch that month with all children so we get every event (calendar filter may hide the plan's assignee)
      if (!match && refreshCalendarDataRef.current) {
        try {
          const slotDate = new Date(dateYmd + 'T12:00:00');
          if (!isNaN(slotDate.getTime())) {
            await refreshCalendarDataRef.current(slotDate, { background: true, allChildren: true });
            // Wait for state/ref to update after setCalendarEvents (React may batch)
            await new Promise((r) => setTimeout(r, 400));
            eventsByDate = calendarEventsRef.current || {};
            match = findMatch(eventsByDate, dateYmd, startLocal, subjectId, subjectName);
            if (!match) {
              await new Promise((r) => setTimeout(r, 300));
              eventsByDate = calendarEventsRef.current || {};
              match = findMatch(eventsByDate, dateYmd, startLocal, subjectId, subjectName);
            }
          }
        } catch (err) {
          console.warn('[WebContent] openEventForPlanSlot: refresh failed', err);
        }
      }

      if (match) {
        setShowNewEventForm(false);
        setShowTaskModal(false);
        setEventModalEventId(match.id);
        setEventModalInitialEvent(match);
        setEventModalVisible(true);
        // Also dispatch openEventModal so WebLayout's global EventModal opens (same as calendar event click)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('openEventModal', { detail: { eventId: match.id, initialEvent: match } }));
        }
        if (__DEV__) console.log('[WebContent] openEventForPlanSlot: opened event modal', match.id);
        return;
      }

      // No match in calendar cache: look up event by plan slot (slots are created as full events when plan is applied)
      if (familyId && academicYearId) {
        try {
          const { data: slotData, error: slotErr } = await getEventForPlanSlot({
            familyId,
            dateYmd,
            startLocal: startLocal || undefined,
            subjectId: subjectId || '',
            academicYearId,
          });
          if (!slotErr && slotData?.event) {
            const ev = slotData.event;
            setShowNewEventForm(false);
            setShowTaskModal(false);
            setEventModalEventId(ev.id);
            setEventModalInitialEvent(ev);
            setEventModalVisible(true);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('openEventModal', { detail: { eventId: ev.id, initialEvent: ev } }));
            }
            if (__DEV__) console.log('[WebContent] openEventForPlanSlot: opened event modal from slot API', ev.id);
            return;
          }
        } catch (err) {
          if (__DEV__) console.warn('[WebContent] openEventForPlanSlot: event_for_slot API failed', err);
        }
      }

      // Slot has no event yet (e.g. plan not applied): open new-event modal with slot prefilled
      if (typeof window !== 'undefined') {
        const slotDate = new Date(dateYmd + 'T12:00:00');
        if (!isNaN(slotDate.getTime())) {
          const startTimeDisplay = startLocal && /^\d{1,2}:\d{2}/.test(String(startLocal))
            ? (() => {
                const [h, m] = String(startLocal).split(':').map((n) => parseInt(n, 10));
                const hour = h % 12 || 12;
                const ampm = h < 12 ? 'AM' : 'PM';
                return `${hour}:${String(m || 0).padStart(2, '0')} ${ampm}`;
              })()
            : null;
          window.dispatchEvent(new CustomEvent('openTaskModal', {
            detail: {
              date: slotDate,
              subjectId: subjectId || null,
              startTime: startTimeDisplay,
            },
          }));
          if (__DEV__) console.log('[WebContent] openEventForPlanSlot: opened task modal for slot (no event found)');
        }
      }
    };

    window.addEventListener('openEventForPlanSlot', handleOpenEventForPlanSlot);
    return () => window.removeEventListener('openEventForPlanSlot', handleOpenEventForPlanSlot);
  }, [familyId]);

  // Listen for openAddMaterialModal event
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleOpenAddMaterialModal = (event) => {
      const detail = event.detail || {};
      const subjectId = detail.subjectId || null;
      const subjectName = detail.subjectName || null;
      const childIds = detail.childIds && Array.isArray(detail.childIds)
        ? detail.childIds
        : (detail.childId ? [detail.childId] : []);
      
      console.log('[WebContent] openAddMaterialModal event received:', { subjectId, subjectName, childIds, activeTab });
      
      setAddMaterialModalDefaultSubjectId(subjectId);
      setAddMaterialModalDefaultSubjectName(subjectName);
      setAddMaterialModalDefaultChildIds(childIds);
      setShowAddMaterialModal(true);
    };
    
    window.addEventListener('openAddMaterialModal', handleOpenAddMaterialModal);
    
    return () => {
      window.removeEventListener('openAddMaterialModal', handleOpenAddMaterialModal);
    };
  }, [activeTab]);
  
  // Listen for optimistic event reschedule updates
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleEventRescheduled = async (event) => {
      const { eventId, updatedEvent, apiError, dropStartTime, fromApi } = event.detail || {};
      if (!eventId || !updatedEvent) return;

      // API success: patch state with saved event and skip full refetch
      if (fromApi) {
        lastMergeFromApiRef.current = { eventId, at: Date.now() };
        pendingOptimisticUpdatesRef.current.delete(eventId);
        const saved = updatedEvent;
        const newDateKey = saved.date_local || (() => {
          const d = new Date(saved.start_ts || saved.start || saved.start_local);
          return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
        })();
        setCalendarEvents((prevEvents) => {
          const newEvents = { ...prevEvents };
          let found = false;
          Object.keys(newEvents).forEach((dateKey) => {
            const dayEvents = newEvents[dateKey];
            if (!Array.isArray(dayEvents)) return;
            const index = dayEvents.findIndex((e) => e && e.id === eventId);
            if (index < 0) return;
            found = true;
            const patched = { ...dayEvents[index], ...saved, date_local: newDateKey || dateKey };
            if (newDateKey === dateKey) {
              const updated = [...dayEvents];
              updated[index] = patched;
              newEvents[dateKey] = updated;
            } else {
              newEvents[dateKey] = dayEvents.filter((e) => e.id !== eventId);
              if (!newEvents[newDateKey]) newEvents[newDateKey] = [];
              newEvents[newDateKey] = [...newEvents[newDateKey], patched];
            }
          });
          return found ? newEvents : prevEvents;
        });
        return;
      }
      const t0 = typeof performance !== 'undefined' && dropStartTime != null ? (performance.now() - dropStartTime).toFixed(0) : '?';
      console.log('[WebContent] [drag-timing] t+' + t0 + 'ms eventRescheduled received');

      // Apply optimistic update first so the event appears to land immediately; flushSync on web so it paints in same tick
      const applyOptimistic = () => {
        setCalendarEvents(prevEvents => {
          const newEvents = { ...prevEvents };
          let found = false;
          const newDateKey = updatedEvent.date_local || (() => {
            const d = new Date(updatedEvent.start_ts || updatedEvent.start || updatedEvent.start_local);
            return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
          })();
          Object.keys(newEvents).forEach(dateKey => {
            const dayEvents = newEvents[dateKey];
            if (Array.isArray(dayEvents)) {
              const index = dayEvents.findIndex(e => e && e.id === eventId);
              if (index >= 0) {
                const updatedDayEvents = [...dayEvents];
                const preservedStartLocal = updatedEvent.start_local || updatedDayEvents[index].start_local;
                const preservedEndLocal = updatedEvent.end_local || updatedDayEvents[index].end_local;
                const preservedTime = updatedEvent.time || updatedEvent.start_local || updatedDayEvents[index].time;
                updatedDayEvents[index] = {
                  ...updatedDayEvents[index],
                  ...updatedEvent,
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
                newEvents[dateKey] = updatedDayEvents;
                found = true;
                if (newDateKey && newDateKey !== dateKey) {
                  newEvents[dateKey] = updatedDayEvents.filter(e => e.id !== eventId);
                  if (!newEvents[newDateKey]) newEvents[newDateKey] = [];
                  const movedEvent = {
                    ...updatedDayEvents[index],
                    date_local: newDateKey,
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
                }
              }
            }
          });
          // Event may come from cache only (not in calendarEvents); still add to new date so it shows in correct cell
          if (!found && newDateKey) {
            const withDateLocal = { ...updatedEvent, date_local: newDateKey };
            newEvents[newDateKey] = [...(newEvents[newDateKey] || []), withDateLocal];
            return newEvents;
          }
          return found ? newEvents : prevEvents;
        });
      };
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          const { flushSync } = require('react-dom');
          if (typeof flushSync === 'function') flushSync(applyOptimistic);
          else applyOptimistic();
        } catch (_) {
          applyOptimistic();
        }
      } else {
        applyOptimistic();
      }
      const t1 = typeof performance !== 'undefined' && dropStartTime != null ? (performance.now() - dropStartTime).toFixed(0) : '?';
      console.log('[WebContent] [drag-timing] t+' + t1 + 'ms optimistic update applied');

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
      
      // If same event dragged again after a while, we'll add it to pending again below; no need to clear here.
      
      // Always run conflict detection, even for optimistic updates
      // The debounce timeout will handle rapid successive drags
      // We need to check for conflicts even if the API hasn't responded yet
      // console.log('[WebContent] Running conflict detection:', {
      //   eventId,
      //   isSameEvent,
      //   timeSinceLastDrag,
      //   apiError: !!apiError,
      //   willRun: true
      // });
      
      // Store this drag for debouncing
      lastDragEventRef.current = {
        eventId,
        timestamp: Date.now(),
      };
      
      // Short debounce for conflict detection (we use optimistic data if event not in DB yet)
      console.log('[WebContent] [drag-timing] scheduling conflict detection in 50ms');
      dragDebounceTimeoutRef.current = setTimeout(async () => {
        const tConflictStart = typeof performance !== 'undefined' && dropStartTime != null ? (performance.now() - dropStartTime).toFixed(0) : '?';
        console.log('[WebContent] [drag-timing] t+' + tConflictStart + 'ms conflict detection started');
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
          const tFetch = typeof performance !== 'undefined' && dropStartTime != null ? (performance.now() - dropStartTime).toFixed(0) : '?';
          console.log('[WebContent] [drag-timing] t+' + tFetch + 'ms conflict detection fetch done');
          
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
                              // console.log(`[WebContent] Removed optimistic update from cache BEFORE calendarEvents update: ${eventId} from ${cacheDateKey} (${beforeCount} -> ${afterCount} events)`);
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
                      
                      // console.log(`[WebContent] Before removal - event ${eventId} exists on dates:`, datesWithEvent, 'with times:', eventsByDate);
                      
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
                              // console.log(`[WebContent] Removing event ${eventId} from ${prevDateKey} (optimistic update or stale data) - time was: ${eventTime}`);
                              return false;
                            }
                            return true;
                          });
                          const afterCount = newEvents[prevDateKey].length;
                          if (beforeCount > afterCount) {
                            // console.log(`[WebContent] Removed event ${eventId} from ${prevDateKey} (${beforeCount} -> ${afterCount} events)`);
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
                        // console.log(`[WebContent] Target date ${dateKey} has ${beforeRemoveEvents.length} instance(s) of event ${eventId} BEFORE removal:`, 
                        //   beforeRemoveEvents.map(e => ({ time: e.time, start_local: e.start_local, start_ts: e.start_ts }))
                        // );
                      } else {
                        // console.log(`[WebContent] Target date ${dateKey} has NO instances of event ${eventId} before removal (total events on date: ${(newEvents[dateKey] || []).length})`);
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
                        // console.log(`[WebContent] Removed ${beforeAddCount - afterFilterCount} existing event(s) ${eventId} from ${dateKey} before adding database version (${beforeAddCount} -> ${afterFilterCount} events)`);
                      }
                      
                      // Now add the database event
                      newEvents[dateKey].push(formattedEvent);
                      // console.log(`[WebContent] Added database event ${eventId} to ${dateKey} with time ${formattedEvent.time} (${formattedEvent.start_local})`);
                      
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
                      
                      // console.log('[WebContent] Updated calendarEvents with database event (conflict detected):', {
                      //   eventId,
                      //   dateKey,
                      //   start_local: startLocalStr,
                      //   time: formattedEvent.time,
                      //   start_ts: currentEvent.start_ts,
                      //   localDate: `${year}-${month}-${day}`,
                      //   utcDate: eventDate.toISOString().split('T')[0],
                      //   formattedEventDate: formattedEvent.date_local,
                      //   removedFromDates: datesWithEvent,
                      //   finalDatesWithEvent: finalDatesWithEvent,
                      //   shouldBeOnlyOn: [dateKey],
                      //   correct: finalDatesWithEvent.length === 1 && finalDatesWithEvent[0] === dateKey,
                      //   eventsOnTargetDateAfterAdd: eventsOnTargetDate.length,
                      //   eventInstancesOnTargetDate: eventTimesOnTargetDate,
                      //   hasMultipleInstances: eventTimesOnTargetDate.length > 1,
                      // });
                      
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
                            // console.log(`[WebContent] Removing duplicate instance with time ${e.time} (${e.start_local}), keeping database version ${formattedEvent.time} (${startLocalStr})`);
                          }
                          return matches;
                        });
                        const afterFix = newEvents[dateKey].length;
                        // console.log(`[WebContent] Fixed: Removed duplicate instances (${beforeFix} -> ${afterFix} events), kept only database version`);
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
                            // console.log(`[WebContent] Replaced wrong instance with database version`);
                          }
                        }
                      }
                      
                      return newEvents;
                    });
                    
                    // Mark this event as recently fetched from database (extend timeout to 10 seconds)
                    // Note: This was already set above before calendarEvents update, and cache was already cleaned
                    
                    setTimeout(() => {
                      recentlyFetchedFromDbRef.current.delete(eventId);
                      // console.log('[WebContent] Removed recentlyFetchedFromDb flag for event:', eventId);
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
                                // console.log(`[WebContent] Verification: Removed event ${eventId} from ${d} (${beforeCount} -> ${afterCount} events)`);
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
                            // console.log(`[WebContent] Verification: Removed ${beforeRemove - afterRemove} instance(s) of event ${eventId} from ${correctDateKey} (had wrong time)`);
                          }
                          
                          // Now add the database version
                          newEvents[correctDateKey].push(dbEventForVerification);
                          // console.log(`[WebContent] Verification: Added/Replaced event ${eventId} on ${correctDateKey} with correct time ${dbEventForVerification.time} (${dbEventForVerification.start_local})`);
                          
                          // Verify again
                          const finalDates = Object.keys(newEvents).filter(d => {
                            const dayEvents = newEvents[d];
                            return Array.isArray(dayEvents) && dayEvents.some(e => e && e.id === eventId);
                          });
                          // console.log('[WebContent] Verification complete:', {
                          //   eventId,
                          //   finalDates,
                          //   shouldBeOn: correctDateKey,
                          //   correct: finalDates.length === 1 && finalDates[0] === correctDateKey,
                          // });
                          
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
              // console.log('[WebContent] No conflicts - clearing pending optimistic update for event:', eventId);
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
        const tConflictEnd = typeof performance !== 'undefined' && dropStartTime != null ? (performance.now() - dropStartTime).toFixed(0) : '?';
        console.log('[WebContent] [drag-timing] t+' + tConflictEnd + 'ms conflict detection done');
      }, 100); // Brief delay; we use optimistic position if DB not updated yet
    };
    
    const handleEventRescheduleError = async (event) => {
      const { eventId, error } = event.detail || {};
      if (!eventId) return;
      
      // For 500 errors (backend/permission issues), don't revert here
      // These should be handled by the conflict detection flow which keeps the optimistic update visible
      if (error && error.status === 500) {
        // console.log('[WebContent] 500 error in handleEventRescheduleError - not reverting, should be handled by conflict detection');
        return;
      }
      
      // console.log('[WebContent] Reverting optimistic update for event:', eventId);
      
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
  // Track events that were just merged from API (reschedule success) so we can skip full month refetch
  const lastMergeFromApiRef = useRef(null); // { eventId, at }
  // Track events that were just updated from database to prevent merge from overwriting
  const recentlyFetchedFromDbRef = useRef(new Map()); // Map<eventId, timestamp>
  // Ref for planner visible date so refresh handler can read it without plannerDate in deps (plannerDate is declared later)
  const plannerDateRef = useRef(null);

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
          // console.log('[WebContent] Clearing pending optimistic update for event:', eventId);
          pendingOptimisticUpdatesRef.current.delete(eventId);
        }
      };
    }
  }, []);

  // Load month view into calendarDataCache and calendarEvents (used by planner/calendar tabs).
  // Fetches month events and holidays in parallel so holidays appear with other events on load (no delay).
  // options.preserveEventId: when set (e.g. after drag-drop), keep this event's position from current state
  // so a stale refetch doesn't overwrite the optimistic update and make the event "jump back".
  // options.background: when true (e.g. post-drag refetch), skip loading state so UI stays responsive.
  const refreshCalendarData = useCallback(async (dateOrNull, options = {}) => {
    if (!familyId) return Promise.resolve();
    const dropStartTime = options.dropStartTime;
    const background = options.background === true;
    if (dropStartTime != null && typeof performance !== 'undefined') {
      console.log('[WebContent] [drag-timing] t+' + (performance.now() - dropStartTime).toFixed(0) + 'ms refreshCalendarData started');
    }
    const date = dateOrNull && (dateOrNull instanceof Date ? !isNaN(dateOrNull.getTime()) : true)
      ? (dateOrNull instanceof Date ? dateOrNull : new Date(dateOrNull))
      : new Date();
    const year = date.getFullYear();
    const month = date.getMonth();
    const monthKey = `${year}-${month}`;
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const preserveEventId = options.preserveEventId || null;
    const allChildren = options.allChildren === true; // when true, fetch all family events (e.g. for plan summary slot lookup)
    if (!background) setCalendarDataLoading(true);
    try {
      const [monthResult, holidaysResult] = await Promise.all([
        supabase.rpc('get_month_view', {
          _family_id: familyId,
          _year: year,
          _month: month + 1,
          _child_ids: allChildren ? null : (propSelectedCalendarChildren && propSelectedCalendarChildren.length > 0 ? propSelectedCalendarChildren : null),
        }),
        getHolidaysForRange(familyId, start, end),
      ]);
      if (dropStartTime != null && typeof performance !== 'undefined') {
        console.log('[WebContent] [drag-timing] t+' + (performance.now() - dropStartTime).toFixed(0) + 'ms refreshCalendarData fetch done');
      }
      const { data, error } = monthResult;
      if (error) throw error;
      const eventsByDate = data?.events_by_date || {};
      // Normalize: RPC returns date_local -> array of events; ensure each event has id, time for MonthGrid
      const byDate = {};
      Object.keys(eventsByDate).forEach((dateKey) => {
        const dayEvents = eventsByDate[dateKey];
        const list = Array.isArray(dayEvents) ? dayEvents : (dayEvents && dayEvents.events ? dayEvents.events : []);
        byDate[dateKey] = (list || []).map((e) => ({
          ...e,
          id: e.id,
          time: e.start_local || e.time,
          start_local: e.start_local,
          date_local: dateKey,
          child_id: e.child_id,
          child_ids: Array.isArray(e.child_ids) ? e.child_ids : undefined,
          childId: e.child_id,
          subject_name: e.subject_name,
          subjectName: e.subject_name,
          status: e.status,
          source: e.source,
        }));
      });
      setCalendarDataCache((prev) => ({ ...prev, [monthKey]: byDate }));
      setCalendarEvents((prev) => {
        let merged = { ...prev, ...byDate };
        if (preserveEventId) {
          let optimisticEvent = null;
          let optimisticDateKey = null;
          for (const key of Object.keys(prev)) {
            const arr = prev[key];
            if (Array.isArray(arr)) {
              const e = arr.find((ev) => ev && ev.id === preserveEventId);
              if (e) {
                optimisticEvent = e;
                optimisticDateKey = key;
                break;
              }
            }
          }
          if (optimisticEvent && optimisticDateKey) {
            Object.keys(merged).forEach((k) => {
              merged[k] = (merged[k] || []).filter((ev) => ev && ev.id !== preserveEventId);
            });
            merged[optimisticDateKey] = [...(merged[optimisticDateKey] || []), optimisticEvent];
          }
        }
        return merged;
      });
      const holidays = holidaysResult?.error ? [] : (holidaysResult?.data?.holidays || []);
      setPlannerHolidaysCache((prev) => ({ ...prev, [monthKey]: holidays }));
      setIsCalendarDataLoaded(true);
    } catch (err) {
      console.error('[WebContent] refreshCalendarData failed:', err);
      setCalendarDataCache((prev) => ({ ...prev, [monthKey]: {} }));
    } finally {
      if (dropStartTime != null && typeof performance !== 'undefined') {
        console.log('[WebContent] [drag-timing] t+' + (performance.now() - dropStartTime).toFixed(0) + 'ms refreshCalendarData finished');
      }
      if (!background) setCalendarDataLoading(false);
    }
  }, [familyId, propSelectedCalendarChildren]);

  useEffect(() => {
    refreshCalendarDataRef.current = refreshCalendarData;
    return () => { refreshCalendarDataRef.current = null; };
  }, [refreshCalendarData]);

  // Listen for calendar refresh events from global task modal
  // This allows the TaskCreateModal in WebLayout to trigger a calendar refresh
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleRefreshCalendar = async (event) => {
      // console.log('[WebContent] handleRefreshCalendar called', event?.detail);
      
      const targetMonth = event?.detail?.targetMonth;
      const targetYear = event?.detail?.targetYear;
      const eventIdFromDetail = event?.detail?.eventId;
      const isTargetedRefresh = targetYear !== undefined && targetMonth !== undefined;

      // Targeted refresh (e.g. after drag-drop): clear pending so refetch runs and server state sticks
      if (isTargetedRefresh && eventIdFromDetail) {
        pendingOptimisticUpdatesRef.current.delete(eventIdFromDetail);
      }

      // Skip full refetch when we just patched this event from API (avoids ~400–500ms delay)
      const merged = lastMergeFromApiRef.current;
      if (isTargetedRefresh && eventIdFromDetail && merged?.eventId === eventIdFromDetail && (Date.now() - merged.at) < 2000) {
        lastMergeFromApiRef.current = null;
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
        }
        if (user && !event?.detail?.skipHomeRefresh) {
          try {
            const { data: profileData } = await supabase.from('profiles').select('family_id').eq('id', user.id).maybeSingle();
            if (profileData?.family_id) invalidateHomeDataCache(profileData.family_id);
          } catch (_) {}
        }
        return;
      }

      // Check if there are any pending optimistic updates - if so, delay the refresh (unless targeted refresh from drag)
      if (!isTargetedRefresh && pendingOptimisticUpdatesRef.current.size > 0) {
        // console.log('[WebContent] Delaying refresh -', pendingOptimisticUpdatesRef.current.size, 'pending optimistic updates');
        // Delay the refresh to allow the API call to complete
        setTimeout(() => {
          // Re-dispatch the refresh event after delay
          window.dispatchEvent(new CustomEvent('refreshCalendar', event?.detail || {}));
        }, 2000);
        return;
      }
      
      // Check if a drag-and-drop happened recently - if so, delay the refresh (unless this IS the delayed targeted refresh)
      const timeSinceLastDrag = Date.now() - lastDragDropTimeRef.current;
      if (!isTargetedRefresh && timeSinceLastDrag < 2000) {
        // console.log('[WebContent] Delaying refresh - drag-and-drop happened', timeSinceLastDrag, 'ms ago');
        // Delay the refresh to allow the API call to complete
        setTimeout(() => {
          // Re-dispatch the refresh event after delay
          window.dispatchEvent(new CustomEvent('refreshCalendar', event?.detail || {}));
        }, 2000 - timeSinceLastDrag);
        return;
      }
      
      // Check if we should skip home refresh (e.g., when we're already refreshing)
      const skipHomeRefresh = event?.detail?.skipHomeRefresh || false;

      // Use target date if provided, otherwise use planner's visible month so calendar updates immediately after plan apply
      let refreshDate = null;
      if (targetYear !== undefined && targetMonth !== undefined) {
        refreshDate = new Date(targetYear, targetMonth, 1);
        console.log('[WebContent] Refreshing specific month:', { year: targetYear, month: targetMonth, date: refreshDate });
      } else {
        const visible = plannerDateRef.current;
        const visibleDate = visible && !isNaN(visible.getTime()) ? visible : new Date();
        refreshDate = new Date(visibleDate.getFullYear(), visibleDate.getMonth(), 1);
      }
      
      // Update data in place: refetch target month and merge into cache (no full cache clear to avoid loading flash)
      const skipCacheClear = event?.detail?.skipCacheClear === true;
      const forceInvalidate = event?.detail?.forceInvalidate === true;
      const dropStartTime = event?.detail?.dropStartTime;
      const doRefetch = () => {
        const tRefresh = typeof performance !== 'undefined' && dropStartTime != null ? (performance.now() - dropStartTime).toFixed(0) : '?';
        console.log('[WebContent] [drag-timing] t+' + tRefresh + 'ms refreshCalendar handler calling refreshCalendarData');
        console.log('[WebContent] Calling refreshCalendarData with date:', refreshDate);
        const opts = isTargetedRefresh && eventIdFromDetail ? { preserveEventId: eventIdFromDetail } : {};
        if (dropStartTime != null) opts.dropStartTime = dropStartTime;
        if (isTargetedRefresh && eventIdFromDetail) opts.background = true; // post-drag: refetch in background, no loading state
        refreshCalendarData(refreshDate, opts).catch(err => console.error('[WebContent] Calendar refresh failed:', err));
      };
      if (forceInvalidate) {
        setTimeout(doRefetch, 0);
      } else {
        doRefetch();
      }
      
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
            // Always refresh home data in background (even if not on home tab)
            // This ensures data is fresh when user switches to home tab
            if (homeData) {
              const validDate = homeSelectedDate instanceof Date && !isNaN(homeSelectedDate.getTime())
                ? homeSelectedDate
                : new Date();
              validDate.setHours(0, 0, 0, 0);
              const selectedDateStr = validDate.toISOString().split('T')[0];
              
              // Refetch in background without setting loading state
              supabase.rpc('get_home_data', {
                _family_id: profileData.family_id,
                _date: selectedDateStr,
                _horizon_days: 14,
              }).then(({ data: rawData, error }) => {
                if (!error && rawData) {
                  const data = cleanAvatarUrls(rawData);
                  const stories = (data?.stories || []).filter(s => 
                    s && s.title && s.body && s.title.trim() && s.body.trim()
                  );
                  const updatedData = {
                    ...data,
                    stories: stories,
                  };
                  setHomeData(updatedData);
                  saveHomeDataToCache(profileData.family_id, selectedDateStr, updatedData);
                }
              }).catch(err => {
                console.error('[WebContent] Error refreshing home data:', err);
              });
            } else if (activeTab === 'home') {
              // If homeData is null and we're on home tab, trigger a full refresh with loading
              setHomeLoading(true);
              if (onHomeLoadingChange) onHomeLoadingChange(true);
            }
          }
        } catch (err) {
          console.error('[Home] Error invalidating cache on refresh:', err);
        }
      }
    };
    
    window.addEventListener('refreshCalendar', handleRefreshCalendar);

    // When an event is deleted, remove it from planner calendar state immediately so it disappears without waiting for refetch
    const handleEventDeletedForPlanner = (event) => {
      const deletedId = event.detail?.eventId || event.detail?.id;
      if (!deletedId) return;
      const idStr = String(deletedId);
      setCalendarEvents((prev) => {
        let changed = false;
        const next = {};
        for (const [dateKey, list] of Object.entries(prev)) {
          if (!Array.isArray(list)) {
            next[dateKey] = list;
            continue;
          }
          const filtered = list.filter((e) => e && String(e.id) !== idStr);
          if (filtered.length !== list.length) changed = true;
          next[dateKey] = filtered;
        }
        return changed ? next : prev;
      });
      setCalendarDataCache((prev) => {
        let changed = false;
        const next = {};
        for (const [monthKey, byDate] of Object.entries(prev)) {
          if (!byDate || typeof byDate !== 'object') {
            next[monthKey] = byDate;
            continue;
          }
          const nextByDate = {};
          for (const [dateKey, list] of Object.entries(byDate)) {
            if (!Array.isArray(list)) {
              nextByDate[dateKey] = list;
              continue;
            }
            const filtered = list.filter((e) => e && String(e.id) !== idStr);
            if (filtered.length !== list.length) changed = true;
            nextByDate[dateKey] = filtered;
          }
          next[monthKey] = nextByDate;
        }
        return changed ? next : prev;
      });
    };

    window.addEventListener('eventDeleted', handleEventDeletedForPlanner);

    // Listen for event creation and deletion to refresh home page
    const handleEventCreated = async (event) => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
      }
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
              
              // Update hasAnyEvents since an event was created
              setHasAnyEvents(true);
              
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
              
              // Check if there are any remaining events after deletion
              try {
                const { count, error } = await supabase
                  .from('events')
                  .select('*', { count: 'exact', head: true })
                  .eq('family_id', profileData.family_id)
                  .is('deleted_at', null);
                
                if (!error) {
                  setHasAnyEvents(count > 0);
                }
              } catch (err) {
                console.warn('[Home] Error checking for events after deletion:', err);
              }
              
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
      window.removeEventListener('eventDeleted', handleEventDeletedForPlanner);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('eventCreated', handleEventCreated);
        window.removeEventListener('eventDeleted', handleEventDeletedForHome);
      }
    };
  }, [activeTab, homeData, user, homeSelectedDate, refreshCalendarData]);

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

  // User role state (fallback when session not passed; session is source of truth to avoid parent flash)
  const [userRole, setUserRole] = useState(null);
  const [accessibleChildren, setAccessibleChildren] = useState([]);
  // Use session role/children first so we show correct home (child vs parent) on first paint
  const roleForHome = propSession?.effective_role ?? userRole;
  const accessibleForHome = Array.isArray(propSession?.accessible_children) && propSession.accessible_children.length > 0
    ? propSession.accessible_children
    : accessibleChildren;

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
      if (!user) {
        setHomeLoading(false);
        if (onHomeLoadingChange) onHomeLoadingChange(false);
        return;
      }
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
            
            // Check if family has any events in the events table
            (async () => {
              try {
                const { count, error } = await supabase
                  .from('events')
                  .select('*', { count: 'exact', head: true })
                  .eq('family_id', profileData.family_id)
                  .is('deleted_at', null);
                
                if (!error) {
                  setHasAnyEvents(count > 0);
                } else {
                  console.warn('[Home] Error checking for events:', error);
                  // Default to true to show normal insights if check fails
                  setHasAnyEvents(true);
                }
              } catch (err) {
                console.warn('[Home] Error checking for events:', err);
                setHasAnyEvents(true);
              }
            })();
            
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
            
            // Check if family has any events in the events table
            (async () => {
              try {
                const { count, error } = await supabase
                  .from('events')
                  .select('*', { count: 'exact', head: true })
                  .eq('family_id', profileData.family_id)
                  .is('deleted_at', null);
                
                if (!error) {
                  setHasAnyEvents(count > 0);
                } else {
                  console.warn('[Home] Error checking for events:', error);
                  // Default to true to show normal insights if check fails
                  setHasAnyEvents(true);
                }
              } catch (err) {
                console.warn('[Home] Error checking for events:', err);
                setHasAnyEvents(true);
              }
            })();
            
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
      
      // Invalidate Subjects "What's Next" so overview and detail stay in sync with planner
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
        const subjectId = updatedEvent?.subject_id || eventDetail?.subject_id;
        if (subjectId) {
          window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId } }));
        }
      }
      
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
    
    // Note: refreshCalendar is handled by the main handler in the earlier useEffect
    // This handler only deals with eventCreated, eventDeleted, and eventRescheduled
    
    window.addEventListener('eventCreated', handleEventChange);
    window.addEventListener('eventDeleted', handleEventChange);
    window.addEventListener('eventRescheduled', handleEventChange);
    
    return () => {
      window.removeEventListener('eventCreated', handleEventChange);
      window.removeEventListener('eventDeleted', handleEventChange);
      window.removeEventListener('eventRescheduled', handleEventChange);
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
        const uuidWithSuffixPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z0-9-]+)?$/i;
        if (uuidPattern.test(avatarKey.trim()) || uuidWithSuffixPattern.test(avatarKey.trim())) {
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
  // Use propChildren if provided (preloaded from WebLayout), otherwise load them. Clean avatar/url UUIDs to prevent 404s.
  const [children, setChildren] = useState(() => (Array.isArray(propChildren) && propChildren.length > 0 ? cleanAvatarUrls(propChildren) : propChildren))
  const childrenRef = useRef(children)
  useEffect(() => { childrenRef.current = children; }, [children])
  const [archivedChildren, setArchivedChildren] = useState([])
  const [showArchived, setShowArchived] = useState(false)
  const [familyScreenSelectedChildId, setFamilyScreenSelectedChildId] = useState(null) // null = "All Children"
  // Use subjects from props (preloaded and cached in WebLayout), fallback to empty array
  const [subjects, setSubjects] = useState(propSubjects)
  // Cache for subjects with overview data
  const [subjectsOverviewCache, setSubjectsOverviewCache] = useState(null)
  // Cache for subject detail data (for SubjectDetailPage) - keyed by subjectId
  const [subjectDetailCache, setSubjectDetailCache] = useState({})
  const preloadingDetailsRef = useRef(new Set())
  const [activities, setActivities] = useState([])
  const [dailyTasks, setDailyTasks] = useState([])
  const [today] = useState(new Date().toISOString().split('T')[0])

  // Update subjects when propSubjects changes (but don't reload from database)
  useEffect(() => {
    if (propSubjects && propSubjects.length > 0) {
      setSubjects(propSubjects);
    }
  }, [propSubjects]);

  // Preload subjects overview once when the app initializes (per family)
  // so that Subjects screens don't need to block on their own fetches. Report to parent for initial load overlay.
  useEffect(() => {
    if (!familyId) {
      onSubjectsLoadingChange?.(false);
      return;
    }
    if (subjectsOverviewCache) {
      onSubjectsLoadingChange?.(false);
      return;
    }

    let isCancelled = false;
    onSubjectsLoadingChange?.(true);

    const loadInitialSubjectsOverview = async () => {
      try {
        const data = await getSubjectsWithOverview(familyId, null, propSession);
        if (!isCancelled) {
          setSubjectsOverviewCache(data);
        }
      } catch (err) {
        console.error('[WebContent] Error preloading subjects overview:', err);
      } finally {
        if (!isCancelled) onSubjectsLoadingChange?.(false);
      }
    };

    loadInitialSubjectsOverview();

    return () => {
      isCancelled = true;
      onSubjectsLoadingChange?.(false);
    };
  }, [familyId, subjectsOverviewCache, onSubjectsLoadingChange]);

  // Preload subject detail data for all subjects when overview is loaded
  useEffect(() => {
    if (!familyId || !subjectsOverviewCache || subjectsOverviewCache.length === 0) return;

    // Preload all subject details in background
    subjectsOverviewCache.forEach((subject) => {
      // Skip if already cached or currently loading
      setSubjectDetailCache(prev => {
        if (prev[subject.id] || preloadingDetailsRef.current.has(subject.id)) {
          return prev; // Already cached or loading
        }
        
        // Mark as loading
        preloadingDetailsRef.current.add(subject.id);
        
        // Load in background
        getSubjectDetail(subject.id, familyId, null, propSession)
          .then(detailData => {
            setSubjectDetailCache(prevCache => {
              // Double-check it's still not cached (race condition protection)
              if (prevCache[subject.id]) {
                preloadingDetailsRef.current.delete(subject.id);
                return prevCache;
              }
              preloadingDetailsRef.current.delete(subject.id);
              return {
                ...prevCache,
                [subject.id]: detailData,
              };
            });
          })
          .catch(err => {
            preloadingDetailsRef.current.delete(subject.id);
            // Silently fail - we'll load on demand if needed
            console.warn(`[WebContent] Failed to preload detail for subject ${subject.id}:`, err);
          });
        
        return prev; // Return unchanged for now
      });
    });
  }, [familyId, subjectsOverviewCache]);

  // Handle subjects overview cache updates
  const handleSubjectsOverviewUpdate = useCallback((overviewData) => {
    setSubjectsOverviewCache(overviewData);
  }, []);

  // Handle subject detail cache updates
  const handleSubjectDetailUpdate = useCallback((subjectId, detailData) => {
    setSubjectDetailCache(prev => ({
      ...prev,
      [subjectId]: detailData,
    }));
  }, []);

  // Clear cache when subjects are added/updated
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleRefresh = () => {
      setSubjectsOverviewCache(null); // Clear overview cache to force reload
      setSubjectDetailCache({}); // Clear detail cache to force reload
    };
    const handleSubjectDetailRefresh = (e) => {
      // Clear cache for specific subject
      if (e.detail?.subjectId) {
        setSubjectDetailCache(prev => {
          const updated = { ...prev };
          delete updated[e.detail.subjectId];
          return updated;
        });
      }
    };
    window.addEventListener('refreshSubjects', handleRefresh);
    window.addEventListener('refreshSubjectDetail', handleSubjectDetailRefresh);
    return () => {
      window.removeEventListener('refreshSubjects', handleRefresh);
      window.removeEventListener('refreshSubjectDetail', handleSubjectDetailRefresh);
    };
  }, []);

  // Sync familyId from props and session (session can arrive before propFamilyId propagates)
  useEffect(() => {
    const nextId = propFamilyId || propSession?.family_id || null;
    if (nextId) {
      setFamilyId(prev => (prev === nextId ? prev : nextId));
    }
  }, [propFamilyId, propSession?.family_id]);

  /** Home greeting: family display name (Parents row) first, then profile name. */
  const parentHomeGreetingName = useMemo(() => {
    const familyName = typeof propFamily?.family_name === 'string' ? propFamily.family_name.trim() : '';
    if (familyName) return familyName;
    const profileName = typeof propProfile?.name === 'string' ? propProfile.name.trim() : '';
    if (profileName) return profileName;
    const first = typeof propProfile?.first_name === 'string' ? propProfile.first_name.trim() : '';
    if (first) return first;
    return '';
  }, [propFamily?.family_name, propProfile?.name, propProfile?.first_name]);

  // Sync children from props
  useEffect(() => {
    if (propChildren && propChildren.length > 0) {
      const cleaned = cleanAvatarUrls(propChildren);
      setChildren(prev => (prev !== cleaned ? cleaned : prev));
    }
  }, [propChildren]);
  
  // Calendar data caching
  const [calendarDataCache, setCalendarDataCache] = useState({})
  const [calendarEvents, setCalendarEvents] = useState({}) // dateKey -> events[] (optimistic + merged)
  const calendarEventsRef = useRef(calendarEvents)
  useEffect(() => { calendarEventsRef.current = calendarEvents; }, [calendarEvents])
  const calendarDataCacheRef = useRef({})
  useEffect(() => { calendarDataCacheRef.current = calendarDataCache; }, [calendarDataCache])
  const [calendarBlackoutDates, setCalendarBlackoutDates] = useState({})
  const [plannerHolidaysCache, setPlannerHolidaysCache] = useState({}) // monthKey -> [{ date, name, type }]
  const plannerHolidaysCacheRef = useRef({})
  useEffect(() => { plannerHolidaysCacheRef.current = plannerHolidaysCache; }, [plannerHolidaysCache])
  const [isCalendarDataLoaded, setIsCalendarDataLoaded] = useState(false)
  const [calendarDataLoading, setCalendarDataLoading] = useState(false)
  // Pre-fetched planner tasks + attendance (null = not yet loaded for this family)
  const [plannerPreloadedBacklog, setPlannerPreloadedBacklog] = useState(null)
  const [plannerPreloadedTrash, setPlannerPreloadedTrash] = useState(null)
  const [plannerAttendanceSnapshot, setPlannerAttendanceSnapshot] = useState(null)
  // Planner view date (synced from WebLayout via plannerMonthChange)
  const [plannerDate, setPlannerDate] = useState(() => new Date())
  useEffect(() => { plannerDateRef.current = plannerDate; }, [plannerDate]);
  // Preload planner current month once when familyId is available so planner opens with data.
  // Report to parent so initial app load overlay stays until planner data is ready.
  const plannerPreloadedForFamilyRef = useRef(null);
  useEffect(() => {
    if (!familyId) {
      onPlannerLoadingChange?.(false);
      setPlannerPreloadedBacklog(null);
      setPlannerPreloadedTrash(null);
      setPlannerAttendanceSnapshot(null);
      plannerPreloadedForFamilyRef.current = null;
      return;
    }
    if (plannerPreloadedForFamilyRef.current === familyId) return;
    plannerPreloadedForFamilyRef.current = familyId;
    setPlannerPreloadedBacklog(null);
    setPlannerPreloadedTrash(null);
    setPlannerAttendanceSnapshot(null);
    onPlannerLoadingChange?.(true);
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    prefetchPlanEditListForFamily(familyId).catch(() => {});
    refreshCalendarData(now)
      .then(() => {
        onPlannerLoadingChange?.(false);
        Promise.all([
          refreshCalendarData(prevMonth, { background: true }),
          refreshCalendarData(nextMonth, { background: true }),
          prefetchWeekViewIntoOffline(familyId, now),
          prefetchBacklogAndTrash(familyId).then(({ backlog, trash }) => {
            setPlannerPreloadedBacklog(backlog);
            setPlannerPreloadedTrash(trash);
          }),
        ]).catch(() => {});
      })
      .catch((err) => {
        console.error('[WebContent] Planner preload failed:', err);
        onPlannerLoadingChange?.(false);
      });
  }, [familyId, refreshCalendarData, onPlannerLoadingChange]);

  const plannerChildrenKey = useMemo(
    () => (Array.isArray(children) ? children.map((c) => c?.id).filter(Boolean).sort().join(',') : ''),
    [children],
  );
  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    prefetchPlannerAttendanceSnapshot(familyId, children || []).then((snap) => {
      if (!cancelled && snap) setPlannerAttendanceSnapshot(snap);
    });
    return () => { cancelled = true; };
  }, [familyId, plannerChildrenKey]);

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
  // NOTE: schedule_overrides removed - Schedule Rules feature disabled
  // const [scheduleRulesModalOpen, setScheduleRulesModalOpen] = useState(false)
  const [aiPlannerModalOpen, setAIPlannerModalOpen] = useState(false)
  const [addChildModalOpen, setAddChildModalOpen] = useState(false)
  const [subjectGoalsModalOpen, setSubjectGoalsModalOpen] = useState(false)
  const modalOpacity = useRef(new Animated.Value(0)).current

  // Animate modal opacity for fast fade in/out
  useEffect(() => {
    // NOTE: scheduleRulesModalOpen removed - schedule_overrides feature disabled
    if (/* scheduleRulesModalOpen || */ aiPlannerModalOpen || addChildModalOpen) {
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
  }, [/* scheduleRulesModalOpen, */ aiPlannerModalOpen, addChildModalOpen]);

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
  const [eventModalSchedulingMode, setEventModalSchedulingMode] = useState(false)
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
  const [taskModalChildIds, setTaskModalChildIds] = useState([]);
  const [taskModalDefaultPlacement, setTaskModalDefaultPlacement] = useState('calendar');
  const [taskModalDefaultSubjectId, setTaskModalDefaultSubjectId] = useState(null);
  const [taskModalDefaultEventType, setTaskModalDefaultEventType] = useState(null);
  
  // Add Material Modal state
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [addMaterialModalDefaultRole, setAddMaterialModalDefaultRole] = useState(null);
  const [addMaterialModalDefaultSubjectId, setAddMaterialModalDefaultSubjectId] = useState(null);
  const [addMaterialModalDefaultSubjectName, setAddMaterialModalDefaultSubjectName] = useState(null);
  const [addMaterialModalDefaultChildIds, setAddMaterialModalDefaultChildIds] = useState([]);
  
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

  // Sync planner date when WebLayout nav changes month/week
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handlePlannerMonthChange = (e) => {
      const date = e?.detail;
      if (date && (date instanceof Date || (date && !isNaN(new Date(date).getTime())))) {
        setPlannerDate(date instanceof Date ? date : new Date(date));
      }
    };
    window.addEventListener('plannerMonthChange', handlePlannerMonthChange);
    return () => window.removeEventListener('plannerMonthChange', handlePlannerMonthChange);
  }, []);

  // Export planner month to Excel (CSV) — list of dates with events, one row per event
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const escapeCsv = (val) => {
      if (val == null) return '';
      const s = String(val).trim();
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };
    const handlePlannerExportToExcel = (e) => {
      const detail = e?.detail || {};
      const startDate = detail.startDate;
      const endDate = detail.endDate;
      const exportSubjectId = detail.subjectId || null;
      const exportSubjectName = (detail.subjectName || '').trim();
      const isSubjectFilter = exportSubjectId != null && exportSubjectId !== '';
      const eventMatchesSubject = (ev) => {
        if (!isSubjectFilter) return true;
        const sid = ev.subject_id ?? ev.related_subject_id;
        return sid != null && String(sid) === String(exportSubjectId);
      };
      const useRange = startDate && endDate &&
        (startDate instanceof Date || !isNaN(new Date(startDate).getTime())) &&
        (endDate instanceof Date || !isNaN(new Date(endDate).getTime()));

      const cache = calendarDataCacheRef.current || {};
      const eventsState = calendarEventsRef.current || {};
      const childList = childrenRef.current || [];
      const getChildName = (childId) => {
        if (!childId) return '';
        const c = childList.find((ch) => ch.id === childId);
        return c ? (c.first_name || c.name || '') : '';
      };
      const getAllChildNames = (ev) => {
        const fromIds = Array.isArray(ev.child_ids) && ev.child_ids.length > 0 ? ev.child_ids : [];
        const fromSingle = ev.child_id ? [ev.child_id] : [];
        const seen = new Set();
        const ids = [];
        [...fromIds, ...fromSingle].forEach((id) => {
          if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
        });
        return ids.map((id) => getChildName(id)).filter(Boolean).join('; ') || '';
      };
      const statusToAttendance = (status) => {
        const s = (status || '').toString().toLowerCase();
        return s === 'done' ? 'Attended' : 'Unattended';
      };
      const cols = detail.columns || {};
      const optCols = [
        { key: 'instructionalTime', label: 'Count as instructional time', get: (ev) => {
          if (ev.counts_toward_plan === true) return 'Yes';
          if (ev.instructional_status === 'MANUAL_COUNTS' || ev.instructional_status === 'PLAN_LOCKED' || ev.instructional_status === 'PLAN_PLACEHOLDER') return 'Yes';
          if (ev.academic_year_id) return 'Yes';
          return 'No';
        } },
        { key: 'plan', label: 'Build plan', get: (ev) => ev.academic_year_name || ev.plan_name || (ev.academic_year_id ? 'Yes' : '') || '' },
        { key: 'location', label: 'Location', get: (ev) => ev.location || '' },
        { key: 'mode', label: 'Mode', get: (ev) => ev.mode || '' },
        { key: 'instructor', label: 'Instructor', get: (ev) => ev.instructor || '' },
        { key: 'subject', label: 'Subject', get: (ev) => ev.subject_name || ev.subjectName || ev.topic || '' },
        { key: 'grade', label: 'Grade', get: (ev) => ev.grade || '' },
        { key: 'unit', label: 'Unit', get: (ev) => ev.unit || '' },
        { key: 'percentOfTotal', label: '% of total', get: (ev) => (ev.percent_of_total_grade != null && ev.percent_of_total_grade !== '' ? String(ev.percent_of_total_grade) : '') },
        { key: 'attachmentTitle', label: 'Attachment title', get: (ev) => ev.material_title || ev.attachment_title || (ev.materials_attachment_title || (Array.isArray(ev.materials_attachment_ids) && ev.materials_attachment_ids.length ? '(attachment)' : '')) || '' },
        { key: 'notes', label: 'Notes', get: (ev) => ev.description || ev.notes || '' },
      ].filter((c) => cols[c.key]);

      let merged = {};
      let holidays = [];
      let downloadFilename = '';

      if (useRange) {
        const start = startDate instanceof Date ? startDate : new Date(startDate);
        const end = endDate instanceof Date ? endDate : new Date(endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        if (start > end) return;
        const toKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dateKeys = [];
        const d = new Date(start.getTime());
        while (d <= end) {
          dateKeys.push(toKey(d));
          d.setDate(d.getDate() + 1);
        }
        const dateKeySet = new Set(dateKeys);
        dateKeys.forEach((dateKey) => {
          const [y, m] = dateKey.split('-');
          const monthKey = `${y}-${parseInt(m, 10) - 1}`;
          const fromCache = (cache[monthKey] || {})[dateKey];
          const fromState = eventsState[dateKey];
          const list = Array.isArray(fromState) && fromState.length > 0 ? fromState : (Array.isArray(fromCache) ? fromCache : []);
          if (list.length > 0) merged[dateKey] = list;
        });
        const holidaysCache = plannerHolidaysCacheRef.current || {};
        dateKeys.forEach((dateKey) => {
          const [y, m] = dateKey.split('-');
          const monthKey = `${y}-${parseInt(m, 10) - 1}`;
          (holidaysCache[monthKey] || []).forEach((h) => {
            if (h.date === dateKey) holidays.push({ ...h, dateKey });
          });
        });
        downloadFilename = isSubjectFilter && exportSubjectName
          ? `planner-${exportSubjectName.replace(/[^a-zA-Z0-9-_]/g, '_')}-${toKey(start)}_to_${toKey(end)}.csv`
          : `planner-${toKey(start)}_to_${toKey(end)}.csv`;
      } else {
        const targetMonth = detail.currentMonth;
        const date = targetMonth && (targetMonth instanceof Date || !isNaN(new Date(targetMonth).getTime()))
          ? (targetMonth instanceof Date ? targetMonth : new Date(targetMonth))
          : (plannerDateRef.current || new Date());
        const year = date.getFullYear();
        const month = date.getMonth();
        const monthKey = `${year}-${month}`;
        const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
        const cacheMonth = cache[monthKey] || {};
        merged = { ...cacheMonth };
        Object.keys(eventsState).forEach((dateKey) => {
          if (!dateKey.startsWith(monthPrefix)) return;
          const list = eventsState[dateKey];
          if (Array.isArray(list) && list.length > 0) merged[dateKey] = list;
        });
        holidays = (plannerHolidaysCacheRef.current || {})[monthKey] || [];
        downloadFilename = isSubjectFilter && exportSubjectName
          ? `planner-${exportSubjectName.replace(/[^a-zA-Z0-9-_]/g, '_')}-${monthPrefix}.csv`
          : `planner-${monthPrefix}.csv`;
      }

      const dataRows = [];
      const sortedDates = Object.keys(merged).sort();
      sortedDates.forEach((dateKey) => {
        const list = (merged[dateKey] || []).filter(Boolean);
        const sorted = [...list].filter(eventMatchesSubject).sort((a, b) => {
          const ta = a.start_local || a.time || '';
          const tb = b.start_local || b.time || '';
          return String(ta).localeCompare(String(tb));
        });
        sorted.forEach((ev) => {
          const baseRow = [
            dateKey,
            getAllChildNames(ev),
            ev.subject_name || ev.subjectName || ev.topic || '',
            ev.start_local || ev.time || '',
            ev.end_local || '',
            ev.title || '',
            statusToAttendance(ev.status),
            ev.event_type || ev.type || ev.source || '',
          ];
          const optRow = optCols.map((c) => c.get(ev));
          dataRows.push({
            dateKey,
            time: ev.start_local || ev.time || '',
            row: baseRow.concat(optRow),
          });
        });
      });
      const emptyOptRow = optCols.map(() => '');
      if (!isSubjectFilter) {
        holidays.forEach((h) => {
          const dateKey = h.date || h.dateKey || '';
          const baseRow = [
            dateKey,
            '',
            '',
            '',
            '',
            h.name || 'Holiday',
            'Unattended',
            'holiday',
          ];
          dataRows.push({
            dateKey,
            time: '',
            row: baseRow.concat(emptyOptRow),
          });
        });
      }
      // Capitalize "Holiday" in Type column for display
      dataRows.forEach((r) => {
        const typeIdx = 7; // Type is 8th column (0-based index 7)
        if (r.row[typeIdx] === 'holiday') r.row[typeIdx] = 'Holiday';
      });
      dataRows.sort((a, b) => {
        const d = a.dateKey.localeCompare(b.dateKey);
        if (d !== 0) return d;
        return String(a.time).localeCompare(String(b.time));
      });
      const header = ['Date', 'Child', 'Subject', 'Start Time', 'End Time', 'Title', 'Status', 'Type'].concat(optCols.map((c) => c.label));
      const rows = [header.map(escapeCsv), ...dataRows.map((r) => r.row.map(escapeCsv))];
      const csv = rows.map((r) => r.join(',')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFilename;
      a.click();
      URL.revokeObjectURL(url);
    };
    window.addEventListener('plannerExportToExcel', handlePlannerExportToExcel);
    return () => window.removeEventListener('plannerExportToExcel', handlePlannerExportToExcel);
  }, []);

  // Right-click context menu for planner events (Month and other views that dispatch plannerEventContextMenu)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handlePlannerEventContextMenu = (e) => {
      const { event: ev, position } = e.detail || {};
      if (!ev || !position || !familyId) return;
      const clientX = position.x ?? 0;
      const clientY = position.y ?? 0;
      const existingMenu = document.getElementById('planner-event-context-menu');
      if (existingMenu) existingMenu.remove();
      const isHoliday = (ev.event_type || ev.type || '').toLowerCase() === 'holiday';
      const isFromTrash = ev._activeSection === 'trash';
      let menuItems = [];

      if (isFromTrash) {
        const cleanId = (ev._originalId || ev.originalId || ev.id || '').toString().split('-day-')[0];
        menuItems.push({
          text: 'Add back to calendar',
          action: async () => {
            try {
              const res = await restoreEventFromTrash(cleanId, familyId);
              if (res.error) {
                Alert.alert('Error', res.error.message || 'Failed to restore event');
                return;
              }
              window.dispatchEvent(new CustomEvent('trashItemRestored', { detail: { eventId: cleanId } }));
              window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipHomeRefresh: true } }));
              const restored = res.data;
              if (restored && (res.hadConflict || restored.is_flexible)) {
                const eventDate = new Date(restored.start_ts || restored.start);
                if (!isNaN(eventDate.getTime())) {
                  const dateKey = eventDate.toISOString().split('T')[0];
                  const childId = restored.child_id || restored.childId;
                  if (childId && dateKey) {
                    const { data: dbEvents } = await supabase
                      .from('events')
                      .select('*')
                      .eq('family_id', familyId)
                      .eq('child_id', childId)
                      .gte('start_ts', new Date(dateKey + 'T00:00:00').toISOString())
                      .lt('start_ts', new Date(dateKey + 'T23:59:59').toISOString())
                      .neq('status', 'canceled')
                      .is('canceled_at', null)
                      .is('deleted_at', null);
                    const eventsForDetection = [...(dbEvents || [])];
                    const conflictCount = detectConflicts(restored, eventsForDetection);
                    if (conflictCount > 0) {
                      const movedStart = new Date(restored.start_ts || restored.start);
                      const movedEnd = new Date(restored.end_ts || restored.end);
                      let firstConflictEvent = null;
                      for (const event of eventsForDetection || []) {
                        if (!event || event.id === restored.id || event.child_id !== (restored.child_id || restored.childId)) continue;
                        if (event.status === 'canceled' || event.canceled_at || event.deleted_at) continue;
                        const eventStart = new Date(event.start_ts || event.start);
                        const eventEnd = new Date(event.end_ts || event.end);
                        if (movedStart < eventEnd && eventStart < movedEnd) {
                          firstConflictEvent = event;
                          break;
                        }
                      }
                      let conflictMessage = null;
                      if (firstConflictEvent) {
                        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        const d = new Date(firstConflictEvent.start_ts);
                        const formatTime = (date) => {
                          let h = date.getHours();
                          const m = date.getMinutes();
                          const p = h >= 12 ? 'PM' : 'AM';
                          if (h > 12) h -= 12; else if (h === 0) h = 12;
                          return m === 0 ? `${h} ${p}` : `${h}:${String(m).padStart(2, '0')} ${p}`;
                        };
                        const startStr = formatTime(new Date(firstConflictEvent.start_ts));
                        const endStr = formatTime(new Date(firstConflictEvent.end_ts || firstConflictEvent.start_ts));
                        conflictMessage = `${firstConflictEvent.title} (${dayNames[d.getDay()]} ${monthNames[d.getMonth()]} ${d.getDate()}, ${startStr}–${endStr})`;
                      }
                      setConflictBanner(prev => ({
                        ...prev,
                        visible: true,
                        eventId: restored.id,
                        conflictCount,
                        eventTitle: restored.title || 'This event',
                        conflictEvent: firstConflictEvent,
                        movedEvent: restored,
                        conflictMessage: conflictMessage || undefined,
                        dismissed: false,
                        timestamp: Date.now(),
                      }));
                    }
                  }
                }
              }
            } catch (err) {
              Alert.alert('Error', err?.message || 'Failed to restore event');
            }
          },
        });
        menuItems.push({
          text: 'Delete forever',
          isDelete: true,
          action: () => {
            const setConfirm = setConfirmDialogRef.current;
            if (!setConfirm) return;
            setConfirm({
              visible: true,
              title: 'Delete forever?',
              message: 'This event will be permanently removed. This cannot be undone.',
              confirmLabel: 'Delete forever',
              cancelLabel: 'Cancel',
              destructive: true,
              onConfirm: async () => {
                try {
                  await permanentlyDeleteTrashEvent(cleanId, familyId);
                  window.dispatchEvent(new CustomEvent('trashItemRestored', { detail: { eventId: cleanId, permanent: true } }));
                  window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipHomeRefresh: true } }));
                } catch (err) {
                  Alert.alert('Error', err?.message || 'Failed to delete event');
                } finally {
                  setConfirm((prev) => ({ ...prev, visible: false }));
                }
              },
              onCancel: () => setConfirm((prev) => ({ ...prev, visible: false })),
            });
          },
        });
      } else if (isHoliday) {
        menuItems.push({
          text: 'View',
          action: () => {
            window.dispatchEvent(new CustomEvent('openEventModal', { detail: { eventId: ev?.id, initialEvent: ev } }));
          },
        });
      } else {
      let eventId = ev._originalId || ev.originalId || ev.id;
      if (eventId && typeof eventId === 'string' && eventId.includes('-day-')) {
        eventId = eventId.split('-day-')[0];
      }
      menuItems.push({
        text: 'Edit Event',
        action: () => {
          window.dispatchEvent(new CustomEvent('openEventModal', { detail: { eventId: ev?.id, initialEvent: ev } }));
        },
      });
      const isRecurringEvent = ev.recurrence_rule || ev.recurrence_id || ev.parent_event_id;
      if (isRecurringEvent) {
        menuItems.push({
          text: 'Delete This Event',
          isDelete: true,
          action: () => {
            const setConfirm = setConfirmDialogRef.current;
            if (!setConfirm) return;
            const cleanId = (eventId || '').split('-day-')[0];
            setConfirm({
              visible: true,
              title: 'Delete this occurrence?',
              message: 'Are you sure you want to delete only this occurrence?',
              confirmLabel: 'Delete',
              cancelLabel: 'Cancel',
              destructive: true,
              onConfirm: async () => {
                try {
                  const { data: rpcData, error: rpcError } = await supabase.rpc('delete_event', { _event_id: cleanId, _family_id: familyId });
                  if (rpcError) {
                    const result = await deletePlannerEvent(cleanId, familyId);
                    if (result?.error) throw new Error(result.error.message || 'Failed to delete event');
                  } else if (!rpcData?.success) {
                    const result = await deletePlannerEvent(cleanId, familyId);
                    if (result?.error) throw new Error(result.error.message || 'Failed to delete event');
                  }
                  window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { eventId: cleanId } }));
                  window.dispatchEvent(new CustomEvent('refreshCalendar'));
                } catch (err) {
                  Alert.alert('Error', `Failed to delete event: ${err?.message || err}`);
                } finally {
                  setConfirm((prev) => ({ ...prev, visible: false }));
                }
              },
              onCancel: () => setConfirm((prev) => ({ ...prev, visible: false })),
            });
          },
        });
        menuItems.push({
          text: 'Delete All in Series',
          isDelete: true,
          action: () => {
            const setConfirm = setConfirmDialogRef.current;
            if (!setConfirm) return;
            const cleanId = (eventId || '').split('-day-')[0];
            setConfirm({
              visible: true,
              title: 'Delete all in series?',
              message: 'Are you sure you want to delete all occurrences in this series?',
              confirmLabel: 'Delete all',
              cancelLabel: 'Cancel',
              destructive: true,
              onConfirm: async () => {
                try {
                  let masterEventId = ev.parent_event_id || ev.recurrence_id;
                  if (masterEventId && typeof masterEventId === 'string' && masterEventId.includes('-day-')) masterEventId = masterEventId.split('-day-')[0];
                  if (ev.recurrence_rule && !masterEventId) masterEventId = cleanId;
                  if (!masterEventId) masterEventId = cleanId;
                  const { error: seriesError } = await supabase
                    .from('events')
                    .update({ deleted_at: new Date().toISOString() })
                    .or(`id.eq.${masterEventId},parent_event_id.eq.${masterEventId},recurrence_id.eq.${masterEventId}`)
                    .is('deleted_at', null);
                  if (seriesError) {
                    const { data: rpcData, error: rpcError } = await supabase.rpc('delete_event', { _event_id: cleanId, _family_id: familyId });
                    if (rpcError || !rpcData?.success) await deletePlannerEvent(cleanId, familyId);
                  }
                  window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { eventId: masterEventId } }));
                  window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
                } catch (err) {
                  Alert.alert('Error', `Failed to delete series: ${err?.message || err}`);
                } finally {
                  setConfirm((prev) => ({ ...prev, visible: false }));
                }
              },
              onCancel: () => setConfirm((prev) => ({ ...prev, visible: false })),
            });
          },
        });
      } else {
        menuItems.push({
          text: 'Delete Event',
          isDelete: true,
          action: () => {
            const setConfirm = setConfirmDialogRef.current;
            if (!setConfirm) return;
            const cleanId = (eventId || '').split('-day-')[0];
            setConfirm({
              visible: true,
              title: 'Delete event?',
              message: 'Are you sure you want to delete this event?',
              confirmLabel: 'Delete',
              cancelLabel: 'Cancel',
              destructive: true,
              onConfirm: async () => {
                try {
                  const { data: rpcData, error: rpcError } = await supabase.rpc('delete_event', { _event_id: cleanId, _family_id: familyId });
                  if (rpcError) {
                    const result = await deletePlannerEvent(cleanId, familyId);
                    if (result?.error) throw new Error(result.error.message || 'Failed to delete event');
                  } else if (!rpcData?.success) {
                    const result = await deletePlannerEvent(cleanId, familyId);
                    if (result?.error) throw new Error(result.error.message || 'Failed to delete event');
                  }
                  window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { eventId: cleanId } }));
                  window.dispatchEvent(new CustomEvent('refreshCalendar'));
                } catch (err) {
                  Alert.alert('Error', `Failed to delete event: ${err?.message || err}`);
                } finally {
                  setConfirm((prev) => ({ ...prev, visible: false }));
                }
              },
              onCancel: () => setConfirm((prev) => ({ ...prev, visible: false })),
            });
          },
        });
      }
      }
      const estimatedMenuHeight = menuItems.length * 48 + 16;
      const windowHeight = window.innerHeight;
      const estimatedMenuWidth = 200;
      const windowWidth = window.innerWidth;
      let menuTop = clientY;
      if (clientY + estimatedMenuHeight > windowHeight) {
        menuTop = Math.max(8, clientY - estimatedMenuHeight);
      }
      let menuLeft = clientX;
      if (clientX + estimatedMenuWidth > windowWidth) {
        menuLeft = Math.max(8, clientX - estimatedMenuWidth);
      }
      const menu = document.createElement('div');
      menu.id = 'planner-event-context-menu';
      menu.style.cssText = `position: fixed; top: ${menuTop}px; left: ${menuLeft}px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05); z-index: 999999; min-width: 200px; padding: 8px 0; font-family: "Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;`;
      menuItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.style.cssText = `padding: 16px 24px; color: ${item.isDelete ? '#dc2626' : '#374151'}; font-size: 15px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; border-bottom: ${index < menuItems.length - 1 ? '1px solid #f3f4f6' : 'none'};`;
        div.addEventListener('mouseenter', () => { div.style.backgroundColor = item.isDelete ? '#fef2f2' : '#f8fafc'; });
        div.addEventListener('mouseleave', () => { div.style.backgroundColor = 'transparent'; });
        div.textContent = item.text;
        div.addEventListener('click', () => { item.action(); menu.remove(); });
        menu.appendChild(div);
      });
      document.body.appendChild(menu);
      const closeMenu = (evt) => {
        if (!menu.contains(evt.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
          document.removeEventListener('mousedown', closeMenu, true);
          document.removeEventListener('contextmenu', closeMenu, true);
        }
      };
      document.addEventListener('click', closeMenu);
      document.addEventListener('mousedown', closeMenu, true);
      document.addEventListener('contextmenu', closeMenu, true);
    };
    window.addEventListener('plannerEventContextMenu', handlePlannerEventContextMenu);
    return () => window.removeEventListener('plannerEventContextMenu', handlePlannerEventContextMenu);
  }, [familyId]);

  // Load month data when showing planner tab so grid and events show on first open or after login
  useEffect(() => {
    if (activeTab !== 'planner' && activeTab !== 'ai-planner') return;
    if (!familyId) return;
    const monthKey = `${plannerDate.getFullYear()}-${plannerDate.getMonth()}`;
    if (!calendarDataCache[monthKey]) {
      refreshCalendarData(plannerDate).catch((err) => console.error('[WebContent] Initial planner load failed:', err));
    }
  }, [activeTab, familyId, plannerDate, calendarDataCache, refreshCalendarData]);

  // Optimistically add newly created calendar events so they appear on the planner immediately
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (e) => {
      const detail = e?.detail;
      const raw = detail?.event;
      if (!raw?.id || detail?.isBacklog) return;
      const startTs = raw.start_ts;
      if (!startTs) return;
      const eventDate = new Date(startTs);
      if (isNaN(eventDate.getTime())) return;
      const dateKey = eventDate.toISOString().split('T')[0];
      const startLocalStr = `${String(eventDate.getHours()).padStart(2, '0')}:${String(eventDate.getMinutes()).padStart(2, '0')}`;
      const endTs = raw.end_ts;
      let endLocalStr = '';
      if (endTs) {
        const endDate = new Date(endTs);
        endLocalStr = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
      }
      const formatted = {
        id: raw.id,
        type: raw.source || 'activity',
        title: raw.title || 'Untitled Event',
        childName: 'Child',
        time: startLocalStr,
        color: 'teal',
        subject: raw.subject_name ?? '',
        status: raw.status || 'scheduled',
        year_plan_id: raw.year_plan_id,
        event_type: raw.event_type,
        data: { ...raw, date_local: dateKey },
        date_local: dateKey,
        start_local: startLocalStr,
        end_local: endLocalStr || undefined,
        start_ts: raw.start_ts,
        end_ts: raw.end_ts,
        assignee: raw.child_id,
        assignees: raw.child_id ? [raw.child_id] : [],
        child_id: raw.child_id,
      };
      setCalendarEvents((prev) => {
        const next = { ...prev };
        const list = Array.isArray(next[dateKey]) ? [...next[dateKey]] : [];
        if (list.some((ev) => ev && ev.id === raw.id)) return prev;
        list.push(formatted);
        next[dateKey] = list;
        return next;
      });
    };
    window.addEventListener('eventCreated', handler);
    return () => window.removeEventListener('eventCreated', handler);
  }, []);

  // Holidays are now fetched inside refreshCalendarData (in parallel with month events) so they appear on load with other events.

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

  // Learnadoodle-styled confirm dialog (replaces native confirm for planner delete)
  const [confirmDialog, setConfirmDialog] = useState({
    visible: false,
    title: '',
    message: '',
    confirmLabel: 'OK',
    cancelLabel: 'Cancel',
    destructive: false,
    onConfirm: null,
    onCancel: null,
  });
  const setConfirmDialogRef = useRef(null);
  useEffect(() => {
    setConfirmDialogRef.current = setConfirmDialog;
  }, []);
  
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

        // NOTE: schedule_overrides removed - holidays feature disabled
        // Previously wrote holidays as schedule_overrides, but this is no longer used
        // result = await supabase
        //   .from('schedule_overrides')
        //   .insert([{ scope_type: 'family', scope_id: familyId, date: holidayData.holiday_date, override_kind: 'off', start_time: '00:00', end_time: '23:59', notes: holidayData.holiday_name, is_active: true }]);
        // For now, skip saving holiday (or save to a different table if needed)
        result = { data: null, error: null };
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

        // NOTE: schedule_overrides removed - holidays feature disabled
        // Previously saved holidays as schedule_overrides, but this is no longer used
        // const overrideRows = holidaysToCreate.map(h => ({ scope_type: 'family', scope_id: familyId, date: h.holiday_date, override_kind: 'off', start_time: '00:00', end_time: '23:59', notes: h.holiday_name, is_active: true }));
        // result = await supabase
        //   .from('schedule_overrides')
        //   .insert(overrideRows);
        // For now, skip saving holidays (or save to a different table if needed)
        result = { data: null, error: null };
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
            setHomeData(cleanAvatarUrls(data));
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
    const currentYear = plannerDate.getFullYear();
    const month = plannerDate.getMonth();
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
        const currentYear = plannerDate.getFullYear();
        const month = plannerDate.getMonth();
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
    // Only fetch if not already provided via props (preloaded in WebLayout)
    if (!propFamilyId) {
      fetchFamilyId();
    }
    if (!propChildren || propChildren.length === 0) {
      fetchChildren();
    }
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

      // NOTE: schedule_overrides removed - holidays feature disabled
      // const { data: holidays } = await supabase
      //   .from('schedule_overrides')
      //   .select('date, notes, override_kind')
      //   .eq('scope_type', 'family')
      //   .eq('scope_id', profile.family_id)
      //   .eq('override_kind', 'off')
      //   .eq('date', todayStr)
      const holidays = []; // Return empty array since schedule_overrides is no longer used

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
    // Skip if we already have children from props (preloaded)
    if (propChildren && propChildren.length > 0) {
      setChildren(cleanAvatarUrls(propChildren));
      return;
    }
    
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
          avatar: validateAvatarUrl(child.avatar) ?? null
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
          avatar: validateAvatarUrl(child.avatar) ?? null
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
    // Skip if we already have familyId from props
    if (propFamilyId) {
      setFamilyId(propFamilyId);
      return;
    }
    
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
      
      // Recent messages for short-term conversational memory (e.g. "And science?")
      const recentMessages = doodleMessages.map((m) => ({ role: m.role, content: m.content }));
      const response = await processDoodleMessage(message, familyId, conversationId, { recentMessages });

      let displayText = getDisplayMessage(response);

      // Handle tool execution if needed
      const toolName = getToolName(response);
      if (toolName) {
        try {
          const toolResult = await executeTool(toolName, getToolParams(response), familyId);
          if (toolResult.success && toolResult.userMessage) {
            displayText += `\n\n${toolResult.userMessage}`;
          } else if (toolResult.success) {
            displayText += `\n\n✅ Done.`;
          }
        } catch (toolError) {
          console.error('Tool execution error:', toolError);
          displayText += `\n\n❌ Sorry, I couldn't complete that action. Please try again.`;
        }
      }

      // Handle fetch requests
      if (response.fetch === 'custom-plan') {
        displayText += `\n\n🔄 I'm working on your custom plan. This may take a moment...`;
      } else if (response.fetch === '2-week-plan') {
        displayText += `\n\n📅 I'm generating your 2-week plan. This may take a moment...`;
      }

      // Navigate: switch tab and (for planner attendance) set view
      if (response.fetch === 'navigate_planner_attendance' && onTabChange) {
        onTabChange('planner');
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.history.replaceState({}, '', '/planner?view=attendance');
          window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'attendance' }));
        }
      } else if (response.fetch === 'navigate_planner' && onTabChange) {
        onTabChange('planner');
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.history.replaceState({}, '', '/planner');
        }
      } else if (response.fetch === 'navigate_home' && onTabChange) {
        onTabChange('home');
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.history.replaceState({}, '', '/');
        }
      }

      if (response.openTaskModal && Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('openTaskModal', { detail: response.openTaskModal }));
      }

      if (response.createEventInBackground) {
        const { eventData, familyId: famId, childIds } = response.createEventInBackground;
        const { data: created, error } = await createEventViaSupabaseRpc(eventData, famId, childIds);
        if (error) {
          console.warn('[WebContent] Doodle createEvent RPC failed:', error);
          displayText += '\n\nSorry, I couldn’t save that event. Please try adding it from the planner.';
        } else if (created?.length > 0 && Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshCalendar'));
          window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
          if (invalidateHomeDataCache && famId) invalidateHomeDataCache(famId);
        }
      }

      await AIConversationService.addMessage(conversationId, 'assistant', displayText);
      setDoodleMessages(prev => [...prev, { role: 'assistant', content: displayText, timestamp: Date.now() }])
      
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

  // Hydrate Doodle chat from DB when opening Search tab and we have no messages in state
  useEffect(() => {
    if (activeTab !== 'search' || !familyId || doodleMessages.length > 0) return;
    let cancelled = false;
    AIConversationService.getLatestDoodleConversation(familyId).then((result) => {
      if (cancelled || !result?.conversationId || !result.messages?.length) return;
      setDoodleConversationId(result.conversationId);
      setDoodleMessages(result.messages.map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp || Date.now() })));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeTab, familyId, doodleMessages.length]);

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

  // Build events array for planner: use calendarDataCache for visible month, overlay calendarEvents (optimistic), add holidays
  const plannerEventsForMonth = useMemo(() => {
    const year = plannerDate.getFullYear();
    const month = plannerDate.getMonth();
    const monthKey = `${year}-${month}`;
    const cacheMonth = calendarDataCache[monthKey] || {};
    const merged = { ...cacheMonth };
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const eventIdsInCalendarEvents = new Set();
    Object.keys(calendarEvents).forEach((dateKey) => {
      if (!dateKey.startsWith(monthPrefix)) return;
      const fromState = calendarEvents[dateKey];
      if (Array.isArray(fromState) && fromState.length > 0) {
        merged[dateKey] = fromState;
        fromState.forEach((e) => e && e.id && eventIdsInCalendarEvents.add(e.id));
      }
    });
    // For moved events (in calendarEvents), remove that id from other dates so event appears only once at its new position
    if (eventIdsInCalendarEvents.size > 0) {
      Object.keys(merged).forEach((dateKey) => {
        const arr = merged[dateKey];
        if (!Array.isArray(arr)) return;
        const fromState = calendarEvents[dateKey];
        const isAuthoritative = Array.isArray(fromState) && fromState.some((e) => e && e.id && eventIdsInCalendarEvents.has(e.id));
        if (isAuthoritative) return; // this date is from calendarEvents, keep as-is
        const filtered = arr.filter((e) => !e || !e.id || !eventIdsInCalendarEvents.has(e.id));
        if (filtered.length !== arr.length) merged[dateKey] = filtered;
      });
    }
    const calendarEventList = Object.entries(merged).flatMap(([, evts]) => (Array.isArray(evts) ? evts : []));
    const holidays = plannerHolidaysCache[monthKey] || [];
    const holidayEvents = holidays.map((h) => ({
      id: `holiday-${h.date}-${(h.name || '').replace(/\s+/g, '-').slice(0, 30)}`,
      date_local: h.date,
      title: h.name,
      type: 'holiday',
      event_type: 'holiday',
      status: null,
    }));
    return [...calendarEventList, ...holidayEvents];
  }, [plannerDate, calendarDataCache, calendarEvents, plannerHolidaysCache]);

  const renderPlannerContent = () => {
    const date = plannerDate && !isNaN(plannerDate.getTime()) ? plannerDate : new Date();
    // Always show planner with current cache (no full-page loading); data updates in place when refetches complete
    return (
      <View
        style={{
          flex: 1,
          minHeight: 0,
          ...(Platform.OS === 'web' && {
            minHeight: 'min(70vh, 560px)',
            display: 'flex',
            flexDirection: 'column',
          }),
        }}
      >
        <PlanHealthBanner familyId={familyId} visible={activeTab === 'planner' || activeTab === 'calendar'} initialHealth={propPreloadedPlanHealth} />
        <CenterPane
        date={date}
        events={plannerEventsForMonth}
        selectedDate={date}
        onSelectDate={(d) => {
          setPlannerDate(d);
          if (onCurrentMonthChange) onCurrentMonthChange(d);
        }}
        onCreateTask={() => {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('openTaskModal', { detail: { date: plannerDate } }));
          }
        }}
        filters={{
          childIds: propSelectedCalendarChildren && propSelectedCalendarChildren.length > 0 ? propSelectedCalendarChildren : null,
          eventTypes: propSelectedEventTypes && propSelectedEventTypes.length > 0 ? propSelectedEventTypes : null,
        }}
        onEventSelect={(event) => {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('openEventModal', { detail: { eventId: event?.id, initialEvent: event } }));
          }
        }}
        onEventRightClick={(ev, e) => {
          if (Platform.OS !== 'web' || typeof window === 'undefined' || !e) return;
          // e may be native event (from MonthGrid) or synthetic (e.nativeEvent has clientX/Y)
          const x = e.clientX ?? e.nativeEvent?.clientX ?? 0;
          const y = e.clientY ?? e.nativeEvent?.clientY ?? 0;
          window.dispatchEvent(new CustomEvent('plannerEventContextMenu', { detail: { event: ev, position: { x, y } } }));
        }}
        onEventComplete={async (event) => {
          if (!event?.id) return;
          if (event?.type === 'holiday' || event?.event_type === 'holiday') return;
          const isCurrentlyDone = event.status === 'done';
          const newStatus = isCurrentlyDone ? 'scheduled' : 'done';
          const dateKey = event.date_local || (event.start_ts && event.start_ts.split('T')[0]);
          const monthKey = `${plannerDate.getFullYear()}-${plannerDate.getMonth()}`;
          const cacheMonth = calendarDataCache[monthKey] || {};
          const listForDate = calendarEvents[dateKey] || cacheMonth[dateKey] || [];
          const optimisticList = listForDate.map((ev) =>
            ev.id === event.id ? { ...ev, status: newStatus } : ev
          );
          setCalendarEvents((prev) => ({ ...prev, [dateKey]: optimisticList }));
          try {
            if (isCurrentlyDone) {
              const result = await updateEventStatus(event.id, 'scheduled');
              if (result.error) throw result.error;
            } else {
              const result = await completeEvent(event.id);
              if (result.error) throw result.error;
            }
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('refreshCalendar', {
                detail: {
                  skipHomeRefresh: true,
                  skipCacheClear: true,
                  targetYear: plannerDate.getFullYear(),
                  targetMonth: plannerDate.getMonth(),
                },
              }));
              window.dispatchEvent(new CustomEvent('refreshSubjects'));
            }
          } catch (err) {
            setCalendarEvents((prev) => ({ ...prev, [dateKey]: listForDate }));
            if (Platform.OS === 'web') {
              alert(`Failed to ${isCurrentlyDone ? 'unmark' : 'mark'} event: ${err?.message || err}`);
            }
          }
        }}
        onNavigateToIntelligence={() => onTabChange && onTabChange('intelligence')}
        children={children || []}
        onChildFilterChange={onSelectedCalendarChildrenChange}
        blackoutDates={calendarBlackoutDates[`${plannerDate.getFullYear()}-${plannerDate.getMonth()}`] || []}
        familyId={familyId}
        viewMode={propPlannerView}
        onEditChild={onEditChild}
        preloadedBacklogEvents={plannerPreloadedBacklog}
        preloadedTrashEvents={plannerPreloadedTrash}
        plannerAttendanceSnapshot={plannerAttendanceSnapshot}
      />
      </View>
    );
  };

  const renderCalendarContent = () => {
    return renderPlannerContent();
  };

  const renderSearchContent = () => (
    <View style={styles.content}>
      <Text style={styles.title}>Search</Text>
    </View>
  );

  const renderNotesContent = () => (
    <View style={styles.content}>
      <Text style={styles.title}>Notes</Text>
    </View>
  );

  const renderToDoListContent = () => (
    <View style={styles.content}>
      <Text style={styles.title}>To-Do List</Text>
    </View>
  );

  const renderProjectsContent = () => (
    <View style={styles.content}>
      <Text style={styles.title}>Projects</Text>
    </View>
  );

  const renderContent = (plannerTabsReturnNull = false) => {
    // Check if it's a subject detail tab (from routing)
    if (activeTab && activeTab.startsWith('subject-')) {
      const subjectId = activeTab.replace('subject-', '');
      if (!familyId) {
        return (
          <View style={styles.content}>
            <Text style={styles.title}>Loading...</Text>
          </View>
        )
      }
      try {
        return (
          <SubjectDetailPage
            subjectId={subjectId}
            familyId={familyId}
            children={children || []}
            preloadedSubjectData={subjectDetailCache[subjectId]}
            onSubjectDataUpdate={(data) => handleSubjectDetailUpdate(subjectId, data)}
            onBack={() => {
              if (onTabChange) {
                onTabChange('intelligence');
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.history.pushState({}, '', '/intelligence');
                }
              } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.history.pushState({}, '', '/intelligence');
                window.location.reload();
              }
            }}
            onEditSubject={(subject) => {
              // Dispatch event to open AddSubjectModal in edit mode
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('openAddSubjectModal', {
                  detail: { subject }
                }));
              }
            }}
            onNavigateToPlanner={(params) => {
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                if (onTabChange) onTabChange('planner');
                const queryParams = new URLSearchParams();
                if (params.subjectId) queryParams.set('subjectId', params.subjectId);
                if (params.childId) queryParams.set('childId', params.childId);
                if (params.date) queryParams.set('date', params.date);
                const view = params.view || 'month';
                queryParams.set('view', view);
                const path = `/planner?${queryParams.toString()}`;
                window.history.replaceState({}, '', path);
                window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: view }));
              }
            }}
            onNavigateToLibrary={(subjectId) => {
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                if (onTabChange) onTabChange('materials');
                const path = subjectId ? `/materials?subjectId=${subjectId}` : '/materials';
                window.history.replaceState({}, '', path);
              }
            }}
            onNavigateToPlannerAttendance={() => {
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                if (onTabChange) onTabChange('planner');
                window.history.replaceState({}, '', '/planner?view=attendance');
                window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'attendance' }));
              }
            }}
          />
        );
      } catch (err) {
        console.error('[WebContent] Error rendering SubjectDetailPage:', err);
        return (
          <View style={styles.content}>
            <Text style={styles.title}>Error Loading Subject</Text>
            <Text style={styles.subtitle}>{err?.message || 'Unknown error'}</Text>
          </View>
        )
      }
    }
    // Check if it's a child view tab (from sidebar) — same UI structure as parent home: left sidebar + center grid (main + rail)
    if (activeTab.startsWith('child-')) {
      const childId = activeTab.replace('child-', '');
      const child = children.find(c => c.id === childId);
      if (child && familyId) {
        return (
          <View style={{ flex: 1 }}>
            <ChildHomeScreen
              familyId={familyId}
              onNavigate={onTabChange}
              overrideChildId={child.id}
              overrideFamilyId={familyId}
              overrideChildName={child.first_name || child.name}
              overrideChildren={[child]}
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
    
    // Planner shell tabs: when web keeps planner mounted behind other tabs, return null here
    // and let the outer wrapper render a single persistent renderPlannerContent() instance.
    if (activeTab === 'calendar' || activeTab === 'planner' || activeTab === 'ai-planner') {
      if (plannerTabsReturnNull) return null;
      return renderCalendarContent();
    }
    // NOTE: schedule_overrides removed - Schedule Rules feature disabled
    // Schedule Rules and AI Planner are now modals, not separate tabs
    // If somehow navigated to these tabs, redirect to planner
    // if (activeTab === 'schedule-rules') {
    //   return renderPlannerContent()
    // }
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
      case 'home': {
        // Route by role; use session first so we don't flash parent before role is loaded
        const isChild = roleForHome === 'child' || roleForHome === 'student';
        const isTutor = roleForHome === 'tutor';
        const hasAccessibleChildren = accessibleForHome.length > 0;
        // When we have user but role still unknown: show loading only if we have no familyId; otherwise assume parent
        if (user && roleForHome == null && !familyId) {
          return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' }}>
              <ActivityIndicator size="large" color="#887DEE" />
              <Text style={{ marginTop: 12, fontSize: 14, color: '#6b7280' }}>Loading...</Text>
            </View>
          );
        }
        // Role unknown but have familyId: show parent home (it fetches its own data) so we don't get stuck on loading
        if (user && roleForHome == null && familyId) {
          return (
            <ParentHomeScreen
              familyId={familyId}
              greetingName={parentHomeGreetingName}
              onNavigate={onTabChange}
              onAddEvent={() => Platform.OS === 'web' && typeof window !== 'undefined' && window.dispatchEvent(new CustomEvent('openTaskModal', { detail: { date: new Date() } }))}
              onAddGrade={() => Platform.OS === 'web' && typeof window !== 'undefined' && window.dispatchEvent(new CustomEvent('openAddGradeModal'))}
              onAddMaterial={() => Platform.OS === 'web' && typeof window !== 'undefined' && window.dispatchEvent(new CustomEvent('openAddMaterialModal'))}
              onAddSubject={() => Platform.OS === 'web' && typeof window !== 'undefined' && window.dispatchEvent(new CustomEvent('openAddSubjectModal'))}
              onAddChild={() => onCloseAddChildModal && Platform.OS === 'web' && typeof window !== 'undefined' && window.dispatchEvent(new CustomEvent('openAddChildModal'))}
            />
          );
        }
        if (isChild && hasAccessibleChildren) {
          return (
            <ChildHomeScreen
              familyId={familyId}
              onNavigate={onTabChange}
            />
          );
        }
        if (isTutor) {
          return <TutorDashboard accessibleChildren={accessibleForHome} />;
        }
        // Parent (or fallback)
        if (propSession && (propSession.role_flags?.isParent || (!propSession.role_flags?.isChild && !propSession.role_flags?.isTutor)) && !propSession.loading) {
          return (
              <ParentHomeScreen
                familyId={familyId}
                greetingName={parentHomeGreetingName}
                onNavigate={onTabChange}
                onAddEvent={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('openTaskModal', {
                      detail: { date: new Date() }
                    }));
                  }
                }}
                onAddGrade={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('openAddGradeModal'));
                  }
                }}
                onAddMaterial={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('openAddMaterialModal'));
                  }
                }}
                onAddSubject={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('openAddSubjectModal'));
                  }
                }}
                onAddChild={() => {
                  if (onCloseAddChildModal) {
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('openAddChildModal'));
                    }
                  }
                }}
              />
            );
          }
          // Fallback: if we have familyId show ParentHomeScreen (it handles its own loading); otherwise show loading
          if (familyId) {
            return (
              <ParentHomeScreen
                familyId={familyId}
                greetingName={parentHomeGreetingName}
                onNavigate={onTabChange}
                onAddEvent={() => Platform.OS === 'web' && typeof window !== 'undefined' && window.dispatchEvent(new CustomEvent('openTaskModal', { detail: { date: new Date() } }))}
                onAddGrade={() => Platform.OS === 'web' && typeof window !== 'undefined' && window.dispatchEvent(new CustomEvent('openAddGradeModal'))}
                onAddMaterial={() => Platform.OS === 'web' && typeof window !== 'undefined' && window.dispatchEvent(new CustomEvent('openAddMaterialModal'))}
                onAddSubject={() => Platform.OS === 'web' && typeof window !== 'undefined' && window.dispatchEvent(new CustomEvent('openAddSubjectModal'))}
                onAddChild={() => onCloseAddChildModal && Platform.OS === 'web' && typeof window !== 'undefined' && window.dispatchEvent(new CustomEvent('openAddChildModal'))}
              />
            );
          }
          if (homeLoading || !homeData) {
            return (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' }}>
                <ActivityIndicator size="large" color="#887DEE" />
                <Text style={{ marginTop: 12, fontSize: 14, color: '#6b7280' }}>Loading...</Text>
              </View>
            );
          }
          return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' }}>
              <ActivityIndicator size="large" color="#887DEE" />
              <Text style={{ marginTop: 12, fontSize: 14, color: '#6b7280' }}>Loading...</Text>
            </View>
          );
        }
      case 'child-dashboard':
        if (activeSubtab) {
          const child = accessibleChildren.find(c => c.id === activeSubtab);
          return <ChildDashboard childId={activeSubtab} childName={child?.name || child?.first_name} />
        }
        return accessibleChildren.length > 0 ? (
          <ChildDashboard childId={accessibleChildren[0].id} childName={accessibleChildren[0].name || accessibleChildren[0].first_name} />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' }}>
            <Text style={{ fontSize: 14, color: '#6b7280' }}>No children in your account yet.</Text>
          </View>
        )
      case 'tutor-dashboard':
        return <TutorDashboard accessibleChildren={accessibleChildren} />
      // case 'explore': // Archived - explore page removed
      //   return <ExploreContent familyId={familyId} children={children} />
      case 'new':
        return renderNewContent()
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
            preloadedSubjects={subjects || []}
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
      case 'subjects':
        if (!familyId) {
          return (
            <View style={styles.content}>
              <Text style={styles.title}>Loading...</Text>
            </View>
          )
        }
        try {
          return (
            <SubjectsPage
              familyId={familyId}
              children={children || []}
              preloadedSubjects={subjectsOverviewCache}
              preloadedSubjectDetailCache={subjectDetailCache}
              onSubjectsUpdate={handleSubjectsOverviewUpdate}
              onSubjectDetailUpdate={handleSubjectDetailUpdate}
              userRole={roleForHome ?? userRole}
              accessibleChildren={accessibleChildren}
              onAddSubject={() => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('openAddSubjectModal'));
                }
              }}
              onAddSyllabus={(subject) => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('openSyllabusUpload', {
                    detail: { subjectId: subject.id }
                  }));
                }
              }}
              onAddEvent={(subject) => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  // Get first assigned child ID for defaulting in modals
                  const assignedChildren = subject.assignedChildren || [];
                  const firstAssignedChildId = assignedChildren.length > 0 ? assignedChildren[0] : null;
                  
                  // Dispatch openTaskModal event (handled by both WebContent and WebLayout)
                  window.dispatchEvent(new CustomEvent('openTaskModal', {
                    detail: { 
                      subjectId: subject.id, 
                      eventType: 'Lesson', 
                      date: new Date(),
                      childId: firstAssignedChildId
                    }
                  }));
                }
              }}
              onAddMaterial={(subject) => {
                const assignedChildIds = subject.assignedChildren && Array.isArray(subject.assignedChildren)
                  ? subject.assignedChildren
                  : (subject.assignedChildren ? [subject.assignedChildren] : []);
                setAddMaterialModalDefaultSubjectId(subject.id);
                setAddMaterialModalDefaultSubjectName(subject.name);
                setAddMaterialModalDefaultChildIds(assignedChildIds);
                setShowAddMaterialModal(true);
              }}
              onEditSubject={(subject) => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('openAddSubjectModal', {
                    detail: { subject }
                  }));
                }
              }}
              onNavigateToPlanner={(params) => {
                if (onTabChange) {
                  onTabChange('planner');
                }
              }}
              onNavigateToPlannerAttendance={() => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  if (onTabChange) onTabChange('planner');
                  window.history.replaceState({}, '', '/planner?view=attendance');
                  window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'attendance' }));
                }
              }}
              onNavigateToLibrary={(subjectId) => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  if (onTabChange) onTabChange('materials');
                  const path = subjectId ? `/materials?subjectId=${subjectId}` : '/materials';
                  window.history.replaceState({}, '', path);
                }
              }}
            />
          );
        } catch (err) {
          console.error('[WebContent] Error rendering SubjectsPage:', err);
          return (
            <View style={styles.content}>
              <Text style={styles.title}>Error Loading Subjects</Text>
              <Text style={styles.subtitle}>{err?.message || 'Unknown error'}</Text>
            </View>
          );
        }
      case 'profile':
      case 'settings':
      case 'children-list':
        // Show loading until familyId is ready to avoid blank screen on first visit
        if (user && !familyId) {
          return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' }}>
              <ActivityIndicator size="large" color="#887DEE" />
              <Text style={{ marginTop: 12, fontSize: 14, color: '#6b7280' }}>Loading...</Text>
            </View>
          );
        }
        return (
          <View style={{ flex: 1, minHeight: 0 }}>
            <FamilyPanel
              user={user}
              family={propFamily}
              familyId={familyId}
              onFamilyUpdate={onFamilyUpdate}
              profile={propProfile}
              preloadedSubjects={propFullSubjects && propFullSubjects.length > 0 ? propFullSubjects : (propSubjects || [])}
              userRole={roleForHome ?? userRole}
              currentChildId={(roleForHome === 'child' || roleForHome === 'student') ? (typeof accessibleForHome[0] === 'string' ? accessibleForHome[0] : accessibleForHome[0]?.id) ?? propSession?.child_id : null}
              viewingAsChildId={(roleForHome === 'parent' || !roleForHome) && propActiveChildId ? propActiveChildId : null}
              initialSection={activeTab === 'settings' ? (activeSubtab || 'profile') : undefined}
            />
          </View>
        );
      default:
        // Unknown tab: show home as fallback so we never render blank
        if (activeTab === 'home' || !activeTab) {
          return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' }}>
              <ActivityIndicator size="large" color="#887DEE" />
              <Text style={{ marginTop: 12, fontSize: 14, color: '#6b7280' }}>Loading...</Text>
            </View>
          );
        }
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' }}>
            <Text style={{ fontSize: 14, color: '#6b7280' }}>Loading...</Text>
          </View>
        );
    }
  };

  const contentWrapStyle = {
    flex: 1,
    ...(Platform.OS === 'web' ? { minHeight: 360 } : { minHeight: 0 }),
  };
  const persistPlannerWeb = Platform.OS === 'web' && !!familyId;
  const isPlannerShellTab =
    activeTab === 'planner' || activeTab === 'calendar' || activeTab === 'ai-planner';
  const innerContent = renderContent(persistPlannerWeb);
  const hiddenPlannerLayerStyle =
    Platform.OS === 'web'
      ? {
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          opacity: 0,
          zIndex: 0,
          overflow: 'hidden',
          width: '100%',
          height: '100%',
        }
      : {};

  return (
    <>
      <View style={contentWrapStyle}>
        {persistPlannerWeb ? (
          <View style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <View
              style={
                isPlannerShellTab
                  ? { flex: 1, minHeight: 0, zIndex: 1 }
                  : hiddenPlannerLayerStyle
              }
              pointerEvents={isPlannerShellTab ? 'auto' : 'none'}
            >
              {renderPlannerContent()}
            </View>
            {!isPlannerShellTab && innerContent != null ? (
              <View
                style={{
                  flex: 1,
                  minHeight: 0,
                  zIndex: 1,
                  backgroundColor: '#fff',
                }}
              >
                {innerContent}
              </View>
            ) : null}
          </View>
        ) : (
          innerContent
        )}
      </View>
      <AddMaterialModal
        visible={showAddMaterialModal}
        onClose={() => setShowAddMaterialModal(false)}
        onSaved={() => {
          setShowAddMaterialModal(false);
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('materialSaved'));
        }}
        familyId={familyId}
        children={children || []}
        defaultSubjectId={addMaterialModalDefaultSubjectId}
        defaultSubjectName={addMaterialModalDefaultSubjectName}
        defaultChildIds={addMaterialModalDefaultChildIds}
      />
      <ConfirmDialog
        visible={confirmDialog.visible}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel={confirmDialog.cancelLabel}
        destructive={confirmDialog.destructive}
        onConfirm={confirmDialog.onConfirm}
        onCancel={confirmDialog.onCancel}
      />
    </>
  );
}
