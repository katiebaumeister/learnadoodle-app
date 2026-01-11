-- Update refresh_calendar_days_cache to include pattern_day
-- This ensures pattern days are stored in the cache for quick lookup
-- Safely handles case where get_pattern_day_for_date function doesn't exist yet

CREATE OR REPLACE FUNCTION refresh_calendar_days_cache(
  p_family_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pattern_function_exists BOOLEAN;
BEGIN
  -- Check if get_pattern_day_for_date function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'get_pattern_day_for_date'
      AND pg_get_function_arguments(p.oid) LIKE '%uuid%date%uuid%'
  ) INTO v_pattern_function_exists;
  
  -- Update cache by applying schedule_overrides (including day_off blackouts)
  -- Only update days that have overrides, preserve existing cache for other days
  
  -- First, CLEAR blackouts that no longer exist (reset days that were blacked out but no longer have overrides)
  UPDATE calendar_days_cache cdc
  SET 
    day_status = NULL, -- Reset to NULL so it can be recalculated from rules
    first_block_start = NULL::TIME,
    last_block_end = NULL::TIME,
    pattern_day = CASE 
      WHEN v_pattern_function_exists THEN 
        get_pattern_day_for_date(p_family_id, cdc.date, cdc.child_id)
      ELSE NULL
    END,
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
    pattern_day = CASE 
      WHEN v_pattern_function_exists THEN 
        get_pattern_day_for_date(p_family_id, cdc.date, cdc.child_id)
      ELSE NULL
    END,
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
  
  -- Update pattern_day for all cache entries in date range (only if function exists)
  IF v_pattern_function_exists THEN
    UPDATE calendar_days_cache cdc
    SET 
      pattern_day = get_pattern_day_for_date(p_family_id, cdc.date, cdc.child_id),
      generated_at = NOW()
    WHERE cdc.family_id = p_family_id
      AND cdc.date BETWEEN p_from_date AND p_to_date;
  END IF;
  
  -- Insert new cache entries for child-specific overrides that don't exist in cache yet
  INSERT INTO calendar_days_cache (
    date,
    family_id,
    child_id,
    day_status,
    first_block_start,
    last_block_end,
    pattern_day,
    source_summary
  )
  SELECT DISTINCT
    o.date,
    p_family_id,
    o.scope_id AS child_id,
    'off' AS day_status,
    NULL::TIME AS first_block_start,
    NULL::TIME AS last_block_end,
    CASE 
      WHEN v_pattern_function_exists THEN 
        get_pattern_day_for_date(p_family_id, o.date, o.scope_id)
      ELSE NULL
    END AS pattern_day,
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
    pattern_day,
    source_summary
  )
  SELECT DISTINCT
    o.date,
    p_family_id,
    c.id AS child_id,
    'off' AS day_status,
    NULL::TIME AS first_block_start,
    NULL::TIME AS last_block_end,
    CASE 
      WHEN v_pattern_function_exists THEN 
        get_pattern_day_for_date(p_family_id, o.date, c.id)
      ELSE NULL
    END AS pattern_day,
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
    pattern_day = CASE 
      WHEN v_pattern_function_exists THEN 
        get_pattern_day_for_date(p_family_id, EXCLUDED.date, EXCLUDED.child_id)
      ELSE NULL
    END,
    source_summary = jsonb_build_object('source', 'refresh_cache', 'has_override', true),
    generated_at = NOW();
END;
$$;

