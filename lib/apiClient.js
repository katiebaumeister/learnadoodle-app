/**
 * Unified API Client
 * 
 * Provides consistent interface for:
 * - Supabase RPC calls
 * - Express API routes
 * - Date/timezone helpers
 * - Error handling
 */

import { supabase } from './supabase';

// Import environment variables (via react-native-dotenv)
// react-native-dotenv requires CommonJS require, but we need to handle both.
// Prefer EXPO_PUBLIC_API_URL (Expo inlines at build time on Vercel).
let REACT_APP_API_URL;
let EXPO_PUBLIC_API_URL;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const env = require('@env');
  REACT_APP_API_URL = env.REACT_APP_API_URL;
  EXPO_PUBLIC_API_URL = env.EXPO_PUBLIC_API_URL;
} catch (e) {
  if (typeof process !== 'undefined' && process.env) {
    REACT_APP_API_URL = process.env.REACT_APP_API_URL;
    EXPO_PUBLIC_API_URL = process.env.EXPO_PUBLIC_API_URL;
  }
}

// Single API base: Expo inlines EXPO_PUBLIC_* at build time; Vercel sets REACT_APP_* and we write both to .env in vercel-build
const API_BASE_URL = EXPO_PUBLIC_API_URL || REACT_APP_API_URL;

// Production domain → API base (runtime fallback when build env didn't inject API URL)
const LEARNADOODLE_WEB_ORIGIN = 'https://learnadoodle.com';
const LEARNADOODLE_APP_ORIGIN = 'https://app.learnadoodle.com';
const LEARNADOODLE_API_BASE = 'https://api.learnadoodle.com';

/** Base URL for the app (sign-in/accept flow). Uses current origin so "Continue" stays on the same site (learnadoodle.com/invite/... or localhost/invite/...). */
export const getAppBase = () => {
  if (typeof window !== 'undefined') return window.location.origin;
  return LEARNADOODLE_APP_ORIGIN;
};

// Get API base URL (for Express/FastAPI routes). Exported so components can use the same base (including learnadoodle.com fallback).
export const getAPIBase = () => {
  if (typeof window !== 'undefined') {
    let base = API_BASE_URL || window.location.origin;
    // Dev: never call FastAPI routes on the web/Expo dev server (8081, 19006, etc.) — use the API port
    try {
      const u = new URL(base);
      const devHosts = new Set(['localhost', '127.0.0.1']);
      const apiPort =
        (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_PORT) || '8001';
      if (devHosts.has(u.hostname) && u.port && u.port !== apiPort) {
        base = `${u.protocol}//${u.hostname}:${apiPort}`;
      }
    } catch (e) {
      if (base.startsWith('http://localhost:') && (base.includes(':8081') || base.endsWith('8081'))) {
        base = 'http://localhost:8001';
      }
    }
    const host = window.location.hostname;
    const isLearnadoodleHost = host === 'learnadoodle.com' || host === 'www.learnadoodle.com' || host === 'app.learnadoodle.com';
    const isRenderHost = typeof base === 'string' && /:\/\/[^/]*onrender\.com(?:\/|$)/i.test(base);
    // Never send /api/* requests to Supabase: if env points at Supabase, use backend URL on our domains
    if (isLearnadoodleHost && base && base.includes('supabase.co')) {
      base = LEARNADOODLE_API_BASE;
    }
    // Production web should use the first-party API domain to avoid CORS surprises from Render hostnames.
    if (isLearnadoodleHost && isRenderHost) {
      base = LEARNADOODLE_API_BASE;
    }
    // Runtime fallback: when served from learnadoodle.com or app.learnadoodle.com, use api.learnadoodle.com (fixes Vercel builds that didn't get env)
    const useAppFallback = !base || base === window.location.origin;
    if (useAppFallback && isLearnadoodleHost) {
      base = LEARNADOODLE_API_BASE;
    }
    return base;
  }
  return API_BASE_URL || '';
};

// ============================================================
// Date & Timezone Helpers
// ============================================================

/**
 * Get week start date (Monday) for a given date
 * @param {Date|string} date - Date to calculate week start for
 * @returns {Date} Monday of that week
 */
export const getWeekStart = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
};

/**
 * Format date as YYYY-MM-DD
 * @param {Date|string} date
 * @returns {string}
 */
export const formatDate = (date) => {
  if (!date) return '';
  
  // If already in YYYY-MM-DD format, return as-is
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) {
      return '';
    }
    return d.toISOString().split('T')[0];
  } catch (err) {
    return '';
  }
};

/**
 * Get family timezone (helper for consistent timezone handling)
 * @param {string} familyId
 * @returns {Promise<string>} Timezone string (defaults to 'UTC')
 */
export const getFamilyTimezone = async (familyId) => {
  try {
    const { data, error } = await supabase
      .rpc('get_family_timezone', { _family_id: familyId });
    
    if (error) {
      return 'UTC';
    }
    
    return data || 'UTC';
  } catch (err) {
    return 'UTC';
  }
};

/**
 * Convert UTC timestamp to local date string
 * @param {string} utcTimestamp - ISO timestamp
 * @param {string} timezone - Timezone string
 * @returns {string} YYYY-MM-DD in local timezone
 */
export const utcToLocalDate = (utcTimestamp, timezone = 'UTC') => {
  // For now, simple conversion - can be enhanced with date-fns-tz if needed
  const date = new Date(utcTimestamp);
  return formatDate(date);
};

// ============================================================
// Error Handling
// ============================================================

/**
 * Handle API errors consistently
 * @param {Error} error
 * @param {string} context - Context for error message
 * @returns {Object} { error: true, message: string }
 */
export const handleAPIError = (error, context = 'API call') => {
  // Suppress expected errors from console logging
  if (!shouldSuppressError(error)) {
  }
  
  let message = 'An error occurred';
  if (error?.message) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }
  
  return { error: true, message };
};

/**
 * Show error toast (if toast system exists)
 * @param {string} message
 */
export const showErrorToast = (message) => {
  // TODO: Integrate with toast system if available
  if (typeof window !== 'undefined' && window.alert) {
    // Fallback to alert for now
}
};

// ============================================================
// Planner / Reschedule API
// ============================================================

/**
 * Reschedule an event to new start/end times
 * @param {string} eventId - Event ID
 * @param {string} newStartAt - New start timestamp (ISO 8601)
 * @param {string} newEndAt - New end timestamp (ISO 8601)
 * @param {string} origin - Reschedule origin (e.g., 'drag_drop', 'shift_week')
 * @param {string} reason - Human-readable reason
 * @returns {Promise<{data?: any, error?: any}>}
 */
export const rescheduleEvent = async (eventId, newStartAt, newEndAt, origin = 'drag_drop', reason = 'manual move') => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { error: { message: 'Not authenticated' } };
    }

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/events/${eventId}/reschedule`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        new_start_at: newStartAt,
        new_end_at: newEndAt,
        origin,
        reason,
      }),
    });

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorJson = await response.json();
        errorMessage = errorJson.detail || errorJson.message || errorMessage;
      } catch {
      const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      return { error: { message: errorMessage, status: response.status } };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    return handleAPIError(error, 'rescheduleEvent');
  }
};

/**
 * Shift a week forward by 7 days
 * @param {string} weekStart - Week start date (YYYY-MM-DD)
 * @returns {Promise<{data?: any, error?: any}>}
 */
export const shiftWeek = async (weekStart) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { error: { message: 'Not authenticated' } };
    }

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/planner/shift_week`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ week_start: weekStart }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: { message: errorText || response.statusText, status: response.status } };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    return handleAPIError(error, 'shiftWeek');
  }
};

/**
 * Freeze or unfreeze a week
 * @param {string} weekStart - Week start date (YYYY-MM-DD)
 * @param {boolean} frozen - Whether to freeze (true) or unfreeze (false)
 * @returns {Promise<{data?: any, error?: any}>}
 */
export const freezeWeek = async (weekStart, frozen) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { error: { message: 'Not authenticated' } };
    }

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/planner/freeze_week`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ week_start: weekStart, frozen }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: { message: errorText || response.statusText, status: response.status } };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    return handleAPIError(error, 'freezeWeek');
  }
};

// ============================================================
// Supabase RPC Wrappers
// ============================================================

/**
 * Fetch/PostgREST was cancelled (navigation, OAuth handoff, React remount, or Supabase dropping stale requests).
 * Not a product bug — do not log as an error.
 */
export const isAbortLikeError = (error) => {
  if (error == null) return false;
  if (error.name === 'AbortError') return true;
  const msg = String(error.message ?? error.error_description ?? '');
  if (msg.includes('The operation was aborted')) return true;
  if (/^AbortError\b/i.test(msg) || msg.includes('AbortError:')) return true;
  return false;
};

/**
 * Check if an error should be suppressed from logging
 * @param {Error|Object} error - Error object
 * @returns {boolean} True if error should be suppressed
 */
export const shouldSuppressError = (error) => {
  if (isAbortLikeError(error)) return true;

  const status = error?.status || error?.response?.status || error?.statusCode;
  const code = error?.code;
  const message = (error?.message || '').toLowerCase();
  
  // Suppress 400/403/404/422/500 HTTP errors 
  // - 403 = RLS blocking, expected if table exists but permissions not set up
  // - 422 = Validation error, expected if endpoint exists but params are missing
  // - 500 = Server error, can be expected if table/function doesn't exist or has issues
  if (status === 400 || status === 403 || status === 404 || status === 422 || status === 500) {
    return true;
  }
  
  // Suppress common Supabase/PostgREST errors that are expected
  if (code === 'PGRST116' || 
      code === '42P01' || 
      code === '23505' || // Unique constraint violation (can be expected)
      code === '42501' || // Insufficient privilege (RLS blocking)
      message.includes('does not exist') || 
      (message.includes('relation') && message.includes('does not exist')) ||
      message.includes('404') ||
      message.includes('403') ||
      message.includes('not found') ||
      message.includes('permission denied') ||
      message.includes('row-level security') ||
      message.includes('insufficient privilege')) {
    return true;
  }
  
  return false;
};

/**
 * Call Supabase RPC with error handling
 * @param {string} rpcName - RPC function name
 * @param {Object} params - RPC parameters
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const callRPC = async (rpcName, params = {}) => {
  try {
    const { data, error } = await supabase.rpc(rpcName, params);
    
    if (error) {
      // Suppress expected errors from console logging
      if (!shouldSuppressError(error)) {
      }
      return { data: null, error };
    }
    
    return { data, error: null };
  } catch (err) {
    // Suppress expected errors from console logging
    if (!shouldSuppressError(err)) {
    }
    return { data: null, error: err };
  }
};

// ============================================================
// Express API Route Helpers
// ============================================================

/**
 * Make API request to Express routes
 * @param {string} endpoint - API endpoint (e.g., '/api/flexible/create')
 * @param {Object} options - Fetch options
 * @returns {Promise<{data: any, error: Error|null}>}
 */
/** Endpoints that do not require authentication (no 401 when session missing). */
const PUBLIC_API_PATHS = [
  '/api/invites/preview/',
  '/api/invites/accept_with_password',
  '/api/auth/child/accept_invite',
  '/api/auth/signup-confirmation-sent',
  '/api/holidays/public',
  '/api/holidays/countries',
  '/api/holidays/subdivisions',
];

const isPublicEndpoint = (path) => PUBLIC_API_PATHS.some((p) => path.startsWith(p) || path === p);

export const apiRequest = async (endpoint, options = {}) => {
  const API_BASE = getAPIBase();
  const url = `${API_BASE}${endpoint}`;
  const { timeoutMs = 30000, signal: userSignal, ...fetchOptions } = options;

  // Get Supabase session token for authentication
  let authToken = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      authToken = session.access_token;
    }
  } catch (err) {
  }

  // Skip authenticated requests when no session to avoid 401 noise in console
  if (!authToken && !isPublicEndpoint(endpoint)) {
    return { data: null, error: { message: 'Not authenticated', status: 401 } };
  }
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
    },
    cache: 'no-store', // avoid cached (e.g. GIF) response for API
  };
  
  try {
    let timeoutId = null;
    let signal = userSignal;
    if (!userSignal) {
      const controller = new AbortController();
      signal = controller.signal;
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    const response = await fetch(url, {
      ...defaultOptions,
      ...fetchOptions,
      signal,
      headers: {
        ...defaultOptions.headers,
        ...(fetchOptions.headers || {}),
      },
      cache: fetchOptions.cache ?? defaultOptions.cache,
    });

    if (timeoutId) clearTimeout(timeoutId);
    
    // Get response text first to check if it's valid JSON
    const responseText = await response.text();
    
    if (!response.ok) {
      // Suppress logging for 400/404 errors
      const shouldSuppress = response.status === 400 || response.status === 404;
      
      let errorMessage = `HTTP ${response.status}`;
      
      // Check for 405 Method Not Allowed - often means backend URL is not configured
      if (response.status === 405 && typeof window !== 'undefined') {
        const currentOrigin = window.location.origin;
        if (url.startsWith(currentOrigin)) {
          // We're calling the frontend origin instead of the backend
          errorMessage = 'Backend API URL not configured. Please set REACT_APP_API_URL environment variable to point to your FastAPI backend server.';
        }
      }
      
      try {
        const errorData = JSON.parse(responseText);
        // FastAPI returns 'detail' field for validation errors
        errorMessage = errorData.detail || errorData.error || errorData.message || errorMessage;
        // If detail is an array (validation errors), format it nicely
        if (Array.isArray(errorData.detail)) {
          const formattedErrors = errorData.detail.map(err => {
            if (err.loc && err.msg) {
              return `${err.loc.join('.')}: ${err.msg}`;
            }
            return err.msg || JSON.stringify(err);
          });
          errorMessage = formattedErrors.join('; ');
        }
      } catch (parseErr) {
        // If response is not JSON, use the text or status text (unless we already have a better message)
        if (errorMessage === `HTTP ${response.status}`) {
          errorMessage = responseText || response.statusText || errorMessage;
        }
      }
      const error = new Error(errorMessage);
      error.status = response.status;
      error.detail = errorMessage;
      
      // Only log non-suppressed errors
      if (!shouldSuppress) {
      }
      
      return { data: null, error };
    }
    
    // Parse response as JSON
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch (parseErr) {
      const preview = typeof responseText === 'string'
        ? (responseText.length > 200 ? responseText.slice(0, 200) + '...' : responseText)
        : String(responseText);
      if (process.env.NODE_ENV === 'development' && typeof console !== 'undefined') {
        console.warn('[apiClient] Invalid JSON from', url, 'Status:', response.status, 'Preview:', preview || '(empty body)');
      }
      const errMsg = responseText
        ? 'Invalid response format from server (expected JSON).'
        : 'Invalid response format from server (empty body).';
      const error = new Error(errMsg);
      error.status = response.status;
      error.preview = preview;
      return { data: null, error };
    }
    
    return { data, error: null };
  } catch (err) {
    // Don't log network errors as errors in console (they're expected when backend is down)
    const isNetworkError = err.message === 'Load failed' || err.message === 'Failed to fetch' || err.name === 'TypeError';
    
    // Suppress 400/404 errors
    const status = err?.status || err?.response?.status || err?.statusCode;
    const shouldSuppress = status === 400 || status === 404;
    
    if (!isNetworkError && !shouldSuppress) {
    }
    
    // Provide more helpful error messages
    let errorMessage = err.message || 'Request failed';
    if (err.name === 'AbortError') {
      if (endpoint.includes('apply_to_calendar')) {
        errorMessage =
          'Request timed out while applying your plan. If the backend is still working, your plan may have saved—refresh the planner in a moment. Otherwise try again, or run the backend closer to this machine.';
      } else {
        errorMessage =
          timeoutMs > 45000
            ? 'Request timed out — large imports can take a while. Try again, paste a smaller section, or check your network.'
            : 'Request timed out. Please check if the backend server is running on ' + API_BASE;
      }
    } else if (err.message === 'Load failed' || err.message === 'Failed to fetch' || err.name === 'TypeError') {
      // Network error - backend is likely not running
      errorMessage = `Cannot connect to backend server at ${API_BASE}. Please ensure the server is running.`;
    }
    
    return { data: null, error: new Error(errorMessage) };
  }
};

// ============================================================
// Event API Methods
// ============================================================

/**
 * Get single event with relations
 * @param {string} eventId
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const getEvent = async (eventId) => {
  try {
    // First, fetch the event without joins
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();
    
    if (eventError) throw eventError;
    
    // Fetch child separately if child_id exists, or if child_id is NULL but child_ids array has values
    // For flexible events with overlaps, child_id might be NULL but child_ids array contains the assignment
    const effectiveChildId = eventData?.child_id || 
                             (eventData?.child_ids && eventData.child_ids.length > 0 ? eventData.child_ids[0] : null);
    
    if (eventData && effectiveChildId) {
      const { data: childData, error: childError } = await supabase
        .from('children')
        // Use first_name only; some databases don't have a generic name column
        .select('id, first_name')
        .eq('id', effectiveChildId)
        .single();
      
      // Only add child if fetch succeeded (ignore errors - child might not exist)
      if (!childError && childData) {
        eventData.child = childData;
      } else {
        console.warn('[getEvent] Failed to load child:', childError);
      }
    }
    
    // Fetch subject separately if subject_id exists
    if (eventData && eventData.subject_id) {
      const { data: subjectData, error: subjectError } = await supabase
        .from('subject')
        .select('id, name')
        .eq('id', eventData.subject_id)
        .single();
      
      // Only add subject if fetch succeeded (ignore errors - subject might not exist)
      if (!subjectError && subjectData) {
        eventData.subject = subjectData;
      }
    }
    
    return { data: eventData, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Link event to syllabus section
 * @param {string} eventId
 * @param {string} sectionId
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const linkEventSyllabus = async (eventId, sectionId) => {
  try {
    // First, get the section to find its syllabus
    const { data: section, error: sectionError } = await supabase
      .from('syllabus_sections')
      .select('syllabus_id')
      .eq('id', sectionId)
      .single();
    
    if (sectionError) throw sectionError;
    
    // Update event with syllabus and section references
    const { data, error } = await supabase
      .from('events')
      .update({
        source_syllabus_id: section.syllabus_id,
        source_section_id: sectionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .select()
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Get syllabus by ID with sections
 * @param {string} syllabusId
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const getSyllabusById = async (syllabusId) => {
  try {
    const { data, error } = await supabase
      .from('syllabi')
      .select(`
        *,
        sections:syllabus_sections(*),
        child:children(id, first_name),
        subject:subject(id, name)
      `)
      .eq('id', syllabusId)
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

// ============================================================
// Flexible Tasks API Methods
// ============================================================

/**
 * Get flexible backlog items
 * @param {string} familyId
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const getFlexibleBacklog = async (familyId) => {
  return callRPC('get_flexible_backlog', { _family_id: familyId });
};

/**
 * Schedule flexible task
 * @param {Object} params - { source, id, targetDate, familyId, childId }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const scheduleFlexible = async (params) => {
  return apiRequest('/api/flexible/schedule', {
    method: 'POST',
    body: JSON.stringify(params),
  });
};

/**
 * Create flexible task
 * @param {Object} params
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const createFlexibleTask = async (params) => {
  return apiRequest('/api/flexible/create', {
    method: 'POST',
    body: JSON.stringify(params),
  });
};

// ============================================================
// Plan Suggestions API Methods
// ============================================================

/**
 * Get plan suggestions
 * @param {Object} params - { familyId, childId? }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const getPlanSuggestions = async (params) => {
  try {
    let query = supabase
      .from('plan_suggestions')
      .select('*')
      .eq('family_id', params.familyId);
    
    if (params.childId) {
      query = query.eq('child_id', params.childId);
    }
    
    query = query.eq('status', 'suggested')
      .order('target_day', { ascending: true });
    
    const { data, error } = await query;
    
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Accept a plan suggestion (single suggestion)
 * @param {Object} params - { id, startTs }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const acceptSuggestion = async (params) => {
  try {
    // Get suggestion details
    const { data: suggestion, error: suggestionError } = await supabase
      .from('plan_suggestions')
      .select('*')
      .eq('id', params.id)
      .single();
    
    if (suggestionError) throw suggestionError;
    
    // Create event from suggestion
    const { data: event, error: eventError } = await supabase
      .from('events')
      .insert({
        family_id: suggestion.family_id,
        child_id: suggestion.child_id,
        subject_id: suggestion.subject_id,
        title: suggestion.title,
        description: suggestion.notes,
        start_ts: params.startTs,
        end_ts: new Date(new Date(params.startTs).getTime() + (suggestion.estimated_minutes || 60) * 60000).toISOString(),
        status: 'scheduled',
        source_syllabus_id: suggestion.syllabus_id,
        source_section_id: suggestion.section_id,
        estimated_minutes: suggestion.estimated_minutes,
        is_flexible: suggestion.is_flexible || false,
      })
      .select()
      .single();
    
    if (eventError) throw eventError;
    
    // Mark suggestion as accepted
    const { error: updateError } = await supabase
      .from('plan_suggestions')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', params.id);
    
    if (updateError) throw updateError;
    
    return { data: event, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

// ============================================================
// Syllabus API Methods
// ============================================================

/**
 * Suggest plan from syllabus
 * @param {string} syllabusId
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const suggestPlan = async (syllabusId) => {
  return apiRequest(`/api/syllabus/${syllabusId}/suggest`, {
    method: 'POST',
  });
};

/**
 * Accept plan (create events from suggestions)
 * @param {Object} params - { syllabusId, items: [...] }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const acceptPlan = async (params) => {
  return apiRequest(`/api/syllabus/${params.syllabusId}/accept`, {
    method: 'POST',
    body: JSON.stringify({ items: params.items }),
  });
};

// ============================================================
// Document Stats API Methods
// ============================================================

/**
 * Get light evidence subjects (low uploads)
 * @param {Object} params - { familyId, childId? }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const getLightEvidenceSubjects = async (params) => {
  return callRPC('get_light_evidence_subjects', {
    p_family_id: params.familyId,
    p_child_id: params.childId || null,
  });
};

/**
 * Compare progress to syllabus (weekly)
 * @param {Object} params - { familyId, childId?, weekStart }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const compareToSyllabusWeek = async (params) => {
  return callRPC('compare_to_syllabus_week', {
    p_family_id: params.familyId,
    p_child_id: params.childId || null,
    p_week_start: formatDate(params.weekStart),
  });
};

/**
 * Get document stats
 * @param {Object} params - { familyId, childId?, range: 'month'|'week'|'year' }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const getDocumentStats = async (params) => {
  return apiRequest('/api/documents/stats', {
    method: 'GET',
    // Query params would be added here
  });
};

// ============================================================
// Capacity API Methods
// ============================================================

/**
 * Get capacity for a week (family-level)
 * @param {Object} params - { familyId, weekStart }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const getCapacity = async (params) => {
  return callRPC('get_capacity', {
    _family_id: params.familyId,
    _week_start: formatDate(params.weekStart),
  });
};

// ============================================================
// AI Rescheduling API Methods
// ============================================================

/**
 * Create a blackout period
 * @param {Object} params - { familyId, childId?, startsOn, endsOn, reason? }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
/**
 * Adjust schedule - unified endpoint for blackouts, overrides, and event handling
 * @param {Object} params - { person_id, family_id, start_date, end_date, adjustment_type, event_handling, notes, scope_type }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const adjustSchedule = async (params) => {
  if (!params.person_id || !params.start_date || !params.adjustment_type) {
    return { data: null, error: new Error('Missing required fields: person_id, start_date, adjustment_type') };
  }

  return await apiRequest('/api/schedule/adjust', {
    method: 'POST',
    body: JSON.stringify({
      person_id: params.person_id,
      family_id: params.family_id,
      start_date: params.start_date,
      end_date: params.end_date || params.start_date,
      adjustment_type: params.adjustment_type,
      event_handling: params.event_handling || 'reschedule',
      notes: params.notes || null,
      scope_type: params.scope_type || 'family',
    }),
  });
};

/**
 * Undo last reschedule operation
 * Reverses the most recent schedule adjustment/reschedule
 */
export const undoLastReschedule = async () => {
  try {
    const response = await fetch(`${getAPIBase() || ''}/api/schedule/undo_last_reschedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { data: null, error: new Error(errorText || response.statusText) };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const createBlackout = async (params) => {
  // Use alert for maximum visibility
  if (typeof window !== 'undefined' && window.alert) {
    window.alert('createBlackout FUNCTION CALLED - Check console');
  }
  // Use console.warn/error which are less likely to be filtered

  if (!params.familyId || !params.startsOn || !params.endsOn) {
    return { data: null, error: new Error('Missing required fields: familyId, startsOn, endsOn') };
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(params.startsOn) || !dateRegex.test(params.endsOn)) {
    return { 
      data: null, 
      error: new Error('Invalid date format. Expected YYYY-MM-DD (e.g., 2025-11-15)') 
    };
  }

  const startsOnFormatted = formatDate(params.startsOn);
  const endsOnFormatted = formatDate(params.endsOn);
  
  if (!startsOnFormatted || !endsOnFormatted) {
    return { 
      data: null, 
      error: new Error('Invalid date values. Please check your dates.') 
    };
  }

  // Validate date range
  const startDate = new Date(startsOnFormatted);
  const endDate = new Date(endsOnFormatted);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return { data: null, error: new Error('Invalid date values') };
  }
  if (startDate > endDate) {
    return { data: null, error: new Error('Start date must be before or equal to end date') };
  }

  try {
    // Insert blackout period directly into Supabase

    const insertPayload = {
      family_id: params.familyId,
      child_id: params.childId || null,
      starts_on: startsOnFormatted,
      ends_on: endsOnFormatted,
      reason: params.reason || 'blackout',
    };

    const { data: blackout, error: blackoutError } = await supabase
      .from('blackout_periods')
      .insert(insertPayload)
      .select()
      .single();

    if (blackoutError) {
      return { data: null, error: blackoutError };
    }
    
    if (!blackout) {
      return { data: null, error: new Error('Blackout insert succeeded but returned no data') };
    }

    // Immediately verify it can be read back
    const { data: verifyRead, error: verifyReadError } = await supabase
      .from('blackout_periods')
      .select('*')
      .eq('id', blackout.id)
      .single();

    // NOTE: schedule_overrides removed - no longer creating overrides for blackouts
    // Previously created schedule_overrides for each day in range, but this is no longer used
    // const overrides = [];
    // const start = new Date(startsOnFormatted);
    // const end = new Date(endsOnFormatted);
    // ... (entire schedule_overrides creation loop commented out)

    // Refresh calendar cache (if RPC exists)
    try {
      await supabase.rpc('refresh_calendar_days_cache', {
        p_family_id: params.familyId,
        p_from_date: startsOnFormatted,
        p_to_date: endsOnFormatted,
      });
    } catch (refreshError) {
      // Non-critical, continue
    }

    // Final verification - try to read the blackout back by ID

    const { data: finalBlackout, error: finalError } = await supabase
      .from('blackout_periods')
      .select('*')
      .eq('id', blackout.id)
      .single();

    if (!finalBlackout && !finalError) {
    }
    
    // Log final summary

    return {
      data: {
        blackoutId: blackout.id,
        overridesCreated: overrides.length,
        dates: overrides,
        canReadBack: !!finalBlackout, // Include this so caller knows if RLS is blocking reads
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Parse syllabus using LLM
 * @param {Object} params - { syllabusId, storageBucket, storagePath, familyId, childId? }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const parseSyllabus = async (params) => {
  return apiRequest('/llm/parse-syllabus', {
    method: 'POST',
    body: JSON.stringify({
      syllabus_id: params.syllabusId,
      storage_bucket: params.storageBucket || 'syllabi',
      storage_path: params.storagePath,
      family_id: params.familyId,
      child_id: params.childId || null,
    }),
  });
};

/**
 * Propose a reschedule plan (FastAPI version)
 * @param {Object} params - { familyId, weekStart, childIds, horizonWeeks?, reason? }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
      export const proposeReschedule = async (params) => {
        const API_BASE = getAPIBase();
        const url = `${API_BASE}/llm/suggest-plan`;

        // Add timeout (60 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, 60000);
        
        const fetchStartTime = Date.now();
        try {
          const response = await fetch(url, {
            method: 'POST',
            mode: 'cors', // Explicitly set CORS mode
            credentials: 'include', // Include credentials for CORS
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              family_id: params.familyId,
              week_start: formatDate(params.weekStart),
              child_ids: params.childIds,
              horizon_weeks: params.horizonWeeks || 2,
              reason: params.reason || 'rebalance',
            }),
          });
          
          const fetchDuration = Date.now() - fetchStartTime;

          clearTimeout(timeoutId);
          
          if (!response.ok) {
            const errorText = await response.text();

            let errorMessage = `HTTP ${response.status}`;
            try {
              const errorData = JSON.parse(errorText);
              errorMessage = errorData.detail || errorData.error || errorMessage;
            } catch (e) {
              errorMessage = errorText || errorMessage;
            }
            return { data: null, error: new Error(errorMessage) };
          }

          const data = await response.json();
          const totalDuration = Date.now() - fetchStartTime;
          
          return { data, error: null };
        } catch (err) {
          clearTimeout(timeoutId);
          const totalDuration = Date.now() - fetchStartTime;

          // Handle timeout/abort errors
          if (err.name === 'AbortError' || err.message?.includes('aborted')) {
            return { data: null, error: new Error('Request timed out. Please try again.') };
          }
          
          return { data: null, error: err };
        }
      };

/**
 * Approve and apply plan changes (FastAPI version)
 * @param {Object} params - { planId, approvals: [{changeId, approved, edits?}] }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const approvePlan = async (params) => {
  return apiRequest('/llm/approve', {
    method: 'PATCH',
    body: JSON.stringify({
      plan_id: params.planId,
      approvals: params.approvals.map(a => ({
        change_id: a.changeId,
        approved: a.approved,
        edits: a.edits || null,
      })),
    }),
  });
};

/**
 * Recompute learning velocity
 * @param {Object} params - { familyId, sinceWeeks? }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const recomputeVelocity = async (params) => {
  return apiRequest('/api/ai/recompute-velocity', {
    method: 'POST',
    body: JSON.stringify({
      familyId: params.familyId,
      sinceWeeks: params.sinceWeeks || 6,
    }),
  });
};

// ============================================================
// External Content Integration
// ============================================================

/**
 * Fetch external courses
 * @param {Object} params - { provider?, subject?, subject_key?, stage_key?, q?, limit?, offset? }
 * @returns {Promise<{data: {items: any[], total: number}, error: Error|null}>}
 */
export const fetchExternalCourses = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.provider) queryParams.append('provider', params.provider);
    if (params.subject) queryParams.append('subject', params.subject);
    if (params.subject_key) queryParams.append('subject_key', params.subject_key);
    if (params.stage_key) queryParams.append('stage_key', params.stage_key);
    if (params.q) queryParams.append('q', params.q);
    if (typeof params.limit === 'number') queryParams.append('limit', String(params.limit));
    if (typeof params.offset === 'number') queryParams.append('offset', String(params.offset));
    
    const url = `/api/external/courses${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return await apiRequest(url, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Fetch course outline (units and lessons)
 * @param {string} courseId
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const fetchCourseOutline = async (courseId) => {
  try {
    return await apiRequest(`/api/external/courses/${courseId}/outline`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Schedule external course
 * @param {Object} params - { familyId, childId, courseId, startDate, daysPerWeek, sessionsPerDay?, startTime?, blockMinutes? }
 * @returns {Promise<{data: {scheduled_events: number}, error: Error|null}>}
 */
export const scheduleExternalCourse = async (params) => {
  try {
    return await apiRequest('/api/external/schedule_course', {
      method: 'POST',
      body: JSON.stringify({
        family_id: params.familyId,
        child_id: params.childId,
        course_id: params.courseId,
        start_date: params.startDate,
        days_per_week: params.daysPerWeek,
        sessions_per_day: params.sessionsPerDay || 1,
        start_time: params.startTime || '10:00',
        block_minutes: params.blockMinutes || 45,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Get resume point for a course
 * @param {string} courseId
 * @param {string} childId
 * @returns {Promise<{data: {lesson_id?: string, position_seconds?: number, progress_percentage?: number, last_viewed_at: string}, error: Error|null}>}
 */
export const getResumePoint = async (courseId, childId) => {
  try {
    const url = `/api/external/courses/${courseId}/resume?child_id=${childId}`;
    return await apiRequest(url, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Update resume point for a course
 * @param {string} courseId
 * @param {Object} params - { child_id, lesson_id?, position_seconds?, progress_percentage? }
 * @param {string} courseType - 'youtube', 'khan_academy', 'coursera', 'general'
 * @returns {Promise<{data: ResumePoint, error: Error|null}>}
 */
export const updateResumePoint = async (courseId, params, courseType = 'general') => {
  try {
    const url = `/api/external/courses/${courseId}/resume?course_type=${courseType}`;
    return await apiRequest(url, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Generate deep link for a course
 * @param {string} courseId
 * @param {string} childId
 * @param {string} lessonId - Optional lesson ID
 * @returns {Promise<{data: {deep_link: string, qr_code_url: string, share_text: string}, error: Error|null}>}
 */
export const generateDeepLink = async (courseId, childId, lessonId = null) => {
  try {
    const params = new URLSearchParams();
    params.append('child_id', childId);
    if (lessonId) params.append('lesson_id', lessonId);
    
    const url = `/api/external/courses/${courseId}/deep-link?${params.toString()}`;
    return await apiRequest(url, { method: 'POST' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const fetchExternalProgress = async (childId) => {
  try {
    return await apiRequest(`/api/external/progress?child_id=${encodeURIComponent(childId)}`, {
      method: 'GET',
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const upsertExternalProgress = async ({ childId, lessonId, status }) => {
  try {
    return await apiRequest('/api/external/progress', {
      method: 'POST',
      body: JSON.stringify({
        child_id: childId,
        external_lesson_id: lessonId,
        status,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Add YouTube video/playlist from URL
 * @param {Object} params - { familyId, url, childId?, startDate?, daysPerWeek?, sessionsPerDay?, startTime?, blockMinutes? }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const addFromLink = async (params) => {
  try {
    return await apiRequest('/api/external/add_from_link', {
      method: 'POST',
      body: JSON.stringify({
        family_id: params.familyId,
        url: params.url,
        child_id: params.childId || undefined,
        start_date: params.startDate || undefined,
        days_per_week: params.daysPerWeek || undefined,
        sessions_per_day: params.sessionsPerDay || undefined,
        start_time: params.startTime || undefined,
        block_minutes: params.blockMinutes || undefined,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const addExternalLink = async (params) => {
  try {
    return await apiRequest('/api/external/add_link', {
      method: 'POST',
      body: JSON.stringify({
        child_id: params.childId,
        url: params.url,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getMe = async () => {
  try {
    return await apiRequest('/api/me', { method: 'GET' });
  } catch (err) {
    // Don't log 401 errors - they're expected if backend isn't running or auth isn't ready
    // The fallback to profile table will handle this gracefully
    if (err?.status !== 401 && err?.response?.status !== 401) {
    }
    return { data: null, error: err };
  }
};

/**
 * Permanently delete the current user's account and all family data.
 * Requires confirmPhrase to be exactly "DELETE" (case-insensitive).
 * Only allowed for parent role. After success, caller should sign out.
 * @param {string} confirmPhrase - User must type "DELETE" to confirm
 * @returns {Promise<{data: { success, message } | null, error: Error|null}>}
 */
export const deleteAccount = async (confirmPhrase) => {
  try {
    return await apiRequest('/api/account/delete', {
      method: 'POST',
      body: JSON.stringify({ confirm_phrase: confirmPhrase || '' }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Request a GDPR/CCPA personal data export. Sends internal + user confirmation emails.
 * @returns {Promise<{data: { success, message } | null, error: Error|null}>}
 */
export const requestPersonalDataExport = async () => {
  try {
    return await apiRequest('/api/account/personal-data-request', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const previewInvite = async (token) => {
  try {
    return await apiRequest(`/api/invites/preview/${token}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const acceptInvite = async (token) => {
  try {
    return await apiRequest('/api/invites/accept', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Accept a parent or tutor invite by creating an account with email+password.
 * No second confirmation email is sent (account created server-side with email_confirm).
 */
export const acceptInviteWithPassword = async ({ token, email, password }) => {
  try {
    return await apiRequest('/api/invites/accept_with_password', {
      method: 'POST',
      body: JSON.stringify({ token, email, password }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getFamilyMembers = async () => {
  try {
    return await apiRequest('/api/family/members', { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Update family name (uses backend so RLS/triggers do not block save).
 * @param {string} familyName - New display name for the family
 */
export const updateFamilyName = async (familyName) => {
  try {
    return await apiRequest('/api/family', {
      method: 'PATCH',
      body: JSON.stringify({ family_name: familyName || null }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Reset all family data (events, children, subjects, materials, plans) and reset onboarding.
 * For testing: re-run onboarding without creating a new account.
 */
export const resetFamilyData = async () => {
  try {
    return await apiRequest('/api/family/reset_data', { method: 'POST' });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Permanently delete one child (data + family membership + linked Auth login). Parents only; backend uses service role.
 * @param {{ childId: string, confirmName: string }} params
 */
export const permanentDeleteChild = async ({ childId, confirmName }) => {
  try {
    return await apiRequest('/api/family/child/permanent_delete', {
      method: 'POST',
      body: JSON.stringify({ child_id: childId, confirm_name: confirmName }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Remove a child's linked learner login only (invites + Auth user). Child profile and data remain.
 * Parents only; backend uses service role.
 * @param {{ childId: string }} params
 */
export const unlinkChildLogin = async ({ childId }) => {
  try {
    return await apiRequest('/api/family/child/unlink_login', {
      method: 'POST',
      body: JSON.stringify({ child_id: childId }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const inviteTutor = async (params) => {
  try {
    return await apiRequest('/api/family/invite', {
      method: 'POST',
      body: JSON.stringify({
        email: params.email,
        role: params.role || 'tutor',
        child_ids: params.child_ids || [],
        tutor_name: params.tutor_name || null,
        child_permission_profile: params.child_permission_profile || null,
        tutor_permission_profile: params.tutor_permission_profile || null,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const updateTutorScope = async (memberId, params) => {
  try {
    return await apiRequest(`/api/family/tutors/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        child_ids: params.child_ids || [],
        display_name: params.display_name ?? null,
        tutor_permission_profile: params.tutor_permission_profile ?? null,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getChildProgress = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.childId) queryParams.append('child_id', params.childId);
    if (params.subjectId) queryParams.append('subject_id', params.subjectId);
    
    const query = queryParams.toString();
    const url = `/api/child_progress${query ? `?${query}` : ''}`;
    return await apiRequest(url, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Generate weekly student packet PDF or HTML
 * @param {string} childId - Child ID
 * @param {string} weekStart - Week start date (YYYY-MM-DD)
 * @param {string} format - 'pdf' or 'html' (default: 'pdf')
 * @returns {Promise<{data: Blob|string|null, error: Error|null}>}
 */
export const getWeeklyPacket = async (childId, weekStart, format = 'pdf') => {
  try {
    const weekStartStr = formatDate(weekStart);
    const url = `/api/planner/weekly-packet/${childId}?week_start=${weekStartStr}&format=${format}`;
    
    const response = await fetch(`${getAPIBase()}${url}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }
    
    if (format === 'html') {
      // For HTML, open in new window for printing
      const html = await response.text();
      if (typeof window !== 'undefined') {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(html);
        printWindow.document.close();
        // Auto-trigger print dialog after a short delay
        setTimeout(() => {
          printWindow.print();
        }, 250);
      }
      return { data: html, error: null };
    } else {
      // For PDF, download
      const blob = await response.blob();
      if (typeof window !== 'undefined') {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `weekly_packet_${weekStartStr}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
      return { data: blob, error: null };
    }
  } catch (err) {
    return { data: null, error: err };
  }
};

export const createChildInvite = async (childId) => {
  try {
    return await apiRequest('/api/auth/child/create_invite', {
      method: 'POST',
      body: JSON.stringify({ child_id: childId }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const previewChildInvite = async (token) => {
  try {
    return await apiRequest(`/api/invites/preview/${token}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const acceptChildInvite = async ({ token, email, password }) => {
  try {
    return await apiRequest('/api/auth/child/accept_invite', {
      method: 'POST',
      body: JSON.stringify({ token, email, password }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getIntegrationStatus = async () => {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { data: null, error: null };
    }
    let res = await apiRequest('/api/integrations/status', { method: 'GET' });
    const st = res?.error?.status;
    // Hydration race: user id exists before access_token is readable, or token needs refresh
    if (st === 401 || st === 403) {
      await supabase.auth.refreshSession().catch(() => {});
      await new Promise((r) => setTimeout(r, 120));
      res = await apiRequest('/api/integrations/status', { method: 'GET' });
    }
    return res;
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getYouTubeQuota = async () => {
  try {
    return await apiRequest('/api/integrations/youtube/quota', { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const generateAppleIcsUrl = async (childId = null) => {
  try {
    const query = childId ? `?child_id=${encodeURIComponent(childId)}` : '';
    return await apiRequest(`/api/integrations/apple/generate_ics_url${query}`, {
      method: 'POST',
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const inspireLearning = async (childId) => {
  try {
    return await apiRequest('/api/ai/inspire_learning', {
      method: 'POST',
      body: JSON.stringify({ child_id: childId }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

// ============================================================================
// Standards API Functions
// ============================================================================

export const getStandards = async (stateCode, gradeLevel, subject = null, domain = null) => {
  try {
    const params = new URLSearchParams({
      state_code: stateCode,
      grade_level: gradeLevel,
    });
    if (subject) params.append('subject', subject);
    if (domain) params.append('domain', domain);
    
    return await apiRequest(`/api/standards?${params.toString()}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getStandardsPreferences = async (childId = null) => {
  try {
    const query = childId ? `?child_id=${encodeURIComponent(childId)}` : '';
    return await apiRequest(`/api/standards/preferences${query}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const setStandardsPreference = async (preference) => {
  try {
    return await apiRequest('/api/standards/preferences', {
      method: 'POST',
      body: JSON.stringify(preference),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getStandardsCoverage = async (childId, stateCode, gradeLevel, subject = null) => {
  try {
    const params = new URLSearchParams({
      child_id: childId,
      state_code: stateCode,
      grade_level: gradeLevel,
    });
    if (subject) params.append('subject', subject);
    
    return await apiRequest(`/api/standards/coverage?${params.toString()}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getStandardsGaps = async (childId, stateCode, gradeLevel, subject = null, limit = 10) => {
  try {
    const params = new URLSearchParams({
      child_id: childId,
      state_code: stateCode,
      grade_level: gradeLevel,
      limit: limit.toString(),
    });
    if (subject) params.append('subject', subject);
    
    return await apiRequest(`/api/standards/gaps?${params.toString()}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const aiPlanStandards = async (childId, stateCode, gradeLevel, subject = null, limit = 10, availableHoursPerWeek = 20) => {
  try {
    const params = new URLSearchParams({
      child_id: childId,
      state_code: stateCode,
      grade_level: gradeLevel,
      limit: limit.toString(),
      available_hours_per_week: availableHoursPerWeek.toString(),
    });
    if (subject) params.append('subject', subject);
    
    return await apiRequest(`/api/standards/ai/plan?${params.toString()}`, { method: 'POST' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const createCurriculumMapping = async (mapping) => {
  try {
    return await apiRequest('/api/standards/mapping', {
      method: 'POST',
      body: JSON.stringify(mapping),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const recordStandardsCoverage = async (coverage) => {
  try {
    return await apiRequest('/api/standards/coverage', {
      method: 'POST',
      body: JSON.stringify(coverage),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getTutorOverview = async () => {
  try {
    return await apiRequest('/api/tutor/overview', { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getChildOverview = async () => {
  try {
    return await apiRequest('/api/child/overview', { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getLearningStory = async (weekStart = null) => {
  try {
    let params = '';
    if (weekStart) {
      // Format date as YYYY-MM-DD
      const dateStr = weekStart instanceof Date 
        ? weekStart.toISOString().split('T')[0]
        : weekStart;
      params = `?week_start=${dateStr}`;
    }
    return await apiRequest(`/api/parent/learning_story${params}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getParentWins = async (weeks = 4) => {
  try {
    return await apiRequest(`/api/parent/wins?weeks=${weeks}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

// ============================================================
// Confidence Layer / Parent Reassurance Engine
// ============================================================

/**
 * Get readiness meter data for a child
 * @param {string} childId - Child ID
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const getReadinessMeter = async (childId) => {
  try {
    return await apiRequest(`/api/confidence/readiness/${childId}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Get at-a-glance assurance card for home screen
 * @param {Date|string|null} weekStart - Optional week start date
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const getAssuranceCard = async (weekStart = null) => {
  try {
    const weekStartParam = weekStart ? `?week_start=${formatDate(weekStart)}` : '';
    return await apiRequest(`/api/confidence/assurance${weekStartParam}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Get reassurance message for a specific context
 * @param {string} childId - Child ID
 * @param {string} context - Context: 'late_completion', 'skipped_item', 'low_evidence', 'general'
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const getReassuranceMessage = async (childId, context = 'general') => {
  try {
    return await apiRequest(`/api/confidence/reassurance/${childId}?context=${encodeURIComponent(context)}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Get pacing prediction for a child
 * @param {string} childId - Child ID
 * @param {string|null} subjectId - Optional subject ID
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const getPacingPrediction = async (childId, subjectId = null) => {
  try {
    const subjectParam = subjectId ? `?subject_id=${subjectId}` : '';
    return await apiRequest(`/api/confidence/prediction/${childId}${subjectParam}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Get student streak data for parent reassurance
 * @param {string} childId - Child ID
 * @param {number} daysBack - Number of days to look back (default: 30)
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const getStudentStreak = async (childId, daysBack = 30) => {
  try {
    return await apiRequest(`/api/confidence/streak/${childId}?days_back=${daysBack}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const proposeTutorPlan = async (proposal) => {
  try {
    return await apiRequest('/api/tutor/propose_plan', {
      method: 'POST',
      body: JSON.stringify(proposal),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const logTutorOutcome = async (outcome) => {
  try {
    return await apiRequest('/api/tutor/log_outcome', {
      method: 'POST',
      body: JSON.stringify(outcome),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getLearningSuggestions = async (childId, approvedOnly = false) => {
  try {
    // Ensure user is authenticated before querying
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { data: [], error: null };
    }

    // Query learning_suggestions with RLS policy check
    // The RLS policy checks family_id via is_family_member() function
    let query = supabase
      .from('learning_suggestions')
      .select('*')
      .eq('child_id', childId);
    
    // If approvedOnly, filter at database level for better performance
    if (approvedOnly) {
      query = query.eq('approved_by_parent', true);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) {
      // If permission denied, return empty array instead of throwing
      // This allows the UI to continue working even if RLS policy has issues
      if (error.code === '42501') {
        // Return empty array instead of error to prevent UI breakage
        return { data: [], error: null };
      }
      throw error;
    }
    
    return { data: data || [], error: null };
  } catch (err) {
    // Return empty array instead of error to prevent UI breakage
    return { data: [], error: null };
  }
};

export const createIdeaEventFromSuggestion = async (suggestionId, childId) => {
  try {
    const apiBase = getAPIBase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { data: null, error: new Error('Not authenticated') };
    }

    const response = await fetch(`${apiBase}/api/inspire/${childId}/schedule_from_suggestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ suggestion_id: suggestionId }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { data: null, error: new Error(text || 'Failed to add to schedule') };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const createTodoFromSuggestion = async (suggestionId, childId) => {
  try {
    const apiBase = getAPIBase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { data: null, error: new Error('Not authenticated') };
    }

    const response = await fetch(`${apiBase}/api/inspire/${childId}/todo_from_suggestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ suggestion_id: suggestionId }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { data: null, error: new Error(text || 'Failed to add to todo list') };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const saveSuggestionToIdeas = async (suggestionId, childId) => {
  try {
    const apiBase = getAPIBase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { data: null, error: new Error('Not authenticated') };
    }

    const response = await fetch(`${apiBase}/api/inspire/${childId}/save_idea_from_suggestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ suggestion_id: suggestionId }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { data: null, error: new Error(text || 'Failed to save to ideas') };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const approveSuggestion = async (suggestionId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    
    const { data, error } = await supabase
      .from('learning_suggestions')
      .update({
        approved_by_parent: true,
        approved_at: new Date().toISOString(),
        approved_by: user.id
      })
      .eq('id', suggestionId)
      .select()
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const rejectSuggestion = async (suggestionId) => {
  try {
    const { data, error } = await supabase
      .from('learning_suggestions')
      .update({ approved_by_parent: false })
      .eq('id', suggestionId)
      .select()
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getGoogleCalendarStatus = async () => {
  try {
    return await apiRequest('/api/google/calendar/status', { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const startGoogleCalendarOAuth = async ({ familyId } = {}) => {
  try {
    const query = familyId ? `?family_id=${encodeURIComponent(familyId)}` : '';
    return await apiRequest(`/api/google/calendar/oauth/start${query}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const disconnectGoogleCalendar = async () => {
  try {
    return await apiRequest('/api/google/calendar/credential', { method: 'DELETE' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const syncGoogleCalendar = async (params = {}) => {
  try {
    return await apiRequest('/api/google/calendar/sync', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const pullGoogleCalendar = async (params = {}) => {
  try {
    return await apiRequest('/api/google/calendar/pull', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const pushEventToGoogleCalendar = async (eventId) => {
  try {
    return await apiRequest('/api/google/calendar/push_event', {
      method: 'POST',
      body: JSON.stringify({ event_id: eventId }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const refreshGoogleCalendarToken = async () => {
  try {
    return await apiRequest('/api/google/calendar/refresh-token', { method: 'POST' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getGoogleDriveStatus = async () => {
  try {
    return await apiRequest('/api/google/drive/status', { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const startGoogleDriveOAuth = async ({ familyId } = {}) => {
  try {
    const query = familyId ? `?family_id=${encodeURIComponent(familyId)}` : '';
    return await apiRequest(`/api/google/drive/oauth/start${query}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const disconnectGoogleDrive = async () => {
  try {
    return await apiRequest('/api/google/drive/credential', { method: 'DELETE' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const listGoogleDriveFiles = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.pageSize) queryParams.append('page_size', String(params.pageSize));
    const query = queryParams.toString();
    return await apiRequest(`/api/google/drive/files${query ? `?${query}` : ''}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

export const importGoogleDriveFile = async (payload) => {
  try {
    return await apiRequest('/api/google/drive/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

// ============================================================
// Onboarding & Child Management Endpoints
// ============================================================

/**
 * Add or edit a child profile
 * @param {Object} payload - { family_id, name, nickname?, age, grade_label?, follow_standards, standards_state?, avatar_url?, interests[], learning_styles[] }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const addChild = async (payload) => {
  try {
    return await apiRequest('/api/onboarding/add_child', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Onboarding: set family default planning mode
 * @param {Object} payload - { family_id, planning_mode: 'HOMESCHOOL_COMPLIANCE'|'AFTERSCHOOL_GOALS'|'NONE' }
 */
export const setOnboardingPlanningMode = async (payload) => {
  try {
    return await apiRequest('/api/onboarding/set_planning_mode', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Onboarding: create one subject
 * @param {Object} payload - { family_id, name, color? }
 * @returns {Promise<{data: { subject_id }, error: null}|{data: null, error}>}
 */
export const createOnboardingSubject = async (payload) => {
  try {
    return await apiRequest('/api/onboarding/create_subject', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Onboarding: mark complete (sets family.onboarding_completed = true)
 * @param {Object} payload - { family_id } (optional; backend uses session)
 */
export const completeOnboarding = async (payload = {}) => {
  try {
    return await apiRequest('/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Onboarding: get status for resume (default_planning_mode, has_children, onboarding_completed).
 * has_subjects is informational only — subjects are not required to complete onboarding.
 * If backend returns 404 (e.g. route not yet deployed), return safe default so onboarding modal still shows.
 */
export const getOnboardingStatus = async () => {
  try {
    const res = await apiRequest('/api/onboarding/status', { method: 'GET' });
    if (res?.error && res.error.status === 404) {
      return {
        data: { onboarding_completed: false, has_children: false, has_subjects: false, default_planning_mode: null },
        error: null,
      };
    }
    // No / stale session: backend may return 403 "Missing access token". Don't block shell or flash onboarding.
    if (res?.error && (res.error.status === 401 || res.error.status === 403)) {
      return {
        data: { onboarding_completed: true, has_children: true, has_subjects: true, default_planning_mode: null },
        error: null,
      };
    }
    return res;
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Ensure current user has a family (create one if missing). Used for new signups so onboarding modal has a family_id.
 * @returns {Promise<{data: { family_id: string }|null, error: Error|null}>}
 */
export const ensureFamily = async () => {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { data: null, error: null };
    }
    return await apiRequest('/api/onboarding/ensure_family', { method: 'POST' });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Create or update family details
 * @param {Object} payload - { name?, home_state?, timezone? }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const familySetup = async (payload) => {
  try {
    return await apiRequest('/api/onboarding/family_setup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Get current family's children for display
 * @returns {Promise<{data: any[], error: Error|null}>}
 */
export const getChildren = async () => {
  try {
    return await apiRequest('/api/onboarding/children', { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

/**
 * Get curriculum requirements for a state
 * @param {string} state - State code (e.g., 'CA', 'NY')
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const getStateStandards = async (state) => {
  try {
    return await apiRequest(`/api/state_standards/${encodeURIComponent(state)}`, { method: 'GET' });
  } catch (err) {
    return { data: null, error: err };
  }
};

// ============================================================
// Intelligence Hub APIs
// ============================================================

/**
 * Chat with Planner AI
 * @param {string} familyId - Family ID
 * @param {string[]} selectedChildren - Array of child IDs or 'all'
 * @param {Object} timeframe - { start: Date, end: Date }
 * @param {Array} messages - Chat message history [{ role: 'user'|'assistant', content: string }]
 * @returns {Promise<{data: {assistant_message: string, proposed_changes?: Array, insights?: Array}|null, error: Error|null}>}
 */
export const plannerAIChat = async (familyId, selectedChildren, timeframe, messages) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { data: null, error: { message: 'Not authenticated' } };
    }

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/planner/ai_chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        family_id: familyId,
        selected_children: selectedChildren,
        timeframe_start: timeframe.start.toISOString(),
        timeframe_end: timeframe.end.toISOString(),
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { data: null, error: { message: errorText || response.statusText, status: response.status } };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    return { data: null, error: handleAPIError(error, 'plannerAIChat') };
  }
};

/**
 * Get insights feed
 * @param {string} familyId - Family ID
 * @param {string[]} selectedChildren - Array of child IDs
 * @param {Object} dateRange - { start: Date, end: Date }
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export const getInsights = async (familyId, selectedChildren, dateRange) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { data: null, error: { message: 'Not authenticated' } };
    }

    const apiBase = getAPIBase();
    const params = new URLSearchParams({
      family_id: familyId,
      children: selectedChildren.join(','),
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    });

    const response = await fetch(`${apiBase}/api/insights?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      // If endpoint doesn't exist (404), validation error (422), or server error (500), return empty array instead of error
      // This allows the UI to work while backend is being implemented or has issues
      if (response.status === 404 || response.status === 422 || response.status === 500) {
        if (response.status === 404) {
        }
        return { data: [], error: null };
      }
      
      const errorText = await response.text();
      let errorMessage = errorText || response.statusText;
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.detail || errorData.message || errorMessage;
      } catch (e) {
        // Use errorText as-is if not JSON
      }
      return { data: null, error: { message: errorMessage, status: response.status } };
    }

    const data = await response.json();
    return { data: data.insights || data || [], error: null };
  } catch (error) {
    // Network errors or other exceptions - return empty array for graceful degradation

    return { data: [], error: null };
  }
};

/**
 * Apply proposed changes to planner
 * @param {string} familyId - Family ID
 * @param {Array} changes - Proposed changes array
 * @returns {Promise<{data: {applied: number, failed: number}|null, error: Error|null}>}
 */
export const applyProposedChanges = async (familyId, changes) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { data: null, error: { message: 'Not authenticated' } };
    }

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/planner/apply-changes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        family_id: familyId,
        changes: changes,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { data: null, error: { message: errorText || response.statusText, status: response.status } };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    return { data: null, error: handleAPIError(error, 'applyProposedChanges') };
  }
};

// ============================================================
// Export Default
// ============================================================

export default {
  // Date helpers
  getWeekStart,
  formatDate,
  getFamilyTimezone,
  utcToLocalDate,
  
  // Error handling
  handleAPIError,
  showErrorToast,
  
  // RPC wrapper
  callRPC,
  
  // API request
  apiRequest,
  
  // Event methods
  getEvent,
  linkEventSyllabus,
  getSyllabusById,
  
  // Flexible tasks
  getFlexibleBacklog,
  scheduleFlexible,
  createFlexibleTask,
  
  // Plan suggestions
  getPlanSuggestions,
  acceptSuggestion,
  
  // Syllabus
  suggestPlan,
  acceptPlan,
  
  // Document stats
  getLightEvidenceSubjects,
  compareToSyllabusWeek,
  getDocumentStats,
  
  // Capacity
  getCapacity,
  
  // AI Rescheduling
  createBlackout,
  adjustSchedule,
  parseSyllabus,
  proposeReschedule,
  approvePlan,
  recomputeVelocity,
  
  // External Content
  fetchExternalCourses,
  fetchCourseOutline,
  scheduleExternalCourse,
  fetchExternalProgress,
  upsertExternalProgress,
  addFromLink,
  addExternalLink,
  getGoogleCalendarStatus,
  getGoogleDriveStatus,
  getMe,
  previewInvite,
  acceptInvite,
  acceptInviteWithPassword,
  getFamilyMembers,
  inviteTutor,
  updateTutorScope,
  getChildProgress,
  getWeeklyPacket,
  getIntegrationStatus,
  getYouTubeQuota,
  generateAppleIcsUrl,
  inspireLearning,
  getLearningSuggestions,
  createIdeaEventFromSuggestion,
  createTodoFromSuggestion,
  saveSuggestionToIdeas,
  
  // Intelligence Hub APIs
  plannerAIChat,
  getInsights,
  applyProposedChanges,
  approveSuggestion,
  rejectSuggestion,
  startGoogleCalendarOAuth,
  startGoogleDriveOAuth,
  disconnectGoogleCalendar,
  disconnectGoogleDrive,
  syncGoogleCalendar,
  pullGoogleCalendar,
  pushEventToGoogleCalendar,
  refreshGoogleCalendarToken,
  listGoogleDriveFiles,
  importGoogleDriveFile,
  adjustSchedule,
  undoLastReschedule,
  // Onboarding endpoints
  addChild,
  familySetup,
  getChildren,
  getStateStandards,
};

