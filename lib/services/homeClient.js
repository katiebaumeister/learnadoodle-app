/**
 * Home Client - Centralized data layer for Home screen
 * Aggregates data from Records, Intelligence, and Planner
 */
import { supabase } from '../supabase';
import { getAttendanceLogs, getEvidence, getNotes } from './recordsClient';
import { apiRequest } from '../apiClient';

/**
 * Get today's summary - aggregates next events, attendance, missing logs, missing evidence
 */
export async function getTodaySummary(familyId, date, childIds) {
  const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
  const today = new Date(dateStr);
  const weekStart = getWeekStart(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  try {
    // Get next events from planner (today and upcoming)
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, title, start_ts, end_ts, child_id, subject_id, status')
      .eq('family_id', familyId)
      .gte('start_ts', today.toISOString())
      .in('status', ['scheduled', 'in_progress'])
      .is('deleted_at', null) // Exclude soft-deleted events
      .order('start_ts', { ascending: true })
      .limit(10);
    
    // Get attendance for this week
    const attendanceLogs = childIds && childIds.length > 0
      ? await getAttendanceLogs(familyId, childIds, { start: weekStart, end: weekEnd }).catch(() => [])
      : [];
    
    // Calculate attendance status
    const attendanceByDay = {};
    attendanceLogs.forEach(log => {
      const day = log.day_date;
      if (!attendanceByDay[day]) {
        attendanceByDay[day] = { minutes: 0, logs: [] };
      }
      attendanceByDay[day].minutes += log.minutes || 0;
      attendanceByDay[day].logs.push(log);
    });
    
    // Get missing logs (days this week without attendance)
    const missingLogs = [];
    for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().split('T')[0];
      if (dayStr < dateStr && !attendanceByDay[dayStr]) {
        missingLogs.push(dayStr);
      }
    }
    
    // Get missing evidence summary
    const evidence = childIds && childIds.length > 0
      ? await getEvidence(familyId, childIds, {}, { start: weekStart, end: weekEnd }).catch(() => [])
      : [];
    
    // Group evidence by child and subject to find gaps
    const evidenceByChild = {};
    childIds.forEach(childId => {
      evidenceByChild[childId] = {
        total: evidence.filter(e => e.child_id === childId).length,
        bySubject: {},
      };
    });
    
    return {
      nextEvents: events || [],
      attendanceStatus: {
        thisWeek: {
          totalMinutes: attendanceLogs.reduce((sum, log) => sum + (log.minutes || 0), 0),
          totalDays: Object.keys(attendanceByDay).length,
          byDay: attendanceByDay,
        },
        missingLogs,
      },
      missingEvidence: {
        total: evidence.length,
        byChild: evidenceByChild,
      },
      date: dateStr,
    };
  } catch (error) {
    return {
      nextEvents: [],
      attendanceStatus: { thisWeek: { totalMinutes: 0, totalDays: 0, byDay: {} }, missingLogs: [] },
      missingEvidence: { total: 0, byChild: {} },
      date: dateStr,
    };
  }
}

/**
 * Get today's insights from IntelligenceHub
 */
export async function getTodayInsights(familyId, date, childIds) {
  const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
  
  try {
    const params = new URLSearchParams({
      family_id: familyId,
      timeframe: 'today',
      date: dateStr,
    });
    
    if (childIds && childIds.length > 0) {
      childIds.forEach(id => params.append('child_ids', id));
    }
    
    const { data, error } = await apiRequest(`/api/insights?${params.toString()}`, {
      method: 'GET',
    });
    
    // Silently return empty array for any error (404, network errors, CORS, etc.)
    // This allows the app to work even when backend is not available
    if (error) {
      return [];
    }
    
    if (data) {
      return data.insights || [];
    }
  } catch (err) {
    // Silently fall back for any error (network, CORS, etc.)
    // Don't log - these are expected when backend is not running
  }
  
  // Fallback: return empty insights
  return [];
}

/**
 * Get missing evidence summary
 */
export async function getMissingEvidenceSummary(familyId, childIds, dateRange) {
  try {
    const evidence = await getEvidence(familyId, childIds, {}, dateRange).catch(() => []);
    
    // Group by child and subject
    const byChild = {};
    childIds.forEach(childId => {
      const childEvidence = evidence.filter(e => e.child_id === childId);
      byChild[childId] = {
        total: childEvidence.length,
        bySubject: {},
      };
      
      childEvidence.forEach(e => {
        const subjectId = e.subject_id || 'unassigned';
        if (!byChild[childId].bySubject[subjectId]) {
          byChild[childId].bySubject[subjectId] = 0;
        }
        byChild[childId].bySubject[subjectId]++;
      });
    });
    
    return {
      byChild,
      total: evidence.length,
    };
  } catch (error) {
    return { byChild: {}, total: 0 };
  }
}

/**
 * Get attendance status for week
 */
export async function getAttendanceStatusForWeek(familyId, childIds, weekStart) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  try {
    const logs = await getAttendanceLogs(familyId, childIds, { start: weekStart, end: weekEnd }).catch(() => []);
    
    const totalMinutes = logs.reduce((sum, log) => sum + (log.minutes || 0), 0);
    const daysWithLogs = new Set(logs.map(log => log.day_date)).size;
    const targetMinutes = 1800; // 30 hours/week target
    
    return {
      totalMinutes,
      totalHours: Math.floor(totalMinutes / 60),
      daysWithLogs,
      onTrack: totalMinutes >= targetMinutes * 0.8, // 80% of target
      targetMinutes,
    };
  } catch (error) {
    return {
      totalMinutes: 0,
      totalHours: 0,
      daysWithLogs: 0,
      onTrack: false,
      targetMinutes: 1800,
    };
  }
}

/**
 * Get multi-day summary for yesterday, today, tomorrow
 */
export async function getMultiDaySummary(familyId, dates, childIds) {
  // dates: array of ISO date strings [yesterday, today, tomorrow]
  // childIds: 'all' or string[]
  const resolvedChildIds = childIds === 'all' 
    ? null // Will be resolved per date
    : (Array.isArray(childIds) ? childIds : []);
  
  const results = await Promise.all(
    dates.map(async (dateStr) => {
      const date = new Date(dateStr);
      const dateChildIds = resolvedChildIds || await getAllChildIdsForFamily(familyId);
      
      try {
        const [summary, insights] = await Promise.all([
          getTodaySummary(familyId, date, dateChildIds).catch(() => ({
            nextEvents: [],
            attendanceStatus: { thisWeek: { totalMinutes: 0, totalDays: 0, byDay: {} }, missingLogs: [] },
            missingEvidence: { total: 0, byChild: {} },
            date: dateStr,
          })),
          getTodayInsights(familyId, date, dateChildIds).catch(() => []),
        ]);
        
        // Get schedule summary
        const scheduleSummary = {
          hasEvents: summary.nextEvents?.length > 0,
          firstEventTime: summary.nextEvents?.[0]?.start_ts || null,
          totalMinutes: summary.nextEvents?.reduce((sum, e) => {
            if (e.start_ts && e.end_ts) {
              const start = new Date(e.start_ts);
              const end = new Date(e.end_ts);
              return sum + Math.max(0, (end - start) / 60000);
            }
            return sum;
          }, 0) || 0,
        };
        
        // Enhance insights with "why" explanations
        const insightsWithWhy = insights.map(insight => ({
          ...insight,
          why: insight.why || deriveInsightWhy(insight, summary),
        }));
        
        return {
          date: dateStr,
          scheduleSummary,
          attendanceStatus: summary.attendanceStatus || { status: 'unknown', minutesLogged: 0 },
          insights: insightsWithWhy,
          missingEvidence: summary.missingEvidence || { count: 0, subjects: [] },
        };
      } catch (error) {
        return {
          date: dateStr,
          scheduleSummary: { hasEvents: false, firstEventTime: null, totalMinutes: 0 },
          attendanceStatus: { status: 'error', minutesLogged: 0 },
          insights: [],
          missingEvidence: { count: 0, subjects: [] },
        };
      }
    })
  );
  
  return results;
}

/**
 * Helper: Get all child IDs for a family
 */
async function getAllChildIdsForFamily(familyId) {
  try {
    const { data, error } = await supabase
      .from('children')
      .select('id')
      .eq('family_id', familyId)
      .eq('archived', false);
    
    if (error) throw error;
    return (data || []).map(c => c.id);
  } catch (error) {
    return [];
  }
}

/**
 * Get home tiles summary (missing logs, portfolio suggestions, areas of mastery, reflection prompts)
 */
export async function getHomeTilesSummary(familyId, date, childIds) {
  const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
  const today = new Date(dateStr);
  const weekStart = getWeekStart(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  const resolvedChildIds = childIds === 'all' 
    ? await getAllChildIdsForFamily(familyId)
    : (Array.isArray(childIds) ? childIds : []);
  
  try {
    // Missing logs summary
    const attendanceLogs = resolvedChildIds.length > 0
      ? await getAttendanceLogs(familyId, resolvedChildIds, { start: weekStart, end: weekEnd }).catch(() => [])
      : [];
    
    const attendanceByDay = {};
    attendanceLogs.forEach(log => {
      const day = log.day_date;
      if (!attendanceByDay[day]) {
        attendanceByDay[day] = { minutes: 0, logs: [] };
      }
      attendanceByDay[day].minutes += log.minutes || 0;
      attendanceByDay[day].logs.push(log);
    });
    
    const missingLogsByChild = {};
    resolvedChildIds.forEach(childId => {
      const childLogs = attendanceLogs.filter(log => log.child_id === childId);
      const childDays = new Set(childLogs.map(log => log.day_date));
      const expectedDays = [];
      for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
        const dayStr = d.toISOString().split('T')[0];
        if (dayStr < dateStr && !childDays.has(dayStr)) {
          expectedDays.push(dayStr);
        }
      }
      
      if (expectedDays.length > 0) {
        missingLogsByChild[childId] = {
          missingCount: expectedDays.length,
          subjects: [], // Could be enhanced to check subject-specific requirements
        };
      }
    });
    
    const missingLogs = {
      totalMissingLogs: Object.values(missingLogsByChild).reduce((sum, c) => sum + c.missingCount, 0),
      byChild: Object.entries(missingLogsByChild).map(([childId, data]) => ({
        childId,
        ...data,
      })),
    };
    
    // Portfolio suggestions
    const evidence = resolvedChildIds.length > 0
      ? await getEvidence(familyId, resolvedChildIds, {}, { start: weekStart, end: weekEnd }).catch(() => [])
      : [];
    
    const ungroupedByChild = {};
    resolvedChildIds.forEach(childId => {
      const childEvidence = evidence.filter(e => e.child_id === childId);
      const untagged = childEvidence.filter(e => !e.subject_id || !e.tags || e.tags.length === 0);
      const noNotes = childEvidence.filter(e => {
        // Check if evidence has linked notes
        return true; // Simplified - would need to check notes table
      });
      
      if (untagged.length > 0 || noNotes.length > 0) {
        ungroupedByChild[childId] = {
          count: Math.max(untagged.length, noNotes.length),
        };
      }
    });
    
    const portfolioSuggestions = {
      totalUngrouped: Object.values(ungroupedByChild).reduce((sum, c) => sum + c.count, 0),
      byChild: Object.entries(ungroupedByChild).map(([childId, data]) => ({
        childId,
        ...data,
      })),
    };
    
    // Areas of mastery (simplified - would use Intelligence/Analytics data)
    const areasOfMastery = {
      byChild: resolvedChildIds.map(childId => ({
        childId,
        subjects: [], // TODO: Query Intelligence/Analytics for top-performing subjects
      })),
    };
    
    // Today's reflection prompt
    const notes = resolvedChildIds.length > 0
      ? await getNotes(familyId, resolvedChildIds, { start: weekStart, end: weekEnd }).catch(() => [])
      : [];
    
    const reflectionPrompts = {
      byChild: resolvedChildIds.map(childId => {
        const childNotes = notes.filter(n => n.child_id === childId);
        const recentSubjects = new Set(childNotes.map(n => n.subject).filter(Boolean));
        
        // Generate prompt based on recent activity
        let prompt = "What did you learn today?";
        if (recentSubjects.size > 0) {
          const subjectsList = Array.from(recentSubjects).slice(0, 2).join(' and ');
          prompt = `How did ${subjectsList} go today?`;
        }
        
        return {
          childId,
          prompt,
        };
      }),
    };
    
    return {
      missingLogs,
      portfolioSuggestions,
      areasOfMastery,
      reflectionPrompts,
    };
  } catch (error) {
    return {
      missingLogs: { totalMissingLogs: 0, byChild: [] },
      portfolioSuggestions: { totalUngrouped: 0, byChild: [] },
      areasOfMastery: { byChild: [] },
      reflectionPrompts: { byChild: [] },
    };
  }
}

/**
 * Helper: Derive "why" explanation for an insight
 */
function deriveInsightWhy(insight, summary) {
  const title = insight.title || insight.summary || '';
  const body = insight.body || insight.text || '';
  const combined = `${title} ${body}`.toLowerCase();
  
  if (combined.includes('attendance') || combined.includes('minutes') || combined.includes('hours')) {
    const minutes = summary.attendanceStatus?.thisWeek?.totalMinutes || 0;
    const target = 1800; // 30 hours/week
    if (minutes < target * 0.8) {
      return `Based on low minutes logged this week (${Math.round(minutes / 60)} hours vs target of ${target / 60} hours).`;
    }
    return `Based on attendance patterns this week.`;
  }
  
  if (combined.includes('evidence') || combined.includes('portfolio') || combined.includes('missing')) {
    const missingCount = summary.missingEvidence?.total || 0;
    return `Based on ${missingCount} evidence items in the date range.`;
  }
  
  if (combined.includes('backlog') || combined.includes('unfinished') || combined.includes('pending')) {
    return `Based on unfinished tasks or events in your planner.`;
  }
  
  return `Based on your learning data and patterns.`;
}

/**
 * Helper: Get week start (Monday)
 */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

