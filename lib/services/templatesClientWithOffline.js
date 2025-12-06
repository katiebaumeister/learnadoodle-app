/**
 * Templates Client with Offline Support
 * Wraps templatesClient with offline storage and instant sync
 */
import { listLessonTemplates as apiListLessonTemplates, createLessonTemplate as apiCreateLessonTemplate } from './templatesClient';
import * as offlineStorage from './offlineStorage';
import * as instantSync from './instantSync';

/**
 * List lesson templates with offline support
 * Returns cached templates immediately, then syncs in background
 */
export async function listLessonTemplates({ subjectId = null, familyId } = {}) {
  try {
    // Try to get from offline storage first
    const cachedTemplates = await offlineStorage.getAllTemplates(familyId);
    
    // Filter by subject if needed
    let templates = cachedTemplates;
    if (subjectId) {
      templates = templates.filter(t => t.subject_id === subjectId);
    }

    // Return cached data immediately if available
    if (templates.length > 0) {
      // Sync in background
      apiListLessonTemplates({ subjectId }).then(async ({ data, error }) => {
        if (!error && data) {
          // Store updated templates
          for (const template of data) {
            await offlineStorage.storeTemplate({ ...template, family_id: familyId }, { sync_status: 'synced' });
          }
        }
      }).catch(err => console.error('[templatesClientWithOffline] Background sync error:', err));
      
      return { data: templates, error: null };
    }

    // If no cache, fetch from API
    const { data, error } = await apiListLessonTemplates({ subjectId });
    
    if (error) {
      // Return cached data even if API fails
      return { data: cachedTemplates, error: null };
    }

    // Store in offline storage
    if (data && familyId) {
      data.forEach(template => {
        offlineStorage.storeTemplate({ ...template, family_id: familyId }, { sync_status: 'synced' });
      });
    }

    return { data: data || [], error: null };
  } catch (err) {
    console.error('[templatesClientWithOffline] Error:', err);
    // Fallback to cached data
    const cached = await offlineStorage.getAllTemplates(familyId);
    return { data: cached, error: null };
  }
}

/**
 * Create lesson template with optimistic update
 */
export async function createLessonTemplate(params, familyId) {
  try {
    // Generate temporary ID
    const tempId = `temp_template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const optimisticTemplate = {
      id: tempId,
      ...params,
      family_id: familyId,
      sync_status: 'pending',
      created_at: new Date().toISOString(),
    };

    // Store locally immediately
    await offlineStorage.storeTemplate(optimisticTemplate, { sync_status: 'pending' });

    // Add to sync queue
    await offlineStorage.addToSyncQueue({
      operation: 'create',
      table_name: 'lesson_templates',
      record_id: tempId,
      data: params,
      family_id: familyId,
    });

    // Try to sync immediately if online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      apiCreateLessonTemplate(params).then(async ({ data, error }) => {
        if (!error && data) {
          // Update with real ID - remove old temp, store new
          await offlineStorage.removeTemplate(tempId);
          await offlineStorage.storeTemplate({ ...data, family_id: familyId }, { sync_status: 'synced' });
        }
      }).catch(err => console.error('[templatesClientWithOffline] Background create error:', err));
    }

    return { data: optimisticTemplate, error: null };
  } catch (err) {
    console.error('[templatesClientWithOffline] Error creating template:', err);
    return { data: null, error: err };
  }
}

