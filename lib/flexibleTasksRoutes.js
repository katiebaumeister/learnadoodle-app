// Flexible Tasks & Syllabus API Routes
import { supabase } from './supabase';

// ============================================================
// Flexible Tasks Routes
// ============================================================

export const createFlexibleTasksRoutes = (app) => {
  /**
   * POST /api/flexible/create
   * Create a backlog item or flexible event
   */
  app.post('/api/flexible/create', async (req, res) => {
    try {
      const { source, family_id, child_id, subject_id, title, notes, estimated_minutes, due_ts, priority } = req.body;

      if (!family_id || !child_id || !title) {
        return res.status(400).json({ error: 'Missing required fields: family_id, child_id, title' });
      }

      if (source === 'backlog') {
        const { data, error } = await supabase
          .from('backlog_items')
          .insert({
            family_id,
            child_id,
            subject_id: subject_id || null,
            title,
            notes: notes || null,
            estimated_minutes: estimated_minutes || null,
            due_ts: due_ts || null,
            priority: priority || 0
          })
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, item: data });
      } else if (source === 'event') {
        const { data, error } = await supabase
          .from('events')
          .insert({
            family_id,
            child_id,
            subject_id: subject_id || null,
            title,
            description: notes || null,
            is_flexible: true,
            estimated_minutes: estimated_minutes || null,
            due_ts: due_ts || null,
            status: 'scheduled'
          })
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, event: data });
      }

      return res.status(400).json({ error: 'Invalid source. Use "backlog" or "event"' });
    } catch (error) {
      console.error('Error creating flexible task:', error);
      res.status(500).json({ error: error.message || 'Failed to create flexible task' });
    }
  });

  /**
   * GET /api/flexible/backlog
   * Get flexible backlog (events + backlog_items)
   */
  app.get('/api/flexible/backlog', async (req, res) => {
    try {
      const { family_id } = req.query;

      if (!family_id) {
        return res.status(400).json({ error: 'family_id required' });
      }

      const { data, error } = await supabase.rpc('get_flexible_backlog', {
        p_family_id: family_id
      });

      if (error) throw error;
      res.json({ items: data || [] });
    } catch (error) {
      console.error('Error fetching backlog:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch backlog' });
    }
  });

  /**
   * POST /api/flexible/schedule
   * Schedule a flexible task (find slot and update)
   */
  app.post('/api/flexible/schedule', async (req, res) => {
    try {
      const { source, id, family_id, child_id, target_date, estimated_minutes } = req.body;

      if (!source || !id || !family_id || !child_id || !target_date || !estimated_minutes) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Find available slot
      const { data: slot, error: slotError } = await supabase.rpc('find_slot_for_flexible', {
        p_family_id: family_id,
        p_child_id: child_id,
        p_target_date: target_date,
        p_minutes_needed: estimated_minutes
      });

      if (slotError) throw slotError;

      if (!slot || slot.length === 0) {
        return res.status(404).json({ error: 'No available slot found for that date' });
      }

      const { start_ts, end_ts } = slot[0];

      if (source === 'event') {
        // Update existing flexible event
        const { data, error } = await supabase
          .from('events')
          .update({
            start_ts,
            end_ts,
            scheduled_start_ts: start_ts,
            scheduled_end_ts: end_ts,
            is_flexible: false  // Mark as scheduled
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, event: data });
      } else if (source === 'backlog') {
        // Convert backlog item to event
        const { data: backlogItem, error: backlogError } = await supabase
          .from('backlog_items')
          .select('*')
          .eq('id', id)
          .single();

        if (backlogError) throw backlogError;

        // Create event from backlog
        const { data: event, error: eventError } = await supabase
          .from('events')
          .insert({
            family_id: backlogItem.family_id,
            child_id: backlogItem.child_id,
            subject_id: backlogItem.subject_id,
            title: backlogItem.title,
            description: backlogItem.notes,
            start_ts,
            end_ts,
            scheduled_start_ts: start_ts,
            scheduled_end_ts: end_ts,
            estimated_minutes: backlogItem.estimated_minutes,
            due_ts: backlogItem.due_ts,
            status: 'scheduled'
          })
          .select()
          .single();

        if (eventError) throw eventError;

        // Delete backlog item
        await supabase.from('backlog_items').delete().eq('id', id);

        return res.json({ success: true, event });
      }

      return res.status(400).json({ error: 'Invalid source' });
    } catch (error) {
      console.error('Error scheduling flexible task:', error);
      res.status(500).json({ error: error.message || 'Failed to schedule task' });
    }
  });

  /**
   * POST /api/flexible/convert
   * Convert backlog item to event (without scheduling)
   */
  app.post('/api/flexible/convert', async (req, res) => {
    try {
      const { backlog_id } = req.body;

      if (!backlog_id) {
        return res.status(400).json({ error: 'backlog_id required' });
      }

      const { data: backlogItem, error: backlogError } = await supabase
        .from('backlog_items')
        .select('*')
        .eq('id', backlog_id)
        .single();

      if (backlogError) throw backlogError;

      // Create flexible event
      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({
          family_id: backlogItem.family_id,
          child_id: backlogItem.child_id,
          subject_id: backlogItem.subject_id,
          title: backlogItem.title,
          description: backlogItem.notes,
          is_flexible: true,
          estimated_minutes: backlogItem.estimated_minutes,
          due_ts: backlogItem.due_ts,
          status: 'scheduled'
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // Delete backlog item
      await supabase.from('backlog_items').delete().eq('id', backlog_id);

      return res.json({ success: true, event });
    } catch (error) {
      console.error('Error converting backlog:', error);
      res.status(500).json({ error: error.message || 'Failed to convert backlog item' });
    }
  });
};

