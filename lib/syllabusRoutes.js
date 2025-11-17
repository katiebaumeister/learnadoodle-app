// Syllabus API Routes
import { supabase } from './supabase';

// Helper: Parse syllabus PDF/DOC (simplified - actual parsing happens client-side)
async function parseSyllabus(uploadId, syllabusId, familyId, childId, subjectId, startDate, endDate, expectedWeeklyMinutes) {
  try {
    // In production, this would:
    // 1. Download file from Supabase Storage
    // 2. Extract text (pdf-parse for PDF, mammoth for DOCX)
    // 3. Call OpenAI to parse structure
    // 4. Insert into syllabus_sections
    
    // For now, return basic structure - client will handle parsing
    // The client calls /api/syllabus/parse endpoint which does the actual parsing
    
    return { success: true, message: 'Parsing queued - use /api/syllabus/parse endpoint' };
  } catch (err) {
    console.error('Error queuing syllabus parse:', err);
    return { success: false, error: err.message };
  }
}

export const createSyllabusRoutes = (app) => {
  /**
   * POST /api/syllabus/upload
   * Mark upload as syllabus and create syllabus record
   */
  app.post('/api/syllabus/upload', async (req, res) => {
    try {
      const { upload_id, family_id, child_id, subject_id, title, start_date, end_date, expected_weekly_minutes } = req.body;

      if (!upload_id || !family_id || !child_id || !subject_id || !title) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Update upload to mark as syllabus
      const { error: uploadError } = await supabase
        .from('uploads')
        .update({ kind: 'syllabus', subject_id, child_id })
        .eq('id', upload_id);

      if (uploadError) throw uploadError;

      // Create syllabus record
      const { data: syllabus, error: syllabusError } = await supabase
        .from('syllabi')
        .insert({
          family_id,
          child_id,
          subject_id,
          upload_id,
          title,
          start_date: start_date || null,
          end_date: end_date || null,
          expected_weekly_minutes: expected_weekly_minutes || null
        })
        .select()
        .single();

      if (syllabusError) throw syllabusError;

      // Enqueue parsing (async)
      parseSyllabus(upload_id, family_id, child_id, subject_id)
        .then(async (parsed) => {
          // Insert sections
          if (parsed.sections && parsed.sections.length > 0) {
            const sections = parsed.sections.map(s => ({
              syllabus_id: syllabus.id,
              ...s
            }));

            await supabase.from('syllabus_sections').insert(sections);
          }
        })
        .catch(err => console.error('Error parsing syllabus:', err));

      res.json({ success: true, syllabus });
    } catch (error) {
      console.error('Error uploading syllabus:', error);
      res.status(500).json({ error: error.message || 'Failed to upload syllabus' });
    }
  });

  /**
   * GET /api/syllabus/:id
   * Get syllabus with sections
   */
  app.get('/api/syllabus/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const { data: syllabus, error: syllabusError } = await supabase
        .from('syllabi')
        .select('*')
        .eq('id', id)
        .single();

      if (syllabusError) throw syllabusError;

      const { data: sections, error: sectionsError } = await supabase
        .from('syllabus_sections')
        .select('*')
        .eq('syllabus_id', id)
        .order('position');

      if (sectionsError) throw sectionsError;

      res.json({ syllabus, sections: sections || [] });
    } catch (error) {
      console.error('Error fetching syllabus:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch syllabus' });
    }
  });

  /**
   * POST /api/syllabus/parse
   * Parse syllabus file and create sections
   */
  app.post('/api/syllabus/parse', async (req, res) => {
    try {
      const { upload_id, syllabus_id, raw_text, start_date, end_date, expected_weekly_minutes } = req.body;

      if (!upload_id || !syllabus_id || !raw_text) {
        return res.status(400).json({ error: 'Missing required fields: upload_id, syllabus_id, raw_text' });
      }

      // Import parser (client-side would call this)
      // For server-side, we'd extract text from file first
      // For now, using the raw_text provided
      
      // TODO: In production, download file from Supabase Storage and extract text
      // For PDF: use pdf-parse
      // For DOCX: use mammoth
      // For plain text: use as-is

      // Parse using OpenAI (client will call this)
      const { parseSyllabusToSections } = await import('./syllabusParser.js');
      
      const sections = await parseSyllabusToSections(
        upload_id,
        syllabus_id,
        raw_text,
        start_date,
        end_date,
        expected_weekly_minutes
      );

      res.json({ success: true, sections });
    } catch (error) {
      console.error('Error parsing syllabus:', error);
      res.status(500).json({ error: error.message || 'Failed to parse syllabus' });
    }
  });

  /**
   * POST /api/syllabus/:id/suggest
   * Generate plan suggestions from syllabus
   */
  app.post('/api/syllabus/:id/suggest', async (req, res) => {
    try {
      const { id } = req.params;

      // Get syllabus
      const { data: syllabus, error: syllabusError } = await supabase
        .from('syllabi')
        .select('*')
        .eq('id', id)
        .single();

      if (syllabusError) throw syllabusError;

      // Get sections
      const { data: sections, error: sectionsError } = await supabase
        .from('syllabus_sections')
        .select('*')
        .eq('syllabus_id', id)
        .order('position');

      if (sectionsError) throw sectionsError;

      // Calculate target days based on start_date, end_date, and expected_weekly_minutes
      const startDate = new Date(syllabus.start_date);
      const endDate = new Date(syllabus.end_date || startDate);
      const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      const weeklyMinutes = syllabus.expected_weekly_minutes || 120;
      const totalMinutes = sections.reduce((sum, s) => sum + (s.estimated_minutes || 0), 0);
      const minutesPerWeek = totalMinutes / (totalDays / 7);

      // Generate suggestions
      const suggestions = [];
      let currentDate = new Date(startDate);
      let minutesThisWeek = 0;

      for (const section of sections) {
        if (minutesThisWeek >= weeklyMinutes) {
          // Move to next week
          currentDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          minutesThisWeek = 0;
        }

        suggestions.push({
          family_id: syllabus.family_id,
          child_id: syllabus.child_id,
          subject_id: syllabus.subject_id,
          source_syllabus_id: syllabus.id,
          source_section_id: section.id,
          title: section.heading || `Section ${section.position}`,
          estimated_minutes: section.estimated_minutes || 30,
          due_ts: section.suggested_due_ts || null,
          target_day: currentDate.toISOString().split('T')[0],
          is_flexible: true,
          status: 'suggested'
        });

        minutesThisWeek += section.estimated_minutes || 30;
      }

      // Insert suggestions
      const { data: inserted, error: insertError } = await supabase
        .from('plan_suggestions')
        .insert(suggestions)
        .select();

      if (insertError) throw insertError;

      res.json({ success: true, suggestions: inserted });
    } catch (error) {
      console.error('Error generating suggestions:', error);
      res.status(500).json({ error: error.message || 'Failed to generate suggestions' });
    }
  });

  /**
   * POST /api/syllabus/:id/accept
   * Accept suggestions and create events
   */
  app.post('/api/syllabus/:id/accept', async (req, res) => {
    try {
      const { id } = req.params;
      const { suggestion_ids, edits } = req.body; // edits: { suggestion_id: { minutes, target_day, is_flexible } }

      if (!suggestion_ids || !Array.isArray(suggestion_ids)) {
        return res.status(400).json({ error: 'suggestion_ids array required' });
      }

      // Get suggestions
      const { data: suggestions, error: suggestionsError } = await supabase
        .from('plan_suggestions')
        .select('*')
        .in('id', suggestion_ids)
        .eq('source_syllabus_id', id)
        .eq('status', 'suggested');

      if (suggestionsError) throw suggestionsError;

      // Create events from suggestions
      const events = suggestions.map(s => {
        const edit = edits && edits[s.id] ? edits[s.id] : {};
        return {
          family_id: s.family_id,
          child_id: s.child_id,
          subject_id: s.subject_id,
          title: s.title,
          description: `From syllabus: ${s.title}`,
          estimated_minutes: edit.estimated_minutes || s.estimated_minutes || 30,
          due_ts: s.due_ts || null,
          is_flexible: edit.is_flexible !== undefined ? edit.is_flexible : s.is_flexible,
          source_syllabus_id: s.source_syllabus_id,
          source_section_id: s.source_section_id,
          status: 'scheduled',
          start_ts: edit.target_day ? new Date(edit.target_day).toISOString() : null,
          end_ts: edit.target_day ? new Date(new Date(edit.target_day).getTime() + (edit.estimated_minutes || s.estimated_minutes || 30) * 60000).toISOString() : null
        };
      });

      const { data: createdEvents, error: eventsError } = await supabase
        .from('events')
        .insert(events)
        .select();

      if (eventsError) throw eventsError;

      // Mark suggestions as accepted
      await supabase
        .from('plan_suggestions')
        .update({ status: 'accepted' })
        .in('id', suggestion_ids);

      res.json({ success: true, events: createdEvents });
    } catch (error) {
      console.error('Error accepting suggestions:', error);
      res.status(500).json({ error: error.message || 'Failed to accept suggestions' });
    }
  });

  /**
   * POST /api/syllabus/:id/dismiss
   * Dismiss suggestions
   */
  app.post('/api/syllabus/:id/dismiss', async (req, res) => {
    try {
      const { id } = req.params;
      const { suggestion_ids } = req.body;

      if (!suggestion_ids || !Array.isArray(suggestion_ids)) {
        return res.status(400).json({ error: 'suggestion_ids array required' });
      }

      await supabase
        .from('plan_suggestions')
        .update({ status: 'dismissed' })
        .in('id', suggestion_ids)
        .eq('source_syllabus_id', id);

      res.json({ success: true });
    } catch (error) {
      console.error('Error dismissing suggestions:', error);
      res.status(500).json({ error: error.message || 'Failed to dismiss suggestions' });
    }
  });

  /**
   * PATCH /api/events/:id/link-syllabus
   * Link/unlink syllabus section to event
   */
  app.patch('/api/events/:id/link-syllabus', async (req, res) => {
    try {
      const { id } = req.params;
      const { source_syllabus_id, source_section_id } = req.body;

      const { data, error } = await supabase
        .from('events')
        .update({
          source_syllabus_id: source_syllabus_id || null,
          source_section_id: source_section_id || null
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      res.json({ success: true, event: data });
    } catch (error) {
      console.error('Error linking syllabus:', error);
      res.status(500).json({ error: error.message || 'Failed to link syllabus' });
    }
  });

  /**
   * GET /api/syllabus/compare-week
   * Compare progress vs syllabus for a week
   */
  app.get('/api/syllabus/compare-week', async (req, res) => {
    try {
      const { family_id, child_id, week_start } = req.query;

      if (!family_id || !child_id || !week_start) {
        return res.status(400).json({ error: 'Missing required params: family_id, child_id, week_start' });
      }

      const { data, error } = await supabase.rpc('compare_to_syllabus_week', {
        p_family_id: family_id,
        p_child_id: child_id,
        p_week_start: week_start
      });

      if (error) throw error;

      res.json({ comparisons: data || [] });
    } catch (error) {
      console.error('Error comparing to syllabus:', error);
      res.status(500).json({ error: error.message || 'Failed to compare progress' });
    }
  });
};

