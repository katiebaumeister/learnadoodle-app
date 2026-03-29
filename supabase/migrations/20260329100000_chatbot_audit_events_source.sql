-- Chatbot audit trail + allow events created from Doodle confirm flow to use source = chatbot.

-- 1) events.source: add chatbot (distinct from generic 'ai' for analytics)
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_source_check;

ALTER TABLE public.events ADD CONSTRAINT events_source_check CHECK (
  source IS NULL
  OR source = ANY (
    ARRAY[
      'manual',
      'ai',
      'curriculum',
      'system',
      'syllabus',
      'ai_plan',
      'resolve_conflicts',
      'plain_text_parsed',
      'year_plan_seed',
      'chatbot'
    ]::text[]
  )
);

COMMENT ON CONSTRAINT events_source_check ON public.events IS
  'Allowed events.source values; chatbot = user-confirmed assistant (Doodle) commits.';

-- 2) ai_actions: channel + broader status + optional result blob
ALTER TABLE public.ai_actions
  ADD COLUMN IF NOT EXISTS source_channel TEXT NOT NULL DEFAULT 'doodle_chat';

ALTER TABLE public.ai_actions
  ADD COLUMN IF NOT EXISTS result_data JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ai_actions.source_channel IS 'Where the action was initiated (e.g. doodle_chat, api).';
COMMENT ON COLUMN public.ai_actions.result_data IS 'Outcome after apply: ids created, errors, etc.';

ALTER TABLE public.ai_actions DROP CONSTRAINT IF EXISTS ai_actions_status_check;

ALTER TABLE public.ai_actions ADD CONSTRAINT ai_actions_status_check CHECK (
  status = ANY (
    ARRAY[
      'pending',
      'awaiting_confirmation',
      'completed',
      'failed',
      'rejected'
    ]::text[]
  )
);

-- 3) Complete / reject an action (family must own the conversation)
CREATE OR REPLACE FUNCTION public.complete_ai_action(
  p_action_id UUID,
  p_status TEXT,
  p_result_data JSONB DEFAULT '{}'::jsonb,
  p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('completed', 'failed', 'rejected') THEN
    RAISE EXCEPTION 'complete_ai_action: invalid status %', p_status;
  END IF;

  UPDATE public.ai_actions a
  SET
    status = p_status,
    result_data = COALESCE(p_result_data, '{}'::jsonb),
    error_message = p_error_message,
    completed_at = NOW()
  WHERE a.id = p_action_id
    AND EXISTS (
      SELECT 1
      FROM public.ai_conversations c
      INNER JOIN public.profiles p ON p.family_id = c.family_id AND p.id = auth.uid()
      WHERE c.id = a.conversation_id
    );

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_ai_action(UUID, TEXT, JSONB, TEXT) TO authenticated;

-- Client records commits via existing record_ai_action(UUID, TEXT, JSONB, TEXT): put proposal + result in action_data,
-- set status 'completed', and rely on source_channel default 'doodle_chat'. result_data can be filled later via complete_ai_action if needed.
