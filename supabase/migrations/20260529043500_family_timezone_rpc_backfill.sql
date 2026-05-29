-- Ensure family timezone storage and helper RPC exist in all environments.
-- This removes /rpc/get_family_timezone 404s and lets backend use real family timezone.

ALTER TABLE public.family
ADD COLUMN IF NOT EXISTS timezone text;

UPDATE public.family
SET timezone = 'America/New_York'
WHERE timezone IS NULL OR btrim(timezone) = '';

CREATE OR REPLACE FUNCTION public.get_family_timezone(p_family_id uuid)
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
  WHERE f.id = p_family_id
  LIMIT 1;

  RETURN COALESCE(NULLIF(btrim(v_tz), ''), 'America/New_York');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_family_timezone(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_family_timezone(uuid) TO service_role;
