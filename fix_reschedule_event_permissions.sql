-- Fix permissions for reschedule_event_checked RPC function
-- The function needs to read from calendar_days_cache but doesn't have permission

-- First, ensure the function owner (postgres or supabase_admin) has SELECT permission
-- on calendar_days_cache
GRANT SELECT ON calendar_days_cache TO postgres;
GRANT SELECT ON calendar_days_cache TO supabase_admin;
GRANT SELECT ON calendar_days_cache TO service_role;

-- Also ensure the function can read from events table (it already updates it)
GRANT SELECT, UPDATE ON events TO postgres;
GRANT SELECT, UPDATE ON events TO supabase_admin;
GRANT SELECT, UPDATE ON events TO service_role;

-- Recreate the function to ensure it's owned by a role with proper permissions
-- Drop and recreate to ensure ownership is correct
DROP FUNCTION IF EXISTS reschedule_event_checked(UUID, TIMESTAMPTZ, TIMESTAMPTZ) CASCADE;

CREATE OR REPLACE FUNCTION reschedule_event_checked(
  _event_id UUID,
  _new_start TIMESTAMPTZ,
  _new_end TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  v_child UUID;
  v_family UUID;
  v_date DATE;
  v_day_status TEXT;
  v_first_block TIME;
  v_last_block TIME;
  v_new_start_time TIME;
  v_new_end_time TIME;
BEGIN
  -- Get event details
  SELECT child_id, family_id 
  INTO v_child, v_family 
  FROM events 
  WHERE id = _event_id;
  
  IF v_child IS NULL THEN 
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Get the date and time components
  v_date := (_new_start AT TIME ZONE 'UTC')::date;
  v_new_start_time := (_new_start AT TIME ZONE 'UTC')::time;
  v_new_end_time := (_new_end AT TIME ZONE 'UTC')::time;

  -- Check availability from cache
  -- This should work now with proper permissions
  SELECT day_status, first_block_start, last_block_end
  INTO v_day_status, v_first_block, v_last_block
  FROM calendar_days_cache
  WHERE family_id = v_family
    AND child_id = v_child
    AND date = v_date;

  -- If day is explicitly marked as 'off', reject
  IF v_day_status = 'off' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'outside_availability', 'detail', 'This day is marked as off (no availability)');
  END IF;

  -- If we have cache data, validate against it
  IF v_day_status IS NOT NULL THEN
    -- Check if new time is within available blocks
    IF v_first_block IS NOT NULL AND v_last_block IS NOT NULL THEN
      IF v_new_start_time < v_first_block THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'outside_availability', 'detail', format('Start time %s is before first available block %s', v_new_start_time, v_first_block));
      END IF;
      
      IF v_new_end_time > v_last_block THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'outside_availability', 'detail', format('End time %s is after last available block %s', v_new_end_time, v_last_block));
      END IF;
    END IF;
    -- If we have day_status but no time blocks, allow the move (cache might be incomplete)
  END IF;
  
  -- If no cache entry exists, allow the move (availability not yet configured for this date)
  -- This is more permissive - we only reject if explicitly marked as 'off' or outside defined blocks

  -- Try the update; exclusion constraint will block overlaps
  BEGIN
    UPDATE events 
    SET start_ts = _new_start, 
        end_ts = _new_end,
        updated_at = NOW()
    WHERE id = _event_id;
    
    RETURN jsonb_build_object('ok', true);
  EXCEPTION 
    WHEN exclusion_violation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'overlap');
    WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'database_error');
  END;
END $$;

-- Set function owner to postgres (or supabase_admin) which has proper permissions
ALTER FUNCTION reschedule_event_checked(UUID, TIMESTAMPTZ, TIMESTAMPTZ) OWNER TO postgres;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION reschedule_event_checked(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION reschedule_event_checked(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION reschedule_event_checked(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- Verify permissions
SELECT 
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.role_table_grants
WHERE grantee IN ('postgres', 'supabase_admin', 'service_role')
    AND table_name = 'calendar_days_cache'
ORDER BY grantee, privilege_type;

