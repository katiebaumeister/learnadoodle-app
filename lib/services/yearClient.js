/**
 * Year Planning API Client
 * Part of Phase 1 - Year-Round Intelligence Core
 * Provides type-safe methods for year planning features with mock support
 */

import { apiRequest } from '../apiClient';

// Get API base URL
const getAPIBase = () => {
  if (typeof window !== 'undefined') {
    return process.env.REACT_APP_API_URL || window.location.origin;
  }
  return process.env.REACT_APP_API_URL || '';
};

/**
 * Create a new year plan
 * @param {Object} input - CreateYearPlanInput
 * @param {boolean} [useMock=false] - Use mock data if true
 * @returns {Promise<{data: YearPlanOut|null, error: Error|null}>}
 */
export const createYearPlan = async (input, useMock = false) => {
  const mock = useMock ? '?mock=1' : '';
  const { data, error } = await apiRequest(`/api/year/create${mock}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  
  if (error) {
    console.error('[yearClient] createYearPlan error:', error);
    return { data: null, error };
  }
  
  return { data, error: null };
};

/**
 * Get curriculum heatmap data
 * @param {string} familyId - Family UUID
 * @param {string} start - Start date (YYYY-MM-DD)
 * @param {string} end - End date (YYYY-MM-DD)
 * @param {boolean} [useMock=false] - Use mock data if true
 * @returns {Promise<{data: HeatmapRow[]|null, error: Error|null}>}
 */
export const getCurriculumHeatmap = async (familyId, start, end, useMock = false) => {
  const mock = useMock ? '&mock=1' : '';
  const { data, error } = await apiRequest(
    `/api/year/heatmap?familyId=${familyId}&start=${start}&end=${end}${mock}`,
    {
      method: 'GET',
    }
  );
  
  if (error) {
    console.error('[yearClient] getCurriculumHeatmap error:', error);
    return { data: null, error };
  }
  
  // Return empty array if no data (valid for new users)
  return { data: data || [], error: null };
};

/**
 * Preview rebalance moves for an event
 * @param {string} yearPlanId - Year plan UUID
 * @param {string} eventId - Event UUID
 * @param {string} newStart - New start timestamp (ISO 8601)
 * @returns {Promise<{data: RebalanceOut|null, error: Error|null}>}
 */
export const previewRebalance = async (yearPlanId, eventId, newStart) => {
  console.log('[yearClient] previewRebalance called:', { yearPlanId, eventId, newStart });
  
  const { data, error } = await apiRequest('/api/year/rebalance', {
    method: 'POST',
    body: JSON.stringify({
      yearPlanId,
      eventId,
      newStart,
    }),
  });
  
  console.log('[yearClient] previewRebalance response:', { data, error });
  
  if (error) {
    console.error('[yearClient] previewRebalance error:', error);
    return { data: null, error };
  }
  
  return { data, error: null };
};

/**
 * Apply rebalance moves (updates events sequentially)
 * @param {RebalanceMove[]} moves - Array of moves to apply
 * @param {function(number, number): void} [onProgress] - Optional callback called after each successful move (applied, total)
 * @returns {Promise<{data: {applied: number, skipped: number, errors: string[]}|null, error: Error|null}>}
 */
export const applyRebalanceMoves = async (moves, onProgress) => {
  console.log('[yearClient] applyRebalanceMoves called with', moves.length, 'moves');
  
  // Apply moves in batches of 10
  const batchSize = 10;
  const results = {
    applied: 0,
    skipped: 0,
    errors: [],
  };
  
  for (let i = 0; i < moves.length; i += batchSize) {
    const batch = moves.slice(i, i + batchSize);
    
    // Update each event in the batch
    for (const move of batch) {
      try {
        console.log('[yearClient] Applying move:', {
          eventId: move.eventId,
          currentStart: move.currentStart,
          proposedStart: move.proposedStart
        });
        
        const { supabase } = await import('../supabase');
        
        // Get the event to calculate duration
        const { data: eventData, error: fetchError } = await supabase
          .from('events')
          .select('start_ts, end_ts')
          .eq('id', move.eventId)
          .single();
        
        if (fetchError) {
          console.error('[yearClient] Error fetching event:', fetchError);
          results.skipped++;
          results.errors.push(`Event ${move.eventId}: ${fetchError.message}`);
          continue;
        }
        
        // Calculate duration
        const durationMs = new Date(eventData.end_ts) - new Date(eventData.start_ts);
        const newEndTs = new Date(new Date(move.proposedStart).getTime() + durationMs).toISOString();
        
        // Update event with new start and end times
        const { error: updateError } = await supabase
          .from('events')
          .update({ 
            start_ts: move.proposedStart,
            end_ts: newEndTs
          })
          .eq('id', move.eventId);
        
        if (updateError) {
          console.error('[yearClient] Error updating event:', updateError);
          results.skipped++;
          results.errors.push(`Event ${move.eventId}: ${updateError.message}`);
        } else {
          console.log('[yearClient] Successfully updated event:', move.eventId);
          results.applied++;
          // Call progress callback if provided
          if (onProgress) {
            onProgress(results.applied, moves.length);
          }
        }
      } catch (err) {
        console.error('[yearClient] Exception applying move:', err);
        results.skipped++;
        results.errors.push(`Event ${move.eventId}: ${err.message}`);
      }
    }
  }
  
  console.log('[yearClient] Apply complete:', results);
  return { data: results, error: null };
};

/**
 * Get prefilled data for year plan creation
 * @param {string} childId - Child UUID
 * @returns {Promise<{data: PrefillResponse|null, error: Error|null}>}
 */
export const getPrefillData = async (childId) => {
  const { data, error } = await apiRequest(`/api/year/prefill?childId=${childId}`, {
    method: 'GET',
  });
  
  if (error) {
    console.error('[yearClient] getPrefillData error:', error);
    return { data: null, error };
  }
  
  // Return empty arrays if no data (valid for new users)
  return {
    data: {
      subjects: data?.subjects || [],
      hoursPerWeek: data?.hoursPerWeek || {},
    },
    error: null,
  };
};

/**
 * Seed events for a year plan
 * Creates scheduled events based on year_plan_children subjects and hours/week targets
 * @param {string} yearPlanId - Year plan UUID
 * @returns {Promise<{data: {success: boolean, events_created: number, events_skipped: number}|null, error: Error|null}>}
 */
/**
 * Sync state blackouts/holidays into calendar_days_cache
 * @param {number} year - Year (e.g., 2025)
 * @param {string} state - State code (e.g., "CA")
 * @returns {Promise<{data: {success: boolean, upserted: number, skipped: number}|null, error: Error|null}>}
 */
export const syncBlackouts = async (year, state) => {
  const { data, error } = await apiRequest(
    `/api/year/sync_blackouts?year=${year}&state=${state}`,
    {
      method: 'GET',
    }
  );
  
  if (error) {
    console.error('[yearClient] syncBlackouts error:', error);
    return { data: null, error };
  }
  
  return { data, error: null };
};

export const seedYearPlanEvents = async (yearPlanId) => {
  try {
    const { supabase } = await import('../supabase');
    const { data, error } = await supabase.rpc('seed_year_plan_events', {
      p_year_plan_id: yearPlanId
    });
    
    if (error) {
      console.error('[yearClient] seedYearPlanEvents error:', error);
      return { data: null, error };
    }
    
    return { data, error: null };
  } catch (err) {
    console.error('[yearClient] seedYearPlanEvents exception:', err);
    return { data: null, error: err };
  }
};

/**
 * Check if year planning features are enabled via feature flags
 * @returns {Promise<{yearPlans: boolean, heatmap: boolean, rebalance: boolean}>}
 */
export const checkFeatureFlags = async () => {
  // Try multiple ways to read the env var (react-native-dotenv uses @env)
  let yearPlansFlag = false;
  let heatmapFlag = false;
  let rebalanceFlag = false;
  
  try {
    // Try @env (react-native-dotenv)
    const env = require('@env');
    yearPlansFlag = env.REACT_APP_YEAR_PLANS_V1 === 'true' || env.REACT_APP_YEAR_PLANS_V1 === true;
    heatmapFlag = env.REACT_APP_HEATMAP_V1 === 'true' || env.REACT_APP_HEATMAP_V1 === true;
    rebalanceFlag = env.REACT_APP_REBALANCE_V1 === 'true' || env.REACT_APP_REBALANCE_V1 === true;
  } catch (e) {
    // Fallback to process.env
    yearPlansFlag = process.env.REACT_APP_YEAR_PLANS_V1 === 'true';
    heatmapFlag = process.env.REACT_APP_HEATMAP_V1 === 'true';
    rebalanceFlag = process.env.REACT_APP_REBALANCE_V1 === 'true';
  }
  
  // Also check process.env directly as fallback
  if (!yearPlansFlag) {
    yearPlansFlag = process.env.REACT_APP_YEAR_PLANS_V1 === 'true';
  }
  if (!heatmapFlag) {
    heatmapFlag = process.env.REACT_APP_HEATMAP_V1 === 'true';
  }
  if (!rebalanceFlag) {
    rebalanceFlag = process.env.REACT_APP_REBALANCE_V1 === 'true';
  }
  
  const flags = {
    yearPlans: yearPlansFlag,
    heatmap: heatmapFlag,
    rebalance: rebalanceFlag,
  };
  
  // Debug logging
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[Year Planning] Feature flags:', flags);
    console.log('[Year Planning] Env check - process.env.REACT_APP_YEAR_PLANS_V1:', process.env.REACT_APP_YEAR_PLANS_V1);
    try {
      const env = require('@env');
      console.log('[Year Planning] Env check - @env.REACT_APP_YEAR_PLANS_V1:', env.REACT_APP_YEAR_PLANS_V1);
    } catch (e) {
      console.log('[Year Planning] @env not available');
    }
  }
  
  return flags;
};

