-- =====================================================
-- MIGRATION: REFACTOR CALENDAR_DAYS TO RULE-BASED APPROACH
-- =====================================================
-- This script migrates from bulk calendar_days storage to efficient rule-based approach
-- Expected data reduction: 95% (180 rows → 10 rows per family)

-- =====================================================
-- STEP 1: BACKUP EXISTING DATA
-- =====================================================

-- Create backup table
CREATE TABLE IF NOT EXISTS calendar_days_backup_20250121 AS 
SELECT * FROM calendar_days;

-- =====================================================
-- STEP 2: ANALYZE EXISTING PATTERNS
-- =====================================================

-- Compute patterns per statement using CTEs to avoid temp-table dependency

-- =====================================================
-- STEP 3: CREATE RULE-BASED REPLACEMENTS
-- =====================================================

-- Insert family teaching schedule rules
INSERT INTO schedule_rules (
  scope_type, scope_id, rule_type, title, 
  start_date, end_date, start_time, end_time,
  rrule, is_active
)
WITH family_patterns AS (
  SELECT 
    family_id,
    family_year_id,
    ARRAY_AGG(DISTINCT EXTRACT(DOW FROM calendar_date) ORDER BY EXTRACT(DOW FROM calendar_date)) FILTER (WHERE is_teaching = true) as teaching_days,
    ARRAY_AGG(calendar_date ORDER BY calendar_date) FILTER (WHERE is_vacation = true) as vacation_dates,
    MIN(calendar_date) as start_date,
    MAX(calendar_date) as end_date
  FROM calendar_days
  GROUP BY family_id, family_year_id
)
SELECT 
  'family' as scope_type,
  family_id as scope_id,
  'availability_teach' as rule_type,
  'Family School Schedule' as title,
  start_date,
  end_date,
  '09:00' as start_time,
  '15:00' as end_time,
  jsonb_build_object(
    'freq', 'weekly',
    'byday', teaching_days
  ) as rrule,
  true as is_active
FROM family_patterns
WHERE array_length(teaching_days, 1) > 0;

-- =====================================================
-- STEP 4: CREATE VACATION OVERRIDES
-- =====================================================

-- Insert vacation overrides
INSERT INTO schedule_overrides (
  scope_type, scope_id, date, override_kind,
  start_time, end_time, notes, is_active
)
WITH family_patterns AS (
  SELECT 
    family_id,
    family_year_id,
    ARRAY_AGG(DISTINCT EXTRACT(DOW FROM calendar_date) ORDER BY EXTRACT(DOW FROM calendar_date)) FILTER (WHERE is_teaching = true) as teaching_days,
    ARRAY_AGG(calendar_date ORDER BY calendar_date) FILTER (WHERE is_vacation = true) as vacation_dates,
    MIN(calendar_date) as start_date,
    MAX(calendar_date) as end_date
  FROM calendar_days
  GROUP BY family_id, family_year_id
)
SELECT 
  'family' as scope_type,
  family_id as scope_id,
  vacation_date as date,
  'off' as override_kind,
  '00:00' as start_time,
  '23:59' as end_time,
  'Vacation day' as notes,
  true as is_active
FROM family_patterns,
LATERAL unnest(vacation_dates) as vacation_date
WHERE array_length(vacation_dates, 1) > 0;

-- =====================================================
-- STEP 5: CREATE SPECIAL DAY OVERRIDES
-- =====================================================

-- Insert special day overrides (if any notes exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'calendar_days' AND column_name = 'notes'
  ) THEN
    INSERT INTO schedule_overrides (
      scope_type, scope_id, date, override_kind,
      start_time, end_time, notes, is_active
    )
    SELECT 
      'family' as scope_type,
      family_id as scope_id,
      calendar_date as date,
      CASE 
        WHEN is_vacation = true THEN 'off'
        WHEN is_teaching = false THEN 'off'
        ELSE 'teach'
      END as override_kind,
      CASE 
        WHEN is_vacation = true OR is_teaching = false THEN '00:00'
        ELSE '09:00'
      END as start_time,
      CASE 
        WHEN is_vacation = true OR is_teaching = false THEN '23:59'
        ELSE '15:00'
      END as end_time,
      notes,
      true as is_active
    FROM calendar_days
    WHERE notes IS NOT NULL AND notes != '';
  ELSE
    -- notes column does not exist; skip special-day overrides with notes
    PERFORM 1;
  END IF;
END $$;

-- =====================================================
-- STEP 6: REFRESH CACHE WITH NEW RULES
-- =====================================================

-- Refresh calendar cache for all families
DO $$
DECLARE
  family_record RECORD;
BEGIN
  FOR family_record IN 
    WITH family_patterns AS (
      SELECT 
        family_id,
        ARRAY_AGG(calendar_date ORDER BY calendar_date) FILTER (WHERE is_vacation = true) as vacation_dates
      FROM calendar_days
      GROUP BY family_id
    )
    SELECT DISTINCT family_id FROM family_patterns
  LOOP
    PERFORM refresh_calendar_days_cache(
      family_record.family_id,
      (CURRENT_DATE - INTERVAL '30 days')::date,
      (CURRENT_DATE + INTERVAL '90 days')::date
    );
  END LOOP;
  
  RAISE NOTICE 'Refreshed calendar cache for % families', (SELECT COUNT(DISTINCT family_id) FROM calendar_days);
END $$;

-- =====================================================
-- STEP 7: VERIFICATION
-- =====================================================

-- Verify migration results
DO $$
DECLARE
  old_count INT;
  new_rules_count INT;
  new_overrides_count INT;
BEGIN
  SELECT COUNT(*) INTO old_count FROM calendar_days;
  SELECT COUNT(*) INTO new_rules_count FROM schedule_rules WHERE source = 'migration';
  SELECT COUNT(*) INTO new_overrides_count FROM schedule_overrides WHERE source = 'migration';
  
  RAISE NOTICE 'Migration Results:';
  RAISE NOTICE '  Original calendar_days records: %', old_count;
  RAISE NOTICE '  New schedule_rules created: %', new_rules_count;
  RAISE NOTICE '  New schedule_overrides created: %', new_overrides_count;
  RAISE NOTICE '  Data reduction: %%%', ROUND(((1.0 - (new_rules_count + new_overrides_count)::float / old_count) * 100)::numeric, 1);
END $$;

-- =====================================================
-- STEP 8: CLEANUP (OPTIONAL - COMMENT OUT FOR SAFETY)
-- =====================================================

-- Uncomment these lines after verifying the migration worked correctly
-- DROP TABLE calendar_days;
-- RAISE NOTICE 'calendar_days table dropped. Backup available in calendar_days_backup_20250121';

-- =====================================================
-- STEP 9: UPDATE FRONTEND QUERIES
-- =====================================================

-- Create helper function to get calendar day status
CREATE OR REPLACE FUNCTION get_calendar_day_status(
  p_family_id UUID,
  p_date DATE
)
RETURNS TABLE (
  is_teaching BOOLEAN,
  is_vacation BOOLEAN,
  notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH day_cache AS (
    SELECT 
      cdc.day_status,
      cdc.source_summary
    FROM calendar_days_cache cdc
    WHERE cdc.family_id = p_family_id
      AND cdc.date = p_date
      AND cdc.child_id IS NULL  -- Family-wide
    LIMIT 1
  ),
  day_overrides AS (
    SELECT 
      so.override_kind,
      so.notes
    FROM schedule_overrides so
    WHERE so.scope_type = 'family'
      AND so.scope_id = p_family_id
      AND so.date = p_date
      AND so.is_active = true
    LIMIT 1
  )
  SELECT 
    CASE 
      WHEN ovr.override_kind = 'off' THEN false
      WHEN dc.day_status = 'off' THEN false
      ELSE true
    END as is_teaching,
    CASE 
      WHEN ovr.override_kind = 'off' THEN true
      WHEN dc.day_status = 'off' THEN true
      ELSE false
    END as is_vacation,
    ovr.notes
  FROM day_cache dc
  FULL OUTER JOIN day_overrides ovr ON true;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_calendar_day_status(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_calendar_day_status(UUID, DATE) TO anon;

RAISE NOTICE 'Migration completed successfully!';
RAISE NOTICE 'Use get_calendar_day_status(family_id, date) to query calendar day status';
RAISE NOTICE 'Backup available in calendar_days_backup_20250121';
