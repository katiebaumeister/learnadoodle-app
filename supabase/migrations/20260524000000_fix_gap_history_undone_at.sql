alter table if exists public.academic_year_fix_gap_history
  add column if not exists undone_at timestamptz null;
