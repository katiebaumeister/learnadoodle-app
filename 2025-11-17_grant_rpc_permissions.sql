-- Grant execute permission on get_progress_snapshot RPC to service_role
-- This allows the backend (using service_role) to call the RPC

grant execute on function get_progress_snapshot(uuid, date, date) to service_role;

