-- Additive-only: extend ai_actions status for Doodle undo trail.
-- Does not change existing RPCs or existing columns beyond CHECK expansion.

ALTER TABLE public.ai_actions DROP CONSTRAINT IF EXISTS ai_actions_status_check;

ALTER TABLE public.ai_actions ADD CONSTRAINT ai_actions_status_check CHECK (
  status = ANY (
    ARRAY[
      'pending',
      'awaiting_confirmation',
      'completed',
      'failed',
      'rejected',
      'undone'
    ]::text[]
  )
);

COMMENT ON CONSTRAINT ai_actions_status_check ON public.ai_actions IS
  'Doodle/chat action lifecycle; undone = safe inverse applied via domain undo.';

ALTER TABLE public.ai_actions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

COMMENT ON COLUMN public.ai_actions.idempotency_key IS
  'Client-supplied key to prevent duplicate confirmed Doodle executions.';

CREATE UNIQUE INDEX IF NOT EXISTS ai_actions_idempotency_key_uidx
  ON public.ai_actions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
