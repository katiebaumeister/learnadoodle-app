-- Fix RPC argument name so PostgREST calls using {_family_id: ...} resolve correctly.
-- PostgREST matches function parameters by name for RPC payloads.

DROP FUNCTION IF EXISTS public.get_family_timezone(uuid);

CREATE OR REPLACE FUNCTION public.get_family_timezone(_family_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
BEGIN
  SELECT f.timezone
  INTO v_tz
  FROM public.family f
  WHERE f.id = _family_id
  LIMIT 1;

  RETURN COALESCE(NULLIF(btrim(v_tz), ''), 'America/New_York');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_family_timezone(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_family_timezone(uuid) TO service_role;
