// Data adapters for tool system - wired to Supabase

import { supabase } from './supabase';

/**
 * Fetch children for the current family
 * @returns {Promise<Array<{id: string, name: string, first_name?: string}>>}
 */
export async function fetchChildren() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: profile } = await supabase
      .from('profiles')
      .select('family_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.family_id) return [];

    const { data: children, error } = await supabase
      .from('children')
      .select('id, first_name, last_name')
      .eq('family_id', profile.family_id)
      .eq('archived', false)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching children:', error);
      return [];
    }

    return (children || []).map(child => ({
      id: child.id,
      name: child.first_name || 'Unknown',
      first_name: child.first_name,
      last_name: child.last_name,
    }));
  } catch (error) {
    console.error('Error in fetchChildren:', error);
    return [];
  }
}

/**
 * Fetch tasks based on filters
 * @param {Object} params
 * @param {string} params.scope - 'tasksTodayToWeekEnd' | 'backlog' | 'completed' | 'search'
 * @param {string} [params.from] - ISO date string
 * @param {string} [params.to] - ISO date string
 * @param {string[]} [params.children] - Array of child IDs
 * @param {string[]} [params.labels] - Array of label strings (tags)
 * @param {string} [params.query] - Search query string
 * @returns {Promise<Array<{id: string, title: string, childId?: string|null, labels?: string[], start?: string|null, end?: string|null, completedAt?: string|null, plannedMinutes?: number|null, actualMinutes?: number|null}>>}
 */
export async function fetchTasks(params) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: profile } = await supabase
      .from('profiles')
      .select('family_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.family_id) return [];

    let query = supabase
      .from('events')
      .select('id, title, description, start_ts, end_ts, status, child_id, event_type, source, tags')
      .eq('family_id', profile.family_id);

    // Apply child filter
    if (params.children && params.children.length > 0) {
      query = query.in('child_id', params.children);
    }

    // Apply date range based on scope
    switch (params.scope) {
      case 'tasksTodayToWeekEnd':
        if (params.from) {
          query = query.gte('start_ts', params.from + 'T00:00:00');
        }
        if (params.to) {
          query = query.lte('start_ts', params.to + 'T23:59:59');
        }
        // Only scheduled/planned events
        query = query.in('status', ['scheduled', 'planned', 'in_progress']);
        break;

      case 'backlog':
        // Events without start_ts or with status 'backlog' or 'todo'
        query = query.or('start_ts.is.null,status.eq.backlog,status.eq.todo');
        break;

      case 'completed':
        query = query.eq('status', 'done');
        if (params.from) {
          // For completed, we might want to filter by completion date
          // For now, filter by start_ts
          query = query.gte('start_ts', params.from + 'T00:00:00');
        }
        break;

      case 'search':
        if (params.query) {
          const searchQuery = params.query.toLowerCase();
          query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
        }
        break;

      default:
        return [];
    }

    // Apply label/tag filter
    if (params.labels && params.labels.length > 0) {
      // Tags are stored as JSON array or comma-separated string
      // We'll filter in JavaScript for now since Supabase JSON filtering can be complex
    }

    query = query.order('start_ts', { ascending: true, nullsFirst: params.scope === 'backlog' });
    query = query.limit(200);

    const { data: events, error } = await query;

    if (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }

    // Transform events to task format
    const tasks = (events || []).map(event => {
      // Parse tags if they exist
      let labels = [];
      if (event.tags) {
        try {
          if (typeof event.tags === 'string') {
            labels = JSON.parse(event.tags);
          } else if (Array.isArray(event.tags)) {
            labels = event.tags;
          }
        } catch {
          // If tags is a comma-separated string
          if (typeof event.tags === 'string') {
            labels = event.tags.split(',').map(t => t.trim()).filter(Boolean);
          }
        }
      }

      // Apply label filter in JavaScript if needed
      if (params.labels && params.labels.length > 0) {
        const hasMatchingLabel = params.labels.some(label => 
          labels.some(tag => tag.toLowerCase().includes(label.toLowerCase()))
        );
        if (!hasMatchingLabel) return null;
      }

      // Extract event type for labels
      if (event.event_type) {
        labels.push(event.event_type);
      }
      if (event.source) {
        labels.push(event.source);
      }

      return {
        id: event.id,
        title: event.title || 'Untitled',
        childId: event.child_id,
        labels: [...new Set(labels)], // Remove duplicates
        start: event.start_ts,
        end: event.end_ts,
        completedAt: event.status === 'done' ? (event.end_ts || event.start_ts) : null,
        plannedMinutes: null, // Not stored in events table currently
        actualMinutes: null, // Not stored in events table currently
      };
    }).filter(Boolean); // Remove nulls from label filtering

    return tasks;
  } catch (error) {
    console.error('Error in fetchTasks:', error);
    return [];
  }
}

