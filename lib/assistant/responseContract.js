/**
 * Structured assistant response contract.
 * Separates: UI text (content), tool invocation (tool), and metadata (meta).
 */

export const RESPONSE_TYPES = Object.freeze({
  MESSAGE: 'message',
  TOOL_CALL: 'tool_call',
  ERROR: 'error',
});

/**
 * Create a normalized assistant response.
 * @param {'message'|'tool_call'|'error'} type
 * @param {{ text: string }} content
 * @param {{ name: string, params: object } | null} tool
 * @param {{ intent?: string, confidence?: number, reasoning?: string, matched_child?: string, matched_subject?: string } | null} meta
 * @param {{ fetch?: string } | null} legacy - optional fetch hint for UI (e.g. custom-plan)
 */
export function createAssistantResponse(type, content, tool = null, meta = null, legacy = null) {
  const response = {
    type,
    content: typeof content === 'string' ? { text: content } : content,
    tool: tool ?? null,
    meta: meta ?? null,
  };
  if (legacy?.fetch) response.fetch = legacy.fetch;
  if (legacy?.openTaskModal) response.openTaskModal = legacy.openTaskModal;
  if (legacy?.createEventInBackground) response.createEventInBackground = legacy.createEventInBackground;
  return response;
}

/**
 * Backward compatibility: get displayable message from either new or old response shape.
 */
export function getDisplayMessage(response) {
  if (!response) return '';
  if (response.content?.text) return response.content.text;
  if (typeof response.message === 'string') return response.message;
  return '';
}

export function isToolCall(response) {
  return !!(response?.tool?.name || response?.tool);
}

export function getToolName(response) {
  return response?.tool?.name ?? response?.tool ?? null;
}

export function getToolParams(response) {
  return response?.tool?.params ?? response?.params ?? null;
}

/**
 * Convert a new-format response to the legacy shape for callers that still expect it.
 */
export function toLegacyResponse(response) {
  if (!response) return { message: '', tool: null, params: null, fetch: null };
  return {
    message: getDisplayMessage(response),
    tool: getToolName(response),
    params: getToolParams(response),
    fetch: response.fetch ?? null,
    debug: response.meta?.reasoning ?? response.debug,
  };
}
