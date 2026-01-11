/**
 * Child Overview Client - Aggregates data from Planner, Records, and Intelligence
 * for the Child Overview dashboard
 */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { 
  getAttendanceLogs, 
  getEvidence, 
  getNotes,
  getAttendanceTimeline,
  getPortfolioUploads,
} from './recordsClient';
import { getInsights } from '../apiClient';

/**
 * Get week start (Monday)
 */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

/**
 * Calculate streak from attendance records
 */
async function calculateStreak(childId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get attendance records ordered by date descending
    const { data: records, error } = await supabase
      .from('attendance_records')
      .select('day_date')
      .eq('child_id', childId)
      .order('day_date', { ascending: false })
      .limit(30);
    
    if (error || !records || records.length === 0) {
      return 0;
    }
    
    // Calculate streak
    let streak = 0;
    let currentDate = new Date(today);
    
    for (const record of records) {
      const recordDate = new Date(record.day_date);
      recordDate.setHours(0, 0, 0, 0);
      
      const daysDiff = Math.floor((currentDate - recordDate) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === streak) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }
    
    return streak;
  } catch (error) {
    return 0;
  }
}

/**
 * Get today's events for a child
 */
async function getTodaysEvents(familyId, childId, date) {
  const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
  const startOfDay = `${dateStr}T00:00:00`;
  const endOfDay = `${dateStr}T23:59:59`;
  
  try {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, start_ts, end_ts, subject_id, status, subject:subject_id (id, name)')
      .eq('family_id', familyId)
      .eq('child_id', childId)
      .gte('start_ts', startOfDay)
      .lte('start_ts', endOfDay)
      .in('status', ['scheduled', 'in_progress', 'done'])
      .order('start_ts', { ascending: true });
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    return [];
  }
}

/**
 * Get upcoming key dates (important events like projects, exams, etc.)
 */
async function getUpcomingKeyDates(familyId, childId, date, limit = 5) {
  const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
  const startOfDay = `${dateStr}T00:00:00`;
  
  try {
    // Get events marked as important or with specific labels
    // For now, we'll get upcoming scheduled events
    const { data, error } = await supabase
      .from('events')
      .select('id, title, start_ts, end_ts, subject_id, status, description, subject:subject_id (id, name)')
      .eq('family_id', familyId)
      .eq('child_id', childId)
      .gte('start_ts', startOfDay)
      .in('status', ['scheduled', 'planned'])
      .order('start_ts', { ascending: true })
      .limit(limit);
    
    if (error) throw error;
    
    // Filter and label important events
    return (data || []).map(event => {
      const eventDate = new Date(event.start_ts);
      const label = inferEventLabel(event.title, event.description);
      
      return {
        ...event,
        date: eventDate,
        label,
      };
    });
  } catch (error) {
    return [];
  }
}

/**
 * Infer event label from title/description
 */
function inferEventLabel(title, description) {
  const text = `${title} ${description || ''}`.toLowerCase();
  
  if (text.includes('exam') || text.includes('test') || text.includes('quiz') || text.includes('assessment')) {
    return 'Assessment';
  }
  if (text.includes('project') || text.includes('assignment')) {
    return 'Project due';
  }
  if (text.includes('field trip') || text.includes('trip')) {
    return 'Field trip';
  }
  if (text.includes('presentation')) {
    return 'Presentation';
  }
  
  return 'Event';
}

/**
 * Get subject status for the week
 */
function calculateSubjectStatus(attendanceLogs, events) {
  const subjectMinutes = {};
  const subjectTargets = {};
  
  // Calculate logged minutes per subject from attendance
  attendanceLogs.forEach(log => {
    if (log.event_id) {
      const event = events.find(e => e.id === log.event_id);
      if (event && event.subject_id) {
        const subjectId = event.subject_id;
        subjectMinutes[subjectId] = (subjectMinutes[subjectId] || 0) + (log.minutes || 0);
      }
    }
  });
  
  // Calculate planned minutes per subject from events
  events.forEach(event => {
    if (event.subject_id && event.start_ts && event.end_ts) {
      const start = new Date(event.start_ts);
      const end = new Date(event.end_ts);
      const minutes = Math.round((end - start) / (1000 * 60));
      
      const subjectId = event.subject_id;
      subjectTargets[subjectId] = (subjectTargets[subjectId] || 0) + minutes;
    }
  });
  
  // Determine status for each subject
  const subjectStatus = [];
  const allSubjectIds = new Set([
    ...Object.keys(subjectMinutes),
    ...Object.keys(subjectTargets),
  ]);
  
  allSubjectIds.forEach(subjectId => {
    const logged = subjectMinutes[subjectId] || 0;
    const planned = subjectTargets[subjectId] || 0;
    
    let status = 'on_track';
    if (planned > 0) {
      const ratio = logged / planned;
      if (ratio < 0.7) {
        status = 'at_risk';
      } else if (ratio < 0.9) {
        status = 'slightly_behind';
      }
    }
    
    subjectStatus.push({
      subject_id: subjectId,
      status,
      logged_minutes: logged,
      planned_minutes: planned,
    });
  });
  
  return subjectStatus;
}

/**
 * Main hook for Child Overview
 */
export function useChildOverview({ familyId, childId, date }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  
  const today = useMemo(() => {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [date]);
  
  const weekStart = useMemo(() => getWeekStart(today), [today]);
  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return end;
  }, [weekStart]);
  
  useEffect(() => {
    if (!familyId || !childId) {
      setLoading(false);
      return;
    }
    
    let cancelled = false;
    
    async function loadData() {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch all data in parallel
        const [
          streakDays,
          todaysEvents,
          upcomingKeyDates,
          weekAttendanceLogs,
          weekEvents,
          portfolioEvidence,
          recentNotes,
          insightsData,
        ] = await Promise.all([
          calculateStreak(childId).catch(() => 0),
          getTodaysEvents(familyId, childId, today).catch(() => []),
          getUpcomingKeyDates(familyId, childId, today, 5).catch(() => []),
          getAttendanceLogs(familyId, [childId], { start: weekStart, end: weekEnd }).catch(() => []),
          // Get week events for subject status calculation
          supabase
            .from('events')
            .select('id, start_ts, end_ts, subject_id, child_id, subject:subject_id (id, name)')
            .eq('family_id', familyId)
            .eq('child_id', childId)
            .gte('start_ts', weekStart.toISOString())
            .lte('start_ts', weekEnd.toISOString())
            .then(({ data, error }) => {
              if (error) throw error;
              return data || [];
            })
            .catch(() => []),
          getEvidence(familyId, [childId], {}, { start: weekStart, end: weekEnd })
            .then(evidence => evidence.slice(0, 3))
            .catch(() => []),
          getNotes(familyId, [childId], { start: weekStart, end: weekEnd })
            .then(notes => notes.slice(0, 3))
            .catch((err) => {
              // Suppress expected 404 errors
              if (!shouldSuppressError(err)) {
              }
              return [];
            }),
          getInsights(familyId, [childId], { start: weekStart, end: weekEnd })
            .then(({ data, error }) => {
              if (error) return [];
              return data || [];
            })
            .catch(() => []),
        ]);
        
        if (cancelled) return;
        
        // Calculate today's minutes
        const todayStr = today.toISOString().split('T')[0];
        const todayLogs = weekAttendanceLogs.filter(log => log.day_date === todayStr);
        const minutesToday = todayLogs.reduce((sum, log) => sum + (log.minutes || 0), 0);
        
        // Calculate planned minutes for today
        const todayEventsMinutes = todaysEvents.reduce((sum, event) => {
          if (event.start_ts && event.end_ts) {
            const start = new Date(event.start_ts);
            const end = new Date(event.end_ts);
            return sum + Math.round((end - start) / (1000 * 60));
          }
          return sum;
        }, 0);
        
        // Get next event
        const nextEvent = todaysEvents.find(e => 
          e.status === 'scheduled' || e.status === 'in_progress'
        ) || null;
        
        // Calculate week attendance status
        const weekMinutes = weekAttendanceLogs.reduce((sum, log) => sum + (log.minutes || 0), 0);
        const weekPlannedMinutes = weekEvents.reduce((sum, event) => {
          if (event.start_ts && event.end_ts) {
            const start = new Date(event.start_ts);
            const end = new Date(event.end_ts);
            return sum + Math.round((end - start) / (1000 * 60));
          }
          return sum;
        }, 0);
        
        const attendanceRatio = weekPlannedMinutes > 0 ? weekMinutes / weekPlannedMinutes : 1;
        let attendanceStatus = 'on_track';
        if (attendanceRatio < 0.7) {
          attendanceStatus = 'at_risk';
        } else if (attendanceRatio < 0.9) {
          attendanceStatus = 'slightly_behind';
        }
        
        // Get subject status
        const subjectStatus = calculateSubjectStatus(weekAttendanceLogs, weekEvents);
        
        // Fetch subject names for subject status
        const subjectIds = [...new Set(subjectStatus.map(s => s.subject_id).filter(Boolean))];
        const subjectNames = {};
        if (subjectIds.length > 0) {
          try {
            const { data: subjects } = await supabase
              .from('subject')
              .select('id, name')
              .in('id', subjectIds);
            
            if (subjects) {
              subjects.forEach(s => {
                subjectNames[s.id] = s.name;
              });
            }
          } catch (err) {
          }
        }
        
        // Get primary insight
        const primaryInsight = insightsData.length > 0 
          ? insightsData[0].description || insightsData[0].title || null
          : null;
        
        // Get days logged
        const daysLogged = new Set(weekAttendanceLogs.map(log => log.day_date)).size;
        const daysTarget = 5; // Target 5 days per week
        
        const result = {
          today: {
            streakDays,
            minutesToday,
            minutesTarget: todayEventsMinutes,
            nextEvent: nextEvent ? {
              title: nextEvent.title,
              start: nextEvent.start_ts,
              end: nextEvent.end_ts,
              subject: nextEvent.subject?.name || null,
            } : null,
          },
          week: {
            attendanceStatus,
            attendanceMinutes: weekMinutes,
            plannedMinutes: weekPlannedMinutes,
            subjectStatus: subjectStatus.map(s => ({
              subject_id: s.subject_id,
              subject: s.subject_id ? (subjectNames[s.subject_id] || 'Unassigned') : 'Unassigned',
              status: s.status,
              logged_minutes: s.logged_minutes,
              planned_minutes: s.planned_minutes,
            })),
          },
          portfolio: {
            recentEvidence: portfolioEvidence.map(e => ({
              id: e.id,
              type: e.mime?.startsWith('image/') ? 'photo' : e.mime === 'application/pdf' ? 'pdf' : 'file',
              subject_id: e.subject_id,
              caption: e.caption || 'Untitled',
              created_at: e.created_at,
            })),
          },
          attendance: {
            daysLogged,
            daysTarget,
          },
          notes: {
            recentNotes: recentNotes.map(n => ({
              id: n.id,
              text: n.text || n.description || '',
              created_at: n.created_at,
              type: n.type || 'log',
            })),
          },
          insights: {
            primaryInsight,
            additional: insightsData.slice(1, 3).map(i => ({
              title: i.title,
              description: i.description || i.message,
              type: i.type,
            })),
          },
          planner: {
            todaysQuests: todaysEvents.map(e => ({
              id: e.id,
              title: e.title,
              start: e.start_ts,
              end: e.end_ts,
              subject: e.subject?.name || null,
              status: e.status,
            })),
            upcomingKeyDates: upcomingKeyDates,
          },
        };
        
        setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load overview data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    
    loadData();
    
    return () => {
      cancelled = true;
    };
  }, [familyId, childId, today, weekStart, weekEnd]);
  
  return {
    loading,
    error,
    ...(data || {
      today: { streakDays: 0, minutesToday: 0, minutesTarget: 0, nextEvent: null },
      week: { attendanceStatus: 'on_track', attendanceMinutes: 0, plannedMinutes: 0, subjectStatus: [] },
      portfolio: { recentEvidence: [] },
      attendance: { daysLogged: 0, daysTarget: 5 },
      notes: { recentNotes: [] },
      insights: { primaryInsight: null, additional: [] },
      planner: { todaysQuests: [], upcomingKeyDates: [] },
    }),
  };
}

