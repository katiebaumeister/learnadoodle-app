/**
 * AI Template Generation API Client
 */
import { apiRequest } from '../apiClient';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Generate a template from topic/syllabus/curriculum
 */
export async function generateTemplate(sourceType, sourceData, templateType = 'lesson', subjects = null, gradeLevels = null, estimatedDurationDays = null) {
  return apiRequest(`${API_BASE}/api/ai/templates/generate/`, {
    method: 'POST',
    body: JSON.stringify({
      source_type: sourceType,
      source_data: sourceData,
      template_type: templateType,
      subjects: subjects,
      grade_levels: gradeLevels,
      estimated_duration_days: estimatedDurationDays,
    }),
  });
}

/**
 * Get template generation queue
 */
export async function getTemplateGenerationQueue(status = null) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  
  return apiRequest(`${API_BASE}/api/ai/templates/generate/queue?${params.toString()}`, {
    method: 'GET',
  });
}

/**
 * Get generated templates
 */
export async function getGeneratedTemplates(sourceType = null, templateType = null, isPublic = null, limit = 50) {
  const params = new URLSearchParams();
  if (sourceType) params.append('source_type', sourceType);
  if (templateType) params.append('template_type', templateType);
  if (isPublic !== null) params.append('is_public', isPublic.toString());
  params.append('limit', limit.toString());
  
  return apiRequest(`${API_BASE}/api/ai/templates/generate/?${params.toString()}`, {
    method: 'GET',
  });
}

