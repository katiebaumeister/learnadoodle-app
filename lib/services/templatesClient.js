/**
 * Templates Client
 * Data access layer for template operations
 */
import { supabase } from '../supabase';
import { apiRequest } from '../apiClient';

/**
 * List templates for a family
 * @param {Object} params - { familyId, filters: { search, subjects, gradeLevels, duration, type } }
 * @returns {Promise<{data: any[], error: Error|null}>}
 */
export async function listTemplates({ familyId, filters = {} }) {
  try {
    let query = supabase
      .from('plan_templates')
      .select(`
        *,
        template_usage(count)
      `)
      .or(`family_id.eq.${familyId},is_public.eq.true,is_system_template.eq.true`)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.search) {
      query = query.or(`template_name.ilike.%${filters.search}%,template_description.ilike.%${filters.search}%`);
    }

    if (filters.subjects && filters.subjects.length > 0) {
      query = query.contains('subjects', filters.subjects);
    }

    if (filters.gradeLevels && filters.gradeLevels.length > 0) {
      query = query.contains('grade_levels', filters.gradeLevels);
    }

    if (filters.type) {
      query = query.eq('template_type', filters.type);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Calculate usage counts
    const templatesWithUsage = await Promise.all(
      (data || []).map(async (template) => {
        const { count } = await supabase
          .from('template_usage')
          .select('*', { count: 'exact', head: true })
          .eq('template_id', template.id);
        
        return {
          ...template,
          usage_count: count || 0,
        };
      })
    );

    return { data: templatesWithUsage, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Create template from events
 * @param {Object} params - { name, description, dateRange: { start, end }, childIds, subjects, tags, visibility }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export async function createFromEvents({ 
  name, 
  description, 
  dateRange, 
  childIds, 
  subjects = [], 
  tags = [], 
  visibility = 'private',
  familyId 
}) {
  try {
    // First, fetch events in the date range for selected children
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .in('child_id', childIds)
      .gte('start_ts', dateRange.start)
      .lte('start_ts', dateRange.end)
      .order('start_ts', { ascending: true });

    if (eventsError) throw eventsError;

    // Filter by subjects if provided
    let filteredEvents = events || [];
    if (subjects && subjects.length > 0) {
      filteredEvents = filteredEvents.filter(e => subjects.includes(e.subject_id));
    }

    // Normalize events into template structure
    // Calculate relative offsets from start date
    const startDate = new Date(dateRange.start);
    const templateData = {
      events: filteredEvents.map(event => {
        const eventDate = new Date(event.start_ts);
        const daysOffset = Math.floor((eventDate - startDate) / (1000 * 60 * 60 * 24));
        
        return {
          days_offset: daysOffset,
          time_of_day: event.start_ts.split('T')[1]?.substring(0, 5) || '10:00',
          duration_minutes: event.minutes || 30,
          title: event.title,
          description: event.description,
          subject_id: event.subject_id,
          event_type: event.event_type,
          tags: event.tags || [],
        };
      }),
      duration_days: Math.ceil((new Date(dateRange.end) - startDate) / (1000 * 60 * 60 * 24)) + 1,
      child_count: childIds.length,
    };

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Create template
    const { data: template, error: templateError } = await supabase
      .from('plan_templates')
      .insert({
        family_id: visibility === 'private' ? familyId : null,
        created_by: user.id,
        template_name: name,
        template_description: description,
        template_type: 'sequence',
        template_data: templateData,
        is_public: visibility === 'public',
        is_system_template: visibility === 'system',
        tags: Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim()).filter(Boolean),
        subjects: subjects,
      })
      .select()
      .single();

    if (templateError) throw templateError;

    return { data: template, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Apply template to children
 * @param {Object} params - { templateId, childIds, startDate, familyId }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export async function applyTemplate({ templateId, childIds, startDate, familyId }) {
  try {
    // Get template
    const { data: template, error: templateError } = await supabase
      .from('plan_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError) throw templateError;
    if (!template) throw new Error('Template not found');

    const templateData = template.template_data || {};
    const events = templateData.events || [];

    // Get subjects for subject_id mapping
    const { data: subjects } = await supabase
      .from('subject')
      .select('id, name')
      .eq('family_id', familyId);

    const subjectMap = {};
    (subjects || []).forEach(s => {
      subjectMap[s.name] = s.id;
    });

    // Generate events for each child
    const startDateObj = new Date(startDate);
    const eventsToCreate = [];

    for (const childId of childIds) {
      for (const eventTemplate of events) {
        const eventDate = new Date(startDateObj);
        eventDate.setDate(eventDate.getDate() + (eventTemplate.days_offset || 0));
        
        const [hours, minutes] = (eventTemplate.time_of_day || '10:00').split(':').map(Number);
        eventDate.setHours(hours, minutes || 0, 0, 0);

        const endDate = new Date(eventDate);
        endDate.setMinutes(endDate.getMinutes() + (eventTemplate.duration_minutes || 30));

        eventsToCreate.push({
          family_id: familyId,
          child_id: childId,
          title: eventTemplate.title,
          description: eventTemplate.description,
          start_ts: eventDate.toISOString(),
          end_ts: endDate.toISOString(),
          minutes: eventTemplate.duration_minutes || 30,
          subject_id: eventTemplate.subject_id,
          event_type: eventTemplate.event_type,
          tags: eventTemplate.tags || [],
          status: 'scheduled',
          source: 'template',
        });
      }
    }

    // Insert events in batch
    if (eventsToCreate.length > 0) {
      const { data: createdEvents, error: insertError } = await supabase
        .from('events')
        .insert(eventsToCreate)
        .select();

      if (insertError) throw insertError;

      // Record template usage
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('template_usage')
          .insert(
            childIds.map(childId => ({
              template_id: templateId,
              family_id: familyId,
              child_id: childId,
              applied_by: user.id,
              applied_at: new Date().toISOString(),
            }))
          );
      }

      return { data: { events_created: createdEvents.length, events: createdEvents }, error: null };
    }

    return { data: { events_created: 0, events: [] }, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Get template preview data
 * @param {string} templateId
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export async function getTemplatePreview(templateId) {
  try {
    const { data: template, error } = await supabase
      .from('plan_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (error) throw error;
    return { data: template, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Create a new version of a lesson template
 * @param {Object} params - { templateId, versionNotes }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export async function createTemplateVersion({ templateId, versionNotes = null }) {
  try {
    const { data, error } = await apiRequest(`/api/lesson-templates/${templateId}/create-version`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version_notes: versionNotes,
      }),
    });
    
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * List all versions of a template
 * @param {string} templateId
 * @returns {Promise<{data: any[], error: Error|null}>}
 */
export async function listTemplateVersions(templateId) {
  try {
    const { data, error } = await apiRequest(`/api/lesson-templates/${templateId}/versions`);
    
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * List lesson templates for a family
 * @param {Object} params - { subjectId (optional) }
 * @returns {Promise<{data: any[], error: Error|null}>}
 */
export async function listLessonTemplates({ subjectId = null } = {}) {
  try {
    const params = new URLSearchParams();
    if (subjectId) params.append('subject_id', subjectId);
    
    const url = `/api/lesson-templates${params.toString() ? '?' + params.toString() : ''}`;
    const { data, error } = await apiRequest(url);
    
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Create a lesson template from scratch
 * @param {Object} params - { title, subjectId, defaultObjectives, defaultMaterials, defaultSteps, defaultDuration, linkedStandards }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export async function createLessonTemplate({
  title,
  subjectId = null,
  defaultObjectives = null,
  defaultMaterials = null,
  defaultSteps = null,
  defaultDuration = null,
  linkedStandards = [],
  defaultRichText = null,
  gradeLevels = null,
  pacing = null,
}) {
  try {
    const { data, error } = await apiRequest('/api/lesson-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        subject_id: subjectId,
        default_objectives: defaultObjectives,
        default_materials: defaultMaterials,
        default_steps: defaultSteps,
        default_duration: defaultDuration,
        linked_standards: linkedStandards,
        default_rich_text: defaultRichText,
        grade_levels: gradeLevels,
        pacing: pacing,
      }),
    });
    
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Share a template to the marketplace
 * @param {string} templateId
 * @param {Object} params - { marketplace_description, marketplace_tags }
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export async function shareTemplate(templateId, { marketplace_description, marketplace_tags = [] }) {
  try {
    const { data, error } = await apiRequest(`/api/lesson-templates/${templateId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketplace_description,
        marketplace_tags,
      }),
    });
    
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

