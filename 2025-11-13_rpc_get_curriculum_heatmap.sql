-- RPC: Get curriculum heatmap data for a date range
-- Part of Phase 1 - Year-Round Intelligence Core
-- Returns weekly subject minutes scheduled vs done

CREATE OR REPLACE FUNCTION public.get_curriculum_heatmap(
  p_family_id uuid,
  p_start date,
  p_end date
)
RETURNS TABLE(
  week_start date,
  subject text,
  minutes_scheduled numeric,
  minutes_done numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Note: Family validation is handled by the backend API layer
  -- This RPC is called with SECURITY DEFINER and service_role, so auth.uid() is NULL
  -- Return heatmap data grouped by week and subject
  RETURN QUERY
  WITH week_ranges AS (
    SELECT 
      date_trunc('week', d::date)::date AS week_start,
      (date_trunc('week', d::date) + INTERVAL '6 days')::date AS week_end
    FROM generate_series(p_start, p_end, INTERVAL '1 day') d
    GROUP BY date_trunc('week', d::date)
  ),
  event_minutes AS (
    SELECT 
      date_trunc('week', e.start_ts::date)::date AS week_start,
      COALESCE(s.name, 'Unassigned') AS subject,
      SUM(COALESCE(e.minutes, EXTRACT(EPOCH FROM (e.end_ts - e.start_ts))/60)::int) AS minutes_scheduled,
      SUM(CASE WHEN e.status = 'done' THEN COALESCE(e.minutes, EXTRACT(EPOCH FROM (e.end_ts - e.start_ts))/60)::int ELSE 0 END) AS minutes_done
    FROM events e
    LEFT JOIN subject s ON e.subject_id = s.id
    WHERE e.family_id = p_family_id
      AND e.start_ts::date >= p_start
      AND e.start_ts::date <= p_end
    GROUP BY date_trunc('week', e.start_ts::date), s.name
  )
  SELECT 
    wr.week_start,
    COALESCE(em.subject, 'No events') AS subject,
    COALESCE(em.minutes_scheduled, 0)::numeric AS minutes_scheduled,
    COALESCE(em.minutes_done, 0)::numeric AS minutes_done
  FROM week_ranges wr
  LEFT JOIN event_minutes em ON wr.week_start = em.week_start
  ORDER BY wr.week_start, em.subject;
END;
$$;

