-- Idempotent family-level system bulletin posts (e.g. home getting-started welcome).

CREATE UNIQUE INDEX IF NOT EXISTS family_bulletin_posts_family_system_kind_uq
  ON public.family_bulletin_posts (family_id, system_kind)
  WHERE subject_id IS NULL AND system_kind IS NOT NULL;
