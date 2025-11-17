// Document Stats API Routes
import { supabase } from './supabase';

export const createDocumentStatsRoutes = (app) => {
  /**
   * GET /api/documents/light-subjects
   * Get subjects with low evidence uploads
   */
  app.get('/api/documents/light-subjects', async (req, res) => {
    try {
      const { family_id, child_id } = req.query;

      if (!family_id || !child_id) {
        return res.status(400).json({ error: 'family_id and child_id required' });
      }

      const { data, error } = await supabase.rpc('get_light_evidence_subjects', {
        p_family_id: family_id,
        p_child_id: child_id
      });

      if (error) throw error;

      res.json({ subjects: data || [] });
    } catch (error) {
      console.error('Error fetching light subjects:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch light subjects' });
    }
  });

  /**
   * GET /api/documents/stats
   * Get document statistics
   */
  app.get('/api/documents/stats', async (req, res) => {
    try {
      const { family_id, child_id, range = 'month' } = req.query;

      if (!family_id || !child_id) {
        return res.status(400).json({ error: 'family_id and child_id required' });
      }

      const dateTrunc = range === 'quarter' ? 'quarter' : 'month';

      const { data, error } = await supabase
        .from('v_upload_stats')
        .select('*')
        .eq('family_id', family_id)
        .eq('child_id', child_id)
        .order('month', { ascending: false })
        .limit(range === 'quarter' ? 4 : 12);

      if (error) throw error;

      res.json({ stats: data || [] });
    } catch (error) {
      console.error('Error fetching document stats:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch stats' });
    }
  });
};

