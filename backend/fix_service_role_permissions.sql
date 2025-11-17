-- Grant explicit permissions to service_role for AI rescheduling tables
-- The service role key should bypass RLS, but we'll also grant explicit permissions
-- to ensure access works correctly

-- Grant permissions on blackout_periods
GRANT SELECT, INSERT, UPDATE, DELETE ON blackout_periods TO service_role;

-- Grant permissions on learning_velocity
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_velocity TO service_role;

-- Grant permissions on ai_plans
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_plans TO service_role;

-- Grant permissions on ai_plan_changes
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_plan_changes TO service_role;

-- Grant permissions on events (for applying changes)
GRANT SELECT, INSERT, UPDATE, DELETE ON events TO service_role;

-- Grant permissions on children (needed for queries and onboarding)
GRANT SELECT, INSERT, UPDATE, DELETE ON children TO service_role;

-- Grant permissions on family (needed for queries and onboarding)
GRANT SELECT, INSERT, UPDATE, DELETE ON family TO service_role;

-- Grant permissions on profiles (needed for family lookups)
GRANT SELECT ON profiles TO service_role;

-- Grant permissions on subject_goals (might be queried indirectly)
GRANT SELECT ON subject_goals TO service_role;

-- Grant permissions on syllabi (needed for get_required_minutes)
GRANT SELECT ON syllabi TO service_role;

-- Grant execute permissions on RPCs
GRANT EXECUTE ON FUNCTION get_week_view(UUID, DATE, DATE, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION get_required_minutes(UUID, UUID, DATE, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION refresh_calendar_days_cache(UUID, DATE, DATE) TO service_role;

-- Verify grants
SELECT 
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'service_role'
    AND table_name IN ('blackout_periods', 'learning_velocity', 'ai_plans', 'ai_plan_changes', 'events', 'children', 'family', 'profiles')
ORDER BY table_name, privilege_type;

