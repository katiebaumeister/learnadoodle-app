import { executeRegisteredCommand, getCommand } from './registry.js';
import { DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import { trackDoodleEvent } from './analytics.js';
import { meterDoodleAiUsage } from './meterAiUsage.js';
import './registerAll.js';

/** In-memory idempotency for confirmed executes (session-scoped). */
const executedKeys = new Map();

/**
 * Client-side /execute equivalent.
 * Re-authorizes and re-validates before calling domain services.
 *
 * @param {{
 *   command: import('./types.js').DoodleCommand,
 *   context: import('./types.js').DoodleContext,
 *   capabilities?: object,
 *   idempotencyKey?: string,
 *   conversationId?: string,
 * }} input
 */
export async function doodleExecute(input) {
  const { command, context, capabilities = {}, idempotencyKey, conversationId } = input || {};

  if (!command?.type) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'Missing command to execute.',
      recoverable: true,
    });
  }

  if (idempotencyKey && executedKeys.has(idempotencyKey)) {
    return assertDoodleResponse(executedKeys.get(idempotencyKey));
  }

  trackDoodleEvent('doodle_action_confirmed', { commandType: command.type });

  try {
    const result = await executeRegisteredCommand(command, context, capabilities);
    if (!result?.ok) {
      trackDoodleEvent('doodle_action_failed', {
        commandType: command.type,
        error: result?.error || 'unknown',
      });
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ERROR,
        message: result?.message || 'Could not complete that action.',
        recoverable: true,
      });
    }

    const handler = getCommand(command.type);
    const auditLabel = handler?.auditLabel || command.type;

    const response = assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.RESULT,
      message: result.message,
      affectedRecords: result.affectedRecords || [],
      undoToken: result.undoToken,
      undoPayload: result.undoPayload || null,
      auditLabel,
    });

    if (idempotencyKey) {
      executedKeys.set(idempotencyKey, response);
      // Expire after 10 minutes
      setTimeout(() => executedKeys.delete(idempotencyKey), 10 * 60 * 1000);
    }

    // Best-effort conversation audit (same ledger path as pane LLM metering).
    if (context?.householdId) {
      meterDoodleAiUsage({
        familyId: context.householdId,
        conversationId: conversationId || null,
        actionType: 'chatbotSimple',
        units: 0,
        idempotencyKey: idempotencyKey
          ? `audit-${idempotencyKey}`
          : `audit-${command.type}-${Date.now()}`,
        metadata: {
          kind: 'doodle_mutation',
          commandType: command.type,
          auditLabel,
          undoToken: result.undoToken || null,
          resultSummary: result.message,
        },
      }).catch(() => {});
    }

    trackDoodleEvent('doodle_action_completed', { commandType: command.type });
    return response;
  } catch (err) {
    trackDoodleEvent('doodle_action_failed', {
      commandType: command.type,
      error: 'exception',
    });
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: err?.message || 'Execution failed. Nothing was partially committed beyond what the domain service reports.',
      recoverable: true,
    });
  }
}

export function doodleCancelPending(commandType) {
  trackDoodleEvent('doodle_action_cancelled', { commandType: commandType || null });
}
