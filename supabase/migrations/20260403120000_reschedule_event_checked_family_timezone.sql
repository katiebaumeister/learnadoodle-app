-- reschedule_event_checked used UTC for date/time when validating against calendar_days_cache.
-- Cache rows use family-local calendar dates and local TIME blocks (same semantics as get_month_view).
-- That mismatch caused false outside_availability (400) on drag-drop after moving across timezones / non-UTC users.
-- Also: whole-family events may have child_id NULL with child_ids[] set; treat as not_found incorrectly before.

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
  v_child_ids UUID[];
  v_tz TEXT;
  v_date DATE;
  v_day_status TEXT;
  v_first_block TIME;
  v_last_block TIME;
  v_new_start_time TIME;
  v_new_end_time TIME;
BEGIN
  SELECT e.child_id, e.family_id, e.child_ids
  INTO v_child, v_family, v_child_ids
  FROM events e
  WHERE e.id = _event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_child IS NULL AND v_child_ids IS NOT NULL AND array_length(v_child_ids, 1) IS NOT NULL AND array_length(v_child_ids, 1) > 0 THEN
    v_child := v_child_ids[1];
  END IF;

  v_tz := COALESCE(get_family_timezone(v_family), 'America/New_York');

  -- Local calendar date and wall-clock times (align with calendar_days_cache + get_month_view)
  v_date := (_new_start AT TIME ZONE v_tz)::date;
  v_new_start_time := (_new_start AT TIME ZONE v_tz)::time;
  v_new_end_time := (_new_end AT TIME ZONE v_tz)::time;

  -- No assignable child: skip availability cache (overlap / DB rules still apply)
  IF v_child IS NULL THEN
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
  END IF;

  SELECT cdc.day_status, cdc.first_block_start, cdc.last_block_end
  INTO v_day_status, v_first_block, v_last_block
  FROM calendar_days_cache cdc
  WHERE cdc.family_id = v_family
    AND cdc.child_id = v_child
    AND cdc.date = v_date;

  IF v_day_status = 'off' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'outside_availability',
      'detail', 'This day is marked as off (no availability)'
    );
  END IF;

  IF v_day_status IS NOT NULL THEN
    IF v_first_block IS NOT NULL AND v_last_block IS NOT NULL THEN
      IF v_new_start_time < v_first_block THEN
        RETURN jsonb_build_object(
          'ok', false,
          'reason', 'outside_availability',
          'detail', format('Start time %s is before first available block %s', v_new_start_time, v_first_block)
        );
      END IF;

      IF v_new_end_time > v_last_block THEN
        RETURN jsonb_build_object(
          'ok', false,
          'reason', 'outside_availability',
          'detail', format('End time %s is after last available block %s', v_new_end_time, v_last_block)
        );
      END IF;
    END IF;
  END IF;

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
END;
$$;

ALTER FUNCTION reschedule_event_checked(UUID, TIMESTAMPTZ, TIMESTAMPTZ) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION reschedule_event_checked(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION reschedule_event_checked(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION reschedule_event_checked(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
