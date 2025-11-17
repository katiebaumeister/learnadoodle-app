-- =====================================================
-- ADD-REMOVE MATH SCHEDULING RULES MIGRATION
-- =====================================================
-- This migration refactors the scheduling system to use Add-Remove math
-- instead of numeric priority, with optional Specificity Cascade

-- 1) Update schedule_rules schema
-- Add rule_kind column and updated_at timestamp
ALTER TABLE schedule_rules
  ADD COLUMN IF NOT EXISTS rule_kind text CHECK (rule_kind IN ('teach','off')),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill: map former rule_type to rule_kind
UPDATE schedule_rules
SET rule_kind = CASE
  WHEN rule_type IN ('availability_teach','activity_default') THEN 'teach'
  WHEN rule_type = 'availability_off' THEN 'off'
  ELSE COALESCE(rule_kind, 'teach')
END
WHERE rule_kind IS NULL;

-- Drop priority column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='schedule_rules' AND column_name='priority'
  ) THEN
    ALTER TABLE schedule_rules DROP COLUMN priority;
  END IF;
END$$;

-- 2) Create family_settings table for Specificity Cascade toggle
CREATE TABLE IF NOT EXISTS family_settings (
  family_id uuid PRIMARY KEY REFERENCES family(id) ON DELETE CASCADE,
  specificity_cascade boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on family_settings
ALTER TABLE family_settings ENABLE ROW LEVEL SECURITY;

-- RLS policy for family_settings
CREATE POLICY "Users can view and update their family settings" ON family_settings
  FOR ALL USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Upsert helper function for specificity cascade
CREATE OR REPLACE FUNCTION set_specificity_cascade(p_family uuid, p_value boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO family_settings (family_id, specificity_cascade)
  VALUES (p_family, p_value)
  ON CONFLICT (family_id) DO UPDATE
    SET specificity_cascade = EXCLUDED.specificity_cascade,
        updated_at = now();
END$$;

-- 3) Range helper functions for Add-Remove math
-- Merge sorted, non-overlapping tsranges into minimal set
CREATE OR REPLACE FUNCTION range_merge(ranges tsrange[])
RETURNS tsrange[] LANGUAGE plpgsql AS $$
DECLARE
  r tsrange;
  out_arr tsrange[] := '{}';
  last tsrange;
BEGIN
  IF ranges IS NULL OR array_length(ranges,1) IS NULL THEN
    RETURN '{}';
  END IF;
  
  -- Sort by lower bound
  WITH flat AS (
    SELECT unnest(ranges) AS rng
  ), ord AS (
    SELECT rng FROM flat ORDER BY lower(rng)
  )
  SELECT array_agg(rng) INTO out_arr FROM ord;
  
  -- Fold overlapping ranges
  out_arr := ARRAY[
    (SELECT rng FROM (SELECT out_arr[1] AS rng) s)
  ];
  
  FOR r IN SELECT unnest(out_arr[2:array_length(out_arr,1)]) LOOP
    last := out_arr[array_upper(out_arr,1)];
    IF r && last OR upper(r) = lower(last) OR upper(last) = lower(r) THEN
      out_arr[array_upper(out_arr,1)] := tsrange(
        LEAST(lower(last),lower(r)), 
        GREATEST(upper(last),upper(r)), 
        '[)'
      );
    ELSE
      out_arr := out_arr || r;
    END IF;
  END LOOP;
  
  RETURN out_arr;
END$$;

-- Subtract B's union from A's union; return merged result
CREATE OR REPLACE FUNCTION range_subtract(a tsrange[], b tsrange[])
RETURNS tsrange[] LANGUAGE plpgsql AS $$
DECLARE
  A tsrange[] := COALESCE(range_merge(a),'{}');
  B tsrange[] := COALESCE(range_merge(b),'{}');
  result tsrange[] := '{}';
  ar tsrange;
  br tsrange;
  fragments tsrange[];
  frag tsrange;
BEGIN
  IF array_length(A,1) IS NULL THEN
    RETURN '{}';
  END IF;
  IF array_length(B,1) IS NULL THEN
    RETURN A; -- nothing to subtract
  END IF;

  FOREACH ar IN ARRAY A LOOP
    fragments := ARRAY[ar];
    FOREACH br IN ARRAY B LOOP
      -- subtract br from each fragment in fragments
      DECLARE tmp tsrange[] := '{}'; f tsrange;
      BEGIN
        FOREACH f IN ARRAY fragments LOOP
          IF NOT f && br THEN
            tmp := tmp || f;
          ELSE
            -- there is overlap, cut f by br
            IF lower(f) < lower(br) THEN
              tmp := tmp || tsrange(lower(f), lower(br), '[)');
            END IF;
            IF upper(br) < upper(f) THEN
              tmp := tmp || tsrange(upper(br), upper(f), '[)');
            END IF;
          END IF;
        END LOOP;
        fragments := tmp;
      END;
    END LOOP;
    -- collect fragments for this ar
    FOREACH frag IN ARRAY fragments LOOP
      result := result || frag;
    END LOOP;
  END LOOP;

  RETURN COALESCE(range_merge(result),'{}');
END$$;

-- 4) Recompute cache using Add-Remove math (+ optional Specificity Cascade)
CREATE OR REPLACE FUNCTION refresh_calendar_days_cache(
  p_family_id uuid,
  p_start_date date,
  p_end_date date
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  use_cascade boolean;
BEGIN
  -- Get family's specificity cascade setting
  SELECT specificity_cascade INTO use_cascade
  FROM family_settings WHERE family_id = p_family_id;
  use_cascade := COALESCE(use_cascade, false);

  -- Wipe target window for this family
  DELETE FROM calendar_days_cache
  WHERE family_id = p_family_id
    AND date BETWEEN p_start_date AND p_end_date;

  -- Expand rules into dated tsranges per child using Add-Remove math
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(p_start_date, p_end_date, interval '1 day') d
  ),
  family_children AS (
    SELECT id AS child_id FROM children WHERE family_id = p_family_id
  ),
  expanded AS (
    SELECT
      r.id AS rule_id,
      CASE
        WHEN r.scope_type='child' THEN r.scope_id
        ELSE fc.child_id
      END AS child_id,
      r.rule_kind, -- 'teach'|'off'
      d.day,
      tsrange(
        (d.day + r.start_time)::timestamp,
        (d.day + r.end_time)::timestamp,
        '[)'
      ) AS span,
      r.scope_type,
      r.updated_at
    FROM schedule_rules r
    JOIN days d
      ON d.day BETWEEN r.start_date AND r.end_date
    LEFT JOIN family_children fc
      ON r.scope_type='family'
    WHERE (r.scope_type='family' AND r.scope_id = p_family_id)
       OR (r.scope_type='child' AND r.scope_id IN (SELECT child_id FROM family_children))
      AND r.is_active = true
      AND (
        -- rrule filter: weekday match
        (r.rrule->>'freq') = 'WEEKLY'
        AND (to_char(d.day, 'DY') IN (
            SELECT * FROM jsonb_array_elements_text(COALESCE(r.rrule->'byweekday','[]'::jsonb))
        ))
      )
  ),
  -- Apply Specificity Cascade if enabled: Overrides > Child > Family, Off > Teach, tie→latest updated
  cascaded_rules AS (
    SELECT
      e.child_id,
      e.day,
      e.rule_kind,
      e.span,
      e.scope_type,
      e.updated_at,
      CASE 
        WHEN use_cascade THEN
          -- Apply precedence: Overrides > Child > Family, Off > Teach, latest updated wins
          ROW_NUMBER() OVER (
            PARTITION BY e.child_id, e.day, e.span
            ORDER BY 
              CASE WHEN e.scope_type = 'child' THEN 1 ELSE 2 END, -- Child rules beat family rules
              CASE WHEN e.rule_kind = 'off' THEN 1 ELSE 2 END,   -- Off beats teach
              e.updated_at DESC                                   -- Latest wins
          )
        ELSE 1 -- No cascade, keep all rules
      END as rule_rank
    FROM expanded e
  ),
  filtered_rules AS (
    SELECT child_id, day, rule_kind, span
    FROM cascaded_rules
    WHERE rule_rank = 1
  ),
  teach_blocks AS (
    SELECT child_id, day, range_merge(array_agg(span)) AS spans
    FROM filtered_rules
    WHERE rule_kind='teach'
    GROUP BY child_id, day
  ),
  off_blocks AS (
    SELECT child_id, day, range_merge(array_agg(span)) AS spans
    FROM filtered_rules
    WHERE rule_kind='off'
    GROUP BY child_id, day
  ),
  base_effective AS (
    SELECT
      c.child_id,
      d.day,
      range_subtract(tb.spans, ob.spans) AS spans
    FROM (SELECT child_id FROM family_children) c
    CROSS JOIN days d
    LEFT JOIN teach_blocks tb ON tb.child_id=c.child_id AND tb.day=d.day
    LEFT JOIN off_blocks  ob ON ob.child_id=c.child_id AND ob.day=d.day
  ),
  -- Apply overrides (one-time changes)
  final_effective AS (
    SELECT
      e.child_id,
      e.day,
      CASE
        WHEN use_cascade IS TRUE THEN (
          -- Apply overrides by subtracting override Off and adding override Teach
          WITH o AS (
            SELECT
              COALESCE(
                array_agg(
                  CASE WHEN o.override_kind IN ('day_off','cancel_block','early_end','late_start') THEN
                    tsrange(
                      (o.date + COALESCE(o.start_time, time '00:00'))::timestamp,
                      (o.date + COALESCE(o.end_time,   time '23:59'))::timestamp,
                      '[)'
                    )
                  ELSE NULL END
                ) FILTER (WHERE override_kind IN ('day_off','cancel_block','early_end','late_start')),
                '{}'
              ) AS off_spans,
              COALESCE(
                array_agg(
                  CASE WHEN o.override_kind='extra_block' THEN
                    tsrange(
                      (o.date + o.start_time)::timestamp,
                      (o.date + o.end_time)::timestamp,
                      '[)'
                    )
                  ELSE NULL END
                ) FILTER (WHERE override_kind='extra_block'),
                '{}'
              ) AS teach_spans
            FROM schedule_overrides o
            WHERE (o.scope_type='child' AND o.scope_id=e.child_id)
              AND o.date = e.day
              AND o.is_active = true
          )
          SELECT range_subtract( 
            range_merge( COALESCE(e.spans,'{}') || (SELECT teach_spans FROM o) ), 
            (SELECT off_spans FROM o) 
          )
        )
        ELSE e.spans
      END AS spans
    FROM base_effective e
  )
  INSERT INTO calendar_days_cache (family_id, child_id, date, day_status, first_block_start, last_block_end, source_summary, generated_at)
  SELECT
    p_family_id,
    child_id,
    day,
    CASE WHEN spans IS NULL OR array_length(spans,1) IS NULL THEN 'off'
         ELSE 'teach' END,
    -- store first/last block times for quick UI painting
    CASE WHEN spans IS NULL OR array_length(spans,1) IS NULL THEN NULL
         ELSE (SELECT lower(s)::time FROM unnest(spans) s ORDER BY lower(s) LIMIT 1) END,
    CASE WHEN spans IS NULL OR array_length(spans,1) IS NULL THEN NULL
         ELSE (SELECT upper(s)::time FROM unnest(spans) s ORDER BY upper(s) DESC LIMIT 1) END,
    -- store source summary as JSONB
    jsonb_build_object(
      'total_minutes', COALESCE((
        SELECT SUM(EXTRACT(EPOCH FROM (upper(s)-lower(s)))/60)::int FROM unnest(spans) s
      ), 0),
      'block_count', COALESCE(array_length(spans, 1), 0),
      'computed_with_cascade', use_cascade
    ),
    now()
  FROM final_effective;
END$$;

-- 5) Updated availability RPC (returns JSON per day with blocks)
-- Drop existing function first to avoid return type conflicts
DROP FUNCTION IF EXISTS get_child_availability(uuid, date, date);

CREATE OR REPLACE FUNCTION get_child_availability(_child uuid, _from date, _to date)
RETURNS TABLE(
  date date,
  day_status text,
  available_blocks jsonb
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.date,
    c.day_status,
    CASE
      WHEN c.day_status='off' THEN '[]'::jsonb
      ELSE (
        -- For now, return one block from start_time to end_time
        -- TODO: Store exact spans in cache for multiple blocks per day
        jsonb_build_array(
          jsonb_build_object(
            'start', to_char(c.date + c.start_time, 'HH24:MI'),
            'end',   to_char(c.date + c.end_time,   'HH24:MI')
          )
        )
      )
    END
  FROM calendar_days_cache c
  WHERE c.child_id=_child AND c.date BETWEEN _from AND _to
  ORDER BY c.date;
END$$;

-- 6) Soft-detect overlapping/masked rules (for warnings)
CREATE OR REPLACE FUNCTION detect_rule_conflicts(_family uuid)
RETURNS TABLE(
  rule_id uuid,
  affected_days int,
  masked_minutes int
) LANGUAGE sql SECURITY DEFINER AS $$
WITH fam_children AS (
  SELECT id AS child_id FROM children WHERE family_id=_family
),
exp AS (
  SELECT
    r.id AS rule_id,
    CASE WHEN r.scope_type='child' THEN r.scope_id ELSE fc.child_id END child_id,
    d::date AS day,
    tsrange((d::date + r.start_time)::timestamp, (d::date + r.end_time)::timestamp, '[)') AS span,
    r.rule_kind
  FROM schedule_rules r
  LEFT JOIN fam_children fc ON r.scope_type='family'
  JOIN generate_series(r.start_date, r.end_date, interval '1 day') d ON TRUE
  WHERE ((r.scope_type='family' AND r.scope_id=_family) OR (r.scope_type='child' AND r.scope_id IN (SELECT child_id FROM fam_children)))
    AND r.is_active
),
teach AS (
  SELECT child_id, day, range_merge(array_agg(span)) AS spans
  FROM exp WHERE rule_kind='teach' GROUP BY child_id, day
),
off AS (
  SELECT child_id, day, range_merge(array_agg(span)) AS spans
  FROM exp WHERE rule_kind='off' GROUP BY child_id, day
),
eff AS (
  SELECT t.child_id, t.day, range_subtract(t.spans, o.spans) AS spans
  FROM teach t LEFT JOIN off o USING(child_id,day)
),
masked AS (
  SELECT z.rule_id,
         COUNT(*) FILTER (WHERE m_minutes>0) AS affected_days,
         SUM(m_minutes) AS masked_minutes
  FROM (
    SELECT exp.rule_id, exp.child_id, exp.day,
      GREATEST(0, (
        SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (upper(x)-lower(x)))/60)::int,0)
        FROM unnest(ARRAY[exp.span]) x
      ) - (
        SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (upper(i)-lower(i)))/60)::int,0)
        FROM unnest(COALESCE(eff.spans,'{}')) i
        WHERE i && exp.span
      )
      ) AS m_minutes
    FROM exp
    LEFT JOIN eff ON eff.child_id=exp.child_id AND eff.day=exp.day
  ) z
  GROUP BY z.rule_id
)
SELECT rule_id, affected_days, COALESCE(masked_minutes,0) FROM masked;
$$;

-- 7) Create trigger function for cache refresh
CREATE OR REPLACE FUNCTION refresh_calendar_cache_trigger()
RETURNS TRIGGER AS $$
DECLARE
  family_id_val uuid;
BEGIN
  -- Get family_id from the affected record
  IF TG_OP = 'DELETE' THEN
    IF OLD.scope_type = 'family' THEN
      family_id_val := OLD.scope_id;
    ELSE
      SELECT c.family_id INTO family_id_val FROM children c WHERE c.id = OLD.scope_id;
    END IF;
  ELSE
    IF NEW.scope_type = 'family' THEN
      family_id_val := NEW.scope_id;
    ELSE
      SELECT c.family_id INTO family_id_val FROM children c WHERE c.id = NEW.scope_id;
    END IF;
  END IF;

  -- Refresh cache for the next 90 days
  PERFORM refresh_calendar_days_cache(
    family_id_val,
    CURRENT_DATE::date,
    (CURRENT_DATE + INTERVAL '90 days')::date
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 8) Update existing triggers to use new function
-- Drop old trigger if it exists
DROP TRIGGER IF EXISTS schedule_rules_cache_refresh ON schedule_rules;
DROP TRIGGER IF EXISTS schedule_overrides_cache_refresh ON schedule_overrides;

-- Create new triggers
CREATE TRIGGER schedule_rules_cache_refresh
  AFTER INSERT OR UPDATE OR DELETE ON schedule_rules
  FOR EACH ROW EXECUTE FUNCTION refresh_calendar_cache_trigger();

CREATE TRIGGER schedule_overrides_cache_refresh
  AFTER INSERT OR UPDATE OR DELETE ON schedule_overrides
  FOR EACH ROW EXECUTE FUNCTION refresh_calendar_cache_trigger();

-- 9) Initialize family_settings for existing families
INSERT INTO family_settings (family_id, specificity_cascade)
SELECT id, false FROM family
ON CONFLICT (family_id) DO NOTHING;

-- 10) Refresh all existing cache with new Add-Remove math
DO $$
DECLARE
  fam RECORD;
BEGIN
  FOR fam IN SELECT id FROM family LOOP
    PERFORM refresh_calendar_days_cache(
      fam.id,
      (CURRENT_DATE - INTERVAL '30 days')::date,
      (CURRENT_DATE + INTERVAL '90 days')::date
    );
  END LOOP;
END $$;
