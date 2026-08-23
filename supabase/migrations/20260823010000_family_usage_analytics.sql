-- Family & user product usage analytics
-- Run admin queries in Supabase SQL Editor (service role / postgres).
-- See supabase/queries/family_usage_analytics.sql for copy-paste examples.

-- ============================================================================
-- 1. Optional explicit activity log (logins + future UI events)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES public.family(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL DEFAULT 'product'
    CHECK (event_category IN ('auth', 'product', 'planner', 'onboarding')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_events_family_occurred
  ON public.user_activity_events (family_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_events_user_occurred
  ON public.user_activity_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_events_type_occurred
  ON public.user_activity_events (event_type, occurred_at DESC);

COMMENT ON TABLE public.user_activity_events IS
  'Explicit product/auth events (e.g. user_signed_in). Domain actions (subjects, learning days) are also derivable from domain tables via family_usage_summary_v.';

ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_activity_events_insert ON public.user_activity_events;
CREATE POLICY user_activity_events_insert ON public.user_activity_events
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND family_id IN (SELECT p.family_id FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS user_activity_events_select_own_family ON public.user_activity_events;
CREATE POLICY user_activity_events_select_own_family ON public.user_activity_events
  FOR SELECT
  USING (
    family_id IN (SELECT p.family_id FROM public.profiles p WHERE p.id = auth.uid())
  );

GRANT INSERT, SELECT ON public.user_activity_events TO authenticated;
GRANT ALL ON public.user_activity_events TO service_role;

-- ============================================================================
-- 2. Per-family usage summary (derived from existing tables)
-- ============================================================================
CREATE OR REPLACE VIEW public.family_usage_summary_v AS
SELECT
  f.id AS family_id,
  f.created_at AS family_created_at,
  COALESCE(f.onboarding_completed, false) AS onboarding_completed,
  f.default_planning_mode,
  (
    SELECT count(*)::int
    FROM public.children c
    WHERE c.family_id = f.id
      AND COALESCE(c.archived, false) = false
  ) AS children_count,
  (
    SELECT count(*)::int
    FROM public.subject s
    WHERE s.family_id = f.id
  ) AS subjects_count,
  (
    SELECT count(*)::int
    FROM public.academic_years ay
    WHERE ay.family_id = f.id
  ) AS academic_years_count,
  (
    SELECT count(*)::int
    FROM public.family_school_years fsy
    WHERE fsy.family_id = f.id
  ) AS family_school_years_count,
  EXISTS (
    SELECT 1
    FROM public.family_planner_settings fps
    WHERE fps.family_id = f.id
      AND (
        fps.updated_at > fps.created_at + interval '5 minutes'
        OR fps.default_school_year IS NOT NULL
        OR fps.default_constraint_mode IS DISTINCT FROM 'none'
        OR fps.default_target_days IS NOT NULL
        OR fps.default_target_hours IS NOT NULL
        OR COALESCE(fps.follow_public_holidays, true) = false
      )
  ) AS school_year_or_planner_customized,
  (
    SELECT count(*)::int
    FROM public.events e
    WHERE e.family_id = f.id
      AND e.deleted_at IS NULL
      AND lower(COALESCE(e.event_type, '')) = 'classday'
  ) AS learning_days_count,
  (
    SELECT count(*)::int
    FROM public.events e
    WHERE e.family_id = f.id
      AND e.deleted_at IS NULL
      AND COALESCE(e.status, '') <> 'canceled'
  ) AS total_events_count,
  (
    SELECT count(*)::int
    FROM public.planner_exclusions pe
    WHERE pe.family_id = f.id
      AND pe.is_active = true
      AND pe.exclusion_type IN ('holiday', 'break', 'excluded_date')
  ) AS days_off_count,
  (
    SELECT count(*)::int
    FROM public.planner_exclusions pe
    WHERE pe.family_id = f.id
      AND pe.is_active = true
      AND pe.source = 'manual'
  ) AS manual_days_off_count,
  (
    SELECT count(*)::int
    FROM public.assignments a
    WHERE a.family_id = f.id
  ) AS assignments_count,
  (
    SELECT count(*)::int
    FROM public.attendance_records ar
    WHERE ar.family_id = f.id
  ) AS attendance_records_count,
  (
    SELECT max(s.created_at)
    FROM public.subject s
    WHERE s.family_id = f.id
  ) AS last_subject_created_at,
  (
    SELECT max(e.created_at)
    FROM public.events e
    WHERE e.family_id = f.id
      AND e.deleted_at IS NULL
      AND lower(COALESCE(e.event_type, '')) = 'classday'
  ) AS last_learning_day_created_at,
  (
    SELECT max(pe.created_at)
    FROM public.planner_exclusions pe
    WHERE pe.family_id = f.id
      AND pe.is_active = true
  ) AS last_day_off_created_at,
  (
    SELECT max(uae.occurred_at)
    FROM public.user_activity_events uae
    WHERE uae.family_id = f.id
      AND uae.event_type = 'user_signed_in'
  ) AS last_app_sign_in_at,
  (
    SELECT count(*)::int
    FROM public.user_activity_events uae
    WHERE uae.family_id = f.id
      AND uae.event_type = 'user_signed_in'
  ) AS app_sign_in_events_count
FROM public.family f;

COMMENT ON VIEW public.family_usage_summary_v IS
  'One row per family with product usage counts. Use admin_family_usage_overview() in SQL Editor.';

REVOKE ALL ON public.family_usage_summary_v FROM PUBLIC;
GRANT SELECT ON public.family_usage_summary_v TO service_role;

-- ============================================================================
-- 3. Unified activity timeline (subjects, learning days, days off, logins)
-- ============================================================================
CREATE OR REPLACE VIEW public.family_product_activity_timeline_v AS
SELECT
  s.family_id,
  'subject_created'::text AS activity_type,
  s.id::text AS entity_id,
  s.name AS label,
  s.created_at AS occurred_at,
  jsonb_build_object('subject_id', s.id, 'name', s.name) AS metadata
FROM public.subject s

UNION ALL

SELECT
  e.family_id,
  'learning_day_created'::text AS activity_type,
  e.id::text AS entity_id,
  COALESCE(e.title, 'Learning day') AS label,
  e.created_at AS occurred_at,
  jsonb_build_object(
    'event_id', e.id,
    'event_type', e.event_type,
    'start_ts', e.start_ts
  ) AS metadata
FROM public.events e
WHERE e.deleted_at IS NULL
  AND lower(COALESCE(e.event_type, '')) = 'classday'

UNION ALL

SELECT
  pe.family_id,
  CASE pe.exclusion_type
    WHEN 'break' THEN 'day_off_break_added'
    WHEN 'holiday' THEN 'day_off_holiday_added'
    ELSE 'day_off_excluded_date_added'
  END AS activity_type,
  pe.id::text AS entity_id,
  COALESCE(pe.label, pe.exclusion_type) AS label,
  pe.created_at AS occurred_at,
  jsonb_build_object(
    'exclusion_id', pe.id,
    'exclusion_type', pe.exclusion_type,
    'source', pe.source,
    'start_date', pe.start_date,
    'end_date', pe.end_date
  ) AS metadata
FROM public.planner_exclusions pe
WHERE pe.is_active = true

UNION ALL

SELECT
  uae.family_id,
  uae.event_type AS activity_type,
  uae.id::text AS entity_id,
  uae.event_type AS label,
  uae.occurred_at,
  uae.metadata
FROM public.user_activity_events uae
WHERE uae.family_id IS NOT NULL;

COMMENT ON VIEW public.family_product_activity_timeline_v IS
  'Chronological product actions per family. Filter by family_id and occurred_at in SQL Editor.';

REVOKE ALL ON public.family_product_activity_timeline_v FROM PUBLIC;
GRANT SELECT ON public.family_product_activity_timeline_v TO service_role;

-- ============================================================================
-- 4. Client RPC: log explicit activity (e.g. sign-in)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_user_activity_event(
  p_event_type text,
  p_event_category text DEFAULT 'product',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_event_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.family_id INTO v_family_id
  FROM public.profiles p
  WHERE p.id = v_user_id;

  INSERT INTO public.user_activity_events (
    family_id,
    user_id,
    event_type,
    event_category,
    metadata,
    occurred_at
  )
  VALUES (
    v_family_id,
    v_user_id,
    trim(p_event_type),
    COALESCE(NULLIF(trim(p_event_category), ''), 'product'),
    COALESCE(p_metadata, '{}'::jsonb),
    NOW()
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.log_user_activity_event IS
  'Insert a product/auth activity row for the current user. Used for sign-in frequency tracking.';

GRANT EXECUTE ON FUNCTION public.log_user_activity_event(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_user_activity_event(text, text, jsonb) TO service_role;

-- ============================================================================
-- 5. Admin RPCs (Supabase SQL Editor / service role)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_family_usage_overview(
  p_since timestamptz DEFAULT NULL
)
RETURNS TABLE (
  family_id uuid,
  family_created_at timestamptz,
  onboarding_completed boolean,
  default_planning_mode text,
  children_count int,
  subjects_count int,
  academic_years_count int,
  family_school_years_count int,
  school_year_or_planner_customized boolean,
  learning_days_count int,
  total_events_count int,
  days_off_count int,
  manual_days_off_count int,
  assignments_count int,
  attendance_records_count int,
  last_subject_created_at timestamptz,
  last_learning_day_created_at timestamptz,
  last_day_off_created_at timestamptz,
  last_app_sign_in_at timestamptz,
  app_sign_in_events_count int,
  primary_parent_email text,
  auth_last_sign_in_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    fus.*,
    (
      SELECT p.email
      FROM public.profiles p
      WHERE p.family_id = fus.family_id
        AND COALESCE(p.role, 'parent') IN ('parent', 'tutor')
      ORDER BY p.email NULLS LAST
      LIMIT 1
    ) AS primary_parent_email,
    (
      SELECT u.last_sign_in_at
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE p.family_id = fus.family_id
        AND COALESCE(p.role, 'parent') IN ('parent', 'tutor')
      ORDER BY u.last_sign_in_at DESC NULLS LAST
      LIMIT 1
    ) AS auth_last_sign_in_at
  FROM public.family_usage_summary_v fus
  WHERE p_since IS NULL
    OR fus.family_created_at >= p_since
    OR fus.last_subject_created_at >= p_since
    OR fus.last_learning_day_created_at >= p_since
    OR fus.last_day_off_created_at >= p_since
    OR fus.last_app_sign_in_at >= p_since
  ORDER BY fus.family_created_at DESC;
$$;

COMMENT ON FUNCTION public.admin_family_usage_overview IS
  'Admin report: per-family product usage + auth sign-in stats. Run in SQL Editor as service_role.';

REVOKE ALL ON FUNCTION public.admin_family_usage_overview(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_family_usage_overview(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_user_login_overview(
  p_since timestamptz DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  email text,
  family_id uuid,
  role text,
  account_created_at timestamptz,
  last_sign_in_at timestamptz,
  total_app_sign_in_events int,
  app_sign_in_events_in_range int,
  last_app_sign_in_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    p.id AS user_id,
    p.email,
    p.family_id,
    p.role,
    u.created_at AS account_created_at,
    u.last_sign_in_at,
    (
      SELECT count(*)::int
      FROM public.user_activity_events uae
      WHERE uae.user_id = p.id
        AND uae.event_type = 'user_signed_in'
    ) AS total_app_sign_in_events,
    (
      SELECT count(*)::int
      FROM public.user_activity_events uae
      WHERE uae.user_id = p.id
        AND uae.event_type = 'user_signed_in'
        AND (p_since IS NULL OR uae.occurred_at >= p_since)
    ) AS app_sign_in_events_in_range,
    (
      SELECT max(uae.occurred_at)
      FROM public.user_activity_events uae
      WHERE uae.user_id = p.id
        AND uae.event_type = 'user_signed_in'
    ) AS last_app_sign_in_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p_since IS NULL
    OR u.last_sign_in_at >= p_since
    OR u.created_at >= p_since
  ORDER BY u.last_sign_in_at DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.admin_user_login_overview IS
  'Admin report: login frequency per user (auth.users + app sign-in events).';

REVOKE ALL ON FUNCTION public.admin_user_login_overview(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_login_overview(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_family_activity_timeline(
  p_family_id uuid,
  p_since timestamptz DEFAULT NULL,
  p_limit int DEFAULT 200
)
RETURNS TABLE (
  activity_type text,
  entity_id text,
  label text,
  occurred_at timestamptz,
  metadata jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.activity_type,
    t.entity_id,
    t.label,
    t.occurred_at,
    t.metadata
  FROM public.family_product_activity_timeline_v t
  WHERE t.family_id = p_family_id
    AND (p_since IS NULL OR t.occurred_at >= p_since)
  ORDER BY t.occurred_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000));
$$;

COMMENT ON FUNCTION public.admin_family_activity_timeline IS
  'Admin: chronological product actions for one family.';

REVOKE ALL ON FUNCTION public.admin_family_activity_timeline(uuid, timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_family_activity_timeline(uuid, timestamptz, int) TO service_role;
