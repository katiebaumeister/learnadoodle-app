// AI-powered scheduling service with packing algorithm
import { supabase } from './supabase';

export class PlannerService {
  /**
   * Generate a preview of scheduled events for a child over a date range
   * @param {Object} params - Planning parameters
   * @param {string} params.childId - Child ID
   * @param {string} params.familyId - Family ID
   * @param {string} params.fromDate - Start date (YYYY-MM-DD)
   * @param {string} params.toDate - End date (YYYY-MM-DD)
   * @param {Array} params.goals - Array of subject goals
   * @param {Object} params.constraints - Additional constraints
   * @returns {Object} Proposal with events and metadata
   */
  async generateProposal(params) {
    const { childId, familyId, fromDate, toDate, goals, constraints = {} } = params;
    
    try {
      // 1. Get availability data
      const availability = await this.getAvailability(childId, fromDate, toDate);
      
      // 2. Get existing events
      const existingEvents = await this.getExistingEvents(childId, fromDate, toDate);
      
      // 3. Generate proposal ID
      const proposalId = this.generateProposalId();
      
      // 4. Run packing algorithm
      const scheduledEvents = await this.packEvents({
        availability,
        goals,
        constraints,
        existingEvents,
        childId,
        familyId
      });
      
      // 5. Calculate metadata
      const metadata = this.calculateProposalMetadata(scheduledEvents, goals);
      
      return {
        proposal_id: proposalId,
        events: scheduledEvents,
        metadata,
        generated_at: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Error generating proposal:', error);
      throw new Error('Failed to generate scheduling proposal');
    }
  }
  
  /**
   * Get availability data for a child
   */
  async getAvailability(childId, fromDate, toDate) {
    const { data, error } = await supabase
      .rpc('get_child_availability', {
        p_child_id: childId,
        p_from_date: fromDate,
        p_to_date: toDate
      });
    
    if (error) throw error;
    return data || [];
  }
  
  /**
   * Get existing events for a child
   */
  async getExistingEvents(childId, fromDate, toDate) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('child_id', childId)
      .eq('status', 'scheduled')
      .gte('start_ts', `${fromDate}T00:00:00`)
      .lte('start_ts', `${toDate}T23:59:59`);
    
    if (error) throw error;
    return data || [];
  }
  
  /**
   * Generate unique proposal ID
   */
  generateProposalId() {
    return `proposal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Pack events into available time slots using greedy algorithm
   */
  async packEvents({ availability, goals, constraints, existingEvents, childId, familyId }) {
    const scheduledEvents = [];
    const availableDays = availability.filter(day => day.day_status === 'teach');
    
    // Sort goals by priority (longer sessions first for better packing)
    const sortedGoals = [...goals].sort((a, b) => {
      // Primary sort by duration (longer first)
      if (b.minutes !== a.minutes) return b.minutes - a.minutes;
      // Secondary sort by minimum block size (larger first)
      return b.min_block - a.min_block;
    });
    
    for (const goal of sortedGoals) {
      const remainingMinutes = goal.minutes;
      let scheduledMinutes = 0;
      
      // Try to schedule this goal across available days
      for (const day of availableDays) {
        if (scheduledMinutes >= remainingMinutes) break;
        
        const dayEvents = await this.scheduleGoalForDay({
          goal,
          day,
          scheduledMinutes,
          remainingMinutes,
          existingEvents,
          scheduledEvents,
          childId,
          familyId,
          constraints
        });
        
        scheduledEvents.push(...dayEvents);
        scheduledMinutes += dayEvents.reduce((sum, event) => 
          sum + (new Date(event.end_ts) - new Date(event.start_ts)) / (1000 * 60), 0
        );
      }
    }
    
    return scheduledEvents;
  }
  
  /**
   * Schedule a goal for a specific day
   */
  async scheduleGoalForDay({ goal, day, scheduledMinutes, remainingMinutes, existingEvents, scheduledEvents, childId, familyId, constraints }) {
    const dayEvents = [];
    const remainingForGoal = remainingMinutes - scheduledMinutes;
    const availableSlots = await this.findAvailableSlots(day, existingEvents, scheduledEvents);
    
    for (const slot of availableSlots) {
      if (remainingForGoal <= 0) break;
      
      const slotDuration = (new Date(slot.end) - new Date(slot.start)) / (1000 * 60);
      const eventDuration = Math.min(slotDuration, remainingForGoal, goal.max_block || goal.min_block * 2);
      
      // Ensure minimum block size
      if (eventDuration < goal.min_block) continue;
      
      // Check for subject spread constraints
      if (constraints.spread_same_subject && this.hasRecentSameSubject(scheduledEvents, goal.subject_id)) {
        continue;
      }
      
      const event = {
        id: this.generateEventId(),
        child_id: childId,
        family_id: familyId,
        subject_id: goal.subject_id,
        title: this.generateEventTitle(goal.subject_id, eventDuration),
        start_ts: slot.start,
        end_ts: new Date(new Date(slot.start).getTime() + eventDuration * 60000).toISOString(),
        status: 'scheduled',
        source: 'ai',
        rationale: this.generateRationale(goal, day, slot, eventDuration),
        proposal_id: null, // Will be set when proposal is committed
        duration_minutes: eventDuration
      };
      
      dayEvents.push(event);
      remainingForGoal -= eventDuration;
    }
    
    return dayEvents;
  }
  
  /**
   * Find available time slots for a day
   */
  async findAvailableSlots(day, existingEvents, scheduledEvents) {
    const slots = [];
    const dayDate = day.date;
    
    if (day.day_status !== 'teach' || !day.start_time || !day.end_time) {
      return slots;
    }
    
    const startTime = new Date(`${dayDate}T${day.start_time}:00`);
    const endTime = new Date(`${dayDate}T${day.end_time}:00`);
    
    // Get all existing events for this day
    const allEvents = [
      ...existingEvents.filter(event => event.start_ts.split('T')[0] === dayDate),
      ...scheduledEvents.filter(event => event.start_ts.split('T')[0] === dayDate)
    ];
    
    // Sort events by start time
    allEvents.sort((a, b) => new Date(a.start_ts) - new Date(b.start_ts));
    
    let currentTime = startTime;
    
    for (const event of allEvents) {
      const eventStart = new Date(event.start_ts);
      const eventEnd = new Date(event.end_ts);
      
      // If there's a gap before this event, add it as a slot
      if (eventStart > currentTime) {
        slots.push({
          start: currentTime.toISOString(),
          end: eventStart.toISOString(),
          duration: (eventStart - currentTime) / (1000 * 60)
        });
      }
      
      currentTime = new Date(Math.max(currentTime.getTime(), eventEnd.getTime()));
    }
    
    // Add final slot if there's time left
    if (currentTime < endTime) {
      slots.push({
        start: currentTime.toISOString(),
        end: endTime.toISOString(),
        duration: (endTime - currentTime) / (1000 * 60)
      });
    }
    
    return slots;
  }
  
  /**
   * Check if there's a recent event of the same subject
   */
  hasRecentSameSubject(scheduledEvents, subjectId) {
    const recentEvents = scheduledEvents
      .filter(event => event.subject_id === subjectId)
      .slice(-2); // Check last 2 events
    
    if (recentEvents.length === 0) return false;
    
    const lastEvent = recentEvents[recentEvents.length - 1];
    const timeSinceLastEvent = Date.now() - new Date(lastEvent.start_ts).getTime();
    
    // Consider "recent" if within 2 hours
    return timeSinceLastEvent < 2 * 60 * 60 * 1000;
  }
  
  /**
   * Generate event title
   */
  generateEventTitle(subjectId, durationMinutes) {
    const durationText = durationMinutes >= 60 
      ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
      : `${durationMinutes}m`;
    
    return `${subjectId} Session (${durationText})`;
  }
  
  /**
   * Generate rationale for why this time was chosen
   */
  generateRationale(goal, day, slot, duration) {
    const reasons = [];
    
    // Time-based reasons
    const hour = new Date(slot.start).getHours();
    if (hour >= 9 && hour <= 11) {
      reasons.push('morning focus time');
    } else if (hour >= 14 && hour <= 16) {
      reasons.push('afternoon learning time');
    }
    
    // Duration-based reasons
    if (duration >= goal.min_block * 1.5) {
      reasons.push('extended session for deeper learning');
    } else if (duration === goal.min_block) {
      reasons.push('focused session');
    }
    
    // Day-based reasons
    const dayOfWeek = new Date(day.date).getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      reasons.push('weekday routine');
    }
    
    return reasons.length > 0 
      ? `Scheduled during ${reasons.join(', ')}`
      : 'Optimal time slot based on availability';
  }
  
  /**
   * Generate unique event ID
   */
  generateEventId() {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Calculate proposal metadata
   */
  calculateProposalMetadata(scheduledEvents, goals) {
    const totalScheduled = scheduledEvents.reduce((sum, event) => sum + event.duration_minutes, 0);
    const totalRequested = goals.reduce((sum, goal) => sum + goal.minutes, 0);
    
    const subjectCoverage = {};
    goals.forEach(goal => {
      const scheduled = scheduledEvents
        .filter(event => event.subject_id === goal.subject_id)
        .reduce((sum, event) => sum + event.duration_minutes, 0);
      
      subjectCoverage[goal.subject_id] = {
        requested: goal.minutes,
        scheduled,
        percentage: Math.round((scheduled / goal.minutes) * 100)
      };
    });
    
    return {
      total_requested_minutes: totalRequested,
      total_scheduled_minutes: totalScheduled,
      coverage_percentage: Math.round((totalScheduled / totalRequested) * 100),
      subject_coverage: subjectCoverage,
      event_count: scheduledEvents.length
    };
  }
  
  /**
   * Commit a proposal to the database
   */
  async commitProposal(proposalId, eventsToCommit, childId, familyId) {
    try {
      const events = eventsToCommit.map(event => ({
        ...event,
        proposal_id: proposalId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
      
      const { data, error } = await supabase
        .from('events')
        .insert(events)
        .select();
      
      if (error) throw error;
      
      return {
        success: true,
        committed_events: data,
        committed_count: data.length
      };
      
    } catch (error) {
      console.error('Error committing proposal:', error);
      throw new Error('Failed to commit scheduling proposal');
    }
  }
  
  /**
   * Update an existing event (for rescheduling)
   */
  async updateEvent(eventId, updates) {
    try {
      const { data, error } = await supabase
        .from('events')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', eventId)
        .select();
      
      if (error) throw error;
      
      return data[0];
      
    } catch (error) {
      console.error('Error updating event:', error);
      throw new Error('Failed to update event');
    }
  }
  
  /**
   * Delete an event
   */
  async deleteEvent(eventId) {
    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);
      
      if (error) throw error;
      
      return { success: true };
      
    } catch (error) {
      console.error('Error deleting event:', error);
      throw new Error('Failed to delete event');
    }
  }
}

// Export singleton instance
export const plannerService = new PlannerService();
