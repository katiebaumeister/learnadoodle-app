/**
 * Assistant logging for observability and product analytics.
 * Logs: user_message, intent, response_type, tool_called, execution_result, latency_ms, model_used.
 */

const noop = () => {};

function getLogger() {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    return (event) => console.log('[DoodleAssistant]', event);
  }
  return noop;
}

const log = getLogger();

/**
 * @param {Object} event
 * @param {string} [event.user_message]
 * @param {string} [event.intent]
 * @param {number} [event.confidence]
 * @param {string} [event.response_type] - message | tool_call | error
 * @param {string} [event.tool_called]
 * @param {string} [event.execution_result] - success | failure | skipped
 * @param {number} [event.latency_ms]
 * @param {string} [event.model_used]
 * @param {string} [event.error]
 */
export function logAssistantEvent(event) {
  const payload = {
    ts: new Date().toISOString(),
    ...event,
  };
  log(payload);
  // Optional: send to backend analytics endpoint
  // if (typeof fetch !== 'undefined') fetch('/api/analytics/assistant', { method: 'POST', body: JSON.stringify(payload) });
}
