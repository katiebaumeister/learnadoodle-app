-- Family usage analytics — copy/paste into Supabase SQL Editor
-- Requires migration: 20260823010000_family_usage_analytics.sql
-- Run as service_role / postgres (admin views are not exposed to app users).

-- ---------------------------------------------------------------------------
-- 1. Overview: all families + usage counts + login stats
-- ---------------------------------------------------------------------------
SELECT *
FROM public.admin_family_usage_overview(NULL);

-- Families active in the last 30 days (created subject, learning day, day off, or signed in)
SELECT *
FROM public.admin_family_usage_overview(NOW() - interval '30 days');

-- ---------------------------------------------------------------------------
-- 2. Login frequency per user
-- ---------------------------------------------------------------------------
SELECT *
FROM public.admin_user_login_overview(NULL);

-- Logins in the last 7 days
SELECT *
FROM public.admin_user_login_overview(NOW() - interval '7 days');

-- ---------------------------------------------------------------------------
-- 3. Families that customized school year / planner settings
-- ---------------------------------------------------------------------------
SELECT
  family_id,
  primary_parent_email,
  school_year_or_planner_customized,
  academic_years_count,
  family_school_years_count,
  days_off_count,
  manual_days_off_count
FROM public.admin_family_usage_overview(NULL)
WHERE school_year_or_planner_customized = true
ORDER BY family_created_at DESC;

-- ---------------------------------------------------------------------------
-- 4. Families with product adoption milestones
-- ---------------------------------------------------------------------------
SELECT
  family_id,
  primary_parent_email,
  onboarding_completed,
  children_count,
  subjects_count,
  learning_days_count,
  days_off_count,
  assignments_count,
  auth_last_sign_in_at,
  app_sign_in_events_count
FROM public.admin_family_usage_overview(NULL)
WHERE subjects_count > 0
   OR learning_days_count > 0
   OR days_off_count > 0
ORDER BY subjects_count DESC, learning_days_count DESC;

-- ---------------------------------------------------------------------------
-- 5. Activity timeline for one family (replace UUID)
-- ---------------------------------------------------------------------------
-- SELECT *
-- FROM public.admin_family_activity_timeline(
--   'YOUR-FAMILY-UUID-HERE'::uuid,
--   NOW() - interval '90 days',
--   100
-- );

-- ---------------------------------------------------------------------------
-- 6. Raw domain tables (no migration required — works before migration too)
-- ---------------------------------------------------------------------------

-- Subjects created per family
SELECT family_id, count(*) AS subjects_count, max(created_at) AS last_created
FROM public.subject
GROUP BY family_id
ORDER BY subjects_count DESC;

-- Learning days (ClassDay events) per family
SELECT family_id, count(*) AS learning_days_count, max(created_at) AS last_created
FROM public.events
WHERE deleted_at IS NULL
  AND lower(COALESCE(event_type, '')) = 'classday'
GROUP BY family_id
ORDER BY learning_days_count DESC;

-- Days off per family
SELECT
  family_id,
  count(*) FILTER (WHERE exclusion_type IN ('holiday', 'break', 'excluded_date')) AS days_off_count,
  count(*) FILTER (WHERE source = 'manual') AS manual_days_off_count,
  max(created_at) AS last_created
FROM public.planner_exclusions
WHERE is_active = true
GROUP BY family_id
ORDER BY days_off_count DESC;

-- Login stats from Supabase Auth (admin only)
SELECT
  p.id AS user_id,
  p.email,
  p.family_id,
  u.last_sign_in_at,
  u.created_at AS account_created_at
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
ORDER BY u.last_sign_in_at DESC NULLS LAST;
