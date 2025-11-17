// Year Planner API Routes
import { supabase } from './supabase';

export const createYearPlannerRoutes = (app) => {
  /**
   * POST /api/years/bootstrap
   * Bootstrap next school year
   */
  app.post('/api/years/bootstrap', async (req, res) => {
    try {
      const { family_id, current_end, next_start, next_end } = req.body;

      if (!family_id || !current_end || !next_start || !next_end) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const { data, error } = await supabase.rpc('bootstrap_next_year', {
        p_family_id: family_id,
        p_current_end: current_end,
        p_next_start: next_start,
        p_next_end: next_end
      });

      if (error) throw error;

      res.json({ success: true, year_id: data });
    } catch (error) {
      console.error('Error bootstrapping year:', error);
      res.status(500).json({ error: error.message || 'Failed to bootstrap year' });
    }
  });

  /**
   * GET /api/years
   * List school years for a family
   */
  app.get('/api/years', async (req, res) => {
    try {
      const { family_id } = req.query;

      if (!family_id) {
        return res.status(400).json({ error: 'family_id required' });
      }

      const { data, error } = await supabase
        .from('school_years')
        .select('*')
        .eq('family_id', family_id)
        .order('start_date', { ascending: false });

      if (error) throw error;

      res.json({ years: data || [] });
    } catch (error) {
      console.error('Error fetching years:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch years' });
    }
  });

  /**
   * GET /api/years/:id/subjects
   * Get subjects for a school year
   */
  app.get('/api/years/:id/subjects', async (req, res) => {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('year_subjects')
        .select(`
          *,
          subjects (id, name),
          children (id, first_name)
        `)
        .eq('school_year_id', id)
        .order('child_id');

      if (error) throw error;

      res.json({ subjects: data || [] });
    } catch (error) {
      console.error('Error fetching year subjects:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch year subjects' });
    }
  });
};

