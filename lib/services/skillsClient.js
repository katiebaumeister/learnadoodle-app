/**
 * API client for skill tracking and learning map
 */
import { apiRequest } from '../apiClient';

/**
 * Create a new skill
 */
export async function createSkill(skill) {
  return await apiRequest('/api/skills', {
    method: 'POST',
    body: JSON.stringify(skill),
  });
}

/**
 * List skills for the family
 */
export async function listSkills(filters = {}) {
  const params = new URLSearchParams();
  if (filters.subject_id) params.append('subject_id', filters.subject_id);
  if (filters.category) params.append('category', filters.category);
  
  const query = params.toString();
  return await apiRequest(`/api/skills${query ? `?${query}` : ''}`, {
    method: 'GET',
  });
}

/**
 * Add evidence linking an event/outcome/upload/material to a skill
 */
export async function addSkillEvidence(evidence) {
  return await apiRequest('/api/skills/evidence', {
    method: 'POST',
    body: JSON.stringify(evidence),
  });
}

/**
 * Get skill graph data for visualization
 */
export async function getSkillGraph(childId, options = {}) {
  const params = new URLSearchParams();
  params.append('child_id', childId);
  if (options.subject_id) params.append('subject_id', options.subject_id);
  if (options.days_back) params.append('days_back', options.days_back.toString());
  
  return await apiRequest(`/api/skills/graph?${params.toString()}`, {
    method: 'GET',
  });
}

/**
 * Get skill strengths and weaknesses analysis
 */
export async function getStrengthsWeaknesses(childId, options = {}) {
  const params = new URLSearchParams();
  params.append('child_id', childId);
  if (options.subject_id) params.append('subject_id', options.subject_id);
  
  return await apiRequest(`/api/skills/strengths-weaknesses?${params.toString()}`, {
    method: 'GET',
  });
}

/**
 * List skill evidence
 */
export async function listSkillEvidence(filters = {}) {
  const params = new URLSearchParams();
  if (filters.child_id) params.append('child_id', filters.child_id);
  if (filters.skill_id) params.append('skill_id', filters.skill_id);
  
  const query = params.toString();
  return await apiRequest(`/api/skills/evidence${query ? `?${query}` : ''}`, {
    method: 'GET',
  });
}

/**
 * Get skill heatmap data for visualization
 * Shows skill mastery over time
 */
export async function getSkillHeatmap(childId, options = {}) {
  const params = new URLSearchParams();
  params.append('child_id', childId);
  if (options.subject_id) params.append('subject_id', options.subject_id);
  if (options.start_date) params.append('start_date', options.start_date);
  if (options.end_date) params.append('end_date', options.end_date);
  if (options.group_by) params.append('group_by', options.group_by);
  
  return await apiRequest(`/api/skills/heatmap?${params.toString()}`, {
    method: 'GET',
  });
}

