/**
 * Explicit tool schema definitions for validation and orchestration.
 */

export const TOOL_SCHEMAS = Object.freeze([
  {
    name: 'add_activity',
    description: 'Create a new learning activity or log homework for a child.',
    parameters: {
      child_id: 'uuid',
      name: 'string',
      activity_type: 'string',
      subject_track_id: 'uuid | null',
      schedule_data: 'object',
    },
    required: ['name'],
  },
  {
    name: 'progress_summary',
    description: 'Get progress summary for a child (optionally for a subject or time window).',
    parameters: {
      child_id: 'uuid',
      days_back: 'number',
    },
    required: ['child_id'],
  },
  {
    name: 'queue_reschedule',
    description: 'Queue a reschedule request (e.g. appointment, trip).',
    parameters: {
      family_id: 'uuid',
      calendar_date: 'string',
      note: 'string',
    },
    required: ['family_id', 'calendar_date'],
  },
]);

const SCHEMAS_BY_NAME = new Map(TOOL_SCHEMAS.map((s) => [s.name, s]));

export function getToolSchema(name) {
  return SCHEMAS_BY_NAME.get(name) ?? null;
}

export function validateToolParams(toolName, params) {
  const schema = getToolSchema(toolName);
  if (!schema) return { valid: false, error: `Unknown tool: ${toolName}` };
  const required = schema.required || [];
  for (const key of required) {
    if (params == null || params[key] === undefined || params[key] === '') {
      return { valid: false, error: `Missing required parameter: ${key}` };
    }
  }
  return { valid: true };
}
