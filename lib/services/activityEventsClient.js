import { supabase } from '../supabase';

/**
 * Log an explicit product/auth event (e.g. user_signed_in).
 * Domain actions (subjects, learning days) are already in Postgres — see family_usage_summary_v.
 */
export async function logUserActivityEvent(eventType, metadata = {}, eventCategory = 'product') {
  const type = String(eventType || '').trim();
  if (!type) return { data: null, error: new Error('eventType is required') };

  try {
    const { data, error } = await supabase.rpc('log_user_activity_event', {
      p_event_type: type,
      p_event_category: eventCategory,
      p_metadata: metadata && typeof metadata === 'object' ? metadata : {},
    });
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
