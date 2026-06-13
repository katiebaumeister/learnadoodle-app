-- System-authored bulletin posts (e.g. subject getting-started welcome).

ALTER TABLE public.family_bulletin_posts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user'
    CHECK (source IN ('user', 'learnadoodle')),
  ADD COLUMN IF NOT EXISTS system_kind text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS family_bulletin_posts_subject_system_kind_uq
  ON public.family_bulletin_posts (subject_id, system_kind)
  WHERE subject_id IS NOT NULL AND system_kind IS NOT NULL;

COMMENT ON COLUMN public.family_bulletin_posts.source IS
  'user = family member post; learnadoodle = in-app system message.';

COMMENT ON COLUMN public.family_bulletin_posts.system_kind IS
  'Stable idempotency key for system posts, e.g. subject_getting_started.';
