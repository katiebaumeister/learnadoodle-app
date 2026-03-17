-- RPC for ensure_family: create one family row and return its id.
-- Avoids supabase-py SyncQueryRequestBuilder (insert().select() not supported); backend calls this instead of table insert.
CREATE OR REPLACE FUNCTION public.create_family_return_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid := gen_random_uuid();
BEGIN
  -- Insert with explicit id so we don't depend on DEFAULT for every column
  INSERT INTO family (id) VALUES (new_id);
  RETURN new_id;
EXCEPTION
  WHEN OTHERS THEN
    -- If (id) only fails (e.g. NOT NULL columns), try DEFAULT VALUES
    INSERT INTO family DEFAULT VALUES
    RETURNING id INTO new_id;
    RETURN new_id;
END;
$$;

COMMENT ON FUNCTION public.create_family_return_id IS 'Creates one family row and returns its id; used by POST /api/onboarding/ensure_family.';

GRANT EXECUTE ON FUNCTION public.create_family_return_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.create_family_return_id() TO authenticated;
