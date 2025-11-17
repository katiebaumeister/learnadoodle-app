import { supabase } from './supabase';

/**
 * AI-powered rescheduling service that respects family schedule rules
 * and constraints when suggesting new times for events.
 */
class AIReschedulingService {
  constructor() {
    this.familyId = null;
    this.familyTimezone = 'UTC';
  }

  /**
   * Initialize the service with family context
   */
  async initialize(familyId) {
    this.familyId = familyId;
    
    // Get family timezone
    const { data: family } = await supabase
      .from('family')
      .select('timezone')
      .eq('id', familyId)
      .single();
    
    if (family?.timezone) {
      this.familyTimezone = family.timezone;
    }
  }

  /**
   * Find available time slots for a child on a given date
   * considering all schedule rules and existing events
   */
  async findAvailableSlots(childId, date, durationMinutes = 60) {
    try {
      // Get all applicable rules for the child and family
      const rules = await this.getApplicableRules(childId, date);
      
      // Get all overrides for the date
      const overrides = await this.getApplicableOverrides(childId, date);
      
      // Get existing events for the date
      const existingEvents = await this.getExistingEvents(childId, date);
      
      // Calculate available time slots
      const availableSlots = this.calculateAvailableSlots(
        rules,
        overrides,
        existingEvents,
        durationMinutes
      );
      
      return availableSlots;
    } catch (error) {
      console.error('Error finding available slots:', error);
      return [];
    }
  }

  /**
   * Suggest rescheduling options for a canceled or conflicting event
   */
  async suggestRescheduling(eventId, reason = 'conflict') {
    try {
      // Get the event details
      const { data: event } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (!event) {
        throw new Error('Event not found');
      }

      const originalDate = new Date(event.start_ts);
      const duration = new Date(event.end_ts) - new Date(event.start_ts);
      const durationMinutes = Math.floor(duration / (1000 * 60));

      // Find alternatives for the same day
      const sameDaySlots = await this.findAvailableSlots(
        event.child_id,
        originalDate.toISOString().split('T')[0],
        durationMinutes
      );

      // Find alternatives for the next few days
      const alternativeDates = [];
      for (let i = 1; i <= 7; i++) {
        const nextDate = new Date(originalDate);
        nextDate.setDate(nextDate.getDate() + i);
        
        const slots = await this.findAvailableSlots(
          event.child_id,
          nextDate.toISOString().split('T')[0],
          durationMinutes
        );
        
        if (slots.length > 0) {
          alternativeDates.push({
            date: nextDate.toISOString().split('T')[0],
            slots: slots
          });
        }
      }

      return {
        originalEvent: event,
        reason: reason,
        sameDayAlternatives: sameDaySlots.filter(slot => 
          slot.start !== event.start_ts
        ),
        alternativeDates: alternativeDates,
        recommendations: this.generateRecommendations(sameDaySlots, alternativeDates, reason)
      };
    } catch (error) {
      console.error('Error suggesting rescheduling:', error);
      throw error;
    }
  }

  /**
   * Get all applicable rules for a child on a given date
   */
  async getApplicableRules(childId, date) {
    const { data: rules } = await supabase
      .from('schedule_rules')
      .select('*')
      .or(`scope_type.eq.family,scope_type.eq.child,scope_id.eq.${childId}`)
      .gte('date_range', `[${date},${date}]`)
      .lte('date_range', `[${date},${date}]`)
      .eq('is_active', true)
      .order('priority', { ascending: false });

    return rules || [];
  }

  /**
   * Get all applicable overrides for a child on a given date
   */
  async getApplicableOverrides(childId, date) {
    const { data: overrides } = await supabase
      .from('schedule_overrides')
      .select('*')
      .or(`scope_type.eq.family,scope_type.eq.child,scope_id.eq.${childId}`)
      .eq('date', date)
      .eq('is_active', true);

    return overrides || [];
  }

  /**
   * Get existing events for a child on a given date
   */
  async getExistingEvents(childId, date) {
    const startOfDay = new Date(date + 'T00:00:00');
    const endOfDay = new Date(date + 'T23:59:59');
    
    const { data: events } = await supabase
      .from('events')
      .select('*')
      .eq('child_id', childId)
      .gte('start_ts', startOfDay.toISOString())
      .lte('start_ts', endOfDay.toISOString())
      .in('status', ['scheduled', 'done']);

    return events || [];
  }

  /**
   * Calculate available time slots based on rules, overrides, and existing events
   */
  calculateAvailableSlots(rules, overrides, existingEvents, durationMinutes) {
    // Start with a full day
    const dayStart = 9 * 60; // 9:00 AM in minutes
    const dayEnd = 17 * 60; // 5:00 PM in minutes
    const slots = [];

    // Apply rules to determine available hours
    let availableStart = dayStart;
    let availableEnd = dayEnd;

    // Find the highest priority teaching rule
    const teachingRule = rules.find(rule => 
      rule.rule_type === 'availability_teach' && rule.scope_type === 'child'
    );

    if (teachingRule) {
      availableStart = this.timeToMinutes(teachingRule.start_time);
      availableEnd = this.timeToMinutes(teachingRule.end_time);
    }

    // Apply overrides
    overrides.forEach(override => {
      switch (override.override_kind) {
        case 'day_off':
          // No available slots
          availableStart = availableEnd;
          break;
        case 'late_start':
          if (override.start_time) {
            availableStart = Math.max(availableStart, this.timeToMinutes(override.start_time));
          }
          break;
        case 'early_end':
          if (override.end_time) {
            availableEnd = Math.min(availableEnd, this.timeToMinutes(override.end_time));
          }
          break;
      }
    });

    // Generate time slots, avoiding existing events
    for (let time = availableStart; time + durationMinutes <= availableEnd; time += 30) {
      const slotStart = time;
      const slotEnd = time + durationMinutes;
      
      // Check if this slot conflicts with existing events
      const hasConflict = existingEvents.some(event => {
        const eventStart = this.timeToMinutes(new Date(event.start_ts).toTimeString().split(' ')[0]);
        const eventEnd = this.timeToMinutes(new Date(event.end_ts).toTimeString().split(' ')[0]);
        
        return (slotStart < eventEnd && slotEnd > eventStart);
      });

      if (!hasConflict) {
        slots.push({
          start: this.minutesToTimeString(slotStart),
          end: this.minutesToTimeString(slotEnd),
          startMinutes: slotStart,
          endMinutes: slotEnd
        });
      }
    }

    return slots;
  }

  /**
   * Generate AI recommendations for rescheduling
   */
  generateRecommendations(sameDaySlots, alternativeDates, reason) {
    const recommendations = [];

    if (sameDaySlots.length > 0) {
      recommendations.push({
        type: 'same_day',
        priority: 'high',
        message: `I found ${sameDaySlots.length} available time slots today. The earliest is at ${sameDaySlots[0].start}.`,
        slots: sameDaySlots.slice(0, 3)
      });
    }

    if (alternativeDates.length > 0) {
      const nextBest = alternativeDates[0];
      recommendations.push({
        type: 'next_available',
        priority: 'medium',
        message: `Next available day is ${this.formatDate(nextBest.date)} with ${nextBest.slots.length} time slots.`,
        date: nextBest.date,
        slots: nextBest.slots.slice(0, 3)
      });
    }

    // Add contextual recommendations based on reason
    switch (reason) {
      case 'weather':
        recommendations.push({
          type: 'suggestion',
          priority: 'low',
          message: 'Consider moving outdoor activities indoors or rescheduling for better weather.'
        });
        break;
      case 'sick':
        recommendations.push({
          type: 'suggestion',
          priority: 'low',
          message: 'Take time to rest and recover. Lessons can be made up when feeling better.'
        });
        break;
      case 'family_emergency':
        recommendations.push({
          type: 'suggestion',
          priority: 'low',
          message: 'Family comes first. We can reschedule these lessons for next week.'
        });
        break;
    }

    return recommendations;
  }

  /**
   * Auto-reschedule events based on conflicts and family preferences
   */
  async autoRescheduleConflicts() {
    try {
      // Get all scheduled events for the next 30 days
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('family_id', this.familyId)
        .eq('status', 'scheduled')
        .gte('start_ts', new Date().toISOString())
        .lte('start_ts', thirtyDaysFromNow.toISOString());

      const conflicts = [];
      const rescheduled = [];

      // Check for conflicts with schedule rules
      for (const event of events) {
        const eventDate = new Date(event.start_ts).toISOString().split('T')[0];
        const overrides = await this.getApplicableOverrides(event.child_id, eventDate);
        
        // Check if event conflicts with day-off override
        const dayOffOverride = overrides.find(override => override.override_kind === 'day_off');
        if (dayOffOverride) {
          conflicts.push({
            event,
            reason: 'day_off_override',
            override: dayOffOverride
          });
        }
      }

      // Auto-reschedule conflicts
      for (const conflict of conflicts) {
        const suggestions = await this.suggestRescheduling(conflict.event.id, conflict.reason);
        
        if (suggestions.sameDayAlternatives.length > 0) {
          // Use the first available same-day slot
          const newSlot = suggestions.sameDayAlternatives[0];
          await this.rescheduleEvent(conflict.event.id, newSlot.start, newSlot.end);
          rescheduled.push({ event: conflict.event, newTime: newSlot });
        } else if (suggestions.alternativeDates.length > 0) {
          // Use the first available alternative date
          const altDate = suggestions.alternativeDates[0];
          const newSlot = altDate.slots[0];
          const newStart = new Date(`${altDate.date}T${newSlot.start}`);
          const newEnd = new Date(`${altDate.date}T${newSlot.end}`);
          
          await this.rescheduleEvent(conflict.event.id, newStart.toISOString(), newEnd.toISOString());
          rescheduled.push({ event: conflict.event, newTime: newSlot, newDate: altDate.date });
        }
      }

      return {
        conflictsFound: conflicts.length,
        rescheduledCount: rescheduled.length,
        rescheduledEvents: rescheduled
      };
    } catch (error) {
      console.error('Error in auto-rescheduling:', error);
      throw error;
    }
  }

  /**
   * Reschedule an event to a new time
   */
  async rescheduleEvent(eventId, newStartTime, newEndTime) {
    const { error } = await supabase
      .from('events')
      .update({
        start_ts: newStartTime,
        end_ts: newEndTime,
        updated_at: new Date().toISOString(),
        source: 'ai'
      })
      .eq('id', eventId);

    if (error) {
      throw error;
    }
  }

  /**
   * Utility function to convert time string to minutes
   */
  timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Utility function to convert minutes to time string
   */
  minutesToTimeString(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * Format date for display
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'short', 
      day: 'numeric' 
    });
  }
}

export default new AIReschedulingService();
