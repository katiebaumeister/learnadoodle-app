-- PostgREST PGRST203: multiple overloads of add_ai_message / record_ai_action (TEXT vs VARCHAR)
-- confuse PostgREST. Drop all public overloads and recreate single canonical signatures.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'add_ai_message'
      AND n.nspname = 'public'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION add_ai_message(
  p_conversation_id UUID,
  p_role TEXT,
  p_content TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
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
  VALUES (p_conversation_id, p_role, p_content, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  UPDATE ai_conversations SET updated_at = NOW() WHERE id = p_conversation_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION add_ai_message(UUID, TEXT, TEXT, JSONB) TO authenticated;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'record_ai_action'
      AND n.nspname = 'public'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION record_ai_action(
  p_conversation_id UUID,
  p_action_type TEXT,
  p_action_data JSONB DEFAULT '{}'::jsonb,
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
  VALUES (p_conversation_id, p_action_type, COALESCE(p_action_data, '{}'::jsonb), COALESCE(p_status, 'pending'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION record_ai_action(UUID, TEXT, JSONB, TEXT) TO authenticated;
