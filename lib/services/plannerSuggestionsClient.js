/**
 * Planner Suggestions API Client
 * Functions for interacting with planner suggestions via Supabase RPCs
 */
import { supabase } from '../supabase';
import { shouldSuppressError } from '../apiClient';

/**
 * Generate daily suggestions for a family
 * @param {string} familyId - Family ID
 * @param {Date|string} date - Date to generate suggestions for (defaults to today)
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export async function generateDailySuggestions(familyId, date = null) {
  try {
    const targetDate = date ? (date instanceof Date ? date.toISOString().split('T')[0] : date) : null;
    
    const { data, error } = await supabase.rpc('generate_daily_suggestions', {
      p_family_id: familyId,
      p_date: targetDate,
    });

    if (error) {
      // Always log the full error details for debugging - log as separate strings so they're visible
      const errorMsg = error.message || 'No message';
      const errorCode = error.code || 'No code';
      const errorDetails = error.details || 'No details';
      const errorHint = error.hint || 'No hint';
      
      if (!shouldSuppressError(error)) {
      } else {
        // Log suppressed errors with full details - use console.log so it's definitely visible
}
      return { data: null, error };
    }

    return { data: data || [], error: null };
  } catch (err) {
    // Suppress expected errors from console logging
    if (!shouldSuppressError(err)) {
    }
    return { data: null, error: err };
  }
}

/**
 * Get active suggestions for a family
 * @param {string} familyId - Family ID
 * @param {string} childId - Optional child ID to filter by
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export async function getActiveSuggestions(familyId, childId = null) {
  try {
    let query = supabase
      .from('planner_suggestions')
      .select(`
        *,
        child:children(first_name)
      `)
      .eq('family_id', familyId)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(20);

    if (childId) {
      query = query.eq('child_id', childId);
    }

    const { data, error } = await query;

    if (error) {
      if (!shouldSuppressError(error)) {
      }
      return { data: null, error };
    }

    // Map child data to suggestion
    const mappedData = (data || []).map(suggestion => ({
      ...suggestion,
      child_name: suggestion.child?.first_name || null,
    }));

    return { data: mappedData, error: null };
  } catch (err) {
    if (!shouldSuppressError(err)) {
    }
    return { data: null, error: err };
  }
}

/**
 * Dismiss a suggestion
 * @param {string} suggestionId - Suggestion ID
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export async function dismissSuggestion(suggestionId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from('planner_suggestions')
      .update({
        dismissed_at: new Date().toISOString(),
        dismissed_by: user?.id || null,
      })
      .eq('id', suggestionId)
      .select()
      .single();

    if (error) {
      if (!shouldSuppressError(error)) {
      }
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    if (!shouldSuppressError(err)) {
    }
    return { data: null, error: err };
  }
}

