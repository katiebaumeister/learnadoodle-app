create table if not exists public.academic_year_fix_gap_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  family_id uuid not null references public.family(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  created_by_user_id uuid null,
  scope text not null check (scope in ('overall', 'per_subject')),
  subject_id uuid null references public.subject(id) on delete set null,
  subject_ids jsonb not null default '[]'::jsonb,
  target_kind text not null check (target_kind in ('days', 'hours')),
  target_value numeric not null default 0,
  before_projected_days integer null,
  after_projected_days integer null,
  before_gap_days integer null,
  after_gap_days integer null,
  before_projected_hours numeric null,
  after_projected_hours numeric null,
  before_gap_hours numeric null,
  after_gap_hours numeric null,
  requested_gap integer null,
  assigned_count integer null,
  successful_insert_count integer null,
  failed_insert_count integer null,
  created_events integer not null default 0,
  removed_events integer not null default 0,
  assignment_slots jsonb not null default '[]'::jsonb,
  created_event_ids jsonb not null default '[]'::jsonb,
  removed_event_ids jsonb not null default '[]'::jsonb,
  message text null
);

create index if not exists idx_fix_gap_history_academic_year_created_at
  on public.academic_year_fix_gap_history (academic_year_id, created_at desc);

create index if not exists idx_fix_gap_history_family_created_at
  on public.academic_year_fix_gap_history (family_id, created_at desc);

create index if not exists idx_fix_gap_history_subject
  on public.academic_year_fix_gap_history (subject_id);
