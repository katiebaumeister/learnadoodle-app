-- Enhance get_progress_snapshot to include outcomes and attendance data
-- This enables AI summaries to reference strengths/struggles and attendance patterns

-- Drop existing function first (required when changing return type)
DROP FUNCTION IF EXISTS public.get_progress_snapshot(uuid, date, date) CASCADE;

CREATE FUNCTION public.get_progress_snapshot(
  p_family_id uuid,
  p_start date,
  p_end date
)
RETURNS TABLE(
  child_id uuid,
  child_name text,
  subject_name text,
  total_events bigint,
  done_events bigint,
  missed_events bigint,
  upcoming_events bigint,
  avg_rating numeric,
  recent_strengths text[],
  recent_struggles text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    c.id AS child_id,
    COALESCE(c.first_name, '') AS child_name,
    COALESCE(s.name, '—') AS subject_name,
    COUNT(DISTINCT e.id) AS total_events,
    COUNT(DISTINCT CASE WHEN e.status = 'done' AND (e.start_ts AT TIME ZONE 'UTC')::date BETWEEN p_start AND p_end THEN e.id END) AS done_events,
    COUNT(DISTINCT CASE 
      WHEN e.status IN ('missed', 'overdue') 
      AND (e.start_ts AT TIME ZONE 'UTC')::date BETWEEN p_start AND p_end
      THEN e.id 
    END) AS missed_events,
    COUNT(DISTINCT CASE 
      WHEN e.status = 'scheduled' 
      AND (e.start_ts AT TIME ZONE 'UTC')::date BETWEEN p_start AND p_end
      THEN e.id 
    END) AS upcoming_events,
    -- Average rating from outcomes (only for done events)
    AVG(CASE WHEN e.status = 'done' THEN o.rating::numeric END) AS avg_rating,
    -- Recent strengths (from last 10 outcomes for this child+subject)
    (
      SELECT array_agg(DISTINCT strength)
      FROM (
        SELECT unnest(o2.strengths) AS strength
        FROM event_outcomes o2
        JOIN events e2 ON e2.id = o2.event_id
        WHERE o2.child_id = c.id
          AND o2.subject_id = e.subject_id
          AND (e2.start_ts AT TIME ZONE 'UTC')::date BETWEEN p_start AND p_end
          AND o2.strengths IS NOT NULL
          AND array_length(o2.strengths, 1) > 0
        ORDER BY o2.created_at DESC
        LIMIT 10
      ) recent_strengths
    ) AS recent_strengths,
    -- Recent struggles (from last 10 outcomes for this child+subject)
    (
      SELECT array_agg(DISTINCT struggle)
      FROM (
        SELECT unnest(o3.struggles) AS struggle
        FROM event_outcomes o3
        JOIN events e3 ON e3.id = o3.event_id
        WHERE o3.child_id = c.id
          AND o3.subject_id = e.subject_id
          AND (e3.start_ts AT TIME ZONE 'UTC')::date BETWEEN p_start AND p_end
          AND o3.struggles IS NOT NULL
          AND array_length(o3.struggles, 1) > 0
        ORDER BY o3.created_at DESC
        LIMIT 10
      ) recent_struggles
    ) AS recent_struggles
  FROM events e
  JOIN children c ON c.id = e.child_id
  LEFT JOIN subject s ON s.id = e.subject_id
  LEFT JOIN event_outcomes o ON o.event_id = e.id
  WHERE e.family_id = p_family_id
    AND (e.start_ts AT TIME ZONE 'UTC')::date BETWEEN p_start AND p_end
  GROUP BY c.id, c.first_name, s.name, e.subject_id
  ORDER BY COALESCE(c.first_name, ''), COALESCE(s.name, '—');
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_progress_snapshot(uuid, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_progress_snapshot(uuid, date, date) TO authenticated;

