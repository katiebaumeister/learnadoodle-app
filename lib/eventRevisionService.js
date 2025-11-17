// Event revision service for undo functionality and audit trail
import { supabase } from './supabase';

export class EventRevisionService {
  /**
   * Create a revision when an event is modified
   * @param {string} eventId - Event ID
   * @param {Object} oldData - Previous event data
   * @param {Object} newData - New event data
   * @param {string} userId - User who made the change
   * @param {string} action - Action type (create, update, delete)
   */
  async createRevision(eventId, oldData, newData, userId, action = 'update') {
    try {
      // Calculate the diff between old and new data
      const diff = this.calculateDiff(oldData, newData);
      
      const { data, error } = await supabase
        .from('event_revisions')
        .insert({
          event_id: eventId,
          action,
          diff,
          user_id: userId,
          old_data: oldData,
          new_data: newData,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error creating event revision:', error);
      throw new Error('Failed to create event revision');
    }
  }

  /**
   * Get revision history for an event
   * @param {string} eventId - Event ID
   * @returns {Array} Array of revisions
   */
  async getEventRevisions(eventId) {
    try {
      const { data, error } = await supabase
        .from('event_revisions')
        .select('*, profiles(email)')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting event revisions:', error);
      throw new Error('Failed to get event revisions');
    }
  }

  /**
   * Undo the last revision for an event
   * @param {string} eventId - Event ID
   * @param {string} userId - User performing the undo
   * @returns {Object} Restored event data
   */
  async undoLastRevision(eventId, userId) {
    try {
      // Get the most recent revision
      const { data: revisions, error: revisionsError } = await supabase
        .from('event_revisions')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (revisionsError) throw revisionsError;

      if (!revisions || revisions.length === 0) {
        throw new Error('No revisions found for this event');
      }

      const lastRevision = revisions[0];

      // Restore the previous state
      const restoredData = lastRevision.old_data;
      
      // Update the event
      const { data: updatedEvent, error: updateError } = await supabase
        .from('events')
        .update({
          ...restoredData,
          updated_at: new Date().toISOString()
        })
        .eq('id', eventId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Create a new revision for the undo action
      await this.createRevision(
        eventId,
        lastRevision.new_data,
        restoredData,
        userId,
        'undo'
      );

      return updatedEvent;
    } catch (error) {
      console.error('Error undoing revision:', error);
      throw new Error('Failed to undo event revision');
    }
  }

  /**
   * Calculate diff between two objects
   * @param {Object} oldData - Previous data
   * @param {Object} newData - New data
   * @returns {Object} Diff object
   */
  calculateDiff(oldData, newData) {
    const diff = {};
    const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);

    for (const key of allKeys) {
      const oldValue = oldData?.[key];
      const newValue = newData?.[key];

      if (oldValue !== newValue) {
        diff[key] = {
          old: oldValue,
          new: newValue
        };
      }
    }

    return diff;
  }

  /**
   * Get recent revisions across all events for a family
   * @param {string} familyId - Family ID
   * @param {number} limit - Number of revisions to return
   * @returns {Array} Array of recent revisions
   */
  async getRecentRevisions(familyId, limit = 20) {
    try {
      const { data, error } = await supabase
        .from('event_revisions')
        .select(`
          *,
          events(title, child_id),
          profiles(email),
          children(first_name, last_name)
        `)
        .eq('events.family_id', familyId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting recent revisions:', error);
      throw new Error('Failed to get recent revisions');
    }
  }

  /**
   * Clean up old revisions (keep only last 50 per event)
   * @param {string} eventId - Event ID (optional, if not provided cleans all events)
   */
  async cleanupOldRevisions(eventId = null) {
    try {
      let query = supabase
        .from('event_revisions')
        .select('id, event_id, created_at');

      if (eventId) {
        query = query.eq('event_id', eventId);
      }

      const { data: revisions, error } = await query;

      if (error) throw error;

      // Group by event_id and keep only the 50 most recent per event
      const eventGroups = {};
      revisions.forEach(revision => {
        if (!eventGroups[revision.event_id]) {
          eventGroups[revision.event_id] = [];
        }
        eventGroups[revision.event_id].push(revision);
      });

      const revisionsToDelete = [];
      Object.values(eventGroups).forEach(eventRevisions => {
        // Sort by created_at descending and take everything after the 50th
        eventRevisions
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(50)
          .forEach(revision => revisionsToDelete.push(revision.id));
      });

      if (revisionsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('event_revisions')
          .delete()
          .in('id', revisionsToDelete);

        if (deleteError) throw deleteError;
      }

      return { deleted_count: revisionsToDelete.length };
    } catch (error) {
      console.error('Error cleaning up old revisions:', error);
      throw new Error('Failed to cleanup old revisions');
    }
  }

  /**
   * Get revision statistics for analytics
   * @param {string} familyId - Family ID
   * @param {string} startDate - Start date (ISO string)
   * @param {string} endDate - End date (ISO string)
   * @returns {Object} Revision statistics
   */
  async getRevisionStats(familyId, startDate, endDate) {
    try {
      const { data, error } = await supabase
        .from('event_revisions')
        .select('action, created_at, events.family_id')
        .eq('events.family_id', familyId)
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      if (error) throw error;

      const stats = {
        total_revisions: data.length,
        actions: {},
        daily_counts: {}
      };

      data.forEach(revision => {
        // Count by action type
        stats.actions[revision.action] = (stats.actions[revision.action] || 0) + 1;

        // Count by day
        const day = revision.created_at.split('T')[0];
        stats.daily_counts[day] = (stats.daily_counts[day] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('Error getting revision stats:', error);
      throw new Error('Failed to get revision statistics');
    }
  }
}

// Export singleton instance
export const eventRevisionService = new EventRevisionService();
