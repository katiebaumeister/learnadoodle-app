-- PostgREST PGRST203: "Could not choose the best candidate function" when multiple
-- create_ai_conversation overloads exist (e.g. TEXT vs VARCHAR). Drop all public overloads
-- and recreate a single canonical signature so RPC calls from the client resolve unambiguously.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'create_ai_conversation'
      AND n.nspname = 'public'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION create_ai_conversation(
  p_family_id UUID,
  p_conversation_type TEXT DEFAULT 'doodlebot',
  p_title TEXT DEFAULT NULL,
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
  INSERT INTO ai_conversations (family_id, conversation_type, title, metadata)
  VALUES (p_family_id, COALESCE(p_conversation_type, 'doodlebot'), p_title, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_ai_conversation(UUID, TEXT, TEXT, JSONB) TO authenticated;
