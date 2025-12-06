-- Fix permissions for planner instrumentation tables
-- Allow service_role to insert/select into instrumentation tables

-- Grant table-level permissions to service_role
GRANT SELECT, INSERT, UPDATE ON planner_runs TO service_role;
GRANT SELECT, INSERT, UPDATE ON planner_errors TO service_role;
GRANT SELECT, INSERT, UPDATE ON planner_warnings TO service_role;
GRANT SELECT, INSERT, UPDATE ON planner_user_actions TO service_role;

-- Add policies to allow service_role to bypass RLS
-- These policies allow service_role full access (backend operations)

-- Planner Runs - Service Role Policy
DROP POLICY IF EXISTS planner_runs_service_role ON planner_runs;
CREATE POLICY planner_runs_service_role ON planner_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Planner Errors - Service Role Policy
DROP POLICY IF EXISTS planner_errors_service_role ON planner_errors;
CREATE POLICY planner_errors_service_role ON planner_errors
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Planner Warnings - Service Role Policy
DROP POLICY IF EXISTS planner_warnings_service_role ON planner_warnings;
CREATE POLICY planner_warnings_service_role ON planner_warnings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Planner User Actions - Service Role Policy
DROP POLICY IF EXISTS planner_user_actions_service_role ON planner_user_actions;
CREATE POLICY planner_user_actions_service_role ON planner_user_actions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Verify grants
SELECT 
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'service_role'
    AND table_name IN ('planner_runs', 'planner_errors', 'planner_warnings', 'planner_user_actions')
ORDER BY table_name, privilege_type;

