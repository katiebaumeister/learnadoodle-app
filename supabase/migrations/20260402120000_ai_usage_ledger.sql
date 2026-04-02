-- Internal AI unit metering (aligns with hi-world-app/constants/aiUsageUnits.ts).
-- Insert rows from the backend (service_role) after each billable AI operation.
-- action_type should match app keys, e.g. chatbotSimple, rebalanceSingleWeek, generatePlanWeek.

CREATE TABLE IF NOT EXISTS public.ai_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.family (id) ON DELETE CASCADE,
  action_type text NOT NULL,
  units integer NOT NULL CHECK (units > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_ledger_idempotency_idx
  ON public.ai_usage_ledger (family_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_usage_ledger_family_created_idx
  ON public.ai_usage_ledger (family_id, created_at DESC);

COMMENT ON TABLE public.ai_usage_ledger IS
  'Append-only AI unit consumption for billing limits; not shown as raw units in the product UI.';

ALTER TABLE public.ai_usage_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_ledger_select ON public.ai_usage_ledger;
CREATE POLICY ai_usage_ledger_select ON public.ai_usage_ledger
  FOR SELECT
  USING (is_family_member (family_id));

-- Direct client INSERT is blocked; backend uses service_role (bypasses RLS) or future RPC.
DROP POLICY IF EXISTS ai_usage_ledger_insert_authenticated ON public.ai_usage_ledger;
CREATE POLICY ai_usage_ledger_insert_authenticated ON public.ai_usage_ledger
  FOR INSERT
  WITH CHECK (false);

GRANT SELECT ON public.ai_usage_ledger TO authenticated;
GRANT ALL ON public.ai_usage_ledger TO service_role;

-- Sum units for the current calendar month (database timezone — use UTC on Supabase).
CREATE OR REPLACE FUNCTION public.get_family_ai_units_used_this_month (p_family_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF NOT is_family_member (p_family_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_start := date_trunc ('month', now());
  v_end := v_start + interval '1 month';

  RETURN COALESCE(
    (
      SELECT sum(l.units)::integer
      FROM public.ai_usage_ledger l
      WHERE l.family_id = p_family_id
        AND l.created_at >= v_start
        AND l.created_at < v_end
    ),
    0
  );
END;
$$;

COMMENT ON FUNCTION public.get_family_ai_units_used_this_month (uuid) IS
  'Returns total AI units consumed this calendar month for a family (month boundary = DB tz; typically UTC on Supabase).';

GRANT EXECUTE ON FUNCTION public.get_family_ai_units_used_this_month (uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_family_ai_units_used_this_month (uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Application code (not run by Postgres — checklist for engineers)
-- ---------------------------------------------------------------------------
-- 1) After each billable AI operation (chat, rebalance, parse, plan gen, etc.),
--    INSERT into ai_usage_ledger from the backend (service_role), or call one
--    helper that maps the operation → units via AI_ACTION_UNIT_WEIGHTS
--    (hi-world-app/constants/aiUsageUnits.ts). Use idempotency_key when retries
--    could duplicate the same logical operation.
-- 2) When opening Subscription, RPC get_family_ai_units_used_this_month(family_id)
--    and pass the result to SubscriptionScreen as aiUsedUnitsThisMonth. Optionally
--    refresh after AI actions or subscribe for real-time updates.
-- 3) Optional: align the metering window with Stripe (renewal period) instead of
--    calendar month — extend this RPC to sum created_at between period_start and
--    period_end from Stripe or a billing table on family.
-- ---------------------------------------------------------------------------
