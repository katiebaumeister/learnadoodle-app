-- Fix-gap history table grants for local/dev API access paths.
-- Keeps the table usable even when backend requests execute with non-service JWT roles.

grant usage on schema public to authenticated, anon;

grant select, insert, update, delete on table public.academic_year_fix_gap_history
  to authenticated, anon, service_role;
