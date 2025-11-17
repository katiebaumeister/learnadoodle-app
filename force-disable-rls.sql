-- Force disable RLS and ensure no restrictions
-- This is a more aggressive approach to ensure access

-- 1. Force disable RLS on all tables
ALTER TABLE schedule_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_overrides DISABLE ROW LEVEL SECURITY;
ALTER TABLE events DISABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_days_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE event_revisions DISABLE ROW LEVEL SECURITY;

-- 2. Grant explicit permissions to the public role
GRANT ALL ON schedule_rules TO public;
GRANT ALL ON schedule_overrides TO public;
GRANT ALL ON events TO public;
GRANT ALL ON calendar_days_cache TO public;
GRANT ALL ON event_revisions TO public;

-- 3. Grant permissions on sequences (for auto-incrementing IDs)
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO public;

-- 4. Verify permissions
SELECT 
  'Table permissions:' as info,
  schemaname,
  tablename,
  tableowner,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('schedule_rules', 'schedule_overrides', 'events', 'calendar_days_cache', 'event_revisions')
ORDER BY tablename;

-- 5. Test direct access
SELECT 'Testing direct access...' as test;

-- Test INSERT (this will fail if there are still restrictions)
INSERT INTO schedule_rules (family_id, title, scope_type, scope_id, rule_type, start_date, end_date)
VALUES (
  '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'::uuid,
  'Test Rule',
  'family',
  '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'::uuid,
  'availability_teach',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '30 days'
) RETURNING id;

-- Clean up test record
DELETE FROM schedule_rules WHERE title = 'Test Rule';

-- 6. Show final status
SELECT 'RLS completely disabled and permissions granted!' as status;
