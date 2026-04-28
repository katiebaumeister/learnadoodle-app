/**
 * API client for Records, Credits & Compliance (Phase 4)
 */
import { apiRequest, shouldSuppressError } from '../apiClient';
import { supabase } from '../supabase';

// Get API base URL
const getAPIBase = () => {
  if (typeof window !== 'undefined') {
    return process.env.REACT_APP_API_URL || window.location.origin;
  }
  return process.env.REACT_APP_API_URL || '';
};

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
 * Get state requirement metrics (attendance definition, min hours/days, testing) for a state.
 * Used for compliance guidance and plan target suggestions.
 * @param {string} stateCode - e.g. 'NE', 'CA'
 * @returns {Promise<{ attendance?: { source_url?, last_verified_at?, metric_defaults? }, hours?: { ... }, testing?: { ... } }>}
 */
export async function getStateRequirementMetrics(stateCode) {
  if (!stateCode || typeof stateCode !== 'string') return null;
  const { data, error } = await apiRequest(
    `/api/records/state_requirement_metrics?state_code=${encodeURIComponent(stateCode)}`,
    { method: 'GET' }
  );
  if (error) return null;
  return data && typeof data === 'object' ? data : null;
}

/**
 * Mark a state requirement as verified (admin). Optional notes.
 */
export async function verifyStateRequirement(requirementId, notes = null) {
  const { data, error } = await apiRequest(`/api/records/state_requirements/${encodeURIComponent(requirementId)}/verify`, {
    method: 'POST',
    body: JSON.stringify(notes != null ? { notes } : {}),
  });
  if (error) throw error;
  return data;
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
  
  const apiBase = getAPIBase();
  const response = await fetch(
    `${apiBase}/api/records/generate_transcript?child_id=${encodeURIComponent(childId)}&range_start=${startStr}&range_end=${endStr}`,
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
  // Get material_ids from material_children for this child
  const { data: materialChildren, error: mcError } = await supabase
    .from('material_children')
    .select('material_id')
    .eq('child_id', childId);
  
  if (mcError && !shouldSuppressError(mcError)) {
    throw mcError;
  }
  
  const materialIds = materialChildren?.map(mc => mc.material_id) || [];
  
  if (materialIds.length === 0) {
    return [];
  }
  
  // Get materials
  const { data, error } = await supabase
    .from('materials')
    .select('id, storage_path, caption, created_at, subject_id, event_id')
    .in('id', materialIds)
    .is('deleted_at', null)
    .not('storage_path', 'is', null) // Only file-based materials
    .order('created_at', { ascending: false });
  
  if (error) {
    // Suppress expected 400/404 errors
    if (shouldSuppressError(error)) {
      return [];
    }
    throw error;
  }
  
  return data || [];
}

/**
 * Get portfolio timeline events for a child with optional subject filter
 */
export async function getPortfolioTimelineEvents(childId, rangeStart, rangeEnd, subjectId = null) {
  const startStr = rangeStart instanceof Date ? rangeStart.toISOString() : rangeStart;
  const endStr = rangeEnd instanceof Date ? rangeEnd.toISOString() : rangeEnd;
  
  let query = supabase
    .from('events')
    .select(`
      id,
      title,
      description,
      start_ts,
      end_ts,
      status,
      subject_id,
      child_id,
      source,
      subject:subject_id (id, name)
    `)
    .eq('child_id', childId)
    .gte('start_ts', startStr)
    .lte('start_ts', endStr)
    .order('start_ts', { ascending: false });
  
  if (subjectId) {
    query = query.eq('subject_id', subjectId);
  }
  
  const { data, error } = await query;
  
  if (error) throw error;
  
  // Calculate duration for each event
  const eventsWithDuration = (data || []).map(event => {
    let duration_minutes = null;
    if (event.start_ts && event.end_ts) {
      const start = new Date(event.start_ts);
      const end = new Date(event.end_ts);
      duration_minutes = (end - start) / (1000 * 60);
    }
    return { ...event, duration_minutes };
  });
  
  return eventsWithDuration;
}

/**
 * Get essential documents for a child
 */
export async function getDocuments(childId, docType = null) {
  const params = new URLSearchParams({ child_id: childId });
  if (docType) {
    params.append('doc_type', docType);
  }
  
  const { data, error } = await apiRequest(`/api/records/documents?${params.toString()}`, {
    method: 'GET',
  });
  
  if (error) throw error;
  return data || [];
}

/**
 * Add an essential document
 */
export async function addDocument(documentData) {
  const { child_id, type, title, file_url, metadata } = documentData;
  
  const { data, error } = await apiRequest('/api/records/documents', {
    method: 'POST',
    body: JSON.stringify({
      child_id,
      type,
      title,
      file_url: file_url || null,
      metadata: metadata || null,
    }),
  });
  
  if (error) throw error;
  return data;
}

/**
 * Delete an essential document
 */
export async function deleteDocument(documentId) {
  const { data, error } = await apiRequest(`/api/records/documents/${documentId}`, {
    method: 'DELETE',
  });
  
  if (error) throw error;
  return data;
}

/**
 * Get support profile for a child
 */
export async function getSupportProfile(childId) {
  const { data, error } = await apiRequest(`/api/records/support_profile?child_id=${encodeURIComponent(childId)}`, {
    method: 'GET',
  });
  
  if (error) throw error;
  return data;
}

/**
 * Update support profile including color mode preferences
 */
export async function updateSupportProfile(childId, colorMode, colorPreferences) {
  const params = new URLSearchParams({ child_id: childId });
  
  const body = {};
  if (colorMode !== undefined && colorMode !== null) {
    body.color_mode = colorMode;
  }
  if (colorPreferences !== undefined && colorPreferences !== null) {
    body.color_preferences = colorPreferences;
  }
  
  const { data, error } = await apiRequest(`/api/records/support_profile?${params.toString()}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  
  if (error) throw error;
  return data;
}

/**
 * Get comprehensive learner profile for a child
 */
export async function getLearnerProfile(childId) {
  const { data, error } = await apiRequest(`/api/records/learner_profile?child_id=${encodeURIComponent(childId)}`, {
    method: 'GET',
  });
  
  if (error) throw error;
  return data;
}

/**
 * Update comprehensive learner profile
 */
export async function updateLearnerProfile(childId, profileData) {
  const params = new URLSearchParams({ child_id: childId });
  
  const { data, error } = await apiRequest(`/api/records/learner_profile?${params.toString()}`, {
    method: 'PUT',
    body: JSON.stringify(profileData),
  });
  
  if (error) throw error;
  return data;
}

/**
 * Get comprehensive profile (combining support and learner profiles)
 */
export async function getComprehensiveProfile(childId) {
  const { data, error } = await apiRequest(`/api/records/comprehensive_profile?child_id=${encodeURIComponent(childId)}`, {
    method: 'GET',
  });
  
  if (error) throw error;
  return data;
}

/**
 * Get personalized recommendations for a child
 */
export async function getRecommendations(childId, status = null, recommendationType = null) {
  const params = new URLSearchParams({ child_id: childId });
  if (status) params.append('status', status);
  if (recommendationType) params.append('recommendation_type', recommendationType);
  
  const { data, error } = await apiRequest(`/api/records/recommendations?${params.toString()}`, {
    method: 'GET',
  });
  
  if (error) throw error;
  return data || [];
}

/**
 * Create a new personalized recommendation
 */
export async function createRecommendation(childId, recommendationData) {
  const params = new URLSearchParams({ child_id: childId });
  
  const { data, error } = await apiRequest(`/api/records/recommendations?${params.toString()}`, {
    method: 'POST',
    body: JSON.stringify(recommendationData),
  });
  
  if (error) throw error;
  return data;
}

/**
 * Update recommendation status or feedback
 */
export async function updateRecommendation(recommendationId, updates) {
  const params = new URLSearchParams();
  if (updates.status) params.append('status', updates.status);
  if (updates.user_feedback !== undefined) params.append('user_feedback', updates.user_feedback);
  if (updates.user_rating !== undefined) params.append('user_rating', updates.user_rating.toString());
  if (updates.snoozed_until) params.append('snoozed_until', updates.snoozed_until);
  
  const { data, error } = await apiRequest(`/api/records/recommendations/${recommendationId}?${params.toString()}`, {
    method: 'PATCH',
  });
  
  if (error) throw error;
  return data;
}

/**
 * Get compliance status for family/children
 */
export async function getComplianceStatus(familyId, childIds, dateRange) {
  const startStr = dateRange?.start instanceof Date ? dateRange.start.toISOString().split('T')[0] : dateRange?.start;
  const endStr = dateRange?.end instanceof Date ? dateRange.end.toISOString().split('T')[0] : dateRange?.end;
  
  // Try API endpoint first (silently fall back if 404)
  try {
    const params = new URLSearchParams({
      family_id: familyId,
      start: startStr || '',
      end: endStr || '',
    });
    
    if (childIds && childIds.length > 0) {
      childIds.forEach(id => params.append('child_ids', id));
    }
    
    const { data, error } = await apiRequest(`/api/records/compliance_status?${params.toString()}`, {
      method: 'GET',
    });
    
    // If endpoint exists and returns data, use it
    if (!error && data) {
      return data;
    }
    
    // If 404, silently use fallback (endpoint doesn't exist yet)
    if (error?.status === 404) {
      // Silently fall back - this is expected until backend endpoint is created
    } else if (error) {
    }
  } catch (err) {
    // Network error or other exception - use fallback
}
  
  // Fallback: Calculate from existing data
  const checklist = [
    { id: 1, label: 'Maintain portfolio', completed: true },
    { id: 2, label: 'Maintain transcripts', completed: true },
    { id: 3, label: 'State-required subjects', completed: false },
    { id: 4, label: 'Attendance minimum', completed: true },
    { id: 5, label: 'Log requirements', completed: true },
    { id: 6, label: 'Planned hours', completed: false },
  ];
  
  return {
    checklist,
    readiness: {},
    gaps: [],
    documents: [],
    stateRules: { state: 'US', attendanceHours: 180, portfolioRequired: true, assessmentRequired: false },
  };
}

/**
 * Get records summary for family/children
 */
export async function getRecordsSummary(familyId, childIds, dateRange) {
  const startStr = dateRange?.start instanceof Date ? dateRange.start.toISOString().split('T')[0] : dateRange?.start;
  const endStr = dateRange?.end instanceof Date ? dateRange.end.toISOString().split('T')[0] : dateRange?.end;
  
  // Try API endpoint first (silently fall back if 404)
  try {
    const params = new URLSearchParams({
      family_id: familyId,
      start: startStr || '',
      end: endStr || '',
    });
    
    if (childIds && childIds.length > 0) {
      childIds.forEach(id => params.append('child_ids', id));
    }
    
    const { data, error } = await apiRequest(`/api/records/summary?${params.toString()}`, {
      method: 'GET',
    });
    
    // If endpoint exists and returns data, use it
    if (!error && data) {
      return data;
    }
    
    // If 404, silently use fallback (endpoint doesn't exist yet)
    if (error?.status === 404) {
      // Silently fall back - this is expected until backend endpoint is created
    } else if (error) {
    }
  } catch (err) {
    // Network error or other exception - use fallback
}
  
  // Fallback: Calculate from existing Supabase queries
  const perChild = {};
  
  if (!childIds || childIds.length === 0) {
    return { perChild: {}, global: {} };
  }
  
  try {
    // Load attendance, grades, and uploads for each child
    const promises = childIds.map(async (childId) => {
      const [attendance, grades, uploads] = await Promise.all([
        getAttendanceTimeline(childId, startStr, endStr).catch(() => []),
        getGrades(childId).catch(() => []),
        getPortfolioUploads(childId).catch(() => []),
      ]);
      
      // Calculate metrics
      const attendanceMinutes = attendance.reduce((sum, r) => sum + (r.minutes || 0), 0);
      const attendanceDays = attendance.filter(r => r.status === 'present' || r.status === 'partial').length;
      const creditsEarned = grades.reduce((sum, g) => sum + (parseFloat(g.credits) || 0), 0);
      const portfolioCount = uploads.length;
      
      // Simple readiness score calculation
      const hasAttendance = attendanceMinutes > 0;
      const hasPortfolio = portfolioCount > 0;
      const hasCredits = creditsEarned > 0;
      const readinessScore = Math.round(((hasAttendance ? 33 : 0) + (hasPortfolio ? 33 : 0) + (hasCredits ? 34 : 0)));
      
      return {
        [childId]: {
          readinessScore,
          attendanceDays,
          attendanceMinutes,
          creditsEarned,
          creditsPlanned: creditsEarned * 1.2, // Estimate planned as 20% more than earned
          portfolioCount,
        },
      };
    });
    
    const results = await Promise.all(promises);
    results.forEach(result => {
      Object.assign(perChild, result);
    });
  } catch (error) {
  }
  
  return { perChild, global: {} };
}

/**
 * Get credits summary for children
 */
export async function getCreditsSummary(familyId, childIds, dateRange) {
  const startStr = dateRange?.start instanceof Date ? dateRange.start.toISOString().split('T')[0] : dateRange?.start;
  const endStr = dateRange?.end instanceof Date ? dateRange.end.toISOString().split('T')[0] : dateRange?.end;
  
  // Use existing getGrades for each child and aggregate
  if (!childIds || childIds.length === 0) {
    return { perChild: {}, perSubject: {} };
  }
  
  try {
    const gradesPromises = childIds.map(childId => getGrades(childId));
    const gradesArrays = await Promise.all(gradesPromises);
    
    const perChild = {};
    const perSubject = {};
    
    childIds.forEach((childId, idx) => {
      const grades = gradesArrays[idx] || [];
      let totalEarned = 0;
      const bySubject = {};
      
      grades.forEach(grade => {
        const credits = parseFloat(grade.credits) || 0;
        totalEarned += credits;
        
        const subjectId = grade.subject_id;
        const subjectName = grade.subject?.name || 'Unassigned';
        
        if (!bySubject[subjectId]) {
          bySubject[subjectId] = { name: subjectName, earned: 0, planned: 0, grade: null };
        }
        bySubject[subjectId].earned += credits;
        if (grade.grade) {
          bySubject[subjectId].grade = grade.grade;
        }
        
        // Aggregate by subject globally
        if (!perSubject[subjectId]) {
          perSubject[subjectId] = { name: subjectName, earned: 0, planned: 0 };
        }
        perSubject[subjectId].earned += credits;
      });
      
      perChild[childId] = {
        totalEarned,
        bySubject,
        gpa: calculateGPA(grades),
      };
    });
    
    return { perChild, perSubject };
  } catch (error) {
    return { perChild: {}, perSubject: {} };
  }
}

/**
 * Calculate GPA from grades
 */
function calculateGPA(grades) {
  const gradePoints = {
    'A+': 4.0, 'A': 4.0, 'A-': 3.7,
    'B+': 3.3, 'B': 3.0, 'B-': 2.7,
    'C+': 2.3, 'C': 2.0, 'C-': 1.7,
    'D+': 1.3, 'D': 1.0, 'D-': 0.7,
    'F': 0.0,
  };
  
  let totalPoints = 0;
  let totalCredits = 0;
  
  grades.forEach(grade => {
    const credits = parseFloat(grade.credits) || 0;
    if (credits > 0 && grade.grade) {
      const points = gradePoints[grade.grade.toUpperCase()] || 0;
      totalPoints += points * credits;
      totalCredits += credits;
    }
  });
  
  return totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : null;
}

/**
 * Get evidence/portfolio items with filters
 */
export async function getEvidence(familyId, childIds, filters, dateRange) {
  const startStr = dateRange?.start instanceof Date ? dateRange.start.toISOString().split('T')[0] : dateRange?.start;
  const endStr = dateRange?.end instanceof Date ? dateRange.end.toISOString().split('T')[0] : dateRange?.end;
  
  // Query materials table for file-based materials (evidence)
  // If filtering by childIds, we need to join with material_children
  let query;
  
  if (childIds && childIds.length > 0) {
    // Filter by child_ids using material_children junction table
    // First get material_ids from material_children
    const { data: materialChildren, error: mcError } = await supabase
      .from('material_children')
      .select('material_id')
      .in('child_id', childIds)
      .eq('family_id', familyId);
    
    if (mcError) throw mcError;
    
    const materialIds = materialChildren?.map(mc => mc.material_id) || [];
    
    if (materialIds.length === 0) {
      return []; // No materials for these children
    }
    
    query = supabase
      .from('materials')
      .select('id, storage_path, caption, created_at, subject_id, event_id, mime, bytes, display_order')
      .eq('family_id', familyId)
      .in('id', materialIds)
      .is('deleted_at', null)
      .not('storage_path', 'is', null); // Only file-based materials
  } else {
    query = supabase
      .from('materials')
      .select('id, storage_path, caption, created_at, subject_id, event_id, mime, bytes, display_order')
      .eq('family_id', familyId)
      .is('deleted_at', null)
      .not('storage_path', 'is', null); // Only file-based materials
  }
  
  query = query.gte('created_at', startStr || '1970-01-01')
                .lte('created_at', endStr || '9999-12-31');
  
  if (filters?.subject) {
    query = query.eq('subject_id', filters.subject);
  }
  
  query = query.order('display_order', { ascending: true, nullsFirst: false })
                .order('created_at', { ascending: false });
  
  const { data, error } = await query;
  
  if (error) {
    // Suppress expected 400/404 errors
    if (shouldSuppressError(error)) {
      return [];
    }
    throw error;
  }
  
  // Get child_ids from material_children for each material
  if (data && data.length > 0) {
    const materialIds = data.map(m => m.id);
    const { data: mcData } = await supabase
      .from('material_children')
      .select('material_id, child_id')
      .in('material_id', materialIds);
    
    // Create a map of material_id -> child_id (taking first child_id if multiple)
    const childIdMap = new Map();
    (mcData || []).forEach(mc => {
      if (!childIdMap.has(mc.material_id)) {
        childIdMap.set(mc.material_id, mc.child_id);
      }
    });
    
    // Add child_id to each material
    return data.map(m => ({
      ...m,
      child_id: childIdMap.get(m.id) || null,
    }));
  }
  
  return data || [];
}

/**
 * Upload evidence file
 */
export async function uploadEvidence(formData) {
  const { data, error } = await apiRequest('/api/records/upload_evidence', {
    method: 'POST',
    body: formData,
  });
  
  if (error) throw error;
  return data;
}

/**
 * Get evidence by ID with full metadata
 */
export async function getEvidenceById(familyId, evidenceId) {
  try {
    // Try API endpoint first
    const { data, error } = await apiRequest(`/api/records/evidence/${evidenceId}`, {
      method: 'GET',
    });
    
    if (!error && data) {
      return { data, error: null };
    }
    
    // Fallback to Supabase query - use materials table
    const { data: materialData, error: materialError } = await supabase
      .from('materials')
      .select('*')
      .eq('id', evidenceId)
      .eq('family_id', familyId)
      .is('deleted_at', null)
      .single();
    
    if (materialError) {
      // Suppress expected 400/404 errors
      if (shouldSuppressError(materialError)) {
        return { data: null, error: null };
      }
      return { data: null, error: materialError };
    }
    
    // Get child_ids from material_children
    const { data: materialChildren } = await supabase
      .from('material_children')
      .select('child_id')
      .eq('material_id', evidenceId);
    
    const childIds = materialChildren?.map(mc => mc.child_id) || [];
    
    // Map to expected format
    const mapped = {
      id: materialData.id,
      family_id: materialData.family_id,
      child_ids: childIds,
      subject: materialData.subject_id || null,
      type: getEvidenceTypeFromMime(materialData.mime),
      title: materialData.caption || materialData.title || materialData.storage_path?.split('/').pop() || 'Untitled',
      description: materialData.notes || '',
      tags: materialData.tags || [],
      uploaded_at: materialData.created_at,
      mime_type: materialData.mime,
      url: materialData.storage_path,
      filename: materialData.filename || materialData.storage_path?.split('/').pop() || 'file',
      bytes: materialData.bytes || 0,
      syllabus_unit_ids: materialData.syllabus_unit_ids || [],
      planner_event_ids: materialData.event_id ? [materialData.event_id] : [],
      display_order: materialData.display_order || 0,
    };
    
    return { data: mapped, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

function getEvidenceTypeFromMime(mime) {
  if (!mime) return 'file';
  if (mime.startsWith('image/')) return 'photo';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('video')) return 'video';
  if (mime.includes('audio')) return 'audio';
  return 'file';
}

/**
 * Update evidence metadata
 */
export async function updateEvidenceMetadata(evidenceId, payload) {
  try {
    // Try API endpoint first
    const { data, error } = await apiRequest(`/api/records/evidence/${evidenceId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    
    if (!error && data) {
      return { data, error: null };
    }
    
    // Fallback to Supabase update - use materials table
    const updatePayload = {};
    
    if (payload.title !== undefined) {
      updatePayload.caption = payload.title;
      updatePayload.title = payload.title; // Update both caption and title for consistency
    }
    if (payload.description !== undefined) updatePayload.notes = payload.description;
    if (payload.subject !== undefined) updatePayload.subject_id = payload.subject;
    if (payload.tags !== undefined) updatePayload.tags = payload.tags;
    // Note: child_ids should be updated via material_children table, not materials.child_id
    // This function doesn't handle child_id updates - use linkMaterialToChild/unlinkMaterialToChild separately
    if (payload.syllabus_unit_ids !== undefined) updatePayload.syllabus_unit_ids = payload.syllabus_unit_ids;
    if (payload.planner_event_ids !== undefined && payload.planner_event_ids.length > 0) {
      updatePayload.event_id = payload.planner_event_ids[0]; // materials table has single event_id
    }
    if (payload.display_order !== undefined) updatePayload.display_order = payload.display_order;
    
    const { data: updateData, error: updateError } = await supabase
      .from('materials')
      .update(updatePayload)
      .eq('id', evidenceId)
      .select()
      .single();
    
    if (updateError) {
      // Suppress expected 400/404 errors
      if (shouldSuppressError(updateError)) {
        return { data: null, error: null };
      }
      return { data: null, error: updateError };
    }
    
    return { data: updateData, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Alias for updateEvidenceMetadata (for consistency)
 */
export async function updateEvidence(evidenceId, payload) {
  return updateEvidenceMetadata(evidenceId, payload);
}

/**
 * Reorder evidence items by updating display_order
 * @param {Array<{id: string, display_order: number}>} evidenceOrder - Array of evidence IDs with their new display_order values
 * @returns {Promise<{data: any, error: any}>}
 */
export async function reorderEvidence(evidenceOrder) {
  try {
    // Try API endpoint first
    const { data, error } = await apiRequest('/api/records/evidence/reorder', {
      method: 'POST',
      body: JSON.stringify({ evidence_order: evidenceOrder }),
    });
    
    if (!error && data) {
      return { data, error: null };
    }
    
    // Fallback to Supabase batch update - use materials table
    const updates = evidenceOrder.map(({ id, display_order }) => 
      supabase
        .from('materials')
        .update({ display_order })
        .eq('id', id)
    );
    
    const results = await Promise.all(updates);
    const errors = results.filter(r => r.error).map(r => r.error);
    
    if (errors.length > 0) {
      return { data: null, error: errors[0] };
    }
    
    return { data: { updated: evidenceOrder.length }, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Delete evidence
 */
export async function deleteEvidence(evidenceId, familyId) {
  try {
    // Try API endpoint first
    const { data, error } = await apiRequest(`/api/records/evidence/${evidenceId}`, {
      method: 'DELETE',
    });
    
    if (!error && data) {
      return { data, error: null };
    }
    
    // Fallback to Supabase soft delete - use materials table
    const { error: deleteError } = await supabase
      .from('materials')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', evidenceId)
      .eq('family_id', familyId);
    
    if (deleteError) {
      // Suppress expected 400/404 errors
      if (shouldSuppressError(deleteError)) {
        return { data: null, error: null };
      }
      return { data: null, error: deleteError };
    }
    
    return { data: { id: evidenceId }, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Get attendance logs for children
 */
export async function getAttendanceLogs(familyId, childIds, dateRange) {
  const startStr = dateRange?.start instanceof Date ? dateRange.start.toISOString().split('T')[0] : dateRange?.start;
  const endStr = dateRange?.end instanceof Date ? dateRange.end.toISOString().split('T')[0] : dateRange?.end;
  
  let query = supabase
    .from('attendance_records')
    .select('id, child_id, day_date, minutes, status, note, event_id')
    .eq('family_id', familyId)
    .gte('day_date', startStr || '1970-01-01')
    .lte('day_date', endStr || '9999-12-31')
    .order('day_date', { ascending: false });
  
  if (childIds && childIds.length > 0) {
    query = query.in('child_id', childIds);
  }
  
  const { data, error } = await query;
  
  if (error) {
    // Suppress expected 400/404 errors
    if (shouldSuppressError(error)) {
      return [];
    }
    throw error;
  }
  return data || [];
}

/**
 * Load attendance rows for specific event IDs (any date). Chunks IN lists for large sets.
 */
export async function getAttendanceRecordsForEventIds(familyId, eventIds) {
  if (!familyId || !eventIds?.length) return [];
  const unique = [...new Set(eventIds.map(String).filter(Boolean))];
  const chunkSize = 100;
  const out = [];
  const isMissingDayDateColumn = (error) => {
    const msg = String(error?.message || error?.detail || '').toLowerCase();
    return msg.includes('day_date') && (msg.includes('column') || msg.includes('schema cache') || msg.includes('does not exist'));
  };
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    let { data, error } = await supabase
      .from('attendance_records')
      .select('id, child_id, day_date, minutes, status, event_id')
      .eq('family_id', familyId)
      .in('event_id', chunk);
    if (error && isMissingDayDateColumn(error)) {
      const legacy = await supabase
        .from('attendance_records')
        .select('id, child_id, date, minutes_present, status, event_id')
        .eq('family_id', familyId)
        .in('event_id', chunk);
      data = (legacy.data || []).map((row) => ({
        id: row.id,
        child_id: row.child_id,
        day_date: row.date || null,
        minutes: row.minutes_present ?? 0,
        status: row.status || 'present',
        event_id: row.event_id,
      }));
      error = legacy.error;
    }
    if (error) {
      if (shouldSuppressError(error)) continue;
      throw error;
    }
    if (data?.length) out.push(...data);
  }
  return out;
}

/**
 * Update attendance log
 */
export async function updateAttendanceLog(logId, payload) {
  try {
    const { data, error } = await supabase
      .from('attendance_records')
      .update(payload)
      .eq('id', logId)
      .select()
      .single();
    
    if (error) {
      return { data: null, error };
    }
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Create attendance log
 */
export async function createAttendanceLog(payload) {
  try {
    const { data, error } = await supabase
      .from('attendance_records')
      .insert(payload)
      .select()
      .single();
    
    if (error) {
      return { data: null, error };
    }
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Delete attendance log by id
 */
export async function deleteAttendanceLog(logId) {
  try {
    const { error } = await supabase
      .from('attendance_records')
      .delete()
      .eq('id', logId);
    if (error) return { error };
    return { error: null };
  } catch (err) {
    return { error: err };
  }
}

/**
 * Get courses and syllabi for children
 */
export async function getCoursesAndSyllabi(familyId, childIds, dateRange) {
  try {
    const startStr = dateRange?.start instanceof Date ? dateRange.start.toISOString().split('T')[0] : dateRange?.start;
    const endStr = dateRange?.end instanceof Date ? dateRange.end.toISOString().split('T')[0] : dateRange?.end;
    
    // Try to fetch from syllabi table
    let query = supabase
      .from('syllabi')
      .select(`
        id,
        title,
        child_id,
        subject_id,
        start_date,
        end_date,
        expected_total_minutes,
        expected_weekly_minutes,
        subject:subject_id (id, name)
      `)
      .eq('family_id', familyId);
    
    if (childIds && childIds.length > 0) {
      query = query.in('child_id', childIds);
    }
    
    if (startStr) {
      query = query.gte('start_date', startStr);
    }
    if (endStr) {
      query = query.lte('end_date', endStr);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error && error.code !== 'PGRST116') {
      return [];
    }
    
    if (!data || data.length === 0) {
      return [];
    }
    
    // Map to course format and calculate progress
    const courses = await Promise.all(data.map(async (syllabus) => {
      // Get units count
      const { data: sections } = await supabase
        .from('syllabus_sections')
        .select('id')
        .eq('syllabus_id', syllabus.id)
        .catch(() => ({ data: [] }));
      
      const unitsCount = sections?.data?.length || 0;
      
      // Get evidence count - use materials table
      const { data: evidence } = await supabase
        .from('materials')
        .select('id')
        .eq('family_id', familyId)
        .eq('child_id', syllabus.child_id)
        .eq('subject_id', syllabus.subject_id)
        .is('deleted_at', null)
        .not('storage_path', 'is', null) // Only file-based materials
        .catch(() => ({ data: [] }));
      
      const artifactsCount = evidence?.data?.length || 0;
      
      // Calculate progress (simplified - could be more sophisticated)
      const progress = unitsCount > 0 ? Math.min(100, Math.round((artifactsCount / unitsCount) * 100)) : 0;
      
      return {
        id: syllabus.id,
        title: syllabus.title || 'Untitled Course',
        provider: 'Custom',
        subject: syllabus.subject?.name || 'Unassigned',
        child_ids: [syllabus.child_id],
        progress_percent: progress,
        units_count: unitsCount,
        units_completed_count: Math.floor(unitsCount * (progress / 100)),
        artifacts: artifactsCount,
        gaps: [],
      };
    }));
    
    return courses;
  } catch (error) {
    return [];
  }
}

/**
 * Get course details with units
 */
/**
 * Generate year-end summary PDF
 */
export async function generateYearEndSummary(childId, academicYearStart, academicYearEnd, summaryType = 'comprehensive') {
  const response = await apiRequest('/api/records/year_end_summary', {
    method: 'POST',
    body: JSON.stringify({
      child_id: childId,
      academic_year_start: academicYearStart,
      academic_year_end: academicYearEnd,
      summary_type: summaryType,
    }),
  });
  
  if (response.error) {
    throw new Error(response.error);
  }
  
  return response;
}

export async function getCourseDetails(courseId, familyId) {
  try {
    // Get syllabus/course
    const { data: syllabus, error: syllabusError } = await supabase
      .from('syllabi')
      .select(`
        id,
        title,
        child_id,
        subject_id,
        start_date,
        end_date,
        subject:subject_id (id, name)
      `)
      .eq('id', courseId)
      .eq('family_id', familyId)
      .single();
    
    if (syllabusError || !syllabus) {
      return { data: null, error: syllabusError || new Error('Course not found') };
    }
    
    // Get units (sections) with pacing data
    // TODO: Ensure target_date, completed_at, planned_minutes columns exist in syllabus_sections table
    const { data: sections, error: sectionsError } = await supabase
      .from('syllabus_sections')
      .select('id, title, position, expected_minutes, target_date, completed_at, planned_minutes')
      .eq('syllabus_id', courseId)
      .order('position', { ascending: true });
    
    if (sectionsError) {
    }
    
    // Calculate actual_minutes from events linked to each section
    const sectionsWithPacing = (sections || []).map(section => {
      // Find events linked to this section
      const sectionEvents = (events?.data || []).filter(e => e.source_section_id === section.id);
      
      // Calculate actual minutes from events
      let actualMinutes = 0;
      if (sectionEvents.length > 0) {
        // Get event durations
        const eventIds = sectionEvents.map(e => e.id);
        // We'd need to fetch event details for duration, but for now use expected_minutes as fallback
        actualMinutes = sectionEvents.length * (section.expected_minutes || 0);
      }
      
      return {
        ...section,
        target_date: section.target_date || null, // TODO: Ensure column exists
        completed_at: section.completed_at || null, // TODO: Ensure column exists
        planned_minutes: section.planned_minutes || section.expected_minutes || 0, // TODO: Ensure column exists
        actual_minutes: actualMinutes,
      };
    });
    
    // Get planner events linked to this syllabus
    const { data: events } = await supabase
      .from('events')
      .select('id, source_section_id')
      .eq('family_id', familyId)
      .eq('child_id', syllabus.child_id)
      .not('source_section_id', 'is', null)
      .catch(() => ({ data: [] }));
    
    // Get evidence linked to this syllabus/subject - use materials table with material_children join
    // First get material_ids for this child
    const { data: materialChildren } = await supabase
      .from('material_children')
      .select('material_id')
      .eq('child_id', syllabus.child_id)
      .eq('family_id', familyId)
      .catch(() => ({ data: [] }));
    
    const materialIds = materialChildren?.map(mc => mc.material_id) || [];
    
    if (materialIds.length === 0) {
      return { ...syllabus, units: [] };
    }
    
    const { data: evidence } = await supabase
      .from('materials')
      .select('id, subject_id')
      .eq('family_id', familyId)
      .in('id', materialIds)
      .eq('subject_id', syllabus.subject_id)
      .is('deleted_at', null)
      .not('storage_path', 'is', null) // Only file-based materials
      .catch(() => ({ data: [] }));
    
    // Map sections to units with status and pacing
    const units = sectionsWithPacing.map((section) => {
      const linkedEvents = (events?.data || []).filter(e => e.source_section_id === section.id);
      const linkedEvidence = (evidence?.data || []).filter(e => e.subject_id === syllabus.subject_id);
      
      // Determine status
      let status = 'not_started';
      if (section.completed_at) {
        status = 'completed';
      } else if (linkedEvents.length > 0 || linkedEvidence.length > 0) {
        status = linkedEvents.length > 0 && linkedEvidence.length > 0 ? 'completed' : 'in_progress';
      }
      
      return {
        id: section.id,
        title: section.title || `Unit ${section.position}`,
        order_index: section.position,
        status,
        planner_event_ids: linkedEvents.map(e => e.id),
        evidence_ids: linkedEvidence.map(e => e.id),
        target_date: section.target_date || null, // TODO: Ensure column exists
        completed_at: section.completed_at || null, // TODO: Ensure column exists
        planned_minutes: section.planned_minutes || 0, // TODO: Ensure column exists
        actual_minutes: section.actual_minutes || 0,
      };
    });
    
    const courseData = {
      id: syllabus.id,
      title: syllabus.title || 'Untitled Course',
      provider: 'Custom',
      subject: syllabus.subject?.name || 'Unassigned',
      child_ids: [syllabus.child_id],
      units,
    };
    
    return { data: courseData, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Get notes for children
 * NOTE: notes feature removed - returning empty array
 */
export async function getNotes(familyId, childIds, dateRange, filters = {}) {
  // NOTE: notes feature removed - returning empty array instead of querying database
  // Previously queried notes table, but this is no longer used
  // Check if notes table exists, otherwise use events with source='note'
  try {
    // const startStr = dateRange?.start instanceof Date ? dateRange.start.toISOString() : dateRange?.start;
    // const endStr = dateRange?.end instanceof Date ? dateRange.end.toISOString() : dateRange?.end;
    
    // // Try notes table first
    // let query = supabase
    //   .from('notes')
    //   .select('*')
    //   .eq('family_id', familyId)
    //   .gte('created_at', startStr || '1970-01-01')
    //   .lte('created_at', endStr || '9999-12-31')
    //   .order('created_at', { ascending: false });
    
    // if (childIds && childIds.length > 0) {
    //   query = query.in('child_id', childIds);
    // }
    
    // if (filters?.subject) {
    //   query = query.eq('subject_id', filters.subject);
    // }
    
    // if (filters?.type) {
    //   query = query.eq('type', filters.type);
    // }
    
    // if (filters?.child) {
    //   query = query.eq('child_id', filters.child);
    // }
    
    // const { data, error } = await query;
    
    // // Filter by tag in memory if needed (since tags is JSONB array)
    // let filteredData = data || [];
    // if (filters?.tag && filteredData.length > 0) {
    //   filteredData = filteredData.filter(note => {
    //     if (!note.tags) return false;
    //     const tagsArray = Array.isArray(note.tags) ? note.tags : [note.tags];
    //     return tagsArray.some(t => t && t.trim().toLowerCase() === filters.tag.toLowerCase());
    //   });
    // }
    
    // // If table doesn't exist (PGRST116) or 404, fall back gracefully without logging
    // if (error) {
    //   // PGRST116 = relation does not exist
    //   // Also check for 404/403 status codes (403 = RLS blocking, expected if table exists but user lacks permissions)
    //   if (shouldSuppressError(error) ||
    //       error.code === 'PGRST116' || 
    //       error.message?.includes('does not exist') ||
    //       error.status === 404 ||
    //       error.status === 403 ||
    //       error.message?.includes('404') ||
    //       error.message?.includes('403') ||
    //       error.message?.includes('permission denied') ||
    //       error.message?.includes('row-level security')) {
    //     // Table doesn't exist or RLS blocking - try fallback silently
    //   } else {
    //     // Other error - try fallback but don't log expected errors
    //     if (!shouldSuppressError(error)) {
    //     }
    //   }
    // } else if (data) {
    //   return data;
    // }
    
    // // Fallback to events with source='note'
    // try {
    //   let fallbackQuery = supabase
    //     .from('events')
    //     .select('id, child_id, title, description, start_ts, created_at')
    //     .eq('family_id', familyId)
    //     .eq('source', 'note')
    //     .gte('start_ts', startStr || '1970-01-01')
    //     .lte('start_ts', endStr || '9999-12-31')
    //     .order('start_ts', { ascending: false });
    
    //   if (childIds && childIds.length > 0) {
    //     fallbackQuery = fallbackQuery.in('child_id', childIds);
    //   }
      
    //   const { data: events, error: eventsError } = await fallbackQuery;
      
    //   if (eventsError) {
    //     // Silently return empty array if fallback also fails
    //     return [];
    //   }
      
    //   // Map events to notes format
    //   return (events || []).map(event => ({
    //     id: event.id,
    //     child_id: event.child_id,
    //     text: event.description || event.title,
    //     type: 'log',
    //     created_at: event.created_at || event.start_ts,
    //   }));
    // } catch (fallbackErr) {
    //   // Silently return empty array if fallback fails
    //   return [];
    // }
    return [];
  } catch (error) {
    // Don't log 404s or table-not-found errors
    // if (error?.status !== 404 && error?.code !== 'PGRST116' && !error?.message?.includes('does not exist')) {
    // }
    return [];
  }
}

/**
 * Create note
 * NOTE: notes feature removed - returning error
 */
export async function createNote(payload) {
  // NOTE: notes feature removed - returning error instead of creating note
  // Try API endpoint first
  // try {
  //   const { data, error } = await apiRequest('/api/records/notes', {
  //     method: 'POST',
  //     body: JSON.stringify(payload),
  //   });
    
  //   if (!error && data) {
  //     return { data, error: null };
  //   }
  // } catch (err) {
  //   // Silently fall back if endpoint doesn't exist
  // }
  
  // // Fallback to Supabase
  // try {
  //   // Try notes table first
  //   const insertPayload = {
  //     family_id: payload.family_id,
  //     child_id: payload.child_id,
  //     text: payload.text,
  //     type: payload.type || 'log',
  //   };
    
  //   // Add optional fields if provided
  //   if (payload.subject_id !== undefined) {
  //     insertPayload.subject_id = payload.subject_id;
  //   }
  //   if (payload.linked_evidence_id) {
  //     insertPayload.linked_evidence_id = payload.linked_evidence_id;
  //   }
  //   if (payload.linked_event_id) {
  //     insertPayload.linked_event_id = payload.linked_event_id;
  //   }
  //   if (payload.tags) {
  //     // Store tags as JSON array - ensure it's always an array
  //     insertPayload.tags = Array.isArray(payload.tags) ? payload.tags : (payload.tags ? [payload.tags] : []);
  //   }
  //   if (payload.created_at) {
  //     insertPayload.created_at = payload.created_at;
  //   }
    
  //   const { data, error } = await supabase
  //     .from('notes')
  //     .insert(insertPayload)
  //     .select()
  //     .single();
    
  //   if (error && !shouldSuppressError(error) && error.code !== 'PGRST116') {
  //     throw error;
  //   }
    
  //   if (data) {
  //     return { data, error: null };
  //   }
  return { data: null, error: new Error('Notes feature is disabled') };
    
    // // Fallback to events table
    // const { data: eventData, error: eventError } = await supabase
    //   .from('events')
    //   .insert({
    //     family_id: payload.family_id,
    //     child_id: payload.child_id,
    //     title: 'Note',
    //     description: payload.text,
    //     source: 'note',
    //     status: 'done',
    //     start_ts: payload.created_at || new Date().toISOString(),
    //     end_ts: payload.created_at || new Date().toISOString(),
    //   })
    //   .select()
    //   .single();
    
    // if (eventError) {
    //   return { data: null, error: eventError };
    // }
    // // Map event to note format
    // const noteData = {
    //   id: eventData.id,
    //   child_id: eventData.child_id,
    //   text: eventData.description,
    //   type: payload.type || 'log',
    //   created_at: eventData.created_at || eventData.start_ts,
    // };
    // return { data: noteData, error: null };
  // } catch (error) {
  //   // Don't log expected errors (table doesn't exist)
  //   if (error.code !== 'PGRST116' && !error.message?.includes('does not exist')) {
  //   }
  //   return { data: null, error };
  // }
}

/**
 * Update note
 * NOTE: notes feature removed - returning error
 */
export async function updateNote(noteId, payload) {
  // NOTE: notes feature removed - returning error instead of updating note
  // Try API endpoint first
  // try {
  //   const { data, error } = await apiRequest(`/api/records/notes/${noteId}`, {
  //     method: 'PATCH',
  //     body: JSON.stringify(payload),
  //   });
    
  //   if (!error && data) {
  //     return { data, error: null };
  //   }
  // } catch (err) {
  //   // Silently fall back if endpoint doesn't exist
  // }
  
  // // Fallback to Supabase
  // try {
  //   // Try notes table first
  //   const updatePayload = {};
    
  //   // Only include fields that are provided
  //   if (payload.text !== undefined) updatePayload.text = payload.text;
  //   if (payload.type !== undefined) updatePayload.type = payload.type;
  //   if (payload.subject_id !== undefined) updatePayload.subject_id = payload.subject_id;
  //   if (payload.linked_evidence_id !== undefined) updatePayload.linked_evidence_id = payload.linked_evidence_id;
  //   if (payload.linked_event_id !== undefined) updatePayload.linked_event_id = payload.linked_event_id;
  //   if (payload.tags !== undefined) {
  //     // Store tags as JSON array - ensure it's always an array
  //     updatePayload.tags = Array.isArray(payload.tags) ? payload.tags : (payload.tags ? [payload.tags] : null);
  //   }
    
  //   const { data: updateData, error: updateError } = await supabase
  //     .from('notes')
  //     .update(updatePayload)
  //     .eq('id', noteId)
  //     .select()
  //     .single();
    
  //   if (updateError && !shouldSuppressError(updateError) && updateError.code !== 'PGRST116') {
  //     return { data: null, error: updateError };
  //   }
    
  //   return { data: updateData, error: null };
    
  //   if (data) {
  //     return { data, error: null };
  //   }
    
  //   // Fallback to events table
  //   const eventUpdatePayload = {};
  //   if (payload.text !== undefined) eventUpdatePayload.description = payload.text;
    
  //   const { data: eventData, error: eventError } = await supabase
  //     .from('events')
  //     .update(eventUpdatePayload)
  //     .eq('id', noteId)
  //     .select()
  //     .single();
    
  //   if (eventError) {
  //     return { data: null, error: eventError };
  //   }
  //   // Map event to note format
  //   const noteData = {
  //     id: eventData.id,
  //     child_id: eventData.child_id,
  //     text: eventData.description,
  //     type: payload.type || 'log',
  //     created_at: eventData.created_at || eventData.start_ts,
  //   };
  //   return { data: noteData, error: null };
  // } catch (error) {
  //   // Don't log expected errors
  //   if (error.code !== 'PGRST116' && !error.message?.includes('does not exist')) {
  //   }
  //   return { data: null, error };
  // }
  return { data: null, error: new Error('Notes feature is disabled') };
}

/**
 * Export compliance packet as ZIP
 */
export async function exportCompliancePacket({ familyId, childIds, dateRange }) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { data: null, error: { message: 'Not authenticated' } };
    }
    
    const startStr = dateRange?.start instanceof Date ? dateRange.start.toISOString().split('T')[0] : dateRange?.start;
    const endStr = dateRange?.end instanceof Date ? dateRange.end.toISOString().split('T')[0] : dateRange?.end;
    
    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/records/compliance_packet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        family_id: familyId,
        child_ids: childIds && childIds.length > 0 ? childIds : null,
        date_start: startStr,
        date_end: endStr,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return { data: null, error: { message: errorText || response.statusText, status: response.status } };
    }
    
    const blob = await response.blob();
    return { data: blob, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Delete note
 * NOTE: notes feature removed - returning error
 */
export async function deleteNote(noteId) {
  // NOTE: notes feature removed - returning error instead of deleting note
  // Try API endpoint first
  // try {
  //   const { apiRequest } = await import('../apiClient');
  //   const { data, error } = await apiRequest(`/api/records/notes/${noteId}`, {
  //     method: 'DELETE',
  //   });
    
  //   if (!error) {
  //     return { success: true, data };
  //   }
  // } catch (err) {
  //   // Silently fall back if endpoint doesn't exist
  //   console.log('[deleteNote] API endpoint failed, using direct Supabase:', err);
  // }
  
  // // Fallback to Supabase
  // try {
  //   // Try notes table first
  //   const { error } = await supabase
  //     .from('notes')
  //     .delete()
  //     .eq('id', noteId);
    
  //   if (error && !shouldSuppressError(error) && error.code !== 'PGRST116') {
  //     throw error;
  //   }
    
  //   if (!error) {
  //     return { success: true };
  //   }
    
  //   // Fallback to events table
  //   const { error: eventError } = await supabase
  //     .from('events')
  //     .delete()
  //     .eq('id', noteId)
  //     .eq('source', 'note');
    
  //   if (eventError) throw eventError;
  //   return { success: true };
  // } catch (error) {
  //   return { success: false, error };
  // }
  return { success: false, error: new Error('Notes feature is disabled') };
}

