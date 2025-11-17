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
// react-native-dotenv requires CommonJS require, but we need to handle both
let REACT_APP_API_URL;
try {
  // Try to import from @env (react-native-dotenv babel plugin)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const env = require('@env');
  REACT_APP_API_URL = env.REACT_APP_API_URL;
} catch (e) {
  // Fallback: check process.env (for web builds or if @env not configured)
  REACT_APP_API_URL = typeof process !== 'undefined' && process.env ? process.env.REACT_APP_API_URL : undefined;
}

// Debug: log the API URL being used (remove in production)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('[API Client] Using API base URL:', REACT_APP_API_URL || window.location.origin);
}

// Get API base URL (for Express/FastAPI routes)
const getAPIBase = () => {
  if (typeof window !== 'undefined') {
    return REACT_APP_API_URL || window.location.origin;
  }
  return REACT_APP_API_URL || '';
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
      console.error('formatDate: Invalid date value:', date);
      return '';
    }
    return d.toISOString().split('T')[0];
  } catch (err) {
    console.error('formatDate error:', err, 'date:', date);
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
      console.warn('Error fetching family timezone:', error);
      return 'UTC';
    }
    
    return data || 'UTC';
  } catch (err) {
    console.warn('Error in getFamilyTimezone:', err);
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
  console.error(`${context} error:`, error);
  
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
    console.error('Error:', message);
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
      const errorText = await response.text();
      return { error: { message: errorText || response.statusText, status: response.status } };
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
 * Call Supabase RPC with error handling
 * @param {string} rpcName - RPC function name
 * @param {Object} params - RPC parameters
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export const callRPC = async (rpcName, params = {}) => {
  try {
    const { data, error } = await supabase.rpc(rpcName, params);
    
    if (error) {
      return { data: null, error };
    }
    
    return { data, error: null };
  } catch (err) {
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
export const apiRequest = async (endpoint, options = {}) => {
  const API_BASE = getAPIBase();
  const url = `${API_BASE}${endpoint}`;
  
  // Get Supabase session token for authentication
  let authToken = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      authToken = session.access_token;
    }
  } catch (err) {
    console.warn('[apiRequest] Failed to get session token:', err);
  }
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
    },
  };
  
  try {
    // Add timeout for fetch requests (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(url, {
      ...defaultOptions,
      ...options,
      signal: controller.signal,
      headers: {
        ...defaultOptions.headers,
        ...(options.headers || {}),
      },
    });
    
    clearTimeout(timeoutId);
    
    // Get response text first to check if it's valid JSON
    const responseText = await response.text();
    
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (parseErr) {
        // If response is not JSON, use the text or status text
        errorMessage = responseText || response.statusText || errorMessage;
      }
      return { data: null, error: new Error(errorMessage) };
    }
    
    // Parse response as JSON
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch (parseErr) {
      console.error('Failed to parse response as JSON:', parseErr, 'Response:', responseText);
      return { 
        data: null, 
        error: new Error('Invalid response format from server') 
      };
    }
    
    return { data, error: null };
  } catch (err) {
    console.error('apiRequest error:', err);
    
    // Provide more helpful error messages
    let errorMessage = err.message || 'Request failed';
    if (err.name === 'AbortError') {
      errorMessage = 'Request timed out. Please check if the backend server is running on ' + API_BASE;
    } else if (err.message === 'Load failed' || err.message === 'Failed to fetch') {
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
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        child:children(id, first_name)
      `)
      .eq('id', eventId)
      .single();
    
    if (error) throw error;
    return { data, error: null };
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
export const createBlackout = async (params) => {
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
    const { data: blackout, error: blackoutError } = await supabase
      .from('blackout_periods')
      .insert({
        family_id: params.familyId,
        child_id: params.childId || null,
        starts_on: startsOnFormatted,
        ends_on: endsOnFormatted,
        reason: params.reason || 'blackout',
      })
      .select()
      .single();

    if (blackoutError) {
      return { data: null, error: blackoutError };
    }

    // Create schedule_overrides for each day in range
    const overrides = [];
    const start = new Date(startsOnFormatted);
    const end = new Date(endsOnFormatted);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      
      const { error: overrideError } = await supabase
        .from('schedule_overrides')
        .upsert({
          scope_type: params.childId ? 'child' : 'family',
          scope_id: params.childId || params.familyId,
          date: dateStr,
          override_kind: 'day_off',
          is_active: true,
          source: 'ai',
        }, { onConflict: 'scope_type,scope_id,date,override_kind' });

      if (overrideError) {
        console.warn(`Failed to create override for ${dateStr}:`, overrideError);
      } else {
        overrides.push(dateStr);
      }
    }

    // Refresh calendar cache (if RPC exists)
    try {
      await supabase.rpc('refresh_calendar_days_cache', {
        p_family_id: params.familyId,
        p_from_date: startsOnFormatted,
        p_to_date: endsOnFormatted,
      });
    } catch (refreshError) {
      console.warn('Failed to refresh cache:', refreshError);
      // Non-critical, continue
    }

    return {
      data: {
        blackoutId: blackout.id,
        overridesCreated: overrides.length,
        dates: overrides,
      },
      error: null,
    };
  } catch (err) {
    console.error('Error creating blackout:', err);
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
        
        try {
          const response = await fetch(url, {
            method: 'POST',
            mode: 'cors', // Explicitly set CORS mode
            credentials: 'include', // Include credentials for CORS
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
          
          if (!response.ok) {
      const errorText = await response.text();
      console.error('[proposeReschedule] Error:', errorText);
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
    return { data, error: null };
  } catch (err) {
    console.error('[proposeReschedule] Error:', err);
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
    console.error('[fetchExternalCourses] Error:', err);
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
    console.error('[fetchCourseOutline] Error:', err);
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
    console.error('[scheduleExternalCourse] Error:', err);
    return { data: null, error: err };
  }
};

export const fetchExternalProgress = async (childId) => {
  try {
    return await apiRequest(`/api/external/progress?child_id=${encodeURIComponent(childId)}`, {
      method: 'GET',
    });
  } catch (err) {
    console.error('[fetchExternalProgress] Error:', err);
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
    console.error('[upsertExternalProgress] Error:', err);
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
    console.error('[addFromLink] Error:', err);
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
    console.error('[addExternalLink] Error:', err);
    return { data: null, error: err };
  }
};

export const getMe = async () => {
  try {
    return await apiRequest('/api/me', { method: 'GET' });
  } catch (err) {
    console.error('[getMe] Error:', err);
    return { data: null, error: err };
  }
};

export const previewInvite = async (token) => {
  try {
    return await apiRequest(`/api/invites/preview/${token}`, { method: 'GET' });
  } catch (err) {
    console.error('[previewInvite] Error:', err);
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
    console.error('[acceptInvite] Error:', err);
    return { data: null, error: err };
  }
};

export const getFamilyMembers = async () => {
  try {
    return await apiRequest('/api/family/members', { method: 'GET' });
  } catch (err) {
    console.error('[getFamilyMembers] Error:', err);
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
      }),
    });
  } catch (err) {
    console.error('[inviteTutor] Error:', err);
    return { data: null, error: err };
  }
};

export const updateTutorScope = async (memberId, params) => {
  try {
    return await apiRequest(`/api/family/tutors/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        child_ids: params.child_ids || [],
      }),
    });
  } catch (err) {
    console.error('[updateTutorScope] Error:', err);
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
    console.error('[getChildProgress] Error:', err);
    return { data: null, error: err };
  }
};

export const getIntegrationStatus = async () => {
  try {
    return await apiRequest('/api/integrations/status', { method: 'GET' });
  } catch (err) {
    console.error('[getIntegrationStatus] Error:', err);
    return { data: null, error: err };
  }
};

export const getYouTubeQuota = async () => {
  try {
    return await apiRequest('/api/integrations/youtube/quota', { method: 'GET' });
  } catch (err) {
    console.error('[getYouTubeQuota] Error:', err);
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
    console.error('[generateAppleIcsUrl] Error:', err);
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
    console.error('[inspireLearning] Error:', err);
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
    console.error('[getStandards] Error:', err);
    return { data: null, error: err };
  }
};

export const getStandardsPreferences = async (childId = null) => {
  try {
    const query = childId ? `?child_id=${encodeURIComponent(childId)}` : '';
    return await apiRequest(`/api/standards/preferences${query}`, { method: 'GET' });
  } catch (err) {
    console.error('[getStandardsPreferences] Error:', err);
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
    console.error('[setStandardsPreference] Error:', err);
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
    console.error('[getStandardsCoverage] Error:', err);
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
    console.error('[getStandardsGaps] Error:', err);
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
    console.error('[aiPlanStandards] Error:', err);
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
    console.error('[createCurriculumMapping] Error:', err);
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
    console.error('[recordStandardsCoverage] Error:', err);
    return { data: null, error: err };
  }
};

export const getTutorOverview = async () => {
  try {
    return await apiRequest('/api/tutor/overview', { method: 'GET' });
  } catch (err) {
    console.error('[getTutorOverview] Error:', err);
    return { data: null, error: err };
  }
};

export const getChildOverview = async () => {
  try {
    return await apiRequest('/api/child/overview', { method: 'GET' });
  } catch (err) {
    console.error('[getChildOverview] Error:', err);
    return { data: null, error: err };
  }
};

export const getLearningSuggestions = async (childId, approvedOnly = false) => {
  try {
    // Ensure user is authenticated before querying
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('[getLearningSuggestions] User not authenticated, returning empty array');
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
        console.warn('[getLearningSuggestions] Permission denied - RLS policy issue. Returning empty array.');
        console.warn('[getLearningSuggestions] Error details:', error);
        // Return empty array instead of error to prevent UI breakage
        return { data: [], error: null };
      }
      throw error;
    }
    
    return { data: data || [], error: null };
  } catch (err) {
    console.error('[getLearningSuggestions] Error:', err);
    // Return empty array instead of error to prevent UI breakage
    return { data: [], error: null };
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
    console.error('[approveSuggestion] Error:', err);
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
    console.error('[rejectSuggestion] Error:', err);
    return { data: null, error: err };
  }
};

export const getGoogleCalendarStatus = async () => {
  try {
    return await apiRequest('/api/google/calendar/status', { method: 'GET' });
  } catch (err) {
    console.error('[getGoogleCalendarStatus] Error:', err);
    return { data: null, error: err };
  }
};

export const startGoogleCalendarOAuth = async ({ familyId } = {}) => {
  try {
    const query = familyId ? `?family_id=${encodeURIComponent(familyId)}` : '';
    return await apiRequest(`/api/google/calendar/oauth/start${query}`, { method: 'GET' });
  } catch (err) {
    console.error('[startGoogleCalendarOAuth] Error:', err);
    return { data: null, error: err };
  }
};

export const disconnectGoogleCalendar = async () => {
  try {
    return await apiRequest('/api/google/calendar/credential', { method: 'DELETE' });
  } catch (err) {
    console.error('[disconnectGoogleCalendar] Error:', err);
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
    console.error('[syncGoogleCalendar] Error:', err);
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
    console.error('[pushEventToGoogleCalendar] Error:', err);
    return { data: null, error: err };
  }
};

export const refreshGoogleCalendarToken = async () => {
  try {
    return await apiRequest('/api/google/calendar/refresh-token', { method: 'POST' });
  } catch (err) {
    console.error('[refreshGoogleCalendarToken] Error:', err);
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
    console.error('[addChild] Error:', err);
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
    console.error('[familySetup] Error:', err);
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
    console.error('[getChildren] Error:', err);
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
    console.error('[getStateStandards] Error:', err);
    return { data: null, error: err };
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
  getMe,
  previewInvite,
  acceptInvite,
  getFamilyMembers,
  inviteTutor,
  updateTutorScope,
  getChildProgress,
  getIntegrationStatus,
  getYouTubeQuota,
  generateAppleIcsUrl,
  inspireLearning,
  getLearningSuggestions,
  approveSuggestion,
  rejectSuggestion,
  startGoogleCalendarOAuth,
  disconnectGoogleCalendar,
  syncGoogleCalendar,
  pushEventToGoogleCalendar,
  refreshGoogleCalendarToken,
  // Onboarding endpoints
  addChild,
  familySetup,
  getChildren,
  getStateStandards,
};

