// Simple cache refresh utility for immediate schedule updates
// Triggers cache refresh when schedule changes are made

import { supabase } from './supabase';
import { showCacheRefreshSuccess, showCacheRefreshError } from './simpleNotifications';

/**
 * Refresh calendar cache for a specific family
 * @param {string} familyId - The family ID to refresh cache for
 * @param {number} daysAhead - Number of days ahead to cache (default: 90)
 */
export const refreshFamilyCache = async (familyId, daysAhead = 90) => {
  try {
    console.log(`Refreshing cache for family ${familyId} (${daysAhead} days ahead)`);
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + daysAhead);
    
    const { data, error } = await supabase.rpc('refresh_calendar_days_cache', {
      p_family_id: familyId,
      p_from_date: startDate.toISOString().split('T')[0],
      p_to_date: endDate.toISOString().split('T')[0]
    });
    
    if (error) {
      console.error('Cache refresh error:', error);
      showCacheRefreshError(error);
      throw error;
    }
    
    console.log('Cache refreshed successfully:', data);
    showCacheRefreshSuccess();
    return data;
    
  } catch (error) {
    console.error('Failed to refresh cache:', error);
    showCacheRefreshError(error);
    throw error;
  }
};

/**
 * Refresh cache for all families (if needed)
 */
export const refreshAllFamiliesCache = async () => {
  try {
    console.log('Refreshing cache for all families...');
    
    const { data, error } = await supabase.rpc('refresh_all_families_cache');
    
    if (error) {
      console.error('All families cache refresh error:', error);
      showCacheRefreshError(error);
      throw error;
    }
    
    console.log('All families cache refreshed successfully:', data);
    showCacheRefreshSuccess();
    return data;
    
  } catch (error) {
    console.error('Failed to refresh all families cache:', error);
    showCacheRefreshError(error);
    throw error;
  }
};

/**
 * Silent cache refresh (no notifications)
 * Use this for background refreshes
 */
export const silentRefreshFamilyCache = async (familyId, daysAhead = 90) => {
  try {
    console.log(`Silent cache refresh for family ${familyId}`);
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + daysAhead);
    
    const { data, error } = await supabase.rpc('refresh_calendar_days_cache', {
      p_family_id: familyId,
      p_from_date: startDate.toISOString().split('T')[0],
      p_to_date: endDate.toISOString().split('T')[0]
    });
    
    if (error) {
      console.error('Silent cache refresh error:', error);
      throw error;
    }
    
    console.log('Silent cache refresh completed');
    return data;
    
  } catch (error) {
    console.error('Failed silent cache refresh:', error);
    throw error;
  }
};

/**
 * Refresh cache with retry logic
 */
export const refreshCacheWithRetry = async (familyId, maxRetries = 3, daysAhead = 90) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Cache refresh attempt ${attempt}/${maxRetries}`);
      return await refreshFamilyCache(familyId, daysAhead);
    } catch (error) {
      lastError = error;
      console.error(`Cache refresh attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
};

/**
 * Check cache freshness for a family
 */
export const checkCacheFreshness = async (familyId) => {
  try {
    const { data, error } = await supabase
      .from('calendar_days_cache')
      .select('generated_at')
      .eq('family_id', familyId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error checking cache freshness:', error);
      return null;
    }
    
    if (!data) {
      console.log('No cache data found for family');
      return null;
    }
    
    const lastGenerated = new Date(data.generated_at);
    const now = new Date();
    const ageInMinutes = (now - lastGenerated) / (1000 * 60);
    
    console.log(`Cache age: ${ageInMinutes.toFixed(1)} minutes`);
    return {
      lastGenerated: lastGenerated,
      ageInMinutes: ageInMinutes,
      isFresh: ageInMinutes < 5 // Consider fresh if less than 5 minutes old
    };
    
  } catch (error) {
    console.error('Failed to check cache freshness:', error);
    return null;
  }
};

/**
 * Smart cache refresh - only refresh if cache is stale
 */
export const smartRefreshCache = async (familyId, forceRefresh = false) => {
  try {
    if (!forceRefresh) {
      const freshness = await checkCacheFreshness(familyId);
      
      if (freshness && freshness.isFresh) {
        console.log('Cache is fresh, skipping refresh');
        return { refreshed: false, reason: 'cache_fresh' };
      }
    }
    
    console.log('Cache is stale or force refresh requested, refreshing...');
    await refreshFamilyCache(familyId);
    return { refreshed: true, reason: forceRefresh ? 'force_refresh' : 'cache_stale' };
    
  } catch (error) {
    console.error('Smart cache refresh failed:', error);
    throw error;
  }
};

export default {
  refreshFamilyCache,
  refreshAllFamiliesCache,
  silentRefreshFamilyCache,
  refreshCacheWithRetry,
  checkCacheFreshness,
  smartRefreshCache
};
