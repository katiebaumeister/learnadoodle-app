-- Scheduling Rules Helper Functions

-- Reorder rules by priority
CREATE OR REPLACE FUNCTION public.reorder_rules(
  _family UUID,
  _scope TEXT,           -- 'family' | 'child'
  _child UUID,           -- nullable when scope='family'
  _ordered_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  i INT := 1;
BEGIN
  IF _scope = 'family' THEN
    UPDATE schedule_rules
    SET priority = 1000 + array_position(_ordered_ids, id)
    WHERE scope_type = 'family'
      AND scope_id = _family
      AND id = ANY(_ordered_ids);
  ELSE
    UPDATE schedule_rules
    SET priority = 1000 + array_position(_ordered_ids, id)
    WHERE scope_type = 'child'
      AND scope_id = _child
      AND id = ANY(_ordered_ids);
  END IF;
  
  RETURN jsonb_build_object('ok', true);
END $$;

-- Get rules shaped for UI
CREATE OR REPLACE FUNCTION public.get_rules_for_ui(
  _family UUID,
  _child UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'weekly',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'type', rule_type,
          'days', rrule,
          'start', start_time,
          'end', end_time,
          'priority', priority,
          'scope_type', scope_type,
          'scope_id', scope_id
        ) ORDER BY priority
      ),
      '[]'::jsonb
    )
  )
  FROM schedule_rules
  WHERE scope_type = 'family' AND scope_id = _family AND (_child IS NULL)
     OR scope_type = 'child' AND scope_id = _child;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.reorder_rules(UUID, TEXT, UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_rules(UUID, TEXT, UUID, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_rules_for_ui(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rules_for_ui(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_rules_for_ui(UUID, UUID) TO anon;
