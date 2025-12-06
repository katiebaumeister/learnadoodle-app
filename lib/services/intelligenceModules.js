/**
 * Intelligence Modules - Data helpers for adaptive right sidebar
 */

/**
 * Get week drift data (planned vs actual minutes)
 */
export async function getWeekDrift(familyId, childIds = []) {
  try {
    const { supabase } = require('../supabase');
    
    // Get current week start (Sunday)
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Sunday
    weekStart.setHours(0, 0, 0, 0);
    
    // Week end (next Sunday)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    
    // Resolve childIds if empty (get all children for family)
    let resolvedChildIds = childIds;
    if (resolvedChildIds.length === 0) {
      const { data: familyChildren } = await supabase
        .from('children')
        .select('id')
        .eq('family_id', familyId);
      
      if (!familyChildren || familyChildren.length === 0) {
        return []; // No children in family
      }
      
      resolvedChildIds = familyChildren.map(c => c.id);
    }
    
    // Get active subject goals with targets
    // Note: subject_goals doesn't have family_id, so we filter by child_id
    // RLS policies ensure users can only see goals for children in their family
    // If RLS blocks access, we'll return empty data gracefully
    const { data: goals, error: goalsError } = await supabase
      .from('subject_goals')
      .select('child_id, subject_id, minutes_per_week')
      .eq('is_active', true)
      .gt('minutes_per_week', 0)
      .in('child_id', resolvedChildIds);
    
    
    if (goalsError) {
      // Silently handle RLS permission errors - this is expected if user doesn't have access
      // Only log non-permission errors for debugging
      if (goalsError.code !== '42501' && goalsError.code !== 'PGRST301') {
        console.warn('Error fetching subject goals:', goalsError);
      }
      return [];
    }
    
    if (!goals || goals.length === 0) {
      return [];
    }
    
    // Get attendance records for this week
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    
    const attendanceQuery = supabase
      .from('attendance_records')
      .select('child_id, event_id, day_date, minutes')
      .eq('family_id', familyId)
      .gte('day_date', weekStartStr)
      .lt('day_date', weekEndStr)
      .in('child_id', resolvedChildIds);
    
    const { data: attendanceRecords, error: attendanceError } = await attendanceQuery;
    
    if (attendanceError) {
      console.warn('Error fetching attendance records:', attendanceError);
      return [];
    }
    
    // Get event IDs to fetch subject information
    const eventIds = [...new Set((attendanceRecords || [])
      .map(r => r.event_id)
      .filter(Boolean))];
    
    if (eventIds.length === 0) {
      // No attendance records, but we still want to show goals that are behind
      const driftData = goals.map(goal => ({
        child_id: goal.child_id,
        subject_id: goal.subject_id,
        subject: goal.subject_id, // Will be replaced with subject name if available
        drift_minutes: -goal.minutes_per_week, // All behind since no actual minutes
        status: 'needs_attention',
        needs_session: true,
      }));
      
      // Try to get subject names
      const subjectIds = [...new Set(goals.map(g => g.subject_id).filter(Boolean))];
      if (subjectIds.length > 0) {
        const { data: subjects } = await supabase
          .from('subject')
          .select('id, name')
          .in('id', subjectIds);
        
        const subjectMap = {};
        (subjects || []).forEach(s => {
          subjectMap[s.id] = s.name;
        });
        
        driftData.forEach(item => {
          item.subject = subjectMap[item.subject_id] || item.subject_id || 'Unknown';
        });
      }
      
      return driftData;
    }
    
    // Fetch events to get subject_id
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, subject_id, child_id')
      .in('id', eventIds);
    
    if (eventsError) {
      console.warn('Error fetching events:', eventsError);
    return [];
    }
    
    // Create event map
    const eventMap = {};
    (events || []).forEach(e => {
      eventMap[e.id] = {
        subject_id: e.subject_id,
        child_id: e.child_id,
      };
    });
    
    // Get subject names
    const subjectIds = [...new Set([
      ...goals.map(g => g.subject_id),
      ...(events || []).map(e => e.subject_id)
    ].filter(Boolean))];
    
    const subjectMap = {};
    if (subjectIds.length > 0) {
      const { data: subjects } = await supabase
        .from('subject')
        .select('id, name')
        .in('id', subjectIds);
      
      (subjects || []).forEach(s => {
        subjectMap[s.id] = s.name;
      });
    }
    
    // Calculate actual minutes per child+subject for the week
    const actualMinutes = {};
    (attendanceRecords || []).forEach(record => {
      const event = eventMap[record.event_id];
      if (!event) return;
      
      const key = `${event.child_id}-${event.subject_id}`;
      if (!actualMinutes[key]) {
        actualMinutes[key] = 0;
      }
      actualMinutes[key] += record.minutes || 0;
    });
    
    // Calculate drift for each goal
    const driftData = [];
    goals.forEach(goal => {
      const key = `${goal.child_id}-${goal.subject_id}`;
      const actual = actualMinutes[key] || 0;
      const target = goal.minutes_per_week || 0;
      const drift = actual - target;
      
      // Determine status
      let status = 'on_track';
      if (drift < -20) {
        status = 'needs_attention';
      } else if (drift < 0) {
        status = 'slightly_behind';
      }
      
      // Determine if needs a session (more than 20 min behind)
      const needsSession = drift < -20;
      
      driftData.push({
        child_id: goal.child_id,
        subject_id: goal.subject_id,
        subject: subjectMap[goal.subject_id] || goal.subject_id || 'Unknown',
        drift_minutes: drift,
        status: status,
        needs_session: needsSession,
      });
    });
    
    // Filter to only show significant drifts (>= 20 min difference or needs attention)
    return driftData.filter(item => 
      Math.abs(item.drift_minutes) >= 20 || item.status === 'needs_attention'
    );
  } catch (err) {
    console.warn('Error computing week drift:', err);
    return [];
  }
}

/**
 * Get micro trends (3-day lookback patterns)
 */
export async function getMicroTrends(familyId, childIds = []) {
  try {
    const { supabase } = require('../supabase');
    
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    threeDaysAgo.setHours(0, 0, 0, 0);
    
    // Get recent attendance records
    let query = supabase
      .from('attendance_records')
      .select('child_id, event_id, day_date')
      .gte('day_date', threeDaysAgo.toISOString().split('T')[0])
      .eq('family_id', familyId)
      .order('day_date', { ascending: false });
    
    if (childIds.length > 0) {
      query = query.in('child_id', childIds);
    }
    
    const { data: recentRecords, error } = await query;
    
    if (error) {
      console.warn('Error fetching attendance records:', error);
      return [];
    }
    
    if (!recentRecords || recentRecords.length === 0) {
      return [];
    }
    
    // Get event IDs and fetch events separately
    const eventIds = [...new Set(recentRecords.map(r => r.event_id).filter(Boolean))];
    if (eventIds.length === 0) {
      return [];
    }
    
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, subject_id, child_id')
      .in('id', eventIds);
    
    if (eventsError) {
      console.warn('Error fetching events:', eventsError);
      return [];
    }
    
    // Get subject IDs and fetch subjects
    const subjectIds = [...new Set((events || []).map(e => e.subject_id).filter(Boolean))];
    const subjectMap = {};
    if (subjectIds.length > 0) {
      const { data: subjects } = await supabase
        .from('subject')
        .select('id, name')
        .in('id', subjectIds);
      
      (subjects || []).forEach(s => {
        subjectMap[s.id] = s.name;
      });
    }
    
    // Get child names
    const childIdsInRecords = [...new Set(recentRecords.map(r => r.child_id))];
    const { data: children } = await supabase
      .from('children')
      // Use first_name only; some databases don't have a generic name column
      .select('id, first_name')
      .in('id', childIdsInRecords);
    
    const childMap = {};
    (children || []).forEach(c => {
      childMap[c.id] = c.first_name || 'Child';
    });
    
    // Create event map
    const eventMap = {};
    (events || []).forEach(e => {
      eventMap[e.id] = {
        subject_id: e.subject_id,
        subject_name: subjectMap[e.subject_id] || 'Unknown',
        child_id: e.child_id,
      };
    });
    
    const trends = [];
    
    // Group by child and subject
    const byChildSubject = {};
    recentRecords.forEach(record => {
      const childId = record.child_id;
      const event = eventMap[record.event_id];
      if (!event) return;
      
      const subjectName = event.subject_name;
      const childName = childMap[childId] || 'Child';
      
      const key = `${childId}-${subjectName}`;
      if (!byChildSubject[key]) {
        byChildSubject[key] = {
          child_id: childId,
          child_name: childName,
          subject: subjectName,
          count: 0,
        };
      }
      byChildSubject[key].count++;
    });
    
    // Find meaningful patterns
    Object.values(byChildSubject).forEach(item => {
      if (item.count >= 3) {
        trends.push({
          child_name: item.child_name,
          type: 'interest_spike',
          message: `has logged ${item.count} ${item.subject} sessions in a row — interest spike`,
        });
      }
    });
    
    return trends.slice(0, 3);
  } catch (err) {
    console.warn('Error computing micro trends:', err);
    return [];
  }
}

/**
 * Get energy forecast based on schedule density and child preferences
 */
export function getEnergyForecast(learningEvents = [], children = []) {
  try {
    const forecasts = [];
    
    // Group events by child
    const eventsByChild = {};
    learningEvents.forEach(event => {
      const childId = event.child_id;
      if (!eventsByChild[childId]) {
        eventsByChild[childId] = [];
      }
      eventsByChild[childId].push(event);
    });
    
    // Analyze each child's day
    Object.entries(eventsByChild).forEach(([childId, events]) => {
      const child = children.find(c => c.id === childId);
      if (!child) return;
      
      const childName = child.first_name || child.name || 'Child';
      const eventCount = events.length;
      
      // Calculate total minutes
      const totalMinutes = events.reduce((sum, ev) => {
        const start = new Date(ev.start_ts || ev.start_local);
        const end = new Date(ev.end_ts || ev.end_local);
        return sum + Math.round((end.getTime() - start.getTime()) / 60000);
      }, 0);
      
      // Determine if heavy
      if (eventCount >= 4 || totalMinutes >= 240) {
        forecasts.push({
          child_name: childName,
          type: 'heavy',
          message: `Today is heavy for ${childName} — add short breaks`,
        });
      } else if (eventCount <= 2 && totalMinutes < 120) {
        // Light afternoon check (simplified)
        const afternoonEvents = events.filter(ev => {
          const hour = new Date(ev.start_ts || ev.start_local).getHours();
          return hour >= 12;
        });
        
        if (afternoonEvents.length === 0) {
          forecasts.push({
            child_name: childName,
            type: 'light',
            message: `${childName}'s afternoon is light — great for creative work`,
          });
        }
      }
    });
    
    return forecasts.slice(0, 2);
  } catch (err) {
    console.warn('Error computing energy forecast:', err);
    return [];
  }
}

