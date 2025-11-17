// API routes for calendar feeds and planner endpoints
import { generateFamilyICS, generateChildICS } from './icsService';
import { supabase } from './supabase';
import { createFlexibleTasksRoutes } from './flexibleTasksRoutes.js';
import { createSyllabusRoutes } from './syllabusRoutes.js';
import { createDocumentStatsRoutes } from './documentStatsRoutes.js';
import { createYearPlannerRoutes } from './yearPlannerRoutes.js';
import { createAIReschedulingRoutes } from './aiReschedulingRoutes.js';

// External Content Routes
export const createExternalContentRoutes = (app) => {
  /**
   * GET /api/external/courses
   * List external courses with optional filters
   */
  app.get('/api/external/courses', async (req, res) => {
    try {
      const { provider, subject } = req.query;

      // First, get provider ID if provider filter is specified
      let providerId = null;
      if (provider) {
        const { data: providerData } = await supabase
          .from('external_providers')
          .select('id')
          .eq('name', provider)
          .single();
        if (providerData) {
          providerId = providerData.id;
        }
      }

      let query = supabase
        .from('external_courses')
        .select(`
          id,
          subject,
          grade_band,
          lesson_count,
          public_url,
          provider_id,
          external_providers (
            name,
            license,
            attribution_text
          )
        `);

      if (providerId) {
        query = query.eq('provider_id', providerId);
      }

      if (subject) {
        query = query.eq('subject', subject);
      }

      const { data, error } = await query.order('subject', { ascending: true });

      if (error) {
        // If table doesn't exist, return empty array instead of error
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('External courses table does not exist yet. Run the SQL migration.');
          return res.json([]);
        }
        throw error;
      }

      // Transform to match expected format
      const courses = (data || []).map(course => ({
        id: course.id,
        provider_name: course.external_providers?.name || 'Unknown',
        subject: course.subject,
        grade_band: course.grade_band,
        lesson_count: course.lesson_count,
        public_url: course.public_url,
        license: course.external_providers?.license,
        attribution_text: course.external_providers?.attribution_text,
      }));

      res.json(courses);
    } catch (error) {
      console.error('Error fetching external courses:', error);
      res.status(500).json({ error: 'Failed to fetch courses', details: error.message });
    }
  });

  /**
   * GET /api/external/courses/:id/outline
   * Get course outline (units and lessons)
   */
  app.get('/api/external/courses/:id/outline', async (req, res) => {
    try {
      const { id } = req.params;

      // Get course header
      const { data: courseData, error: courseError } = await supabase
        .from('external_courses')
        .select(`
          id,
          subject,
          grade_band,
          public_url,
          external_providers (
            name
          )
        `)
        .eq('id', id)
        .single();

      if (courseError || !courseData) {
        return res.status(404).json({ error: 'Course not found' });
      }

      // Get units
      const { data: unitsData, error: unitsError } = await supabase
        .from('external_units')
        .select('id, ordinal, title_safe, public_url')
        .eq('course_id', id)
        .order('ordinal', { ascending: true });

      if (unitsError) {
        throw unitsError;
      }

      // Get lessons for each unit
      const units = [];
      for (const unit of unitsData || []) {
        const { data: lessonsData, error: lessonsError } = await supabase
          .from('external_lessons')
          .select('ordinal, title_safe, resource_type, public_url')
          .eq('unit_id', unit.id)
          .order('ordinal', { ascending: true });

        if (lessonsError) {
          throw lessonsError;
        }

        units.push({
          ordinal: unit.ordinal,
          title_safe: unit.title_safe,
          public_url: unit.public_url,
          lessons: (lessonsData || []).map(lesson => ({
            ordinal: lesson.ordinal,
            title_safe: lesson.title_safe,
            resource_type: lesson.resource_type,
            public_url: lesson.public_url,
          })),
        });
      }

      res.json({
        course_id: courseData.id,
        provider_name: courseData.external_providers?.name || 'Unknown',
        subject: courseData.subject,
        grade_band: courseData.grade_band,
        public_url: courseData.public_url,
        units,
      });
    } catch (error) {
      console.error('Error fetching course outline:', error);
      res.status(500).json({ error: 'Failed to fetch course outline' });
    }
  });

  /**
   * POST /api/external/schedule_course
   * Schedule an external course
   */
  app.post('/api/external/schedule_course', async (req, res) => {
    try {
      const {
        family_id,
        child_id,
        course_id,
        start_date,
        days_per_week,
        sessions_per_day = 1,
        start_time = '10:00',
        block_minutes = 45,
      } = req.body;

      if (!family_id || !child_id || !course_id || !start_date || !days_per_week) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      // Call the RPC function
      const { data, error } = await supabase.rpc('schedule_external_course', {
        p_family_id: family_id,
        p_child_id: child_id,
        p_course_id: course_id,
        p_start_date: start_date,
        p_days_per_week: days_per_week,
        p_sessions_per_day: sessions_per_day,
        p_start_time: start_time,
        p_block_minutes: block_minutes,
      });

      if (error) {
        throw error;
      }

      res.json({ scheduled_events: data || 0 });
    } catch (error) {
      console.error('Error scheduling external course:', error);
      res.status(500).json({ error: 'Failed to schedule course' });
    }
  });
};

// ICS Calendar Feed Routes
export const createICSRoutes = (app) => {
  /**
   * GET /api/ics/family.ics
   * Generate family-wide calendar feed
   */
  app.get('/api/ics/family.ics', async (req, res) => {
    try {
      const { family_id } = req.query;
      
      if (!family_id) {
        return res.status(400).json({ error: 'Family ID required' });
      }

      const icsContent = await generateFamilyICS(family_id);

      res.set({
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="family-schedule.ics"',
        'Cache-Control': 'public, max-age=300' // 5 minute cache
      });

      res.send(icsContent);
    } catch (error) {
      console.error('Error generating family ICS:', error);
      res.status(500).json({ error: 'Failed to generate calendar feed' });
    }
  });

  /**
   * GET /api/ics/child/:id.ics
   * Generate child-specific calendar feed
   */
  app.get('/api/ics/child/:id.ics', async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ error: 'Child ID required' });
      }

      const icsContent = await generateChildICS(id);

      res.set({
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="child-${id}-schedule.ics"`,
        'Cache-Control': 'public, max-age=300' // 5 minute cache
      });

      res.send(icsContent);
    } catch (error) {
      console.error('Error generating child ICS:', error);
      res.status(500).json({ error: 'Failed to generate calendar feed' });
    }
  });

};

// Planner API Routes (Simplified)
export const createPlannerRoutes = (app) => {
  /**
   * POST /api/planner/preview
   * Generate scheduling proposal (placeholder)
   */
  app.post('/api/planner/preview', async (req, res) => {
    try {
      const { childId, familyId, fromDate, toDate, goals } = req.body;

      if (!childId || !familyId || !fromDate || !toDate) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      // Placeholder response - in a full implementation, this would use the planner service
      res.json({
        proposalId: `proposal_${Date.now()}`,
        events: [],
        message: 'Planner preview not yet implemented',
        status: 'placeholder'
      });
    } catch (error) {
      console.error('Error generating proposal:', error);
      res.status(500).json({ error: 'Failed to generate scheduling proposal' });
    }
  });

  /**
   * POST /api/planner/commit
   * Commit scheduling proposal (placeholder)
   */
  app.post('/api/planner/commit', async (req, res) => {
    try {
      const { proposalId, eventsToCommit, childId, familyId } = req.body;

      if (!proposalId || !eventsToCommit || !childId || !familyId) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      // Placeholder response
      res.json({
        success: true,
        message: 'Planner commit not yet implemented',
        committedEvents: eventsToCommit.length,
        status: 'placeholder'
      });
    } catch (error) {
      console.error('Error committing proposal:', error);
      res.status(500).json({ error: 'Failed to commit scheduling proposal' });
    }
  });

  /**
   * POST /api/planner/catchup
   * Reschedule skipped events to next available slots
   */
  app.post('/api/planner/catchup', async (req, res) => {
    try {
      const { eventId } = req.body;

      if (!eventId) {
        return res.status(400).json({ error: 'Event ID required' });
      }

      // Get the skipped event
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .eq('status', 'skipped')
        .single();

      if (eventError || !event) {
        return res.status(404).json({ error: 'Skipped event not found' });
      }

      // Find next available teaching windows
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 14); // Look ahead 2 weeks

      const { data: availability, error: availabilityError } = await supabase
        .rpc('get_child_availability', {
          p_child_id: event.child_id,
          p_from_date: new Date().toISOString().split('T')[0],
          p_to_date: endDate.toISOString().split('T')[0]
        });

      if (availabilityError) throw availabilityError;

      // Find first available teaching window
      const availableDay = availability.find(day => 
        day.day_status === 'teach' && 
        day.start_time && 
        day.end_time &&
        new Date(day.date) > new Date()
      );

      if (!availableDay) {
        return res.status(404).json({ 
          error: 'No available teaching windows found in the next 2 weeks' 
        });
      }

      // Calculate event duration
      const originalStart = new Date(event.start_ts);
      const originalEnd = new Date(event.end_ts);
      const durationMinutes = (originalEnd - originalStart) / (1000 * 60);

      // Schedule for the next available day at the start of teaching hours
      const newStart = new Date(`${availableDay.date}T${availableDay.start_time}:00`);
      const newEnd = new Date(newStart.getTime() + durationMinutes * 60000);

      // Update the event
      const { data: updatedEvent, error: updateError } = await supabase
        .from('events')
        .update({
          start_ts: newStart.toISOString(),
          end_ts: newEnd.toISOString(),
          status: 'scheduled',
          updated_at: new Date().toISOString()
        })
        .eq('id', eventId)
        .select()
        .single();

      if (updateError) throw updateError;

      res.json({
        success: true,
        rescheduled_event: updatedEvent,
        message: `Event rescheduled to ${availableDay.date} at ${availableDay.start_time}`
      });

    } catch (error) {
      console.error('Error rescheduling event:', error);
      res.status(500).json({ error: 'Failed to reschedule event' });
    }
  });
};

// Global Search Routes
export const createSearchRoutes = (app) => {
  /**
   * GET /api/search
   * Global search across events, documents, courses, and commands
   */
  app.get('/api/search', async (req, res) => {
    try {
      const q = (req.query.q || '').trim();
      if (!q) {
        return res.status(200).json({ results: [] });
      }

      const results = [];
      const searchLower = q.toLowerCase();

      // Get user from Supabase session token
      const authHeader = req.headers.authorization;
      let userId = null;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const { data: { user }, error } = await supabase.auth.getUser(token);
          if (!error && user) {
            userId = user.id;
          }
        } catch (err) {
          console.error('Error validating token:', err);
        }
      }

      if (!userId) {
        // Try to get from cookies (for web requests)
        const cookies = req.headers.cookie || '';
        const accessTokenMatch = cookies.match(/sb-access-token=([^;]+)/);
        if (accessTokenMatch) {
          try {
            const { data: { user }, error } = await supabase.auth.getUser(accessTokenMatch[1]);
            if (!error && user) {
              userId = user.id;
            }
          } catch (err) {
            console.error('Error validating cookie token:', err);
          }
        }
      }

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Get family_id
      const { data: profileData } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', userId)
        .maybeSingle();

      if (!profileData?.family_id) {
        return res.status(200).json({ results: [] });
      }

      const familyId = profileData.family_id;

      // Fetch children for name lookup
      const { data: childrenData } = await supabase
        .from('children')
        .select('id, first_name, name')
        .eq('family_id', familyId)
        .eq('archived', false);

      const childrenMap = {};
      if (childrenData) {
        childrenData.forEach((child) => {
          childrenMap[child.id] = child.first_name || child.name || 'Unknown';
        });
      }

      // 1) Search Events (planner events)
      const { data: events } = await supabase
        .from('events')
        .select('id, title, start_ts, child_id')
        .eq('family_id', familyId)
        .ilike('title', `%${q}%`)
        .limit(10)
        .order('start_ts', { ascending: false });

      if (events) {
        events.forEach((e) => {
          const childName = e.child_id ? (childrenMap[e.child_id] || 'Unknown') : 'Unknown';
          const dateStr = e.start_ts
            ? new Date(e.start_ts).toLocaleDateString()
            : '';
          results.push({
            id: `event-${e.id}`,
            type: 'event',
            title: e.title,
            subtitle: `${childName} • ${dateStr}`,
            payload: { eventId: e.id },
          });
        });
      }

      // Fetch subjects for name lookup
      const { data: subjectsData } = await supabase
        .from('subject')
        .select('id, name')
        .eq('family_id', familyId);

      const subjectsMap = {};
      if (subjectsData) {
        subjectsData.forEach((subject) => {
          subjectsMap[subject.id] = subject.name || 'Unknown Subject';
        });
      }

      // 2) Search Documents / Records (syllabi, uploads, etc.)
      // Search syllabi
      const { data: syllabi } = await supabase
        .from('syllabi')
        .select('id, title, child_id, subject_id')
        .eq('family_id', familyId)
        .ilike('title', `%${q}%`)
        .limit(5);

      if (syllabi) {
        syllabi.forEach((s) => {
          const childName = s.child_id ? (childrenMap[s.child_id] || 'Unknown') : 'Unknown';
          const subjectName = s.subject_id ? (subjectsMap[s.subject_id] || 'Unknown Subject') : 'Unknown Subject';
          results.push({
            id: `syllabus-${s.id}`,
            type: 'document',
            title: s.title,
            subtitle: `${childName} • ${subjectName}`,
            payload: { syllabusId: s.id },
          });
        });
      }

      // Search uploads (documents)
      const { data: uploads } = await supabase
        .from('uploads')
        .select('id, filename, kind, child_id')
        .eq('family_id', familyId)
        .ilike('filename', `%${q}%`)
        .limit(5);

      if (uploads) {
        uploads.forEach((u) => {
          const childName = u.child_id ? (childrenMap[u.child_id] || 'Unknown') : 'Unknown';
          const kindLabel = u.kind || 'Document';
          results.push({
            id: `upload-${u.id}`,
            type: 'document',
            title: u.filename,
            subtitle: `${childName} • ${kindLabel}`,
            payload: { uploadId: u.id },
          });
        });
      }

      // 3) Search External Courses (Explore)
      const { data: courses } = await supabase
        .from('external_courses')
        .select('id, subject, grade_band')
        .or(`subject.ilike.%${q}%,grade_band.ilike.%${q}%`)
        .limit(5);

      if (courses) {
        courses.forEach((c) => {
          results.push({
            id: `course-${c.id}`,
            type: 'course',
            title: `${c.subject} - ${c.grade_band || 'All Grades'}`,
            subtitle: 'External Course',
            payload: { courseId: c.id },
          });
        });
      }

      // 4) Static Commands
      const allCommands = [
        {
          id: 'cmd-planner',
          type: 'function',
          title: 'Go to Planner',
          subtitle: 'Open calendar view',
          payload: { kind: 'navigate', href: '/planner' },
        },
        {
          id: 'cmd-home',
          type: 'function',
          title: 'Go to Home',
          subtitle: 'Daily insights and headlines',
          payload: { kind: 'navigate', href: '/' },
        },
        {
          id: 'cmd-explore',
          type: 'function',
          title: 'Go to Explore',
          subtitle: 'Browse external courses',
          payload: { kind: 'navigate', href: '/explore' },
        },
        {
          id: 'cmd-records',
          type: 'function',
          title: 'Go to Records',
          subtitle: 'View documents and records',
          payload: { kind: 'navigate', href: '/records' },
        },
        {
          id: 'cmd-add-task',
          type: 'function',
          title: 'Add a new task',
          subtitle: 'Open the add-task modal',
          payload: { kind: 'openModal', modalId: 'add-task' },
        },
      ];

      const cmdMatches = allCommands.filter((c) =>
        c.title.toLowerCase().includes(searchLower) ||
        c.subtitle.toLowerCase().includes(searchLower)
      );
      results.push(...cmdMatches);

      res.status(200).json({ results });
    } catch (error) {
      console.error('Error in search:', error);
      res.status(500).json({ error: 'Search failed', results: [] });
    }
  });
};

// Utility function to set up all routes
export const setupAPIRoutes = (app) => {
  createICSRoutes(app);
  createPlannerRoutes(app);
  createFlexibleTasksRoutes(app);
  createSyllabusRoutes(app);
  createDocumentStatsRoutes(app);
  createYearPlannerRoutes(app);
  createAIReschedulingRoutes(app);
  createExternalContentRoutes(app); // External content routes
  createSearchRoutes(app); // Global search routes
  
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });
  
  // Debug: Log registered routes in development
  if (process.env.NODE_ENV === 'development') {
    console.log('✅ External content routes registered: /api/external/courses, /api/external/courses/:id/outline, /api/external/schedule_course');
    console.log('✅ Global search route registered: /api/search');
  }
};
