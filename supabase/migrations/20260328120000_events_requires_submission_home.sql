-- Student home: parent can flag events to surface as "requires submission" on the learner home rail.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS requires_submission_home boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.requires_submission_home IS
  'When true, show on student home as requiring submission (configurable in event Academic Details).';
