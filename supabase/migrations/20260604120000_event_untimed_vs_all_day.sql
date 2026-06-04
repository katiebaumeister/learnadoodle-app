-- Distinguish "no time added" (is_flexible) from explicit all-day events.
-- Both may use midnight–end-of-day timestamps for calendar placement; flags drive UI/semantics.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS all_day boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.all_day IS
  'True when the user chose an explicit all-day event. False for optional/blank-time (is_flexible) events.';

-- Production often has check_event_overlap() without flexible bypass; patch before backfill.
CREATE OR REPLACE FUNCTION public.check_event_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_child_ids uuid[] := COALESCE(NEW.child_ids, ARRAY[]::uuid[]);
BEGIN
  IF NEW.deleted_at IS NOT NULL
     OR COALESCE(NEW.status, '') = 'canceled'
     OR COALESCE(NEW.is_backlog, false) = true
     OR COALESCE(NEW.is_flexible, false) = true THEN
    RETURN NEW;
  END IF;

  -- all_day / flag backfill must not re-trigger overlap against flexible neighbors.
  IF TG_OP = 'UPDATE'
     AND NEW.start_ts IS NOT DISTINCT FROM OLD.start_ts
     AND NEW.end_ts IS NOT DISTINCT FROM OLD.end_ts
     AND NEW.child_id IS NOT DISTINCT FROM OLD.child_id
     AND NEW.child_ids IS NOT DISTINCT FROM OLD.child_ids
     AND NEW.is_flexible IS NOT DISTINCT FROM OLD.is_flexible
     AND NEW.is_backlog IS NOT DISTINCT FROM OLD.is_backlog
     AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
     AND COALESCE(NEW.status, '') IS NOT DISTINCT FROM COALESCE(OLD.status, '') THEN
    RETURN NEW;
  END IF;

  IF NEW.start_ts IS NULL OR NEW.end_ts IS NULL OR NEW.end_ts <= NEW.start_ts THEN
    RETURN NEW;
  END IF;

  IF NEW.child_id IS NOT NULL AND NOT (NEW.child_id = ANY(new_child_ids)) THEN
    new_child_ids := array_append(new_child_ids, NEW.child_id);
  END IF;

  IF array_length(new_child_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.events existing
    WHERE existing.family_id = NEW.family_id
      AND existing.deleted_at IS NULL
      AND COALESCE(existing.status, '') <> 'canceled'
      AND COALESCE(existing.is_backlog, false) = false
      AND COALESCE(existing.is_flexible, false) = false
      AND existing.id <> NEW.id
      AND NEW.start_ts < existing.end_ts
      AND NEW.end_ts > existing.start_ts
      AND (
        (existing.child_id IS NOT NULL AND existing.child_id = ANY(new_child_ids))
        OR (NEW.child_id IS NOT NULL AND existing.child_ids IS NOT NULL AND NEW.child_id = ANY(existing.child_ids))
        OR (existing.child_ids IS NOT NULL AND existing.child_ids && new_child_ids)
        OR (existing.child_id IS NOT NULL AND NEW.child_id IS NOT NULL AND existing.child_id = NEW.child_id)
      )
  ) THEN
    RAISE EXCEPTION 'Event overlaps with existing event for child: %', COALESCE(NEW.child_id::text, 'unknown');
  END IF;

  RETURN NEW;
END;
$$;

-- Patch any other overlap trigger functions on events (environment-specific names).
DO $$
DECLARE
  trg RECORD;
  patched_count integer := 0;
BEGIN
  FOR trg IN
    SELECT
      t.tgname,
      n.nspname AS func_schema,
      p.proname AS func_name,
      pg_get_functiondef(p.oid) AS func_def
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE t.tgrelid = 'public.events'::regclass
      AND NOT t.tgisinternal
      AND p.proname <> 'check_event_overlap'
  LOOP
    IF trg.func_def ILIKE '%overlap%'
       AND trg.func_def ILIKE '%start_ts%'
       AND trg.func_def ILIKE '%end_ts%'
       AND trg.func_def ILIKE '%child%' THEN
      EXECUTE format($sql$
        CREATE OR REPLACE FUNCTION %I.%I()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $fn$
        DECLARE
          new_child_ids uuid[] := COALESCE(NEW.child_ids, ARRAY[]::uuid[]);
        BEGIN
          IF NEW.deleted_at IS NOT NULL
             OR COALESCE(NEW.status, '') = 'canceled'
             OR COALESCE(NEW.is_backlog, false) = true
             OR COALESCE(NEW.is_flexible, false) = true THEN
            RETURN NEW;
          END IF;

          IF TG_OP = 'UPDATE'
             AND NEW.start_ts IS NOT DISTINCT FROM OLD.start_ts
             AND NEW.end_ts IS NOT DISTINCT FROM OLD.end_ts
             AND NEW.child_id IS NOT DISTINCT FROM OLD.child_id
             AND NEW.child_ids IS NOT DISTINCT FROM OLD.child_ids
             AND NEW.is_flexible IS NOT DISTINCT FROM OLD.is_flexible
             AND NEW.is_backlog IS NOT DISTINCT FROM OLD.is_backlog
             AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
             AND COALESCE(NEW.status, '') IS NOT DISTINCT FROM COALESCE(OLD.status, '') THEN
            RETURN NEW;
          END IF;

          IF NEW.start_ts IS NULL OR NEW.end_ts IS NULL OR NEW.end_ts <= NEW.start_ts THEN
            RETURN NEW;
          END IF;

          IF NEW.child_id IS NOT NULL AND NOT (NEW.child_id = ANY(new_child_ids)) THEN
            new_child_ids := array_append(new_child_ids, NEW.child_id);
          END IF;

          IF array_length(new_child_ids, 1) IS NULL THEN
            RETURN NEW;
          END IF;

          IF EXISTS (
            SELECT 1
            FROM public.events existing
            WHERE existing.family_id = NEW.family_id
              AND existing.deleted_at IS NULL
              AND COALESCE(existing.status, '') <> 'canceled'
              AND COALESCE(existing.is_backlog, false) = false
              AND COALESCE(existing.is_flexible, false) = false
              AND existing.id <> NEW.id
              AND NEW.start_ts < existing.end_ts
              AND NEW.end_ts > existing.start_ts
              AND (
                (existing.child_id IS NOT NULL AND existing.child_id = ANY(new_child_ids))
                OR (NEW.child_id IS NOT NULL AND existing.child_ids IS NOT NULL AND NEW.child_id = ANY(existing.child_ids))
                OR (existing.child_ids IS NOT NULL AND existing.child_ids && new_child_ids)
                OR (existing.child_id IS NOT NULL AND NEW.child_id IS NOT NULL AND existing.child_id = NEW.child_id)
              )
          ) THEN
            RAISE EXCEPTION 'Event overlaps with existing event for child: %%', COALESCE(NEW.child_id::text, 'unknown');
          END IF;

          RETURN NEW;
        END;
        $fn$;
      $sql$, trg.func_schema, trg.func_name);

      patched_count := patched_count + 1;
    END IF;
  END LOOP;

  IF patched_count > 0 THEN
    RAISE NOTICE 'Patched % additional overlap trigger function(s) on public.events', patched_count;
  END IF;
END $$;

-- Backfill from existing flags (do not infer all_day from timestamps alone).
ALTER TABLE public.events DISABLE TRIGGER USER;

UPDATE public.events
SET all_day = false
WHERE COALESCE(is_flexible, false) = true;

UPDATE public.events e
SET all_day = true
WHERE COALESCE(e.is_flexible, false) = false
  AND e.end_ts IS NOT NULL
  AND EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) >= (23 * 60 - 1) * 60
  AND COALESCE(e.all_day, false) = false
  AND COALESCE(e.event_type, '') NOT IN ('Break', 'Day Off', 'Holiday')
  AND COALESCE(e.source, '') <> 'planner_exclusion';

ALTER TABLE public.events ENABLE TRIGGER USER;

CREATE OR REPLACE FUNCTION public.enforce_event_schedule_semantics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_type text := lower(trim(COALESCE(NEW.event_type, '')));
  v_source text := lower(trim(COALESCE(NEW.source, '')));
BEGIN
  -- Planner holidays/breaks are always explicit all-day, never flexible.
  IF v_source = 'planner_exclusion'
     OR v_type IN ('break', 'day off', 'dayoff', 'holiday', 'custom_break', 'custom_holiday') THEN
    NEW.all_day := true;
    NEW.is_flexible := false;
    RETURN NEW;
  END IF;

  -- Optional/blank time: flexible, not all-day.
  IF COALESCE(NEW.is_flexible, false) = true THEN
    NEW.all_day := false;
    RETURN NEW;
  END IF;

  -- Explicit all-day toggle clears flexible.
  IF COALESCE(NEW.all_day, false) = true THEN
    NEW.is_flexible := false;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_schedule_semantics_trg ON public.events;

CREATE TRIGGER events_schedule_semantics_trg
BEFORE INSERT OR UPDATE OF is_flexible, all_day, start_ts, end_ts, event_type, source
ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.enforce_event_schedule_semantics();

-- get_month_view: expose schedule flags to planner/list/chip UI
CREATE OR REPLACE FUNCTION get_month_view(
  _family_id UUID,
  _year INTEGER,
  _month INTEGER,
  _child_ids UUID[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE SQL
STABLE
AS $$
WITH fam AS (
  SELECT COALESCE(get_family_timezone(_family_id), 'America/New_York') AS timezone
),
bounds AS (
  SELECT
    DATE(_year || '-' || LPAD(_month::text, 2, '0') || '-01') AS month_start,
    (DATE(_year || '-' || LPAD(_month::text, 2, '0') || '-01') + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end
),
children AS (
  SELECT
    id,
    COALESCE(first_name, 'Child') as name,
    COALESCE(grade_level::text, grade::text) as grade,
    avatar,
    family_id
  FROM children
  WHERE family_id = _family_id
    AND (_child_ids IS NULL OR id = ANY(_child_ids))
  ORDER BY COALESCE(first_name, 'Child')
),
events AS (
  SELECT
    e.id,
    e.child_id,
    e.child_ids,
    e.title,
    e.description,
    e.subject_id,
    s.name as subject_name,
    e.status,
    e.start_ts,
    e.end_ts,
    e.year_plan_id,
    e.event_type,
    e.counts_toward_plan,
    e.instructional_status,
    e.academic_year_id,
    e.recurrence_rule,
    e.parent_event_id,
    e.recurrence_id,
    e.generated_by,
    e.source_block_id,
    e.is_flexible,
    e.all_day,
    EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60 AS duration_minutes,
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS start_local,
    TO_CHAR((e.end_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS end_local,
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'YYYY-MM-DD') AS date_local,
    e.source,
    e.family_id
  FROM events e
  LEFT JOIN subject s ON s.id = e.subject_id
  WHERE e.family_id = _family_id
    AND (e.start_ts AT TIME ZONE (SELECT timezone FROM fam))::date >= (SELECT month_start FROM bounds)
    AND (e.start_ts AT TIME ZONE (SELECT timezone FROM fam))::date <= (SELECT month_end FROM bounds)
    AND (
      _child_ids IS NULL
      OR e.child_id = ANY(_child_ids)
      OR (e.child_id IS NULL AND e.child_ids IS NOT NULL AND e.child_ids && _child_ids)
    )
    AND (e.status IS NULL OR e.status != 'canceled')
    AND (e.canceled_at IS NULL)
    AND (e.deleted_at IS NULL)
  ORDER BY e.start_ts
),
events_by_date AS (
  SELECT
    date_local,
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', id,
        'child_id', child_id,
        'child_ids', child_ids,
        'title', title,
        'description', description,
        'subject_id', subject_id,
        'subject_name', subject_name,
        'status', status,
        'start_ts', start_ts,
        'end_ts', end_ts,
        'year_plan_id', year_plan_id,
        'event_type', event_type,
        'counts_toward_plan', counts_toward_plan,
        'instructional_status', instructional_status,
        'academic_year_id', academic_year_id,
        'recurrence_rule', recurrence_rule,
        'parent_event_id', parent_event_id,
        'recurrence_id', recurrence_id,
        'generated_by', generated_by,
        'source_block_id', source_block_id,
        'is_flexible', is_flexible,
        'all_day', all_day,
        'duration_minutes', duration_minutes,
        'start_local', start_local,
        'end_local', end_local,
        'source', source
      ) ORDER BY start_ts
    ) as events
  FROM events
  GROUP BY date_local
)
SELECT JSONB_BUILD_OBJECT(
  'children', (
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', c.id,
        'name', c.name,
        'grade', c.grade,
        'avatar', c.avatar
      ) ORDER BY c.name
    ), '[]'::jsonb)
    FROM children c
  ),
  'events_by_date', (
    SELECT COALESCE(JSONB_OBJECT_AGG(date_local, events), '{}'::jsonb)
    FROM events_by_date
  ),
  'month_start', (SELECT month_start FROM bounds),
  'month_end', (SELECT month_end FROM bounds),
  'year', _year,
  'month', _month,
  'timezone', (SELECT timezone FROM fam)
);
$$;

COMMENT ON FUNCTION get_month_view(UUID, INTEGER, INTEGER, UUID[]) IS
  'Month calendar view. Includes is_flexible/all_day for untimed vs all-day display.';

-- get_week_view: same schedule flags
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
  IF NOT public.is_family_member(_family_id) THEN
    RAISE EXCEPTION 'Not authorized for family %', _family_id;
  END IF;

  BEGIN
    SELECT timezone INTO v_timezone
    FROM family
    WHERE id = _family_id;
  EXCEPTION WHEN OTHERS THEN
    v_timezone := 'America/New_York';
  END;

  IF v_timezone IS NULL OR v_timezone = 'UTC' OR v_timezone = '' THEN
    v_timezone := 'America/New_York';
  END IF;

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
      ORDER BY d.date::date, c.id
    ) a
  );

  v_events := (
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', e.id,
        'child_id', e.child_id,
        'child_ids', e.child_ids,
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
        'source', e.source,
        'is_flexible', e.is_flexible,
        'all_day', e.all_day
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
GRANT EXECUTE ON FUNCTION public.get_week_view(UUID, DATE, DATE, UUID[]) TO service_role;
