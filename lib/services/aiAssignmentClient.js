/**
 * AI Assignment Generation API Client
 */
import { apiRequest } from '../apiClient';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Generate an assignment using AI
 */
export async function generateAssignment(generationData) {
  return apiRequest(`${API_BASE}/api/ai/assignments/generate`, {
    method: 'POST',
    body: JSON.stringify(generationData),
  });
}

/**
 * Approve an AI-generated assignment and create it as a real assignment
 */
export async function approveAIAssignment(assignmentId) {
  return apiRequest(`${API_BASE}/api/ai/assignments/${assignmentId}/approve`, {
    method: 'POST',
  });
}

/**
 * Get AI-generated assignments for a child
 */
export async function getAIGeneratedAssignments(childId, status = null) {
  const url = `${API_BASE}/api/ai/assignments/${childId}${status ? `?status=${status}` : ''}`;
  return apiRequest(url);
}

