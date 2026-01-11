/**
 * Export Client Service
 * Handles all export operations (PDF, CSV, etc.)
 */
import { supabase } from '../supabase';

// Get API base URL
const getAPIBase = () => {
  if (typeof window !== 'undefined') {
    return process.env.REACT_APP_API_URL || window.location.origin;
  }
  return process.env.REACT_APP_API_URL || '';
};

/**
 * Export weekly plan
 */
export async function exportWeeklyPlan(childId, weekStart, weekEnd, format = 'pdf') {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/exports/weekly-plan`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        child_id: childId,
        week_start: weekStart instanceof Date ? weekStart.toISOString().split('T')[0] : weekStart,
        week_end: weekEnd instanceof Date ? weekEnd.toISOString().split('T')[0] : weekEnd,
        format: format,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weekly_plan_${weekStart}_${weekEnd}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Export daily printout
 */
export async function exportDailyPrintout(childId, date, format = 'pdf') {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/exports/daily-printout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        child_id: childId,
        date: date instanceof Date ? date.toISOString().split('T')[0] : date,
        format: format,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily_printout_${date}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Export substitute teacher packet
 */
export async function exportSubstitutePacket(childIds, date, includeNotes = true, includeMaterials = true) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/exports/substitute-packet`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        child_ids: childIds,
        date: date instanceof Date ? date.toISOString().split('T')[0] : date,
        include_notes: includeNotes,
        include_materials: includeMaterials,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `substitute_packet_${date}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Export portfolio book
 */
export async function exportPortfolioBook(childId, dateRangeStart, dateRangeEnd, options = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/exports/portfolio-book`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        child_id: childId,
        date_range_start: dateRangeStart instanceof Date ? dateRangeStart.toISOString().split('T')[0] : dateRangeStart,
        date_range_end: dateRangeEnd instanceof Date ? dateRangeEnd.toISOString().split('T')[0] : dateRangeEnd,
        include_evidence: options.includeEvidence !== false,
        include_grades: options.includeGrades !== false,
        include_attendance: options.includeAttendance !== false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio_book_${dateRangeStart}_${dateRangeEnd}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Export year-end summary
 */
export async function exportYearEndSummary(childId, academicYearStart, academicYearEnd, summaryType = 'comprehensive') {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/exports/year-end-summary`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        child_id: childId,
        academic_year_start: academicYearStart instanceof Date ? academicYearStart.toISOString().split('T')[0] : academicYearStart,
        academic_year_end: academicYearEnd instanceof Date ? academicYearEnd.toISOString().split('T')[0] : academicYearEnd,
        summary_type: summaryType,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `year_end_summary_${academicYearStart.year}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Export enhanced transcript
 */
export async function exportTranscriptEnhanced(childId, rangeStart, rangeEnd, gpaType = 'unweighted', format = 'pdf') {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const params = new URLSearchParams({
      child_id: childId,
      range_start: rangeStart instanceof Date ? rangeStart.toISOString().split('T')[0] : rangeStart,
      range_end: rangeEnd instanceof Date ? rangeEnd.toISOString().split('T')[0] : rangeEnd,
      gpa_type: gpaType,
      format: format,
    });

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/exports/transcript-enhanced?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript_${rangeStart}_${rangeEnd}.${format === 'pdf' ? 'pdf' : 'csv'}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Export formatted attendance log
 */
export async function exportAttendanceLog(childId, rangeStart, rangeEnd, format = 'pdf') {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const params = new URLSearchParams({
      child_id: childId,
      range_start: rangeStart instanceof Date ? rangeStart.toISOString().split('T')[0] : rangeStart,
      range_end: rangeEnd instanceof Date ? rangeEnd.toISOString().split('T')[0] : rangeEnd,
      format: format,
    });

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/exports/attendance-log?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_log_${rangeStart}_${rangeEnd}.${format === 'pdf' ? 'pdf' : 'csv'}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Export skill map
 */
export async function exportSkillMap(childId, subjectId = null, format = 'pdf') {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/exports/skill-map`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        child_id: childId,
        subject_id: subjectId,
        format: format,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skill_map.${format === 'pdf' ? 'pdf' : 'csv'}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Export curriculum plan
 */
export async function exportCurriculumPlan(childId, subjectId = null, dateRangeStart = null, dateRangeEnd = null) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const body = {
      child_id: childId,
    };
    if (subjectId) body.subject_id = subjectId;
    if (dateRangeStart) {
      body.date_range_start = dateRangeStart instanceof Date ? dateRangeStart.toISOString().split('T')[0] : dateRangeStart;
    }
    if (dateRangeEnd) {
      body.date_range_end = dateRangeEnd instanceof Date ? dateRangeEnd.toISOString().split('T')[0] : dateRangeEnd;
    }

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/exports/curriculum-plan`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `curriculum_plan.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Export personalized progress report
 */
export async function exportProgressReport(childId, dateRangeStart, dateRangeEnd, includeDetails = true) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/exports/progress-report`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        child_id: childId,
        date_range_start: dateRangeStart instanceof Date ? dateRangeStart.toISOString().split('T')[0] : dateRangeStart,
        date_range_end: dateRangeEnd instanceof Date ? dateRangeEnd.toISOString().split('T')[0] : dateRangeEnd,
        include_details: includeDetails,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `progress_report_${dateRangeStart}_${dateRangeEnd}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Export caregiver/tutor packet
 */
export async function exportCaregiverPacket(childId, dateRangeStart, dateRangeEnd, options = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/exports/caregiver-packet`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        child_id: childId,
        date_range_start: dateRangeStart instanceof Date ? dateRangeStart.toISOString().split('T')[0] : dateRangeStart,
        date_range_end: dateRangeEnd instanceof Date ? dateRangeEnd.toISOString().split('T')[0] : dateRangeEnd,
        include_schedule: options.includeSchedule !== false,
        include_progress: options.includeProgress !== false,
        include_materials: options.includeMaterials !== false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caregiver_packet_${dateRangeStart}_${dateRangeEnd}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

