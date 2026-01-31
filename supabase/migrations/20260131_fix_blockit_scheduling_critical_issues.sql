-- Migration: Fix Critical Issues in Blockit Week Scheduling RPCs
-- Addresses: auth checks, NULL child_id handling, CTE bugs, and adds bulk apply

-- Helper function to normalize child_ids (NULL-safe)
CREATE OR REPLACE FUNCTION public.normalize_child_ids(_child_ids uuid[], _child_id uuid)
RETURNS uuid[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _child_ids IS NOT NULL THEN _child_ids
    WHEN _child_id IS NOT NULL THEN ARRAY[_child_id]
    ELSE ARRAY[]::uuid[]
  END;
$$;

-- 1) Fix get_freebusy_week: Use is_family_member and NULL-safe child_ids
CREATE OR REPLACE FUNCTION public.get_freebusy_week(
  _family_id uuid,
  _from timestamptz,
  _to timestamptz,
  _child_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Use canonical family membership check
  IF NOT public.is_family_member(_family_id) THEN
    RAISE EXCEPTION 'Not authorized for family %', _family_id;
  END IF;

  WITH ev AS (
    SELECT
      e.id,
      e.title,
      e.start_ts,
      e.end_ts,
      public.normalize_child_ids(e.child_ids, e.child_id) AS effective_child_ids,
      e.event_type
    FROM public.events e
    WHERE e.family_id = _family_id
      AND e.deleted_at IS NULL
      AND e.canceled_at IS NULL
      AND e.is_backlog = false
      AND e.status IS DISTINCT FROM 'canceled'
      AND e.start_ts < _to
      AND e.end_ts > _from
  ),
  filtered AS (
    SELECT *
    FROM ev
    WHERE _child_ids IS NULL
      OR (effective_child_ids && _child_ids) -- array overlap
  )
  SELECT jsonb_build_object(
    'busy', COALESCE(jsonb_agg(jsonb_build_object(
      'event_id', id,
      'start_ts', start_ts,
      'end_ts', end_ts,
      'title', title,
      'event_type', event_type,
      'child_ids', effective_child_ids
    ) ORDER BY start_ts), '[]'::jsonb)
  )
  INTO result
  FROM filtered;

  RETURN result;
END;
$$;

-- 2) Fix validate_event_drop: Use is_family_member, fix CTE bug, NULL-safe child_ids
CREATE OR REPLACE FUNCTION public.validate_event_drop(
  _family_id uuid,
  _event_id uuid,
  _proposed_start timestamptz,
  _proposed_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e record;
  conflicts jsonb := '[]'::jsonb;
  ok boolean := true;
  target_child_ids uuid[];
BEGIN
  IF _proposed_end <= _proposed_start THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'Invalid range',
      'conflicts', '[]'::jsonb,
      'suggested_slots', '[]'::jsonb
    );
  END IF;

  -- Use canonical family membership check
  IF NOT public.is_family_member(_family_id) THEN
    RAISE EXCEPTION 'Not authorized for family %', _family_id;
  END IF;

  -- Get target event and compute effective_child_ids
  SELECT 
    e.*,
    public.normalize_child_ids(e.child_ids, e.child_id) AS effective_child_ids
  INTO e
  FROM public.events e
  WHERE e.id = _event_id
    AND e.family_id = _family_id
    AND e.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'Event not found',
      'conflicts', '[]'::jsonb,
      'suggested_slots', '[]'::jsonb
    );
  END IF;

  target_child_ids := e.effective_child_ids;

  IF COALESCE(e.is_locked, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'Event locked',
      'conflicts', '[]'::jsonb,
      'suggested_slots', '[]'::jsonb
    );
  END IF;

  -- Optional move window enforcement
  IF e.move_window_start IS NOT NULL AND _proposed_start < e.move_window_start THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Before move window', 'conflicts', '[]'::jsonb, 'suggested_slots', '[]'::jsonb);
  END IF;
  IF e.move_window_end IS NOT NULL AND _proposed_end > e.move_window_end THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'After move window', 'conflicts', '[]'::jsonb, 'suggested_slots', '[]'::jsonb);
  END IF;

  -- Overlap check with other scheduled events intersecting same children
  -- FIXED: CTE now properly selects from events table
  WITH candidates AS (
    SELECT
      o.id,
      o.title,
      o.start_ts,
      o.end_ts,
      public.normalize_child_ids(o.child_ids, o.child_id) AS other_child_ids,
      o.event_type
    FROM public.events o
    WHERE o.family_id = _family_id
      AND o.id <> _event_id
      AND o.deleted_at IS NULL
      AND o.canceled_at IS NULL
      AND o.is_backlog = false
      AND o.status IS DISTINCT FROM 'canceled'
      AND o.start_ts < _proposed_end
      AND o.end_ts > _proposed_start
  ),
  overlapped AS (
    SELECT c.*
    FROM candidates c
    WHERE c.other_child_ids && target_child_ids  -- Use variable instead of CTE
  )
  SELECT
    CASE WHEN count(*) > 0 THEN false ELSE true END,
    COALESCE(jsonb_agg(jsonb_build_object(
      'event_id', id,
      'title', title,
      'start_ts', start_ts,
      'end_ts', end_ts,
      'event_type', event_type,
      'child_ids', other_child_ids
    )), '[]'::jsonb)
  INTO ok, conflicts
  FROM overlapped;

  RETURN jsonb_build_object(
    'ok', ok,
    'conflicts', conflicts,
    'suggested_slots', '[]'::jsonb
  );
END;
$$;

-- 3) Fix apply_event_time_update: Use is_family_member
CREATE OR REPLACE FUNCTION public.apply_event_time_update(
  _family_id uuid,
  _event_id uuid,
  _start_ts timestamptz,
  _end_ts timestamptz,
  _reason text DEFAULT 'drag_drop'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  validation jsonb;
  before_row jsonb;
  after_row jsonb;
BEGIN
  -- Use canonical family membership check
  IF NOT public.is_family_member(_family_id) THEN
    RAISE EXCEPTION 'Not authorized for family %', _family_id;
  END IF;

  -- Capture "before"
  SELECT to_jsonb(e.*) INTO before_row
  FROM public.events e
  WHERE e.id = _event_id AND e.family_id = _family_id;

  IF before_row IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Validate
  SELECT public.validate_event_drop(_family_id, _event_id, _start_ts, _end_ts) INTO validation;
  IF (validation->>'ok')::boolean = false THEN
    RETURN jsonb_build_object(
      'ok', false,
      'validation', validation
    );
  END IF;

  -- Apply update
  UPDATE public.events
  SET start_ts = _start_ts,
      end_ts = _end_ts,
      updated_at = now()
  WHERE id = _event_id
    AND family_id = _family_id;

  -- Return "after"
  SELECT to_jsonb(e.*) INTO after_row
  FROM public.events e
  WHERE e.id = _event_id AND e.family_id = _family_id;

  RETURN jsonb_build_object(
    'ok', true,
    'reason', _reason,
    'before', before_row,
    'after', after_row
  );
END;
$$;

-- 4) Fix cancel_event: Use is_family_member
CREATE OR REPLACE FUNCTION public.cancel_event(
  _family_id uuid,
  _event_id uuid,
  _reason text DEFAULT 'canceled'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e jsonb;
BEGIN
  -- Use canonical family membership check
  IF NOT public.is_family_member(_family_id) THEN
    RAISE EXCEPTION 'Not authorized for family %', _family_id;
  END IF;

  UPDATE public.events
  SET status = 'canceled',
      canceled_at = now(),
      updated_at = now()
  WHERE id = _event_id
    AND family_id = _family_id
    AND deleted_at IS NULL
  RETURNING to_jsonb(events.*) INTO e;

  RETURN jsonb_build_object('ok', true, 'event', e, 'reason', _reason);
END;
$$;

-- 5) NEW: Bulk validation RPC
CREATE OR REPLACE FUNCTION public.validate_bulk_event_moves(
  _family_id uuid,
  _moves jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  move_record jsonb;
  validation jsonb;
  result jsonb := '[]'::jsonb;
  all_ok boolean := true;
BEGIN
  -- Use canonical family membership check
  IF NOT public.is_family_member(_family_id) THEN
    RAISE EXCEPTION 'Not authorized for family %', _family_id;
  END IF;

  -- Validate each move
  FOR move_record IN SELECT * FROM jsonb_array_elements(_moves)
  LOOP
    SELECT public.validate_event_drop(
      _family_id,
      (move_record->>'event_id')::uuid,
      (move_record->>'start_ts')::timestamptz,
      (move_record->>'end_ts')::timestamptz
    ) INTO validation;

    IF (validation->>'ok')::boolean = false THEN
      all_ok := false;
    END IF;

    result := result || jsonb_build_object(
      'event_id', move_record->>'event_id',
      'ok', (validation->>'ok')::boolean,
      'reason', validation->>'reason',
      'conflicts', validation->'conflicts'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', all_ok,
    'results', result
  );
END;
$$;

-- 6) NEW: Atomic bulk apply RPC
CREATE OR REPLACE FUNCTION public.apply_bulk_event_time_updates(
  _family_id uuid,
  _moves jsonb,
  _reason text DEFAULT 'bulk_reschedule'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  move_record jsonb;
  validation jsonb;
  before_row jsonb;
  after_row jsonb;
  results jsonb := '[]'::jsonb;
  all_ok boolean := true;
  validation_result jsonb;
BEGIN
  -- Use canonical family membership check
  IF NOT public.is_family_member(_family_id) THEN
    RAISE EXCEPTION 'Not authorized for family %', _family_id;
  END IF;

  -- First, validate ALL moves
  SELECT public.validate_bulk_event_moves(_family_id, _moves) INTO validation_result;
  
  IF (validation_result->>'ok')::boolean = false THEN
    -- Return validation results without applying any changes
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'One or more moves failed validation',
      'results', validation_result->'results'
    );
  END IF;

  -- All validations passed - apply all moves in a single transaction
  -- (This function itself runs in a transaction, so all updates are atomic)
  FOR move_record IN SELECT * FROM jsonb_array_elements(_moves)
  LOOP
    -- Capture "before"
    SELECT to_jsonb(e.*) INTO before_row
    FROM public.events e
    WHERE e.id = (move_record->>'event_id')::uuid 
      AND e.family_id = _family_id;

    IF before_row IS NULL THEN
      all_ok := false;
      results := results || jsonb_build_object(
        'event_id', move_record->>'event_id',
        'ok', false,
        'reason', 'Event not found'
      );
      CONTINUE;
    END IF;

    -- Apply update
    UPDATE public.events
    SET start_ts = (move_record->>'start_ts')::timestamptz,
        end_ts = (move_record->>'end_ts')::timestamptz,
        updated_at = now()
    WHERE id = (move_record->>'event_id')::uuid
      AND family_id = _family_id;

    -- Capture "after"
    SELECT to_jsonb(e.*) INTO after_row
    FROM public.events e
    WHERE e.id = (move_record->>'event_id')::uuid 
      AND e.family_id = _family_id;

    results := results || jsonb_build_object(
      'event_id', move_record->>'event_id',
      'ok', true,
      'before', before_row,
      'after', after_row
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', all_ok,
    'reason', _reason,
    'results', results
  );
END;
$$;

-- 7) Ensure get_week_view RPC exists (required for PlannerWeek to load data)
-- This combines the best features from existing versions with proper security and filters
CREATE OR REPLACE FUNCTION public.get_week_view(
  _family_id UUID,
  _from DATE,
  _to DATE,
  _child_ids UUID[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_children JSONB;
  v_avail JSONB;
  v_events JSONB;
  v_timezone TEXT := 'America/New_York';
BEGIN
  -- Use canonical family membership check
  IF NOT public.is_family_member(_family_id) THEN
    RAISE EXCEPTION 'Not authorized for family %', _family_id;
  END IF;

  -- Get family timezone if available
  BEGIN
    SELECT timezone INTO v_timezone
    FROM family
    WHERE id = _family_id;
  EXCEPTION WHEN OTHERS THEN
    -- Column might not exist, use default
    v_timezone := 'America/New_York';
  END;

  IF v_timezone IS NULL OR v_timezone = 'UTC' OR v_timezone = '' THEN
    v_timezone := 'America/New_York';
  END IF;

  -- Children list
  v_children := (
    SELECT COALESCE(
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', c.id,
          'name', COALESCE(c.first_name, 'Child'),
          'grade', COALESCE(c.grade_level::text, c.grade::text),
          'avatar', c.avatar
        ) ORDER BY COALESCE(c.first_name, 'Child')
      ),
      '[]'::jsonb
    )
    FROM children c
    WHERE c.family_id = _family_id
      AND c.archived = false
      AND (_child_ids IS NULL OR c.id = ANY(_child_ids))
  );

  -- Availability windows per day
  v_avail := (
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'child_id', a.child_id,
        'date', a.date,
        'day_status', a.day_status,
        'pattern_day', a.pattern_day,
        'windows', a.windows
      )
    ), '[]'::jsonb)
    FROM (
      SELECT 
        c.id AS child_id,
        d.date::date AS date,
        COALESCE(cdc.day_status, 'teach') AS day_status,
        cdc.pattern_day,
        CASE 
          WHEN COALESCE(cdc.day_status, 'teach') = 'off' THEN '[]'::jsonb
          WHEN cdc.first_block_start IS NULL OR cdc.last_block_end IS NULL THEN '[]'::jsonb
          ELSE jsonb_build_array(
            jsonb_build_object(
              'start', cdc.first_block_start,
              'end', cdc.last_block_end,
              'status', COALESCE(cdc.day_status, 'teach')
            )
          )
        END AS windows
      FROM children c
      CROSS JOIN generate_series(_from, _to, interval '1 day') AS d(date)
      LEFT JOIN calendar_days_cache cdc ON cdc.child_id = c.id 
        AND cdc.date = d.date::date 
        AND cdc.family_id = _family_id
      WHERE c.family_id = _family_id
        AND c.archived = false
        AND (_child_ids IS NULL OR c.id = ANY(_child_ids))
    ) a
    ORDER BY a.date, a.child_id
  );

  -- Events in the window with proper filters and timezone-aware fields
  v_events := (
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', e.id,
        'child_id', e.child_id,
        'child_ids', e.child_ids, -- Support multi-child events
        'title', e.title,
        'description', e.description,
        'subject_id', e.subject_id,
        'subject_name', s.name,
        'status', e.status,
        'start_ts', e.start_ts,
        'end_ts', e.end_ts,
        'start_local', TO_CHAR((e.start_ts AT TIME ZONE v_timezone), 'HH24:MI'),
        'end_local', TO_CHAR((e.end_ts AT TIME ZONE v_timezone), 'HH24:MI'),
        'date_local', TO_CHAR((e.start_ts AT TIME ZONE v_timezone), 'YYYY-MM-DD'),
        'event_type', e.event_type,
        'pattern_day', e.pattern_day,
        'recurrence_rule', e.recurrence_rule,
        'parent_event_id', e.parent_event_id,
        'recurrence_id', e.recurrence_id,
        'year_plan_id', e.year_plan_id,
        'source', e.source
      ) ORDER BY e.start_ts
    ), '[]'::jsonb)
    FROM events e
    LEFT JOIN subject s ON s.id = e.subject_id
    WHERE e.family_id = _family_id
      AND e.deleted_at IS NULL
      AND e.canceled_at IS NULL
      AND e.is_backlog = false
      AND e.start_ts >= (_from::date AT TIME ZONE v_timezone)::timestamptz
      AND e.start_ts < ((_to::date + INTERVAL '1 day') AT TIME ZONE v_timezone)::timestamptz
      AND (
        _child_ids IS NULL 
        OR e.child_id = ANY(_child_ids)
        OR (e.child_ids IS NOT NULL AND e.child_ids && _child_ids)
      )
  );

  RETURN JSONB_BUILD_OBJECT(
    'children', v_children,
    'avail', v_avail,
    'events', v_events
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.normalize_child_ids(uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_freebusy_week(uuid, timestamptz, timestamptz, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_event_drop(uuid, uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_event_time_update(uuid, uuid, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_event(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_bulk_event_moves(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_bulk_event_time_updates(uuid, jsonb, text) TO authenticated;

-- 7) Ensure get_week_view RPC exists (required for PlannerWeek to load data)
-- This combines the best features from existing versions with proper security and filters
CREATE OR REPLACE FUNCTION public.get_week_view(
  _family_id UUID,
  _from DATE,
  _to DATE,
  _child_ids UUID[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_children JSONB;
  v_avail JSONB;
  v_events JSONB;
  v_timezone TEXT := 'America/New_York';
BEGIN
  -- Use canonical family membership check
  IF NOT public.is_family_member(_family_id) THEN
    RAISE EXCEPTION 'Not authorized for family %', _family_id;
  END IF;

  -- Get family timezone if available
  BEGIN
    SELECT timezone INTO v_timezone
    FROM family
    WHERE id = _family_id;
  EXCEPTION WHEN OTHERS THEN
    -- Column might not exist, use default
    v_timezone := 'America/New_York';
  END;

  IF v_timezone IS NULL OR v_timezone = 'UTC' OR v_timezone = '' THEN
    v_timezone := 'America/New_York';
  END IF;

  -- Children list
  v_children := (
    SELECT COALESCE(
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', c.id,
          'name', COALESCE(c.first_name, 'Child'),
          'grade', COALESCE(c.grade_level::text, c.grade::text),
          'avatar', c.avatar
        ) ORDER BY COALESCE(c.first_name, 'Child')
      ),
      '[]'::jsonb
    )
    FROM children c
    WHERE c.family_id = _family_id
      AND c.archived = false
      AND (_child_ids IS NULL OR c.id = ANY(_child_ids))
  );

  -- Availability windows per day
  v_avail := (
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'child_id', a.child_id,
        'date', a.date,
        'day_status', a.day_status,
        'pattern_day', a.pattern_day,
        'windows', a.windows
      )
    ), '[]'::jsonb)
    FROM (
      SELECT 
        c.id AS child_id,
        d.date::date AS date,
        COALESCE(cdc.day_status, 'teach') AS day_status,
        cdc.pattern_day,
        CASE 
          WHEN COALESCE(cdc.day_status, 'teach') = 'off' THEN '[]'::jsonb
          WHEN cdc.first_block_start IS NULL OR cdc.last_block_end IS NULL THEN '[]'::jsonb
          ELSE jsonb_build_array(
            jsonb_build_object(
              'start', cdc.first_block_start,
              'end', cdc.last_block_end,
              'status', COALESCE(cdc.day_status, 'teach')
            )
          )
        END AS windows
      FROM children c
      CROSS JOIN generate_series(_from, _to, interval '1 day') AS d(date)
      LEFT JOIN calendar_days_cache cdc ON cdc.child_id = c.id 
        AND cdc.date = d.date::date 
        AND cdc.family_id = _family_id
      WHERE c.family_id = _family_id
        AND c.archived = false
        AND (_child_ids IS NULL OR c.id = ANY(_child_ids))
    ) a
    ORDER BY a.date, a.child_id
  );

  -- Events in the window with proper filters and timezone-aware fields
  v_events := (
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', e.id,
        'child_id', e.child_id,
        'child_ids', e.child_ids, -- Support multi-child events
        'title', e.title,
        'description', e.description,
        'subject_id', e.subject_id,
        'subject_name', s.name,
        'status', e.status,
        'start_ts', e.start_ts,
        'end_ts', e.end_ts,
        'start_local', TO_CHAR((e.start_ts AT TIME ZONE v_timezone), 'HH24:MI'),
        'end_local', TO_CHAR((e.end_ts AT TIME ZONE v_timezone), 'HH24:MI'),
        'date_local', TO_CHAR((e.start_ts AT TIME ZONE v_timezone), 'YYYY-MM-DD'),
        'event_type', e.event_type,
        'pattern_day', e.pattern_day,
        'recurrence_rule', e.recurrence_rule,
        'parent_event_id', e.parent_event_id,
        'recurrence_id', e.recurrence_id,
        'year_plan_id', e.year_plan_id,
        'source', e.source
      ) ORDER BY e.start_ts
    ), '[]'::jsonb)
    FROM events e
    LEFT JOIN subject s ON s.id = e.subject_id
    WHERE e.family_id = _family_id
      AND e.deleted_at IS NULL
      AND e.canceled_at IS NULL
      AND e.is_backlog = false
      AND e.start_ts >= (_from::date AT TIME ZONE v_timezone)::timestamptz
      AND e.start_ts < ((_to::date + INTERVAL '1 day') AT TIME ZONE v_timezone)::timestamptz
      AND (
        _child_ids IS NULL 
        OR e.child_id = ANY(_child_ids)
        OR (e.child_ids IS NOT NULL AND e.child_ids && _child_ids)
      )
  );

  RETURN JSONB_BUILD_OBJECT(
    'children', v_children,
    'avail', v_avail,
    'events', v_events
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_week_view(UUID, DATE, DATE, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_week_view(UUID, DATE, DATE, UUID[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_week_view(UUID, DATE, DATE, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_week_view(UUID, DATE, DATE, UUID[]) TO anon;