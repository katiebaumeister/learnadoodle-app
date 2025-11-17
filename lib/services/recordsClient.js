/**
 * API client for Records, Credits & Compliance (Phase 4)
 */
import { apiRequest } from '../apiClient';
import { supabase } from '../supabase';

/**
 * Add a grade record
 */
export async function addGrade(gradeData) {
  const { child_id, subject_id, term_label, score, grade, credits, rubric, notes } = gradeData;
  
  const { data, error } = await apiRequest('/api/records/add_grade', {
    method: 'POST',
    body: JSON.stringify({
      child_id,
      subject_id: subject_id || null,
      term_label: term_label || null,
      score: score || null,
      grade: grade || null,
      credits: credits || null,
      rubric: rubric || null,
      notes: notes || null,
    }),
  });
  
  if (error) throw error;
  return data;
}

/**
 * Add a portfolio upload metadata record
 */
export async function addPortfolioUpload(uploadData) {
  const { child_id, subject_id, event_id, caption, file_path } = uploadData;
  
  const { data, error } = await apiRequest('/api/records/add_portfolio_upload', {
    method: 'POST',
    body: JSON.stringify({
      child_id,
      subject_id: subject_id || null,
      event_id: event_id || null,
      caption: caption || null,
      file_path,
    }),
  });
  
  if (error) throw error;
  return data;
}

/**
 * Get state requirements for compliance
 */
export async function getStateRequirements(stateCode) {
  const { data, error } = await apiRequest(`/api/records/state_requirements?state_code=${encodeURIComponent(stateCode)}`, {
    method: 'GET',
  });
  
  if (error) throw error;
  return data || [];
}

/**
 * Generate transcript CSV
 */
export async function generateTranscript(childId, rangeStart, rangeEnd) {
  const startStr = rangeStart instanceof Date ? rangeStart.toISOString().split('T')[0] : rangeStart;
  const endStr = rangeEnd instanceof Date ? rangeEnd.toISOString().split('T')[0] : rangeEnd;
  
  // Get auth token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  
  if (!token) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch(
    `${API_BASE}/api/records/generate_transcript?child_id=${encodeURIComponent(childId)}&range_start=${startStr}&range_end=${endStr}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
  }
  
  const blob = await response.blob();
  return blob;
}

/**
 * Get attendance timeline for a child
 */
export async function getAttendanceTimeline(childId, rangeStart, rangeEnd) {
  const startStr = rangeStart instanceof Date ? rangeStart.toISOString().split('T')[0] : rangeStart;
  const endStr = rangeEnd instanceof Date ? rangeEnd.toISOString().split('T')[0] : rangeEnd;
  
  const { data, error } = await supabase
    .from('attendance_records')
    .select('day_date, minutes, status, note, event_id')
    .eq('child_id', childId)
    .gte('day_date', startStr)
    .lte('day_date', endStr)
    .order('day_date', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

/**
 * Get grades for a child
 */
export async function getGrades(childId) {
  const { data, error } = await supabase
    .from('grades')
    .select(`
      id,
      subject_id,
      term_label,
      score,
      grade,
      credits,
      rubric,
      notes,
      created_at,
      subject:subject_id (id, name)
    `)
    .eq('child_id', childId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

/**
 * Get linked events and outcomes for a grade
 */
export async function getGradeOutcomes(grade) {
  if (!grade.subject_id || !grade.created_at) {
    return { events: [], outcomes: [] };
  }
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { events: [], outcomes: [] };
  
  // Get child_id from grade
  const childId = grade.child_id;
  if (!childId) return { events: [], outcomes: [] };
  
  // Estimate date range (term or last 90 days)
  const gradeDate = new Date(grade.created_at);
  const startDate = new Date(gradeDate);
  startDate.setDate(startDate.getDate() - 90);
  
  // Get events for this subject in date range
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, title, start_ts, end_ts, status')
    .eq('child_id', childId)
    .eq('subject_id', grade.subject_id)
    .gte('start_ts', startDate.toISOString())
    .lte('start_ts', gradeDate.toISOString())
    .order('start_ts', { ascending: false })
    .limit(20);
  
  if (eventsError) {
    console.error('Error fetching events:', eventsError);
  }
  
  // Get outcomes for these events
  const eventIds = (events || []).map(e => e.id);
  let outcomes = [];
  if (eventIds.length > 0) {
    const { data: outcomesData, error: outcomesError } = await supabase
      .from('event_outcomes')
      .select('id, event_id, rating, grade, note, strengths, struggles, created_at')
      .in('event_id', eventIds)
      .order('created_at', { ascending: false });
    
    if (!outcomesError) {
      outcomes = outcomesData || [];
    }
  }
  
  return {
    events: events || [],
    outcomes: outcomes || []
  };
}

/**
 * Get last transcript export for a child
 */
export async function getLastTranscript(childId) {
  const { data, error } = await supabase
    .from('transcripts')
    .select('id, created_at, export_url')
    .eq('child_id', childId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle(); // Use maybeSingle() instead of single() to handle empty results gracefully
  
  if (error) {
    // Handle permission errors gracefully
    if (error.code === '42501' || error.code === 'PGRST116' || error.message?.includes('permission denied')) {
      return null;
    }
    throw error;
  }
  
  return data || null;
}

/**
 * Get portfolio uploads for a child
 */
export async function getPortfolioUploads(childId) {
  const { data, error } = await supabase
    .from('uploads')
    .select('id, storage_path, caption, created_at, subject_id, event_id')
    .eq('child_id', childId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

