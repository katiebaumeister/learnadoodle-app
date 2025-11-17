-- RPC for rescheduling events with validation
-- Checks availability windows and prevents overlaps

CREATE OR REPLACE FUNCTION reschedule_event_checked(
  _event_id UUID,
  _new_start TIMESTAMPTZ,
  _new_end TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql
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
  SELECT day_status, first_block_start, last_block_end
  INTO v_day_status, v_first_block, v_last_block
  FROM calendar_days_cache
  WHERE family_id = v_family
    AND child_id = v_child
    AND date = v_date;

  -- If no cache entry or day is off, reject
  IF v_day_status IS NULL OR v_day_status = 'off' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'outside_availability');
  END IF;

  -- Check if new time is within available blocks
  IF v_new_start_time < v_first_block OR v_new_end_time > v_last_block THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'outside_availability');
  END IF;

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

-- Grant permissions
GRANT EXECUTE ON FUNCTION reschedule_event_checked(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION reschedule_event_checked(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
