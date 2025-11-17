-- Phase 2: AI Parent Assistant + Daily Automation
-- Migration: ai_task_runs table + get_progress_snapshot RPC
-- Safe to run multiple times (IF NOT EXISTS guards where possible)

-- 1) ai_task_runs table
create table if not exists ai_task_runs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references family(id) on delete cascade,
  kind text not null check (kind in ('pack_week', 'catch_up', 'summarize_progress')),
  params jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- RLS
alter table ai_task_runs enable row level security;

-- Helper function: Check if current user is a member of the given family
-- Note: Function already exists with parameter name _family, so we match that signature
-- CREATE OR REPLACE will update the function body while preserving dependencies
create or replace function is_family_member(_family uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Allow if current auth.uid() has a profile in the same family
  -- profiles.id is the user ID (references auth.users.id)
  select exists (
    select 1
    from profiles pr
    where pr.id = auth.uid()
      and pr.family_id = _family
  );
$$;

-- Policies
drop policy if exists family_read_own_ai_tasks on ai_task_runs;
create policy family_read_own_ai_tasks
on ai_task_runs
for select
using (is_family_member(family_id));

drop policy if exists family_insert_own_ai_tasks on ai_task_runs;
create policy family_insert_own_ai_tasks
on ai_task_runs
for insert
with check (is_family_member(family_id));

drop policy if exists family_update_own_ai_tasks on ai_task_runs;
create policy family_update_own_ai_tasks
on ai_task_runs
for update
using (is_family_member(family_id))
with check (is_family_member(family_id));

-- 2) Progress snapshot RPC (for summaries)
-- Adjust table/column names to your current schema:
-- events: start_ts (timestamptz), end_ts (timestamptz), status, subject_id, child_id, family_id
-- children: id, first_name
-- subject: id, name

create or replace function get_progress_snapshot(
  p_family_id uuid,
  p_start date,
  p_end date
)
returns table (
  child_id uuid,
  child_name text,
  subject_name text,
  total_events int,
  done_events int,
  missed_events int,
  upcoming_events int
)
language sql
stable
security definer
set search_path = public
as $$
  with ev as (
    select
      e.id,
      e.child_id,
      e.subject_id,
      e.status,
      (e.start_ts at time zone 'UTC')::date as d
    from events e
    where e.family_id = p_family_id
      and (e.start_ts at time zone 'UTC')::date between p_start and p_end
  )
  select
    c.id as child_id,
    coalesce(c.first_name, '') as child_name,
    coalesce(s.name, '—') as subject_name,
    count(*) filter (where ev.d between p_start and p_end) as total_events,
    count(*) filter (where ev.status = 'done' and ev.d between p_start and p_end) as done_events,
    count(*) filter (where ev.status in ('missed','overdue') and ev.d between p_start and p_end) as missed_events,
    count(*) filter (where ev.status = 'scheduled' and ev.d between p_start and p_end) as upcoming_events
  from ev
  join children c on c.id = ev.child_id
  left join subject s on s.id = ev.subject_id
  group by c.id, c.first_name, s.name
  order by c.first_name, s.name;
$$;

grant execute on function get_progress_snapshot(uuid, date, date) to authenticated;


