-- Grant permissions on ai_task_runs table to service_role
-- This allows the backend (using service_role) to insert/update/select AI task runs
-- Note: service_role should bypass RLS, but explicit grants ensure it works

-- Grant all necessary permissions to service_role
grant select, insert, update on ai_task_runs to service_role;

-- Also grant to postgres role (for direct SQL access)
grant select, insert, update on ai_task_runs to postgres;

