/**
 * Advanced AI Insights API Client
 */
import { apiRequest } from '../apiClient';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Generate advanced insights
 */
export async function generateAdvancedInsights(childId = null, insightTypes = null, layers = null, dateRangeStart = null, dateRangeEnd = null) {
  const params = new URLSearchParams();
  if (childId) params.append('child_id', childId);
  if (insightTypes) params.append('insight_types', insightTypes.join(','));
  if (layers) params.append('layers', layers.join(','));
  if (dateRangeStart) params.append('date_range_start', dateRangeStart);
  if (dateRangeEnd) params.append('date_range_end', dateRangeEnd);
  
  return apiRequest(`${API_BASE}/api/ai/insights/advanced/generate`, {
    method: 'POST',
    body: JSON.stringify({
      child_id: childId,
      insight_types: insightTypes,
      layers: layers,
      date_range_start: dateRangeStart,
      date_range_end: dateRangeEnd,
    }),
  });
}

/**
 * Get insights
 */
export async function getInsights(childId = null, insightType = null, layer = null, actionableOnly = false, limit = 20) {
  const params = new URLSearchParams();
  if (childId) params.append('child_id', childId);
  if (insightType) params.append('insight_type', insightType);
  if (layer) params.append('layer', layer);
  if (actionableOnly) params.append('actionable_only', 'true');
  params.append('limit', limit.toString());
  
  return apiRequest(`${API_BASE}/api/ai/insights/advanced?${params.toString()}`, {
    method: 'GET',
  });
}

/**
 * Apply an insight
 */
export async function applyInsight(insightId) {
  return apiRequest(`${API_BASE}/api/ai/insights/advanced/${insightId}/apply`, {
    method: 'POST',
  });
}

/**
 * Dismiss an insight
 */
export async function dismissInsight(insightId) {
  return apiRequest(`${API_BASE}/api/ai/insights/advanced/${insightId}/dismiss`, {
    method: 'POST',
  });
}

