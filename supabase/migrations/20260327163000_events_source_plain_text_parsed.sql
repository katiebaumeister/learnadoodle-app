-- Plan Year "import from text" materializes curriculum events with source = plain_text_parsed.
-- Postgres check constraint events_source_check must allow that value (23514 otherwise).

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_source_check;

ALTER TABLE public.events ADD CONSTRAINT events_source_check CHECK (
  source IS NULL
  OR source = ANY (
    ARRAY[
      'manual',
      'ai',
      'curriculum',
      'system',
      'syllabus',
      'ai_plan',
      'resolve_conflicts',
      'plain_text_parsed',
      'year_plan_seed'
    ]::text[]
  )
);

COMMENT ON CONSTRAINT events_source_check ON public.events IS
  'Allowed events.source values used by app (planner, curriculum import, AI, academic year).';
