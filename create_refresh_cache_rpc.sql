-- Create or replace refresh_calendar_days_cache RPC
-- This function refreshes the calendar_days_cache for a date range
-- It considers schedule_rules and schedule_overrides (including day_off blackouts)

-- Drop existing function if it exists
-- PostgreSQL identifies functions by signature (name + parameter types), not parameter names
-- But we need to drop it first if parameter names are changing
DROP FUNCTION IF EXISTS refresh_calendar_days_cache(uuid, date, date) CASCADE;

CREATE OR REPLACE FUNCTION refresh_calendar_days_cache(
  p_family_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update cache by applying schedule_overrides (including day_off blackouts)
  -- Only update days that have overrides, preserve existing cache for other days
  
  -- First, CLEAR blackouts that no longer exist (reset days that were blacked out but no longer have overrides)
  UPDATE calendar_days_cache cdc
  SET 
    day_status = NULL, -- Reset to NULL so it can be recalculated from rules
    first_block_start = NULL::TIME,
    last_block_end = NULL::TIME,
    source_summary = jsonb_build_object('source', 'refresh_cache', 'cleared_blackout', true),
    generated_at = NOW()
  WHERE cdc.family_id = p_family_id
    AND cdc.date BETWEEN p_from_date AND p_to_date
    AND cdc.day_status = 'off' -- Only clear existing blackouts
    AND NOT EXISTS (
      -- Clear if there's no matching active day_off override
      SELECT 1 FROM schedule_overrides o
      WHERE o.date = cdc.date
        AND o.is_active = true
        AND o.override_kind = 'day_off'
        AND (
          (o.scope_type = 'family' AND o.scope_id = p_family_id)
          OR (o.scope_type = 'child' AND o.scope_id = cdc.child_id)
        )
    );
  
  -- Then, update existing cache entries that have day_off overrides
  UPDATE calendar_days_cache cdc
  SET 
    day_status = 'off',
    first_block_start = NULL::TIME,
    last_block_end = NULL::TIME,
    source_summary = jsonb_build_object('source', 'refresh_cache', 'has_override', true),
    generated_at = NOW()
  WHERE cdc.family_id = p_family_id
    AND cdc.date BETWEEN p_from_date AND p_to_date
    AND EXISTS (
      SELECT 1 FROM schedule_overrides o
      WHERE o.date = cdc.date
        AND o.is_active = true
        AND o.override_kind = 'day_off'
        AND (
          (o.scope_type = 'family' AND o.scope_id = p_family_id)
          OR (o.scope_type = 'child' AND o.scope_id = cdc.child_id)
        )
    );
  
  -- Insert new cache entries for child-specific overrides that don't exist in cache yet
  INSERT INTO calendar_days_cache (
    date,
    family_id,
    child_id,
    day_status,
    first_block_start,
    last_block_end,
    source_summary
  )
  SELECT DISTINCT
    o.date,
    p_family_id,
    o.scope_id AS child_id,
    'off' AS day_status,
    NULL::TIME AS first_block_start,
    NULL::TIME AS last_block_end,
    jsonb_build_object('source', 'refresh_cache', 'has_override', true)
  FROM schedule_overrides o
  WHERE o.date BETWEEN p_from_date AND p_to_date
    AND o.is_active = true
    AND o.override_kind = 'day_off'
    AND o.scope_type = 'child'
    AND o.scope_id IN (SELECT id FROM children WHERE family_id = p_family_id)
    AND NOT EXISTS (
      SELECT 1 FROM calendar_days_cache cdc
      WHERE cdc.family_id = p_family_id
        AND cdc.date = o.date
        AND cdc.child_id = o.scope_id
    )
  ON CONFLICT (date, family_id, child_id) DO NOTHING;
  
  -- Insert cache entries for family-wide overrides (one per child)
  INSERT INTO calendar_days_cache (
    date,
    family_id,
    child_id,
    day_status,
    first_block_start,
    last_block_end,
    source_summary
  )
  SELECT DISTINCT
    o.date,
    p_family_id,
    c.id AS child_id,
    'off' AS day_status,
    NULL::TIME AS first_block_start,
    NULL::TIME AS last_block_end,
    jsonb_build_object('source', 'refresh_cache', 'has_override', true)
  FROM schedule_overrides o
  CROSS JOIN children c
  WHERE o.date BETWEEN p_from_date AND p_to_date
    AND o.is_active = true
    AND o.override_kind = 'day_off'
    AND o.scope_type = 'family'
    AND o.scope_id = p_family_id
    AND c.family_id = p_family_id
    AND NOT EXISTS (
      SELECT 1 FROM calendar_days_cache cdc
      WHERE cdc.family_id = p_family_id
        AND cdc.date = o.date
        AND cdc.child_id = c.id
    )
  ON CONFLICT (date, family_id, child_id) DO UPDATE SET
    day_status = 'off',
    first_block_start = NULL::TIME,
    last_block_end = NULL::TIME,
    source_summary = jsonb_build_object('source', 'refresh_cache', 'has_override', true),
    generated_at = NOW();
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION refresh_calendar_days_cache(UUID, DATE, DATE) TO authenticated;

-- Verify the function was created
SELECT 
  proname,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc
WHERE proname = 'refresh_calendar_days_cache';

-- Test query to verify cache entries (run this manually after creating a blackout)
-- SELECT 
--   date,
--   family_id,
--   child_id,
--   day_status,
--   first_block_start,
--   last_block_end
-- FROM calendar_days_cache
-- WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
--   AND date BETWEEN '2025-11-04' AND '2025-11-07'
-- ORDER BY date, child_id;

