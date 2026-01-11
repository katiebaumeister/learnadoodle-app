/**
 * Resolution Proposal Generator
 * Generates proposals to resolve scheduling conflicts
 */

/**
 * @typedef {Object} Proposal
 * @property {'move'|'split'|'flag'} type - Type of proposal
 * @property {string} event_id - Event ID to modify
 * @property {{start_at: string, end_at: string}} [from] - Original time (for move/split)
 * @property {{start_at: string, end_at: string}} [to] - New time (for move)
 * @property {{start_at: string, end_at: string}[]} [parts] - Split parts (for split)
 * @property {string} rationale - Human-readable explanation
 * @property {string[]} affected_child_ids - Child IDs affected
 */

/**
 * @typedef {Object} ResolutionPlan
 * @property {string} plan_id - Unique plan identifier
 * @property {Object[]} conflicts - Conflicts being resolved
 * @property {Proposal[]} proposals - Proposed resolutions
 * @property {{moved_count: number, split_count: number, unresolved_count: number}} stats - Statistics
 */

/**
 * Find available gaps in a day for a given child
 */
function findGaps(events, childId, date, constraints = {}) {
  const { schoolHoursStart = '08:00', schoolHoursEnd = '16:00', allowSpillover = false } = constraints;
  
  // Filter events for this child on this date
  const dayEvents = events.filter(e => {
    const eventDate = new Date(e.start_at).toISOString().split('T')[0];
    return eventDate === date && 
           e.child_ids && 
           e.child_ids.includes(childId) &&
           !e.deleted_at;
  });
  
  // Sort by start time
  const sortedEvents = [...dayEvents].sort((a, b) => 
    new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );
  
  const gaps = [];
  const dateObj = new Date(date);
  const [startHour, startMin] = schoolHoursStart.split(':').map(Number);
  const [endHour, endMin] = schoolHoursEnd.split(':').map(Number);
  
  const dayStart = new Date(dateObj);
  dayStart.setHours(startHour, startMin, 0, 0);
  
  const dayEnd = new Date(dateObj);
  dayEnd.setHours(endHour, endMin, 0, 0);
  
  // Gap from start of day to first event
  if (sortedEvents.length > 0) {
    const firstEventStart = new Date(sortedEvents[0].start_at);
    if (firstEventStart > dayStart) {
      gaps.push({
        start_at: dayStart.toISOString(),
        end_at: firstEventStart.toISOString(),
        duration_minutes: Math.round((firstEventStart - dayStart) / (1000 * 60)),
      });
    }
  } else {
    // No events - entire day is available
    gaps.push({
      start_at: dayStart.toISOString(),
      end_at: dayEnd.toISOString(),
      duration_minutes: Math.round((dayEnd - dayStart) / (1000 * 60)),
    });
  }
  
  // Gaps between events
  for (let i = 0; i < sortedEvents.length - 1; i++) {
    const event1End = new Date(sortedEvents[i].end_at);
    const event2Start = new Date(sortedEvents[i + 1].start_at);
    
    if (event2Start > event1End) {
      gaps.push({
        start_at: event1End.toISOString(),
        end_at: event2Start.toISOString(),
        duration_minutes: Math.round((event2Start - event1End) / (1000 * 60)),
      });
    }
  }
  
  // Gap from last event to end of day
  if (sortedEvents.length > 0) {
    const lastEventEnd = new Date(sortedEvents[sortedEvents.length - 1].end_at);
    if (lastEventEnd < dayEnd) {
      gaps.push({
        start_at: lastEventEnd.toISOString(),
        end_at: dayEnd.toISOString(),
        duration_minutes: Math.round((dayEnd - lastEventEnd) / (1000 * 60)),
      });
    }
  }
  
  return gaps.filter(g => g.duration_minutes >= 15); // Minimum 15-minute gaps
}

/**
 * Round time to nearest 15-minute increment
 */
function roundTo15Minutes(date) {
  const d = new Date(date);
  const minutes = d.getMinutes();
  const roundedMinutes = Math.round(minutes / 15) * 15;
  d.setMinutes(roundedMinutes);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
}

/**
 * Find best gap for moving an event
 */
function findBestGap(gaps, durationMinutes, originalStart, sameDayOnly = true) {
  // Sort gaps by proximity to original start time
  const sortedGaps = [...gaps].sort((a, b) => {
    const aDist = Math.abs(new Date(a.start_at) - new Date(originalStart));
    const bDist = Math.abs(new Date(b.start_at) - new Date(originalStart));
    return aDist - bDist;
  });
  
  // Find first gap that fits
  for (const gap of sortedGaps) {
    if (gap.duration_minutes >= durationMinutes) {
      const gapStart = roundTo15Minutes(new Date(gap.start_at));
      const gapEnd = new Date(gapStart);
      gapEnd.setMinutes(gapEnd.getMinutes() + durationMinutes);
      
      // Check if gap end is within gap bounds
      if (gapEnd <= new Date(gap.end_at)) {
        return {
          start_at: gapStart.toISOString(),
          end_at: gapEnd.toISOString(),
        };
      }
    }
  }
  
  return null;
}

/**
 * Propose resolutions for conflicts
 * @param {Object[]} conflicts - Array of conflicts
 * @param {Object[]} events - Array of all events
 * @param {Object} constraints - Resolution constraints
 * @returns {ResolutionPlan} Resolution plan
 */
export function proposeResolutions(conflicts, events, constraints = {}) {
  const {
    allowSpillover = false,
    allowSplitting = true,
    maxSplits = 2,
    schoolHoursStart = '08:00',
    schoolHoursEnd = '16:00',
  } = constraints;
  
  const proposals = [];
  const resolvedConflictIds = new Set();
  const eventSplitCounts = {}; // Track how many times each event has been split
  
  // Normalize events
  const normalizedEvents = events.map(e => ({
    ...e,
    id: e.id || e.data?.id,
    start_at: e.start_ts || e.start_at || e.data?.start_ts || e.data?.start_at,
    end_at: e.end_ts || e.end_at || e.data?.end_ts || e.data?.end_at,
    child_ids: e.child_ids || (e.child_id ? [e.child_id] : []) || (e.data?.child_id ? [e.data.child_id] : []),
    is_fixed: e.is_fixed || e.data?.is_fixed || false,
    is_flexible: e.is_flexible !== false && !(e.is_fixed || e.data?.is_fixed),
    priority: e.priority || e.data?.priority || 'med',
    duration_minutes: e.duration_minutes || e.data?.duration_minutes || 
      (e.start_at && e.end_at ? Math.round((new Date(e.end_at) - new Date(e.start_at)) / (1000 * 60)) : 0),
  })).filter(e => e.id && e.start_at && e.end_at);
  
  // Process each conflict
  conflicts.forEach(conflict => {
    if (resolvedConflictIds.has(conflict.conflict_id)) {
      return;
    }
    
    const [eventId1, eventId2] = conflict.event_ids;
    const event1 = normalizedEvents.find(e => e.id === eventId1);
    const event2 = normalizedEvents.find(e => e.id === eventId2);
    
    if (!event1 || !event2) {
      return;
    }
    
    // Determine which event to move (prefer flexible, lower priority)
    let eventToMove = null;
    let fixedEvent = null;
    
    if (event1.is_fixed && !event2.is_fixed) {
      fixedEvent = event1;
      eventToMove = event2;
    } else if (event2.is_fixed && !event1.is_fixed) {
      fixedEvent = event2;
      eventToMove = event1;
    } else if (!event1.is_fixed && !event2.is_fixed) {
      // Both flexible - move lower priority or first one
      if (event1.priority === 'low' || (event1.priority === 'med' && event2.priority !== 'low')) {
        eventToMove = event1;
      } else {
        eventToMove = event2;
      }
    } else {
      // Both fixed - cannot resolve automatically
      proposals.push({
        type: 'flag',
        conflict_id: conflict.conflict_id,
        message: `Cannot resolve: Two fixed events overlap (${event1.title} and ${event2.title})`,
        affected_child_ids: conflict.child_ids,
      });
      resolvedConflictIds.add(conflict.conflict_id);
      return;
    }
    
    if (!eventToMove || eventToMove.is_fixed) {
      proposals.push({
        type: 'flag',
        conflict_id: conflict.conflict_id,
        message: `Cannot resolve: No flexible event to move`,
        affected_child_ids: conflict.child_ids,
      });
      resolvedConflictIds.add(conflict.conflict_id);
      return;
    }
    
    // Try to find a gap to move the event to
    const childId = conflict.child_ids[0];
    const date = conflict.date;
    const durationMinutes = eventToMove.duration_minutes || 
      Math.round((new Date(eventToMove.end_at) - new Date(eventToMove.start_at)) / (1000 * 60));
    
    // Get all events for this child (excluding the one we're moving)
    const otherEvents = normalizedEvents.filter(e => 
      e.id !== eventToMove.id &&
      e.child_ids &&
      e.child_ids.includes(childId) &&
      !e.deleted_at
    );
    
    // Find gaps
    const gaps = findGaps(otherEvents, childId, date, {
      schoolHoursStart,
      schoolHoursEnd,
      allowSpillover,
    });
    
    // Try same day first
    const sameDayGap = findBestGap(gaps, durationMinutes, eventToMove.start_at, true);
    
    if (sameDayGap) {
      proposals.push({
        type: 'move',
        event_id: eventToMove.id,
        from: {
          start_at: eventToMove.start_at,
          end_at: eventToMove.end_at,
        },
        to: sameDayGap,
        rationale: `Move "${eventToMove.title}" to avoid conflict with ${event2.id === eventToMove.id ? event1.title : event2.title}`,
        affected_child_ids: [childId],
      });
      resolvedConflictIds.add(conflict.conflict_id);
      return;
    }
    
    // If no same-day gap and splitting is allowed, try splitting
    if (allowSplitting && (!eventSplitCounts[eventToMove.id] || eventSplitCounts[eventToMove.id] < maxSplits)) {
      // Find two gaps that together can fit the duration
      const sortedGaps = [...gaps].sort((a, b) => b.duration_minutes - a.duration_minutes);
      
      if (sortedGaps.length >= 2) {
        const gap1 = sortedGaps[0];
        const gap2 = sortedGaps[1];
        
        const totalAvailable = gap1.duration_minutes + gap2.duration_minutes;
        
        if (totalAvailable >= durationMinutes) {
          // Split into two parts
          const part1Duration = Math.min(gap1.duration_minutes, Math.ceil(durationMinutes / 2));
          const part2Duration = durationMinutes - part1Duration;
          
          if (part2Duration <= gap2.duration_minutes) {
            const part1Start = roundTo15Minutes(new Date(gap1.start_at));
            const part1End = new Date(part1Start);
            part1End.setMinutes(part1End.getMinutes() + part1Duration);
            
            const part2Start = roundTo15Minutes(new Date(gap2.start_at));
            const part2End = new Date(part2Start);
            part2End.setMinutes(part2End.getMinutes() + part2Duration);
            
            eventSplitCounts[eventToMove.id] = (eventSplitCounts[eventToMove.id] || 0) + 1;
            
            proposals.push({
              type: 'split',
              event_id: eventToMove.id,
              from: {
                start_at: eventToMove.start_at,
                end_at: eventToMove.end_at,
              },
              parts: [
                { start_at: part1Start.toISOString(), end_at: part1End.toISOString() },
                { start_at: part2Start.toISOString(), end_at: part2End.toISOString() },
              ],
              rationale: `Split "${eventToMove.title}" into two parts to fit available gaps`,
              affected_child_ids: [childId],
            });
            resolvedConflictIds.add(conflict.conflict_id);
            return;
          }
        }
      }
    }
    
    // If allowSpillover, try next day
    if (allowSpillover) {
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDateStr = nextDate.toISOString().split('T')[0];
      
      const nextDayGaps = findGaps(otherEvents, childId, nextDateStr, {
        schoolHoursStart,
        schoolHoursEnd,
        allowSpillover,
      });
      
      const nextDayGap = findBestGap(nextDayGaps, durationMinutes, eventToMove.start_at, false);
      
      if (nextDayGap) {
        proposals.push({
          type: 'move',
          event_id: eventToMove.id,
          from: {
            start_at: eventToMove.start_at,
            end_at: eventToMove.end_at,
          },
          to: nextDayGap,
          rationale: `Move "${eventToMove.title}" to next day to avoid conflict`,
          affected_child_ids: [childId],
        });
        resolvedConflictIds.add(conflict.conflict_id);
        return;
      }
    }
    
    // Cannot resolve
    proposals.push({
      type: 'flag',
      conflict_id: conflict.conflict_id,
      message: `Cannot automatically resolve: No available slot for "${eventToMove.title}"`,
      affected_child_ids: [childId],
    });
    resolvedConflictIds.add(conflict.conflict_id);
  });
  
  // Calculate stats
  const stats = {
    moved_count: proposals.filter(p => p.type === 'move').length,
    split_count: proposals.filter(p => p.type === 'split').length,
    unresolved_count: proposals.filter(p => p.type === 'flag').length,
  };
  
  return {
    plan_id: `plan_${Date.now()}`,
    conflicts: conflicts,
    proposals: proposals,
    stats: stats,
  };
}





