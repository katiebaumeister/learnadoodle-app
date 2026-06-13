/**
 * Gradebook Client Service
 * Handles API calls for gradebook, rubrics, categories, skill grading, and analytics
 */
import { apiRequest } from '../apiClient';

const API_BASE = '/api/gradebook';

// ============================================================================
// Rubrics
// ============================================================================

export async function createRubric(rubricData) {
  return apiRequest(`${API_BASE}/rubrics`, {
    method: 'POST',
    body: JSON.stringify(rubricData),
  });
}

export async function getRubrics() {
  return apiRequest(`${API_BASE}/rubrics`);
}

export async function getRubricById(rubricId) {
  if (!rubricId) return null;
  const result = await getRubrics();
  const rows = result?.data || (result?.error ? [] : (Array.isArray(result) ? result : []));
  return (Array.isArray(rows) ? rows : []).find((row) => String(row.id) === String(rubricId)) || null;
}

export async function updateRubric(rubricId, rubricData) {
  return apiRequest(`${API_BASE}/rubrics/${rubricId}`, {
    method: 'PUT',
    body: JSON.stringify(rubricData),
  });
}

// ============================================================================
// Gradebook Categories
// ============================================================================

export async function createCategory(categoryData) {
  return apiRequest(`${API_BASE}/categories`, {
    method: 'POST',
    body: JSON.stringify(categoryData),
  });
}

export async function getCategories(childId, subjectId = null) {
  const params = new URLSearchParams({ child_id: childId });
  if (subjectId) params.append('subject_id', subjectId);
  return apiRequest(`${API_BASE}/categories?${params}`);
}

export async function calculateGradebookGrade(childId, subjectId = null, termLabel = null) {
  const params = new URLSearchParams({ child_id: childId });
  if (subjectId) params.append('subject_id', subjectId);
  if (termLabel) params.append('term_label', termLabel);
  return apiRequest(`${API_BASE}/calculate/${childId}?${params}`);
}

// ============================================================================
// Assignment Scoring
// ============================================================================

export async function scoreAssignment(assignmentId, scoreData) {
  return apiRequest(`${API_BASE}/assignments/score`, {
    method: 'POST',
    body: JSON.stringify({
      assignment_id: assignmentId,
      ...scoreData,
    }),
  });
}

// ============================================================================
// Skill-Based Grading
// ============================================================================

export async function createSkillGrade(skillGradeData) {
  return apiRequest(`${API_BASE}/skills`, {
    method: 'POST',
    body: JSON.stringify(skillGradeData),
  });
}

export async function getSkillGrades(childId, subjectId = null, skill = null) {
  const params = new URLSearchParams({ child_id: childId });
  if (subjectId) params.append('subject_id', subjectId);
  if (skill) params.append('skill', skill);
  return apiRequest(`${API_BASE}/skills?${params}`);
}

// ============================================================================
// Assignment Review Workflow
// ============================================================================

export async function reviewAssignment(assignmentId, reviewData) {
  return apiRequest(`${API_BASE}/assignments/review`, {
    method: 'POST',
    body: JSON.stringify({
      assignment_id: assignmentId,
      ...reviewData,
    }),
  });
}

export async function getAssignmentReviews(assignmentId) {
  return apiRequest(`${API_BASE}/assignments/${assignmentId}/reviews`);
}

export async function generateAIFeedback(assignmentId) {
  return apiRequest(`${API_BASE}/assignments/${assignmentId}/ai-feedback`, {
    method: 'POST',
  });
}

// ============================================================================
// Standards Coverage Analytics
// ============================================================================

export async function getStandardsCoverage(childId, filters = {}) {
  const params = new URLSearchParams({ child_id: childId });
  if (filters.subject) params.append('subject', filters.subject);
  if (filters.state_code) params.append('state_code', filters.state_code);
  if (filters.grade_level) params.append('grade_level', filters.grade_level);
  return apiRequest(`${API_BASE}/standards/coverage?${params}`);
}

// ============================================================================
// Progress Estimations
// ============================================================================

export async function estimateProgress(childId, subjectId = null, estimationType = 'overall') {
  const params = new URLSearchParams({ child_id: childId, estimation_type: estimationType });
  if (subjectId) params.append('subject_id', subjectId);
  return apiRequest(`${API_BASE}/progress/estimate?${params}`, {
    method: 'POST',
  });
}

export async function getProgressEstimations(childId, subjectId = null, estimationType = null) {
  const params = new URLSearchParams({ child_id: childId });
  if (subjectId) params.append('subject_id', subjectId);
  if (estimationType) params.append('estimation_type', estimationType);
  return apiRequest(`${API_BASE}/progress/estimations?${params}`);
}

