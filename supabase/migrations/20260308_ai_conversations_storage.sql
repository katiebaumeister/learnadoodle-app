-- AI conversation storage: short-term memory (UI) persists here.
-- Frontend sends last 3–5 messages to the LLM; full history stored in ai_conversations + ai_messages.
--
-- Stored message shape (example):
--   { "conversation_id": "uuid", "role": "assistant", "content": "Emma is 64% through Math.", "created_at": "timestamp" }

-- Conversations: one per thread (e.g. Doodle chat session per family)
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  conversation_type TEXT NOT NULL DEFAULT 'doodlebot',
  title TEXT,
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_family_active
  ON ai_conversations(family_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated
  ON ai_conversations(updated_at DESC);

COMMENT ON TABLE ai_conversations IS 'AI chat threads; one per session (e.g. Doodle assistant).';

-- Messages: one row per user or assistant message
CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL DEFAULT '',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alias for clients that select "timestamp" (same as created_at)
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMPTZ DEFAULT NOW();
UPDATE ai_messages SET "timestamp" = created_at WHERE "timestamp" IS NULL;
ALTER TABLE ai_messages ALTER COLUMN "timestamp" SET DEFAULT NOW();
ALTER TABLE ai_messages ALTER COLUMN "timestamp" SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
  ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_created
  ON ai_messages(conversation_id, created_at ASC);

COMMENT ON TABLE ai_messages IS 'Individual messages in an AI conversation (role, content, created_at).';

-- Optional: actions triggered during a conversation (e.g. tool calls, reschedule)
CREATE TABLE IF NOT EXISTS ai_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  action_data JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_actions_conversation
  ON ai_actions(conversation_id);

-- RLS
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_actions ENABLE ROW LEVEL SECURITY;

-- Only family members can access their conversations (via profiles.family_id)
CREATE POLICY ai_conversations_family ON ai_conversations
  FOR ALL
  USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY ai_messages_via_conversation ON ai_messages
  FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM ai_conversations WHERE family_id IN (
        SELECT family_id FROM profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM ai_conversations WHERE family_id IN (
        SELECT family_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY ai_actions_via_conversation ON ai_actions
  FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM ai_conversations WHERE family_id IN (
        SELECT family_id FROM profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM ai_conversations WHERE family_id IN (
        SELECT family_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- RPC: create a new conversation (returns new id)
CREATE OR REPLACE FUNCTION create_ai_conversation(
  p_family_id UUID,
  p_conversation_type TEXT DEFAULT 'doodlebot',
  p_title TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO ai_conversations (family_id, conversation_type, title, metadata)
  VALUES (p_family_id, COALESCE(p_conversation_type, 'doodlebot'), p_title, COALESCE(p_metadata, '{}'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- RPC: add a message (returns new message id)
CREATE OR REPLACE FUNCTION add_ai_message(
  p_conversation_id UUID,
  p_role TEXT,
  p_content TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_role NOT IN ('user', 'assistant', 'system') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;
  INSERT INTO ai_messages (conversation_id, role, content, metadata)
  VALUES (p_conversation_id, p_role, p_content, COALESCE(p_metadata, '{}'))
  RETURNING id INTO v_id;
  UPDATE ai_conversations SET updated_at = NOW() WHERE id = p_conversation_id;
  RETURN v_id;
END;
$$;

-- RPC: record an AI action (returns new action id)
CREATE OR REPLACE FUNCTION record_ai_action(
  p_conversation_id UUID,
  p_action_type TEXT,
  p_action_data JSONB DEFAULT '{}',
  p_status TEXT DEFAULT 'pending'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO ai_actions (conversation_id, action_type, action_data, status)
  VALUES (p_conversation_id, p_action_type, COALESCE(p_action_data, '{}'), COALESCE(p_status, 'pending'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_actions TO authenticated;
GRANT EXECUTE ON FUNCTION create_ai_conversation(UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION add_ai_message(UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION record_ai_action(UUID, TEXT, JSONB, TEXT) TO authenticated;
