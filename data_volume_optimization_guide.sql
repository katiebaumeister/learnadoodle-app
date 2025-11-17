-- =====================================================
-- COMPREHENSIVE DATA VOLUME OPTIMIZATION MIGRATION
-- =====================================================
-- This guide covers migrating both calendar_days and attendance_records
-- from bulk storage to efficient rule-based/sparse storage approaches

-- =====================================================
-- OVERVIEW OF CHANGES
-- =====================================================

/*
BEFORE (Bulk Storage):
- calendar_days: 180 rows per family per year
- attendance_records: 180 rows per child per year
- Total for 1000 families × 2 children: 540,000 rows per year

AFTER (Optimized Storage):
- schedule_rules: ~5 rows per family (teaching schedule)
- schedule_overrides: ~10 rows per family (holidays/exceptions)
- attendance_exceptions: ~18 rows per child (only exceptions)
- Total for 1000 families × 2 children: ~41,000 rows per year

DATA REDUCTION: ~92% overall reduction
*/

-- =====================================================
-- MIGRATION ORDER
-- =====================================================

/*
1. Run migrate_calendar_days_to_rules.sql
   - Converts calendar_days to schedule_rules + schedule_overrides
   - Creates get_calendar_day_status() helper function
   - Backs up original data

2. Run migrate_attendance_records_to_sparse.sql
   - Converts attendance_records to attendance_exceptions (sparse)
   - Creates event-driven attendance calculation
   - Creates get_child_attendance() RPC
   - Backs up original data

3. Update frontend code to use new RPCs
   - Replace calendar_days queries with get_calendar_day_status()
   - Replace attendance_records queries with get_child_attendance()
   - Update attendance forms to use upsert_attendance_exception()

4. Test and verify
   - Run verification queries
   - Check data consistency
   - Performance test

5. Cleanup (optional)
   - Drop old tables after verification
   - Remove backup tables after 30 days
*/

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check calendar migration results
SELECT 
  'Calendar Migration' as migration_type,
  (SELECT COUNT(*) FROM calendar_days) as old_records,
  (SELECT COUNT(*) FROM schedule_rules WHERE source = 'migration') as new_rules,
  (SELECT COUNT(*) FROM schedule_overrides WHERE source = 'migration') as new_overrides,
  ROUND((1.0 - (SELECT COUNT(*) FROM schedule_rules WHERE source = 'migration')::float / 
    (SELECT COUNT(*) FROM calendar_days)) * 100, 1) as reduction_percent;

-- Check attendance migration results
SELECT 
  'Attendance Migration' as migration_type,
  (SELECT COUNT(*) FROM attendance_records) as old_records,
  (SELECT COUNT(*) FROM attendance_exceptions) as new_exceptions,
  (SELECT COUNT(*) FROM children) as total_children,
  ROUND((1.0 - (SELECT COUNT(*) FROM attendance_exceptions)::float / 
    (SELECT COUNT(*) FROM attendance_records)) * 100, 1) as reduction_percent;

-- Test new functions
SELECT get_calendar_day_status('86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'::uuid, CURRENT_DATE);
SELECT get_child_attendance('4e3633b8-85d0-4dcd-a19b-b32181d872ec'::uuid, CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE);

-- =====================================================
-- FRONTEND UPDATE CHECKLIST
-- =====================================================

/*
Calendar Updates:
□ Replace calendar_days queries with get_calendar_day_status()
□ Update calendar components to use new function
□ Test month/week view consistency
□ Verify timezone handling

Attendance Updates:
□ Replace attendance_records queries with get_child_attendance()
□ Update attendance forms to use upsert_attendance_exception()
□ Update attendance reports and summaries
□ Test attendance calculation from events

Performance Testing:
□ Test query performance with new structure
□ Verify cache refresh triggers work correctly
□ Test with larger datasets
□ Monitor database size reduction
*/

-- =====================================================
-- ROLLBACK PLAN
-- =====================================================

/*
If issues arise, rollback steps:

1. Restore from backup tables:
   - calendar_days_backup_20250121
   - attendance_records_backup_20250121

2. Drop new tables/views:
   - attendance_exceptions
   - attendance_unified (view)

3. Drop new functions:
   - get_calendar_day_status()
   - get_child_attendance()
   - upsert_attendance_exception()
   - calculate_attendance_from_events()

4. Restore original triggers:
   - _attendance_upsert_from_event()

5. Revert frontend changes
*/

-- =====================================================
-- PERFORMANCE BENCHMARKS
-- =====================================================

/*
Expected Performance Improvements:

Query Speed:
- Calendar queries: 5-10x faster (fewer rows to scan)
- Attendance queries: 3-5x faster (sparse data)
- Reports: 2-3x faster (less data aggregation)

Storage:
- Database size: 90%+ reduction
- Backup size: 90%+ reduction
- Index size: 80%+ reduction

Maintenance:
- Cache refresh: 3-5x faster
- Data migration: 10x+ faster
- Backup/restore: 5x+ faster
*/

-- =====================================================
-- MONITORING QUERIES
-- =====================================================

-- Monitor data growth over time
SELECT 
  'schedule_rules' as table_name,
  COUNT(*) as total_rows,
  COUNT(DISTINCT scope_id) as unique_families,
  ROUND(COUNT(*)::float / COUNT(DISTINCT scope_id), 1) as avg_rules_per_family
FROM schedule_rules
UNION ALL
SELECT 
  'schedule_overrides' as table_name,
  COUNT(*) as total_rows,
  COUNT(DISTINCT scope_id) as unique_families,
  ROUND(COUNT(*)::float / COUNT(DISTINCT scope_id), 1) as avg_overrides_per_family
FROM schedule_overrides
UNION ALL
SELECT 
  'attendance_exceptions' as table_name,
  COUNT(*) as total_rows,
  COUNT(DISTINCT child_id) as unique_children,
  ROUND(COUNT(*)::float / COUNT(DISTINCT child_id), 1) as avg_exceptions_per_child
FROM attendance_exceptions;

-- Monitor cache performance
SELECT 
  family_id,
  COUNT(*) as cached_days,
  MIN(date) as earliest_date,
  MAX(date) as latest_date
FROM calendar_days_cache
GROUP BY family_id
ORDER BY cached_days DESC;

RAISE NOTICE 'Migration guide completed. Run the individual migration scripts in order.';
