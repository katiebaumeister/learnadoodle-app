-- Migration: Blockit-style Week Scheduling RPCs
-- Adds RPCs for free/busy queries, event validation, and time updates
-- Part of Blockit-style Week Scheduling feature

-- 1) Helper indexes for overlap checks (if not already exist)
CREATE INDEX IF NOT EXISTS idx_events_family_time
  ON public.events (family_id, start_ts, end_ts)
  WHERE deleted_at IS NULL AND canceled_at IS NULL AND is_backlog = false;

CREATE INDEX IF NOT EXISTS idx_events_child_id
  ON public.events (child_id)
  WHERE child_id IS NOT NULL AND deleted_at IS NULL AND canceled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_child_ids_gin
  ON public.events USING GIN (child_ids)
  WHERE child_ids IS NOT NULL AND deleted_at IS NULL AND canceled_at IS NULL;

-- 2) RPC: get_freebusy_week
-- Returns busy blocks based on scheduled events for Scheduling Assistant overlay
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
  -- Basic family access check: ensure caller is in family
  IF NOT EXISTS (
    SELECT 1
    FROM public.family_members fm
    WHERE fm.family_id = _family_id
      AND fm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for family %', _family_id;
  END IF;

  WITH ev AS (
    SELECT
      e.id,
      e.title,
      e.start_ts,
      e.end_ts,
      COALESCE(e.child_ids, ARRAY[e.child_id]) AS effective_child_ids,
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

-- 3) RPC: validate_event_drop
-- Validates moving an existing event to a new time range
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
BEGIN
  IF _proposed_end <= _proposed_start THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'Invalid range',
      'conflicts', '[]'::jsonb,
      'suggested_slots', '[]'::jsonb
    );
  END IF;

  -- Auth check
  IF NOT EXISTS (
    SELECT 1
    FROM public.family_members fm
    WHERE fm.family_id = _family_id
      AND fm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for family %', _family_id;
  END IF;

  SELECT *
  INTO e
  FROM public.events
  WHERE id = _event_id
    AND family_id = _family_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'Event not found',
      'conflicts', '[]'::jsonb,
      'suggested_slots', '[]'::jsonb
    );
  END IF;

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
  WITH target AS (
    SELECT
      e.id as event_id,
      COALESCE(e.child_ids, ARRAY[e.child_id]) AS effective_child_ids
  ),
  candidates AS (
    SELECT
      o.id,
      o.title,
      o.start_ts,
      o.end_ts,
      COALESCE(o.child_ids, ARRAY[o.child_id]) AS other_child_ids,
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
    FROM candidates c, target t
    WHERE c.other_child_ids && t.effective_child_ids
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

-- 4) RPC: apply_event_time_update
-- Applies the move if valid (re-validates inside transaction)
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
  -- Auth check
  IF NOT EXISTS (
    SELECT 1
    FROM public.family_members fm
    WHERE fm.family_id = _family_id
      AND fm.user_id = auth.uid()
  ) THEN
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

-- 5) RPC: cancel_event (shared by rebalance/reschedule)
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
  IF NOT EXISTS (
    SELECT 1
    FROM public.family_members fm
    WHERE fm.family_id = _family_id
      AND fm.user_id = auth.uid()
  ) THEN
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_freebusy_week(uuid, timestamptz, timestamptz, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_event_drop(uuid, uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_event_time_update(uuid, uuid, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_event(uuid, uuid, text) TO authenticated;
