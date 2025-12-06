/**
 * AI Workload Balancing API Client
 */
import { apiRequest } from '../apiClient';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Analyze and balance workload by cognitive load
 */
export async function balanceWorkload(childId, dateRangeStart, dateRangeEnd, targetDailyLoad = 'medium') {
  return apiRequest(`${API_BASE}/api/ai/workload/balance`, {
    method: 'POST',
    body: JSON.stringify({
      child_id: childId,
      date_range_start: dateRangeStart,
      date_range_end: dateRangeEnd,
      target_daily_load: targetDailyLoad,
    }),
  });
}

/**
 * Optimize schedule by redistributing assignments
 */
export async function optimizeSchedule(childId, dateRangeStart, dateRangeEnd, targetDailyLoad = 'medium') {
  return apiRequest(`${API_BASE}/api/ai/workload/optimize`, {
    method: 'POST',
    body: JSON.stringify({
      child_id: childId,
      date_range_start: dateRangeStart,
      date_range_end: dateRangeEnd,
      target_daily_load: targetDailyLoad,
    }),
  });
}

/**
 * Analyze cognitive load patterns
 */
export async function analyzeCognitivePatterns(childId, daysBack = 30) {
  const params = new URLSearchParams();
  params.append('days_back', daysBack.toString());
  
  return apiRequest(`${API_BASE}/api/ai/workload/analyze-cognitive-patterns?${params.toString()}`, {
    method: 'POST',
    body: JSON.stringify({
      child_id: childId,
    }),
  });
}

