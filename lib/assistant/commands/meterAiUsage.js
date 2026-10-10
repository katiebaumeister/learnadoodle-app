/**
 * Meter Doodle pane LLM turns into ai_usage_ledger (via RPC) + conversation audit.
 */

import { supabase } from '../../supabase.js';
import { AIConversationService } from '../../aiConversationService.js';

/**
 * Best-effort metering. Never throws to callers.
 * @param {{
 *   familyId: string,
 *   conversationId?: string|null,
 *   actionType?: string,
 *   units?: number,
 *   idempotencyKey?: string,
 *   metadata?: object,
 * }} opts
 */
export async function meterDoodleAiUsage(opts = {}) {
  const familyId = String(opts.familyId || '').trim();
  if (!familyId) return { ok: false, reason: 'no_family' };

  const actionType = opts.actionType || 'chatbotSimple';
  const units = typeof opts.units === 'number' ? opts.units : undefined;
  const idempotencyKey = opts.idempotencyKey || null;
  const metadata = opts.metadata && typeof opts.metadata === 'object' ? opts.metadata : {};

  // Doodle chat completions are metered server-side on /llm/doodle-chat — skip ledger
  // here so chatbotSimple / chatbotPlannerAware are not double-counted.
  const serverMetered =
    actionType === 'chatbotSimple' || actionType === 'chatbotPlannerAware';

  let ledgerOk = serverMetered;
  if (!serverMetered) {
    try {
      const { error } = await supabase.rpc('record_family_ai_usage', {
        p_family_id: familyId,
        p_action_type: actionType,
        p_idempotency_key: idempotencyKey,
        p_metadata: metadata,
      });
      if (!error) ledgerOk = true;
    } catch (_) {
      ledgerOk = false;
    }
  }

  if (opts.conversationId) {
    try {
      await AIConversationService.recordAction(
        opts.conversationId,
        actionType,
        {
          source_channel: 'doodle_command_pane',
          units: units ?? null,
          idempotency_key: idempotencyKey,
          ...metadata,
        },
        'completed',
      );
    } catch (_) {
      /* audit is best-effort */
    }
  }

  return { ok: ledgerOk };
}
