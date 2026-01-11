/**
 * Conflict Detection Engine
 * Detects scheduling conflicts in calendar events
 */

/**
 * @typedef {Object} Conflict
 * @property {string} conflict_id - Unique identifier for the conflict
 * @property {string} date - Date string (YYYY-MM-DD)
 * @property {'overlap'} type - Type of conflict
 * @property {string[]} child_ids - Child IDs involved in the conflict
 * @property {string[]} event_ids - Event IDs involved in the conflict
 * @property {{start_at: string, end_at: string}} window - Time window of overlap
 * @property {'high'|'med'|'low'} severity - Severity level
 * @property {string} reason - Human-readable explanation
 */

/**
 * Normalize event to have consistent structure
 */
function normalizeEvent(event) {
  // Handle various event structures from different sources
  const startAt = event.start_ts || event.start_at || event.start || event.data?.start_ts || event.data?.start_at;
  const endAt = event.end_ts || event.end_at || event.end || event.data?.end_ts || event.data?.end_at;
  
  // Get child_ids - could be single child_id or array
  let childIds = [];
  if (event.child_ids && Array.isArray(event.child_ids)) {
    childIds = event.child_ids;
  } else if (event.child_id) {
    childIds = [event.child_id];
  } else if (event.data?.child_id) {
    childIds = [event.data.child_id];
  } else if (event.assignee) {
    childIds = [event.assignee];
  } else if (event.assignees && Array.isArray(event.assignees)) {
    childIds = event.assignees;
  }
  
  // Determine if event is fixed or flexible
  const isFixed = event.is_fixed || event.data?.is_fixed || event.event_type === 'Fixed Class' || event.event_type === 'Appointment';
  const isFlexible = event.is_flexible || event.data?.is_flexible || event.event_type === 'Task' || event.event_type === 'Work Block';
  
  // Get priority
  const priority = event.priority || event.data?.priority || 'med';
  
  return {
    id: event.id || event.data?.id,
    title: event.title || event.data?.title || 'Untitled',
    start_at: startAt,
    end_at: endAt,
    child_ids: childIds,
    is_fixed: isFixed,
    is_flexible: isFlexible !== false && !isFixed, // Default to flexible if not explicitly fixed
    priority: priority,
    subject_tag: event.subject_tag || event.data?.subject_tag || event.subject_id || event.data?.subject_id,
    source: event.source || event.data?.source || 'user',
    status: event.status || event.data?.status || 'scheduled',
    duration_minutes: event.duration_minutes || event.data?.duration_minutes || 
      (startAt && endAt ? Math.round((new Date(endAt) - new Date(startAt)) / (1000 * 60)) : 0),
    shared_class_id: event.shared_class_id || event.data?.shared_class_id,
  };
}

/**
 * Check if two time ranges overlap
 */
function timeRangesOverlap(start1, end1, start2, end2) {
  const s1 = new Date(start1).getTime();
  const e1 = new Date(end1).getTime();
  const s2 = new Date(start2).getTime();
  const e2 = new Date(end2).getTime();
  
  return s1 < e2 && s2 < e1;
}

/**
 * Expand multi-child events so each child has a view
 */
function expandEventsForChildren(events) {
  const expanded = [];
  
  events.forEach(event => {
    if (event.child_ids && event.child_ids.length > 0) {
      // Create a copy for each child
      event.child_ids.forEach(childId => {
        expanded.push({
          ...event,
          child_ids: [childId], // Single child per expanded event
        });
      });
    } else {
      // Event with no child_ids - skip or handle as family event
      expanded.push(event);
    }
  });
  
  return expanded;
}

/**
 * Detect conflicts in events
 * @param {Object[]} events - Array of events
 * @param {Object} options - Detection options
 * @param {string[]} options.childIds - Child IDs to check (null = all)
 * @param {string} options.rangeStart - Start date (ISO string)
 * @param {string} options.rangeEnd - End date (ISO string)
 * @param {string} options.tz - Timezone (optional)
 * @returns {Conflict[]} Array of detected conflicts
 */
export function detectConflicts(events, options = {}) {
  const { childIds = null, rangeStart, rangeEnd, tz } = options;
  
  // Normalize and filter events
  let normalizedEvents = events.map(normalizeEvent).filter(e => e.id && e.start_at && e.end_at);
  
  // Filter by date range
  if (rangeStart) {
    const rangeStartTime = new Date(rangeStart).getTime();
    normalizedEvents = normalizedEvents.filter(e => new Date(e.end_at).getTime() >= rangeStartTime);
  }
  if (rangeEnd) {
    const rangeEndTime = new Date(rangeEnd).getTime();
    normalizedEvents = normalizedEvents.filter(e => new Date(e.start_at).getTime() <= rangeEndTime);
  }
  
  // Filter by child IDs if specified
  if (childIds && childIds.length > 0) {
    normalizedEvents = normalizedEvents.filter(e => 
      e.child_ids.some(cid => childIds.includes(cid))
    );
  }
  
  // Expand multi-child events
  const expandedEvents = expandEventsForChildren(normalizedEvents);
  
  // Group events by child and date
  const eventsByChildAndDate = {};
  
  expandedEvents.forEach(event => {
    event.child_ids.forEach(childId => {
      const dateKey = new Date(event.start_at).toISOString().split('T')[0];
      const key = `${childId}_${dateKey}`;
      
      if (!eventsByChildAndDate[key]) {
        eventsByChildAndDate[key] = [];
      }
      
      eventsByChildAndDate[key].push({
        ...event,
        child_ids: [childId],
      });
    });
  });
  
  // Detect conflicts
  const conflicts = [];
  const conflictIds = new Set(); // Track conflicts to avoid duplicates
  
  Object.entries(eventsByChildAndDate).forEach(([key, dayEvents]) => {
    const [childId, date] = key.split('_');
    
    // Sort events by start time
    const sortedEvents = [...dayEvents].sort((a, b) => 
      new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
    
    // Check each pair of events for overlap
    for (let i = 0; i < sortedEvents.length; i++) {
      for (let j = i + 1; j < sortedEvents.length; j++) {
        const event1 = sortedEvents[i];
        const event2 = sortedEvents[j];
        
        // Skip if events don't overlap
        if (!timeRangesOverlap(event1.start_at, event1.end_at, event2.start_at, event2.end_at)) {
          continue;
        }
        
        // Calculate overlap window
        const overlapStart = new Date(Math.max(
          new Date(event1.start_at).getTime(),
          new Date(event2.start_at).getTime()
        )).toISOString();
        const overlapEnd = new Date(Math.min(
          new Date(event1.end_at).getTime(),
          new Date(event2.end_at).getTime()
        )).toISOString();
        
        // Determine severity
        let severity = 'med';
        let reason = 'Two events overlap';
        
        if (event1.is_fixed && event2.is_fixed) {
          severity = 'high';
          reason = 'Two fixed events overlap (cannot be moved)';
        } else if (event1.is_fixed || event2.is_fixed) {
          severity = 'high';
          reason = 'Fixed event overlaps with flexible event';
        } else {
          severity = 'med';
          reason = 'Two flexible events overlap';
        }
        
        // Create conflict ID
        const conflictId = `conflict_${event1.id}_${event2.id}_${date}`;
        
        if (!conflictIds.has(conflictId)) {
          conflictIds.add(conflictId);
          
          conflicts.push({
            conflict_id: conflictId,
            date: date,
            type: 'overlap',
            child_ids: [childId],
            event_ids: [event1.id, event2.id],
            window: {
              start_at: overlapStart,
              end_at: overlapEnd,
            },
            severity: severity,
            reason: reason,
          });
        }
      }
    }
  });
  
  // Also check for shared class conflicts
  // If a shared class event overlaps with another event for any participating child
  const sharedClassEvents = normalizedEvents.filter(e => e.shared_class_id);
  
  sharedClassEvents.forEach(sharedEvent => {
    const sharedChildIds = sharedEvent.child_ids || [];
    
    normalizedEvents.forEach(otherEvent => {
      // Skip if same event or if other event is also the same shared class
      if (otherEvent.id === sharedEvent.id || 
          (otherEvent.shared_class_id && otherEvent.shared_class_id === sharedEvent.shared_class_id)) {
        return;
      }
      
      // Check overlap
      if (!timeRangesOverlap(sharedEvent.start_at, sharedEvent.end_at, otherEvent.start_at, otherEvent.end_at)) {
        return;
      }
      
      // Check if any child is involved in both
      const commonChildIds = sharedChildIds.filter(cid => 
        otherEvent.child_ids && otherEvent.child_ids.includes(cid)
      );
      
      if (commonChildIds.length === 0) {
        return;
      }
      
      // Create conflict for each common child
      commonChildIds.forEach(childId => {
        const date = new Date(sharedEvent.start_at).toISOString().split('T')[0];
        const conflictId = `conflict_shared_${sharedEvent.id}_${otherEvent.id}_${childId}_${date}`;
        
        if (!conflictIds.has(conflictId)) {
          conflictIds.add(conflictId);
          
          const overlapStart = new Date(Math.max(
            new Date(sharedEvent.start_at).getTime(),
            new Date(otherEvent.start_at).getTime()
          )).toISOString();
          const overlapEnd = new Date(Math.min(
            new Date(sharedEvent.end_at).getTime(),
            new Date(otherEvent.end_at).getTime()
          )).toISOString();
          
          let severity = 'high';
          let reason = 'Shared class event overlaps with another event';
          
          if (sharedEvent.is_fixed || otherEvent.is_fixed) {
            severity = 'high';
            reason = 'Shared class overlaps with fixed event';
          }
          
          conflicts.push({
            conflict_id: conflictId,
            date: date,
            type: 'overlap',
            child_ids: [childId],
            event_ids: [sharedEvent.id, otherEvent.id],
            window: {
              start_at: overlapStart,
              end_at: overlapEnd,
            },
            severity: severity,
            reason: reason,
          });
        }
      });
    });
  });
  
  return conflicts;
}





