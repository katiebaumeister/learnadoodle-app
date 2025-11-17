-- =====================================================
-- MIGRATION: REFACTOR ATTENDANCE_RECORDS TO SPARSE STORAGE
-- =====================================================
-- This script migrates from bulk attendance_records storage to efficient sparse storage
-- Expected data reduction: 90% (180 rows → 18 rows per child per year)

-- =====================================================
-- STEP 1: BACKUP EXISTING DATA
-- =====================================================

-- Create backup table
CREATE TABLE IF NOT EXISTS attendance_records_backup_20250121 AS 
SELECT * FROM attendance_records;

-- =====================================================
-- STEP 2: CREATE EVENT-DRIVEN ATTENDANCE FUNCTION
-- =====================================================

-- Function to calculate attendance from events
CREATE OR REPLACE FUNCTION calculate_attendance_from_events(
  p_child_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  date DATE,
  minutes_present INT,
  status TEXT,
  source TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH school_days AS (
    -- Generate school days (Mon-Fri) in date range
    SELECT d::date AS date
    FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS d
    WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
  ),
  daily_minutes AS (
    -- Calculate minutes from completed events
    SELECT 
      (e.start_ts AT TIME ZONE 'UTC')::DATE as date,
      SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::INT as minutes
    FROM events e
    WHERE e.child_id = p_child_id
      AND e.status = 'done'
      AND (e.start_ts AT TIME ZONE 'UTC')::DATE BETWEEN p_start_date AND p_end_date
    GROUP BY (e.start_ts AT TIME ZONE 'UTC')::DATE
  ),
  attendance_calculated AS (
    SELECT 
      sd.date,
      COALESCE(dm.minutes, 0) as minutes_present,
      CASE 
        WHEN COALESCE(dm.minutes, 0) >= 300 THEN 'present'  -- 5+ hours = present
        WHEN COALESCE(dm.minutes, 0) >= 60 THEN 'tardy'     -- 1+ hours = tardy
        ELSE 'absent'
      END as status,
      'event_calculated' as source
    FROM school_days sd
    LEFT JOIN daily_minutes dm ON sd.date = dm.date
  )
  SELECT * FROM attendance_calculated;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions
GRANT EXECUTE ON FUNCTION calculate_attendance_from_events(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_attendance_from_events(UUID, DATE, DATE) TO anon;

-- =====================================================
-- STEP 3: CREATE SPARSE ATTENDANCE TABLE
-- =====================================================

-- Create new sparse attendance table
CREATE TABLE IF NOT EXISTS attendance_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('absent','tardy','excused','holiday')),
  minutes_present INT NOT NULL DEFAULT 0 CHECK (minutes_present >= 0),
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (child_id, date)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS attendance_exceptions_family_date_idx ON attendance_exceptions (family_id, date);
CREATE INDEX IF NOT EXISTS attendance_exceptions_child_date_idx ON attendance_exceptions (child_id, date);

-- Enable RLS
ALTER TABLE attendance_exceptions ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS attendance_exceptions_select ON attendance_exceptions;
CREATE POLICY attendance_exceptions_select ON attendance_exceptions
FOR SELECT USING (is_family_member(family_id));

DROP POLICY IF EXISTS attendance_exceptions_insert ON attendance_exceptions;
CREATE POLICY attendance_exceptions_insert ON attendance_exceptions
FOR INSERT WITH CHECK (
  is_family_member(family_id) AND child_belongs_to_family(child_id, family_id)
);

DROP POLICY IF EXISTS attendance_exceptions_update ON attendance_exceptions;
CREATE POLICY attendance_exceptions_update ON attendance_exceptions
FOR UPDATE USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS attendance_exceptions_delete ON attendance_exceptions;
CREATE POLICY attendance_exceptions_delete ON attendance_exceptions
FOR DELETE USING (is_family_member(family_id));

-- =====================================================
-- STEP 4: MIGRATE EXCEPTIONS TO SPARSE TABLE
-- =====================================================

-- Migrate only non-present records (exceptions)
INSERT INTO attendance_exceptions (
  family_id, child_id, date, status, minutes_present, notes, source
)
SELECT 
  family_id,
  child_id,
  date,
  CASE
    WHEN status IN ('absent','tardy','excused','holiday') THEN status
    WHEN status = 'present' AND COALESCE(minutes_present,0) >= 60 THEN 'tardy'
    WHEN status = 'present' AND COALESCE(minutes_present,0) > 0 THEN 'tardy'
    ELSE 'absent'
  END AS status,
  LEAST(COALESCE(minutes_present,0), 1440) AS minutes_present,
  notes,
  source
FROM attendance_records
WHERE status != 'present' OR minutes_present < 300  -- Less than 5 hours = exception
ON CONFLICT (child_id, date) DO NOTHING;

-- =====================================================
-- STEP 5: CREATE UNIFIED ATTENDANCE VIEW
-- =====================================================

-- Create view that combines event-calculated attendance with exceptions
CREATE OR REPLACE VIEW attendance_unified AS
WITH school_days AS (
  -- This will be replaced with a function parameter in practice
  SELECT d::date AS date
  FROM generate_series(CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE + INTERVAL '90 days', '1 day'::interval) AS d
  WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
),
event_attendance AS (
  SELECT 
    c.id as child_id,
    c.family_id,
    sd.date,
    COALESCE(SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::INT, 0) as minutes_present,
    CASE 
      WHEN COALESCE(SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::INT, 0) >= 300 THEN 'present'
      WHEN COALESCE(SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::INT, 0) >= 60 THEN 'tardy'
      ELSE 'absent'
    END as status,
    'event_calculated' as source
  FROM children c
  CROSS JOIN school_days sd
  LEFT JOIN events e ON e.child_id = c.id 
    AND e.status = 'done'
    AND (e.start_ts AT TIME ZONE 'UTC')::DATE = sd.date
  GROUP BY c.id, c.family_id, sd.date
)
SELECT 
  ea.child_id,
  ea.family_id,
  ea.date,
  COALESCE(ae.status, ea.status) as status,
  COALESCE(ae.minutes_present, ea.minutes_present) as minutes_present,
  ae.notes,
  COALESCE(ae.source, ea.source) as source,
  CASE WHEN ae.id IS NOT NULL THEN true ELSE false END as is_exception
FROM event_attendance ea
LEFT JOIN attendance_exceptions ae ON ae.child_id = ea.child_id AND ae.date = ea.date;

-- Grant permissions on view
GRANT SELECT ON attendance_unified TO authenticated;
GRANT SELECT ON attendance_unified TO anon;

-- =====================================================
-- STEP 6: CREATE ATTENDANCE RPC FUNCTIONS
-- =====================================================

-- RPC to get attendance for a child in date range
CREATE OR REPLACE FUNCTION get_child_attendance(
  p_child_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result JSONB;
BEGIN
  WITH school_days AS (
    SELECT d::date AS date
    FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS d
    WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
  ),
  event_attendance AS (
    SELECT 
      sd.date,
      COALESCE(SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::INT, 0) as minutes_present,
      CASE 
        WHEN COALESCE(SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::INT, 0) >= 300 THEN 'present'
        WHEN COALESCE(SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::INT, 0) >= 60 THEN 'tardy'
        ELSE 'absent'
      END as status
    FROM school_days sd
    LEFT JOIN events e ON e.child_id = p_child_id 
      AND e.status = 'done'
      AND (e.start_ts AT TIME ZONE 'UTC')::DATE = sd.date
    GROUP BY sd.date
  ),
  final_attendance AS (
    SELECT 
      ea.date,
      COALESCE(ae.status, ea.status) as status,
      COALESCE(ae.minutes_present, ea.minutes_present) as minutes_present,
      ae.notes,
      CASE WHEN ae.id IS NOT NULL THEN true ELSE false END as is_exception
    FROM event_attendance ea
    LEFT JOIN attendance_exceptions ae ON ae.child_id = p_child_id AND ae.date = ea.date
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', date,
      'status', status,
      'minutes_present', minutes_present,
      'notes', notes,
      'is_exception', is_exception
    ) ORDER BY date
  ) INTO result
  FROM final_attendance;
  
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- RPC to upsert attendance exception
CREATE OR REPLACE FUNCTION upsert_attendance_exception(
  p_family_id UUID,
  p_child_id UUID,
  p_date DATE,
  p_status TEXT,
  p_minutes_present INT DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  INSERT INTO attendance_exceptions (
    family_id, child_id, date, status, minutes_present, notes, source
  ) VALUES (
    p_family_id, p_child_id, p_date, p_status, p_minutes_present, p_notes, 'manual'
  )
  ON CONFLICT (child_id, date) DO UPDATE SET
    status = EXCLUDED.status,
    minutes_present = EXCLUDED.minutes_present,
    notes = EXCLUDED.notes,
    source = 'manual';
  
  SELECT jsonb_build_object('success', true, 'message', 'Attendance exception updated') INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_child_attendance(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_child_attendance(UUID, DATE, DATE) TO anon;
GRANT EXECUTE ON FUNCTION upsert_attendance_exception(UUID, UUID, DATE, TEXT, INT, TEXT) TO authenticated;

-- =====================================================
-- STEP 7: VERIFICATION
-- =====================================================

-- Verify migration results
DO $$
DECLARE
  old_count INT;
  new_exceptions_count INT;
  children_count INT;
BEGIN
  SELECT COUNT(*) INTO old_count FROM attendance_records;
  SELECT COUNT(*) INTO new_exceptions_count FROM attendance_exceptions;
  SELECT COUNT(*) INTO children_count FROM children;
  
  RAISE NOTICE 'Attendance Migration Results:';
  RAISE NOTICE '  Original attendance_records: %', old_count;
  RAISE NOTICE '  New attendance_exceptions: %', new_exceptions_count;
  RAISE NOTICE '  Total children: %', children_count;
  RAISE NOTICE '  Data reduction: %%%', ROUND(((1.0 - new_exceptions_count::float / old_count) * 100)::numeric, 1);
  RAISE NOTICE '  Average exceptions per child: %', ROUND((new_exceptions_count::float / children_count)::numeric, 1);
END $$;

-- =====================================================
-- STEP 8: UPDATE TRIGGERS
-- =====================================================

-- Update the event trigger to work with new system
CREATE OR REPLACE FUNCTION _attendance_upsert_from_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  _date DATE;
  _mins INT;
  _cap INT := 24 * 60;
BEGIN
  -- Only act when moving into 'done'
  IF (TG_OP = 'UPDATE' AND NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done')) OR
     (TG_OP = 'INSERT' AND NEW.status = 'done') THEN
    _date := (NEW.start_ts AT TIME ZONE 'UTC')::DATE;
    _mins := GREATEST(0, CAST(EXTRACT(EPOCH FROM (NEW.end_ts - NEW.start_ts)) / 60 AS INT));

    -- Only create exception if it's a school day and child has < 5 hours
    IF EXTRACT(DOW FROM _date) BETWEEN 1 AND 5 THEN
      -- Check if this would make the child present (5+ hours)
      -- If so, remove any existing exception
      -- If not, create/update exception
      IF _mins >= 300 THEN
        -- Child is present, remove any exception
        DELETE FROM attendance_exceptions 
        WHERE child_id = NEW.child_id AND date = _date;
      ELSE
        -- Child is not present enough, create/update exception
        INSERT INTO attendance_exceptions (family_id, child_id, date, status, minutes_present, source)
        VALUES (NEW.family_id, NEW.child_id, _date, 'tardy', LEAST(_mins, _cap), 'event')
        ON CONFLICT (child_id, date) DO UPDATE
          SET minutes_present = LEAST(
            COALESCE(attendance_exceptions.minutes_present,0) + EXCLUDED.minutes_present,
            _cap
          ),
              status = CASE
                WHEN EXCLUDED.minutes_present > 0 THEN 'tardy'
                ELSE 'absent'
              END
          WHERE attendance_exceptions.family_id = NEW.family_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- =====================================================
-- STEP 9: CLEANUP (OPTIONAL - COMMENT OUT FOR SAFETY)
-- =====================================================

-- Uncomment these lines after verifying the migration worked correctly
-- DROP TABLE attendance_records;
-- RAISE NOTICE 'attendance_records table dropped. Backup available in attendance_records_backup_20250121';

-- =====================================================
-- STEP 10: SUMMARY
-- =====================================================

RAISE NOTICE 'Attendance migration completed successfully!';
RAISE NOTICE 'New system:';
RAISE NOTICE '  - attendance_exceptions: Sparse storage for exceptions only';
RAISE NOTICE '  - get_child_attendance(): Calculate attendance from events + exceptions';
RAISE NOTICE '  - upsert_attendance_exception(): Add/edit attendance exceptions';
RAISE NOTICE '  - attendance_unified view: Combined view of all attendance data';
RAISE NOTICE 'Backup available in attendance_records_backup_20250121';
