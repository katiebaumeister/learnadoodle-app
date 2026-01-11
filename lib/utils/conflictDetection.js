/**
 * Conflict Detection Utility
 * Detects scheduling conflicts after drag-and-drop operations
 */

/**
 * Detect conflicts for a moved event
 * @param {Object} movedEvent - The event that was moved
 * @param {Array} allEvents - All events for the same child/day
 * @returns {number} - Count of conflicting events
 */
export function detectConflicts(movedEvent, allEvents) {
  if (!movedEvent || !allEvents || !Array.isArray(allEvents)) {
    return 0;
  }

  const movedStart = new Date(movedEvent.start_ts || movedEvent.start);
  const movedEnd = new Date(movedEvent.end_ts || movedEvent.end);
  const movedChildId = movedEvent.child_id;
  const movedEventId = movedEvent.id;

  if (!movedStart || !movedEnd || isNaN(movedStart.getTime()) || isNaN(movedEnd.getTime())) {
    return 0;
  }

  // Filter events for same child, same day, excluding canceled/deleted
  const sameDayEvents = allEvents.filter(event => {
    if (!event || !event.start_ts && !event.start) return false;
    if (event.id === movedEventId) return false; // Don't count the moved event itself
    if (event.child_id !== movedChildId) return false; // Must be same child
    
    // Check if same day
    const eventStart = new Date(event.start_ts || event.start);
    const movedDate = movedStart.toISOString().split('T')[0];
    const eventDate = eventStart.toISOString().split('T')[0];
    if (movedDate !== eventDate) return false;
    
    // Exclude canceled/deleted events
    if (event.status === 'canceled' || event.canceled_at || event.deleted_at) return false;
    
    return true;
  });

  // Check for overlaps using the same logic as Quick Reschedule
  let conflictCount = 0;
  for (const event of sameDayEvents) {
    const eventStart = new Date(event.start_ts || event.start);
    const eventEnd = new Date(event.end_ts || event.end);
    
    if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime())) continue;
    
    // Overlap detection: event1_start < event2_end && event2_start < event1_end
    if (movedStart < eventEnd && eventStart < movedEnd) {
      conflictCount++;
    }
  }

  return conflictCount;
}




