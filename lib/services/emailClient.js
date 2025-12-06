/**
 * Email Client Service
 * Handles weekly overview email generation and sending
 */
import { supabase } from '../supabase';

const getAPIBase = () => {
  if (typeof window !== 'undefined') {
    return process.env.REACT_APP_API_URL || window.location.origin;
  }
  return process.env.REACT_APP_API_URL || '';
};

/**
 * Generate and send weekly overview email
 */
export async function sendWeeklyOverviewEmail({
  familyId,
  childIds = [],
  weekStart,
  recipientEmails = [],
  includeProgress = true,
  includeSchedule = true,
  includeRecommendations = true,
}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/email/weekly-overview`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        family_id: familyId,
        child_ids: childIds,
        week_start: weekStart instanceof Date 
          ? weekStart.toISOString().split('T')[0] 
          : weekStart,
        recipient_emails: recipientEmails,
        include_progress: includeProgress,
        include_schedule: includeSchedule,
        include_recommendations: includeRecommendations,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err) {
    console.error('[emailClient] Error sending weekly overview:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Preview weekly overview email (HTML)
 */
export async function previewWeeklyOverviewEmail({
  familyId,
  childIds = [],
  weekStart,
  includeProgress = true,
  includeSchedule = true,
  includeRecommendations = true,
}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const apiBase = getAPIBase();
    const params = new URLSearchParams({
      family_id: familyId,
      child_ids: childIds.join(','),
      week_start: weekStart instanceof Date 
        ? weekStart.toISOString().split('T')[0] 
        : weekStart,
      include_progress: includeProgress.toString(),
      include_schedule: includeSchedule.toString(),
      include_recommendations: includeRecommendations.toString(),
    });

    const response = await fetch(`${apiBase}/api/email/weekly-overview/preview?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    const html = await response.text();
    return { success: true, html };
  } catch (err) {
    console.error('[emailClient] Error previewing weekly overview:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get email preferences for a family
 */
export async function getEmailPreferences(familyId) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase
      .from('email_preferences')
      .select('*')
      .eq('family_id', familyId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }

    return { success: true, data: data || null };
  } catch (err) {
    console.error('[emailClient] Error getting email preferences:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Update email preferences
 */
export async function updateEmailPreferences(familyId, preferences) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase
      .from('email_preferences')
      .upsert({
        family_id: familyId,
        ...preferences,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'family_id',
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, data };
  } catch (err) {
    console.error('[emailClient] Error updating email preferences:', err);
    return { success: false, error: err.message };
  }
}

