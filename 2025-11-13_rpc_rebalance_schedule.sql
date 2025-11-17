-- RPC: Rebalance schedule by proposing moves for events
-- Part of Phase 1 - Year-Round Intelligence Core
-- Returns proposed moves without mutating data

CREATE OR REPLACE FUNCTION public.rebalance_schedule(
  p_year_plan_id uuid,
  p_event_id uuid,
  p_new_start timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _year_plan_family_id uuid;
  _event_family_id uuid;
  _event_subject_id uuid;
  _event_child_id uuid;
  _event_subject_name text;
  _proposed_moves jsonb := '[]'::jsonb;
  _move_record jsonb;
  _future_event record;
BEGIN
  -- Verify year plan exists and get its family_id
  SELECT family_id INTO _year_plan_family_id
  FROM year_plans
  WHERE id = p_year_plan_id;
  
  IF _year_plan_family_id IS NULL THEN
    RAISE EXCEPTION 'Year plan not found';
  END IF;
  
  -- Get event details
  SELECT family_id, subject_id, child_id INTO _event_family_id, _event_subject_id, _event_child_id
  FROM events
  WHERE id = p_event_id;
  
  IF _event_family_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;
  
  -- Verify event belongs to the same family as the year plan
  IF _event_family_id != _year_plan_family_id THEN
    RAISE EXCEPTION 'Event does not belong to year plan family';
  END IF;
  
  -- Get subject name (may be NULL if subject_id is NULL)
  IF _event_subject_id IS NOT NULL THEN
    SELECT name INTO _event_subject_name
    FROM subject
    WHERE id = _event_subject_id;
  ELSE
    -- If no subject_id, try to get subject name from event title
    SELECT title INTO _event_subject_name
    FROM events
    WHERE id = p_event_id;
  END IF;
  
  -- Find all future events for the same child and subject
  -- Propose shifting them proportionally
  -- Note: If subject_id is NULL, match by title instead
  FOR _future_event IN
    SELECT 
      e.id,
      e.start_ts,
      e.end_ts,
      e.minutes,
      e.title,
      EXTRACT(EPOCH FROM (e.start_ts - (SELECT start_ts FROM events WHERE id = p_event_id))) / 86400 AS days_offset
    FROM events e
    WHERE e.family_id = _event_family_id
      AND e.child_id = _event_child_id
      AND (
        (_event_subject_id IS NOT NULL AND e.subject_id = _event_subject_id)
        OR (_event_subject_id IS NULL AND e.title = (SELECT title FROM events WHERE id = p_event_id))
      )
      AND e.start_ts >= (SELECT start_ts FROM events WHERE id = p_event_id)
      AND e.id != p_event_id
      AND e.status = 'scheduled'
      AND e.year_plan_id = p_year_plan_id  -- Only rebalance events from the same year plan
    ORDER BY e.start_ts
  LOOP
    -- Check if the proposed day is frozen or not shiftable
    IF NOT EXISTS (
      SELECT 1 FROM calendar_days_cache
      WHERE date = p_new_start::date
        AND family_id = _event_family_id
        AND (child_id = _event_child_id OR child_id IS NULL)
        AND (is_frozen = true OR is_shiftable = false)
    ) THEN
      -- Calculate new start time maintaining the same time of day offset
      _move_record := jsonb_build_object(
        'eventId', _future_event.id,
        'currentStart', _future_event.start_ts,
        'proposedStart', p_new_start + (_future_event.days_offset || ' days')::interval,
        'reason', format('Shifted to maintain %s schedule', COALESCE(_event_subject_name, 'subject'))
      );
      
      _proposed_moves := _proposed_moves || jsonb_build_array(_move_record);
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'ok', true,
    'moves', _proposed_moves,
    'count', jsonb_array_length(_proposed_moves)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', SQLERRM
    );
END;
$$;

